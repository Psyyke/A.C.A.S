import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';
import { enginePosition } from '../app/assets/js/instance/enginePosition.js';
import { wireComponents } from '../userscript-components/dev/wire-components.mjs';

const source = readFileSync(new URL('../acas.user.js', import.meta.url), 'utf8');
const component = readFileSync(new URL('../userscript-components/BoardChangeParser.js', import.meta.url), 'utf8');
const staged = wireComponents(source, { boardUrl: 'https://update.greasyfork.org/scripts/2/BoardChangeParser.js' });
function declaration(name, code = source) {
    const start = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(code)?.index;
    assert.notEqual(start, undefined, name);
    const end = code.indexOf('\n}', start);
    assert.ok(end > start);
    return code.slice(start, end + 2);
}
const adapterStart = source.indexOf("addSupportedChessSite('lichess.org', {");
const adapterEnd = source.indexOf("\naddSupportedChessSite('playstrategy.org'", adapterStart);
assert.ok(adapterStart >= 0 && adapterEnd > adapterStart);
const harnessBody = `
    const domain = options.conservative ? 'lichess.org' : 'localhost';
    ${component}
    ${['getBoardChangesObjTemplate', 'getFenPieceColor', 'getGameStateObjTemplate', 'getFen',
        'inferCastlingRightsFromFen', 'seedLostCastlingRights', 'updateGameState',
        'determineBoardPositionValidity', 'isPawnOnPromotionSquareFen', 'observeNewMoves',
        'removeTakeback'].map(name => declaration(name)).join('\n')}
    const parser = new BoardChangeParser({ getBoardChangesObjTemplate, getFenPieceColor });
    const boardChangeParser = parser;
    const getBoardChanges = (before, after, turn, context = {}) => parser.getBoardChanges(before, after, turn,
        { conservative: Boolean(options.conservative), ...context, currentTurn: pageTurn });
    const basic = fen => fen.split(' ')[0];
    let snapshot = basic(initialFen), pageTurn = initialFen.split(' ')[1];
    let fenReads = 0, nextReadSnapshot = null;
    let lastAllowedFen = snapshot, lastRejectedFen = '', history = [];
    let gameState = getGameStateObjTemplate();
    const gameStateHistory = { get: () => history, set: value => { history = value || []; } };
    const lastBoardRanks = 8, lastBoardFiles = 8;
    const getBoardMatrix = () => [];
    const getBasicFen = () => {
        fenReads++;
        if(nextReadSnapshot && fenReads === nextReadSnapshot.read) {
            snapshot = basic(nextReadSnapshot.fen);
            nextReadSnapshot = null;
        }
        return snapshot;
    };
    const getPieceAmount = () => (snapshot.replace(/\\[[^\\]]*\\]$/, '').match(/[a-z]/gi) || []).length;
    const getPlayerColor = () => 'w';
    let orientationGate = null;
    const checkBoardOrientationChange = async () => { if(orientationGate) await orientationGate; };
    const getBoardOrientation = () => 'w';
    let storedBoardState = {};
    const getBoardState = () => structuredClone(storedBoardState);
    const setBoardState = changes => Object.assign(storedBoardState, changes);
    const packets = [], resets = [];
    const CommLink = { commands: {
        updateBoardFen: async state => packets.push(structuredClone(state)),
        newMatchStarted: async state => resets.push(structuredClone(state))
    } };
    const published = [], tasks = new Set(), errors = [];
    let processGate = null;
    async function processBoardPosition() {
        published.push(structuredClone(gameState));
        if(processGate) await processGate;
        if(options.productionProcessing) await productionProcessBoardPosition();
    }
    ${declaration('processBoardPosition').replace('async function processBoardPosition(', 'async function productionProcessBoardPosition(')}
    ${declaration('resetStoredMatchVariables')}
    ${declaration('forceUpdateGameState')}
    const clearVisuals = () => {};
    const updateUserscriptDynamicContext = () => {};
    const defaultPosBasicFens = [basic('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')];
    let lastMoveRequestTime = 0, matchFirstSuggestionGiven = false, chesscomVariantPlayerColorsTable = null;
    const modLastEnteredSquare = {}, BoardDrawer = null, modListeners = [true];
    const addMovesOnDemandListeners = () => {};
    function runUserscriptTask(callback) {
        const promise = Promise.resolve().then(callback);
        tasks.add(promise);
        promise.catch(error => errors.push(error)).finally(() => tasks.delete(promise));
    }
    let boardObserver = null, dumbBoardObservingInterval = null, nextTimer = 1;
    let isUserMouseDown = false, lastBoardOrientation = 'w', lastMutationObservationDate = 0;
    const debugModeActivated = false, chessBoardElem = { isConnected: true }, timers = new Map(), observers = [];
    const getBoardElem = () => chessBoardElem;
    const setInterval = callback => { const id = nextTimer++; timers.set(id, callback); return id; };
    const clearInterval = id => timers.delete(id);
    class MutationObserver {
        constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
        observe(element, options) { this.element = element; this.options = options; }
        disconnect() { this.disconnected = true; }
    }
    const supportedSites = {};
    const addSupportedChessSite = (domain, adapter) => { supportedSites[domain] = adapter; };
    const getChessgroundPocket = () => null;
    ${source.slice(adapterStart, adapterEnd)}
    const getSiteData = key => key === 'turn' ? pageTurn : null;
    const isMutationNewMove = mutationArr => supportedSites['lichess.org'].isMutationNewMove({ mutationArr });
    updateGameState(snapshot, getBoardChanges(snapshot, snapshot), true, pageTurn);
    return {
        async check(fen, turn = null) { snapshot = basic(fen); pageTurn = turn; await determineBoardPositionValidity(); },
        start: observeNewMoves,
        set(fen, turn = null) { snapshot = basic(fen); pageTurn = turn; },
        mutate(count = 3) { boardObserver.callback(Array.from({ length: count }, () => ({}))); },
        poll() { for(const callback of [...timers.values()]) callback(); },
        async flush() {
            while(tasks.size) await Promise.allSettled([...tasks]);
            if(errors.length) throw new AggregateError(errors, 'Observer task errors');
        },
        holdProcessing() {
            let release;
            processGate = new Promise(resolve => { release = resolve; });
            return () => { processGate = null; release(); };
        },
        mouseDown(value) { isUserMouseDown = value; },
        detachBoard() { chessBoardElem.isConnected = false; },
        holdOrientation() {
            let release;
            orientationGate = new Promise(resolve => { release = resolve; });
            return () => { orientationGate = null; release(); };
        },
        refresh: forceUpdateGameState,
        changeOnNextFenRead(fen, skip = 0) { nextReadSnapshot = { fen, read: fenReads + skip + 1 }; },
        state() { return { history: structuredClone(history), published: structuredClone(published),
            packets: structuredClone(packets), resets: structuredClone(resets),
            lastAllowedFen, lastRejectedFen, timers: timers.size, observers }; }
    };
`;
const makeHarness = new Function('initialFen', 'options = {}', harnessBody);
const testUserscriptSource = readFileSync(new URL('../acas.user.test.js', import.meta.url), 'utf8');
const makeTestObserverHarness = new Function('initialFen', 'options = {}',
    harnessBody.replace(declaration('observeNewMoves'), declaration('observeNewMoves', testUserscriptSource)));

