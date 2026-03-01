const i18n = {
    "it": {
        "nav.overview": "La Mia Licenza",
        "nav.trading": "Trading Panel",
        "nav.signals": "Segnali Live",
        "nav.positions": "Posizioni Aperte",
        "nav.pending": "Ordini Pendenti",
        "nav.history": "Storico",
        "nav.config": "Config EA",
        "nav.downloads": "Download",
        "nav.payments": "Pagamenti"
    },
    "en": {
        "nav.overview": "My License",
        "nav.trading": "Trading Panel",
        "nav.signals": "Live Signals",
        "nav.positions": "Open Positions",
        "nav.pending": "Pending Orders",
        "nav.history": "History",
        "nav.config": "EA Config",
        "nav.downloads": "Downloads",
        "nav.payments": "Payments"
    },
    "es": {
        "nav.overview": "Mi Licencia",
        "nav.trading": "Panel de Trading",
        "nav.signals": "Señales en Vivo",
        "nav.positions": "Posiciones Abiertas",
        "nav.pending": "Órdenes Pendientes",
        "nav.history": "Historial",
        "nav.config": "Configuración EA",
        "nav.downloads": "Descargas",
        "nav.payments": "Pagos"
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
            localStorage.setItem('softibridge_client_lang', e.target.value);
        });

        const savedLang = localStorage.getItem('softibridge_client_lang') || 'it';
        langSwitcher.value = savedLang;
        changeLanguage(savedLang);
    }
});
