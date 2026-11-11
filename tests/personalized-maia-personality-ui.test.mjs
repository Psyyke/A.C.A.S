import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { buildDataset, parseGameFiles } from '../tools/doppelmaia/data.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { personalityPresets, personalityTraits } from '../tools/doppelmaia/personality.js';

const pgn = `[White "MyPlayer"]
[Black "Other"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. Nc3 d6 6. Be3 O-O 7. O-O *

[White "Other"]
[Black "MyPlayer"]
[Result "*"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 Be7 5. Bf4 O-O 6. e3 c5 7. Bd3 *
`;

test('personality export filenames use preset names without option descriptions', async () => {
    const source = await readFile(new URL('../tools/doppelmaia/personalized-maia.js', import.meta.url), 'utf8');
    const expression = source.slice(source.indexOf('const slug = '), source.indexOf('const file = new File'));
    const slug = new Function('personalityMode', 'personalityPresets', '$', 'dataset', `${expression}; return slug;`);
    for(const preset of personalityPresets) {
        assert.equal(slug(true, personalityPresets, () => ({
            value: preset.id, selectedOptions: [{ textContent: `${preset.name}: explanation` }]
        }), null), preset.name.replace(/[^a-z0-9_-]/gi, '_').slice(0, 60));
    }
    assert.equal(slug(false, personalityPresets, null, { player: 'MyPlayer' }), 'MyPlayer');
});

