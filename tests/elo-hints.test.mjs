import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { selectHintMove, defaultSelectionWeights, validateSelectionWeights, rebalanceSelectionWeights } from '../tools/eloeye/hintSelection.js';
import { moveSelection } from '../app/assets/js/misc/moveSelection.js';
import { BoardSession } from '../tools/eloeye/boardSession.js';
import { TimeoutError, placementOf, revealedHints } from '../tools/eloeye/sessionProtocol.js';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';

const moves = ['e2e4', 'd2d4', 'a2a3'].map(uci => ({ from: uci.slice(0, 2), to: uci.slice(2), promotion: 'q' }));
const candidates = moves.map((move, rank) => ({
    move: [move.from, move.to, null], profile: 'main', rank, best: rank === 0, safe: rank < 2
}));

test('game setup delivers its opening before waiting for a GUI connection', async () => {
    const source = await readFile(new URL('../tools/eloeye/eloPlayer.js', import.meta.url), 'utf8');
    const start = source.indexOf('export async function playGame(');
    const end = source.indexOf('// Works out whether', start);
    const play = vm.runInNewContext(source.slice(start, end).replace('export async', 'async') + '; playGame',
        { timings: { connectTimeoutMs: 20000 }, destsOf: () => ({}), defaultSelectionWeights });
    let position;
    const chess = { fen: () => 'custom opening', turn: () => 'b', game_over: () => true, in_checkmate: () => false };
    const frame = {
        statuses: new Set(['connected']), whenReady: async () => {},
        setPosition: value => { position = value; },
        waitFor: async predicate => {
            assert.equal(position.fen, chess.fen());
            assert.equal(position.turn, 'b');
            assert.equal(predicate(), true);
        }
    };
    assert.equal(await play({ frame, chess, acasIsWhite: false, manual: false }), 0.5);
});

async function hintWaitHarness({ collectMs = 5, timeout = 100 } = {}) {
    const source = await readFile(new URL('../tools/eloeye/eloPlayer.js', import.meta.url), 'utf8');
    const sleep = source.slice(source.indexOf('const sleep = '), source.indexOf('\nconst withTimeout'));
    const selection = source.slice(source.indexOf('const legalMatch = '), source.indexOf('\nasync function humanMove'));
    const frame = Object.assign(Object.create(BoardSession.prototype), {
        watchers: new Set(), hints: null, analysis: { profiles: ['main'], completed: ['main'] }
    });
    const chess = new Chess(), controller = new AbortController();
    const context = {
        setTimeout, clearTimeout, Date, TimeoutError, placementOf, selectHintMove, defaultSelectionWeights,
        timings: { collectMs, openingTimeoutMs: timeout, moveTimeoutMs: timeout },
        console: { warn() { throw new Error('Tests must send ranked hints'); } }
    };
    const choose = vm.runInNewContext(`
        class SetupError extends Error {
            constructor(code) { super(code); this.name = 'SetupError'; this.code = code; }
        }
        ${sleep}
        ${selection}
        acasMove`, context);
    return {
        frame, controller,
        choose: (weights = defaultSelectionWeights, onFallback) => choose(frame, chess, controller.signal, weights, onFallback),
        send(candidates, hintedMoves = [['e2', 'e4', null]], fen = chess.fen()) {
            frame.hints = { fen, moves: hintedMoves, candidates };
            for(const check of [...frame.watchers]) check();
        }
    };
}

test('a warning-only batch does not stop the run before a later profile supplies the approved best', async () => {
    const harness = await hintWaitHarness();
    harness.frame.analysis.completed = [];
    harness.send([{ ...candidates[0], best: false, safe: false }]);
    const pending = harness.choose();
    setTimeout(() => {
        harness.frame.analysis.completed = ['main'];
        harness.send([candidates[0]]);
    }, 30);
    assert.equal((await pending).from, 'e2');
    assert.equal(harness.frame.watchers.size, 0);
});

test('withdrawn markings during the collection window wait for replacement instead of stopping the match', async () => {
    const harness = await hintWaitHarness({ collectMs: 20 });
    harness.send([candidates[0]]);
    const pending = harness.choose();
    setTimeout(() => harness.send([], []), 5);
    setTimeout(() => harness.send([candidates[0]]), 40);
    assert.equal((await pending).to, 'e4');
});

test('fallback still excludes stale illegal suggestions', async () => {
    const harness = await hintWaitHarness();
    harness.send([{ ...candidates[0], move: ['h1', 'h8'] }, { ...candidates[1], safe: false }],
        [['h1', 'h8', null], ['d2', 'd4', null]]);
    let warned = false;
    const weights = { ...defaultSelectionWeights, best: 100, alternative: 0 };
    assert.equal((await harness.choose(weights, () => { warned = true; })).from, 'd2');
    assert.equal(warned, true);
});

