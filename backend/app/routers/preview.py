from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(prefix="/preview", tags=["preview"])


@router.get("", response_class=HTMLResponse)
def preview_home():
    return HTMLResponse(
        """
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>SoftiBridge MVP Preview</title>
  <style>
    body{font-family:system-ui,Segoe UI,sans-serif;background:#0b1220;color:#e9eef8;margin:0;padding:24px}
    .wrap{max-width:1100px;margin:auto;display:grid;grid-template-columns:1.1fr .9fr;gap:20px}
    .card{background:#141d31;border:1px solid #2a3550;border-radius:14px;padding:16px}
    h1,h2{margin:0 0 12px}
    label{display:block;font-size:12px;color:#b5c0d7;margin:10px 0 4px}
    input,select,button,textarea{width:100%;padding:10px;border-radius:10px;border:1px solid #31415f;background:#0f1729;color:#f3f7ff}
    button{background:#00d4aa;color:#03261f;font-weight:700;cursor:pointer}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    pre{background:#0d1322;padding:10px;border-radius:10px;overflow:auto;font-size:12px}
    a{color:#7fe7ff}
    .muted{color:#98a8c7;font-size:12px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>SoftiBridge MVP Preview</h1>
      <p class="muted">Test rapido di checkout/tassazione/fattura PDF dal backend.</p>
      <div class="row">
        <div>
          <label>Piano</label>
          <select id="plan"><option>BASIC</option><option selected>PRO</option><option>ENTERPRISE</option></select>
        </div>
        <div>
          <label>Email</label>
          <input id="email" value="cliente@example.com" />
        </div>
      </div>
      <div class="row">
        <div>
          <label>Paese</label>
          <select id="country"><option value="IT" selected>IT</option><option value="ES">ES</option><option value="DE">DE</option><option value="FR">FR</option><option value="US">US</option></select>
        </div>
        <div>
          <label>Business?</label>
          <select id="isBiz"><option value="false" selected>No</option><option value="true">Sì</option></select>
        </div>
      </div>
      <div class="row">
        <div>
          <label>VAT ID (opzionale)</label>
          <input id="vatId" placeholder="ESB123..." />
        </div>
        <div>
          <label>IVA Esente dichiarata?</label>
          <select id="vatEx"><option value="false" selected>No</option><option value="true">Sì</option></select>
        </div>
      </div>
      <div class="row" style="margin-top:12px">
        <button id="btnCheckout">Crea Checkout Session</button>
        <button id="btnInvoice">Genera Fattura Preview PDF</button>
      </div>
      <h2 style="margin-top:16px">Output</h2>
      <pre id="out">Pronto.</pre>
    </div>
    <div class="card">
      <h2>Utility API</h2>
      <p class="muted">Endpoint utili per test manuale.</p>
      <ul>
        <li><a href="/api/health" target="_blank">/api/health</a></li>
        <li><a href="/api/public/plans" target="_blank">/api/public/plans</a></li>
      </ul>
      <h2>Anteprima Fiscale</h2>
      <button id="btnTax">Valuta IVA</button>
      <pre id="taxout">Nessuna valutazione eseguita.</pre>
      <p class="muted">Questa preview mostra la logica fiscale MVP (imponibile / reverse charge / esente). Va validata con commercialista prima del go-live.</p>
    </div>
  </div>
<script>
const out = document.getElementById('out');
const taxOut = document.getElementById('taxout');
function payloadBase(){
  return {
    plan_code: document.getElementById('plan').value,
    email: document.getElementById('email').value,
    country_code: document.getElementById('country').value,
    fiscal_profile: {
      is_business: document.getElementById('isBiz').value === 'true',
      vat_id: document.getElementById('vatId').value || null,
      vat_exempt: document.getElementById('vatEx').value === 'true'
    }
  };
}
document.getElementById('btnCheckout').onclick = async () => {
  const res = await fetch('/api/public/checkout/session', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payloadBase())
  });
  const data = await res.json();
  out.textContent = JSON.stringify(data, null, 2);
  if (data.checkout_url) window.open(data.checkout_url, '_blank');
};
document.getElementById('btnTax').onclick = async () => {
  const p = payloadBase();
  const map = {BASIC:5900, PRO:10900, ENTERPRISE:19900};
  const res = await fetch('/api/public/tax/evaluate', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      customer_country: p.country_code || 'IT',
      issuer_country: 'IT',
      is_business: !!p.fiscal_profile.is_business,
      customer_vat_id: p.fiscal_profile.vat_id,
      is_vat_exempt_declared: !!p.fiscal_profile.vat_exempt,
      amount_cents: map[p.plan_code],
      currency: 'EUR'
    })
  });
  taxOut.textContent = JSON.stringify(await res.json(), null, 2);
};
document.getElementById('btnInvoice').onclick = async () => {
  const p = payloadBase();
  const map = {BASIC:5900, PRO:10900, ENTERPRISE:19900};
  const res = await fetch('/api/public/invoice/preview', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      customer_name: 'Cliente Demo',
      customer_email: p.email,
      customer_country: p.country_code || 'IT',
      amount_cents: map[p.plan_code],
      is_business: !!p.fiscal_profile.is_business,
      customer_vat_id: p.fiscal_profile.vat_id,
      is_vat_exempt_declared: !!p.fiscal_profile.vat_exempt,
      description: `SoftiBridge ${p.plan_code} subscription`
    })
  });
  const data = await res.json();
  out.textContent = JSON.stringify(data, null, 2);
};
</script>
</body>
</html>
        """
    )


