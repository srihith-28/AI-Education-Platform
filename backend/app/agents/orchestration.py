from langchain_ollama import OllamaLLM
import json
import threading
import time
from urllib.error import URLError
from urllib.request import urlopen

from app.common.config import settings


_POOL_CACHE_UNTIL = 0.0
_POOL_CACHE_MODELS: list[str] = []
_STATS_LOCK = threading.Lock()
_MODEL_STATS: dict[str, dict[str, float]] = {}


def _model_stat_key(model_name: str) -> str:
    return _normalize_name(model_name)


def _get_stats(model_name: str) -> dict[str, float]:
    key = _model_stat_key(model_name)
    with _STATS_LOCK:
        if key not in _MODEL_STATS:
            _MODEL_STATS[key] = {
                "ema_latency_ms": 0.0,
                "successes": 0.0,
                "failures": 0.0,
                "fail_streak": 0.0,
            }
        return dict(_MODEL_STATS[key])


def _record_success(model_name: str, elapsed_ms: float) -> None:
    key = _model_stat_key(model_name)
    alpha = 0.35
    with _STATS_LOCK:
        stats = _MODEL_STATS.setdefault(
            key,
            {"ema_latency_ms": 0.0, "successes": 0.0, "failures": 0.0, "fail_streak": 0.0},
        )
        if stats["ema_latency_ms"] <= 0:
            stats["ema_latency_ms"] = elapsed_ms
        else:
            stats["ema_latency_ms"] = alpha * elapsed_ms + (1 - alpha) * stats["ema_latency_ms"]
        stats["successes"] += 1.0
        stats["fail_streak"] = max(stats["fail_streak"] - 1.0, 0.0)


def _record_failure(model_name: str) -> None:
    key = _model_stat_key(model_name)
    with _STATS_LOCK:
        stats = _MODEL_STATS.setdefault(
            key,
            {"ema_latency_ms": 0.0, "successes": 0.0, "failures": 0.0, "fail_streak": 0.0},
        )
        stats["failures"] += 1.0
        stats["fail_streak"] += 1.0


def _adaptive_penalty(model_name: str, strategy: str) -> float:
    stats = _get_stats(model_name)
    latency = stats["ema_latency_ms"] if stats["ema_latency_ms"] > 0 else 1800.0
    total = stats["successes"] + stats["failures"]
    failure_rate = (stats["failures"] / total) if total > 0 else 0.0

    if strategy == "fast":
        latency_weight = 0.0014
    elif strategy == "quality":
        latency_weight = 0.0007
    else:
        latency_weight = 0.001

    reliability_penalty = (failure_rate * 4.0) + (stats["fail_streak"] * 0.7)
    return (latency * latency_weight) + reliability_penalty


def _normalize_name(model_name: str) -> str:
    return (model_name or "").split(":")[0].lower()


def _is_embedding_model(model_name: str) -> bool:
    n = (model_name or "").lower()
    embed_markers = ("embed", "embedding", "nomic-embed")
    return any(marker in n for marker in embed_markers)


