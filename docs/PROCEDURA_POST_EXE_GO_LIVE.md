# SoftiBridge - Procedura Esatta Post-EXE (Admin / Client / Landing) e Go-Live

Questa procedura descrive i passaggi da eseguire DOPO aver creato:
- `SoftiBridge_Admin.exe`
- `SoftiBridge_Client.exe`
- `SoftiBridge_Landing.exe` (opzionale wrapper desktop della landing; normalmente la landing va deployata su hosting web)

Obiettivo: portare il sistema in stato **vendibile** (beta privata o pre-produzione) in modo ordinato.

## 1. Preparazione release (struttura consigliata)
Creare una cartella release con questa struttura minima:

- `backend/`
- `webapps/landing_page/`
- `webapps/admin_webapp/`
- `webapps/client_webapp/`
- `ea_patches/` (sorgenti MQL4/MQL5 patchati da compilare)
- `desktop_exe_wrappers/` (solo per build/manutenzione EXE)
- `docs/`

## 2. Backend: configurazione ambiente
### 2.1 Installazione dipendenze
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2.2 Creazione `.env`
```bash
cp .env.example .env
```
Compilare OBBLIGATORIAMENTE:
- `DATABASE_URL`
- `JWT_SECRET`
- `EA_HMAC_SECRET`
- `SOFTIBRIDGE_FILE_BRIDGE_BASE`
- `INVOICE_ISSUER_*`
- `BILLING_INVOICE_SERIES`
- `BANK_*`
- `USDT_TRON_*`
- `MANUAL_PAYMENT_PROOFS_DIR`

Compilare per andare live:
- `STRIPE_*`
- `SMTP_*`
- `TELEGRAM_*`

### 2.3 Setup semplificato (consigliato) via Admin WebApp Plug&Play
Dopo aver avviato il backend (anche con `.env` minimo), puoi configurare quasi tutto dalla webapp Admin:

1. Apri `Admin.exe` oppure `webapps/admin_webapp/index.html`
2. Vai in `Configurazioni` -> sezione `🔌 Plug&Play Setup Center`
3. Imposta URL API (es. `https://api.tuodominio.com/api`)
4. Login admin (`Login` o `Registra+Login`)
5. Compila e salva da UI:
- Telegram (`BOT_TOKEN`, chat ID, webhook)
- Stripe (`STRIPE_*`)
- SMTP (`SMTP_*`)
- Billing (ragione sociale, VAT, serie)
- Bonifico / USDT
- Bridge path EA (se file-based)
6. Usa i test integrati:
- `Test API`
- `Test Telegram`
- `Set Webhook`
- `Test SMTP`

Nota: il backend aggiorna `.env` e ricarica la config in memoria. In produzione è comunque consigliato riavviare il servizio backend dopo modifiche sensibili.

## 3. Database PostgreSQL
### 3.1 Creare DB e utente
- Creare database `softibridge`
- Creare utente applicativo con permessi sul DB

### 3.2 Avvio backend e schema
Il backend crea le tabelle in startup (`Base.metadata.create_all`) per MVP.
Per produzione è consigliato passare ad Alembic in seguito.

```bash
uvicorn app.main:app --reload
```

Verifica:
- `GET /api/health`
- `GET /preview`

## 4. Stripe (automatico)
### 4.1 Dashboard Stripe
Creare/configurare:
- chiave segreta + publishable
- webhook endpoint: `https://TUO_DOMINIO/api/stripe/webhook`
- prodotti/prezzi coerenti con piani (BASIC/PRO/ENTERPRISE)

### 4.2 `.env`
Compilare:
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `STRIPE_BILLING_PORTAL_RETURN_URL`

### 4.3 Test live (obbligatorio)
- pagamento Stripe test mode
- verifica webhook
- fattura auto emessa / aggiornata

## 5. Pagamenti manuali (Bonifico / USDT TRON)
### 5.1 Bonifico
Configurare in `.env`:
- `BANK_ACCOUNT_NAME`
- `BANK_NAME`
- `BANK_IBAN`
- `BANK_BIC_SWIFT`
- `BANK_PAYMENT_REASON_TEMPLATE`

### 5.2 USDT TRON
Configurare in `.env`:
- `USDT_TRON_WALLET_ADDRESS`
- `USDT_TRON_NETWORK_LABEL=TRC20`
- `USDT_PRICE_BUFFER_PCT`

### 5.3 Cartella prove pagamento
Impostare e creare:
- `MANUAL_PAYMENT_PROOFS_DIR`

Il sistema salva qui screenshot/PDF ricevute bonifico/USDT.

## 6. Fatturazione (manuale + automatica)
### 6.1 Flusso manuale corretto
- Admin emette `PROFORMA` (bonifico/usdt)
- Cliente paga e invia CRO/TXID (+ ricevuta opzionale)
- Admin verifica
- Sistema converte `PROFORMA -> INVOICE` con numerazione fiscale centralizzata
- Stato `PAID`

