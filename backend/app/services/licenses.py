from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import AuditLog, Client, License, Payment, Plan

ACTIVE_LICENSE_STATUSES = {"ACTIVE", "PAST_DUE", "GRACE_REPLACEMENT"}


def generate_license_id() -> str:
    return f"SB-{uuid.uuid4().hex[:8].upper()}"


def generate_activation_code() -> str:
    token = secrets.token_hex(4).upper()
    return f"SB-ACT-{token}"


def hash_activation_code(raw_code: str) -> str:
    return hashlib.sha256(raw_code.strip().upper().encode("utf-8")).hexdigest()


def normalize_license_status(lic: License, *, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    if lic.status == "GRACE_REPLACEMENT" and lic.grace_until and lic.grace_until <= now:
        lic.status = "REPLACED"
        if not lic.replaced_at:
            lic.replaced_at = now
    if lic.status == "ACTIVE" and lic.expiry_at and lic.expiry_at <= now:
        lic.status = "EXPIRED"
    return lic.status


def is_license_runtime_valid(lic: License, *, now: datetime | None = None) -> tuple[bool, str | None]:
    now = now or datetime.now(timezone.utc)
    status = normalize_license_status(lic, now=now)
    if status not in ACTIVE_LICENSE_STATUSES:
        return False, f"License status {status}"
    if lic.expiry_at and lic.expiry_at <= now:
        return False, "License expired"
    if status == "GRACE_REPLACEMENT" and lic.grace_until and lic.grace_until <= now:
        return False, "License grace window ended"
    return True, None


def issue_activation_code(lic: License, *, ttl_minutes: int = 20) -> str:
    now = datetime.now(timezone.utc)
    code = generate_activation_code()
    lic.activation_code_hash = hash_activation_code(code)
    lic.activation_code_expires_at = now + timedelta(minutes=max(1, ttl_minutes))
    lic.activation_code_used_at = None
    return code


def apply_license_replacement(
    db: Session,
    *,
    source_license: License,
    plan_code: str | None,
    days: int,
    grace_hours: int,
    reason: str | None,
    actor_type: str,
    actor_id: str | None,
) -> License:
    now = datetime.now(timezone.utc)
    normalized_source_status = normalize_license_status(source_license, now=now)
    if normalized_source_status in {"REPLACED", "REVOKED", "EXPIRED"}:
        raise ValueError(f"Licenza sorgente non sostituibile: {normalized_source_status}")

    target_plan = (plan_code or source_license.plan_code or "BASIC").upper()
    replacement = License(
        id=generate_license_id(),
        client_id=source_license.client_id,
        plan_code=target_plan,
        status="ACTIVE",
        expiry_at=now + timedelta(days=max(1, days)),
        install_id=None,
        mt_accounts={"MT4": [], "MT5": []},
        replaced_from_license_id=source_license.id,
        replacement_reason=reason,
    )
    db.add(replacement)
    db.flush()

    source_license.replaced_by_license_id = replacement.id
    source_license.replacement_reason = reason
    if grace_hours > 0:
        source_license.status = "GRACE_REPLACEMENT"
        source_license.grace_until = now + timedelta(hours=grace_hours)
        source_license.replaced_at = None
    else:
        source_license.status = "REPLACED"
        source_license.grace_until = now
        source_license.replaced_at = now

    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type=actor_type,
        actor_id=actor_id,
        action="LICENSE_REPLACED",
        entity_type="LICENSE",
        entity_id=source_license.id,
        details={
            "replacement_license_id": replacement.id,
            "grace_hours": grace_hours,
            "source_status": source_license.status,
            "reason": reason,
        },
    ))
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type=actor_type,
        actor_id=actor_id,
        action="LICENSE_CREATED_REPLACEMENT",
        entity_type="LICENSE",
        entity_id=replacement.id,
        details={
            "replaced_from": source_license.id,
            "grace_hours": grace_hours,
            "plan_code": replacement.plan_code,
        },
    ))
    db.commit()
    db.refresh(replacement)
    return replacement


def set_license_grace_window(
    db: Session,
    *,
    license_row: License,
    grace_hours: int,
    reason: str | None,
    actor_type: str,
    actor_id: str | None,
) -> License:
    now = datetime.now(timezone.utc)
    normalize_license_status(license_row, now=now)
    if license_row.status not in {"GRACE_REPLACEMENT", "REPLACED"}:
        raise ValueError("La licenza non è in stato replacement")

    if grace_hours > 0:
        license_row.status = "GRACE_REPLACEMENT"
        license_row.grace_until = now + timedelta(hours=grace_hours)
        license_row.replaced_at = None
    else:
        license_row.status = "REPLACED"
        license_row.grace_until = now
        license_row.replaced_at = now

    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type=actor_type,
        actor_id=actor_id,
        action="LICENSE_GRACE_UPDATED",
        entity_type="LICENSE",
        entity_id=license_row.id,
        details={
            "grace_hours": grace_hours,
            "status": license_row.status,
            "grace_until": license_row.grace_until.isoformat() if license_row.grace_until else None,
            "reason": reason,
        },
    ))
    db.commit()
    db.refresh(license_row)
    return license_row


def create_license(db: Session, *, client_id: str | None, plan_code: str, days: int) -> License:
    lic = License(
        id=generate_license_id(),
        client_id=client_id,
        plan_code=plan_code,
        status="PENDING_PAYMENT",
        expiry_at=datetime.now(timezone.utc) + timedelta(days=days),
        mt_accounts={"MT4": [], "MT5": []},
    )
    db.add(lic)
    db.add(AuditLog(
        id=str(uuid.uuid4()),
        actor_type="SYSTEM",
        action="LICENSE_CREATED",
        entity_type="LICENSE",
        entity_id=lic.id,
        details={"client_id": client_id, "plan_code": plan_code, "days": days},
    ))
    db.commit()
    db.refresh(lic)
    return lic


def admin_summary(db: Session) -> dict:
    clients_total = db.query(Client).count()
    licenses = db.query(License).all()
    licenses_total = len(licenses)
    licenses_active = sum(1 for l in licenses if l.status == "ACTIVE")

    plan_map = {p.code: p for p in db.query(Plan).filter(Plan.active.is_(True)).all()}
    active_licenses = [l for l in licenses if l.status in ACTIVE_LICENSE_STATUSES]
    mrr_cents = sum((plan_map.get(l.plan_code).monthly_price_cents or 0) for l in active_licenses if l.plan_code in plan_map)

    paid = db.query(Payment).all()
    invoices_total_cents = sum(p.amount_cents for p in paid if p.status in {"PAID", "SUCCEEDED"})

    return {
        "clients_total": clients_total,
        "licenses_total": licenses_total,
        "licenses_active": licenses_active,
        "mrr_cents": mrr_cents,
        "invoices_total_cents": invoices_total_cents,
    }
