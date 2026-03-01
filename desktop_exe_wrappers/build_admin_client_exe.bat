@echo off
setlocal enabledelayedexpansion

REM Build SoftiBridge Admin/Client desktop wrappers as Windows EXE using PyInstaller
REM Run this file on Windows from the desktop_exe_wrappers folder.

where pyinstaller >nul 2>nul
if errorlevel 1 (
  echo [ERROR] PyInstaller non trovato. Installa con: pip install pyinstaller
  exit /b 1
)

set ROOT=%~dp0
for %%I in ("%ROOT%..") do set PROJECT_ROOT=%%~fI
set ADMIN_SRC=%PROJECT_ROOT%\softibot_review\SOFTIBOT COMPLETO\admin_webapp
set CLIENT_SRC=%PROJECT_ROOT%\softibot_review\SOFTIBOT COMPLETO\client_webapp

if not exist "%ADMIN_SRC%\index.html" (
  echo [ERROR] admin_webapp non trovato: %ADMIN_SRC%
  exit /b 1
)
if not exist "%CLIENT_SRC%\index.html" (
  echo [ERROR] client_webapp non trovato: %CLIENT_SRC%
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

echo [INFO] Build SoftiBridge_Client.exe ...
pyinstaller ^
  --noconfirm ^
  --onefile ^
  --name SoftiBridge_Client ^
  --add-data "%CLIENT_SRC%;client_webapp" ^
  --add-data "%ROOT%webapp_proxy_host.py;." ^
  "%ROOT%client_launcher.py"
if errorlevel 1 exit /b 1

echo.
echo [OK] Build completata.
echo Dist:
echo   %ROOT%dist\SoftiBridge_Admin.exe
echo   %ROOT%dist\SoftiBridge_Client.exe
echo.
echo Uso:
echo   SoftiBridge_Admin.exe --backend http://127.0.0.1:8000
echo   SoftiBridge_Client.exe --backend http://127.0.0.1:8000

endlocal

