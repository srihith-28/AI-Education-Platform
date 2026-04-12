from urllib.error import URLError
from urllib.request import urlopen
import json
import re
import time

from app.agents.orchestration import invoke_with_fallback, select_orchestration_profile
from app.agents.prompting import PROMPT_FOR_AI_AGENTS
from app.agents.tools import generate_quiz, suggest_improvements, summarize_text
from app.common.config import settings


_OLLAMA_READY_UNTIL = 0.0


RESPONSE_STYLE_RULES = (
    "Response style rules:\n"
    "1) Start with heading '**Analysis**' and give 1-3 concise lines only.\n"
    "2) Then add heading '**Answer**' and provide the response in short paragraphs and/or lists.\n"
    "3) End with heading '**Summary**' in exactly 2-3 concise lines.\n"
    "4) Use bold/italic emphasis for key terms where useful.\n"
    "5) Use ASCII bullets like '-' only; avoid long unbroken text blocks.\n"
    "6) Do not show hidden reasoning, internal analysis, or chain-of-thought."
)


def _is_time_sensitive(query: str) -> bool:
    q = query.lower()
    markers = [
        "current", "right now", "today", "latest", "as of now", "prime minister", "president",
        "ceo", "price", "weather", "news", "election", "live",
    ]
    return any(marker in q for marker in markers)


def _is_small_talk(query: str) -> bool:
    q = (query or "").strip().lower()
    if not q:
        return True
    normalized = re.sub(r"[^a-z\s]", "", q).strip()
    tokens = normalized.split()
    if len(tokens) > 3:
        return False
    if not tokens:
        return True

    greetings = {"hi", "hello", "hey", "hii", "heyy", "yo", "sup", "hola"}
    acknowledgements = {"thanks", "thank", "ok", "okay", "cool", "nice", "great"}
    day_greetings = {"good morning", "good afternoon", "good evening"}

    phrase = " ".join(tokens)
    if phrase in day_greetings:
        return True
    if tokens[0] in greetings or tokens[0] in acknowledgements:
        return True
    if phrase == "thank you":
        return True
    return False


def _small_talk_response(query: str) -> str:
    q = re.sub(r"[^a-z\s]", "", (query or "").strip().lower()).strip()
    if q in {"thanks", "thank you", "thank"}:
        return "You're welcome. What would you like help with next?"
    if q in {"ok", "okay", "cool", "nice", "great"}:
        return "Great. Share your question, and I will keep the answer concise and practical."
    return "Hello. How can I help you today?"


def _postprocess_output(text: str, query: str) -> str:
    if _is_small_talk(query):
        return _small_talk_response(query)

    cleaned = (text or "").replace("•", "-").replace("â¢", "-").replace("\r\n", "\n").strip()
    # Collapse excessive blank lines.
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    lower = cleaned.lower()

    has_analysis = "**analysis**" in lower
    has_answer = "**answer**" in lower
    has_summary = "**summary**" in lower

    if not has_analysis and not has_answer and not has_summary:
        cleaned = (
            "**Analysis**\n"
            "I identified your core intent and focused on a direct, accurate response.\n\n"
            "**Answer**\n"
            f"{cleaned}"
        )
        lower = cleaned.lower()
        has_summary = "**summary**" in lower

    if "**answer**" not in lower:
        cleaned = cleaned.replace("**Analysis**", "**Analysis**\n", 1)
        cleaned = f"{cleaned}\n\n**Answer**\n- Main response is provided above in concise form."
        lower = cleaned.lower()
        has_summary = "**summary**" in lower

    if not has_summary:
        cleaned = (
            f"{cleaned}\n\n"
            "**Summary**\n"
            "- Core answer delivered in a concise, structured format.\n"
            "- Key points were prioritized for readability and actionability."
        )

    verification_line = "*Based on the latest available data; please verify with current sources.*"
    if _is_time_sensitive(query) and verification_line.lower() not in cleaned.lower():
        cleaned = f"{cleaned}\n\n{verification_line}"

    return cleaned


def _grounded_title_answer_from_context(query: str, rag_context: str) -> str | None:
    q = (query or "").strip().lower()
    match = re.search(r"who\s+is\s+(?:the\s+)?(?:current\s+)?(cm|chief\s+minister)\s+of\s+([a-z\s]+)", q)
    if not match:
        return None

    place = re.sub(r"\s+", " ", match.group(2)).strip(" ?.,")
    if not place or not (rag_context or "").strip():
        return None

    pattern = re.compile(
        rf"(?:chief\s+minister|cm)\s+of\s+{re.escape(place)}\s*(?:is|:|-)?\s*([A-Za-z][A-Za-z\s\.-]{{2,80}})",
        re.IGNORECASE,
    )
    found = pattern.search(rag_context)
    if not found:
        return None

    name = re.sub(r"\s+", " ", found.group(1)).strip(" .,-")
    if not name:
        return None

    return (
        "**Analysis**\n"
        "I found a direct match in the retrieved curriculum context.\n\n"
        "**Answer**\n"
        f"The Chief Minister of {place.title()} is **{name}**.\n\n"
        "**Summary**\n"
        "- Returned a context-grounded factual answer.\n"
        "- Prioritized uploaded-material evidence over generic model memory."
    )


