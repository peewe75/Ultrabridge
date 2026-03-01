# SoftiBridge - Struttura Progetto (stato attuale) per Antigravity

Data: 2026-02-25  
Stato: `MVP avanzato / pre-produzione` (non ancora certificato 100% runtime live)

## 1. Obiettivo del sistema
SoftiBridge e' un sistema di gestione per:
- vendita licenze software (landing + pannelli)
- integrazione pagamenti (`Stripe`, `Bonifico`, `USDT TRON`)
- fatturazione (`PROFORMA -> INVOICE`)
- gestione clienti / admin / affiliazione
- bridge segnali -> EA MT4/MT5 (protocollo file-based compatibile con bot/EA esistenti)
- controllo operativo da pannello admin e client

## 2. Componenti principali
### A. Frontend Web
- `landing_page` (pubblica)
- `admin_webapp` (gestionale L0/L1/L2 + billing + controllo)
- `client_webapp` (cliente finale: licenza, fatture, pagamenti, controlli trading)

### B. Backend API
- stack: `FastAPI` (Python)
- moduli principali:
  - auth
  - public checkout/plans
  - admin
  - client
  - billing/invoicing
  - stripe webhook
  - telegram
  - signals parser
  - bridge file-based EA
  - setup/config plug&play

### C. Trading Bridge / EA
- compatibilita' con logica bot/EA esistente:
  - `inbox/cmd_queue.txt`
  - `inbox/cmd_queue_mt5.txt`
  - `outbox/events.txt`
  - `outbox/res_*.txt`
  - `state/positions_*.txt`, `pending_*.txt` (patch EA)

## 3. Architettura logica (alto livello)
1. Landing -> scelta piano -> checkout (Stripe o flusso fattura)
2. Backend crea/aggiorna cliente/licenza/fattura
3. Client area mostra fatture + pagamenti + download
4. Admin area gestisce licenze/billing/network/VPS/logs
5. Telegram room / webhook -> parser segnali -> queue EA
6. EA legge queue, esegue, scrive risultati/eventi -> backend li espone

## 4. Stato di maturita' (REALE vs IBRIDO)
### Reale (backend implementato)
- auth JWT
- licenze (create/update/revoke/remote kill base)
- fatture con PDF interno
- pagamento Stripe (scaffold + hook)
- pagamento manuale (`bonifico`, `usdt trc20`) con verifica admin
- `PROFORMA -> INVOICE` con numerazione fiscale centralizzata
- archivio fatture/pagamenti lato admin e client
- parser segnali (standard + custom template + euristica)
- bridge file-based compatibile bot/EA
- endpoint setup Telegram/SMTP/config
- endpoint system control admin (analisi / maintenance / freeze / shutdown logico)

### Ibrido (parte reale + fallback demo)
- alcune dashboard metriche admin
- alcune sezioni avanzate fee/payout network
- alcune azioni legacy admin/client (alert demo)

### Mock / da completare
- alcune parti UI legacy (vecchi popup/alert)
- fee engine network persistente completo (ledger/payout enterprise)
- collaudo live Stripe/Telegram/SMTP/EA non certificato qui

## 5. Struttura Admin (nuova logica gestionale)
### Macro-sezioni sidebar
#### LIVELLO SUPER ADMIN
- `Dashboard`
- `Licenze`
- `Fatture`
- `Commissioni`
- `VPS`
- `Admin & Clienti`

#### SEZIONE ADMIN
- `Controllo Admin`
- `Registra Admin`
- `Clienti Admin`
- `Pagamenti Bot & Fee`

#### AFFILIAZIONE CLIENTI SEMPLICI
- `Affiliazione Clienti`
- `Fee Nuovo Cliente`

#### SISTEMA
- `Fee Rules`
- `Logs`
- `Settings`

### Principio UI adottato
- 1 bottone = 1 area logica
- topbar con titolo/sottotitolo compatti
- badge scope (`SUPER ADMIN`, `SEZIONE ADMIN`, `AFFILIAZIONE`, `SISTEMA`)
- focus layout su viste alias (es. `Registra Admin`, `Fee Nuovo Cliente`)
- niente dashboard con "tutto mischiato"

