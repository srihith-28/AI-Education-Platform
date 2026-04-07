import json
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.agents.student_agent import student_coach_response
from app.agents.tools import evaluate_quiz
from app.common.config import settings
from app.common.deps import require_role
from app.database.models import ChatMessage, ChatSession, Course, Material, Progress, Quiz, QuizAttempt, Task, User
from app.database.session import get_db
from app.rag.query import ask_with_rag
from app.student.schemas import AskRequest, QuizAttemptRequest, UpdateProgressRequest


router = APIRouter()


def _time_value(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value).timestamp()
    except ValueError:
        return 0.0


class RenameSessionRequest(BaseModel):
    custom_title: str


@router.get("/chat/sessions")
def list_chat_sessions(
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    rows = (
        db.query(
            ChatMessage.session_id.label("session_id"),
            func.max(ChatMessage.created_at).label("updated_at"),
        )
        .filter(ChatMessage.user_id == current_user.id)
        .group_by(ChatMessage.session_id)
        .order_by(func.max(ChatMessage.created_at).desc())
        .all()
    )

    sessions = []
    for row in rows:
        last_message = (
            db.query(ChatMessage.content)
            .filter(
                ChatMessage.user_id == current_user.id,
                ChatMessage.session_id == row.session_id,
            )
            .order_by(ChatMessage.created_at.desc())
            .first()
        )
        preview = (last_message[0] if last_message else "")[:80]
        
        # Get metadata from ChatSession if it exists
        session_meta = (
            db.query(ChatSession)
            .filter(ChatSession.user_id == current_user.id, ChatSession.session_id == row.session_id)
            .first()
        )
        
        if not session_meta:
            # Create if doesn't exist
            session_meta = ChatSession(
                user_id=current_user.id,
                session_id=row.session_id,
                custom_title=None,
                is_pinned=False,
                is_archived=False,
            )
            db.add(session_meta)
            db.commit()
        
        sessions.append(
            {
                "session_id": row.session_id,
                "preview": preview,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                "custom_title": session_meta.custom_title,
                "is_pinned": session_meta.is_pinned,
                "is_archived": session_meta.is_archived,
                "pinned_at": session_meta.pinned_at.isoformat() if session_meta.pinned_at else None,
                "archived_at": session_meta.archived_at.isoformat() if session_meta.archived_at else None,
            }
        )

    # Sort: pinned first by pin time, then by recency.
    sessions.sort(
        key=lambda x: (
            0 if x["is_pinned"] else 1,
            -_time_value(x["pinned_at"]),
            -_time_value(x["updated_at"]),
        )
    )

    return {"success": True, "message": "Chat sessions fetched", "data": sessions}


@router.get("/chat/sessions/{session_id}")
def get_chat_session_messages(
    session_id: str,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == current_user.id, ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )

    return {
        "success": True,
        "message": "Chat session messages fetched",
        "data": [
            {
                "id": row.id,
                "role": row.role,
                "content": row.content,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ],
    }


@router.post("/chat/sessions/{session_id}/rename")
def rename_chat_session(
    session_id: str,
    payload: RenameSessionRequest,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    session = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id, ChatSession.session_id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    
    session.custom_title = payload.custom_title
    db.commit()
    return {"success": True, "message": "Chat session renamed"}


@router.post("/chat/sessions/{session_id}/pin")
def toggle_pin_chat_session(
    session_id: str,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    session = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id, ChatSession.session_id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    
    session.is_pinned = not session.is_pinned
    session.pinned_at = datetime.utcnow() if session.is_pinned else None
    db.commit()
    return {"success": True, "message": "Chat session pin toggled", "data": {"is_pinned": session.is_pinned}}


@router.post("/chat/sessions/{session_id}/archive")
def toggle_archive_chat_session(
    session_id: str,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    session = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id, ChatSession.session_id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    
    session.is_archived = not session.is_archived
    session.archived_at = datetime.utcnow() if session.is_archived else None
    db.commit()
    return {"success": True, "message": "Chat session archive toggled", "data": {"is_archived": session.is_archived}}


@router.delete("/chat/sessions/{session_id}")
def delete_chat_session(
    session_id: str,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.session_id == session_id,
    ).delete(synchronize_session=False)
    db.query(ChatSession).filter(
        ChatSession.user_id == current_user.id,
        ChatSession.session_id == session_id,
    ).delete(synchronize_session=False)
    db.commit()
    return {"success": True, "message": "Chat session deleted"}


@router.get("/courses")
def list_available_courses(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("student", "teacher")),
) -> dict:
    _ = current_user
    rows = (
        db.query(Course, func.max(Material.uploaded_at).label("latest_upload"))
        .outerjoin(Material, Material.course_id == Course.id)
        .group_by(Course.id)
        .order_by(func.max(Material.uploaded_at).desc().nullslast(), Course.created_at.desc())
        .all()
    )
    return {
        "success": True,
        "message": "Courses fetched",
        "data": [
            {
                "id": course.id,
                "title": course.title,
                "course_code": course.course_code,
                "description": course.description,
            }
            for course, _latest_upload in rows
        ],
    }


def _is_small_talk(query: str) -> bool:
    q = re.sub(r"[^a-z\s]", "", (query or "").strip().lower()).strip()
    if not q:
        return True
    tokens = q.split()
    if len(tokens) > 3:
        return False
    greetings = {"hi", "hello", "hey", "hii", "heyy", "yo", "sup", "hola"}
    acknowledgements = {"thanks", "thank", "ok", "okay", "cool", "nice", "great"}
    phrase = " ".join(tokens)
    return phrase in {"good morning", "good afternoon", "good evening", "thank you"} or tokens[0] in greetings or tokens[0] in acknowledgements


def _small_talk_response(question: str) -> str:
    q = re.sub(r"[^a-z\s]", "", (question or "").strip().lower()).strip()
    if q in {"thanks", "thank", "thank you"}:
        return "You're welcome. Ask me anything and I will explain it simply."
    if q in {"ok", "okay", "cool", "nice", "great"}:
        return "Great. Send your next question and I will keep it clear and concise."
    return "Hello. What would you like to learn today?"


@router.post("/ask")
def ask_question(
    payload: AskRequest,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    # Ensure ChatSession exists
    session_exists = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id, ChatSession.session_id == payload.session_id)
        .first()
    )
    if not session_exists:
        db.add(ChatSession(
            user_id=current_user.id,
            session_id=payload.session_id,
            custom_title=None,
            is_pinned=False,
            is_archived=False,
        ))
        db.commit()
    
    if _is_small_talk(payload.question):
        final_answer = _small_talk_response(payload.question)
        db.add(ChatMessage(user_id=current_user.id, session_id=payload.session_id, role="user", content=payload.question))
        db.add(ChatMessage(user_id=current_user.id, session_id=payload.session_id, role="assistant", content=final_answer))
        db.commit()
        return {
            "success": True,
            "message": "Answer generated",
            "data": {"answer": final_answer, "sources": [], "context_chunks": 0},
        }

    # Retrieve conversation memory (recent messages)
    history_rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == current_user.id, ChatMessage.session_id == payload.session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(6)
        .all()
    )
    
    # Build memory from most recent messages, trimming BEFORE joining
    memory_messages = list(reversed(history_rows))  # Chronological order
    memory_parts = []
    for row in memory_messages:
        msg = f"{row.role}: {row.content[:500]}"  # Trim each message
        memory_parts.append(msg)
    memory_text = "\n".join(memory_parts)[:900]  # Trim total memory
    
    # Prefer latest uploaded material for this course to reduce stale retrieval.
    latest_material_id = (
        db.query(Material.id)
        .filter(Material.course_id == payload.course_id)
        .order_by(Material.uploaded_at.desc())
        .scalar()
    )

    try:
        # Retrieve RAG context (pass context directly, not full answer)
        rag_result = ask_with_rag(payload.question, payload.course_id, material_id=latest_material_id)

        # Use student coach to synthesize RAG + memory + question
        final_answer = student_coach_response(
            payload.question,
            rag_result.get("answer", ""),  # Pass only the LLM answer from RAG
            memory_text,
        )
    except ConnectionError as exc:
        raise HTTPException(
            status_code=503,
            detail="LLM backend is not reachable. Please ensure Ollama is running.",
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Student RAG pipeline failed: {exc}",
        ) from exc

    db.add(ChatMessage(user_id=current_user.id, session_id=payload.session_id, role="user", content=payload.question))
    db.add(ChatMessage(user_id=current_user.id, session_id=payload.session_id, role="assistant", content=final_answer))
    db.commit()

    return {
        "success": True,
        "message": "Answer generated",
        "data": {
            "answer": final_answer,
            "sources": rag_result.get("sources", []),
            "context_chunks": rag_result.get("context_chunks", 0),
        },
    }


@router.post("/quiz-attempt")
def submit_quiz_attempt(
    payload: QuizAttemptRequest,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    quiz = db.query(Quiz).filter(Quiz.id == payload.quiz_id).first()
    if not quiz:
        return {"success": False, "message": "Quiz not found"}

    questions = json.loads(quiz.questions_json)
    score = evaluate_quiz(questions, payload.answers)
    if score == 0:
        correct = 0
        for index, question in enumerate(questions):
            student_answer = payload.answers[index] if index < len(payload.answers) else ""
            if student_answer.strip().lower() == str(question.get("answer", "")).strip().lower():
                correct += 1
        score = (correct / max(len(questions), 1)) * 100

    attempt = QuizAttempt(quiz_id=quiz.id, student_id=current_user.id, score=score)
    db.add(attempt)
    db.commit()

    return {"success": True, "message": "Quiz evaluated", "data": {"score": score}}


@router.post("/progress")
def update_progress(
    payload: UpdateProgressRequest,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    row = (
        db.query(Progress)
        .filter(Progress.student_id == current_user.id, Progress.task_id == payload.task_id)
        .first()
    )
    if not row:
        row = Progress(student_id=current_user.id, task_id=payload.task_id, completed=payload.completed)
        db.add(row)
    else:
        row.completed = payload.completed
    db.commit()
    return {"success": True, "message": "Progress updated"}


@router.get("/progress/summary")
def progress_summary(
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    total_tasks = db.query(func.count(Task.id)).scalar() or 0
    completed_tasks = (
        db.query(func.count(Progress.id))
        .filter(Progress.student_id == current_user.id, Progress.completed.is_(True))
        .scalar()
        or 0
    )
    percent = round((completed_tasks / total_tasks) * 100, 2) if total_tasks else 0.0
    pending = max(total_tasks - completed_tasks, 0)

    return {
        "success": True,
        "message": "Progress fetched",
        "data": {
            "completed_tasks": completed_tasks,
            "pending_tasks": pending,
            "completion_percentage": percent,
        },
    }


@router.get("/leaderboard")
def leaderboard(db: Session = Depends(get_db), current_user: User = Depends(require_role("student", "teacher"))) -> dict:
    _ = current_user
    users = db.query(User).filter(User.role == "student").all()
    rankings = []

    total_tasks = db.query(func.count(Task.id)).scalar() or 1

    for student in users:
        completed = (
            db.query(func.count(Progress.id))
            .filter(Progress.student_id == student.id, Progress.completed.is_(True))
            .scalar()
            or 0
        )
        completion_pct = (completed / total_tasks) * 100
        avg_quiz = (
            db.query(func.avg(QuizAttempt.score)).filter(QuizAttempt.student_id == student.id).scalar() or 0.0
        )
        rank_score = round((completion_pct * 0.6) + (avg_quiz * 0.4), 2)
        rankings.append(
            {
                "student_id": student.id,
                "name": student.name,
                "completion_percentage": round(completion_pct, 2),
                "quiz_score": round(float(avg_quiz), 2),
                "rank_score": rank_score,
            }
        )

    rankings.sort(key=lambda row: row["rank_score"], reverse=True)
    return {"success": True, "message": "Leaderboard fetched", "data": rankings}


@router.get("/learning-path")
def personalized_learning_path(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("student")),
) -> dict:
    if not settings.feature_personalized_paths:
        return {"success": False, "message": "Feature disabled"}

    completion = (
        db.query(func.count(Progress.id))
        .filter(Progress.student_id == current_user.id, Progress.completed.is_(True))
        .scalar()
        or 0
    )
    quiz_avg = db.query(func.avg(QuizAttempt.score)).filter(QuizAttempt.student_id == current_user.id).scalar() or 0.0

    difficulty = "advanced" if quiz_avg > 80 else "intermediate" if quiz_avg > 55 else "foundational"
    recommendations = [
        "Revise core concepts with concise notes",
        "Attempt 1 quiz daily and review incorrect answers",
        "Ask the AI coach for a 7-day plan",
    ]

    if settings.feature_difficulty_adaptation and difficulty == "advanced":
        recommendations.insert(0, "Focus on challenge problems and peer teaching")

    knowledge_graph_hint = "enabled" if settings.feature_knowledge_graph else "disabled"

    return {
        "success": True,
        "message": "Learning path generated",
        "data": {
            "completed_units": completion,
            "average_quiz_score": round(float(quiz_avg), 2),
            "difficulty_band": difficulty,
            "knowledge_graph": knowledge_graph_hint,
            "recommendations": recommendations,
        },
    }
