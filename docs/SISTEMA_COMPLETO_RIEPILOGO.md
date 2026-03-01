# SOFTIBRIDGE — RIEPILOGO SISTEMA COMPLETO
>
> Aggiornato: 2026-03-01

---

## ARCHITETTURA GENERALE

```
SUPER ADMIN (Marco — piattaforma SoftiBridge)
    │
    ├── ADMIN (Gestori canali segnali Telegram)
    │       • Ha licenza Admin attiva
    │       • Gestisce uno o più canali/gruppi Telegram con segnali
    │       • Il Bot unico viene aggiunto come admin nel suo canale
    │       • Riceve commissioni % sulle licenze dei suoi utenti
    │
    └── UTENTE FINALE (Trader abbonato)
            • Si iscrive sul sito → ottiene licenza 14gg gratis
            • Collega Telegram, inserisce ID canale del suo Admin
            • Installa EA su MT4 → riceve ed esegue i segnali
```

---

## BOT TELEGRAM — UN SOLO BOT, DUE CONTESTI

| Contesto | Come usato | Cosa fa |
|---|---|---|
| **Chat privata** con utente | L'utente apre @MioBot e scrive START | Attivazione licenza, notifiche ordini |
| **Canale/Gruppo segnali** | L'Admin aggiunge il bot come admin | Legge i segnali in silenzio, li processa |

---

## FLUSSO DATI SEGNALE

```
Admin pubblica segnale nel canale Telegram
    ↓
Bot (admin del canale) riceve il messaggio
    ↓
Backend: identifica canale → trova SignalRoom → trova utenti collegati con licenza ATTIVA
    ↓
Invia ordine a ciascun utente via file bridge (EA lo legge)
    ↓
EA su MT4 esegue l'ordine
    ↓
EA notifica backend: FILLED / SL_HIT / TP1_HIT / TP2_HIT / CLOSED
    ↓
Bot Telegram invia notifica Telegram privata all'utente
```

---

## FLUSSO COMPLETO UTENTE FINALE

### Step 1 — Registrazione sul Sito (obbligatoria)

- Va sul sito → clicca "Inizia Gratis 14 giorni"
- Si registra email + password (Clerk o backend auth)
- **Accesso immediato** alla dashboard con wizard onboarding

### Step 2 — Inserimento Telegram ID personale

- Dashboard mostra modal obbligatorio: "Collega il tuo Telegram"
- Utente apre @SoftiBridgeBot su Telegram → clicca START
- Il Bot invia: "Ciao! Per attivare il tuo account inserisci il codice licenza che trovi nella dashboard"
- Utente inserisce il proprio Telegram ID nella dashboard (es. 123456789)

### Step 3 — Inserimento ID Canale Segnali

- Dashboard chiede: "ID del canale/gruppo del tuo provider segnali"
- L'Admin gli ha comunicato questo ID (es. -100123456789)
- Il sistema collega: Utente → Admin → Canale → Commissioni

### Step 4 — Inserimento dati MT4

- Account Number (es. 12345678)
- Password del conto (Investor o Master)
- Server broker (es. ICMarkets-Live01)
- Tipo: Live / Demo

### Step 5 — Generazione e attivazione licenza via Bot

- Dashboard: clicca "Genera Codice Attivazione" → codice copiato (es. SB-A1B2C3D4)
- Utente va su @SoftiBridgeBot → **incolla semplicemente il codice** (nessun comando)
- Bot risponde: ✅ "Licenza attivata! Il tuo account è ora operativo."

### Step 6 — Installazione EA su VPS/MT4

- Dalla dashboard scarica il file EA (.ex4)
- Accede alla VPS via Remote Desktop
- Apre MT4 → File → Apri Cartella Dati → MQL4/Experts/
- Copia il file .ex4 nella cartella
- In MT4: Navigator → Aggiorna → trascina EA sul grafico
- Nelle impostazioni EA inserisce: **API Endpoint** (pre-configurato, fisso)
- Abilita trading automatico (pulsante verde)
- Il backend autentica l'EA tramite: account_number + broker_server

### Step 7 — Sistema operativo ✅

- L'EA si connette al backend ogni X secondi a cercare ordini
- Non appena arriva un segnale dal canale → ordine eseguito in pochi secondi
- L'utente riceve notifica Telegram per ogni evento

---

## NOTIFICHE TELEGRAM ALL'UTENTE

| Evento | Messaggio Bot |
|---|---|
| Ordine aperto | ✅ XAUUSD BUY eseguito @ 1920.50 — Lotti: 0.1 |
| Stop Loss preso | 🛑 Stop Loss preso su XAUUSD @ 1915.00 — P&L: -$45.00 |
| TP1 raggiunto | 🎯 TP1 raggiunto su XAUUSD @ 1925.00 — P&L: +$65.00 |
| TP2 raggiunto | 🎯🎯 TP2 raggiunto su XAUUSD @ 1930.00 — P&L: +$130.00 |
| Posizione chiusa | 📊 Posizione XAUUSD chiusa manualmente @ 1922.00 — P&L: +$15.00 |

---

## FLUSSO ADMIN (Gestore Canale Segnali)

### Step 1 — Registrazione Admin

- Va sul sito → sezione "Diventa Provider" o invitato dal SuperAdmin
- Si registra → licenza Admin assegnata dal SuperAdmin
- Accede alla dashboard Admin

### Step 2 — Setup Canale Segnali

- Nella dashboard Admin: inserisce ID del suo canale/gruppo Telegram
- Aggiunge il Bot (@SoftiBridgeBot) come AMMINISTRATORE del canale
  - Permessi necessari: **Solo lettura** (no post, no inviti)
- Il sistema crea un SignalRoom associato all'Admin

### Step 3 — Invio segnali

- L'Admin pubblica i segnali nel formato standard nel suo canale
- Il Bot li legge automaticamente e li distribuisce

### Step 4 — Monitoraggio

- Dashboard Admin: vede quanti utenti sono collegati al suo canale
- Vede i segnali inviati, esecuzioni, commissioni maturate

---

## FLUSSO SUPER ADMIN (Marco)

### Gestione Piattaforma

- Dashboard SuperAdmin: vede tutti gli Admin, Utenti, Pagamenti
- Emette licenze Admin manualmente o via sistema
- Configura piani, commissioni, fee

### Commissioni

- Ogni pagamento utente → % all'Admin di riferimento (tracciato via signal_room_id)
- Il SuperAdmin vede il riepilogo payout mensile

---

## SCHEMA DATABASE (tabelle chiave)

| Tabella | Scopo |
|---|---|
| `users` | Account di accesso (Clerk o backend) |
| `clients` | Profilo cliente con `telegram_chat_id`, `signal_room_id` |
| `licenses` | Licenza con codice attivazione, scadenza, account MT4 |
| `signal_rooms` | Canali segnali degli Admin (con `source_chat_id`) |
| `admin_wl` | Profilo Admin con % commissione |
| `audit_logs` | Log completo di ogni operazione |

---

## AUTENTICAZIONE EA (senza license key nell'EA)

L'EA invia al backend ad ogni heartbeat:

```json
{
  "account_number": "12345678",
  "broker_server": "ICMarkets-Live01",
  "platform": "MT4"
}
```

Il backend verifica:

1. Esiste un `Client` con questo account MT4 nella `license.mt_accounts`?
2. La licenza è ATTIVA?
3. → SÌ: invia ordini pendenti / → NO: rifiuta

---

*Fine documento di riepilogo*
