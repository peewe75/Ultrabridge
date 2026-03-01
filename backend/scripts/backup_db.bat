@echo off
setlocal

set "BASE_DIR=%~dp0.."
cd /d "%BASE_DIR%"

set "BACKUP_DIR=%BASE_DIR%\backups"
set "DB_FILE=%BASE_DIR%\softibridge_beta.db"
set "DB_FILE_POSTGRES=%BASE_DIR%\softibridge_postgres.db"

if not exist "%BACKUP_DIR%" (
    mkdir "%BACKUP_DIR%"
)

set "TIMESTAMP=%DATE:~-4%-%DATE:~3,2%-%DATE:~0,2%_%TIME:~0,2%-%TIME:~3,2%-%TIME:~6,2%"
set "TIMESTAMP=%TIMESTAMP: =0%"

if exist "%DB_FILE%" (
    set "BACKUP_FILE=%BACKUP_DIR%\softibridge_backup_%TIMESTAMP%.db"
    copy /Y "%DB_FILE%" "%BACKUP_FILE%" >nul
    echo [OK] SQLite backup created: %BACKUP_FILE%
    
    forfiles /p "%BACKUP_DIR%" /s /m *.db /d -7 /c "cmd /c del @path" >nul 2>&1
    echo [OK] Old backups (^>7 days) cleaned
) else (
    echo [WARN] SQLite DB not found, skipping
)

echo.
echo [INFO] Backup completed at %TIMESTAMP%
echo [INFO] Location: %BACKUP_DIR%
