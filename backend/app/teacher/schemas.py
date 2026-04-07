from pydantic import BaseModel, Field


class CreateCourseRequest(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    course_code: str = Field(min_length=2, max_length=32, pattern=r"^[A-Za-z0-9]+$")
    description: str = ""


class CourseResponse(BaseModel):
    id: int
    title: str
    course_code: str
    description: str


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