@router.get("/admin", response_class=HTMLResponse)
def preview_admin():
    return HTMLResponse(
        """
<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SoftiBridge Admin Preview</title>
<style>
body{font-family:system-ui;background:#0d111d;color:#ecf2ff;margin:0;padding:20px}
.grid{display:grid;grid-template-columns:360px 1fr;gap:16px;max-width:1200px;margin:auto}
.card{background:#151c2d;border:1px solid #2b3958;border-radius:12px;padding:14px}
input,select,button{width:100%;padding:9px;margin:5px 0;border-radius:8px;border:1px solid #334565;background:#0e1525;color:#fff}
button{background:#00d4aa;color:#052b22;font-weight:700;cursor:pointer}
pre{background:#0b1020;padding:10px;border-radius:8px;overflow:auto;font-size:12px;max-height:320px}
table{width:100%;border-collapse:collapse;font-size:12px} td,th{border-bottom:1px solid #26334f;padding:6px;text-align:left}
.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
</style></head><body>
<div class="grid">
  <div class="card">
    <h2>Admin Preview</h2>
    <div class="row">
      <input id="email" value="admin.demo@softi.local">
      <input id="pwd" value="Password123!">
    </div>
    <button id="registerAdmin">Registra Admin WL</button>
    <button id="loginAdmin">Login Admin</button>
    <hr style="border-color:#2b3958">
    <h3>Crea Cliente</h3>
    <input id="cliName" value="Mario Rossi">
    <div class="row">
      <input id="cliEmail" value="mario.rossi@example.com">
      <input id="cliCountry" value="IT">
    </div>
    <button id="createClient">Crea Cliente</button>
    <h3>Crea Licenza</h3>
    <input id="clientId" placeholder="client_id (auto dopo create)">
    <div class="row">
      <select id="plan"><option>BASIC</option><option selected>PRO</option><option>ENTERPRISE</option></select>
      <input id="days" type="number" value="30">
    </div>
    <button id="createLicense">Crea Licenza</button>
    <button id="refreshAll">Aggiorna Dati</button>
    <pre id="out">Pronto.</pre>
  </div>
  <div class="card">
    <h3>Dashboard Summary</h3>
    <pre id="summary"></pre>
    <h3>Clienti</h3>
    <table><thead><tr><th>ID</th><th>Nome</th><th>Email</th><th>Paese</th></tr></thead><tbody id="clients"></tbody></table>
    <h3>Licenze</h3>
    <table><thead><tr><th>ID</th><th>Piano</th><th>Stato</th><th>Scadenza</th><th>Azioni</th></tr></thead><tbody id="licenses"></tbody></table>
    <h3>Audit Logs</h3>
    <pre id="logs"></pre>
  </div>
</div>
<script>
let token = localStorage.getItem('softi_admin_preview_token') || '';
const out = (v)=>document.getElementById('out').textContent = typeof v==='string' ? v : JSON.stringify(v,null,2);
async function api(path, method='GET', body){
  const res = await fetch('/api'+path,{method,headers:{'Content-Type':'application/json', ...(token?{'Authorization':'Bearer '+token}:{})}, body:body?JSON.stringify(body):undefined});
  const txt = await res.text();
  let data; try{ data = txt?JSON.parse(txt):{} } catch { data = txt; }
  if(!res.ok) throw new Error(typeof data==='string'?data:JSON.stringify(data));
  return data;
}
async function refreshAll(){
  try{
    const [summary, clients, licenses, logs] = await Promise.all([
      api('/admin/dashboard/summary'),
      api('/admin/clients'),
      api('/admin/licenses'),
      api('/admin/logs?limit=30'),
    ]);
    document.getElementById('summary').textContent = JSON.stringify(summary,null,2);
    document.getElementById('clients').innerHTML = clients.map(c=>`<tr><td>${c.id}</td><td>${c.full_name}</td><td>${c.email||''}</td><td>${c.country_code||''}</td></tr>`).join('');
    document.getElementById('licenses').innerHTML = licenses.map(l=>`<tr>
      <td>${l.id}</td><td>${l.plan_code||''}</td><td>${l.status}</td><td>${l.expiry_at||''}</td>
      <td><button onclick="upgradeLic('${l.id}')">Upgrade→ENT</button><button onclick="killLic('${l.id}')">Kill</button></td>
    </tr>`).join('');
    document.getElementById('logs').textContent = JSON.stringify(logs,null,2);
  }catch(e){ out('Refresh error: '+e.message); }
}
async function loginOrRegister(role){
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('pwd').value;
  try{ await api('/auth/register','POST',{email,password,role}); } catch(e){}
  const tok = await api('/auth/login','POST',{email,password});
  token = tok.access_token; localStorage.setItem('softi_admin_preview_token', token);
  out(tok); refreshAll();
}
document.getElementById('registerAdmin').onclick = ()=>loginOrRegister('ADMIN_WL');
document.getElementById('loginAdmin').onclick = ()=>loginOrRegister('ADMIN_WL');
document.getElementById('createClient').onclick = async ()=>{
  try{
    const data = await api('/admin/clients','POST',{
      full_name: document.getElementById('cliName').value,
      email: document.getElementById('cliEmail').value,
      country_code: document.getElementById('cliCountry').value,
      fiscal_profile: {}
    });
    document.getElementById('clientId').value = data.id; out(data); refreshAll();
  }catch(e){ out(e.message); }
};
document.getElementById('createLicense').onclick = async ()=>{
  try{
    const data = await api('/admin/licenses','POST',{
      client_id: document.getElementById('clientId').value || null,
      plan_code: document.getElementById('plan').value,
      days: Number(document.getElementById('days').value || 30)
    });
    out(data); refreshAll();
  }catch(e){ out(e.message); }
};
window.upgradeLic = async (id)=>{ try{ out(await api('/admin/licenses/'+id+'/upgrade','POST',{plan_code:'ENTERPRISE'})); refreshAll(); }catch(e){out(e.message)} };
window.killLic = async (id)=>{ try{ out(await api('/admin/licenses/'+id+'/remote-kill','POST')); refreshAll(); }catch(e){out(e.message)} };
document.getElementById('refreshAll').onclick = refreshAll;
if (token) refreshAll();
</script></body></html>
        """
    )


