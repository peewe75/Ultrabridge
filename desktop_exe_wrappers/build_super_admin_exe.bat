@echo off
setlocal enabledelayedexpansion

where pyinstaller >nul 2>nul
if errorlevel 1 (
  echo [ERROR] PyInstaller non trovato. Installa con: pip install pyinstaller
  exit /b 1
)

set ROOT=%~dp0
for %%I in ("%ROOT%..") do set PROJECT_ROOT=%%~fI
set SUPER_ADMIN_SRC=%PROJECT_ROOT%\softibot_review\SOFTIBOT COMPLETO\super_admin_webapp

if not exist "%SUPER_ADMIN_SRC%\index.html" (
  echo [ERROR] super_admin_webapp non trovata: %SUPER_ADMIN_SRC%
  exit /b 1
)

echo [INFO] Build SoftiBridge_SuperAdmin.exe ...
pyinstaller ^
  --noconfirm ^
  --onefile ^
  --name SoftiBridge_SuperAdmin ^
  --add-data "%SUPER_ADMIN_SRC%;super_admin_webapp" ^
  --add-data "%ROOT%webapp_proxy_host.py;." ^
  "%ROOT%super_admin_launcher.py"
if errorlevel 1 exit /b 1

echo [OK] Dist: %ROOT%dist\SoftiBridge_SuperAdmin.exe
echo Uso: SoftiBridge_SuperAdmin.exe --backend http://127.0.0.1:8000

endlocal
