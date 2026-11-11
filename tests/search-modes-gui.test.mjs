import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { buildUserscript } from './elo-tool/userscriptHarness.mjs';

test('advanced search mode and time budget persist in the selected profile', { timeout: 60000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    try {
        await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
        await context.route('http://localhost/A.C.A.S/**', async route => {
            const request = new URL(route.request().url());
            const response = await route.fetch({ url: `${url}${request.pathname.slice('/A.C.A.S'.length)}${request.search}` });
            await route.fulfill({ response });
        });
        await context.addInitScript(() => {
            if(localStorage.getItem('gm:isTosAccepted')) return;
            localStorage.setItem('gm:isTosAccepted', 'true');
            localStorage.setItem('gm:AcasConfig', JSON.stringify({ global: {
                chessEngineProfile: 'default', profiles: { default: { engineEnabled: true, enableAdvancedElo: true } }
            } }));
        });
        const page = await context.newPage();
        await page.addInitScript(await buildUserscript());
        await page.goto('http://localhost/A.C.A.S/app/');
        await page.waitForFunction(() => window.USERSCRIPT && document.querySelector('input[data-key="advancedSearchMode"]').value);
        await page.locator('#engine-elo-input .open-floaty-btn').click();
        const dialog = page.locator('#elo-floaty');
        const mode = dialog.locator('input[data-key="advancedSearchMode"]');
        const budget = dialog.locator('input[data-key="advancedSearchMovetime"]');
        const depth = dialog.locator('input[data-key="advancedEloDepth"]');
        const nodes = dialog.locator('input[data-key="engineNodes"]');
        const maxTime = page.locator('input[data-key="maxMovetime"]');
        assert.equal(await mode.inputValue(), 'standard');
        assert.equal(await budget.inputValue(), '5000');
        await page.waitForFunction(() => document.querySelector('input[data-key="advancedSearchMovetime"]').disabled);
        assert.equal(await depth.isEnabled(), true);
        assert.equal(await nodes.isEnabled(), true);
        assert.equal(await maxTime.isEnabled(), true);
        await mode.locator('..').locator('.dropdown-icon').click();
        await dialog.locator('.dropdown-item[data-value="movetime"]').click();
        await page.waitForFunction(() => document.querySelector('input[data-key="maxMovetime"]').disabled);
        assert.equal(await depth.isDisabled(), true);
        assert.equal(await nodes.isDisabled(), true);
        await budget.fill('7000');
        await budget.dispatchEvent('change');
        await page.waitForFunction(() => {
            const profile = JSON.parse(localStorage.getItem('gm:AcasConfig')).global.profiles.default;
            return profile.advancedSearchMode === 'movetime' && profile.advancedSearchMovetime === 7000;
        });
        await page.reload();
        await page.waitForFunction(() => document.querySelector('input[data-key="advancedSearchMode"]').value === 'movetime'
            && document.querySelector('input[data-key="advancedSearchMovetime"]').value === '7000');
        await page.waitForFunction(() => document.querySelector('input[data-key="maxMovetime"]').disabled);
        await page.locator('#engine-elo-input .open-floaty-btn').click();
        await mode.locator('..').locator('.dropdown-icon').click();
        await dialog.locator('.dropdown-item[data-value="infinite"]').click();
        await page.waitForFunction(() => !document.querySelector('input[data-key="maxMovetime"]').disabled);
        assert.equal(await depth.isDisabled(), true);
        assert.equal(await nodes.isDisabled(), true);
        assert.equal(await budget.isDisabled(), true);
        await mode.locator('..').locator('.dropdown-icon').click();
        await dialog.locator('.dropdown-item[data-value="standard"]').click();
        await page.waitForFunction(() => !document.querySelector('input[data-key="advancedEloDepth"]').disabled);
        assert.equal(await nodes.isEnabled(), true);
        await dialog.locator('.floaty-close-btn').click();
    } finally {
        await context.close();
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