test('initialization after the first move restores the opening turn and replayable history', () => {
    const chess = new Chess();
    chess.move('e4');
    // A new match starts after its first move is already visible and without turn metadata.
    const restarted = new Function('initialFen', 'options = {}',
        harnessBody.replace('refresh: forceUpdateGameState,', `
            refresh: () => { history = []; gameState = getGameStateObjTemplate(); pageTurn = null; forceUpdateGameState(); },`))(chess.fen());
    restarted.refresh();
    assert.equal(restarted.state().history[0].fen.full, chess.fen());
    assert.equal(restarted.state().history[0].turn, 'b');
    assert.equal(restarted.state().history.length, 2);
});

test('both userscripts share the transient endpoint and opening initialization fixes', () => {
    assert.equal(declaration('forceUpdateGameState', testUserscriptSource), declaration('forceUpdateGameState'));
    assert.equal(declaration('determineBoardPositionValidity', testUserscriptSource), declaration('determineBoardPositionValidity'));
});

test('a fast reply disappearing during our move is not accepted as a capture or a promotion', async () => {
    const fen = 'r2k3r/1b4pp/pq1pRn2/2n5/8/3BBN2/1PP2PPP/3Q1RK1 w - - 1 20';
    const harness = makeHarness(fen);
    await harness.check('r2k3r/6pp/pq1pRn2/2n1N3/8/3BB3/1PP2PPP/3Q1RK1');
    assert.equal(harness.state().history.length, 1, 'Partial Ne5 plus vanished black bishop is not a legal endpoint');
    const chess = new Chess(fen);
    chess.move('Ne5');
    chess.move('Bxg2');
    await harness.check(chess.fen());
    assert.equal(harness.state().history.length, 3);
    assert.equal(harness.state().history[0].fen.basic, basic(chess.fen()));
    assert.equal(harness.state().history[0].turn, 'w');
});

test('en passant waits when the capturing pawn moves before the captured pawn disappears', async () => {
    for(const fen of [
        '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
        '4k3/8/8/8/3Pp3/8/8/4K3 b - d3 0 1'
    ]) {
        const chess = new Chess(fen), harness = makeHarness(fen);
        const move = chess.move(chess.turn() === 'w' ? 'exd6' : 'exd3');
        const partial = new Chess(chess.fen());
        partial.put({ type: 'p', color: move.color === 'w' ? 'b' : 'w' },
            move.color === 'w' ? 'd5' : 'd4');
        await harness.check(partial.fen());
        assert.equal(harness.state().history.length, 1, 'Captured pawn still present: wait');
        await harness.check(chess.fen());
        assert.equal(harness.state().history.length, 2);
        assert.equal(harness.state().history[0].turn, chess.turn());
        assert.equal(harness.state().history[0].fen.basic, basic(chess.fen()));
        assert.equal(harness.state().history[0].boardChanges.isEnPassant, true);
    }
});

test('a pawn move with a disappearing reply is not mistaken for en passant', async () => {
    const fen = '4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1';
    const chess = new Chess(fen), harness = makeHarness(fen);
    chess.move('e4');
    const partial = new Chess(chess.fen());
    partial.remove('d4');
    await harness.check(partial.fen());
    assert.equal(harness.state().history.length, 1);
    chess.move('dxe3');
    await harness.check(chess.fen());
    assert.equal(harness.state().history.length, 3);
    assert.equal(harness.state().history[0].fen.basic, basic(chess.fen()));
    assert.equal(harness.state().history[0].turn, chess.turn());
});

