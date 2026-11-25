import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

test('credits handles retries, search, licences, document links, languages and nested dialog focus', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
        await page.route(/\.js(?:\?|$)/, route => {
            const path = new URL(route.request().url()).pathname;
            if(path.endsWith('/js/credits.js') || path.endsWith('/js/i18n.js')) return route.continue();
            return route.fulfill({ contentType: 'text/javascript', body: '' });
        });
        await page.addInitScript(() => {
            window.fixture = { fail: true, requests: 0, links: [], chromium: 0, errors: [] };
            window.toast = { error: message => window.fixture.errors.push(message) };
            window.electronAPI = {
                getCredits: async () => {
                    window.fixture.requests++;
                    if(window.fixture.fail) throw new Error('test loading error');
                    return [
                        { id: 'libraries', entries: [
                            { name: 'Electron', version: '45.2.3', license: 'MIT',
                                source: 'https://github.com/electron/electron', chromiumNotices: true,
                                licenseText: 'Electron copyright\nPermission notice\n<script>literal licence text</script>' },
                            { name: '<img src=x onerror=alert(1)>', license: 'MIT', licenseText: 'Another licence' }
                        ] },
                        { id: 'fonts', entries: [{ name: 'Rubik', license: 'OFL-1.1', licenseText: 'Font copyright' }] },
                        { id: 'ai', entries: [{ name: 'NVIDIA CUDA', license: 'NVIDIA', terms: 'https://docs.nvidia.com/cuda/eula/index.html' }] }
                    ];
                },
                openExternal: async url => window.fixture.links.push(url),
                openChromiumNotices: async () => { window.fixture.chromium++; }
            };
        });
        await page.goto(`${url}/appServer/ui/index.html`);
        await page.evaluate(() => document.getElementById('portSettingsDialog').showModal());
        await page.locator('#openCredits').click();
        await page.waitForSelector('#creditsRetry:visible');
        assert.match(await page.locator('#creditsStatus').textContent(), /Could not load credits/);
        assert.equal(await page.locator('#creditsSearch').isDisabled(), true);
        await page.evaluate(() => { window.fixture.fail = false; });
        await page.locator('#creditsRetry').click();
        await page.waitForFunction(() => !document.getElementById('creditsSearch').disabled);
        assert.equal(await page.locator('.credits-group:visible').count(), 3);
        assert.equal(await page.locator('#creditsList img, #creditsList script').count(), 0);
        assert.equal(await page.locator('#creditsSearch').evaluate(element => element === document.activeElement), true);

        await page.locator('#creditsSearch').fill('  eLeCtRoN ');
        assert.equal(await page.locator('.credits-entry:visible').count(), 1);
        await page.locator('.credits-entry:visible summary').click();
        assert.match(await page.locator('.credits-entry:visible pre').textContent(), /<script>literal licence text<\/script>/);
        await page.locator('.credits-entry:visible a').click();
        assert.deepEqual(await page.evaluate(() => window.fixture.links), ['https://github.com/electron/electron']);
        await page.getByRole('button', { name: 'Chromium notices' }).click();
        assert.equal(await page.evaluate(() => window.fixture.chromium), 1);

        await page.locator('#creditsSearch').fill('no-such-component');
        assert.equal(await page.locator('.credits-group:visible').count(), 0);
        assert.equal(await page.locator('#creditsStatus').textContent(), 'No matches.');
        await page.evaluate(() => window.serverI18n.setLanguage('fi'));
        assert.equal(await page.locator('#creditsTitle').textContent(), 'Tekijät ja lisenssit');
        assert.equal(await page.locator('#creditsStatus').textContent(), 'Ei osumia.');
        await page.locator('#creditsSearch').fill('ofl');
        assert.equal(await page.locator('.credits-entry:visible').count(), 1);

        await page.locator('#creditsSearch').fill('');
        await page.evaluate(() => window.serverI18n.setLanguage('arab'));
        await page.setViewportSize({ width: 320, height: 600 });
        for(const summary of await page.locator('.credits-entry summary').all()) await summary.click();
        const bounds = await page.locator('#serverCredits').evaluate(element => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, width: innerWidth,
                client: element.clientWidth, scroll: element.scrollWidth,
                listClient: document.getElementById('creditsList').clientWidth,
                listScroll: document.getElementById('creditsList').scrollWidth };
        });
        assert.ok(bounds.left >= 0 && bounds.right <= bounds.width
            && bounds.scroll <= bounds.client && bounds.listScroll <= bounds.listClient, JSON.stringify(bounds));
        await page.locator('#creditsSearch').focus();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#serverCredits').evaluate(element => element.open), false);
        assert.equal(await page.locator('#portSettingsDialog').evaluate(element => element.open), true);
        assert.equal(await page.locator('#openCredits').evaluate(element => element === document.activeElement), true);
        await page.locator('#openCredits').click();
        assert.equal(await page.evaluate(() => window.fixture.requests), 2);
        await page.locator('#closeCredits').click();
        assert.equal(await page.locator('#serverCredits').evaluate(element => element.open), false);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
