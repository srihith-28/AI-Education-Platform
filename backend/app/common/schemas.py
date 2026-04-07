from pydantic import BaseModel


class APIResponse(BaseModel):
    success: bool
    message: str


class HealthResponse(BaseModel):
    success: bool
    message: str
    status: str