def _fetch_installed_ollama_models() -> list[str]:
    global _POOL_CACHE_UNTIL, _POOL_CACHE_MODELS
    if time.time() < _POOL_CACHE_UNTIL and _POOL_CACHE_MODELS:
        return list(_POOL_CACHE_MODELS)

    tags_url = f"{settings.ollama_base_url.rstrip('/')}/api/tags"
    discovered: list[str] = []
    try:
        with urlopen(tags_url, timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
        for model in payload.get("models", []):
            name = str(model.get("name", "")).strip()
            if name and not _is_embedding_model(name):
                discovered.append(name)
    except (URLError, TimeoutError, OSError, json.JSONDecodeError):
        # Keep service resilient even if tags endpoint is temporarily unavailable.
        discovered = []

    # Ensure configured models are always included.
    configured = [
        settings.ollama_ultra_fast_chat_model,
        settings.ollama_fast_chat_model,
        settings.ollama_quality_chat_model,
        settings.ollama_chat_model,
    ]
    pool: list[str] = []
    seen = set()
    for name in [*discovered, *configured]:
        n = (name or "").strip()
        if not n or _is_embedding_model(n):
            continue
        key = _normalize_name(n)
        if key not in seen:
            seen.add(key)
            pool.append(n)

    _POOL_CACHE_MODELS = pool
    _POOL_CACHE_UNTIL = time.time() + 90
    return list(pool)


def _model_rank_for_fast(model_name: str) -> int:
    n = _normalize_name(model_name)
    if "phi" in n or "tiny" in n or "mini" in n:
        return 0
    if "llama3" in n and "3.1" not in n:
        return 1
    if "llama" in n:
        return 2
    return 3


def _model_rank_for_quality(model_name: str) -> int:
    n = _normalize_name(model_name)
    if "llama3.1" in n or "llama3:70" in n or "mixtral" in n or "qwen2.5" in n:
        return 0
    if "llama3" in n:
        return 1
    if "phi" in n and ("mini" in n or "tiny" in n):
        return 3
    return 2


def _order_pool(pool: list[str], strategy: str) -> list[str]:
    unique: list[str] = []
    seen = set()
    for model in pool:
        key = _normalize_name(model)
        if key not in seen:
            seen.add(key)
            unique.append(model)

    def _score_fast(model: str) -> tuple[float, float, str]:
        return (_model_rank_for_fast(model), _adaptive_penalty(model, "fast"), _normalize_name(model))

    def _score_quality(model: str) -> tuple[float, float, str]:
        return (_model_rank_for_quality(model), _adaptive_penalty(model, "quality"), _normalize_name(model))

    if strategy == "fast":
        return sorted(unique, key=_score_fast)
    if strategy == "quality":
        return sorted(unique, key=_score_quality)
    # balanced
    fast_sorted = sorted(unique, key=_score_fast)
    quality_sorted = sorted(unique, key=_score_quality)
    interleaved: list[str] = []
    for idx in range(max(len(fast_sorted), len(quality_sorted))):
        if idx < len(fast_sorted):
            interleaved.append(fast_sorted[idx])
        if idx < len(quality_sorted):
            interleaved.append(quality_sorted[idx])
    # de-duplicate while preserving order.
    out: list[str] = []
    seen2 = set()
    for model in interleaved:
        key = _normalize_name(model)
        if key not in seen2:
            seen2.add(key)
            out.append(model)
    return out


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


def _adapt_length_budget(base_num_predict: int, base_num_ctx: int, query: str, context_quality: int) -> tuple[int, int]:
    num_predict = base_num_predict
    num_ctx = base_num_ctx

    if _wants_long_answer(query):
        num_predict = max(num_predict, 850 if context_quality >= 1 else 720)
        num_ctx = max(num_ctx, 4096)
    elif _is_complex_query(query):
        num_predict = max(num_predict, 520)
        num_ctx = max(num_ctx, 3072)
    elif _is_simple_fact_query(query):
        num_predict = min(num_predict, 220)

    return num_predict, num_ctx


def _is_simple_fact_query(query: str) -> bool:
    q = (query or "").strip().lower()
    if len(q) > 90:
        return False
    starters = ("who", "what", "when", "where", "which", "define", "meaning of")
    return q.startswith(starters)


def select_orchestration_profile(query: str, mode_hint: str = "auto", has_context: bool = False, context_quality: int = 0) -> dict:
    mode = (mode_hint or "auto").strip().lower()
    pool = _fetch_installed_ollama_models()

    def _profile(strategy: str, temperature: float, num_predict: int, num_ctx: int, reason: str) -> dict:
        ordered_pool = _order_pool(pool, strategy=strategy)
        primary = ordered_pool[0] if ordered_pool else settings.ollama_fast_chat_model
        fallbacks = ordered_pool[1:] if len(ordered_pool) > 1 else [
            settings.ollama_fast_chat_model,
            settings.ollama_quality_chat_model,
            settings.ollama_ultra_fast_chat_model,
        ]
        return {
            "model": primary,
            "fallback_models": fallbacks,
            "temperature": temperature,
            "num_predict": num_predict,
            "num_ctx": num_ctx,
            "reason": reason,
        }

    def _configured_profile(primary_model: str, temperature: float, num_predict: int, num_ctx: int, reason: str) -> dict:
        ordered_pool = _order_pool(pool, strategy="balanced")
        primary = (primary_model or settings.ollama_chat_model or settings.ollama_fast_chat_model).strip()
        primary_key = _normalize_name(primary)
        fallbacks = [model for model in ordered_pool if _normalize_name(model) != primary_key]
        if not fallbacks:
            fallbacks = [settings.ollama_chat_model]
        return {
            "model": primary,
            "fallback_models": fallbacks,
            "temperature": temperature,
            "num_predict": num_predict,
            "num_ctx": num_ctx,
            "reason": reason,
        }

    if mode == "fast":
        profile = _configured_profile(settings.ollama_fast_chat_model, 0.15, 220, 1536, "explicit fast mode")
        profile["num_predict"], profile["num_ctx"] = _adapt_length_budget(
            profile["num_predict"], profile["num_ctx"], query, context_quality
        )
        return profile

    if mode == "quality":
        profile = _configured_profile(settings.ollama_quality_chat_model, 0.2, 520, 4096, "explicit quality mode")
        profile["num_predict"], profile["num_ctx"] = _adapt_length_budget(
            profile["num_predict"], profile["num_ctx"], query, context_quality
        )
        return profile

    # Auto mode: route based on query complexity, context availability, and quality
    if _is_simple_fact_query(query) and not has_context and context_quality == 0:
        profile = _profile("fast", 0.15, 170, 1536, "auto simple fact query")
        profile["num_predict"], profile["num_ctx"] = _adapt_length_budget(
            profile["num_predict"], profile["num_ctx"], query, context_quality
        )
        return profile

    # If substantial context available, use quality model for better context synthesis
    if context_quality >= 2:
        profile = _profile("quality", 0.2, 520, 4096, "auto quality model (good context)")
        profile["num_predict"], profile["num_ctx"] = _adapt_length_budget(
            profile["num_predict"], profile["num_ctx"], query, context_quality
        )
        return profile

    if _is_complex_query(query) or (has_context and context_quality >= 1):
        profile = _profile("quality", 0.2, 520, 4096, "auto complex/context-rich query")
        profile["num_predict"], profile["num_ctx"] = _adapt_length_budget(
            profile["num_predict"], profile["num_ctx"], query, context_quality
        )
        return profile

    profile = _profile("balanced", 0.2, 320, 3072, "auto balanced query")
    profile["num_predict"], profile["num_ctx"] = _adapt_length_budget(
        profile["num_predict"], profile["num_ctx"], query, context_quality
    )
    return profile


def invoke_with_fallback(prompt: str, profile: dict) -> tuple[str, str]:
    attempted_models: list[str] = []
    candidates = [profile["model"], *profile.get("fallback_models", [])]

    # Keep order and uniqueness stable.
    seen = set()
    ordered_candidates = []
    for model in candidates:
        key = _normalize_name(model)
        if model and key not in seen:
            seen.add(key)
            ordered_candidates.append(model)

    last_error: Exception | None = None
    for model_name in ordered_candidates:
        attempted_models.append(model_name)
        started = time.perf_counter()
        try:
            llm = OllamaLLM(
                model=model_name,
                base_url=settings.ollama_base_url,
                temperature=profile.get("temperature", 0.2),
                num_predict=profile.get("num_predict", 240),
                num_ctx=profile.get("num_ctx", 2048),
                keep_alive="30m",
            )
            output = llm.invoke(prompt)
            elapsed_ms = (time.perf_counter() - started) * 1000.0
            _record_success(model_name, elapsed_ms)
            return output, model_name
        except Exception as exc:  # noqa: BLE001
            _record_failure(model_name)
            last_error = exc
            continue

    raise RuntimeError(
        "All orchestrated models failed: " + ", ".join(attempted_models)
        + (f" | last error: {last_error}" if last_error else "")
    )