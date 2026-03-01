# SoftiBridge - Checklist Operativa A Prova Di Errore (MVP)

Questa guida serve per usare il sistema end-to-end in locale (admin + client) con passaggi rapidi e fix immediati in caso di errore.

## 1) Avvio ambiente (5 minuti)

1. Apri terminale in `MVP/backend`.
2. Avvia backend:

```bat
scripts\start_beta_local.bat
```

3. In un secondo terminale, verifica tutto:

```bat
scripts\verify_beta_local.bat
```

4. Apri in browser:
   - `http://127.0.0.1:8000/preview/setup`
   - `http://127.0.0.1:8000/preview/admin`
   - `http://127.0.0.1:8000/preview/client`
   - `http://127.0.0.1:8000/preview/signals`
   - `http://127.0.0.1:8000/preview/bridge`

Esito atteso:
- Backend online su porta 8000
- Smoke test PASS
- Preview raggiungibili

## 2) Flusso Admin (operativo)

1. Vai su `preview/setup`:
   - clicca `Carica Status Setup`
   - clicca `Check Telegram`
2. Vai su `preview/admin`:
   - bootstrap/login demo
   - crea cliente
   - crea licenza
   - upgrade licenza
   - remote kill
   - verifica export kill-list

Esito atteso:
- Operazioni admin eseguite senza errori 4xx/5xx
- Dati visibili in dashboard/liste

## 3) Flusso Utente Client (operativo)

1. Vai su `preview/client`.
2. Login client demo.
3. Verifica:
   - dashboard
   - licenza
   - downloads
   - invoices
4. Esegui comando trading (es. `CLOSE_ALL`).

Esito atteso:
- API client rispondono 200
- Comando trading inoltrato al bridge

## 4) Flusso Segnali + Bridge (E2E)

1. Vai su `preview/signals`:
   - crea una room
   - esegui `Test Parse`
   - esegui `Parse + Enqueue`
2. Vai su `preview/bridge`:
   - controlla `Status`
   - controlla `State`
   - controlla `Events/Results`

Esito atteso:
- Parse log aggiornati
- Queue valorizzata in `softibridge_runtime/inbox`

## 5) Telegram (stato attuale)

- Configurazione bot presente e valida.
- `Check Telegram` deve tornare `ok=true`.
- Se `test-admin` fallisce con `chat not found`, e normale finche la chat non viene avviata con il bot.

## 6) Errori comuni e fix immediato

### Errore: porta 8000 occupata

Sintomo:
- avvio uvicorn fallisce, o vedi messaggi tipo `address already in use`.

Fix:
1. Chiudi terminali backend gia aperti.
2. Riprova `scripts\start_beta_local.bat`.
3. Se persiste, riavvia il terminale e rilancia.

### Errore: `.venv not found`

Sintomo:
- script `.bat` si fermano subito con errore `.venv`.

Fix:

```bat
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

Poi rilancia `scripts\verify_beta_local.bat`.

### Errore 401 su endpoint admin/client

Sintomo:
- chiamate API rispondono `401 Unauthorized`.

Fix:
1. Esegui bootstrap demo da preview o endpoint demo.
2. Rifai login.
3. Riprova l'azione.

### Errore 422 su parse o create client

Sintomo:
- endpoint risponde `422 Unprocessable Entity`.

Causa:
- payload non conforme allo schema richiesto.

Fix:
- usa i form della preview (inviano payload corretto)
- oppure adegua i campi richiesti (es. `text` nei parse test, `full_name` nei client)

### Errore Telegram `chat not found`

Sintomo:
- `/api/notifications/telegram/test-admin` risponde `ok=false` con `chat not found`.

Fix:
1. Apri Telegram e cerca il bot.
2. Invia `/start` al bot.
3. Verifica che `TELEGRAM_ADMIN_SUPER_CHAT_ID` sia corretto in `.env`.
4. Riprova il test.

### Docker/PostgreSQL non parte

Sintomo:
- `start_postgres_staging.bat` fallisce.

Fix:
1. Avvia Docker Desktop.
2. Rilancia `scripts\start_postgres_staging.bat`.
3. Se non serve PostgreSQL subito, resta su SQLite (gia funzionante in MVP).

## 7) Go / No-Go rapido

Vai in GO per test pre-produzione locale se:
- `scripts\verify_beta_local.bat` PASS
- Preview setup/admin/client/signals/bridge tutte raggiungibili
- Flusso admin completo ok
- Flusso client completo ok
- Parse + enqueue ok

Resti in NO-GO se:
- smoke test non passa
- 5xx su endpoint core
- impossibile creare cliente/licenza
- bridge non riceve comandi

## 8) Limiti noti MVP (attesi)

- Stripe non configurato: modalita demo/simulata.
- SMTP non configurato: invio email reale disabilitato.
- Esecuzione ordini reali dipende da EA compilati e terminali MT4/MT5 attivi.

## 9) Backup rapido DB

Esegui:

```bat
scripts\backup_db.bat
```

Output in `MVP/backend/backups`.
