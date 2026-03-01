# SoftiBridge - Cronoprogramma Beta Privata Stabile (Day 1-14)

## Obiettivo
Rilasciare una beta privata stabile in 14 giorni, con flussi core affidabili:
- auth/admin/client
- segnali -> bridge EA
- billing/fatture (Stripe test + manuale)
- monitoraggio e backup operativi

## Day 1 - Kickoff tecnico
- Baseline unica: `Nuova cartella con elementi`
- Scope beta: core vs non-core
- Priorita P0/P1/P2 e owner per area
- Output: backlog iniziale + Definition of Done beta

## Day 2 - Ambiente staging-beta
- Setup runtime (Python, PostgreSQL, variabili, path bridge)
- Verifica startup backend e endpoint health
- Output: ambiente ripetibile e avviabile

## Day 3 - Sicurezza/config
- Centralizzazione segreti in `.env`/secret store
- Pulizia credenziali sparse
- Verifica protezioni endpoint setup/admin (role-based)
- Output: checklist security minima PASS

## Day 4 - Backend health + smoke
- Esecuzione smoke su auth/public/admin/client/signals/bridge
- Apertura bug P0 da errori runtime
- Output: report PASS/FAIL tecnico

## Day 5 - DB/migrazioni
- Verifica coerenza schema DB vs migrazioni
- Definizione migrazioni incrementali + rollback
- Output: schema DB coerente e versionabile

## Day 6 - Admin core de-mock
- Clienti, licenze, fatture, review pagamenti manuali solo API reali
- Rimozione blocchi demo nei flussi critici
- Output: Admin core stabile beta

## Day 7 - Client core de-mock
- Dashboard, download, fatture/pagamenti, azioni trading principali reali
- Uniformazione gestione errori UX (no alert legacy nei core flow)
- Output: Client core stabile beta

## Day 8 - Telegram + parser
- Test webhook live
- Test parsing formati reali sale target
- Taratura confidence/fallback
- Output: ingest segnali affidabile

## Day 9 - Bridge EA E2E
- Roundtrip completo: Telegram -> Parser -> Queue -> EA -> Events/Results
- Test MT4/MT5 scenari principali
- Output: bridge certificato beta

## Day 10 - Billing test mode
- Stripe test mode E2E + webhook
- Bonifico/USDT manuale con verifica admin
- Output: fatturazione e stati pagamento coerenti

## Day 11 - QA integrata
- Esecuzione checklist QA completa
- Chiusura bug P0/P1 residui
- Output: matrice QA quasi verde

## Day 12 - Pre-launch beta
- Hardening logging
- Backup DB + restore test
- Runbook incident response base
- Output: readiness operativa beta

## Day 13 - Soft launch controllato
- Onboarding 3-10 utenti pilota
- Monitoraggio errori/latency/completamento flussi
- Output: report stabilita day-1 beta

## Day 14 - Stabilizzazione e decisione
- Correzioni rapide issue emerse
- Decisione GO beta estesa / HOLD
- Output: verbale go/no-go + backlog fase successiva

## Gate PASS/FAIL pre-beta
- PASS: login/admin/client core senza blocchi P0
- PASS: almeno 1 flusso segnali->EA ripetibile con successo
- PASS: fattura PDF + stato pagamento + archivio coerenti
- PASS: backup/restore verificati almeno una volta
- FAIL: mock presenti nei percorsi core o errori intermittenti bloccanti

## KPI beta privata (target)
- API error rate core < 2%
- Successo pagamenti test controllati > 95%
- Successo E2E bridge > 95%
- Presa in carico bug P0 < 24h
