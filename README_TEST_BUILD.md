SoftiBridge - Test Build (2026-02-23)

Contenuto incluso (pulito):
- backend/ (FastAPI, API, billing, Stripe/manual payments, parser, bridge, preview)
- webapps/landing_page
- webapps/admin_webapp
- webapps/client_webapp
- ea_patches/ (sorgenti patch MQL4/MQL5 da compilare manualmente)
- desktop_exe_wrappers/ (launcher/build scripts Windows)
- docs/ (guide + checklist QA)

Escluso volutamente (inutile per test build):
- .git/
- backend/.venv/
- file runtime generati (fatture, proofs, downloads demo)
- database legacy locale nel pacchetto softibot originale
- file sorgenti/demo non necessari (api_hub.py legacy, assets/capture_ui, ecc.)

Cosa testare subito:
1) Configura backend/.env partendo da backend/.env.example
2) Avvia PostgreSQL
3) Installa dipendenze backend (pip install -r requirements.txt)
4) Avvia backend: uvicorn app.main:app --reload
5) Esegui bootstrap demo: POST /api/demo/bootstrap
6) Testa preview: /preview/setup /preview/admin /preview/client /preview/signals /preview/bridge /preview/tour
7) Testa webapps locali in webapps/* con backend attivo
8) Esegui checklist docs/FINAL_QA_CHECKLIST.md e checklist fatturazione fornita in chat

Note:
- I file MQL patchati NON sono compilati (.mq4/.mq5 da compilare in MetaEditor)
- Stripe/SMTP/Telegram richiedono chiavi reali in .env per test live


Aggiornamento controlli eseguiti in questa sessione:
- Installate dipendenze backend nella `.venv` locale (fastapi/sqlalchemy/stripe/reportlab/...)
- `py_compile` su tutti i file Python backend + smoke script: OK
- Import runtime moduli principali nella `.venv`: OK
- Verifica statica endpoint webapp -> backend: OK
- Smoke test runtime HTTP NON eseguibile qui (sandbox blocca accesso localhost e manca PostgreSQL locale in questo ambiente)
