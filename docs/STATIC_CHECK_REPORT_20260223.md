Static Check Report (sandbox)

Eseguito:
- Sintassi Python backend (py_compile): OK
- Parsing AST router backend: OK
- Coerenza endpoint webapp -> route backend (check statico): OK (nessun mismatch dopo normalizzazione path dinamici)
- Scansione placeholder/mock/alert: presenti ancora in alcune aree UI (soprattutto admin/client demo/history/vps/fee ledger), non bloccanti per test build ma non produzione finale.

Non eseguibile in sandbox:
- Smoke test runtime HTTP su localhost (bloccato da policy sandbox)
- Avvio server con dipendenze reali (backend/.venv priva di package richiesti)
- Test JS con node (node non installato nel sandbox)

Conseguenza:
- Questa build è pronta per collaudo nel tuo ambiente locale, ma richiede test runtime reali (DB/Stripe/SMTP/Telegram/EA).
