# SoftiBridge MVP - Matrice QA Ruoli E2E

Questa matrice valida il flusso completo da landing alle dashboard per i 3 ruoli.

## Ambiente

- Backend avviato in `MVP/backend`
- URL base: `http://127.0.0.1:8000`
- Entrypoint: `http://127.0.0.1:8000/landing/`

## Caso A - CLIENT (registrazione pubblica)

1. Apri `http://127.0.0.1:8000/landing/#access-hub`
2. In "Nuovo Cliente", inserisci email e password valide.
3. Clicca `Registrazione CLIENT`.
4. Verifica redirect automatico a `http://127.0.0.1:8000/dashboard/client/`.
5. Nel Client panel, verifica che appaiano dati dashboard senza errore 401.

Esito atteso:
- Registrazione 200
- Login automatico riuscito
- Redirect ruolo corretto (`CLIENT` -> dashboard client)

## Caso B - ADMIN_WL (login utente registrato)

Prerequisito:
- Account `ADMIN_WL` gia creato da Super Admin.

1. Apri `http://127.0.0.1:8000/landing/#access-hub`
2. In "Accesso Utenti Registrati", inserisci credenziali admin WL.
3. Clicca `Accedi`.
4. Verifica redirect automatico a `http://127.0.0.1:8000/dashboard/admin/`.
5. In Admin panel, verifica dashboard + clienti/licenze (senza 401/403).

Esito atteso:
- Login 200
- Redirect ruolo corretto (`ADMIN_WL` -> dashboard admin)

## Caso C - SUPER_ADMIN (login utente registrato)

Prerequisito:
- Account `SUPER_ADMIN` gia disponibile.

1. Apri `http://127.0.0.1:8000/landing/#access-hub`
2. Inserisci credenziali super admin.
3. Clicca `Accedi`.
4. Verifica redirect automatico a `http://127.0.0.1:8000/dashboard/super-admin/`.
5. Verifica caricamento sezioni principali in `admin_webapp`.

Esito atteso:
- Login 200
- Redirect ruolo corretto (`SUPER_ADMIN` -> dashboard super admin)

## Caso D - Registrazione ADMIN bloccata (policy)

1. Esegui chiamata API:

```http
POST /api/auth/register
{
  "email": "admin.test@example.com",
  "password": "Password123!",
  "role": "ADMIN_WL"
}
```

Esito atteso:
- HTTP 403
- Messaggio: `Registrazione pubblica consentita solo per CLIENT`

## Caso E - Guardie ruolo dashboard

1. Login come `CLIENT`.
2. Apri manualmente `http://127.0.0.1:8000/dashboard/super-admin/`.

Esito atteso:
- Accesso negato lato frontend
- Redirect automatico a `/dashboard/client/`

Ripetere anche:
- login `ADMIN_WL` -> tentativo `/dashboard/client/` e `/dashboard/super-admin/`
- login `SUPER_ADMIN` -> tentativo `/dashboard/admin/` e `/dashboard/client/`

## Caso F - Sessione condivisa (stesso origin)

1. Apri due tab:
   - tab 1: una dashboard autenticata
   - tab 2: stessa o altra dashboard
2. Esegui logout in tab 1.

Esito atteso:
- Tab 2 sincronizza stato sessione (refresh/redirect coerente)

## Endpoint core da validare per ruolo

### CLIENT
- `/api/auth/login`
- `/api/auth/me`
- `/api/client/dashboard`
- `/api/client/downloads`
- `/api/client/invoices`
- `/api/client/trading/state`
- `/api/client/trading/control`

### ADMIN_WL
- `/api/auth/login`
- `/api/auth/me`
- `/api/admin/wl/self`
- `/api/admin/dashboard/summary`
- `/api/admin/clients`
- `/api/admin/licenses`
- `/api/admin/invoices`
- `/api/admin/payments/client`
- `/api/admin/payments/manual`

### SUPER_ADMIN
- `/api/auth/login`
- `/api/auth/me`
- `/api/admin/system/status`
- `/api/admin/wl/admins`
- `/api/admin/dashboard/summary`
- `/api/admin/licenses`
- `/api/admin/clients`

## Criterio PASS finale

- 3 redirect ruolo corretti
- policy register admin rispettata (403)
- nessun 5xx nei flussi principali
- guardie ruolo attive
- sessione sincronizzata su piu tab
