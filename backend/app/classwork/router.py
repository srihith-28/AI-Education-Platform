import json
from datetime import date, datetime, time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.common.deps import require_role
from app.database.models import Classwork, ClassworkSection, Course, CourseEnrollment, Event, Grade, Submission, Topic, User
from app.database.session import get_db


router = APIRouter()


def _normalize_label(text: str) -> str:
    return " ".join(" ".join(text.lower().split()).split())


def _resolve_classwork_section_id(
    title: str,
    classwork_section_id: int | None,
    section_lookup: dict[int, ClassworkSection],
) -> int | None:
    title_normalized = _normalize_label(title)
    if not title_normalized:
        return classwork_section_id

    keyword_families: dict[str, tuple[str, ...]] = {
        "quiz": ("quiz", "mcq"),
        "assignment": ("assignment", "assign", "homework", "hw"),
        "mid": ("mid", "midsem", "mid sem", "midterm", "mid term", "mse"),
        "end": ("end", "endsem", "end sem", "endterm", "end term", "final", "ese"),
    }

    def _family_from_text(text: str) -> str | None:
        for family, keywords in keyword_families.items():
            if any(keyword in text for keyword in keywords):
                return family
        return None

    title_family = _family_from_text(title_normalized)
    if title_family is None:
        return classwork_section_id

    matching_sections: list[int] = []
    for section_id, section in section_lookup.items():
        section_family = _family_from_text(_normalize_label(section.name))
        if section_family == title_family:
            matching_sections.append(section_id)

    if classwork_section_id in matching_sections:
        return classwork_section_id

    if matching_sections:
        return matching_sections[0]

    return classwork_section_id


class SubmitClassworkRequest(BaseModel):
    status: str = Field(default="turned_in", pattern=r"^(turned_in|late)$")
    content: str = ""


class ClassworkAttachmentPayload(BaseModel):
    id: str
    source: str
    name: str
    url: str | None = None
    mimeType: str | None = None
    sizeBytes: int | None = None


class QuizQuestionPayload(BaseModel):
    id: str
    type: str
    question: str
    options: list[str] = Field(default_factory=list)
    correctAnswer: str = ""


