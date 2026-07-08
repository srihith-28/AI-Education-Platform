import json
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.common.config import settings
from app.common.deps import get_current_user, require_role
from app.database.models import Classwork, ClassworkSection, Course, CourseEnrollment, Grade, ManualSectionGrade, Submission, User
from app.database.session import get_db


router = APIRouter()


class UpdateGradeRequest(BaseModel):
    student_id: int
    assignment_id: str = Field(min_length=1)
    earned_marks: float | None = Field(default=None, ge=0)
    max_marks: float | None = Field(default=None, gt=0)
    marks: float | None = Field(default=None, ge=0)


class AutoGradeRequest(BaseModel):
    override_teacher_edited: bool = False


class UpdateSectionMaxRequest(BaseModel):
    section_id: int
    max_points: float = Field(ge=0)


def _teacher_can_manage_course_grades(course_id: int, user_id: int, db: Session) -> bool:
    owns_course = (
        db.query(Course.id)
        .filter(Course.id == course_id, Course.teacher_id == user_id)
        .first()
    )
    if owns_course:
        return True

    teacher_membership = (
        db.query(CourseEnrollment.id)
        .filter(
            CourseEnrollment.course_id == course_id,
            CourseEnrollment.role == "teacher",
            or_(CourseEnrollment.user_id == user_id, CourseEnrollment.student_id == user_id),
        )
        .first()
    )
    return bool(teacher_membership)


def _student_can_view_course(course_id: int, user_id: int, db: Session) -> bool:
    enrollment = (
        db.query(CourseEnrollment.id)
        .filter(
            CourseEnrollment.course_id == course_id,
            CourseEnrollment.role == "student",
            or_(CourseEnrollment.user_id == user_id, CourseEnrollment.student_id == user_id),
            CourseEnrollment.is_archived.is_(False),
        )
        .first()
    )
    return bool(enrollment)


def _llm() -> ChatGoogleGenerativeAI:
    # Use quality model for grading consistency.
    return ChatGoogleGenerativeAI(
        model=settings.gemini_quality_model,
        google_api_key=settings.gemini_api_key,
        temperature=0.1,
        max_tokens=2048,
    )


def _parse_json_grade(raw: str, max_marks: float) -> tuple[float, str]:
    # Try strict JSON first.
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Fallback to the first JSON object in noisy model output.
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            return 0.0, "Could not parse model output. Review manually."
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            return 0.0, "Could not parse model output. Review manually."

    marks = parsed.get("marks", 0)
    feedback = str(parsed.get("feedback", "No feedback generated.")).strip() or "No feedback generated."

    try:
        marks_value = float(marks)
    except (TypeError, ValueError):
        marks_value = 0.0

    safe_marks = max(0.0, min(float(max_marks), marks_value))
    return safe_marks, feedback


def _normalize_submission_status(status: str) -> str:
    if status in {"submitted", "turn_in", "turned_in"}:
        return "submitted"
    if status == "late":
        return "late"
    if status == "missing":
        return "missing"
    return status


def _extract_turned_in_data(content: str) -> dict:
    raw = (content or "")
    trimmed = raw.strip()
    quiz_payload: dict | None = None

    if trimmed.startswith("QUIZ_RESPONSES_JSON:"):
        payload_text = trimmed[len("QUIZ_RESPONSES_JSON:") :].split("\n\n", 1)[0].strip()
        if payload_text:
            try:
                parsed = json.loads(payload_text)
                if isinstance(parsed, dict):
                    quiz_payload = parsed
            except json.JSONDecodeError:
                quiz_payload = None

    attachment_lines: list[str] = []
    in_attachments = False
    for line in raw.splitlines():
        text = line.strip()
        if text == "Attachments:":
            in_attachments = True
            continue
        if in_attachments and text.startswith("- "):
            attachment_lines.append(text[2:].strip())
            continue
        if in_attachments and text and not text.startswith("- "):
            in_attachments = False

    return {
        "raw": raw,
        "trimmed": trimmed,
        "quiz_payload": quiz_payload,
        "attachment_lines": attachment_lines,
    }


