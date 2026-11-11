import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

test('settings survive reload with separate training-method values and no file restoration', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => !document.querySelector('#games').disabled);
        await page.evaluate(async () => {
            const split = id => ({ gameIds: [id], samples: [{ gameId: id, gameIndex: 0 }] });
            await (await import('./storage.js')).savePreparedGames({
                version: 1, player: 'player', playerElo: 1800, options: {},
                train: split('game-0000000000000001'), validation: split('game-0000000000000002')
            });
        });
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        await page.locator('#learning-rate').fill('0.000002');
        await page.locator('#epochs').fill('7');
        await page.locator('#maia3-elo').fill('1700');
        await page.locator('#training-method').selectOption('adapter');
        await page.locator('#learning-rate').fill('0.0000005');
        await page.locator('#epochs').fill('18');
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.equal(await page.locator('#training-method').inputValue(), 'adapter');
        assert.equal(await page.locator('#learning-rate').inputValue(), '0.0000005');
        assert.equal(await page.locator('#epochs').inputValue(), '18');
        assert.equal(await page.locator('#maia3-elo').inputValue(), '1700');
        assert.equal(await page.locator('#games').evaluate(input => input.files.length), 0);
        await page.locator('#training-method').selectOption('full');
        assert.equal(await page.locator('#learning-rate').inputValue(), '0.000002');
        assert.equal(await page.locator('#epochs').inputValue(), '7');
        await page.locator('#base-network').selectOption('maia-1400.pb');
        await page.locator('#learning-rate').fill('0.00005');
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.equal(await page.locator('#base-network').inputValue(), 'maia-1400.pb');
        assert.equal(await page.locator('#learning-rate').inputValue(), '0.00005');
        const buttons = await page.locator('.maia-saved-games > button').allTextContents();
        assert.deepEqual(buttons, ['Reset settings', 'Clear saved games']);
        for(const width of [360, 390, 600, 606, 760, 900, 1200]) {
            await page.setViewportSize({ width, height: 900 });
            const layout = await page.evaluate(() => {
                const reset = document.querySelector('#reset-settings').getBoundingClientRect();
                const clear = document.querySelector('#clear-data').getBoundingClientRect();
                const heading = document.querySelector('.elo-heading-main').getBoundingClientRect();
                const title = document.querySelector('.doppelmaia-title').getBoundingClientRect();
                return { aligned: Math.abs(reset.top - clear.top) < 1, left: reset.right <= clear.left,
                    belowHeading: reset.top >= heading.bottom, besideHeading: reset.left >= title.right,
                    overflow: document.documentElement.scrollWidth > innerWidth };
            });
            assert(layout.aligned && layout.left, `${width}: buttons are side by side`);
            assert.equal(layout.overflow, false, `${width}: overflow`);
            assert(width <= 900 ? layout.belowHeading : layout.besideHeading, `${width}: header does not overlap buttons`);
        }
        await page.locator('#reset-settings').click();
        await page.waitForFunction(() => !document.querySelector('#start').disabled
            && document.querySelector('#base-network').value === 'maia3');
        assert.equal(await page.locator('#learning-rate').inputValue(), '0.00001');
        assert.equal(await page.locator('#epochs').inputValue(), '12');
        assert.equal(await page.evaluate(() => localStorage.getItem('acas-doppelmaia-settings-v1')), null);
        assert.match(await page.locator('#saved-data-status').textContent(), /player.*positions saved/);
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
