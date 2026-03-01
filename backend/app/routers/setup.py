from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.config import get_settings
from app.deps import require_roles
from app.services.email_service import EmailServiceError, send_email
from app.services.telegram_service import TelegramServiceError, get_me, get_webhook_info, set_webhook

router = APIRouter(prefix="/setup", tags=["setup"])


class SetupConfigSaveRequest(BaseModel):
    api: dict[str, Any] = Field(default_factory=dict)
    telegram: dict[str, Any] = Field(default_factory=dict)
    stripe: dict[str, Any] = Field(default_factory=dict)
    smtp: dict[str, Any] = Field(default_factory=dict)
    billing: dict[str, Any] = Field(default_factory=dict)
    bank: dict[str, Any] = Field(default_factory=dict)
    usdt: dict[str, Any] = Field(default_factory=dict)
    bridge: dict[str, Any] = Field(default_factory=dict)


def _env_path() -> Path:
    return Path(__file__).resolve().parents[2] / ".env"


def _read_env_lines() -> list[str]:
    p = _env_path()
    if not p.exists():
        return []
    return p.read_text(encoding="utf-8").splitlines()


def _upsert_env(lines: list[str], key: str, value: str) -> list[str]:
    out = []
    found = False
    prefix = f"{key}="
    for line in lines:
        if line.startswith(prefix):
            out.append(f"{key}={value}")
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f"{key}={value}")
    return out


def _apply_setup_payload_to_env(lines: list[str], req: SetupConfigSaveRequest) -> list[str]:
    mappings = {
        "api": {
            "app_env": "APP_ENV",
            "debug": "DEBUG",
        },
        "telegram": {
            "bot_username": "TELEGRAM_BOT_USERNAME",
            "bot_token": "TELEGRAM_BOT_TOKEN",
            "mode": "TELEGRAM_MODE",
            "webhook_url": "TELEGRAM_WEBHOOK_URL",
            "webhook_secret": "TELEGRAM_WEBHOOK_SECRET",
            "admin_super_chat_id": "TELEGRAM_ADMIN_SUPER_CHAT_ID",
            "admin_alerts_chat_id": "TELEGRAM_ADMIN_ALERTS_CHAT_ID",
            "support_chat_id": "TELEGRAM_SUPPORT_CHAT_ID",
        },
        "stripe": {
            "secret_key": "STRIPE_SECRET_KEY",
            "publishable_key": "STRIPE_PUBLISHABLE_KEY",
            "webhook_secret": "STRIPE_WEBHOOK_SECRET",
            "success_url": "STRIPE_SUCCESS_URL",
            "cancel_url": "STRIPE_CANCEL_URL",
            "billing_portal_return_url": "STRIPE_BILLING_PORTAL_RETURN_URL",
        },
        "smtp": {
            "host": "SMTP_HOST",
            "port": "SMTP_PORT",
            "user": "SMTP_USER",
            "password": "SMTP_PASSWORD",
            "from_email": "SMTP_FROM_EMAIL",
            "from_name": "SMTP_FROM_NAME",
            "use_tls": "SMTP_USE_TLS",
        },
        "billing": {
            "invoice_issuer_name": "INVOICE_ISSUER_NAME",
            "invoice_issuer_country": "INVOICE_ISSUER_COUNTRY",
            "invoice_issuer_vat_id": "INVOICE_ISSUER_VAT_ID",
            "invoice_series": "BILLING_INVOICE_SERIES",
        },
        "bank": {
            "account_name": "BANK_ACCOUNT_NAME",
            "bank_name": "BANK_NAME",
            "iban": "BANK_IBAN",
            "bic_swift": "BANK_BIC_SWIFT",
            "reason_template": "BANK_PAYMENT_REASON_TEMPLATE",
        },
        "usdt": {
            "wallet_address": "USDT_TRON_WALLET_ADDRESS",
            "network_label": "USDT_TRON_NETWORK_LABEL",
            "price_buffer_pct": "USDT_PRICE_BUFFER_PCT",
        },
        "bridge": {
            "file_bridge_base": "SOFTIBRIDGE_FILE_BRIDGE_BASE",
        },
    }
    data = req.model_dump(exclude_none=True)
    for section, field_map in mappings.items():
        sec = data.get(section) or {}
        for src_key, env_key in field_map.items():
            if src_key in sec:
                v = sec[src_key]
                if isinstance(v, bool):
                    val = "true" if v else "false"
                else:
                    val = str(v)
                lines = _upsert_env(lines, env_key, val)
    return lines


