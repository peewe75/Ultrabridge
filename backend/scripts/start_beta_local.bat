@echo off
setlocal

set "BASE_DIR=%~dp0.."
cd /d "%BASE_DIR%"

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] Virtual environment not found in %BASE_DIR%\.venv
  echo Run setup first: python -m venv .venv ^&^& .venv\Scripts\pip install -r requirements.txt
  exit /b 1
)

if not exist ".env" (
  echo [INFO] .env not found. Creating from .env.example
  copy ".env.example" ".env" >nul
)

echo [INFO] Starting SoftiBridge backend on http://127.0.0.1:8000
".venv\Scripts\uvicorn.exe" app.main:app --host 127.0.0.1 --port 8000 --reload
