from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.common.deps import get_current_user
from app.database.models import Course, CourseEnrollment, User
from app.database.session import get_db


router = APIRouter()


class AddUserRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    role: str = Field(pattern=r"^(teacher|student)$")


def _membership_row(course_id: int, user_id: int, db: Session) -> CourseEnrollment | None:
    return (
        db.query(CourseEnrollment)
        .filter(
            CourseEnrollment.course_id == course_id,
            or_(CourseEnrollment.user_id == user_id, CourseEnrollment.student_id == user_id),
        )
        .first()
    )


def _can_view_people(course_id: int, user_id: int, db: Session) -> bool:
    # A user can view people if they are enrolled in this course.
    membership = _membership_row(course_id, user_id, db)
    return bool(membership)


def _can_manage_people(course_id: int, user_id: int, db: Session) -> bool:
    # A teacher can manage people only when enrolled as a teacher in the course.
    membership = _membership_row(course_id, user_id, db)
    return bool(membership and membership.role == "teacher")


@router.get("/course/{course_id}/people")
def get_course_people(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not _can_view_people(course_id, current_user.id, db):
        raise HTTPException(status_code=403, detail="You do not have access to this course")

    rows = (
        db.query(User.id, User.name, User.email, CourseEnrollment.role)
        .join(CourseEnrollment, CourseEnrollment.user_id == User.id)
        .filter(CourseEnrollment.course_id == course_id)
        .order_by(CourseEnrollment.role.asc(), User.name.asc(), User.email.asc())
        .all()
    )

    teachers = [
        {"id": row.id, "name": row.name, "email": row.email}
        for row in rows
        if row.role == "teacher"
    ]
    students = [
        {"id": row.id, "name": row.name, "email": row.email}
        for row in rows
        if row.role == "student"
    ]

    return {
        "success": True,
        "message": "Course people fetched",
        "data": {
            "teachers": teachers,
            "students": students,
        },
    }


@router.post("/course/{course_id}/add-user")
def add_course_user(
    course_id: int,
    payload: AddUserRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not _can_manage_people(course_id, current_user.id, db):
        raise HTTPException(status_code=403, detail="Only teachers can add users")

    target = db.query(User).filter(User.email == payload.email.strip().lower()).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    existing = _membership_row(course_id, target.id, db)
    if existing:
        raise HTTPException(status_code=409, detail="User already exists in this course")

    enrollment = CourseEnrollment(
        course_id=course_id,
        user_id=target.id,
        role=payload.role,
        student_id=target.id,
        is_archived=False,
    )
    db.add(enrollment)
    db.commit()

    return {
        "success": True,
        "message": f"{payload.role.capitalize()} added",
        "data": {
            "id": target.id,
            "name": target.name,
            "email": target.email,
            "role": payload.role,
        },
    }


@router.delete("/course/{course_id}/remove-user/{user_id}")
def remove_course_user(
    course_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not _can_manage_people(course_id, current_user.id, db):
        raise HTTPException(status_code=403, detail="Only teachers can remove users")

    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Teacher cannot remove themselves")

    membership = _membership_row(course_id, user_id, db)
    if not membership:
        raise HTTPException(status_code=404, detail="User not found in this course")

    db.delete(membership)
    db.commit()

    return {
        "success": True,
        "message": "User removed",
    }
