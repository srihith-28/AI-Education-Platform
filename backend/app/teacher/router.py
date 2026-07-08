import json
import logging
import random
import string
import os
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.agents.tools import generate_quiz
from app.common.storage import get_storage
from app.common.deps import require_role
from app.database.models import (
    Announcement,
    AnnouncementAudience,
    AnnouncementComment,
    Course,
    CourseEnrollment,
    CourseInvite,
    CourseTeacher,
    Material,
    Progress,
    Quiz,
    QuizAttempt,
    Task,
    User,
)
from app.database.session import engine, get_db
from app.rag.embeddings import delete_course_vectors
from app.rag.ingestion import extract_text, ingest_material
from app.teacher.schemas import (
    AddPersonByEmailRequest,
    CourseListResponse,
    CreateAnnouncementCommentRequest,
    CreateCourseRequest,
    DeleteCourseResponse,
    GenerateQuizRequest,
    RemoveCourseUserRequest,
    RenameCourseRequest,
    UploadMaterialResponse,
)


router = APIRouter()
logger = logging.getLogger("ai-education-api.teacher")


def _generate_unique_class_code(db: Session) -> str:
    alphabet = string.ascii_lowercase + string.digits
    for _ in range(40):
        code = "".join(random.choice(alphabet) for _ in range(6))
        exists = db.query(Course.id).filter(Course.class_code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=500, detail="Could not generate unique class code")


