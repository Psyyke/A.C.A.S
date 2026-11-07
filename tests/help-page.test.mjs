import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

test('Help combines troubleshooting and FAQ and preserves old question links', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    let browser;
    try {
        browser = await chromium.launch();
        const page = await browser.newPage();
        await page.route('**/*', route => new URL(route.request().url()).origin === url
            ? route.continue() : route.abort());
        await page.goto(`${url}/troubleshoot/`, { waitUntil: 'domcontentloaded' });
        const ids = await page.locator('#main [id]').evaluateAll(elements => elements.map(element => element.id));
        assert.equal(new Set(ids).size, ids.length, 'section IDs must be unique');
        assert.ok(ids.includes('not-working'));
        assert.ok(ids.includes('faq'));
        assert.ok(ids.includes('external-server'));
        assert.equal(await page.locator('[itemtype="https://schema.org/Question"]').count(), 7);
        assert.equal(await page.locator('header a:has-text("Help")').count(), 1);
        assert.equal(await page.locator('header a:has-text("FAQ")').count(), 0);
        assert.equal(await page.locator('#mobile-nav a:has-text("FAQ")').count(), 0);
        for (const width of [390, 890, 1110]) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
        for (const hash of ['', '#faq', '#why-is-en-passant-missing', '#chess-engine-terms-explained']) {
            await page.goto(`${url}/faq/${hash}`, { waitUntil: 'domcontentloaded' });
            await page.waitForURL(`${url}/troubleshoot/${hash || '#faq'}`);
            assert.equal(await page.locator(`[id="${(hash || '#faq').slice(1)}"]`).count(), 1);
        }
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
    }
});
