import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

test('running engine cards use neutral, distinct colors and a visible hover state', async () => {
    const css = readFileSync(new URL('../appServer/ui/css/main.css', import.meta.url), 'utf8');
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent(`<style>${css}\n.engine-card { transition: none; }</style>
            <div class="engine-card" id="idle"><span class="engine-status">Idle</span></div>
            <div class="engine-card active" id="running"><span class="engine-status">1 running</span></div>`);
        const style = selector => page.locator(selector).evaluate(element => {
            const result = getComputedStyle(element);
            return { background: result.backgroundColor, border: result.borderColor };
        });
        const idle = await style('#idle');
        const running = await style('#running');
        assert.equal(idle.background, 'rgb(36, 36, 36)');
        assert.equal(running.background, 'rgb(48, 48, 48)');
        assert.notEqual(running.border, idle.border);
        await page.locator('#running').hover();
        const hovered = await style('#running');
        assert.equal(hovered.background, 'rgb(56, 56, 56)');
        assert.notEqual(hovered.border, running.border);
    } finally {
        await browser.close();
    }
});

test('server controls use a neutral background and the port status has no glow', async () => {
    const css = readFileSync(new URL('../appServer/ui/css/main.css', import.meta.url), 'utf8');
    const script = readFileSync(new URL('../appServer/ui/index.js', import.meta.url), 'utf8');
    const start = script.indexOf('function updateServerStatusIcon(');
    const end = script.indexOf('window.engineAPI.onRefreshEngineCards(', start);
    assert.ok(start !== -1 && end > start);
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent(`<style>${css}\n#statusDot { transition: none; }</style>
            <div id="acas-header"></div>
            <header id="server-controls"><button id="portSettingsBtn" class="server-info acas-fancy-button">
                <span id="statusDot"></span><span id="portDisplay">OFFLINE</span>
            </button></header>`);
        await page.addScriptTag({ content: `
            const portDisplay = document.getElementById('portDisplay');
            const portSettingsBtn = document.getElementById('portSettingsBtn');
            const statusDot = document.getElementById('statusDot');
            let serverConnectionStatus = false;
            const toast = { success() {}, message() {}, warning() {} };
            window.callbacks = {};
            window.serverAPI = {
                onListening: callback => callbacks.listening = callback,
                onClientChange: callback => callbacks.clientChange = callback,
                onUnauthorized: callback => callbacks.unauthorized = callback
            };
            ${script.slice(start, end)}
        ` });
        assert.equal(await page.locator('#server-controls').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(8, 8, 8)');
        const divider = await page.locator('#acas-header').evaluate(element => {
            const style = getComputedStyle(element);
            return { width: style.borderBottomWidth, color: style.borderBottomColor };
        });
        assert.deepEqual(divider, { width: '1px', color: 'rgb(28, 28, 28)' });
        for(const [event, data, icon] of [
            ['listening', { port: 5000 }, 'server-connection-loading'],
            ['clientChange', { isConnected: true, origin: 'test' }, 'bi-check-circle-fill'],
            ['clientChange', { isConnected: false, origin: 'test' }, 'server-connection-loading'],
            ['unauthorized', { origin: 'test' }, 'bi-exclamation-triangle-fill']
        ]) {
            await page.evaluate(([event, data]) => window.callbacks[event](data), [event, data]);
            const status = await page.locator('#statusDot').evaluate(element => {
                const style = getComputedStyle(element);
                return { icon: element.className, shadow: style.boxShadow };
            });

            assert.deepEqual(status, { icon: `bi ${icon}`, shadow: 'none' });
            assert.match(await page.locator('#portSettingsBtn').getAttribute('aria-label'), /Local server port 5000/);
        }
        assert.equal(await page.locator('#portDisplay').textContent(), '5000');
    } finally {
        await browser.close();
    }
});

test('usage guide link matches the header buttons and opens externally', async () => {
    const html = readFileSync(new URL('../appServer/ui/index.html', import.meta.url), 'utf8');
    const script = readFileSync(new URL('../appServer/ui/index.js', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../appServer/ui/css/main.css', import.meta.url), 'utf8');
    const icons = readFileSync(new URL('../appServer/ui/css/bootstrap.css', import.meta.url), 'utf8');
    const start = script.indexOf("document.querySelectorAll('a.external')");
    const end = script.indexOf('\nif(engineUiGrid)', start);
    assert.ok(start !== -1 && end > start);
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ bypassCSP: true });
        await page.setContent(html);
        await page.addStyleTag({ content: `${icons}\n${css}` });
        await page.addScriptTag({ content: `
            window.electronAPI = { openExternal: url => window.openedUrl = url };
            ${script.slice(start, end)}
        ` });
        const link = page.getByRole('link', { name: 'A.C.A.S usage guide' });
        assert.equal(await link.getAttribute('href'), 'https://psyyke.github.io/A.C.A.S/usage/');
        assert.equal(await link.locator('.bi-file-earmark-text-fill.usage-guide-icon').count(), 1);
        const buttons = page.locator('.acas-social-actions > a');
        assert.equal(await buttons.nth(1).getAttribute('aria-label'), 'A.C.A.S usage guide');
        assert.ok(await link.evaluate(element => element.classList.contains('header-social-button') && element.classList.contains('acas-fancy-button')));
        await link.click();
        assert.equal(await page.evaluate(() => window.openedUrl), 'https://psyyke.github.io/A.C.A.S/usage/');
    } finally {
        await browser.close();
    }
});
