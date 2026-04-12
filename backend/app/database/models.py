from datetime import date, datetime, time
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    course_code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    class_code: Mapped[str] = mapped_column(String(12), unique=True, index=True, nullable=False)
    section: Mapped[str] = mapped_column(String(120), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Material(Base):
    __tablename__ = "materials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    message: Mapped[str] = mapped_column(Text, default="")
    attachment_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attachment_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    attachment_content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class AnnouncementAudience(Base):
    __tablename__ = "announcement_audience"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    announcement_id: Mapped[int] = mapped_column(ForeignKey("announcements.id"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)


class AnnouncementComment(Base):
    __tablename__ = "announcement_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    announcement_id: Mapped[int] = mapped_column(ForeignKey("announcements.id"), nullable=False, index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    due_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ClassworkSection(Base):
    __tablename__ = "classwork_sections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    percentage: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    manual_max_points: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Classwork(Base):
    __tablename__ = "classwork"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    classwork_section_id: Mapped[int | None] = mapped_column(ForeignKey("classwork_sections.id"), nullable=True, index=True)
    topic_id: Mapped[int | None] = mapped_column(ForeignKey("topics.id"), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    points: Mapped[int] = mapped_column(Integer, default=100)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="published", index=True)
    attachments_json: Mapped[str] = mapped_column(Text, default="[]")
    quiz_questions_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    classwork_id: Mapped[str] = mapped_column(ForeignKey("classwork.id"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="assigned")
    ai_marks: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    final_marks: Mapped[float | None] = mapped_column(Float, nullable=True)
    graded_by: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    graded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Grade(Base):
    __tablename__ = "grades"
    __table_args__ = (UniqueConstraint("student_id", "assignment_id", name="uq_grades_student_assignment"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    assignment_id: Mapped[str] = mapped_column(ForeignKey("classwork.id"), nullable=False, index=True)
    marks: Mapped[float] = mapped_column(Float, nullable=False)
    earned_marks: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_marks: Mapped[float | None] = mapped_column(Float, nullable=True)
    percentage: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ManualSectionGrade(Base):
    __tablename__ = "manual_section_grades"
    __table_args__ = (UniqueConstraint("student_id", "section_id", name="uq_manual_section_grades_student_section"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    section_id: Mapped[int] = mapped_column(ForeignKey("classwork_sections.id"), nullable=False, index=True)
    marks: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    questions_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id"), nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    score: Mapped[float] = mapped_column(Float, default=0)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")


class Progress(Base):
    __tablename__ = "progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CourseEnrollment(Base):
    __tablename__ = "course_enrollments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    # Legacy student_id remains for backward compatibility with older routes.
    student_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    # Shared membership key used by both teacher and student People pages.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="student", index=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CourseTeacher(Base):
    __tablename__ = "course_teachers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CourseInvite(Base):
    __tablename__ = "course_invites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    invited_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    session_id: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    custom_title: Mapped[str] = mapped_column(String(255), nullable=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    pinned_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    archived_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
