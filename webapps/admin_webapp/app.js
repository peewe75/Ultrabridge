document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_STORAGE_KEY = 'softibridge_api_base';
    const ADMIN_TOKEN_STORAGE_KEY = 'softibridge_admin_token';
    const PREVIEW_ADMIN_TOKEN_KEY = 'softi_admin_preview_token';

    function installStorageSync() {
        window.addEventListener('storage', (event) => {
            const watched = [API_BASE_STORAGE_KEY, ADMIN_TOKEN_STORAGE_KEY, PREVIEW_ADMIN_TOKEN_KEY];
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
    let adminToken = localStorage.getItem(PREVIEW_ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
    const clerkState = {
        checked: false,
        enabled: false,
        publishableKey: '',
        runtimeReady: false,
    };
    const dashboardRouteByRole = (role) => {
        if (role === 'SUPER_ADMIN') return '/dashboard/super-admin/';
        if (role === 'ADMIN_WL') return '/dashboard/admin/';
        if (role === 'CLIENT') return '/dashboard/client/';
        return '/landing/';
    };
    const persistAdminToken = (token) => {
        adminToken = token || '';
        if (adminToken) {
            localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, adminToken);
        } else {
            localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
        }
    };
    const setApiBase = (value) => {
        const normalized = normalizeApiBase(value);
        if (!normalized) throw new Error('URL API non valido');
        apiBase = normalized;
        localStorage.setItem(API_BASE_STORAGE_KEY, normalized);
        return normalized;
    };
    const hasBackendAuth = () => Boolean(adminToken);
    const apiFetch = async (path, opts = {}) => {
        const isFormData = opts.body instanceof FormData;
        const res = await fetch(`${apiBase}${path}`, {
            ...opts,
            headers: {
                ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
                ...(opts.headers || {}),
                ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {})
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
        if (!clerkState.enabled || !clerkState.runtimeReady) throw new Error('Clerk non configurato su backend');
        const attempt = await window.Clerk.client.signIn.create({ identifier: email, password });
        if (attempt.status !== 'complete') throw new Error('Login Clerk incompleto: verifica richiesta');
        await window.Clerk.setActive({ session: attempt.createdSessionId });
        const token = await window.Clerk.session?.getToken();
        if (!token) throw new Error('Token Clerk non disponibile');
        return token;
    };
    let adminToastStack = null;
    function toast(message, type = 'info', timeout = 3200) {
        if (!adminToastStack) {
            adminToastStack = document.createElement('div');
            adminToastStack.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:1200;display:flex;flex-direction:column;gap:10px;';
            document.body.appendChild(adminToastStack);
        }
        const el = document.createElement('div');
        const color = type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : type === 'error' ? '#ef4444' : '#00f2ff';
        el.style.cssText = `min-width:260px;max-width:440px;background:rgba(15,23,42,.95);border:1px solid rgba(255,255,255,.08);border-left:4px solid ${color};border-radius:12px;padding:.8rem .9rem;font-size:.86rem;color:#f8fafc;`;
        el.textContent = message;
        adminToastStack.appendChild(el);
        setTimeout(() => el.remove(), timeout);
    }

    function escapeHtml(v) {
        return String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function setApiStatusBadge(ok, text) {
        const status = document.querySelector('.status-indicator');
        if (!status) return;
        const dot = status.querySelector('.dot');
        const label = status.childNodes[status.childNodes.length - 1];
        if (dot) {
            dot.classList.toggle('online', !!ok);
            dot.style.background = ok ? '' : '#f59e0b';
            dot.style.boxShadow = ok ? '' : '0 0 10px #f59e0b';
        }
        if (label && label.nodeType === Node.TEXT_NODE) {
            label.textContent = ` ${text}`;
        } else {
            const txt = Array.from(status.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
            if (txt) txt.textContent = ` ${text}`;
        }
    }

    async function pingApi() {
        try {
            const data = await apiFetch('/health');
            setApiStatusBadge(true, `API Cloud: Online (${data.status || 'ok'})`);
            return { ok: true, data };
        } catch (err) {
            setApiStatusBadge(false, 'API Cloud: Offline / non raggiungibile');
            throw err;
        }
    }

    function getAdminPpInputs() {
        const q = (id) => document.getElementById(id);
        return {
            apiBase: q('pp-admin-api-base')?.value?.trim() || apiBase,
            loginEmail: q('pp-admin-login-email')?.value?.trim() || '',
            loginPassword: q('pp-admin-login-password')?.value || '',
            smtpTestEmail: q('pp-admin-smtp-test-email')?.value?.trim() || '',
            payload: {
                telegram: {
                    bot_username: q('pp-tg-username')?.value?.trim() || '@softibridge',
                    bot_token: q('pp-tg-token')?.value?.trim() || '',
                    mode: q('pp-tg-mode')?.value || 'webhook',
                    webhook_url: q('pp-tg-webhook-url')?.value?.trim() || '',
                    webhook_secret: q('pp-tg-webhook-secret')?.value?.trim() || '',
                    admin_super_chat_id: q('pp-tg-admin-chat')?.value?.trim() || '',
                },
                stripe: {
                    secret_key: q('pp-stripe-secret')?.value?.trim() || '',
                    publishable_key: q('pp-stripe-pub')?.value?.trim() || '',
                    webhook_secret: q('pp-stripe-wh-secret')?.value?.trim() || '',
                    success_url: q('pp-stripe-success')?.value?.trim() || '',
                    cancel_url: q('pp-stripe-cancel')?.value?.trim() || '',
                    billing_portal_return_url: q('pp-stripe-portal-return')?.value?.trim() || '',
                },
                smtp: {
                    host: q('pp-smtp-host')?.value?.trim() || '',
                    port: q('pp-smtp-port')?.value?.trim() || '',
                    user: q('pp-smtp-user')?.value?.trim() || '',
                    password: q('pp-smtp-pass')?.value || '',
                    from_email: q('pp-smtp-from-email')?.value?.trim() || '',
                    from_name: q('pp-smtp-from-name')?.value?.trim() || '',
                    use_tls: !!q('pp-smtp-tls')?.checked,
                },
                billing: {
                    invoice_issuer_name: q('pp-bill-issuer')?.value?.trim() || '',
                    invoice_issuer_country: q('pp-bill-country')?.value?.trim() || 'IT',
                    invoice_issuer_vat_id: q('pp-bill-vat')?.value?.trim() || '',
                    invoice_series: q('pp-bill-series')?.value?.trim() || 'A',
                },
                bank: {
                    account_name: q('pp-bank-account-name')?.value?.trim() || '',
                    bank_name: q('pp-bank-name')?.value?.trim() || '',
                    iban: q('pp-bank-iban')?.value?.trim() || '',
                    bic_swift: q('pp-bank-bic')?.value?.trim() || '',
                    reason_template: q('pp-bank-reason')?.value?.trim() || 'SOFTIBRIDGE {invoice_number}',
                },
                usdt: {
                    wallet_address: q('pp-usdt-wallet')?.value?.trim() || '',
                    network_label: q('pp-usdt-network')?.value?.trim() || 'TRC20',
                    price_buffer_pct: q('pp-usdt-buffer')?.value?.trim() || '1.0',
                },
                bridge: {
                    file_bridge_base: q('pp-bridge-base')?.value?.trim() || '',
                }
            }
        };
    }

    function fillAdminSetupForm(current) {
        if (!current) return;
        const set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined && val !== null) el.value = String(val); };
        const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
        set('pp-admin-api-base', apiBase);
        set('pp-tg-username', current.telegram?.bot_username || '@softibridge');
        set('pp-tg-token', current.telegram?.bot_token || '');
        set('pp-tg-mode', current.telegram?.mode || 'webhook');
        set('pp-tg-webhook-url', current.telegram?.webhook_url || '');
        set('pp-tg-webhook-secret', current.telegram?.webhook_secret || '');
        set('pp-tg-admin-chat', current.telegram?.admin_super_chat_id || '');
        set('pp-stripe-secret', current.stripe?.secret_key || '');
        set('pp-stripe-pub', current.stripe?.publishable_key || '');
        set('pp-stripe-wh-secret', current.stripe?.webhook_secret || '');
        set('pp-stripe-success', current.stripe?.success_url || '');
        set('pp-stripe-cancel', current.stripe?.cancel_url || '');
        set('pp-stripe-portal-return', current.stripe?.billing_portal_return_url || '');
        set('pp-smtp-host', current.smtp?.host || '');
        set('pp-smtp-port', current.smtp?.port || 587);
        set('pp-smtp-user', current.smtp?.user || '');
        set('pp-smtp-pass', current.smtp?.password || '');
        set('pp-smtp-from-email', current.smtp?.from_email || '');
        set('pp-smtp-from-name', current.smtp?.from_name || 'SoftiBridge');
        setChk('pp-smtp-tls', current.smtp?.use_tls !== false);
        set('pp-bill-issuer', current.billing?.invoice_issuer_name || '');
        set('pp-bill-country', current.billing?.invoice_issuer_country || 'IT');
        set('pp-bill-vat', current.billing?.invoice_issuer_vat_id || '');
        set('pp-bill-series', current.billing?.invoice_series || 'A');
        set('pp-bank-account-name', current.bank?.account_name || '');
        set('pp-bank-name', current.bank?.bank_name || '');
        set('pp-bank-iban', current.bank?.iban || '');
        set('pp-bank-bic', current.bank?.bic_swift || '');
        set('pp-bank-reason', current.bank?.reason_template || 'SOFTIBRIDGE {invoice_number}');
        set('pp-usdt-wallet', current.usdt?.wallet_address || '');
        set('pp-usdt-network', current.usdt?.network_label || 'TRC20');
        set('pp-usdt-buffer', current.usdt?.price_buffer_pct ?? 1.0);
        set('pp-bridge-base', current.bridge?.file_bridge_base || '');
    }

    function renderSetupStatus(status) {
        const el = document.getElementById('pp-admin-setup-status');
        if (!el) return;
        if (!status) {
            el.innerHTML = '<span style="color:var(--text-dim)">Nessun dato setup caricato.</span>';
            return;
        }
        const badge = (ok, label) => `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.02);font-size:.78rem;"><span style="width:7px;height:7px;border-radius:50%;background:${ok ? '#10b981' : '#f59e0b'}"></span>${escapeHtml(label)}</span>`;
        el.innerHTML = `
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
                ${badge(status.telegram?.bot_token_configured, 'Telegram Token')}
                ${badge(status.telegram?.admin_super_chat_id_configured, 'Admin Chat ID')}
                ${badge(status.telegram?.webhook_url, 'Telegram Webhook URL')}
                ${badge(status.stripe?.secret_key_configured, 'Stripe Secret')}
                ${badge(status.stripe?.webhook_secret_configured, 'Stripe Webhook Secret')}
                ${badge(status.security?.jwt_secret_configured, 'JWT Secret')}
                ${badge(status.security?.ea_hmac_secret_configured, 'EA HMAC Secret')}
                ${badge(status.bridge_files?.configured, 'Bridge Path')}
            </div>
        `;
    }

    async function adminPpTestConnection() {
        try {
            const q = document.getElementById('pp-admin-api-base');
            if (q?.value?.trim()) setApiBase(q.value.trim());
            const res = await pingApi();
            toast(`API raggiungibile su ${apiBase}`, 'success');
            const out = document.getElementById('pp-admin-conn-output');
            if (out) out.textContent = `OK /health -> ${JSON.stringify(res.data)}`;
        } catch (err) {
            toast(`Connessione API fallita: ${err.message}`, 'error', 5000);
            const out = document.getElementById('pp-admin-conn-output');
            if (out) out.textContent = `ERRORE: ${err.message}`;
        }
    }

    async function adminPpLogin(registerFirst = false) {
        const vals = getAdminPpInputs();
        if (!vals.loginEmail || !vals.loginPassword) {
            toast('Inserisci email e password admin', 'warning');
            return;
        }
        try {
            setApiBase(vals.apiBase);
            const provider = await initClerkProvider();
            if (provider.enabled) {
                if (registerFirst) {
                    toast('Creazione ADMIN_WL gestita dal Super Admin. Usa solo login Clerk.', 'warning', 4200);
                    return;
                }
                const clerkToken = await clerkEmailPasswordLogin(vals.loginEmail, vals.loginPassword);
                persistAdminToken(clerkToken);
                localStorage.setItem(PREVIEW_ADMIN_TOKEN_KEY, clerkToken);
                toast('Login admin Clerk riuscito. Token salvato localmente.', 'success');
                document.getElementById('pp-admin-token-status')?.replaceChildren(document.createTextNode('Token Clerk attivo'));
                await adminPpLoadSetup();
                syncAdminFromBackend();
                return;
            }
            if (registerFirst) {
                try {
                    await apiFetch('/auth/register', {
                        method: 'POST',
                        body: JSON.stringify({ email: vals.loginEmail, password: vals.loginPassword, role: 'ADMIN_WL' }),
                    });
                } catch (_) { }
            }
            const tok = await apiFetch('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email: vals.loginEmail, password: vals.loginPassword }),
            });
            persistAdminToken(tok.access_token);
            localStorage.setItem(PREVIEW_ADMIN_TOKEN_KEY, tok.access_token);
            toast('Login admin riuscito. Token salvato localmente.', 'success');
            document.getElementById('pp-admin-token-status')?.replaceChildren(document.createTextNode(`Token attivo (${(tok.expires_in || 0)}s)`));
            await adminPpLoadSetup();
            syncAdminFromBackend();
        } catch (err) {
            toast(`Login admin fallito: ${err.message}`, 'error', 4500);
        }
    }

    async function adminPpBootstrapDemo() {
        try {
            const q = document.getElementById('pp-admin-api-base');
            if (q?.value?.trim()) setApiBase(q.value.trim());
            const data = await apiFetch('/demo/bootstrap', { method: 'POST' });
            if (!data?.ok || !data.admin?.token) throw new Error(data?.error || 'Bootstrap demo non disponibile');
            persistAdminToken(data.admin.token);
            localStorage.setItem(PREVIEW_ADMIN_TOKEN_KEY, data.admin.token);
            const em = document.getElementById('pp-admin-login-email');
            const pw = document.getElementById('pp-admin-login-password');
            if (em) em.value = data.admin.email || '';
            if (pw) pw.value = data.admin.password || '';
            toast('Demo bootstrap completato: token admin caricato', 'success');
            await adminPpLoadSetup();
            syncAdminFromBackend();
        } catch (err) {
            toast(`Bootstrap demo fallito: ${err.message}`, 'error', 4500);
        }
    }

    async function adminPpWhoAmI() {
        if (!hasBackendAuth()) {
            toast('Login admin richiesto', 'warning');
            return;
        }
        try {
            const me = await apiFetch('/auth/me');
            if (me.role !== 'SUPER_ADMIN') {
                persistAdminToken('');
                localStorage.removeItem(PREVIEW_ADMIN_TOKEN_KEY);
                toast(`Ruolo ${me.role} non valido per dashboard Super Admin. Reindirizzamento...`, 'warning', 2800);
                window.location.href = dashboardRouteByRole(me.role);
                return;
            }
            document.getElementById('pp-admin-token-status')?.replaceChildren(document.createTextNode(`Token attivo · ${me.email} · ${me.role}`));
            toast(`Auth OK: ${me.email} (${me.role})`, 'success');
        } catch (err) {
            toast(`Token non valido: ${err.message}`, 'warning', 4000);
        }
    }

    async function enforceSuperAdminRoleGuard() {
        if (!hasBackendAuth()) return;
        try {
            const me = await apiFetch('/auth/me');
            if (me.role !== 'SUPER_ADMIN') {
                persistAdminToken('');
                localStorage.removeItem(PREVIEW_ADMIN_TOKEN_KEY);
                window.location.href = dashboardRouteByRole(me.role);
            }
        } catch (_) {
        }
    }

    function adminPpLogout() {
        persistAdminToken('');
        localStorage.removeItem(PREVIEW_ADMIN_TOKEN_KEY);
        document.getElementById('pp-admin-token-status')?.replaceChildren(document.createTextNode('Token non presente'));
        toast('Logout admin eseguito', 'info');
    }

    async function adminPpLoadSetup() {
        try {
            await pingApi();
        } catch (_) { }
        try {
            const status = await apiFetch('/setup/status');
            renderSetupStatus(status);
        } catch (err) {
            renderSetupStatus(null);
            const out = document.getElementById('pp-admin-setup-note');
            if (out) out.textContent = `Setup status non disponibile: ${err.message}`;
            return;
        }
        if (!hasBackendAuth()) return;
        try {
            const current = await apiFetch('/setup/config/current');
            fillAdminSetupForm(current);
            const out = document.getElementById('pp-admin-setup-note');
            if (out) out.textContent = `Configurazione caricata dal backend (${current?.meta?.env_path || '.env'}).`;
        } catch (err) {
            const out = document.getElementById('pp-admin-setup-note');
            if (out) out.textContent = `Login OK ma caricamento config fallito: ${err.message}`;
        }
    }

    async function adminPpSaveSetup() {
        if (!hasBackendAuth()) {
            toast('Prima fai login admin', 'warning');
            return;
        }
        try {
            const vals = getAdminPpInputs();
            setApiBase(vals.apiBase);
            const res = await apiFetch('/setup/config/save', {
                method: 'POST',
                body: JSON.stringify(vals.payload),
            });
            toast('Configurazione backend salvata su .env', 'success');
            const out = document.getElementById('pp-admin-setup-note');
            if (out) out.textContent = `${res.message || 'Configurazione salvata.'}`;
            await adminPpLoadSetup();
        } catch (err) {
            toast(`Salvataggio setup fallito: ${err.message}`, 'error', 5000);
        }
    }

    async function adminPpTelegramCheck() {
        if (!hasBackendAuth()) return toast('Login admin richiesto', 'warning');
        try {
            const res = await apiFetch('/setup/telegram/check', { method: 'POST' });
            const out = document.getElementById('pp-admin-conn-output');
            out && (out.textContent = JSON.stringify(res, null, 2));
            toast(res.ok ? 'Telegram check OK' : `Telegram check KO: ${res.error || 'errore'}`, res.ok ? 'success' : 'warning');
        } catch (err) {
            toast(`Telegram check fallito: ${err.message}`, 'error', 5000);
        }
    }

    async function adminPpTelegramSetWebhook() {
        if (!hasBackendAuth()) return toast('Login admin richiesto', 'warning');
        try {
            const res = await apiFetch('/setup/telegram/set-webhook', { method: 'POST' });
            const out = document.getElementById('pp-admin-conn-output');
            out && (out.textContent = JSON.stringify(res, null, 2));
            toast(res.ok ? 'Webhook Telegram impostato' : `Webhook KO: ${res.error || 'errore'}`, res.ok ? 'success' : 'warning');
        } catch (err) {
            toast(`Set webhook fallito: ${err.message}`, 'error', 5000);
        }
    }

    async function adminPpSmtpTest() {
        if (!hasBackendAuth()) return toast('Login admin richiesto', 'warning');
        const toEmail = (document.getElementById('pp-admin-smtp-test-email')?.value || '').trim();
        if (!toEmail) return toast('Inserisci email test SMTP', 'warning');
        try {
            const res = await apiFetch(`/setup/smtp/test?to_email=${encodeURIComponent(toEmail)}`, { method: 'POST' });
            const out = document.getElementById('pp-admin-conn-output');
            out && (out.textContent = JSON.stringify(res, null, 2));
            toast(res.ok ? (res.simulated ? 'SMTP simulato (non configurato)' : 'SMTP test inviato') : `SMTP KO: ${res.error || 'errore'}`, res.ok ? 'success' : 'warning');
        } catch (err) {
            toast(`SMTP test fallito: ${err.message}`, 'error', 5000);
        }
    }

    function injectAdminPlugAndPlayCenter() {
        const settingsCard = document.querySelector('#view-settings .glass-card');
        if (!settingsCard || document.getElementById('admin-plugplay-center')) return;
        const wrap = document.createElement('div');
        wrap.id = 'admin-plugplay-center';
        wrap.className = 'glass-card';
        wrap.style.marginBottom = '1.25rem';
        wrap.style.border = '1px solid rgba(0,242,255,0.25)';
        wrap.style.boxShadow = '0 0 0 1px rgba(0,242,255,0.08) inset';
        wrap.innerHTML = `
            <div style="display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; flex-wrap:wrap;">
                <div>
                    <h2 style="margin:0 0 .3rem 0;">🔌 Plug&Play Setup Center (Admin)</h2>
                    <p style="margin:0; color:var(--text-dim); font-size:.9rem;">Configura URL API, login admin e servizi (Telegram / Stripe / SMTP / Billing) senza passare da file o /preview.</p>
                </div>
                <div style="display:flex; gap:.5rem; flex-wrap:wrap;">
                    <button class="btn btn-secondary btn-sm" onclick="softiAdminPpOpenSettings()">Apri Setup</button>
                    <button class="btn btn-secondary btn-sm" onclick="softiAdminPpTestConnection()">Test API</button>
                    <button class="btn btn-primary btn-sm" onclick="softiAdminPpLoadSetup()">Ricarica Setup</button>
                </div>
            </div>
            <div style="display:grid; grid-template-columns:1.15fr .85fr; gap:1rem; margin-top:1rem;">
                <div class="glass" style="padding:1rem; border-radius:12px;">
                    <h3 style="margin:0 0 .8rem 0;">1) API + Login Admin</h3>
                    <div style="display:grid; grid-template-columns:1fr auto; gap:.6rem;">
                        <input id="pp-admin-api-base" type="text" placeholder="https://api.tuodominio.com/api" value="${escapeHtml(apiBase)}" style="padding:.65rem .75rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                        <button class="btn btn-secondary btn-sm" onclick="softiAdminPpSaveApiBase()">Salva URL</button>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:.6rem; margin-top:.6rem;">
                        <input id="pp-admin-login-email" type="email" placeholder="admin@dominio.com" style="padding:.65rem .75rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                        <input id="pp-admin-login-password" type="password" placeholder="Password" style="padding:.65rem .75rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                    </div>
                    <div style="display:flex; gap:.5rem; flex-wrap:wrap; margin-top:.6rem;">
                        <button class="btn btn-primary btn-sm" onclick="softiAdminPpLogin()">Login Admin</button>
                        <button class="btn btn-secondary btn-sm" onclick="softiAdminPpRegister()">Registra+Login</button>
                        <button class="btn btn-secondary btn-sm" onclick="softiAdminPpWhoAmI()">Verifica Token</button>
                        <button class="btn btn-secondary btn-sm" onclick="softiAdminPpBootstrapDemo()">Bootstrap Demo</button>
                        <button class="btn btn-secondary btn-sm" onclick="softiAdminPpLogout()">Logout</button>
                    </div>
                    <div id="pp-admin-token-status" style="margin-top:.65rem; color:var(--text-dim); font-size:.85rem;">${hasBackendAuth() ? 'Token rilevato (salvato localmente)' : 'Token non presente'}</div>
                </div>
                <div class="glass" style="padding:1rem; border-radius:12px;">
                    <h3 style="margin:0 0 .8rem 0;">2) Diagnostica & Test Servizi</h3>
                    <div id="pp-admin-setup-status" style="margin-bottom:.75rem;"></div>
                    <div style="display:flex; gap:.5rem; flex-wrap:wrap;">
                        <button class="btn btn-secondary btn-sm" onclick="softiAdminPpTelegramCheck()">Test Telegram</button>
                        <button class="btn btn-secondary btn-sm" onclick="softiAdminPpTelegramWebhook()">Set Webhook</button>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr auto; gap:.5rem; margin-top:.75rem;">
                        <input id="pp-admin-smtp-test-email" type="email" placeholder="email test SMTP" style="padding:.65rem .75rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                        <button class="btn btn-secondary btn-sm" onclick="softiAdminPpSmtpTest()">Test SMTP</button>
                    </div>
                    <pre id="pp-admin-conn-output" style="margin-top:.75rem; min-height:120px; max-height:220px; overflow:auto; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:.75rem; color:#cbd5e1; font-size:.75rem;">Pronto.</pre>
                    <p id="pp-admin-setup-note" style="margin-top:.65rem; color:var(--text-dim); font-size:.82rem;">Usa “Ricarica Setup” per leggere stato e configurazione corrente dal backend.</p>
                </div>
            </div>
            <div style="margin-top:1rem;">
                <details open style="border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:.9rem; background:rgba(255,255,255,.02);">
                    <summary style="cursor:pointer; font-weight:600;">3) Configurazione Server (Telegram / Stripe / Billing / Bonifico / USDT / Bridge)</summary>
                    <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; margin-top:.9rem;">
                        <div class="glass" style="padding:.8rem; border-radius:10px;">
                            <h4 style="margin:0 0 .5rem 0;">Telegram</h4>
                            <input id="pp-tg-username" type="text" placeholder="@softibridge" style="width:100%; margin-bottom:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <input id="pp-tg-token" type="text" placeholder="BOT_TOKEN" style="width:100%; margin-bottom:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <select id="pp-tg-mode" style="width:100%; margin-bottom:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;"><option value="webhook">webhook</option><option value="polling">polling</option></select>
                            <input id="pp-tg-webhook-url" type="text" placeholder="https://api.tuodominio.com/api/telegram/webhook" style="width:100%; margin-bottom:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <input id="pp-tg-webhook-secret" type="text" placeholder="Webhook secret (consigliato)" style="width:100%; margin-bottom:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <input id="pp-tg-admin-chat" type="text" placeholder="Admin chat ID" style="width:100%; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                        </div>
                        <div class="glass" style="padding:.8rem; border-radius:10px;">
                            <h4 style="margin:0 0 .5rem 0;">Stripe</h4>
                            <input id="pp-stripe-secret" type="text" placeholder="STRIPE_SECRET_KEY" style="width:100%; margin-bottom:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <input id="pp-stripe-pub" type="text" placeholder="STRIPE_PUBLISHABLE_KEY" style="width:100%; margin-bottom:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <input id="pp-stripe-wh-secret" type="text" placeholder="STRIPE_WEBHOOK_SECRET" style="width:100%; margin-bottom:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <input id="pp-stripe-success" type="text" placeholder="https://app.tuodominio.com/client?checkout=success" style="width:100%; margin-bottom:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <input id="pp-stripe-cancel" type="text" placeholder="https://app.tuodominio.com/client?checkout=cancel" style="width:100%; margin-bottom:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <input id="pp-stripe-portal-return" type="text" placeholder="Billing portal return URL" style="width:100%; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                        </div>
                        <div class="glass" style="padding:.8rem; border-radius:10px;">
                            <h4 style="margin:0 0 .5rem 0;">SMTP & Billing</h4>
                            <div style="display:grid; grid-template-columns:1fr 100px; gap:.45rem;">
                                <input id="pp-smtp-host" type="text" placeholder="SMTP host" style="padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                                <input id="pp-smtp-port" type="number" placeholder="587" value="587" style="padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            </div>
                            <input id="pp-smtp-user" type="text" placeholder="SMTP user" style="width:100%; margin-top:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <input id="pp-smtp-pass" type="password" placeholder="SMTP password" style="width:100%; margin-top:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <input id="pp-smtp-from-email" type="email" placeholder="no-reply@tuodominio.com" style="width:100%; margin-top:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <input id="pp-smtp-from-name" type="text" placeholder="SoftiBridge" style="width:100%; margin-top:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <label style="display:flex; gap:.45rem; align-items:center; margin-top:.45rem; color:var(--text-dim); font-size:.82rem;"><input id="pp-smtp-tls" type="checkbox" checked> Usa TLS</label>
                            <div style="height:.5rem;"></div>
                            <input id="pp-bill-issuer" type="text" placeholder="Ragione sociale" style="width:100%; margin-top:.1rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <div style="display:grid; grid-template-columns:100px 1fr 100px; gap:.45rem; margin-top:.45rem;">
                                <input id="pp-bill-country" type="text" placeholder="IT" value="IT" style="padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                                <input id="pp-bill-vat" type="text" placeholder="P.IVA / VAT ID" style="padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                                <input id="pp-bill-series" type="text" placeholder="A" value="A" style="padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            </div>
                        </div>
                        <div class="glass" style="padding:.8rem; border-radius:10px;">
                            <h4 style="margin:0 0 .5rem 0;">Bonifico / USDT / Bridge</h4>
                            <input id="pp-bank-account-name" type="text" placeholder="Intestatario conto" style="width:100%; margin-bottom:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <input id="pp-bank-name" type="text" placeholder="Nome banca" style="width:100%; margin-bottom:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <input id="pp-bank-iban" type="text" placeholder="IBAN" style="width:100%; margin-bottom:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <input id="pp-bank-bic" type="text" placeholder="BIC/SWIFT" style="width:100%; margin-bottom:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <input id="pp-bank-reason" type="text" placeholder="SOFTIBRIDGE {invoice_number}" style="width:100%; margin-bottom:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <input id="pp-usdt-wallet" type="text" placeholder="Wallet USDT TRON" style="width:100%; margin-bottom:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            <div style="display:grid; grid-template-columns:1fr 120px; gap:.45rem;">
                                <input id="pp-usdt-network" type="text" value="TRC20" placeholder="TRC20" style="padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                                <input id="pp-usdt-buffer" type="number" step="0.1" value="1.0" placeholder="1.0" style="padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                            </div>
                            <input id="pp-bridge-base" type="text" placeholder="/opt/softibridge/softibridge (cartella bridge EA)" style="width:100%; margin-top:.45rem; padding:.55rem .65rem; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); color:white; border-radius:8px;">
                        </div>
                    </div>
                    <div style="display:flex; gap:.6rem; flex-wrap:wrap; margin-top:1rem;">
                        <button class="btn btn-primary" onclick="softiAdminPpSaveSetup()">💾 Salva Configurazione Backend</button>
                        <button class="btn btn-secondary" onclick="softiAdminPpLoadSetup()">↻ Rileggi Config</button>
                    </div>
                    <p style="margin-top:.6rem; color:var(--text-dim); font-size:.82rem;">Il backend ricarica la config in memoria dopo il salvataggio, ma un riavvio resta consigliato in produzione dopo modifiche sensibili.</p>
                </details>
            </div>
        `;
        settingsCard.prepend(wrap);

        const topBarActions = document.querySelector('.top-bar-actions');
        if (topBarActions && !document.getElementById('pp-admin-open-setup-btn')) {
            topBarActions.style.flexWrap = 'wrap';
            const btn = document.createElement('button');
            btn.id = 'pp-admin-open-setup-btn';
            btn.className = 'btn btn-secondary btn-sm';
            btn.textContent = '🔌 Setup Plug&Play';
            btn.addEventListener('click', () => {
                navigateToView('settings', { updateHash: true });
                setTimeout(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
            });
            topBarActions.prepend(btn);
        }
    }

    window.softiAdminPpOpenSettings = () => {
        navigateToView('settings', { updateHash: true });
        document.getElementById('admin-plugplay-center')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.softiAdminPpSaveApiBase = () => {
        try {
            const el = document.getElementById('pp-admin-api-base');
            const url = setApiBase(el?.value || '');
            if (el) el.value = url;
            toast(`API URL salvato: ${url}`, 'success');
        } catch (err) {
            toast(`URL API non valido: ${err.message}`, 'warning');
        }
    };
    window.softiAdminPpTestConnection = adminPpTestConnection;
    window.softiAdminPpLogin = () => adminPpLogin(false);
    window.softiAdminPpRegister = () => adminPpLogin(true);
    window.softiAdminPpBootstrapDemo = adminPpBootstrapDemo;
    window.softiAdminPpWhoAmI = adminPpWhoAmI;
    window.softiAdminPpLogout = adminPpLogout;
    window.softiAdminPpLoadSetup = adminPpLoadSetup;
    window.softiAdminPpSaveSetup = adminPpSaveSetup;
    window.softiAdminPpTelegramCheck = adminPpTelegramCheck;
    window.softiAdminPpTelegramWebhook = adminPpTelegramSetWebhook;
    window.softiAdminPpSmtpTest = adminPpSmtpTest;

    const navItems = document.querySelectorAll('.nav-item');
    const viewTitle = document.getElementById('view-title');
    const viewSubtitle = document.getElementById('view-subtitle');
    const viewScopeBadge = document.getElementById('view-scope-badge');
    const addLicenseBtn = document.getElementById('add-license-btn');
    const triggerBackupBtn = document.getElementById('trigger-backup-btn');
    const mainContent = document.querySelector('.main-content');
    const modal = document.getElementById('license-modal');
    const closeModal = document.querySelector('.closeModal');
    const licenseForm = document.getElementById('license-form');
    const openModalFromLicensesBtn = document.getElementById('open-modal-from-licenses-btn');

    const viewMeta = {
        dashboard: {
            kicker: '👑 Super Admin',
            title: 'Dashboard operativo L0',
            desc: 'Vista riepilogativa pulita per controllo stato sistema, KPI commerciali, alert e attività recenti. Qui controlli la salute dell’ecosistema prima di entrare nel dettaglio.',
            leftTitle: 'Cosa controlli qui',
            left: ['KPI globali licenze/clienti/revenue', 'Stato operativo generale e alert', 'Trend iscrizioni e attività', 'Accesso rapido alle sezioni critiche'],
            rightTitle: 'Uso consigliato',
            right: ['Apri all’inizio giornata', 'Verifica alert e scadenze', 'Poi entra in Revenue / White Label / Fatturazione']
        },
        revenue: {
            kicker: '💰 Finance L0',
            title: 'Revenue Ledger & Split',
            desc: 'Sezione dedicata esclusivamente ai flussi economici: vendite, split L0/L1/L2, variazioni e storico movimenti. Niente CRM qui, solo numeri e riconciliazione.',
            leftTitle: 'Funzioni principali',
            left: ['Ledger revenue per licenza/piano', 'Split L0 / L1 / L2 per vendita', 'Monitoraggio performance economica', 'Base per payout e rendicontazione'],
            rightTitle: 'Azioni tipiche',
            right: ['Controllo importi e split', 'Verifica trend ricavi', 'Passaggio a Payout / Fatturazione fee']
        },
        whitelabels: {
            kicker: '🏢 Network L1',
            title: 'Gestione Admin White Label',
            desc: 'Area completa per creare, configurare, sospendere e monitorare gli Admin WL (L1), con brand, fee, volume e dettaglio affiliati collegati.',
            leftTitle: 'Gestione L1',
            left: ['Crea nuovo Admin WL', 'Configura fee L1', 'Monitora volumi e stato', 'Apri dettaglio con affiliati collegati'],
            rightTitle: 'Rendicontazione',
            right: ['Volume per brand', 'Profitto L0 da WL', 'Numero affiliati per admin']
        },
        affiliation: {
            kicker: '📣 Network L2',
            title: 'Gestione Affiliazione (L2)',
            desc: 'Registro dedicato agli affiliati L2 con referral code, stato, fee maturate e strumenti di gestione. Sezione separata dal resto per evitare confusione operativa.',
            leftTitle: 'Controlli L2',
            left: ['Registro affiliati per Admin WL', 'Referral code e stato', 'Fee maturate e audit', 'Azioni rapide su singolo affiliato'],
            rightTitle: 'Uso',
            right: ['Verifica attivi/inattivi', 'Controlla fee maturate', 'Allinea payout con la sezione dedicata']
        },
        vps: {
            kicker: '🖥️ Infrastructure',
            title: 'VPS Status & Allocazioni',
            desc: 'Sezione infrastruttura separata per tenere sotto controllo server, allocazioni licenze/clienti, uso risorse e stato operativo senza mescolare la parte commerciale.',
            leftTitle: 'Controlli VPS',
            left: ['Stato VPS online/provisioning', 'Allocazioni clienti/licenze', 'Carico CPU/RAM', 'Azioni operative rapide'],
            rightTitle: 'Uso',
            right: ['Controllo capacità', 'Provisioning nuovi nodi', 'Diagnostica rapida']
        },
        'fee-rules': {
            kicker: '🧮 Rules Engine',
            title: 'Regole Fee Network',
            desc: 'Configurazione centralizzata delle regole di split e simulatore margine per il network. Questa sezione serve solo a policy e simulazioni.',
            leftTitle: 'Configura',
            left: ['Fee L0/L1/L2 default', 'Regole standard di rete', 'Simulazione split per vendita'],
            rightTitle: 'Best practice',
            right: ['Aggiorna policy qui', 'Valida con simulatore', 'Poi applica in payout/fatture']
        },
        'fee-payouts': {
            kicker: '💸 Operations',
            title: 'Pagamenti Fee / Payout Queue',
            desc: 'Coda operativa dei pagamenti fee L1/L2 (commissioni network) con batch e stati di avanzamento. Solo commissioni qui, senza pagamenti clienti.',
            leftTitle: 'Payout network',
            left: ['Queue payout L1/L2', 'Batch payout', 'Stati pending/paid/review', 'Storico operativo'],
            rightTitle: 'Uso',
            right: ['Controlla importi maturati', 'Esegui batch payout', 'Marca pagato / on hold', 'Riconcilia con revenue']
        },
        'fee-invoices': {
            kicker: '🧾 Billing',
            title: 'Fatture & Pagamenti (Billing)',
            desc: 'Area dedicata a documenti fiscali (PROFORMA/FATTURA) e archivio pagamenti clienti (Bonifico/USDT/Stripe). Tutto il billing in una sola sezione pulita.',
            leftTitle: 'Creazione & gestione',
            left: ['Crea PROFORMA / FATTURA', 'Filtra per stato/metodo/documento', 'Invia al cliente', 'Crea link pagamento Stripe'],
            rightTitle: 'Workflow',
            right: ['Documento emesso', 'Invio', 'Pagamento/Verifica', 'Stato aggiornato e audit']
        },
        settings: {
            kicker: '⚙️ Config',
            title: 'Settings & Setup',
            desc: 'Configurazione globale piattaforma (fee standard, toggle livelli, setup connessioni) e centro Plug&Play per API, Telegram, Stripe e SMTP.',
            leftTitle: 'Configurazioni globali',
            left: ['Fee standard e policy', 'Abilitazioni livelli L1/L2', 'Setup piattaforma'],
            rightTitle: 'Plug&Play Center',
            right: ['API URL', 'Login Admin', 'Telegram', 'Stripe', 'SMTP']
        },
        licenses: {
            kicker: '🎟️ CRM Operativo',
            title: 'Gestione Licenze',
            desc: 'Pannello dedicato alle licenze: creazione, stato, account MT4/MT5, scadenze, upgrade, revoca e remote kill. Separato dal CRM clienti per massima chiarezza.',
            leftTitle: 'Azioni licenza',
            left: ['Crea nuova licenza', 'Upgrade piano', 'Revoca / Remote Kill', 'Monitoraggio scadenze'],
            rightTitle: 'Controlli',
            right: ['Stato', 'Scadenza', 'Install ID', 'Account associati']
        },
        clients: {
            kicker: '👤 CRM',
            title: 'Database Clienti',
            desc: 'Vista CRM separata per anagrafica clienti, contatti, licenze associate, scadenze e stato. È il pannello operativo per supporto e assistenza commerciale.',
            leftTitle: 'CRM clienti',
            left: ['Ricerca clienti', 'Nuovo cliente + licenza', 'Stato e scadenza', 'Contatti Telegram/email'],
            rightTitle: 'Uso',
            right: ['Supporto clienti', 'Verifica rinnovi', 'Controllo attività e piano']
        },
        logs: {
            kicker: '📜 Audit',
            title: 'Audit Logs & Sicurezza',
            desc: 'Tutti gli eventi di sistema, bot, EA, billing e azioni admin in una vista log separata. Serve per debug, audit e controllo sicurezza.',
            leftTitle: 'Log disponibili',
            left: ['Eventi sistema', 'Azioni admin', 'Eventi bridge/EA', 'Trace sicurezza'],
            rightTitle: 'Azioni',
            right: ['Filtra log', 'Esporta kill list', 'Diagnostica rapida']
        }
    };

    const viewAliases = {
        'super-licenses': 'licenses',
        'super-invoices': 'fee-invoices',
        'super-admin-manage': 'whitelabels',
        'super-admin-billing': 'billing-admin',
        'super-admin-fee-report': 'revenue',
        'super-admin-payments': 'admin-billing-payments',
        'super-commissions': 'revenue',
        'super-vps': 'vps',
        'super-admin-clients': 'whitelabels',
        'admin-control': 'whitelabels',
        'admin-register': 'whitelabels',
        'admin-clients': 'clients',
        'admin-payments': 'fee-payouts',
        'aff-clients': 'affiliation',
        'aff-client-fee': 'fee-invoices',
    };

    const viewTitleMap = {
        dashboard: 'Dashboard',
        licenses: 'Licenze',
        'super-licenses': 'Super Admin · Gestione Licenze',
        'fee-invoices': 'Fatture & Pagamenti',
        'super-invoices': 'Super Admin · Fatture',
        'super-admin-manage': 'Super Admin · Gestione Admin',
        'billing-admin': 'Billing Admin',
        'super-admin-billing': 'Super Admin · Fatturazione Admin',
        revenue: 'Revenue Ledger',
        'super-admin-fee-report': 'Super Admin · Report Fee Admin',
        'super-commissions': 'Super Admin · Report Fee Admin',
        'admin-billing-payments': 'Pagamenti Admin',
        'super-admin-payments': 'Super Admin · Pagamenti Admin',
        vps: 'VPS',
        'super-vps': 'Super Admin · VPS',
        whitelabels: 'White Labels',
        'super-admin-clients': 'Super Admin · Clienti per Admin',
        'admin-control': 'Admin · Controllo Admin',
        'admin-register': 'Admin · Registrazione Admin',
        clients: 'Clienti',
        'admin-clients': 'Admin · Clienti',
        'fee-payouts': 'Payout Fee',
        'admin-payments': 'Admin · Pagamenti Bot & Fee',
        affiliation: 'Affiliazione (L2)',
        'aff-clients': 'Affiliazione · Clienti Semplici',
        'aff-client-fee': 'Affiliazione · Fee Nuovo Cliente',
        'fee-rules': 'Fee Rules',
        logs: 'Logs & Audit',
        settings: 'Settings',
    };

    const viewSubtitleMap = {
        dashboard: 'Cabina di regia L0: KPI, stato e comandi.',
        'super-licenses': 'Gestione licenze, upgrade, revoche e remote kill.',
        'super-invoices': 'Billing clienti: documenti, pagamenti e verifiche.',
        'super-admin-manage': 'Creazione, controllo stato, limiti e branding degli Admin WL.',
        'super-admin-billing': 'Fatture e documenti degli Admin WL (solo fatturazione).',
        'super-admin-fee-report': 'Analisi fee e ricavi per Admin WL basata su pagamenti reali clienti.',
        'super-admin-payments': 'Pagamenti Admin WL (Stripe/manuali) e verifiche manuali.',
        'super-commissions': 'Analisi fee e ricavi per Admin WL.',
        'super-vps': 'Stato VPS, allocazioni e operatività infrastruttura.',
        'super-admin-clients': 'Vista rete Admin WL e clienti raggruppati per admin.',
        'admin-control': 'Controllo amministratori WL e configurazione operativa.',
        'admin-register': 'Registrazione rapida di un nuovo Admin WL.',
        'admin-clients': 'CRM clienti gestiti dagli Admin.',
        'admin-payments': 'Payout fee e pagamenti operativi di rete.',
        'aff-clients': 'Gestione affiliati e referral clienti semplici.',
        'aff-client-fee': 'Fee ingresso / nuova registrazione cliente.',
        'fee-rules': 'Policy fee e simulazione split.',
        logs: 'Audit, diagnostica e sicurezza.',
        settings: 'Configurazioni sistema e integrazioni.',
    };

    function escapeHtml(v) {
        return String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function injectViewShellHeaders() {
        Object.entries(viewMeta).forEach(([viewKey, meta]) => {
            const viewEl = document.getElementById(`view-${viewKey}`);
            if (!viewEl || viewEl.querySelector('.view-shell-header')) return;
            const compactDesc = String(meta.desc || '').split('. ')[0]?.trim() || '';
            const leftItems = (meta.left || []).map(x => `<li>${escapeHtml(x)}</li>`).join('');
            const rightItems = (meta.right || []).map(x => `<li>${escapeHtml(x)}</li>`).join('');
            const shell = document.createElement('div');
            shell.className = 'view-shell-header';
            shell.innerHTML = `
                <div class="view-shell-inline">
                    <span class="kicker">${escapeHtml(meta.kicker || '')}</span>
                    <span class="view-shell-mini-desc">${escapeHtml(compactDesc)}${compactDesc && !/[.!?]$/.test(compactDesc) ? '…' : ''}</span>
                </div>
                <details class="view-shell-details">
                    <summary>Guida rapida</summary>
                    <div class="view-shell-grid">
                        <div class="view-shell-card">
                            <h4>${escapeHtml(meta.leftTitle || 'Dettagli')}</h4>
                            <ul class="view-shell-list">${leftItems}</ul>
                        </div>
                        <div class="view-shell-card">
                            <h4>${escapeHtml(meta.rightTitle || 'Operatività')}</h4>
                            <ul class="view-shell-list">${rightItems}</ul>
                        </div>
                    </div>
                </details>
            `;
            viewEl.prepend(shell);
        });
    }

    let adminSystemState = {
        mode: 'NORMAL',
        billing_enabled: true,
        signals_enabled: true,
        ea_bridge_enabled: true,
        client_access_enabled: true,
        updated_at: null,
        last_action: null,
        last_reason: null,
    };

    let dashboardMetrics = {
        licensesActive: 0,
        clientsTotal: 0,
        revenue30dCents: 0,
        pendingManualPayments: 0,
    };

    function getViewScopeLabel(view) {
        const v = String(view || '').toLowerCase();
        if (v.startsWith('super-') || v === 'dashboard') return 'SUPER ADMIN';
        if (v.startsWith('admin-')) return 'SEZIONE ADMIN';
        if (v.startsWith('aff-')) return 'AFFILIAZIONE CLIENTI';
        if (['fee-rules', 'logs', 'settings'].includes(v)) return 'SISTEMA';
        const base = viewAliases[v] || v;
        if (['licenses', 'fee-invoices', 'billing-admin', 'admin-billing-payments', 'revenue', 'vps', 'whitelabels'].includes(base)) return 'SUPER ADMIN';
        if (['clients', 'fee-payouts'].includes(base)) return 'SEZIONE ADMIN';
        if (base === 'affiliation') return 'AFFILIAZIONE CLIENTI';
        return 'SISTEMA';
    }

    function renderDashboardHome() {
        const root = document.getElementById('view-dashboard');
        if (!root) return;
        const m = dashboardMetrics || {};
        const alertsCount =
            (adminSystemState.mode && adminSystemState.mode !== 'NORMAL' ? 1 : 0) +
            (!adminSystemState.billing_enabled ? 1 : 0) +
            (!adminSystemState.ea_bridge_enabled ? 1 : 0) +
            (!adminSystemState.signals_enabled ? 1 : 0);
        const recentLogs = (logsData || []).slice(0, 6);
        root.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <span class="stat-label">Licenze Attive</span>
                    <span class="stat-value">${Number(m.licensesActive || 0)}</span>
                    <span class="stat-trend">Gestione licenze e accessi</span>
                    <span class="subline">Creazione, revoca, upgrade, remote kill e monitoraggio scadenze.</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Clienti Totali</span>
                    <span class="stat-value">${Number(m.clientsTotal || 0)}</span>
                    <span class="stat-trend">CRM multi-sezione</span>
                    <span class="subline">Controllo clienti admin, rete WL e flussi affiliazione.</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Revenue (30d)</span>
                    <span class="stat-value">€${((Number(m.revenue30dCents || 0)) / 100).toFixed(2)}</span>
                    <span class="stat-trend">Billing centralizzato</span>
                    <span class="subline">Fatture e pagamenti aggregati nel pannello amministrativo.</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Alert Operativi</span>
                    <span class="stat-value">${alertsCount}</span>
                    <span class="stat-trend ${alertsCount ? 'warning' : 'positive'}">${adminSystemState.mode || 'NORMAL'}</span>
                    <span class="subline">Stato piattaforma, segnali, bridge EA, accesso clienti e billing.</span>
                </div>
            </div>

            <div class="dashboard-grid">
                <div class="dashboard-column">
                    <div class="glass-card">
                        <div class="panel-title">
                            <div>
                                <h4>Moduli di Gestione</h4>
                                <div class="sub">Ogni area è separata per responsabilità operativa</div>
                            </div>
                            <span class="status-badge active">GESTIONALE</span>
                        </div>
                        <div class="module-grid">
                            <div class="module-card"><div class="hd">🎟️ Licenze</div><div class="tx">Gestione licenze, upgrade, revoche, remote kill.</div><button class="btn btn-outline btn-sm" type="button" onclick="softiAdminGoView('super-licenses')">Apri</button></div>
                            <div class="module-card"><div class="hd">🧾 Fatture Clienti</div><div class="tx">Documenti fiscali, invio, pagamenti e verifiche clienti.</div><button class="btn btn-outline btn-sm" type="button" onclick="softiAdminGoView('super-invoices')">Apri</button></div>
                            <div class="module-card"><div class="hd">🏦 Billing Admin</div><div class="tx">Piani, fatture e pagamenti degli Admin WL.</div><button class="btn btn-outline btn-sm" type="button" onclick="softiAdminGoView('super-admin-billing')">Apri</button></div>
                            <div class="module-card"><div class="hd">💰 Commissioni</div><div class="tx">Revenue ledger, split e controllo economico.</div><button class="btn btn-outline btn-sm" type="button" onclick="softiAdminGoView('super-commissions')">Apri</button></div>
                            <div class="module-card"><div class="hd">🖥️ VPS</div><div class="tx">Stato nodi, allocazioni e operatività infrastruttura.</div><button class="btn btn-outline btn-sm" type="button" onclick="softiAdminGoView('super-vps')">Apri</button></div>
                            <div class="module-card"><div class="hd">🏢 Admin</div><div class="tx">Controllo admin WL, registrazione e rete.</div><button class="btn btn-outline btn-sm" type="button" onclick="softiAdminGoView('admin-control')">Apri</button></div>
                            <div class="module-card"><div class="hd">🤝 Affiliazione</div><div class="tx">Clienti affiliati semplici e fee nuova registrazione.</div><button class="btn btn-outline btn-sm" type="button" onclick="softiAdminGoView('aff-clients')">Apri</button></div>
                        </div>
                    </div>

                    <div class="glass-card">
                        <div class="panel-title">
                            <div>
                                <h4>Audit & Eventi Recenti</h4>
                                <div class="sub">Log sintetici per analisi rapida senza entrare nei dettagli</div>
                            </div>
                            <button class="btn btn-secondary btn-sm" type="button" onclick="softiAdminGoView('logs')">Apri Logs</button>
                        </div>
                        <div class="dashboard-log-list">
                            ${recentLogs.length ? recentLogs.map(log => `<div class="dashboard-log-row"><span class="ts">${escapeHtml(log.ts || '--:--:--')}</span><span class="mod">${escapeHtml(log.mod || 'SYS')}</span><span>${escapeHtml(log.msg || '')}</span></div>`).join('') : `<div class="dashboard-log-row"><span class="ts">--:--:--</span><span class="mod">SYS</span><span>Nessun log disponibile</span></div>`}
                        </div>
                    </div>
                </div>

                <div class="dashboard-column">
                    <div id="dashboard-command-center-mount"></div>
                    <div class="glass-card">
                        <div class="panel-title">
                            <div><h4>Billing & Controlli Rapidi</h4><div class="sub">Monitor pagamenti e accesso immediato ai moduli</div></div>
                            <button class="btn btn-secondary btn-sm" type="button" onclick="softiAdminGoView('super-invoices')">Billing</button>
                        </div>
                        <div class="mini-grid">
                            <div class="mini-card"><div class="lbl">Manuali in verifica</div><div class="val">${Number(m.pendingManualPayments || 0)}</div></div>
                            <div class="mini-card"><div class="lbl">Billing</div><div class="val" style="color:${adminSystemState.billing_enabled ? '#34d399' : '#f87171'};">${adminSystemState.billing_enabled ? 'ON' : 'OFF'}</div></div>
                            <div class="mini-card"><div class="lbl">Bridge EA</div><div class="val" style="color:${adminSystemState.ea_bridge_enabled ? '#34d399' : '#f59e0b'};">${adminSystemState.ea_bridge_enabled ? 'SYNC' : 'STOP'}</div></div>
                            <div class="mini-card"><div class="lbl">Segnali</div><div class="val" style="color:${adminSystemState.signals_enabled ? '#34d399' : '#f59e0b'};">${adminSystemState.signals_enabled ? 'ON' : 'OFF'}</div></div>
                        </div>
                    </div>
                    <div class="ops-banner"><strong style="color:var(--text-main)">Regola UX:</strong> la Dashboard è cabina di regia. Ogni funzione operativa è separata nel suo modulo (Licenze, Fatture, Commissioni, VPS, Admin, Affiliazione).</div>
                </div>
            </div>
        `;
    }

    function renderDashboardCommandCenter() {
        const mount = document.getElementById('dashboard-command-center-mount');
        const stack = mount || document.querySelector('#view-dashboard .workspace-stack');
        if (!stack) return;
        let card = document.getElementById('dashboard-command-center');
        if (!card) {
            card = document.createElement('div');
            card.id = 'dashboard-command-center';
            card.className = 'glass-card';
            if (mount) stack.replaceChildren(card);
            else stack.prepend(card);
        }
        const mode = String(adminSystemState.mode || 'NORMAL').toUpperCase();
        const modeColor = mode === 'NORMAL' ? '#34d399' : mode === 'MAINTENANCE' ? '#f59e0b' : mode === 'FROZEN' ? '#fb923c' : '#ef4444';
        const boolTag = (v) => `<span class="status-badge ${v ? 'active' : 'expired'}">${v ? 'ON' : 'OFF'}</span>`;
        card.innerHTML = `
            <div class="panel-title">
                <div>
                    <h4>Command Center Super Admin</h4>
                    <div class="sub">Analisi globale, maintenance, freeze e shutdown controllato del sistema</div>
                </div>
                <span class="status-badge" style="border-color:${modeColor}; color:${modeColor}; background:${modeColor}12;">${mode}</span>
            </div>
            <div class="command-center">
                <div class="row">
                    <div>
                        <div class="title">Stato operativo piattaforma</div>
                        <div class="sub">${adminSystemState.updated_at ? `Ultimo update: ${new Date(adminSystemState.updated_at).toLocaleString('it-IT')}` : 'Nessun comando recente'}${adminSystemState.last_action ? ` · ${adminSystemState.last_action}` : ''}</div>
                    </div>
                    <div style="display:flex; gap:.45rem; flex-wrap:wrap;">
                        <button class="btn btn-secondary btn-sm" onclick="softiAdminSystemControl('ANALYZE')">🔎 Analizza</button>
                        <button class="btn btn-secondary btn-sm" onclick="softiAdminSystemControl('RESUME_ALL')">▶ Riprendi</button>
                        <button class="btn btn-secondary btn-sm" onclick="softiAdminSystemControl('MAINTENANCE_ON')">🛠 Maintenance</button>
                    </div>
                </div>
                <div class="system-state-grid">
                    <div class="system-state-item"><div class="lbl">Billing</div><div class="val">${boolTag(adminSystemState.billing_enabled)}</div></div>
                    <div class="system-state-item"><div class="lbl">Segnali</div><div class="val">${boolTag(adminSystemState.signals_enabled)}</div></div>
                    <div class="system-state-item"><div class="lbl">EA Bridge</div><div class="val">${boolTag(adminSystemState.ea_bridge_enabled)}</div></div>
                    <div class="system-state-item"><div class="lbl">Accesso Clienti</div><div class="val">${boolTag(adminSystemState.client_access_enabled)}</div></div>
                </div>
                <div class="quick-actions-grid">
                    <button class="btn btn-outline btn-sm" onclick="softiAdminGoView('super-licenses')">🎟 Licenze</button>
                    <button class="btn btn-outline btn-sm" onclick="softiAdminGoView('super-invoices')">🧾 Fatture</button>
                    <button class="btn btn-outline btn-sm" onclick="softiAdminGoView('super-commissions')">💰 Commissioni</button>
                    <button class="btn btn-outline btn-sm" onclick="softiAdminGoView('super-vps')">🖥 VPS</button>
                </div>
                <div class="row">
                    <div class="sub">${escapeHtml(adminSystemState.last_reason || 'Nessuna nota operativa')}</div>
                    <div style="display:flex; gap:.45rem; flex-wrap:wrap;">
                        <button class="btn btn-warning btn-sm" onclick="softiAdminSystemControl('FREEZE_OPERATIONS')">⏸ Freeze</button>
                        <button class="btn btn-danger btn-sm" onclick="softiAdminSystemControl('EMERGENCY_SHUTDOWN')">⛔ Shutdown Totale</button>
                    </div>
                </div>
            </div>
        `;
    }

    function clearFocusedLayoutDecorations() {
        document.querySelectorAll('.softi-hidden-by-focus').forEach((el) => el.classList.remove('softi-hidden-by-focus'));
        document.querySelectorAll('.view.focus-single-column').forEach((el) => el.classList.remove('focus-single-column'));
        document.querySelectorAll('.view-focus-panel').forEach((el) => el.remove());
    }

    function createFocusPanel(root, config) {
        if (!root || !config) return;
        const panel = document.createElement('div');
        panel.className = 'view-focus-panel glass-card';
        const actions = (config.actions || []).map(action => {
            const cls = action.kind === 'primary' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
            if (action.nav) {
                return `<button type="button" class="${cls}" onclick="softiAdminGoView('${action.nav}')">${escapeHtml(action.label)}</button>`;
            }
            if (action.fn) {
                return `<button type="button" class="${cls}" onclick="${action.fn}">${escapeHtml(action.label)}</button>`;
            }
            return '';
        }).join('');
        const chips = (config.chips || []).map(ch => `<span class="focus-chip">${escapeHtml(ch)}</span>`).join('');
        panel.innerHTML = `
            <div class="view-focus-top">
                <div>
                    <div class="focus-title">${escapeHtml(config.title || '')}</div>
                    <div class="focus-desc">${escapeHtml(config.desc || '')}</div>
                </div>
                <div class="focus-chip-row">${chips}</div>
            </div>
            ${actions ? `<div class="focus-actions">${actions}</div>` : ''}
            ${config.bodyHtml ? `<div class="focus-body">${config.bodyHtml}</div>` : ''}
        `;
        root.prepend(panel);
    }

    function hideBySelectors(root, selectors) {
        (selectors || []).forEach((sel) => {
            root.querySelectorAll(sel).forEach((node) => node.classList.add('softi-hidden-by-focus'));
        });
    }

    function applyFocusedLayout(view, baseView) {
        clearFocusedLayoutDecorations();
        const root = document.getElementById(`view-${baseView}`);
        if (!root) return;

        const aliasProfiles = {
            'super-admin-clients': {
                singleColumn: true,
                hide: ['#view-whitelabels .workspace-split', '#view-whitelabels > .stats-grid', '#view-whitelabels > p.section-note'],
                panel: {
                    title: 'Area Super Admin · Admin & Clienti',
                    desc: 'Controllo rete White Label e accesso rapido al CRM clienti, separati dal resto.',
                    chips: ['Rete Admin WL', 'CRM Clienti', 'Controllo L0'],
                    actions: [
                        { label: 'White Labels', nav: 'whitelabels' },
                        { label: 'Clienti', nav: 'clients' },
                        { label: 'Registra Admin', fn: "softiAdminGoView('admin-register')" }
                    ],
                    bodyHtml: `
                        <div class="focus-grid">
                            <button type="button" class="focus-link-card" onclick="softiAdminGoView('whitelabels')">
                                <div class="hd">🏢 White Labels</div>
                                <div class="tx">Gestione completa Admin WL, fee, brand, stato e dettaglio rete.</div>
                            </button>
                            <button type="button" class="focus-link-card" onclick="softiAdminGoView('clients')">
                                <div class="hd">👥 Clienti</div>
                                <div class="tx">CRM clienti, licenze associate, scadenze e supporto operativo.</div>
                            </button>
                            <button type="button" class="focus-link-card" onclick="softiAdminGoView('admin-control')">
                                <div class="hd">🧭 Controllo Admin</div>
                                <div class="tx">Vista operativa L1 per stato, volume e controllo rete.</div>
                            </button>
                            <button type="button" class="focus-link-card" onclick="softiAdminGoView('admin-register')">
                                <div class="hd">➕ Registra Admin</div>
                                <div class="tx">Onboarding rapido nuovo Admin WL con fee iniziale.</div>
                            </button>
                        </div>
                    `
                }
            },
            'admin-control': {
                singleColumn: true,
                hide: ['#view-whitelabels .workspace-split > .workspace-stack', '#view-whitelabels > p.section-note'],
                panel: {
                    title: 'Controllo Admin',
                    desc: 'Gestione operativa degli Admin WL: stato, fee, volume e accesso al dettaglio.',
                    chips: ['Anagrafiche', 'Fee WL', 'Stato Operativo'],
                    actions: [
                        { label: 'Registra Admin', nav: 'admin-register' },
                        { label: 'Clienti Admin', nav: 'admin-clients' }
                    ]
                }
            },
            'admin-register': {
                singleColumn: true,
                hide: ['#view-whitelabels .workspace-split', '#view-whitelabels > .stats-grid', '#view-whitelabels > p.section-note'],
                panel: {
                    title: 'Registrazione Admin WL',
                    desc: 'Crea un nuovo Admin White Label con brand e fee iniziale.',
                    chips: ['Onboarding', 'Fee L1', 'Brand Setup'],
                    actions: [
                        { label: 'Apri Registrazione', fn: "document.getElementById('create-admin-modal') && (document.getElementById('create-admin-modal').style.display='flex')" },
                        { label: 'Controllo Admin', nav: 'admin-control' }
                    ],
                    bodyHtml: `
                        <div class="focus-grid focus-grid--2">
                            <div class="focus-card-note">
                                <div class="hd">Workflow suggerito</div>
                                <ul>
                                    <li>Inserisci brand e contatto</li>
                                    <li>Definisci fee L1 iniziale</li>
                                    <li>Crea admin e verifica accesso</li>
                                    <li>Configura affiliati L2 opzionali</li>
                                </ul>
                            </div>
                            <div class="focus-card-note">
                                <div class="hd">Controlli post-creazione</div>
                                <ul>
                                    <li>Stato admin = ACTIVE</li>
                                    <li>Fee corretta rispetto policy</li>
                                    <li>Brand univoco</li>
                                    <li>Test login Admin web</li>
                                </ul>
                            </div>
                        </div>
                    `
                }
            },
            'admin-payments': {
                hide: ['#view-fee-payouts > p.section-note'],
                panel: {
                    title: 'Pagamenti Bot & Fee Admin',
                    desc: 'Coda payout e stati operativi fee di rete lato amministrazione.',
                    chips: ['Payout', 'Batch', 'Riconciliazione'],
                    actions: [
                        { label: 'Commissioni', nav: 'super-commissions' },
                        { label: 'Fatture', nav: 'super-invoices' }
                    ]
                }
            },
            'aff-clients': {
                hide: ['#view-affiliation > p.section-note'],
                panel: {
                    title: 'Affiliazione Clienti Semplici',
                    desc: 'Referral e affiliati senza admin dedicato.',
                    chips: ['Referral', 'Affiliati L2', 'Fee Maturate'],
                    actions: [
                        { label: 'Fee Nuovo Cliente', nav: 'aff-client-fee' }
                    ]
                }
            },
            'aff-client-fee': {
                singleColumn: true,
                custom: (rootEl) => {
                    rootEl.querySelectorAll(':scope > .glass-card > .section-toolbar .group h2').forEach((n) => { n.textContent = 'Fee Nuovo Cliente'; });
                    const notes = rootEl.querySelectorAll(':scope > .glass-card > p.section-note');
                    const toolbars = rootEl.querySelectorAll(':scope > .glass-card > .section-toolbar');
                    const invoiceTableShell = rootEl.querySelector(':scope > .glass-card > .table-shell');
                    const manualArchiveCard = rootEl.querySelector(':scope > .glass-card > .glass-card.table-shell');
                    const headerToolbar = rootEl.querySelector(':scope > .glass-card > .section-toolbar');
                    if (notes[1]) notes[1].classList.add('softi-hidden-by-focus');
                    if (toolbars[1]) toolbars[1].classList.add('softi-hidden-by-focus'); // filter toolbar
                    if (invoiceTableShell) invoiceTableShell.classList.add('softi-hidden-by-focus');
                    if (manualArchiveCard) manualArchiveCard.classList.add('softi-hidden-by-focus');
                    if (headerToolbar) headerToolbar.classList.add('focus-toolbar-tight');
                },
                panel: {
                    title: 'Fee Nuovo Cliente (senza Admin)',
                    desc: 'Emissione rapida documento fee per nuova registrazione cliente semplice.',
                    chips: ['PROFORMA', 'Bonifico/USDT/Stripe', 'Invio Immediato'],
                    actions: [
                        { label: 'Fatture Complete', nav: 'super-invoices' },
                        { label: 'Affiliazione', nav: 'aff-clients' }
                    ]
                }
            }
        };

        const profile = aliasProfiles[view];
        if (!profile) return;
        if (profile.singleColumn) root.classList.add('focus-single-column');
        hideBySelectors(root, profile.hide);
        if (typeof profile.custom === 'function') profile.custom(root);
        createFocusPanel(root, profile.panel);
    }

    async function syncSystemControlStatus() {
        if (!hasBackendAuth()) {
            renderDashboardCommandCenter();
            return;
        }
        try {
            const res = await apiFetch('/admin/system/status');
            if (res?.system) adminSystemState = { ...adminSystemState, ...res.system };
        } catch (err) {
            console.warn('System status unavailable:', err);
        } finally {
            renderDashboardCommandCenter();
        }
    }

    window.softiAdminGoView = function (view) {
        navigateToView(view, { updateHash: true, force: true });
    };

    window.softiAdminSystemControl = async function (action) {
        const actionU = String(action || '').toUpperCase();
        const dangerous = ['FREEZE_OPERATIONS', 'EMERGENCY_SHUTDOWN'];
        if (dangerous.includes(actionU)) {
            const ok = confirm(`Confermare azione ${actionU}?\n\nQuesta azione impatta operatività/billing/clienti.`);
            if (!ok) return;
        }
        if (!hasBackendAuth()) {
            // fallback demo locale, utile per preview UI
            adminSystemState.last_action = actionU;
            adminSystemState.updated_at = new Date().toISOString();
            adminSystemState.last_reason = 'Demo locale (backend non autenticato)';
            if (actionU === 'MAINTENANCE_ON') adminSystemState = { ...adminSystemState, mode: 'MAINTENANCE', billing_enabled: false };
            if (actionU === 'RESUME_ALL' || actionU === 'MAINTENANCE_OFF') adminSystemState = { ...adminSystemState, mode: 'NORMAL', billing_enabled: true, signals_enabled: true, ea_bridge_enabled: true, client_access_enabled: true };
            if (actionU === 'FREEZE_OPERATIONS') adminSystemState = { ...adminSystemState, mode: 'FROZEN', billing_enabled: false, signals_enabled: false, ea_bridge_enabled: false };
            if (actionU === 'EMERGENCY_SHUTDOWN') adminSystemState = { ...adminSystemState, mode: 'SHUTDOWN', billing_enabled: false, signals_enabled: false, ea_bridge_enabled: false, client_access_enabled: false };
            renderDashboardCommandCenter();
            toast(`Demo: comando ${actionU} applicato localmente`, dangerous.includes(actionU) ? 'warning' : 'info', 3000);
            return;
        }
        try {
            const res = await apiFetch('/admin/system/control', {
                method: 'POST',
                body: JSON.stringify({ action: actionU })
            });
            if (res?.system) adminSystemState = { ...adminSystemState, ...res.system };
            renderDashboardCommandCenter();
            logsData.unshift({
                ts: new Date().toLocaleTimeString(),
                mod: 'SYSTEM',
                status: dangerous.includes(actionU) ? 'warning' : 'info',
                msg: `SYSTEM_CONTROL_${actionU}`
            });
            injectLogs();
            toast(`Comando eseguito: ${actionU}`, dangerous.includes(actionU) ? 'warning' : 'success', 3200);
        } catch (err) {
            toast(`Errore comando sistema: ${err.message}`, 'error', 4200);
        }
    };

    function setTopBarContext(view) {
        const baseView = viewAliases[view] || view;
        if (addLicenseBtn) {
            const showAdd = ['dashboard', 'licenses', 'clients'].includes(baseView);
            addLicenseBtn.classList.toggle('is-context-hidden', !showAdd);
            addLicenseBtn.classList.toggle('is-ghost-context', baseView === 'dashboard');
            addLicenseBtn.textContent = (view === 'admin-clients' || baseView === 'clients') ? '+ Cliente + Licenza' : '+ Nuova Licenza';
            addLicenseBtn.title = (view === 'admin-clients' || baseView === 'clients')
                ? 'Apri creazione cliente con licenza'
                : 'Apri modulo nuova licenza';
        }
        if (triggerBackupBtn) {
            const showBackup = ['dashboard', 'settings', 'logs', 'vps'].includes(baseView);
            triggerBackupBtn.classList.toggle('is-context-hidden', !showBackup);
        }
    }

    function resolveViewFromHash() {
        const hash = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
        if (!hash) return null;
        const map = {
            dashboard: 'dashboard',
            revenue: 'revenue',
            whitelabels: 'whitelabels',
            affiliation: 'affiliation',
            vps: 'vps',
            'fee-rules': 'fee-rules',
            'fee-payouts': 'fee-payouts',
            'fee-invoices': 'fee-invoices',
            settings: 'settings',
            licenses: 'licenses',
            clients: 'clients',
            logs: 'logs'
        };
        return map[hash] || hash || null;
    }

    const viewRenderers = {
        revenue: () => injectRevenue(),
        logs: () => injectLogs(),
        whitelabels: () => renderWLNetwork(),
        affiliation: () => renderAffiliation(),
        'fee-rules': () => {
            renderFeeRulesPanel();
            syncFeeRulesFromBackend();
        },
        'fee-payouts': () => {
            renderFeePayouts();
            syncFeePayoutsFromBackend();
        },
        'fee-invoices': () => {
            renderFeeInvoices();
            renderManualPaymentsQueue();
        },
        'billing-admin': () => renderAdminWLBillingSection(),
        'admin-billing-payments': () => renderAdminWLBillingPaymentsSection(),
        clients: () => renderClients(),
        vps: () => renderVPS(),
        licenses: () => renderLicenses(),
        dashboard: () => {
            renderDashboardHome();
            renderDashboardCommandCenter();
        },
    };

    let currentViewKey = null;

    function setActiveNav(view, sourceItem = null) {
        if (sourceItem) {
            navItems.forEach(i => i.classList.toggle('active', i === sourceItem));
            return;
        }
        let firstMatch = null;
        navItems.forEach(i => {
            if (!firstMatch && i.getAttribute('data-view') === view) firstMatch = i;
        });
        navItems.forEach(i => i.classList.toggle('active', i === firstMatch));
    }

    function runNavAction(action) {
        if (!action) return;
        if (action === 'open-admin-registration') {
            const modalEl = document.getElementById('create-admin-modal');
            if (modalEl) modalEl.style.display = 'flex';
            return;
        }
        if (action === 'focus-new-client-fee') {
            const docType = document.getElementById('fee-invoice-doc-type');
            const method = document.getElementById('fee-invoice-method');
            if (docType) docType.value = 'PROFORMA';
            if (method) method.value = 'BANK_TRANSFER';
            const target = document.getElementById('fee-invoice-client-id') || document.getElementById('view-fee-invoices');
            setTimeout(() => target?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
        }
    }

    function navigateToView(view, { updateHash = true, force = false, sourceItem = null } = {}) {
        if (!view) return;
        if (!force && view === currentViewKey) return;
        setActiveNav(view, sourceItem);
        updateViewContent(view);
        currentViewKey = view;
        if (updateHash) {
            try {
                window.history.replaceState(null, '', `#${view}`);
            } catch (_) {
                window.location.hash = view;
            }
        }
    }

    // Navigation Logic
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.getAttribute('data-view');
            const action = item.getAttribute('data-nav-action');
            navigateToView(view, { updateHash: true, sourceItem: item });
            runNavAction(action);
        });
    });

    function updateViewContent(view) {
        const baseView = viewAliases[view] || view;
        viewTitle.textContent = viewTitleMap[view] || viewTitleMap[baseView] || (viewMeta[baseView]?.title ?? 'Admin Panel');
        if (viewSubtitle) {
            viewSubtitle.textContent = viewSubtitleMap[view] || viewSubtitleMap[baseView] || 'Controllo operativo della piattaforma.';
        }
        if (viewScopeBadge) {
            viewScopeBadge.textContent = getViewScopeLabel(view);
        }
        setTopBarContext(view);
        document.body.setAttribute('data-admin-view', view);
        document.body.setAttribute('data-admin-base-view', baseView);

        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const activeView = document.getElementById(`view-${baseView}`);
        if (activeView) {
            activeView.classList.add('active');
            if (mainContent && typeof mainContent.scrollTo === 'function') {
                mainContent.scrollTo({ top: 0, behavior: 'smooth' });
            }
            if (typeof viewRenderers[baseView] === 'function') {
                try {
                    viewRenderers[baseView]();
                    applyFocusedLayout(view, baseView);
                } catch (err) {
                    console.error(`View render failed [${view}]`, err);
                    toast(`Errore rendering sezione ${view}: ${err.message || err}`, 'error', 4000);
                }
            } else {
                applyFocusedLayout(view, baseView);
            }
        }
    }

    function openLicenseCreateModal() {
        if (!modal) return;
        modal.style.display = 'flex';
    }

    // Modal Logic
    addLicenseBtn?.addEventListener('click', openLicenseCreateModal);
    openModalFromLicensesBtn?.addEventListener('click', () => {
        openLicenseCreateModal();
    });

    closeModal.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    // Form Submission (Simulated)
    licenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = licenseForm.querySelector('.btn-primary');
        const originalText = btn.textContent;
        const formSelect = licenseForm.querySelector('select');
        const formDays = licenseForm.querySelector('input[type="number"]');
        const planCode = formSelect?.value || 'PRO';
        const days = Number(formDays?.value || 30);

        btn.textContent = 'Generazione in corso...';
        btn.disabled = true;

        if (hasBackendAuth() && ['BASIC', 'PRO', 'ENTERPRISE'].includes(planCode)) {
            try {
                const lic = await apiFetch('/admin/licenses', {
                    method: 'POST',
                    body: JSON.stringify({ plan_code: planCode, days })
                });
                currentLicenses.unshift({
                    id: lic.id,
                    type: lic.plan_code,
                    status: (lic.status || '').toLowerCase(),
                    accounts: [],
                    expiry: (lic.expiry_at || '').split('T')[0] || '---',
                    install_id: lic.install_id || null
                });
                renderLicenses();
                logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'API', status: 'success', msg: `New ${lic.plan_code} License created: ${lic.id}` });
                injectLogs();
                alert(`Nuova licenza generata: ${lic.id}`);
            } catch (err) {
                alert(`Errore backend generazione licenza: ${err.message}`);
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
                modal.style.display = 'none';
            }
            return;
        }

        setTimeout(() => {
            alert('Nuova licenza generata con successo!');
            btn.textContent = originalText;
            btn.disabled = false;
            modal.style.display = 'none';
        }, 1500);
    });

    // Animate bars on load
    const bars = document.querySelectorAll('.bar');
    bars.forEach((bar, index) => {
        const height = bar.style.height;
        bar.style.height = '0';
        setTimeout(() => {
            bar.style.height = height;
        }, 100 * index);
    });

    // --- Interactive Guide Logic ---
    const guideOverlay = document.getElementById('guide-overlay');
    const startTourBtn = document.getElementById('start-tour-btn');
    const nextGuideBtn = document.getElementById('next-guide');
    const skipGuideBtn = document.getElementById('skip-guide');
    const guideStepNum = document.getElementById('guide-step-num');
    const guideTitle = document.getElementById('guide-title');
    const guideDesc = document.getElementById('guide-desc');

    const tourSteps = [
        {
            title: "Dashboard Intelligente",
            desc: "Monitora entrate e iscritti a colpo d'occhio. Gli alerts ti avvisano se un EA perde la connessione.",
            num: "Step 1 di 3"
        },
        {
            title: "Comando Centrale Telegram",
            desc: "Usa il tasto '+ Nuova Licenza' per generare chiavi. Il Bot avviserà istantaneamente l'utente.",
            num: "Step 2 di 3"
        },
        {
            title: "Audit Logs in Tempo Reale",
            desc: "Nella sezione 'Audit Logs' puoi vedere esattamente cosa sta facendo il Bot e chi sta attivando le licenze.",
            num: "Step 3 di 3"
        }
    ];

    let currentStep = 0;

    function showStep(index) {
        if (index >= tourSteps.length) {
            guideOverlay.style.display = 'none';
            return;
        }
        const step = tourSteps[index];
        guideStepNum.textContent = step.num;
        guideTitle.textContent = step.title;
        guideDesc.textContent = step.desc;
        nextGuideBtn.textContent = index === tourSteps.length - 1 ? 'Inizia Ora!' : 'Avanti';
    }

    startTourBtn.addEventListener('click', () => {
        currentStep = 0;
        showStep(currentStep);
        guideOverlay.style.display = 'flex';
        localStorage.setItem('softi_tour_completed', 'true');
    });

    nextGuideBtn.addEventListener('click', () => {
        currentStep++;
        showStep(currentStep);
    });

    skipGuideBtn.addEventListener('click', () => {
        guideOverlay.style.display = 'none';
        localStorage.setItem('softi_tour_completed', 'true');
    });

    // --- Live Logs Simulation ---
    const logsBody = document.getElementById('live-logs-body');
    let logsData = [
        { ts: "02:50:11", mod: "BOT", status: "success", msg: "Broadcast sent to 142 users" },
        { ts: "02:52:05", mod: "WEB", status: "info", msg: "New PRO License created: SB-A9B2" },
        { ts: "02:53:44", mod: "EA", status: "success", msg: "Account 87654321 validated (MT4)" },
        { ts: "02:55:01", mod: "CORE", status: "warning", msg: "VPS Latency detected: 140ms" }
    ];

    // =========================================================
    // === CRM DATABASE CLIENTI
    // =========================================================
    let mockClients = [
        { id: "CLI-001", nome: "Marco", cognome: "Verdi", telegram: "@markov_trader", email: "marco.verdi@gmail.com", tel: "+39 333 1234567", licenza: "SB-A9B2", piano: "PRO", scadenza: "2026-03-22", stato: "ACTIVE", admin_id: "WL-8892" },
        { id: "CLI-002", nome: "Sara", cognome: "Bianchi", telegram: "@sara_fx", email: "sara.bianchi@outlook.com", tel: "+39 347 7654321", licenza: "SB-X9Z8", piano: "ENTERPRISE", scadenza: "2026-04-15", stato: "ACTIVE", admin_id: "WL-8892" },
        { id: "CLI-003", nome: "Luca", cognome: "Ferrari", telegram: "@lucaf_xauusd", email: "luca.ferrari@libero.it", tel: "+39 320 9876543", licenza: "SB-B2C3", piano: "BASIC", scadenza: "2026-02-28", stato: "EXPIRING", admin_id: "WL-1123" },
        { id: "CLI-004", nome: "Anna", cognome: "Ricci", telegram: "@anna_quant", email: "anna.ricci@gmail.com", tel: "+39 388 4561234", licenza: "SB-C4D5", piano: "PRO", scadenza: "2026-02-25", stato: "EXPIRING", admin_id: "WL-1123" },
        { id: "CLI-005", nome: "Davide", cognome: "Conti", telegram: "@davide_ea", email: "davide.conti@yahoo.it", tel: "+39 366 7891234", licenza: "SB-E6F7", piano: "PRO", scadenza: "2026-05-01", stato: "ACTIVE", admin_id: "WL-8892" },
        { id: "CLI-006", nome: "Giulia", cognome: "Mori", telegram: "@giulia_signals", email: "giulia.mori@gmail.com", tel: "+39 391 3214567", licenza: "SB-G8H9", piano: "BASIC", scadenza: "2026-01-31", stato: "EXPIRED", admin_id: "WL-1123" },
    ];

    let clientAdminFilterState = 'ALL';
    let clientPaymentsArchiveCache = [];
    let clientDownloadPolicyCache = new Map();

    function normalizeCsvCodes(raw) {
        return String(raw || '')
            .split(',')
            .map(v => v.trim().toUpperCase())
            .filter(Boolean)
            .filter((value, idx, arr) => arr.indexOf(value) === idx);
    }

    function codesToCsv(values) {
        return (Array.isArray(values) ? values : [])
            .map(v => String(v || '').trim().toUpperCase())
            .filter(Boolean)
            .join(',');
    }

    function populateClientDownloadPolicyClientSelect() {
        const sel = document.getElementById('client-download-policy-client');
        if (!sel) return;
        const current = sel.value;
        const options = ['<option value="">Seleziona cliente...</option>'];
        [...mockClients]
            .sort((a, b) => (`${a.nome || ''} ${a.cognome || ''}`).localeCompare(`${b.nome || ''} ${b.cognome || ''}`, 'it'))
            .forEach((c) => {
                const label = `${c.nome || ''} ${c.cognome || ''}`.trim() || c.id;
                options.push(`<option value="${escapeHtml(c.id)}">${escapeHtml(label)} (${escapeHtml(c.id)})</option>`);
            });
        sel.innerHTML = options.join('');
        if ([...sel.options].some(o => o.value === current)) {
            sel.value = current;
        }
    }

    function setClientDownloadPolicyForm(payload = null) {
        const policy = payload?.policy || {};
        const modeEl = document.getElementById('client-download-policy-mode');
        const manualEl = document.getElementById('client-download-policy-manual');
        const allowEl = document.getElementById('client-download-policy-allow');
        const denyEl = document.getElementById('client-download-policy-deny');
        const allowedEl = document.getElementById('client-download-policy-allowed');
        const availableEl = document.getElementById('client-download-policy-available');
        if (modeEl) modeEl.value = String(policy.mode || 'AUTO').toUpperCase();
        if (manualEl) manualEl.value = codesToCsv(policy.manual_codes || []);
        if (allowEl) allowEl.value = codesToCsv(policy.allow_extra_codes || []);
        if (denyEl) denyEl.value = codesToCsv(policy.deny_codes || []);
        if (allowedEl) allowedEl.textContent = Array.isArray(payload?.allowed_codes) && payload.allowed_codes.length ? payload.allowed_codes.join(', ') : '-';
        if (availableEl) availableEl.textContent = Array.isArray(payload?.available_codes) && payload.available_codes.length ? payload.available_codes.join(', ') : '-';
    }

    async function loadSelectedClientDownloadPolicy() {
        const sel = document.getElementById('client-download-policy-client');
        const clientId = sel?.value || '';
        if (!clientId) {
            setClientDownloadPolicyForm(null);
            return;
        }
        if (!hasBackendAuth()) {
            toast('Login backend richiesto per leggere la policy download', 'warning');
            return;
        }
        try {
            const data = await apiFetch(`/admin/clients/${encodeURIComponent(clientId)}/download-policy`);
            clientDownloadPolicyCache.set(clientId, data);
            setClientDownloadPolicyForm(data);
            toast(`Policy download caricata per cliente ${clientId}`, 'success', 1800);
        } catch (err) {
            toast(`Errore caricamento policy download: ${err.message}`, 'error', 4200);
        }
    }

    async function saveSelectedClientDownloadPolicy() {
        const sel = document.getElementById('client-download-policy-client');
        const clientId = sel?.value || '';
        if (!clientId) {
            toast('Seleziona un cliente prima di salvare la policy', 'warning');
            return;
        }
        if (!hasBackendAuth()) {
            toast('Login backend richiesto per aggiornare la policy download', 'warning');
            return;
        }
        const payload = {
            mode: String(document.getElementById('client-download-policy-mode')?.value || 'AUTO').toUpperCase(),
            manual_codes: normalizeCsvCodes(document.getElementById('client-download-policy-manual')?.value),
            allow_extra_codes: normalizeCsvCodes(document.getElementById('client-download-policy-allow')?.value),
            deny_codes: normalizeCsvCodes(document.getElementById('client-download-policy-deny')?.value),
        };
        try {
            const data = await apiFetch(`/admin/clients/${encodeURIComponent(clientId)}/download-policy`, {
                method: 'PATCH',
                body: JSON.stringify(payload),
            });
            clientDownloadPolicyCache.set(clientId, data);
            setClientDownloadPolicyForm(data);
            toast(`Policy download aggiornata per cliente ${clientId}`, 'success');
        } catch (err) {
            toast(`Errore salvataggio policy download: ${err.message}`, 'error', 4200);
        }
    }

    function renderClientAdminFilterOptions() {
        const sel = document.getElementById('client-admin-filter');
        if (!sel) return;
        const current = clientAdminFilterState || 'ALL';
        const map = new Map();
        mockClients.forEach(c => {
            const key = c.admin_id || 'UNASSIGNED';
            if (!map.has(key)) map.set(key, c.admin_brand || (key === 'UNASSIGNED' ? 'Senza Admin' : key));
        });
        const options = ['<option value="ALL">Admin: Tutti</option>', '<option value="UNASSIGNED">Senza Admin</option>'];
        [...map.entries()]
            .filter(([k]) => k !== 'UNASSIGNED')
            .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'it'))
            .forEach(([k, name]) => options.push(`<option value="${escapeHtml(k)}">${escapeHtml(name)}</option>`));
        sel.innerHTML = options.join('');
        if ([...sel.options].some(o => o.value === current)) sel.value = current;
    }

    function renderClients(filter = '') {
        const tbody = document.getElementById('clients-table-body');
        if (!tbody) return;
        let filtered = filter
            ? mockClients.filter(c =>
                (c.nome + ' ' + c.cognome).toLowerCase().includes(filter.toLowerCase()) ||
                c.telegram.toLowerCase().includes(filter.toLowerCase()) ||
                c.email.toLowerCase().includes(filter.toLowerCase()) ||
                c.licenza.toLowerCase().includes(filter.toLowerCase())
            )
            : mockClients;
        if (clientAdminFilterState && clientAdminFilterState !== 'ALL') {
            filtered = filtered.filter(c => (c.admin_id || 'UNASSIGNED') === clientAdminFilterState);
        }

        const statusColor = { ACTIVE: 'active', EXPIRING: 'warning', EXPIRED: 'expired' };
        const grouped = new Map();
        filtered.forEach(c => {
            const key = c.admin_id || 'UNASSIGNED';
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(c);
        });
        const chunks = [];
        for (const [adminKey, rows] of grouped.entries()) {
            const adminLabel = rows[0]?.admin_brand || (adminKey === 'UNASSIGNED' ? 'Senza Admin' : adminKey);
            chunks.push(`
                <tr class="client-group-row">
                    <td colspan="9">
                        <div class="client-group-heading">
                            <span class="code">${adminKey}</span>
                            <strong>${escapeHtml(adminLabel)}</strong>
                            <span class="status-badge">${rows.length} clienti</span>
                        </div>
                    </td>
                </tr>
            `);
            chunks.push(rows.map(c => `
            <tr>
                <td><strong>${c.nome} ${c.cognome}</strong><div style="font-size:0.72rem; color:var(--text-dim); font-family:monospace;">${c.id}</div></td>
                <td><a href="https://t.me/${c.telegram.replace('@', '')}" target="_blank" style="color:var(--accent);">${c.telegram}</a></td>
                <td style="font-size:0.82rem; color:var(--text-dim);">${c.email}</td>
                <td style="font-size:0.82rem;">${c.tel}</td>
                <td><span class="code">${c.licenza}</span></td>
                <td><span class="status-badge" style="background: rgba(123,94,167,0.3); border-color:#7b5ea7;">${c.piano}</span></td>
                <td style="font-size:0.82rem;">${c.scadenza}</td>
                <td><span class="status-badge ${statusColor[c.stato] || ''}">${c.stato}</span></td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="openClientDetail('${c.id}')">👁️</button>
                    <button class="btn btn-sm btn-warning" onclick="alert('Reminder scadenza inviato via Telegram a ${c.telegram}')" style="margin-left:4px;">⏰</button>
                </td>
            </tr>
        `).join(''));
        }
        tbody.innerHTML = chunks.join('');
        renderClientAdminFilterOptions();
        populateClientDownloadPolicyClientSelect();

        // Update stats
        document.getElementById('client-count').textContent = mockClients.length;
        document.getElementById('client-active').textContent = mockClients.filter(c => c.stato === 'ACTIVE').length;
        document.getElementById('client-expiring').textContent = mockClients.filter(c => c.stato === 'EXPIRING').length;
        const mrr = mockClients.filter(c => c.stato !== 'EXPIRED').reduce((s, c) => s + (c.piano === 'BASIC' ? 59 : c.piano === 'PRO' ? 109 : 199), 0);
        document.getElementById('client-mrr').textContent = `€${mrr}`;
    }

    function openClientDetail(clientId) {
        const c = mockClients.find(x => x.id === clientId);
        if (!c) return;
        const admin = wlNetwork.find(a => a.id === c.admin_id);
        alert(`👤 CLIENTE: ${c.nome} ${c.cognome}\n\n📱 Telegram: ${c.telegram}\n📧 Email: ${c.email}\n📞 Tel: ${c.tel}\n\n🎟️ Licenza: ${c.licenza}\n📦 Piano: ${c.piano}\n📅 Scadenza: ${c.scadenza}\n✅ Stato: ${c.stato}\n\n🏢 Admin WL: ${admin ? admin.brand : 'N/A'} (${c.admin_id})`);
    }
    window.openClientDetail = openClientDetail;

    // Client search
    document.getElementById('client-search')?.addEventListener('input', (e) => {
        renderClients(e.target.value);
    });
    document.getElementById('client-admin-filter')?.addEventListener('change', (e) => {
        clientAdminFilterState = e.target.value || 'ALL';
        renderClients(document.getElementById('client-search')?.value || '');
    });
    document.getElementById('client-download-policy-client')?.addEventListener('change', () => {
        loadSelectedClientDownloadPolicy();
    });
    document.getElementById('load-client-download-policy-btn')?.addEventListener('click', () => {
        loadSelectedClientDownloadPolicy();
    });
    document.getElementById('refresh-client-download-policy-btn')?.addEventListener('click', () => {
        loadSelectedClientDownloadPolicy();
    });
    document.getElementById('save-client-download-policy-btn')?.addEventListener('click', () => {
        saveSelectedClientDownloadPolicy();
    });

    // Create Client Logic
    const addClientBtn = document.getElementById('add-client-btn');
    const createClientModal = document.getElementById('create-client-modal');
    if (addClientBtn) {
        addClientBtn.addEventListener('click', () => {
            createClientModal.style.display = 'flex';
        });
    }
    document.getElementById('close-create-client')?.addEventListener('click', () => {
        createClientModal.style.display = 'none';
    });
    document.getElementById('create-client-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = document.getElementById('new-cli-name').value;
        const cognome = document.getElementById('new-cli-surname').value;
        const tg = document.getElementById('new-cli-tg').value;
        const assignedAdminWlId = (document.getElementById('new-cli-admin-wl')?.value || '').trim() || null;
        const piano = document.getElementById('new-cli-plan').value;
        const days = Number(document.getElementById('new-cli-days')?.value || 30);

        if (hasBackendAuth()) {
            try {
                const client = await apiFetch('/admin/clients', {
                    method: 'POST',
                    body: JSON.stringify({
                        full_name: `${nome} ${cognome}`.trim(),
                        email: `pending+${Date.now()}@softibridge.local`,
                        telegram_username: tg,
                        admin_wl_id: assignedAdminWlId,
                        country_code: 'IT',
                        fiscal_profile: {}
                    })
                });
                const lic = await apiFetch('/admin/licenses', {
                    method: 'POST',
                    body: JSON.stringify({ client_id: client.id, plan_code: piano, days })
                });
                mockClients.unshift({
                    id: client.id, nome, cognome, telegram: tg, email: client.email || "n/a", tel: "---",
                    licenza: lic.id, piano: lic.plan_code, scadenza: (lic.expiry_at || '').split('T')[0] || "N/D",
                    stato: (lic.status || "ACTIVE").toUpperCase(), admin_id: client.admin_wl_id || "UNASSIGNED", admin_brand: (wlNetwork.find(w => w.id === client.admin_wl_id)?.brand || null)
                });
                currentLicenses.unshift({
                    id: lic.id, type: lic.plan_code, status: (lic.status || '').toLowerCase(), accounts: [],
                    expiry: (lic.expiry_at || '').split('T')[0] || '---', install_id: lic.install_id || null
                });
                renderClients();
                renderLicenses();
                createClientModal.style.display = 'none';
                e.target.reset();
                logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'API', status: 'success', msg: `Client+License created ${client.id} / ${lic.id}` });
                injectLogs();
                alert(`✅ Cliente e licenza creati via API\n\nCliente: ${client.full_name}\nLicenza: ${lic.id}`);
                return;
            } catch (err) {
                alert(`Errore backend creazione cliente/licenza: ${err.message}`);
            }
        }

        const newId = `CLI-00${mockClients.length + 1}`;
        const newLic = `SB-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

        mockClients.unshift({
            id: newId, nome, cognome, telegram: tg, email: "pending@email.com", tel: "---",
            licenza: newLic, piano: piano, scadenza: "2026-06-30", stato: "ACTIVE", admin_id: assignedAdminWlId || "L0-SYSTEM", admin_brand: (wlNetwork.find(w => w.id === assignedAdminWlId)?.brand || null)
        });

        renderClients();
        createClientModal.style.display = 'none';
        e.target.reset();

        logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'CRM', status: 'success', msg: `New Client ${nome} ${cognome} created (${newLic})` });
        if (document.getElementById('live-logs-body')) injectLogs();

        alert(`✅ Cliente inserito!\n\nLicenza: ${newLic}\nPiano: ${piano}\nTelegram: ${tg}`);
    });


    const revenueTableBody = document.getElementById('revenue-table-body');
    const mockRevenue = [
        { date: "2026-02-21", id: "SB-A9B2", total: 109, l0: 21.8, l1: 76.3, aff: 10.9 },
        { date: "2026-02-22", id: "SB-X9Z8", total: 199, l0: 39.8, l1: 139.3, aff: 19.9 },
        { date: "2026-02-22", id: "SB-B2C3", total: 59, l0: 11.8, l1: 41.3, aff: 5.9 }
    ];

    let adminFeeReportCache = { summary: null, rows: [] };

    function setAdminFeeReportStats(summary = {}) {
        const toEuro = (cents) => `€${(Number(cents || 0) / 100).toFixed(2)}`;
        const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
        setText('admin-fee-total', toEuro(summary.total_amount_cents || 0));
        setText('admin-fee-l0', toEuro(summary.l0_amount_cents || 0));
        setText('admin-fee-l1', toEuro(summary.l1_amount_cents || 0));
        setText('admin-fee-l2', toEuro(summary.l2_amount_cents || 0));
        setText('admin-fee-payments-count', `${Number(summary.payments_count || 0)} pagamenti`);
        setText('admin-fee-admins-count', `${Number(summary.admins_count || 0)} Admin WL`);
        setText('admin-fee-clients-count', `${Number(summary.clients_count || 0)} clienti unici`);
    }

    function renderAdminFeeReportTableRows(rows = []) {
        if (!revenueTableBody) return;
        if (!rows.length) {
            revenueTableBody.innerHTML = `<tr><td colspan="6" style="color:var(--text-dim);">Nessun dato fee disponibile per gli Admin WL.</td></tr>`;
            return;
        }
        revenueTableBody.innerHTML = rows.map(rev => `
            <tr>
                <td>${escapeHtml(rev.last_payment_at ? new Date(rev.last_payment_at).toLocaleDateString('it-IT') : (rev.date || '-'))}</td>
                <td><span class="code">${escapeHtml(rev.admin_wl_id || rev.id || 'UNASSIGNED')}</span><div style="font-size:.72rem;color:var(--text-dim);">${escapeHtml(rev.admin_brand_name || rev.label || 'Senza Admin')}</div></td>
                <td><strong>€${Number(((rev.total_amount_cents ?? null) !== null ? (rev.total_amount_cents / 100) : (rev.total || 0))).toFixed(2)}</strong><div style="font-size:.72rem;color:var(--text-dim);">${Number(rev.payments_count || rev.count || 0)} pag.</div></td>
                <td>€${Number(((rev.l0_amount_cents ?? null) !== null ? (rev.l0_amount_cents / 100) : (rev.l0 || 0))).toFixed(2)}</td>
                <td>€${Number(((rev.l1_amount_cents ?? null) !== null ? (rev.l1_amount_cents / 100) : (rev.l1 || 0))).toFixed(2)}</td>
                <td>€${Number(((rev.l2_amount_cents ?? null) !== null ? (rev.l2_amount_cents / 100) : (rev.aff || 0))).toFixed(2)}</td>
            </tr>
        `).join('');
    }

    function buildAdminFeeReportFromClientPaymentsCache() {
        const agg = new Map();
        (clientPaymentsArchiveCache || []).forEach(p => {
            const status = String(p?.status || '').toUpperCase();
            if (!['PAID', 'SUCCEEDED'].includes(status)) return;
            const adminId = p?.client?.admin_wl_id || 'UNASSIGNED';
            const adminBrand = (wlNetwork.find(w => w.id === adminId)?.brand) || (adminId === 'UNASSIGNED' ? 'Senza Admin' : adminId);
            const amountCents = Number(p?.amount_cents || 0);
            if (!(amountCents > 0)) return;
            const wl = wlNetwork.find(w => w.id === adminId);
            const l1Pct = Number.isFinite(Number(wl?.fee_pct)) ? Math.round(Number(wl.fee_pct) * 100) : 70;
            const l2Pct = 10;
            const l0Pct = Math.max(0, 100 - l1Pct - l2Pct);
            const rec = agg.get(adminId) || {
                admin_wl_id: adminId === 'UNASSIGNED' ? null : adminId,
                admin_brand_name: adminBrand,
                fee_pct_l0: l0Pct,
                fee_pct_l1: l1Pct,
                fee_pct_l2: l2Pct,
                total_amount_cents: 0,
                l0_amount_cents: 0,
                l1_amount_cents: 0,
                l2_amount_cents: 0,
                payments_count: 0,
                clients_count: 0,
                _client_ids: new Set(),
                last_payment_at: p?.paid_at || p?.created_at || null,
            };
            rec.total_amount_cents += amountCents;
            rec.l0_amount_cents += Math.round(amountCents * (l0Pct / 100));
            rec.l1_amount_cents += Math.round(amountCents * (l1Pct / 100));
            rec.l2_amount_cents += Math.round(amountCents * (l2Pct / 100));
            rec.payments_count += 1;
            if (p?.client?.id) rec._client_ids.add(p.client.id);
            const ts = p?.paid_at || p?.created_at || null;
            if (ts && (!rec.last_payment_at || ts > rec.last_payment_at)) rec.last_payment_at = ts;
            agg.set(adminId, rec);
        });
        const rows = Array.from(agg.values()).map(r => ({
            ...r,
            clients_count: r._client_ids.size,
            _client_ids: undefined,
        })).sort((a, b) => (b.total_amount_cents || 0) - (a.total_amount_cents || 0));
        const summary = {
            admins_count: rows.length,
            payments_count: rows.reduce((s, r) => s + Number(r.payments_count || 0), 0),
            clients_count: rows.reduce((s, r) => s + Number(r.clients_count || 0), 0),
            total_amount_cents: rows.reduce((s, r) => s + Number(r.total_amount_cents || 0), 0),
            l0_amount_cents: rows.reduce((s, r) => s + Number(r.l0_amount_cents || 0), 0),
            l1_amount_cents: rows.reduce((s, r) => s + Number(r.l1_amount_cents || 0), 0),
            l2_amount_cents: rows.reduce((s, r) => s + Number(r.l2_amount_cents || 0), 0),
        };
        return { summary, rows };
    }

    function exportAdminFeeReportCsv() {
        const rows = Array.isArray(adminFeeReportCache?.rows) ? adminFeeReportCache.rows : [];
        if (!rows.length) {
            toast('Nessun dato da esportare nel Report Fee Admin.', 'warning', 3000);
            return;
        }
        const header = ['admin_wl_id', 'brand', 'payments_count', 'clients_count', 'total_eur', 'l0_eur', 'l1_eur', 'l2_eur', 'last_payment_at'];
        const lines = rows.map(r => ([
            r.admin_wl_id || 'UNASSIGNED',
            r.admin_brand_name || '',
            Number(r.payments_count || 0),
            Number(r.clients_count || 0),
            (Number(r.total_amount_cents || 0) / 100).toFixed(2),
            (Number(r.l0_amount_cents || 0) / 100).toFixed(2),
            (Number(r.l1_amount_cents || 0) / 100).toFixed(2),
            (Number(r.l2_amount_cents || 0) / 100).toFixed(2),
            r.last_payment_at || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')));
        const csv = [header.join(','), ...lines].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `softibridge_admin_fee_report_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    async function injectRevenue() {
        if (!revenueTableBody) return;
        try {
            if (hasBackendAuth()) {
                const report = await apiFetch('/admin/wl/fee-report');
                const summary = report?.summary || {};
                const rows = Array.isArray(report?.rows) ? report.rows : [];
                adminFeeReportCache = { summary, rows };
                setAdminFeeReportStats(summary);
                renderAdminFeeReportTableRows(rows);
                return;
            }
        } catch (err) {
            console.warn('Admin fee report backend fetch failed, fallback cache/mock:', err);
        }

        const fallback = hasBackendAuth()
            ? buildAdminFeeReportFromClientPaymentsCache()
            : {
                summary: {
                    admins_count: mockRevenue.length,
                    payments_count: mockRevenue.reduce((s, r) => s + Number(r.count || 1), 0),
                    clients_count: mockRevenue.length,
                    total_amount_cents: Math.round(mockRevenue.reduce((s, r) => s + Number(r.total || 0), 0) * 100),
                    l0_amount_cents: Math.round(mockRevenue.reduce((s, r) => s + Number(r.l0 || 0), 0) * 100),
                    l1_amount_cents: Math.round(mockRevenue.reduce((s, r) => s + Number(r.l1 || 0), 0) * 100),
                    l2_amount_cents: Math.round(mockRevenue.reduce((s, r) => s + Number(r.aff || 0), 0) * 100),
                },
                rows: mockRevenue.map(rev => ({
                    id: rev.id,
                    admin_wl_id: rev.id,
                    admin_brand_name: rev.id,
                    total_amount_cents: Math.round(Number(rev.total || 0) * 100),
                    l0_amount_cents: Math.round(Number(rev.l0 || 0) * 100),
                    l1_amount_cents: Math.round(Number(rev.l1 || 0) * 100),
                    l2_amount_cents: Math.round(Number(rev.aff || 0) * 100),
                    payments_count: Number(rev.count || 1),
                    clients_count: 1,
                    last_payment_at: rev.date,
                }))
            };
        adminFeeReportCache = fallback;
        setAdminFeeReportStats(fallback.summary);
        renderAdminFeeReportTableRows(fallback.rows);
    }

    // =========================================================
    // === GESTIONE VPS
    // =========================================================
    let mockVPS = [
        { id: "S1-CONT-FRA", provider: "Contabo", ip: "173.20.12.88", location: "Frankfurt, DE", allocs: 18, res: "25%", status: "ONLINE" },
        { id: "S2-AWS-LON", provider: "AWS", ip: "54.120.44.12", location: "London, UK", allocs: 34, res: "48%", status: "ONLINE" },
        { id: "S3-HTS-NY", provider: "Hostinger", ip: "109.11.23.4", location: "New York, US", allocs: 6, res: "12%", status: "ONLINE" },
        { id: "S4-DGO-AMS", provider: "DigitalOcean", ip: "188.166.50.2", location: "Amsterdam, NL", allocs: 0, res: "2%", status: "PROVISIONING" }
    ];

    async function syncVpsFromBackend() {
        if (!hasBackendAuth()) return false;
        try {
            const rows = await apiFetch('/admin/vps/nodes');
            if (Array.isArray(rows) && rows.length) {
                mockVPS = rows.map(v => ({
                    id: v.id,
                    provider: v.provider,
                    ip: v.ip,
                    location: v.location,
                    allocs: Number(v.allocs || 0),
                    res: String(v.res || '0%'),
                    status: String(v.status || 'PROVISIONING').toUpperCase(),
                }));
            }
            return true;
        } catch (err) {
            console.warn('VPS backend sync failed:', err);
            return false;
        }
    }

    async function renderVPS() {
        const vpsBody = document.getElementById('vps-table-body');
        if (!vpsBody) return;
        await syncVpsFromBackend();
        document.getElementById('vps-count-stat').textContent = mockVPS.length;

        vpsBody.innerHTML = mockVPS.map(v => `
            <tr>
                <td><span class="code">${v.id}</span></td>
                <td><span style="font-family:monospace; color:var(--accent);">${v.ip}</span></td>
                <td>${v.location}</td>
                <td>${v.allocs} Clienti</td>
                <td>
                    <div style="background:rgba(255,255,255,0.1); border-radius:10px; height:6px; width:60px; overflow:hidden; display:inline-block; margin-right:8px; vertical-align:middle;">
                        <div style="background:${parseInt(v.res) > 70 ? 'var(--warning-color)' : 'var(--accent)'}; width:${v.res}; height:100%;"></div>
                    </div> ${v.res}
                </td>
                <td><span class="status-badge ${v.status === 'ONLINE' ? 'active' : 'warning'}">${v.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="alert('Dettaglio VPS ${v.id}\\n\\nProvider: ${v.provider}\\nIP: ${v.ip}')">⚙️</button>
                    <button class="btn btn-sm btn-warning" onclick="rebootVpsNode('${v.id}')">🔄</button>
                </td>
            </tr>
        `).join('');
    }

    window.rebootVpsNode = async function (nodeId) {
        if (!confirm(`Riavviare server ${nodeId}?`)) return;
        if (hasBackendAuth()) {
            try {
                await apiFetch(`/admin/vps/nodes/${encodeURIComponent(nodeId)}/reboot`, { method: 'POST' });
                toast(`Comando reboot inviato per ${nodeId}`, 'success', 3200);
                await renderVPS();
                return;
            } catch (err) {
                toast(`Errore reboot VPS: ${err.message}`, 'error', 4200);
                return;
            }
        }
        toast('Comando reboot simulato (login backend richiesto).', 'warning', 3000);
    };

    const addVpsBtn = document.getElementById('add-vps-btn');
    if (addVpsBtn) {
        addVpsBtn.addEventListener('click', () => {
            document.getElementById('vps-modal').style.display = 'flex';
        });
    }

    document.getElementById('vps-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const provider = (document.getElementById('vps-provider')?.value || 'Custom').trim() || 'Custom';
        const ip = (document.getElementById('vps-ip')?.value || '').trim() || null;
        const location = (document.getElementById('vps-location')?.value || 'Auto').trim() || 'Auto';
        const notes = (document.getElementById('vps-notes')?.value || '').trim() || null;
        if (hasBackendAuth()) {
            try {
                await apiFetch('/admin/vps/nodes/provision', {
                    method: 'POST',
                    body: JSON.stringify({ provider, ip, location, notes })
                });
                toast('Richiesta provisioning VPS inviata al backend.', 'success', 3200);
                document.getElementById('vps-modal').style.display = 'none';
                e.target.reset();
                await renderVPS();
                logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'INFRA', status: 'info', msg: 'Nuova VPS in provisioning (backend).' });
                if (document.getElementById('live-logs-body')) injectLogs();
                return;
            } catch (err) {
                toast(`Errore provisioning VPS: ${err.message}`, 'error', 4200);
                return;
            }
        }
        document.getElementById('vps-modal').style.display = 'none';
        mockVPS.push({ id: "S5-NEW", provider, ip: ip || "Pending..", location, allocs: 0, res: "0%", status: "PROVISIONING" });
        renderVPS();
        logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'INFRA', status: 'warning', msg: 'Nuova VPS in provisioning (simulata).' });
        if (document.getElementById('live-logs-body')) injectLogs();
    });

    // =========================================================
    // === NETWORK 3 LIVELLI — L0 / L1 (Admin) / L2 (Affiliati)
    // =========================================================

    let wlNetwork = [
        {
            id: "WL-8892", name: "Carlo Rossi", brand: "Alpha Signals",
            status: "ACTIVE", fee_pct: 0.70, volume: 15400,
            affiliates: [
                { id: "AFF-A1", name: "Marco Verdi", ref_code: "REF-MARC-A3F9", fee_pct: 0.10, status: "ACTIVE" },
                { id: "AFF-A2", name: "Sara Bianchi", ref_code: "REF-SARA-B2E1", fee_pct: 0.10, status: "ACTIVE" },
            ]
        },
        {
            id: "WL-1123", name: "Luca Ferri", brand: "Beta Quant",
            status: "ACTIVE", fee_pct: 0.65, volume: 8900,
            affiliates: [
                { id: "AFF-B1", name: "Giulia Mori", ref_code: "REF-GIUL-C7D2", fee_pct: 0.12, status: "ACTIVE" },
                { id: "AFF-B2", name: "Enzo Testa", ref_code: "REF-ENZO-D4F8", fee_pct: 0.08, status: "ACTIVE" },
                { id: "AFF-B3", name: "Anna De Luca", ref_code: "REF-ANNA-E9B5", fee_pct: 0.10, status: "ACTIVE" },
            ]
        }
    ];
    let adminWlBackendCache = [];
    const adminWlDetailCache = new Map();

    let currentAdminDetailId = null;

    function computeAdminVolumeMapFromPayments() {
        const map = new Map();
        (clientPaymentsArchiveCache || []).forEach(p => {
            const adminId = p?.client?.admin_wl_id || 'UNASSIGNED';
            const status = String(p?.status || '').toUpperCase();
            const amount = Number(p?.amount_cents || 0) / 100;
            if (!Number.isFinite(amount)) return;
            if (!['PAID', 'SUCCEEDED'].includes(status)) return;
            map.set(adminId, (map.get(adminId) || 0) + amount);
        });
        return map;
    }

    function renderAdminClientSelectors() {
        const sel = document.getElementById('new-cli-admin-wl');
        if (!sel) return;
        const current = sel.value;
        const opts = [`<option value="">Senza Admin</option>`]
            .concat(wlNetwork.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.brand || a.name || a.id)} · ${escapeHtml(a.status || '-')}</option>`));
        sel.innerHTML = opts.join('');
        if (current && [...sel.options].some(o => o.value === current)) sel.value = current;
    }

    function renderWLNetwork() {
        const wlBody = document.getElementById('wl-table-body');
        if (!wlBody) return;

        // Update stats
        const trackedVolume = wlNetwork.reduce((s, a) => s + Number(a.volume || 0), 0);
        const riskCount = wlNetwork.filter(a => ['PENDING_PAYMENT', 'GRACE_PERIOD', 'PAST_DUE', 'SUSPENDED'].includes(String(a.status || '').toUpperCase())).length;
        document.getElementById('wl-count').textContent = wlNetwork.length;
        document.getElementById('wl-l0-profit').textContent = `€${trackedVolume.toLocaleString('it-IT', { minimumFractionDigits: 0 })}`;
        const riskEl = document.getElementById('wl-risk-count');
        if (riskEl) riskEl.textContent = riskCount;
        const wlCountShadow = document.getElementById('wl-count-shadow');
        const wlAffShadow = document.getElementById('wl-aff-count-shadow');
        if (wlCountShadow) wlCountShadow.textContent = wlNetwork.length;
        if (wlAffShadow) wlAffShadow.textContent = riskCount;

        wlBody.innerHTML = wlNetwork.map(admin => `
            <tr>
                <td><span class="code">${admin.id}</span></td>
                <td><strong>${admin.brand}</strong></td>
                <td style="color: var(--text-dim); font-size:0.85rem;">${admin.name || '—'}<div style="font-size:.72rem;opacity:.7;">${escapeHtml(admin.plan_code || '')}</div></td>
                <td><span class="status-badge ${String(admin.status || '').toUpperCase() === 'ACTIVE' ? 'active' : (String(admin.status || '').toUpperCase().includes('GRACE') ? 'warning' : 'revoked')}">${admin.status}</span></td>
                <td><strong>${(Number(admin.fee_pct || 0) * 100).toFixed(0)}%</strong> <span style="opacity:0.5; font-size:0.8rem;">(L0 prende ${Math.max(0, ((1 - Number(admin.fee_pct || 0) - 0.10) * 100)).toFixed(0)}%)</span></td>
                <td><span class="status-badge">${admin.affiliates.length} attivi</span>${typeof admin.clients_count === 'number' ? `<div style="font-size:.72rem;color:var(--text-dim);">${admin.clients_count} clienti</div>` : ''}</td>
                <td>€${Number(admin.volume || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="openAdminDetail('${admin.id}')">📊 Dettaglio</button>
                </td>
            </tr>
        `).join('');
        renderAdminClientSelectors();
    }

    function renderAdminDetailModal(admin, detail = null) {
        currentAdminDetailId = admin.id;
        document.getElementById('admin-detail-title').textContent = `📊 ${admin.brand} (${admin.id})`;
        document.getElementById('detail-fee').textContent = `${(Number(admin.fee_pct || 0) * 100).toFixed(0)}%`;
        document.getElementById('detail-volume').textContent = `€${Number(admin.volume || 0).toLocaleString('it-IT')}`;
        document.getElementById('detail-affiliates').textContent = admin.affiliates.length;
        const metaEl = document.getElementById('admin-detail-meta');
        if (metaEl) {
            const sub = detail?.admin_wl?.subscription || admin.subscription || null;
            const limits = detail?.admin_wl?.limits || admin.limits || {};
            const history = detail?.status_history || [];
            const grace = sub?.grace_until ? ` · Grace fino a ${new Date(sub.grace_until).toLocaleString('it-IT')}` : '';
            metaEl.innerHTML = `
                <strong>Stato:</strong> ${escapeHtml(admin.status || '-')} ·
                <strong>Piano:</strong> ${escapeHtml(admin.plan_code || admin.admin_plan_code || '-')} ·
                <strong>Contatto:</strong> ${escapeHtml(admin.email || '-')} ·
                <strong>Clienti max:</strong> ${escapeHtml((limits.max_clients ?? '—').toString())} ·
                <strong>Licenze max:</strong> ${escapeHtml((limits.max_active_licenses ?? '—').toString())}
                ${grace}
                ${history.length ? `<div style="margin-top:.35rem; font-size:.78rem; color:var(--text-dim);">Ultimo evento: ${escapeHtml(history[0].to_status || '')} · ${escapeHtml(history[0].reason || '')}</div>` : ''}
            `;
        }

        const affBody = document.getElementById('affiliates-table-body');
        affBody.innerHTML = admin.affiliates.length ? admin.affiliates.map(aff => `
            <tr>
                <td><span class="code">${aff.id}</span></td>
                <td>${aff.name}</td>
                <td>
                    <span class="code" style="font-size:0.75rem; color: var(--accent);">${aff.ref_code}</span>
                    <button onclick="copyReferral('${aff.ref_code}')" class="btn btn-sm" style="margin-left:6px; padding:2px 8px; font-size:0.7rem;">📋</button>
                </td>
                <td><strong>${(aff.fee_pct * 100).toFixed(0)}%</strong></td>
                <td><span class="status-badge ${aff.status.toLowerCase()}">${aff.status}</span></td>
            </tr>
        `).join('') : `<tr><td colspan="5" style="color:var(--text-dim);">Nessun affiliato collegato (backend affiliati non ancora integrato in questa build).</td></tr>`;

        ['admin-detail-activate-btn', 'admin-detail-grace-btn', 'admin-detail-suspend-btn', 'admin-detail-revoke-btn'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.disabled = !!(admin && admin.backend === false);
            btn.title = btn.disabled ? 'Disponibile solo con backend reale' : '';
        });

        document.getElementById('admin-detail-modal').style.display = 'flex';
    }

    async function openAdminDetail(adminId) {
        const admin = wlNetwork.find(a => a.id === adminId);
        if (!admin) return;
        currentAdminDetailId = adminId;
        if (hasBackendAuth() && admin.backend) {
            try {
                const detail = await apiFetch(`/admin/wl/admins/${encodeURIComponent(adminId)}`);
                adminWlDetailCache.set(adminId, detail);
                const full = detail?.admin_wl ? {
                    ...admin,
                    status: detail.admin_wl.status,
                    plan_code: detail.admin_wl.admin_plan_code,
                    email: detail.admin_wl.email,
                    subscription: detail.admin_wl.subscription || null,
                    limits: detail.admin_wl.limits || {},
                } : admin;
                renderAdminDetailModal(full, detail);
                return;
            } catch (err) {
                console.warn('Admin detail backend failed:', err);
                toast(`Dettaglio Admin backend non disponibile: ${err.message}`, 'warning', 3400);
            }
        }
        renderAdminDetailModal(admin, null);
    }

    function copyReferral(refCode) {
        const link = `https://softibridge.com/buy?ref=${refCode}`;
        navigator.clipboard.writeText(link).then(() => {
            alert(`✅ Link Referral copiato!\n\n${link}\n\nCondividilo con l'affiliato per tracciare le vendite.`);
        }).catch(() => {
            alert(`Link Referral: https://softibridge.com/buy?ref=${refCode}`);
        });
    }

    window.openAdminDetail = openAdminDetail;
    window.copyReferral = copyReferral;

    // Create Admin Form
    const createAdminBtn = document.getElementById('create-admin-btn');
    const createAdminModal = document.getElementById('create-admin-modal');
    const refreshWlBtn = document.getElementById('refresh-wl-network-btn');

    async function promptRolePromotion() {
        if (!hasBackendAuth()) {
            toast('Effettua login come Super Admin per promuovere utenti.', 'warning', 3600);
            return;
        }
        const emailRaw = prompt('Email utente Clerk da promuovere:', '');
        if (!emailRaw) return;
        const email = emailRaw.trim().toLowerCase();
        if (!email || !email.includes('@')) {
            toast('Email non valida.', 'error', 2800);
            return;
        }
        const roleRaw = prompt('Ruolo target: ADMIN_WL o SUPER_ADMIN', 'ADMIN_WL');
        if (!roleRaw) return;
        const role = roleRaw.trim().toUpperCase();
        if (!['ADMIN_WL', 'SUPER_ADMIN', 'CLIENT', 'AFFILIATE'].includes(role)) {
            toast('Ruolo non supportato. Usa ADMIN_WL o SUPER_ADMIN.', 'error', 3600);
            return;
        }
        try {
            const out = await apiFetch('/admin/users/assign-role', {
                method: 'POST',
                body: JSON.stringify({ email, role }),
            });
            toast(`Ruolo aggiornato: ${out.user?.email} -> ${out.user?.role}`, 'success', 3600);
            await syncAdminFromBackend();
        } catch (err) {
            toast(`Promozione fallita: ${err.message}`, 'error', 4200);
        }
    }

    if (refreshWlBtn && !document.getElementById('promote-user-btn')) {
        const promoteBtn = document.createElement('button');
        promoteBtn.id = 'promote-user-btn';
        promoteBtn.className = 'btn btn-secondary btn-sm';
        promoteBtn.textContent = '⬆️ Promuovi Utente';
        promoteBtn.title = 'Promuovi utente Clerk a ADMIN_WL o SUPER_ADMIN';
        promoteBtn.addEventListener('click', promptRolePromotion);
        refreshWlBtn.parentElement?.appendChild(promoteBtn);
    }

    if (createAdminBtn) {
        createAdminBtn.addEventListener('click', () => {
            createAdminModal.style.display = 'flex';
        });
    }
    document.getElementById('close-create-admin')?.addEventListener('click', () => {
        createAdminModal.style.display = 'none';
    });
    document.getElementById('create-admin-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('admin-email-input').value.trim();
        const name = document.getElementById('admin-name-input').value;
        const brand = document.getElementById('admin-brand-input').value;
        const adminPlanCode = (document.getElementById('admin-plan-select')?.value || 'BASIC').toUpperCase();
        const feePct = parseFloat(document.getElementById('admin-fee-select').value);
        const l0cut = ((1 - feePct - 0.10) * 100).toFixed(0);
        if (hasBackendAuth()) {
            try {
                const res = await apiFetch('/admin/wl/admins', {
                    method: 'POST',
                    body: JSON.stringify({
                        email,
                        contact_name: name,
                        brand_name: brand,
                        admin_plan_code: adminPlanCode,
                        fee_pct_l1: Math.round(feePct * 100)
                    })
                });
                const row = res?.admin_wl;
                logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'L0', status: 'success', msg: `ADMIN_WL_CREATED ${row?.id || ''} ${brand}` });
                injectLogs();
                createAdminModal.style.display = 'none';
                e.target.reset();
                await syncAdminFromBackend();
                if (!res?.role_sync?.updated) {
                    toast('Admin WL creato. Ruolo utente non aggiornato: l\'utente deve prima registrarsi su Clerk, poi usa "Promuovi Utente".', 'warning', 5200);
                } else {
                    toast(`Ruolo aggiornato automaticamente: ${email} -> ADMIN_WL`, 'success', 4200);
                }
                toast(`Admin WL creato: ${row?.brand_name || brand}`, 'success', 3200);
                return;
            } catch (err) {
                toast(`Errore creazione Admin WL: ${err.message}`, 'error', 4200);
                return;
            }
        }

        const newId = `WL-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
        wlNetwork.push({ id: newId, email, name, brand, status: "PENDING_PAYMENT", fee_pct: feePct, plan_code: adminPlanCode, volume: 0, affiliates: [], backend: false });
        renderWLNetwork();
        createAdminModal.style.display = 'none';
        e.target.reset();
        const logMsg = `ADMIN_CREATED: ${brand} (${newId}) | Fee L1: ${(feePct * 100).toFixed(0)}% | L0 Cut: ${l0cut}%`;
        logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'L0', status: 'success', msg: logMsg });
        alert(`✅ Admin "${brand}" creato in DEMO!\n\nID: ${newId}\nPiano: ${adminPlanCode}\nFee L1: ${(feePct * 100).toFixed(0)}%\nL0 Quota: ${l0cut}%`);
    });

    // Close Admin Detail
    document.getElementById('close-admin-detail')?.addEventListener('click', () => {
        document.getElementById('admin-detail-modal').style.display = 'none';
    });

    async function adminDetailLifecycle(action, reasonPrompt) {
        if (!currentAdminDetailId) return;
        const admin = wlNetwork.find(a => a.id === currentAdminDetailId);
        if (!admin) return;
        if (!hasBackendAuth() || !admin.backend) {
            toast(`Azione ${action} disponibile solo con backend reale`, 'warning', 3200);
            return;
        }
        const reason = prompt(reasonPrompt || `Motivo ${action} (opzionale):`, '') || '';
        const body = { reason: reason || null };
        if (action === 'force-grace') body.grace_days = 7;
        try {
            await apiFetch(`/admin/wl/admins/${encodeURIComponent(currentAdminDetailId)}/${action}`, {
                method: 'POST',
                body: JSON.stringify(body),
            });
            toast(`Admin ${currentAdminDetailId}: ${action}`, 'success', 3000);
            await syncAdminFromBackend();
            await openAdminDetail(currentAdminDetailId);
        } catch (err) {
            toast(`Lifecycle admin: ${err.message}`, 'error', 4200);
        }
    }
    document.getElementById('admin-detail-activate-btn')?.addEventListener('click', () => adminDetailLifecycle('activate', 'Motivo attivazione (opzionale):'));
    document.getElementById('admin-detail-grace-btn')?.addEventListener('click', () => adminDetailLifecycle('force-grace', 'Motivo grace period (opzionale):'));
    document.getElementById('admin-detail-suspend-btn')?.addEventListener('click', () => adminDetailLifecycle('suspend', 'Motivo sospensione (opzionale):'));
    document.getElementById('admin-detail-revoke-btn')?.addEventListener('click', () => adminDetailLifecycle('revoke', 'Motivo revoca (opzionale):'));

    // Add Affiliate Button (inside Admin Detail)
    document.getElementById('add-affiliate-btn')?.addEventListener('click', () => {
        if (hasBackendAuth()) {
            toast('Gestione affiliati backend per Admin WL non ancora completata in questa build. Sezione separata da implementare.', 'warning', 4200);
            return;
        }
        document.getElementById('admin-detail-modal').style.display = 'none';
        document.getElementById('create-affiliate-modal').style.display = 'flex';
    });

    // Create Affiliate Form
    document.getElementById('close-create-affiliate')?.addEventListener('click', () => {
        document.getElementById('create-affiliate-modal').style.display = 'none';
        if (currentAdminDetailId) openAdminDetail(currentAdminDetailId);
    });
    document.getElementById('create-affiliate-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('affiliate-name-input').value;
        const feePct = parseFloat(document.getElementById('affiliate-fee-select').value);
        const admin = wlNetwork.find(a => a.id === currentAdminDetailId);
        if (!admin) return;

        const namePrefix = name.split(' ')[0].substring(0, 4).toUpperCase();
        const refCode = `REF-${namePrefix}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
        const affId = `AFF-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

        admin.affiliates.push({ id: affId, name, ref_code: refCode, fee_pct: feePct, status: "ACTIVE" });
        renderWLNetwork();
        document.getElementById('create-affiliate-modal').style.display = 'none';
        e.target.reset();

        const refLink = `https://softibridge.com/buy?ref=${refCode}`;
        logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'L1', status: 'success', msg: `AFFILIATE_CREATED: ${name} (${refCode}) fee=${(feePct * 100).toFixed(0)}%` });

        alert(`✅ Affiliato "${name}" creato!\n\nRef Code: ${refCode}\nFee L2: ${(feePct * 100).toFixed(0)}%\n\nLink referral:\n${refLink}`);
        openAdminDetail(currentAdminDetailId);
    });

    // =========================================================
    // === MODULI FINANZA NETWORK (separati)
    // =========================================================
    const feeRulesState = { l0: 20, l1: 70, l2: 10 };
    let feeInvoicesCache = [];

    function buildAffiliationRows() {
        const rows = [];
        wlNetwork.forEach(admin => {
            admin.affiliates.forEach((aff, idx) => {
                const matured = Math.round((admin.volume * (aff.fee_pct || 0)) / Math.max(admin.affiliates.length, 1) * 100) / 100;
                rows.push({
                    adminId: admin.id,
                    adminBrand: admin.brand,
                    affiliateId: aff.id,
                    affiliateName: aff.name,
                    refCode: aff.ref_code,
                    feePct: aff.fee_pct,
                    status: aff.status,
                    matured
                });
            });
        });
        return rows;
    }

    function renderAffiliation() {
        const tbody = document.getElementById('affiliation-table-body');
        if (!tbody) return;
        const rows = buildAffiliationRows();
        document.getElementById('aff-total-count').textContent = rows.length;
        document.getElementById('aff-active-count').textContent = rows.filter(r => r.status === 'ACTIVE').length;
        document.getElementById('aff-ref-count').textContent = rows.filter(r => r.refCode).length;
        document.getElementById('aff-fee-total').textContent = `€${rows.reduce((s, r) => s + r.matured, 0).toFixed(2)}`;
        tbody.innerHTML = rows.map(r => `
            <tr>
                <td><span class="code">${r.adminId}</span> ${r.adminBrand}</td>
                <td>${r.affiliateName} <span style="opacity:.6; font-size:.75rem;">(${r.affiliateId})</span></td>
                <td><span class="code" style="font-size:.75rem;">${r.refCode}</span></td>
                <td><strong>${((r.feePct || 0) * 100).toFixed(0)}%</strong></td>
                <td><span class="status-badge ${String(r.status || '').toLowerCase()}">${r.status}</span></td>
                <td>€${r.matured.toFixed(2)}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="copyReferral('${r.refCode}')">📋 Link</button>
                </td>
            </tr>
        `).join('');
    }

    function renderFeeRulesPanel() {
        const l0 = document.getElementById('fee-rule-l0');
        const l1 = document.getElementById('fee-rule-l1');
        const l2 = document.getElementById('fee-rule-l2');
        if (l0) l0.value = feeRulesState.l0;
        if (l1) l1.value = feeRulesState.l1;
        if (l2) l2.value = feeRulesState.l2;
        const out = document.getElementById('fee-sim-output');
        if (out && out.textContent === 'Pronto.') {
            out.textContent = 'Inserisci i valori e premi "Calcola Split".';
        }
    }

    async function syncFeeRulesFromBackend() {
        if (!hasBackendAuth()) return;
        try {
            const rules = await apiFetch('/admin/wl/fee-rules');
            feeRulesState.l0 = Number(rules.l0 ?? feeRulesState.l0);
            feeRulesState.l1 = Number(rules.l1 ?? feeRulesState.l1);
            feeRulesState.l2 = Number(rules.l2 ?? feeRulesState.l2);
            renderFeeRulesPanel();
        } catch (err) {
            console.warn('Fee rules backend sync failed:', err);
        }
    }

    function calcFeeSplitPreview() {
        const sale = Number(document.getElementById('fee-sim-sale')?.value || 0);
        const l1p = Number(document.getElementById('fee-sim-l1')?.value || 0);
        const l2p = Number(document.getElementById('fee-sim-l2')?.value || 0);
        const l0p = Math.max(0, 100 - l1p - l2p);
        const out = {
            sale_amount_eur: sale,
            split: {
                L0: +(sale * (l0p / 100)).toFixed(2),
                L1: +(sale * (l1p / 100)).toFixed(2),
                L2: +(sale * (l2p / 100)).toFixed(2)
            },
            percentages: { L0: l0p, L1: l1p, L2: l2p },
            valid: (l1p + l2p) <= 100
        };
        const outEl = document.getElementById('fee-sim-output');
        if (outEl) outEl.textContent = JSON.stringify(out, null, 2);
    }

    function buildPayoutRows() {
        const affRows = buildAffiliationRows();
        const nowPeriod = new Date().toISOString().slice(0, 7);
        const wlRows = wlNetwork.map(w => ({
            beneficiary: `${w.brand} (${w.id})`,
            level: 'L1',
            period: nowPeriod,
            amount: +(w.volume * (w.fee_pct || 0)).toFixed(2),
            status: 'PENDING',
            method: 'BANK'
        }));
        const affPayouts = affRows.map(a => ({
            beneficiary: `${a.affiliateName} (${a.affiliateId})`,
            level: 'L2',
            period: nowPeriod,
            amount: +a.matured.toFixed(2),
            status: a.status === 'ACTIVE' ? 'PENDING' : 'ON_HOLD',
            method: 'PAYPAL'
        }));
        return [...wlRows, ...affPayouts].sort((a, b) => b.amount - a.amount);
    }

    function renderFeePayouts() {
        const tbody = document.getElementById('fee-payouts-table-body');
        if (!tbody) return;
        const rows = Array.isArray(window.__softiFeePayoutRows) && window.__softiFeePayoutRows.length
            ? window.__softiFeePayoutRows
            : buildPayoutRows();
        const due = rows.filter(r => r.status === 'PENDING').reduce((s, r) => s + r.amount, 0);
        document.getElementById('fee-payout-due').textContent = `€${due.toFixed(2)}`;
        document.getElementById('fee-payout-paid').textContent = `€${rows.filter(r => r.status === 'PAID').reduce((s, r) => s + r.amount, 0).toFixed(2)}`;
        document.getElementById('fee-payout-pending').textContent = rows.filter(r => r.status === 'PENDING').length;
        document.getElementById('fee-payout-review').textContent = rows.filter(r => r.status === 'ON_HOLD').length;
        tbody.innerHTML = rows.map((r, i) => `
            <tr>
                <td>${r.beneficiary}</td>
                <td><span class="tag">${r.level}</span></td>
                <td>${r.period}</td>
                <td><strong>€${r.amount.toFixed(2)}</strong></td>
                <td><span class="status-badge ${r.status === 'PENDING' ? 'warning' : (r.status === 'PAID' ? 'active' : 'revoked')}">${r.status}</span></td>
                <td>${r.method}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="alert('Dettaglio payout: ${r.beneficiary}\\nImporto: €${r.amount.toFixed(2)}')">👁️</button>
                    <button class="btn btn-sm btn-primary" onclick="markPayoutPaid(${i})" style="margin-left:4px;" ${r.status === 'PAID' ? 'disabled' : ''}>✅</button>
                </td>
            </tr>
        `).join('');
        window.__softiFeePayoutRows = rows;
    }

    async function syncFeePayoutsFromBackend() {
        if (!hasBackendAuth()) return;
        try {
            const period = new Date().toISOString().slice(0, 7);
            const rows = await apiFetch(`/admin/wl/payouts?period=${encodeURIComponent(period)}&limit=2000`);
            if (Array.isArray(rows) && rows.length) {
                window.__softiFeePayoutRows = rows.map(r => ({
                    id: r.id,
                    beneficiary: r.beneficiary,
                    level: r.level,
                    period: r.period,
                    amount: Number(r.amount_cents || 0) / 100,
                    status: r.status,
                    method: r.method,
                }));
                renderFeePayouts();
            }
        } catch (err) {
            console.warn('Fee payouts backend sync failed:', err);
        }
    }

    async function renderAdminWLBillingSection() {
        await Promise.all([
            renderAdminWLBillingAdminSelector(),
            renderAdminWLBillingInvoices()
        ]).catch((err) => console.warn('Billing Admin render error', err));
    }

    async function renderAdminWLBillingPaymentsSection() {
        const paymentsBody = document.getElementById('admin-billing-payments-table-body');
        const manualBody = document.getElementById('admin-manual-payments-table-body');
        if (!paymentsBody || !manualBody) return;
        if (!hasBackendAuth()) {
            paymentsBody.innerHTML = `<tr><td colspan="6" style="color:var(--text-dim);">Login admin richiesto.</td></tr>`;
            manualBody.innerHTML = `<tr><td colspan="6" style="color:var(--text-dim);">Login admin richiesto.</td></tr>`;
            return;
        }
        try {
            const status = (document.getElementById('admin-manual-payments-status-filter')?.value || 'ALL').toUpperCase();
            const qs = new URLSearchParams();
            if (status !== 'ALL') qs.set('status', status);
            const [payments, manual] = await Promise.all([
                apiFetch('/admin/wl/billing/payments?limit=200'),
                apiFetch(`/admin/wl/billing/payments/manual?${qs.toString()}`),
            ]);
            const payRows = Array.isArray(payments) ? payments : [];
            const manualRows = Array.isArray(manual) ? manual : [];
            const paidTotalCents = payRows
                .filter(r => ['PAID', 'SUCCEEDED'].includes(String(r.status || '').toUpperCase()))
                .reduce((s, r) => s + Number(r.amount_cents || 0), 0);
            const setMetric = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
            setMetric('admin-payments-count', String(payRows.length));
            setMetric('admin-payments-total-paid', `€${(paidTotalCents / 100).toFixed(2)}`);
            setMetric('admin-payments-manual-pending', String(manualRows.filter(r => String(r.status || '').toUpperCase() === 'PENDING').length));
            setMetric('admin-payments-manual-approved', String(manualRows.filter(r => String(r.status || '').toUpperCase() === 'APPROVED').length));

            paymentsBody.innerHTML = payRows.length ? payRows.map(r => `
                <tr>
                    <td><strong>${escapeHtml(r.admin_brand_name || 'N/D')}</strong><div style="font-size:.72rem;color:var(--text-dim);">${escapeHtml(r.admin_wl_id || '')}</div></td>
                    <td><span class="code">${escapeHtml(r.invoice_number || '-')}</span></td>
                    <td><span class="tag">${escapeHtml(r.method || '-')}</span></td>
                    <td>${escapeHtml(r.currency || 'EUR')} ${(Number(r.amount_cents || 0) / 100).toFixed(2)}</td>
                    <td><span class="status-badge ${String(r.status || '').toUpperCase() === 'PAID' ? 'active' : 'warning'}">${escapeHtml(r.status || '-')}</span></td>
                    <td>${r.paid_at ? new Date(r.paid_at).toLocaleString('it-IT') : (r.created_at ? new Date(r.created_at).toLocaleString('it-IT') : '-')}</td>
                </tr>
            `).join('') : `<tr><td colspan="6" style="color:var(--text-dim);">Nessun pagamento Admin WL.</td></tr>`;

            manualBody.innerHTML = manualRows.length ? manualRows.map(r => `
                <tr>
                    <td><strong>${escapeHtml(r.admin_wl?.brand_name || 'N/D')}</strong><div style="font-size:.72rem;color:var(--text-dim);">${escapeHtml(r.admin_wl?.id || '')}</div></td>
                    <td><span class="code">${escapeHtml(r.document?.invoice_number || '-')}</span></td>
                    <td><span class="tag">${escapeHtml(r.method || '-')}</span></td>
                    <td style="font-family:monospace;font-size:.75rem;">${escapeHtml(r.reference_code || '-')}</td>
                    <td><span class="status-badge ${String(r.status || '').toUpperCase() === 'APPROVED' ? 'active' : (String(r.status || '').toUpperCase() === 'REJECTED' ? 'revoked' : 'warning')}">${escapeHtml(r.status || '-')}</span></td>
                    <td style="display:flex; gap:6px; flex-wrap:wrap;">
                        ${r.proof_url ? `<a class="btn btn-sm btn-secondary" href="${r.proof_url}" target="_blank">📎 Ricevuta</a>` : ''}
                        ${String(r.status || '').toUpperCase() === 'PENDING' ? `<button class="btn btn-sm btn-secondary" onclick="adminWLBillingApproveManual('${r.id}')">✅ Approva</button>` : ''}
                        ${String(r.status || '').toUpperCase() === 'PENDING' ? `<button class="btn btn-sm btn-warning" onclick="adminWLBillingRejectManual('${r.id}')">❌ Rifiuta</button>` : ''}
                    </td>
                </tr>
            `).join('') : `<tr><td colspan="6" style="color:var(--text-dim);">Nessun pagamento manuale Admin.</td></tr>`;
        } catch (err) {
            paymentsBody.innerHTML = `<tr><td colspan="6" style="color:#f87171;">Errore pagamenti Admin: ${escapeHtml(err.message || err)}</td></tr>`;
            manualBody.innerHTML = `<tr><td colspan="6" style="color:#f87171;">Errore manual payments Admin: ${escapeHtml(err.message || err)}</td></tr>`;
        }
    }

    async function renderAdminWLBillingAdminSelector() {
        const sel = document.getElementById('admin-billing-admin-id');
        if (!sel) return;
        if (!hasBackendAuth()) {
            if (!sel.options.length || sel.options.length === 1) {
                sel.innerHTML = `<option value="">Login backend richiesto</option>`;
            }
            return;
        }
        try {
            const rows = await apiFetch('/admin/wl/admins');
            const current = sel.value;
            sel.innerHTML = `<option value="">Seleziona Admin</option>` + rows.map(r => (
                `<option value="${r.id}">${escapeHtml(r.brand_name || r.contact_name || r.email)} · ${escapeHtml(r.admin_plan_code || '-')} · ${escapeHtml(r.status || '-')}</option>`
            )).join('');
            if (current && [...sel.options].some(o => o.value === current)) sel.value = current;
        } catch (err) {
            console.warn('WL admins fetch failed:', err);
        }
    }

    async function renderAdminWLBillingInvoices() {
        const tbody = document.getElementById('admin-billing-invoices-table-body');
        if (!tbody) return;
        if (!hasBackendAuth()) {
            tbody.innerHTML = `<tr><td colspan="6" style="color:var(--text-dim);">Login admin richiesto per il Billing Admin.</td></tr>`;
            return;
        }
        try {
            const rows = await apiFetch('/admin/wl/billing/invoices?limit=200');
            const setMetric = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
            const rowList = Array.isArray(rows) ? rows : [];
            const paidTotal = rowList.filter(r => String(r.status || '').toUpperCase() === 'PAID').reduce((s, r) => s + Number(r.amount_cents || 0), 0);
            const openTotal = rowList.filter(r => String(r.status || '').toUpperCase() !== 'PAID').reduce((s, r) => s + Number(r.amount_cents || 0), 0);
            const adminIds = new Set(rowList.map(r => r.admin_wl?.id).filter(Boolean));
            setMetric('admin-billing-doc-count', String(rowList.length));
            setMetric('admin-billing-open-total', `€${(openTotal / 100).toFixed(2)}`);
            setMetric('admin-billing-paid-total', `€${(paidTotal / 100).toFixed(2)}`);
            setMetric('admin-billing-admin-count', String(adminIds.size));
            if (!rowList.length) {
                tbody.innerHTML = `<tr><td colspan="6" style="color:var(--text-dim);">Nessuna fattura admin.</td></tr>`;
                return;
            }
            tbody.innerHTML = rowList.map(r => `
                <tr>
                    <td><span class="code">${escapeHtml(r.invoice_number)}</span><div style="font-size:.72rem;color:var(--text-dim);">${escapeHtml(r.document_type || '-')}</div></td>
                    <td><strong>${escapeHtml(r.admin_wl?.brand_name || 'N/D')}</strong><div style="font-size:.72rem;color:var(--text-dim);">${escapeHtml(r.admin_wl?.email || '')}</div></td>
                    <td><span class="tag">${escapeHtml(r.payment_method || '-')}</span></td>
                    <td>${escapeHtml(r.currency || 'EUR')} ${(Number(r.amount_cents || 0) / 100).toFixed(2)}</td>
                    <td><span class="status-badge ${String(r.status || '').toUpperCase() === 'PAID' ? 'active' : (String(r.status || '').toUpperCase().includes('VERIFICATION') ? 'warning' : 'pending')}">${escapeHtml(r.status || '-')}</span></td>
                    <td style="display:flex; gap:6px; flex-wrap:wrap;">
                        ${String(r.status || '').toUpperCase() !== 'PAID' ? `<button class="btn btn-sm btn-warning" onclick="adminWLBillingMarkPaid('${r.invoice_number}')">✅ Segna pagata</button>` : ''}
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" style="color:#f87171;">Errore Billing Admin: ${escapeHtml(err.message || err)}</td></tr>`;
        }
    }

    async function renderAdminWLManualPayments() {
        const tbody = document.getElementById('admin-manual-payments-table-body');
        if (!tbody) return;
        if (!hasBackendAuth()) {
            tbody.innerHTML = `<tr><td colspan="6" style="color:var(--text-dim);">Login admin richiesto.</td></tr>`;
            return;
        }
        try {
            const status = (document.getElementById('admin-manual-payments-status-filter')?.value || 'ALL').toUpperCase();
            const qs = new URLSearchParams();
            if (status !== 'ALL') qs.set('status', status);
            const rows = await apiFetch(`/admin/wl/billing/payments/manual?${qs.toString()}`);
            if (!rows.length) {
                tbody.innerHTML = `<tr><td colspan="6" style="color:var(--text-dim);">Nessun pagamento manuale admin.</td></tr>`;
                return;
            }
            tbody.innerHTML = rows.map(r => `
                <tr>
                    <td><strong>${escapeHtml(r.admin_wl?.brand_name || 'N/D')}</strong><div style="font-size:.72rem;color:var(--text-dim);">${escapeHtml(r.admin_wl?.id || '')}</div></td>
                    <td><span class="code">${escapeHtml(r.document?.invoice_number || '-')}</span></td>
                    <td><span class="tag">${escapeHtml(r.method || '-')}</span></td>
                    <td style="font-family:monospace;font-size:.75rem;">${escapeHtml(r.reference_code || '-')}</td>
                    <td><span class="status-badge ${String(r.status || '').toUpperCase() === 'APPROVED' ? 'active' : (String(r.status || '').toUpperCase() === 'REJECTED' ? 'revoked' : 'warning')}">${escapeHtml(r.status || '-')}</span></td>
                    <td style="display:flex; gap:6px; flex-wrap:wrap;">
                        ${String(r.status || '').toUpperCase() === 'PENDING' ? `<button class="btn btn-sm btn-secondary" onclick="adminWLBillingApproveManual('${r.id}')">✅ Approva</button>` : ''}
                        ${String(r.status || '').toUpperCase() === 'PENDING' ? `<button class="btn btn-sm btn-warning" onclick="adminWLBillingRejectManual('${r.id}')">❌ Rifiuta</button>` : ''}
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" style="color:#f87171;">Errore pagamenti Admin: ${escapeHtml(err.message || err)}</td></tr>`;
        }
    }

    async function renderManualPaymentsQueue() {
        const tbody = document.getElementById('manual-payments-table-body');
        if (!tbody) return;
        let rows = [];
        const statusFilter = (document.getElementById('manual-payments-status-filter')?.value || 'ALL').toUpperCase();
        if (hasBackendAuth()) {
            try {
                const qs = new URLSearchParams();
                if (statusFilter !== 'ALL') qs.set('status', statusFilter);
                qs.set('limit', '200');
                rows = await apiFetch(`/admin/payments/manual?${qs.toString()}`);
            } catch (err) {
                console.warn('Manual payments pending fetch failed:', err);
            }
        }
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="color:var(--text-dim);">Nessun pagamento manuale in verifica.</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(r => `
            <tr>
                <td><strong>${r.client?.full_name || 'N/D'}</strong><div style="font-size:0.72rem; color:var(--text-dim);">${r.client?.email || ''}</div></td>
                <td><span class="code">${r.invoice?.invoice_number || '-'}</span>${r.invoice?.pdf_url ? `<div><a href="${r.invoice.pdf_url}" target="_blank" style="font-size:0.72rem; color:var(--accent);">PDF</a></div>` : ''}${r.proof_url ? `<div><a href="${r.proof_url}" target="_blank" style="font-size:0.72rem; color:#7fffd4;">Ricevuta</a></div>` : ''}</td>
                <td><span class="tag">${r.method}</span></td>
                <td style="font-family:monospace; font-size:0.76rem;">${r.reference_code || '-'}</td>
                <td>${r.submitted_currency || (r.invoice?.currency || 'EUR')} ${typeof r.submitted_amount_cents === 'number' ? (r.submitted_amount_cents / 100).toFixed(2) : (r.invoice?.total_cents ? (r.invoice.total_cents / 100).toFixed(2) : '-')}</td>
                <td><span class="status-badge ${String(r.status || '').toUpperCase() === 'APPROVED' ? 'active' : (String(r.status || '').toUpperCase() === 'REJECTED' ? 'revoked' : 'warning')}">${r.status}</span></td>
                <td style="display:flex; gap:6px; flex-wrap:wrap;">
                    ${String(r.status || '').toUpperCase() === 'PENDING' ? `<button class="btn btn-sm btn-secondary" onclick="adminApproveManualPayment('${r.id}')">✅ Approva</button>` : ''}
                    ${String(r.status || '').toUpperCase() === 'PENDING' ? `<button class="btn btn-sm btn-warning" onclick="adminRejectManualPayment('${r.id}')">❌ Rifiuta</button>` : ''}
                    <button class="btn btn-sm btn-secondary" onclick="alert('Dettaglio pagamento manuale: ${r.id}')">👁️</button>
                </td>
            </tr>
        `).join('');
    }

    async function renderClientPaymentsArchive() {
        const tbody = document.getElementById('client-payments-table-body');
        if (!tbody) return;
        if (!hasBackendAuth()) {
            tbody.innerHTML = `<tr><td colspan="7" style="color:var(--text-dim);">Login admin richiesto.</td></tr>`;
            return;
        }
        try {
            const statusFilter = (document.getElementById('client-payments-status-filter')?.value || 'ALL').toUpperCase();
            const qs = new URLSearchParams();
            if (statusFilter !== 'ALL') qs.set('status', statusFilter);
            const rows = await apiFetch(`/admin/payments/client?${qs.toString()}`);
            clientPaymentsArchiveCache = rows;
            if (!rows.length) {
                tbody.innerHTML = `<tr><td colspan="7" style="color:var(--text-dim);">Nessun pagamento cliente disponibile.</td></tr>`;
                return;
            }
            tbody.innerHTML = rows.map(r => {
                const c = r.client || {};
                const ms = r.manual_submission || null;
                const method = String(r.method || '').toUpperCase();
                const adminId = c.admin_wl_id || 'UNASSIGNED';
                const adminBrand = (wlNetwork.find(x => x.id === adminId)?.brand) || (adminId === 'UNASSIGNED' ? 'Senza Admin' : adminId);
                const details = ms
                    ? `${ms.reference_code ? `Ref: ${ms.reference_code}` : ''}${ms.proof_url ? ` · Ricevuta` : ''}${ms.review_notes ? ` · Nota: ${ms.review_notes}` : ''}`
                    : (r.paid_at ? `Pagato: ${new Date(r.paid_at).toLocaleString('it-IT')}` : 'Pagamento automatico/Stripe');
                return `<tr>
                    <td><strong>${escapeHtml(c.full_name || 'N/D')}</strong><div style="font-size:.72rem;color:var(--text-dim);">${escapeHtml(c.email || '')}</div></td>
                    <td><span class="code">${escapeHtml(adminId)}</span><div style="font-size:.72rem;color:var(--text-dim);">${escapeHtml(adminBrand)}</div></td>
                    <td><span class="code">${escapeHtml(r.invoice?.invoice_number || '-')}</span></td>
                    <td><span class="tag">${escapeHtml(method || '-')}</span></td>
                    <td>${escapeHtml(r.currency || 'EUR')} ${(Number(r.amount_cents || 0) / 100).toFixed(2)}</td>
                    <td><span class="status-badge ${String(r.status || '').toUpperCase() === 'PAID' ? 'active' : (String(r.status || '').includes('REJECT') ? 'revoked' : 'warning')}">${escapeHtml(r.status || '-')}</span></td>
                    <td style="font-size:.76rem; color:var(--text-dim);">${escapeHtml(details)}</td>
                </tr>`;
            }).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" style="color:#f87171;">Errore archivio pagamenti clienti: ${escapeHtml(err.message || err)}</td></tr>`;
        }
    }

    window.adminApproveManualPayment = async function (submissionId) {
        if (!hasBackendAuth()) return alert('Login admin richiesto.');
        const reviewNotes = prompt('Note verifica (opzionale):', '') || '';
        try {
            const res = await apiFetch(`/admin/payments/manual/${encodeURIComponent(submissionId)}/approve`, {
                method: 'POST',
                body: JSON.stringify({ review_notes: reviewNotes || null })
            });
            logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'FINANCE', status: 'success', msg: `MANUAL_PAYMENT_APPROVED ${submissionId} -> ${res.invoice?.invoice_number || ''}` });
            injectLogs();
            renderManualPaymentsQueue();
            renderFeeInvoices();
            toast(`Pagamento manuale approvato (${res.invoice?.invoice_number || 'N/D'})`, 'success', 3600);
        } catch (err) {
            toast(`Errore approvazione pagamento manuale: ${err.message}`, 'error', 4200);
        }
    };

    window.adminRejectManualPayment = async function (submissionId) {
        if (!hasBackendAuth()) return alert('Login admin richiesto.');
        const reviewNotes = prompt('Motivo rifiuto / richiesta integrazione:', '') || '';
        try {
            await apiFetch(`/admin/payments/manual/${encodeURIComponent(submissionId)}/reject`, {
                method: 'POST',
                body: JSON.stringify({ review_notes: reviewNotes || null })
            });
            logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'FINANCE', status: 'warning', msg: `MANUAL_PAYMENT_REJECTED ${submissionId}` });
            injectLogs();
            renderManualPaymentsQueue();
            renderFeeInvoices();
            toast('Pagamento manuale rifiutato', 'warning', 3000);
        } catch (err) {
            toast(`Errore rifiuto pagamento manuale: ${err.message}`, 'error', 4200);
        }
    };

    window.markPayoutPaid = async function (index) {
        const rows = window.__softiFeePayoutRows || [];
        if (!rows[index]) return;
        const row = rows[index];
        if (hasBackendAuth() && row.id) {
            try {
                await apiFetch(`/admin/wl/payouts/${encodeURIComponent(row.id)}/mark-paid`, {
                    method: 'POST',
                    body: JSON.stringify({ note: null })
                });
            } catch (err) {
                toast(`Errore mark paid payout: ${err.message}`, 'error', 4200);
                return;
            }
        }
        row.status = 'PAID';
        logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'FINANCE', status: 'success', msg: `PAYOUT_MARKED_PAID ${row.beneficiary} €${row.amount.toFixed(2)}` });
        injectLogs();
        window.__softiFeePayoutRows = rows;
        renderFeePayouts();
    };

    async function renderFeeInvoices() {
        const tbody = document.getElementById('fee-invoices-table-body');
        if (!tbody) return;
        let backendInvoices = [];
        if (hasBackendAuth()) {
            try {
                backendInvoices = await apiFetch('/admin/invoices?limit=50');
                feeInvoicesCache = backendInvoices;
            } catch (err) {
                console.warn('Fee invoices backend fetch failed:', err);
            }
        }
        const payoutRows = buildPayoutRows().slice(0, 10);
        const ledgerRows = payoutRows.map((r, idx) => ({
            doc: `FEE-${r.level}-${idx + 1}-${r.period.replace('-', '')}`,
            type: `FEE_${r.level}`,
            period: r.period,
            amount: r.amount,
            status: r.status === 'PAID' ? 'EMESSA/PAGATA' : 'DA EMETTERE',
            source: 'LEDGER',
            pdf_url: null
        }));
        const backendRows = (backendInvoices || []).map(i => ({
            doc: i.invoice_number,
            type: `${i.document_type || 'INVOICE'}${i.payment_method ? ` · ${i.payment_method}` : ''}`,
            period: (i.issued_at || '').slice(0, 7) || '-',
            amount: (Number(i.total_cents || 0) / 100),
            status: i.status || 'N/A',
            source: 'BACKEND',
            pdf_url: i.pdf_url || (i.pdf_path ? `/api/files/invoice/${i.invoice_number}` : null),
            invoice_number: i.invoice_number,
            payable: !!i.payable,
            client_id: i.client_id || null,
            client_name: i.client_name || '',
            client_email: i.client_email || ''
        }));
        const filters = window.__softiAdminInvoiceFilters || { status: 'ALL', method: 'ALL', doc: 'ALL', q: '' };
        const rows = [...ledgerRows, ...backendRows].filter(r => {
            const status = String(r.status || '').toUpperCase();
            const type = String(r.type || '').toUpperCase();
            if (filters.status !== 'ALL' && status !== filters.status) return false;
            if (filters.method !== 'ALL' && !type.includes(filters.method)) return false;
            if (filters.doc !== 'ALL' && !type.includes(filters.doc)) return false;
            const q = (filters.q || '').trim().toLowerCase();
            if (q) {
                const hay = `${r.doc} ${r.type} ${r.client_name || ''} ${r.client_email || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
        tbody.innerHTML = rows.map(r => `
            <tr>
                <td><span class="code">${r.doc}</span></td>
                <td><span class="tag">${r.type}</span></td>
                <td>${r.period}</td>
                <td>€${Number(r.amount || 0).toFixed(2)}</td>
                <td><span class="status-badge ${String(r.status).includes('PAGA') || String(r.status).toLowerCase().includes('paid') ? 'active' : 'warning'}">${r.status}</span></td>
                <td>${r.source}</td>
                <td style="display:flex; gap:6px; flex-wrap:wrap;">
                    ${r.pdf_url ? `<a class="btn btn-sm btn-secondary" href="${r.pdf_url}" target="_blank">📄 PDF</a>` : "<button class=\"btn btn-sm btn-warning\" onclick=\"alert('Generazione PDF fee da implementare nel backend fiscale network.')\">🛠️ Genera</button>"}
                    ${r.source === 'BACKEND' ? `<button class="btn btn-sm btn-secondary" onclick="adminInvoiceSend('${r.invoice_number}')">📨 Invia</button>` : ''}
                    ${r.source === 'BACKEND' && r.payable ? `<button class="btn btn-sm" style="background:rgba(0,242,255,0.12); border:1px solid rgba(0,242,255,0.25); color:var(--accent);" onclick="adminInvoicePayLink('${r.invoice_number}')">💳 Link</button>` : ''}
                    ${r.source === 'BACKEND' && String(r.status || '').toUpperCase() !== 'PAID' ? `<button class="btn btn-sm btn-warning" onclick="adminInvoiceMarkPaid('${r.invoice_number}')">✅ Segna pagata</button>` : ''}
                </td>
            </tr>
        `).join('');
        const fs = document.getElementById('fee-inv-filter-status');
        const fm = document.getElementById('fee-inv-filter-method');
        const fd = document.getElementById('fee-inv-filter-doc');
        const fq = document.getElementById('fee-inv-filter-q');
        if (fs) fs.value = filters.status;
        if (fm) fm.value = filters.method;
        if (fd) fd.value = filters.doc;
        if (fq) fq.value = filters.q || '';
    }

    window.adminInvoiceSend = async function (invoiceNumber) {
        if (!hasBackendAuth()) {
            alert('Login API admin richiesto. Usa Configurazioni > Plug&Play Setup per login/token.');
            return;
        }
        try {
            const res = await apiFetch(`/admin/invoices/${encodeURIComponent(invoiceNumber)}/send`, { method: 'POST' });
            logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'FINANCE', status: 'success', msg: `INVOICE_SENT ${invoiceNumber}` });
            injectLogs();
            const channels = Array.isArray(res.send_result?.channels) ? res.send_result.channels.map(c => `${c.channel}:${c.ok ? 'OK' : 'ERR'}`).join(', ') : ((res.send_result && res.send_result.channel) || 'audit');
            toast(`Fattura ${invoiceNumber} inviata (${channels})`, 'success', 3800);
            renderFeeInvoices();
        } catch (err) {
            toast(`Errore invio fattura: ${err.message}`, 'error', 4200);
        }
    };

    window.adminInvoicePayLink = async function (invoiceNumber) {
        if (!hasBackendAuth()) {
            alert('Login API admin richiesto. Usa Configurazioni > Plug&Play Setup per login/token.');
            return;
        }
        try {
            const res = await apiFetch(`/admin/invoices/${encodeURIComponent(invoiceNumber)}/payment-link`, { method: 'POST' });
            if (res.checkout_url) window.open(res.checkout_url, '_blank');
            if (res.simulated) toast(`Link pagamento demo creato per ${invoiceNumber}`, 'warning', 3200);
            logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'FINANCE', status: 'info', msg: `INVOICE_PAY_LINK ${invoiceNumber}` });
            injectLogs();
            renderFeeInvoices();
        } catch (err) {
            toast(`Errore link pagamento: ${err.message}`, 'error', 4200);
        }
    };

    window.adminInvoiceMarkPaid = async function (invoiceNumber) {
        if (!hasBackendAuth()) {
            alert('Login API admin richiesto. Usa Configurazioni > Plug&Play Setup per login/token.');
            return;
        }
        if (!confirm(`Segnare come pagata la fattura ${invoiceNumber}?`)) return;
        try {
            await apiFetch(`/admin/invoices/${encodeURIComponent(invoiceNumber)}/mark-paid`, { method: 'POST' });
            logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'FINANCE', status: 'success', msg: `INVOICE_MARKED_PAID ${invoiceNumber}` });
            injectLogs();
            renderFeeInvoices();
            toast(`Fattura ${invoiceNumber} segnata pagata`, 'success', 3200);
        } catch (err) {
            toast(`Errore mark paid: ${err.message}`, 'error', 4200);
        }
    };

    window.adminWLBillingMarkPaid = async function (invoiceNumber) {
        if (!hasBackendAuth()) return alert('Login API admin richiesto.');
        if (!confirm(`Segnare come pagata la fattura Admin ${invoiceNumber}?`)) return;
        try {
            await apiFetch(`/admin/wl/billing/invoices/${encodeURIComponent(invoiceNumber)}/mark-paid`, { method: 'POST' });
            toast(`Fattura Admin ${invoiceNumber} segnata pagata`, 'success', 3200);
            renderAdminWLBillingInvoices();
        } catch (err) {
            toast(`Errore Billing Admin: ${err.message}`, 'error', 4200);
        }
    };

    window.adminWLBillingApproveManual = async function (submissionId) {
        if (!hasBackendAuth()) return alert('Login API admin richiesto.');
        const reviewNotes = prompt('Note verifica pagamento Admin (opzionale):', '') || '';
        try {
            await apiFetch(`/admin/wl/billing/payments/manual/${encodeURIComponent(submissionId)}/approve`, {
                method: 'POST',
                body: JSON.stringify({ review_notes: reviewNotes || null })
            });
            toast('Pagamento manuale Admin approvato', 'success', 3200);
            renderAdminWLManualPayments();
            renderAdminWLBillingInvoices();
        } catch (err) {
            toast(`Errore approvazione pagamento Admin: ${err.message}`, 'error', 4200);
        }
    };

    window.adminWLBillingRejectManual = async function (submissionId) {
        if (!hasBackendAuth()) return alert('Login API admin richiesto.');
        const reviewNotes = prompt('Motivo rifiuto (Admin):', '') || '';
        try {
            await apiFetch(`/admin/wl/billing/payments/manual/${encodeURIComponent(submissionId)}/reject`, {
                method: 'POST',
                body: JSON.stringify({ review_notes: reviewNotes || null })
            });
            toast('Pagamento manuale Admin rifiutato', 'warning', 3200);
            renderAdminWLManualPayments();
            renderAdminWLBillingInvoices();
        } catch (err) {
            toast(`Errore rifiuto pagamento Admin: ${err.message}`, 'error', 4200);
        }
    };

    document.getElementById('save-fee-rules-btn')?.addEventListener('click', async () => {
        feeRulesState.l0 = Number(document.getElementById('fee-rule-l0')?.value || feeRulesState.l0);
        feeRulesState.l1 = Number(document.getElementById('fee-rule-l1')?.value || feeRulesState.l1);
        feeRulesState.l2 = Number(document.getElementById('fee-rule-l2')?.value || feeRulesState.l2);
        if ((feeRulesState.l0 + feeRulesState.l1 + feeRulesState.l2) !== 100) {
            toast('La somma L0+L1+L2 deve essere 100.', 'warning', 3600);
            return;
        }
        if (hasBackendAuth()) {
            try {
                await apiFetch('/admin/wl/fee-rules', {
                    method: 'POST',
                    body: JSON.stringify({ l0: feeRulesState.l0, l1: feeRulesState.l1, l2: feeRulesState.l2 })
                });
                toast('Regole fee salvate su backend.', 'success', 2800);
            } catch (err) {
                toast(`Errore salvataggio regole fee: ${err.message}`, 'error', 4200);
                return;
            }
        }
        logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'FINANCE', status: 'info', msg: `FEE_RULES_UPDATED L0=${feeRulesState.l0}% L1=${feeRulesState.l1}% L2=${feeRulesState.l2}%` });
        injectLogs();
        calcFeeSplitPreview();
    });
    document.getElementById('calc-fee-sim-btn')?.addEventListener('click', calcFeeSplitPreview);
    document.getElementById('run-fee-payout-btn')?.addEventListener('click', async () => {
        if (hasBackendAuth()) {
            try {
                const res = await apiFetch('/admin/wl/payouts/run', {
                    method: 'POST',
                    body: JSON.stringify({ period: new Date().toISOString().slice(0, 7) })
                });
                toast(`Batch payout backend completato (${res.rows || 0} righe).`, 'success', 3200);
                logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'FINANCE', status: 'success', msg: `PAYOUT_BATCH_TRIGGERED period=${res.period} rows=${res.rows}` });
                injectLogs();
                await syncFeePayoutsFromBackend();
                return;
            } catch (err) {
                toast(`Errore batch payout backend: ${err.message}`, 'error', 4200);
            }
        }
        logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'FINANCE', status: 'warning', msg: 'PAYOUT_BATCH_TRIGGERED (simulated fallback)' });
        injectLogs();
        renderFeePayouts();
    });
    document.getElementById('refresh-fee-invoices-btn')?.addEventListener('click', () => renderFeeInvoices());
    document.getElementById('refresh-manual-payments-btn')?.addEventListener('click', () => renderManualPaymentsQueue());
    document.getElementById('manual-payments-status-filter')?.addEventListener('change', () => renderManualPaymentsQueue());
    document.getElementById('refresh-client-payments-btn')?.addEventListener('click', () => renderClientPaymentsArchive());
    document.getElementById('client-payments-status-filter')?.addEventListener('change', () => renderClientPaymentsArchive());
    document.getElementById('refresh-admin-fee-report-btn')?.addEventListener('click', () => injectRevenue());
    document.getElementById('export-admin-fee-report-btn')?.addEventListener('click', () => exportAdminFeeReportCsv());
    document.getElementById('wl-open-fee-report-btn')?.addEventListener('click', () => navigateToView('super-admin-fee-report', { updateHash: true, force: true }));
    document.getElementById('refresh-wl-network-btn')?.addEventListener('click', () => {
        if (hasBackendAuth()) {
            syncAdminFromBackend();
        } else {
            renderWLNetwork();
            toast('Login backend richiesto per sincronizzare Gestione Admin.', 'warning', 3200);
        }
    });
    document.getElementById('refresh-admin-billing-btn')?.addEventListener('click', () => renderAdminWLBillingSection());
    document.getElementById('refresh-admin-billing-payments-btn')?.addEventListener('click', () => renderAdminWLBillingPaymentsSection());
    document.getElementById('admin-manual-payments-status-filter')?.addEventListener('change', () => renderAdminWLBillingPaymentsSection());
    document.getElementById('issue-admin-billing-btn')?.addEventListener('click', async () => {
        if (!hasBackendAuth()) return alert('Login API admin richiesto.');
        const admin_wl_id = (document.getElementById('admin-billing-admin-id')?.value || '').trim();
        const amountEuro = Number(document.getElementById('admin-billing-amount')?.value || 0);
        const description = (document.getElementById('admin-billing-desc')?.value || '').trim() || 'SoftiBridge Admin monthly plan';
        const document_type = (document.getElementById('admin-billing-doc-type')?.value || 'PROFORMA').toUpperCase();
        const payment_method = (document.getElementById('admin-billing-method')?.value || 'BANK_TRANSFER').toUpperCase();
        if (!admin_wl_id) return alert('Seleziona Admin WL');
        if (!(amountEuro > 0)) return alert('Inserisci importo valido');
        try {
            await apiFetch('/admin/wl/billing/invoices/issue', {
                method: 'POST',
                body: JSON.stringify({
                    admin_wl_id,
                    amount_cents: Math.round(amountEuro * 100),
                    currency: 'EUR',
                    description,
                    document_type,
                    payment_method,
                    invoice_channel: payment_method === 'STRIPE' ? 'AUTO_STRIPE' : 'ADMIN_MANUAL'
                })
            });
            toast('Billing Admin emesso', 'success', 3000);
            renderAdminWLBillingInvoices();
        } catch (err) {
            toast(`Errore Billing Admin: ${err.message}`, 'error', 4200);
        }
    });
    ['fee-inv-filter-status', 'fee-inv-filter-method', 'fee-inv-filter-doc'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', (e) => {
            window.__softiAdminInvoiceFilters = window.__softiAdminInvoiceFilters || { status: 'ALL', method: 'ALL', doc: 'ALL', q: '' };
            if (id.endsWith('status')) window.__softiAdminInvoiceFilters.status = e.target.value;
            if (id.endsWith('method')) window.__softiAdminInvoiceFilters.method = e.target.value;
            if (id.endsWith('doc')) window.__softiAdminInvoiceFilters.doc = e.target.value;
            renderFeeInvoices();
        });
    });
    document.getElementById('fee-inv-filter-q')?.addEventListener('input', (e) => {
        window.__softiAdminInvoiceFilters = window.__softiAdminInvoiceFilters || { status: 'ALL', method: 'ALL', doc: 'ALL', q: '' };
        window.__softiAdminInvoiceFilters.q = e.target.value || '';
        renderFeeInvoices();
    });
    document.getElementById('issue-fee-invoice-btn')?.addEventListener('click', async () => {
        if (!hasBackendAuth()) {
            alert('Login API admin richiesto. Usa Configurazioni > Plug&Play Setup per login/token.');
            return;
        }
        const clientId = (document.getElementById('fee-invoice-client-id')?.value || '').trim();
        const amountEuro = Number(document.getElementById('fee-invoice-amount')?.value || 0);
        const description = (document.getElementById('fee-invoice-desc')?.value || '').trim() || 'SoftiBridge service invoice';
        const documentType = (document.getElementById('fee-invoice-doc-type')?.value || 'PROFORMA').toUpperCase();
        const paymentMethod = (document.getElementById('fee-invoice-method')?.value || 'BANK_TRANSFER').toUpperCase();
        const sendNow = !!document.getElementById('fee-invoice-send-now')?.checked;
        if (!clientId) return alert('Inserisci Client ID');
        if (!(amountEuro > 0)) return alert('Inserisci importo valido');
        try {
            const res = await apiFetch('/admin/invoices/issue', {
                method: 'POST',
                body: JSON.stringify({
                    client_id: clientId,
                    amount_cents: Math.round(amountEuro * 100),
                    currency: 'EUR',
                    description,
                    send_now: sendNow,
                    document_type: documentType,
                    payment_method: paymentMethod,
                    invoice_channel: paymentMethod === 'STRIPE' ? 'AUTO_STRIPE' : 'ADMIN_MANUAL'
                })
            });
            logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'FINANCE', status: 'success', msg: `INVOICE_ISSUED ${res.invoice?.invoice_number || ''}` });
            injectLogs();
            toast(`Fattura emessa: ${res.invoice?.invoice_number || 'N/D'}`, 'success', 3400);
            renderFeeInvoices();
        } catch (err) {
            toast(`Errore emissione fattura: ${err.message}`, 'error', 4200);
        }
    });


    function injectLogs() {
        if (!logsBody) return;
        logsBody.innerHTML = logsData.map(log => `
            <tr>
                <td>${log.ts}</td>
                <td><span class="tag">${log.mod}</span></td>
                <td><span class="log-badge ${log.status}">${log.status.toUpperCase()}</span></td>
                <td>${log.msg}</td>
            </tr>
        `).join('');
    }

    // Tour is manual by design: avoid automatic overlays that confuse the operator.

    // --- License Management Logic ---
    const licensesTableBody = document.getElementById('licenses-table-body');
    const manageLicenseModal = document.getElementById('manage-license-modal');
    const manageLicenseId = document.getElementById('manage-license-id');
    const upgradeTierSelect = document.getElementById('upgrade-tier-select');
    const revokeBtn = document.getElementById('revoke-license-btn');
    const killRemoteBtn = document.getElementById('kill-remote-btn');
    const exportKillBtn = document.getElementById('export-kill-btn');
    const saveUpgradeBtn = document.getElementById('save-upgrade-btn');
    let currentLicenses = [
        { id: "SB-A9B2-X1", type: "PRO", status: "active", accounts: ["87654321"], expiry: "2026-05-15", install_id: "VPS-LONDON-01" },
        { id: "SB-B2C3-Y2", type: "BASIC", status: "pending", accounts: [], expiry: "2026-03-22", install_id: null },
        { id: "SB-D4E5-Z3", type: "ENTERPRISE", status: "active", accounts: ["12345678", "11223344"], expiry: "2027-01-10", install_id: "VPS-NY-09" },
        { id: "SB-F6G7-W4", type: "BASIC", status: "revoked", accounts: ["55667788"], expiry: "2026-02-28", install_id: "WORKSTATION-X" }
    ];

    let activeManageId = null;

    function renderLicenses() {
        if (!licensesTableBody) return;
        licensesTableBody.innerHTML = currentLicenses.map(lic => `
            <tr>
                <td><span style="font-family: monospace;">${lic.id}</span></td>
                <td><span class="tag">${lic.type}</span></td>
                <td>${lic.accounts.length > 0 ? lic.accounts.map(a => `<span class="account-tag">${a}</span>`).join(' ') : '<span style="color:var(--text-dim);">No accounts</span>'}</td>
                <td><span class="code" style="font-size: 0.75rem; opacity: 0.7;">${lic.install_id || '---'}</span></td>
                <td><span class="status-badge ${lic.status}">${lic.status}</span></td>
                <td>${lic.expiry}</td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="openManageModal('${lic.id}')">Gestisci</button>
                </td>
            </tr>
        `).join('');
    }

    window.openManageModal = function (id) {
        activeManageId = id;
        const lic = currentLicenses.find(l => l.id === id);
        manageLicenseId.textContent = id;
        upgradeTierSelect.value = lic.type;
        manageLicenseModal.style.display = 'flex';
    };

    window.closeManageModal = function () {
        manageLicenseModal.style.display = 'none';
        activeManageId = null;
    };

    revokeBtn.addEventListener('click', async () => {
        if (confirm(`Sei sicuro di voler revocare la licenza ${activeManageId}? L'utente perderà l'accesso istantaneamente.`)) {
            if (hasBackendAuth()) {
                try {
                    await apiFetch(`/admin/licenses/${activeManageId}/revoke`, { method: 'POST' });
                } catch (err) {
                    alert(`Errore backend revoca: ${err.message}`);
                    return;
                }
            }
            const index = currentLicenses.findIndex(l => l.id === activeManageId);
            if (index >= 0) currentLicenses[index].status = 'revoked';
            renderLicenses();
            closeManageModal();
            alert("Licenza revocata con successo.");
        }
    });

    saveUpgradeBtn.addEventListener('click', async () => {
        const newTier = upgradeTierSelect.value;
        if (hasBackendAuth()) {
            try {
                await apiFetch(`/admin/licenses/${activeManageId}/upgrade`, {
                    method: 'POST',
                    body: JSON.stringify({ plan_code: newTier })
                });
            } catch (err) {
                alert(`Errore backend upgrade: ${err.message}`);
                return;
            }
        }
        const index = currentLicenses.findIndex(l => l.id === activeManageId);
        if (index >= 0) currentLicenses[index].type = newTier;

        // Log formatted event
        const logMsg = `UPSELL_${newTier}: ${activeManageId}`;
        const newLog = {
            ts: new Date().toLocaleTimeString(),
            mod: 'ADMIN',
            status: 'success',
            msg: logMsg
        };
        logsData.unshift(newLog);
        if (logsBody) injectLogs();

        renderLicenses();
        closeManageModal();

        // Log split event
        const splitMsg = `REVENUE_SHARE: ${activeManageId} processed for L0/L1/Aff`;
        logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'SaaS', status: 'info', msg: splitMsg });
        if (logsBody) injectLogs();

        // Refresh revenue if visible
        if (revenueTableBody) injectRevenue();

        alert(`Licenza ${activeManageId} aggiornata a ${newTier}. Economic split processed!`);
    });

    killRemoteBtn.addEventListener('click', async () => {
        if (confirm(`☢️ ATTENZIONE: Il Remote Kill bloccherà istantaneamente l'installazione ${activeManageId} sulla VPS del cliente. Procedere?`)) {
            if (hasBackendAuth()) {
                try {
                    await apiFetch(`/admin/licenses/${activeManageId}/remote-kill`, { method: 'POST' });
                } catch (err) {
                    alert(`Errore backend remote kill: ${err.message}`);
                    return;
                }
            }
            const index = currentLicenses.findIndex(l => l.id === activeManageId);
            if (index >= 0) currentLicenses[index].status = 'suspended';

            // Log formatted event
            const logMsg = `REMOTE_KILL_EXECUTED: ${activeManageId} (Install: ${currentLicenses[index].install_id || 'Unknown'})`;
            const newLog = {
                ts: new Date().toLocaleTimeString(),
                mod: 'SECURITY',
                status: 'warning',
                msg: logMsg
            };
            logsData.unshift(newLog);
            if (logsBody) injectLogs();

            renderLicenses();
            closeManageModal();

            // Simulation of ID Auto-deletion (ChatGPT Requirement)
            const autoDelMsg = `AUTO_DELETION: Previous HWID for ${activeManageId} invalidated.`;
            logsData.unshift({ ts: new Date().toLocaleTimeString(), mod: 'SECURITY', status: 'info', msg: autoDelMsg });
            if (logsBody) injectLogs();

            alert("Comando KILL inviato. L'installazione precedente è stata invalidata per migrazione automatica.");
        }
    });

    if (exportKillBtn) {
        exportKillBtn.addEventListener('click', async () => {
            if (hasBackendAuth()) {
                try {
                    const data = await apiFetch('/admin/kill-list/export');
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'disabled_installs.json';
                    a.click();
                    URL.revokeObjectURL(url);
                    alert(`Esportazione completata: ${data.count} record`);
                    return;
                } catch (err) {
                    alert(`Errore backend export kill list: ${err.message}`);
                }
            }
            const kills = currentLicenses.filter(l => l.status === 'revoked' || l.status === 'suspended');
            console.log("Esportazione disabled_installs.json...", kills);
            alert(`Esportazione completata: ${kills.length} installazioni disabilitate salvate in disabled_installs.json`);
        });
    }

    if (triggerBackupBtn) {
        triggerBackupBtn.addEventListener('click', () => {
            triggerBackupBtn.textContent = '📦 Backup in corso...';
            triggerBackupBtn.disabled = true;

            setTimeout(() => {
                const ts = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
                const logMsg = `BACKUP_COMPLETED: Snapshot softibridge_db_${ts.replace(/[: ]/g, '')}.bak salvato.`;
                const newLog = {
                    ts: new Date().toLocaleTimeString(),
                    mod: 'SYSTEM',
                    status: 'success',
                    msg: logMsg
                };
                logsData.unshift(newLog);
                if (logsBody) injectLogs();

                triggerBackupBtn.textContent = '💾 Backup Sistema';
                triggerBackupBtn.disabled = false;

                // Backup Download Simulation (ChatGPT SaaS Integration)
                if (confirm("Backup notturno completato con successo. Vuoi scaricare il file .bak ora?")) {
                    const fakeLink = document.createElement('a');
                    fakeLink.textContent = 'Simulate Download';
                    alert(`Iniziando il download di: softibridge_db_${ts.replace(/[: ]/g, '')}.bak`);
                }
            }, 1500);
        });
    }

    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (e.target === manageLicenseModal) closeManageModal();
    });

    // Compact topbar subtitles replace large per-view guide headers.
    renderLicenses();
    injectLogs();
    injectAdminPlugAndPlayCenter();
    if (shouldAutoPingApi()) {
        adminPpLoadSetup();
        pingApi().catch(() => { });
    }
    renderDashboardHome();
    renderDashboardCommandCenter();

    async function syncAdminFromBackend() {
        if (!hasBackendAuth()) return;
        try {
            const [summary, clients, groupedClients, licenses, logs, bridgeEvents, bridgeResults, wlAdmins, clientPayments] = await Promise.all([
                apiFetch('/admin/dashboard/summary'),
                apiFetch('/admin/clients'),
                apiFetch('/admin/clients/grouped').catch(() => ({ groups: [] })),
                apiFetch('/admin/licenses'),
                apiFetch('/admin/logs?limit=50'),
                apiFetch('/bridge/events?limit=20').catch(() => ({ events: [] })),
                apiFetch('/bridge/results?limit=20').catch(() => ({ results: [] })),
                apiFetch('/admin/wl/admins').catch(() => []),
                apiFetch('/admin/payments/client?limit=500').catch(() => [])
            ]);

            clientPaymentsArchiveCache = Array.isArray(clientPayments) ? clientPayments : [];
            adminWlBackendCache = Array.isArray(wlAdmins) ? wlAdmins : [];
            const paidVolumeMap = computeAdminVolumeMapFromPayments();
            const clientsPerAdmin = new Map();
            const groups = Array.isArray(groupedClients?.groups) ? groupedClients.groups : [];
            groups.forEach(g => {
                const key = g.admin_wl_id || 'UNASSIGNED';
                clientsPerAdmin.set(key, Array.isArray(g.clients) ? g.clients.length : 0);
            });
            if (adminWlBackendCache.length) {
                wlNetwork = adminWlBackendCache.map((a) => ({
                    id: a.id,
                    email: a.email,
                    name: a.contact_name,
                    brand: a.brand_name,
                    status: a.status,
                    plan_code: a.admin_plan_code,
                    fee_pct: (Number(a.fee_pct_l1 || 0) / 100),
                    volume: Number(paidVolumeMap.get(a.id) || 0),
                    affiliates: [],
                    backend: true,
                    clients_count: Number(clientsPerAdmin.get(a.id) || 0),
                    subscription: a.subscription || null,
                    limits: a.limits || {},
                }));
                renderWLNetwork();
                renderAffiliation();
                renderAdminWLBillingAdminSelector();
            }

            const clientAdminMap = new Map();
            groups.forEach(g => {
                (g.clients || []).forEach(c => {
                    clientAdminMap.set(c.id, {
                        admin_id: g.admin_wl_id || 'UNASSIGNED',
                        admin_brand: g.admin_brand_name || (g.admin_wl_id ? g.admin_wl_id : 'Senza Admin')
                    });
                });
            });

            mockClients = clients.map((c, idx) => ({
                id: c.id,
                nome: (c.full_name || '').split(' ')[0] || `Cliente${idx + 1}`,
                cognome: (c.full_name || '').split(' ').slice(1).join(' ') || '',
                telegram: c.telegram_username || '@n/a',
                email: c.email || 'n/a',
                tel: c.phone || '---',
                licenza: '---',
                piano: 'N/A',
                scadenza: '---',
                stato: c.status || 'ACTIVE',
                admin_id: clientAdminMap.get(c.id)?.admin_id || c.admin_wl_id || 'UNASSIGNED',
                admin_brand: clientAdminMap.get(c.id)?.admin_brand || (wlNetwork.find(w => w.id === c.admin_wl_id)?.brand || null)
            }));

            currentLicenses = licenses.map(l => ({
                id: l.id,
                type: l.plan_code || 'N/A',
                status: (l.status || 'unknown').toLowerCase(),
                accounts: [...(l.mt_accounts?.MT4 || []), ...(l.mt_accounts?.MT5 || [])],
                expiry: (l.expiry_at || '').split('T')[0] || '---',
                install_id: l.install_id || null
            }));

            const licByClientId = {};
            licenses.forEach(l => { if (l.client_id) licByClientId[l.client_id] = l; });
            mockClients = mockClients.map(c => {
                const lic = licByClientId[c.id];
                if (!lic) return c;
                return {
                    ...c,
                    licenza: lic.id,
                    piano: lic.plan_code || c.piano,
                    scadenza: (lic.expiry_at || '').split('T')[0] || c.scadenza,
                    stato: (lic.status || c.stato).toUpperCase()
                };
            });

            logsData = logs.map(log => ({
                ts: log.created_at ? new Date(log.created_at).toLocaleTimeString() : '--:--:--',
                mod: log.actor_type || 'API',
                status: (log.level || 'INFO').toLowerCase() === 'warning' ? 'warning' : ((log.level || 'INFO').toLowerCase() === 'error' ? 'error' : 'info'),
                msg: `${log.action} ${log.entity_type}${log.entity_id ? ` (${log.entity_id})` : ''}`
            }));

            const bridgeEventLogs = (bridgeEvents.events || []).slice(-10).map(ev => ({
                ts: ev.ts ? new Date(Number(ev.ts) * 1000).toLocaleTimeString() : '--:--:--',
                mod: 'EA',
                status: (String(ev.event || '').toUpperCase().includes('SL') ? 'warning' : 'success'),
                msg: `EVENT ${ev.event || 'N/A'} ${ev.id ? `(${ev.id})` : ''} ${ev.symbol || ''} ${ev.side || ''}`.trim()
            }));
            const bridgeResultLogs = (bridgeResults.results || []).slice(0, 10).map(r => ({
                ts: '--:--:--',
                mod: 'EA',
                status: String(r.status || '').toLowerCase() === 'ok' ? 'success' : (String(r.status || '').toLowerCase() === 'wait' ? 'warning' : 'info'),
                msg: `RESULT ${r.status || 'N/A'} ${r.id ? `(${r.id})` : ''} ${r.msg || ''}`.trim()
            }));
            logsData = [...bridgeEventLogs, ...bridgeResultLogs, ...logsData].slice(0, 100);

            dashboardMetrics = {
                licensesActive: Number(summary.licenses_active ?? summary.licenses_total ?? currentLicenses.filter(l => l.status === 'active').length ?? 0),
                clientsTotal: Number(summary.clients_total ?? mockClients.length ?? 0),
                revenue30dCents: Number(summary.invoices_total_cents || 0),
                pendingManualPayments: Number(summary.manual_payments_pending ?? 0),
            };

            renderLicenses();
            renderClients();
            injectLogs();
            renderDashboardHome();
            renderClientPaymentsArchive();
            renderWLNetwork();
            await syncSystemControlStatus();
        } catch (err) {
            console.warn('Admin backend sync failed, using mock data:', err);
            dashboardMetrics = {
                licensesActive: currentLicenses.filter(l => l.status === 'active').length,
                clientsTotal: mockClients.length,
                revenue30dCents: 429000,
                pendingManualPayments: 0,
            };
            renderDashboardHome();
            renderDashboardCommandCenter();
            renderClientPaymentsArchive();
            renderWLNetwork();
        }
    }

    const initialHashView = resolveViewFromHash();
    if (initialHashView) navigateToView(initialHashView, { updateHash: false, force: true });

    window.addEventListener('hashchange', () => {
        const v = resolveViewFromHash();
        if (v) navigateToView(v, { updateHash: false, force: true });
    });

    if (!hasBackendAuth()) {
        navigateToView(initialHashView || 'settings', { updateHash: !initialHashView, force: true });
        toast('Configura API URL e login dal pannello Plug&Play Setup per usare il backend reale.', 'warning', 5200);
    } else if (!initialHashView) {
        navigateToView('dashboard', { updateHash: true, force: true });
    }

    installStorageSync();
    enforceSuperAdminRoleGuard();
    syncAdminFromBackend();
    setInterval(syncAdminFromBackend, 15000);
    setInterval(syncSystemControlStatus, 12000);
    setInterval(() => { if (shouldAutoPingApi()) pingApi().catch(() => { }); }, 20000);
});
