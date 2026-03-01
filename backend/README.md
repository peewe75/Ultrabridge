# SoftiBridge Backend (MVP Base)

Base backend `FastAPI + PostgreSQL` per:
- piani pubblici / checkout Stripe
- webhook Stripe con idempotenza
- licenze / clienti (schema iniziale)
- auth JWT (email/password, estendibile)
- auth Clerk (consigliata: Clerk-only, DB SQL come source-of-truth ruoli/licenze)
- fatturazione PDF interna con classificazione fiscale (IT/EU/extra-EU, reverse charge, esente)

## Avvio rapido (locale)

1. Copia `.env.example` in `.env`
2. Crea database PostgreSQL
3. Esegui la migrazione SQL iniziale (`migrations/0001_initial.sql`)
4. Installa dipendenze
5. Avvia API

```bash
cd /Users/md/Documents/New\ project/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Endpoint iniziali

- `GET /api/health`
- `GET /api/public/plans`
- `GET /api/public/auth/providers` (discovery provider auth per frontend statici)
- `POST /api/public/checkout/session`
- `POST /api/public/tax/evaluate`
- `POST /api/public/invoice/preview`
- `POST /api/stripe/webhook`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/client/license/activation-code` (genera codice one-time per Telegram bot)
- `POST /api/admin/licenses/{license_id}/replace` (replacement con grace window)
- `PATCH /api/admin/licenses/{license_id}/grace` (aggiorna grace window replacement)
- `GET /api/admin/clients/{client_id}/download-policy` (stato policy download cliente)
- `PATCH /api/admin/clients/{client_id}/download-policy` (override admin su download cliente)
- `GET /preview` (anteprima web funzionante per checkout/tassazione/fattura)
- `GET /preview/admin` (preview admin API reale)
- `GET /preview/client` (preview client API reale)
- `GET /preview/setup` (setup primo avvio bot/admin)
- `POST /api/ea/validate` / `POST /api/ea/heartbeat` (firma HMAC richiesta)
- `POST /api/demo/bootstrap` (crea token demo admin/client)
- `POST /api/demo/simulate/invoice-paid` (simula rinnovo fattura in dev)
- `POST /api/notifications/telegram/test-admin`
- `GET /api/setup/status`
- `POST /api/setup/telegram/check`
- `POST /api/setup/telegram/set-webhook`
- `POST /api/telegram/webhook`
- `GET /api/bridge/status` / `GET /api/bridge/events` / `GET /api/bridge/results`
- `GET /api/bridge/state` (snapshot posizioni/pending da file EA)
- `POST /api/bridge/commands` (queue compatibile EA/bot originali)
- `POST /api/bridge/control` (comandi remoti EA: close/cancel/sltp)
- `GET /api/signals/rooms` / `POST /api/signals/rooms`
- `GET /api/signals/formats` / `POST /api/signals/formats`
- `POST /api/signals/parse/test`
- `POST /api/signals/ingest` (parse + enqueue bridge con threshold/confidence)
- `GET /api/signals/parse-logs`
- `GET /preview/bridge`
- `GET /preview/signals`
- `GET /preview/tour`

## Note

- `ENTERPRISE` è inizializzato a `10` slot ma modificabile da DB (`plans.slot_limit_total`).
- La logica fiscale restituisce classificazioni (`TAXABLE`, `REVERSE_CHARGE`, `EXEMPT`) e note da riportare in fattura.
- Se `STRIPE_SECRET_KEY` non è configurata, il checkout risponde in modalità `simulated=true` per permettere test UI immediati.
- In modalità Clerk-only, `/api/auth/register` e `/api/auth/login` rispondono `410` (dismessi). Usa Clerk lato frontend e passa il bearer token Clerk alle API.
- Restrizioni grace replacement per `ADMIN_WL`: usa `limits_json.license_replacement_max_grace_hours` (endpoint `PATCH /api/admin/wl/admins/{admin_wl_id}/limits`). `SUPER_ADMIN` non ha limite hard-coded.
- Download clienti automatizzati: in `AUTO` gli entitlement sono derivati dal piano acquistato/licenza attiva (con fallback guida su fattura pagata). Admin/Super Admin possono applicare override per cliente (`MANUAL`, allow list, deny list).

## Preview consigliate (browser)

- [http://127.0.0.1:8000/preview](http://127.0.0.1:8000/preview) → checkout/tasse/fattura PDF
- [http://127.0.0.1:8000/preview/admin](http://127.0.0.1:8000/preview/admin) → crea cliente/licenza/log/kill/upgrade
- [http://127.0.0.1:8000/preview/client](http://127.0.0.1:8000/preview/client) → dashboard cliente/download/billing portal
- [http://127.0.0.1:8000/preview/setup](http://127.0.0.1:8000/preview/setup) → setup bot/admin primo avvio
- [http://127.0.0.1:8000/preview/bridge](http://127.0.0.1:8000/preview/bridge) → queue/eventi/risultati EA compatibili bot originale
- [http://127.0.0.1:8000/preview/signals](http://127.0.0.1:8000/preview/signals) → Format Wizard (template regex + test parse + ingest)
- [http://127.0.0.1:8000/preview/tour](http://127.0.0.1:8000/preview/tour) → virtual tour completo

## Primo avvio rapido (demo)

1. Avvia backend
2. Esegui:

```bash
curl -X POST http://127.0.0.1:8000/api/demo/bootstrap
```

3. Copia il token admin in `/preview/setup`
4. Configura `.env` (Telegram bot token + admin chat id + secrets)
5. Riavvia backend
6. Da `/preview/setup` esegui:
   - `Check Telegram`
   - `Set Telegram Webhook` (se webhook)
   - `Invia Test a ADMIN_SUPER_CHAT_ID`
7. Apri `/preview/signals` e crea una `Sala` con `source_chat_id` della stanza Telegram
8. Incolla esempi segnale, testa parse, salva eventuale regex custom
9. I messaggi ricevuti dal webhook Telegram per quella `source_chat_id` verranno provati in auto-parse e, se `confidence` + logica OK, messi in queue EA (`cmd_queue*.txt`)

## Controllo remoto EA da Web Client (nuovo)

- Endpoint client: `GET /api/client/trading/state`, `POST /api/client/trading/control`
- Bottoni `Chiudi`, `Cancella`, `Modifica SL/TP`, `Close All` nella web client tentano ora chiamate reali al backend (fallback locale solo se manca login API).
- Gli EA devono essere compilati con i sorgenti patchati (vedi cartella `ea_patches/`) per supportare:
  - comandi queue `mode=CTRL`
  - snapshot stato in `softibridge/state/positions_*.txt` e `pending_*.txt`

## Sorgenti EA patchati (da compilare in MetaEditor)

- `/Users/md/Documents/New project/ea_patches/softibridge_lite_v2_v3.03_REMOTE.mq4`
- `/Users/md/Documents/New project/ea_patches/SoftiBridge_MT5_v3_21_PENDING_REMOTE.mq5`

## Esempio firma EA (HMAC)

Messaggio da firmare:

`license_id|install_id|account_number|platform|timestamp`

Algoritmo:

`HMAC-SHA256(secret=EA_HMAC_SECRET)`
