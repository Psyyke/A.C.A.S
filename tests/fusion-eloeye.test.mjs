import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { buildUserscript } from './elo-tool/userscriptHarness.mjs';

test('EloEye receives a Fusion move when Maia finishes after Max Movetime', { timeout: 90000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    try {
        await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
        await context.route('http://localhost/A.C.A.S/**', async route => {
            const request = new URL(route.request().url());
            if(request.pathname.endsWith('/Fusion/Neural/neural.js')) {
                return route.fulfill({ contentType: 'text/javascript', body: `
                    import { Chess } from '../../libraries/chessjs/chess.js';
                    export default class {
                        ready = Promise.resolve();
                        async evaluate(fen, own, opponent, isCurrent) {
                            await new Promise(resolve => setTimeout(resolve, 300));
                            if(!isCurrent()) return null;
                            const move = new Chess(fen).moves({ verbose: true })[0];
                            return { policy: { [move.from + move.to + (move.promotion || '')]: 1 } };
                        }
                        clear() {}
                        dispose() {}
                    }
                ` });
            }
            if(request.pathname.endsWith('/Fusion/stockfish.js')) {
                return route.fulfill({ contentType: 'text/javascript', body: `
                    export default class {
                        ready = Promise.resolve();
                        constructor(onLine) { this.onLine = onLine; }
                        synchronize() { return Promise.resolve(); }
                        send(command) {
                            if(command === 'stop') queueMicrotask(() => this.onLine('bestmove e2e4'));
                        }
                        dispose() {}
                    }
                ` });
            }
            const response = await route.fetch({ url: `${url}${request.pathname.slice('/A.C.A.S'.length)}${request.search}` });
            await route.fulfill({ response });
        });
        await context.addInitScript(() => {
            localStorage.setItem('gm:isTosAccepted', 'true');
            localStorage.setItem('gm:AcasConfig', JSON.stringify({ global: {
                chessEngineProfile: 'default', profiles: { default: {
                    engineEnabled: true, chessEngine: 'acas-fusion', displayMovesOnExternalSite: true,
                    onlyCalculateOwnTurn: true, maxMovetime: 30, moveSuggestionAmount: 1
                } }
            } }));
        });
        const gui = await context.newPage(), page = await context.newPage();
        await gui.addInitScript(await buildUserscript());
        await gui.goto('http://localhost/A.C.A.S/app/');
        await page.route('**/fusion-fixture', route => route.fulfill({ contentType: 'text/html', body: `
            <div id="mount"></div><script type="module">
            import { BoardSession } from '/A.C.A.S/tools/eloeye/boardSession.js';
            import { Chess } from '/A.C.A.S/app/assets/engines/libraries/chessjs/chess.js';
            window.board = new BoardSession(document.getElementById('mount'));
            window.board.setPosition({ fen: new Chess().fen(), turn: 'w' });
            </script>` }));
        await page.goto('http://localhost/A.C.A.S/fusion-fixture');
        await page.waitForFunction(() => window.board?.error || window.board?.profilesReady, null, { timeout: 30000 });
        const result = await page.evaluate(() => ({
            error: window.board.error?.message, ready: window.board.profilesReady, hints: window.board.hints
        }));
        assert.equal(result.error, undefined);
        assert.equal(result.ready, true);
        assert.ok(result.hints.moves.length > 0);

        await gui.evaluate(async () => {
            const instance = window.AcasInstances[0].instance;
            await instance.calculateBestMoves(instance.currentFen, { skipValidityChecks: true, specificProfileName: 'default' });
        });
        await gui.waitForFunction(() => window.AcasInstances[0]?.instance.pV.default.pendingCalculations
            .some(calculation => !calculation.finished && calculation.goSent));
        await gui.evaluate(() => {
            const instance = window.AcasInstances[0].instance;
            return instance.Interface.updateBoardFen({ skipValidityChecks: true, specificProfileName: 'default' });
        });
        await page.waitForFunction(() => window.board.error || window.board.profilesReady, null, { timeout: 10000 });
        const afterRefresh = await page.evaluate(() => ({
            error: window.board.error?.message, ready: window.board.profilesReady, hints: window.board.hints
        }));
        assert.equal(afterRefresh.error, undefined);
        assert.equal(afterRefresh.ready, true);
        assert.ok(afterRefresh.hints.moves.length > 0);
        await page.evaluate(() => window.board.destroy());
        await gui.waitForFunction(() => window.AcasInstances.length === 0);

        const reportedFen = await page.evaluate(async () => {
            const { BoardSession } = await import('/A.C.A.S/tools/eloeye/boardSession.js');
            const { Chess } = await import('/A.C.A.S/app/assets/engines/libraries/chessjs/chess.js');
            window.chess = new Chess();
            for(const move of ['e4', 'e6', 'd3', 'd5', 'Nd2', 'Nf6']) window.chess.move(move);
            window.board = new BoardSession(document.getElementById('mount'), { orientation: 'b' });
            window.board.setPosition({ fen: window.chess.fen(), turn: 'w' });
            window.chess.move({ from: 'g1', to: 'f3' });
            return window.chess.fen();
        });
        assert.equal(reportedFen, 'rnbqkb1r/ppp2ppp/4pn2/3p4/4P3/3P1N2/PPPN1PPP/R1BQKB1R b KQkq - 3 4');
        await page.waitForFunction(() => window.board.statuses.has('connected'), null, { timeout: 10000 });
        await page.evaluate(() => window.board.setPosition({
            fen: window.chess.fen(), turn: 'b', lastMove: ['g1', 'f3']
        }));
        await page.waitForFunction(() => window.board.error || window.board.profilesReady, null, { timeout: 30000 });
        const afterMove = await page.evaluate(() => ({
            error: window.board.error?.message, ready: window.board.profilesReady, hints: window.board.hints
        }));
        assert.equal(afterMove.error, undefined);
        assert.equal(afterMove.ready, true);
        assert.equal(afterMove.hints.fen, reportedFen);
        assert.ok(afterMove.hints.moves.length > 0);
        await page.evaluate(() => window.board.destroy());
    } finally {
        await context.close();
        await browser.close();
        server.close();
    }
});
