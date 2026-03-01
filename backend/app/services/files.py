from __future__ import annotations

import hmac
import hashlib
import os
import time
from urllib.parse import quote

from app.config import get_settings


def ensure_downloads_dir() -> str:
    settings = get_settings()
    os.makedirs(settings.downloads_dir, exist_ok=True)
    return settings.downloads_dir


def ensure_demo_download_files() -> None:
    d = ensure_downloads_dir()
    samples = {
        "SoftiBridge_EA_v2.4_MT4.ex4": b"DEMO EA MT4 PLACEHOLDER\n",
        "SoftiBridge_EA_v2.4_MT5.ex5": b"DEMO EA MT5 PLACEHOLDER\n",
        "Guida_Installazione_SoftiBridge_IT.pdf": b"%PDF-1.4\n% Demo placeholder file\n",
    }
    for name, content in samples.items():
        path = os.path.join(d, name)
        if not os.path.exists(path):
            with open(path, "wb") as f:
                f.write(content)


def make_download_signature(download_id: str, client_id: str, expires_ts: int) -> str:
    secret = get_settings().ea_hmac_secret.encode("utf-8")
    msg = f"{download_id}:{client_id}:{expires_ts}".encode("utf-8")
    return hmac.new(secret, msg, hashlib.sha256).hexdigest()


def build_download_url(download_id: str, client_id: str, expires_ts: int) -> str:
    sig = make_download_signature(download_id, client_id, expires_ts)
    return f"/api/files/download/{quote(download_id)}?client_id={quote(client_id)}&exp={expires_ts}&sig={sig}"


def verify_download_signature(download_id: str, client_id: str, exp: int, sig: str) -> bool:
    if exp < int(time.time()):
        return False
    expected = make_download_signature(download_id, client_id, exp)
    return hmac.compare_digest(expected, sig)

