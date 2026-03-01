import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import AuditLog
from app.services.demo_data import ensure_demo_admin, ensure_demo_client
from app.services.webhook_processor import process_stripe_event

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/bootstrap")
def bootstrap_demo(db: Session = Depends(get_db)):
    settings = get_settings()
    if settings.app_env.lower() not in {"development", "dev", "local"}:
        return {"ok": False, "error": "Disponibile solo in development"}
    admin = ensure_demo_admin(db)
    client = ensure_demo_client(db)
    db.commit()
    return {
        "ok": True,
        "admin": {
            "email": admin["user"].email,
            "password": admin["password"],
            "token": admin["token"],
            "expires_in": admin["expires_in"],
        },
        "client": {
            "email": client["user"].email,
            "password": client["password"],
            "token": client["token"],
            "expires_in": client["expires_in"],
            "license_id": client["license"].id,
        },
    }


@router.post("/simulate/invoice-paid")
def simulate_invoice_paid(db: Session = Depends(get_db), amount_cents: int = 10900):
    settings = get_settings()
    if settings.app_env.lower() not in {"development", "dev", "local"}:
        return {"ok": False, "error": "Disponibile solo in development"}
    client_pack = ensure_demo_client(db)
    stripe_sub_id = f"sub_demo_{client_pack['client'].id[:8]}"
    event = {
        "id": f"evt_demo_{uuid.uuid4().hex[:12]}",
        "type": "invoice.paid",
        "data": {
            "object": {
                "id": f"in_demo_{uuid.uuid4().hex[:10]}",
                "subscription": stripe_sub_id,
                "amount_paid": amount_cents,
                "currency": "eur",
                "customer_email": client_pack["user"].email,
            }
        },
    }
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type="DEMO",
        action="SIMULATE_INVOICE_PAID",
        entity_type="STRIPE_EVENT",
        entity_id=event["id"],
        details={"amount_cents": amount_cents},
        created_at=datetime.now(timezone.utc),
    ))
    process_stripe_event(db, event)
    db.commit()
    return {"ok": True, "event_id": event["id"], "type": event["type"]}

