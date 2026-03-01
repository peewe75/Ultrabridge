(function () {
  const LS_API = "softibridge_api_base";
  const LS_TOKEN = "softibridge_admin_lite_token";
  const LS_TOKEN_FALLBACKS = ["softi_admin_preview_token", "softibridge_admin_token"];

  function installStorageSync() {
    window.addEventListener("storage", (event) => {
      const watched = [LS_API, LS_TOKEN].concat(LS_TOKEN_FALLBACKS);
      if (!watched.includes(event.key || "")) return;
      if (document.visibilityState === "hidden") return;
      window.location.reload();
    });
  }

  const state = {
    apiBase: null,
    token: null,
    view: "dashboard",
    me: null,
    adminSelf: null,
    summary: null,
    clients: [],
    licenses: [],
    invoices: [],
    payments: [],
    manualPayments: [],
  };

  const clerkState = {
    checked: false,
    enabled: false,
    publishableKey: "",
    runtimeReady: false,
  };

  function dashboardRouteByRole(role) {
    if (role === "ADMIN_WL") return "/dashboard/admin/";
    if (role === "SUPER_ADMIN") return "/dashboard/super-admin/";
    if (role === "CLIENT") return "/dashboard/client/";
    return "/landing/";
  }

  const viewMeta = {
    dashboard: { title: "Dashboard", subtitle: "Controllo operativo del tuo network clienti" },
    clients: { title: "Clienti", subtitle: "Gestione clienti del tuo perimetro Admin" },
    licenses: { title: "Licenze", subtitle: "Licenze e stato operativo dei tuoi clienti" },
    billing: { title: "Fatture & Pagamenti", subtitle: "Billing clienti, pagamenti e verifiche manuali" },
    branding: { title: "Branding", subtitle: "Identità del tuo Admin Lite (logo, colori, sender)" },
    setup: { title: "Setup", subtitle: "Connessione API e accesso Admin Lite" },
  };

  function $(id) { return document.getElementById(id); }

  function normalizeApiBase(value) {
    const v = (value || "").trim();
    if (!v) return "";
    return v.replace(/\/+$/, "");
  }

  function defaultApiBase() {
    return "http://127.0.0.1:8000/api";
  }

  function loadPersistedApiBase() {
    const saved = normalizeApiBase(localStorage.getItem(LS_API));
    return saved || defaultApiBase();
  }

  function loadPersistedToken() {
    let t = localStorage.getItem(LS_TOKEN);
    if (t) return t;
    for (const k of LS_TOKEN_FALLBACKS) {
      t = localStorage.getItem(k);
      if (t) return t;
    }
    return null;
  }

  function saveApiBase(base) {
    state.apiBase = normalizeApiBase(base);
    localStorage.setItem(LS_API, state.apiBase);
    $("api-base-input").value = state.apiBase;
    $("api-chip").textContent = `API: ${state.apiBase || "non configurata"}`;
  }

  function saveToken(token) {
    state.token = token || null;
    if (state.token) localStorage.setItem(LS_TOKEN, state.token);
    else localStorage.removeItem(LS_TOKEN);
    updateLoginState();
  }

  function updateLoginState() {
    const online = !!state.token;
    const el = $("sidebar-login-state");
    el.textContent = online ? "Autenticato" : "Non connesso";
    el.className = `state-pill ${online ? "online" : "offline"}`;
    $("login-state-box").textContent = online
      ? `Token presente. ${state.me ? `Utente: ${state.me.email} (${state.me.role})` : "Verifica /auth/me in corso..."}` 
      : "Non autenticato.";
  }

  function showToast(message, kind = "ok") {
    const stack = $("toast-stack");
    const node = document.createElement("div");
    node.className = `toast ${kind}`;
    node.textContent = message;
    stack.appendChild(node);
    setTimeout(() => node.remove(), 3200);
  }

  async function api(path, options = {}) {
    const base = state.apiBase || loadPersistedApiBase();
    if (!base) throw new Error("API URL non configurata");
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = Object.assign({}, options.headers || {});
    const isForm = options.body instanceof FormData;
    if (!isForm && options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const res = await fetch(url, { ...options, headers });
    let payload = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) payload = await res.json();
    else payload = await res.text();
    if (!res.ok) {
      const msg = payload && typeof payload === "object" ? (payload.detail || payload.error || JSON.stringify(payload)) : String(payload || res.status);
      throw new Error(msg);
    }
    return payload;
  }

  async function loadClerkRuntime(publishableKey) {
    if (!publishableKey) throw new Error("CLERK_PUBLISHABLE_KEY mancante");
    if (!window.Clerk) {
      await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-softi-clerk="1"]');
        if (existing) {
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", () => reject(new Error("Caricamento Clerk fallito")), { once: true });
          return;
        }
        const script = document.createElement("script");
        script.async = true;
        script.setAttribute("data-softi-clerk", "1");
        script.setAttribute("data-clerk-publishable-key", publishableKey);
        script.src = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Caricamento Clerk fallito"));
        document.head.appendChild(script);
      });
    }
    if (!window.Clerk) throw new Error("SDK Clerk non disponibile");
    if (!window.Clerk.loaded) {
      await window.Clerk.load({ publishableKey });
    }
    clerkState.runtimeReady = true;
  }

  async function initClerkProvider() {
    if (clerkState.checked) return clerkState;
    clerkState.checked = true;
    try {
      const base = state.apiBase || loadPersistedApiBase();
      const res = await fetch(`${base}/public/auth/providers`);
      if (!res.ok) return clerkState;
      const payload = await res.json();
      const provider = payload?.clerk || {};
      if (provider.enabled && provider.publishable_key) {
        clerkState.enabled = true;
        clerkState.publishableKey = provider.publishable_key;
        await loadClerkRuntime(provider.publishable_key);
      }
    } catch (_) {
    }
    return clerkState;
  }

  async function clerkEmailPasswordLogin(email, password) {
    await initClerkProvider();
    if (!clerkState.enabled || !clerkState.runtimeReady) throw new Error("Clerk non configurato su backend");
    const attempt = await window.Clerk.client.signIn.create({ identifier: email, password });
    if (attempt.status !== "complete") throw new Error("Login Clerk incompleto: verifica richiesta");
    await window.Clerk.setActive({ session: attempt.createdSessionId });
    const token = await window.Clerk.session?.getToken();
    if (!token) throw new Error("Token Clerk non disponibile");
    return token;
  }

  function eurosToCents(val) {
    const n = Number(String(val).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
  }

  function formatMoney(cents, currency = "EUR") {
    const amount = (Number(cents || 0) / 100);
    try {
      return new Intl.NumberFormat("it-IT", { style: "currency", currency: currency || "EUR" }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${(currency || "EUR").toUpperCase()}`;
    }
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("it-IT");
  }

  function statusBadge(status) {
    const s = String(status || "").toUpperCase();
    const cls = s.includes("PAID") || s === "ACTIVE" || s === "APPROVED" ? "active"
      : (s.includes("PENDING") || s.includes("GRACE") ? "pending"
      : (s.includes("REJECT") || s.includes("SUSP") || s.includes("REVOK") ? "danger" : "muted"));
    return `<span class="status-badge ${cls}">${s || "N/D"}</span>`;
  }

  function setView(view) {
    state.view = view;
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
    const meta = viewMeta[view] || { title: view, subtitle: "" };
    $("view-title").textContent = meta.title;
    $("view-subtitle").textContent = meta.subtitle;
    location.hash = view;
  }

  function populateClientSelects() {
    const options = [`<option value="">Seleziona cliente</option>`].concat(
      state.clients.map((c) => `<option value="${c.id}">${escapeHtml(c.full_name)}${c.email ? ` · ${escapeHtml(c.email)}` : ""}</option>`)
    ).join("");
    $("license-client-id").innerHTML = options;
    $("invoice-client-id").innerHTML = options;
  }

    function renderDashboard() {
        const s = state.summary || {};
    $("kpi-clients").textContent = s.clients_total ?? 0;
    $("kpi-licenses").textContent = s.licenses_total ?? 0;
    $("kpi-licenses-active").textContent = s.licenses_active ?? 0;
    $("kpi-paid").textContent = formatMoney(s.invoices_total_cents || 0, "EUR");

    const admin = state.adminSelf?.admin_wl;
    const badge = $("admin-status-badge");
    if (admin) {
      const st = String(admin.status || "").toUpperCase();
      const badgeClass = st.includes("PAID") || st === "ACTIVE" ? "active" : (st.includes("PENDING") || st.includes("GRACE") ? "pending" : (st.includes("SUSP") || st.includes("REVOK") ? "danger" : "muted"));
      badge.className = `status-badge ${badgeClass}`;
      badge.textContent = st || "N/D";
      $("admin-profile-box").innerHTML = [
        kv("Brand", admin.brand_name || "—"),
        kv("Email", admin.email || "—"),
        kv("Piano", admin.admin_plan_code || "—"),
        kv("Contatto", admin.contact_name || "—"),
        kv("Fee L1", typeof admin.fee_pct_l1 === "number" ? `${admin.fee_pct_l1}%` : "—"),
        kv("Scadenza", admin.subscription?.current_period_end ? formatDate(admin.subscription.current_period_end) : "—"),
      ].join("");
      const limits = admin.limits || {};
      $("admin-limits-box").innerHTML = [
        kv("Clienti max", limits.max_clients ?? "—"),
        kv("Licenze attive max", limits.max_active_licenses ?? "—"),
        kv("Affiliati max", limits.max_affiliates ?? "—"),
        kv("VPS max", limits.max_vps_nodes ?? "—"),
        kv("Branding custom", yesNo(limits.can_custom_branding)),
        kv("Dominio custom", yesNo(limits.can_custom_domain)),
      ].join("");
    } else {
      $("admin-profile-box").textContent = "Profilo Admin WL non trovato. Verifica che il Super Admin abbia creato il tuo account WL con la stessa email del login.";
      $("admin-limits-box").textContent = "Nessun limite disponibile.";
      $("admin-status-badge").className = "status-badge muted";
      $("admin-status-badge").textContent = "N/D";
    }
  }

  function kv(k, v) { return `<div class="kv"><span class="k">${escapeHtml(String(k))}</span><span class="v">${escapeHtml(String(v ?? "—"))}</span></div>`; }
  function yesNo(v) { return v ? "Sì" : "No"; }
  function escapeHtml(s) { return String(s).replace(/[&<>\"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c])); }

  function renderClients() {
    const q = ($("clients-search").value || "").trim().toLowerCase();
    const rows = state.clients.filter((c) => !q || [c.full_name, c.email, c.telegram_username, c.country_code].some((v) => String(v || "").toLowerCase().includes(q)));
    $("clients-table-body").innerHTML = rows.length ? rows.map((c) => `
      <tr>
        <td>${escapeHtml(c.full_name || "—")}</td>
        <td>${escapeHtml(c.email || "—")}</td>
        <td>${escapeHtml(c.telegram_username || "—")}</td>
        <td>${escapeHtml(c.country_code || "—")}</td>
        <td>${statusBadge(c.status || "ACTIVE")}</td>
      </tr>`).join("") : `<tr><td colspan="5" class="empty">Nessun cliente nel tuo perimetro.</td></tr>`;
  }

  function clientNameById(id) {
    return state.clients.find((c) => c.id === id)?.full_name || id || "—";
  }

  function renderLicenses() {
    $("licenses-table-body").innerHTML = state.licenses.length ? state.licenses.map((l) => `
      <tr>
        <td class="mono">${escapeHtml(l.id)}</td>
        <td>${escapeHtml(clientNameById(l.client_id))}</td>
        <td>${escapeHtml(l.plan_code || "—")}</td>
        <td>${statusBadge(l.status)}</td>
        <td>${escapeHtml(l.expiry_at ? formatDate(l.expiry_at) : "—")}</td>
        <td>
          <div class="actions">
            <button class="btn small ghost" data-act="upgrade" data-id="${l.id}" data-plan="PRO">PRO</button>
            <button class="btn small ghost" data-act="upgrade" data-id="${l.id}" data-plan="ENTERPRISE">ENT</button>
            <button class="btn small ghost" data-act="kill" data-id="${l.id}">Kill</button>
            <button class="btn small danger" data-act="revoke" data-id="${l.id}">Revoca</button>
          </div>
        </td>
      </tr>`).join("") : `<tr><td colspan="6" class="empty">Nessuna licenza trovata.</td></tr>`;
  }

  function renderBilling() {
    $("invoices-table-body").innerHTML = state.invoices.length ? state.invoices.map((inv) => `
      <tr>
        <td><div>${escapeHtml(inv.invoice_number)}</div><div class="muted">${escapeHtml(inv.document_type || "INVOICE")}</div></td>
        <td>${escapeHtml(inv.client_name || "—")}</td>
        <td class="money">${formatMoney(inv.total_cents, inv.currency)}</td>
        <td>${statusBadge(inv.status)}</td>
        <td>${escapeHtml(inv.payment_method || "—")}</td>
        <td>
          <div class="actions">
            ${inv.pdf_url ? `<button class="btn small ghost" data-bill="pdf" data-url="${escapeHtml(inv.pdf_url)}">PDF</button>` : ""}
            <button class="btn small ghost" data-bill="send" data-no="${inv.invoice_number}">Invia</button>
            <button class="btn small ghost" data-bill="paylink" data-no="${inv.invoice_number}">Link</button>
            <button class="btn small ${String(inv.status).toUpperCase()==='PAID'?'ghost':'primary'}" data-bill="paid" data-no="${inv.invoice_number}">Segna Pagata</button>
          </div>
        </td>
      </tr>`).join("") : `<tr><td colspan="6" class="empty">Nessuna fattura.</td></tr>`;

    $("payments-table-body").innerHTML = state.payments.length ? state.payments.map((p) => `
      <tr>
        <td>${escapeHtml(p.client?.full_name || "—")}</td>
        <td>${escapeHtml(p.invoice?.invoice_number || "—")}</td>
        <td>${escapeHtml(p.method || "—")}</td>
        <td>${statusBadge(p.status)}</td>
        <td class="money">${formatMoney(p.amount_cents, p.currency)}</td>
      </tr>`).join("") : `<tr><td colspan="5" class="empty">Nessun pagamento.</td></tr>`;

    $("manual-payments-table-body").innerHTML = state.manualPayments.length ? state.manualPayments.map((m) => `
      <tr>
        <td>${escapeHtml(m.client?.full_name || m.invoice?.client_name || "—")}</td>
        <td>${escapeHtml(m.invoice?.invoice_number || "—")}</td>
        <td>${escapeHtml(m.method || "—")}</td>
        <td class="mono">${escapeHtml(m.reference_code || "—")}</td>
        <td>${statusBadge(m.status)}</td>
        <td>
          <div class="actions">
            ${m.proof_url ? `<button class="btn small ghost" data-manual="proof" data-url="${escapeHtml(m.proof_url)}">Ricevuta</button>` : ""}
            <button class="btn small ghost" data-manual="approve" data-id="${m.id}">Approva</button>
            <button class="btn small danger" data-manual="reject" data-id="${m.id}">Rifiuta</button>
          </div>
        </td>
      </tr>`).join("") : `<tr><td colspan="6" class="empty">Nessuna verifica manuale.</td></tr>`;
  }

  function fillBrandingForm() {
    const b = state.adminSelf?.admin_wl?.branding || {};
    $("brand-name").value = b.brand_name || state.adminSelf?.admin_wl?.brand_name || "";
    $("brand-logo-url").value = b.logo_url || "";
    $("brand-primary").value = b.primary_color || "";
    $("brand-secondary").value = b.secondary_color || "";
    $("brand-sender-name").value = b.sender_name || "";
    $("brand-sender-email").value = b.sender_email || state.adminSelf?.admin_wl?.email || "";
    $("brand-domain").value = b.custom_domain || "";
  }

  async function refreshAuthContext() {
    if (!state.token) {
      state.me = null;
      state.adminSelf = null;
      renderDashboard();
      return;
    }
    try {
      const [me, self] = await Promise.all([
        api("/auth/me"),
        api("/admin/wl/self").catch(() => null),
      ]);
      state.me = me;
      if (me?.role && me.role !== "ADMIN_WL") {
        saveToken(null);
        showToast(`Ruolo ${me.role} non valido per Admin Lite. Redirect...`, "err");
        window.location.href = dashboardRouteByRole(me.role);
        return;
      }
      state.adminSelf = self;
      updateLoginState();
      fillBrandingForm();
      renderDashboard();
    } catch (err) {
      showToast(`Auth context: ${err.message}`, "err");
    }
  }

  async function refreshOperationalData() {
    if (!state.token) return;
    try {
      const [summary, clients, licenses, invoices, payments, manualPayments] = await Promise.all([
        api("/admin/dashboard/summary"),
        api("/admin/clients"),
        api("/admin/licenses"),
        api("/admin/invoices"),
        api("/admin/payments/client"),
        api("/admin/payments/manual"),
      ]);
      state.summary = summary;
      state.clients = Array.isArray(clients) ? clients : [];
      state.licenses = Array.isArray(licenses) ? licenses : [];
      state.invoices = Array.isArray(invoices) ? invoices : [];
      state.payments = Array.isArray(payments) ? payments : [];
      state.manualPayments = Array.isArray(manualPayments) ? manualPayments : [];
      populateClientSelects();
      renderDashboard();
      renderClients();
      renderLicenses();
      renderBilling();
    } catch (err) {
      showToast(`Refresh dati: ${err.message}`, "err");
    }
  }

  async function refreshAll() {
    await refreshAuthContext();
    await refreshOperationalData();
  }

  async function login(email, password) {
    const provider = await initClerkProvider();
    if (provider.enabled) {
      const token = await clerkEmailPasswordLogin(email, password);
      saveToken(token);
      showToast("Login Clerk effettuato");
      await refreshAll();
      return;
    }
    const out = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    saveToken(out.access_token);
    showToast("Login effettuato");
    await refreshAll();
  }

  async function registerAdmin(email, password) {
    throw new Error("Registrazione pubblica ADMIN_WL disabilitata. Creazione account solo da Super Admin.");
  }

  async function bootstrapDemo() {
    const out = await api("/demo/bootstrap", { method: "POST" });
    if (!out?.ok || !out.admin?.token) throw new Error(out?.error || "Bootstrap demo non disponibile");
    saveToken(out.admin.token);
    $("login-email").value = out.admin.email || "";
    $("login-password").value = out.admin.password || "";
    showToast("Demo Admin Lite pronta");
    await refreshAll();
  }

  function attachEvents() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });
    $("quick-refresh-btn").addEventListener("click", refreshAll);

    $("api-config-form").addEventListener("submit", (e) => {
      e.preventDefault();
      saveApiBase($("api-base-input").value);
      showToast("API URL salvato");
    });
    $("test-api-btn").addEventListener("click", async () => {
      try {
        saveApiBase($("api-base-input").value);
        const out = await api("/health");
        $("api-test-result").textContent = `OK: ${out.status || "health"}`;
        showToast("API raggiungibile");
      } catch (err) {
        $("api-test-result").textContent = `Errore: ${err.message}`;
        showToast(`Test API: ${err.message}`, "err");
      }
    });

    $("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        saveApiBase($("api-base-input").value);
        await login($("login-email").value.trim(), $("login-password").value);
      } catch (err) {
        showToast(`Login: ${err.message}`, "err");
      }
    });
    $("register-admin-btn").addEventListener("click", async () => {
      try {
        saveApiBase($("api-base-input").value);
        await registerAdmin($("login-email").value.trim(), $("login-password").value);
      } catch (err) {
        showToast(`Registrazione: ${err.message}`, "err");
      }
    });
    $("bootstrap-demo-btn").addEventListener("click", async () => {
      try {
        saveApiBase($("api-base-input").value);
        await bootstrapDemo();
      } catch (err) {
        showToast(`Bootstrap demo: ${err.message}`, "err");
      }
    });
    $("logout-btn").addEventListener("click", () => {
      saveToken(null);
      state.me = null;
      state.adminSelf = null;
      showToast("Logout eseguito");
      renderDashboard();
    });

    $("create-client-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const fd = new FormData(e.target);
        const body = Object.fromEntries(fd.entries());
        if (!body.email) delete body.email;
        if (!body.telegram_username) delete body.telegram_username;
        if (!body.phone) delete body.phone;
        if (!body.country_code) delete body.country_code;
        await api("/admin/clients", { method: "POST", body: JSON.stringify(body) });
        showToast("Cliente creato");
        e.target.reset();
        await refreshOperationalData();
        setView("clients");
      } catch (err) {
        showToast(`Crea cliente: ${err.message}`, "err");
      }
    });

    $("clients-search").addEventListener("input", renderClients);
    $("refresh-clients-btn").addEventListener("click", refreshOperationalData);

    $("create-license-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const client_id = $("license-client-id").value;
        const plan_code = $("license-plan-code").value;
        const days = parseInt($("license-days").value || "30", 10);
        await api("/admin/licenses", { method: "POST", body: JSON.stringify({ client_id, plan_code, days }) });
        showToast("Licenza creata");
        await refreshOperationalData();
      } catch (err) {
        showToast(`Crea licenza: ${err.message}`, "err");
      }
    });
    $("refresh-licenses-btn").addEventListener("click", refreshOperationalData);
    $("licenses-table-body").addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      try {
        if (act === "revoke") {
          await api(`/admin/licenses/${encodeURIComponent(id)}/revoke`, { method: "POST" });
        } else if (act === "kill") {
          await api(`/admin/licenses/${encodeURIComponent(id)}/remote-kill`, { method: "POST" });
        } else if (act === "upgrade") {
          await api(`/admin/licenses/${encodeURIComponent(id)}/upgrade`, { method: "POST", body: JSON.stringify({ plan_code: btn.dataset.plan }) });
        }
        showToast(`Licenza aggiornata (${act})`);
        await refreshOperationalData();
      } catch (err) {
        showToast(`Licenza ${act}: ${err.message}`, "err");
      }
    });

    $("issue-invoice-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const client_id = $("invoice-client-id").value;
        const amount_cents = eurosToCents($("invoice-amount").value);
        if (!client_id) throw new Error("Seleziona cliente");
        if (!amount_cents) throw new Error("Importo non valido");
        const payment_method = $("invoice-method").value;
        const document_type = $("invoice-doc-type").value;
        const description = $("invoice-description").value.trim() || "Servizio SoftiBridge";
        await api("/admin/invoices/issue", {
          method: "POST",
          body: JSON.stringify({
            client_id,
            amount_cents,
            currency: "EUR",
            description,
            send_now: false,
            payment_method,
            document_type,
            invoice_channel: "ADMIN_MANUAL"
          })
        });
        showToast("Fattura emessa");
        e.target.reset();
        populateClientSelects();
        await refreshOperationalData();
      } catch (err) {
        showToast(`Emetti fattura: ${err.message}`, "err");
      }
    });

    $("refresh-invoices-btn").addEventListener("click", refreshOperationalData);
    $("refresh-payments-btn").addEventListener("click", refreshOperationalData);
    $("refresh-manual-queue-btn").addEventListener("click", refreshOperationalData);

    $("invoices-table-body").addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-bill]");
      if (!btn) return;
      const action = btn.dataset.bill;
      try {
        if (action === "pdf") {
          const baseOrigin = (state.apiBase || "").replace(/\/api$/, "");
          window.open(`${baseOrigin}${btn.dataset.url}`, "_blank");
          return;
        }
        const no = encodeURIComponent(btn.dataset.no);
        if (action === "send") {
          await api(`/admin/invoices/${no}/send`, { method: "POST" });
          showToast("Fattura inviata");
        } else if (action === "paylink") {
          const out = await api(`/admin/invoices/${no}/payment-link`, { method: "POST" });
          if (out.checkout_url) window.open(out.checkout_url, "_blank");
          showToast(out.simulated ? "Link pagamento demo generato" : "Link pagamento creato");
        } else if (action === "paid") {
          await api(`/admin/invoices/${no}/mark-paid`, { method: "POST" });
          showToast("Fattura segnata come pagata");
        }
        await refreshOperationalData();
      } catch (err) {
        showToast(`Fattura: ${err.message}`, "err");
      }
    });

    $("manual-payments-table-body").addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-manual]");
      if (!btn) return;
      const action = btn.dataset.manual;
      try {
        if (action === "proof") {
          const baseOrigin = (state.apiBase || "").replace(/\/api$/, "");
          window.open(`${baseOrigin}${btn.dataset.url}`, "_blank");
          return;
        }
        const id = encodeURIComponent(btn.dataset.id);
        const payload = {};
        if (action === "approve") {
          await api(`/admin/payments/manual/${id}/approve`, { method: "POST", body: JSON.stringify(payload) });
          showToast("Pagamento manuale approvato");
        } else if (action === "reject") {
          await api(`/admin/payments/manual/${id}/reject`, { method: "POST", body: JSON.stringify(payload) });
          showToast("Pagamento manuale rifiutato");
        }
        await refreshOperationalData();
      } catch (err) {
        showToast(`Verifica manuale: ${err.message}`, "err");
      }
    });

    $("branding-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const body = {
          brand_name: $("brand-name").value.trim() || null,
          logo_url: $("brand-logo-url").value.trim() || null,
          primary_color: $("brand-primary").value.trim() || null,
          secondary_color: $("brand-secondary").value.trim() || null,
          sender_name: $("brand-sender-name").value.trim() || null,
          sender_email: $("brand-sender-email").value.trim() || null,
          custom_domain: $("brand-domain").value.trim() || null,
        };
        await api("/admin/wl/self/branding", { method: "PATCH", body: JSON.stringify(body) });
        showToast("Branding aggiornato");
        await refreshAuthContext();
      } catch (err) {
        showToast(`Branding: ${err.message}`, "err");
      }
    });
  }

  async function init() {
    installStorageSync();
    saveApiBase(loadPersistedApiBase());
    saveToken(loadPersistedToken());
    $("api-base-input").value = state.apiBase;
    updateLoginState();
    const initialView = (location.hash || "").replace(/^#/, "");
    if (viewMeta[initialView]) setView(initialView);
    attachEvents();
    if (state.token) {
      await refreshAll();
    } else {
      renderDashboard();
    }
  }

  init().catch((err) => showToast(`Init: ${err.message}`, "err"));
})();
