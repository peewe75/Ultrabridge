# SoftiBridge - Fase Successiva Integrazioni Esterne

## Ordine consigliato
1. PostgreSQL di staging (prima di Firebase)
2. Stripe test mode live
3. Telegram bot live
4. SMTP live
5. Valutazione integrazione Firebase (se necessario come layer dati aggiuntivo)

## 1) PostgreSQL staging
- Sostituire in `.env`:
  - `DATABASE_URL=postgresql+psycopg://<user>:<pass>@<host>:5432/<db>`
- Avviare backend
- Rieseguire `scripts/smoke_test_softibridge.py`
- Verificare PASS completo

## 2) Stripe (test mode)
- Compilare in `.env`:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_SUCCESS_URL`
  - `STRIPE_CANCEL_URL`
- Configurare webhook endpoint `/api/stripe/webhook`
- Eseguire pagamento test e verificare aggiornamento stato backend

## 3) Telegram
- Compilare in `.env`:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_WEBHOOK_URL`
  - `TELEGRAM_WEBHOOK_SECRET`
  - `TELEGRAM_ADMIN_SUPER_CHAT_ID`
- Verificare:
  - `/api/setup/telegram/check`
  - `/api/setup/telegram/set-webhook`
  - `/api/notifications/telegram/test-admin`

## 4) SMTP
- Compilare in `.env`:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`
  - `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `SMTP_USE_TLS`
- Inviare email test da flusso fatture

## 5) Firebase (quando decidiamo lo scope)
- Definire se Firebase serve per:
  - auth
  - datastore secondario
  - realtime/analytics
- Se sì, creare adapter dedicato senza rompere i modelli SQL esistenti
- Eseguire migrazione progressiva (non big-bang)

## Gate prima del go-live esterno
- Smoke test completo PASS su DB reale
- Stripe webhook PASS
- Telegram webhook PASS
- SMTP invio PASS
- Nessun P0 aperto
