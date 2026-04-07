import re

from app.agents.orchestration import invoke_with_fallback, select_orchestration_profile
from app.agents.prompting import PROMPT_FOR_AI_AGENTS


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
        return "You're welcome. Ask me anything and I will explain it simply."
    if q in {"ok", "okay", "cool", "nice", "great"}:
        return "Great. Send your next question and I will keep it clear and concise."
    return "Hello. What would you like to learn today?"


def _postprocess_output(text: str, query: str) -> str:
    if _is_small_talk(query):
        return _small_talk_response(query)

    cleaned = (text or "").replace("•", "-").replace("â¢", "-").replace("\r\n", "\n").strip()
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    lower = cleaned.lower()

    has_analysis = "**analysis**" in lower
    has_answer = "**answer**" in lower
    has_summary = "**summary**" in lower

    if not has_analysis and not has_answer and not has_summary:
        cleaned = (
            "**Analysis**\n"
            "I identified your intent and prepared a direct, structured response.\n\n"
            "**Answer**\n"
            f"{cleaned}"
        )
        lower = cleaned.lower()
        has_summary = "**summary**" in lower

    if "**answer**" not in lower:
        cleaned = f"{cleaned}\n\n**Answer**\n- Main response is provided above in concise form."
        lower = cleaned.lower()
        has_summary = "**summary**" in lower

    if not has_summary:
        cleaned = (
            f"{cleaned}\n\n"
            "**Summary**\n"
            "- Core answer delivered with readable structure.\n"
            "- Key points were kept concise and practical."
        )

    verification_line = "*Based on the latest available data; please verify with current sources.*"
    if _is_time_sensitive(query) and verification_line.lower() not in cleaned.lower():
        cleaned = f"{cleaned}\n\n{verification_line}"
    return cleaned


def student_coach_response(question: str, rag_answer: str, memory_text: str) -> str:
    if _is_small_talk(question):
        return _small_talk_response(question)

    # Build clean context from RAG and memory
    rag_context = (rag_answer or "").strip()
    chat_memory = (memory_text or "").strip()
    
    prompt = f"""
You are a friendly student mentor and coach.

Answer the student's question clearly and directly using only the retrieved study material.
- Do not use outside knowledge, guesses, or assumptions.
- Do not ask the student to choose a course, subject, or file again.
- If the retrieved material does not contain enough information, say that the answer cannot be determined from the available study material.
- Keep the explanation student-friendly and concise.

{PROMPT_FOR_AI_AGENTS}

---
Recent conversation memory (for context continuity):
{chat_memory[:800] if chat_memory else '[No previous messages]'}

---
Reference material retrieved (use only if relevant):
{rag_context[:1000] if rag_context else '[No study material was retrieved]'}

---
Student's current question:
{question}

Respond now following the Analysis/Answer/Summary structure above:
"""
    profile = select_orchestration_profile(
        question,
        mode_hint="auto",
        context_quality=len([l for l in (rag_context or "").split("\n\n") if l.strip()]),
    )
    raw, _ = invoke_with_fallback(prompt, profile)
    # Trust the LLM to follow the format - minimal post-processing
    cleaned = (raw or "").replace("•", "-").replace("â¢", "-").replace("\r\n", "\n").strip()
    return cleaned
