# Guida `SoftiBridge_SuperAdmin.exe`

## Scopo
Eseguire la web app `Super Admin` come `.exe` Windows con proxy `/api` verso il backend FastAPI.

## Prerequisiti (Windows)
- Python installato (3.10+ consigliato, 3.11 meglio)
- `pip install pyinstaller`
- Backend SoftiBridge avviato (default `http://127.0.0.1:8000`)

## Build
```bat
cd desktop_exe_wrappers
build_super_admin_exe.bat
```

## Output
- `dist\SoftiBridge_SuperAdmin.exe`

## Avvio
```bat
dist\SoftiBridge_SuperAdmin.exe --backend http://127.0.0.1:8000
```

## Test rapidi
1. Login `SUPER_ADMIN`
2. Verifica sezioni:
- Gestione Admin
- Fatturazione Admin
- Report Fee Admin
- Pagamenti Admin
3. Controlla che `/api/admin/wl/*` rispondano

## Nota
L’EXE avvia la UI in browser con proxy locale. Le azioni reali richiedono backend + login.
