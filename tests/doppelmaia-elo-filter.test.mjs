import assert from 'node:assert/strict';
import test from 'node:test';
import { filterDatasetElo, ratingSummary } from '../tools/doppelmaia/elo-filter.js';
import { parseGameFiles, buildDataset, validateDataset } from '../tools/doppelmaia/data.js';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

function fixture() {
    const split = prefix => ({
        gameIds: [0, 1, 2, 3].map(i => `game-${prefix}${i}`),
        samples: [0, 1, 2, 3].map(i => ({ gameId: `game-${prefix}${i}`, gameIndex: i, ply: i }))
    });
    const value = { version: 1, player: 'me', train: split('a'), validation: split('b'), options: {} };
    value.gameRatings = Object.fromEntries(['a', 'b'].flatMap(prefix =>
        [1400, 1600, 1900].map((rating, i) => [`game-${prefix}${i}`, rating])));
    return value;
}

test('rating filtering uses inclusive bounds, excludes missing ratings and preserves splits', () => {
    const value = fixture(), before = structuredClone(value);
    assert.deepEqual(ratingSummary(value), { rated: 6, missing: 2, minimum: 1400, maximum: 1900 });
    const filtered = filterDatasetElo(value, 1500, 100);
    for(const key of ['train', 'validation']) {
        assert.equal(filtered[key].samples.length, 2);
        assert(filtered[key].samples.every(sample => filtered[key].gameIds[sample.gameIndex] === sample.gameId));
    }
    assert.equal(filtered.playerElo, 1500);
    assert.deepEqual(value, before);
    assert.throws(() => filterDatasetElo(value, 1200, 0), /both training and validation/);
    assert.throws(() => filterDatasetElo(value, NaN, 100), /target Elo/);
    assert.equal(ratingSummary({ ...value, gameRatings: undefined }).rated, 0);
});

test('game ratings survive preparation and reusable data validation', () => {
    const games = parseGameFiles([{ name: 'games.pgn', text: `[White "Me"]
[Black "Other"]
[WhiteElo "1400"]
[BlackElo "2500"]

1. e4 e5 2. Nf3 Nc6 *

[White "Other"]
[Black "Me"]
[WhiteElo "900"]
[BlackElo "1600"]

1. d4 d5 2. c4 e6 *
` }]).games;
    const value = buildDataset(games, 'Me', { maxPositions: 20 });
    assert.equal(value.playerElo, 1500);
    assert.deepEqual(Object.values(value.gameRatings).sort(), [1400, 1600]);
    validateDataset(value);
    validateDataset(filterDatasetElo(value, 1500, 100));
});

test('restored data warns about rating spread, filters and restores without changing cache', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => !document.querySelector('#games').disabled);
        assert.equal(await page.locator('#elo-filter').isVisible(), true);
        assert.match(await page.locator('#elo-warning').textContent(), /Import games/);
        assert.equal(await page.locator('#elo-range-advice').count(), 0);
        await page.evaluate(async value => (await import('./storage.js')).savePreparedGames(value), fixture());
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.equal(await page.locator('#apply-elo-filter, #clear-elo-filter').count(), 0);
        assert.equal(await page.locator('#elo-warning').textContent(), '1400-1900 Elo (8 positions)');
        assert.match(await page.locator('#elo-warning').getAttribute('title'), /Try a narrower range.*2 unrated games excluded/);
        for(const width of [390, 1200]) {
            await page.setViewportSize({ width, height: 900 });
            const gap = await page.locator('#elo-filter').evaluate(element =>
                element.getBoundingClientRect().top
                - document.querySelector('.maia-import-row').getBoundingClientRect().bottom);
            assert(gap >= 24, `${width}: gap before Elo controls is ${gap}px`);
            assert.equal(await page.locator('#elo-warning').evaluate(element =>
                getComputedStyle(element.parentElement).textAlign), 'center');
            assert.equal(await page.locator('#elo-warning').evaluate(element =>
                getComputedStyle(element).fontWeight), '500');
            assert.equal(await page.locator('#elo-warning').evaluate(element =>
                getComputedStyle(element).fontSize), '15px');
        }
        assert.equal(await page.locator('#elo-warning').evaluate(element =>
            element.parentElement.previousElementSibling.classList.contains('maia-fields')), true);
        await page.locator('#filter-elo').fill('1500');
        assert.equal(await page.locator('#elo-filter-status').textContent(), ' \u279C 1400-1600 Elo (4 positions)');
        assert.equal(await page.locator('#elo-filter-status').evaluate(element =>
            element.getBoundingClientRect().top === document.querySelector('#elo-warning').getBoundingClientRect().top), true);
        await page.locator('#filter-elo').fill('1000');
        await page.locator('#filter-elo-range').fill('0');
        assert.match(await page.locator('#elo-filter-status').textContent(), /both training and validation/);
        assert.equal(await page.locator('#start').isDisabled(), true);
        await page.locator('#filter-elo').fill('1600');
        await page.locator('#filter-elo-range').fill('4000');
        assert.equal(await page.locator('#elo-filter-status').textContent(), ' \u279C -2400-5600 Elo (6 positions)');
        assert.equal(await page.locator('#start').isDisabled(), false);
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.equal(await page.locator('#filter-elo').inputValue(), '1600');
        assert.equal(await page.locator('#filter-elo-range').inputValue(), '4000');
        assert.equal(await page.locator('#elo-filter-status').textContent(), ' \u279C -2400-5600 Elo (6 positions)');
        const saved = await page.evaluate(async () => (await (await import('./storage.js')).loadPreparedGames()).dataset);
        assert.equal(saved.train.samples.length + saved.validation.samples.length, 8);
        await page.evaluate(async value => (await import('./storage.js')).savePreparedGames(value),
            { ...fixture(), importIdentity: 'different-import', playerElo: 1500 });
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.equal(await page.locator('#filter-elo').inputValue(), '1500');
        assert.equal(await page.locator('#filter-elo-range').inputValue(), '100');
        assert.equal(await page.locator('#elo-filter-status').textContent(), ' \u279C 1400-1600 Elo (4 positions)');
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('Elo preferences follow file contents across reimports, not the filename', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => !document.querySelector('#games').disabled);
        const pgn = `[White "Me"]
[Black "Other"]
[WhiteElo "1500"]
[BlackElo "1500"]

1. e4 e5 2. Nf3 Nc6 *

[White "Me"]
[Black "Other"]
[WhiteElo "1500"]
[BlackElo "1500"]

1. d4 d5 2. c4 e6 *
`;
        async function upload(name, text) {
            await page.locator('#games').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
            await page.waitForFunction(() => !document.querySelector('#games').disabled
                && document.querySelector('#player').options.length > 0);
            if(await page.locator('#start').isDisabled())
                await page.locator('#player').selectOption({ label: 'Me' });
            await page.waitForFunction(() => !document.querySelector('#start').disabled);
        }
        await upload('games.pgn', pgn);
        await page.locator('#filter-elo-range').fill('250');
        await page.locator('#filter-elo').fill('1550');
        await upload('renamed.pgn', pgn);
        assert.equal(await page.locator('#filter-elo').inputValue(), '1550');
        assert.equal(await page.locator('#filter-elo-range').inputValue(), '250');
        await upload('renamed.pgn', pgn.replaceAll('1500', '1600'));
        assert.equal(await page.locator('#filter-elo').inputValue(), '1600');
        assert.equal(await page.locator('#filter-elo-range').inputValue(), '100');
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
