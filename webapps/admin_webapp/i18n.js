const i18n = {
    "it": {
        "nav.dash": "Dashboard",
        "nav.lic": "Licenze",
        "nav.cli": "Clienti",
        "nav.vps": "VPS Status",
        "nav.logs": "Audit Logs",
        "nav.rev": "Revenue Ledger",
        "nav.wl": "L0: White Labels",
        "nav.set": "Settings",
        "nav.tour": "🌟 Avvia Tour Guidato"
    },
    "en": {
        "nav.dash": "Dashboard",
        "nav.lic": "Licenses",
        "nav.cli": "Clients",
        "nav.vps": "VPS Status",
        "nav.logs": "Audit Logs",
        "nav.rev": "Revenue Ledger",
        "nav.wl": "L0: White Labels",
        "nav.set": "Settings",
        "nav.tour": "🌟 Start Guided Tour"
    },
    "es": {
        "nav.dash": "Dashboard",
        "nav.lic": "Licencias",
        "nav.cli": "Clientes",
        "nav.vps": "Estado VPS",
        "nav.logs": "Registros",
        "nav.rev": "Revenue Ledger",
        "nav.wl": "L0: White Labels",
        "nav.set": "Configuración",
        "nav.tour": "🌟 Iniciar Tour Guiado"
    }
};

function changeLanguage(lang) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang] && i18n[lang][key]) {
            el.innerHTML = i18n[lang][key];
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const langSwitcher = document.getElementById('lang-switcher');
    if (langSwitcher) {
        langSwitcher.addEventListener('change', (e) => {
            changeLanguage(e.target.value);
            localStorage.setItem('softibridge_admin_lang', e.target.value);
        });

        const savedLang = localStorage.getItem('softibridge_admin_lang') || 'it';
        langSwitcher.value = savedLang;
        changeLanguage(savedLang);
    }
});
