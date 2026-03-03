/**
 * SoftiBridge — Onboarding Wizard
 * Guida l'utente attraverso 5 step:
 *  1. Telegram ID personale
 *  2. ID Canale Segnali Admin
 *  3. Dati MT4 (account, password, server)
 *  4. Genera codice licenza
 *  5. Attivazione via Bot Telegram
 */

"use strict";

// ─────────────────────────────────────────────────────────────
// STATO WIZARD
// ─────────────────────────────────────────────────────────────
let _wizardCurrentStep = 0;
let _wizardDismissed = false;
let _onboardingStatus = null;

const WIZARD_STEPS = [
    {
        id: "telegram_id",
        icon: "💬",
        title: "Collega Telegram",
        description: "Inserisci il tuo Telegram ID personale. Lo usiamo per inviarti notifiche sugli ordini eseguiti, Stop Loss e Take Profit.",
        statusKey: "telegram_id_saved",
    },
    {
        id: "signal_room",
        icon: "📡",
        title: "Canale Segnali",
        description: "Inserisci l'ID del canale/gruppo Telegram del tuo provider di segnali. Il tuo Admin te lo ha comunicato (es. -1001234567890).",
        statusKey: "signal_room_linked",
    },
    {
        id: "mt4_config",
        icon: "📊",
        title: "Configura MT4/MT5",
        description: "Inserisci i dati del tuo conto MetaTrader. Permettono all'EA di autenticarsi e ricevere gli ordini.",
        statusKey: "mt4_configured",
    },
    {
        id: "generate_license",
        icon: "🔑",
        title: "Genera Licenza",
        description: "Crea il tuo codice di attivazione unico. Lo userai nel passo successivo per attivare l'account via Telegram.",
        statusKey: "license_generated",
    },
    {
        id: "activate_telegram",
        icon: "🚀",
        title: "Attiva via Bot",
        description: "Invia il codice licenza al Bot Telegram per attivare il tuo account e iniziare a ricevere i segnali.",
        statusKey: "license_telegram_activated",
    },
];