test('game 308 fast Rc1 Bxc1 waits while the rook and replying bishop are absent', async () => {
    const fen = '4k2r/2pq2pp/4p3/p7/3P4/4PQ2/Pr1b1PPP/RN3RK1 w k - 0 17';
    const chess = new Chess(fen), harness = makeHarness(fen);
    chess.move('Rc1');
    const middle = chess.fen();
    chess.move('Bxc1');
    const partial = new Chess(fen);
    partial.remove('f1');
    partial.remove('d2');
    await harness.check(partial.fen());
    assert.equal(harness.state().history.length, 1, 'Two missing pieces are not a completed move');
    await harness.check(chess.fen());
    const history = harness.state().history;
    assert.equal(history.length, 3);
    assert.equal(history[1].fen.basic, basic(middle));
    assert.equal(history[0].fen.basic, basic(chess.fen()));
    assert.equal(history[0].turn, 'w');
    assert.equal(history[0].boardChanges.isPromotion, false);
});

test('game 308 capture also settles when Rc1 was already observed', async () => {
    const chess = new Chess('4k2r/2pq2pp/4p3/p7/3P4/4PQ2/Pr1b1PPP/RN3RK1 w k - 0 17');
    const harness = makeHarness(chess.fen());
    chess.move('Rc1');
    await harness.check(chess.fen());
    const partial = new Chess(chess.fen());
    partial.remove('c1');
    partial.remove('d2');
    await harness.check(partial.fen());
    assert.equal(harness.state().history.length, 2);
    chess.move('Bxc1');
    await harness.check(chess.fen());
    const history = harness.state().history;
    assert.equal(history.length, 3);
    assert.equal(history[0].fen.basic, basic(chess.fen()));
    assert.equal(history[0].turn, 'w');
    assert.equal(history[0].boardChanges.from, 'd2');
    assert.equal(history[0].boardChanges.to, 'c1');
});

test('game 162 Rxd1 Kxd1 ignores incomplete king-capture snapshots', async () => {
    const fen = '3r2k1/1pB2ppp/p1n5/P7/1bn5/2R2NPb/1P2BP1P/3QK2R b K - 2 22';
    const chess = new Chess(fen);
    chess.move('Rxd1+');
    const middle = chess.fen();
    chess.move('Kxd1');
    const failures = [];
    for(const d8 of [null, { type: 'r', color: 'b' }]) {
        for(const d1 of [null, ...['Q', 'r', 'K'].map(piece => ({
            type: piece.toLowerCase(), color: piece === 'r' ? 'b' : 'w'
        }))]) {
            for(const e1 of [null, { type: 'k', color: 'w' }]) {
                const partial = new Chess(fen);
                for(const [square, piece] of [['d8', d8], ['d1', d1], ['e1', e1]]) {
                    partial.remove(square);
                    if(piece) partial.put(piece, square);
                }
                const position = basic(partial.fen());
                if([fen, middle, chess.fen()].map(basic).includes(position)) continue;
                const harness = makeHarness(fen);
                await harness.check(position);
                if(harness.state().history.length !== 1) failures.push(position);
                await harness.check(chess.fen());
                if(harness.state().history[0].turn !== 'b' ||
                    harness.state().history[0].fen.basic !== basic(chess.fen())) failures.push(`endpoint: ${position}`);
            }
        }
    }
    assert.deepEqual(failures, []);
});

test('game 66 castling and fast pawn captures do not poison subsequent Kb1 tracking', async () => {
    const fen = 'r2q1rk1/2p1bpp1/2Q2n1p/1BP5/p2pP3/1P3P2/PB3P1P/R3K2R w KQ - 0 17';
    const chess = new Chess(fen);
    chess.move('O-O-O');
    const castled = chess.fen();
    chess.move('axb3');
    const captured = chess.fen();
    chess.move('Kb1');
    chess.move('bxa2+');
    const partial = new Chess(castled);
    partial.remove('a4');
    const harness = makeHarness(fen);
    await harness.check(partial.fen());
    assert.equal(harness.state().history.length, 1);
    await harness.check(captured);
    assert.equal(harness.state().history[0].turn, 'w');
    await harness.check(chess.fen());
    assert.equal(harness.state().history[0].fen.basic, basic(chess.fen()));
    assert.equal(harness.state().history[0].turn, 'w');
});

test('a reused board reset after its first opening move is not rejected as an unresolved gap', async () => {
    const fen = '8/8/8/3K4/4N3/8/3Q4/3k4 b - - 10 73';
    const harness = makeHarness(fen, { productionProcessing: true });
    const chess = new Chess();
    chess.move('e4');
    await harness.check(chess.fen());
    const state = harness.state();
    assert.equal(state.resets.length, 1);
    assert.equal(state.history[0].fen.full, chess.fen());
    assert.equal(state.history[0].turn, 'b');
    assert.equal(state.lastAllowedFen, basic(chess.fen()));
    chess.move('e5');
    await harness.check(chess.fen());
    assert.equal(harness.state().history[0].turn, 'w');
});

