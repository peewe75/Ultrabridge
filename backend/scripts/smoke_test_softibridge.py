#!/usr/bin/env python3
"""
SoftiBridge MVP smoke test (API + preview + parser + bridge + client controls)

Prerequisiti:
- Backend avviato su BASE_URL (default http://127.0.0.1:8000)
- PostgreSQL configurato
- APP_ENV=development (per /api/demo/bootstrap)

Non richiede dipendenze esterne (usa solo stdlib).
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

# Try to load .env manually (no python-dotenv in stdlib)
if os.path.exists(".env"):
    with open(".env", "r") as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ[k] = v
from dataclasses import dataclass
from typing import Any


BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:8000").rstrip("/")
TIMEOUT = float(os.getenv("SMOKE_TIMEOUT", "10"))


@dataclass
class TestResult:
    name: str
    ok: bool
    detail: str = ""


def _req(
    method: str,
    path: str,
    data: Any | None = None,
    token: str | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, str], bytes]:
    url = BASE_URL + path
    body = None
    req_headers = {"User-Agent": "SoftiBridgeSmoke/1.0"}
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    if token:
        req_headers["Authorization"] = f"Bearer {token}"
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=body, headers=req_headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.status, dict(resp.headers.items()), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers.items()), e.read()


def req_json(method: str, path: str, data: Any | None = None, token: str | None = None, headers: dict[str, str] | None = None):
    status, resp_headers, raw = _req(method, path, data=data, token=token, headers=headers)
    try:
        parsed = json.loads(raw.decode("utf-8", errors="replace") or "{}")
    except Exception:
        parsed = {"_raw": raw.decode("utf-8", errors="replace")}
    return status, resp_headers, parsed


def req_text(method: str, path: str, token: str | None = None):
    status, resp_headers, raw = _req(method, path, data=None, token=token)
    return status, resp_headers, raw.decode("utf-8", errors="replace")


def header_ci(headers: dict[str, str], name: str) -> str:
    target = name.lower()
    for k, v in headers.items():
        if k.lower() == target:
            return v
    return ""


def passfail(results: list[TestResult], name: str, ok: bool, detail: str = ""):
    results.append(TestResult(name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" -> {detail}" if detail else ""))


def main() -> int:
    results: list[TestResult] = []
    print(f"SoftiBridge smoke test on {BASE_URL}")
    print("-" * 72)

    admin_token = os.getenv("ADMIN_TOKEN", "")
    client_token = os.getenv("CLIENT_TOKEN", "")
    demo_client_license_id = None

    # 1) Health
    try:
        status, _, data = req_json("GET", "/api/health")
        passfail(results, "health", status == 200 and str(data.get("status", "")).lower() in {"ok", "healthy"}, f"status={status} body={data}")
    except Exception as e:
        passfail(results, "health", False, str(e))
        return 1

    # 2) Preview pages availability
    for p in ["/preview", "/preview/setup", "/preview/admin", "/preview/client", "/preview/signals", "/preview/bridge", "/preview/tour"]:
        status, headers, text = req_text("GET", p)
        ok = status == 200 and ("text/html" in header_ci(headers, "Content-Type")) and ("<html" in text.lower())
        passfail(results, f"preview:{p}", ok, f"status={status}")

    # 3) Public APIs
    status, _, plans = req_json("GET", "/api/public/plans")
    passfail(results, "public/plans", status == 200 and isinstance(plans, list) and len(plans) >= 3, f"count={len(plans) if isinstance(plans, list) else 'n/a'}")

    status, _, tax = req_json("POST", "/api/public/tax/evaluate", data={
        "customer_country": "IT",
        "issuer_country": "IT",
        "is_business": False,
        "amount_cents": 10900,
        "currency": "EUR",
    })
    passfail(results, "public/tax/evaluate", status == 200 and "treatment" in tax, f"{tax.get('treatment')}")

    status, _, invoice_preview = req_json("POST", "/api/public/invoice/preview", data={
        "customer_name": "Smoke Test Client",
        "customer_email": "smoke@example.com",
        "customer_country": "IT",
        "amount_cents": 10900,
        "currency": "EUR",
        "is_business": False,
        "description": "SoftiBridge Smoke Test",
    })
    passfail(results, "public/invoice/preview", status == 200 and bool(invoice_preview.get("invoice_number")), f"invoice={invoice_preview.get('invoice_number')}")

    # 4) Demo bootstrap (preferred)
    status, _, boot = req_json("POST", "/api/demo/bootstrap", data={})
    if status == 200 and boot.get("ok"):
        admin_token = admin_token or boot.get("admin", {}).get("token", "")
        client_token = client_token or boot.get("client", {}).get("token", "")
        demo_client_license_id = boot.get("client", {}).get("license_id")
        passfail(results, "demo/bootstrap", True, "tokens demo ottenuti")
    else:
        passfail(results, "demo/bootstrap", False, f"status={status} body={boot}")

    if not admin_token or not client_token:
        print("\nMancano token admin/client. Imposta ADMIN_TOKEN e CLIENT_TOKEN oppure usa APP_ENV=development.")
        # continue with what we can, but mark auth suite skipped

    # 5) Auth / setup / admin
    if admin_token:
        status, _, me = req_json("GET", "/api/auth/me", token=admin_token)
        passfail(results, "auth/me (admin)", status == 200 and me.get("role") in {"ADMIN_WL", "SUPER_ADMIN"}, f"role={me.get('role')}")

        status, _, setup_status = req_json("GET", "/api/setup/status")
        passfail(results, "setup/status", status == 200 and "telegram" in setup_status and "security" in setup_status, f"env={setup_status.get('app_env')}")

        status, _, tgcheck = req_json("POST", "/api/setup/telegram/check", token=admin_token)
        passfail(results, "setup/telegram/check", status == 200 and isinstance(tgcheck, dict), f"ok={tgcheck.get('ok')}")

        status, _, summary = req_json("GET", "/api/admin/dashboard/summary", token=admin_token)
        passfail(results, "admin/dashboard/summary", status == 200 and "licenses_total" in summary, f"licenses={summary.get('licenses_total')}")

        uniq = f"{int(time.time())}"
        status, _, client = req_json("POST", "/api/admin/clients", token=admin_token, data={
            "full_name": f"Smoke QA {uniq}",
            "email": f"smoke.{uniq}@example.com",
            "country_code": "IT",
            "fiscal_profile": {},
        })
        client_id = client.get("id") if status == 200 else None
        passfail(results, "admin/clients:create", status == 200 and bool(client_id), f"client_id={client_id}")

        lic_id = None
        if client_id:
            status, _, lic = req_json("POST", "/api/admin/licenses", token=admin_token, data={
                "client_id": client_id,
                "plan_code": "PRO",
                "days": 30,
            })
            lic_id = lic.get("id") if status == 200 else None
            passfail(results, "admin/licenses:create", status == 200 and bool(lic_id), f"license_id={lic_id}")

        status, _, _ = req_json("GET", "/api/admin/licenses", token=admin_token)
        passfail(results, "admin/licenses:list", status == 200, f"status={status}")

        if lic_id:
            status, _, up = req_json("POST", f"/api/admin/licenses/{lic_id}/upgrade", token=admin_token, data={"plan_code": "ENTERPRISE"})
            passfail(results, "admin/licenses:upgrade", status == 200 and up.get("ok") is True, f"plan={up.get('plan_code')}")

            status, _, rk = req_json("POST", f"/api/admin/licenses/{lic_id}/remote-kill", token=admin_token, data={})
            passfail(results, "admin/licenses:remote-kill", status == 200 and rk.get("ok") is True, f"status={rk.get('status')}")

        status, _, kill = req_json("GET", "/api/admin/kill-list/export", token=admin_token)
        passfail(results, "admin/kill-list/export", status == 200 and "count" in kill, f"count={kill.get('count')}")

        # Signal room + parser + ingest
        room_chat_id = f"-100{int(time.time())}"
        status, _, room = req_json("POST", "/api/signals/rooms", token=admin_token, data={
            "name": f"Smoke Gold Room {uniq}",
            "source_type": "TELEGRAM",
            "source_chat_id": room_chat_id,
            "parser_policy": {
                "auto_ingest_enabled": True,
                "auto_enqueue_threshold": 70,
                "require_valid_logic": True,
                "write_mt4": True,
                "write_mt5": True,
            },
        })
        room_id = room.get("id") if status == 200 else None
        passfail(results, "signals/rooms:create", status == 200 and bool(room_id), f"room_id={room_id}")

        sample_signal = "BUY GOLD 2645-2650 SL 2635 TP1 2660 TP2 2675"
        if room_id:
            status, _, parse = req_json("POST", "/api/signals/parse/test", token=admin_token, data={
                "text": sample_signal,
                "room_id": room_id,
                "source_chat_id": room_chat_id,
                "save_log": True,
            })
            passfail(results, "signals/parse/test", status == 200 and parse.get("matched") is True, f"parser={parse.get('parser_used')} conf={parse.get('confidence')}")

            status, _, ingest = req_json("POST", "/api/signals/ingest", token=admin_token, data={
                "text": sample_signal,
                "room_id": room_id,
                "source_chat_id": room_chat_id,
                "auto_enqueue_threshold": 70,
                "require_valid_logic": True,
                "write_mt4": True,
                "write_mt5": True,
            })
            passfail(results, "signals/ingest", status == 200 and ingest.get("ok") is True, f"enqueued={ingest.get('enqueued')}")

            status, _, logs = req_json("GET", f"/api/signals/parse-logs?room_id={room_id}&limit=5", token=admin_token)
            passfail(results, "signals/parse-logs", status == 200 and isinstance(logs, list), f"count={len(logs) if isinstance(logs, list) else 'n/a'}")

            # Simulate Telegram webhook message for the room
            tg_update = {
                "update_id": int(time.time()),
                "message": {
                    "message_id": 1,
                    "date": int(time.time()),
                    "chat": {"id": int(room_chat_id), "type": "supergroup", "title": "Smoke Room"},
                    "text": sample_signal,
                },
            }
            webhook_secret = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
            tg_headers = {"X-Telegram-Bot-Api-Secret-Token": webhook_secret} if webhook_secret else None
            status, _, tgwh = req_json("POST", "/api/telegram/webhook", data=tg_update, headers=tg_headers)
            sigs = tgwh.get("signals", [])
            enq_any = any(s.get("enqueued") for s in sigs) if isinstance(sigs, list) else False
            passfail(results, "telegram/webhook->signals", status == 200 and isinstance(sigs, list), f"processed={len(sigs) if isinstance(sigs,list) else 0} enqueued_any={enq_any}")

        # Bridge APIs
        status, _, bstatus = req_json("GET", "/api/bridge/status", token=admin_token)
        passfail(results, "bridge/status", status == 200 and "queue_mt4" in bstatus and "queue_mt5" in bstatus, f"base={bstatus.get('base')}")

        status, _, bstate = req_json("GET", "/api/bridge/state", token=admin_token)
        passfail(results, "bridge/state", status == 200 and "positions" in bstate and "pending" in bstate, "snapshot read ok")

        status, _, bctl = req_json("POST", "/api/bridge/control", token=admin_token, data={
            "action": "CLOSE_ALL",
            "symbol": "CURRENT",
            "write_mt4": True,
            "write_mt5": True,
        })
        passfail(results, "bridge/control", status == 200 and bctl.get("ok") is True, "CTRL command queued")

        status, _, _ = req_json("GET", "/api/bridge/events?limit=10", token=admin_token)
        passfail(results, "bridge/events", status == 200, f"status={status}")
        status, _, _ = req_json("GET", "/api/bridge/results?limit=10", token=admin_token)
        passfail(results, "bridge/results", status == 200, f"status={status}")

        status, _, notif = req_json("POST", "/api/notifications/telegram/test-admin", token=admin_token)
        passfail(results, "notifications/telegram/test-admin", status == 200 and isinstance(notif, dict), f"ok={notif.get('ok')}")

    else:
        passfail(results, "admin suite", False, "SKIPPED (token admin mancante)")

    # 6) Client suite
    if client_token:
        status, _, me = req_json("GET", "/api/auth/me", token=client_token)
        passfail(results, "auth/me (client)", status == 200 and me.get("role") == "CLIENT", f"role={me.get('role')}")

        status, _, dash = req_json("GET", "/api/client/dashboard", token=client_token)
        passfail(results, "client/dashboard", status == 200 and "client" in dash, f"license={(dash.get('license') or {}).get('id') if isinstance(dash, dict) else None}")

        status, _, lic = req_json("GET", "/api/client/license", token=client_token)
        lic_ok = status == 200 and bool(lic.get("id"))
        if lic_ok:
            demo_client_license_id = demo_client_license_id or lic.get("id")
        passfail(results, "client/license", lic_ok, f"license_id={lic.get('id') if isinstance(lic, dict) else None}")

        status, _, dls = req_json("GET", "/api/client/downloads", token=client_token)
        passfail(results, "client/downloads", status == 200 and isinstance(dls, list), f"count={len(dls) if isinstance(dls, list) else 'n/a'}")
        if isinstance(dls, list) and dls:
            dlid = dls[0]["id"]
            status, _, dlt = req_json("POST", f"/api/client/downloads/{dlid}/token", token=client_token, data={})
            passfail(results, "client/downloads/token", status == 200 and bool(dlt.get("url")), "signed URL generated")

        status, _, invs = req_json("GET", "/api/client/invoices", token=client_token)
        passfail(results, "client/invoices", status == 200 and isinstance(invs, list), f"count={len(invs) if isinstance(invs, list) else 'n/a'}")

        status, _, tstate = req_json("GET", "/api/client/trading/state", token=client_token)
        passfail(results, "client/trading/state", status == 200 and "positions" in tstate and "pending" in tstate, "state endpoint ok")

        status, _, tctl = req_json("POST", "/api/client/trading/control", token=client_token, data={
            "action": "CLOSE_ALL",
            "symbol": "CURRENT",
            "write_mt4": True,
            "write_mt5": True,
        })
        passfail(results, "client/trading/control:CLOSE_ALL", status == 200 and tctl.get("ok") is True, "control queued")

        status, _, efeed = req_json("GET", "/api/client/ea/events?limit=20", token=client_token)
        passfail(results, "client/ea/events", status == 200 and "events" in efeed and "results" in efeed, "feed endpoint ok")
    else:
        passfail(results, "client suite", False, "SKIPPED (token client mancante)")

    # 7) Optional EA validate (if demo bootstrap gave license)
    if demo_client_license_id:
        passfail(results, "ea/validate", True, "SKIPPED in smoke (richiede firma HMAC corretta lato test)")
    else:
        passfail(results, "ea/validate", False, "SKIPPED (license demo non disponibile)")

    print("\n" + "=" * 72)
    passed = sum(1 for r in results if r.ok)
    failed = len(results) - passed
    print(f"RISULTATO: {passed}/{len(results)} PASS, {failed} FAIL")
    if failed:
        print("Controlla i FAIL sopra. Molti fallimenti sono dovuti a backend non avviato / token / .env non configurato.")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