class CreateClassworkRequest(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = ""
    type: str = Field(pattern=r"^(assignment|quiz|question|material)$")
    points: int = 100
    dueDate: str | None = None
    dueTime: str | None = None
    topic: str = "No topic"
    classwork_section_id: int | None = None
    attachments: list[ClassworkAttachmentPayload] = Field(default_factory=list)
    quizQuestions: list[QuizQuestionPayload] = Field(default_factory=list)
    action: str = Field(default="assign", pattern=r"^(assign|schedule|draft)$")
    scheduledFor: str | None = None


class CreateClassworkSectionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    percentage: float = Field(ge=0, le=100)


class UpdateClassworkPointsRequest(BaseModel):
    points: float = Field(gt=0)


def _student_has_course_access(course_id: int, student_id: int, db: Session) -> bool:
    enrollment = (
        db.query(CourseEnrollment.id)
        .filter(
            CourseEnrollment.course_id == course_id,
            CourseEnrollment.student_id == student_id,
            CourseEnrollment.is_archived.is_(False),
        )
        .first()
    )
    return bool(enrollment)


def _is_teacher_of_course(course_id: int, teacher_id: int, db: Session) -> bool:
    row = db.query(Course.id).filter(Course.id == course_id, Course.teacher_id == teacher_id).first()
    return bool(row)


def _resolve_submission_status(item: Classwork, submission: Submission | None) -> str:
    if submission:
        if submission.status == "late":
            return "late"
        return "turned_in"

    if item.due_date and item.due_date < date.today():
        return "missing"
    return "assigned"


def _serialize_classwork_row(
    item: Classwork,
    topic: Topic | None,
    submission: Submission | None = None,
    role: str = "student",
    resolved_classwork_section_id: int | None = None,
) -> dict:
    try:
        attachments = json.loads(item.attachments_json or "[]")
    except json.JSONDecodeError:
        attachments = []

    try:
        quiz_questions = json.loads(item.quiz_questions_json or "[]")
    except json.JSONDecodeError:
        quiz_questions = []

    return {
        "id": item.id,
        "course_id": item.course_id,
        "topic_id": item.topic_id,
        "classwork_section_id": resolved_classwork_section_id if resolved_classwork_section_id is not None else item.classwork_section_id,
        "topic": {"id": topic.id, "title": topic.title, "order_index": topic.order_index} if topic else None,
        "type": item.type,
        "title": item.title,
        "description": item.description,
        "points": item.points,
        "due_date": item.due_date.isoformat() if item.due_date else None,
        "scheduled_for": item.scheduled_for.isoformat() if item.scheduled_for else None,
        "status": _resolve_submission_status(item, submission) if role == "student" else item.status,
        "publish_status": item.status,
        "attachments": attachments,
        "quiz_questions": quiz_questions,
        "created_at": item.created_at.isoformat(),
        "submission_status": _resolve_submission_status(item, submission),
        "submitted_at": submission.submitted_at.isoformat() if submission and submission.submitted_at else None,
    }


def _legacy_classwork_seed_path() -> Path:
    return Path(__file__).resolve().parents[3] / "frontend" / ".data" / "classwork-assignments.json"


def _parse_date_value(value: str | None) -> date | None:
    if not value:
        return None

    try:
        if "T" in value:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        return date.fromisoformat(value)
    except ValueError:
        return None


def _parse_datetime_value(value: str | None) -> datetime | None:
    if not value:
        return None

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _normalize_answer_text(value: str) -> str:
    return " ".join((value or "").strip().lower().split())


def _extract_quiz_answers(content: str) -> dict[str, str]:
    trimmed = (content or "").strip()
    if not trimmed.startswith("QUIZ_RESPONSES_JSON:"):
        return {}

    payload_text = trimmed[len("QUIZ_RESPONSES_JSON:") :].split("\n\n", 1)[0].strip()
    if not payload_text:
        return {}

    try:
        payload = json.loads(payload_text)
    except json.JSONDecodeError:
        return {}

    answers = payload.get("answers") if isinstance(payload, dict) else None
    if not isinstance(answers, dict):
        return {}

    return {str(key): str(value) for key, value in answers.items()}


def _grade_quiz_from_professor_answer_key(item: Classwork, submission_content: str) -> tuple[float, str]:
    try:
        questions = json.loads(item.quiz_questions_json or "[]")
    except json.JSONDecodeError:
        questions = []

    if not isinstance(questions, list) or not questions:
        return 0.0, "Quiz questions are missing."

    keyed_questions: list[dict] = []
    for index, question in enumerate(questions, start=1):
        if not isinstance(question, dict):
            continue

        question_text = str(question.get("question", "")).strip()
        question_type = str(question.get("type", "")).strip().lower()
        correct_answer = str(question.get("correctAnswer", "")).strip()
        options = question.get("options", [])

        if not question_text or not correct_answer:
            continue
        if question_type not in {"mcq", "short"}:
            continue
        if question_type == "mcq":
            if not isinstance(options, list):
                continue
            non_empty_options = [str(option).strip() for option in options if str(option).strip()]
            if len(non_empty_options) < 2:
                continue

        keyed_questions.append(
            {
                "id": str(question.get("id", "")).strip() or f"q-{index}",
                "question": question_text,
                "correct": correct_answer,
            }
        )

    if not keyed_questions:
        return 0.0, "No professor answer keys configured for this quiz."

    answers = _extract_quiz_answers(submission_content)
    max_marks = float(item.points or 100)
    marks_per_question = max_marks / len(keyed_questions)
    earned = 0.0
    correct_count = 0
    wrong_details: list[str] = []

    for index, question in enumerate(keyed_questions, start=1):
        expected = _normalize_answer_text(question["correct"])
        student_raw = answers.get(question["id"], "")
        student = _normalize_answer_text(student_raw)

        if student and student == expected:
            earned += marks_per_question
            correct_count += 1
        else:
            wrong_details.append(
                f"Q{index}: expected '{question['correct']}' got '{student_raw or '(blank)'}'"
            )

    marks = round(max(0.0, min(max_marks, earned)), 2)
    feedback = (
        f"Auto-graded using professor answer key. Correct: {correct_count}/{len(keyed_questions)}. "
        f"Marks per question: {round(marks_per_question, 2)}."
    )
    if wrong_details:
        feedback = f"{feedback} Incorrect: {' ; '.join(wrong_details)}"

    return marks, feedback


def _seed_legacy_classwork_if_needed(course_id: int, db: Session) -> None:
    existing = db.query(Classwork.id).filter(Classwork.course_id == course_id).first()
    if existing:
        return

    seed_path = _legacy_classwork_seed_path()
    if not seed_path.exists():
        return

    try:
        payload = json.loads(seed_path.read_text(encoding="utf-8"))
    except Exception:
        return

    records = payload.get("assignments") if isinstance(payload, dict) else None
    if not isinstance(records, list) or not records:
        return

    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        return

    topic_map: dict[str, Topic] = {}
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            continue
        topic_title = str(record.get("topic") or "No topic").strip() or "No topic"
        topic = topic_map.get(topic_title)
        if not topic:
            topic = db.query(Topic).filter(Topic.course_id == course_id, Topic.title == topic_title).first()
            if not topic:
                topic = Topic(course_id=course_id, title=topic_title, order_index=index)
                db.add(topic)
                db.flush()
            topic_map[topic_title] = topic

        classwork = Classwork(
            course_id=course_id,
            topic_id=topic.id,
            type=str(record.get("type") or "assignment"),
            title=str(record.get("title") or "Untitled"),
            description=str(record.get("description") or ""),
            points=int(record.get("points") or 100),
            due_date=_parse_date_value(str(record.get("dueDate")) if record.get("dueDate") else None),
            scheduled_for=_parse_datetime_value(str(record.get("scheduledFor")) if record.get("scheduledFor") else None),
            status=str(record.get("status") or "published"),
            attachments_json=json.dumps(record.get("attachments") or []),
            quiz_questions_json=json.dumps(record.get("quizQuestions") or []),
        )
        db.add(classwork)

        if classwork.due_date:
            db.add(
                Event(
                    title=classwork.title,
                    description=classwork.description,
                    course_id=course_id,
                    type="assignment" if classwork.type != "quiz" else "quiz",
                    due_date=classwork.due_date,
                    due_time=None,
                )
            )

    db.commit()


@router.get("/topics/{course_id}")
def list_topics(
    course_id: int,
    current_user: User = Depends(require_role("student", "teacher")),
    db: Session = Depends(get_db),
) -> dict:
    if current_user.role == "student":
        if not _student_has_course_access(course_id, current_user.id, db):
            raise HTTPException(status_code=403, detail="You do not have access to this course")
    else:
        if not _is_teacher_of_course(course_id, current_user.id, db):
            raise HTTPException(status_code=403, detail="You do not have access to this course")

    rows = (
        db.query(Topic)
        .filter(Topic.course_id == course_id)
        .order_by(Topic.order_index.asc(), Topic.created_at.asc())
        .all()
    )

    return {
        "success": True,
        "message": "Topics fetched",
        "data": [
            {
                "id": row.id,
                "course_id": row.course_id,
                "title": row.title,
                "order_index": row.order_index,
            }
            for row in rows
        ],
    }


@router.get("/submissions/{student_id}")
def list_submissions(
    student_id: int,
    course_id: int | None = None,
    current_user: User = Depends(require_role("student", "teacher")),
    db: Session = Depends(get_db),
) -> dict:
    if current_user.role == "student" and current_user.id != student_id:
        raise HTTPException(status_code=403, detail="You can only view your own submissions")

    query = db.query(Submission, Classwork).join(Classwork, Classwork.id == Submission.classwork_id)
    query = query.filter(Submission.student_id == student_id)

    if course_id is not None:
        query = query.filter(Classwork.course_id == course_id)

    rows = query.order_by(Submission.created_at.desc()).all()

    return {
        "success": True,
        "message": "Submissions fetched",
        "data": [
            {
                "id": submission.id,
                "classwork_id": submission.classwork_id,
                "course_id": classwork.course_id,
                "status": submission.status,
                "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
            }
            for submission, classwork in rows
        ],
    }


@router.get("/{course_id}")
def get_course_classwork(
    course_id: int,
    topic_id: int | None = None,
    current_user: User = Depends(require_role("student", "teacher")),
    db: Session = Depends(get_db),
) -> dict:
    if current_user.role == "student":
        if not _student_has_course_access(course_id, current_user.id, db):
            raise HTTPException(status_code=403, detail="You do not have access to this course")
    else:
        if not _is_teacher_of_course(course_id, current_user.id, db):
            raise HTTPException(status_code=403, detail="You do not have access to this course")

    _seed_legacy_classwork_if_needed(course_id, db)

    topic_rows = (
        db.query(Topic)
        .filter(Topic.course_id == course_id)
        .order_by(Topic.order_index.asc(), Topic.created_at.asc())
        .all()
    )
    topic_map = {topic.id: topic for topic in topic_rows}
    section_rows = (
        db.query(ClassworkSection)
        .filter(ClassworkSection.course_id == course_id)
        .order_by(ClassworkSection.created_at.asc())
        .all()
    )
    section_lookup = {section.id: section for section in section_rows}

    query = db.query(Classwork).filter(Classwork.course_id == course_id)
    if topic_id is not None:
        query = query.filter(Classwork.topic_id == topic_id)
    items = query.order_by(Classwork.created_at.desc()).all()

    submission_map: dict[str, Submission] = {}
    if current_user.role == "student" and items:
        classwork_ids = [item.id for item in items]
        submissions = (
            db.query(Submission)
            .filter(Submission.student_id == current_user.id, Submission.classwork_id.in_(classwork_ids))
            .all()
        )
        submission_map = {submission.classwork_id: submission for submission in submissions}

    if current_user.role == "teacher" and items:
        submission_map = {}

    grouped: dict[str, dict] = {}
    for item in items:
        topic = topic_map.get(item.topic_id) if item.topic_id else None
        key = str(topic.id) if topic else "no-topic"
        if key not in grouped:
            grouped[key] = {
                "topic": {
                    "id": topic.id,
                    "title": topic.title,
                    "order_index": topic.order_index,
                } if topic else None,
                "items": [],
            }

        submission = submission_map.get(item.id)
        resolved_section_id = _resolve_classwork_section_id(item.title, item.classwork_section_id, section_lookup)
        grouped[key]["items"].append(
            _serialize_classwork_row(
                item,
                topic,
                submission if current_user.role == "student" else None,
                current_user.role,
                resolved_section_id,
            )
        )

    grouped_rows = list(grouped.values())
    grouped_rows.sort(
        key=lambda row: (
            row["topic"]["order_index"] if row["topic"] else 10_000,
            row["topic"]["title"].lower() if row["topic"] else "zzzz",
        )
    )

    return {
        "success": True,
        "message": "Classwork fetched",
        "data": grouped_rows,
    }


@router.post("/{course_id}")
def create_course_classwork(
    course_id: int,
    payload: CreateClassworkRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    course = db.query(Course).filter(Course.id == course_id, Course.teacher_id == current_user.id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    topic_title = payload.topic.strip() or "No topic"
    topic = db.query(Topic).filter(Topic.course_id == course_id, Topic.title == topic_title).first()
    if not topic:
        topic = Topic(course_id=course_id, title=topic_title, order_index=db.query(Topic.id).filter(Topic.course_id == course_id).count())
        db.add(topic)
        db.flush()

    due_date = _parse_date_value(payload.dueDate)
    due_time = None
    if payload.dueTime:
        try:
            due_time = time.fromisoformat(payload.dueTime)
        except ValueError:
            due_time = None

    status = "published"
    scheduled_for = _parse_datetime_value(payload.scheduledFor)
    if payload.action == "draft":
        status = "draft"
        scheduled_for = None
    elif payload.action == "schedule":
        status = "scheduled"

    if payload.action == "schedule" and not scheduled_for:
        raise HTTPException(status_code=400, detail="Scheduled date and time are required")

    classwork = Classwork(
        course_id=course_id,
        topic_id=topic.id,
        classwork_section_id=payload.classwork_section_id,
        type=payload.type,
        title=payload.title.strip(),
        description=payload.description.strip(),
        points=payload.points,
        due_date=due_date,
        scheduled_for=scheduled_for,
        status=status,
        attachments_json=json.dumps([attachment.model_dump() for attachment in payload.attachments]),
        quiz_questions_json=json.dumps([question.model_dump() for question in payload.quizQuestions]),
    )
    db.add(classwork)
    db.flush()

    if due_date:
        db.add(
            Event(
                title=classwork.title,
                description=classwork.description,
                course_id=course_id,
                type="quiz" if classwork.type == "quiz" else "assignment",
                due_date=due_date,
                due_time=due_time,
            )
        )

    db.commit()
    db.refresh(classwork)
    db.refresh(topic)

    return {
        "success": True,
        "message": "Classwork created",
        "data": _serialize_classwork_row(classwork, topic, None, "teacher"),
    }


@router.put("/{classwork_id}/points")
def update_classwork_points(
    classwork_id: str,
    payload: UpdateClassworkPointsRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    item = db.query(Classwork).filter(Classwork.id == classwork_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Classwork item not found")

    if not _is_teacher_of_course(item.course_id, current_user.id, db):
        raise HTTPException(status_code=403, detail="You do not have access to this classwork")

    item.points = int(payload.points)
    db.add(item)
    db.commit()
    db.refresh(item)

    topic = db.query(Topic).filter(Topic.id == item.topic_id).first() if item.topic_id else None
    return {
        "success": True,
        "message": "Classwork points updated",
        "data": _serialize_classwork_row(item, topic, None, "teacher"),
    }


@router.get("/item/{classwork_id}")
def get_classwork_item(
    classwork_id: str,
    current_user: User = Depends(require_role("student", "teacher")),
    db: Session = Depends(get_db),
) -> dict:
    item = db.query(Classwork).filter(Classwork.id == classwork_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Classwork item not found")

    if current_user.role == "student":
        if not _student_has_course_access(item.course_id, current_user.id, db):
            raise HTTPException(status_code=403, detail="You do not have access to this classwork")
    else:
        if not _is_teacher_of_course(item.course_id, current_user.id, db):
            raise HTTPException(status_code=403, detail="You do not have access to this classwork")

    topic = db.query(Topic).filter(Topic.id == item.topic_id).first() if item.topic_id else None
    submission = (
        db.query(Submission)
        .filter(Submission.classwork_id == item.id, Submission.student_id == current_user.id)
        .first()
        if current_user.role == "student"
        else None
    )

    try:
        attachments = json.loads(item.attachments_json or "[]")
    except json.JSONDecodeError:
        attachments = []

    try:
        quiz_questions = json.loads(item.quiz_questions_json or "[]")
    except json.JSONDecodeError:
        quiz_questions = []

    return {
        "success": True,
        "message": "Classwork item fetched",
        "data": {
            "id": item.id,
            "course_id": item.course_id,
            "topic": {"id": topic.id, "title": topic.title} if topic else None,
            "type": item.type,
            "title": item.title,
            "description": item.description,
            "points": item.points,
            "due_date": item.due_date.isoformat() if item.due_date else None,
            "created_at": item.created_at.isoformat(),
            "status": _resolve_submission_status(item, submission) if current_user.role == "student" else item.status,
            "publish_status": item.status,
            "attachments": attachments,
            "quiz_questions": quiz_questions,
            "submitted_at": submission.submitted_at.isoformat() if submission and submission.submitted_at else None,
            "submission_content": submission.content if submission else "",
        },
    }


@router.post("/{classwork_id}/submit")
def submit_classwork_item(
    classwork_id: str,
    payload: SubmitClassworkRequest,
    current_user: User = Depends(require_role("student")),
    db: Session = Depends(get_db),
) -> dict:
    item = db.query(Classwork).filter(Classwork.id == classwork_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Classwork item not found")

    if not _student_has_course_access(item.course_id, current_user.id, db):
        raise HTTPException(status_code=403, detail="You do not have access to this classwork")

    submission = (
        db.query(Submission)
        .filter(Submission.classwork_id == classwork_id, Submission.student_id == current_user.id)
        .first()
    )

    now = datetime.utcnow()
    computed_status = payload.status
    if item.due_date and now.date() > item.due_date:
        computed_status = "late"

    if not submission:
        submission = Submission(
            classwork_id=classwork_id,
            student_id=current_user.id,
            # Keep full turned-in payload exactly as sent so downstream graders can parse all fields.
            content=payload.content or "",
            status=computed_status,
            submitted_at=now,
        )
        db.add(submission)
    else:
        submission.content = payload.content or ""
        submission.status = computed_status
        submission.submitted_at = now

    if item.type == "quiz":
        marks, feedback = _grade_quiz_from_professor_answer_key(item, submission.content or "")
        max_marks = float(item.points or 100)
        percentage = round((marks / max_marks) * 100.0, 2) if max_marks > 0 else 0.0

        submission.ai_marks = marks
        submission.ai_feedback = feedback
        submission.final_marks = marks
        submission.graded_by = "ai"
        submission.graded_at = now

        grade = (
            db.query(Grade)
            .filter(Grade.student_id == current_user.id, Grade.assignment_id == classwork_id)
            .first()
        )
        if grade:
            grade.marks = marks
            grade.earned_marks = marks
            grade.max_marks = max_marks
            grade.percentage = percentage
            db.add(grade)
        else:
            db.add(
                Grade(
                    student_id=current_user.id,
                    assignment_id=classwork_id,
                    marks=marks,
                    earned_marks=marks,
                    max_marks=max_marks,
                    percentage=percentage,
                )
            )

    db.commit()
    db.refresh(submission)

    return {
        "success": True,
        "message": "Submission updated",
        "data": {
            "id": submission.id,
            "classwork_id": submission.classwork_id,
            "student_id": submission.student_id,
            "status": submission.status,
            "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        },
    }


@router.delete("/{classwork_id}")
def delete_classwork_item(
    classwork_id: str,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    item = db.query(Classwork).filter(Classwork.id == classwork_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Classwork item not found")

    if not _is_teacher_of_course(item.course_id, current_user.id, db):
        raise HTTPException(status_code=403, detail="You do not have access to this classwork")

    db.query(Submission).filter(Submission.classwork_id == classwork_id).delete(synchronize_session=False)
    db.query(Event).filter(Event.course_id == item.course_id, Event.type == "classwork", Event.title == item.title).delete(synchronize_session=False)
    db.delete(item)
    db.commit()

    return {
        "success": True,
        "message": "Classwork item deleted",
    }


@router.get("/sections/{course_id}")
def get_course_classwork_sections(
    course_id: int,
    current_user: User = Depends(require_role("student", "teacher")),
    db: Session = Depends(get_db),
) -> dict:
    if current_user.role == "student":
        if not _student_has_course_access(course_id, current_user.id, db):
            raise HTTPException(status_code=403, detail="You do not have access to this course")
    else:
        if not _is_teacher_of_course(course_id, current_user.id, db):
            raise HTTPException(status_code=403, detail="You do not have access to this course")

    sections = (
        db.query(ClassworkSection)
        .filter(ClassworkSection.course_id == course_id)
        .order_by(ClassworkSection.created_at.asc())
        .all()
    )

    return {
        "success": True,
        "message": "Classwork sections fetched",
        "data": [
            {
                "id": section.id,
                "course_id": section.course_id,
                "name": section.name,
                "percentage": section.percentage,
                "created_at": section.created_at.isoformat(),
                "updated_at": section.updated_at.isoformat(),
            }
            for section in sections
        ],
    }


@router.post("/sections/{course_id}")
def create_classwork_section(
    course_id: int,
    payload: CreateClassworkSectionRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    course = db.query(Course).filter(Course.id == course_id, Course.teacher_id == current_user.id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    section = ClassworkSection(
        course_id=course_id,
        name=payload.name.strip(),
        percentage=payload.percentage,
    )
    db.add(section)
    db.commit()
    db.refresh(section)

    return {
        "success": True,
        "message": "Classwork section created",
        "data": {
            "id": section.id,
            "course_id": section.course_id,
            "name": section.name,
            "percentage": section.percentage,
            "created_at": section.created_at.isoformat(),
            "updated_at": section.updated_at.isoformat(),
        },
    }


@router.put("/sections/{section_id}")
def update_classwork_section(
    section_id: int,
    payload: CreateClassworkSectionRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    section = db.query(ClassworkSection).filter(ClassworkSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    course = db.query(Course).filter(Course.id == section.course_id, Course.teacher_id == current_user.id).first()
    if not course:
        raise HTTPException(status_code=403, detail="You do not have access to this section")

    section.name = payload.name.strip()
    section.percentage = payload.percentage
    section.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(section)

    return {
        "success": True,
        "message": "Classwork section updated",
        "data": {
            "id": section.id,
            "course_id": section.course_id,
            "name": section.name,
            "percentage": section.percentage,
            "created_at": section.created_at.isoformat(),
            "updated_at": section.updated_at.isoformat(),
        },
    }


@router.delete("/sections/{section_id}")
def delete_classwork_section(
    section_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    section = db.query(ClassworkSection).filter(ClassworkSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    course = db.query(Course).filter(Course.id == section.course_id, Course.teacher_id == current_user.id).first()
    if not course:
        raise HTTPException(status_code=403, detail="You do not have access to this section")

    db.delete(section)
    db.commit()

    return {
        "success": True,
        "message": "Classwork section deleted",
    }
