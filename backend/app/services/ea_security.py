from __future__ import annotations

import hashlib
import hmac
import time

from app.config import get_settings


def ea_signature_message(*, license_id: str, install_id: str, account_number: str, platform: str, timestamp: int) -> str:
    return f"{license_id}|{install_id}|{account_number}|{platform}|{timestamp}"


def verify_ea_signature(*, license_id: str, install_id: str, account_number: str, platform: str, timestamp: int, signature: str, max_skew_sec: int = 300) -> bool:
    now = int(time.time())
    if abs(now - int(timestamp)) > max_skew_sec:
        return False
    msg = ea_signature_message(
        license_id=license_id,
        install_id=install_id,
        account_number=account_number,
        platform=platform,
        timestamp=timestamp,
    ).encode("utf-8")
    secret = get_settings().ea_hmac_secret.encode("utf-8")
    expected = hmac.new(secret, msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)

