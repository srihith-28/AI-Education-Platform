import json
import logging
import re
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.agents.tools import evaluate_quiz
from app.common.config import settings
from app.common.deps import require_role
from app.database.models import (
    Announcement,
    AnnouncementAudience,
    AnnouncementComment,
    ChatMessage,
    ChatSession,
    Course,
    CourseEnrollment,
    CourseTeacher,
    Material,
    Progress,
    Quiz,
    QuizAttempt,
    Task,
    User,
)
from app.database.session import get_db
from app.rag.ingestion import extract_text, ingest_material
from app.rag.query import ask_with_rag
from app.student.schemas import AskRequest, QuizAttemptRequest, UpdateProgressRequest


router = APIRouter()
logger = logging.getLogger("ai-education-api.student")


def _time_value(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value).timestamp()
    except ValueError:
        return 0.0


class RenameSessionRequest(BaseModel):
    custom_title: str


class JoinCourseRequest(BaseModel):
    class_code: str


class CommentRequest(BaseModel):
    content: str


def _resolve_enrolled_course(course_code: str, current_user: User, db: Session) -> Course:
    normalized_code = course_code.strip().upper()
    course = (
        db.query(Course)
        .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
        .filter(Course.course_code == normalized_code, CourseEnrollment.student_id == current_user.id)
        .first()
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def _resolve_enrollment(course_code: str, current_user: User, db: Session) -> CourseEnrollment:
    normalized_code = course_code.strip().upper()
    enrollment = (
        db.query(CourseEnrollment)
        .join(Course, Course.id == CourseEnrollment.course_id)
        .filter(Course.course_code == normalized_code, CourseEnrollment.student_id == current_user.id)
        .first()
    )
    if not enrollment:
        raise HTTPException(status_code=404, detail="Course not found")
    return enrollment


def _resolve_enrolled_course_by_id(course_id: int, current_user: User, db: Session) -> Course:
    course = (
        db.query(Course)
        .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
        .filter(Course.id == course_id, CourseEnrollment.student_id == current_user.id)
        .first()
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def _serialize_announcement_row(
    row: Announcement,
    course_code: str,
    users_by_id: dict[int, User],
    comments_by_announcement_id: dict[int, list[AnnouncementComment]],
    audience_by_announcement_id: dict[int, set[int]],
) -> dict:
    author = users_by_id.get(row.author_id)
    comment_rows = comments_by_announcement_id.get(row.id, [])
    return {
        "id": row.id,
        "course_id": row.course_id,
        "message": row.message,
        "created_at": row.created_at.isoformat(),
        "author": {
            "id": row.author_id,
            "name": author.name if author else "Unknown",
            "role": author.role if author else "unknown",
        },
        "attachment": {
            "file_name": row.attachment_name,
            "content_type": row.attachment_content_type,
            "download_url": f"/api/v1/student/courses/{course_code}/announcements/{row.id}/attachment" if row.attachment_name else None,
        },
        "audience_student_ids": sorted(list(audience_by_announcement_id.get(row.id, set()))),
        "comments": [
            {
                "id": comment.id,
                "content": comment.content,
                "created_at": comment.created_at.isoformat(),
                "author": {
                    "id": comment.author_id,
                    "name": users_by_id.get(comment.author_id).name if users_by_id.get(comment.author_id) else "Unknown",
                    "role": users_by_id.get(comment.author_id).role if users_by_id.get(comment.author_id) else "unknown",
                },
            }
            for comment in comment_rows
        ],
    }


@router.post("/courses/{course_code}/announcements")
def create_course_announcement(
    course_code: str,
    message: str = Form(""),
    file: UploadFile | None = File(default=None),
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    course = _resolve_enrolled_course(course_code, current_user, db)

    cleaned_message = (message or "").strip()
    if not cleaned_message and file is None:
        raise HTTPException(status_code=400, detail="Add a message or attachment before posting")

    attachment_name: str | None = None
    attachment_path: str | None = None
    attachment_content_type: str | None = None

    if file is not None and file.filename:
        ext = Path(file.filename).suffix
        attachment_id = f"{uuid4()}{ext}"
        destination_dir = Path(settings.material_storage_dir) / course.course_code / "announcements"
        destination_dir.mkdir(parents=True, exist_ok=True)
        destination = destination_dir / attachment_id
        with destination.open("wb") as out:
            out.write(file.file.read())

        attachment_name = file.filename
        attachment_path = str(destination)
        attachment_content_type = file.content_type or "application/octet-stream"

        indexed_material = Material(
            course_id=course.id,
            teacher_id=course.teacher_id,
            file_name=file.filename,
            file_path=str(destination),
            content_type=file.content_type or "application/octet-stream",
        )
        db.add(indexed_material)
        db.commit()
        db.refresh(indexed_material)

        try:
            ingest_material(indexed_material.id, course.id, str(destination))
        except Exception:
            logger.exception("Failed to embed student announcement attachment for course %s", course.course_code)

    announcement = Announcement(
        course_id=course.id,
        author_id=current_user.id,
        message=cleaned_message,
        attachment_name=attachment_name,
        attachment_path=attachment_path,
        attachment_content_type=attachment_content_type,
    )
    db.add(announcement)
    db.commit()
    db.refresh(announcement)

    return {
        "success": True,
        "message": "Announcement posted",
        "data": {
            "id": announcement.id,
            "course_id": course.id,
            "message": announcement.message,
            "created_at": announcement.created_at.isoformat(),
            "author": {"id": current_user.id, "name": current_user.name, "role": current_user.role},
            "attachment": {
                "file_name": announcement.attachment_name,
                "content_type": announcement.attachment_content_type,
                "download_url": f"/api/v1/student/courses/{course.course_code}/announcements/{announcement.id}/attachment" if announcement.attachment_name else None,
            },
            "audience_student_ids": [],
            "comments": [],
        },
    }


@router.post("/join-course")
def join_course(
    payload: JoinCourseRequest,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    class_code = (payload.class_code or "").strip().lower()
    if not class_code:
        raise HTTPException(status_code=400, detail="Class code is required")

    course = db.query(Course).filter(func.lower(Course.class_code) == class_code).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found for this class code")

    existing = (
        db.query(CourseEnrollment)
        .filter(CourseEnrollment.course_id == course.id, CourseEnrollment.student_id == current_user.id)
        .first()
    )
    if not existing:
        db.add(
            CourseEnrollment(
                course_id=course.id,
                student_id=current_user.id,
                user_id=current_user.id,
                role="student",
                is_archived=False,
            )
        )
    else:
        existing.user_id = current_user.id
        existing.role = "student"
        existing.is_archived = False
    db.commit()

    return {
        "success": True,
        "message": "Joined course successfully",
        "data": {
            "course_id": course.id,
            "course_code": course.course_code,
            "class_code": course.class_code,
            "title": course.title,
            "section": course.section,
        },
    }


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


@router.get("/enrolled-courses")
def list_enrolled_courses(
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    rows = (
        db.query(Course, CourseEnrollment.is_archived.label("is_archived"))
        .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
        .filter(CourseEnrollment.student_id == current_user.id)
        .order_by(CourseEnrollment.created_at.desc(), Course.created_at.desc())
        .all()
    )

    return {
        "success": True,
        "message": "Enrolled courses fetched",
        "data": [
            {
                "id": course.id,
                "title": course.title,
                "course_code": course.course_code,
                "class_code": course.class_code,
                "section": course.section or "",
                "description": course.description,
                "is_archived": bool(is_archived),
            }
            for course, is_archived in rows
        ],
    }


@router.post("/courses/{course_code}/archive")
def archive_enrolled_course(
    course_code: str,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    enrollment = _resolve_enrollment(course_code, current_user, db)
    enrollment.is_archived = True
    db.commit()
    return {"success": True, "message": "Class archived"}


@router.post("/courses/{course_code}/restore")
def restore_enrolled_course(
    course_code: str,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    enrollment = _resolve_enrollment(course_code, current_user, db)
    enrollment.is_archived = False
    db.commit()
    return {"success": True, "message": "Class restored"}


@router.get("/courses/{course_code}/announcements")
def list_course_announcements(
    course_code: str,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    course = _resolve_enrolled_course(course_code, current_user, db)

    rows = (
        db.query(Announcement)
        .filter(Announcement.course_id == course.id)
        .order_by(Announcement.created_at.desc())
        .all()
    )
    if not rows:
        return {"success": True, "message": "Announcements fetched", "data": []}

    announcement_ids = [row.id for row in rows]
    audience_rows = (
        db.query(AnnouncementAudience)
        .filter(AnnouncementAudience.announcement_id.in_(announcement_ids))
        .all()
    )

    audience_by_announcement_id: dict[int, set[int]] = {}
    for audience in audience_rows:
        audience_by_announcement_id.setdefault(audience.announcement_id, set()).add(audience.student_id)

    rows = [
        row
        for row in rows
        if not audience_by_announcement_id.get(row.id) or current_user.id in audience_by_announcement_id.get(row.id, set())
    ]

    filtered_ids = [row.id for row in rows]
    comment_rows = (
        db.query(AnnouncementComment)
        .filter(AnnouncementComment.announcement_id.in_(filtered_ids))
        .order_by(AnnouncementComment.created_at.asc())
        .all()
        if filtered_ids
        else []
    )

    users_needed = {row.author_id for row in rows} | {row.author_id for row in comment_rows}
    user_rows = db.query(User).filter(User.id.in_(users_needed)).all() if users_needed else []
    users_by_id = {user.id: user for user in user_rows}

    comments_by_announcement_id: dict[int, list[AnnouncementComment]] = {}
    for comment in comment_rows:
        comments_by_announcement_id.setdefault(comment.announcement_id, []).append(comment)

    data = [
        _serialize_announcement_row(row, course.course_code, users_by_id, comments_by_announcement_id, audience_by_announcement_id)
        for row in rows
    ]

    return {"success": True, "message": "Announcements fetched", "data": data}


@router.post("/courses/{course_code}/announcements/{announcement_id}/comments")
def add_course_announcement_comment(
    course_code: str,
    announcement_id: int,
    payload: CommentRequest,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    course = _resolve_enrolled_course(course_code, current_user, db)
    announcement = (
        db.query(Announcement)
        .filter(Announcement.id == announcement_id, Announcement.course_id == course.id)
        .first()
    )
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")

    audience_rows = (
        db.query(AnnouncementAudience.student_id)
        .filter(AnnouncementAudience.announcement_id == announcement.id)
        .all()
    )
    if audience_rows and current_user.id not in {row.student_id for row in audience_rows}:
        raise HTTPException(status_code=403, detail="You do not have access to this announcement")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")

    comment = AnnouncementComment(
        announcement_id=announcement.id,
        author_id=current_user.id,
        content=content,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return {
        "success": True,
        "message": "Comment posted",
        "data": {
            "id": comment.id,
            "content": comment.content,
            "created_at": comment.created_at.isoformat(),
            "author": {
                "id": current_user.id,
                "name": current_user.name,
                "role": current_user.role,
            },
        },
    }


@router.get("/courses/{course_code}/announcements/{announcement_id}/attachment")
def get_course_announcement_attachment(
    course_code: str,
    announcement_id: int,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    course = _resolve_enrolled_course(course_code, current_user, db)
    announcement = (
        db.query(Announcement)
        .filter(Announcement.id == announcement_id, Announcement.course_id == course.id)
        .first()
    )
    if not announcement or not announcement.attachment_path:
        raise HTTPException(status_code=404, detail="Attachment not found")

    attachment_path = Path(announcement.attachment_path)
    if not attachment_path.exists():
        raise HTTPException(status_code=404, detail="Attachment file missing")

    return FileResponse(
        path=str(attachment_path),
        filename=announcement.attachment_name or attachment_path.name,
        media_type=announcement.attachment_content_type or "application/octet-stream",
    )


@router.get("/courses/{course_code}/materials")
def list_course_materials(
    course_code: str,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    course = _resolve_enrolled_course(course_code, current_user, db)
    files = (
        db.query(Material)
        .filter(Material.course_id == course.id)
        .order_by(Material.uploaded_at.desc())
        .all()
    )

    return {
        "success": True,
        "message": "Course materials fetched",
        "data": [
            {
                "id": file.id,
                "file_name": file.file_name,
                "content_type": file.content_type,
                "uploaded_at": file.uploaded_at.isoformat(),
            }
            for file in files
        ],
    }


@router.get("/courses/{course_code}/people")
def list_course_people(
    course_code: str,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    course = _resolve_enrolled_course(course_code, current_user, db)

    teacher = (
        db.query(User.id, User.name, User.email)
        .filter(User.id == course.teacher_id)
        .first()
    )
    students = (
        db.query(User.id, User.name, User.email)
        .join(CourseEnrollment, CourseEnrollment.student_id == User.id)
        .filter(CourseEnrollment.course_id == course.id, User.role == "student")
        .order_by(User.name.asc(), User.email.asc())
        .all()
    )

    return {
        "success": True,
        "message": "Course people fetched",
        "data": {
            "teacher": {"id": teacher.id, "name": teacher.name, "email": teacher.email} if teacher else None,
            "students": [{"id": row.id, "name": row.name, "email": row.email} for row in students],
        },
    }


@router.get("/course/{course_id}/people")
def list_course_people_by_id(
    course_id: int,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    course = _resolve_enrolled_course_by_id(course_id, current_user, db)

    main_teacher = (
        db.query(User.id, User.name, User.email)
        .filter(User.id == course.teacher_id)
        .first()
    )
    co_teachers = (
        db.query(User.id, User.name, User.email)
        .join(CourseTeacher, CourseTeacher.teacher_id == User.id)
        .filter(CourseTeacher.course_id == course.id)
        .order_by(User.name.asc(), User.email.asc())
        .all()
    )
    students = (
        db.query(User.id, User.name, User.email)
        .join(CourseEnrollment, CourseEnrollment.student_id == User.id)
        .filter(CourseEnrollment.course_id == course.id, User.role == "student")
        .order_by(User.name.asc(), User.email.asc())
        .all()
    )

    teachers = []
    if main_teacher:
        teachers.append(
            {
                "id": main_teacher.id,
                "name": main_teacher.name,
                "email": main_teacher.email,
                "is_main": True,
            }
        )
    teachers.extend(
        {
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "is_main": False,
        }
        for row in co_teachers
    )

    return {
        "success": True,
        "message": "Course people fetched",
        "data": {
            "teachers": teachers,
            "students": [{"id": row.id, "name": row.name, "email": row.email} for row in students],
        },
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


def _extract_title_fact_from_text(question: str, text: str) -> str | None:
    q = (question or "").strip().lower()
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
        "- Answered directly from the latest uploaded file.\n"
        "- Prioritized course context over generic model memory."
    )


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
    
    # Prefer latest uploaded material for this course to reduce stale retrieval.
    latest_material = (
        db.query(Material.id, Material.file_path)
        .filter(Material.course_id == payload.course_id)
        .order_by(Material.uploaded_at.desc(), Material.id.desc())
        .first()
    )
    latest_material_id = latest_material[0] if latest_material else None

    # Hard factual guard: for title-style questions, extract from latest file directly first.
    if latest_material and latest_material[1]:
        try:
            latest_text = extract_text(str(latest_material[1]))
            grounded = _extract_title_fact_from_text(payload.question, latest_text[:25000])
            if grounded:
                db.add(ChatMessage(user_id=current_user.id, session_id=payload.session_id, role="user", content=payload.question))
                db.add(ChatMessage(user_id=current_user.id, session_id=payload.session_id, role="assistant", content=grounded))
                db.commit()
                return {
                    "success": True,
                    "message": "Answer generated",
                    "data": {"answer": grounded, "sources": [{"material_id": latest_material_id, "course_id": payload.course_id}], "context_chunks": 1},
                }
        except Exception:
            logger.exception("Latest-file factual extraction failed for course %s", payload.course_id)

    rag_result: dict[str, object] = {"answer": "", "sources": [], "context_chunks": 0}
    try:
        # Retrieve RAG context (pass context directly, not full answer)
        rag_result = ask_with_rag(
            payload.question,
            payload.course_id,
            top_k=6,
            material_id=latest_material_id,
            mode_hint="quality",
        )

        # If latest-only retrieval misses, retry across all course materials.
        if int(rag_result.get("context_chunks", 0) or 0) == 0:
            rag_result = ask_with_rag(
                payload.question,
                payload.course_id,
                top_k=8,
                material_id=None,
                mode_hint="quality",
            )
    except Exception:
        logger.exception("Student RAG retrieval failed for course %s", payload.course_id)

    try:
        final_answer = str(rag_result.get("answer", "")).strip()
        if not final_answer:
            final_answer = (
                "**Analysis**\n"
                "I could not gather enough reliable context to answer confidently.\n\n"
                "**Answer**\n"
                "I do not have enough verified context right now to provide an accurate answer. Please rephrase your question with a little more detail, and I will answer clearly.\n\n"
                "**Summary**\n"
                "- I need clearer context to give a precise answer.\n"
                "- A more specific question will help me respond accurately."
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
            detail=f"Student tutor failed: {exc}",
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