def _build_grading_context(assignment: Classwork, submission_content: str) -> str:
    parsed_submission = _extract_turned_in_data(submission_content)

    context_lines = [
        f"Assignment Type: {assignment.type}",
        f"Title: {assignment.title}",
        "Question / Prompt:",
        assignment.description or "(no description)",
        "",
        "Turned-in data (raw):",
        parsed_submission["raw"] or "(empty)",
    ]

    quiz_payload = parsed_submission["quiz_payload"]
    if quiz_payload:
        context_lines.extend(
            [
                "",
                "Turned-in data (parsed quiz payload):",
                json.dumps(quiz_payload, ensure_ascii=True),
            ]
        )

    attachment_lines = parsed_submission["attachment_lines"]
    if attachment_lines:
        context_lines.extend(["", "Turned-in attachments detected:"])
        context_lines.extend([f"- {line}" for line in attachment_lines])

    if assignment.type == "quiz":
        try:
            quiz_questions = json.loads(assignment.quiz_questions_json or "[]")
        except json.JSONDecodeError:
            quiz_questions = []

        if isinstance(quiz_questions, list) and quiz_questions:
            context_lines.extend(["", "Quiz answer key / rubric:"])
            for index, question in enumerate(quiz_questions, start=1):
                if not isinstance(question, dict):
                    continue
                q_text = str(question.get("question", "")).strip() or "(no question text)"
                q_type = str(question.get("type", "")).strip() or "unknown"
                correct = str(question.get("correctAnswer", "")).strip() or "(no correct answer provided)"
                options = question.get("options", [])
                context_lines.append(f"Q{index} ({q_type}): {q_text}")
                if isinstance(options, list) and options:
                    context_lines.append(f"Options: {', '.join(str(opt) for opt in options)}")
                context_lines.append(f"Expected answer: {correct}")

    return "\n".join(context_lines)


def _normalize_answer_text(value: str) -> str:
    return " ".join((value or "").strip().lower().split())


def _grade_question_with_llm(question: dict, student_answer: str, marks_per_question: float, llm: ChatGoogleGenerativeAI) -> tuple[float, str]:
    prompt = (
        "You are grading one quiz question."
        " Decide whether the student's answer should earn full marks for this question or zero marks."
        " Use the provided expected answer and question text only."
        " Return ONLY valid JSON in this exact format: {\"marks\": number, \"feedback\": \"short explanation\" }.\n\n"
        f"Question: {question.get('question', '')}\n"
        f"Question Type: {question.get('type', '')}\n"
        f"Expected Answer: {question.get('correctAnswer', '')}\n"
        f"Student Answer: {student_answer or '(blank)'}\n"
        f"Max Marks For This Question: {marks_per_question}\n"
    )

    result = llm.invoke(prompt)
    raw = result.content if hasattr(result, "content") else str(result)
    marks, feedback = _parse_json_grade(raw, marks_per_question)
    return round(marks, 2), feedback


def _get_manual_section_grade_map(course_id: int, student_ids: list[int], db: Session) -> dict[tuple[int, int], float]:
    if not student_ids:
        return {}

    rows = (
        db.query(ManualSectionGrade.student_id, ManualSectionGrade.section_id, ManualSectionGrade.marks)
        .filter(
            ManualSectionGrade.course_id == course_id,
            ManualSectionGrade.student_id.in_(student_ids),
        )
        .all()
    )
    return {(row.student_id, row.section_id): float(row.marks) for row in rows}


def _grade_percentage(earned_marks: float, max_marks: float) -> float:
    if max_marks <= 0:
        return 0.0
    return round((earned_marks / max_marks) * 100.0, 2)


def _normalize_label(text: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).split())


def _resolve_section_id_for_assignment(
    title: str,
    classwork_section_id: int | None,
    section_lookup: dict[int, dict],
) -> int | None:
    title_normalized = _normalize_label(title)
    if not title_normalized:
        return classwork_section_id

    # Canonical keyword families to map historical mis-assigned items back to the intended component.
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

    section_family_map: dict[int, str | None] = {}
    for section_id, section_payload in section_lookup.items():
        section_name = _normalize_label(str(section_payload.get("name", "")))
        section_family_map[section_id] = _family_from_text(section_name)

    title_family = _family_from_text(title_normalized)
    if title_family is not None:
        family_matches = [
            section_id
            for section_id, family in section_family_map.items()
            if family == title_family
        ]
        if classwork_section_id in family_matches:
            return classwork_section_id
        if family_matches:
            return family_matches[0]

    # If stored section is valid and we cannot strongly infer otherwise, keep it.
    if classwork_section_id in section_lookup:
        return classwork_section_id

    matches: list[int] = []
    for section_id, section_payload in section_lookup.items():
        section_name = _normalize_label(str(section_payload.get("name", "")))
        if len(section_name) < 3:
            continue
        if section_name in title_normalized:
            matches.append(section_id)

    if not matches:
        return classwork_section_id

    if classwork_section_id in matches:
        return classwork_section_id

    return matches[0]