test('en passant survives both pawns disappearing before the capturing pawn arrives', async () => {
    for(const [fen, opening] of [
        ['4k3/3p4/8/4P3/8/8/8/4K3 w - - 0 1', ['Ke2', 'd5']],
        ['4k3/8/8/8/4p3/8/3P4/4K3 w - - 0 1', ['d4']]
    ]) {
        const chess = new Chess(fen), harness = makeHarness(fen);
        for(const move of opening) {
            chess.move(move);
            await harness.check(chess.fen());
        }
        const initialLength = harness.state().history.length;
        const middle = chess.fen();
        const move = chess.move(chess.turn() === 'w' ? 'exd6' : 'exd3');
        const partial = new Chess(chess.fen());
        partial.remove(move.to);
        await harness.check(partial.fen());
        assert.equal(harness.state().history.length, initialLength, 'Both pawns absent: wait');
        await harness.check(chess.fen());
        const history = harness.state().history;
        assert.equal(history.length, initialLength + 1);
        assert.equal(history[1].fen.full, middle);
        assert.equal(history[0].fen.full, chess.fen());
        assert.equal(history[0].boardChanges.isEnPassant, true);
        assert.doesNotThrow(() => enginePosition(chess.fen(), [...history].reverse()));
    }
});
const makeTakebackHarness = new Function('initialFen', 'options = {}',
    // Exercise the staged production observer/state functions, not a copied undo path.
    harnessBody
        .replace(declaration('determineBoardPositionValidity'), declaration('determineBoardPositionValidity', staged))
        .replace(declaration('updateGameState'), declaration('updateGameState', staged))
        .replace(declaration('removeTakeback'), declaration('removeTakeback', staged))
        .replace("pageTurn = initialFen.split(' ')[1];", "pageTurn = initialFen.split(' ')[1];\n    let pagePly = options.initialPly;")
        .replace("key === 'turn' ? pageTurn : null", "key === 'turn' ? pageTurn : key === 'ply' ? pagePly : null")
        .replace('async check(fen, turn = null) {', 'async check(fen, turn = null, ply = undefined) { pagePly = ply;'));
const basic = fen => fen.split(' ')[0];

test('staged production takeback handling restores history before diffing and preserves repetitions', async () => {
    const chess = new Chess(), harness = makeTakebackHarness(chess.fen(), {
        productionProcessing: true, conservative: true, initialPly: 0
    });
    const moves = ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'];
    const positions = [chess.fen()];
    for(let ply = 1; ply <= moves.length; ply++) {
        chess.move(moves[ply - 1]); positions.push(chess.fen());
        await harness.check(chess.fen(), chess.turn(), ply);
        assert.equal(harness.state().history.length, ply + 1);
        assert.equal(harness.state().history[0].observedPly, ply);
    }
    // Undo four plies to an identical placement: this must run before the
    // unchanged-placement fast path, and must choose ply 4 rather than ply 0.
    const resets = harness.state().resets.length;
    await harness.check(positions[4], 'w', 4);
    let state = harness.state();
    assert.equal(state.history.length, 5);
    assert.equal(state.history[0].fen.full, positions[4]);
    assert.equal(state.history[0].opponentMoveTime, null);
    assert.equal(state.resets.length, resets);
    assert.doesNotThrow(() => enginePosition(positions[4], [...state.history].reverse()));
    await harness.check(positions[4], 'w', 4);
    assert.deepEqual(harness.state().history, state.history);
    await harness.check(positions[5], 'b', 5);
    state = harness.state();
    assert.equal(state.history.length, 6);
    assert.equal(state.history[0].fen.full, positions[5]);
    await harness.check(positions[0], 'w', 0);
    state = harness.state();
    assert.equal(state.history.length, 1);
    assert.equal(state.history[0].fen.full, positions[0]);
    assert.equal(state.history[0].observedPly, 0);
});

test('staged repetitions without any ply metadata neither undo nor reset the match', async () => {
    const chess = new Chess(), harness = makeTakebackHarness(chess.fen(), {
        productionProcessing: true, conservative: true
    });

    for(let ply = 1; ply <= 80; ply++) {
        const san = ['Nf3', 'Nf6', 'Ng1', 'Ng8'][(ply - 1) % 4];
        chess.move(san);
        await harness.check(chess.fen(), chess.turn());
        const state = harness.state();
        assert.equal(state.history.length, ply + 1);
        assert.equal(state.resets.length, 0);
        assert.equal(state.history[0].fen.full, chess.fen());
    }
    const state = harness.state();
    assert.doesNotThrow(() => enginePosition(chess.fen(), [...state.history].reverse()));
});

test('a recovered two-ply burst keeps the real endpoint anchor, not a fabricated intermediate anchor', async () => {
    const chess = new Chess(), initial = chess.fen();
    const harness = makeTakebackHarness(initial, {
        productionProcessing: true, conservative: true, initialPly: 0
    });
    chess.move('e4'); chess.move('d5');
    await harness.check(chess.fen(), chess.turn(), 2);
    let history = harness.state().history;
    assert.equal(history.length, 3);
    assert.equal(history[0].observedPly, 2);
    assert.equal(history[1].observedPly, undefined);
    assert.equal(history[0].turnStartedByMove, false);
    await harness.check(initial, 'w', 0);
    history = harness.state().history;
    assert.equal(history.length, 1);
    assert.equal(history[0].fen.full, initial);
    assert.equal(history[0].historyIncomplete, false);
});