// ─────────────────────────────────────────────────────────────
// INIT: controlla lo stato onboarding all'avvio
// ─────────────────────────────────────────────────────────────
async function initOnboardingWizard() {
    // Controlla se già dimissed in questa sessione
    if (_wizardDismissed) return;

    try {
        const token = window.SB_TOKEN || localStorage.getItem("sb_client_token");
        if (!token) return;

        const res = await fetch(`${window.SB_API_BASE || ""}/api/client/onboarding/status`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const data = await res.json();
        _onboardingStatus = data;

        if (data.onboarding_complete) {
            console.log("[Onboarding] Completato ✅");
            return;
        }

        // Trova il primo step non completato e apri il wizard
        const firstIncomplete = WIZARD_STEPS.findIndex(s => !data.steps[s.statusKey]);
        _wizardCurrentStep = Math.max(0, firstIncomplete);
        openOnboardingWizard();
    } catch (err) {
        console.warn("[Onboarding] Impossibile verificare stato:", err);
    }
}

// ─────────────────────────────────────────────────────────────
// APRI / CHIUDI WIZARD
// ─────────────────────────────────────────────────────────────
function openOnboardingWizard() {
    const overlay = document.getElementById("onboarding-wizard-overlay");
    if (!overlay) return;
    overlay.style.display = "flex";
    renderWizardStep(_wizardCurrentStep);
}

function closeOnboardingWizard() {
    const overlay = document.getElementById("onboarding-wizard-overlay");
    if (overlay) overlay.style.display = "none";
    _wizardDismissed = true;
}

// ─────────────────────────────────────────────────────────────
// RENDER STEP
// ─────────────────────────────────────────────────────────────
function renderWizardStep(idx) {
    if (idx < 0 || idx >= WIZARD_STEPS.length) return;
    const step = WIZARD_STEPS[idx];

    // Progress bar
    const pctDone = Math.round((idx / WIZARD_STEPS.length) * 100);
    const progressBar = document.getElementById("wiz-progress-bar");
    const progressLabel = document.getElementById("wiz-progress-label");
    if (progressBar) progressBar.style.width = `${pctDone}%`;
    if (progressLabel) {
        const completedCount = _onboardingStatus
            ? WIZARD_STEPS.filter(s => _onboardingStatus.steps[s.statusKey]).length
            : 0;
        progressLabel.textContent = `${completedCount} / ${WIZARD_STEPS.length} completati`;
    }

    // Step nav dots
    const stepsNav = document.getElementById("wiz-steps-nav");
    if (stepsNav) {
        stepsNav.innerHTML = WIZARD_STEPS.map((s, i) => {
            const isDone = _onboardingStatus?.steps[s.statusKey];
            const isCurrent = i === idx;
            let bg = "rgba(255,255,255,0.1)";
            let border = "1px solid rgba(255,255,255,0.15)";
            let color = "var(--text-dim)";
            if (isDone) { bg = "rgba(0,255,136,0.15)"; border = "1px solid rgba(0,255,136,0.4)"; color = "#00ff88"; }
            if (isCurrent && !isDone) { bg = "rgba(0,242,255,0.15)"; border = "1px solid rgba(0,242,255,0.5)"; color = "var(--accent)"; }
            return `<div style="
                padding: 4px 10px;
                border-radius: 99px;
                font-size: 0.7rem;
                font-weight: 600;
                cursor:pointer;
                background: ${bg};
                border: ${border};
                color: ${color};
                transition: all 0.2s;
            " onclick="_wizardGoTo(${i})">${s.icon} ${i + 1}. ${s.title}</div>`;
        }).join("");
    }

    // Step content
    const content = document.getElementById("wiz-step-content");
    if (content) {
        content.innerHTML = _buildStepHTML(step, idx);
        // Attach listeners
        _attachStepListeners(step, idx);
    }

    // Buttons
    const btnBack = document.getElementById("wiz-btn-back");
    const btnNext = document.getElementById("wiz-btn-next");
    const btnSkip = document.getElementById("wiz-btn-skip");
    if (btnBack) btnBack.style.display = idx > 0 ? "inline-flex" : "none";
    if (btnSkip) {
        btnSkip.textContent = idx === WIZARD_STEPS.length - 1 ? "Chiudi" : "Salta per ora";
    }
    if (btnNext) {
        const isLast = idx === WIZARD_STEPS.length - 1;
        btnNext.textContent = isLast ? "✅ Completa" : "Avanti →";
        btnNext.style.display = isLast ? "none" : "inline-flex"; // ultimo step non ha duplicato Avanti
        if (isLast) btnNext.style.display = "none";
    }
}

function _buildStepHTML(step, idx) {
    const isDone = _onboardingStatus?.steps[step.statusKey];
    const doneBar = isDone
        ? `<div style="display:flex;align-items:center;gap:0.5rem;background:rgba(0,255,136,0.08);border:1px solid rgba(0,255,136,0.2);border-radius:10px;padding:0.5rem 1rem;margin-bottom:1rem;font-size:0.8rem;color:#00ff88;font-weight:600;">
              ✅ Step già completato — puoi aggiornare i dati qui sotto
           </div>`
        : "";

    switch (step.id) {
        case "telegram_id":
            return `${doneBar}
            <div style="background:rgba(0,242,255,0.06);border:1px solid rgba(0,242,255,0.15);border-radius:12px;padding:1.2rem 1.5rem;margin-bottom:1.5rem;">
                <p style="margin:0 0 0.8rem;font-size:0.88rem;line-height:1.6;">${step.description}</p>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:0.8rem 1rem;font-size:0.78rem;color:var(--text-dim);">
                    💡 <strong>Come trovare il tuo Telegram ID:</strong><br>
                    Apri Telegram → cerca <strong>@userinfobot</strong> → scrivi /start → ti risponde con il tuo ID numerico.
                </div>
            </div>
            <div class="form-group">
                <label style="font-size:0.85rem;">Il tuo Telegram ID personale (solo numeri)</label>
                <input type="text" id="wiz-telegram-id" placeholder="es. 123456789" 
                       value="${_onboardingStatus?.client?.telegram_chat_id || ''}"
                       pattern="[0-9-]+" inputmode="numeric"
                       style="font-size:1.1rem; letter-spacing:2px; font-family:monospace;">
                <small style="color:var(--text-dim);font-size:0.72rem;">Non è il tuo username (@nomeutente) ma il numero ID univoco</small>
            </div>
            <button class="btn btn-primary" style="width:100%;margin-top:0.8rem;" onclick="wiz_saveTelegramId()">
                💬 Salva Telegram ID
            </button>
            <div id="wiz-telegram-feedback" style="margin-top:0.8rem;"></div>`;

        case "signal_room":
            return `${doneBar}
            <div style="background:rgba(0,242,255,0.06);border:1px solid rgba(0,242,255,0.15);border-radius:12px;padding:1.2rem 1.5rem;margin-bottom:1.5rem;">
                <p style="margin:0 0 0.8rem;font-size:0.88rem;line-height:1.6;">${step.description}</p>
                <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:0.8rem 1rem;font-size:0.78rem;color:var(--text-dim);">
                    💡 <strong>Come trovare l'ID del canale:</strong><br>
                    Il tuo Admin te l'ha comunicato via messaggio. Di solito è un numero negativo che inizia con <code>-100</code>.
                </div>
            </div>
            <div class="form-group">
                <label style="font-size:0.85rem;">ID Canale/Gruppo Segnali (comunicato dal tuo provider)</label>
                <input type="text" id="wiz-signal-room-id" placeholder="es. -1001234567890"
                       style="font-size:1.05rem; letter-spacing:1px; font-family:monospace;">
                <small style="color:var(--text-dim);font-size:0.72rem;">Puoi inserire l'ID del canale Telegram oppure l'ID interno comunicato dal tuo Admin</small>
            </div>
            <button class="btn btn-primary" style="width:100%;margin-top:0.8rem;" onclick="wiz_saveSignalRoom()">
                📡 Collegati al Canale Segnali
            </button>
            <div id="wiz-signal-feedback" style="margin-top:0.8rem;"></div>`;

        case "mt4_config":
            return `${doneBar}
            <div style="background:rgba(0,242,255,0.06);border:1px solid rgba(0,242,255,0.15);border-radius:12px;padding:1.2rem 1.5rem;margin-bottom:1.5rem;">
                <p style="margin:0 0 0.8rem;font-size:0.88rem;line-height:1.6;">${step.description}</p>
                <div style="background:rgba(255,165,0,0.06);border:1px solid rgba(255,165,0,0.2);border-radius:8px;padding:0.7rem 1rem;font-size:0.75rem;color:#ffb347;">
                    ⚠️ Usa la password <strong>Investor</strong> (sola lettura) se il broker lo supporta, o la Master password se non disponibile.
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group" style="grid-column:1/-1;">
                    <label style="font-size:0.82rem;">Numero Conto MT4/MT5</label>
                    <input type="text" id="wiz-mt4-account" placeholder="es. 12345678" inputmode="numeric"
                           style="font-family:monospace;font-size:1rem;">
                </div>
                <div class="form-group">
                    <label style="font-size:0.82rem;">Password Conto</label>
                    <input type="password" id="wiz-mt4-password" placeholder="••••••••">
                </div>
                <div class="form-group">
                    <label style="font-size:0.82rem;">Server Broker</label>
                    <input type="text" id="wiz-mt4-server" placeholder="es. ICMarkets-Live03"
                           style="font-family:monospace;">
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                    <label style="font-size:0.82rem;">Piattaforma</label>
                    <select id="wiz-mt4-platform" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);color:white;border-radius:8px;padding:0.65rem 1rem;width:100%;outline:none;">
                        <option value="MT4">MetaTrader 4 (MT4)</option>
                        <option value="MT5">MetaTrader 5 (MT5)</option>
                    </select>
                </div>
            </div>
            <button class="btn btn-primary" style="width:100%;margin-top:0.8rem;" onclick="wiz_saveMT4Config()">
                📊 Salva Configurazione MT4
            </button>
            <div id="wiz-mt4-feedback" style="margin-top:0.8rem;"></div>`;

        case "generate_license": {
            const licId = _onboardingStatus?.license?.id;
            return `${doneBar}
            <div style="background:rgba(0,242,255,0.06);border:1px solid rgba(0,242,255,0.15);border-radius:12px;padding:1.2rem 1.5rem;margin-bottom:1.5rem;">
                <p style="margin:0 0 0.8rem;font-size:0.88rem;line-height:1.6;">${step.description}</p>
            </div>
            ${isDone ? `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:1rem 1.5rem;margin-bottom:1rem;">
                <div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.4rem;">Licenza attiva:</div>
                <div id="wiz-license-code-display" style="font-family:monospace;font-size:1.2rem;color:var(--accent);font-weight:700;letter-spacing:3px;">${_onboardingStatus?.license?.id || "—"}</div>
            </div>` : ""}
            <button class="btn btn-primary" style="width:100%;margin-top:0.8rem;" onclick="wiz_generateLicense()">
                🔑 ${isDone ? "Genera nuovo codice attivazione" : "Genera Codice Licenza"}
            </button>
            <div id="wiz-license-feedback" style="margin-top:0.8rem;"></div>
            <div id="wiz-activation-code-area" style="display:none;margin-top:1.2rem;background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.2);border-radius:12px;padding:1.2rem;">
                <div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.4rem;">Codice attivazione (valido 15 minuti):</div>
                <div id="wiz-activation-code" style="font-family:monospace;font-size:1.4rem;color:#00ff88;font-weight:700;letter-spacing:3px;margin-bottom:0.8rem;"></div>
                <button class="btn btn-sm btn-secondary" onclick="wiz_copyCode()">📋 Copia Codice</button>
            </div>`;
        }

        case "activate_telegram":
            return `${doneBar}
            <div style="background:rgba(0,242,255,0.06);border:1px solid rgba(0,242,255,0.15);border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;">
                <p style="margin:0 0 1rem;font-size:0.88rem;line-height:1.6;">${step.description}</p>
                <div style="display:flex;flex-direction:column;gap:0.6rem;">
                    <div style="display:flex;align-items:center;gap:0.8rem;font-size:0.85rem;">
                        <span style="background:rgba(0,242,255,0.15);border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;color:var(--accent);">1</span>
                        Apri Telegram sul tuo telefono o PC
                    </div>
                    <div style="display:flex;align-items:center;gap:0.8rem;font-size:0.85rem;">
                        <span style="background:rgba(0,242,255,0.15);border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;color:var(--accent);">2</span>
                        Cerca <strong>@SoftiBridgeBot</strong> e clicca <strong>START</strong>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.8rem;font-size:0.85rem;">
                        <span style="background:rgba(0,242,255,0.15);border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;color:var(--accent);">3</span>
                        Il bot ti chiederà il codice. Incolla semplicemente il codice generato al passo precedente
                    </div>
                    <div style="display:flex;align-items:center;gap:0.8rem;font-size:0.85rem;">
                        <span style="background:rgba(0,255,136,0.15);border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;color:#00ff88;">✅</span>
                        Il bot confermerà l'attivazione e sei pronto!
                    </div>
                </div>
            </div>
            <a href="https://t.me/SoftiBridgeBot" target="_blank" class="btn btn-primary" style="width:100%;text-align:center;display:block;text-decoration:none;">
                📱 Apri @SoftiBridgeBot su Telegram
            </a>
            <button class="btn btn-secondary" style="width:100%;margin-top:0.8rem;" onclick="wiz_checkActivation()">
                🔄 Ho attivato — verifica stato
            </button>
            <div id="wiz-activation-feedback" style="margin-top:0.8rem;"></div>`;

        default:
            return `<p>${step.description}</p>`;
    }
}

function _attachStepListeners() {
    // Enter key on inputs
    ["wiz-telegram-id", "wiz-signal-room-id", "wiz-mt4-account"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("keydown", (e) => {
                if (e.key === "Enter") wizardNext();
            });
        }
    });
}

