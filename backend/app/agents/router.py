from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
import re
import logging
from datetime import datetime

from app.agents.teacher_agent import teacher_agent_response, teacher_chatbot_response
from app.common.deps import get_current_user, require_role
from app.database.models import Announcement, ChatMessage, ChatSession, Course, Material, User
from app.database.session import SessionLocal, get_db
from app.rag.ingestion import extract_text
from app.rag.query import teacher_rag_context


router = APIRouter()
logger = logging.getLogger("ai-education-api.agents")


def _time_value(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value).timestamp()
    except ValueError:
        return 0.0


class RenameSessionRequest(BaseModel):
    custom_title: str


@router.get("/teacher-assistant/sessions")
def list_teacher_assistant_sessions(
    current_user: User = Depends(require_role("teacher")),
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
            .filter(ChatMessage.user_id == current_user.id, ChatMessage.session_id == row.session_id)
            .order_by(ChatMessage.created_at.desc())
            .first()
        )
        
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
                "preview": (last_message[0] if last_message else "")[:80],
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

    return {"success": True, "message": "Teacher sessions fetched", "data": sessions}


@router.get("/teacher-assistant/sessions/{session_id}")
def get_teacher_assistant_session(
    session_id: str,
    current_user: User = Depends(require_role("teacher")),
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
        "message": "Teacher session messages fetched",
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


@router.delete("/teacher-assistant/sessions/{session_id}")
def delete_teacher_assistant_session(
    session_id: str,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    deleted = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == current_user.id, ChatMessage.session_id == session_id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {
        "success": True,
        "message": "Teacher session deleted",
        "data": {"session_id": session_id, "deleted_messages": deleted},
    }


@router.post("/teacher-assistant/sessions/{session_id}/rename")
def rename_teacher_session(
    session_id: str,
    payload: RenameSessionRequest,
    current_user: User = Depends(require_role("teacher")),
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


@router.post("/teacher-assistant/sessions/{session_id}/pin")
def toggle_pin_teacher_session(
    session_id: str,
    current_user: User = Depends(require_role("teacher")),
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


@router.post("/teacher-assistant/sessions/{session_id}/archive")
def toggle_archive_teacher_session(
    session_id: str,
    current_user: User = Depends(require_role("teacher")),
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


def _small_talk_response(query: str) -> str:
    q = re.sub(r"[^a-z\s]", "", (query or "").strip().lower()).strip()
    if q in {"thanks", "thank", "thank you"}:
        return "You're welcome. What would you like help with next?"
    if q in {"ok", "okay", "cool", "nice", "great"}:
        return "Great. Share your question, and I will keep the answer concise and practical."
    return "Hello. How can I help you today?"


def _extract_title_fact_from_text(query: str, text: str) -> str | None:
    q = (query or "").strip().lower()
    m = re.search(r"who\s+is\s+(?:the\s+)?(?:current\s+)?(cm|chief\s+minister)\s+of\s+([a-z\s]+)", q)
    if not m:
        return None
    place = re.sub(r"\s+", " ", m.group(2)).strip(" ?.,")
    if not place or not (text or "").strip():
        return None
    pattern = re.compile(
        rf"(?:chief\s+minister|cm)\s+of\s+{re.escape(place)}\s*(?:is|:|-)?\s*([A-Za-z][A-Za-z\s\.-]{{2,80}})",
        re.IGNORECASE,
    )
    hit = pattern.search(text)
    if not hit:
        return None
    name = re.sub(r"\s+", " ", hit.group(1)).strip(" .,-")
    if not name:
        return None
    return (
        "**Analysis**\n"
        "I found a direct factual match in the latest uploaded course material.\n\n"
        "**Answer**\n"
        f"The Chief Minister of {place.title()} is **{name}**.\n\n"
        "**Summary**\n"
        "- Returned a direct answer from the latest uploaded file.\n"
        "- Prioritized uploaded context over general model memory."
    )


class TeacherAgentRequest(BaseModel):
    query: str = Field(min_length=3)
    course_code: str | None = None


class TeacherAssistantChatRequest(BaseModel):
    query: str = Field(min_length=3)
    session_id: str = Field(min_length=3, max_length=120)
    course_code: str | None = None
    chat_mode: str = Field(default="quality", pattern="^(fast|quality)$")


@router.post("/teacher-chat")
def teacher_chat(
    payload: TeacherAgentRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    query_text = payload.query.strip()
    if not query_text:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    course_id: int | None = None
    normalized_course_code = (payload.course_code or "").strip().upper()
    if normalized_course_code:
        course = (
            db.query(Course.id)
            .filter(Course.teacher_id == current_user.id, Course.course_code == normalized_course_code)
            .first()
        )
        if not course:
            raise HTTPException(status_code=404, detail=f"Course '{normalized_course_code}' not found for this teacher.")
        course_id = course.id

    material_query = db.query(Material).filter(Material.teacher_id == current_user.id)
    if course_id is not None:
        material_query = material_query.filter(Material.course_id == course_id)

    material = material_query.order_by(Material.uploaded_at.desc()).first()
    if not material:
        if normalized_course_code:
            raise HTTPException(
                status_code=404,
                detail=f"No materials found for course '{normalized_course_code}'. Upload a file first.",
            )
        raise HTTPException(status_code=404, detail="No materials found for this teacher. Upload a file first.")

    material_file_path = material.file_path
    db.close()

    try:
        text = extract_text(material_file_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read material file: {exc}") from exc

    # Limit context size to keep latency stable on local Ollama models.
    text_for_agent = text[:12000]

    try:
        result = teacher_agent_response(query_text, text_for_agent)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {"success": True, "message": "Agent response generated", "data": result}


@router.post("/teacher-assistant-chat")
def teacher_assistant_chat(
    payload: TeacherAssistantChatRequest,
    current_user: User = Depends(require_role("teacher")),
) -> dict:
    query_text = payload.query.strip()
    if not query_text:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    # Ensure ChatSession exists
    with SessionLocal() as db:
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

    if _is_small_talk(query_text):
        logger.info("teacher_assistant_chat small-talk short-circuit: %s", query_text)
        answer = _small_talk_response(query_text)
        with SessionLocal() as db:
            db.add(ChatMessage(user_id=current_user.id, session_id=payload.session_id, role="user", content=query_text))
            db.add(ChatMessage(user_id=current_user.id, session_id=payload.session_id, role="assistant", content=answer))
            db.commit()
        return {
            "success": True,
            "message": "Teacher assistant response generated",
            "data": {
                "answer": answer,
                "session_id": payload.session_id,
                "chat_mode": payload.chat_mode,
                "sources": [],
                "context_chunks": 0,
            },
        }

    course_ids: list[int] = []
    latest_material_ids: list[int] = []
    normalized_course_code = (payload.course_code or "").strip().upper()

    # Query memory and teacher courses in a short-lived DB session to avoid holding DB connections during LLM generation.
    with SessionLocal() as db:
        history_rows = (
            db.query(ChatMessage)
            .filter(ChatMessage.user_id == current_user.id, ChatMessage.session_id == payload.session_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(8)
            .all()
        )

        course_query = db.query(Course.id).filter(Course.teacher_id == current_user.id)
        if normalized_course_code:
            course_query = course_query.filter(Course.course_code == normalized_course_code)
        course_ids = [row.id for row in course_query.all()]

        for course_id in course_ids[:8]:
            latest_material = (
                db.query(Material.id)
                .filter(Material.course_id == course_id, Material.teacher_id == current_user.id)
                .order_by(Material.uploaded_at.desc())
                .first()
            )
            if latest_material:
                latest_material_ids.append(latest_material.id)

        # Hard factual guard for selected course: check latest file text first.
        if normalized_course_code and course_ids:
            latest_file = (
                db.query(Material.file_path)
                .filter(Material.course_id == course_ids[0], Material.teacher_id == current_user.id)
                .order_by(Material.uploaded_at.desc(), Material.id.desc())
                .first()
            )
            if latest_file and latest_file[0]:
                try:
                    latest_text = extract_text(str(latest_file[0]))
                    grounded = _extract_title_fact_from_text(query_text, latest_text[:25000])
                    if grounded:
                        db.add(ChatMessage(user_id=current_user.id, session_id=payload.session_id, role="user", content=query_text))
                        db.add(ChatMessage(user_id=current_user.id, session_id=payload.session_id, role="assistant", content=grounded))
                        db.commit()
                        return {
                            "success": True,
                            "message": "Teacher assistant response generated",
                            "data": {
                                "answer": grounded,
                                "session_id": payload.session_id,
                                "chat_mode": payload.chat_mode,
                                "sources": [{"course_id": course_ids[0]}],
                                "context_chunks": 1,
                            },
                        }
                except Exception:
                    logger.exception("Teacher latest-file factual extraction failed for course %s", course_ids[0])

    # Build memory from most recent messages, trimming BEFORE joining
    memory_messages = list(reversed(history_rows))  # Chronological order
    memory_parts = []
    for row in memory_messages:
        msg = f"{row.role}: {row.content[:500]}"  # Trim each message to avoid bloat
        memory_parts.append(msg)
    memory_text = "\n".join(memory_parts)[:1200]  # Trim total memory for teacher (more context available)
    
    try:
        rag_data = teacher_rag_context(query_text, course_ids, latest_material_ids=latest_material_ids)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Gemini API error: {str(exc)}",
        ) from exc

    # Fallback for previously uploaded announcement attachments that were not embedded.
    if rag_data.get("context_chunks", 0) == 0 and normalized_course_code:
        with SessionLocal() as db:
            course = (
                db.query(Course.id)
                .filter(Course.teacher_id == current_user.id, Course.course_code == normalized_course_code)
                .first()
            )
            if course:
                attachment_rows = (
                    db.query(Announcement.attachment_path, Announcement.attachment_name)
                    .filter(Announcement.course_id == course.id, Announcement.attachment_path.isnot(None))
                    .order_by(Announcement.created_at.desc())
                    .limit(3)
                    .all()
                )

                fallback_parts: list[str] = []
                fallback_sources: list[dict] = []
                for row in attachment_rows:
                    attachment_path = row.attachment_path
                    if not attachment_path:
                        continue
                    try:
                        text = extract_text(attachment_path)
                    except Exception:
                        continue
                    if text.strip():
                        fallback_parts.append(text[:1200])
                        fallback_sources.append({"attachment_name": row.attachment_name, "path": attachment_path})

                if fallback_parts:
                    rag_data = {
                        "context": "\n\n".join(fallback_parts)[:3000],
                        "sources": fallback_sources,
                        "context_chunks": len(fallback_parts),
                    }

    try:
        answer = teacher_chatbot_response(query_text, memory_text, rag_data.get("context", ""), payload.chat_mode)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    # Persist chat messages in a separate short-lived DB session.
    with SessionLocal() as db:
        db.add(ChatMessage(user_id=current_user.id, session_id=payload.session_id, role="user", content=query_text))
        db.add(ChatMessage(user_id=current_user.id, session_id=payload.session_id, role="assistant", content=answer))
        db.commit()

    return {
        "success": True,
        "message": "Teacher assistant response generated",
        "data": {
            "answer": answer,
            "session_id": payload.session_id,
            "chat_mode": payload.chat_mode,
            "sources": rag_data.get("sources", []),
            "context_chunks": rag_data.get("context_chunks", 0),
        },
    }


@router.get("/health-check")
def agent_health(current_user: User = Depends(get_current_user)) -> dict:
    _ = current_user
    return {"success": True, "message": "Agents online"}