### 6.2 Numerazione fiscale
- Centrale nel backend (`invoice_sequences`)
- Formato: `ANNO/SERIE/NNNNNN` (es. `2026/A/000001`)
- Non numerare mai dal frontend

### 6.3 Fiscale/contabile
Convalidare con commercialista:
- quando emettere proforma vs fattura
- gestione incassi crypto (USDT)
- IVA / reverse charge / esente / extra-UE

## 7. Email fatture (SMTP)
### 7.1 `.env`
Compilare:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`
- `SMTP_USE_TLS`

### 7.2 Test
Da admin, pulsante `Invia` su fattura:
- email con allegato PDF
- (eventuale) Telegram notifica
- audit log registrato

## 8. Telegram (@softibridge)
### 8.1 Dati necessari
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_URL`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_ADMIN_SUPER_CHAT_ID`

### 8.2 Test setup
Usare:
- `/preview/setup`
- `Check Telegram`
- `Set Webhook`
- `Test messaggio admin`

## 9. EA / MT4 / MT5 (fondamentale)
### 9.1 Compilazione (manuale, MetaEditor)
Compilare i file patchati:
- `softibridge_lite_v2_v3.03_REMOTE.mq4`
- `SoftiBridge_MT5_v3_21_PENDING_REMOTE.mq5`

### 9.2 Installazione terminali
Installare gli EA compilati e verificare che usino la stessa cartella bridge (`SOFTIBRIDGE_FILE_BRIDGE_BASE`).

### 9.3 Verifiche
Controllare produzione file:
- `inbox/cmd_queue.txt`
- `inbox/cmd_queue_mt5.txt`
- `outbox/events.txt`
- `outbox/res_*.txt`
- `state/positions_*.txt`
- `state/pending_*.txt`

## 10. Web App EXE (Admin / Client / Landing)
### 10.1 EXE wrapper Admin e Client
Gli EXE desktop devono puntare al backend API (proxy locale incluso nei wrapper).
Verificare:
- apertura UI
- chiamate `/api/*`
- login/token
- bottoni principali

### 10.2 Landing
Scelta consigliata:
- deploy web su dominio (più corretto per marketing/SEO)
- EXE landing solo per demo/offline commerciale

### 10.3 Test minimi EXE
- `Admin.exe`: login, clienti, licenze, fatture, approvazione manual payments
- `Client.exe`: area download, fatture, Stripe/Bonifico/USDT, upload ricevuta
- `Landing.exe` o landing web: checkout e cambio lingua

## 11. Deploy produzione (server)
### 11.1 Reverse proxy + HTTPS
Usare `Nginx` o `Caddy` davanti a Uvicorn/Gunicorn.
Configurare:
- HTTPS (certificato valido)
- proxy `/api`
- webhook Stripe e Telegram raggiungibili da internet

### 11.2 Servizio backend
Eseguire il backend come servizio (systemd / NSSM / Docker).
Riavvio automatico in caso di crash.

### 11.3 Backup e retention
- Backup DB automatico giornaliero
- Backup cartelle: `generated_invoices`, `manual_payment_proofs`
- Test restore periodico

## 12. Go-Live QA finale (obbligatorio)
Eseguire e spuntare:
- `docs/FINAL_QA_CHECKLIST.md`
- checklist fatturazione (Stripe/Bonifico/USDT) fornita in chat

Minimo per andare live (beta privata):
- Stripe testato (o disabilitato esplicitamente)
- Bonifico testato
- USDT testato
- Fatture PDF + download testati
- Email/Telegram testati (almeno uno)
- EA bridge testato con 1 terminale MT4 e/o MT5

## 13. Vendibilità (cosa serve per dire “pronto”)
### 13.1 Tecnico
- Test end-to-end passati
- Nessun errore bloccante nei log
- Backup attivi
- HTTPS attivo

### 13.2 Legale/commerciale
- Privacy Policy
- Termini di servizio
- Refund policy
- Disclaimer rischi trading
- Verifica commercialista (IVA/crypto/proforma)

## 14. Limiti attuali noti (da chiudere per produzione piena)
- Alcune aree admin/client restano ibride (mock + API fallback)
- Fee network / payout engine backend non ancora completo enterprise-grade
- UX da rifinire ulteriormente per alcune schermate secondarie

## 15. Sequenza finale consigliata (operativa)
1. Configura `.env`
2. Avvia backend + PostgreSQL
3. Test `/preview/setup`
4. Bootstrap demo e test pannelli
5. Compila e collega EA
6. Test pagamenti (Stripe + Bonifico + USDT)
7. Test fatture + email
8. Test bot Telegram
9. Deploy HTTPS
10. Soft launch (beta privata)
11. Monitoraggio 7-14 giorni
12. Apertura vendite pubbliche