test('staged castling takebacks restore rights used by subsequent moves, not just the displayed FEN', async () => {
    const initial = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const chess = new Chess(initial), harness = makeTakebackHarness(initial, {
        productionProcessing: true, conservative: true, initialPly: 0
    });
    chess.move('O-O'); await harness.check(chess.fen(), chess.turn(), 1);
    chess.move('O-O-O'); await harness.check(chess.fen(), chess.turn(), 2);
    await harness.check(initial, 'w', 0);
    assert.equal(harness.state().history[0].fen.full, initial);
    const branch = new Chess(initial);
    branch.move('O-O-O');
    await harness.check(branch.fen(), branch.turn(), 1);
    assert.equal(harness.state().history[0].fen.full, branch.fen());
    branch.move('O-O');
    await harness.check(branch.fen(), branch.turn(), 2);
    const history = harness.state().history;
    assert.equal(history[0].fen.full, branch.fen());
    assert.doesNotThrow(() => enginePosition(branch.fen(), [...history].reverse()));
});

test('real state management stores both skipped plies, clocks, rights and intermediate turn', async () => {
    for(const [fen, moves] of [
        [new Chess().fen(), ['e4', 'e5']],
        ['4k3/8/2p5/3p4/4P3/8/8/4K3 w - - 0 1', ['exd5', 'cxd5']],
        ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['O-O', 'O-O-O']],
        ['4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1', ['e4', 'dxe3']]
    ]) {
        const chess = new Chess(fen), harness = makeHarness(fen);
        chess.move(moves[0]); const middle = chess.fen();
        chess.move(moves[1]); const after = chess.fen();
        await harness.check(after, 'w');
        const { history, published, lastAllowedFen } = harness.state();
        assert.equal(history.length, 3);
        assert.equal(history[1].fen.full, middle);
        assert.equal(history[0].fen.full, after);
        assert.equal(history[1].turn, middle.split(' ')[1]);
        assert.equal(history[0].turn, after.split(' ')[1]);
        assert.equal(history[0].turnStartedByMove, false);
        assert.equal(history[1].turnStartedByMove, false);
        assert.equal(history[0].opponentMoveTime, null);
        assert.equal(published.length, 1);
        assert.equal(lastAllowedFen, basic(after));
        await harness.check(after);
        assert.equal(harness.state().history.length, 3);
        assert.equal(harness.state().published.length, 1);
    }
});

test('a single en passant must not add an extra invented history entry', async () => {
    const fen = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1';
    const harness = makeHarness(fen), chess = new Chess(fen);
    chess.move('exd6');
    await harness.check(chess.fen());
    const { history } = harness.state();
    assert.equal(history.length, 2);
    assert.equal(history[0].boardChanges.isEnPassant, true);
    assert.equal(history[0].boardChanges.missedFen, null);
    assert.equal(history[0].turn, 'b');
    assert.equal(history[0].halfmoveClock, 0);
    assert.equal(history[0].isCapture, true);
});

test('promotion chooser and one-piece disappearance are retried only after the board settles', async () => {
    const harness = makeHarness('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    for(const transient of ['P3k3/8/8/8/8/8/8/4K3', '4k3/8/8/8/8/8/8/4K3']) {
        await harness.check(transient);
        assert.equal(harness.state().history.length, 1);
        assert.equal(harness.state().lastRejectedFen, transient);
    }
    const settled = 'Q3k3/8/8/8/8/8/8/4K3';
    await harness.check(settled);
    const { history, lastRejectedFen } = harness.state();
    assert.equal(history.length, 2);
    assert.equal(history[0].boardChanges.promotionPiece, 'Q');
    assert.equal(history[0].turn, 'b');
    assert.equal(lastRejectedFen, '');
});

test('reserve-only settling replaces a snapshot without inventing a ply', async () => {
    const harness = makeHarness('4k3/8/8/8/8/8/8/4K3[N] w - - 0 1');
    await harness.check('4k3/8/8/8/8/8/8/4K3[NN]', 'w');
    const { history } = harness.state();
    assert.equal(history.length, 1);
    assert.equal(history[0].plyCount, 0);
    assert.equal(history[0].fen.basic, '4k3/8/8/8/8/8/8/4K3[NN]');
});

test('Lichess mutation batches and the fallback poll process once and disconnect old observers', async () => {
    const chess = new Chess(), harness = makeHarness(chess.fen());
    harness.start();
    chess.move('e4'); harness.set(chess.fen());
    harness.mutate(2); await harness.flush();
    assert.equal(harness.state().history.length, 1);
    harness.poll(); await harness.flush();
    assert.equal(harness.state().history.length, 2);
    for(let i = 0; i < 100; i++) harness.mutate();
    await harness.flush();
    assert.equal(harness.state().published.length, 1);
    harness.start();
    assert.equal(harness.state().timers, 1);
    assert.equal(harness.state().observers[0].disconnected, true);
    assert.equal(harness.state().observers[1].element, harness.state().observers[0].element);
    assert.deepEqual(harness.state().observers[1].options, { childList: true, subtree: true, attributes: true });
    chess.move('e5'); harness.set(chess.fen()); harness.mutate(); await harness.flush();
    assert.equal(harness.state().history.length, 3);
});

