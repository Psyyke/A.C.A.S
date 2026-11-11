import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { buildUserscript } from './elo-tool/userscriptHarness.mjs';
import { parseGameFiles, buildDataset } from '../tools/doppelmaia/data.js';

const pgn = `[White "MyPlayer"]
[Black "Other"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. Nc3 d6 6. Be3 O-O 7. O-O *

[White "Other"]
[Black "MyPlayer"]
[Result "*"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 Be7 5. Bf4 O-O 6. e3 c5 7. Bd3 *
`;

test('simple Maia 3 tool trains, selects a saved app profile, reloads and reports missing models', { timeout: 180000 }, async () => {
    const dataset = buildDataset(parseGameFiles([{ name: 'games.pgn', text: pgn }]).games, 'myplayer', { maxPositions: 20 });
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    let browser;
    try {
        browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
        const context = await browser.newContext();
        context.setDefaultTimeout(15000);
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if(message.type() === 'error') console.error('Maia 3 UI:', message.text()); });
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('Ready.'), null, { timeout: 30000 });
        await page.locator('#games').setInputFiles({ name: 'dataset.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(dataset)) });
        await page.waitForFunction(() => !document.querySelector('#start').disabled);
        assert.equal(await page.locator('#base-network').inputValue(), 'maia3');
        assert.equal(await page.locator('#training-method').inputValue(), 'full');
        assert.equal(await page.locator('#epochs').inputValue(), '12');
        assert.equal(await page.locator('#provider').inputValue(), 'webgpu');
        assert.equal(await page.locator('#provider').isDisabled(), true);
        await page.locator('#training-method').selectOption('adapter');
        assert.equal(await page.locator('#positions').inputValue(), '6000');
        assert.equal(await page.locator('#epochs').inputValue(), '40');
        await page.locator('#base-network').selectOption('maia-1500.pb');
        assert.equal(await page.locator('#epochs').inputValue(), '10');
        await page.locator('#base-network').selectOption('maia3');
        assert.equal(await page.locator('#epochs').inputValue(), '40');
        assert.equal(await page.locator('#base-anchor').isVisible(), true);
        assert.equal(await page.locator('#base-anchor-help').isVisible(), true);
        assert.equal(await page.locator('#training-form .maia-advanced').evaluate(element => element.open), false);
        assert.deepEqual(await page.locator('#base-anchor option').evaluateAll(options =>
            options.map(option => ({ value: option.value, label: option.textContent }))), [
            { value: '0.8', label: 'Prefer base' },
            { value: '0.5', label: 'Balanced' },
            { value: '0.25', label: 'Mostly your moves' },
            { value: '0', label: 'Max personalization' }
        ]);
        await page.locator('#base-network').selectOption('maia3');
        assert.equal(await page.locator('#maia3-elo-field').isVisible(), true);
        assert.equal(await page.locator('#goal-field').isVisible(), true);
        assert.equal(await page.locator('#epochs').isVisible(), false);
        await page.locator('#training-goal').selectOption('opening');
        assert.equal(await page.locator('#opening-field').isVisible(), true);
        await page.locator('#opening-line').fill('1. e4 e5 2. Nf3 Nc6');
        await page.locator('#training-form .maia-advanced summary').click();
        assert.equal(await page.locator('#base-anchor-field').isVisible(), false);
        await page.locator('#training-goal').selectOption('imitate');
        assert.equal(await page.locator('#base-anchor-field').isVisible(), true);
        await page.locator('#base-anchor').selectOption('0.5');
        await page.locator('#maia3-elo').fill('2000');
        await page.locator('#training-goal').selectOption('opening');
        assert.equal(await page.locator('#base-anchor-field').isVisible(), false);
        await page.locator('#epochs').fill('2');
        await page.locator('#base-network').selectOption('maia-1500.pb');
        await page.locator('#base-network').selectOption('maia3');
        assert.equal(await page.locator('#epochs').inputValue(), '2');
        await page.locator('#training-goal').selectOption('opening');
        await page.locator('#provider').selectOption('wasm');
        await page.locator('#start').click();
        await page.locator('#use-in-app').waitFor({ state: 'visible', timeout: 90000 });
        assert.equal(await page.locator('#download-weights').textContent(), 'Download Maia 3 ONNX');
        assert.ok(Number(await page.locator('#updates').textContent()) > 0);
        assert.ok(await page.locator('#loss-chart circle').count() >= 4);
        assert.match(await page.locator('#log').textContent(), /Known opening replay CE/);
        assert.match(await page.locator('#log').textContent(), /positions matched your moves/);
        assert.match(await page.locator('#status').textContent(), /not playing strength/);
        for(const width of [360, 768, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
        assert.deepEqual(errors, []);
        await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
        await context.addInitScript(() => {
            if(!location.pathname.startsWith('/app/')) return;
            localStorage.setItem('gm:isTosAccepted', 'true');
            if(!localStorage.getItem('gm:AcasConfig')) localStorage.setItem('gm:AcasConfig', JSON.stringify({ global: {
                chessEngineProfile: '__B64__cGVyc29uYWw=', profiles: {
                    default: { engineEnabled: false, chessEngine: 'stockfish-19-lite-single' },
                    '__B64__cGVyc29uYWw=': { engineEnabled: true, chessEngine: 'maia2', engineElo: 1200, moveSuggestionAmount: 1 }
                }
            } }));
        });
        const userscript = (await buildUserscript())
            .replace("'hosts': { 'prod': 'psyyke.github.io', 'dev': 'localhost' }",
                `'hosts': { 'prod': '${new URL(url).host}', 'dev': '${new URL(url).host}' }`)
            .replace("'path': '/A.C.A.S/'", "'path': '/app/'");
        await page.addInitScript(userscript);
        await page.locator('#use-in-app').click();
        await page.waitForURL(`${url}/app/**`);
        await page.waitForFunction(() => {
            const profile = JSON.parse(localStorage.getItem('gm:AcasConfig'))?.global?.profiles?.['__B64__cGVyc29uYWw='];
            return profile?.chessEngine === 'maia3' && profile.maia3Model;
        }, null, { timeout: 30000 }).catch(async error => {
            throw new Error(`${error.message}\n${JSON.stringify(await page.evaluate(() => ({
                config: localStorage.getItem('gm:AcasConfig'),
                owner: typeof SETTING_FILTER_OBJ === 'undefined' ? null : SETTING_FILTER_OBJ,
                status: document.querySelector('#maia3-models [role="status"]')?.textContent
            })))}\n${errors.join('\n')}`);
        });
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gm:AcasConfig')).global.profiles);
        assert.equal(saved.default.chessEngine, 'stockfish-19-lite-single');
        assert.equal(saved.default.maia3Model, undefined);
        const personal = saved['__B64__cGVyc29uYWw='];
        assert.equal(personal.engineElo, 2000);
        assert.equal(personal.maia3Provider, 'wasm');
        assert.match(personal.maia3Model, /^maia3-/);
        await page.waitForFunction(() => !location.search.includes('personalModel'), null, { timeout: 10000 });
        await page.locator('#maia3-models').waitFor({ state: 'visible', timeout: 5000 }).catch(async error => {
            throw new Error(`${error.message}\n${JSON.stringify(await page.locator('#maia3-models').evaluate(element => ({
                engine: document.querySelector('[data-key="chessEngine"]').value,
                ancestors: Array.from((function* () { for(let node = element; node; node = node.parentElement) yield node; })())
                    .map(node => ({ tag: node.tagName, id: node.id, cls: node.className, display: getComputedStyle(node).display }))
            })))}`);
        });
        assert.equal(await page.locator('#maia3-models input[data-key="maia3Model"]').inputValue(), personal.maia3Model);
        await page.locator('#maia3-models .open-floaty-btn').click();
        await page.locator('#maia3-weights-floaty').waitFor({ state: 'visible' });
        const client = await context.newPage();
        await client.route('**/maia3-fixture', route => route.fulfill({ contentType: 'text/html', body: `
            <div id="mount"></div><script type="module">
            import { BoardSession } from '/tools/eloeye/boardSession.js';
            import { Chess } from '/app/assets/engines/libraries/chessjs/chess.js';
            window.board = new BoardSession(document.getElementById('mount'));
            window.board.setPosition({ fen: new Chess().fen(), turn: 'w' });
            </script>` }));
        await client.goto(`${url}/maia3-fixture`);
        await page.waitForFunction(() => window.AcasInstances?.[0]?.instance?.pV?.personal?.engineSettingsReady, null, { timeout: 45000 });
        assert.equal(await page.evaluate(() => window.AcasInstances[0].instance.pV.personal.maia3Model), personal.maia3Model);
        assert.equal(await page.evaluate(() => window.AcasInstances[0].instance.pV.personal.requestedEngine), 'maia3');
        await page.locator('#maia3-models .maia3-remove-weights').click();
        await page.waitForFunction(() => {
            const profile = window.AcasInstances?.[0]?.instance?.pV?.personal;
            return profile?.engineSettingsReady && !profile.maia3Model;
        }, null, { timeout: 45000 });
        await page.evaluate(async id => {
            const { getPersonalModel } = await import('/app/assets/engines/Maia3/personal-models.js');
            const model = await getPersonalModel(id);
            const transfer = new DataTransfer();
            transfer.items.add(model.file);
            const input = document.querySelector('#maia3-models input[type="file"]');
            input.files = transfer.files;
            input.dispatchEvent(new Event('change'));
        }, personal.maia3Model);
        await page.waitForFunction(oldId => {
            const id = document.querySelector('#maia3-models input[data-key="maia3Model"]')?.value;
            return id?.startsWith('maia3-') && id !== oldId;
        }, personal.maia3Model);
        personal.maia3Model = await page.locator('#maia3-models input[data-key="maia3Model"]').inputValue();
        await page.waitForFunction(id => {
            const profile = window.AcasInstances?.[0]?.instance?.pV?.personal;
            return profile?.engineSettingsReady && profile.maia3Model === id;
        }, personal.maia3Model, { timeout: 45000 });
        await client.evaluate(() => window.board.destroy());
        await client.close();
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#maia3-models input[data-key="maia3Model"]')?.value.startsWith('maia3-'), null, { timeout: 30000 });
        assert.equal(await page.locator('#maia3-models input[data-key="maia3Model"]').inputValue(), personal.maia3Model);
        await page.locator('#maia3-models .open-floaty-btn').click();
        for(const width of [360, 768, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
        const missing = await page.evaluate(async () => {
            const { getPersonalModel } = await import('/app/assets/engines/Maia3/personal-models.js');
            try { await getPersonalModel('maia3-00000000-0000-0000-0000-000000000000'); }
            catch(error) { return error.message; }
        });
        assert.match(missing, /missing.*Upload/i);
        assert.deepEqual(errors, []);
    } finally {
        if(browser) await browser.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});
