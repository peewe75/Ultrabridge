---
description: Guida alla pubblicazione del Backend FastAPI su Render.com con Supabase e Clerk
---

## 🚀 Workflow: Deploy Backend FastAPI su Render

Segui questi passaggi per pubblicare il backend di SoftiBridge/Ultrabridge senza errori di compilazione o database.

### 1. Preparazione del Repository (GitHub)

Assicurati che nella cartella `backend/` siano presenti:

- `requirements.txt`: Deve contenere `fastapi`, `uvicorn`, `sqlalchemy`, `psycopg2-binary`, `psycopg[binary]`, `pydantic-settings`, `svix`.
- `app/main.py`: Deve avere il router per i webhook configurato (`app.include_router(clerk_webhooks.router, prefix="/api")`).
- Encoding File: Assicurati che `requirements.txt` sia salvato in formato **UTF-8** (senza BOM).

### 2. Creazione del Web Service su Render

1. Vai su [Render.com](https://render.com) e crea un **New Web Service**.
2. Collega il repository GitHub e seleziona il branch `main`.
3. Configura i campi principali:
   - **Name**: `ultrabot` (o simile)
   - **Root Directory**: `backend`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port 10000`

### 3. Variabili d'Ambiente (Settings -> Environment)

Aggiungi queste variabili obbligatorie per evitare il fallimento della build o dell'avvio:

| Chiave | Valore Esempio / Note |
| :--- | :--- |
| **`PYTHON_VERSION`** | `3.11.9` (Forza una versione stabile per evitare errori Rust/Maturin) |
| **`DATABASE_URL`** | `postgresql+psycopg2://utente:pass@host:porta/postgres` (Da Supabase) |
| **`JWT_SECRET`** | Una stringa sicura per i token (es. preso dal tuo .env locale) |
| **`CLERK_SECRET_KEY`** | La tua **Live Secret Key** di Clerk |
| **`CLERK_WEBHOOK_SECRET`**| Il **Signing Secret** generato dal Webhook di Clerk |
| **`API_PREFIX`** | `/api` |
| **`APP_ENV`** | `production` |

### 4. Configurazione Webhook su Clerk Dashboard

Affinché la registrazione degli utenti funzioni:

1. Vai su Clerk -> **Webhooks**.
2. **Add Endpoint**: `https://tua-app-render.onrender.com/api/clerk/webhook`
3. Seleziona gli eventi: `user.created`, `user.updated`, `user.deleted`.
4. Copia il "Signing Secret" e inseriscilo dentro Render alla voce `CLERK_WEBHOOK_SECRET`.

### 5. Verifica Finale

- Se il bollino è **Live**, visita `https://tua-app.onrender.com/api/health`.
- Se ricevi `{"status": "ok"}`, il backend è pronto a ricevere traffico e a gestire i nuovi utenti nel database SQL.
- **Turbo-All**: Questo workflow richiede un deploy pulito con "Clear Build Cache" se si cambia la versione di Python.