@router.get("/client", response_class=HTMLResponse)
def preview_client():
    return HTMLResponse(
        """
<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SoftiBridge Client Preview</title>
<style>
body{font-family:system-ui;background:#09111d;color:#edf5ff;padding:20px}
.grid{max-width:1100px;margin:auto;display:grid;grid-template-columns:360px 1fr;gap:16px}
.card{background:#121b2c;border:1px solid #2d3f60;border-radius:12px;padding:14px}
input,button,select{width:100%;padding:9px;margin:5px 0;border-radius:8px;border:1px solid #334565;background:#0f1728;color:#fff}
button{background:#7fe7ff;color:#062430;font-weight:700;cursor:pointer}
pre{background:#0a1020;padding:10px;border-radius:8px;overflow:auto;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12px} td,th{border-bottom:1px solid #26334f;padding:6px}
</style></head><body>
<div class="grid">
  <div class="card">
    <h2>Client Preview</h2>
    <input id="email" value="mario.rossi@example.com">
    <input id="pwd" value="Password123!">
    <button id="register">Registra Cliente</button>
    <button id="login">Login Cliente</button>
    <button id="dashboard">Carica Dashboard</button>
    <button id="portal">Apri Billing Portal</button>
    <pre id="out">Pronto.</pre>
  </div>
  <div class="card">
    <h3>Dashboard</h3>
    <pre id="dash"></pre>
    <h3>Downloads</h3>
    <table><thead><tr><th>Codice</th><th>File</th><th>Versione</th><th>Azione</th></tr></thead><tbody id="downloads"></tbody></table>
    <h3>Fatture</h3>
    <pre id="invoices"></pre>
  </div>
</div>
<script>
let token = localStorage.getItem('softi_client_preview_token') || '';
const out=(v)=>document.getElementById('out').textContent = typeof v==='string'?v:JSON.stringify(v,null,2);
async function api(path, method='GET', body){
  const res = await fetch('/api'+path,{method,headers:{'Content-Type':'application/json', ...(token?{'Authorization':'Bearer '+token}:{})}, body:body?JSON.stringify(body):undefined});
  const txt = await res.text(); let data; try{data=txt?JSON.parse(txt):{}}catch{data=txt}
  if(!res.ok) throw new Error(typeof data==='string'?data:JSON.stringify(data));
  return data;
}
async function loginOrRegister(){
  const email=document.getElementById('email').value.trim(); const password=document.getElementById('pwd').value;
  try{ await api('/auth/register','POST',{email,password,role:'CLIENT'});}catch(e){}
  const t = await api('/auth/login','POST',{email,password});
  token=t.access_token; localStorage.setItem('softi_client_preview_token', token); out(t);
}
async function loadDash(){
  try{
    const [dash, downloads, invoices] = await Promise.all([
      api('/client/dashboard'),
      api('/client/downloads'),
      api('/client/invoices'),
    ]);
    document.getElementById('dash').textContent = JSON.stringify(dash,null,2);
    document.getElementById('invoices').textContent = JSON.stringify(invoices,null,2);
    document.getElementById('downloads').innerHTML = downloads.map(d=>`<tr><td>${d.code}</td><td>${d.file_name}</td><td>${d.version}</td><td><button onclick="getDl('${d.id}')">Link</button></td></tr>`).join('');
  }catch(e){ out('Dashboard error: '+e.message); }
}
window.getDl = async (id)=>{ try{ const d = await api('/client/downloads/'+id+'/token','POST'); out(d); window.open(d.url, '_blank'); }catch(e){ out(e.message);} };
document.getElementById('register').onclick = loginOrRegister;
document.getElementById('login').onclick = loginOrRegister;
document.getElementById('dashboard').onclick = loadDash;
document.getElementById('portal').onclick = async ()=>{ try{ const r=await api('/client/billing-portal/session','POST'); out(r); window.open(r.url,'_blank'); }catch(e){ out(e.message);} };
</script></body></html>
        """
    )


