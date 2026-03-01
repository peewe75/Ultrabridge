# SoftiBridge MVP - Matrice Gap Funzionali Dashboard

## Legenda stato

- `OK`: flusso collegato al backend e operativo in MVP
- `PARZIALE`: endpoint presenti ma comportamento ancora ibrido demo/mock o dipendente da credenziali esterne
- `MANCA`: funzione UI non ancora collegata a endpoint reale
- `N/A`: non applicabile per quel ruolo

## Copertura endpoint dashboard (analisi codice)

- Client dashboard: 13 endpoint usati, copertura backend disponibile
- Admin L1 dashboard: 13 endpoint usati, copertura backend disponibile
- Super Admin dashboard: 28 endpoint usati, copertura backend disponibile

Nota: `/health` e gestito dal router health e viene risolto correttamente tramite `apiBase`.

## Matrice per area funzionale

| Area funzionale | Client | Admin L1 | Super Admin | Endpoint principali | Note gap |
|---|---|---|---|---|---|
| Auth login/me + redirect ruolo | OK | OK | OK | `/auth/login`, `/auth/me` | Guardie ruolo attive su tutte le dashboard |
| Registrazione pubblica | OK | N/A | N/A | `/auth/register` | Policy bloccata per admin/super-admin (403) |
| Dashboard KPI principali | OK | OK | OK | `/client/dashboard`, `/admin/dashboard/summary` | Dati core presenti |
| Clienti/Licenze CRM | N/A | OK | OK | `/admin/clients`, `/admin/licenses` | Operativo |
| Invoices elenco/emissione | PARZIALE | PARZIALE | PARZIALE | `/client/invoices`, `/admin/invoices`, `/admin/invoices/issue` | Flusso reale presente, ma delivery mail dipende da SMTP |
| Pagamenti client checkout | PARZIALE | PARZIALE | PARZIALE | `/client/payments`, `/admin/payments/client` | In assenza Stripe reale usa modalita simulata |
| Pagamenti manuali + ricevute | PARZIALE | PARZIALE | PARZIALE | `/client/payments/manual`, `/admin/payments/manual` | Workflow presente, da rifinire su policy/automazioni operative |
| Trading control/state client | PARZIALE | N/A | N/A | `/client/trading/state`, `/client/trading/control` | Blocco segnale ora invia `CANCEL_TICKET` quando il ticket e presente; fallback locale solo senza ticket |
| Feed eventi EA client | PARZIALE | N/A | N/A | `/client/ea/events` | Con backend attivo usa feed/queue reali; fallback demo solo offline/non autenticato |
| Configurazione EA client (salvataggio) | OK | N/A | N/A | `/client/ea/config` | Salvataggio e caricamento configurazione collegati al backend |
| Branding Admin WL | N/A | OK | N/A | `/admin/wl/self`, `/admin/wl/self/branding` | Operativo |
| Setup integrazioni (telegram/stripe/smtp) | N/A | N/A | PARZIALE | `/setup/status`, `/setup/config/current`, `/setup/config/save`, `/setup/telegram/check` | Setup pronto; efficacia piena dipende da chiavi reali |
| WL network management | N/A | N/A | PARZIALE | `/admin/wl/admins`, `/admin/wl/fee-report` | Alcune schermate hanno fallback demo in caso errore backend |
| Fee report e split | N/A | N/A | PARZIALE | `/admin/wl/fee-report` | Calcolo base presente, ma alcune parti usano cache/mock fallback |
| Payout batch/fee rules avanzate | N/A | N/A | PARZIALE | `/admin/wl/fee-rules`, `/admin/wl/payouts/run`, `/admin/wl/payouts`, `/admin/wl/payouts/{id}/mark-paid` | Backend e UI ora collegati; completezza dipende da volumi reali/pagamenti effettivi |
| VPS management | N/A | N/A | PARZIALE | `/admin/vps/nodes`, `/admin/vps/nodes/provision`, `/admin/vps/nodes/{id}/reboot` | Provision/reboot/list ora su backend; resta orchestrazione provider reale |
| Bridge monitor (eventi/risultati) | N/A | N/A | OK | `/bridge/events`, `/bridge/results` | Operativo |
| Kill list export | N/A | N/A | OK | `/admin/kill-list/export` | Operativo |
| Logs amministrativi | N/A | N/A | OK | `/admin/logs` | Operativo |

## Gap prioritari (ordine consigliato)

1. **Client trading UX**: estendere mappatura segnale-ticket a tutti i casi parser/webhook per eliminare fallback locale residuo.
2. **Super Admin finance avanzata**: estendere payout su casi reali con volumi pagati e workflow approvativo completo.
3. **VPS management**: completare orchestrazione provider reale (API cloud) e metriche live CPU/RAM.
4. **Billing end-to-end reale**: completare Stripe + SMTP per uscire dalla modalita parziale su fatture e pagamenti.

## Dati mancanti per chiudere i gap PARZIALI

- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`
- Regole business: payout, split definitivi, policy approvazioni manual payments

## Criterio di uscita da PARZIALE -> OK

Una funzione passa a `OK` quando:

- niente fallback mock lato UI
- endpoint backend reale e stabile
- test QA ruolo specifico passato
- nessun errore bloccante 4xx/5xx nei flussi standard
