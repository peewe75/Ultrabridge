# SoftiBridge - Smoke Report (Beta Privata Veloce)

Data: 2026-02-28 12:04 e 2026-02-28 12:40 (verifica PostgreSQL)

## Ambiente testato
- Backend: FastAPI locale su `http://127.0.0.1:8000`
- Database: PostgreSQL staging (`softibridge-postgres:5432`)
- Runtime bridge: `backend/softibridge_runtime`
- Modalita: `APP_ENV=development`

## Risultato complessivo
- `43/43 PASS`
- `0 FAIL`

## Aree verificate
- Health endpoint
- Preview pages (`/preview*`)
- API pubbliche (plans/tax/invoice preview)
- Demo bootstrap + auth admin/client
- Setup Telegram check
- Dashboard/admin/client core endpoints
- Signals parse/ingest + webhook flow
- Bridge status/control/events/results
- Client downloads/token/invoices/trading control

## Note
- `notifications/telegram/test-admin` risulta `ok=false` in ambiente locale (verificare con token reale).
- Credenziali Telegram caricate: token disponibile, da configurare in `.env`.
- Verifica Stripe/SMTP rinviata alla fase integrazioni esterne.
