from sqlalchemy import text

from app.database.models import Base
from app.database.session import engine


def init_db() -> None:
    Base.metadata.create_all(bind=engine)

    with engine.begin() as connection:
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

        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_courses_course_code ON courses (course_code)"))

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
