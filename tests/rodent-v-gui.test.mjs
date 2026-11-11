import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { buildUserscript } from './elo-tool/userscriptHarness.mjs';

for(const { advanced, depth, limitedAdvanced } of [
    { advanced: true, depth: 1 }, { advanced: false, depth: 1 },
    { advanced: true, depth: 100, limitedAdvanced: true }
]) {
test(`Rodent ${limitedAdvanced ? 'Advanced Elo node limit waits despite depth 100' : advanced
    ? 'depth 1 waits for final suggestions' : 'Elo 1000 waits for final suggestions and 3200 streams'}`, { timeout: 60000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    const context = await browser.newContext();
    try {
        await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
        await context.addInitScript(({ advanced, depth, limitedAdvanced }) => {
            localStorage.setItem('gm:isTosAccepted', 'true');
            localStorage.setItem('gm:AcasConfig', JSON.stringify({ global: {
                chessEngineProfile: 'default', profiles: { default: {
                    engineEnabled: true, chessEngine: 'rodent-v', enableAdvancedElo: advanced, engineElo: 1000,
                    advancedEloDepth: depth, engineNodes: 0, onlyShowTopMoves: true, maxMovetime: 0,
                    onlyCalculateOwnTurn: false, displayMovesOnExternalSite: true,
                    moveSuggestionAmount: limitedAdvanced ? 2 : 1, 'DYNAMIC_rodent-v_MultiPV': limitedAdvanced ? 2 : 1,
                    ...(limitedAdvanced ? {
                        'DYNAMIC_rodent-v_UCI_LimitStrength': true, 'DYNAMIC_rodent-v_UCI_Elo': 2000
                    } : {})
                } }
            } }));
        }, { advanced, depth, limitedAdvanced });
        const gui = await context.newPage(), boardPage = await context.newPage();
        const userscript = (await buildUserscript())
            .replace("'hosts': { 'prod': 'psyyke.github.io', 'dev': 'localhost' }",
                `'hosts': { 'prod': '${new URL(url).host}', 'dev': '${new URL(url).host}' }`)
            .replace("'path': '/A.C.A.S/'", "'path': '/app/'");
        await gui.addInitScript(userscript);
        await gui.goto(`${url}/app/`);
        await boardPage.route('**/rodent-depth-board', route => route.fulfill({ contentType: 'text/html', body: `
            <div id="mount"></div><script type="module">
            import { BoardSession } from '/tools/eloeye/boardSession.js';
            import { Chess } from '/app/assets/engines/libraries/chessjs/chess.js';
            window.board = new BoardSession(document.getElementById('mount'));
            window.chess = new Chess();
            window.board.setPosition({ fen: chess.fen(), turn: 'w' });
            </script>` }));
        await boardPage.goto(`${url}/rodent-depth-board`);
        await gui.waitForFunction(() => AcasInstances?.[0]?.instance?.pV.default?.engineSettingsReady, null, { timeout: 30000 });
        await boardPage.waitForFunction(() => board.hints?.moves?.length, null, { timeout: 30000 });
        await gui.evaluate(() => {
            const instance = AcasInstances[0].instance;
            window.depthTrace = [];
            const display = instance.displayMoves;
            instance.displayMoves = function(moves, ...args) {
                depthTrace.push({ type: 'display', fen: this.currentFen, moves: moves.map(move => move.playerUci),
                    calculating: this.isEngineCalculating('default') });
                return display.call(this, moves, ...args);
            };
            const engine = instance.getEngineAcasObj('default');
            const send = engine.sendMsg;
            engine.sendMsg = function(line, ...args) {
                depthTrace.push({ type: 'command', line });
                return send.call(this, line, ...args);
            };
            engine.worker.addEventListener('message', ({ data }) => depthTrace.push({ type: 'output', line: data }));
        });
        for(const move of ['e4', 'e5', 'Nf3', 'Nc6']) {
            await gui.evaluate(() => { depthTrace.length = 0; });
            const fen = await boardPage.evaluate(move => {
                chess.move(move);
                const fen = chess.fen();
                board.setPosition({ fen, turn: chess.turn() });
                return fen;
            }, move);
            await gui.waitForFunction(fen => depthTrace.some(entry => entry.type === 'display' && entry.fen === fen), fen);
            await gui.waitForFunction(() => !AcasInstances[0].instance.isEngineCalculating('default'));
            const trace = await gui.evaluate(() => depthTrace);
            assert.deepEqual(trace.filter(entry => entry.type === 'command' && entry.line.startsWith('go ')).map(entry => entry.line),
                [`go depth ${advanced ? depth : 100}`], JSON.stringify(trace));
            const info = trace.filter(entry => entry.type === 'output' && /^info depth /.test(entry.line));
            assert.ok(info.length > 0, JSON.stringify(trace));
            if(advanced && depth === 1) assert.ok(info.every(entry => /^info depth 1 /.test(entry.line)), JSON.stringify(trace));
            if(limitedAdvanced) assert.ok(trace.some(entry => entry.type === 'output'
                && entry.line === 'info string search limited to 10200 nodes'), JSON.stringify(trace));
            const displays = trace.filter(entry => entry.type === 'display');
            assert.equal(displays.length, 1, JSON.stringify(trace));
            assert.equal(displays[0].calculating, false, JSON.stringify(trace));
            const bestmove = trace.find(entry => entry.type === 'output' && /^bestmove /.test(entry.line));
            assert.ok(bestmove, JSON.stringify(trace));
            assert.equal(displays[0].moves[0], bestmove.line.split(' ')[1], JSON.stringify(trace));
        }
        if(!advanced) {
            await gui.evaluate(() => {
                const input = document.querySelector('input[data-key="engineElo"]');
                input.value = '3200';
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
            await gui.waitForFunction(() => AcasInstances[0].instance.pV.default.appliedSettings.engineElo === 3200);
            await gui.evaluate(() => { depthTrace.length = 0; });
            await boardPage.evaluate(() => {
                chess.move('Bb5');
                board.setPosition({ fen: chess.fen(), turn: chess.turn() });
            });
            await gui.waitForFunction(() => depthTrace.some(entry => entry.type === 'display' && entry.calculating));
            const trace = await gui.evaluate(() => depthTrace);
            assert.ok(trace.some(entry => entry.type === 'command' && entry.line === 'go depth 100'));
            assert.ok(!trace.some(entry => entry.type === 'output' && /^bestmove /.test(entry.line)));
            await gui.evaluate(() => AcasInstances[0].instance.engineStopCalculating('default', 'Test finished'));
            await gui.waitForFunction(() => !AcasInstances[0].instance.isEngineCalculating('default'));
        }
    } finally {
        await context.close();
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
}

test('Rodent works through the app in basic and advanced modes, including saved personalities', { timeout: 120000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    const context = await browser.newContext();
    try {
        await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
        await context.addInitScript(() => {
            if(!location.pathname.startsWith('/app/')) return;
            window.rodentCommands = [];
            window.rodentOutput = [];
            const post = Worker.prototype.postMessage;
            Worker.prototype.postMessage = function(message, ...args) {
                if(typeof message === 'string') window.rodentCommands.push(message);
                return post.call(this, message, ...args);
            };
            if(!localStorage.getItem('gm:AcasConfig')) {
                localStorage.setItem('gm:isTosAccepted', 'true');
                localStorage.setItem('gm:AcasConfig', JSON.stringify({ global: {
                    chessEngineProfile: 'default', profiles: { default: {
                        engineEnabled: true, chessEngine: 'rodent-v', engineElo: 2500,
                        enableAdvancedElo: false, displayMovesOnExternalSite: true,
                        onlyCalculateOwnTurn: true, moveSuggestionAmount: 2, advancedEloDepth: 3
                    } }
                } }));
            }
        });
        const gui = await context.newPage(), boardPage = await context.newPage();
        if(process.env.RODENT_TEST_VERBOSE === '1') {
            gui.on('console', message => console.log('Rodent GUI:', message.text()));
            gui.on('pageerror', error => console.error('Rodent GUI:', error.message));
        }
        const userscript = (await buildUserscript())
            .replace("'hosts': { 'prod': 'psyyke.github.io', 'dev': 'localhost' }",
                `'hosts': { 'prod': '${new URL(url).host}', 'dev': '${new URL(url).host}' }`)
            .replace("'path': '/A.C.A.S/'", "'path': '/app/'");
        await gui.addInitScript(userscript);
        await gui.goto(`${url}/app/`);
        await gui.waitForFunction(() => typeof SETTING_FILTER_OBJ !== 'undefined' && SETTING_FILTER_OBJ.profileID);
        await boardPage.route('**/rodent-board', route => route.fulfill({ contentType: 'text/html', body: `
            <div id="mount"></div><script type="module">
            import { BoardSession } from '/tools/eloeye/boardSession.js';
            import { Chess } from '/app/assets/engines/libraries/chessjs/chess.js';
            window.board = new BoardSession(document.getElementById('mount'));
            window.board.setPosition({ fen: new Chess().fen(), turn: 'w' });
            </script>` }));
        await boardPage.goto(`${url}/rodent-board`);
        await gui.waitForFunction(() => window.AcasInstances?.[0]?.instance?.pV.default?.engineSettingsReady, null, { timeout: 30000 });
        await boardPage.waitForFunction(() => window.board.error || window.board.hints?.moves?.length, null, { timeout: 30000 });
        assert.equal(await boardPage.evaluate(() => window.board.error?.message), undefined);
        assert.ok(await boardPage.evaluate(() => window.board.hints.moves.length > 0));
        const basic = await gui.evaluate(() => ({
            commands: rodentCommands,
            depth: window.AcasInstances[0].instance.pV.default.searchDepth,
            elo: window.AcasInstances[0].instance.pV.default.appliedSettings.engineElo
        }));
        assert.equal(basic.depth, null);
        assert.equal(basic.elo, 2500);
        assert.ok(basic.commands.includes('setoption name UCI_Elo value 2500'));
        assert.ok(basic.commands.includes('setoption name UCI_LimitStrength value true'));
        assert.ok(!basic.commands.some(line => /setoption name (Skill Level|UCI_ShowWDL|UCI_Variant)/.test(line)));
        await gui.locator('#engine-elo-input .open-floaty-btn').click();
        await gui.evaluate(() => {
            const input = document.querySelector('input[data-key="enableAdvancedElo"]');
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await gui.waitForFunction(() => window.AcasInstances[0]?.instance?.pV.default?.usingAdvancedMode
            && window.AcasInstances[0].instance.pV.default.engineSettingsReady).catch(async error => {
            console.error('Advanced Rodent state:', await gui.evaluate(() => ({
                commands: rodentCommands, config: JSON.parse(localStorage.getItem('gm:AcasConfig')),
                filter: SETTING_FILTER_OBJ,
                advanced: window.AcasInstances[0]?.instance?.pV.default?.usingAdvancedMode,
                ready: window.AcasInstances[0]?.instance?.pV.default?.engineSettingsReady
            })));
            throw error;
        });
        for(const key of ['Personality', 'hceWeight', 'OwnSafety', 'UCI_Elo', 'UCI_LimitStrength', 'MultiPV'])
            assert.equal(await gui.locator(`input[data-key="DYNAMIC_rodent-v_${key}"]`).count(), 1);
        const personalityText = '; custom style\nsetoption name OwnSafety value 63\nsetoption name hceWeight value 80';
        const editor = gui.locator('textarea[data-key="DYNAMIC_rodent-v_PersonalityFile"]');
        assert.equal(await editor.count(), 1);
        await gui.evaluate(() => { window.previousRodent = AcasInstances[0].instance.getEngineAcasObj('default'); });
        await editor.fill(personalityText);
        await editor.dispatchEvent('change');
        await gui.waitForFunction(text => {
            const instance = AcasInstances[0].instance, engine = instance.getEngineAcasObj('default');
            return engine !== previousRodent && instance.pV.default.engineSettingsReady
                && engine?.textFiles?.PersonalityFile === text;
        }, personalityText);
        assert.equal(await gui.locator('input[data-key="DYNAMIC_rodent-v_OwnSafety"]').inputValue(), '63');
        assert.equal(await gui.evaluate(() => JSON.parse(localStorage.getItem('gm:AcasConfig'))
            .global.profiles.default['DYNAMIC_rodent-v_PersonalityFile']), personalityText);
        assert.ok(!(await gui.evaluate(() => rodentCommands)).some(line => line.includes('PersonalityFile') || /[\r\n]/.test(line)));
        for(const [key, value] of [['hceWeight', '0'], ['Personality', 'tal_hybrid'], ['MultiPV', '2']]) {
            await gui.evaluate(({ key, value }) => {
                const input = document.querySelector(`input[data-key="DYNAMIC_rodent-v_${key}"]`);
                input.value = value;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }, { key, value });
            await gui.waitForFunction(({ key, value }) => window.rodentCommands.includes(`setoption name ${key} value ${value}`), { key, value });
        }
        // A real reload must replay a saved default-valued manual override too.
        await gui.reload();
        await gui.waitForFunction(() => window.AcasInstances?.[0]?.instance?.pV.default?.engineSettingsReady, null, { timeout: 30000 });
        await gui.waitForFunction(() => rodentCommands.includes('setoption name Personality value tal_hybrid')
            && rodentCommands.includes('setoption name hceWeight value 0'));
        assert.equal(await editor.inputValue(), personalityText);
        assert.equal(await gui.evaluate(() => window.AcasInstances[0].instance.pV.default.multiPV), 2);
        await gui.evaluate(() => {
            const instance = window.AcasInstances[0].instance;
            instance.getEngineAcasObj('default').worker.addEventListener('message', ({ data }) => rodentOutput.push(data));
            const input = document.querySelector('input[data-key="movesOnDemand"]');
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await gui.waitForFunction(() => JSON.parse(localStorage.getItem('gm:AcasConfig')).global.profiles.default.movesOnDemand === true);
        await gui.evaluate(async () => {
            const instance = window.AcasInstances[0].instance;
            await instance.calculateBestMoves(instance.currentFen, {
                specificMovesObj: { moves: ['a2a3'] }, specificProfileName: 'default'
            });
        });
        await gui.waitForFunction(() => rodentOutput.some(line => typeof line === 'string' && /^bestmove a2a3(?: |$)/.test(line)));
        assert.ok(await gui.evaluate(() => rodentCommands.some(line => /searchmoves a2a3$/.test(line))));
        await gui.locator('#engine-elo-input .open-floaty-btn').click();
        await editor.fill('');
        await editor.dispatchEvent('change');
        await gui.waitForFunction(() => {
            const instance = AcasInstances[0].instance;
            return instance.pV.default.engineSettingsReady
                && instance.getEngineAcasObj('default')?.textFiles?.PersonalityFile === '';
        });
        await gui.evaluate(() => {
            rodentOutput.length = 0;
            const engine = AcasInstances[0].instance.getEngineAcasObj('default');
            engine.worker.addEventListener('message', ({ data }) => rodentOutput.push(data));
            engine.sendMsg('uci');
        });
        await gui.waitForFunction(() => rodentOutput.includes('uciok'));
        assert.ok(await gui.evaluate(() => rodentOutput.includes('option name OwnSafety type spin default 60 min 0 max 500')));
    } finally {
        await context.close();
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
