from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import LoginRequest, RegisterRequest, TokenResponse, UserMe
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserMe)
def register(req: RegisterRequest, db: Session = Depends(get_db)) -> UserMe:
    settings = get_settings()
    if settings.clerk_enabled:
        raise HTTPException(status_code=410, detail="Endpoint dismesso: usa Clerk per la registrazione")
    if req.role != "CLIENT":
        raise HTTPException(status_code=403, detail="Registrazione pubblica consentita solo per CLIENT")
    existing = db.query(User).filter(User.email == req.email).one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Email già registrata")
    user = User(
        id=str(uuid.uuid4()),
        email=req.email,
        password_hash=hash_password(req.password),
        role=req.role,
        status="ACTIVE",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserMe.model_validate(user, from_attributes=True)


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    settings = get_settings()
    if settings.clerk_enabled:
        raise HTTPException(status_code=410, detail="Endpoint dismesso: usa Clerk per il login")
    user = db.query(User).filter(User.email == req.email).one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    token, expires_in = create_access_token(user.id, user.role)
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.get("/me", response_model=UserMe)
def me(
    user: User = Depends(get_current_user),
) -> UserMe:
    return UserMe.model_validate(user, from_attributes=True)