// ─────────────────────────────────────────────────────────────
// NAVIGAZIONE
// ─────────────────────────────────────────────────────────────
function wizardNext() {
    if (_wizardCurrentStep < WIZARD_STEPS.length - 1) {
        _wizardCurrentStep++;
        renderWizardStep(_wizardCurrentStep);
    } else {
        closeOnboardingWizard();
    }
}

function wizardPrev() {
    if (_wizardCurrentStep > 0) {
        _wizardCurrentStep--;
        renderWizardStep(_wizardCurrentStep);
    }
}

function wizardSkip() {
    if (_wizardCurrentStep === WIZARD_STEPS.length - 1) {
        closeOnboardingWizard();
    } else {
        _wizardCurrentStep++;
        renderWizardStep(_wizardCurrentStep);
    }
}

function _wizardGoTo(idx) {
    _wizardCurrentStep = idx;
    renderWizardStep(idx);
}

// ─────────────────────────────────────────────────────────────
// AZIONI STEP
// ─────────────────────────────────────────────────────────────

function _getToken() {
    return window.SB_TOKEN || localStorage.getItem("softibridge_client_token") || localStorage.getItem("sb_client_token") || "";
}

function _feedbackEl(id, msg, isError = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<div style="
        padding: 0.65rem 1rem;
        border-radius: 8px;
        font-size: 0.82rem;
        ${isError
            ? "background:rgba(255,77,109,0.1);border:1px solid rgba(255,77,109,0.3);color:#ff4d6d;"
            : "background:rgba(0,255,136,0.08);border:1px solid rgba(0,255,136,0.25);color:#00ff88;"
        }
    ">${msg}</div>`;
}

