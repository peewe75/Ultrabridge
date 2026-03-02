const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('PAGE ERROR:', msg.text());
        }
    });

    page.on('pageerror', err => {
        console.log('PAGE EXCEPTION:', err.message);
    });

    try {
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
        console.log('Visited root /');
    } catch (e) {
        console.log('Navigation error', e);
    }

    try {
        await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle0' });
        console.log('Visited /dashboard');
    } catch (e) {
        console.log('Navigation error', e);
    }

    await browser.close();
})();
