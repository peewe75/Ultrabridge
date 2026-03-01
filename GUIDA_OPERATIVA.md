# SoftiBridge MVP — Guida Operativa e Test

Questa guida descrive il funzionamento del prototipo SoftiBridge e i passi necessari per effettuare i test di funzionamento.

## 1. Funzionamento del Sistema (Passo-Passo)

Il sistema è un'infrastruttura SaaS per la gestione di licenze e segnali per MetaTrader 4 (MT4).

1. **Amministratore (White Label)**: accede alla `admin_webapp` per gestire clienti e licenze.
2. **Cliente**: accede alla `client_webapp` per scaricare l'Expert Advisor (EA) e monitorare il trading.
3. **Expert Advisor (EA)**: installato su MT4, valida la licenza contattando il backend.
4. **Bridge/Segnali**: il backend riceve segnali e li distribuisce agli EA autorizzati.

---

## 2. Setup Operativo (Avvio)

### Passo A: Avvio Database e Backend

1. **PostgreSQL (Docker)**:

    ```powershell
    docker compose -f docker-compose.postgres.yml up -d
    ```

2. **Backend (FastAPI)**:
    Dalla cartella `backend/`:

    ```powershell
    .venv\Scripts\python.exe -m uvicorn app.main:app --reload
    ```

    *Il server sarà attivo su: <http://127.0.0.1:8000>*

### Passo B: Popolamento Demo (Bootstrap)

Per creare istantaneamente un ambiente di test con dati pronti:

* Effettua una chiamata POST a: `http://127.0.0.1:8000/api/demo/bootstrap`
* **Credenziali Admin Demo**: `admin.demo@example.com` / `Password123!`
* **Credenziali Cliente Demo**: `mario.rossi@example.com` / `Password123!`

---

## 3. Interfacce di Test (Preview Pages)

Puoi testare le interfacce direttamente tramite il browser:

* **Virtual Tour (Inizia qui)**: [http://127.0.0.1:8000/preview/tour](http://127.0.0.1:8000/preview/tour)
* **Dashboard Admin**: [http://127.0.0.1:8000/preview/admin](http://127.0.0.1:8000/preview/admin)
* **Panel Cliente**: [http://127.0.0.1:8000/preview/client](http://127.0.0.1:8000/preview/client)
* **Signal Manager**: [http://127.0.0.1:8000/preview/signals](http://127.0.0.1:8000/preview/signals)

---

## 4. Test di Funzionamento Consigliati

1. **Login**: Prova ad accedere alla Dashboard Admin con le credenziali demo.
2. **Gestione Clienti**: Crea un nuovo lead e convertilo in cliente.
3. **Validazione Licenza**: Simula la chiamata dell'EA MT4 aprendo:
    `http://127.0.0.1:8000/api/licenses/validate?key=SB-3704678E&account=123456`
4. **E2E Flow**: Verifica che il cliente "Mario Rossi" veda la propria licenza attiva nel panel cliente.
