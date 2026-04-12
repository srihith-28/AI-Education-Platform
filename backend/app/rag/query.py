from langchain.prompts import ChatPromptTemplate
import re

from app.agents.orchestration import invoke_with_fallback, select_orchestration_profile
from app.agents.prompting import PROMPT_FOR_AI_AGENTS
from app.rag.embeddings import get_vector_store


def _dedupe_docs(docs: list) -> list:
    seen = set()
    unique = []
    for doc in docs:
        key = (
            str(doc.metadata.get("material_id", "")),
            str(doc.metadata.get("course_id", "")),
            str(doc.metadata.get("chunk", "")),
            doc.page_content[:180],
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(doc)
    return unique


def _retrieve_with_filter(store, question: str, k: int, metadata_filter: dict) -> list:
    """Retrieve with metadata filter and tolerate int/string metadata drift."""
    retriever = store.as_retriever(search_kwargs={"k": k, "filter": metadata_filter})
    docs = retriever.get_relevant_documents(question)

    if docs:
        return docs

    alt_filter = {}
    for key, value in metadata_filter.items():
        if isinstance(value, int):
            alt_filter[key] = str(value)
        elif isinstance(value, str) and value.isdigit():
            alt_filter[key] = int(value)
        else:
            alt_filter[key] = value

    if alt_filter != metadata_filter:
        retriever = store.as_retriever(search_kwargs={"k": k, "filter": alt_filter})
        docs = retriever.get_relevant_documents(question)

    return docs


def _truncate_at_sentence(text: str, max_chars: int) -> str:
    """Truncate text at sentence boundary to avoid mid-word cuts."""
    if len(text) <= max_chars:
        return text
    text = text[:max_chars + 50]  # Get extra context for sentence boundary
    # Find last sentence boundary
    for delimiter in ['. ', '!', '? ', '\n\n']:
        idx = text.rfind(delimiter)
        if idx > max_chars * 0.8:  # Use if it's reasonably close
            return text[:idx + 1].strip()
    return text[:max_chars].strip()


def _extract_query_terms(question: str) -> set[str]:
    """Extract meaningful keywords from question for relevance filtering."""
    stop_words = {
        "what", "when", "where", "which", "with", "from", "that", "this", "have", "about", "your",
        "into", "than", "then", "they", "them", "their", "would", "could", "should", "there", "here",
        "will", "been", "being", "does", "did", "done", "please", "give", "explain", "answer",
        "can", "are", "is", "be", "the", "a", "an", "and", "or", "but", "if", "in", "on", "at", "to",
    }
    tokens = question.lower().replace("?", " ").replace(",", " ").replace(".", " ").split()
    return {token for token in tokens if len(token) >= 3 and token.lower() not in stop_words}


def _contains_query_terms(text: str, query_terms: set[str]) -> bool:
    """Check if text contains query terms using word-boundary matching."""
    text_lower = text.lower()
    for term in query_terms:
        # Use word-boundary regex to avoid substring matches
        pattern = r'\b' + re.escape(term) + r'\b'
        if re.search(pattern, text_lower):
            return True
    return False


def _grounded_title_answer(question: str, contexts: list[str]) -> str | None:
    q = (question or "").strip().lower()
    match = re.search(r"who\s+is\s+(?:the\s+)?(?:current\s+)?(cm|chief\s+minister)\s+of\s+([a-z\s]+)", q)
    if not match:
        return None

    place = re.sub(r"\s+", " ", match.group(2)).strip(" ?.,")
    if not place:
        return None

    # Prefer explicit "Chief Minister of <place> is <name>" facts from retrieved context.
    pattern = re.compile(
        rf"(?:chief\s+minister|cm)\s+of\s+{re.escape(place)}\s*(?:is|:|-)?\s*([A-Za-z][A-Za-z\s\.-]{{2,80}})",
        re.IGNORECASE,
    )
    for text in contexts:
        hit = pattern.search(text)
        if not hit:
            continue
        name = re.sub(r"\s+", " ", hit.group(1)).strip(" .,-")
        if not name:
            continue
        return (
            "**Analysis**\n"
            "I found a direct factual match in the retrieved course context.\n\n"
            "**Answer**\n"
            f"The Chief Minister of {place.title()} is **{name}**.\n\n"
            "**Summary**\n"
            "- Answered directly from the retrieved uploaded material.\n"
            "- Used context-grounded fact instead of generic background knowledge."
        )
    return None


def ask_with_rag(
    question: str,
    course_id: int,
    top_k: int = 3,
    material_id: int | None = None,
    mode_hint: str = "auto",
) -> dict:
    store = get_vector_store()
    docs = []

    if material_id is not None:
        # Treat the latest material as authoritative when it has usable chunks.
        latest_docs = _retrieve_with_filter(store, question, max(2, top_k), {"material_id": material_id})
        if latest_docs:
            docs = _dedupe_docs(latest_docs)
        else:
            # Only fall back to historical course docs if latest material has no retrieval hits.
            course_docs = _retrieve_with_filter(store, question, max(4, top_k * 2), {"course_id": course_id})
            docs = _dedupe_docs(course_docs)
    else:
        docs = _retrieve_with_filter(store, question, max(4, top_k * 2), {"course_id": course_id})

    # Final fallback: query globally then keep course-matching chunks if available.
    if not docs:
        broad_retriever = store.as_retriever(search_kwargs={"k": max(8, top_k * 4)})
        broad_docs = broad_retriever.get_relevant_documents(question)
        course_match = [
            doc for doc in broad_docs
            if str(doc.metadata.get("course_id", "")) == str(course_id)
        ]
        docs = course_match if course_match else broad_docs

    docs = docs[: max(top_k * 2, 6)]

    # Extract meaningful keywords from question
    query_terms = _extract_query_terms(question)

    # Filter docs by relevance using word-boundary matching
    relevant_docs = docs
    if query_terms:
        filtered = []
        for doc in docs:
            if _contains_query_terms(doc.page_content, query_terms):
                filtered.append(doc)
        if filtered:
            relevant_docs = filtered

    # Smart context truncation: truncate per-doc at sentence boundary, then join
    context_parts = []
    total_chars = 0
    per_doc_limit = 650  # Leave room for multiple docs
    max_total = 2000     # Overall context size limit
    
    for doc in relevant_docs:
        if total_chars >= max_total:
            break
        truncated = _truncate_at_sentence(doc.page_content, per_doc_limit)
        context_parts.append(truncated)
        total_chars += len(truncated)
    
    context = "\n\n".join(context_parts)

    grounded_fact = _grounded_title_answer(question, [doc.page_content for doc in relevant_docs])
    if grounded_fact:
        return {
            "answer": grounded_fact,
            "sources": [doc.metadata for doc in relevant_docs],
            "context_chunks": len(relevant_docs),
        }

    prompt = ChatPromptTemplate.from_template(
        """
You are a helpful educational assistant.
Use the provided context when it is relevant.
If context is not enough, still answer from your general knowledge clearly and helpfully.
When you use general knowledge beyond context, state that briefly in one short line.
Do not mention internal analysis or retrieval logic.

{policy}

Context (if available):
{context}

Student question:
{question}

Answer requirements:
- Match response depth and length to the question.
- For generation tasks (for example: "prepare", "create", "generate", "make MCQs"), provide a complete output, not a short sample.
- Keep short factual questions concise; give detailed responses for broad or multi-part questions.
- If the provided context contains a direct factual answer (such as a person's name, title, date, or definition), use that context answer and do not substitute an older or generic alternative.
- Use steps or bullets only when helpful.
- Do not ask the student to choose a course, file, or subject again.
"""
    )

    final_prompt = prompt.format(context=context, question=question, policy=PROMPT_FOR_AI_AGENTS)
    context_quality = len(relevant_docs) if context.strip() else 0
    profile = select_orchestration_profile(question, mode_hint=mode_hint, context_quality=context_quality)
    answer, _ = invoke_with_fallback(final_prompt, profile)

    return {
        "answer": answer,
        "sources": [doc.metadata for doc in relevant_docs],
        "context_chunks": len(relevant_docs),
    }


def teacher_rag_context(
    question: str,
    course_ids: list[int],
    top_k: int = 4,
    latest_material_ids: list[int] | None = None,
) -> dict:
    """Retrieve and format context for teacher from multiple courses."""
    if not course_ids:
        return {"context": "", "sources": [], "context_chunks": 0, "quality": 0}

    store = get_vector_store()
    all_docs = []

    latest_id_set = {str(mid) for mid in (latest_material_ids or [])}

    # Boost recent uploads, but do not restrict retrieval to only latest files.
    if latest_material_ids:
        for material_id in latest_material_ids[:8]:
            docs = _retrieve_with_filter(store, question, 3, {"material_id": material_id})
            if docs:
                all_docs.extend(docs)

    # Always retrieve across every selected course so all uploaded files are represented.
    for course_id in course_ids[:8]:
        docs = _retrieve_with_filter(store, question, 4, {"course_id": course_id})
        if docs:
            all_docs.extend(docs)

    # Fallback: broad retrieve then keep only teacher-course matches.
    if not all_docs:
        broad_retriever = store.as_retriever(search_kwargs={"k": max(10, top_k * 4)})
        broad_docs = broad_retriever.get_relevant_documents(question)
        allowed_course_ids = {str(cid) for cid in course_ids}
        all_docs = [
            doc
            for doc in broad_docs
            if str(doc.metadata.get("course_id", "")) in allowed_course_ids
        ]

    docs = _dedupe_docs(all_docs)
    if latest_id_set:
        docs.sort(key=lambda doc: 0 if str(doc.metadata.get("material_id", "")) in latest_id_set else 1)
    docs = docs[: max(top_k + 2, 8)]
    query_terms = _extract_query_terms(question)

    # Filter docs by relevance using word-boundary matching
    relevant_docs = docs
    if query_terms:
        filtered = []
        for doc in docs:
            if _contains_query_terms(doc.page_content, query_terms):
                filtered.append(doc)
        if filtered:
            relevant_docs = filtered
        else:
            relevant_docs = docs

    if not relevant_docs:
        return {"context": "", "sources": [], "context_chunks": 0, "quality": 0}

    # Smart truncation for teacher context
    context_parts = []
    total_chars = 0
    per_doc_limit = 800   # Teachers may need more context
    max_total = 3000      # Overall limit
    
    for doc in relevant_docs:
        if total_chars >= max_total:
            break
        truncated = _truncate_at_sentence(doc.page_content, per_doc_limit)
        context_parts.append(truncated)
        total_chars += len(truncated)
    
    context = "\n\n".join(context_parts)
    
    return {
        "context": context,
        "sources": [doc.metadata for doc in relevant_docs],
        "context_chunks": len(relevant_docs),
        "quality": len(relevant_docs),  # Pass quality metric to orchestration
    }