async function wiz_saveTelegramId() {
    const chatId = (document.getElementById("wiz-telegram-id")?.value || "").trim();
    if (!chatId || !/^\d+$/.test(chatId)) {
        _feedbackEl("wiz-telegram-feedback", "❌ Inserisci un ID Telegram valido (solo numeri)", true);
        return;
    }
    try {
        const res = await fetch(`${window.SB_API_BASE || ""}/api/client/telegram/link`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${_getToken()}` },
            body: JSON.stringify({ chat_id: chatId }),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
            _feedbackEl("wiz-telegram-feedback", "✅ Telegram ID salvato! Procedi al passo successivo.");
            if (_onboardingStatus) _onboardingStatus.steps.telegram_id_saved = true;
            setTimeout(() => wizardNext(), 1200);
        } else {
            _feedbackEl("wiz-telegram-feedback", `❌ Errore: ${data.detail || "impossibile salvare"}`, true);
        }
    } catch (err) {
        _feedbackEl("wiz-telegram-feedback", `❌ Errore connessione: ${err.message}`, true);
    }
}

async function wiz_saveSignalRoom() {
    const roomInput = (document.getElementById("wiz-signal-room-id")?.value || "").trim();
    if (!roomInput) {
        _feedbackEl("wiz-signal-feedback", "❌ Inserisci l'ID del canale segnali", true);
        return;
    }
    // Determina se è un ID numerico Telegram o un ID interno
    const isNumeric = /^-?\d+$/.test(roomInput);
    const body = isNumeric ? { source_chat_id: roomInput } : { room_id: roomInput };

    try {
        const res = await fetch(`${window.SB_API_BASE || ""}/api/client/signal-room/link`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${_getToken()}` },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
            _feedbackEl("wiz-signal-feedback", `✅ Collegato al canale: <strong>${data.room_name || roomInput}</strong>`);
            if (_onboardingStatus) _onboardingStatus.steps.signal_room_linked = true;
            setTimeout(() => wizardNext(), 1500);
        } else {
            _feedbackEl("wiz-signal-feedback", `❌ ${data.detail || "Canale non trovato. Verifica l'ID con il tuo provider."}`, true);
        }
    } catch (err) {
        _feedbackEl("wiz-signal-feedback", `❌ Errore connessione: ${err.message}`, true);
    }
}

