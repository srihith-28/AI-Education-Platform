from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.schemas import AuthResponse, LoginRequest, SignupRequest
from app.auth.service import login, signup
from app.database.session import get_db


router = APIRouter()


@router.post("/signup", response_model=AuthResponse)
def signup_endpoint(payload: SignupRequest, db: Session = Depends(get_db)) -> AuthResponse:
    result = signup(payload, db)
    return AuthResponse(**result)


@router.post("/login", response_model=AuthResponse)
def login_endpoint(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    result = login(payload, db)
    return AuthResponse(**result)
