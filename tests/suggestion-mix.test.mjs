import test from 'node:test';
import assert from 'node:assert/strict';
import SuggestionMix, { readMixWeights } from '../app/assets/js/instance/suggestionMix.js';
import { defaultSelectionWeights } from '../tools/eloeye/hintSelection.js';

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const weightsFor = category => Object.fromEntries(
    Object.keys(defaultSelectionWeights).map(name => [name, name === category ? 100 : 0]));
const move = (uci, cp = 0) => ({
    player: [uci.slice(0, 2), uci.slice(2, 4)], opponent: ['e7', 'e5'],
    playerUci: uci, cp, mate: null, fen, ranking: 1
});

function harness(configs = { main: {} }) {
    const calls = [], warnings = [];
    globalThis.TRANS_OBJ = {};
    globalThis.toast = { warning: message => warnings.push(message) };
    const instance = {
        currentFen: fen,
        pV: Object.fromEntries(Object.keys(configs).map(profile => [profile, {
            multiPV: 3, suggestionAmount: 3,
            hintCandidates: { fen, moves: [move('e2e4'), move('d2d4', -50), move('a2a3', -500)] }
        }])),
        Interface: {
            getMoveWarning: (best, candidate) => best.cp - candidate.cp > 400 ? 'blunder' : null,
            displayBookMoves: async () => {}
        },
        getBookMoves: async () => [],
        getPlayerColor: async () => 'w',
        isLearningProfile: profile => Boolean(configs[profile].learningMode),
        getConfigValue: async (key, profile) => configs[profile]?.[key] ?? ({
            hintDetail: 'full', arrowOpacity: 90, suggestionMix: true,
            suggestionMixWeights: JSON.stringify(weightsFor('best'))
        })[key],
        getEngineName: async profile => configs[profile]?.engine || 'stockfish',
        displayMoves: async (moves, profile, bypass, silent, review, current) => {
            assert.equal(current(), true);
            calls.push({ moves, profile, silent });
            if(moves.some(item => item.suggestionMix)) mix.markDelivered(profile, instance.currentFen);
        }
    };
    const mix = new SuggestionMix(instance);
    return { mix, instance, calls, warnings };
}

const picks = calls => calls.flatMap(call => call.moves.filter(item => item.suggestionMix));

test('mix weights use the shared defaults and reject invalid saved values', () => {
    assert.deepEqual(readMixWeights(null), defaultSelectionWeights);
    assert.deepEqual(readMixWeights(JSON.stringify(weightsFor('mistake'))), weightsFor('mistake'));
    assert.throws(() => readMixWeights('{'));
    assert.throws(() => readMixWeights({ best: 110 }));
});

test('the mix waits for every full profile and keeps partial hints separate', async () => {
    const { mix, calls } = harness({ fast: {}, slow: {}, target: { hintDetail: 'destination' } });
    await mix.configure();
    const state = mix.begin(fen);
    const fast = { fen }, slow = { fen }, target = { fen };
    mix.started('fast', fast);
    mix.started('slow', slow);
    mix.started('target', target);
    await mix.end(state);
    await mix.finished('fast', fast);
    assert.equal(picks(calls).length, 0);
    calls.length = 0;
    await mix.finished('slow', slow);
    assert.equal(picks(calls).length, 1);
    assert.equal(picks(calls)[0].playerUci, 'e2e4');
    assert.ok(calls.find(call => call.profile === 'target').moves.length > 0);
    assert.ok(calls.every(call => call.moves.every(item => item.opponent.every(square => square === null))));
    assert.equal(calls.at(-1).profile, mix.selection.key.split('|')[0]);
});

test('a redraw retains the pick and suppresses repeated speech and Auto Move', async () => {
    const { mix, calls } = harness();
    await mix.configure();
    const state = mix.begin(fen);
    await mix.end(state);
    const first = picks(calls)[0].playerUci;
    calls.length = 0;
    await mix.render();
    assert.equal(picks(calls)[0].playerUci, first);
    assert.equal(calls[0].silent, true);
});

