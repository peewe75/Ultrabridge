# Guida `SoftiBridge_Client.exe`

## Scopo
Eseguire la web app Client come `.exe` Windows con proxy `/api` verso il backend FastAPI.

## Prerequisiti (Windows)
- Python installato
- `pip install pyinstaller`
- Backend SoftiBridge avviato (default `http://127.0.0.1:8000`)
- (Facoltativo) EA patchati attivi per monitoraggio/controllo reale via queue

## Build
```bat
cd desktop_exe_wrappers
build_client_exe.bat
```

## Output
- `dist\SoftiBridge_Client.exe`

## Avvio
```bat
dist\SoftiBridge_Client.exe --backend http://127.0.0.1:8000
```

## Funzioni disponibili (backend attivo)
- dashboard cliente
- licenza / fatture / downloads
- feed eventi EA
- controllo trading (queue bridge):
  - `Chiudi`
  - `Chiudi tutte`
  - `Cancella pending`
  - `Modifica SL/TP`

## Test rapido consigliato
1. Avvia backend
2. Avvia `SoftiBridge_Client.exe`
3. Verifica login/token
4. Apri pannello trading
5. Clicca `Chiudi tutte` (controlla `/preview/bridge` o `cmd_queue*.txt`)

## Nota
Se il backend non è disponibile o il token manca, alcune funzioni usano fallback demo UI.

