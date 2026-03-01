# SoftiBridge Desktop EXE Wrappers (Landing / Super Admin / Admin Lite / Client)

Questa cartella contiene i launcher per creare (separati):

- `SoftiBridge_Landing.exe`
- `SoftiBridge_SuperAdmin.exe`
- `SoftiBridge_AdminLite.exe`
- `SoftiBridge_Client.exe`

Compatibilità legacy:
- `SoftiBridge_Admin.exe` (wrapper storico basato su `admin_webapp`, oggi equivalente al pannello Super Admin/legacy)

I launcher:
- servono la web app statica su `http://127.0.0.1:<porta>`
- fanno proxy delle chiamate `/api/*` verso il backend FastAPI (default `http://127.0.0.1:8000`)
- aprono il browser automaticamente

## Perché questa soluzione

Le web app `admin/client` sono HTML/CSS/JS, quindi non diventano `.exe` da sole.
Questo wrapper crea un `.exe` Windows che avvia la web app in modo pratico e mantiene i bottoni collegati al backend.

## Build su Windows (PyInstaller)

1. Installa Python 3.11+ (o 3.10+)
2. Installa PyInstaller:

```bat
pip install pyinstaller
```

3. Esegui (build completo):

```bat
cd desktop_exe_wrappers
build_all_webapps_exe.bat
```

Output atteso:
- `dist\SoftiBridge_SuperAdmin.exe`
- `dist\SoftiBridge_AdminLite.exe`
- `dist\SoftiBridge_Client.exe`
- `dist\SoftiBridge_Landing.exe`

## Build separati

```bat
build_landing_exe.bat
build_super_admin_exe.bat
build_admin_lite_exe.bat
build_client_exe.bat
```

## Guide separate

- `GUIDA_LANDING_EXE.md`
- `GUIDA_SUPER_ADMIN_EXE.md`
- `GUIDA_ADMIN_LITE_EXE.md`
- `GUIDA_CLIENT_EXE.md`
- `GUIDA_ADMIN_EXE.md` (legacy)

## Config backend

Default backend:
- `http://127.0.0.1:8000`

Puoi cambiarlo:
- con variabile ambiente `SOFTIBRIDGE_BACKEND_URL`
- oppure da riga comando:

```bat
SoftiBridge_Admin.exe --backend http://127.0.0.1:8000
SoftiBridge_SuperAdmin.exe --backend http://127.0.0.1:8000
SoftiBridge_AdminLite.exe --backend http://127.0.0.1:8000
SoftiBridge_Client.exe --backend http://127.0.0.1:8000
```

## Note

- I `.ex4/.ex5` li compili tu da MetaEditor (come concordato).
- Il backend FastAPI deve essere avviato per usare API reali.
- Se il backend non è disponibile, la UI può ancora aprirsi ma alcune funzioni mostreranno errori/fallback.
