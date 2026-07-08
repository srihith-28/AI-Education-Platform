import json
import logging

from langchain_google_genai import ChatGoogleGenerativeAI

from app.common.config import settings

logger = logging.getLogger("ai-education-api.tools")


def _llm(temperature: float = 0.3) -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=settings.gemini_fast_model,
        google_api_key=settings.gemini_api_key,
        temperature=temperature,
        max_tokens=1200,
    )


def _invoke(llm: ChatGoogleGenerativeAI, prompt: str) -> str:
    result = llm.invoke(prompt)
    return result.content if hasattr(result, "content") else str(result)


def summarize_text(text: str) -> str:
    prompt = f"Summarize this educational content for classroom usage:\n\n{text}"
    return _invoke(_llm(0.2), prompt)


def suggest_improvements(text: str) -> str:
    prompt = (
        "You are a curriculum quality reviewer. Give practical suggestions to improve structure, pedagogy, "
        f"and clarity for this material:\n\n{text}"
    )
    return _invoke(_llm(0.4), prompt)


def generate_quiz(text: str, count: int = 5) -> str:
    prompt = (
        "Generate a JSON array of multiple choice questions with keys: question, options, answer. "
        f"Create {count} questions from this text:\n\n{text}"
    )
    raw = _invoke(_llm(0.3), prompt)
    # Strip markdown code fences if present
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        json.loads(raw)
        return raw
    except json.JSONDecodeError:
        logger.warning("Quiz generation returned invalid JSON — using fallback")
        fallback = [{"question": "What is the key idea?", "options": ["A", "B", "C", "D"], "answer": "A"}]
        return json.dumps(fallback)


def evaluate_quiz(questions: list[dict], answers: list[str]) -> float:
    prompt = (
        "Evaluate student answers and return only a numeric percentage from 0 to 100. "
        f"Questions: {json.dumps(questions)} Student Answers: {json.dumps(answers)}"
    )
    raw = _invoke(_llm(0.1), prompt).strip()
    try:
        return max(0.0, min(100.0, float(raw)))
    except ValueError:
        return 0.0
