import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { startServer } from './maia-elo/serve.mjs';

test('GPU setting saves, reloads and reports failures, and the Japanese header stays compact', { timeout: 60000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 720, height: 800 } });
        await page.addInitScript(() => {
            const callbacks = {};
            window.fixture = { failRead: false, failSave: false };
            window.serverAPI = {
                getPort: async () => 2800, setPort: async () => false, sendEnginesList: async () => {},
                getHardwareAcceleration: async () => {
                    if(window.fixture.failRead) throw new Error('test load failure');
                    return sessionStorage.getItem('test-gpu') === 'true';
                },
                setHardwareAcceleration: async enabled => {
                    if(window.fixture.failSave) throw new Error('test save failure');
                    sessionStorage.setItem('test-gpu', String(enabled));
                    return enabled;
                },
                onListening: cb => callbacks.listening = cb, onClientChange: cb => callbacks.client = cb,
                onUnauthorized: cb => callbacks.unauthorized = cb
            };
            window.engineAPI = {
                getSavedEngines: async () => [], onRefreshEngineCards() {}, onAddConsoleView() {},
                onRemoveConsoleView() {}, onRenderEngineGrid() {}, onLog() {}
            };
            window.electronAPI = { getAlwaysOnTop: async () => false, getVersion: async () => '1' };
            window.toastAPI = { onMessage() {} };
            window.aiAPI = {
                onStatus() {}, getSettings: async () => ({}),
                getStatus: async () => ({ state: 'offline', setup: { installed: false } })
            };
        });
        await page.goto(`${url}/appServer/ui/index.html`);
        const open = async () => {
            await page.locator('#portSettingsBtn').click();
            await page.waitForFunction(() => !document.querySelector('#server-gpu-acceleration').disabled);
        };
        const gpu = page.locator('#server-gpu-acceleration');
        await open();
        assert.equal(await gpu.isChecked(), false);
        await gpu.check();
        await page.waitForFunction(() => sessionStorage.getItem('test-gpu') === 'true'
            && !document.querySelector('#server-gpu-acceleration').disabled);
        await page.evaluate(() => { window.fixture.failSave = true; });
        await gpu.click();
        await page.waitForFunction(() => document.querySelector('#acas-toast-container').textContent.includes('Could not load or save GPU acceleration.'));
        assert.equal(await gpu.isChecked(), true);
        await page.locator('#portSettingsCancel').click();
        await page.reload();
        await open();
        assert.equal(await gpu.isChecked(), true);
        await page.locator('#portSettingsCancel').click();
        await page.evaluate(() => { window.fixture.failRead = true; });
        await page.locator('#portSettingsBtn').click();
        await page.waitForFunction(() => document.querySelector('#acas-toast-container').textContent.includes('Could not load or save GPU acceleration.'));
        assert.equal(await gpu.isDisabled(), true);
        await page.locator('#portSettingsCancel').click();
        await page.evaluate(() => { window.fixture.failRead = false; });
        await open();
        assert.equal(await gpu.isChecked(), true);
        const englishHeight = await page.locator('#acas-header').evaluate(element => element.getBoundingClientRect().height);
        await page.selectOption('#server-language', 'jp');
        assert.notEqual(await page.locator('label[for="server-gpu-acceleration"]').textContent(), 'GPU acceleration');
        await page.locator('#portSettingsCancel').click();
        const header = await page.locator('#acas-header').evaluate(element => {
            const outer = element.getBoundingClientRect();
            const children = [...element.querySelectorAll('#acas-logo-text-container, #acas-is-free-reminder')]
                .map(child => child.getBoundingClientRect());
            return { height: outer.height, fits: children.every(child => child.top >= outer.top
                && child.bottom <= outer.bottom && child.left >= outer.left && child.right <= outer.right) };
        });
        assert.ok(header.height <= englishHeight + 1 && header.fits,
            `English ${englishHeight}px, Japanese ${JSON.stringify(header)}`);
        await page.setViewportSize({ width: 360, height: 568 });
        await open();
        const meta = JSON.parse(await readFile(new URL('../assets/i18n/meta.json', import.meta.url), 'utf8'));
        for(const size of ['100', '150']) {
            await page.selectOption('#server-text-size', size);
            for(const [code] of meta.availableLanguages) {
                await page.evaluate(language => window.serverI18n.setLanguage(language), code === 'us' ? 'en' : code);
                await page.evaluate(() => document.fonts.ready);
                const subtitle = await page.locator('#acas-logo-secondary').evaluate(element => {
                    const fitted = parseFloat(getComputedStyle(element).fontSize);
                    const inlineSize = element.style.fontSize;
                    element.style.fontSize = '';
                    const natural = parseFloat(getComputedStyle(element).fontSize);
                    element.style.fontSize = inlineSize;
                    return { fitted, natural, decorative: element.classList.contains('has-whisper-font') };
                });
                if(!subtitle.decorative)
                    assert.ok(subtitle.fitted <= subtitle.natural + 0.01,
                        `${code} at ${size}%: subtitle must not grow beyond its natural size: ${JSON.stringify(subtitle)}`);
                const layout = await page.locator('#portSettingsDialog').evaluate(dialog => {
                    const row = dialog.querySelector('#server-gpu-acceleration').parentElement;
                    const label = row.querySelector('label').getBoundingClientRect();
                    const hint = row.querySelector('#server-gpu-hint').getBoundingClientRect();
                    const input = row.querySelector('input').getBoundingClientRect();
                    return { fits: dialog.scrollWidth <= dialog.clientWidth,
                        separated: label.right + 12 <= input.left || input.right + 12 <= label.left,
                        hintSeparated: hint.right + 12 <= input.left || input.right + 12 <= hint.left };
                });
                assert.ok(layout.fits && layout.separated && layout.hintSeparated, `${code}: ${JSON.stringify(layout)}`);
            }
        }
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
