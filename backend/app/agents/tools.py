import json

from langchain_ollama import OllamaLLM

from app.common.config import settings


def _llm(temperature: float = 0.3) -> OllamaLLM:
    return OllamaLLM(model=settings.ollama_chat_model, base_url=settings.ollama_base_url, temperature=temperature)


def summarize_text(text: str) -> str:
    prompt = f"Summarize this educational content for classroom usage:\n\n{text}"
    return _llm(0.2).invoke(prompt)


def suggest_improvements(text: str) -> str:
    prompt = (
        "You are a curriculum quality reviewer. Give practical suggestions to improve structure, pedagogy, "
        f"and clarity for this material:\n\n{text}"
    )
    return _llm(0.4).invoke(prompt)


def generate_quiz(text: str, count: int = 5) -> str:
    prompt = (
        "Generate a JSON array of multiple choice questions with keys: question, options, answer. "
        f"Create {count} questions from this text:\n\n{text}"
    )
    raw = _llm(0.3).invoke(prompt)
    try:
        json.loads(raw)
        return raw
    except json.JSONDecodeError:
        fallback = [{"question": "What is the key idea?", "options": ["A", "B", "C", "D"], "answer": "A"}]
        return json.dumps(fallback)


def evaluate_quiz(questions: list[dict], answers: list[str]) -> float:
    prompt = (
        "Evaluate student answers and return only a numeric percentage from 0 to 100. "
        f"Questions: {json.dumps(questions)} Student Answers: {json.dumps(answers)}"
    )
    raw = _llm(0.1).invoke(prompt).strip()
    try:
        return max(0.0, min(100.0, float(raw)))
    except ValueError:
        return 0.0
