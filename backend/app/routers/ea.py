from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AuditLog, EaInstallation, License
from app.schemas import EaHeartbeatRequest, EaValidateRequest, EaValidateResponse
from app.services.ea_security import verify_ea_signature
from app.services.licenses import is_license_runtime_valid, normalize_license_status

router = APIRouter(prefix="/ea", tags=["ea"])


def _validate_common(db: Session, payload) -> tuple[bool, str | None, License | None]:
    if not verify_ea_signature(
        license_id=payload.license_id,
        install_id=payload.install_id,
        account_number=payload.account_number,
        platform=payload.platform,
        timestamp=payload.timestamp,
        signature=payload.signature,
    ):
        return False, "Invalid signature or timestamp", None

    lic = db.query(License).filter(License.id == payload.license_id).one_or_none()
    if not lic:
        return False, "License not found", None

    prev_status = lic.status
    now = datetime.now(timezone.utc)
    normalize_license_status(lic, now=now)
    changed = prev_status != lic.status
    valid, reason = is_license_runtime_valid(lic, now=now)
    if changed:
        db.add(lic)
        db.commit()
    if not valid:
        return False, reason, lic

    accounts = lic.mt_accounts or {"MT4": [], "MT5": []}
    allowed = set(accounts.get(payload.platform, []))
    if str(payload.account_number) not in allowed:
        return False, "Account not authorized for license", lic

    if lic.install_id and lic.install_id != payload.install_id:
        return False, "Install ID mismatch", lic
    return True, None, lic


@router.post("/validate", response_model=EaValidateResponse)
def ea_validate(req: EaValidateRequest, db: Session = Depends(get_db)) -> EaValidateResponse:
    valid, reason, lic = _validate_common(db, req)
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type="EA",
        action="EA_VALIDATE",
        entity_type="LICENSE",
        entity_id=req.license_id,
        level="INFO" if valid else "WARNING",
        details={"platform": req.platform, "account_number": req.account_number, "valid": valid, "reason": reason},
    ))
    db.commit()
    return EaValidateResponse(valid=valid, reason=reason, license_status=(lic.status if lic else None), expiry_at=(lic.expiry_at if lic else None))


@router.post("/heartbeat")
def ea_heartbeat(req: EaHeartbeatRequest, db: Session = Depends(get_db)):
    valid, reason, lic = _validate_common(db, req)
    if not valid or not lic:
        return {"ok": False, "reason": reason}

    if not lic.install_id:
        lic.install_id = req.install_id

    row = (
        db.query(EaInstallation)
        .filter(EaInstallation.license_id == lic.id, EaInstallation.install_id == req.install_id, EaInstallation.account_number == req.account_number)
        .one_or_none()
    )
    if not row:
        row = EaInstallation(
            id=str(uuid.uuid4()),
            license_id=lic.id,
            install_id=req.install_id,
            platform=req.platform,
            account_number=req.account_number,
            status="ACTIVE",
        )
        db.add(row)
    row.last_heartbeat_at = datetime.now(timezone.utc)
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type="EA",
        action="EA_HEARTBEAT",
        entity_type="LICENSE",
        entity_id=lic.id,
        details={"install_id": req.install_id, "platform": req.platform, "account_number": req.account_number},
    ))
    db.commit()
    return {"ok": True, "license_id": lic.id, "install_id": req.install_id}
