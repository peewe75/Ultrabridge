from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from app.config import get_settings


class TelegramServiceError(RuntimeError):
    pass


@dataclass
class TelegramResult:
    ok: bool
    data: dict
    simulated: bool = False


def _api_url(method: str) -> str:
    settings = get_settings()
    if not settings.telegram_bot_token:
        raise TelegramServiceError("TELEGRAM_BOT_TOKEN mancante")
    return f"https://api.telegram.org/bot{settings.telegram_bot_token}/{method}"


def _post_json(url: str, payload: dict, headers: dict | None = None) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise TelegramServiceError(f"Telegram HTTP {e.code}: {body}") from e
    except urllib.error.URLError as e:
        raise TelegramServiceError(f"Telegram network error: {e}") from e


def _get_json(url: str) -> dict:
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise TelegramServiceError(f"Telegram HTTP {e.code}: {body}") from e
    except urllib.error.URLError as e:
        raise TelegramServiceError(f"Telegram network error: {e}") from e


def telegram_enabled() -> bool:
    return bool(get_settings().telegram_bot_token)


def get_me() -> TelegramResult:
    if not telegram_enabled():
        return TelegramResult(ok=True, data={"username": get_settings().telegram_bot_username, "mode": "simulated"}, simulated=True)
    data = _get_json(_api_url("getMe"))
    return TelegramResult(ok=bool(data.get("ok")), data=data, simulated=False)


def send_message(chat_id: str, text: str, parse_mode: str | None = None) -> TelegramResult:
    if not telegram_enabled():
        return TelegramResult(ok=True, data={"chat_id": chat_id, "text": text, "simulated": True}, simulated=True)
    payload = {"chat_id": chat_id, "text": text}
    if parse_mode:
        payload["parse_mode"] = parse_mode
    data = _post_json(_api_url("sendMessage"), payload)
    return TelegramResult(ok=bool(data.get("ok")), data=data, simulated=False)


def set_webhook() -> TelegramResult:
    settings = get_settings()
    if not settings.telegram_webhook_url:
        raise TelegramServiceError("TELEGRAM_WEBHOOK_URL mancante")
    if not telegram_enabled():
        return TelegramResult(ok=True, data={"url": settings.telegram_webhook_url, "simulated": True}, simulated=True)
    payload = {"url": settings.telegram_webhook_url}
    headers = {}
    if settings.telegram_webhook_secret:
        payload["secret_token"] = settings.telegram_webhook_secret
    data = _post_json(_api_url("setWebhook"), payload, headers=headers)
    return TelegramResult(ok=bool(data.get("ok")), data=data, simulated=False)


def get_webhook_info() -> TelegramResult:
    settings = get_settings()
    if not telegram_enabled():
        return TelegramResult(ok=True, data={"result": {"url": settings.telegram_webhook_url, "pending_update_count": 0}, "ok": True}, simulated=True)
    data = _get_json(_api_url("getWebhookInfo"))
    return TelegramResult(ok=bool(data.get("ok")), data=data, simulated=False)

