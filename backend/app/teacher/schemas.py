from pydantic import BaseModel, Field


class CreateCourseRequest(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    course_code: str = Field(min_length=2, max_length=32, pattern=r"^[A-Za-z0-9]+$")
    section: str = ""
    description: str = ""


class RenameCourseRequest(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    course_code: str = Field(min_length=2, max_length=32, pattern=r"^[A-Za-z0-9]+$")


class CourseResponse(BaseModel):
    id: int
    title: str
    course_code: str
    class_code: str
    section: str
    description: str
    is_archived: bool


class CourseListResponse(BaseModel):
    success: bool
    message: str
    data: list[CourseResponse]


class DeleteCourseResponse(BaseModel):
    success: bool
    message: str
    data: dict


class GenerateQuizRequest(BaseModel):
    course_id: int
    material_id: int
    title: str
    question_count: int = 5


class UploadMaterialResponse(BaseModel):
    success: bool
    message: str
    data: dict


class CreateAnnouncementCommentRequest(BaseModel):
    content: str = Field(min_length=1, max_length=5000)


class AddPersonByEmailRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)


class RemoveCourseUserRequest(BaseModel):
    role: str = Field(pattern=r"^(teacher|student)$")
    user_id: int | None = None
    invite_id: int | None = None
