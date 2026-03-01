@echo off
setlocal enabledelayedexpansion

where pyinstaller >nul 2>nul
if errorlevel 1 (
  echo [ERROR] PyInstaller non trovato. Installa con: pip install pyinstaller
  exit /b 1
)

set ROOT=%~dp0
for %%I in ("%ROOT%..") do set PROJECT_ROOT=%%~fI
set CLIENT_SRC=%PROJECT_ROOT%\softibot_review\SOFTIBOT COMPLETO\client_webapp

if not exist "%CLIENT_SRC%\index.html" (
  echo [ERROR] client_webapp non trovata: %CLIENT_SRC%
  exit /b 1
)

echo [INFO] Build SoftiBridge_Client.exe ...
pyinstaller ^
  --noconfirm ^
  --onefile ^
  --name SoftiBridge_Client ^
  --add-data "%CLIENT_SRC%;client_webapp" ^
  --add-data "%ROOT%webapp_proxy_host.py;." ^
  "%ROOT%client_launcher.py"
if errorlevel 1 exit /b 1

echo [OK] Dist: %ROOT%dist\SoftiBridge_Client.exe
echo Uso: SoftiBridge_Client.exe --backend http://127.0.0.1:8000

endlocal

