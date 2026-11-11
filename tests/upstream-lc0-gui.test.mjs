import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { buildUserscript } from './elo-tool/userscriptHarness.mjs';
import path from 'node:path';

test('upstream Lc0 produces GUI suggestions and reloads changed weights', { timeout: 120000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const gpu = process.env.LC0_GUI_WEBGPU === '1';
    const engineName = gpu ? 'modern-lc0-webgpu' : 'modern-lc0';
    const browser = await chromium.launch(gpu ? { headless: false, executablePath: process.env.LC0_TEST_BROWSER,
        args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] } : {});
    const context = await browser.newContext();
    context.setDefaultTimeout(15000);
    let missingDefault = false;
    try {
        await context.route('**/assets/lc0-nets/maia-1500.pb', route =>
            missingDefault ? route.fulfill({ status: 404, body: 'Missing weights' }) : route.continue());
        await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
        await context.addInitScript(engine => {
            if(!location.pathname.startsWith('/app/')) return;
            window.lc0Commands = [];
            window.lc0Failure = '';
            window.lc0SaveFailure = '';
            const logError = console.error;
            console.error = (...args) => {
                if(String(args[0]).startsWith('Lc0 failed for profile')) window.lc0Failure = String(args[1]?.message || args[1]);
                if(String(args[0]).includes('Could not save weights')) window.lc0SaveFailure = String(args[1]?.message || args[1]);
                logError(...args);
            };
            const postMessage = Worker.prototype.postMessage;
            Worker.prototype.postMessage = function(message, ...args) {
                if(message?.type === 'uci') window.lc0Commands.push(message.line);
                return postMessage.call(this, message, ...args);
            };
            localStorage.setItem('gm:isTosAccepted', 'true');
            localStorage.setItem('gm:AcasConfig', JSON.stringify({ global: {
                chessEngineProfile: 'default', profiles: { default: {
                    engineEnabled: true, chessEngine: engine, modernLc0Weight: '',
                    enableAdvancedElo: true, engineNodes: 4, displayMovesOnExternalSite: true,
                    onlyCalculateOwnTurn: true, moveSuggestionAmount: 1
                } }
            } }));
        }, engineName);
        const gui = await context.newPage(), page = await context.newPage();
        if(process.env.LC0_GUI_VERBOSE === '1') {
            gui.on('console', message => console.log('Lc0 GUI:', message.text()));
            gui.on('pageerror', error => console.error('Lc0 GUI page error:', error.message));
        }
        const userscript = (await buildUserscript())
            .replace("'hosts': { 'prod': 'psyyke.github.io', 'dev': 'localhost' }",
                `'hosts': { 'prod': '${new URL(url).host}', 'dev': '${new URL(url).host}' }`)
            .replace("'path': '/A.C.A.S/'", "'path': '/app/'");
        await gui.addInitScript(userscript);
        await gui.goto(`${url}/app/`);
        await gui.waitForFunction(() => typeof SETTING_FILTER_OBJ !== 'undefined' && SETTING_FILTER_OBJ.profileID, null, { timeout: 30000 });
        await gui.locator('#modern-lc0-weights .open-floaty-btn').click();
        const fileInput = gui.locator('#modern-lc0-weights input[type="file"]');
        await page.route('**/lc0-fixture', route => route.fulfill({ contentType: 'text/html', body: `
            <div id="mount"></div><script type="module">
            import { BoardSession } from '/tools/eloeye/boardSession.js';
            import { Chess } from '/app/assets/engines/libraries/chessjs/chess.js';
            window.board = new BoardSession(document.getElementById('mount'));
            window.board.setPosition({ fen: new Chess().fen(), turn: 'w' });
            </script>` }));
        await page.goto(`${url}/lc0-fixture`);
        await gui.waitForFunction(() => window.AcasInstances?.[0]?.instance?.pV?.default, null, { timeout: 30000 });
        assert.equal(await gui.evaluate(() => window.AcasInstances[0].instance.instanceClosed), false);
        await gui.waitForFunction(() => window.AcasInstances[0]?.instance?.pV.default?.engineSettingsReady
            && window.AcasInstances[0].instance.pV.default.lc0WeightName === 'maia-1500.pb', null, { timeout: 45000 });
        const chooser = gui.waitForEvent('filechooser');
        await gui.locator('.lc0-upload-weights').click();
        await (await chooser).setFiles([]);
        await gui.evaluate(() => {
            window.lc0WeightSuccesses = [];
            const success = toast.success.bind(toast);
            toast.success = (...args) => {
                if(String(args[0]).startsWith('Lc0 weights uploaded and loaded:'))
                    window.lc0WeightSuccesses.push(args[0]);
                return success(...args);
            };
        });
        await fileInput.setInputFiles({ name: 'invalid.pb', mimeType: 'application/octet-stream', buffer: Buffer.from('not a network') });
        await gui.waitForFunction(() => window.lc0Failure, null, { timeout: 45000 });
        assert.match(await gui.evaluate(() => window.lc0Failure), /truncated|invalid|unparseable|network|weights/i);
        assert.equal(await gui.evaluate(() => window.AcasInstances[0].instance.instanceClosed), false);
        assert.deepEqual(await gui.evaluate(() => window.lc0WeightSuccesses), []);
        await fileInput.setInputFiles(path.resolve('app/assets/lc0-nets/maia-1100.pb'));
        await gui.waitForFunction(() => JSON.parse(localStorage.getItem('gm:AcasConfig'))?.global?.profiles?.default?.modernLc0Weight, null, { timeout: 30000 });
        await gui.waitForFunction(() => window.AcasInstances[0]?.instance?.pV.default?.engineSettingsReady
            && window.AcasInstances[0].instance.pV.default.lc0WeightName === 'maia-1100.pb', null, { timeout: 45000 });
        // EloEye sessions treat analysis errors as terminal. Start a fresh client after verifying engine recovery.
        await page.evaluate(() => window.board.destroy());
        await gui.waitForFunction(() => window.AcasInstances.length === 0, null, { timeout: 10000 });
        await page.reload();
        await page.waitForFunction(() => window.board?.error || window.board?.profilesReady, null, { timeout: 45000 });
        const first = await page.evaluate(() => ({
            error: window.board.error?.message, ready: window.board.profilesReady, hints: window.board.hints
        }));
        assert.equal(first.error, undefined);
        assert.equal(first.ready, true);
        assert.ok(first.hints.moves.length > 0);
        await gui.waitForFunction(() => window.lc0WeightSuccesses.length === 1);
        assert.deepEqual(await gui.evaluate(() => window.lc0WeightSuccesses),
            ['Lc0 weights uploaded and loaded: maia-1100.pb']);
        assert.ok(await gui.evaluate(() => window.lc0Commands.includes('go nodes 4')));
        assert.equal(await page.evaluate(async () => {
            const { Chess } = await import('/app/assets/engines/libraries/chessjs/chess.js');
            const chess = new Chess(window.board.position.fen);
            return window.board.hints.moves.every(([from, to, promotion]) =>
                chess.moves({ verbose: true }).some(move =>
                    move.from === from && move.to === to && (!promotion || move.promotion === promotion)));
        }), true);
        const state = await gui.evaluate(() => {
            const instance = window.AcasInstances[0].instance;
            return { engine: instance.getEngineAcasObj('default').type,
                weights: instance.pV.default.lc0WeightName, nodes: instance.pV.default.engineNodes };
        });
        assert.deepEqual(state, { engine: engineName, weights: 'maia-1100.pb', nodes: 4 });
        const selectedId = await gui.evaluate(() => JSON.parse(localStorage.getItem('gm:AcasConfig')).global.profiles.default.modernLc0Weight);
        const storedName = await page.evaluate(async id => {
            const { getLc0Weights } = await import('/app/assets/engines/lc0/weight-storage.js');
            return (await getLc0Weights(id)).name;
        }, selectedId);
        assert.equal(storedName, 'maia-1100.pb');
        await fileInput.setInputFiles({ name: 'empty.pb', mimeType: 'application/octet-stream', buffer: Buffer.alloc(0) });
        await gui.waitForFunction(() => window.lc0SaveFailure, null, { timeout: 30000 });
        assert.match(await gui.evaluate(() => window.lc0SaveFailure), /nonempty/i);
        assert.equal(await gui.evaluate(() => JSON.parse(localStorage.getItem('gm:AcasConfig')).global.profiles.default.modernLc0Weight), selectedId);
        const options = await gui.evaluate(engine => [...document.querySelectorAll(`[data-id="DYNAMIC_${engine}_default"] [data-key]`)]
            .map(input => input.dataset.key), engineName);
        assert.ok(options.includes(`DYNAMIC_${engineName}_Threads`));
        assert.ok(options.includes(`DYNAMIC_${engineName}_CPuct`));
        assert.ok(!options.includes(`DYNAMIC_${engineName}_WeightsFile`));
        assert.ok(!options.includes(`DYNAMIC_${engineName}_Backend`));
        await gui.evaluate(engine => {
            const input = document.querySelector(`input[data-key="DYNAMIC_${engine}_Threads"]`);
            input.value = '2';
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }, engineName);
        await gui.waitForFunction(() => window.lc0Commands.some(line => line === 'setoption name Threads value 2'), null, { timeout: 30000 });
        await gui.evaluate(() => {
            const instance = window.AcasInstances[0].instance;
            window.oldLc0Worker = instance.getEngineAcasObj('default').worker;
        });
        await gui.evaluate(async id => {
            const config = await USERSCRIPT.getValue(USERSCRIPT_SHARED_VARS.gmConfigKey);
            config.global.profiles[GET_PROFILE_STORAGE_KEY('sharedWeights')] = {
                engineEnabled: false, chessEngine: 'modern-lc0', modernLc0Weight: id
            };
            await USERSCRIPT.setValue(USERSCRIPT_SHARED_VARS.gmConfigKey, config);
        }, selectedId);
        await fileInput.setInputFiles(path.resolve('app/assets/lc0-nets/maia-1200.pb'));
        await gui.waitForFunction(() => {
            const instance = window.AcasInstances[0]?.instance;
            return instance?.pV.default.lc0WeightName === 'maia-1200.pb' && instance.pV.default.engineSettingsReady
                && instance.getEngineAcasObj('default')?.worker !== window.oldLc0Worker;
        }, null, { timeout: 45000 }).catch(async error => {
            console.error('Weight replacement state:', await gui.evaluate(() => ({
                filter: SETTING_FILTER_OBJ,
                config: JSON.parse(localStorage.getItem('gm:AcasConfig')),
                failure: window.lc0Failure,
                saveFailure: window.lc0SaveFailure,
                status: document.querySelector('#modern-lc0-weights [role="status"]').textContent,
                weights: window.AcasInstances[0]?.instance?.pV.default?.lc0WeightName
            })));
            throw error;
        });
        assert.equal(await gui.evaluate(async id => {
            const { getLc0Weights } = await import('./assets/engines/lc0/weight-storage.js');
            return (await getLc0Weights(id)).name;
        }, selectedId), 'maia-1100.pb', 'Replacing a profile must preserve weights used by another profile');
        const newFen = await page.evaluate(async () => {
            const { Chess } = await import('/app/assets/engines/libraries/chessjs/chess.js');
            const chess = new Chess();
            chess.move('e4');
            window.board.setPosition({ fen: chess.fen(), turn: 'b', lastMove: ['e2', 'e4'] });
            chess.move('e5');
            window.board.setPosition({ fen: chess.fen(), turn: 'w', lastMove: ['e7', 'e5'] });
            return chess.fen();
        });
        await page.waitForFunction(fen => window.board.error ||
            (window.board.profilesReady && window.board.hints?.fen === fen), newFen, { timeout: 45000 });
        const after = await page.evaluate(() => ({ error: window.board.error?.message, hints: window.board.hints }));
        assert.equal(after.error, undefined);
        assert.ok(after.hints.moves.length > 0);
        await gui.evaluate(async () => {
            const input = document.querySelector('input[data-key="movesOnDemand"]');
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await gui.waitForFunction(() => JSON.parse(localStorage.getItem('gm:AcasConfig'))?.global?.profiles?.default?.movesOnDemand === true);
        await gui.evaluate(async () => {
            const instance = window.AcasInstances[0].instance;
            window.lc0Commands.length = 0;
            window.demandResult = null;
            instance.getEngineAcasObj('default').worker.addEventListener('message', ({ data }) => {
                if(data?.type === 'uci' && data.line.startsWith('bestmove ')) window.demandResult = data.line;
            }, { once: false });
            await instance.calculateBestMoves(instance.currentFen, {
                specificMovesObj: { moves: ['g1f3'] }, specificProfileName: 'default'
            });
        });
        await gui.waitForFunction(() => window.lc0Commands.some(line => /searchmoves g1f3/.test(line)), null, { timeout: 30000 });
        await gui.waitForFunction(() => window.demandResult?.startsWith('bestmove g1f3'), null, { timeout: 30000 });
        await gui.evaluate(async () => {
            const { runSettingChangeObserver } = await import('./assets/js/gui/settingChangeObserver.js');
            const input = document.querySelector('input[data-key="chessEngine"]');
            input.value = 'lc0';
            runSettingChangeObserver(input);
        });
        await gui.waitForFunction(() => !document.getElementById('lc0-weight-dropdown').classList.contains('hidden')
            && document.getElementById('modern-lc0-weights').classList.contains('hidden'));
        await gui.evaluate(async engine => {
            const { runSettingChangeObserver } = await import('./assets/js/gui/settingChangeObserver.js');
            const input = document.querySelector('input[data-key="chessEngine"]');
            input.value = engine;
            runSettingChangeObserver(input);
        }, engineName);
        await gui.waitForFunction(() => document.getElementById('lc0-weight-dropdown').classList.contains('hidden')
            && !document.getElementById('modern-lc0-weights').classList.contains('hidden'));
        const removedId = await gui.evaluate(() => JSON.parse(localStorage.getItem('gm:AcasConfig')).global.profiles.default.modernLc0Weight);
        await gui.evaluate(() => document.querySelector('.lc0-remove-weights').click());
        await gui.waitForFunction(() => JSON.parse(localStorage.getItem('gm:AcasConfig')).global.profiles.default.modernLc0Weight === ''
            && window.AcasInstances[0].instance.pV.default.lc0WeightName === 'maia-1500.pb'
            && window.AcasInstances[0].instance.pV.default.engineSettingsReady, null, { timeout: 45000 });
        assert.equal(await gui.evaluate(() => window.AcasInstances[0].instance.instanceClosed), false);
        await gui.waitForFunction(async id => {
            const { getLc0Weights } = await import('./assets/engines/lc0/weight-storage.js');
            try { await getLc0Weights(id); return false; } catch { return true; }
        }, removedId, { timeout: 30000 });
        await fileInput.setInputFiles(path.resolve('app/assets/lc0-nets/maia-1200.pb'));
        await gui.waitForFunction(() => {
            const instance = window.AcasInstances[0]?.instance;
            return instance?.pV.default.lc0WeightName === 'maia-1200.pb' && instance.pV.default.engineSettingsReady;
        }, null, { timeout: 45000 });
        missingDefault = true;
        await gui.evaluate(() => { window.lc0Failure = ''; });
        if(!await gui.locator('#modern-lc0-weights-floaty').isVisible())
            await gui.locator('#modern-lc0-weights .open-floaty-btn').click();
        await gui.locator('.lc0-remove-weights').click();
        await gui.waitForFunction(() => window.lc0Failure.includes('HTTP 404'), null, { timeout: 30000 });
        assert.equal(await gui.evaluate(() => window.AcasInstances[0].instance.instanceClosed), false);
        missingDefault = false;
        await fileInput.setInputFiles(path.resolve('app/assets/lc0-nets/maia-1200.pb'));
        await gui.waitForFunction(() => window.AcasInstances[0]?.instance?.pV.default?.engineSettingsReady
            && window.AcasInstances[0].instance.pV.default.lc0WeightName === 'maia-1200.pb', null, { timeout: 45000 });
        await page.evaluate(() => window.board.destroy());
    } finally {
        await context.close();
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
