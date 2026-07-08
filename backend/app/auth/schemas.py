from pydantic import BaseModel, EmailStr


class UserSyncRequest(BaseModel):
    """Sent by frontend after Supabase signup to register the role in our DB."""
    name: str
    role: str  # "teacher" | "student"


class RegisterRequest(BaseModel):
    """Sent by frontend to bypass email confirmation during local development."""
    email: EmailStr
    password: str
    name: str
    role: str


class UserProfileResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    supabase_uid: str | None = None


class MeResponse(BaseModel):
    success: bool
    data: UserProfileResponse
