import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { limitTrainingDataset } from '../tools/doppelmaia/files.js';

function dataset(train = 16000, validation = 4000) {
    const split = (count, prefix) => ({
        gameIds: [`game-${prefix}`],
        samples: Array.from({ length: count }, (_, ply) => ({ gameId: `game-${prefix}`, gameIndex: 0, ply }))
    });
    return { version: 1, player: 'player', options: { maxPositions: train + validation },
        train: split(train, '0000000000000001'), validation: split(validation, '0000000000000002') };
}

test('per-run subsets meet the exact cap without changing prepared data or mixing splits', () => {
    const original = dataset();
    const before = structuredClone(original);
    const limited = limitTrainingDataset(original, 10000);
    assert.equal(limited.train.samples.length, 8000);
    assert.equal(limited.validation.samples.length, 2000);
    assert.deepEqual(original, before);
    assert.deepEqual(limitTrainingDataset(original, 10000), limited);
    assert.equal(limitTrainingDataset(original, 50000), original);
    for(const key of ['train', 'validation']) {
        const split = limited[key];
        assert(split.samples.at(-1).ply > original[key].samples.length * 0.99);
        assert.equal(new Set(split.samples.map(sample => sample.ply)).size, split.samples.length);
        assert(split.samples.every(sample => split.gameIds[sample.gameIndex] === sample.gameId));
    }
    for(const [train, validation] of [[1, 20000], [20000, 1], [51, 49]]) {
        const result = limitTrainingDataset(dataset(train, validation), 20);
        assert.equal(result.train.samples.length + result.validation.samples.length, 20);
        assert(result.train.samples.length > 0 && result.validation.samples.length > 0);
    }
    assert.throws(() => limitTrainingDataset(original, 1), /at least two/);
});

test('restored datasets can train at 10,000 without reimporting or replacing the cache', { timeout: 60000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ locale: 'en-US' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
            const post = Worker.prototype.postMessage;
            window.trainingRequests = [];
            Worker.prototype.postMessage = function(data, ...args) {
                if(data.type === 'train') { window.trainingRequests.push(data); return; }
                return post.call(this, data, ...args);
            };
        });
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => !document.querySelector('#games').disabled);
        await page.evaluate(async value => (await import('./storage.js')).savePreparedGames(value), dataset());
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.equal(await page.locator('#run-position-summary').count(), 0);
        assert.match(await page.locator('#run-positions-help').textContent(), /20,000 of 20,000/);
        assert.equal(await page.locator('#run-positions').isVisible(), false);
        await page.locator('#training-method').selectOption('adapter');
        await page.locator('#learning-rate').fill('0.00000001');
        assert.equal(await page.locator('#learning-rate').evaluate(input => input.checkValidity()), true);
        assert.equal(await page.locator('#run-positions').inputValue(), '10000');
        assert.equal(await page.locator('#run-positions').getAttribute('max'), '10000');
        assert.match(await page.locator('#run-positions-help').textContent(), /10,000 of 20,000.*Saved data stays unchanged/);
        await page.locator('#start').click();
        await page.waitForFunction(() => window.trainingRequests.length === 1);
        const counts = await page.evaluate(() => {
            const data = window.trainingRequests[0].dataset;
            return [data.train.samples.length, data.validation.samples.length];
        });
        assert.deepEqual(counts, [8000, 2000]);
        assert.equal(await page.evaluate(() => window.trainingRequests[0].options.learningRate), 0.00000001);
        await page.locator('#stop').click();
        await page.locator('#training-method').selectOption('full');
        for(const network of ['maia3', 'maia-1400.pb', 'maia-1500.pb']) {
            await page.locator('#base-network').selectOption(network);
            assert.equal(await page.locator('#run-positions').isVisible(), network !== 'maia3');
            if(network !== 'maia3') {
                await page.getByRole('button', { name: 'Help for Positions per run' }).hover();
                await page.locator('#run-positions-help').waitFor({ state: 'visible' });
            }
            await page.locator('#learning-rate').fill('0.000001');
            assert.equal(await page.locator('#learning-rate').evaluate(input => input.checkValidity()), true);
            await page.locator('#learning-rate').fill('0');
            assert.equal(await page.locator('#learning-rate').evaluate(input => input.checkValidity()), false);
        }
        await page.locator('#run-positions').fill('6000');
        assert.match(await page.locator('#run-positions-help').textContent(), /6,000 of 20,000/);
        await page.locator('#base-network').selectOption('maia3');
        assert.equal(await page.locator('#run-positions').isVisible(), false);
        const saved = await page.evaluate(async () => (await (await import('./storage.js')).loadPreparedGames()).dataset);
        assert.equal(saved.train.samples.length + saved.validation.samples.length, 20000);
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