## 6. Struttura Client (stato attuale)
### Aree principali
- overview licenza / stato
- trading controls (close/cancel/SLTP/BE ecc. via backend bridge)
- `Download & Pagamenti`
  - risorse/download
  - fatture & pagamenti
  - archivio pagamenti manuali

### Flussi pagamento cliente
- `Stripe` (automatico)
- `Bonifico` (manuale con CRO/TRN + upload ricevuta opzionale)
- `USDT TRON` (manuale con TXID + upload screenshot opzionale)

## 7. Landing Page (stato attuale)
### Cosa c'e'
- CTA piani collegate a backend (`/api/public/checkout/session`) con fallback demo
- i18n base e miglioramenti
- sezione vendita `Admin / Super Admin` rifatta
- 6 punti vantaggi per SoftiBridge Client (non 5)

### Da rifinire ancora (per lancio premium)
- polishing finale responsive su tutte le sezioni
- testi marketing/legali definitivi in tutte le lingue
- verifiche visuali cross-device

## 8. Billing / Fatturazione (struttura attuale)
### Documento
- `PROFORMA` (manuale / richiesta pagamento)
- `INVOICE` (fattura fiscale)

### Metodi pagamento supportati
- `STRIPE`
- `BANK_TRANSFER`
- `USDT_TRC20`

### Stati pagamento (manuale)
- `UNPAID`
- `PENDING_VERIFICATION`
- `PAID`
- `REJECTED`

### Logica numerazione
- numerazione fiscale centralizzata lato backend
- progressivo annuale/serie (es. `2026/A/000001`)

## 9. Segnali / Parser / EA Bridge
### Parser segnali
- standard formats (`PIPS`, `PRICE`, `SHORTHAND`)
- template custom per sala
- fallback euristico
- validazioni BUY/SELL (coerenza SL/TP)
- confidence score e parse logs

### Integrazione Telegram
- webhook Telegram supportato
- setup/test endpoint presenti
- auto-parse messaggi per sale configurate -> enqueue queue EA

### Bridge EA
- file-based compatibile con `bot.py` e EA esistenti
- queue comandi + lettura outbox risultati/eventi
- endpoint backend per bridge status/events/results/control

## 10. Stato tecnico runtime (attenzione)
### Requisito Python
- backend richiede `Python 3.10+` (consigliato `3.11`)
- con `Python 3.9` il backend puo' fallire (annotazioni/compatibilita')

### Per demo reale (bottoni attivi)
Serve:
- backend avviato
- DB configurato
- login admin/client
- `API URL` impostato nelle webapp

## 11. Pacchetti / Deliverable creati
### Export principale
- `/Users/md/Documents/New project/SOFTIBRIDGE_EXPORTABLE_COMPLETE_20260223`
- `/Users/md/Documents/New project/SOFTIBRIDGE_EXPORTABLE_COMPLETE_20260223.zip`

### VPS ready
- `/Users/md/Documents/New project/SOFTIBRIDGE_VPS_READY_20260223`
- `/Users/md/Documents/New project/SOFTIBRIDGE_VPS_READY_20260223.zip`

### Test / demo
- `/Users/md/Documents/New project/RELEASE_TEST_SOFTIBRIDGE_20260223`
- `/Users/md/Documents/New project/RELEASE_TEST_SOFTIBRIDGE_20260223.zip`

## 12. Cosa manca per dichiararlo "vendibile 100%"
### Tecnico
- collaudo runtime completo (backend + DB + webapp)
- test live `Stripe`, `Telegram`, `SMTP`
- test live EA/bridge con patch compilati
- rimozione ultimi mock/alert legacy admin

### Business / Compliance
- testi legali definitivi (privacy, termini, refund, risk disclaimer)
- verifica commercialista per flussi `PROFORMA/INVOICE`, reverse charge, crypto incassi

## 13. Priorita' consigliate (fase produzione)
1. Collaudo runtime end-to-end (PASS/FAIL per sezione)
2. Ultimo polish `Admin` (modali enterprise al posto di alert legacy)
3. Deploy VPS con dominio/HTTPS
4. Configurazione live Stripe/Telegram/SMTP
5. Soft launch (beta privata) -> poi vendita pubblica

## 14. Nota per Antigravity
Questo file descrive:
- struttura progettuale attuale
- logica funzionale
- stato di avanzamento reale
- limiti noti prima del go-live

E' pensato come base di handoff / review tecnica / pianificazione produzione.