test('personality mode preserves games, tunes presets and trains against soft targets', { timeout: 360000 }, async () => {
    const dataset = buildDataset(parseGameFiles([{ name: 'games.pgn', text: pgn }]).games, 'myplayer', { maxPositions: 20 });
    const practice = JSON.parse(await readFile(new URL('../tools/doppelmaia/personality-positions.json', import.meta.url), 'utf8'));
    practice.train.samples = practice.train.samples.slice(0, 16);
    practice.validation.samples = practice.validation.samples.slice(0, 8);
    const evidence = JSON.parse(await readFile(new URL('../tools/doppelmaia/personality-evidence.json', import.meta.url), 'utf8'));
    evidence.browserDatasetSHA256 = createHash('sha256').update(JSON.stringify(practice)).digest('hex');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const context = await browser.newContext({ acceptDownloads: true });
        const page = await context.newPage(), errors = [];
        await context.route('**/personality-positions.json', route => route.fulfill({ json: practice }));
        await context.route('**/personality-evidence.json', route => route.fulfill({ json: evidence }));
        page.setDefaultTimeout(120000);
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Ready.'));
        assert.equal(await page.locator('#training-source').inputValue(), 'games');
        assert.equal(await page.locator('#maia3-elo').inputValue(), '1500');
        await page.locator('#training-source').selectOption('personality');
        await page.waitForFunction(() => document.querySelector('#status').dataset.error === 'true'
            || (!document.querySelector('#start').disabled
                && document.querySelector('#training-dataset-summary').textContent.includes('personality practice set')))
            .catch(async error => {
                const state = await page.evaluate(() => ({
                    status: document.querySelector('#status')?.textContent,
                    prep: document.querySelector('#prep-status')?.textContent,
                    summary: document.querySelector('#training-dataset-summary')?.textContent,
                    startDisabled: document.querySelector('#start')?.disabled,
                    controlsDisabled: document.querySelector('#training-controls')?.disabled,
                    source: document.querySelector('#training-source')?.value
                }));
                throw new Error(`${error.message}\n${JSON.stringify({ ...state, errors })}`);
            });
        assert.notEqual(await page.locator('#status').getAttribute('data-error'), 'true',
            await page.locator('#status').textContent());

        assert.equal(await page.locator('#personality-preset option').count(), personalityPresets.length);
        const options = await page.locator('#personality-preset option').allTextContents();
        for(const [index, preset] of personalityPresets.entries()) {
            assert.ok(options[index].startsWith(`${preset.name} (`));
            assert.ok(options[index].endsWith(')'));
            assert.ok(options[index].length < 100);
            assert.doesNotMatch(options[index], /undefined|[;:\u2014]/);
        }
        await page.locator('#personality-preset').selectOption('heavy-metal');
        assert.equal(await page.locator('#personality-description').textContent(), 'Prefers queen and rook moves');
        assert.equal(await page.locator('#personality-preset').getAttribute('aria-describedby'), 'personality-description');
        await page.setViewportSize({ width: 360, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await page.locator('#personality-description').isVisible(), true);
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.locator('#personality-preset').selectOption(personalityPresets[0].id);
        assert.equal(await page.locator('#personality-fields input[type="number"]').count(), 20);
        assert.match(await page.locator('#personality-evidence').textContent(), /CUDA checked preferences/);
        const trainingSettings = page.locator('details').filter({ has: page.locator('#epochs') });
        await trainingSettings.locator('summary').click();
        await page.locator('#training-method').selectOption('full');
        await page.locator('#full-batch').fill('0');
        await page.locator('#training-method').selectOption('adapter');
        assert.equal(await page.locator('#full-batch').isDisabled(), true);
        await page.locator('#epochs').fill('39');
        assert.match(await page.locator('#personality-evidence').textContent(), /Custom settings/);
        await page.locator('#epochs').fill('40');
        await page.locator('#learning-rate').fill('0.01');
        assert.match(await page.locator('#personality-evidence').textContent(), /Custom settings/);
        await page.locator('#learning-rate').fill('0.005');
        assert.match(await page.locator('#personality-evidence').textContent(), /CUDA checked preferences/);
        await trainingSettings.locator('summary').click();
        assert.equal(await page.locator('#base-network').inputValue(), 'maia3');
        assert.equal(await page.locator('#base-network').isDisabled(), true);
        assert.equal(await page.locator('#goal-field').isVisible(), false);
        assert.equal(await page.locator('#base-anchor-field').isVisible(), false);
        assert.equal(await page.locator('#personality-advanced').evaluate(element => element.open), false);
        await page.locator('#personality-advanced summary').click();
        const trait = personalityTraits.find(({ id }) => personalityPresets[0].weights[id] !== personalityPresets[1].weights[id]);
        const traitInput = page.locator(`#personality-weight-${trait.id}`);
        const before = await traitInput.inputValue();
        await page.locator('#personality-preset').selectOption({ index: 1 });
        assert.equal(await page.locator('#personality-preset').inputValue(), personalityPresets[1].id);
        const after = await traitInput.inputValue();
        assert.notEqual(after, before);
        await traitInput.focus();
        await page.keyboard.press('Control+A');
        await page.keyboard.type('2.4');
        await page.locator('#personality-strength').fill('1.7');
        assert.match(await page.locator('#personality-description').textContent(), /Custom preferences based on/);
        await page.locator('#maia3-elo').fill('1750');

        await page.locator('#training-source').selectOption('games');
        assert.equal(await page.locator('#maia3-elo').inputValue(), '1500');
        assert.equal(await page.locator('#start').isDisabled(), true);
        await page.locator('#games').setInputFiles({
            name: 'games.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(dataset))
        });
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.match(await page.locator('#training-dataset-summary').textContent(), /myplayer/);
        await page.locator('#training-goal').selectOption('opening');
        await page.locator('#training-source').selectOption('personality');
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.match(await page.locator('#training-dataset-summary').textContent(), /personality practice set/);
        assert.match(await page.locator('#personality-evidence').textContent(), /Custom settings/);
        assert.equal(await traitInput.inputValue(), '2.4');
        assert.equal(await page.locator('#personality-strength').inputValue(), '1.7');
        assert.equal(await page.locator('#maia3-elo').inputValue(), '1750');
        assert.equal(await page.locator('#opening-line').evaluate(input => input.required), false);

        await page.locator('#training-form .maia-advanced summary').click();
        await page.locator('#epochs').fill('2');
        await page.locator('#provider').selectOption('wasm');
        await page.locator('#start').click();
        await page.locator('#download-weights').waitFor({ state: 'visible', timeout: 240000 }).catch(async error => {
            const state = await page.evaluate(() => ({
                status: document.querySelector('#status')?.textContent,
                stage: document.querySelector('#stage')?.textContent,
                log: document.querySelector('#log')?.textContent
            }));
            throw new Error(`${error.message}\n${JSON.stringify({ ...state, errors })}`);
        });
        assert.equal(await page.locator('#accuracy-caption').innerText().then(text => text.includes('Practice target move agreement')), true);
        assert.match(await page.locator('#status').textContent(), /not human move matches or playing strength/);
        assert.equal(await page.locator('#metrics tr').count(), 3);
        assert.equal(await page.locator('#full-batch').isDisabled(), true);

        const reportDownload = page.waitForEvent('download');
        await page.locator('#download-report').click();
        const reportFile = await reportDownload, stream = await reportFile.createReadStream(), chunks = [];
        for await(const chunk of stream) chunks.push(chunk);
        const report = JSON.parse(Buffer.concat(chunks).toString());
        assert.equal(report.trainingGoal, 'personality');
        assert.equal(report.personalityId, personalityPresets[1].id);
        assert.equal(report.personalityConfiguration.strength, 1.7);
        assert.equal(report.personalityConfiguration.weights[trait.id], 2.4);
        assert.ok(Number.isFinite(report.exportedMetrics.loss));
        assert.ok(report.personality);
        assert.equal(await page.locator('#personality-report').isVisible(), true);
        for(const width of [360, 768, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('personality practice loading rejects mismatched published evidence without enabling training', { timeout: 45000 }, async () => {
    const { server, url } = await startServer({ outFile: 'NUL' });
    const browser = await chromium.launch();
    try {
        const context = await browser.newContext();
        const evidence = JSON.parse(await readFile(new URL('../tools/doppelmaia/personality-evidence.json', import.meta.url), 'utf8'));
        await context.route('**/personality-evidence.json', route => route.fulfill({
            json: { ...evidence, browserDatasetSHA256: '0'.repeat(64) }
        }));
        const page = await context.newPage();
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Ready.'));
        await page.locator('#training-source').selectOption('personality');
        await page.waitForFunction(() => document.querySelector('#status').dataset.error === 'true');
        assert.match(await page.locator('#status').textContent(), /do not match their tested version/);
        assert.equal(await page.locator('#start').isDisabled(), true);
        await page.locator('#training-source').selectOption('games');
        assert.equal(await page.locator('#start').isDisabled(), true);
        assert.equal(await page.locator('#games').isEnabled(), true);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
