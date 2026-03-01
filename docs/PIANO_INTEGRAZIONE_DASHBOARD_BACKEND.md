# SoftiBridge MVP - Piano Integrazione Dashboard + Backend

## Obiettivo

Unificare accesso e sincronizzazione tra:

- Dashboard Utente: `client_webapp`
- Dashboard Admin L1: `admin_lite_webapp`
- Dashboard Super Admin L0: `admin_webapp`

Mantenendo estetica e UX esistenti, con flusso semplice da landing.

## Stato implementazione (completato)

1. Routing unico lato backend (stesso origin):
   - `/landing`
   - `/dashboard/client`
   - `/dashboard/admin`
   - `/dashboard/super-admin`
2. Root redirect: `/` -> `/landing`
3. Registrazione pubblica bloccata ai soli `CLIENT`.
4. Landing aggiornata con:
   - registrazione CLIENT
   - login utenti registrati
   - redirect automatico in base al ruolo
5. Guardie ruolo dashboard:
   - Client accetta solo `CLIENT`
   - Admin Lite accetta solo `ADMIN_WL`
   - Super Admin accetta solo `SUPER_ADMIN`

## Mappa ruoli e destinazioni

- `CLIENT` -> `/dashboard/client/`
- `ADMIN_WL` -> `/dashboard/admin/`
- `SUPER_ADMIN` -> `/dashboard/super-admin/`

## Verifica integrazione endpoint (frontend -> backend)

Analisi automazione completata su tutte e 3 le dashboard:

- Super Admin (`admin_webapp/app.js`): endpoint mappati e presenti
- Admin L1 (`admin_lite_webapp/app.js`): endpoint mappati e presenti
- Client (`client_webapp/app.js`): endpoint mappati e presenti

Nota tecnica:
- Le chiamate a `/health` sono corrette: vengono risolte su `/api/health` con `apiBase` condiviso.

## Cosa e ancora in modalita demo / progressiva

Le dashboard sono integrate e sincronizzate, ma alcune funzioni restano demo o dipendono da credenziali reali:

1. Billing reale Stripe
   - Mancano chiavi definitive ambiente test/prod
2. SMTP reale
   - Mancano host/credenziali definitive
3. Telegram invio messaggi amministrativi
   - Funziona, ma richiede chat avviata con il bot per alcuni test
4. Flussi pagamenti manuali avanzati
   - Alcune automazioni sono predisposte ma da rifinire con regole business definitive

## Dati necessari per completare funzioni reali

### Stripe
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- URL finali successo/annullamento/portal

### SMTP
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`

### Policy operative
- Regole definitive su onboarding admin WL
- Regole definitive su payout/revenue split L0-L1-L2
- Regole definitive su sospensione/revoca automatica licenze

## Prossimi step consigliati

1. Bloccare produzione account `ADMIN_WL` al solo flusso Super Admin (gia impostato lato register pubblico).
2. Completare matrice QA per ruolo con casi reali (happy path + error path).
3. Integrare Stripe test end-to-end con webhook reale.
4. Integrare SMTP test end-to-end con invio reale.
5. Fare passaggio finale hardening sicurezza (session handling, log audit, policy timeout).

## Criterio GO pre-produzione

GO quando:

- Login/redirect per ruolo sempre coerente
- Tutte le dashboard operative su backend unico
- QA end-to-end verde per CLIENT, ADMIN_WL, SUPER_ADMIN
- Stripe/SMTP test mode funzionanti
- Nessun errore bloccante 5xx su percorsi core
