"""
deps.py — FastAPI dependency injection for authentication and authorization.

Flow for every protected endpoint:
  1. Extract Bearer token from Authorization header
  2. Verify Supabase JWT → get user UUID (sub) + role from app_metadata
  3. Upsert user in local `users` table (creates profile on first login)
  4. Return User ORM object — all existing route handlers work unchanged
"""
import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.common.security import verify_supabase_jwt
from app.database.models import User
from app.database.session import get_db

logger = logging.getLogger("ai-education-api.deps")

# Use HTTPBearer instead of OAuth2PasswordBearer (Supabase tokens are not OAuth2 password flow)
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Verify Supabase JWT and return (or auto-create) the local User record.

    Raises HTTP 401 if no/invalid token.
    """
    if not credentials or not credentials.credentials:
        with open('auth_error.log', 'a') as f:
            f.write("401: Authorization header missing\n")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    try:
        payload = verify_supabase_jwt(token)
    except ValueError as exc:
        with open('auth_error.log', 'a') as f:
            f.write(f"401: verify_supabase_jwt failed: {exc}\n")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    supabase_uid: str = payload.get("sub", "")
    if not supabase_uid:
        with open('auth_error.log', 'a') as f:
            f.write("401: Token missing subject claim\n")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim",
        )

    # Extract role from Supabase user_metadata (set during signup)
    user_metadata: dict = payload.get("user_metadata", {})
    role: str = user_metadata.get("role", "")
    email: str = payload.get("email", "")
    name: str = payload.get("user_metadata", {}).get("name", email.split("@")[0] if email else "Unknown")

    # ── Upsert user in local DB (auto-provision on first login) ────────────
    user = db.query(User).filter(User.supabase_uid == supabase_uid).first()

    if not user:
        # First login: create local profile
        if not role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User role is not set. Please complete signup or contact support.",
            )
        # Check if user exists by email (e.g. from old data)
        user = db.query(User).filter(User.email == email).first()
        if user:
            # Link existing user to Supabase UID
            user.supabase_uid = supabase_uid
            if role and not user.role:
                user.role = role
        else:
            # Create brand-new user profile
            user = User(
                name=name,
                email=email,
                role=role,
                supabase_uid=supabase_uid,
                password="",  # No local password — auth is handled by Supabase
            )
            db.add(user)
        try:
            db.commit()
            db.refresh(user)
        except Exception:
            db.rollback()
            logger.exception("Failed to upsert user for supabase_uid=%s", supabase_uid)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to sync user profile",
            )

    return user


def require_role(*allowed_roles: str):
    """Role guard — usage: Depends(require_role('teacher')) or Depends(require_role('teacher', 'admin'))"""
    def role_guard(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            logger.warning("Access denied in require_role! email=%s role=%s allowed=%s", current_user.email, current_user.role, allowed_roles)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {' or '.join(allowed_roles)}.",
            )
        return current_user

    return role_guard