@router.get("/setup", response_class=HTMLResponse)
def preview_setup():
    return HTMLResponse(
        """
<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SoftiBridge Setup Preview</title>
<style>
body{font-family:system-ui;background:#08111d;color:#eaf2ff;margin:0;padding:20px}
.wrap{max-width:1200px;margin:auto;display:grid;grid-template-columns:380px 1fr;gap:16px}
.card{background:#121b2b;border:1px solid #2a3b5a;border-radius:12px;padding:14px}
input,button,textarea{width:100%;padding:9px;margin:5px 0;border-radius:8px;border:1px solid #334a69;background:#0c1424;color:#fff}
button{background:#00d4aa;color:#04271e;font-weight:700;cursor:pointer}
pre{background:#0a1020;padding:10px;border-radius:8px;overflow:auto;font-size:12px;max-height:420px}
.muted{color:#9cb0cf;font-size:12px}
</style></head><body>
<div class="wrap">
  <div class="card">
    <h2>Primo Avvio</h2>
    <p class="muted">Usa prima <code>/api/demo/bootstrap</code> per ottenere token admin demo e poi incollalo qui.</p>
    <textarea id="token" rows="4" placeholder="Bearer token admin..."></textarea>
    <button id="loadStatus">Carica Status Setup</button>
    <button id="checkTg">Check Telegram (getMe + webhookInfo)</button>
    <button id="setWebhook">Set Telegram Webhook</button>
    <input id="tgMsg" value="Test SoftiBridge admin setup ✅">
    <button id="testAdminMsg">Invia Test a ADMIN_SUPER_CHAT_ID</button>
    <pre id="out">Pronto.</pre>
  </div>
  <div class="card">
    <h3>Checklist rapida</h3>
    <ol>
      <li>Esegui <code>POST /api/demo/bootstrap</code></li>
      <li>Incolla token admin qui</li>
      <li>Configura <code>TELEGRAM_BOT_TOKEN</code> e chat IDs in <code>.env</code></li>
      <li>Riavvia backend</li>
      <li>Esegui test Telegram e webhook</li>
    </ol>
    <h3>Endpoint utili</h3>
    <ul>
      <li><a href="/api/setup/status" target="_blank">/api/setup/status</a></li>
      <li><a href="/api/telegram/health" target="_blank">/api/telegram/health</a></li>
      <li><a href="/api/telegram/info" target="_blank">/api/telegram/info</a></li>
    </ul>
    <pre id="status">Nessuno status caricato.</pre>
  </div>
</div>
<script>
const out = document.getElementById('out');
const statusEl = document.getElementById('status');
function authHeaders(){ const t=document.getElementById('token').value.trim(); return t?{'Authorization':'Bearer '+t}:{ }; }
async function call(path, method='GET', body){
  const res = await fetch('/api'+path,{method,headers:{'Content-Type':'application/json',...authHeaders()},body: body?JSON.stringify(body):undefined});
  const txt = await res.text(); let data; try{data=txt?JSON.parse(txt):{}}catch{data=txt}
  if(!res.ok) throw new Error(typeof data==='string'?data:JSON.stringify(data));
  return data;
}
document.getElementById('loadStatus').onclick = async()=>{ try{ const d=await call('/setup/status'); statusEl.textContent = JSON.stringify(d,null,2); out.textContent='Status caricato'; }catch(e){ out.textContent=e.message; } };
document.getElementById('checkTg').onclick = async()=>{ try{ out.textContent = JSON.stringify(await call('/setup/telegram/check','POST'),null,2);}catch(e){ out.textContent=e.message; } };
document.getElementById('setWebhook').onclick = async()=>{ try{ out.textContent = JSON.stringify(await call('/setup/telegram/set-webhook','POST'),null,2);}catch(e){ out.textContent=e.message; } };
document.getElementById('testAdminMsg').onclick = async()=>{ try{ out.textContent = JSON.stringify(await call('/notifications/telegram/test-admin?text='+encodeURIComponent(document.getElementById('tgMsg').value),'POST'),null,2);}catch(e){ out.textContent=e.message; } };
</script></body></html>
        """
    )


