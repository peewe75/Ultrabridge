@echo off
setlocal

set "BASE_DIR=%~dp0.."
cd /d "%BASE_DIR%"

docker info >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker daemon is not running.
  echo Start Docker Desktop, then rerun this script.
  exit /b 1
)

echo [INFO] Starting PostgreSQL container...
docker compose -f "docker-compose.postgres.yml" up -d
if errorlevel 1 exit /b 1

echo [INFO] Current container status:
docker compose -f "docker-compose.postgres.yml" ps
