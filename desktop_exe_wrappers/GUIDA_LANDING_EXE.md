# Guida `SoftiBridge_Landing.exe`

## Scopo
Eseguire la landing page come applicazione desktop Windows (`.exe`) con proxy `/api` verso il backend.

## Prerequisiti (Windows)
- Python installato
- `pip install pyinstaller`
- Backend SoftiBridge avviato (default `http://127.0.0.1:8000`)

## Build
```bat
cd desktop_exe_wrappers
build_landing_exe.bat
```

## Output
- `dist\SoftiBridge_Landing.exe`

## Avvio
```bat
dist\SoftiBridge_Landing.exe --backend http://127.0.0.1:8000
```

## Cosa fa
- apre la landing nel browser (`http://127.0.0.1:8780`)
- inoltra `/api/public/*` al backend
- i pulsanti acquisto usano `POST /api/public/checkout/session` (se backend disponibile)

## Test rapidi
- Apri la landing
- clicca un pulsante `BASIC/PRO/ENTERPRISE`
- verifica richiesta a `/api/public/checkout/session`
- se Stripe non configurato, fallback simulato (normale in dev)

