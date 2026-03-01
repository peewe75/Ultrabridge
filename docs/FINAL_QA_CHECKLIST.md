# SoftiBridge Final QA Checklist (MVP)

Obiettivo: verificare rapidamente che il sistema giri **davvero** (API + preview + parser + bridge + client controls), lasciando fuori solo la compilazione `MQL4/MQL5`.

## 1. Preflight (obbligatorio)

- [ ] PostgreSQL avviato
- [ ] Backend avviato (`uvicorn app.main:app --reload`)
- [ ] `.env` compilato con almeno:
  - [ ] `DATABASE_URL`
  - [ ] `JWT_SECRET`
  - [ ] `EA_HMAC_SECRET`
  - [ ] `SOFTIBRIDGE_FILE_BRIDGE_BASE`
- [ ] Cartelle bridge presenti:
  - [ ] `softibridge/inbox`
  - [ ] `softibridge/outbox`
  - [ ] `softibridge/state`

## 2. Smoke Test Automatico (consigliato)

Esegui:

```bash
cd "/Users/md/Documents/New project/backend"
python3 scripts/smoke_test_softibridge.py
```

Cosa verifica:
- health API
- preview pages (`/preview/*`)
- piani pubblici / tasse / fattura preview
- demo bootstrap token
- setup Telegram check
- admin summary/clienti/licenze/kill-list
- signal room + parse test + ingest
- webhook Telegram -> parser -> queue
- bridge status/state/events/results
- client dashboard/download/fatture
- client trading state/control (enqueue comandi reali)

## 3. Virtual Tour (visuale)

Apri:

- [ ] `http://127.0.0.1:8000/preview/tour`

Tour step-by-step:
- [ ] Setup primo avvio bot/admin
- [ ] Checkout/fatture preview
- [ ] Admin preview
- [ ] Client preview
- [ ] Format Wizard nuove sale
- [ ] Bridge queue monitor

## 4. Setup Telegram (test rapido)

In `http://127.0.0.1:8000/preview/setup`:

- [ ] `Carica Status Setup`
- [ ] `Check Telegram`
- [ ] `Set Telegram Webhook` (solo se webhook e URL pubblico)
- [ ] `Invia Test a ADMIN_SUPER_CHAT_ID`

Esito atteso:
- con token/chat configurati: messaggio reale su Telegram
- senza token/chat: risposta coerente (errore configurazione o `simulated`)

## 5. Format Wizard (nuove sale / parser reale)

In `http://127.0.0.1:8000/preview/signals`:

- [ ] Crea sala con `source_chat_id`
- [ ] Incolla segnale standard (es. `BUY GOLD 2645-2650 SL 2635 TP1 2660 TP2 2675`)
- [ ] `Test Parse`
- [ ] Controlla `matched`, `parser_used`, `confidence`, `validation`
- [ ] `Parse + Enqueue`
- [ ] Verifica parse logs aggiornati

Test formato custom:
- [ ] Salva regex con gruppi nominati (`side`, `symbol`, `entry_lo`, `entry_hi`, `sl_price`, `tp1_price`, ...)
- [ ] Ripeti parse con segnale non-standard

## 6. Webhook Telegram -> Parser -> Queue (reale lato backend)

Prerequisito:
- [ ] Sala creata con `source_chat_id`

Test:
- [ ] Invia un messaggio nella sala Telegram (oppure usa smoke test/simulazione webhook)
- [ ] Verifica in risposta webhook / audit logs:
  - [ ] parse eseguito
  - [ ] `confidence` calcolata
  - [ ] `enqueued=true` se soglia/logica ok

## 7. Bridge EA / Queue Monitor (senza compilare EA)

In `http://127.0.0.1:8000/preview/bridge`:

- [ ] `Status Bridge` mostra path queue/outbox/state
- [ ] `Enqueue comando` scrive in queue (`cmd_queue.txt`, `cmd_queue_mt5.txt`)
- [ ] `Events` e `Results` leggono file outbox (se presenti)

Nota:
- senza EA compilati/attivi, `results` e `events` possono restare vuoti (normale).

## 8. Admin Preview (reale)

In `http://127.0.0.1:8000/preview/admin`:

- [ ] Login Admin (o token demo)
- [ ] Crea Cliente
- [ ] Crea Licenza
- [ ] Upgrade licenza
- [ ] Remote kill licenza
- [ ] Verifica `kill-list export`
- [ ] Verifica audit logs

## 9. Client Preview + Web Client Originale (controlli reali)

### Preview client
- [ ] `http://127.0.0.1:8000/preview/client`
- [ ] Login client demo
- [ ] Verifica dashboard/fatture/downloads

### Web client originale (zip)
- [ ] Apri `/Users/md/Documents/New project/softibot_review/SOFTIBOT COMPLETO/client_webapp/index.html`
- [ ] Verifica sync da backend (licenza/downloads/fatture)
- [ ] Bottoni trading:
  - [ ] `SL/TP` -> `POST /api/client/trading/control`
  - [ ] `Chiudi` -> `CLOSE_TICKET`
  - [ ] `Chiudi tutte` -> `CLOSE_ALL`
  - [ ] `Cancella pending` -> `CANCEL_TICKET`

Esito atteso:
- con backend autenticato: comando accodato realmente in queue bridge
- senza backend/token: fallback demo UI (non blocca la webapp)

## 10. Snapshot Stato Trading (monitoraggio reale via file state)

Endpoint:
- [ ] `GET /api/bridge/state`
- [ ] `GET /api/client/trading/state`

Esito atteso:
- senza EA patchati/attivi: strutture vuote ma endpoint OK
- con EA patchati attivi: `positions_mt4/mt5`, `pending_mt4/mt5` popolati

## 11. Accettazione MVP (questa fase)

Puoi considerare la fase **PASSATA** se:
- [ ] Smoke test passa (o fallimenti solo per Telegram live non configurato)
- [ ] Virtual tour e preview aprono tutte
- [ ] Parser segnali legge standard + almeno 1 formato custom
- [ ] Webhook Telegram produce parse log / enqueue
- [ ] Bridge queue riceve comandi segnali e controlli client
- [ ] Admin/client panel parlano con backend

## 12. Fuori scope in questa checklist (esplicitamente escluso)

- [ ] Compilazione MetaEditor `MQL4/MQL5`
- [ ] Test di esecuzione ordini reali a mercato su broker live/demo
- [ ] Stripe live con chiavi reali e webhook pubblici
- [ ] Compliance fiscale finale con commercialista

