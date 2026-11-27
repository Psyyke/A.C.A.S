import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { buildUserscript } from './elo-tool/userscriptHarness.mjs';

test('Maia 3 runtime persists per profile and highlights the restored choice', { timeout: 60000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const context = await browser.newContext();
        await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
        const page = await context.newPage();
        await page.goto(`${url}/404.html`);
        const id = await page.evaluate(async () => {
            const { savePersonalModel } = await import('/app/assets/engines/Maia3/personal-models.js');
            return savePersonalModel(new File(['fixture'], 'test.onnx'));
        });
        await page.evaluate(id => {
            localStorage.setItem('gm:isTosAccepted', 'true');
            localStorage.setItem('gm:AcasConfig', JSON.stringify({ global: {
                chessEngineProfile: 'default', profiles: {
                    default: { engineEnabled: false, chessEngine: 'maia3', maia3Model: id, maia3Provider: 'wasm' },
                    other: { engineEnabled: false, chessEngine: 'maia3', maia3Model: id, maia3Provider: 'wasm' }
                }
            } }));
        }, id);
        const userscript = (await buildUserscript())
            .replace("'hosts': { 'prod': 'acaschess.com', 'dev': 'localhost' }",
                `'hosts': { 'prod': '${new URL(url).host}', 'dev': '${new URL(url).host}' }`)
            .replace("'devPath': '/A.C.A.S/'", "'devPath': '/app/'");
        await page.addInitScript(userscript);
        await page.goto(`${url}/app/`);
        const panel = page.locator('#maia3-models');
        const runtime = panel.locator('[data-provider]');
        await page.waitForFunction(() => document.querySelector('#maia3-models input[data-key="maia3Model"]')?.value);
        await panel.locator('.open-floaty-btn').click();
        const select = async value => {
            await runtime.locator('..').locator('.dropdown-icon').click();
            await panel.locator(`.dropdown-item[data-value="${value}"]`).click();
            await page.waitForFunction(value =>
                JSON.parse(localStorage.getItem('gm:AcasConfig')).global.profiles.default.maia3Provider === value, value);
        };
        const check = async value => {
            assert.equal(await runtime.inputValue(), value);
            assert.deepEqual(await panel.locator('.selected-list-item').evaluateAll(items =>
                items.map(item => item.dataset.value)), [value]);
        };
        await check('wasm');
        await select('webgpu');
        await check('webgpu');
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#maia3-models input[data-key="maia3Provider"]')?.value === 'webgpu');
        await panel.locator('.open-floaty-btn').click();
        await check('webgpu');
        await runtime.fill('invalid');
        await runtime.dispatchEvent('change');
        await page.waitForFunction(() => document.querySelector('#maia3-models [data-provider]').value === 'webgpu');
        await check('webgpu');
        assert.equal(await panel.locator('.dropdown-item.hidden').count(), 0);
        assert.equal(await page.evaluate(() =>
            JSON.parse(localStorage.getItem('gm:AcasConfig')).global.profiles.default.maia3Provider), 'webgpu');
        await page.locator('#maia3-weights-floaty .floaty-close-btn').click();
        await page.locator('#chess-engine-profile-tabs .tab-item').filter({ hasText: 'other' }).click();
        await page.waitForFunction(() => document.querySelector('#maia3-models input[data-key="maia3Provider"]')?.value === 'wasm');
        await panel.locator('.open-floaty-btn').click();
        await check('wasm');
        await page.locator('#maia3-weights-floaty .floaty-close-btn').click();
        await page.locator('#chess-engine-profile-tabs .tab-item[data-value="default"]').click();
        await page.waitForFunction(() => document.querySelector('#maia3-models input[data-key="maia3Provider"]')?.value === 'webgpu');
        await panel.locator('.open-floaty-btn').click();
        await check('webgpu');
        await select('wasm');
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#maia3-models input[data-key="maia3Provider"]')?.value === 'wasm');
        await panel.locator('.open-floaty-btn').click();
        await check('wasm');
    } finally {
        await browser.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});
