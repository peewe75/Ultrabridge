from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import StripeEvent
from app.services.stripe_service import construct_webhook_event
from app.services.webhook_processor import process_stripe_event

router = APIRouter(prefix="/stripe", tags=["stripe"])


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
):
    payload = await request.body()
    try:
        event = construct_webhook_event(payload, stripe_signature)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Webhook error: {exc}") from exc

    event_id = event["id"]
    row = StripeEvent(
        id=str(uuid.uuid4()),
        stripe_event_id=event_id,
        event_type=event["type"],
        payload=event,
        status="RECEIVED",
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return {"ok": True, "duplicate": True}

    # MVP: persiste l'evento con idempotenza. Processori specifici in step successivo.
    row.status = "STORED"
    row.processed_at = datetime.now(timezone.utc)
    db.add(row)
    process_stripe_event(db, event)
    row.status = "PROCESSED"
    db.commit()
    return {"ok": True, "event_id": event_id, "type": event["type"]}