def _section_has_assigned_tasks(section_id: int, db: Session) -> bool:
    return (
        db.query(Classwork.id)
        .filter(
            Classwork.classwork_section_id == section_id,
            Classwork.type.in_(["assignment", "quiz", "question"]),
            Classwork.status != "draft",
        )
        .first()
        is not None
    )


def _score_section(section_percentage: float, section_max_marks: float, earned_marks: float, manual_grade: float | None) -> tuple[float, float, float]:
    if manual_grade is not None:
        marks = max(0.0, min(100.0, float(manual_grade)))
        percent = marks
        weighted = (percent * section_percentage) / 100.0
        return marks, 100.0, weighted

    if section_max_marks <= 0:
        return 0.0, 0.0, 0.0

    percent = (earned_marks / section_max_marks) * 100.0
    weighted = (percent * section_percentage) / 100.0
    return earned_marks, section_max_marks, weighted


def _grade_quiz_submission(assignment: Classwork, submission: Submission) -> tuple[float, str]:
    try:
        questions = json.loads(assignment.quiz_questions_json or "[]")
    except json.JSONDecodeError:
        questions = []

    if not isinstance(questions, list) or not questions:
        return 0.0, "Quiz questions are missing."

    valid_questions: list[dict] = []
    for index, question in enumerate(questions, start=1):
        if not isinstance(question, dict):
            continue

        question_text = str(question.get("question", "")).strip()
        question_type = str(question.get("type", "")).strip().lower()
        correct_answer = str(question.get("correctAnswer", "")).strip()
        options = question.get("options", [])

        if not question_text:
            continue

        if question_type == "mcq":
            if not isinstance(options, list):
                continue
            non_empty_options = [str(option).strip() for option in options if str(option).strip()]
            if len(non_empty_options) < 2:
                continue
            valid_questions.append(
                {
                    "id": str(question.get("id", "")).strip() or f"q-{index}",
                    "type": "mcq",
                    "question": question_text,
                    "options": non_empty_options,
                    "correctAnswer": correct_answer,
                }
            )
            continue

        if question_type == "short":
            if not correct_answer:
                continue
            valid_questions.append(
                {
                    "id": str(question.get("id", "")).strip() or f"q-{index}",
                    "type": "short",
                    "question": question_text,
                    "options": [],
                    "correctAnswer": correct_answer,
                }
            )

    if not valid_questions:
        return 0.0, "Quiz questions are invalid."

    parsed_submission = _extract_turned_in_data(submission.content or "")
    quiz_payload = parsed_submission.get("quiz_payload")
    answers_obj = quiz_payload.get("answers") if isinstance(quiz_payload, dict) else None
    answers = answers_obj if isinstance(answers_obj, dict) else {}

    total_questions = 0
    objective_correct_questions = 0
    completion_awarded_questions = 0
    awarded_marks = 0.0
    wrong_details: list[str] = []
    llm_feedback_notes: list[str] = []
    llm = _llm()
    marks_per_question = 100.0 / len(valid_questions)

    for index, question in enumerate(valid_questions, start=1):
        question_id = str(question.get("id", "")).strip() or f"q-{index}"
        question_text = str(question.get("question", "")).strip() or f"Question {index}"
        expected_raw = str(question.get("correctAnswer", "")).strip()

        total_questions += 1
        student_raw = str(answers.get(question_id, "")).strip()

        # If no answer was provided for a question, it always gets zero.
        if not student_raw:
            wrong_details.append(f"Q{index}: {question_text} | no answer provided")
            continue

        # Prefer deterministic scoring when the answer key is present and the question is objective.
        if question.get("type") == "mcq" and expected_raw:
            if _normalize_answer_text(student_raw) == _normalize_answer_text(expected_raw):
                objective_correct_questions += 1
                awarded_marks += marks_per_question
            else:
                wrong_details.append(
                    f"Q{index}: {question_text} | expected '{expected_raw or '(blank)'}' but got '{student_raw or '(blank)'}'"
                )
            continue

        # If the teacher did not provide an answer key, use completion-based scoring.
        # This keeps quiz grading predictable: answered_count / total_questions * 100.
        if not expected_raw:
            completion_awarded_questions += 1
            awarded_marks += marks_per_question
            continue

        # For subjective / incomplete-key questions, let the LLM judge against the expected answer.
        try:
            llm_marks, llm_feedback = _grade_question_with_llm(question, student_raw, marks_per_question, llm)
        except Exception:
            llm_marks = 0.0
            llm_feedback = "Could not evaluate this question automatically."

        awarded_marks += llm_marks
        if llm_marks < marks_per_question:
            wrong_details.append(
                f"Q{index}: {question_text} | LLM awarded {round(llm_marks, 2)}/{round(marks_per_question, 2)} for answer '{student_raw or '(blank)'}'"
            )

        if llm_feedback:
            llm_feedback_notes.append(f"Q{index}: {llm_feedback}")

    if total_questions == 0:
        return 0.0, "Quiz questions are invalid."

    # Quiz scoring rule: always distribute 100 marks equally across all questions.
    marks = round(min(100.0, awarded_marks), 2)
    feedback = (
        f"Objective questions correct: {objective_correct_questions}/{total_questions}. "
        f"Marks per question: {round(marks_per_question, 2)}."
    )
    if completion_awarded_questions:
        feedback = (
            f"{feedback} Completion-based awarded: {completion_awarded_questions}/{total_questions} "
            "(no answer key configured for those questions)."
        )
    if wrong_details:
        feedback = f"{feedback} Incorrect answers: " + " ; ".join(wrong_details)
    if llm_feedback_notes:
        feedback = f"{feedback} LLM review: " + " ; ".join(llm_feedback_notes)
    return marks, feedback


