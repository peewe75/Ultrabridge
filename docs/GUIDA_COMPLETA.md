# SOFTIBRIDGE — GUIDA COMPLETA DEL SISTEMA

> Versione: 1.0 | Data: 2026-03-01
> Documento per: Super Admin, Admin Canale, Utente Finale

---

## INDICE

1. [Architettura del Sistema](#1-architettura)
2. [Guida Super Admin](#2-guida-super-admin)
3. [Guida Admin (Gestore Canale Segnali)](#3-guida-admin)
4. [Guida Utente Finale](#4-guida-utente)
5. [Notifiche Telegram](#5-notifiche-telegram)
6. [Dati e Variabili d'Ambiente](#6-configurazione)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. ARCHITETTURA

```
SUPER ADMIN (Backend + Bot Telegram)
    │
    ├── BOT TELEGRAM (@SoftiBridgeBot)
    │        ├── Chat PRIVATA con utente: attivazione + notifiche
    │        └── Aggiunto come ADMIN nei canali: lettura segnali
    │
    ├── ADMIN (Gestore canale segnali)
    │        • Ha licenza Admin
    │        • Crea SignalRoom con il suo canale Telegram
    │        • Gli utenti si collegano alla sua SignalRoom
    │        • Riceve commissioni % sui pagamenti
    │
    └── UTENTE FINALE
             • Si registra sul sito → ottiene licenza
             • Wizard 5 step: Telegram → Canale → MT4 → Licenza → Attivazione
             • Installa EA su MT4 → riceve e esegue ordini
             • Riceve notifiche Telegram per ogni evento
```

---

## 2. GUIDA SUPER ADMIN

### 2.1 Configurazione Iniziale Backend

**Variabili d'ambiente richieste** (file `.env` nella cartella `/backend`):

```env
# Database
DATABASE_URL=sqlite:///./softibridge.db  # o postgresql://...

# Telegram
TELEGRAM_BOT_TOKEN=1234567890:AABBcc...   # token da @BotFather
TELEGRAM_BOT_USERNAME=SoftiBridgeBot
TELEGRAM_WEBHOOK_SECRET=una_stringa_casuale_sicura
TELEGRAM_WEBHOOK_URL=https://tuodominio.com/api/telegram/webhook

# App
APP_NAME=SoftiBridge
SECRET_KEY=chiave_segreta_per_jwt
API_PREFIX=/api
CORS_ALLOW_ORIGINS=https://tuodominio.com,https://app.tuodominio.com

# Storage
DOWNLOADS_DIR=/path/ai/download/files
MANUAL_PAYMENT_PROOFS_DIR=/path/prove/pagamento

# Stripe (opzionale)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 2.2 Avvio del Backend

```shell
cd MVP/backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Il backend crea automaticamente le tabelle DB all'avvio.

### 2.3 Avvio Polling Telegram (sviluppo locale)

Se non hai un webhook HTTPS configurato, avvia il polling:

```shell
cd MVP/backend
python poll_telegram.py
```

### 2.4 Configurazione Webhook Telegram (produzione)

Chiama l'endpoint dopo l'avvio:

```
GET https://tuodominio.com/api/telegram/info
```

Poi imposta webhook tramite:

```
POST https://api.telegram.org/bot<TOKEN>/setWebhook
{ "url": "https://tuodominio.com/api/telegram/webhook",
  "secret_token": "tua_stringa_segreta" }
```

### 2.5 Creazione Admin (Gestore Canale)

Dalla dashboard Super Admin:

1. Vai a **Admin WL** → **Crea Nuovo Admin**
2. Inserisci: email, nome, % commissione
3. Il sistema genera la licenza Admin
4. Comunica all'Admin le credenziali di accesso

### 2.6 Gestione Commissioni

- Ogni utente ha `signal_room_id` che punta alla SignalRoom dell'Admin
- Il campo `admin_wl_id` del Client viene impostato automaticamente quando l'utente si collega alla SignalRoom
- Il Super Admin vede il riepilogo pagamenti per Admin dalla dashboard

### 2.7 EA e File Bridge

Il sistema usa un file-bridge per comunicare con l'EA:

| File | Posizione | Scopo |
|---|---|---|
| `cmd_queue.txt` | `inbox/` | Comandi inviati all'EA MT4 |
| `cmd_queue_mt5.txt` | `inbox/` | Comandi per MT5 |
| `events.txt` | `outbox/` | Eventi dall'EA |

Configura `SOFTIBRIDGE_FILE_BRIDGE_BASE` in `.env` per il percorso.

---

## 3. GUIDA ADMIN (Gestore Canale Segnali)

### 3.1 Registrazione e Accesso

1. Il Super Admin ti crea l'account e ti invia le credenziali
2. Accedi alla dashboard Admin: `https://tuodominio.com/dashboard/admin`
3. Inserisci email e password

### 3.2 Configurazione Canale Segnali

**Cosa devi avere:**

- Un canale o gruppo Telegram attivo dove pubblichi i segnali
- L'ID Telegram del tuo canale (es. `-1001234567890`)

**Step:**

1. Accedi alla dashboard Admin → **Signal Rooms**
2. Clicca **"Crea Room"**
3. Inserisci:
   - **Nome**: es. "Alpha Signals Premium"
   - **Source Chat ID**: l'ID del tuo canale Telegram (numero negativo)
4. Salva

**Come trovare l'ID del canale:**

- Aggiungi @userinfobot o @username_to_id_bot al canale
- Oppure: vai su `web.telegram.org`, apri il canale, l'ID è nella URL

### 3.3 Aggiunta del Bot al Canale

Il Bot deve essere aggiunto come **Amministratore** del tuo canale:

1. Apri il tuo canale Telegram
2. Impostazioni → Amministratori → Aggiungi Admin
3. Cerca `@SoftiBridgeBot`
4. Permessi necessari: **Leggi messaggi** (puoi disabilitare tutto il resto)
5. Salva

> ⚠️ Il bot legge i messaggi in silenzio ma NON risponde pubblicamente nel canale.

### 3.4 Formato Segnali

Il sistema supporta il parsing automatico. Esempio di segnale consigliato:

```
XAUUSD BUY
Entry: 1920.50
SL: 1915.00
TP1: 1927.00
TP2: 1935.00
```

Oppure formato compatto:

```
EURUSD SELL @ 1.0850
SL: 1.0900 | TP1: 1.0800 | TP2: 1.0750
```

### 3.5 Comunicazione agli Utenti

Comunica ai tuoi utenti:

- L'**ID del canale** (source_chat_id): es. `-1001234567890`
- Il **link di registrazione**: `https://tuodominio.com`
- Le istruzioni per il wizard (vedi sezione 4)

### 3.6 Monitoraggio

Dalla dashboard Admin:

- **Utenti collegati**: quanti utenti hanno la tua SignalRoom
- **Segnali inviati**: log dei segnali processati con confidenza parsing
- **Commissioni**: percentuale sulle licenze attive

---

## 4. GUIDA UTENTE FINALE

### 4.1 Registrazione

1. Vai su `https://tuodominio.com`
2. Clicca **"Inizia Gratis — 14 giorni"**
3. Inserisci: nome, email, password
4. Accedi → accesso immediato alla dashboard

> La licenza da 14 giorni è gratuita e non richiede carta di credito.

### 4.2 Wizard di Configurazione

Dopo il login si apre automaticamente il **wizard di configurazione** (5 step).
Puoi anche aprirlo manualmente cliccando **🚀 Setup** in alto a destra.

---

#### STEP 1 — Collega Telegram

**Cosa fare:**

1. Apri Telegram sul telefono o PC
2. Cerca `@userinfobot` → scrivi `/start`
3. Il bot ti risponde con il tuo **ID numerico** (es. `123456789`)
4. Copia quel numero e incollalo nel campo del wizard

**Dato richiesto:** Telegram Chat ID (solo numeri, es. `123456789`)

---

#### STEP 2 — Canale Segnali

**Cosa fare:**

1. Il tuo Admin (il provider di segnali che hai scelto) ti ha comunicato l'ID del suo canale
2. Incolla quell'ID nel campo (es. `-1001234567890`)
3. Clicca "Collegati al Canale Segnali"

**Dato richiesto:** ID del canale/gruppo Telegram del tuo provider (inizia con `-100`)

> Questo collegamento è importante: permette al sistema di sapere quale Admin è il tuo provider e di tracciare le commissioni correttamente.

---

#### STEP 3 — Configura MT4/MT5

**Cosa fare:**

1. Apri il tuo MetaTrader 4 o 5
2. Vai su **File → Account** per trovare il numero conto
3. Compila nel wizard:

| Campo | Esempio | Dove trovarlo |
|---|---|---|
| Numero Conto | `12345678` | MT4 → Navigator → Account |
| Password | `*****` | Dalla tua email di apertura conto |
| Server Broker | `ICMarkets-Live01` | MT4 → Account → Server |
| Piattaforma | MT4 o MT5 | Quella che stai usando |

> Usa la **password Investor** (sola lettura) se disponibile — è più sicura.

---

#### STEP 4 — Genera Codice di Attivazione

**Cosa fare:**

1. Clicca **"Genera Codice Licenza"**
2. Appare un codice tipo `SB-A1B2C3D4` (valido 15 minuti)
3. **Copia il codice** (clicca "📋 Copia Codice")

> Il codice scade in 15 minuti. Usalo subito nel passo successivo.

---

#### STEP 5 — Attivazione via Bot Telegram

**Cosa fare:**

1. Apri Telegram
2. Cerca **@SoftiBridgeBot** → clicca **START**
3. Il bot ti saluta e chiede il codice
4. **Incolla semplicemente il codice** copiato al passo 4 (nessun comando)
5. Il bot risponde: ✅ "Licenza attivata!"

> Da questo momento riceverai tutte le notifiche degli ordini direttamente in questa chat privata.

---

#### STEP 6 — Installazione EA su VPS/MT4

**Prerequisiti:**

- Hai accesso a una VPS con MetaTrader installato
- Oppure MT4 sempre acceso sul tuo PC

**Procedura:**

1. Dalla dashboard → **Download** → scarica `SoftiBridge_EA_v2.4_MT4.ex4`
2. Accedi alla VPS (Remote Desktop o TeamViewer)
3. Apri MT4 → **File → Apri Cartella Dati**
4. Nella cartella che si apre, entra in `MQL4/Experts/`
5. Copia il file `.ex4` in questa cartella
6. Torna in MT4 → **Navigator** (Ctrl+N) → **Aggiorna** (F5)
7. Trascina l'EA `SoftiBridge_EA_v2.4` su qualsiasi grafico aperto
8. Nella finestra delle impostazioni EA:
   - **API Endpoint**: già pre-configurato (non modificare)
   - **Auto Trading**: attivo
9. Clicca **OK**
10. Assicurati che il pulsante verde **"Auto Trading"** sia attivo nella toolbar

> Il sistema autentica l'EA automaticamente tramite il tuo numero di conto MT4 — non devi inserire nessuna chiave nell'EA.

---

#### ✅ Sistema Operativo

Da questo momento:

- L'Admin pubblica segnali nel canale Telegram
- Il Bot li legge istantaneamente
- Il Backend li invia al tuo EA
- L'EA esegue l'ordine in MT4 (< 3 secondi)
- Tu ricevi notifica Telegram

---

### 4.3 Dashboard Utente

| Sezione | Cosa trovi |
|---|---|
| **La Mia Licenza** | Dettagli abbonamento, scadenza, stato EA |
| **Trading Panel** | Balance, equity, drawdown, posizioni aperte |
| **Segnali Live** | Feed dei segnali ricevuti dal Bot |
| **Posizioni Aperte** | Tutte le posizioni a mercato con SL/TP |
| **Ordini Pendenti** | Stop/Limit orders in attesa |
| **Storico** | Operazioni chiuse |
| **Config EA** | Configurazione connessione MT4 |
| **Download** | EA, guide, file VPS |
| **Pagamenti** | Fatture, storico abbonamento |

---

## 5. NOTIFICHE TELEGRAM

Tutte le notifiche arrivano in **chat privata** con `@SoftiBridgeBot`:

| Evento | Messaggio |
|---|---|
| ✅ Ordine aperto | `✅ Ordine Aperto — 📈 BUY XAUUSD @ 1920.50 — SL: 1915 | TP1: 1927 | TP2: 1935` |
| 🛑 Stop Loss preso | `🛑 Stop Loss raggiunto — XAUUSD BUY @ 1915.00 — P&L: -$45.00` |
| 🎯 TP1 raggiunto | `🎯 TP1 raggiunto — XAUUSD BUY @ 1927.00 — P&L: +$65.00` |
| 🎯🎯 TP2 raggiunto | `🎯🎯 TP2 raggiunto — XAUUSD BUY @ 1935.00 — P&L: +$130.00` |
| 📊 Posizione chiusa | `📊 Posizione chiusa — XAUUSD BUY @ 1922.00 — P&L: +$15.00` |

---

## 6. CONFIGURAZIONE

### 6.1 Tutti i Dati che l'Utente deve Inserire

| Dato | Dove | Obbligatorio |
|---|---|---|
| Telegram Chat ID personale | Step 1 wizard | ✅ Sì |
| ID canale segnali Admin | Step 2 wizard | ✅ Sì |
| Numero conto MT4 | Step 3 wizard | ✅ Sì |
| Server broker | Step 3 wizard | ✅ Sì |
| Password conto (Investor) | Step 3 wizard | Consigliato |
| Codice attivazione → al Bot | Step 5 wizard | ✅ Sì |

### 6.2 Tutti i Dati che l'Admin deve Inserire

| Dato | Dove | Note |
|---|---|---|
| ID canale Telegram | Dashboard Admin → Signal Rooms | Es. `-1001234567890` |
| Nome della room | Dashboard Admin | Es. "Alpha Signals PRO" |
| Aggiunta bot al canale | Telegram | Bot deve essere admin del canale |

### 6.3 Tutti i Dati che il Super Admin deve Configurare

| Dato | File/Luogo |
|---|---|
| `TELEGRAM_BOT_TOKEN` | `.env` |
| `TELEGRAM_BOT_USERNAME` | `.env` |
| `TELEGRAM_WEBHOOK_SECRET` | `.env` |
| `TELEGRAM_WEBHOOK_URL` | `.env` |
| `DATABASE_URL` | `.env` |
| `SECRET_KEY` | `.env` |
| `CORS_ALLOW_ORIGINS` | `.env` |

---

## 7. TROUBLESHOOTING

### Il Bot non risponde al /start

- Verifica che `TELEGRAM_BOT_TOKEN` sia corretto in `.env`
- Verifica che il webhook o poll_telegram.py sia attivo
- Controlla i log: `GET /api/telegram/health`

### L'EA non riceve ordini

- Verifica che il numero conto MT4 corrisponda a quello nella dashboard
- Verifica che la licenza sia ATTIVA
- Controlla che il file bridge sia accessibile: `GET /api/bridge/status`
- Controlla che AutoTrading sia attivo in MT4

### Il segnale arriva ma non viene eseguito

- Controlla la confidenza parsing: se < 85% va in review manuale
- Vai su Dashboard Admin → Signal Logs per vedere i dettagli
- Verifica il formato del segnale rispetto al formato supportato

### L'attivazione via Bot non funziona

- Il codice ha validità 15 minuti — rigenera dalla dashboard
- Il codice è case-insensitive ma deve essere copiato esattamente
- Verifica che il bot riceva messages: scrivi qualcosa al bot e controlla i log

### L'utente non riceve notifiche Telegram

- Verifica che il `telegram_chat_id` sia salvato correttamente nel profilo
- L'utente deve aver avviato una chat con il bot (almeno /start una volta)
- Verifica che il bot non sia stato bloccato dall'utente

---

*Fine Guida — SoftiBridge v1.0*
