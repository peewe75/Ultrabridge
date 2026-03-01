@echo off
setlocal

call "%~dp0build_landing_exe.bat" || exit /b 1
call "%~dp0build_super_admin_exe.bat" || exit /b 1
call "%~dp0build_admin_lite_exe.bat" || exit /b 1
call "%~dp0build_client_exe.bat" || exit /b 1

echo.
echo [OK] Tutti gli EXE WebApp sono stati generati in dist\
echo   SoftiBridge_Landing.exe
echo   SoftiBridge_SuperAdmin.exe
echo   SoftiBridge_AdminLite.exe
echo   SoftiBridge_Client.exe

endlocal