@router.get("/{course_id}")
def get_course_grades(
    course_id: int,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    if not _teacher_can_manage_course_grades(course_id, current_user.id, db):
        raise HTTPException(status_code=403, detail="Only course teachers can access grades")

    enrollment_rows = (
        db.query(CourseEnrollment)
        .filter(CourseEnrollment.course_id == course_id, CourseEnrollment.role == "student")
        .all()
    )
    student_ids = sorted(
        {
            row.user_id or row.student_id
            for row in enrollment_rows
            if (row.user_id or row.student_id) is not None
        }
    )

    student_rows = (
        db.query(User.id, User.name, User.email)
        .filter(User.id.in_(student_ids))
        .order_by(User.name.asc(), User.email.asc())
        .all()
        if student_ids
        else []
    )

    section_rows = (
        db.query(ClassworkSection.id, ClassworkSection.name, ClassworkSection.percentage, ClassworkSection.manual_max_points)
        .filter(ClassworkSection.course_id == course_id)
        .order_by(ClassworkSection.created_at.asc())
        .all()
    )

    assignment_rows = (
        db.query(Classwork.id, Classwork.title, Classwork.points, Classwork.classwork_section_id)
        .filter(
            Classwork.course_id == course_id,
            Classwork.type.in_(["assignment", "quiz", "question"]),
            Classwork.status != "draft",
        )
        .order_by(Classwork.created_at.asc())
        .all()
    )
    assignment_ids = [row.id for row in assignment_rows]
    manual_section_grade_map = _get_manual_section_grade_map(course_id, student_ids, db)

    section_lookup = {
        row.id: {
            "id": row.id,
            "name": row.name,
            "percentage": float(row.percentage),
            "manual_max_points": float(row.manual_max_points) if row.manual_max_points is not None else None,
            "assignments": [],
        }
        for row in section_rows
    }
    ungrouped_section = {"id": 0, "name": "Ungrouped", "percentage": 0.0, "assignments": []}
    resolved_section_by_assignment_id: dict[str, int | None] = {}

    for row in assignment_rows:
        resolved_section_id = _resolve_section_id_for_assignment(
            row.title,
            row.classwork_section_id,
            section_lookup,
        )
        resolved_section_by_assignment_id[row.id] = resolved_section_id
        assignment_payload = {
            "id": row.id,
            "title": row.title,
            "max_marks": float(row.points),
            "classwork_section_id": resolved_section_id,
        }
        if resolved_section_id and resolved_section_id in section_lookup:
            section_lookup[resolved_section_id]["assignments"].append(assignment_payload)
        else:
            ungrouped_section["assignments"].append(assignment_payload)

    grade_rows = (
        db.query(Grade.student_id, Grade.assignment_id, Grade.marks, Grade.earned_marks, Grade.max_marks, Grade.percentage)
        .filter(
            Grade.student_id.in_(student_ids),
            Grade.assignment_id.in_(assignment_ids),
        )
        .all()
        if student_ids and assignment_ids
        else []
    )

    submission_rows = (
        db.query(
            Submission.student_id,
            Submission.classwork_id,
            Submission.status,
            Submission.content,
            Submission.ai_marks,
            Submission.ai_feedback,
            Submission.final_marks,
            Submission.graded_by,
            Submission.graded_at,
        )
        .filter(
            Submission.student_id.in_(student_ids),
            Submission.classwork_id.in_(assignment_ids),
        )
        .all()
        if student_ids and assignment_ids
        else []
    )

    final_from_submissions: dict[tuple[int, str], float] = {
        (row.student_id, row.classwork_id): float(row.final_marks)
        for row in submission_rows
        if row.final_marks is not None
    }

    response_grades = []
    seen: set[tuple[int, str]] = set()
    for (student_id, assignment_id), marks in final_from_submissions.items():
        assignment = next((row for row in assignment_rows if row.id == assignment_id), None)
        max_marks = float(assignment.points) if assignment else 0.0
        response_grades.append(
            {
                "student_id": student_id,
                "assignment_id": assignment_id,
                "marks": marks,
                "earned_marks": marks,
                "max_marks": max_marks,
                "percentage": _grade_percentage(marks, max_marks) if max_marks > 0 else 0.0,
            }
        )
        seen.add((student_id, assignment_id))

    for row in grade_rows:
        key = (row.student_id, row.assignment_id)
        if key in seen:
            continue
        earned_marks = float(row.earned_marks if row.earned_marks is not None else row.marks)
        max_marks = float(row.max_marks if row.max_marks is not None else 0.0)
        if max_marks <= 0:
            assignment = next((assignment_row for assignment_row in assignment_rows if assignment_row.id == row.assignment_id), None)
            max_marks = float(assignment.points) if assignment else 0.0
        response_grades.append(
            {
                "student_id": row.student_id,
                "assignment_id": row.assignment_id,
                "marks": earned_marks,
                "earned_marks": earned_marks,
                "max_marks": max_marks,
                "percentage": float(row.percentage) if row.percentage is not None else _grade_percentage(earned_marks, max_marks),
            }
        )

    return {
        "success": True,
        "message": "Grades fetched",
        "students": [
            {"id": row.id, "name": row.name, "email": row.email}
            for row in student_rows
        ],
        "assignments": [
            {
                "id": row.id,
                "title": row.title,
                "max_marks": float(row.points),
                "classwork_section_id": resolved_section_by_assignment_id.get(row.id),
            }
            for row in assignment_rows
        ],
        "sections": [
            *section_lookup.values(),
            *([ungrouped_section] if ungrouped_section["assignments"] else []),
        ],
        "grades": response_grades,
        "manual_section_grades": [
            {"student_id": student_id, "section_id": section_id, "marks": marks}
            for (student_id, section_id), marks in manual_section_grade_map.items()
        ],
        "submissions": [
            {
                "student_id": row.student_id,
                "assignment_id": row.classwork_id,
                "status": _normalize_submission_status(row.status),
                "content": row.content or "",
                "ai_marks": float(row.ai_marks) if row.ai_marks is not None else None,
                "ai_feedback": row.ai_feedback or "",
                "final_marks": float(row.final_marks) if row.final_marks is not None else None,
                "graded_by": row.graded_by,
                "graded_at": row.graded_at.isoformat() if row.graded_at else None,
            }
            for row in submission_rows
        ],
    }


@router.post("/update-section-grade")
def update_section_grade(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can update section grades")

    student_id = payload.get("student_id")
    section_id = payload.get("section_id")
    marks = payload.get("marks")

    if not isinstance(student_id, int) or not isinstance(section_id, int):
        raise HTTPException(status_code=400, detail="student_id and section_id are required")

    try:
        marks_value = float(marks)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="marks must be a number")

    section = db.query(ClassworkSection).filter(ClassworkSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    if not _teacher_can_manage_course_grades(section.course_id, current_user.id, db):
        raise HTTPException(status_code=403, detail="Only course teachers can update section grades")

    if _section_has_assigned_tasks(section_id, db):
        raise HTTPException(status_code=400, detail="Manual section grades are only allowed for sections without assigned tasks")

    student_enrollment = (
        db.query(CourseEnrollment.id)
        .filter(
            CourseEnrollment.course_id == section.course_id,
            CourseEnrollment.role == "student",
            or_(CourseEnrollment.user_id == student_id, CourseEnrollment.student_id == student_id),
        )
        .first()
    )
    if not student_enrollment:
        raise HTTPException(status_code=400, detail="Student is not enrolled in this course")

    manual_grade = (
        db.query(ManualSectionGrade)
        .filter(
            ManualSectionGrade.student_id == student_id,
            ManualSectionGrade.section_id == section_id,
        )
        .first()
    )

    if manual_grade:
        manual_grade.marks = max(0.0, min(100.0, marks_value))
    else:
        manual_grade = ManualSectionGrade(
            student_id=student_id,
            course_id=section.course_id,
            section_id=section_id,
            marks=max(0.0, min(100.0, marks_value)),
        )
        db.add(manual_grade)

    db.commit()
    db.refresh(manual_grade)

    return {
        "success": True,
        "message": "Section grade updated",
        "data": {
            "student_id": manual_grade.student_id,
            "section_id": manual_grade.section_id,
            "marks": float(manual_grade.marks),
        },
    }


@router.post("/auto-grade/{assignment_id}")
def auto_grade_assignment(
    assignment_id: str,
    payload: AutoGradeRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    assignment = db.query(Classwork).filter(Classwork.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if not _teacher_can_manage_course_grades(assignment.course_id, current_user.id, db):
        raise HTTPException(status_code=403, detail="Only course teachers can auto-grade")

    rows = (
        db.query(Submission)
        .filter(Submission.classwork_id == assignment_id)
        .all()
    )
    if not rows:
        return {
            "success": True,
            "message": "No submissions found for this assignment",
            "data": {"graded_count": 0, "skipped_count": 0, "error_count": 0},
        }

    llm = _llm()
    graded_count = 0
    skipped_count = 0
    error_count = 0

    for submission in rows:
        status = _normalize_submission_status(submission.status)
        if status not in {"submitted", "late"}:
            skipped_count += 1
            continue

        if submission.graded_by == "teacher" and not payload.override_teacher_edited:
            skipped_count += 1
            continue

        raw_submission_content = submission.content or ""
        parsed_submission = _extract_turned_in_data(raw_submission_content)
        if not parsed_submission["trimmed"]:
            submission.ai_marks = 0.0
            submission.ai_feedback = "No answer submitted."
            if submission.graded_by != "teacher" or payload.override_teacher_edited:
                submission.final_marks = 0.0
                submission.graded_by = "ai"
                submission.graded_at = datetime.utcnow()
            db.add(submission)
            graded_count += 1
            continue

        if assignment.type == "quiz":
            try:
                ai_marks, ai_feedback = _grade_quiz_submission(assignment, submission)
            except Exception:
                error_count += 1
                continue

            submission.ai_marks = ai_marks
            submission.ai_feedback = ai_feedback
            if submission.graded_by != "teacher" or payload.override_teacher_edited:
                submission.final_marks = ai_marks
                submission.graded_by = "ai"
                submission.graded_at = datetime.utcnow()
            db.add(submission)
            graded_count += 1
            continue

        grading_context = _build_grading_context(assignment, raw_submission_content)
        context_text = _build_grading_context(assignment, raw_submission_content)

        try:
            prompt = (
                "You are an AI grader. Grade this student submission based on the provided context.\n"
                "Return ONLY valid JSON in this exact format: {\"marks\": number, \"feedback\": \"short explanation\" }.\n\n"
                f"Context:\n{context_text}\n\n"
                f"Max marks: {assignment.points}\n"
            )
            result = llm.invoke(prompt)
            raw = result.content if hasattr(result, "content") else str(result)
            ai_marks, ai_feedback = _parse_json_grade(raw, float(assignment.points))
        except Exception:
            error_count += 1
            continue

        submission.ai_marks = ai_marks
        submission.ai_feedback = ai_feedback
        if submission.graded_by != "teacher" or payload.override_teacher_edited:
            submission.final_marks = ai_marks
            submission.graded_by = "ai"
            submission.graded_at = datetime.utcnow()
        db.add(submission)
        graded_count += 1

    db.commit()

    return {
        "success": True,
        "message": "Auto grading completed",
        "data": {
            "graded_count": graded_count,
            "skipped_count": skipped_count,
            "error_count": error_count,
        },
    }


@router.post("/update")
def update_grade(
    payload: UpdateGradeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if current_user.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can update grades")

    assignment = (
        db.query(Classwork)
        .filter(Classwork.id == payload.assignment_id)
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if not _teacher_can_manage_course_grades(assignment.course_id, current_user.id, db):
        raise HTTPException(status_code=403, detail="Only course teachers can update grades")

    earned_marks = payload.earned_marks if payload.earned_marks is not None else payload.marks
    max_marks = payload.max_marks if payload.max_marks is not None else float(assignment.points)

    if earned_marks is None:
        raise HTTPException(status_code=400, detail="earned_marks is required")
    if max_marks <= 0:
        raise HTTPException(status_code=400, detail="max_marks must be greater than 0")
    if earned_marks > max_marks:
        raise HTTPException(status_code=400, detail="earned_marks cannot exceed max_marks")

    percentage = _grade_percentage(float(earned_marks), float(max_marks))

    student_enrollment = (
        db.query(CourseEnrollment.id)
        .filter(
            CourseEnrollment.course_id == assignment.course_id,
            CourseEnrollment.role == "student",
            or_(CourseEnrollment.user_id == payload.student_id, CourseEnrollment.student_id == payload.student_id),
        )
        .first()
    )
    if not student_enrollment:
        raise HTTPException(status_code=400, detail="Student is not enrolled in this course")

    submission = (
        db.query(Submission)
        .filter(
            Submission.student_id == payload.student_id,
            Submission.classwork_id == payload.assignment_id,
        )
        .first()
    )

    if not submission:
        submission = Submission(
            classwork_id=payload.assignment_id,
            student_id=payload.student_id,
            status="missing",
            content="",
        )

    submission.final_marks = float(earned_marks)
    submission.graded_by = "teacher"
    submission.graded_at = datetime.utcnow()
    db.add(submission)

    grade = (
        db.query(Grade)
        .filter(
            and_(
                Grade.student_id == payload.student_id,
                Grade.assignment_id == payload.assignment_id,
            )
        )
        .first()
    )

    if grade:
        grade.marks = float(earned_marks)
        grade.earned_marks = float(earned_marks)
        grade.max_marks = float(max_marks)
        grade.percentage = percentage
        db.add(grade)
    else:
        grade = Grade(
            student_id=payload.student_id,
            assignment_id=payload.assignment_id,
            marks=float(earned_marks),
            earned_marks=float(earned_marks),
            max_marks=float(max_marks),
            percentage=percentage,
        )
        db.add(grade)

    db.commit()
    db.refresh(grade)

    return {
        "success": True,
        "message": "Grade updated",
        "data": {
            "student_id": grade.student_id,
            "assignment_id": grade.assignment_id,
            "marks": float(grade.marks),
            "earned_marks": float(grade.earned_marks if grade.earned_marks is not None else grade.marks),
            "max_marks": float(grade.max_marks if grade.max_marks is not None else max_marks),
            "percentage": float(grade.percentage if grade.percentage is not None else percentage),
            "graded_by": "teacher",
        },
    }


@router.post("/update-section-max")
def update_section_max(
    payload: UpdateSectionMaxRequest,
    current_user: User = Depends(require_role("teacher")),
    db: Session = Depends(get_db),
) -> dict:
    section = db.query(ClassworkSection).filter(ClassworkSection.id == payload.section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    if not _teacher_can_manage_course_grades(section.course_id, current_user.id, db):
        raise HTTPException(status_code=403, detail="Only course teachers can update section max points")

    if _section_has_assigned_tasks(section.id, db):
        raise HTTPException(status_code=400, detail="Manual section max points are only allowed for sections without assigned tasks")

    section.manual_max_points = float(payload.max_points)
    db.add(section)
    db.commit()
    db.refresh(section)

    return {
        "success": True,
        "message": "Section max points updated",
        "data": {
            "section_id": section.id,
            "max_points": float(section.manual_max_points or 0),
        },
    }


@router.get("/leaderboard/{course_id}")
def get_course_leaderboard(
    course_id: int,
    current_user: User = Depends(require_role("teacher", "student")),
    db: Session = Depends(get_db),
) -> dict:
    if current_user.role == "teacher":
        if not _teacher_can_manage_course_grades(course_id, current_user.id, db):
            raise HTTPException(status_code=403, detail="Only course teachers can access leaderboard")
    else:
        if not _student_can_view_course(course_id, current_user.id, db):
            raise HTTPException(status_code=403, detail="Only enrolled students can access leaderboard")

    enrollment_rows = (
        db.query(CourseEnrollment)
        .filter(CourseEnrollment.course_id == course_id, CourseEnrollment.role == "student")
        .all()
    )
    student_ids = sorted(
        {
            row.user_id or row.student_id
            for row in enrollment_rows
            if (row.user_id or row.student_id) is not None
        }
    )

    student_rows = (
        db.query(User.id, User.name, User.email)
        .filter(User.id.in_(student_ids))
        .order_by(User.name.asc(), User.email.asc())
        .all()
        if student_ids
        else []
    )

    section_rows = (
        db.query(ClassworkSection.id, ClassworkSection.name, ClassworkSection.percentage, ClassworkSection.manual_max_points)
        .filter(ClassworkSection.course_id == course_id)
        .order_by(ClassworkSection.created_at.asc())
        .all()
    )

    assignment_rows = (
        db.query(Classwork.id, Classwork.title, Classwork.points, Classwork.classwork_section_id)
        .filter(
            Classwork.course_id == course_id,
            Classwork.type.in_(["assignment", "quiz", "question"]),
            Classwork.status != "draft",
        )
        .order_by(Classwork.created_at.asc())
        .all()
    )
    assignment_ids = [row.id for row in assignment_rows]
    manual_section_grade_map = _get_manual_section_grade_map(course_id, student_ids, db)

    grade_rows = (
        db.query(Grade.student_id, Grade.assignment_id, Grade.marks)
        .filter(
            Grade.student_id.in_(student_ids),
            Grade.assignment_id.in_(assignment_ids),
        )
        .all()
        if student_ids and assignment_ids
        else []
    )

    submission_rows = (
        db.query(Submission.student_id, Submission.classwork_id, Submission.final_marks)
        .filter(
            Submission.student_id.in_(student_ids),
            Submission.classwork_id.in_(assignment_ids),
        )
        .all()
        if student_ids and assignment_ids
        else []
    )

    final_grade_map: dict[tuple[int, str], float] = {
        (row.student_id, row.classwork_id): float(row.final_marks)
        for row in submission_rows
        if row.final_marks is not None
    }

    section_lookup = {
        row.id: {
            "id": row.id,
            "name": row.name,
            "percentage": float(row.percentage),
                "manual_max_points": float(row.manual_max_points) if row.manual_max_points is not None else None,
                "assignments": [],
        }
        for row in section_rows
    }
    ungrouped_section = {"id": 0, "name": "Ungrouped", "percentage": 0.0, "assignments": []}

    for row in assignment_rows:
        resolved_section_id = _resolve_section_id_for_assignment(
            row.title,
            row.classwork_section_id,
            section_lookup,
        )
        assignment_payload = {
            "id": row.id,
            "title": row.title,
            "max_marks": float(row.points),
            "classwork_section_id": resolved_section_id,
        }
        if resolved_section_id and resolved_section_id in section_lookup:
            section_lookup[resolved_section_id]["assignments"].append(assignment_payload)
        else:
            ungrouped_section["assignments"].append(assignment_payload)

    final_from_submissions: dict[tuple[int, str], float] = {
        (row.student_id, row.classwork_id): float(row.final_marks)
        for row in submission_rows
        if row.final_marks is not None
    }

    response_grades = []
    seen: set[tuple[int, str]] = set()
    for (student_id, assignment_id), marks in final_from_submissions.items():
        response_grades.append({"student_id": student_id, "assignment_id": assignment_id, "marks": marks})
        seen.add((student_id, assignment_id))

    for row in grade_rows:
        key = (row.student_id, row.assignment_id)
        if key in seen:
            continue
        response_grades.append({"student_id": row.student_id, "assignment_id": row.assignment_id, "marks": float(row.marks)})

    return {
        "success": True,
        "message": "Leaderboard fetched",
        "students": [{"id": row.id, "name": row.name, "email": row.email} for row in student_rows],
        "sections": [
            *section_lookup.values(),
            *([ungrouped_section] if ungrouped_section["assignments"] else []),
        ],
        "grades": response_grades,
        "manual_section_grades": [
            {"student_id": student_id, "section_id": section_id, "marks": marks}
            for (student_id, section_id), marks in manual_section_grade_map.items()
        ],
    }
