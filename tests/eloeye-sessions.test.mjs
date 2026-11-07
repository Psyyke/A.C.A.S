import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { buildUserscript } from './elo-tool/userscriptHarness.mjs';
import { revealedHints } from '../tools/eloeye/sessionProtocol.js';

test('direct GUI sessions play the reported move, finish replacement rounds and reconnect without game iframes', { timeout: 90000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    try {
        await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
        await context.route('http://localhost/A.C.A.S/**', async route => {
            const request = new URL(route.request().url());
            const response = await route.fetch({ url: `${url}${request.pathname.slice('/A.C.A.S'.length)}${request.search}` });
            await route.fulfill({ response });
        });
        await context.addInitScript(() => {
            if(localStorage.getItem('gm:isTosAccepted')) return;
            localStorage.setItem('gm:isTosAccepted', 'true');
            localStorage.setItem('gm:AcasConfig', JSON.stringify({ global: {
                chessEngineProfile: 'default', profiles: { default: {
                    engineEnabled: true, chessEngine: 'stockfish-18-lite-single',
                    displayMovesOnExternalSite: true, onlyCalculateOwnTurn: true,
                    maxMovetime: 100, moveSuggestionAmount: 2
                }, slow: {
                    engineEnabled: true, chessEngine: 'stockfish-18-lite-single',
                    displayMovesOnExternalSite: true, onlyCalculateOwnTurn: true,
                    maxMovetime: 350, moveDisplayDelay: 600, moveSuggestionAmount: 2,
                    arrowOpacity: 50, primaryArrowColorHex: '#32cd32', secondaryArrowColorHex: '#1e90ff',
                    hintDetail: 'full', onlyShowWarningMoves: false
                }, target: {
                    engineEnabled: true, chessEngine: 'stockfish-18-lite-single',
                    displayMovesOnExternalSite: true, onlyCalculateOwnTurn: true,
                    maxMovetime: 100, moveSuggestionAmount: 1, arrowOpacity: 50,
                    primaryArrowColorHex: '#32cd32', hintDetail: 'destination', onlyShowWarningMoves: false
                } }
            } }));
        });
        const gui = await context.newPage(), page = await context.newPage(), errors = [];
        await gui.addInitScript(await buildUserscript());
        for(const target of [gui, page]) {
            target.on('pageerror', error => errors.push(error.message));
            target.on('console', message => { if(message.type() === 'error') errors.push(message.text()); });
        }
        await gui.goto('http://localhost/A.C.A.S/app/');
        await page.route('**/direct-fixture', route => route.fulfill({ contentType: 'text/html', body: `
            <link rel="stylesheet" href="/A.C.A.S/assets/css/chessground.base.css">
            <link rel="stylesheet" href="/A.C.A.S/assets/css/chessground.brown.css">
            <link rel="stylesheet" href="/A.C.A.S/assets/css/theme-staunty.css">
            <style>.board-session,.cg-wrap {width:400px;height:400px}</style>
            <div id="mount"></div><script type="module">
            import { BoardSession } from '/A.C.A.S/tools/eloeye/boardSession.js';
            import { playGame } from '/A.C.A.S/tools/eloeye/eloPlayer.js';
            window.makeBoard = options => new BoardSession(document.getElementById('mount'), options);
            window.playGame = playGame;
            </script>` }));
        await page.goto('http://localhost/A.C.A.S/direct-fixture');
        await page.waitForFunction(() => window.makeBoard);
        assert.equal(await page.evaluate(() => typeof window.USERSCRIPT), 'undefined');
        const reported = '6k1/5pp1/3n3P/6p1/8/5r2/5qK1/3b4 w - - 0 1';
        await page.evaluate(fen => {
            window.board = window.makeBoard();
            window.analysisTrace = [];
            window.board.watchers.add(() => {
                if(window.board.analysis) window.analysisTrace.push(structuredClone(window.board.analysis));
            });
            window.board.setPosition({ fen, turn: 'w' });
        }, reported);
        await page.waitForFunction(() => window.board.hints?.moves.length, null, { timeout: 20000 });
        assert.deepEqual(await page.evaluate(() => window.board.hints.moves), [['g2', 'h1', null]]);
        await page.waitForFunction(() => window.board.profilesReady, null, { timeout: 20000 });
        const analysis = await page.evaluate(() => ({ current: window.board.analysis, trace: window.analysisTrace }));
        assert.deepEqual(analysis.current.profiles.slice().sort(), ['default', 'slow', 'target']);
        assert.ok(analysis.trace.some(state => state.completed.includes('default') && !state.completed.includes('slow')),
            'The fast profile must not declare the entire combined personality ready');
        assert.equal(await page.locator('iframe').count(), 0);
        await gui.evaluate(async () => {
            const instance = window.AcasInstances[0].instance, profile = Object.keys(instance.pV)[0];
            await instance.refreshHints(profile);
        });
        const result = await page.evaluate(async () => {
            const { Chess } = await import('/A.C.A.S/app/assets/engines/libraries/chessjs/chess.js');
            const moves = [], controller = new AbortController();
            const timer = setTimeout(() => controller.abort(new Error('King escape stalled')), 15000);
            try {
                const score = await window.playGame({
                    frame: window.board, openingFen: window.board.position.fen,
                    acasIsWhite: true, manual: false, signal: controller.signal, onMove: move => moves.push(move),
                    opponentEngine: { async move(fen) {
                        const chess = new Chess(fen);
                        const move = chess.moves({ verbose: true }).find(move => {
                            chess.move(move); const mate = chess.in_checkmate(); chess.undo(); return mate;
                        });
                        return move.from + move.to + (move.promotion || '');
                    } }
                });
                return { score, moves };
            } finally { clearTimeout(timer); }
        });
        assert.equal(result.moves[0].move, 'g2h1');
        assert.equal(result.score, 0);
        await page.evaluate(() => window.board.destroy());
        await gui.waitForFunction(() => window.AcasInstances.length === 0);
        await page.evaluate(async () => {
            const { Chess } = await import('/A.C.A.S/app/assets/engines/libraries/chessjs/chess.js');
            window.multiBoard = window.makeBoard();
            window.multiBoard.setPosition({ fen: new Chess().fen(), turn: 'w' });
        });
        await page.waitForFunction(() => window.multiBoard.profilesReady, null, { timeout: 20000 });
        const finalHints = await page.evaluate(() => window.multiBoard.hints);
        assert.equal(finalHints.partial, true, 'Target-only hints remain visible without becoming playable moves');
        assert.equal(finalHints.candidates.some(candidate => candidate.profile === 'target'), false);
        assert.ok(finalHints.moves.length >= 2, 'Final completion must retain secondary suggestions after streaming redraws');
        for(const profile of ['default', 'slow'])
            assert.ok(finalHints.candidates.some(candidate => candidate.profile === profile && candidate.rank > 0),
                `Final completion must retain the secondary suggestion from ${profile}: ${JSON.stringify(finalHints)}`);
        await page.evaluate(() => window.multiBoard.destroy());
        await gui.waitForFunction(() => window.AcasInstances.length === 0);
        for(let round = 0; round < 4; round++) {
            await page.evaluate(() => {
                window.boards = [window.makeBoard(), window.makeBoard({ orientation: 'b' }),
                    window.makeBoard(), window.makeBoard({ orientation: 'b' })];
                const positions = ['7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', '8/8/8/8/8/6k1/5q2/7K b - - 0 1'];
                window.boards.forEach((board, index) => board.setPosition({ fen: positions[index % 2], turn: index % 2 ? 'b' : 'w' }));
            });
            await page.waitForFunction(() => window.boards.every(board => board.hints?.moves.length), null, { timeout: 20000 });
            if(round === 1) {
                await gui.reload();
                await page.waitForFunction(() => window.boards.every(board => board.hints?.moves.length), null, { timeout: 20000 });
                await gui.waitForFunction(() => window.AcasInstances?.length === 4, null, { timeout: 20000 });
            }
            if(round === 2) {
                // Stop both unfinished games, then start fresh sessions.
                await page.evaluate(() => Promise.all(window.boards.map(board => board.destroy())));
            } else {
                const scores = await page.evaluate(() => Promise.all(window.boards.map((board, index) =>
                    window.playGame({ frame: board, openingFen: board.position.fen, acasIsWhite: index % 2 === 0,
                        manual: false, signal: AbortSignal.timeout(15000),
                        opponentEngine: { move() { throw new Error('Expected immediate mate'); } } }))));
                assert.deepEqual(scores, [1, 1, 1, 1]);
                await page.evaluate(() => Promise.all(window.boards.map(board => board.destroy())));
            }
            await gui.waitForFunction(() => window.AcasInstances.length === 0);
            assert.equal(await page.locator('.board-session, iframe').count(), 0);
        }
        assert.deepEqual(errors, []);
    } finally {
        await context.unrouteAll({ behavior: 'wait' });
        await context.close();
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('direct hints respect partial, opponent, future and promotion boundaries without losing primary metadata', () => {
    const own = { category: 'move', from: 'g2', to: 'h1', shapeType: 'arrow',
        selection: { profile: 'main', rank: 0, best: true, safe: true } };
    const hints = revealedHints([
        own, { ...own, selection: { ...own.selection, rank: 1, best: false, safe: false } },
        { ...own, from: 'a2', to: 'a3', isOpponent: true },
        { ...own, from: 'b2', to: 'b3', isFuture: true },
        { ...own, from: 'c2', to: 'c3', shapeType: 'rectangle', shapeSquare: 'c2' },
        { ...own, from: 'a7', to: 'a8', playerPromotion: 'n' }
    ]);
    assert.deepEqual(hints.moves, [['g2', 'h1', null], ['a7', 'a8', 'n']]);
    assert.equal(hints.partial, true);
    assert.equal(hints.candidates[0].best, true);
    assert.equal(hints.candidates[0].safe, true);
});
