from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.db import Base, SessionLocal, engine
import os
import uuid
from pathlib import Path

from app.models import AdminPlan, Download, Plan
from app.routers import admin, auth, bridge, client, demo, ea, files, health, notifications, preview, public, setup, signals, stripe_webhooks, telegram
from app.services.files import ensure_demo_download_files
from app.services.position_monitor import start_position_monitor

settings = get_settings()
app = FastAPI(title=settings.app_name, debug=settings.debug)

WEBAPPS_ROOT = (Path(__file__).resolve().parents[2] / "webapps").resolve()

cors_raw = (settings.cors_allow_origins or "*").strip()
if cors_raw == "*":
    allow_origins = ["*"]
else:
    allow_origins = [o.strip() for o in cors_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
def root_redirect() -> RedirectResponse:
    return RedirectResponse(url="/landing")


if WEBAPPS_ROOT.exists():
    app.mount("/landing", StaticFiles(directory=str(WEBAPPS_ROOT / "landing_page"), html=True), name="landing")
    app.mount("/dashboard/client", StaticFiles(directory=str(WEBAPPS_ROOT / "client_webapp"), html=True), name="dashboard-client")
    app.mount("/dashboard/admin", StaticFiles(directory=str(WEBAPPS_ROOT / "admin_lite_webapp"), html=True), name="dashboard-admin")
    app.mount("/dashboard/super-admin", StaticFiles(directory=str(WEBAPPS_ROOT / "admin_webapp"), html=True), name="dashboard-super-admin")


@app.on_event("startup")
def startup() -> None:
    # Per sviluppo rapido. In produzione usare migrazioni SQL/Alembic.
    Base.metadata.create_all(bind=engine)
    os.makedirs(settings.manual_payment_proofs_dir, exist_ok=True)
    os.makedirs(settings.invoice_output_dir, exist_ok=True)
    start_position_monitor()
    db = SessionLocal()
    try:
        ensure_demo_download_files()
        defaults = [
            {
                "code": "BASIC",
                "display_name": "Basic",
                "billing_mode": "SUBSCRIPTION",
                "monthly_price_cents": 5900,
                "currency": "EUR",
                "slot_limit_total": 1,
                "feature_flags": {"telegram_groups": 1, "mt4_mt5_accounts": 1},
            },
            {
                "code": "PRO",
                "display_name": "Pro",
                "billing_mode": "SUBSCRIPTION",
                "monthly_price_cents": 10900,
                "currency": "EUR",
                "slot_limit_total": 3,
                "feature_flags": {"telegram_groups": 3, "priority_support": True},
            },
            {
                "code": "ENTERPRISE",
                "display_name": "Enterprise",
                "billing_mode": "SUBSCRIPTION",
                "monthly_price_cents": 19900,
                "currency": "EUR",
                "slot_limit_total": 10,
                "feature_flags": {"telegram_groups": 10, "white_label": True},
            },
        ]
        for payload in defaults:
            if not db.query(Plan).filter(Plan.code == payload["code"]).one_or_none():
                db.add(Plan(**payload))
        admin_plan_defaults = [
            {
                "code": "START",
                "display_name": "Admin Start",
                "monthly_price_cents": 4900,
                "currency": "EUR",
                "grace_days_default": 7,
                "default_limits": {
                    "max_clients": 25,
                    "max_active_licenses": 25,
                    "max_affiliates": 5,
                    "max_vps_nodes": 1,
                    "can_custom_branding": False,
                    "can_custom_domain": False,
                    "can_affiliates": True,
                    "can_fee_rules_override": False,
                    "can_export_reports": False,
                    "can_priority_support": False,
                },
            },
            {
                "code": "BASIC",
                "display_name": "Admin Basic",
                "monthly_price_cents": 9900,
                "currency": "EUR",
                "grace_days_default": 7,
                "default_limits": {
                    "max_clients": 75,
                    "max_active_licenses": 75,
                    "max_affiliates": 20,
                    "max_vps_nodes": 2,
                    "can_custom_branding": True,
                    "can_custom_domain": False,
                    "can_affiliates": True,
                    "can_fee_rules_override": False,
                    "can_export_reports": True,
                    "can_priority_support": False,
                },
            },
            {
                "code": "PRO",
                "display_name": "Admin Pro",
                "monthly_price_cents": 19900,
                "currency": "EUR",
                "grace_days_default": 7,
                "default_limits": {
                    "max_clients": 250,
                    "max_active_licenses": 250,
                    "max_affiliates": 75,
                    "max_vps_nodes": 5,
                    "can_custom_branding": True,
                    "can_custom_domain": True,
                    "can_affiliates": True,
                    "can_fee_rules_override": True,
                    "can_export_reports": True,
                    "can_priority_support": True,
                },
            },
            {
                "code": "ENTERPRISE",
                "display_name": "Admin Enterprise",
                "monthly_price_cents": 39900,
                "currency": "EUR",
                "grace_days_default": 7,
                "default_limits": {
                    "max_clients": 1000,
                    "max_active_licenses": 1000,
                    "max_affiliates": 500,
                    "max_vps_nodes": 20,
                    "can_custom_branding": True,
                    "can_custom_domain": True,
                    "can_affiliates": True,
                    "can_fee_rules_override": True,
                    "can_export_reports": True,
                    "can_priority_support": True,
                },
            },
        ]
        for payload in admin_plan_defaults:
            if not db.query(AdminPlan).filter(AdminPlan.code == payload["code"]).one_or_none():
                db.add(AdminPlan(id=str(uuid.uuid4()), **payload))
        demo_downloads = [
            {"code": "EA_MT4", "file_name": "SoftiBridge_EA_v2.4_MT4.ex4", "version": "2.4", "platform": "MT4"},
            {"code": "EA_MT5", "file_name": "SoftiBridge_EA_v2.4_MT5.ex5", "version": "2.4", "platform": "MT5"},
            {"code": "GUIDA_IT", "file_name": "Guida_Installazione_SoftiBridge_IT.pdf", "version": "1.0", "platform": None},
        ]
        for d in demo_downloads:
            if not db.query(Download).filter(Download.code == d["code"]).one_or_none():
                path = os.path.join(settings.downloads_dir, d["file_name"])
                db.add(Download(
                    id=str(uuid.uuid4()),
                    code=d["code"],
                    file_name=d["file_name"],
                    storage_path=path,
                    version=d["version"],
                    platform=d["platform"],
                    active=True,
                ))
        db.commit()
    finally:
        db.close()


app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(public.router, prefix=settings.api_prefix)
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(admin.router, prefix=settings.api_prefix)
app.include_router(client.router, prefix=settings.api_prefix)
app.include_router(ea.router, prefix=settings.api_prefix)
app.include_router(files.router, prefix=settings.api_prefix)
app.include_router(notifications.router, prefix=settings.api_prefix)
app.include_router(demo.router, prefix=settings.api_prefix)
app.include_router(bridge.router, prefix=settings.api_prefix)
app.include_router(signals.router, prefix=settings.api_prefix)
app.include_router(setup.router, prefix=settings.api_prefix)
app.include_router(telegram.router, prefix=settings.api_prefix)
app.include_router(stripe_webhooks.router, prefix=settings.api_prefix)
app.include_router(preview.router)


@app.on_event("shutdown")
def shutdown() -> None:
    from app.services.position_monitor import stop_position_monitor
    stop_position_monitor()
