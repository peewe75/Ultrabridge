# Guida `SoftiBridge_AdminLite.exe`

## Scopo
Eseguire la web app `Admin Lite` (L1) come `.exe` Windows con proxy `/api` verso il backend FastAPI.

## Prerequisiti (Windows)
- Python installato (3.10+ consigliato, 3.11 meglio)
- `pip install pyinstaller`
- Backend SoftiBridge avviato (default `http://127.0.0.1:8000`)

## Build
```bat
cd desktop_exe_wrappers
build_admin_lite_exe.bat
```

## Output
- `dist\SoftiBridge_AdminLite.exe`

## Avvio
```bat
dist\SoftiBridge_AdminLite.exe --backend http://127.0.0.1:8000
```

## Test rapidi
1. Login `ADMIN_WL`
2. Verifica sezioni:
- Dashboard
- Clienti
- Licenze
- Fatture & Pagamenti
- Branding
3. Controlla scoping: vede solo i suoi dati

## Nota
L’EXE usa lo stesso backend del Super Admin, ma con permessi/scope L1.
