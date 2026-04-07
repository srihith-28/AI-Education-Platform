from fastapi import APIRouter, Depends

from app.common.deps import get_current_user
from app.database.models import User


router = APIRouter()


@router.get("/me")
def get_profile(current_user: User = Depends(get_current_user)) -> dict:
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
    }