@router.get("/tour", response_class=HTMLResponse)
def preview_tour():
    return HTMLResponse(
        """
<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SoftiBridge Virtual Tour</title>
<style>
body{margin:0;font-family:system-ui;background:#08101b;color:#eff6ff}
.top{padding:16px 20px;border-bottom:1px solid #22324d;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#08101b;z-index:3}
.wrap{display:grid;grid-template-columns:320px 1fr;height:calc(100vh - 66px)}
.side{border-right:1px solid #22324d;padding:16px;overflow:auto}
.step{background:#111a2a;border:1px solid #2b3e5d;border-radius:10px;padding:12px;margin-bottom:10px;cursor:pointer}
.step.active{border-color:#00d4aa;box-shadow:0 0 0 1px #00d4aa inset}
.step h3{margin:0 0 6px;font-size:14px}
.step p{margin:0;color:#a8bbd9;font-size:12px}
.main{display:grid;grid-template-rows:auto 1fr auto}
.framebar{padding:12px 14px;border-bottom:1px solid #22324d;display:flex;gap:8px;align-items:center}
.framebar button{background:#182439;border:1px solid #314867;color:#fff;padding:8px 10px;border-radius:8px;cursor:pointer}
.framebar button.primary{background:#00d4aa;color:#04271e;border-color:#00d4aa;font-weight:700}
iframe{width:100%;height:100%;border:0;background:#fff}
.note{padding:10px 14px;border-top:1px solid #22324d;color:#a8bbd9;font-size:12px}
code{background:#121a28;padding:2px 5px;border-radius:6px}
</style></head><body>
<div class="top">
  <div><strong>SoftiBridge Virtual Tour</strong> · Setup → Admin → Client → Bridge EA</div>
  <div>
    <a style="color:#7fe7ff" href="/preview/setup" target="_blank">Apri Setup</a> ·
    <a style="color:#7fe7ff" href="/preview/admin" target="_blank">Apri Admin</a> ·
    <a style="color:#7fe7ff" href="/preview/client" target="_blank">Apri Client</a>
  </div>
</div>
<div class="wrap">
  <div class="side" id="steps"></div>
  <div class="main">
    <div class="framebar">
      <button id="prevBtn">◀ Prev</button>
      <button id="nextBtn" class="primary">Next ▶</button>
      <button id="openBtn">Apri in nuova tab</button>
      <span id="title" style="margin-left:8px;font-weight:700"></span>
    </div>
    <iframe id="frame" src="/preview/setup"></iframe>
    <div class="note" id="note"></div>
  </div>
</div>
<script>
const steps = [
 {title:'1. Primo Avvio / Setup', url:'/preview/setup', note:'Configura bot @softibridge, chat ID admin, webhook e verifica lo stato. Usa /api/demo/bootstrap per token demo.'},
 {title:'2. Checkout / Fatture', url:'/preview', note:'Test piani, checkout (reale o simulato), calcolo IVA e generazione fattura PDF di anteprima.'},
 {title:'3. Admin Panel Preview', url:'/preview/admin', note:'Login admin, crea clienti/licenze, upgrade, remote kill, log e summary. Token admin demo in localStorage viene riutilizzato.'},
 {title:'4. Client Panel Preview', url:'/preview/client', note:'Login client, dashboard licenza, fatture e downloads firmati. Usa anche la web client originale per pulsanti reali close/cancel/SLTP via API.'},
 {title:'5. Format Wizard (Nuove Sale)', url:'/preview/signals', note:'Parser reale: standard + template custom regex + confidence score + ingest in queue EA.'},
 {title:'6. Bridge EA / Queue Monitor', url:'/preview/bridge', note:'Monitora queue/outbox reali, simula eventi/risultati e invia comandi compatibili MT4/MT5 nella queue.'}
];
let idx = 0;
const frame = document.getElementById('frame');
const title = document.getElementById('title');
const note = document.getElementById('note');
const stepsEl = document.getElementById('steps');
function renderSteps(){
  stepsEl.innerHTML = steps.map((s,i)=>`<div class="step ${i===idx?'active':''}" onclick="go(${i})"><h3>${s.title}</h3><p>${s.note}</p></div>`).join('');
}
window.go = function(i){ idx=i; frame.src = steps[idx].url; title.textContent = steps[idx].title; note.textContent = steps[idx].note; renderSteps(); };
document.getElementById('prevBtn').onclick=()=>go((idx-1+steps.length)%steps.length);
document.getElementById('nextBtn').onclick=()=>go((idx+1)%steps.length);
document.getElementById('openBtn').onclick=()=>window.open(steps[idx].url,'_blank');
go(0);
</script></body></html>
        """
    )