test('an interrupted redraw does not suppress the first delivered pick', async () => {
    const { mix, instance, calls } = harness({ first: {}, second: {} });
    await mix.configure();
    const state = mix.begin(fen);
    await mix.end(state);
    mix.selection.delivered = false;
    calls.length = 0;
    const normalDisplay = instance.displayMoves;
    let interrupted = false;
    instance.displayMoves = async (...args) => {
        if(!interrupted) {
            interrupted = true;
            await mix.render();
            return;
        }
        await normalDisplay(...args);
    };
    await mix.render();
    assert.equal(picks(calls).length, 1);
    assert.equal(calls.at(-1).silent, false);
});

test('alternative categories use the original best evaluation and warning-only visibility', async () => {
    const { mix, instance, calls } = harness({
        main: { onlyShowWarningMoves: true, markBlunderMoves: true }
    });
    instance.pV.main.onlyShowWarningMoves = true;
    await mix.configure();
    mix.weights = weightsFor('blunder');
    const state = mix.begin(fen);
    await mix.end(state);
    assert.deepEqual(picks(calls).map(item => item.playerUci), ['a2a3']);
});

test('unavailable types warn once and never invent a move', async () => {
    const { mix, calls, warnings } = harness();
    await mix.configure();
    mix.weights = weightsFor('miss');
    const state = mix.begin(fen);
    await mix.end(state);
    assert.equal(picks(calls).length, 1);
    assert.equal(warnings.length, 1);
    await mix.render();
    assert.equal(warnings.length, 1);
});

test('hidden and stale suggestions and learning profiles do not enter the pool', async () => {
    const { mix, instance, calls } = harness({
        hidden: { arrowOpacity: 0 }, stale: {}, learning: { learningMode: true }
    });
    instance.pV.stale.hintCandidates.fen = 'old';
    await mix.configure();
    const state = mix.begin(fen);
    await mix.end(state);
    assert.equal(picks(calls).length, 0);
    assert.equal(calls.some(call => call.profile === 'learning'), false);
});

test('a failed profile releases the barrier without exposing its cached suggestions', async () => {
    const { mix, calls } = harness({ good: {}, failed: {} });
    await mix.configure();
    const state = mix.begin(fen);
    const good = { fen }, failed = { fen };
    mix.started('good', good);
    mix.started('failed', failed);
    await mix.end(state);
    await mix.finished('good', good);
    calls.length = 0;
    await mix.failed('failed', failed);
    assert.equal(picks(calls).length, 1);
    assert.equal(calls.find(call => call.profile === 'failed').moves.length, 0);
});

test('new positions invalidate old completions and picks', async () => {
    const { mix, instance, calls } = harness();
    await mix.configure();
    const state = mix.begin(fen), calculation = { fen };
    mix.started('main', calculation);
    await mix.end(state);
    calls.length = 0;
    instance.currentFen = fen.replace(' w ', ' b ');
    const next = mix.begin(instance.currentFen);
    await mix.finished('main', calculation);
    await mix.end(next);
    assert.equal(picks(calls).length, 0);
});

test('disabled mixing leaves normal rendering alone', async () => {
    const { mix, calls } = harness();
    await mix.configure();
    mix.enabled = false;
    const state = mix.begin(fen);
    await mix.end(state);
    assert.equal(calls.length, 0);
});

test('preferred book moves bypass the engine barrier and percentage mix', async () => {
    const { mix, instance, calls, warnings } = harness({ first: {}, second: {} });
    await mix.configure();
    mix.preferBook = true;
    mix.weights = weightsFor('blunder');
    instance.getBookMoves = async (position, profile) => [{
        from: 'c2', to: 'c4', fen: position, profile
    }];
    const state = mix.begin(fen);
    mix.started('first', { fen });
    mix.started('second', { fen });
    await mix.end(state);
    assert.deepEqual(picks(calls).map(item => item.player.join('')), ['c2c4']);
    assert.equal(warnings.length, 0);
    calls.length = 0;
    await mix.render();
    assert.equal(picks(calls)[0].player.join(''), 'c2c4');
    assert.equal(calls.at(-1).silent, true);
});