test('unavailable requested categories use a shown move and explicitly notify the caller', async () => {
    const harness = await hintWaitHarness({ timeout: 50 });
    harness.send([{ ...candidates[0], best: false, safe: false }]);
    let warnings = 0;
    const weights = { ...defaultSelectionWeights, best: 100, alternative: 0 };
    assert.equal((await harness.choose(weights, () => warnings++)).from, 'e2');
    assert.equal(warnings, 1);
    assert.equal(harness.frame.watchers.size, 0);
});

test('aborting while unsafe suggestions are pending retains the abort reason and removes listeners', async () => {
    const harness = await hintWaitHarness();
    harness.frame.analysis.completed = [];
    harness.send([{ ...candidates[0], best: false, safe: false }]);
    const pending = harness.choose(), reason = new Error('Stopped by user');
    harness.controller.abort(reason);
    await assert.rejects(pending, error => error === reason);
    assert.equal(harness.frame.watchers.size, 0);
});

test('simple mix gives best 90% and includes every kind of alternative', () => {
    const counts = [0, 0, 0];
    for(let i = 0; i < 1000; i++) {
        const draws = [i / 1000, i % 2 ? 0.9 : 0.1];
        const { move } = selectHintMove(moves, candidates, () => draws.shift());
        counts[moves.indexOf(move)]++;
    }
    assert.deepEqual(counts, [900, 50, 50]);
});

test('all profiles contribute, duplicate moves count once and conflicting labels are conservative', () => {
    const other = { ...candidates[2], profile: 'other', safe: true, best: true };
    assert.equal(selectHintMove(moves, [...candidates.slice(0, 2), other], () => 0.5).move, moves[2]);
    assert.equal(selectHintMove(moves, [...candidates, other], () => 0.99).category, 'alternative',
        'An unclassified label from another profile belongs to the alternative pool');
    assert.equal(selectHintMove(moves, [candidates[0], { ...candidates[1], safe: false }], () => 0.99).move, moves[1]);
    assert.equal(selectHintMove(moves, [candidates[0], candidates[0]], () => 0.99).move, moves[0]);
});

test('warning-only metadata is an alternative and legacy senders are explicitly identified', () => {
    assert.equal(selectHintMove(moves, [{ ...candidates[0], best: false, safe: false }]).category, 'alternative');
    assert.deepEqual(selectHintMove(moves), { move: null, legacy: true });
    assert.equal(selectHintMove(moves, [{ ...candidates[0], move: ['h1', 'h8'] }]).legacy, true);
});

test('personality category probabilities renormalize only over available enabled categories', () => {
    const weights = { best: 30, secondary: 20, mistake: 10, blunder: 15, miss: 5, other: 20 };
    const allMoves = ['a2a3', 'b2b3', 'c2c3', 'd2d3', 'e2e3', 'f2f3'].map(uci =>
        ({ from: uci.slice(0, 2), to: uci.slice(2), promotion: 'q' }));
    const entries = Object.keys(weights).map((category, rank) => ({
        move: [allMoves[rank].from, allMoves[rank].to], category, rank, profile: 'p'
    }));
    const counts = Object.fromEntries(Object.keys(weights).map(category => [category, 0]));
    for(let i = 0; i < 1000; i++) {
        const draws = [(i + 0.5) / 1000, 0];
        counts[selectHintMove(allMoves, entries, () => draws.shift(), weights).category]++;
    }
    assert.deepEqual(counts, Object.fromEntries(Object.entries(weights).map(([category, weight]) => [category, weight * 10])));
    const onlyBlunders = { ...defaultSelectionWeights, best: 0, alternative: 0, blunder: 100 };
    assert.equal(selectHintMove(allMoves, entries, () => 0.5, onlyBlunders).category, 'blunder');
    assert.equal(selectHintMove(allMoves, entries.slice(0, 2), () => 0.5, onlyBlunders).fallback, true);
    assert.equal(selectHintMove(moves, [candidates[1]], () => 0.99).move, moves[1]);
    for(const invalid of [null, {}, { ...weights, best: -1 }, { ...weights, best: NaN },
        { ...weights, best: 101 }, { ...weights, best: 31 }])
        assert.throws(() => validateSelectionWeights(invalid), /total 100/);
});

