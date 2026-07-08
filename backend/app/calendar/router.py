from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.common.deps import require_role
from app.database.models import Course, CourseEnrollment, Event, User
from app.database.session import get_db


router = APIRouter()


class CreateEventRequest(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = ""
    course_id: int
    type: str = Field(pattern=r"^(assignment|quiz|announcement)$")
    due_date: date
    due_time: time | None = None


def _accessible_course_ids(current_user: User, db: Session) -> list[int]:
    if current_user.role == "teacher":
        return [row.id for row in db.query(Course.id).filter(Course.teacher_id == current_user.id, Course.is_archived.is_(False)).all()]

    return [
        row.course_id
        for row in db.query(CourseEnrollment.course_id)
        .filter(CourseEnrollment.student_id == current_user.id, CourseEnrollment.is_archived.is_(False))
        .all()
    ]


@router.get("/events")
def list_calendar_events(
    start_date: date,
    end_date: date,
    course_id: int | None = None,
    current_user: User = Depends(require_role("student", "teacher")),
    db: Session = Depends(get_db),
) -> dict:
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date must be before or equal to end_date")

    allowed_ids = _accessible_course_ids(current_user, db)
    if not allowed_ids:
        return {"success": True, "message": "Calendar events fetched", "data": []}

    if course_id is not None:
        if course_id not in allowed_ids:
            raise HTTPException(status_code=403, detail="You do not have access to this course")
        allowed_ids = [course_id]

    rows = (
        db.query(Event, Course.course_code, Course.title)
        .join(Course, Course.id == Event.course_id)
        .filter(Event.course_id.in_(allowed_ids), Event.due_date >= start_date, Event.due_date <= end_date)
        .order_by(Event.due_date.asc(), Event.due_time.asc().nulls_last(), Event.created_at.asc())
        .all()
    )

    from app.database.models import Classwork, Submission

    classwork_map = {}
    submission_map = {}
    if current_user.role == "student" and rows:
        classworks = db.query(Classwork).filter(
            Classwork.course_id.in_(allowed_ids),
            Classwork.due_date >= start_date,
            Classwork.due_date <= end_date
        ).all()
        for cw in classworks:
            classwork_map[(cw.course_id, cw.title, cw.due_date)] = cw
        
        if classworks:
            cw_ids = [cw.id for cw in classworks]
            submissions = db.query(Submission).filter(
                Submission.student_id == current_user.id,
                Submission.classwork_id.in_(cw_ids)
            ).all()
            for sub in submissions:
                submission_map[sub.classwork_id] = sub

    data = []
    for event, course_code, course_title in rows:
        event_dict = {
            "id": event.id,
            "title": event.title,
            "description": event.description,
            "course_id": event.course_id,
            "course_code": course_code,
            "course_title": course_title,
            "type": event.type,
            "due_date": event.due_date.isoformat(),
            "due_time": event.due_time.isoformat() if event.due_time else None,
            "created_at": event.created_at.isoformat(),
        }

        if current_user.role == "student":
            cw = classwork_map.get((event.course_id, event.title, event.due_date))
            if cw:
                sub = submission_map.get(cw.id)
                if sub:
                    event_dict["status"] = "late" if sub.status == "late" else "turned_in"
                elif event.due_date < date.today():
                    event_dict["status"] = "missing"
                else:
                    event_dict["status"] = "assigned"
            else:
                event_dict["status"] = None
        
        data.append(event_dict)

    return {
        "success": True,
        "message": "Calendar events fetched",
        "data": data,
    }


@router.post("/events")
def create_calendar_event(
    payload: CreateEventRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    course = (
        db.query(Course)
        .filter(Course.id == payload.course_id, Course.teacher_id == current_user.id)
        .first()
    )
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    event = Event(
        title=payload.title.strip(),
        description=payload.description.strip(),
        course_id=payload.course_id,
        type=payload.type,
        due_date=payload.due_date,
        due_time=payload.due_time,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    return {
        "success": True,
        "message": "Calendar event created",
        "data": {
            "id": event.id,
            "title": event.title,
            "description": event.description,
            "course_id": event.course_id,
            "course_code": course.course_code,
            "course_title": course.title,
            "type": event.type,
            "due_date": event.due_date.isoformat(),
            "due_time": event.due_time.isoformat() if event.due_time else None,
            "created_at": event.created_at.isoformat(),
        },
    }
