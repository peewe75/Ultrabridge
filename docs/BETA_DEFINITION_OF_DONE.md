# SoftiBridge - Definition of Done (Beta Privata Stabile)

Una build e considerata beta-ready solo se tutti i punti sotto sono PASS.

## A) Backend
- [ ] `GET /api/health` stabile
- [ ] Smoke test backend completato senza errori bloccanti
- [ ] Error rate API core sotto soglia

## B) Admin Webapp
- [ ] Login/admin scope funzionante
- [ ] Clienti/licenze/fatture/pagamenti manuali operativi via API reale
- [ ] Nessun flusso core dipendente da mock

## C) Client Webapp
- [ ] Login client funzionante
- [ ] Dashboard/download/fatture/pagamenti operativi via API reale
- [ ] Azioni trading core inviate correttamente al bridge

## D) Signals + Bridge EA
- [ ] Webhook Telegram verificato
- [ ] Parse segnali su formati target con confidence adeguata
- [ ] Roundtrip E2E: Telegram -> Queue -> EA -> Events/Results PASS

## E) Billing
- [ ] Stripe test mode E2E PASS
- [ ] Bonifico/USDT manuale con review admin PASS
- [ ] PDF fatture e stati pagamento coerenti

## F) Operativita
- [ ] Backup DB automatico attivo
- [ ] Restore test eseguito almeno una volta
- [ ] Log principali monitorati
