import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { detectImport, resultComparisons, validationSummary } from '../tools/doppelmaia/files.js';
import { parseGameFiles, buildDataset } from '../tools/doppelmaia/data.js';
import { startServer } from './maia-elo/serve.mjs';

const first = '[White "Me"]\n[Black "Other"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. Nc3 d6 6. Be3 O-O 7. O-O *';
const second = '[White "Other"]\n[Black "Me"]\n[Result "*"]\n\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 Be7 5. Bf4 O-O 6. e3 c5 7. Bd3 *';
const pgn = `${first}\n\n${second}`;
const lichess = moves => ({ players: { white: { user: { name: 'Me' } }, black: { user: { name: 'Other' } } }, moves });
const entries = [first, second].map(pgn => ({ pgn }));
const fixtures = [
    ['games.pgn', pgn],
    ['chess-com.json', JSON.stringify({ games: entries })],
    ['lichess.json', JSON.stringify([lichess(first.split('\n\n')[1]), lichess(second.split('\n\n')[1])])],
    ['lichess.ndjson', entries.map(entry => JSON.stringify(entry)).join('\n')],
    ['renamed.json', pgn],
    ['renamed.pgn', JSON.stringify({ games: entries })],
    ['comments.pgn', `{Exported games}\n; A PGN comment\n${pgn}`]
];

test('result comparison labels omit the target agreement suffix for personality runs', () => {
    const labels = resultComparisons({ goal: 'personality' }).map(metric => metric.label);
    assert.deepEqual(labels, resultComparisons({ goal: 'imitate' }).map(metric => metric.label));
    assert.ok(labels.includes('Middlegame positions'));
    assert.ok(labels.every(label => !label.includes('target agreement')));
});

test('validation summary separates familiar new and opening checks without invented measurements', () => {
    assert.equal(validationSummary({}), '');
    const summary = validationSummary({
        repertoire: { positions: 12, strength: 0.5 },
        familiarValidation: { positions: 10, accuracy: 0.7 },
        novelValidation: { positions: 20, accuracy: 0.4 },
        openingValidation: { positions: 0 }
    });
    assert.match(summary, /12 learned opening positions/);
    assert.match(summary, /Familiar positions matched your moves 70.0%.*10 positions/);
    assert.match(summary, /New positions matched your moves 40.0%.*20 positions/);
    assert.doesNotMatch(summary, /Opening positions matched/);
    assert.match(summary, /not playing strength/);
    assert.match(validationSummary({ repertoire: { positions: 12, strength: 0 } }), /left off/);
});

test('import detection follows content and never silently falls back on invalid JSON', () => {
    for(const [name, text] of fixtures) {
        const result = detectImport(text, name);
        assert.equal(result.kind, 'games');
        assert.equal(parseGameFiles([result.file]).games.length, 2, name);
    }
    for(const text of ['', '{', '{"moves":"e4"}\n{bad}', '{"username":"Me"}', '{"archives":[]}', 'not a chess game'])
        assert.throws(() => detectImport(text, 'bad.json'));
    const saved = buildDataset(parseGameFiles([{ name: 'games.pgn', text: pgn }]).games, 'Me', { skipFirstPlies: 10 });
    assert.deepEqual(detectImport(JSON.stringify(saved), 'anything.pgn'), { kind: 'dataset', dataset: saved });
    assert.equal(detectImport('{"version":999,"train":{},"validation":{}}', 'old.json').kind, 'dataset');
});

test('single picker imports every format and prepares on player choice with no extra action', { timeout: 90000 }, async () => {
    const { server, url } = await startServer({ outFile: 'NUL' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => !document.querySelector('#games').disabled);
        assert.equal(await page.locator('#dataset-step input[type="file"]').count(), 1);
        assert.equal(await page.locator('#read-games, #prepare-data, #dataset, #continue').count(), 0);
        for(const [name, text] of fixtures) {
            await page.locator('#games').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
            await page.waitForFunction(() => !document.querySelector('#player').disabled && !document.querySelector('#data-settings').hidden);
            assert.equal(await page.locator('#start').isDisabled(), true);
            await page.locator('#player').selectOption({ label: 'Me' });
            await page.waitForFunction(() => !document.querySelector('#start').disabled);
            assert.match(await page.locator('#dataset-summary').textContent(), /training games.*validation games/);
            assert.equal(await page.locator('#skip-plies').inputValue(), '0');
        }
        await page.locator('#games').setInputFiles({ name: 'one-player.pgn', mimeType: 'text/plain',
            buffer: Buffer.from(pgn.replaceAll('"Other"', '""')) });
        await page.waitForFunction(() => !document.querySelector('#start').disabled &&
            document.querySelector('#games-file-name').textContent === 'one-player.pgn' &&
            document.querySelector('#prep-status').textContent.startsWith('Games ready.'));
        assert.equal(await page.locator('#data-settings').isVisible(), false);
        await page.locator('#games').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999,"train":{},"validation":{}}') });
        await page.locator('#prep-status[data-error="true"]').waitFor();
        assert.match(await page.locator('#prep-status').textContent(), /Unsupported dataset version/);
        assert.equal(await page.locator('#start').isDisabled(), true);
        assert.equal(await page.locator('#import-example').isVisible(), true);
        const saved = buildDataset(parseGameFiles([{ name: 'games.pgn', text: pgn }]).games, 'Me');
        await page.locator('#games').setInputFiles({ name: 'saved.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.equal(await page.locator('#data-settings').isVisible(), false);
        assert.deepEqual(await page.locator('#download-data').evaluate(async anchor => (await (await fetch(anchor.href)).json()).options),
            saved.options);
        for(const width of [360, 768, 1024, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            if(width > 600) {
                for(const table of await page.locator('.maia-comparison, .maia-goals').all())
                    assert.equal(await table.evaluate(element => element.scrollWidth > element.clientWidth), false, `table at ${width}`);
            }
        }
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.match(await page.locator('#status').textContent(), /Saved games ready/);
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
