"""
auth/router.py

Provides two lightweight endpoints that complement Supabase Auth:
  POST /sync — Called by frontend after signup to persist the user role in our DB
  GET  /me   — Returns the current user's local profile
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.schemas import MeResponse, UserProfileResponse, UserSyncRequest, RegisterRequest
from app.auth.service import sync_user_profile
from app.common.config import settings
from app.common.deps import get_current_user
from app.common.security import verify_supabase_jwt
from app.database.models import User
from app.database.session import get_db
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger("ai-education-api.auth")
router = APIRouter()
bearer_scheme = HTTPBearer(auto_error=False)


@router.post("/register")
def register_user(
    req: RegisterRequest,
    db: Session = Depends(get_db),
):
    """Register a user via admin API to bypass email confirmation locally."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(status_code=500, detail="Supabase admin config missing")
    
    from supabase import create_client
    admin_client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    
    try:
        res = admin_client.auth.admin.create_user({
            "email": req.email,
            "password": req.password,
            "email_confirm": True,
            "user_metadata": {"name": req.name, "role": req.role}
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Signup failed: {str(e)}")
        
    try:
        sync_user_profile(
            supabase_uid=res.user.id,
            email=res.user.email,
            name=req.name,
            role=req.role,
            db=db
        )
    except Exception as e:
        logger.exception("Failed to sync profile after admin registration")
        
    return {"message": "User registered successfully"}


@router.post("/sync", response_model=MeResponse)
def sync_user(
    payload: UserSyncRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> MeResponse:
    """Sync user profile after Supabase signup.

    The frontend calls this immediately after supabase.auth.signUp() succeeds,
    passing the user's chosen name and role so we can persist them in our DB.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")

    try:
        jwt_payload = verify_supabase_jwt(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    supabase_uid: str = jwt_payload.get("sub", "")
    email: str = jwt_payload.get("email", "")

    if not supabase_uid or not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token claims")

    user = sync_user_profile(
        supabase_uid=supabase_uid,
        email=email,
        name=payload.name,
        role=payload.role,
        db=db,
    )

    return MeResponse(
        success=True,
        data=UserProfileResponse(
            id=user.id,
            name=user.name,
            email=user.email,
            role=user.role,
            supabase_uid=user.supabase_uid,
        ),
    )


@router.get("/me", response_model=MeResponse)
def get_me(current_user: User = Depends(get_current_user)) -> MeResponse:
    """Return the current authenticated user's profile."""
    return MeResponse(
        success=True,
        data=UserProfileResponse(
            id=current_user.id,
            name=current_user.name,
            email=current_user.email,
            role=current_user.role,
            supabase_uid=current_user.supabase_uid,
        ),
    )
