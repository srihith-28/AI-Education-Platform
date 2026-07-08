"""
agents/orchestration.py — Gemini LLM orchestration.

Replaces the Ollama multi-model dynamic pool with a Gemini-based two-tier system:
  - Fast tier: llama-3.1-8b-instant  (quick responses, short context)
  - Quality tier: llama-3.3-70b-versatile (complex reasoning, RAG synthesis)

All query classification logic (_is_complex_query, _wants_long_answer,
_is_simple_fact_query) is preserved exactly from the original implementation.
The select_orchestration_profile and invoke_with_fallback interfaces are
unchanged so teacher_agent.py and query.py work without modification.
"""
import logging
import time

from langchain_google_genai import ChatGoogleGenerativeAI

from app.common.config import settings

logger = logging.getLogger("ai-education-api.orchestration")


# ── Query classification helpers (preserved from original) ─────────────────────

def _is_complex_query(query: str) -> bool:
    q = (query or "").lower()
    if len(q) > 220:
        return True
    complex_markers = (
        "analyze", "analysis", "compare", "contrast", "framework", "architecture",
        "lesson plan", "roadmap", "strategy", "tradeoff", "case study", "project",
        "deep", "detailed", "step-by-step", "curriculum", "research",
    )
    return any(marker in q for marker in complex_markers)


def _wants_long_answer(query: str) -> bool:
    q = (query or "").lower()
    if len(q) >= 140:
        return True
    long_markers = (
        "prepare", "generate", "create", "write", "draft", "mcq", "quiz", "question bank",
        "detailed", "in depth", "comprehensive", "elaborate", "full", "complete", "long answer",
        "lesson plan", "notes", "explain", "step-by-step", "steps", "examples",
    )
    return any(marker in q for marker in long_markers)


def _is_simple_fact_query(query: str) -> bool:
    q = (query or "").strip().lower()
    if len(q) > 90:
        return False
    starters = ("who", "what", "when", "where", "which", "define", "meaning of")
    return q.startswith(starters)


# ── Profile builder ─────────────────────────────────────────────────────────────

def _adapt_max_tokens(base_tokens: int, query: str, context_quality: int) -> int:
    if _wants_long_answer(query):
        return max(base_tokens, 1500 if context_quality >= 1 else 1200)
    elif _is_complex_query(query):
        return max(base_tokens, 800)
    elif _is_simple_fact_query(query):
        return min(base_tokens, 350)
    return base_tokens


def select_orchestration_profile(
    query: str,
    mode_hint: str = "auto",
    has_context: bool = False,
    context_quality: int = 0,
) -> dict:
    """Select Gemini model profile based on query complexity and mode hint.

    Returns a profile dict with keys:
      model, fallback_model, temperature, max_tokens
    """
    mode = (mode_hint or "auto").strip().lower()

    if mode == "fast":
        tokens = _adapt_max_tokens(400, query, context_quality)
        return {
            "model": settings.gemini_fast_model,
            "fallback_model": settings.gemini_quality_model,
            "temperature": 0.15,
            "max_tokens": tokens,
            "reason": "explicit fast mode",
        }

    if mode == "quality":
        tokens = _adapt_max_tokens(1024, query, context_quality)
        return {
            "model": settings.gemini_quality_model,
            "fallback_model": settings.gemini_fast_model,
            "temperature": 0.2,
            "max_tokens": tokens,
            "reason": "explicit quality mode",
        }

    # Auto mode
    if _is_simple_fact_query(query) and context_quality == 0:
        tokens = _adapt_max_tokens(300, query, context_quality)
        return {
            "model": settings.gemini_fast_model,
            "fallback_model": settings.gemini_quality_model,
            "temperature": 0.15,
            "max_tokens": tokens,
            "reason": "auto: simple fact query",
        }

    if context_quality >= 2 or _is_complex_query(query) or (has_context and context_quality >= 1):
        tokens = _adapt_max_tokens(1024, query, context_quality)
        return {
            "model": settings.gemini_quality_model,
            "fallback_model": settings.gemini_fast_model,
            "temperature": 0.2,
            "max_tokens": tokens,
            "reason": "auto: complex/context-rich query",
        }

    # Default balanced
    tokens = _adapt_max_tokens(600, query, context_quality)
    return {
        "model": settings.gemini_fast_model,
        "fallback_model": settings.gemini_quality_model,
        "temperature": 0.2,
        "max_tokens": tokens,
        "reason": "auto: balanced",
    }


# ── Invocation with fallback ────────────────────────────────────────────────────

def invoke_with_fallback(prompt: str, profile: dict) -> tuple[str, str]:
    """Invoke the primary Gemini model; fall back to secondary on failure.

    Args:
        prompt: The fully formatted prompt string.
        profile: Profile dict from select_orchestration_profile.

    Returns:
        Tuple of (response_text, model_used).

    Raises:
        RuntimeError: if both primary and fallback models fail.
    """
    candidates = [profile["model"]]
    fallback = profile.get("fallback_model")
    if fallback and fallback != profile["model"]:
        candidates.append(fallback)

    last_error: Exception | None = None
    for model_name in candidates:
        started = time.perf_counter()
        try:
            llm = ChatGoogleGenerativeAI(
                model=model_name,
                google_api_key=settings.gemini_api_key,
                temperature=profile.get("temperature", 0.2),
                max_tokens=profile.get("max_tokens", 600),
                max_retries=1,
            )
            result = llm.invoke(prompt)
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.debug("Gemini %s responded in %.0f ms", model_name, elapsed_ms)
            # Extract text content from AIMessage
            content = result.content if hasattr(result, "content") else str(result)
            return content, model_name
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini model %s failed: %s", model_name, exc)
            last_error = exc
            continue

    raise RuntimeError(
        f"All Gemini models failed: {', '.join(candidates)}"
        + (f" | last error: {last_error}" if last_error else "")
    )