test('book pools deduplicate moves and keep promotions distinct', async () => {
    const { mix, instance } = harness({ first: {}, second: {} });
    await mix.configure();
    mix.preferBook = true;
    instance.getBookMoves = async (position, profile) => [
        { from: 'a7', to: 'a8', promotion: 'q', fen: position, profile },
        { from: 'a7', to: 'a8', promotion: 'n', fen: position, profile }
    ];
    const first = await mix.collect('first', instance.pV.first, fen);
    assert.deepEqual(first.bookCandidates.map(candidate => candidate.move[2]), ['q', 'n']);
    const state = mix.begin(fen);
    await mix.end(state);
    assert.ok(mix.selection.key.endsWith('q') || mix.selection.key.endsWith('n'));
});

test('missing full book moves fall back to the normal mix without revealing partial hints', async () => {
    const { mix, instance, calls } = harness({ main: {}, target: { hintDetail: 'destination' } });
    await mix.configure();
    mix.preferBook = true;
    instance.getBookMoves = async (position, profile) => profile === 'target'
        ? [{ from: 'c2', to: 'c4', fen: position, profile }] : [];
    const state = mix.begin(fen);
    await mix.end(state);
    assert.deepEqual(picks(calls).map(item => item.playerUci), ['e2e4']);
});

test('turning book preference off restores the percentage mix', async () => {
    const { mix, instance, calls } = harness();
    await mix.configure();
    mix.preferBook = true;
    instance.getBookMoves = async () => [{ from: 'c2', to: 'c4', fen }];
    const state = mix.begin(fen);
    await mix.end(state);
    mix.preferBook = false;
    calls.length = 0;
    await mix.render(true);
    assert.deepEqual(picks(calls).map(item => item.playerUci), ['e2e4']);
});

test('piece filters and opacity apply to preferred books as well as engine suggestions', async () => {
    const config = { main: { suggestPawn: false } };
    const { mix, instance, calls } = harness(config);
    await mix.configure();
    mix.preferBook = true;
    instance.getBookMoves = async () => [{ from: 'c2', to: 'c4', fen }];
    instance.pV.main.hintCandidates.moves.push(move('g1f3'));
    instance.pV.main.multiPV = 4;
    const state = mix.begin(fen);
    await mix.end(state);
    assert.deepEqual(picks(calls).map(item => item.playerUci), ['g1f3']);

    calls.length = 0;
    config.main.arrowOpacity = 0;
    await mix.render(true);
    assert.equal(picks(calls).length, 0);
});

test('capture and non-capture filters also restrict preferred book moves', async () => {
    const config = { main: { hintDetail: 'captures' } };
    const { mix, instance } = harness(config);
    await mix.configure();
    mix.preferBook = true;
    const position = '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1';
    instance.getBookMoves = async () => [
        { from: 'e4', to: 'd5', fen: position },
        { from: 'e4', to: 'e5', fen: position }
    ];
    let pool = await mix.collect('main', instance.pV.main, position);
    assert.deepEqual(pool.bookCandidates.map(candidate => candidate.move.slice(0, 2)), [['e4', 'd5']]);
    config.main.hintDetail = 'movement';
    pool = await mix.collect('main', instance.pV.main, position);
    assert.deepEqual(pool.bookCandidates.map(candidate => candidate.move.slice(0, 2)), [['e4', 'e5']]);
});

test('concealment does not select, publish or warn until assistance is shown', async () => {
    const { mix, calls, warnings } = harness();
    await mix.configure();
    mix.weights = weightsFor('miss');
    const state = mix.begin(fen);
    globalThis.CONCEAL_ASSISTANCE_ACTIVE = true;
    try {
        await mix.end(state);
        assert.equal(calls.length, 0);
        assert.equal(warnings.length, 0);
        assert.equal(mix.selection, undefined);
    } finally {
        delete globalThis.CONCEAL_ASSISTANCE_ACTIVE;
    }
    await mix.render();
    assert.equal(picks(calls).length, 1);
    assert.equal(warnings.length, 1);
});
