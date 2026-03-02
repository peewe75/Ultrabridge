document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_STORAGE_KEY = 'softibridge_api_base';
    const CLIENT_TOKEN_STORAGE_KEY = 'softibridge_client_token';
    const PREVIEW_CLIENT_TOKEN_KEY = 'softi_client_preview_token';

    function installStorageSync() {
        window.addEventListener('storage', (event) => {
            const watched = [API_BASE_STORAGE_KEY, CLIENT_TOKEN_STORAGE_KEY, PREVIEW_CLIENT_TOKEN_KEY];
            if (!watched.includes(event.key || '')) return;
            if (document.visibilityState === 'hidden') return;
            window.location.reload();
        });
    }

    function normalizeApiBase(input) {
        let raw = String(input || '').trim();
        if (!raw) return '';
        if (raw.startsWith('/')) {
            const origin = (window.location.origin && window.location.origin !== 'null') ? window.location.origin : '';
            raw = `${origin}${raw}`;
        } else if (!/^https?:\/\//i.test(raw) && !raw.startsWith('file://')) {
            raw = `http://${raw}`;
        }
        raw = raw.replace(/\/+$/, '');
        if (!/\/api$/i.test(raw)) raw = `${raw}/api`;
        return raw;
    }

    function detectInitialApiBase() {
        const qsApi = new URLSearchParams(window.location.search).get('api');
        let stored = localStorage.getItem(API_BASE_STORAGE_KEY);

        // Clean up old development tunnels/residues
        if (stored && (stored.includes('trycloudflare.com') || stored.includes('tuo-vps-ip'))) {
            stored = null;
            localStorage.removeItem(API_BASE_STORAGE_KEY);
        }

        const origin = (window.location.origin && window.location.origin !== 'null') ? window.location.origin : '';
        const originBased = origin ? `${origin}/api` : '';
        const candidate = qsApi || stored;
        if (candidate) {
            const normalized = normalizeApiBase(candidate);
            if (/https?:\/\/(?:127\.0\.0\.1|localhost):8080\/api$/i.test(normalized)) {
                return normalizeApiBase('http://127.0.0.1:8000/api');
            }
            return normalized;
        }
        if (origin.includes('127.0.0.1') || origin.includes('localhost')) {
            return normalizeApiBase('http://127.0.0.1:8000/api');
        }
        return normalizeApiBase(originBased || 'http://127.0.0.1:8000/api');
    }

    function shouldAutoPingApi() {
        const qsApi = new URLSearchParams(window.location.search).get('api');
        const storedRaw = localStorage.getItem(API_BASE_STORAGE_KEY);
        const origin = (window.location.origin && window.location.origin !== 'null') ? window.location.origin : '';
        const originApi = origin ? normalizeApiBase(`${origin}/api`) : '';
        const stored = storedRaw ? normalizeApiBase(storedRaw) : '';
        if (qsApi) return true;
        if (stored && !(/^https?:\/\/(?:127\.0\.0\.1|localhost):8080\/api$/i.test(stored) || (/127\.0\.0\.1:8080|localhost:8080/i.test(origin) && stored === originApi))) return true;
        if (hasBackendAuth()) return true;
        return !/127\.0\.0\.1:8080|localhost:8080/i.test(origin);
    }

    let apiBase = detectInitialApiBase();
    let clientToken = localStorage.getItem(PREVIEW_CLIENT_TOKEN_KEY) || localStorage.getItem(CLIENT_TOKEN_STORAGE_KEY) || '';
    const clerkState = {
        checked: false,
        enabled: false,
        publishableKey: '',
        runtimeReady: false,
    };
    const persistClientToken = (token) => {
        clientToken = token || '';
        if (clientToken) localStorage.setItem(CLIENT_TOKEN_STORAGE_KEY, clientToken);
        else localStorage.removeItem(CLIENT_TOKEN_STORAGE_KEY);
        // Esponi token per l'onboarding wizard e altri script esterni
        window.SB_TOKEN = clientToken || '';
    };
    const setApiBase = (value) => {
        const normalized = normalizeApiBase(value);
        if (!normalized) throw new Error('URL API non valido');
        apiBase = normalized;
        localStorage.setItem(API_BASE_STORAGE_KEY, normalized);
        // Esponi anche per wizard/script esterni
        window.SB_API_BASE = normalized;
        return normalized;
    };
    const hasBackendAuth = () => Boolean(clientToken);
    const dashboardRouteByRole = (role) => {
        if (role === 'CLIENT') return '/dashboard/client/';
        if (role === 'ADMIN_WL') return '/dashboard/admin/';
        if (role === 'SUPER_ADMIN') return '/dashboard/super-admin/';
        return '/landing/';
    };
    const apiFetch = async (path, opts = {}) => {
        const isFormData = opts.body instanceof FormData;
        const res = await fetch(`${apiBase}${path}`, {
            ...opts,
            headers: {
                ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
                ...(opts.headers || {}),
                ...(clientToken ? { 'Authorization': `Bearer ${clientToken}` } : {})
            }
        });
        const text = await res.text();
        let data;
        try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
        if (!res.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data));
        return data;
    };

    const loadClerkRuntime = async (publishableKey) => {
        if (!publishableKey) throw new Error('CLERK_PUBLISHABLE_KEY mancante');
        if (!window.Clerk) {
            await new Promise((resolve, reject) => {
                const existing = document.querySelector('script[data-softi-clerk="1"]');
                if (existing) {
                    existing.addEventListener('load', resolve, { once: true });
                    existing.addEventListener('error', () => reject(new Error('Caricamento Clerk fallito')), { once: true });
                    return;
                }
                const script = document.createElement('script');
                script.async = true;
                script.setAttribute('data-softi-clerk', '1');
                script.setAttribute('data-clerk-publishable-key', publishableKey);
                script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error('Caricamento Clerk fallito'));
                document.head.appendChild(script);
            });
        }
        if (!window.Clerk) throw new Error('SDK Clerk non disponibile');
        if (!window.Clerk.loaded) {
            await window.Clerk.load({ publishableKey });
        }
        clerkState.runtimeReady = true;
    };

    const initClerkProvider = async () => {
        if (clerkState.checked) return clerkState;
        clerkState.checked = true;
        try {
            const res = await fetch(`${apiBase}/public/auth/providers`);
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
    };

    const clerkEmailPasswordLogin = async (email, password) => {
        await initClerkProvider();
        if (!clerkState.enabled || !clerkState.runtimeReady) {
            throw new Error('Clerk non configurato su backend');
        }
        const attempt = await window.Clerk.client.signIn.create({ identifier: email, password });
        if (attempt.status !== 'complete') {
            throw new Error('Login Clerk incompleto: verifica richiesta');
        }
        await window.Clerk.setActive({ session: attempt.createdSessionId });
        const token = await window.Clerk.session?.getToken();
        if (!token) throw new Error('Token Clerk non disponibile');
        return token;
    };
    const apiUpload = async (path, formData) => {
        const res = await fetch(`${apiBase}${path}`, {
            method: 'POST',
            body: formData,
            headers: {
                ...(clientToken ? { 'Authorization': `Bearer ${clientToken}` } : {})
            }
        });
        const text = await res.text();
        let data;
        try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
        if (!res.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data));
        return data;
    };
    window.__softiClientInvoiceFilters = window.__softiClientInvoiceFilters || { status: 'ALL', method: 'ALL', doc: 'ALL' };
    window.__softiClientPaymentArchiveFilters = window.__softiClientPaymentArchiveFilters || { status: 'ALL', method: 'ALL' };
    let softiModalEl = null;
    let softiToastStack = null;

    function ensureToastStack() {
        if (!softiToastStack) {
            softiToastStack = document.createElement('div');
            softiToastStack.className = 'softi-toast-stack';
            document.body.appendChild(softiToastStack);
        }
        return softiToastStack;
    }

    function toast(message, type = 'info', timeout = 3200) {
        const stack = ensureToastStack();
        const el = document.createElement('div');
        el.className = `softi-toast ${type}`;
        el.textContent = message;
        stack.appendChild(el);
        setTimeout(() => el.remove(), timeout);
    }

    function ensureModal() {
        if (softiModalEl) return softiModalEl;
        softiModalEl = document.createElement('div');
        softiModalEl.className = 'modal-overlay';
        softiModalEl.innerHTML = `<div class="modal glass" id="softi-smart-modal"></div>`;
        softiModalEl.addEventListener('click', (e) => {
            if (e.target === softiModalEl) closeSmartModal();
        });
        document.body.appendChild(softiModalEl);
        return softiModalEl;
    }

    function openSmartModal(html) {
        const wrap = ensureModal();
        wrap.querySelector('#softi-smart-modal').innerHTML = html;
        wrap.classList.add('active');
    }

    function closeSmartModal() {
        if (softiModalEl) softiModalEl.classList.remove('active');
    }
    window.closeSmartModal = closeSmartModal;

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(String(text || ''));
            toast('Copiato negli appunti', 'success', 1800);
        } catch {
            toast('Copia non riuscita (clipboard non disponibile)', 'warning', 2200);
        }
    }
    window.softiCopyText = copyText;

    function escapeHtml(v) {
        return String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function setApiConnBadge(ok, text) {
        let badge = document.getElementById('softi-client-api-badge');
        const host = document.querySelector('.top-bar-actions');
        if (!badge && host) {
            badge = document.createElement('div');
            badge.id = 'softi-client-api-badge';
            badge.className = 'security-badge';
            badge.style.cssText = 'background:rgba(0,242,255,0.1); color: var(--accent); padding: 4px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 700; border: 1px solid rgba(0,242,255,0.2); display: flex; align-items: center; gap: 5px;';
            host.prepend(badge);
        }
        if (!badge) return;
        badge.style.background = ok ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)';
        badge.style.borderColor = ok ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)';
        badge.style.color = ok ? '#34d399' : '#f59e0b';
        badge.textContent = `🌐 ${text}`;
    }

    async function pingApi() {
        try {
            const data = await apiFetch('/health');
            setApiConnBadge(true, `API Online (${data.status || 'ok'})`);
            return data;
        } catch (err) {
            setApiConnBadge(false, 'API Offline');
            throw err;
        }
    }

    function clientPpPanelValues() {
        return {
            apiBase: document.getElementById('pp-client-api-base')?.value?.trim() || apiBase,
            email: document.getElementById('pp-client-email')?.value?.trim() || '',
            password: document.getElementById('pp-client-password')?.value || '',
        };
    }

    function refreshClientPpStatus(text) {
        const el = document.getElementById('pp-client-status');
        if (el) el.textContent = text;
    }

    function injectClientPlugAndPlayPanel() {
        const overview = document.getElementById('view-overview');
        if (!overview || document.getElementById('client-plugplay-center')) return;
        const panel = document.createElement('div');
        panel.id = 'client-plugplay-center';
        panel.className = 'glass-card';
        panel.style.marginBottom = '1rem';
        panel.style.border = '1px solid rgba(0,242,255,0.22)';
        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; flex-wrap:wrap;">
                <div>
                    <h3 style="margin:0 0 .35rem 0;">🔌 Client Connect Center</h3>
                    <p style="margin:0; color:var(--text-dim); font-size:.88rem;">Configura l'URL API e fai login direttamente qui. Nessun token manuale richiesto.</p>
                </div>
                <div style="display:flex; gap:.5rem; flex-wrap:wrap;">
                    <button class="btn btn-secondary btn-sm" onclick="softiClientPpTestApi()">Test API</button>
                    <button class="btn btn-secondary btn-sm" onclick="softiClientPpWhoAmI()">Verifica Login</button>
                    <button class="btn btn-secondary btn-sm" onclick="softiClientPpLogout()">Logout</button>
                </div>
            </div>
            <div style="display:grid; grid-template-columns:1.15fr .85fr; gap:1rem; margin-top:1rem;">
                <div class="glass" style="padding:.9rem; border-radius:12px;">
                    <h4 style="margin:0 0 .6rem 0;">Connessione API</h4>
                    <div style="display:grid; grid-template-columns:1fr auto; gap:.5rem;">
                        <input id="pp-client-api-base" type="text" value="${escapeHtml(apiBase)}" placeholder="https://api.tuodominio.com/api" style="padding:.65rem .75rem; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                        <button class="btn btn-secondary btn-sm" onclick="softiClientPpSaveApi()">Salva URL</button>
                    </div>
                    <pre id="pp-client-api-output" style="margin-top:.7rem; min-height:88px; max-height:180px; overflow:auto; background:rgba(0,0,0,.22); border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:.75rem; color:#cbd5e1; font-size:.75rem;">Pronto.</pre>
                </div>
                <div class="glass" style="padding:.9rem; border-radius:12px;">
                    <h4 style="margin:0 0 .6rem 0;">Login Cliente</h4>
                    <input id="pp-client-email" type="email" placeholder="email cliente" style="width:100%; margin-bottom:.5rem; padding:.65rem .75rem; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                    <input id="pp-client-password" type="password" placeholder="password" style="width:100%; margin-bottom:.6rem; padding:.65rem .75rem; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                    <div style="display:flex; gap:.5rem; flex-wrap:wrap;">
                        <button class="btn btn-primary btn-sm" onclick="softiClientPpLogin()">Login</button>
                        <button class="btn btn-secondary btn-sm" onclick="softiClientPpRegister()">Registra+Login</button>
                        <button class="btn btn-secondary btn-sm" onclick="softiClientPpBootstrap()">Bootstrap Demo</button>
                    </div>
                    <div id="pp-client-status" style="margin-top:.65rem; color:var(--text-dim); font-size:.84rem;">${hasBackendAuth() ? 'Token cliente trovato (salvato localmente)' : 'Nessun token cliente salvato'}</div>
                </div>
            </div>
        `;
        overview.prepend(panel);

        const topBarActions = document.querySelector('.top-bar-actions');
        if (topBarActions && !document.getElementById('pp-client-open-connect-btn')) {
            topBarActions.style.flexWrap = 'wrap';
            const btn = document.createElement('button');
            btn.id = 'pp-client-open-connect-btn';
            btn.className = 'btn btn-secondary btn-sm';
            btn.textContent = '🔌 Connetti';
            btn.addEventListener('click', () => {
                window.switchView?.('overview');
                setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
            });
            topBarActions.prepend(btn);
        }
    }

    async function clientPpTestApi() {
        try {
            const vals = clientPpPanelValues();
            setApiBase(vals.apiBase);
            const data = await pingApi();
            const out = document.getElementById('pp-client-api-output');
            if (out) out.textContent = JSON.stringify(data, null, 2);
            toast(`API raggiungibile su ${apiBase}`, 'success');
        } catch (err) {
            const out = document.getElementById('pp-client-api-output');
            if (out) out.textContent = `ERRORE: ${err.message}`;
            toast(`Connessione API fallita: ${err.message}`, 'error', 5000);
        }
    }

    async function clientPpLogin(registerFirst = false) {
        const vals = clientPpPanelValues();
        if (!vals.email || !vals.password) return toast('Inserisci email e password cliente', 'warning');
        try {
            setApiBase(vals.apiBase);
            const provider = await initClerkProvider();
            if (provider.enabled) {
                if (registerFirst) {
                    toast('Registrazione gestita da Clerk: usa la pagina Sign Up configurata.', 'warning', 4200);
                    return;
                }
                const clerkToken = await clerkEmailPasswordLogin(vals.email, vals.password);
                persistClientToken(clerkToken);
                localStorage.setItem(PREVIEW_CLIENT_TOKEN_KEY, clerkToken);
                refreshClientPpStatus('Login Clerk OK · token attivo');
                toast('Login cliente Clerk riuscito', 'success');
                await clientPpWhoAmI();
                syncClientOverviewFromBackend();
                syncClientEaFeedFromBackend();
                syncClientTradingStateFromBackend();
                return;
            }
            if (registerFirst) {
                try {
                    await apiFetch('/auth/register', {
                        method: 'POST',
                        body: JSON.stringify({ email: vals.email, password: vals.password, role: 'CLIENT' })
                    });
                } catch (_) { }
            }
            const tok = await apiFetch('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email: vals.email, password: vals.password })
            });
            persistClientToken(tok.access_token);
            localStorage.setItem(PREVIEW_CLIENT_TOKEN_KEY, tok.access_token);
            refreshClientPpStatus(`Login OK · token attivo (${tok.expires_in || 0}s)`);
            toast('Login cliente riuscito', 'success');
            await clientPpWhoAmI();
            syncClientOverviewFromBackend();
            syncClientEaFeedFromBackend();
            syncClientTradingStateFromBackend();
        } catch (err) {
            toast(`Login cliente fallito: ${err.message}`, 'error', 4500);
        }
    }

    async function clientPpBootstrapDemo() {
        try {
            const vals = clientPpPanelValues();
            setApiBase(vals.apiBase);
            const data = await apiFetch('/demo/bootstrap', { method: 'POST' });
            if (!data?.ok || !data.client?.token) throw new Error(data?.error || 'Bootstrap demo non disponibile');
            persistClientToken(data.client.token);
            localStorage.setItem(PREVIEW_CLIENT_TOKEN_KEY, data.client.token);
            const em = document.getElementById('pp-client-email');
            const pw = document.getElementById('pp-client-password');
            if (em) em.value = data.client.email || '';
            if (pw) pw.value = data.client.password || '';
            refreshClientPpStatus(`Demo bootstrap OK · licenza ${data.client.license_id || '-'}`);
            toast('Bootstrap demo cliente completato', 'success');
            syncClientOverviewFromBackend();
            syncClientEaFeedFromBackend();
            syncClientTradingStateFromBackend();
        } catch (err) {
            toast(`Bootstrap demo fallito: ${err.message}`, 'error', 4500);
        }
    }

    async function clientPpWhoAmI() {
        if (!hasBackendAuth()) return toast('Login cliente richiesto', 'warning');
        try {
            const me = await apiFetch('/auth/me');
            if (me.role !== 'CLIENT') {
                persistClientToken('');
                localStorage.removeItem(PREVIEW_CLIENT_TOKEN_KEY);
                toast(`Ruolo ${me.role} non valido per dashboard CLIENT. Reindirizzamento...`, 'warning', 2800);
                window.location.href = dashboardRouteByRole(me.role);
                return;
            }
            refreshClientPpStatus(`Token valido · ${me.email} · ${me.role}`);
            toast(`Auth OK: ${me.email}`, 'success', 2200);
        } catch (err) {
            refreshClientPpStatus(`Token non valido: ${err.message}`);
            toast(`Token non valido: ${err.message}`, 'warning', 4000);
        }
    }

    async function enforceClientRoleGuard() {
        if (!hasBackendAuth()) return;
        try {
            const me = await apiFetch('/auth/me');
            if (me.role !== 'CLIENT') {
                persistClientToken('');
                localStorage.removeItem(PREVIEW_CLIENT_TOKEN_KEY);
                window.location.href = dashboardRouteByRole(me.role);
            }
        } catch (_) {
        }
    }

    function clientPpSaveApi() {
        try {
            const url = setApiBase(document.getElementById('pp-client-api-base')?.value || '');
            document.getElementById('pp-client-api-base').value = url;
            toast(`API URL salvato: ${url}`, 'success');
        } catch (err) {
            toast(`URL API non valido: ${err.message}`, 'warning');
        }
    }

    function clientPpLogout() {
        persistClientToken('');
        localStorage.removeItem(PREVIEW_CLIENT_TOKEN_KEY);
        refreshClientPpStatus('Logout eseguito. Nessun token cliente salvato.');
        toast('Logout cliente eseguito', 'info');
    }

    window.softiClientPpSaveApi = clientPpSaveApi;
    window.softiClientPpTestApi = clientPpTestApi;
    window.softiClientPpLogin = () => clientPpLogin(false);
    window.softiClientPpRegister = () => clientPpLogin(true);
    window.softiClientPpBootstrap = clientPpBootstrapDemo;
    window.softiClientPpWhoAmI = clientPpWhoAmI;
    window.softiClientPpLogout = clientPpLogout;

    const viewTitle = document.getElementById('view-title');

    // =========================================================
    // === TRADING STATE (Simulates Live EA Connection via LITE B)
    // =========================================================
    const clientLicense = {
        tier: "PRO",
        id: "SB-A9B2",
        accounts: { "MT4": ["87654321"], "MT5": [] }
    };

    let tradingState = {
        balance: 10425.80,
        equity: 10612.30,
        floatingPnl: +186.50,
        drawdownPct: -2.4,
        positions: [
            { ticket: 100421, pair: "XAUUSD", dir: "BUY", lots: 0.10, open: 2645.50, sl: 2635.00, tp: 2665.00, pnl: +42.50, time: "08:32" },
            { ticket: 100422, pair: "EURUSD", dir: "BUY", lots: 0.20, open: 1.08420, sl: 1.07900, tp: 1.09200, pnl: +98.80, time: "09:15" },
            { ticket: 100423, pair: "GBPUSD", dir: "SELL", lots: 0.10, open: 1.26540, sl: 1.27100, tp: 1.25500, pnl: +45.20, time: "10:02" },
        ],
        pending: [
            { ticket: 200101, pair: "USDJPY", type: "BUY LIMIT", lots: 0.15, price: 148.500, sl: 147.800, tp: 149.800, created: "10:45" },
            { ticket: 200102, pair: "XAUUSD", type: "SELL STOP", lots: 0.10, price: 2620.00, sl: 2630.00, tp: 2600.00, created: "11:10" },
        ],
        history: [
            { ticket: 99901, pair: "XAUUSD", dir: "BUY", lots: 0.10, open: 2635.00, close: 2658.00, pnl: +23.00, date: "21/02/26" },
            { ticket: 99902, pair: "EURUSD", dir: "SELL", lots: 0.20, open: 1.09100, close: 1.08500, pnl: +120.00, date: "21/02/26" },
            { ticket: 99903, pair: "GBPUSD", dir: "BUY", lots: 0.10, open: 1.25200, close: 1.24800, pnl: -40.00, date: "20/02/26" },
            { ticket: 99904, pair: "BTCUSD", dir: "BUY", lots: 0.01, open: 94200.00, close: 95800.00, pnl: +160.00, date: "20/02/26" },
        ]
    };

    let currentSLTPTicket = null;

    const signals = [
        { id: "SIG-881", pair: "XAUUSD", dir: "BUY", entry: "2645-2650", sl: 2635.00, tp1: 2660.00, tp2: 2675.00, lots: 0.10, time: "08:30", status: "executed" },
        { id: "SIG-882", pair: "EURUSD", dir: "BUY", entry: "1.08400-1.08450", sl: 1.07900, tp1: 1.09000, tp2: 1.09500, lots: 0.20, time: "09:12", status: "executed" },
        { id: "SIG-883", pair: "GBPUSD", dir: "SELL", entry: "1.26550-1.26600", sl: 1.27100, tp1: 1.25800, tp2: 1.25200, lots: 0.10, time: "09:58", status: "executed" },
        { id: "SIG-884", pair: "USDJPY", dir: "BUY", entry: "148.500", sl: 147.800, tp1: 149.500, tp2: 150.200, lots: 0.15, time: "10:43", status: "queued" },
        { id: "SIG-885", pair: "XAUUSD", dir: "SELL", entry: "2620.000", sl: 2630.00, tp1: 2605.00, tp2: 2595.00, lots: 0.10, time: "11:08", status: "queued" },
    ];

    // =========================================================
    // === NAVIGATION
    // =========================================================
    const titles = {
        'overview': 'La Mia Licenza',
        'trading': '📊 Trading Panel — Live MT4/MT5',
        'signals': '📡 Segnali Live — Bot Telegram',
        'positions': '📈 Posizioni Aperte a Mercato',
        'pending': '⏳ Ordini Pendenti',
        'history': '📜 Storico Operazioni',
        'config': 'Configurazione EA',
        'downloads': 'Download',
        'payments': 'Pagamenti'
    };

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.getAttribute('data-view');
            window.switchView?.(view);
        });
    });

    window.switchView = function (view) {
        document.querySelectorAll('.nav-item').forEach(i => {
            i.classList.toggle('active', i.getAttribute('data-view') === view);
        });
        document.querySelectorAll('.view').forEach(v => {
            v.classList.toggle('active', v.id === `view-${view}`);
        });
        if (viewTitle) viewTitle.textContent = titles[view] || view;

        if (view === 'trading') renderTradingPanel();
        if (view === 'signals') renderSignals();
        if (view === 'positions') renderPositionsFull();
        if (view === 'pending') renderPendingFull();
        if (view === 'history') renderHistory();
        if (view === 'config') renderConfigView();
        if (view === 'downloads' || view === 'payments') renderDownloadsFromBackend();
    };

    // =========================================================
    // === TRADING PANEL RENDER
    // =========================================================
    function renderTradingPanel() {
        document.getElementById('t-balance').textContent = `$${tradingState.balance.toFixed(2)}`;
        document.getElementById('t-equity').textContent = `$${tradingState.equity.toFixed(2)}`;
        const ddPct = Math.abs(tradingState.drawdownPct);
        document.getElementById('t-dd').textContent = `${tradingState.drawdownPct.toFixed(1)}%`;
        document.getElementById('dd-bar').style.width = `${Math.min(ddPct * 10, 100)}%`;
        document.getElementById('t-open').textContent = tradingState.positions.length;
        document.getElementById('t-pending-count').textContent = `${tradingState.pending.length} ordini pendenti`;

        renderPositionsTable('trading-positions-table', tradingState.positions, 'mini');
        renderPendingTable('trading-pending-table', tradingState.pending, 'mini');
    }

    function renderPositionsTable(tableId, positions, mode) {
        const el = document.getElementById(tableId);
        if (!el) return;
        const pnlTotal = positions.reduce((s, p) => s + p.pnl, 0);
        el.innerHTML = `
            <thead><tr>
                <th>Ticket</th><th>Coppia</th><th>Dir</th><th>Lotti</th>
                <th>Apertura</th><th>SL</th><th>TP</th><th>P&L</th><th>Azioni</th>
            </tr></thead>
            <tbody>
                ${positions.map(p => `
                <tr>
                    <td style="font-family:monospace; color:var(--text-dim); font-size:0.78rem;">#${p.ticket}</td>
                    <td><span class="pair-badge">${p.pair}</span></td>
                    <td><span class="direction-badge ${p.dir.toLowerCase()}">${p.dir}</span></td>
                    <td>${p.lots}</td>
                    <td style="font-family:monospace;">${p.open}</td>
                    <td style="font-family:monospace; color:#ff4d6d;">${p.sl}</td>
                    <td style="font-family:monospace; color:#00ff88;">${p.tp}</td>
                    <td class="profit-cell ${p.pnl >= 0 ? 'pos' : 'neg'}">${p.pnl >= 0 ? '+' : ''}$${p.pnl.toFixed(2)}</td>
                    <td style="display:flex; gap:4px; flex-wrap:wrap;">
                        <button class="btn btn-sm" style="background:rgba(0,242,255,0.1);border:1px solid rgba(0,242,255,0.3);color:var(--accent); font-size:0.7rem;" onclick="openSLTP(${p.ticket}, '${p.pair}', ${p.sl}, ${p.tp})">✏️ SL/TP</button>
                        <button class="btn btn-sm btn-secondary" style="font-size:0.7rem;" onclick="moveToBE(${p.ticket}, '${p.pair}')">🟰 BE</button>
                        <button class="btn btn-sm btn-secondary" style="font-size:0.7rem;" onclick="moveSLStep(${p.ticket}, '${p.pair}', 10)">↗️ +SL</button>
                        <button class="btn btn-sm btn-warning" style="font-size:0.7rem;" onclick="closePosition(${p.ticket}, '${p.pair}', ${p.pnl})">⛔ Chiudi</button>
                    </td>
                </tr>`).join('')}
                <tr style="background:rgba(255,255,255,0.03);">
                    <td colspan="7" style="text-align:right; color:var(--text-dim); font-size:0.8rem; font-weight:600;">Floating P&L Totale:</td>
                    <td class="profit-cell ${pnlTotal >= 0 ? 'pos' : 'neg'}" style="font-size:1rem;">${pnlTotal >= 0 ? '+' : ''}$${pnlTotal.toFixed(2)}</td>
                    <td></td>
                </tr>
            </tbody>`;
    }

    function renderPendingTable(tableId, pending, mode) {
        const el = document.getElementById(tableId);
        if (!el) return;
        el.innerHTML = `
            <thead><tr>
                <th>Ticket</th><th>Coppia</th><th>Tipo</th><th>Lotti</th>
                <th>Prezzo</th><th>SL</th><th>TP</th><th>Ora</th><th>Azioni</th>
            </tr></thead>
            <tbody>
                ${pending.map(p => `
                <tr>
                    <td style="font-family:monospace; color:var(--text-dim); font-size:0.78rem;">#${p.ticket}</td>
                    <td><span class="pair-badge">${p.pair}</span></td>
                    <td><span style="font-size:0.75rem; background:rgba(255,165,0,0.1); border:1px solid rgba(255,165,0,0.3); color:#ffb347; padding:2px 7px; border-radius:5px; font-weight:700;">${p.type}</span></td>
                    <td>${p.lots}</td>
                    <td style="font-family:monospace;">${p.price}</td>
                    <td style="font-family:monospace; color:#ff4d6d;">${p.sl}</td>
                    <td style="font-family:monospace; color:#00ff88;">${p.tp}</td>
                    <td style="color:var(--text-dim); font-size:0.8rem;">${p.created}</td>
                    <td>
                        <button class="btn btn-sm btn-secondary" style="font-size:0.7rem;" onclick="cancelPending(${p.ticket}, '${p.pair}')">❌ Cancella</button>
                    </td>
                </tr>`).join('')}
            </tbody>`;
    }

    function renderPositionsFull() {
        renderPositionsTable('positions-full-table', tradingState.positions, 'full');
    }
    function renderPendingFull() {
        renderPendingTable('pending-full-table', tradingState.pending, 'full');
    }

    function renderHistory() {
        const el = document.getElementById('history-table');
        if (!el) return;
        const total = tradingState.history.reduce((s, h) => s + h.pnl, 0);
        el.innerHTML = `
            <thead><tr><th>Ticket</th><th>Coppia</th><th>Dir</th><th>Lotti</th><th>Apertura</th><th>Chiusura</th><th>P&L</th><th>Data</th></tr></thead>
            <tbody>
                ${tradingState.history.map(h => `
                <tr>
                    <td style="font-family:monospace; color:var(--text-dim); font-size:0.78rem;">#${h.ticket}</td>
                    <td><span class="pair-badge">${h.pair}</span></td>
                    <td><span class="direction-badge ${h.dir.toLowerCase()}">${h.dir}</span></td>
                    <td>${h.lots}</td>
                    <td style="font-family:monospace;">${h.open}</td>
                    <td style="font-family:monospace;">${h.close}</td>
                    <td class="profit-cell ${h.pnl >= 0 ? 'pos' : 'neg'}">${h.pnl >= 0 ? '+' : ''}$${h.pnl.toFixed(2)}</td>
                    <td style="color:var(--text-dim);">${h.date}</td>
                </tr>`).join('')}
                <tr style="background:rgba(255,255,255,0.03); font-weight:700;">
                    <td colspan="6" style="text-align:right; font-size:0.8rem; color:var(--text-dim);">Profitto Storico:</td>
                    <td class="profit-cell ${total >= 0 ? 'pos' : 'neg'}">${total >= 0 ? '+' : ''}$${total.toFixed(2)}</td>
                    <td></td>
                </tr>
            </tbody>`;
    }

    // =========================================================
    // === SIGNALS FEED
    // =========================================================
    function renderSignals() {
        const el = document.getElementById('signals-feed');
        if (!el) return;
        const backendReady = hasBackendAuth();
        const pendingSignals = backendReady
            ? (tradingState.pending || []).slice(0, 8).map((p, idx) => ({
                id: `PEND-${p.ticket || idx}`,
                ticket: Number(p.ticket || 0),
                pair: p.pair || p.symbol || 'N/A',
                dir: String(p.type || '').toUpperCase().includes('SELL') ? 'SELL' : 'BUY',
                entry: p.price,
                sl: p.sl,
                tp1: p.tp,
                tp2: p.tp,
                lots: p.lots,
                time: p.created || '--:--',
                status: 'queued'
            }))
            : [];
        const signalSource = (backendReady && pendingSignals.length) ? pendingSignals : signals;
        const mockHtml = signals.map(sig => `
            <div class="signal-card ${sig.dir === 'SELL' ? 'sell-signal' : ''}">
                <div class="signal-icon">${sig.dir === 'BUY' ? '📈' : '📉'}</div>
                <div class="signal-body">
                    <strong>${sig.dir} ${sig.pair} — Entry: ${sig.entry}</strong>
                    <p>SL: ${sig.sl} &nbsp;|&nbsp; TP1: ${sig.tp1} &nbsp;|&nbsp; TP2: ${sig.tp2} &nbsp;|&nbsp; Lotti: ${sig.lots}</p>
                </div>
                <div class="signal-meta">
                    <div style="margin-bottom:4px;">${sig.time}</div>
                    <div class="signal-status ${sig.status}">${sig.status === 'executed' ? '✅ ESEGUITO' : '⏳ IN CODA'}</div>
                    ${sig.status === 'queued' ? `<button class="btn btn-sm btn-warning" style="margin-top:6px; font-size:0.7rem; padding:2px 8px;" onclick="blockSignal('${sig.id}')">🚫 Blocca</button>` : ''}
                </div>
            </div>
        `).join('');

        const queueHtml = signalSource.map(sig => `
            <div class="signal-card ${sig.dir === 'SELL' ? 'sell-signal' : ''}">
                <div class="signal-icon">${sig.dir === 'BUY' ? '📈' : '📉'}</div>
                <div class="signal-body">
                    <strong>${sig.dir} ${sig.pair} — Entry: ${sig.entry}</strong>
                    <p>SL: ${sig.sl} &nbsp;|&nbsp; TP: ${sig.tp1} &nbsp;|&nbsp; Lotti: ${sig.lots}${sig.ticket ? ` &nbsp;|&nbsp; Ticket: #${sig.ticket}` : ''}</p>
                </div>
                <div class="signal-meta">
                    <div style="margin-bottom:4px;">${sig.time}</div>
                    <div class="signal-status queued">⏳ IN CODA</div>
                    <button class="btn btn-sm btn-warning" style="margin-top:6px; font-size:0.7rem; padding:2px 8px;" onclick="blockSignal('${sig.id}')">🚫 Blocca</button>
                </div>
            </div>
        `).join('');

        const backendEvents = window.__softiEaBridgeFeed || { events: [], results: [] };
        const eventHtml = (backendEvents.events || []).slice(-8).reverse().map(ev => {
            const isNeg = ['SL', 'STOP', 'STOPLOSS'].includes(String(ev.event || '').toUpperCase());
            return `
            <div class="signal-card ${isNeg ? 'sell-signal' : ''}">
                <div class="signal-icon">${isNeg ? '🛑' : '✅'}</div>
                <div class="signal-body">
                    <strong>EA EVENT ${ev.event || 'N/A'} ${ev.symbol ? `— ${ev.symbol}` : ''}</strong>
                    <p>ID: ${ev.id || 'N/A'} ${ev.side ? `| ${ev.side}` : ''} ${ev.ts ? `| ${new Date(Number(ev.ts) * 1000).toLocaleTimeString('it-IT')}` : ''}</p>
                </div>
                <div class="signal-meta">
                    <div class="signal-status ${isNeg ? 'queued' : 'executed'}">${isNeg ? '⚠️ CHIUSURA/SL' : '📬 EVENTO EA'}</div>
                </div>
            </div>`;
        }).join('');
        const resultHtml = (backendEvents.results || []).slice(0, 6).map(r => `
            <div class="signal-card">
                <div class="signal-icon">📩</div>
                <div class="signal-body">
                    <strong>EA RESULT ${r.status || 'N/A'}</strong>
                    <p>ID: ${r.id || 'N/A'} | ${r.msg || ''}</p>
                </div>
                <div class="signal-meta">
                    <div class="signal-status ${String(r.status || '').toLowerCase() === 'ok' ? 'executed' : 'queued'}">${String(r.status || '').toUpperCase()}</div>
                </div>
            </div>
        `).join('');

        el.innerHTML = (backendReady ? queueHtml : mockHtml) + eventHtml + resultHtml;
    }

    async function syncClientOverviewFromBackend() {
        if (!hasBackendAuth()) return;
        try {
            const dash = await apiFetch('/client/dashboard');
            const lic = dash.license;
            if (lic) {
                const mapSlots = { BASIC: 1, PRO: 3, ENTERPRISE: 10 };
                const mt4 = lic.mt_accounts?.MT4 || [];
                const mt5 = lic.mt_accounts?.MT5 || [];
                const total = mt4.length + mt5.length;
                const activePlatforms = [mt4.length ? 'MT4' : null, mt5.length ? 'MT5' : null].filter(Boolean).join(', ') || 'Nessuna';
                document.getElementById('overview-license-key').textContent = lic.id;
                document.getElementById('overview-tier-name').textContent = `${lic.plan_code || 'N/A'} (${lic.status || 'N/A'})`;
                document.getElementById('overview-expiry').textContent = lic.expiry_at ? new Date(lic.expiry_at).toLocaleDateString('it-IT') : 'N/D';
                document.getElementById('overview-accounts-count').textContent = `${total} / ${mapSlots[lic.plan_code] || '-'}`;
                document.getElementById('overview-active-platforms').textContent = activePlatforms;
            }
            if (dash.client) {
                const nameEl = document.querySelector('.user-profile .name');
                const roleEl = document.querySelector('.user-profile .role');
                if (nameEl) nameEl.textContent = dash.client.full_name || nameEl.textContent;
                if (roleEl && lic) roleEl.textContent = `${lic.plan_code || 'User'} · ${lic.id || ''}`;
            }
            if (Array.isArray(dash.invoices) && dash.invoices.length) {
                window.__softiClientInvoices = dash.invoices;
            }
        } catch (err) {
            console.warn('Client backend sync failed, using mock data:', err);
        }
    }

    async function renderDownloadsFromBackend() {
        if (!hasBackendAuth()) return;
        try {
            if (!Array.isArray(window.__softiClientInvoices) || !window.__softiClientInvoices.length) {
                try { window.__softiClientInvoices = await apiFetch('/client/invoices'); } catch (_) { }
            }
            if (!Array.isArray(window.__softiClientManualPayments)) {
                try { window.__softiClientManualPayments = await apiFetch('/client/payments/manual'); } catch (_) { window.__softiClientManualPayments = []; }
            }
            const list = await apiFetch('/client/downloads');
            const downloadsWrap = document.querySelector('#view-downloads .download-list');
            const paymentsWrap = document.querySelector('#view-payments .download-list');
            if (!downloadsWrap && !paymentsWrap) return;
            const byCode = Object.fromEntries(list.map(d => [d.code, d]));
            const order = [
                { code: 'EA_MT4', ext: 'EA', title: 'SoftiBridge EA (MT4)' },
                { code: 'EA_MT5', ext: 'EA', title: 'SoftiBridge EA (MT5)' },
                { code: 'GUIDA_IT', ext: 'PDF', title: "Guida all'installazione (IT)" }
            ];
            const resourcesHtml = order.map(item => {
                const d = byCode[item.code];
                if (!d) return '';
                return `
                    <div class="download-item">
                        <div class="ext-icon">${item.ext}</div>
                        <div class="ext-details">
                            <span class="name">${item.title} v${d.version}</span>
                            <span class="meta">File: ${d.file_name}</span>
                        </div>
                                <a href="#" class="btn btn-outline" onclick="return window.softiClientDownload('${d.id}')">${item.ext === 'PDF' ? 'Apri Guida' : 'Download'}</a>
                    </div>`;
            }).join('');

            const invoices = Array.isArray(window.__softiClientInvoices) ? window.__softiClientInvoices : [];
            const invoiceFilters = window.__softiClientInvoiceFilters || { status: 'ALL', method: 'ALL', doc: 'ALL' };
            const filteredInvoices = invoices.filter(i => {
                const st = String(i.status || '').toUpperCase();
                const pm = String(i.payment_method || '').toUpperCase();
                const dt = String(i.document_type || '').toUpperCase();
                if (invoiceFilters.status !== 'ALL' && st !== invoiceFilters.status) return false;
                if (invoiceFilters.method !== 'ALL' && pm !== invoiceFilters.method) return false;
                if (invoiceFilters.doc !== 'ALL' && dt !== invoiceFilters.doc) return false;
                return true;
            });

            const payments = Array.isArray(window.__softiClientManualPayments) ? window.__softiClientManualPayments : [];
            const allPayments = Array.isArray(window.__softiClientPayments) ? window.__softiClientPayments : [];
            const payFilters = window.__softiClientPaymentArchiveFilters || { status: 'ALL', method: 'ALL' };
            const filteredPayments = payments.filter(p => {
                const st = String(p.status || '').toUpperCase();
                const pm = String(p.method || '').toUpperCase();
                if (payFilters.status !== 'ALL' && st !== payFilters.status) return false;
                if (payFilters.method !== 'ALL' && pm !== payFilters.method) return false;
                return true;
            });

            const statusBadge = (status) => {
                const s = String(status || '').toUpperCase();
                const cls = s === 'PAID' || s === 'APPROVED' ? 'success'
                    : s === 'PENDING' || s === 'PENDING_VERIFICATION' ? 'warning'
                        : s === 'REJECTED' ? 'danger'
                            : 'neutral';
                return `<span class="status-pill ${cls}">${s || 'N/D'}</span>`;
            };

            const resourceSection = `
                <div class="download-section-card">
                    <div class="ext-details">
                        <span class="name">Download Risorse</span>
                        <span class="meta">${order.filter(item => byCode[item.code]).length} file disponibili</span>
                    </div>
                </div>
                ${resourcesHtml || `<div class="download-item"><div class="ext-details"><span class="name">Nessun file disponibile</span><span class="meta">I download compariranno qui dopo l'attivazione.</span></div></div>`}
            `;

            const invoiceFiltersBar = `
                <div class="download-item" style="display:block;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; width:100%;">
                        <div class="ext-details">
                            <span class="name">Fatture & Pagamenti</span>
                            <span class="meta">${filteredInvoices.length} documenti filtrati / ${invoices.length} totali</span>
                        </div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <select id="client-inv-filter-status" class="btn btn-outline" style="background:transparent;">
                                <option value="ALL">Stato: Tutti</option>
                                <option value="PAID">Pagate</option>
                                <option value="PENDING_VERIFICATION">In verifica</option>
                                <option value="SENT">Inviate</option>
                                <option value="ISSUED">Emesse</option>
                                <option value="PENDING_PAYMENT">Da pagare</option>
                            </select>
                            <select id="client-inv-filter-method" class="btn btn-outline" style="background:transparent;">
                                <option value="ALL">Metodo: Tutti</option>
                                <option value="STRIPE">Stripe</option>
                                <option value="BANK_TRANSFER">Bonifico</option>
                                <option value="USDT_TRC20">USDT TRON</option>
                            </select>
                            <select id="client-inv-filter-doc" class="btn btn-outline" style="background:transparent;">
                                <option value="ALL">Doc: Tutti</option>
                                <option value="INVOICE">Fatture</option>
                                <option value="PROFORMA">Proforma</option>
                            </select>
                        </div>
                    </div>
                </div>`;

            const invoiceRows = filteredInvoices.slice(0, 50).map(i => {
                const payable = !!i.payable && String(i.status || '').toUpperCase() !== 'PAID';
                return `<div class="download-item">
                    <div class="ext-icon">INV</div>
                    <div class="ext-details">
                        <span class="name">${i.invoice_number}</span>
                        <span class="meta">${i.currency} ${(i.total_cents / 100).toFixed(2)} · ${i.status}${i.document_type ? ` · ${i.document_type}` : ''}${i.payment_method ? ` · ${i.payment_method}` : ''}${i.issued_at ? ` · ${new Date(i.issued_at).toLocaleDateString('it-IT')}` : ''}</span>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        ${i.pdf_url ? `<a class="btn btn-outline" href="${i.pdf_url}" target="_blank">Apri PDF</a>` : ''}
                        ${payable ? `<a class="btn btn-primary" href="#" onclick="return window.softiClientPayInvoice('${i.invoice_number}')">Stripe</a>` : '<span class="btn btn-outline" style="pointer-events:none; opacity:0.6;">Pagata</span>'}
                        ${payable ? `<a class="btn btn-outline" href="#" onclick="return window.softiClientPayBank('${i.invoice_number}')">Bonifico</a>` : ''}
                        ${payable ? `<a class="btn btn-outline" href="#" onclick="return window.softiClientPayUsdt('${i.invoice_number}')">USDT TRON</a>` : ''}
                    </div>
                </div>`;
            }).join('') || `<div class="download-item"><div class="ext-details"><span class="name">Nessuna fattura trovata</span><span class="meta">Cambia i filtri o attendi la prossima emissione.</span></div></div>`;

            const allPaymentHeader = `
                <div class="download-item" style="display:block;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; width:100%;">
                        <div class="ext-details">
                            <span class="name">Storico Pagamenti Totale</span>
                            <span class="meta">${allPayments.length} movimenti (Stripe + manuali)</span>
                        </div>
                    </div>
                </div>`;

            const allPaymentRows = allPayments.slice(0, 50).map(p => {
                const inv = p.invoice || {};
                const ms = p.manual_submission || null;
                const method = String(p.method || (ms?.method || '')).toUpperCase();
                const amountLabel = `${p.currency || inv.currency || 'EUR'} ${(Number(p.amount_cents || inv.total_cents || 0) / 100).toFixed(2)}`;
                const detail = ms
                    ? `${method === 'USDT_TRC20' ? 'TXID' : 'CRO/TRN'}: ${ms.reference_code || 'N/D'}${ms.review_notes ? ` · ${ms.review_notes}` : ''}`
                    : (p.paid_at ? `Pagato: ${new Date(p.paid_at).toLocaleString('it-IT')}` : 'Pagamento avviato');
                return `<div class="download-item" style="align-items:flex-start;">
                    <div class="ext-icon">€</div>
                    <div class="ext-details">
                        <span class="name">${inv.invoice_number || 'Pagamento'} · ${method || 'N/D'}</span>
                        <span class="meta">${statusBadge(p.status)} ${inv.document_type ? ` · ${inv.document_type}` : ''} · ${amountLabel}</span>
                        <span class="meta">${detail}</span>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        ${ms?.proof_url ? `<a class="btn btn-outline" href="${ms.proof_url}" target="_blank">Ricevuta</a>` : ''}
                        ${inv.pdf_url ? `<a class="btn btn-outline" href="${inv.pdf_url}" target="_blank">PDF</a>` : ''}
                    </div>
                </div>`;
            }).join('') || `<div class="download-item"><div class="ext-details"><span class="name">Nessun pagamento registrato</span><span class="meta">Lo storico (Stripe e manuali) comparirà qui automaticamente.</span></div></div>`;

            const paymentArchiveHeader = `
                <div class="download-item" style="display:block;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; width:100%;">
                        <div class="ext-details">
                            <span class="name">Archivio Pagamenti</span>
                            <span class="meta">${filteredPayments.length} segnalazioni / ${payments.length} totali</span>
                        </div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <select id="client-pay-filter-status" class="btn btn-outline" style="background:transparent;">
                                <option value="ALL">Stato: Tutti</option>
                                <option value="PENDING">In verifica</option>
                                <option value="APPROVED">Approvati</option>
                                <option value="REJECTED">Rifiutati</option>
                            </select>
                            <select id="client-pay-filter-method" class="btn btn-outline" style="background:transparent;">
                                <option value="ALL">Metodo: Tutti</option>
                                <option value="BANK_TRANSFER">Bonifico</option>
                                <option value="USDT_TRC20">USDT TRON</option>
                            </select>
                        </div>
                    </div>
                </div>`;

            const paymentArchiveRows = filteredPayments.slice(0, 50).map(p => {
                const inv = p.invoice || {};
                const refLabel = (String(p.method || '').toUpperCase() === 'USDT_TRC20') ? 'TXID' : 'CRO/TRN';
                const amountLabel = p.submitted_amount_cents != null
                    ? `${p.submitted_currency || inv.currency || ''} ${(Number(p.submitted_amount_cents || 0) / 100).toFixed(2)}`
                    : (p.submitted_currency === 'USDT' && p.payload?.amount_usdt ? `USDT ${p.payload.amount_usdt}` : (inv.total_cents ? `${inv.currency} ${(inv.total_cents / 100).toFixed(2)}` : 'N/D'));
                return `<div class="download-item" style="align-items:flex-start;">
                    <div class="ext-icon">PAY</div>
                    <div class="ext-details">
                        <span class="name">${inv.invoice_number || 'Documento non trovato'} · ${p.method || 'N/D'}</span>
                        <span class="meta">${statusBadge(p.status)} ${inv.document_type ? ` · ${inv.document_type}` : ''} ${inv.status ? ` · Fattura: ${inv.status}` : ''}</span>
                        <span class="meta">${refLabel}: ${p.reference_code || 'N/D'} · Importo: ${amountLabel}</span>
                        <span class="meta">Inviato: ${p.submitted_at ? new Date(p.submitted_at).toLocaleString('it-IT') : 'N/D'}${p.reviewed_at ? ` · Revisionato: ${new Date(p.reviewed_at).toLocaleString('it-IT')}` : ''}</span>
                        ${p.review_notes ? `<span class="meta">Nota admin: ${p.review_notes}</span>` : ''}
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        ${p.proof_url ? `<a class="btn btn-outline" href="${p.proof_url}" target="_blank">Ricevuta</a>` : ''}
                        ${inv.pdf_url ? `<a class="btn btn-outline" href="${inv.pdf_url}" target="_blank">PDF</a>` : ''}
                        ${String(p.status || '').toUpperCase() === 'REJECTED' && inv.invoice_number ? `<a class="btn btn-primary" href="#" onclick="return ${String(p.method || '').toUpperCase() === 'USDT_TRC20' ? `window.softiClientPayUsdt('${inv.invoice_number}')` : `window.softiClientPayBank('${inv.invoice_number}')`}">Nuovo invio</a>` : ''}
                    </div>
                </div>`;
            }).join('') || `<div class="download-item"><div class="ext-details"><span class="name">Nessun pagamento manuale inviato</span><span class="meta">Le segnalazioni bonifico/USDT compariranno qui con stato e revisione admin.</span></div></div>`;

            if (downloadsWrap) {
                downloadsWrap.innerHTML = resourceSection;
            }
            if (paymentsWrap) {
                paymentsWrap.innerHTML = invoiceFiltersBar + invoiceRows + allPaymentHeader + allPaymentRows + paymentArchiveHeader + paymentArchiveRows;
            }

            const statusEl = document.getElementById('client-inv-filter-status');
            const methodEl = document.getElementById('client-inv-filter-method');
            const docEl = document.getElementById('client-inv-filter-doc');
            const payStatusEl = document.getElementById('client-pay-filter-status');
            const payMethodEl = document.getElementById('client-pay-filter-method');
            if (statusEl) statusEl.value = invoiceFilters.status;
            if (methodEl) methodEl.value = invoiceFilters.method;
            if (docEl) docEl.value = invoiceFilters.doc;
            if (payStatusEl) payStatusEl.value = payFilters.status;
            if (payMethodEl) payMethodEl.value = payFilters.method;
            statusEl?.addEventListener('change', (e) => { window.__softiClientInvoiceFilters.status = e.target.value; renderDownloadsFromBackend(); });
            methodEl?.addEventListener('change', (e) => { window.__softiClientInvoiceFilters.method = e.target.value; renderDownloadsFromBackend(); });
            docEl?.addEventListener('change', (e) => { window.__softiClientInvoiceFilters.doc = e.target.value; renderDownloadsFromBackend(); });
            payStatusEl?.addEventListener('change', (e) => { window.__softiClientPaymentArchiveFilters.status = e.target.value; renderDownloadsFromBackend(); });
            payMethodEl?.addEventListener('change', (e) => { window.__softiClientPaymentArchiveFilters.method = e.target.value; renderDownloadsFromBackend(); });
        } catch (err) {
            console.warn('Backend downloads load failed:', err);
        }
    }

    window.softiClientDownload = async function (downloadId) {
        if (!hasBackendAuth()) {
            alert('Login API richiesto. Usa il Client Connect Center in alto (vista Overview).');
            return false;
        }
        try {
            const tok = await apiFetch(`/client/downloads/${downloadId}/token`, { method: 'POST' });
            window.open(tok.url, '_blank');
        } catch (err) {
            alert(`Errore download: ${err.message}`);
        }
        return false;
    };

    window.softiClientPayInvoice = async function (invoiceNumber) {
        if (!hasBackendAuth()) {
            alert('Login API richiesto. Usa il Client Connect Center in alto (vista Overview).');
            return false;
        }
        try {
            const res = await apiFetch(`/client/invoices/${encodeURIComponent(invoiceNumber)}/pay`, { method: 'POST' });
            if (res.already_paid) {
                alert(`La fattura ${invoiceNumber} risulta già pagata.`);
                window.__softiClientInvoices = await apiFetch('/client/invoices');
                renderDownloadsFromBackend();
                return false;
            }
            if (res.simulated) {
                const confirmDemo = confirm(`Checkout Stripe non configurato.\n\nSimulare pagamento fattura ${invoiceNumber}?`);
                if (confirmDemo) {
                    await apiFetch(`/client/invoices/${encodeURIComponent(invoiceNumber)}/confirm-demo-payment`, { method: 'POST' });
                    window.__softiClientInvoices = await apiFetch('/client/invoices');
                    renderDownloadsFromBackend();
                    alert(`✅ Pagamento demo confermato per ${invoiceNumber}`);
                }
                return false;
            }
            if (res.checkout_url) {
                window.open(res.checkout_url, '_blank');
            } else {
                alert('Checkout non disponibile per questa fattura.');
            }
        } catch (err) {
            alert(`Errore pagamento fattura: ${err.message}`);
        }
        return false;
    };

    async function getManualMethods(invoiceNumber) {
        return apiFetch(`/client/invoices/${encodeURIComponent(invoiceNumber)}/manual-methods`);
    }

    function refreshInvoicesAndDownloads() {
        return Promise.all([
            apiFetch('/client/invoices'),
            apiFetch('/client/payments').catch(() => []),
            apiFetch('/client/payments/manual').catch(() => []),
        ])
            .then(([rows, allPayments, payments]) => {
                window.__softiClientInvoices = rows;
                window.__softiClientPayments = allPayments;
                window.__softiClientManualPayments = payments;
                return renderDownloadsFromBackend();
            })
            .catch((err) => console.warn('Invoice refresh failed:', err));
    }

    async function promptAndUploadProof(invoiceNumber, method) {
        const wantsUpload = confirm('Vuoi allegare una ricevuta/screenshot del pagamento?');
        if (!wantsUpload) return null;
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.png,.jpg,.jpeg,.webp,.pdf';
            input.onchange = async () => {
                const file = input.files && input.files[0];
                if (!file) return resolve(null);
                try {
                    const fd = new FormData();
                    fd.append('method', method);
                    fd.append('file', file);
                    const up = await apiUpload(`/client/invoices/${encodeURIComponent(invoiceNumber)}/upload-proof`, fd);
                    resolve(up.proof_url || null);
                } catch (err) {
                    alert(`Errore upload ricevuta: ${err.message}`);
                    resolve(null);
                }
            };
            input.click();
        });
    }

    function renderManualPaymentModal({ invoiceNumber, method, payload }) {
        const isBank = method === 'BANK_TRANSFER';
        const title = isBank ? 'Paga con Bonifico' : 'Paga con USDT TRON';
        const primaryFieldLabel = isBank ? 'CRO / TRN / Reference' : 'TXID TRON (TRC20)';
        const amountHint = isBank
            ? `${payload.currency} ${(payload.amount_cents / 100).toFixed(2)}`
            : `${payload.currency_reference} ${((payload.amount_cents_reference || 0) / 100).toFixed(2)} (rif.)`;
        const detailHtml = isBank ? `
            <div class="invoice-pay-grid">
                <div>
                    <label style="font-size:.78rem;color:var(--text-dim)">Beneficiario</label>
                    <div class="copy-row"><code>${payload.bank_account_name || 'N/D'}</code><button class="btn btn-secondary btn-sm" type="button" onclick="window.softiCopyText('${String(payload.bank_account_name || '').replace(/'/g, "\\'")}')">Copia</button></div>
                </div>
                <div>
                    <label style="font-size:.78rem;color:var(--text-dim)">Banca</label>
                    <div class="copy-row"><code>${payload.bank_name || 'N/D'}</code><button class="btn btn-secondary btn-sm" type="button" onclick="window.softiCopyText('${String(payload.bank_name || '').replace(/'/g, "\\'")}')">Copia</button></div>
                </div>
                <div style="grid-column:1/-1">
                    <label style="font-size:.78rem;color:var(--text-dim)">IBAN</label>
                    <div class="copy-row"><code>${payload.iban || 'N/D'}</code><button class="btn btn-secondary btn-sm" type="button" onclick="window.softiCopyText('${String(payload.iban || '').replace(/'/g, "\\'")}')">Copia</button></div>
                </div>
                <div style="grid-column:1/-1">
                    <label style="font-size:.78rem;color:var(--text-dim)">Causale</label>
                    <div class="copy-row"><code>${payload.payment_reason || invoiceNumber}</code><button class="btn btn-secondary btn-sm" type="button" onclick="window.softiCopyText('${String(payload.payment_reason || invoiceNumber).replace(/'/g, "\\'")}')">Copia</button></div>
                </div>
            </div>` : `
            <div class="invoice-pay-grid">
                <div style="grid-column:1/-1">
                    <label style="font-size:.78rem;color:var(--text-dim)">Wallet ${payload.network || 'TRC20'}</label>
                    <div class="copy-row"><code>${payload.wallet_address || 'N/D'}</code><button class="btn btn-secondary btn-sm" type="button" onclick="window.softiCopyText('${String(payload.wallet_address || '').replace(/'/g, "\\'")}')">Copia</button></div>
                </div>
                <div>
                    <label style="font-size:.78rem;color:var(--text-dim)">Riferimento</label>
                    <div class="copy-row"><code>${invoiceNumber}</code><button class="btn btn-secondary btn-sm" type="button" onclick="window.softiCopyText('${String(invoiceNumber).replace(/'/g, "\\'")}')">Copia</button></div>
                </div>
                <div>
                    <label style="font-size:.78rem;color:var(--text-dim)">Tolleranza</label>
                    <div class="copy-row"><code>±${payload.buffer_pct || 1}%</code><button class="btn btn-secondary btn-sm" type="button" onclick="window.softiCopyText('±${payload.buffer_pct || 1}%')">Copia</button></div>
                </div>
            </div>`;

        openSmartModal(`
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:.8rem;">
                <h2 style="font-family:Outfit; font-size:1.15rem;">${title}</h2>
                <button class="btn btn-secondary btn-sm" type="button" onclick="window.closeSmartModal()">✕</button>
            </div>
            <div style="margin-bottom:.9rem; color:var(--text-dim); font-size:.86rem;">
                Documento <strong style="color:var(--text-main)">${invoiceNumber}</strong> · Importo riferimento <strong style="color:var(--text-main)">${amountHint}</strong>
            </div>
            ${detailHtml}
            <div style="margin-top:1rem;">
                <label style="display:block; font-size:.78rem; color:var(--text-dim); margin-bottom:4px;">${primaryFieldLabel}</label>
                <input id="manual-pay-ref" type="text" style="width:100%; padding:.7rem .8rem; border-radius:10px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.1); color:white;" placeholder="${isBank ? 'Es. CRO123456789' : 'Es. 9f2f...'}">
            </div>
            <div style="margin-top:.8rem;">
                <label style="display:block; font-size:.78rem; color:var(--text-dim); margin-bottom:4px;">Note (opzionale)</label>
                <textarea id="manual-pay-notes" rows="2" style="width:100%; padding:.7rem .8rem; border-radius:10px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.1); color:white;" placeholder="Es. pagamento eseguito da conto XXX / screenshot allegato"></textarea>
            </div>
            <div style="margin-top:.8rem;">
                <label style="display:flex; align-items:center; gap:8px; color:var(--text-dim); font-size:.82rem;">
                    <input id="manual-pay-upload-check" type="checkbox"> Allega ricevuta / screenshot
                </label>
                <div id="manual-pay-upload-status" style="font-size:.76rem; color:var(--text-dim); margin-top:4px;">Nessun file selezionato</div>
            </div>
            ${!isBank ? `<div style="margin-top:.8rem;"><label style=\"display:block; font-size:.78rem; color:var(--text-dim); margin-bottom:4px;\">Importo USDT (opzionale)</label><input id=\"manual-pay-amount-usdt\" type=\"number\" step=\"0.000001\" style=\"width:100%; padding:.7rem .8rem; border-radius:10px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.1); color:white;\"></div>` : ''}
            <div class="warning-box" style="margin-top:1rem;">
                <span>⏳</span><span>Dopo l'invio, lo stato passerà in <strong>In verifica</strong> finché l'admin non approva il pagamento.</span>
            </div>
            <div class="modal-actions" style="margin-top:1rem;">
                <button class="btn btn-secondary" type="button" onclick="window.closeSmartModal()">Annulla</button>
                <button class="btn btn-primary" type="button" id="manual-pay-submit-btn">Invia verifica pagamento</button>
            </div>
        `);

        const submitBtn = document.getElementById('manual-pay-submit-btn');
        submitBtn?.addEventListener('click', async () => {
            const ref = (document.getElementById('manual-pay-ref')?.value || '').trim();
            const notes = (document.getElementById('manual-pay-notes')?.value || '').trim();
            const withUpload = !!document.getElementById('manual-pay-upload-check')?.checked;
            if (!ref) return toast(`Inserisci ${primaryFieldLabel}`, 'warning');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Invio in corso...';
            try {
                let proofUrl = null;
                if (withUpload) {
                    document.getElementById('manual-pay-upload-status').textContent = 'Seleziona file...';
                    proofUrl = await promptAndUploadProof(invoiceNumber, method);
                    document.getElementById('manual-pay-upload-status').textContent = proofUrl ? 'Ricevuta caricata ✅' : 'Nessuna ricevuta allegata';
                }
                if (isBank) {
                    await apiFetch(`/client/invoices/${encodeURIComponent(invoiceNumber)}/submit-bank-transfer`, {
                        method: 'POST',
                        body: JSON.stringify({
                            reference_code: ref,
                            amount_cents: payload.amount_cents,
                            notes: notes || null,
                            proof_url: proofUrl || null
                        })
                    });
                } else {
                    const amountUsdt = Number(document.getElementById('manual-pay-amount-usdt')?.value || 0);
                    await apiFetch(`/client/invoices/${encodeURIComponent(invoiceNumber)}/submit-usdt`, {
                        method: 'POST',
                        body: JSON.stringify({
                            txid: ref,
                            amount_usdt: amountUsdt > 0 ? amountUsdt : null,
                            notes: notes || null,
                            proof_url: proofUrl || null
                        })
                    });
                }
                closeSmartModal();
                await refreshInvoicesAndDownloads();
                toast(`Pagamento ${isBank ? 'bonifico' : 'USDT'} inviato in verifica`, 'success', 3600);
            } catch (err) {
                toast(`Errore invio verifica: ${err.message}`, 'error', 4200);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Invia verifica pagamento';
            }
        });
    }

    window.softiClientPayBank = async function (invoiceNumber) {
        if (!hasBackendAuth()) {
            alert('Login API richiesto. Usa il Client Connect Center in alto (vista Overview).');
            return false;
        }
        try {
            const data = await getManualMethods(invoiceNumber);
            const bank = (data.methods || []).find(m => m.method === 'BANK_TRANSFER');
            if (!bank) throw new Error('Metodo bonifico non configurato');
            renderManualPaymentModal({ invoiceNumber, method: 'BANK_TRANSFER', payload: bank });
        } catch (err) {
            toast(`Errore bonifico: ${err.message}`, 'error', 4200);
        }
        return false;
    };

    window.softiClientPayUsdt = async function (invoiceNumber) {
        if (!hasBackendAuth()) {
            alert('Login API richiesto. Usa il Client Connect Center in alto (vista Overview).');
            return false;
        }
        try {
            const data = await getManualMethods(invoiceNumber);
            const usdt = (data.methods || []).find(m => m.method === 'USDT_TRC20');
            if (!usdt) throw new Error('Wallet USDT TRON non configurato');
            renderManualPaymentModal({ invoiceNumber, method: 'USDT_TRC20', payload: usdt });
        } catch (err) {
            toast(`Errore USDT: ${err.message}`, 'error', 4200);
        }
        return false;
    };

    async function syncClientEaFeedFromBackend() {
        if (!hasBackendAuth()) return;
        try {
            const data = await apiFetch('/client/ea/events?limit=50');
            window.__softiEaBridgeFeed = data;
            const active = document.querySelector('.view.active');
            if (active && active.id === 'view-signals') renderSignals();
        } catch (err) {
            console.warn('EA bridge feed unavailable:', err);
        }
    }

    function mapBackendTradingState(data) {
        const normNum = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
        };
        const mt4Pos = (data?.positions?.mt4 || []).map(p => ({
            ticket: Number(p.ticket || 0),
            pair: p.symbol || p.pair || 'N/A',
            dir: (p.side || p.type || '').toUpperCase().includes('SELL') ? 'SELL' : 'BUY',
            lots: normNum(p.lots || p.volume),
            open: normNum(p.open || p.open_price),
            sl: normNum(p.sl || p.stop_loss),
            tp: normNum(p.tp || p.take_profit),
            pnl: normNum(p.pnl || p.profit),
            time: p.time || p.open_time || '--:--',
            platform: 'MT4'
        }));
        const mt5Pos = (data?.positions?.mt5 || []).map(p => ({
            ticket: Number(p.ticket || 0),
            pair: p.symbol || p.pair || 'N/A',
            dir: (p.side || p.type || '').toUpperCase().includes('SELL') ? 'SELL' : 'BUY',
            lots: normNum(p.lots || p.volume),
            open: normNum(p.open || p.open_price || p.price_open),
            sl: normNum(p.sl || p.stop_loss),
            tp: normNum(p.tp || p.take_profit),
            pnl: normNum(p.pnl || p.profit),
            time: p.time || p.open_time || '--:--',
            platform: 'MT5'
        }));
        const mt4Pending = (data?.pending?.mt4 || []).map(p => ({
            ticket: Number(p.ticket || 0),
            pair: p.symbol || p.pair || 'N/A',
            type: p.type || 'PENDING',
            lots: normNum(p.lots || p.volume),
            price: normNum(p.price || p.entry),
            sl: normNum(p.sl || p.stop_loss),
            tp: normNum(p.tp || p.take_profit),
            created: p.time || p.created || '--:--',
            platform: 'MT4'
        }));
        const mt5Pending = (data?.pending?.mt5 || []).map(p => ({
            ticket: Number(p.ticket || 0),
            pair: p.symbol || p.pair || 'N/A',
            type: p.type || 'PENDING',
            lots: normNum(p.lots || p.volume),
            price: normNum(p.price || p.entry || p.price_open),
            sl: normNum(p.sl || p.stop_loss),
            tp: normNum(p.tp || p.take_profit),
            created: p.time || p.created || '--:--',
            platform: 'MT5'
        }));
        tradingState.positions = [...mt4Pos, ...mt5Pos];
        tradingState.pending = [...mt4Pending, ...mt5Pending];
        tradingState.floatingPnl = tradingState.positions.reduce((s, p) => s + (Number(p.pnl) || 0), 0);
        tradingState.equity = tradingState.balance + tradingState.floatingPnl;
    }

    async function syncClientTradingStateFromBackend() {
        if (!hasBackendAuth()) return;
        try {
            const data = await apiFetch('/client/trading/state');
            window.__softiClientTradingState = data;
            mapBackendTradingState(data);
            window.__softiEaBridgeFeed = { events: data.events || [], results: data.results || [] };
            const active = document.querySelector('.view.active');
            if (active) {
                if (active.id === 'view-trading') renderTradingPanel();
                if (active.id === 'view-positions') renderPositionsFull();
                if (active.id === 'view-pending') renderPendingFull();
                if (active.id === 'view-signals') renderSignals();
            }
        } catch (err) {
            console.warn('Trading state backend sync failed:', err);
        }
    }

    // =========================================================
    // === ACTIONS: SL/TP, Close, Cancel, Block
    // =========================================================
    async function sendTradingCommand(action, payload, okMessage) {
        if (!hasBackendAuth()) {
            toast('Login API richiesto. Usa il Client Connect Center in alto (vista Overview).', 'warning', 4200);
            return false;
        }
        try {
            await apiFetch('/client/trading/control', {
                method: 'POST',
                body: JSON.stringify({ action, ...payload })
            });
            toast(okMessage, 'success', 2600);
            setTimeout(syncClientTradingStateFromBackend, 1200);
            return true;
        } catch (err) {
            toast(`Errore comando ${action}: ${err.message}`, 'error', 5200);
            return false;
        }
    }

    window.openSLTP = function (ticket, pair, sl, tp) {
        currentSLTPTicket = ticket;
        document.getElementById('sltp-modal-title').textContent = `⚙️ Modifica SL/TP — #${ticket}`;
        document.getElementById('sltp-modal-pair').textContent = `${pair} — Ticket #${ticket}`;
        document.getElementById('sltp-sl-input').value = sl;
        document.getElementById('sltp-tp-input').value = tp;
        document.getElementById('sltp-modal').style.display = 'flex';
    };

    document.getElementById('sltp-confirm-btn')?.addEventListener('click', async () => {
        const newSL = parseFloat(document.getElementById('sltp-sl-input').value);
        const newTP = parseFloat(document.getElementById('sltp-tp-input').value);
        if (!Number.isFinite(newSL) || !Number.isFinite(newTP)) {
            toast('Inserisci valori SL/TP validi.', 'warning', 3200);
            return;
        }
        const posCur = tradingState.positions.find(p => p.ticket === currentSLTPTicket);
        const ok = await sendTradingCommand('SET_SLTP', {
            ticket: currentSLTPTicket,
            sl_price: newSL,
            tp_price: newTP,
            symbol: posCur?.pair || 'CURRENT'
        }, `Comando SL/TP inviato all'EA per ticket #${currentSLTPTicket}.`);
        if (ok) document.getElementById('sltp-modal').style.display = 'none';
    });

    window.closePosition = async function (ticket, pair, pnl) {
        if (!confirm(`Chiudere la posizione #${ticket} su ${pair}?\nP&L corrente: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}\n\nL'ordine di chiusura sarà inviato all'EA via LITE B.`)) return;
        await sendTradingCommand('CLOSE_TICKET', { ticket, symbol: pair || 'CURRENT' }, `Comando chiusura inviato all'EA per ticket #${ticket}.`);
    };

    window.closeAllPositions = async function () {
        if (!confirm(`⚠️ Vuoi chiudere TUTTE le ${tradingState.positions.length} posizioni aperte?\n\nQuesta azione verrà inviata all'EA via LITE B.`)) return;
        await sendTradingCommand('CLOSE_ALL', {}, 'Comando CLOSE_ALL inviato all\'EA.');
    };

    window.moveToBE = async function (ticket, pair) {
        if (!confirm(`Portare in Break Even la posizione #${ticket} (${pair})?`)) return;
        await sendTradingCommand('MOVE_BE', { ticket, symbol: pair || 'CURRENT' }, `Comando BE inviato all'EA per #${ticket}.`);
    };

    window.moveSLStep = async function (ticket, pair, pips = 10) {
        if (!confirm(`Spostare SL di ${pips} pips sulla posizione #${ticket} (${pair})?`)) return;
        await sendTradingCommand('MOVE_SL', {
            ticket,
            symbol: pair || 'CURRENT',
            move_sl_pips: Number(pips || 10)
        }, `Comando MOVE_SL (+${pips} pips) inviato all'EA per #${ticket}.`);
    };

    window.cancelPending = async function (ticket, pair) {
        if (!confirm(`Cancellare l'ordine pendente #${ticket} su ${pair}?`)) return;
        await sendTradingCommand('CANCEL_TICKET', { ticket, symbol: pair || 'CURRENT' }, `Comando cancel inviato all'EA per ordine #${ticket}.`);
    };

    window.blockSignal = async function (sigId) {
        const allSignals = []
            .concat(signals || [])
            .concat((tradingState.pending || []).map((p, idx) => ({ id: `PEND-${p.ticket || idx}`, ticket: Number(p.ticket || 0), pair: p.pair || p.symbol || 'CURRENT' })));
        const sig = allSignals.find(s => s.id === sigId);
        const ticket = Number(sig?.ticket || 0);
        if (ticket > 0) {
            await sendTradingCommand('CANCEL_TICKET', { ticket, symbol: sig?.pair || 'CURRENT' }, `Segnale ${sigId} bloccato: ordine #${ticket} annullato via backend.`);
            return;
        }
        const localSig = signals.find(s => s.id === sigId);
        if (localSig) localSig.status = 'blocked';
        renderSignals();
        toast(`Segnale ${sigId} bloccato localmente (nessun ticket EA associato).`, 'warning', 4200);
    };

    async function loadEaConfigIntoForm() {
        if (!hasBackendAuth()) return;
        try {
            const cfg = await apiFetch('/client/ea/config');
            const mt4 = document.getElementById('cfg-mt4-account');
            const mt5 = document.getElementById('cfg-mt5-account');
            const lots = document.getElementById('cfg-default-lots');
            const dd = document.getElementById('cfg-max-dd');
            if (mt4) mt4.value = cfg.mt4_account || '';
            if (mt5) mt5.value = cfg.mt5_account || '';
            if (lots) lots.value = Number(cfg.default_lots || 0.1).toFixed(2);
            if (dd) dd.value = Number(cfg.max_daily_dd_pct || 5).toFixed(1);
            toast(`Configurazione EA caricata (${cfg.source || 'backend'}).`, 'success', 1800);
        } catch (err) {
            toast(`Impossibile caricare configurazione EA: ${err.message}`, 'warning', 4200);
        }
    }

    async function saveEaConfigFromForm() {
        if (!hasBackendAuth()) {
            toast('Login API richiesto. Usa il Client Connect Center in alto (vista Overview).', 'warning', 4200);
            return;
        }
        const mt4 = (document.getElementById('cfg-mt4-account')?.value || '').trim();
        const mt5 = (document.getElementById('cfg-mt5-account')?.value || '').trim();
        const defaultLots = Number(document.getElementById('cfg-default-lots')?.value || 0.1);
        const maxDd = Number(document.getElementById('cfg-max-dd')?.value || 5);
        if (!Number.isFinite(defaultLots) || defaultLots <= 0) {
            toast('Valore lotti non valido.', 'warning', 3200);
            return;
        }
        if (!Number.isFinite(maxDd) || maxDd <= 0) {
            toast('Valore drawdown non valido.', 'warning', 3200);
            return;
        }
        try {
            await apiFetch('/client/ea/config', {
                method: 'POST',
                body: JSON.stringify({
                    mt4_account: mt4 || null,
                    mt5_account: mt5 || null,
                    default_lots: defaultLots,
                    max_daily_dd_pct: maxDd,
                })
            });
            toast('Configurazione EA salvata su backend.', 'success', 2600);
            setTimeout(syncClientTradingStateFromBackend, 900);
        } catch (err) {
            toast(`Salvataggio configurazione EA fallito: ${err.message}`, 'error', 5200);
        }
    }

    window.softiClientSaveEaConfig = saveEaConfigFromForm;

    // =========================================================
    // === CONFIG VIEW (backend connected)
    // =========================================================
    function renderConfigView() {
        const c = document.getElementById('tiers-config-container');
        if (!c) return;
        c.innerHTML = `
            <div class="glass-card">
                <h3>Configurazione EA — PRO (MT4 + MT5)</h3>
                <p class="description">Il tuo piano PRO permette <b>3 account simultanei</b> su MT4 e MT5.</p>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-top:1.5rem;">
                    <div class="form-group">
                        <label>Account MT4</label>
                        <input id="cfg-mt4-account" type="text" value="" placeholder="Account number" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px; padding:0.7rem 1rem; width:100%; font-family:monospace;">
                    </div>
                    <div class="form-group">
                        <label>Account MT5</label>
                        <input id="cfg-mt5-account" type="text" value="" placeholder="Non configurato" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px; padding:0.7rem 1rem; width:100%;">
                    </div>
                    <div class="form-group">
                        <label>Lotti Default</label>
                        <input id="cfg-default-lots" type="number" value="0.10" step="0.01" min="0.01" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px; padding:0.7rem 1rem; width:100%;">
                    </div>
                    <div class="form-group">
                        <label>Max DD Giornaliero (%)</label>
                        <input id="cfg-max-dd" type="number" value="5" step="0.5" min="0.1" max="100" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:8px; padding:0.7rem 1rem; width:100%;">
                    </div>
                </div>
                <button class="btn btn-primary" style="margin-top:1.5rem;" onclick="window.softiClientSaveEaConfig()">💾 Salva Configurazione</button>
            </div>`;
        loadEaConfigIntoForm();
    }

    // =========================================================
    // === BOT LIVE HEARTBEAT
    // =========================================================
    let hbSeconds = 0;
    setInterval(() => {
        hbSeconds++;
        const el = document.getElementById('heartbeat-time');
        if (el) el.textContent = hbSeconds < 60 ? `${hbSeconds} sec fa` : `${Math.floor(hbSeconds / 60)} min fa`;
    }, 1000);

    // Simulate new signal arriving every 30 sec
    setInterval(() => {
        if (hasBackendAuth()) return;
        const pairs = ['XAUUSD', 'EURUSD', 'GBPJPY', 'USDJPY'];
        const dirs = ['BUY', 'SELL'];
        const pair = pairs[Math.floor(Math.random() * pairs.length)];
        const dir = dirs[Math.floor(Math.random() * dirs.length)];
        const newSig = {
            id: `SIG-${Math.floor(Math.random() * 1000)}`,
            pair, dir,
            entry: (Math.random() * 200 + 1.08).toFixed(5),
            sl: 0, tp1: 0, tp2: 0,
            lots: 0.10,
            time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
            status: 'queued'
        };
        signals.unshift(newSig);
        if (signals.length > 10) signals.pop();
        const active = document.querySelector('.view.active');
        if (active && active.id === 'view-signals') renderSignals();
    }, 30000);

    injectClientPlugAndPlayPanel();
    installStorageSync();
    if (shouldAutoPingApi()) pingApi().catch(() => { });
    enforceClientRoleGuard();
    if (!hasBackendAuth()) {
        window.switchView?.('overview');
        toast('Configura API URL e login dal Client Connect Center per usare il backend reale.', 'warning', 5200);
    }

    // Esponi token e apiBase al window per l'onboarding wizard
    window.SB_TOKEN = clientToken || '';
    window.SB_API_BASE = apiBase || '';

    syncClientOverviewFromBackend();
    syncClientEaFeedFromBackend();
    syncClientTradingStateFromBackend();
    setInterval(syncClientEaFeedFromBackend, 10000);
    setInterval(syncClientTradingStateFromBackend, 6000);
    setInterval(() => { if (shouldAutoPingApi()) pingApi().catch(() => { }); }, 20000);

    // Avvia wizard onboarding se il token è disponibile (attende 1s per il backend)
    if (hasBackendAuth()) {
        setTimeout(() => {
            if (typeof window.initOnboardingWizard === 'function') {
                window.initOnboardingWizard();
            }
        }, 1500);
    }

    // Bottone manuale apertura wizard nella top bar
    const topBar = document.querySelector('.top-bar-actions');
    if (topBar && !document.getElementById('btn-open-onboarding')) {
        const wizBtn = document.createElement('button');
        wizBtn.id = 'btn-open-onboarding';
        wizBtn.className = 'btn btn-secondary btn-sm';
        wizBtn.title = 'Apri wizard di configurazione';
        wizBtn.innerHTML = '🚀 Setup';
        wizBtn.addEventListener('click', () => {
            if (typeof window.openOnboardingWizard === 'function') window.openOnboardingWizard();
        });
        topBar.appendChild(wizBtn);
    }
});
