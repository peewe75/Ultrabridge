@echo off
setlocal enabledelayedexpansion

where pyinstaller >nul 2>nul
if errorlevel 1 (
  echo [ERROR] PyInstaller non trovato. Installa con: pip install pyinstaller
  exit /b 1
)

set ROOT=%~dp0
for %%I in ("%ROOT%..") do set PROJECT_ROOT=%%~fI
set ADMIN_LITE_SRC=%PROJECT_ROOT%\softibot_review\SOFTIBOT COMPLETO\admin_lite_webapp

if not exist "%ADMIN_LITE_SRC%\index.html" (
  echo [ERROR] admin_lite_webapp non trovata: %ADMIN_LITE_SRC%
  exit /b 1
)

echo [INFO] Build SoftiBridge_AdminLite.exe ...
pyinstaller ^
  --noconfirm ^
  --onefile ^
  --name SoftiBridge_AdminLite ^
  --add-data "%ADMIN_LITE_SRC%;admin_lite_webapp" ^
  --add-data "%ROOT%webapp_proxy_host.py;." ^
  "%ROOT%admin_lite_launcher.py"
if errorlevel 1 exit /b 1

echo [OK] Dist: %ROOT%dist\SoftiBridge_AdminLite.exe
echo Uso: SoftiBridge_AdminLite.exe --backend http://127.0.0.1:8000

endlocal