for(const [name, create] of [['main', makeHarness], ['test', makeTestObserverHarness]]) {
test(`${name} userscript mutations during an in-flight publish drain immediately without concurrent processing or a poll`, async () => {
    const chess = new Chess(), harness = create(chess.fen());
    harness.start();
    const release = harness.holdProcessing();
    chess.move('e4');
    harness.set(chess.fen()); harness.mutate();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(harness.state().published.length, 1);
    chess.move('e5'); const second = basic(chess.fen());
    harness.set(chess.fen()); harness.mutate();
    for(let i = 0; i < 100; i++) harness.mutate();
    release(); await harness.flush();
    assert.equal(harness.state().lastAllowedFen, second);
    assert.equal(harness.state().history.length, 3);
    assert.equal(harness.state().published.length, 2);
});
}

test('polling pauses during dragging and empty board teardown does not create retry timers', async () => {
    const chess = new Chess(), harness = makeHarness(chess.fen());
    harness.start(); harness.mouseDown(true);
    chess.move('d4'); harness.set(chess.fen()); harness.poll(); await harness.flush();
    assert.equal(harness.state().history.length, 1);
    harness.mouseDown(false); harness.poll(); await harness.flush();
    assert.equal(harness.state().history.length, 2);
    harness.set('8/8/8/8/8/8/8/8'); harness.mutate(); await harness.flush();
    assert.equal(harness.state().history.length, 0);
    assert.equal(harness.state().timers, 1);
});

test('whole game traces retain every observed/reconstructed ply, full FEN and legally replayable engine history', async t => {
    let snapshots = 0, skipped = 0;
    for(let seed = 1; seed <= 30; seed++) {
        const chess = new Chess(), harness = makeHarness(chess.fen(), { productionProcessing: true });
        const expected = [chess.fen()], moves = [];
        let state = seed;
        harness.start();
        for(let ply = 0; ply < 80; ply++) {
            const legal = chess.moves();
            if(!legal.length) break;
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            const move = chess.move(legal[Math.floor(state / 0x100000000 * legal.length)]);
            assert.ok(move);
            expected.push(chess.fen());
            moves.push(move);
            // Mix delayed polls, immediate mutation batches, duplicates and
            // complete one-move gaps; never manufacture partial DOM snapshots.
            if(ply % 9 === 2 && chess.moves().length && ply < 79) { skipped++; continue; }
            harness.set(chess.fen(), move.color); // Deliberately stale page turn.
            if(ply % 3) harness.mutate(3);
            else { harness.mutate(1); harness.poll(); }
            await harness.flush();
            const observed = harness.state();
            const chronological = [...observed.history].reverse();
            assert.deepEqual(chronological.map(entry => entry.fen.full), expected, `game ${seed}, ply ${ply + 1}`);
            for(let index = 1; index < chronological.length; index++) {
                const change = chronological[index].boardChanges, actualMove = moves[index - 1];
                assert.equal(change.from, actualMove.from);
                assert.equal(change.to, actualMove.to);
                assert.equal(change.promotionPiece?.toLowerCase() || undefined, actualMove.promotion);
                assert.equal(chronological[index].plyCount, index);
            }
            assert.equal(observed.lastAllowedFen, basic(chess.fen()));
            assert.equal(observed.packets.at(-1).fen, chess.fen());
            assert.equal(observed.packets.at(-1).turn, chess.turn());
            assert.equal(observed.resets.length, 0, 'A complete orthodox game must not be reset mid-match');
            snapshots++;
            harness.mutate(5); harness.poll(); await harness.flush();
            assert.equal(harness.state().history.length, expected.length, 'Duplicate observations must not add plies');
        }
        const history = [...harness.state().history].reverse();
        const command = enginePosition(chess.fen(), history);
        const replay = new Chess(history[0].fen.full);
        for(const entry of history.slice(1)) {
            const change = entry.boardChanges;
            assert.ok(replay.move({ from: change.from, to: change.to, promotion: change.promotionPiece?.toLowerCase() }));
            assert.equal(replay.fen(), entry.fen.full);
        }
        assert.equal(replay.fen(), chess.fen());
        assert.equal(history.length, moves.length + 1);
        assert.match(command, /^position fen .+ moves /);
        assert.equal(command.split(' moves ')[1],
            moves.map(move => move.from + move.to + (move.promotion || '')).join(' '));
    }
    t.diagnostic(`${snapshots} complete observations, ${skipped} hidden plies; full FEN/history/engine replay verified`);
});

test('finished games publish exact terminal FENs and export the original complete PGN', async () => {
    for(const sans of [
        ['f3', 'e5', 'g4', 'Qh4#'],
        ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']
    ]) {
        const chess = new Chess(), harness = makeHarness(chess.fen(), { productionProcessing: true });
        for(let index = 0; index < sans.length; index++) {
            assert.ok(chess.move(sans[index]));
            if(index === 0) continue;
            await harness.check(chess.fen());
        }
        assert.ok(chess.in_checkmate());
        const { history, packets } = harness.state();
        const chronological = [...history].reverse(), replay = new Chess(chronological[0].fen.full);
        for(const entry of chronological.slice(1)) {
            const change = entry.boardChanges;
            assert.ok(replay.move({ from: change.from, to: change.to, promotion: change.promotionPiece?.toLowerCase() }));
        }
        assert.equal(packets.at(-1).fen, chess.fen());
        assert.equal(replay.pgn(), chess.pgn());
        assert.ok(enginePosition(chess.fen(), chronological).endsWith(
            chronological.slice(1).map(entry => entry.boardChanges.from + entry.boardChanges.to).join(' ')));
    }
});

