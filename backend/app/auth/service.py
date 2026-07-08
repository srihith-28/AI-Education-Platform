"""
auth/service.py

Authentication is now fully handled by Supabase Auth.
This module provides helpers for user profile management in our local DB.
"""
import logging

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.database.models import User

logger = logging.getLogger("ai-education-api.auth")

VALID_ROLES = {"teacher", "student"}


def sync_user_profile(supabase_uid: str, email: str, name: str, role: str, db: Session) -> User:
    """Create or update the local user profile after Supabase Auth signup.

    Called once by the frontend after successful Supabase signup so the role
    is persisted in our PostgreSQL users table.
    """
    if role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Role must be one of: {', '.join(VALID_ROLES)}",
        )

    user = db.query(User).filter(User.supabase_uid == supabase_uid).first()
    if user:
        # Update mutable fields
        user.name = name or user.name
        user.role = role or user.role
        db.commit()
        db.refresh(user)
        return user

    # Check by email in case the record was pre-created
    user = db.query(User).filter(User.email == email).first()
    if user:
        user.supabase_uid = supabase_uid
        user.role = role
        db.commit()
        db.refresh(user)
        return user

    # Create new profile
    user = User(
        name=name,
        email=email,
        role=role,
        supabase_uid=supabase_uid,
        password="",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Created new user profile: email=%s role=%s", email, role)
    return user