test('editing one percentage rebalances the rest without losing the total', () => {
    const simple = rebalanceSelectionWeights(defaultSelectionWeights, 'best', 32.5, ['best', 'alternative']);
    assert.equal(simple.alternative, 67.5);
    const detailed = { best: 60, secondary: 20, mistake: 20, blunder: 0, miss: 0, other: 0 };
    const result = rebalanceSelectionWeights(detailed, 'blunder', 50, Object.keys(detailed));
    assert.equal(result.best, 30);
    assert.equal(result.secondary, 10);
    assert.equal(result.mistake, 10);
    assert.equal(result.blunder, 50);
    const all = rebalanceSelectionWeights(detailed, 'blunder', 100, Object.keys(detailed));
    assert.equal(rebalanceSelectionWeights(all, 'blunder', 20, Object.keys(detailed)).best, 80);
    for(let i = 0; i <= 100; i++) {
        const weights = rebalanceSelectionWeights(result, 'secondary', i / 3, Object.keys(detailed));
        assert.ok(Math.abs(Object.values(weights).reduce((a, b) => a + b) - 100) < 1e-6);
    }
    assert.throws(() => rebalanceSelectionWeights(detailed, 'best', NaN), /between/);
});

test('a completed target-square-only profile does not block a full-move profile', async () => {
    const harness = await hintWaitHarness();
    harness.frame.analysis = { profiles: ['target', 'main'], completed: ['target', 'main'] };
    const hints = revealedHints([
        { category: 'move', from: 'd2', to: 'd4', profileID: 'target', shapeSquare: 'd4',
            selection: { profile: 'target', rank: 0, category: 'blunder' } },
        { category: 'move', from: 'e2', to: 'e4', profileID: 'main', shapeType: 'arrow',
            selection: { profile: 'main', rank: 0, category: 'best' } }
    ]);
    assert.equal(hints.partial, true);
    harness.send(hints.candidates, hints.moves);
    assert.equal((await harness.choose()).from, 'e2');
});

test('a fast profile cannot choose before a slow profile has finished', async () => {
    const harness = await hintWaitHarness({ timeout: 500 });
    harness.frame.analysis = { profiles: ['main', 'slow'], completed: ['main'] };
    harness.send([candidates[0]]);
    let resolved = false;
    const pending = harness.choose().then(move => { resolved = true; return move; });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(resolved, false);
    harness.frame.analysis.completed.push('slow');
    harness.frame.notify();
    assert.equal((await pending).from, 'e2');
});

test('safety rejects warnings, unscored moves, large losses and lost forced mates', () => {
    const best = { cp: 120, mate: null };
    const safe = (move, warning = null) => moveSelection(best, move, 1, 'main', warning, true).safe;
    assert.equal(safe({ cp: 20 }), true);
    assert.equal(safe({ cp: 19 }), false);
    assert.equal(safe({ cp: 100 }, 'blunder'), false);
    assert.equal(safe({ cp: 100 }, 'mistake'), false);
    assert.equal(safe({ cp: 100 }, 'miss'), false);
    assert.equal(safe({}), false);
    assert.equal(safe({ cp: 120, mate: -2 }), false);
    assert.equal(moveSelection({ mate: 3 }, { cp: 1000 }, 1, 'main', null, true).safe, false);
    assert.equal(moveSelection({ mate: 3 }, { mate: 5 }, 1, 'main', null, true).safe, true);
    assert.equal(moveSelection(undefined, {}, 0, 'main', null, false).safe, false);
    assert.equal(moveSelection(best, best, 0, 'main', null, true).best, true);
});

test('direct sessions retain metadata only for revealed own moves', () => {
    const marking = (from, to, extra = {}) => ({ marking: {
        category: 'move', from, to, shapeType: 'arrow',
        selection: { profile: 'main', rank: 0, best: true, safe: true }, ...extra
    } });
    const activeVisuals = [
            marking('e2', 'e4'),
            marking('d2', 'd4', { shapeType: 'rectangle', shapeSquare: 'd2' }),
            marking('a2', 'a3', { isOpponent: true }),
            marking('b2', 'b3', { isFuture: true })
        ];
    const data = revealedHints(activeVisuals.map(({ marking }) => marking));
    assert.deepEqual(data.moves, [['e2', 'e4', null]]);
    assert.equal(data.partial, true);
    assert.deepEqual(data.candidates, [{ move: ['e2', 'e4', null], profile: 'main', rank: 0, best: true, safe: true }]);
});

test('partial shapes from different profiles cannot disclose one another or classify a full move', () => {
    const piece = { category: 'move', from: 'e2', to: 'e4', shapeType: 'rectangle',
        shapeSquare: 'e2', profileID: 'piece', selection: { ...candidates[0], profile: 'piece', category: 'blunder' } };
    const destination = { ...piece, shapeSquare: 'e4', profileID: 'destination',
        selection: { ...candidates[0], profile: 'destination' } };
    assert.deepEqual(revealedHints([piece, destination]).moves, []);
    const full = { ...piece, shapeType: 'arrow', profileID: 'full', selection: { ...candidates[0], profile: 'full' } };
    const hints = revealedHints([piece, destination, full, full]);
    assert.deepEqual(hints.moves, [['e2', 'e4', null]]);
    assert.deepEqual(hints.candidates.map(candidate => candidate.profile), ['full']);
    assert.equal(hints.partial, true);
});

