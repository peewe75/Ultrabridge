from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Client, Download, Invoice, License

AUTO_ELIGIBLE_LICENSE_STATUSES = {"ACTIVE", "PAST_DUE", "GRACE_REPLACEMENT"}

# Regole automatiche base per piano.
DEFAULT_PLAN_DOWNLOADS: dict[str, set[str]] = {
    "BASIC": {"GUIDA_IT"},
    "PRO": {"GUIDA_IT", "EA_MT4", "EA_MT5"},
    "ENTERPRISE": {"GUIDA_IT", "EA_MT4", "EA_MT5"},
}


def _normalize_code_list(values: list[str] | None) -> list[str]:
    if not values:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for raw in values:
        code = str(raw or "").strip().upper()
        if not code or code in seen:
            continue
        seen.add(code)
        out.append(code)
    return out


def normalize_download_policy(raw: dict | None) -> dict:
    policy = raw or {}
    mode = str(policy.get("mode") or "AUTO").strip().upper()
    if mode not in {"AUTO", "MANUAL"}:
        mode = "AUTO"
    normalized = {
        "mode": mode,
        "manual_codes": _normalize_code_list(policy.get("manual_codes") or []),
        "allow_extra_codes": _normalize_code_list(policy.get("allow_extra_codes") or []),
        "deny_codes": _normalize_code_list(policy.get("deny_codes") or []),
    }
    return normalized


def get_client_download_policy(client: Client) -> dict:
    profile = client.fiscal_profile or {}
    if not isinstance(profile, dict):
        profile = {}
    raw = profile.get("download_policy")
    if not isinstance(raw, dict):
        raw = {}
    return normalize_download_policy(raw)


def _infer_auto_codes(db: Session, client: Client, active_download_codes: set[str]) -> set[str]:
    # 1) Entitlement da licenza attiva (acquisto piano)
    now = datetime.now(timezone.utc)
    license_row = (
        db.query(License)
        .filter(License.client_id == client.id)
        .order_by(License.created_at.desc())
        .first()
    )
    codes: set[str] = set()
    if license_row:
        status = str(license_row.status or "").upper()
        not_expired = (license_row.expiry_at is None) or (license_row.expiry_at > now)
        if status in AUTO_ELIGIBLE_LICENSE_STATUSES and not_expired:
            plan_code = str(license_row.plan_code or "").upper()
            codes.update(DEFAULT_PLAN_DOWNLOADS.get(plan_code, {"GUIDA_IT"}))

    # 2) Fallback: se cliente ha almeno una fattura pagata, abilita guida.
    has_paid_invoice = (
        db.query(Invoice)
        .filter(Invoice.client_id == client.id, Invoice.status == "PAID")
        .first()
        is not None
    )
    if has_paid_invoice:
        codes.add("GUIDA_IT")

    return {c for c in codes if c in active_download_codes}


def resolve_allowed_download_codes(db: Session, client: Client) -> set[str]:
    active_rows = db.query(Download).filter(Download.active.is_(True)).all()
    active_codes = {str(r.code or "").upper() for r in active_rows if r.code}
    if not active_codes:
        return set()

    policy = get_client_download_policy(client)
    mode = policy["mode"]
    manual_codes = set(policy["manual_codes"])
    allow_extra = set(policy["allow_extra_codes"])
    deny_codes = set(policy["deny_codes"])

    if mode == "MANUAL":
        allowed = manual_codes
    else:
        allowed = _infer_auto_codes(db, client, active_codes)
        allowed |= allow_extra
    allowed -= deny_codes
    return {c for c in allowed if c in active_codes}


def is_download_allowed_for_client(db: Session, client: Client, download_row: Download) -> bool:
    allowed_codes = resolve_allowed_download_codes(db, client)
    return str(download_row.code or "").upper() in allowed_codes