@router.get("/bridge", response_class=HTMLResponse)
def preview_bridge():
    return HTMLResponse(
        """
<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SoftiBridge Bridge Preview</title>
<style>
body{font-family:system-ui;background:#07101a;color:#eef6ff;margin:0;padding:20px}
.wrap{max-width:1300px;margin:auto;display:grid;grid-template-columns:380px 1fr;gap:16px}
.card{background:#111a2a;border:1px solid #293d5c;border-radius:12px;padding:14px}
input,select,button,textarea{width:100%;padding:9px;margin:5px 0;border-radius:8px;border:1px solid #354a69;background:#0c1423;color:#fff}
button{background:#00d4aa;color:#06261f;font-weight:700;cursor:pointer}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
pre{background:#0a1020;padding:10px;border-radius:8px;overflow:auto;font-size:12px;max-height:280px}
table{width:100%;border-collapse:collapse;font-size:12px} td,th{border-bottom:1px solid #25344f;padding:6px;text-align:left}
</style></head><body>
<div class="wrap">
  <div class="card">
    <h2>Bridge EA Queue</h2>
    <textarea id="token" rows="4" placeholder="Bearer token admin (da /api/demo/bootstrap o /preview/admin)"></textarea>
    <button id="statusBtn">Status Bridge</button>
    <h3>Enqueue comando (PIPS)</h3>
    <div class="grid2"><input id="symbol" value="XAUUSD"><select id="side"><option>BUY</option><option>SELL</option></select></div>
    <div class="grid2"><input id="entry" type="number" step="0.01" value="2650"><input id="slp" type="number" value="100"></div>
    <div class="grid2"><input id="tp1" type="number" value="150"><input id="tp2" type="number" value="250"></div>
    <div class="grid2"><input id="tp3" type="number" value="400"><input id="thr" type="number" value="15"></div>
    <button id="enqueueBtn">Invia in Queue MT4+MT5</button>
    <h3>Simulazione outbox (dev)</h3>
    <div class="grid2"><input id="simId" placeholder="ID (vuoto=auto)"><select id="simEv"><option>TP1</option><option>TP2</option><option>TP3</option><option>SL</option><option>SIGNAL_DELETED</option></select></div>
    <button id="simEventBtn">Simula evento</button>
    <div class="grid2"><select id="simResStatus"><option>OK</option><option>WAIT</option><option>FAIL</option></select><input id="simResMsg" value="SIMULATED"></div>
    <button id="simResultBtn">Simula result file</button>
    <pre id="out">Pronto.</pre>
  </div>
  <div class="card">
    <h3>Status</h3>
    <pre id="status">Nessuno status.</pre>
    <h3>Events</h3>
    <table><thead><tr><th>ts</th><th>id</th><th>event</th><th>symbol</th><th>side</th></tr></thead><tbody id="events"></tbody></table>
    <h3>Results</h3>
    <table><thead><tr><th>file</th><th>id</th><th>status</th><th>msg</th></tr></thead><tbody id="results"></tbody></table>
  </div>
</div>
<script>
const out = document.getElementById('out');
function token(){ return document.getElementById('token').value.trim() || localStorage.getItem('softi_admin_preview_token') || localStorage.getItem('softibridge_admin_token') || ''; }
async function api(path, method='GET', body){
  const t = token();
  const res = await fetch('/api'+path,{method,headers:{'Content-Type':'application/json', ...(t?{'Authorization':'Bearer '+t}:{})},body: body?JSON.stringify(body):undefined});
  const txt = await res.text(); let data; try{ data = txt?JSON.parse(txt):{} } catch { data = txt; }
  if(!res.ok) throw new Error(typeof data==='string'?data:JSON.stringify(data));
  return data;
}
async function refreshBridge(){
  try{
    const [s,e,r] = await Promise.all([api('/bridge/status'), api('/bridge/events?limit=50'), api('/bridge/results?limit=50')]);
    document.getElementById('status').textContent = JSON.stringify(s,null,2);
    document.getElementById('events').innerHTML = (e.events||[]).slice().reverse().map(x=>`<tr><td>${x.ts||''}</td><td>${x.id||''}</td><td>${x.event||''}</td><td>${x.symbol||''}</td><td>${x.side||''}</td></tr>`).join('');
    document.getElementById('results').innerHTML = (r.results||[]).map(x=>`<tr><td>${x._file||''}</td><td>${x.id||''}</td><td>${x.status||''}</td><td>${x.msg||''}</td></tr>`).join('');
  }catch(err){ out.textContent = 'Bridge refresh error: '+err.message; }
}
document.getElementById('statusBtn').onclick = refreshBridge;
document.getElementById('enqueueBtn').onclick = async ()=>{
  try{
    const p = {
      mode:'PIPS',
      symbol: document.getElementById('symbol').value,
      side: document.getElementById('side').value,
      entry: Number(document.getElementById('entry').value),
      sl_pips: Number(document.getElementById('slp').value),
      tp1_pips: Number(document.getElementById('tp1').value),
      tp2_pips: Number(document.getElementById('tp2').value),
      tp3_pips: Number(document.getElementById('tp3').value),
      threshold_pips: Number(document.getElementById('thr').value),
      write_mt4:true, write_mt5:true
    };
    const d = await api('/bridge/commands','POST',p);
    document.getElementById('simId').value = d.id;
    out.textContent = JSON.stringify(d,null,2);
    refreshBridge();
  }catch(err){ out.textContent = err.message; }
};
document.getElementById('simEventBtn').onclick = async ()=>{
  try{
    const d = await api('/bridge/simulate/event','POST',{ cmd_id: document.getElementById('simId').value || undefined, event: document.getElementById('simEv').value, symbol: document.getElementById('symbol').value, side: document.getElementById('side').value });
    out.textContent = JSON.stringify(d,null,2); refreshBridge();
  }catch(err){ out.textContent = err.message; }
};
document.getElementById('simResultBtn').onclick = async ()=>{
  try{
    const d = await api('/bridge/simulate/result','POST',{ cmd_id: document.getElementById('simId').value || undefined, status: document.getElementById('simResStatus').value, msg: document.getElementById('simResMsg').value });
    out.textContent = JSON.stringify(d,null,2); refreshBridge();
  }catch(err){ out.textContent = err.message; }
};
setInterval(refreshBridge, 4000);
refreshBridge();
</script></body></html>
        """
    )


