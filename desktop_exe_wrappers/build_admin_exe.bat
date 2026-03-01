@echo off
setlocal enabledelayedexpansion

where pyinstaller >nul 2>nul
if errorlevel 1 (
  echo [ERROR] PyInstaller non trovato. Installa con: pip install pyinstaller
  exit /b 1
)

set ROOT=%~dp0
for %%I in ("%ROOT%..") do set PROJECT_ROOT=%%~fI
set ADMIN_SRC=%PROJECT_ROOT%\softibot_review\SOFTIBOT COMPLETO\admin_webapp

if not exist "%ADMIN_SRC%\index.html" (
  echo [ERROR] admin_webapp non trovata: %ADMIN_SRC%
  exit /b 1
)

echo [INFO] Build SoftiBridge_Admin.exe ...
pyinstaller ^
  --noconfirm ^
  --onefile ^
  --name SoftiBridge_Admin ^
  --add-data "%ADMIN_SRC%;admin_webapp" ^
  --add-data "%ROOT%webapp_proxy_host.py;." ^
  "%ROOT%admin_launcher.py"
if errorlevel 1 exit /b 1

echo [OK] Dist: %ROOT%dist\SoftiBridge_Admin.exe
echo Uso: SoftiBridge_Admin.exe --backend http://127.0.0.1:8000

endlocal

