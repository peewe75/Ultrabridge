#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UVICORN = ROOT / ".venv" / "Scripts" / "uvicorn.exe"
PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"
SMOKE = ROOT / "scripts" / "smoke_test_softibridge.py"
HEALTH_URL = "http://127.0.0.1:8000/api/health"


def wait_health(timeout_s: int = 45) -> bool:
    start = time.time()
    while (time.time() - start) < timeout_s:
        try:
            with urllib.request.urlopen(HEALTH_URL, timeout=1.5) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(1)
    return False


def main() -> int:
    if not PYTHON.exists() or not UVICORN.exists() or not SMOKE.exists():
        print("[ERROR] Missing runtime files (.venv or smoke script)")
        return 1

    env = os.environ.copy()
    env.setdefault("BASE_URL", "http://127.0.0.1:8000")

    proc = subprocess.Popen(
        [str(UVICORN), "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=str(ROOT),
        env=env,
    )
    try:
        if not wait_health():
            print("[ERROR] Backend did not become healthy")
            return 1
        return subprocess.call([str(PYTHON), str(SMOKE)], cwd=str(ROOT), env=env)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    raise SystemExit(main())
