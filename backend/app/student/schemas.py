from pydantic import BaseModel


class AskRequest(BaseModel):
    course_id: int
    question: str
    session_id: str


class QuizAttemptRequest(BaseModel):
    quiz_id: int
    answers: list[str]


class UpdateProgressRequest(BaseModel):
    task_id: int
    completed: bool
