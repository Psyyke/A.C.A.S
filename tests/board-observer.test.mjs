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
    const getBoardChanges = (before, after, turn) => parser.getBoardChanges(before, after, turn,
        options.conservative ? { conservative: true, currentTurn: pageTurn } : {});
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

test('mutations during an in-flight publish settle on the next poll without concurrent processing', async () => {
    const chess = new Chess(), harness = makeHarness(chess.fen());
    harness.start();
    const release = harness.holdProcessing();
    chess.move('e4'); const first = basic(chess.fen());
    harness.set(chess.fen()); harness.mutate();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(harness.state().published.length, 1);
    chess.move('e5'); const second = basic(chess.fen());
    harness.set(chess.fen()); harness.mutate();
    release(); await harness.flush();
    assert.equal(harness.state().lastAllowedFen, first);
    harness.poll(); await harness.flush();
    assert.equal(harness.state().lastAllowedFen, second);
    assert.equal(harness.state().history.length, 3);
    assert.equal(harness.state().published.length, 2);
});

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

test('current validation has narrow transient guards, not full orthodox legality validation', async () => {
    const chess = new Chess(), harness = makeHarness(chess.fen());
    // Destination appears while the original source is still present.
    const duplicatePawn = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPPPPPP/RNBQKBNR';
    await harness.check(duplicatePawn);
    assert.equal(harness.state().history[0].fen.basic, duplicatePawn);
    assert.equal(harness.state().history[0].boardChanges.pieceAmountChange, 1);
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