async function wiz_saveMT4Config() {
    const account = (document.getElementById("wiz-mt4-account")?.value || "").trim();
    const server = (document.getElementById("wiz-mt4-server")?.value || "").trim();
    const platform = document.getElementById("wiz-mt4-platform")?.value || "MT4";

    if (!account || !server) {
        _feedbackEl("wiz-mt4-feedback", "❌ Inserisci almeno il numero conto e il server broker", true);
        return;
    }

    try {
        const payload = {
            mt4_account: platform === "MT4" ? account : null,
            mt5_account: platform === "MT5" ? account : null,
            default_lots: 0.1,
            max_daily_dd_pct: 5.0,
        };
        const res = await fetch(`${window.SB_API_BASE || ""}/api/client/ea/config`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${_getToken()}` },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok && (data.source || data.mt4_account !== undefined || data.mt5_account !== undefined)) {
            _feedbackEl("wiz-mt4-feedback", `✅ Configurazione MT4 salvata! Account: <strong>${account}</strong> su <strong>${server}</strong>`);
            if (_onboardingStatus) _onboardingStatus.steps.mt4_configured = true;
            setTimeout(() => wizardNext(), 1500);
        } else {
            _feedbackEl("wiz-mt4-feedback", `❌ ${data.detail || "Errore nel salvataggio"}`, true);
        }
    } catch (err) {
        _feedbackEl("wiz-mt4-feedback", `❌ Errore connessione: ${err.message}`, true);
    }
}

async function wiz_generateLicense() {
    try {
        const res = await fetch(`${window.SB_API_BASE || ""}/api/client/license/activation-code`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${_getToken()}` },
            body: JSON.stringify({ ttl_minutes: 20 }),
        });
        const data = await res.json();
        if (res.ok && data.activation_code) {
            window._wiz_activation_code = data.activation_code;
            _feedbackEl("wiz-license-feedback", "✅ Codice generato! Valido per 15 minuti.");
            const area = document.getElementById("wiz-activation-code-area");
            const codeEl = document.getElementById("wiz-activation-code");
            if (area) area.style.display = "block";
            if (codeEl) codeEl.textContent = data.activation_code;
            if (_onboardingStatus) _onboardingStatus.steps.license_generated = true;
        } else {
            _feedbackEl("wiz-license-feedback", `❌ ${data.detail || "Impossibile generare il codice"}`, true);
        }
    } catch (err) {
        _feedbackEl("wiz-license-feedback", `❌ Errore: ${err.message}`, true);
    }
}

