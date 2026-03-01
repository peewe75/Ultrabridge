@echo off
setlocal

set "BASE_DIR=%~dp0.."
cd /d "%BASE_DIR%"

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] .venv not found
  exit /b 1
)

echo [INFO] Running py_compile checks...
".venv\Scripts\python.exe" -m py_compile app\main.py app\routers\admin.py app\routers\client.py app\routers\signals.py app\services\signal_parser.py scripts\smoke_test_softibridge.py
if errorlevel 1 exit /b 1

echo [INFO] Running smoke test against BASE_URL (default http://127.0.0.1:8000)...
".venv\Scripts\python.exe" scripts\run_beta_check.py
if errorlevel 1 exit /b 1

echo [OK] Beta local verification completed.