@router.get("/signals", response_class=HTMLResponse)
def preview_signals():
    return HTMLResponse(
        """
<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SoftiBridge Signal Format Wizard</title>
<style>
body{font-family:system-ui;background:#08101a;color:#eef6ff;margin:0;padding:20px}
.wrap{max-width:1400px;margin:auto;display:grid;grid-template-columns:420px 1fr;gap:16px}
.card{background:#111a2b;border:1px solid #2a3f5f;border-radius:12px;padding:14px}
input,select,button,textarea{width:100%;padding:9px;margin:5px 0;border-radius:8px;border:1px solid #354b6c;background:#0c1524;color:#fff}
button{background:#00d4aa;color:#06261f;font-weight:700;cursor:pointer}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
pre{background:#0a1020;padding:10px;border-radius:8px;overflow:auto;font-size:12px;max-height:300px}
table{width:100%;border-collapse:collapse;font-size:12px} td,th{border-bottom:1px solid #25354f;padding:6px;text-align:left}
.hint{color:#a7bbd9;font-size:12px}
</style></head><body>
<div class="wrap">
  <div class="card">
    <h2>Signal Wizard</h2>
    <textarea id="token" rows="4" placeholder="Bearer token admin/client (oppure usa /api/demo/bootstrap)"></textarea>
    <div class="grid2">
      <input id="roomName" placeholder="Nome sala (es. Gold Room Premium)">
      <input id="roomChat" placeholder="Chat ID Telegram (opzionale)">
    </div>
    <button id="createRoomBtn">Crea Sala</button>
    <select id="roomSelect"></select>
    <textarea id="signalText" rows="10" placeholder="Incolla qui un segnale reale della sala trading..."></textarea>
    <button id="parseBtn">Test Parse</button>
    <div class="grid2">
      <input id="threshold" type="number" value="85">
      <button id="ingestBtn">Parse + Enqueue (se confidence ok)</button>
    </div>
    <h3>Nuovo formato custom (regex)</h3>
    <input id="fmtName" placeholder="Nome formato custom">
    <input id="fmtRegex" placeholder="Regex con gruppi nominati (?P<side>BUY|SELL) ...">
    <div class="grid2">
      <select id="fmtMode"><option>AUTO</option><option>PIPS</option><option>PRICE</option><option>SHORTHAND</option></select>
      <input id="fmtPriority" type="number" value="50">
    </div>
    <button id="saveFmtBtn">Salva formato custom</button>
    <div class="hint">Gruppi supportati: side, symbol, entry, sl_pips, tp1_pips, tp2_pips, tp3_pips, entry_lo, entry_hi, sl_price, tp1_price...</div>
    <pre id="out">Pronto.</pre>
  </div>
  <div class="card">
    <h3>Risultato Parse</h3>
    <pre id="parseOut">Nessun test.</pre>
    <h3>Formati configurati</h3>
    <table><thead><tr><th>Nome</th><th>Sala</th><th>Tipo</th><th>Mode</th><th>Prio</th></tr></thead><tbody id="formats"></tbody></table>
    <h3>Parse Logs</h3>
    <table><thead><tr><th>Quando</th><th>Parser</th><th>Conf</th><th>Mode</th><th>Valid</th></tr></thead><tbody id="logs"></tbody></table>
  </div>
</div>
<script>
const out = document.getElementById('out');
const parseOut = document.getElementById('parseOut');
function token(){ return document.getElementById('token').value.trim() || localStorage.getItem('softi_admin_preview_token') || localStorage.getItem('softibridge_admin_token') || localStorage.getItem('softi_client_preview_token') || ''; }
async function api(path, method='GET', body){
  const t = token();
  const res = await fetch('/api'+path,{method,headers:{'Content-Type':'application/json', ...(t?{'Authorization':'Bearer '+t}:{})}, body:body?JSON.stringify(body):undefined});
  const txt = await res.text(); let data; try{data=txt?JSON.parse(txt):{}}catch{data=txt}
  if(!res.ok) throw new Error(typeof data==='string'?data:JSON.stringify(data));
  return data;
}
function selectedRoom(){ return document.getElementById('roomSelect').value || null; }
function selectedRoomChatId(){
  const sel = document.getElementById('roomSelect');
  const opt = sel && sel.options ? sel.options[sel.selectedIndex] : null;
  return (opt && opt.dataset && opt.dataset.chatId) ? opt.dataset.chatId : null;
}
function signalChatId(){
  return document.getElementById('roomChat').value || selectedRoomChatId() || null;
}
async function refreshMeta(){
  try{
    const roomId = selectedRoom();
    const logsQs = roomId ? ('?room_id='+encodeURIComponent(roomId)+'&limit=20') : '?limit=20';
    const [rooms, formats, logs] = await Promise.all([
      api('/signals/rooms'),
      api('/signals/formats'+(roomId?('?room_id='+encodeURIComponent(roomId)):'')),
      api('/signals/parse-logs'+logsQs)
    ]);
    const sel = document.getElementById('roomSelect');
    const cur = sel.value;
    sel.innerHTML = '<option value="">(nessuna sala / global)</option>' + rooms.map(r=>`<option value="${r.id}" data-chat-id="${r.source_chat_id||''}">${r.name}${r.source_chat_id?' ['+r.source_chat_id+']':''}</option>`).join('');
    if([...sel.options].some(o=>o.value===cur)) sel.value = cur;
    document.getElementById('formats').innerHTML = formats.map(f=>`<tr><td>${f.name}</td><td>${f.room_id||'GLOBAL'}</td><td>${f.parser_kind}</td><td>${f.mode_hint||'AUTO'}</td><td>${f.priority}</td></tr>`).join('');
    document.getElementById('logs').innerHTML = logs.map(l=>`<tr><td>${l.created_at?new Date(l.created_at).toLocaleTimeString('it-IT'):''}</td><td>${l.parser_used||''}</td><td>${l.confidence}</td><td>${l.result_mode||''}</td><td>${l.valid?'✅':'❌'}</td></tr>`).join('');
  }catch(e){ out.textContent = 'Meta refresh error: '+e.message; }
}
document.getElementById('roomSelect').onchange = refreshMeta;
document.getElementById('createRoomBtn').onclick = async ()=>{
  try{
    const d = await api('/signals/rooms','POST',{name: document.getElementById('roomName').value || 'Nuova Sala', source_type:'TELEGRAM', source_chat_id: document.getElementById('roomChat').value || null});
    out.textContent = JSON.stringify(d,null,2);
    refreshMeta();
  }catch(e){ out.textContent = e.message; }
};
document.getElementById('parseBtn').onclick = async ()=>{
  try{
    const d = await api('/signals/parse/test','POST',{ text: document.getElementById('signalText').value, room_id: selectedRoom(), source_chat_id: signalChatId(), save_log: true});
    parseOut.textContent = JSON.stringify(d,null,2);
    refreshMeta();
  }catch(e){ parseOut.textContent = e.message; }
};
document.getElementById('ingestBtn').onclick = async ()=>{
  try{
    const d = await api('/signals/ingest','POST',{ text: document.getElementById('signalText').value, room_id: selectedRoom(), source_chat_id: signalChatId(), auto_enqueue_threshold: Number(document.getElementById('threshold').value||85), write_mt4: true, write_mt5: true });
    parseOut.textContent = JSON.stringify(d,null,2);
    refreshMeta();
  }catch(e){ parseOut.textContent = e.message; }
};
document.getElementById('saveFmtBtn').onclick = async ()=>{
  try{
    const d = await api('/signals/formats','POST',{
      room_id: selectedRoom(),
      name: document.getElementById('fmtName').value || 'Formato custom',
      parser_kind: 'REGEX_TEMPLATE',
      mode_hint: document.getElementById('fmtMode').value,
      regex_pattern: document.getElementById('fmtRegex').value,
      priority: Number(document.getElementById('fmtPriority').value||50),
      enabled: true
    });
    out.textContent = JSON.stringify(d,null,2);
    refreshMeta();
  }catch(e){ out.textContent = e.message; }
};
refreshMeta();
</script></body></html>
        """
    )
