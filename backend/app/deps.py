from __future__ import annotations

import uuid

from fastapi import Depends, Header, HTTPException
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Client, User
from app.security_clerk import (
    ClerkVerificationError,
    extract_email_from_clerk_profile,
    fetch_clerk_user_profile,
    verify_clerk_bearer_token,
)


def _fallback_local_jwt_user(token: str, db: Session) -> User:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Token non valido") from exc
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token non valido")
    user = db.query(User).filter(User.id == user_id).one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    return user


def _resolve_identity_email(identity) -> str:
    email = identity.email
    if not email:
        profile = fetch_clerk_user_profile(identity.user_id)
        email = extract_email_from_clerk_profile(profile)
    if not email:
        raise HTTPException(
            status_code=401, detail="Token Clerk valido ma email utente non disponibile"
        )
    return email.lower()


def _default_full_name(
    email: str, first_name: str | None, last_name: str | None
) -> str:
    joined = f"{(first_name or '').strip()} {(last_name or '').strip()}".strip()
    if joined:
        return joined
    local = (email.split("@", 1)[0] if email else "") or "Cliente"
    return local.replace(".", " ").replace("_", " ").strip().title() or "Cliente"


def _ensure_client_profile(
    db: Session,
    user: User,
    *,
    email: str,
    first_name: str | None,
    last_name: str | None,
) -> None:
    if user.role != "CLIENT":
        return

    linked = (
        db.query(Client)
        .filter(Client.user_id == user.id)
        .with_for_update()
        .one_or_none()
    )
    if linked:
        changed = False
        if email and linked.email != email:
            linked.email = email
            changed = True
        if not (linked.full_name or "").strip():
            linked.full_name = _default_full_name(email, first_name, last_name)
            changed = True
        if changed:
            db.add(linked)
        return

    by_email = (
        db.query(Client).filter(Client.email == email).with_for_update().one_or_none()
        if email
        else None
    )
    if by_email:
        if by_email.user_id and by_email.user_id != user.id:
            return
        by_email.user_id = user.id
        if not (by_email.full_name or "").strip():
            by_email.full_name = _default_full_name(email, first_name, last_name)
        db.add(by_email)
        return

    client = Client(
        id=str(uuid.uuid4()),
        user_id=user.id,
        full_name=_default_full_name(email, first_name, last_name),
        email=email,
        status="ACTIVE",
    )
    db.add(client)


def _sync_user_from_clerk(token: str, db: Session) -> User:
    identity = verify_clerk_bearer_token(token)
    email = _resolve_identity_email(identity)

    user = (
        db.query(User)
        .filter(User.clerk_user_id == identity.user_id)
        .with_for_update()
        .one_or_none()
    )

    if user:
        changed = False
        if email != user.email.lower():
            email_owner = (
                db.query(User)
                .filter(User.email == email)
                .with_for_update()
                .one_or_none()
            )
            if email_owner and email_owner.id != user.id:
                print(
                    f"[AUTH ERROR] Ambiguous merge: User {user.id} tried to claim email {email} owned by {email_owner.id}"
                )
            else:
                user.email = email
                changed = True
        if changed:
            db.add(user)
        _ensure_client_profile(
            db,
            user,
            email=email,
            first_name=identity.first_name,
            last_name=identity.last_name,
        )
        db.commit()
        db.refresh(user)
        return user

    existing = (
        db.query(User).filter(User.email == email).with_for_update().one_or_none()
    )

    if existing:
        if existing.clerk_user_id and existing.clerk_user_id != identity.user_id:
            db.rollback()
            print(
                f"[AUTH ERROR] Account takeover attempt? Email {email} is bound to {existing.clerk_user_id}, not {identity.user_id}"
            )
            raise HTTPException(
                status_code=409, detail="Email già associata ad un altro profilo Clerk"
            )

        existing.clerk_user_id = identity.user_id
        db.add(existing)
        _ensure_client_profile(
            db,
            existing,
            email=email,
            first_name=identity.first_name,
            last_name=identity.last_name,
        )
        db.commit()
        db.refresh(existing)
        return existing

    new_user = User(
        id=str(uuid.uuid4()),
        email=email,
        password_hash="CLERK_EXTERNAL_AUTH",
        role="CLIENT",
        status="ACTIVE",
        clerk_user_id=identity.user_id,
    )
    db.add(new_user)
    db.flush()
    _ensure_client_profile(
        db,
        new_user,
        email=email,
        first_name=identity.first_name,
        last_name=identity.last_name,
    )
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
            raise HTTPException(
                status_code=401, detail=f"Token Clerk non valido: {exc}"
            ) from exc
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
