import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { buildUserscript } from './elo-tool/userscriptHarness.mjs';

let server, url, browser, userscript;
before(async () => {
    ({ server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' }));
    server.prependListener('request', request => {
        if(request.url.startsWith('/A.C.A.S/')) request.url = request.url.slice(8);
    });
    browser = await chromium.launch();
    userscript = (await buildUserscript())
        .replace("'hosts': { 'prod': 'psyyke.github.io', 'dev': 'localhost' }",
            `'hosts': { 'prod': '${new URL(url).host}', 'dev': '${new URL(url).host}' }`)
        .replace("'path': '/A.C.A.S/'", "'path': '/app/'");
});
after(async () => {
    await browser?.close();
    await new Promise(resolve => server?.close(resolve));
});

async function app(t, engine, fileName, text, saved = {}) {
    const context = await browser.newContext();
    t.after(() => context.close());
    await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
    const key = `DYNAMIC_${engine}_${fileName}`;
    await context.addInitScript(({ engine, key, text, saved }) => {
        if(!location.pathname.startsWith('/app/') || localStorage.getItem('gm:AcasConfig')) return;
        localStorage.setItem('gm:isTosAccepted', 'true');
        localStorage.setItem('gm:AcasConfig', JSON.stringify({ global: {
            chessEngineProfile: 'default', profiles: { default: {
                engineEnabled: true, chessEngine: engine, enableAdvancedElo: true, modernLc0Weight: '',
                advancedEloDepth: 2, engineNodes: 4, onlyCalculateOwnTurn: false,
                displayMovesOnExternalSite: true, [key]: text, ...saved
            } }
        } }));
    }, { engine, key, text, saved });
    const gui = await context.newPage(), boardPage = await context.newPage();
    if(process.env.ENGINE_FILE_TEST_VERBOSE === '1') {
        gui.on('console', message => {
            if(/failed|Analysis unavailable/.test(message.text())) console.log(engine, message.text());
        });
        gui.on('pageerror', error => console.error(engine, error));
    }
    await gui.addInitScript(userscript);
    await gui.goto(`${url}/app/`);
    await gui.waitForFunction(() => typeof SETTING_FILTER_OBJ !== 'undefined' && SETTING_FILTER_OBJ.profileID);
    await boardPage.route('**/file-board', route => route.fulfill({ contentType: 'text/html', body: `
        <div id="mount"></div><script type="module">
        import { BoardSession } from '/tools/eloeye/boardSession.js';
        window.board = new BoardSession(document.getElementById('mount'));
        window.board.setPosition({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', turn: 'w' });
        </script>` }));
    await boardPage.goto(`${url}/file-board`);
    await gui.waitForFunction(() => window.AcasInstances?.[0]?.instance?.pV.default?.engineSettingsReady, null, { timeout: 30000 });
    await boardPage.waitForFunction(() => window.board.error || window.board.hints?.moves?.length, null, { timeout: 30000 })
        .catch(async error => {
            console.error(await gui.evaluate(() => ({
                instances: AcasInstances.map(({ instance }) => ({
                    id: instance.instanceID, ready: instance.pV.default.engineSettingsReady,
                    pending: instance.pV.default.pendingCalculations.slice(-1), fen: instance.currentFen
                }))
            })));
            console.error(await boardPage.evaluate(() => ({ error: board.error, hints: board.hints, profilesReady: board.profilesReady })));
            throw error;
        });
    assert.equal(await boardPage.evaluate(() => window.board.error?.message), undefined);
    await gui.locator('#engine-elo-input .open-floaty-btn').click();
    const editor = gui.locator(`textarea[data-key="${key}"]`);
    assert.equal(await editor.count(), 1);
    assert.equal(await editor.inputValue(), text);
    async function edit(value) {
        await gui.evaluate(() => { window.previousFileEngine = AcasInstances[0].instance.getEngineAcasObj('default'); });
        await editor.fill(value);
        await editor.dispatchEvent('change');
    }
    async function loaded(value) {
        await gui.waitForFunction(({ fileName, value }) => {
            const instance = AcasInstances[0].instance, engine = instance.getEngineAcasObj('default');
            return engine !== previousFileEngine && instance.pV.default.engineSettingsReady
                && engine?.textFiles?.[fileName] === value;
        }, { fileName, value }, { timeout: 30000 });
    }
    return { gui, editor, edit, loaded };
}

test('Fairy content edits refresh the variant dropdown, remove old variants and recover from invalid text', { timeout: 90000 }, async t => {
    const engine = 'fairy-stockfish-nnue-wasm', key = `DYNAMIC_${engine}_UCI_Variant`;
    const { gui, edit, loaded } = await app(t, engine, 'VariantPath', '[acastext:chess]\ndoubleStep = false', { [key]: 'acastext' });
    assert.equal(await gui.evaluate(() => AcasInstances[0].instance.pV.default.chessVariant), 'acastext');
    assert.equal(await gui.evaluate(() => AcasInstances[0].instance.activeVariant), 'acastext');
    assert.match(await gui.evaluate(() => AcasInstances[0].instance.variantStartPosFen), /^rnbqkbnr/);
    const analysis = await gui.evaluate(async () => {
        const { default: FairyAnalysis } = await import('./assets/js/FairyAnalysis.js');
        const analyzer = new FairyAnalysis();
        const instance = AcasInstances[0].instance;
        const context = instance.Interface.getPgnConfig();
        const fen = instance.currentFen;
        const config = { ...context, fen };
        try {
            const first = await analyzer.enqueue('same-position', config, job => analyzer.legalMoves(job));
            const notation = await analyzer.notateMove({ ...config, player: ['e2', 'e3'], playerUci: 'e2e3' });
            const nextFen = await analyzer.enqueue('after-e3', config, job => analyzer.moveFen(job, 'e2e3'));
            const pgn = await analyzer.createPgn([{ fen: { full: fen } }, { fen: { full: nextFen } }], config);
            const other = { ...config, variantText: '[acastext:chess]\ndoubleStep = true' };
            const second = await analyzer.enqueue('same-position', other, job => analyzer.legalMoves(job));
            const restored = await analyzer.enqueue('uncached-first-context', config, job => analyzer.legalMoves(job));
            const standard = await analyzer.enqueue('standard', { fen, variant: 'chess' }, job => analyzer.legalMoves(job));
            return { first, second, restored, standard, notation, pgn, text: context.variantText };
        } finally {
            analyzer.terminate();
        }
    });
    assert.match(analysis.text, /doubleStep = false/);
    assert.equal(analysis.first.length, 12);
    assert.equal(analysis.second.length, 20);
    assert.equal(analysis.restored.length, 12);
    assert.equal(analysis.standard.length, 20);
    assert.deepEqual(analysis.notation, { san: 'e3' });
    assert.equal(analysis.pgn.pgn, '1. e3 *');
    const variantItems = gui.locator(`input[data-key="${key}"]`).locator('..').locator('.dropdown-list-container');
    assert.equal(await variantItems.locator('[data-value="acastext"]').count(), 1);
    const changed = '[acasnext:chess]\ndoubleStep = false';
    await edit(changed);
    await loaded(changed);
    assert.equal(await variantItems.locator('[data-value="acastext"]').count(), 0);
    assert.equal(await variantItems.locator('[data-value="acasnext"]').count(), 1);
    await gui.locator(`input[data-key="${key}"]`).fill('acasnext');
    await gui.locator(`input[data-key="${key}"]`).dispatchEvent('change');
    await gui.waitForFunction(() => AcasInstances[0].instance.pV.default.engineSettingsReady
        && AcasInstances[0].instance.pV.default.chessVariant === 'acasnext');
    await edit('C:\\local\\variants.ini');
    await gui.waitForFunction(() => document.body.textContent.includes('Fairy-Stockfish failed:')
        && !AcasInstances[0].instance.getEngineAcasObj('default')
        && !AcasInstances[0].instance.pV.default.engineSettingsReady);
    assert.match(await gui.locator('body').innerText(), /Fairy-Stockfish failed:.*VariantPath/);
    await edit('');
    await loaded('');
    assert.equal(await variantItems.locator('[data-value="acasnext"]').count(), 0);
    assert.equal(await gui.evaluate(() => AcasInstances[0].instance.pV.default.chessVariant), 'chess');
});

test('Lc0 content edits and clearing restart the native engine, update numeric defaults and persist', { timeout: 90000 }, async t => {
    const engine = 'lc0-v0.32.1-wasm', text = '# custom\n--cpuct=3.25\n--threads=1\n--multipv=3';
    const { gui, editor, edit, loaded } = await app(t, engine, 'ConfigFile', text);
    const cpuct = gui.locator(`input[data-key="DYNAMIC_${engine}_CPuct"]`);
    assert.equal(Number(await cpuct.inputValue()), 3.25);
    assert.equal(await gui.evaluate(() => AcasInstances[0].instance.pV.default.multiPV), 3);
    await gui.reload();
    await gui.waitForFunction(() => window.AcasInstances?.[0]?.instance?.pV.default?.engineSettingsReady, null, { timeout: 30000 });
    assert.equal(await editor.inputValue(), text);
    await gui.locator('#engine-elo-input .open-floaty-btn').click();
    const changed = '--cpuct=4.5\n--threads=1';
    await edit(changed);
    await loaded(changed);
    assert.equal(Number(await cpuct.inputValue()), 4.5);
    assert.equal(await gui.evaluate(() => AcasInstances[0].instance.pV.default.multiPV), 1);
    const buttons = await gui.locator('.dynamic-setting-button').evaluateAll(elements => elements.map(element => element.dataset.key));
    assert.equal(buttons.length, new Set(buttons).size, 'Repeated UCI declarations must not add duplicate buttons');
    await edit('');
    await loaded('');
    assert.notEqual(Number(await cpuct.inputValue()), 4.5);
    assert.equal(await editor.inputValue(), '');
});
