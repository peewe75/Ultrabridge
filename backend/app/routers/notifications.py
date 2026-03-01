import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_roles
from app.models import AuditLog, Client
from app.config import get_settings
from app.services.telegram_service import TelegramServiceError, send_message

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/telegram/broadcast")
def telegram_broadcast(
    message: str,
    _user=Depends(require_roles("SUPER_ADMIN", "ADMIN_WL")),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    recipients = db.query(Client).filter(Client.status == "ACTIVE").count()
    send_result = {"ok": False, "reason": "no admin chat configured"}
    if settings.telegram_admin_super_chat_id:
        try:
            result = send_message(settings.telegram_admin_super_chat_id, f"[SOFTIBRIDGE BROADCAST QUEUED]\n\n{message}")
            send_result = {"ok": result.ok, "simulated": result.simulated}
        except TelegramServiceError as exc:
            send_result = {"ok": False, "error": str(exc)}
    row = AuditLog(
        id=str(uuid.uuid4()),
        actor_type="ADMIN",
        action="TELEGRAM_BROADCAST_QUEUED",
        entity_type="NOTIFICATION",
        entity_id=None,
        details={"message": message, "recipients": recipients, "channel": "telegram", "send_result": send_result},
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    return {"ok": True, "queued": True, "channel": "telegram", "recipients": recipients, "send_result": send_result}


@router.post("/telegram/reminder-expiring")
def reminder_expiring(
    days: int = 3,
    _user=Depends(require_roles("SUPER_ADMIN", "ADMIN_WL")),
    db: Session = Depends(get_db),
):
    # Placeholder funzionale per pipeline reminder (query licenze scadenza in endpoint futuri).
    row = AuditLog(
        id=str(uuid.uuid4()),
        actor_type="SYSTEM",
        action="EXPIRY_REMINDER_JOB_TRIGGERED",
        entity_type="JOB",
        details={"days": days, "channel": "telegram"},
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    return {"ok": True, "job": "expiry_reminder", "days": days}


@router.post("/telegram/test-admin")
def telegram_test_admin(
    text: str = "Test messaggio SoftiBridge admin.",
    _user=Depends(require_roles("SUPER_ADMIN", "ADMIN_WL")),
):
    settings = get_settings()
    if not settings.telegram_admin_super_chat_id:
        return {"ok": False, "error": "TELEGRAM_ADMIN_SUPER_CHAT_ID non configurato"}
    try:
        result = send_message(settings.telegram_admin_super_chat_id, text)
        return {"ok": result.ok, "simulated": result.simulated, "data": result.data}
    except TelegramServiceError as exc:
        return {"ok": False, "error": str(exc)}
