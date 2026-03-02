from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import AuditLog, User, Client

router = APIRouter(prefix="/clerk", tags=["clerk"])


def _extract_primary_email(user_data: dict) -> str | None:
    addresses = user_data.get("email_addresses") or []
    primary_id = user_data.get("primary_email_address_id")
    if isinstance(addresses, list):
        for row in addresses:
            if isinstance(row, dict) and row.get("id") == primary_id:
                email = row.get("email_address")
                if isinstance(email, str) and email.strip():
                    return email.strip().lower()
        for row in addresses:
            if isinstance(row, dict):
                email = row.get("email_address")
                if isinstance(email, str) and email.strip():
                    return email.strip().lower()
    email = user_data.get("email_address")
    if isinstance(email, str) and email.strip():
        return email.strip().lower()
    return None


def _svix_secret_to_bytes(secret: str) -> bytes:
    normalized = secret.strip()
    if normalized.startswith("whsec_"):
        normalized = normalized.split("_", 1)[1]
    padding = "=" * (-len(normalized) % 4)
    try:
        return base64.b64decode(normalized + padding)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="CLERK_WEBHOOK_SECRET non valido") from exc


def _verify_svix_signature(
    payload_text: str,
    secret: str,
    svix_id: str | None,
    svix_timestamp: str | None,
    svix_signature: str | None,
) -> None:
    if not svix_id or not svix_timestamp or not svix_signature:
        raise HTTPException(status_code=400, detail="Header webhook Clerk mancanti")

    try:
        ts = int(svix_timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="svix-timestamp non valido") from exc

    now = int(time.time())
    if abs(now - ts) > 300:
        raise HTTPException(status_code=400, detail="Webhook Clerk fuori finestra temporale")

    signed_content = f"{svix_id}.{svix_timestamp}.{payload_text}".encode("utf-8")
    digest = hmac.new(_svix_secret_to_bytes(secret), signed_content, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("utf-8")

    provided = [item.strip() for item in svix_signature.split(" ") if item.strip()]
    for item in provided:
        try:
            version, value = item.split(",", 1)
        except ValueError:
            continue
        if version != "v1":
            continue
        if hmac.compare_digest(value, expected):
            return
    raise HTTPException(status_code=403, detail="Firma webhook Clerk non valida")


def _apply_user_upsert(db: Session, user_data: dict, event_type: str) -> dict:
    clerk_user_id = (user_data.get("id") or "").strip()
    if not clerk_user_id:
        raise HTTPException(status_code=400, detail="Evento Clerk senza user id")

    email = _extract_primary_email(user_data)
    suspended = bool(user_data.get("banned") or user_data.get("locked") or user_data.get("deleted"))
    status = "SUSPENDED" if suspended else "ACTIVE"

    # Match primario (lock)
    existing = db.query(User).filter(User.clerk_user_id == clerk_user_id).with_for_update().one_or_none()
    if existing:
        details: dict[str, object] = {"mode": "matched_clerk_user_id", "user_id": existing.id}
        if email and email.lower() != existing.email.lower():
            email_owner = db.query(User).filter(User.email == email.lower()).with_for_update().one_or_none()
            if not email_owner or email_owner.id == existing.id:
                existing.email = email.lower()
            else:
                details["email_conflict"] = {"email": email, "owner_user_id": email_owner.id}
                print(f"[WEBHOOK ERROR] Ambiguous merge: User {existing.id} tried to claim email {email} owned by {email_owner.id}")
        existing.status = status
        db.add(existing)
        return details

    # Match secondario
    linked_by_email = db.query(User).filter(User.email == email.lower()).with_for_update().one_or_none() if email else None
    if linked_by_email:
        if linked_by_email.clerk_user_id and linked_by_email.clerk_user_id != clerk_user_id:
            # Conflitto fatale!
            db.rollback()
            print(f"[WEBHOOK ERROR] Account takeover attempt? Email {email} is bound to {linked_by_email.clerk_user_id}, not {clerk_user_id}")
            raise HTTPException(status_code=409, detail="Email già associata ad un altro profilo Clerk")

        linked_by_email.clerk_user_id = clerk_user_id
        linked_by_email.status = status
        db.add(linked_by_email)
        return {"mode": "linked_existing_email", "user_id": linked_by_email.id, "email": email}

    # Creazione (Fallback 100% nuovo)
    user = User(
        id=str(uuid.uuid4()),
        email=email.lower() if email else f"{clerk_user_id}@clerk.local",
        clerk_user_id=clerk_user_id,
        password_hash="CLERK_EXTERNAL_AUTH",
        role="CLIENT",
        status=status,
    )
    db.add(user)
    db.flush()
    
    # Crea Client se creato in questo evento
    if event_type == "user.created":
        first_name = user_data.get("first_name") or ""
        last_name = user_data.get("last_name") or ""
        full_name = f"{first_name} {last_name}".strip()
        if not full_name:
            full_name = email.split('@')[0] if email else f"User {clerk_user_id[-6:]}"
            
        client = Client(
            id=str(uuid.uuid4()),
            user_id=user.id,
            full_name=full_name,
            email=user.email,
            status="ACTIVE"
        )
        db.add(client)
        db.flush()
        return {
            "mode": "created_sql_user_and_client",
            "user_id": user.id,
            "client_id": client.id,
            "role": user.role,
            "status": user.status,
            "event_type": event_type,
        }

    return {
        "mode": "created_sql_user",
        "user_id": user.id,
        "role": user.role,
        "status": user.status,
        "event_type": event_type,
    }


def _apply_user_deleted(db: Session, user_data: dict) -> dict:
    clerk_user_id = (user_data.get("id") or "").strip()
    if not clerk_user_id:
        raise HTTPException(status_code=400, detail="Evento Clerk senza user id")
    user = db.query(User).filter(User.clerk_user_id == clerk_user_id).one_or_none()
    if not user:
        return {"mode": "not_found", "clerk_user_id": clerk_user_id}
    user.status = "SUSPENDED"
    db.add(user)
    return {"mode": "suspended", "user_id": user.id, "clerk_user_id": clerk_user_id}


@router.post("/webhook")
async def clerk_webhook(
    request: Request,
    db: Session = Depends(get_db),
    svix_id: str | None = Header(default=None, alias="svix-id"),
    svix_timestamp: str | None = Header(default=None, alias="svix-timestamp"),
    svix_signature: str | None = Header(default=None, alias="svix-signature"),
):
    settings = get_settings()
    if not settings.clerk_webhook_secret:
        raise HTTPException(status_code=503, detail="CLERK_WEBHOOK_SECRET non configurato")

    body = await request.body()
    payload_text = body.decode("utf-8")
    _verify_svix_signature(payload_text, settings.clerk_webhook_secret, svix_id, svix_timestamp, svix_signature)

    try:
        event = json.loads(payload_text)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Payload webhook Clerk non valido") from exc

    event_id = str(event.get("id") or "")
    event_type = str(event.get("type") or "")
    event_data = event.get("data") or {}
    if not event_id or not event_type or not isinstance(event_data, dict):
        raise HTTPException(status_code=400, detail="Evento Clerk incompleto")

    already_processed = (
        db.query(AuditLog)
        .filter(
            AuditLog.action == "CLERK_WEBHOOK_EVENT",
            AuditLog.entity_type == "CLERK_EVENT",
            AuditLog.entity_id == event_id,
        )
        .one_or_none()
    )
    if already_processed:
        return {"ok": True, "duplicate": True, "event_id": event_id}

    result: dict[str, object] = {"mode": "ignored", "event_type": event_type}
    if event_type in {"user.created", "user.updated"}:
        result = _apply_user_upsert(db, event_data, event_type)
    elif event_type == "user.deleted":
        result = _apply_user_deleted(db, event_data)

    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type="CLERK",
        actor_id=(event_data.get("id") if isinstance(event_data, dict) else None),
        action="CLERK_WEBHOOK_EVENT",
        entity_type="CLERK_EVENT",
        entity_id=event_id,
        details={"event_type": event_type, "result": result},
    ))
    db.commit()

    return {"ok": True, "event_id": event_id, "event_type": event_type, "result": result}