@router.get("/status")
def setup_status():
    get_settings.cache_clear()
    s = get_settings()
    return {
        "app_env": s.app_env,
        "telegram": {
            "bot_username": s.telegram_bot_username,
            "bot_token_configured": bool(s.telegram_bot_token),
            "mode": s.telegram_mode,
            "webhook_url": s.telegram_webhook_url,
            "webhook_secret_configured": bool(s.telegram_webhook_secret),
            "admin_super_chat_id_configured": bool(s.telegram_admin_super_chat_id),
            "admin_alerts_chat_id_configured": bool(s.telegram_admin_alerts_chat_id),
            "support_chat_id_configured": bool(s.telegram_support_chat_id),
        },
        "stripe": {
            "secret_key_configured": bool(s.stripe_secret_key),
            "webhook_secret_configured": bool(s.stripe_webhook_secret),
            "publishable_key_configured": bool(s.stripe_publishable_key),
        },
        "security": {
            "jwt_secret_configured": bool(s.jwt_secret and s.jwt_secret != "change-me"),
            "ea_hmac_secret_configured": bool(s.ea_hmac_secret and s.ea_hmac_secret != "change-me-ea"),
        },
        "bridge_files": {
            "base": s.softibridge_file_bridge_base or "(default: ./softibridge_runtime)",
            "configured": bool(s.softibridge_file_bridge_base),
        },
    }


@router.get("/config/current")
def setup_config_current(_user=Depends(require_roles("SUPER_ADMIN", "ADMIN_WL"))):
    get_settings.cache_clear()
    s = get_settings()
    return {
        "api": {
            "app_env": s.app_env,
            "debug": bool(s.debug),
        },
        "telegram": {
            "bot_username": s.telegram_bot_username,
            "bot_token": s.telegram_bot_token,
            "mode": s.telegram_mode,
            "webhook_url": s.telegram_webhook_url,
            "webhook_secret": s.telegram_webhook_secret,
            "admin_super_chat_id": s.telegram_admin_super_chat_id,
            "admin_alerts_chat_id": s.telegram_admin_alerts_chat_id,
            "support_chat_id": s.telegram_support_chat_id,
        },
        "stripe": {
            "secret_key": s.stripe_secret_key,
            "publishable_key": s.stripe_publishable_key,
            "webhook_secret": s.stripe_webhook_secret,
            "success_url": s.stripe_success_url,
            "cancel_url": s.stripe_cancel_url,
            "billing_portal_return_url": s.stripe_billing_portal_return_url,
        },
        "smtp": {
            "host": s.smtp_host,
            "port": s.smtp_port,
            "user": s.smtp_user,
            "password": s.smtp_password,
            "from_email": s.smtp_from_email,
            "from_name": s.smtp_from_name,
            "use_tls": bool(s.smtp_use_tls),
        },
        "billing": {
            "invoice_issuer_name": s.invoice_issuer_name,
            "invoice_issuer_country": s.invoice_issuer_country,
            "invoice_issuer_vat_id": s.invoice_issuer_vat_id,
            "invoice_series": s.billing_invoice_series,
        },
        "bank": {
            "account_name": s.bank_account_name,
            "bank_name": s.bank_name,
            "iban": s.bank_iban,
            "bic_swift": s.bank_bic_swift,
            "reason_template": s.bank_payment_reason_template,
        },
        "usdt": {
            "wallet_address": s.usdt_tron_wallet_address,
            "network_label": s.usdt_tron_network_label,
            "price_buffer_pct": s.usdt_price_buffer_pct,
        },
        "bridge": {
            "file_bridge_base": s.softibridge_file_bridge_base,
        },
        "meta": {
            "env_path": str(_env_path()),
        },
    }


@router.post("/config/save")
def setup_config_save(
    req: SetupConfigSaveRequest,
    _user=Depends(require_roles("SUPER_ADMIN", "ADMIN_WL")),
):
    envp = _env_path()
    lines = _read_env_lines()
    lines = _apply_setup_payload_to_env(lines, req)
    envp.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")
    get_settings.cache_clear()
    return {
        "ok": True,
        "saved_to": str(envp),
        "restart_required": True,
        "message": "Configurazione salvata su .env. Riavviare il backend per applicare i cambiamenti.",
    }


@router.post("/smtp/test")
def setup_smtp_test(
    to_email: str,
    _user=Depends(require_roles("SUPER_ADMIN", "ADMIN_WL")),
):
    get_settings.cache_clear()
    try:
        res = send_email(
            to_email=to_email,
            subject="SoftiBridge SMTP Test",
            body_text="Test invio SMTP da setup SoftiBridge.",
            attachments=None,
        )
        return {"ok": res.ok, "simulated": res.simulated, "detail": res.detail}
    except EmailServiceError as exc:
        return {"ok": False, "error": str(exc)}


@router.post("/telegram/check")
def setup_telegram_check(_user=Depends(require_roles("SUPER_ADMIN", "ADMIN_WL"))):
    get_settings.cache_clear()
    try:
        me = get_me()
        hook = get_webhook_info()
        return {"ok": True, "get_me": me.data, "webhook_info": hook.data, "simulated": (me.simulated or hook.simulated)}
    except TelegramServiceError as exc:
        return {"ok": False, "error": str(exc)}


@router.post("/telegram/set-webhook")
def setup_telegram_set_webhook(_user=Depends(require_roles("SUPER_ADMIN", "ADMIN_WL"))):
    get_settings.cache_clear()
    try:
        result = set_webhook()
        return {"ok": result.ok, "data": result.data, "simulated": result.simulated}
    except TelegramServiceError as exc:
        return {"ok": False, "error": str(exc)}