def _resolve_course_for_stream_access(course_code: str, current_user: User, db: Session) -> Course:
    normalized_code = course_code.strip().upper()
    if current_user.role == "teacher":
        course = (
            db.query(Course)
            .filter(Course.course_code == normalized_code, Course.teacher_id == current_user.id)
            .first()
        )
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        return course

    course = (
        db.query(Course)
        .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
        .filter(Course.course_code == normalized_code, CourseEnrollment.student_id == current_user.id)
        .first()
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def _resolve_owned_course_by_id(course_id: int, current_user: User, db: Session) -> Course:
    course = db.query(Course).filter(Course.id == course_id, Course.teacher_id == current_user.id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def _upsert_pending_invite(course_id: int, email: str, role: str, invited_by: int, db: Session) -> CourseInvite:
    normalized_email = email.strip().lower()
    invite = (
        db.query(CourseInvite)
        .filter(
            CourseInvite.course_id == course_id,
            CourseInvite.email == normalized_email,
            CourseInvite.role == role,
            CourseInvite.status == "pending",
        )
        .first()
    )
    if invite:
        invite.invited_by = invited_by
        db.add(invite)
        db.commit()
        db.refresh(invite)
        return invite

    invite = CourseInvite(
        course_id=course_id,
        email=normalized_email,
        role=role,
        invited_by=invited_by,
        status="pending",
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


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
            "download_url": f"/api/v1/teacher/courses/{course_code}/announcements/{row.id}/attachment" if row.attachment_name else None,
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


@router.post("/courses")
def create_course(
    payload: CreateCourseRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    existing = db.query(Course).filter(Course.course_code == payload.course_code).first()
    if existing:
        raise HTTPException(status_code=409, detail="Course code already exists")

    course = Course(
        title=payload.title.strip(),
        course_code=payload.course_code.strip().upper(),
        class_code=_generate_unique_class_code(db),
        section=payload.section,
        description=payload.description,
        is_archived=False,
        teacher_id=current_user.id,
    )
    db.add(course)
    db.commit()
    db.refresh(course)

    db.add(
        CourseEnrollment(
            course_id=course.id,
            user_id=current_user.id,
            role="teacher",
            student_id=current_user.id,
            is_archived=False,
        )
    )
    db.commit()

    return {
        "success": True,
        "message": "Course is created",
        "data": {
            "course_id": course.id,
            "course_code": course.course_code,
            "class_code": course.class_code,
            "title": course.title,
            "section": course.section,
            "description": course.description,
            "is_archived": course.is_archived,
        },
    }


@router.get("/courses", response_model=CourseListResponse)
def list_courses(
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> CourseListResponse:
    courses = (
        db.query(Course)
        .filter(Course.teacher_id == current_user.id)
        .order_by(Course.created_at.desc())
        .all()
    )
    return CourseListResponse(
        success=True,
        message="Courses fetched",
        data=[
            {
                "id": course.id,
                "title": course.title,
                "course_code": course.course_code,
                "class_code": course.class_code,
                "section": course.section or "",
                "description": course.description,
                "is_archived": bool(course.is_archived),
            }
            for course in courses
        ],
    )


@router.post("/courses/{course_code}/rename")
def rename_course(
    course_code: str,
    payload: RenameCourseRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    normalized_code = course_code.strip().upper()
    course = (
        db.query(Course)
        .filter(Course.course_code == normalized_code, Course.teacher_id == current_user.id)
        .first()
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    new_title = payload.title.strip()
    new_code = payload.course_code.strip().upper()
    if not new_title or not new_code:
        raise HTTPException(status_code=400, detail="Course title and course code are required")

    duplicate = (
        db.query(Course.id)
        .filter(Course.course_code == new_code, Course.id != course.id)
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="Course code already exists")

    course.title = new_title
    course.course_code = new_code
    db.add(course)
    db.commit()
    db.refresh(course)

    return {
        "success": True,
        "message": "Course renamed",
        "data": {
            "id": course.id,
            "title": course.title,
            "course_code": course.course_code,
            "class_code": course.class_code,
            "section": course.section,
            "description": course.description,
            "is_archived": course.is_archived,
        },
    }


@router.post("/courses/{course_code}/archive")
def archive_course(
    course_code: str,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    normalized_code = course_code.strip().upper()
    course = (
        db.query(Course)
        .filter(Course.course_code == normalized_code, Course.teacher_id == current_user.id)
        .first()
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    course.is_archived = True
    db.add(course)
    db.commit()
    return {"success": True, "message": "Course archived"}


@router.post("/courses/{course_code}/restore")
def restore_course(
    course_code: str,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    normalized_code = course_code.strip().upper()
    course = (
        db.query(Course)
        .filter(Course.course_code == normalized_code, Course.teacher_id == current_user.id)
        .first()
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    course.is_archived = False
    db.add(course)
    db.commit()
    return {"success": True, "message": "Course restored"}


@router.post("/courses/{course_code}/reset-class-code")
def reset_class_code(
    course_code: str,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    normalized_code = course_code.strip().upper()
    course = (
        db.query(Course)
        .filter(Course.course_code == normalized_code, Course.teacher_id == current_user.id)
        .first()
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    course.class_code = _generate_unique_class_code(db)
    db.add(course)
    db.commit()
    db.refresh(course)

    return {
        "success": True,
        "message": "Class code reset",
        "data": {
            "course_id": course.id,
            "course_code": course.course_code,
            "class_code": course.class_code,
        },
    }


@router.get("/courses/{course_code}/materials")
def list_course_materials(
    course_code: str,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    normalized_code = course_code.strip().upper()
    course = (
        db.query(Course.id, Course.course_code)
        .filter(Course.course_code == normalized_code, Course.teacher_id == current_user.id)
        .first()
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    files = (
        db.query(Material)
        .filter(Material.course_id == course.id, Material.teacher_id == current_user.id)
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


@router.get("/courses/{course_code}/students")
def list_course_students(
    course_code: str,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    normalized_code = course_code.strip().upper()
    course = (
        db.query(Course)
        .filter(Course.course_code == normalized_code, Course.teacher_id == current_user.id)
        .first()
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    students = (
        db.query(User.id, User.name, User.email)
        .join(CourseEnrollment, CourseEnrollment.student_id == User.id)
        .filter(CourseEnrollment.course_id == course.id, User.role == "student")
        .order_by(User.name.asc(), User.email.asc())
        .all()
    )

    return {
        "success": True,
        "message": "Course students fetched",
        "data": [
            {"id": row.id, "name": row.name, "email": row.email}
            for row in students
        ],
    }


@router.get("/course/{course_id}/people")
def list_course_people(
    course_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    course = _resolve_owned_course_by_id(course_id, current_user, db)

    main_teacher = db.query(User.id, User.name, User.email).filter(User.id == course.teacher_id).first()
    co_teacher_rows = (
        db.query(User.id, User.name, User.email)
        .join(CourseTeacher, CourseTeacher.teacher_id == User.id)
        .filter(CourseTeacher.course_id == course.id)
        .order_by(User.name.asc(), User.email.asc())
        .all()
    )
    student_rows = (
        db.query(User.id, User.name, User.email)
        .join(CourseEnrollment, CourseEnrollment.student_id == User.id)
        .filter(CourseEnrollment.course_id == course.id)
        .order_by(User.name.asc(), User.email.asc())
        .all()
    )
    invite_rows = (
        db.query(CourseInvite)
        .filter(CourseInvite.course_id == course.id, CourseInvite.status == "pending")
        .order_by(CourseInvite.created_at.desc())
        .all()
    )

    teachers = []
    if main_teacher:
        teachers.append({
            "id": main_teacher.id,
            "name": main_teacher.name,
            "email": main_teacher.email,
            "is_main": True,
        })
    teachers.extend(
        {
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "is_main": False,
        }
        for row in co_teacher_rows
    )

    return {
        "success": True,
        "message": "Course people fetched",
        "data": {
            "course_id": course.id,
            "course_code": course.course_code,
            "class_code": course.class_code,
            "teachers": teachers,
            "students": [
                {"id": row.id, "name": row.name, "email": row.email}
                for row in student_rows
            ],
            "pending_invites": [
                {
                    "id": invite.id,
                    "email": invite.email,
                    "role": invite.role,
                    "status": invite.status,
                    "created_at": invite.created_at.isoformat(),
                }
                for invite in invite_rows
            ],
        },
    }


@router.post("/course/{course_id}/add-student")
def add_course_student(
    course_id: int,
    payload: AddPersonByEmailRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    course = _resolve_owned_course_by_id(course_id, current_user, db)
    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    user = db.query(User).filter(User.email == email).first()
    if user and user.role != "student":
        raise HTTPException(status_code=400, detail="This user is not a student account")

    if user:
        existing = (
            db.query(CourseEnrollment.id)
            .filter(CourseEnrollment.course_id == course.id, CourseEnrollment.student_id == user.id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Student already added")

        db.add(
            CourseEnrollment(
                course_id=course.id,
                student_id=user.id,
                user_id=user.id,
                role="student",
                is_archived=False,
            )
        )
        db.query(CourseInvite).filter(
            CourseInvite.course_id == course.id,
            CourseInvite.email == email,
            CourseInvite.role == "student",
            CourseInvite.status == "pending",
        ).delete(synchronize_session=False)
        db.commit()
        return {
            "success": True,
            "message": "Student added",
            "data": {"id": user.id, "name": user.name, "email": user.email, "status": "active"},
        }

    invite = _upsert_pending_invite(course.id, email, "student", current_user.id, db)
    return {
        "success": True,
        "message": "Student invite sent",
        "data": {
            "id": invite.id,
            "email": invite.email,
            "role": invite.role,
            "status": invite.status,
            "created_at": invite.created_at.isoformat(),
        },
    }


@router.post("/course/{course_id}/add-teacher")
def add_course_teacher(
    course_id: int,
    payload: AddPersonByEmailRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    course = _resolve_owned_course_by_id(course_id, current_user, db)
    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    user = db.query(User).filter(User.email == email).first()
    if user and user.role != "teacher":
        raise HTTPException(status_code=400, detail="This user is not a teacher account")

    if user:
        if user.id == course.teacher_id:
            raise HTTPException(status_code=409, detail="User is already the main teacher")

        existing = (
            db.query(CourseTeacher.id)
            .filter(CourseTeacher.course_id == course.id, CourseTeacher.teacher_id == user.id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Teacher already added")

        db.add(CourseTeacher(course_id=course.id, teacher_id=user.id))
        db.query(CourseInvite).filter(
            CourseInvite.course_id == course.id,
            CourseInvite.email == email,
            CourseInvite.role == "teacher",
            CourseInvite.status == "pending",
        ).delete(synchronize_session=False)
        db.commit()
        return {
            "success": True,
            "message": "Teacher added",
            "data": {"id": user.id, "name": user.name, "email": user.email, "status": "active"},
        }

    invite = _upsert_pending_invite(course.id, email, "teacher", current_user.id, db)
    return {
        "success": True,
        "message": "Teacher invite sent",
        "data": {
            "id": invite.id,
            "email": invite.email,
            "role": invite.role,
            "status": invite.status,
            "created_at": invite.created_at.isoformat(),
        },
    }


@router.delete("/course/{course_id}/remove-user")
def remove_course_user(
    course_id: int,
    payload: RemoveCourseUserRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    course = _resolve_owned_course_by_id(course_id, current_user, db)

    if payload.invite_id is not None:
        invite = (
            db.query(CourseInvite)
            .filter(CourseInvite.id == payload.invite_id, CourseInvite.course_id == course.id)
            .first()
        )
        if not invite:
            raise HTTPException(status_code=404, detail="Invite not found")
        db.delete(invite)
        db.commit()
        return {"success": True, "message": "Invite removed"}

    if payload.user_id is None:
        raise HTTPException(status_code=400, detail="user_id or invite_id is required")

    if payload.role == "teacher":
        if payload.user_id == course.teacher_id:
            raise HTTPException(status_code=400, detail="Main teacher cannot be removed")

        membership = (
            db.query(CourseTeacher)
            .filter(CourseTeacher.course_id == course.id, CourseTeacher.teacher_id == payload.user_id)
            .first()
        )
        if not membership:
            raise HTTPException(status_code=404, detail="Teacher not found in this course")
        db.delete(membership)
        db.commit()
        return {"success": True, "message": "Teacher removed"}

    membership = (
        db.query(CourseEnrollment)
        .filter(CourseEnrollment.course_id == course.id, CourseEnrollment.student_id == payload.user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Student not found in this course")
    db.delete(membership)
    db.commit()
    return {"success": True, "message": "Student removed"}


@router.get("/courses/{course_code}/announcements")
def list_announcements(
    course_code: str,
    current_user: User = Depends(require_role("teacher", "student")),
    db: Session = Depends(get_db),
) -> dict:
    course = _resolve_course_for_stream_access(course_code, current_user, db)

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

    if current_user.role == "student":
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


@router.post("/courses/{course_code}/announcements")
def create_announcement(
    course_code: str,
    message: str = Form(""),
    student_ids: str = Form(""),
    file: UploadFile | None = File(default=None),
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    normalized_code = course_code.strip().upper()
    course = (
        db.query(Course)
        .filter(Course.course_code == normalized_code, Course.teacher_id == current_user.id)
        .first()
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    cleaned_message = (message or "").strip()
    if not cleaned_message and file is None:
        raise HTTPException(status_code=400, detail="Add a message or attachment before posting")

    selected_student_ids: list[int] = []
    if student_ids.strip():
        try:
            parsed = json.loads(student_ids)
            if isinstance(parsed, list):
                selected_student_ids = [int(value) for value in parsed]
        except (ValueError, TypeError, json.JSONDecodeError):
            raise HTTPException(status_code=400, detail="Invalid student selection")

    if selected_student_ids:
        enrolled_student_ids = {
            row.student_id
            for row in db.query(CourseEnrollment.student_id)
            .filter(CourseEnrollment.course_id == course.id)
            .all()
        }
        invalid_ids = [value for value in selected_student_ids if value not in enrolled_student_ids]
        if invalid_ids:
            raise HTTPException(status_code=400, detail="Some selected students are not enrolled in this class")

    attachment_name: str | None = None
    attachment_path: str | None = None
    attachment_content_type: str | None = None
    indexed_material: Material | None = None
    if file is not None and file.filename:
        ext = Path(file.filename).suffix
        attachment_id = f"{uuid4()}{ext}"
        object_path = f"courses/{course.course_code}/announcements/{attachment_id}"
        file_bytes = file.file.read()
        content_type = file.content_type or "application/octet-stream"

        storage = get_storage()
        storage.upload(object_path, file_bytes, content_type)

        attachment_name = file.filename
        attachment_path = object_path  # Supabase Storage object path
        attachment_content_type = content_type

        # Keep teacher RAG fresh: index attached announcement files as course materials.
        # Download to temp file for text extraction
        tmp_path: str | None = None
        try:
            tmp_path = storage.download_to_temp(object_path)
            indexed_material = Material(
                course_id=course.id,
                teacher_id=current_user.id,
                file_name=file.filename,
                file_path=object_path,
                content_type=content_type,
            )
            db.add(indexed_material)
            db.commit()
            db.refresh(indexed_material)
            ingest_material(indexed_material.id, course.id, tmp_path)
        except Exception:
            logger.exception("Failed to embed announcement attachment for course %s", course.course_code)
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

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

    for student_id in selected_student_ids:
        db.add(AnnouncementAudience(announcement_id=announcement.id, student_id=student_id))
    if selected_student_ids:
        db.commit()

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
                "download_url": f"/api/v1/teacher/courses/{course.course_code}/announcements/{announcement.id}/attachment" if announcement.attachment_name else None,
            },
            "audience_student_ids": selected_student_ids,
            "comments": [],
        },
    }


@router.post("/courses/{course_code}/announcements/{announcement_id}/comments")
def add_announcement_comment(
    course_code: str,
    announcement_id: int,
    payload: CreateAnnouncementCommentRequest,
    current_user: User = Depends(require_role("teacher", "student")),
    db: Session = Depends(get_db),
) -> dict:
    course = _resolve_course_for_stream_access(course_code, current_user, db)
    announcement = (
        db.query(Announcement)
        .filter(Announcement.id == announcement_id, Announcement.course_id == course.id)
        .first()
    )
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")

    if current_user.role == "student":
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
def get_announcement_attachment(
    course_code: str,
    announcement_id: int,
    current_user: User = Depends(require_role("teacher", "student")),
    db: Session = Depends(get_db),
):
    course = _resolve_course_for_stream_access(course_code, current_user, db)
    announcement = (
        db.query(Announcement)
        .filter(Announcement.id == announcement_id, Announcement.course_id == course.id)
        .first()
    )
    if not announcement or not announcement.attachment_path or not announcement.attachment_name:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if current_user.role == "student":
        audience_rows = (
            db.query(AnnouncementAudience.student_id)
            .filter(AnnouncementAudience.announcement_id == announcement.id)
            .all()
        )
        if audience_rows and current_user.id not in {row.student_id for row in audience_rows}:
            raise HTTPException(status_code=403, detail="You do not have access to this attachment")

    storage = get_storage()
    try:
        content = storage.download(announcement.attachment_path)
    except Exception:
        raise HTTPException(status_code=404, detail="Attachment file not found in storage")

    return Response(
        content=content,
        media_type=announcement.attachment_content_type or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{announcement.attachment_name}"'},
    )


@router.delete("/courses/{course_code}", response_model=DeleteCourseResponse)
def delete_course(
    course_code: str,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> DeleteCourseResponse:
    normalized_code = course_code.strip().upper()

    with engine.begin() as connection:
        course_row = connection.execute(
            text(
                """
                SELECT id, course_code
                FROM courses
                WHERE course_code = :course_code AND teacher_id = :teacher_id
                """
            ),
            {"course_code": normalized_code, "teacher_id": current_user.id},
        ).first()
        if not course_row:
            raise HTTPException(status_code=404, detail="Course not found")

        course_id = int(course_row[0])
        course_code_value = str(course_row[1])
        material_paths = [
            file_path
            for (file_path,) in connection.execute(
                text("SELECT file_path FROM materials WHERE course_id = :course_id"),
                {"course_id": course_id},
            ).all()
        ]

        connection.execute(
            text("DELETE FROM grades WHERE assignment_id IN (SELECT id FROM classwork WHERE course_id = :course_id)"),
            {"course_id": course_id},
        )
        connection.execute(
            text("DELETE FROM submissions WHERE classwork_id IN (SELECT id FROM classwork WHERE course_id = :course_id)"),
            {"course_id": course_id},
        )
        connection.execute(
            text("DELETE FROM quiz_attempts WHERE quiz_id IN (SELECT id FROM quizzes WHERE course_id = :course_id)"),
            {"course_id": course_id},
        )
        connection.execute(
            text("DELETE FROM progress WHERE task_id IN (SELECT id FROM tasks WHERE course_id = :course_id)"),
            {"course_id": course_id},
        )
        connection.execute(text("DELETE FROM announcement_comments WHERE announcement_id IN (SELECT id FROM announcements WHERE course_id = :course_id)"), {"course_id": course_id})
        connection.execute(text("DELETE FROM announcement_audience WHERE announcement_id IN (SELECT id FROM announcements WHERE course_id = :course_id)"), {"course_id": course_id})
        connection.execute(text("DELETE FROM classwork WHERE course_id = :course_id"), {"course_id": course_id})
        connection.execute(text("DELETE FROM classwork_sections WHERE course_id = :course_id"), {"course_id": course_id})
        connection.execute(text("DELETE FROM quizzes WHERE course_id = :course_id"), {"course_id": course_id})
        connection.execute(text("DELETE FROM tasks WHERE course_id = :course_id"), {"course_id": course_id})
        connection.execute(text("DELETE FROM announcements WHERE course_id = :course_id"), {"course_id": course_id})
        connection.execute(text("DELETE FROM events WHERE course_id = :course_id"), {"course_id": course_id})
        connection.execute(text("DELETE FROM materials WHERE course_id = :course_id"), {"course_id": course_id})
        connection.execute(text("DELETE FROM course_teachers WHERE course_id = :course_id"), {"course_id": course_id})
        connection.execute(text("DELETE FROM course_invites WHERE course_id = :course_id"), {"course_id": course_id})
        connection.execute(text("DELETE FROM course_enrollments WHERE course_id = :course_id"), {"course_id": course_id})
        connection.execute(text("DELETE FROM topics WHERE course_id = :course_id"), {"course_id": course_id})
        connection.execute(text("DELETE FROM courses WHERE id = :course_id"), {"course_id": course_id})

    for file_path_value in material_paths:
        pass # file_path is a Supabase Storage object path, not local

    # Delete all files stored under this course in Supabase Storage
    storage = get_storage()
    storage.delete_folder(f"courses/{normalized_code}")

    delete_course_vectors(course_id)

    return DeleteCourseResponse(
        success=True,
        message="Course deleted permanently",
        data={"course_code": course_code_value, "course_id": course_id},
    )


@router.post("/upload-material")
def upload_material(
    course_code: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> UploadMaterialResponse:
    normalized_code = course_code.strip().upper()
    course = (
        db.query(Course)
        .filter(Course.course_code == normalized_code, Course.teacher_id == current_user.id)
        .first()
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    ext = Path(file.filename).suffix
    file_id = f"{uuid4()}{ext}"
    object_path = f"courses/{course.course_code}/{file_id}"
    file_bytes = file.file.read()
    content_type = file.content_type or "application/octet-stream"

    # Upload to Supabase Storage
    storage = get_storage()
    storage.upload(object_path, file_bytes, content_type)

    material = Material(
        course_id=course.id,
        teacher_id=current_user.id,
        file_name=file.filename,
        file_path=object_path,  # Supabase Storage object path
        content_type=content_type,
    )
    db.add(material)
    db.commit()
    db.refresh(material)

    # Download to temp for text extraction, then ingest into Qdrant
    tmp_path: str | None = None
    chunk_count = 0
    try:
        tmp_path = storage.download_to_temp(object_path)
        chunk_count = ingest_material(material.id, course.id, tmp_path)
    except Exception:
        logger.exception("Failed to ingest material %d for course %s", material.id, course.course_code)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    return UploadMaterialResponse(
        success=True,
        message=f"File successfully uploaded to {course.course_code}",
        data={
            "file_id": material.id,
            "chunk_count": chunk_count,
            "course_code": course.course_code,
            "course_id": course.id,
        },
    )


@router.post("/generate-quiz")
def generate_quiz_from_material(
    payload: GenerateQuizRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    material = db.query(Material).filter(Material.id == payload.material_id).first()
    if not material:
        return {"success": False, "message": "Material not found"}

    storage = get_storage()
    tmp_path: str | None = None
    try:
        tmp_path = storage.download_to_temp(material.file_path)
        text = extract_text(tmp_path)
    except Exception as exc:
        logger.exception("Failed to download material %d for quiz generation", material.id)
        return {"success": False, "message": f"Could not read material: {exc}"}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    quiz_json = generate_quiz(text, payload.question_count)

    quiz = Quiz(
        course_id=payload.course_id,
        created_by=current_user.id,
        title=payload.title,
        questions_json=quiz_json,
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)

    return {
        "success": True,
        "message": "Quiz generated",
        "data": {"quiz_id": quiz.id, "questions": json.loads(quiz.questions_json)},
    }
