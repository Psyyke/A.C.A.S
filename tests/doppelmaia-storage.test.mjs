import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

const pgn = `[White "MyPlayer"]
[Black "Other"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. Nc3 d6 6. Be3 O-O 7. O-O *

[White "MyPlayer"]
[Black "Other"]
[Result "*"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 Be7 5. Bf4 O-O 6. e3 c5 7. Bd3 *
`;

test('processed games restore without worker processing and can be cleared', { timeout: 60000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
            window.dataRequests = [];
            const post = Worker.prototype.postMessage;
            Worker.prototype.postMessage = function(data, ...args) {
                if(['parse', 'prepare', 'validate'].includes(data.type)) window.dataRequests.push(data.type);
                return post.call(this, data, ...args);
            };
        });
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => !document.querySelector('#games').disabled);
        assert.match(await page.locator('#saved-data-status').textContent(), /No games saved/);
        for(const width of [1200, 390]) {
            await page.setViewportSize({ width, height: 900 });
            const layout = await page.evaluate(() => {
                const heading = document.querySelector('.elo-heading-main').getBoundingClientRect();
                const saved = document.querySelector('.maia-saved-games').getBoundingClientRect();
                return {
                    aligned: Math.abs(heading.top - saved.top) < 2,
                    right: saved.left >= heading.right,
                    stacked: saved.top >= heading.bottom,
                    opacity: getComputedStyle(document.querySelector('#saved-data-status')).opacity,
                    overflow: document.documentElement.scrollWidth > innerWidth
                };
            });
            assert.equal(layout.overflow, false);
            assert.equal(layout.opacity, '0.6');
            assert.equal(width > 600 ? layout.aligned && layout.right : layout.stacked, true);
        }
        await page.locator('#games').setInputFiles({ name: 'games.pgn', mimeType: 'text/plain', buffer: Buffer.from(pgn) });
        await page.waitForFunction(() => !document.querySelector('#player').disabled
            && document.querySelector('#player').options.length > 0);
        if(await page.locator('#start').isDisabled())
            await page.locator('#player').selectOption({ label: 'MyPlayer' });
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.match(await page.locator('#saved-data-status').textContent(), /myplayer \| [\d,]+ positions saved/);
        const summary = await page.locator('#training-dataset-summary').textContent();
        const original = await page.evaluate(async () => (await (await import('./storage.js')).loadPreparedGames()).dataset);
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.equal(await page.locator('#training-dataset-summary').textContent(), summary);
        assert.deepEqual(await page.evaluate(() => window.dataRequests), []);
        assert.equal(await page.locator('#runtime-loading').isVisible(), false);
        assert.equal(await page.locator('#data-options').isVisible(), false);
        assert.deepEqual(await page.evaluate(async () => (await (await import('./storage.js')).loadPreparedGames()).dataset), original);

        await page.locator('#clear-data').click();
        await page.waitForFunction(() => document.querySelector('#saved-data-status').textContent.startsWith('No games saved'));
        assert.equal(await page.locator('#start').isDisabled(), false);
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#games').disabled);
        assert.equal(await page.locator('#start').isDisabled(), true);
        await page.evaluate(() => {
            const transaction = IDBDatabase.prototype.transaction;
            IDBDatabase.prototype.transaction = function(stores, mode, ...args) {
                if(this.name === 'acas-doppelmaia-prepared-games' && mode === 'readwrite')
                    throw new DOMException('Storage quota reached', 'QuotaExceededError');
                return transaction.call(this, stores, mode, ...args);
            };
        });
        await page.locator('#games').setInputFiles({
            name: 'reusable.json', mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify({ ...original, playerElo: 1800 }))
        });
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.match(await page.locator('#saved-data-status').textContent(), /Could not save.*Storage quota/);
        assert.equal(await page.locator('#maia3-elo').inputValue(), '1800');
        assert.deepEqual(await page.evaluate(() => window.dataRequests), ['validate']);
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#games').disabled);
        await page.locator('#games').setInputFiles({
            name: 'reusable.json', mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify({ ...original, playerElo: 1800 }))
        });
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.equal(await page.locator('#maia3-elo').inputValue(), '1800');
        assert.deepEqual(await page.evaluate(() => window.dataRequests), []);

        await page.evaluate(() => new Promise((resolve, reject) => {
            const open = indexedDB.open('acas-doppelmaia-prepared-games', 1);
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const db = open.result, tx = db.transaction('datasets', 'readwrite');
                tx.objectStore('datasets').put({ version: -1 }, 'prepared-games');
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = () => { db.close(); reject(tx.error); };
            };
        }));
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#clear-data').disabled);
        assert.match(await page.locator('#saved-data-status').textContent(), /Could not restore.*update/);
        assert.equal(await page.locator('#start').isDisabled(), true);
        await page.locator('#clear-data').click();
        await page.waitForFunction(() => document.querySelector('#saved-data-status').textContent.startsWith('No games saved'));
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#games').disabled);
        assert.match(await page.locator('#saved-data-status').textContent(), /No games saved/);
        assert.equal(await page.locator('#start').isDisabled(), true);
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