test('three-to-five-ply observation bursts retain the live board, deduplicate repeats and resume tracking', async t => {
    let bursts = 0, incompleteHistories = 0, newMatchClassifications = 0;
    for(const span of [3, 4, 5]) {
        for(const offset of [0, 1]) {
            const chess = new Chess(), harness = makeHarness(chess.fen(), { productionProcessing: true });
            const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'd6', 'O-O', 'Nf6'];
            for(let index = 0; index < offset; index++) {
                assert.ok(chess.move(moves[index]));
                await harness.check(chess.fen(), chess.turn());
            }
            for(let index = offset; index < offset + span; index++) assert.ok(chess.move(moves[index]));
            await harness.check(chess.fen(), chess.turn());
            const burst = harness.state();
            assert.equal(burst.history[0].fen.basic, basic(chess.fen()));
            assert.equal(burst.history[0].turn, chess.turn());
            assert.equal(basic(burst.packets.at(-1).fen), basic(chess.fen()));
            assert.equal(burst.lastAllowedFen, basic(chess.fen()));
            const shouldReset = burst.published.at(-1).boardChanges.changedSquaresAmount > 6;
            assert.equal(burst.resets.length, Number(shouldReset));
            if(shouldReset) newMatchClassifications++;
            for(let repeat = 0; repeat < 20; repeat++) await harness.check(chess.fen(), chess.turn());
            assert.deepEqual(harness.state().history, burst.history);
            assert.equal(harness.state().packets.length, burst.packets.length);
            // End placement can be tracked without knowing every hidden ply.
            // The engine-history validator must not certify that as an exact game.
            const chronological = [...burst.history].reverse();
            if(!shouldReset) {
                assert.throws(() => enginePosition(burst.history[0].fen.full, chronological),
                    /Move history cannot be legally replayed/);
                incompleteHistories++;
            } else {
                // Existing >6-square new-match heuristic discards the old
                // history on a large legal burst; this is not exact recovery.
                assert.equal(chronological.length, 1);
                assert.equal(enginePosition(burst.history[0].fen.full, chronological),
                    `position fen ${burst.history[0].fen.full}`);
            }
            assert.ok(chess.move(moves[offset + span]));
            await harness.check(chess.fen(), chess.turn());
            const resumed = harness.state();
            assert.equal(resumed.history[0].fen.basic, basic(chess.fen()));
            assert.equal(resumed.history[0].turn, chess.turn());
            assert.equal(resumed.history[0].boardChanges.to, chess.history({ verbose: true }).at(-1).to);
            assert.equal(resumed.packets.length, burst.packets.length + 1);
            bursts++;
        }
    }
    t.diagnostic(`${bursts} multi-missed bursts tracked live; ${incompleteHistories} incomplete histories rejected by replay validation; ${newMatchClassifications} bursts hit the existing >6-square new-match heuristic (known limitation)`);
});

test('a changing DOM cannot replace the snapshot whose move metadata was just computed', async () => {
    const chess = new Chess(), harness = makeHarness(chess.fen(), { productionProcessing: true });
    chess.move('e4'); const first = chess.fen();
    chess.move('e5'); const second = chess.fen();
    harness.changeOnNextFenRead(second, 1);
    await harness.check(first);
    const { history, packets, lastAllowedFen } = harness.state();
    assert.equal(history[0].fen.full, first);
    assert.equal(history[0].boardChanges.from, 'e2');
    assert.equal(history[0].boardChanges.to, 'e4');
    assert.equal(packets[0].fen, first);
    assert.equal(lastAllowedFen, basic(first));
});

test('conservative gaps preserve the match, mark incomplete history and resume without inventing timing samples', async () => {
    for(const span of [3, 4, 5]) {
        const chess = new Chess(), harness = makeHarness(chess.fen(), {
            productionProcessing: true, conservative: true
        });

        const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'];
        for(const san of moves.slice(0, span)) assert.ok(chess.move(san));
        await harness.check(chess.fen(), chess.turn());
        const burst = harness.state();
        assert.equal(burst.history.length, 2);
        assert.equal(burst.resets.length, 0);
        assert.equal(burst.history[0].historyIncomplete, true);
        assert.equal(burst.history[0].boardChanges.recovery.status, 'unresolved');
        assert.equal(burst.history[0].turnStartedByMove, false);
        assert.equal(burst.history[0].opponentMoveTime, null);
        assert.equal(burst.history[0].turn, chess.turn());
        assert.throws(() => enginePosition(burst.history[0].fen.full, [...burst.history].reverse()), /unresolved observation gap/);
        await harness.check(chess.fen(), chess.turn());
        assert.deepEqual(harness.state().history, burst.history);
        assert.ok(chess.move(moves[span]));
        await harness.check(chess.fen(), chess.turn());
        const resumed = harness.state();
        assert.equal(resumed.history[0].historyIncomplete, true);
        assert.equal(resumed.history[0].fen.basic, basic(chess.fen()));
        assert.equal(resumed.history[0].turn, chess.turn());
        assert.equal(resumed.resets.length, 0);
    }
});

test('conservative single-move processing retains inferred turn when the page clock lags behind', async () => {
    const chess = new Chess(), harness = makeHarness(chess.fen(), { conservative: true });
    chess.move('e4');
    await harness.check(chess.fen(), 'w');
    const state = harness.state().history[0];
    assert.equal(state.turn, 'b');
    assert.equal(state.historyIncomplete, false);
    assert.equal(state.fen.full, chess.fen());
});

