import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { mockUserscript } from './elo-tool/mockUserscript.js';

test('connection checking never shows an empty or stale estimate card', { timeout: 30000 }, async () => {
    const previousIsolate = process.env.ISOLATE;
    process.env.ISOLATE = '0';
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        await page.route('**/*', route => new URL(route.request().url()).host === new URL(url).host ? route.continue() : route.abort());
        await page.goto(`${url}/tools/eloeye/index.html?fast`);
        await page.click('#start');
        assert.equal(await page.locator('#stop').isVisible(), true);
        assert.equal(await page.locator('#run').isHidden(), true);
        await page.waitForSelector('#form-error:not([hidden])');
        assert.match(await page.locator('#form-error').textContent(), /cannot reach the A.C.A.S window/);
        assert.equal(await page.locator('#run').isHidden(), true);

        await page.evaluate(() => {
            document.getElementById('precision').textContent = 'stale range';
            document.getElementById('status').textContent = 'stale status';
        });
        await page.click('#start');
        assert.equal(await page.locator('#run').isHidden(), true);
        await page.click('#stop');
        await page.waitForSelector('#form-error:not([hidden])');
        assert.equal(await page.locator('#run').isHidden(), true);
    } finally {
        await browser.close();
        server.close();
        if(previousIsolate === undefined) delete process.env.ISOLATE;
        else process.env.ISOLATE = previousIsolate;
    }
});

test('successful connection displays the prepared estimate', { timeout: 30000 }, async () => {
    const previousIsolate = process.env.ISOLATE;
    process.env.ISOLATE = '0';
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        await page.route('**/*', route => new URL(route.request().url()).host === new URL(url).host ? route.continue() : route.abort());
        await page.route('**/eloPlayer.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
            export class SetupError extends Error {}
            export async function runMatch({ signal }) {
                await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
            }
        ` }));
        await page.addInitScript(mockUserscript, { behaviour: 'moves' });
        await page.goto(`${url}/tools/eloeye/index.html?fast`);
        await page.click('#start');
        await page.waitForSelector('#run:not([hidden])');
        assert.equal(await page.locator('#precision').textContent(), '0-4000');
        assert.equal(await page.locator('#status').textContent(), 'Preparing EloEye…');
        await page.click('#stop');
        await page.waitForSelector('#form-error:not([hidden])');
        assert.equal(await page.locator('#run').isHidden(), true);
    } finally {
        await browser.close();
        server.close();
        if(previousIsolate === undefined) delete process.env.ISOLATE;
        else process.env.ISOLATE = previousIsolate;
    }
});