def _ensure_ollama_ready() -> None:
    global _OLLAMA_READY_UNTIL
    if time.time() < _OLLAMA_READY_UNTIL:
        return

    tags_url = f"{settings.ollama_base_url.rstrip('/')}/api/tags"
    try:
        with urlopen(tags_url, timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError, OSError) as exc:
        raise RuntimeError(
            f"Ollama is unreachable at {settings.ollama_base_url}. Start Ollama and try again."
        ) from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("Ollama returned an invalid response for /api/tags.") from exc

    names = {model.get("name", "") for model in payload.get("models", [])}
    short_names = {name.split(":")[0] for name in names}
    has_any_chat_model = (
        settings.ollama_chat_model in names
        or settings.ollama_chat_model in short_names
        or settings.ollama_fast_chat_model in names
        or settings.ollama_fast_chat_model in short_names
        or settings.ollama_ultra_fast_chat_model in names
        or settings.ollama_ultra_fast_chat_model in short_names
        or settings.ollama_quality_chat_model in names
        or settings.ollama_quality_chat_model in short_names
    )
    if not has_any_chat_model:
        raise RuntimeError(
            "No configured chat model found in Ollama. "
            f"Run: ollama pull {settings.ollama_ultra_fast_chat_model}"
        )

    # Cache readiness check to avoid extra network overhead on every request.
    _OLLAMA_READY_UNTIL = time.time() + 120


def teacher_agent_response(query: str, material_text: str) -> dict:
    _ensure_ollama_ready()
    query_lc = query.lower()
    text = material_text[:7000]

    try:
        if "quiz" in query_lc or "mcq" in query_lc or "question" in query_lc:
            output = generate_quiz(text)
        elif "summary" in query_lc or "summarize" in query_lc or "notes" in query_lc:
            output = summarize_text(text)
        elif "improve" in query_lc or "feedback" in query_lc or "suggest" in query_lc:
            output = suggest_improvements(text)
        else:
            profile = select_orchestration_profile(query, mode_hint="auto", has_context=bool(text.strip()))
            prompt = (
                "You are a teacher copilot. Answer using the provided material context when relevant. "
                "Keep the response practical and concise.\n"
                f"{PROMPT_FOR_AI_AGENTS}\n\n"
                f"{RESPONSE_STYLE_RULES}\n\n"
                f"Material context:\n{text}\n\n"
                f"Teacher query:\n{query}"
            )
            output, _ = invoke_with_fallback(prompt, profile)
    except Exception as exc:
        raise RuntimeError(f"Teacher agent failed while generating a response: {exc}") from exc

    return {"mode": "teacher-agent-fast", "output": _postprocess_output(output, query)}


def teacher_chatbot_response(query: str, memory_text: str = "", rag_context: str = "", chat_mode: str = "quality") -> str:
    _ensure_ollama_ready()

    # For greetings/acknowledgements, avoid expensive generation and avoid dragging old context.
    if _is_small_talk(query):
        return _small_talk_response(query)

    grounded_fact = _grounded_title_answer_from_context(query, rag_context)
    if grounded_fact:
        return grounded_fact

    mode_hint = (chat_mode or "quality").strip().lower()
    
    # Count context sections for quality metric
    context_sections = len([s for s in (rag_context or "").split("\n\n") if s.strip()])
    context_quality = context_sections if (rag_context or "").strip() else 0
    
    profile = select_orchestration_profile(
        query, 
        mode_hint=mode_hint, 
        context_quality=context_quality
    )
    
    context_block = (rag_context.strip() 
                     if rag_context and rag_context.strip() 
                     else "[No curriculum/uploaded-file context]")
    memory_block = (memory_text.strip() 
                    if memory_text and memory_text.strip() 
                    else "[No prior conversation]")
    
    prompt = (
        "You are an expert teacher copilot chatbot.\n\n"
        
        "Your responsibilities:\n"
        "- Provide practical, concise teaching help grounded in available context when present\n"
        "- If context is limited, still answer clearly using your general knowledge\n"
        "- Prefer course context over general knowledge when both are available\n"
        "- Do NOT mention uploaded files, RAG, memory, or internal systems\n\n"
        
        f"{PROMPT_FOR_AI_AGENTS}\n\n"
        
        f"=== Curriculum/File Context ===\n{context_block}\n\n"
        f"=== Conversation History ===\n{memory_block}\n\n"
        f"=== Teacher's Current Message ===\n{query}\n\n"
        "Respond with Analysis/Answer/Summary structure:"
    )
    
    try:
        raw, _ = invoke_with_fallback(prompt, profile)
        # Minimal post-processing: clean up formatting artifacts only
        cleaned = (raw or "").replace("•", "-").replace("â¢", "-").replace("\r\n", "\n").strip()
        return cleaned
    except Exception as exc:
        raise RuntimeError(f"Teacher chatbot failed while generating a response: {exc}") from exc