test('conservative gap handling still recognizes a genuine reset to the standard start position', async () => {
    const chess = new Chess(), initial = chess.fen();
    const harness = makeHarness(initial, { productionProcessing: true, conservative: true });
    for(const san of ['e4', 'e5', 'Nf3', 'Nc6']) chess.move(san);
    await harness.check(chess.fen(), chess.turn());
    assert.equal(harness.state().history[0].historyIncomplete, true);
    await harness.check(initial, 'w');
    const state = harness.state();
    assert.equal(state.resets.length, 1);
    assert.equal(state.history.length, 1);
    assert.equal(state.history[0].historyIncomplete, false);
    assert.equal(state.history[0].fen.basic, basic(initial));
    const sparse = makeHarness('4k3/8/8/8/8/8/P7/4K3 w - - 0 1',
        { productionProcessing: true, conservative: true });
    const custom = new Chess();
    custom.move('e4');
    await sparse.check(custom.fen(), custom.turn());
    assert.equal(sparse.state().resets.length, 1, 'material increases still recognize new custom positions');
    assert.equal(sparse.state().history[0].historyIncomplete, false);
});

test('forcing an unchanged refresh must not invent another move or reset the en-passant target', async () => {
    const chess = new Chess(), harness = makeHarness(chess.fen());
    chess.move('e4');
    await harness.check(chess.fen());
    const previous = harness.state().history;
    harness.refresh();
    const current = harness.state().history;
    assert.deepEqual(current, previous);
});

test('shared endpoint validation rejects a duplicate pawn and then accepts the settled move', async () => {
    const chess = new Chess(), harness = makeHarness(chess.fen());
    // Destination appears while the original source is still present.
    const duplicatePawn = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPPPPPP/RNBQKBNR';
    await harness.check(duplicatePawn);
    assert.equal(harness.state().history.length, 1);
    assert.equal(harness.state().history[0].fen.basic, basic(chess.fen()));
    chess.move('e4');
    await harness.check(chess.fen());
    assert.equal(harness.state().history.length, 2);
    assert.equal(harness.state().history[0].fen.full, chess.fen());
});

test('partial frames across normal moves, captures, promotions and castling only publish legal endpoints', async t => {
    let frames = 0;
    for(const [fen, san] of [
        [new Chess().fen(), 'e4'], [new Chess().fen(), 'Nf3'],
        ['4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'exd5'],
        ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'exd6'],
        ['4k3/8/8/8/3Pp3/8/8/4K3 b - d3 0 1', 'exd3'],
        ['4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a8=Q+'],
        ['1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'axb8=N'],
        ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'O-O'],
        ['r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'O-O-O']
    ]) {
        const chess = new Chess(fen), settled = new Chess(fen);
        settled.move(san);
        const expand = value => basic(value).split('/').flatMap(row =>
            [...row].flatMap(piece => /\d/.test(piece) ? Array(Number(piece)).fill('') : [piece]));
        const encode = cells => Array.from({ length: 8 }, (_, row) => cells.slice(row * 8, row * 8 + 8)
            .map(piece => piece || '1').join('').replace(/1+/g, empty => String(empty.length))).join('/');
        const before = expand(fen), after = expand(settled.fen());
        const changed = before.map((piece, index) => piece !== after[index] ? index : -1).filter(index => index >= 0);
        const legalEndpoints = new Set(chess.moves().map(move => {
            const candidate = new Chess(fen);
            candidate.move(move);
            return basic(candidate.fen());
        }));
        const candidates = [before];
        for(const index of changed) {
            const previous = candidates.splice(0);
            for(const cells of previous) {
                for(const piece of new Set([before[index], after[index], ''])) {
                    const next = [...cells];
                    next[index] = piece;
                    candidates.push(next);
                }
            }
        }
        for(const cells of candidates) {
            const partial = encode(cells), harness = makeHarness(fen);
            await harness.check(partial);
            if(harness.state().history.length > 1) {
                assert.ok(legalEndpoints.has(partial), `${san} accepted illegal frame ${partial}`);
            } else {
                await harness.check(settled.fen());
                assert.equal(harness.state().history[0].fen.basic, basic(settled.fen()));
                assert.equal(harness.state().history[0].turn, settled.turn());
            }
            frames++;
        }
    }
    t.diagnostic(`${frames} independently staged piece-arrival/removal frames checked`);
});

test('mid-game initialization cannot recover historical FEN fields from placement alone', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b - - 17 42';
    const harness = makeHarness(fen);
    const initial = harness.state().history[0].fen.full;
    assert.equal(basic(initial), basic(fen));
    assert.equal(initial.split(' ')[1], 'b');
    assert.equal(initial.split(' ')[2], 'KQkq'); // Placement allows rights; history may not.
    assert.equal(initial.split(' ')[4], '0');
    assert.equal(initial.split(' ')[5], '1');
});

test('a board detached during an awaited orientation check cannot append or publish a position', async () => {
    const chess = new Chess(), harness = makeHarness(chess.fen(), { productionProcessing: true });
    const original = harness.state().history;
    chess.move('e4');
    const release = harness.holdOrientation();
    const pending = harness.check(chess.fen());
    harness.detachBoard();
    release();
    await pending;
    const { history, packets, published } = harness.state();
    assert.deepEqual(history, original);
    assert.equal(packets.length, 0);
    assert.equal(published.length, 0);
});
