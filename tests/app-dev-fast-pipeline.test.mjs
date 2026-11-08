import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { buildUserscript } from './elo-tool/userscriptHarness.mjs';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';

for(const { moveTimeMs, reloadEachMatch } of [
    { moveTimeMs: 1, reloadEachMatch: false },
    { moveTimeMs: 5, reloadEachMatch: false },
    { moveTimeMs: 1, reloadEachMatch: true }
]) {
test(`real userscript and GUI keep delivering moves against a ${moveTimeMs}ms opponent${reloadEachMatch ? ' with fresh documents' : ''}`, { timeout: 120000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const context = await browser.newContext();
        await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
        await context.route('http://localhost/A.C.A.S/**', async route => {
            const request = new URL(route.request().url());
            const pathname = request.pathname === '/A.C.A.S/app/dev/assets/openings/pgn.json'
                ? '/app/assets/openings/pgn.json' : request.pathname.slice('/A.C.A.S'.length);
            const response = await route.fetch({ url: `${url}${pathname}${request.search}` });
            await route.fulfill({ response });
        });
        await context.addInitScript(({ moveTimeMs, reloadEachMatch }) => {
            if(localStorage.getItem('gm:isTosAccepted')) return;
            localStorage.setItem('gm:isTosAccepted', 'true');
            localStorage.setItem('gm:AcasConfig', JSON.stringify({ global: {
                chessEngineProfile: 'default', profiles: { default: {
                    engineEnabled: true, chessEngine: 'stockfish-18-lite-single',
                    displayMovesOnExternalSite: true, onlyCalculateOwnTurn: true,
                    maxMovetime: 20, moveSuggestionAmount: 1, engineElo: 3000,
                    arrowOpacity: 50, primaryArrowColorHex: '#32cd32',
                    hintDetail: 'full', onlyShowWarningMoves: false
                } }
            } }));
            localStorage.setItem('acas-dev-live-stockfish18-v1', JSON.stringify({ settings: {
                moveTimeMs, reloadEachMatch, autoRestartOnEnd: true
            } }));
        }, { moveTimeMs, reloadEachMatch });
        const userscript = await buildUserscript();
        await context.addInitScript(userscript);
        const gui = await context.newPage();
        const dev = await context.newPage();
        let documentLoads = 0;
        dev.on('load', () => { documentLoads++; });
        const errors = [];
        for(const page of [gui, dev]) {
            page.on('pageerror', error => errors.push(error.message));
            page.on('console', message => { if(message.type() === 'error') errors.push(message.text()); });
        }
        await gui.goto('http://localhost/A.C.A.S/app/');
        await dev.goto('http://localhost/A.C.A.S/app/dev/');
        await dev.waitForFunction(() => typeof window.ChessgroundX === 'function');
        await dev.evaluate(() => {
            const create = window.ChessgroundX;
            window.ChessgroundX = (element, config) => {
                const board = create(element, config);
                if(element.classList.contains('live-board')) window.pipelineBoard = board;
                return board;
            };
            window.pipelineSuggestions = [];
            window.addEventListener('message', event => {
                if(event.source === window && event.data?.name === 'bestMoveArr') {
                    window.pipelineSuggestions.push(event.data.value);
                }
            });
        });
        await dev.locator('.test-btn').first().click();
        let previous = 0;
        let lastProgress = Date.now();
        const deadline = Date.now() + 90000;
        while(Date.now() < deadline) {
            const stats = await dev.evaluate(async () => {
                const s = (await import('/A.C.A.S/app/dev/test-modules/live.js')).liveStatistics;
                return { moves: s.games.reduce((sum, game) => sum + game.moves.length, 0) + (s.active?.moves.length || 0),
                    games: s.games.length, active: s.active };
            }).catch(error => {
                if(reloadEachMatch && /Execution context was destroyed|Cannot find context with specified id/.test(error.message))
                    return null;
                throw error;
            });
            if(!stats) {
                await dev.waitForLoadState('load');
                continue;
            }
            if(stats.moves !== previous) { previous = stats.moves; lastProgress = Date.now(); }
            if(previous >= 500) break;
            if(Date.now() - lastProgress > 8000) {
                const state = await gui.evaluate(() => (window.AcasInstances || []).map(({ instance: i }) => ({
                    fen: i.currentFen, board: { turn: i.boardState.turn, history: i.boardState.history.slice(-4) },
                    profiles: Object.fromEntries(Object.entries(i.pV).map(([key, p]) => [key, {
                        engineSettingsReady: p.engineSettingsReady, pending: p.pendingCalculations,
                        queued: p.pendingCalculationRequest, hints: p.hintCandidates,
                        past: p.pastMoveObjects, multiPV: p.multiPV
                    }]))
                })));
                assert.fail(JSON.stringify({ moves: stats.moves, games: stats.games, latest: stats.active?.moves.slice(-3), state, errors }));
            }
            await dev.waitForTimeout(100);
        }
        assert.ok(previous >= 500, `Only ${previous} plies played`);
        await dev.locator('.live-pause').click();
        const results = await dev.evaluate(async () => {
            const stats = (await import('/A.C.A.S/app/dev/test-modules/live.js')).liveStatistics;
            return { games: stats.games.length, failed: stats.games.filter(game => game.status === 'failed').length,
                colors: [...new Set([...stats.games, stats.active].filter(Boolean).map(game => game.playerColor))] };
        });
        assert.equal(results.failed, 0);
        assert.deepEqual(results.colors.sort(), ['black', 'white']);
        if(reloadEachMatch) {
            assert.ok(results.games >= 2, 'Multiple matches complete across fresh documents');
            assert.ok(documentLoads >= 3, 'The dev document reloads between matches');
        }
        console.log(`Real pipeline completed ${previous} plies against ${moveTimeMs}ms Stockfish`);
        if(moveTimeMs === 1 && !reloadEachMatch) {
            const chess = new Chess();
            const replay = new Chess();
            assert.ok(replay.load_pgn('1. d4 d5 2. e3 e6 3. a4 Nf6 4. Be2 Be7 5. Nf3 c5 6. a5 cxd4 7. exd4 Qc7 8. Nc3 Nc6 9. Nb5 Qb8 10. g3 Ne4 11. Bf4 Nd6 12. c4 a6 13. Nc3 dxc4 14. d5 exd5 15. Nxd5 Be6 16. Nb6 O-O 17. Nxa8 Rd8 18. Nb6 Qc7 19. Nxc4 Bh3 20. Rc1 Nxc4 21. Bxc7 Bb4+ 22. Rc3 Rxd1+ 23. Kxd1'));
            const setPosition = async (fen, orientation = 'black') => {
                await dev.evaluate(({ fen, orientation }) => {
                    window.pipelineBoard.set({
                        fen, orientation, animation: { enabled: false }, movable: { dests: new Map() }
                    });
                }, { fen, orientation });
            };
            const waitPosition = async fen => {
                await gui.waitForFunction(fen => window.AcasInstances?.some(({ instance }) =>
                    instance.currentFen?.split(' ')[0] === fen.split(' ')[0]
                    && instance.currentFen?.split(' ')[1] === fen.split(' ')[1]), fen, { timeout: 8000 });
            };
            const stalledOpening = new Chess();
            await setPosition(stalledOpening.fen());
            await waitPosition(stalledOpening.fen());
            for(const san of ['d4', 'Nf6']) {
                stalledOpening.move(san);
                await setPosition(stalledOpening.fen());
                await waitPosition(stalledOpening.fen());
            }
            await dev.evaluate(() => { window.pipelineSuggestions = []; });
            for(const san of ['e3', 'e6', 'Nf3']) stalledOpening.move(san);
            await setPosition(stalledOpening.fen());
            await waitPosition(stalledOpening.fen());
            await dev.waitForFunction(() => window.pipelineSuggestions.length > 0, null, { timeout: 8000 });
            const recoveredSuggestions = await dev.evaluate(() => window.pipelineSuggestions);
            assert.ok(recoveredSuggestions.some(move => stalledOpening.moves({ verbose: true }).some(legal =>
                legal.from === move[0] && legal.to === move[1])), 'Reported three-ply opening gap delivers a legal black reply');
            await setPosition(chess.fen());
            await waitPosition(chess.fen());
            for(const move of replay.history().slice(0, -2)) {
                chess.move(move);
                await setPosition(chess.fen());
                await waitPosition(chess.fen());
            }
            const before = chess.fen();
            const partial = new Chess(before);
            partial.put({ type: 'r', color: 'b' }, 'd1');
            await setPosition(partial.fen());
            await dev.waitForTimeout(300);
            await waitPosition(before);
            const kingMissing = new Chess(partial.fen());
            kingMissing.remove('e1');
            await setPosition(kingMissing.fen());
            await dev.waitForTimeout(300);
            await waitPosition(before);
            await dev.evaluate(() => { window.pipelineSuggestions = []; });
            chess.move('Rxd1+');
            chess.move('Kxd1');
            await setPosition(chess.fen());
            await waitPosition(chess.fen());
            await dev.waitForFunction(() => window.pipelineSuggestions.length > 0, null, { timeout: 8000 });
            const suggestions = await dev.evaluate(() => window.pipelineSuggestions);
            assert.ok(suggestions.some(move => chess.moves({ verbose: true }).some(legal =>
                legal.from === move[0] && legal.to === move[1])), 'A legal black reply reaches the userscript after Kxd1');
            const white = new Chess(), whiteReplay = new Chess();
            assert.ok(whiteReplay.load_pgn('1. e3 d5 2. Nf3 Nf6 3. d4 Bg4 4. c4 e6 5. Qb3 a5 6. Qxb7 Nbd7 7. c5 Bxf3 8. gxf3 Be7 9. Nc3 O-O 10. b3 Nh5 11. Bb5 h6 12. Qc6 Nhf6 13. e4 e5 14. Nxd5 exd4 15. Nxf6+ Nxf6 16. Bb2 a4 17. O-O-O axb3 18. Kb1 bxa2+'));
            await setPosition(white.fen(), 'white');
            await waitPosition(white.fen());
            for(const move of whiteReplay.history().slice(0, -4)) {
                white.move(move);
                await setPosition(white.fen(), 'white');
                await waitPosition(white.fen());
            }
            const beforeCastle = white.fen();
            white.move('O-O-O');
            const castlePartial = new Chess(white.fen());
            castlePartial.remove('a4');
            await setPosition(castlePartial.fen(), 'white');
            await dev.waitForTimeout(300);
            const diagnostic = await dev.evaluate(async () =>
                (await import('/A.C.A.S/app/assets/js/misc/heapDiagnostics.js')).collectLiveDiagnostics());
            assert.equal(diagnostic.userscriptStatus, 'received');
            assert.equal(diagnostic.guiStatus, 'received');
            assert.equal(diagnostic.userscript.observedFen, castlePartial.fen().split(' ')[0]);
            assert.equal(diagnostic.userscript.lastAllowedFen, beforeCastle.split(' ')[0]);
            assert.equal(diagnostic.userscript.validation.recovery.status, 'unresolved');
            assert.ok(diagnostic.gui.some(tab => tab.instances.some(instance =>
                instance.currentFen.split(' ')[0] === beforeCastle.split(' ')[0])));
            white.move('axb3');
            await setPosition(white.fen(), 'white');
            await waitPosition(white.fen());
            await dev.evaluate(() => { window.pipelineSuggestions = []; });
            white.move('Kb1');
            white.move('bxa2+');
            await setPosition(white.fen(), 'white');
            await waitPosition(white.fen());
            await dev.waitForFunction(() => window.pipelineSuggestions.length > 0, null, { timeout: 8000 });
            const whiteSuggestions = await dev.evaluate(() => window.pipelineSuggestions);
            assert.ok(whiteSuggestions.some(move => white.moves({ verbose: true }).some(legal =>
                legal.from === move[0] && legal.to === move[1])), 'Game 66 endpoint delivers a legal white reply');
            await dev.locator('.live-new').click();
            await dev.locator('.live-pause').click();
            await dev.waitForFunction(async () => {
                const stats = (await import('/A.C.A.S/app/dev/test-modules/live.js')).liveStatistics;
                return stats.active?.moves.length >= 10;
            }, null, { timeout: 10000 });
            await dev.locator('.live-pause').click();
            console.log('Games 162 and 66 replayed, live diagnostics captured, and board-reuse restart delivered moves');
        }
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
}
