import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { gunzipSync } from 'node:zlib';
import { readPolicy } from '../tools/doppelmaia/weights.js';

const pgn = `[Event "Game 1"]
[White "MyPlayer"]
[Black "Other"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. Nc3 d6 6. Be3 O-O 7. O-O *

[Event "Game 2"]
[White "Other"]
[Black "MyPlayer"]
[Result "*"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 Be7 5. Bf4 O-O 6. e3 c5 7. Bd3 *

[Event "Game 3"]
[White "MyPlayer"]
[Black "Other"]
[Result "*"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 *
`;

test('local-file workflow prepares, trains, graphs and exports without user-data requests', { timeout: 180000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ acceptDownloads: true });
        const errors = [], sent = [], apiRequests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => {
            if(request.method() !== 'GET') sent.push(request.url());
            if(/api\.chess\.com|lichess\.org\/api/.test(request.url())) apiRequests.push(request.url());
        });
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => !document.querySelector('#games').disabled);
        assert.equal(await page.locator('.doppelmaia-title strong').textContent(), 'Doppel');
        assert.equal(await page.locator('.doppelmaia-title > span > span').textContent(), 'Maia');
        assert.ok((await page.locator('#start').getAttribute('class')).includes('install-button'));
        assert.equal(await page.locator('#training-step').isVisible(), true);
        assert.equal(await page.locator('#training-controls').evaluate(element => element.disabled), true);
        assert.match(await page.locator('#training-dataset-summary').textContent(), /games in step 1/);
        assert.equal(await page.locator('#base-network').isDisabled(), true);
        assert.equal(await page.locator('#dataset-step input[type="file"]').count(), 1);
        assert.equal(await page.locator('label[for="games"]').textContent(), 'Import games to learn from');
        await page.locator('#games').setInputFiles({ name: 'my-games.pgn', mimeType: 'text/plain', buffer: Buffer.from(pgn) });
        assert.equal(await page.locator('#games-file-name').textContent(), 'my-games.pgn');
        await page.locator('#data-settings').waitFor({ state: 'visible' });
        await page.locator('#player').selectOption({ label: 'MyPlayer' });
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        await page.locator('#data-advanced summary').click();
        assert.equal(await page.locator('#download-data').evaluate(element => getComputedStyle(element).color), 'rgb(33, 58, 67)');
        assert.match(await page.locator('#dataset-summary').textContent(), /training games.*validation games/);
        const prepared = page.waitForEvent('download');
        await page.locator('#download-data').click();
        const file = await prepared;
        const stream = await file.createReadStream();
        const chunks = [];
        for await(const chunk of stream) chunks.push(chunk);
        const dataset = JSON.parse(Buffer.concat(chunks).toString());
        assert.equal(dataset.player, 'myplayer');
        assert.ok(dataset.train.samples.length > 0 && dataset.validation.samples.length > 0);
        assert.equal(new Set([...dataset.train.gameIds, ...dataset.validation.gameIds]).size,
            dataset.train.gameIds.length + dataset.validation.gameIds.length);
        await page.waitForFunction(() => document.querySelector('#start')?.disabled === false);
        assert.equal(page.url(), `${url}/tools/doppelmaia/`);
        assert.equal(await page.locator('#prepare').isVisible(), true);
        assert.equal(await page.locator('#training-step').isVisible(), true);
        assert.equal(await page.locator('#training-controls').evaluate(element => element.disabled), false);
        assert.equal(await page.locator('#custom-weights-field').isVisible(), false);
        assert.deepEqual(await page.locator('#base-network option').evaluateAll(options =>
            options.map(option => option.value)), ['maia3', ...[1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2200]
            .map(elo => `maia-${elo}.pb`), 'custom']);
        assert.equal(await page.locator('#training-form .maia-advanced').evaluate(element => element.open), false);
        await page.locator('#training-form .maia-advanced summary').click();
        await page.locator('#base-network').selectOption('maia-1200.pb');
        assert.equal(await page.locator('#provider').inputValue(), 'wasm');
        await page.locator('#base-network').selectOption('maia3');
        assert.equal(await page.locator('#provider').inputValue(), 'webgpu');
        assert.equal(await page.locator('#provider').isDisabled(), true);
        await page.locator('#training-method').selectOption('adapter');
        await page.locator('#provider').selectOption('wasm');
        await page.locator('#training-method').selectOption('full');
        assert.equal(await page.locator('#provider').inputValue(), 'webgpu');
        await page.locator('#training-method').selectOption('adapter');
        assert.equal(await page.locator('#provider').inputValue(), 'wasm');
        await page.locator('#base-network').selectOption('maia-1200.pb');
        assert.equal(await page.locator('#provider').inputValue(), 'wasm');
        await page.locator('#epochs').fill('2');
        assert.deepEqual(await page.locator('#training-form input:invalid').evaluateAll(elements =>
            elements.map(element => ({ id: element.id, message: element.validationMessage }))), []);
        await page.locator('#start').click();
        await page.waitForFunction(() => document.querySelector('#status').dataset.error === 'true'
            || !document.querySelector('#download-weights').hidden, undefined, { timeout: 90000 });
        assert.equal(await page.locator('#status').getAttribute('data-error'), 'false',
            await page.locator('#status').textContent());
        assert.ok(Number(await page.locator('#updates').textContent()) > 0);
        assert.ok(Number(await page.locator('#processed').textContent()) > 0);
        assert.equal(await page.locator('.maia-board .maia-square').count(), 64);
        assert.ok(await page.locator('#loss-chart polyline').count() === 2);
        assert.ok(await page.locator('#accuracy-chart polyline').count() === 2);
        assert.equal(await page.locator('#metrics tr').count(), 3);
        assert.match(await page.locator('#status').textContent(), /Finished/);
        assert.equal(await page.locator('#activity').getAttribute('data-active'), 'false');
        const download = page.waitForEvent('download');
        await page.locator('#download-weights').click();
        const weights = await download, weightStream = await weights.createReadStream(), weightChunks = [];
        for await(const chunk of weightStream) weightChunks.push(chunk);
        assert.equal(readPolicy(gunzipSync(Buffer.concat(weightChunks))).channels, 64);
        const reportDownload = page.waitForEvent('download');
        await page.locator('#download-report').click();
        const reportFile = await reportDownload, reportStream = await reportFile.createReadStream(), reportChunks = [];
        for await(const chunk of reportStream) reportChunks.push(chunk);
        assert.equal(JSON.parse(Buffer.concat(reportChunks).toString()).baseWeights, 'Maia 1200');
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.match(await page.locator('#saved-data-status').textContent(), /myplayer/);
        assert.equal(await page.locator('#training-step').isVisible(), true);
        await page.locator('#base-network').selectOption('custom');
        await page.locator('#base-weights').setInputFiles({
            name: 'my-trained-base.pb.gz', mimeType: 'application/gzip', buffer: Buffer.concat(weightChunks)
        });
        assert.equal(await page.locator('#base-weights-file-name').textContent(), 'my-trained-base.pb.gz');
        await page.locator('#training-form .maia-advanced summary').click();
        await page.locator('#epochs').fill('1');
        await page.locator('#start').click();
        await page.locator('#download-weights').waitFor({ state: 'visible', timeout: 90000 });
        assert.match(await page.locator('#status').textContent(), /Finished/);
        for(const width of [360, 1200]) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
        await page.locator('#epochs').fill('100');
        await page.locator('#start').click();
        await page.locator('#stop').click();
        assert.match(await page.locator('#status').textContent(), /Stopped/);
        assert.equal(await page.locator('#download-weights').isVisible(), false);
        await page.waitForTimeout(500);
        assert.match(await page.locator('#status').textContent(), /Stopped/);
        await page.locator('#clear-data').click();
        await page.waitForFunction(() => document.querySelector('#saved-data-status').textContent.startsWith('No games saved'));
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Ready.'));
        assert.equal(await page.locator('#games-file-name').textContent(), 'No files selected');
        assert.equal(await page.locator('#start').isDisabled(), true);
        await page.locator('#games').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') });
        await page.locator('#prep-status[data-error="true"]').waitFor();
        assert.match(await page.locator('#prep-status').textContent(), /broken JSON/);
        assert.equal(await page.locator('#import-example').isVisible(), true);
        assert.equal(await page.locator('#start').isDisabled(), true);
        await page.locator('#games').setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(dataset)) });
        assert.equal(await page.locator('#games-file-name').textContent(), 'valid.json');
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        await page.locator('#base-network').selectOption('custom');
        assert.equal(await page.locator('#custom-weights-field').isVisible(), true);
        assert.equal(await page.locator('#base-weights').getAttribute('required'), '');
        await page.locator('#base-weights').setInputFiles({ name: 'broken.pb', mimeType: 'application/octet-stream', buffer: Buffer.from([1, 2, 3]) });
        await page.locator('#start').click();
        await page.locator('#status[data-error="true"]').waitFor();
        assert.equal(await page.locator('#download-weights').isVisible(), false);
        assert.equal(await page.locator('#diagnostics').evaluate(element => element.open), true);
        assert.equal(await page.locator('#activity').getAttribute('data-active'), 'false');
        assert.equal(await page.locator('#start').isEnabled(), true);
        await page.locator('#base-network').selectOption('maia-1900.pb');
        assert.equal(await page.locator('#custom-weights-field').isVisible(), false);
        assert.equal(await page.locator('#base-weights').getAttribute('required'), null);
        await page.context().route('**/lc0-nets/maia-1900.pb', route => route.fulfill({ status: 404, body: 'Missing weights' }));
        await page.locator('#start').click();
        await page.locator('#status[data-error="true"]').waitFor();
        assert.match(await page.locator('#status').textContent(), /Could not load Maia 1900 weights: HTTP 404/);
        assert.equal(await page.locator('#download-weights').isVisible(), false);
        assert.equal(await page.locator('#prepare').isVisible(), true);
        assert.deepEqual(errors, []);
        assert.deepEqual(sent, []);
        assert.deepEqual(apiRequests, []);
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});

test('old preparation URL redirects to the combined tool', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(`${url}/tools/chess-training-data/`);
        await page.waitForURL('**/tools/doppelmaia/#prepare');
        assert.equal((await page.locator('h1').textContent()).trim(), 'DoppelMaia');
        assert.equal(await page.locator('#prepare').isVisible(), true);
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