test('duplicate root moves with different predicted replies retain their approved best metadata', () => {
    const best = { profile: 'main', rank: 0, best: true, safe: true };
    const alternative = { profile: 'main', rank: 1, best: false, safe: false };
    for(const sources of [[best, alternative], [alternative, best]]) {
        const activeVisuals = sources.map(selection => ({ marking: {
            category: 'move', shapeType: 'arrow', from: 'g2', to: 'h1', selection
        } }));
        const hints = revealedHints(activeVisuals.map(({ marking }) => marking));
        assert.deepEqual(hints.moves, [['g2', 'h1', null]]);
        const selected = selectHintMove([{ from: 'g2', to: 'h1', promotion: 'q' }], hints.candidates);
        assert.ok(selected.move, JSON.stringify(hints));
        assert.equal(selected.legacy, false);
        assert.deepEqual(hints.candidates, [{ move: ['g2', 'h1', null], ...best }]);
    }
});

test('GUI includes safety even with warning colors disabled and rejects Maia root-only alternatives', async () => {
    const source = await readFile(new URL('../app/assets/js/instance/Interface.js', import.meta.url), 'utf8');
    const start = source.indexOf('    async markMoves(');
    const end = source.indexOf('\n    removeMarkingFromProfile(', start);
    assert.ok(start >= 0 && end > start);
    for(const engine of ['stockfish-18-lite-single', 'maia3']) {
        let sent;
        const instance = {
            configKeys: new Proxy({}, { get: (_, key) => key }),
            getConfigValue: async key => key === 'displayMovesOnExternalSite' ? true : key === 'arrowOpacity' ? 100 : false,
            getEngineName: async () => engine,
            BoardDrawer: { createShape: () => null },
            pV: { main: { activeGuiMoveMarkings: [] } },
            CommLink: { commands: { renderVisualsToSite: entries => { sent = entries; } } }
        };
        const iface = {
            AcasInstance: instance, removeMarkings() {},
            getMoveShapes: () => [{ shapeType: 'arrow', shapeSquare: ['e2', 'e4'], shapeConfig: {} }],
            buildMoveSiteEntries: (move, shapes) => shapes.map(shape => ({ data: { ...move, ...shape } }))
        };
        const context = {
            iface,
            candidates: [120, 80, -250].map(cp => ({ cp, player: ['e2', 'e4'], playerUci: 'e2e4' })),
            WARNING_TYPES: ['mistake', 'blunder', 'miss'],
            getMoveWarning: (best, move) => best.cp - move.cp > 100 ? 'blunder' : null,
            moveSelection, FORMAT_MOVE_OBJ_TO_EXTERNAL_SITE: entries => entries.map(entry => entry.data)
        };
        await vm.runInNewContext(`({${source.slice(start, end)}}).markMoves.call(iface, candidates, 'main', { detail: 'full' })`, context);
        assert.deepEqual(Array.from(sent, entry => entry.selection.safe), engine === 'maia3' ? [true, false, false] : [true, true, false]);
        assert.deepEqual(Array.from(sent, entry => entry.selection.best), [true, false, false]);
        await vm.runInNewContext(`({${source.slice(start, end)}}).markMoves.call(iface, candidates, 'main', { detail: 'full' }, () => true, true)`, context);
        assert.ok(sent.every(entry => entry.suppressAutoMove === true));
        assert.ok(sent.every(entry => !entry.isFuture), 'Redrawing a current suggestion must not turn it into a future move');
    }
});

test('presentation-only redraws remain revealed but never trigger userscript Auto Move', async () => {
    const source = await readFile(new URL('../acas.user.js', import.meta.url), 'utf8');
    const start = source.indexOf('function handleAutoMove(');
    const end = source.indexOf('\nconst feedbackVisualRevisions', start);
    let played = 0;
    const context = {
        configKeys: new Proxy({}, { get: (_, key) => key }),
        getConfigValue: key => key === 'autoMove',
        AutomaticMove: { stopAll() {} }, runUserscriptTask: callback => callback(),
        makeMove: () => { played++; }
    };
    const handle = vm.runInNewContext(`${source.slice(start, end)}; handleAutoMove`, context);
    const marking = { category: 'move', from: 'g2', to: 'h1', profileID: 'main' };
    handle([{ ...marking, suppressAutoMove: true }]);
    handle([{ ...marking, isFuture: true }]);
    assert.equal(played, 0);
    handle([marking]);
    assert.equal(played, 1);
});
