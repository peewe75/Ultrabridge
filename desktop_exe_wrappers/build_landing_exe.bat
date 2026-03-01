@echo off
setlocal enabledelayedexpansion

where pyinstaller >nul 2>nul
if errorlevel 1 (
  echo [ERROR] PyInstaller non trovato. Installa con: pip install pyinstaller
  exit /b 1
)

set ROOT=%~dp0
for %%I in ("%ROOT%..") do set PROJECT_ROOT=%%~fI
set LANDING_SRC=%PROJECT_ROOT%\softibot_review\SOFTIBOT COMPLETO\landing_page

if not exist "%LANDING_SRC%\index.html" (
  echo [ERROR] landing_page non trovata: %LANDING_SRC%
  exit /b 1
)

echo [INFO] Build SoftiBridge_Landing.exe ...
pyinstaller ^
  --noconfirm ^
  --onefile ^
  --name SoftiBridge_Landing ^
  --add-data "%LANDING_SRC%;landing_page" ^
  --add-data "%ROOT%webapp_proxy_host.py;." ^
  "%ROOT%landing_launcher.py"
if errorlevel 1 exit /b 1

echo [OK] Dist: %ROOT%dist\SoftiBridge_Landing.exe
echo Uso: SoftiBridge_Landing.exe --backend http://127.0.0.1:8000

endlocal

