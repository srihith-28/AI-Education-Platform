from sqlalchemy import text

from app.database.models import Base
from app.database.session import engine


def init_db() -> None:
    Base.metadata.create_all(bind=engine)

    with engine.begin() as connection:
        # ── Supabase Auth migration: add supabase_uid to users ────────────────
        connection.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS supabase_uid VARCHAR(36) UNIQUE;
                """
            )
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_users_supabase_uid ON users (supabase_uid)")
        )

        column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'courses' AND column_name = 'course_code'
                """
            )
        ).scalar()

        if not column_check:
            connection.execute(text("ALTER TABLE courses ADD COLUMN course_code VARCHAR(32)"))
            connection.execute(text("UPDATE courses SET course_code = CONCAT('COURSE', id) WHERE course_code IS NULL"))
            connection.execute(text("ALTER TABLE courses ALTER COLUMN course_code SET NOT NULL"))

        section_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'courses' AND column_name = 'section'
                """
            )
        ).scalar()

        if not section_column_check:
            connection.execute(text("ALTER TABLE courses ADD COLUMN section VARCHAR(120) DEFAULT ''"))

        class_code_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'courses' AND column_name = 'class_code'
                """
            )
        ).scalar()

        if not class_code_column_check:
            connection.execute(text("ALTER TABLE courses ADD COLUMN class_code VARCHAR(12)"))
            connection.execute(
                text(
                    """
                    UPDATE courses
                    SET class_code = LOWER(SUBSTRING(MD5(RANDOM()::text || id::text), 1, 6))
                    WHERE class_code IS NULL OR class_code = ''
                    """
                )
            )
            connection.execute(text("ALTER TABLE courses ALTER COLUMN class_code SET NOT NULL"))

        is_archived_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'courses' AND column_name = 'is_archived'
                """
            )
        ).scalar()

        if not is_archived_column_check:
            connection.execute(text("ALTER TABLE courses ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE"))

        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_courses_course_code ON courses (course_code)"))
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_courses_class_code ON courses (class_code)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_courses_is_archived ON courses (is_archived)"))
        connection.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS ix_course_enrollments_course_student
                ON course_enrollments (course_id, student_id)
                """
            )
        )
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_course_enrollments_course_id ON course_enrollments (course_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_course_enrollments_student_id ON course_enrollments (student_id)"))
        course_enrollment_archived_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'course_enrollments' AND column_name = 'is_archived'
                """
            )
        ).scalar()

        if not course_enrollment_archived_column_check:
            connection.execute(text("ALTER TABLE course_enrollments ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE"))

        course_enrollment_user_id_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'course_enrollments' AND column_name = 'user_id'
                """
            )
        ).scalar()
        if not course_enrollment_user_id_column_check:
            connection.execute(text("ALTER TABLE course_enrollments ADD COLUMN user_id INTEGER NULL"))

        course_enrollment_role_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'course_enrollments' AND column_name = 'role'
                """
            )
        ).scalar()
        if not course_enrollment_role_column_check:
            connection.execute(text("ALTER TABLE course_enrollments ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'student'"))

        # Backfill shared membership columns from legacy student_id rows.
        connection.execute(
            text(
                """
                UPDATE course_enrollments
                SET user_id = student_id
                WHERE user_id IS NULL AND student_id IS NOT NULL
                """
            )
        )
        connection.execute(
            text(
                """
                UPDATE course_enrollments
                SET role = 'student'
                WHERE role IS NULL OR role = ''
                """
            )
        )

        # Ensure primary teacher is represented in enrollments as role=teacher.
        connection.execute(
            text(
                """
                INSERT INTO course_enrollments (course_id, student_id, user_id, role, is_archived, created_at)
                SELECT c.id, c.teacher_id, c.teacher_id, 'teacher', FALSE, NOW()
                FROM courses c
                WHERE NOT EXISTS (
                    SELECT 1 FROM course_enrollments ce
                    WHERE ce.course_id = c.id AND ce.user_id = c.teacher_id
                )
                """
            )
        )

        # Migrate optional co-teachers from course_teachers table when present.
        connection.execute(
            text(
                """
                INSERT INTO course_enrollments (course_id, student_id, user_id, role, is_archived, created_at)
                SELECT ct.course_id, ct.teacher_id, ct.teacher_id, 'teacher', FALSE, NOW()
                FROM course_teachers ct
                WHERE NOT EXISTS (
                    SELECT 1 FROM course_enrollments ce
                    WHERE ce.course_id = ct.course_id AND ce.user_id = ct.teacher_id
                )
                """
            )
        )

        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_course_enrollments_is_archived ON course_enrollments (is_archived)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_course_enrollments_user_id ON course_enrollments (user_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_course_enrollments_role ON course_enrollments (role)"))
        connection.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS ix_course_enrollments_course_user
                ON course_enrollments (course_id, user_id)
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS ix_course_teachers_course_teacher
                ON course_teachers (course_id, teacher_id)
                """
            )
        )
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_course_teachers_course_id ON course_teachers (course_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_course_teachers_teacher_id ON course_teachers (teacher_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_course_invites_course_id ON course_invites (course_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_course_invites_email ON course_invites (email)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_course_invites_status ON course_invites (status)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_events_due_date ON events (due_date)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_topics_course_id ON topics (course_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_topics_order_index ON topics (order_index)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_classwork_course_id ON classwork (course_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_classwork_topic_id ON classwork (topic_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_classwork_due_date ON classwork (due_date)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_submissions_student_id ON submissions (student_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_submissions_classwork_id ON submissions (classwork_id)"))
        connection.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS ix_submissions_student_assignment
                ON submissions (student_id, classwork_id)
                """
            )
        )
        submission_content_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'submissions' AND column_name = 'content'
                """
            )
        ).scalar()
        if not submission_content_column_check:
            connection.execute(text("ALTER TABLE submissions ADD COLUMN content TEXT NOT NULL DEFAULT ''"))

        submission_ai_marks_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'submissions' AND column_name = 'ai_marks'
                """
            )
        ).scalar()
        if not submission_ai_marks_column_check:
            connection.execute(text("ALTER TABLE submissions ADD COLUMN ai_marks DOUBLE PRECISION NULL"))

        submission_ai_feedback_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'submissions' AND column_name = 'ai_feedback'
                """
            )
        ).scalar()
        if not submission_ai_feedback_column_check:
            connection.execute(text("ALTER TABLE submissions ADD COLUMN ai_feedback TEXT NULL"))

        submission_final_marks_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'submissions' AND column_name = 'final_marks'
                """
            )
        ).scalar()
        if not submission_final_marks_column_check:
            connection.execute(text("ALTER TABLE submissions ADD COLUMN final_marks DOUBLE PRECISION NULL"))

        submission_graded_by_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'submissions' AND column_name = 'graded_by'
                """
            )
        ).scalar()
        if not submission_graded_by_column_check:
            connection.execute(text("ALTER TABLE submissions ADD COLUMN graded_by VARCHAR(20) NULL"))

        submission_graded_at_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'submissions' AND column_name = 'graded_at'
                """
            )
        ).scalar()
        if not submission_graded_at_column_check:
            connection.execute(text("ALTER TABLE submissions ADD COLUMN graded_at TIMESTAMP NULL"))

        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_submissions_graded_by ON submissions (graded_by)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_grades_student_id ON grades (student_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_grades_assignment_id ON grades (assignment_id)"))
        connection.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS ix_grades_student_assignment
                ON grades (student_id, assignment_id)
                """
            )
        )

        grades_earned_marks_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'grades' AND column_name = 'earned_marks'
                """
            )
        ).scalar()
        if not grades_earned_marks_check:
            connection.execute(text("ALTER TABLE grades ADD COLUMN earned_marks DOUBLE PRECISION NULL"))

        grades_max_marks_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'grades' AND column_name = 'max_marks'
                """
            )
        ).scalar()
        if not grades_max_marks_check:
            connection.execute(text("ALTER TABLE grades ADD COLUMN max_marks DOUBLE PRECISION NULL"))

        grades_percentage_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'grades' AND column_name = 'percentage'
                """
            )
        ).scalar()
        if not grades_percentage_check:
            connection.execute(text("ALTER TABLE grades ADD COLUMN percentage DOUBLE PRECISION NULL"))

        connection.execute(text("UPDATE grades SET earned_marks = COALESCE(earned_marks, marks)"))
        connection.execute(
            text(
                """
                UPDATE grades
                SET max_marks = COALESCE(max_marks, classwork.points)
                FROM classwork
                WHERE grades.assignment_id = classwork.id
                """
            )
        )
        connection.execute(
            text(
                """
                UPDATE grades
                SET percentage = CASE
                    WHEN COALESCE(max_marks, 0) > 0 THEN (COALESCE(earned_marks, marks) / max_marks) * 100
                    ELSE 0
                END
                """
            )
        )

        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_manual_section_grades_student_id ON manual_section_grades (student_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_manual_section_grades_course_id ON manual_section_grades (course_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_manual_section_grades_section_id ON manual_section_grades (section_id)"))
        connection.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS ix_manual_section_grades_student_section
                ON manual_section_grades (student_id, section_id)
                """
            )
        )
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_announcements_course_id ON announcements (course_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_announcements_created_at ON announcements (created_at)"))
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_announcement_audience_announcement_id ON announcement_audience (announcement_id)"
            )
        )
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_announcement_audience_student_id ON announcement_audience (student_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_announcement_comments_announcement_id ON announcement_comments (announcement_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_announcement_comments_created_at ON announcement_comments (created_at)"))

        classwork_points_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'classwork' AND column_name = 'points'
                """
            )
        ).scalar()
        if not classwork_points_column_check:
            connection.execute(text("ALTER TABLE classwork ADD COLUMN points INTEGER NOT NULL DEFAULT 100"))

        classwork_scheduled_for_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'classwork' AND column_name = 'scheduled_for'
                """
            )
        ).scalar()
        if not classwork_scheduled_for_column_check:
            connection.execute(text("ALTER TABLE classwork ADD COLUMN scheduled_for TIMESTAMP NULL"))

        classwork_status_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'classwork' AND column_name = 'status'
                """
            )
        ).scalar()
        if not classwork_status_column_check:
            connection.execute(text("ALTER TABLE classwork ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'published'"))

        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_classwork_status ON classwork (status)"))

        classwork_section_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'classwork' AND column_name = 'classwork_section_id'
                """
            )
        ).scalar()
        if not classwork_section_column_check:
            connection.execute(text("ALTER TABLE classwork ADD COLUMN classwork_section_id INTEGER NULL"))
            connection.execute(text("ALTER TABLE classwork ADD CONSTRAINT fk_classwork_section_id FOREIGN KEY (classwork_section_id) REFERENCES classwork_sections(id)"))

        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_classwork_section_id ON classwork (classwork_section_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_classwork_sections_course_id ON classwork_sections (course_id)"))

        classwork_section_manual_max_points_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'classwork_sections' AND column_name = 'manual_max_points'
                """
            )
        ).scalar()
        if not classwork_section_manual_max_points_check:
            connection.execute(text("ALTER TABLE classwork_sections ADD COLUMN manual_max_points DOUBLE PRECISION NULL"))

        classwork_attachments_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'classwork' AND column_name = 'attachments_json'
                """
            )
        ).scalar()
        if not classwork_attachments_column_check:
            connection.execute(text("ALTER TABLE classwork ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]'"))

        classwork_quiz_questions_column_check = connection.execute(
            text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'classwork' AND column_name = 'quiz_questions_json'
                """
            )
        ).scalar()
        if not classwork_quiz_questions_column_check:
            connection.execute(text("ALTER TABLE classwork ADD COLUMN quiz_questions_json TEXT NOT NULL DEFAULT '[]'"))

        chat_session_columns = {
            "custom_title": "ALTER TABLE chat_sessions ADD COLUMN custom_title VARCHAR(255)",
            "is_pinned": "ALTER TABLE chat_sessions ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT FALSE",
            "is_archived": "ALTER TABLE chat_sessions ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE",
            "pinned_at": "ALTER TABLE chat_sessions ADD COLUMN pinned_at TIMESTAMP NULL",
            "archived_at": "ALTER TABLE chat_sessions ADD COLUMN archived_at TIMESTAMP NULL",
        }

        for column_name, alter_sql in chat_session_columns.items():
            exists = connection.execute(
                text(
                    f"""
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'chat_sessions' AND column_name = '{column_name}'
                    """
                )
            ).scalar()
            if not exists:
                connection.execute(text(alter_sql))


if __name__ == "__main__":
    init_db()
    print("Database initialized")
