from __future__ import annotations

import uuid

from fastapi import Depends, Header, HTTPException
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User
from app.security_clerk import (
    ClerkVerificationError,
    extract_email_from_clerk_profile,
    fetch_clerk_user_profile,
    verify_clerk_bearer_token,
)

def _fallback_local_jwt_user(token: str, db: Session) -> User:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Token non valido") from exc
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token non valido")
    user = db.query(User).filter(User.id == user_id).one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    return user


def _sync_user_from_clerk(token: str, db: Session) -> User:
    identity = verify_clerk_bearer_token(token)
    
    # 1. Match primario tramite clerk_user_id (lock della riga se esiste)
    user = db.query(User).filter(User.clerk_user_id == identity.user_id).with_for_update().one_or_none()
    
    if user:
        if identity.email and identity.email.lower() != user.email.lower():
            # Controllo anti-conflitto sulla nuova email
            email_owner = db.query(User).filter(User.email == identity.email.lower()).with_for_update().one_or_none()
            if email_owner and email_owner.id != user.id:
                # Conflitto fatale! Email preesistente associata ad un altro utente.
                # L'aggiornamento viene bloccato (log a sistema ma continuo a usare il vecchio record).
                print(f"[AUTH ERROR] Ambiguous merge: User {user.id} tried to claim email {identity.email} owned by {email_owner.id}")
            else:
                user.email = identity.email.lower()
                db.add(user)
                db.commit()
                db.refresh(user)
        return user

    # 2. Match secondario tramite email
    email = identity.email
    if not email:
        profile = fetch_clerk_user_profile(identity.user_id)
        email = extract_email_from_clerk_profile(profile)
    
    if not email:
        raise HTTPException(status_code=401, detail="Token Clerk valido ma email utente non disponibile")

    email = email.lower()
    existing = db.query(User).filter(User.email == email).with_for_update().one_or_none()
    
    if existing:
        if existing.clerk_user_id and existing.clerk_user_id != identity.user_id:
            # L'email esiste ed è associata a un account Clerk differente!
            db.rollback()
            print(f"[AUTH ERROR] Account takeover attempt? Email {email} is bound to {existing.clerk_user_id}, not {identity.user_id}")
            raise HTTPException(status_code=409, detail="Email già associata ad un altro profilo Clerk")
            
        # Bind sicuro
        existing.clerk_user_id = identity.user_id
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing
        
    # 3. Creazione (Fallback 100% nuovo)
    new_user = User(
        id=str(uuid.uuid4()),
        email=email,
        password_hash="CLERK_EXTERNAL_AUTH",
        role="CLIENT",
        status="ACTIVE",
        clerk_user_id=identity.user_id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Token mancante")
    token = authorization.split(" ", 1)[1]
    settings = get_settings()
    if settings.clerk_enabled:
        try:
            user = _sync_user_from_clerk(token, db)
        except ClerkVerificationError as exc:
            raise HTTPException(status_code=401, detail=f"Token Clerk non valido: {exc}") from exc
    else:
        user = _fallback_local_jwt_user(token, db)

    if user.status != "ACTIVE":
        raise HTTPException(status_code=403, detail="Utente non attivo")
    return user


def require_roles(*roles: str):
    def _checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Permessi insufficienti")
        return user
    return _checker
