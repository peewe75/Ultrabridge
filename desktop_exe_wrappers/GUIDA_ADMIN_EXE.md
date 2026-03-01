# Guida `SoftiBridge_Admin.exe`

## Scopo
Eseguire la web app Admin come `.exe` Windows con proxy `/api` verso il backend FastAPI.

## Prerequisiti (Windows)
- Python installato
- `pip install pyinstaller`
- Backend SoftiBridge avviato (default `http://127.0.0.1:8000`)

## Build
```bat
cd desktop_exe_wrappers
build_admin_exe.bat
```

## Output
- `dist\SoftiBridge_Admin.exe`

## Avvio
```bat
dist\SoftiBridge_Admin.exe --backend http://127.0.0.1:8000
```

## Primo uso
1. Fai login Admin dalla preview o direttamente dalla web app (se hai auth pronta)
2. Verifica che le chiamate `/api/admin/*` rispondano
3. Testa:
- creazione cliente
- creazione licenza
- upgrade
- remote kill
- export kill-list

## Nota
L’EXE apre la web app in browser e mantiene i bottoni collegati al backend tramite proxy locale.

