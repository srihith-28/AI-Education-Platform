import json
import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.agents.tools import generate_quiz
from app.common.config import settings
from app.common.deps import require_role
from app.database.models import Course, Material, Progress, Quiz, QuizAttempt, Task, User
from app.database.session import engine, get_db
from app.rag.embeddings import delete_course_vectors
from app.rag.ingestion import extract_text, ingest_material
from app.teacher.schemas import CourseListResponse, CreateCourseRequest, DeleteCourseResponse, GenerateQuizRequest, UploadMaterialResponse


router = APIRouter()


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
        title=payload.title,
        course_code=payload.course_code.upper(),
        description=payload.description,
        teacher_id=current_user.id,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return {
        "success": True,
        "message": "Course is created",
        "data": {
            "course_id": course.id,
            "course_code": course.course_code,
            "title": course.title,
            "description": course.description,
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
                "description": course.description,
            }
            for course in courses
        ],
    )


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
            text("DELETE FROM quiz_attempts WHERE quiz_id IN (SELECT id FROM quizzes WHERE course_id = :course_id)"),
            {"course_id": course_id},
        )
        connection.execute(
            text("DELETE FROM progress WHERE task_id IN (SELECT id FROM tasks WHERE course_id = :course_id)"),
            {"course_id": course_id},
        )
        connection.execute(text("DELETE FROM quizzes WHERE course_id = :course_id"), {"course_id": course_id})
        connection.execute(text("DELETE FROM tasks WHERE course_id = :course_id"), {"course_id": course_id})
        connection.execute(text("DELETE FROM materials WHERE course_id = :course_id"), {"course_id": course_id})
        connection.execute(text("DELETE FROM courses WHERE id = :course_id"), {"course_id": course_id})

    for file_path_value in material_paths:
        file_path = Path(file_path_value)
        if file_path.exists():
            try:
                file_path.unlink()
            except OSError:
                pass

    course_folder = Path(settings.material_storage_dir) / normalized_code
    if course_folder.exists():
        shutil.rmtree(course_folder, ignore_errors=True)

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
    destination = Path(settings.material_storage_dir) / course.course_code
    destination.mkdir(parents=True, exist_ok=True)
    destination = destination / file_id

    with destination.open("wb") as out:
        out.write(file.file.read())

    material = Material(
        course_id=course.id,
        teacher_id=current_user.id,
        file_name=file.filename,
        file_path=str(destination),
        content_type=file.content_type or "application/octet-stream",
    )
    db.add(material)
    db.commit()
    db.refresh(material)

    # Keep retrieval fresh: replace old course vectors with the latest upload.
    delete_course_vectors(course.id)
    chunk_count = ingest_material(material.id, course.id, str(destination))
    return UploadMaterialResponse(
        success=True,
        message=f"File had successfully uploaded in the {course.course_code}",
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

    text = extract_text(material.file_path)
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