function wiz_copyCode() {
    const code = window._wiz_activation_code || document.getElementById("wiz-activation-code")?.textContent;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.querySelector("[onclick='wiz_copyCode()']");
        if (btn) {
            btn.textContent = "✅ Copiato!";
            setTimeout(() => { btn.textContent = "📋 Copia Codice"; }, 2000);
        }
    }).catch(() => {
        prompt("Copia questo codice:", code);
    });
}

async function wiz_checkActivation() {
    try {
        const res = await fetch(`${window.SB_API_BASE || ""}/api/client/onboarding/status`, {
            headers: { Authorization: `Bearer ${_getToken()}` },
        });
        const data = await res.json();
        if (data.steps?.license_telegram_activated) {
            _onboardingStatus = data;
            _feedbackEl("wiz-activation-feedback", "🎉 Account attivato con successo! Sei pronto per fare trading automatizzato.");
            if (_onboardingStatus) _onboardingStatus.steps.license_telegram_activated = true;
            const btnNext = document.getElementById("wiz-btn-next");
            if (btnNext) {
                btnNext.style.display = "inline-flex";
                btnNext.textContent = "🚀 Inizia a fare trading!";
            }
            renderWizardStep(_wizardCurrentStep);
        } else {
            _feedbackEl("wiz-activation-feedback", "⏳ Attivazione non ancora rilevata. Assicurati di aver inviato il codice al bot @SoftiBridgeBot.", true);
        }
    } catch (err) {
        _feedbackEl("wiz-activation-feedback", `❌ Errore verifica: ${err.message}`, true);
    }
}

// ─────────────────────────────────────────────────────────────
// ESPORTA per uso globale
// ─────────────────────────────────────────────────────────────
window.initOnboardingWizard = initOnboardingWizard;
window.openOnboardingWizard = openOnboardingWizard;
window.closeOnboardingWizard = closeOnboardingWizard;
window.wizardNext = wizardNext;
window.wizardPrev = wizardPrev;
window.wizardSkip = wizardSkip;
window._wizardGoTo = _wizardGoTo;
window.wiz_saveTelegramId = wiz_saveTelegramId;
window.wiz_saveSignalRoom = wiz_saveSignalRoom;
window.wiz_saveMT4Config = wiz_saveMT4Config;
window.wiz_generateLicense = wiz_generateLicense;
window.wiz_copyCode = wiz_copyCode;
window.wiz_checkActivation = wiz_checkActivation;
