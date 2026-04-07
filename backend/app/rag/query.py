from langchain.prompts import ChatPromptTemplate
import re

from app.agents.orchestration import invoke_with_fallback, select_orchestration_profile
from app.agents.prompting import PROMPT_FOR_AI_AGENTS
from app.rag.embeddings import get_vector_store


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


def ask_with_rag(question: str, course_id: int, top_k: int = 3, material_id: int | None = None) -> dict:
    store = get_vector_store()
    # Chroma metadata filtering in this environment expects a single top-level equality filter.
    # Material IDs are globally unique, so we can target the latest material directly.
    search_filter = {"material_id": material_id} if material_id is not None else {"course_id": course_id}

    retriever = store.as_retriever(search_kwargs={"k": top_k, "filter": search_filter})
    docs = retriever.get_relevant_documents(question)

    # Fallback 1: tolerate metadata type drift (int vs string) across persisted stores.
    if not docs and material_id is not None:
        retriever = store.as_retriever(search_kwargs={"k": top_k, "filter": {"material_id": str(material_id)}})
        docs = retriever.get_relevant_documents(question)

    # Fallback 2: if latest-material filter still misses vectors, broaden to course-level retrieval.
    if not docs and material_id is not None:
        retriever = store.as_retriever(search_kwargs={"k": top_k, "filter": {"course_id": course_id}})
        docs = retriever.get_relevant_documents(question)

    # Extract meaningful keywords from question
    query_terms = _extract_query_terms(question)

    # Filter docs by relevance using word-boundary matching
    relevant_docs = docs
    if query_terms:
        filtered = []
        for doc in docs:
            if _contains_query_terms(doc.page_content, query_terms):
                filtered.append(doc)
        # Fall back to all docs if none matched (rather than returning nothing)
        relevant_docs = filtered if filtered else docs

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
    prompt = ChatPromptTemplate.from_template(
        """
You are a helpful educational assistant.
Answer only from the provided material below.
Do not use outside knowledge, assumptions, or guesses.
If the material does not contain enough information, say that the answer cannot be determined from the available study material.
Do not mention internal analysis or retrieval logic.

{policy}

Context (if available):
{context}

Student question:
{question}

Answer requirements:
- Be clear, concise, and educational.
- Use steps or bullets only when helpful.
- Do not ask the student to choose a course, file, or subject again.
"""
    )

    final_prompt = prompt.format(context=context, question=question, policy=PROMPT_FOR_AI_AGENTS)
    context_quality = len(relevant_docs) if context.strip() else 0
    profile = select_orchestration_profile(question, mode_hint="auto", context_quality=context_quality)
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

    # Prefer latest material IDs when available to prevent stale chunks from older uploads.
    if latest_material_ids:
        for material_id in latest_material_ids[:8]:
            retriever = store.as_retriever(search_kwargs={"k": 2, "filter": {"material_id": material_id}})
            docs = retriever.get_relevant_documents(question)
            if not docs:
                retriever = store.as_retriever(search_kwargs={"k": 2, "filter": {"material_id": str(material_id)}})
                docs = retriever.get_relevant_documents(question)
            if docs:
                all_docs.extend(docs)
    else:
        # Retrieve a small amount per course to keep latency predictable.
        for course_id in course_ids[:8]:
            retriever = store.as_retriever(search_kwargs={"k": 2, "filter": {"course_id": course_id}})
            docs = retriever.get_relevant_documents(question)
            if docs:
                all_docs.extend(docs)

    docs = all_docs[:top_k]
    query_terms = _extract_query_terms(question)

    # Filter docs by relevance using word-boundary matching
    relevant_docs = docs
    if query_terms:
        filtered = []
        for doc in docs:
            if _contains_query_terms(doc.page_content, query_terms):
                filtered.append(doc)
        relevant_docs = filtered if filtered else docs

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
