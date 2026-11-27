import test from 'node:test';
import assert from 'node:assert/strict';
import SuggestionMix, { pickBookCandidate, readMixWeights } from '../app/assets/js/instance/suggestionMix.js';
import { defaultSelectionWeights } from '../tools/eloeye/hintSelection.js';

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const weightsFor = category => Object.fromEntries(
    Object.keys(defaultSelectionWeights).map(name => [name, name === category ? 100 : 0]));
const move = (uci, cp = 0) => ({
    player: [uci.slice(0, 2), uci.slice(2, 4)], opponent: ['e7', 'e5'],
    playerUci: uci, cp, mate: null, fen, ranking: 1
});

test('warning moves compare against the true engine best even when piece filters hide it', async () => {
    const { mix, instance, calls } = harness({
        main: { onlyShowWarningMoves: true, markBlunderMoves: true, suggestPawn: false }
    });
    instance.pV.main.onlyShowWarningMoves = true;
    instance.pV.main.multiPV = 4;
    instance.pV.main.hintCandidates.moves.push(move('g1f3', -500));
    await mix.configure();
    setMixOptions(mix, { weights: weightsFor('blunder') });
    await mix.end(mix.begin(fen));
    assert.deepEqual(picks(calls).map(item => item.playerUci), ['g1f3']);
});

function harness(configs = { main: {} }) {
    const calls = [], warnings = [], bookCalls = [];
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
            displayBookMoves: async (moves, profile, current) => {
                assert.equal(current(), true);
                bookCalls.push({ moves, profile });
            }
        },
        getBookMoves: async () => [],
        getPlayerColor: async () => 'w',
        isLearningProfile: profile => Boolean(configs[profile].learningMode),
        getConfigValue: async (key, profile) => configs[profile]?.[key] ?? ({
            hintDetail: 'full', arrowOpacity: 90, bookMoveOpacity: 90,
            onlyShowTopMoves: true,
            suggestionMixMode: 'all', suggestionMixShared: true,
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
    return { mix, instance, calls, warnings, bookCalls };
}

const picks = calls => calls.flatMap(call => call.moves.filter(item => item.suggestionMix));
const setMixOptions = (mix, options) => mix.settings.forEach(settings => Object.assign(settings, options));

test('mix weights use the shared defaults and reject invalid saved values', () => {
    assert.deepEqual(readMixWeights(null), defaultSelectionWeights);
    assert.deepEqual(readMixWeights(JSON.stringify(weightsFor('mistake'))), weightsFor('mistake'));
    assert.throws(() => readMixWeights('{'));
    assert.throws(() => readMixWeights({ best: 110 }));
});

test('top-move book pools render without an active engine search but wait for queued searches', async () => {
    const { mix, instance, bookCalls } = harness({
        books: { suggestionMixMode: 'books', suggestionMixShared: false }
    });
    instance.getBookMoves = async (position, profile) => [
        { from: 'c2', to: 'c4', weight: 100, fen: position, profile }
    ];
    await mix.configure();
    await mix.render();
    assert.equal(mix.selections.get('profile:books').book, true);

    mix.selections.clear();
    bookCalls.length = 0;
    instance.pV.books.pendingCalculationRequest = { fen };
    await mix.render();
    assert.equal(mix.selections.has('profile:books'), false);
    assert.ok(bookCalls.every(call => call.moves.length === 0));
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
    setMixOptions(mix, { weights: weightsFor('blunder') });
    const state = mix.begin(fen);
    await mix.end(state);
    assert.deepEqual(picks(calls).map(item => item.playerUci), ['a2a3']);
});

test('unavailable types warn once and never invent a move', async () => {
    const { mix, calls, warnings } = harness();
    await mix.configure();
    setMixOptions(mix, { weights: weightsFor('miss') });
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

test('preferred book moves bypass the engine barrier only with Only Top Moves disabled', async () => {
    const { mix, instance, calls, warnings } = harness({
        first: { onlyShowTopMoves: false }, second: { onlyShowTopMoves: false }
    });
    await mix.configure();
    setMixOptions(mix, { preferBook: true, weights: weightsFor('blunder') });
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

test('preferred book picks follow book weights and give each profile an equal share', () => {
    const book = (profile, uci, weight) => ({ profile, move: [uci.slice(0, 2), uci.slice(2, 4), null], source: { weight } });
    const pool = [book('a', 'e2e4', 900), book('a', 'd2d4', 100), book('a', 'g2g4', 0), book('b', 'c2c4', 1)];
    const pick = (...rolls) => pickBookCandidate(pool, () => rolls.shift()).move.slice(0, 2).join('');
    assert.equal(pick(0.1, 0), 'e2e4');
    assert.equal(pick(0.1, 0.89), 'e2e4');
    assert.equal(pick(0.1, 0.95), 'd2d4');
    assert.equal(pick(0.9, 0.5), 'c2c4');
    const unweighted = [book('a', 'e2e4', 0), book('a', 'd2d4', 0)];
    assert.equal(pickBookCandidate(unweighted, () => 0.75).move[0], 'd2');
});

test('duplicate shared book moves retain the profile that won its equal chance', () => {
    const pool = [
        { profile: 'weighted', move: ['e2', 'e4', null], source: { weight: 100 } },
        { profile: 'zero', move: ['e2', 'e4', null], source: { weight: 0 } }
    ];
    assert.equal(pickBookCandidate(pool, () => [0.25, 0.5].shift()).profile, 'weighted');
    assert.equal(pickBookCandidate(pool, () => [0.75, 0.5].shift()).profile, 'zero');
});

test('shared book moves combine profile shares without merging promotions', () => {
    const book = (profile, promotion, weight) => ({
        profile, move: ['a7', 'a8', promotion], source: { weight }
    });
    const pool = [book('a', 'q', 3), book('a', 'n', 1), book('b', 'q', 1), book('b', 'r', 1)];
    const counts = { q: 0, n: 0, r: 0 };
    for(let sample = 0; sample < 1000; sample++) {
        const rolls = [sample % 2 ? 0.75 : 0.25, (Math.floor(sample / 2) + 0.5) / 500];
        const picked = pickBookCandidate(pool, () => rolls.shift());
        counts[picked.move[2]]++;
    }
    assert.deepEqual(counts, { q: 625, n: 125, r: 250 });
});

test('render samples preferred book weights once per position and retains the pick on redraw', async () => {
    const random = Math.random;
    try {
        for(const [e4Weight, d4Weight, expected] of [[50, 50, 500], [900, 100, 900]]) {
            const { mix, instance, calls, warnings } = harness();
            await mix.configure();
            setMixOptions(mix, { preferBook: true, weights: weightsFor('blunder') });
            instance.getBookMoves = async position => [
                { from: 'e2', to: 'e4', weight: e4Weight, fen: position },
                { from: 'd2', to: 'd4', weight: d4Weight, fen: position },
                { from: 'g2', to: 'g4', weight: 0, fen: position }
            ];
            const counts = { e2e4: 0, d2d4: 0, g2g4: 0 };
            for(let sample = 0; sample < 1000; sample++) {
                let rolls = 0;
                Math.random = () => {
                    rolls++;
                    return (sample + 0.5) / 1000;
                };
                instance.currentFen = fen.replace(' 0 1', ` 0 ${sample + 1}`);
                calls.length = 0;
                await mix.end(mix.begin(instance.currentFen));
                const selected = picks(calls)[0].player.join('');
                counts[selected]++;
                assert.equal(calls.at(-1).silent, false);
                calls.length = 0;
                await mix.render();
                assert.equal(picks(calls)[0].player.join(''), selected);
                assert.equal(calls.at(-1).silent, true);
                assert.equal(rolls, 1);
            }
            assert.deepEqual(counts, { e2e4: expected, d2d4: 1000 - expected, g2g4: 0 });
            assert.deepEqual(warnings, []);
        }
    } finally {
        Math.random = random;
    }
});

test('book pools deduplicate moves and keep promotions distinct', async () => {
    const { mix, instance } = harness({ first: {}, second: {} });
    await mix.configure();
    setMixOptions(mix, { preferBook: true });
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
    setMixOptions(mix, { preferBook: true });
    instance.getBookMoves = async (position, profile) => profile === 'target'
        ? [{ from: 'c2', to: 'c4', fen: position, profile }] : [];
    const state = mix.begin(fen);
    await mix.end(state);
    assert.deepEqual(picks(calls).map(item => item.playerUci), ['e2e4']);
});

test('turning book preference off allows engine percentages to supply the pick', async () => {
    const configs = { main: { suggestionMixPreferBook: true } };
    const { mix, instance, calls } = harness(configs);
    await mix.configure();
    instance.getBookMoves = async () => [{ from: 'c2', to: 'c4', fen }];
    const state = mix.begin(fen);
    await mix.end(state);
    configs.main.suggestionMixPreferBook = false;
    await mix.configure();
    calls.length = 0;
    const random = Math.random;
    try {
        Math.random = () => 0.99;
        await mix.render(true);
    } finally {
        Math.random = random;
    }
    assert.deepEqual(picks(calls).map(item => item.playerUci), ['e2e4']);
});

test('piece filters and opacity apply to preferred books as well as engine suggestions', async () => {
    const config = { main: { suggestPawn: false } };
    const { mix, instance, calls } = harness(config);
    await mix.configure();
    setMixOptions(mix, { preferBook: true });
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
    setMixOptions(mix, { preferBook: true });
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
    setMixOptions(mix, { weights: weightsFor('miss') });
    const state = mix.begin(fen);
    globalThis.CONCEAL_ASSISTANCE_ACTIVE = true;
    try {
        await mix.end(state);
        assert.equal(calls.length, 0);
        assert.equal(warnings.length, 0);
        assert.equal(mix.selection, null);
    } finally {
        delete globalThis.CONCEAL_ASSISTANCE_ACTIVE;
    }
    await mix.render();
    assert.equal(picks(calls).length, 1);
    assert.equal(warnings.length, 1);
});

test('Off, books-only and All profiles remain independent and books-only never funnels engines', async () => {
    const configs = {
        off: { suggestionMixMode: 'off' },
        books: { suggestionMixMode: 'books', suggestionMixShared: false },
        all: { suggestionMixMode: 'all', suggestionMixShared: false }
    };
    const { mix, instance, calls, bookCalls } = harness(configs);
    instance.getBookMoves = async (position, profile) => [
        { from: 'c2', to: 'c4', weight: 100, fen: position, profile },
        { from: 'g2', to: 'g4', weight: 0, fen: position, profile }
    ];
    await mix.configure();
    await mix.end(mix.begin(fen));
    assert.deepEqual(calls.map(call => call.profile), ['all']);
    assert.deepEqual(bookCalls.map(call => [call.profile, call.moves.map(move => move.from)]),
        [['books', ['c2']], ['all', []]]);
    assert.equal(mix.handles('off'), false);
    assert.equal(mix.handles('books'), false);
    assert.equal(mix.handles('all'), true);
    instance.getBookMoves = async () => [];
    calls.length = 0;
    bookCalls.length = 0;
    await mix.render(true);
    assert.deepEqual(calls.map(call => call.profile), ['all']);
    assert.deepEqual(bookCalls.filter(call => call.profile === 'books').map(call => call.moves), [[]]);
    assert.equal(mix.selections.has('profile:books'), false);
});

test('only opted-in profiles share a pool and independent groups do not wait for it', async () => {
    const configs = {
        fast: {}, slow: {},
        independent: { suggestionMixShared: false },
        off: { suggestionMixMode: 'off' }
    };
    const { mix, calls } = harness(configs);
    await mix.configure();
    const state = mix.begin(fen), slow = { fen };
    mix.started('slow', slow);
    await mix.end(state);
    assert.deepEqual(calls.filter(call => call.moves.some(move => move.suggestionMix))
        .map(call => call.profile), ['independent']);
    calls.length = 0;
    await mix.finished('slow', slow);
    assert.equal(picks(calls).length, 2);
    assert.equal(calls.some(call => call.profile === 'off'), false);
    assert.equal(mix.selections.size, 2);
    configs.independent.suggestionMixMode = 'off';
    await mix.configure();
    calls.length = 0;
    await mix.render(true);
    assert.equal(picks(calls).length, 1);
    assert.equal(calls.some(call => call.profile === 'independent'), false);
});

test('books-only respects book opacity and filters independently of engine opacity', async () => {
    const configs = { main: { suggestionMixMode: 'books', arrowOpacity: 0 } };
    const { mix, instance, bookCalls } = harness(configs);
    instance.getBookMoves = async () => [{ from: 'c2', to: 'c4', weight: 100, fen }];
    await mix.configure();
    await mix.end(mix.begin(fen));
    assert.equal(bookCalls.at(-1).moves.length, 1);
    configs.main.bookMoveOpacity = 0;
    await mix.render(true);
    assert.equal(bookCalls.at(-1).moves.length, 0);
    configs.main.bookMoveOpacity = 90;
    configs.main.suggestPawn = false;
    await mix.render(true);
    assert.equal(bookCalls.at(-1).moves.length, 0);
});

test('shared profiles keep their own engine percentages and settings changes invalidate only their pool', async () => {
    const configs = {
        best: { suggestionMixWeights: JSON.stringify(weightsFor('best')) },
        alternative: { suggestionMixWeights: JSON.stringify(weightsFor('alternative')) },
        independent: { suggestionMixShared: false }
    };
    const { mix, calls } = harness(configs);
    await mix.configure();
    const random = Math.random;
    try {
        Math.random = () => 0;
        await mix.end(mix.begin(fen));
        assert.equal(mix.selection.profile, 'best');
        assert.equal(picks(calls)[0].playerUci, 'e2e4');
        const independent = mix.selections.get('profile:independent');
        configs.best.suggestionMixMode = 'off';
        await mix.configure();
        assert.equal(mix.selections.get('profile:independent'), independent);
        calls.length = 0;
        await mix.render(true);
        assert.equal(mix.selection.profile, 'alternative');
        assert.notEqual(calls.find(call => call.profile === 'alternative').moves[0].playerUci, 'e2e4');
    } finally {
        Math.random = random;
    }
});

test('shared profiles get equal chances despite matching percentages and unequal candidate counts', async () => {
    const { mix, instance } = harness({ small: {}, large: {}, empty: {} });
    instance.pV.small.hintCandidates.moves = [move('e2e4')];
    instance.pV.large.hintCandidates.moves = [move('d2d4'), move('e2e4', -500), move('a2a3', -600)];
    instance.pV.empty.hintCandidates.moves = [];
    await mix.configure();
    const pools = await Promise.all(Object.entries(instance.pV).map(([profile, variables]) =>
        mix.collect(profile, variables, fen)));
    const counts = { small: 0, large: 0 };
    for(let sample = 0; sample < 100; sample++) {
        const rolls = [(sample + 0.5) / 100, 0, 0];
        const { pick } = mix.pickFromPools(pools, false, () => rolls.shift());
        counts[pick.profile]++;
        assert.equal(pick.source.playerUci, pick.profile === 'small' ? 'e2e4' : 'd2d4');
    }
    assert.deepEqual(counts, { small: 50, large: 50 });
});

test('shared book and engine odds apply after the equally likely profile choice', async () => {
    const { mix, instance } = harness({
        books: { suggestionMixMode: 'books' },
        engine: { suggestionMixWeights: JSON.stringify(defaultSelectionWeights) },
        empty: { suggestionMixMode: 'books' }
    });
    instance.getBookMoves = async (position, profile) => profile === 'books' ? [
        { from: 'c2', to: 'c4', weight: 75, fen: position },
        { from: 'g2', to: 'g4', weight: 25, fen: position }
    ] : [];
    await mix.configure();
    const pools = await Promise.all(Object.entries(instance.pV).map(([profile, variables]) =>
        mix.collect(profile, variables, fen)));
    const counts = { c2c4: 0, g2g4: 0, e2e4: 0, d2d4: 0 };
    for(let profile = 0; profile < 20; profile++) {
        for(let weight = 0; weight < 20; weight++) {
            const rolls = [(profile + 0.5) / 20, (weight + 0.5) / 20, 0];
            const { pick } = mix.pickFromPools(pools, false, () => rolls.shift());
            counts[pick.move.slice(0, 2).join('')]++;
        }
    }
    assert.deepEqual(counts, { c2c4: 150, g2g4: 50, e2e4: 180, d2d4: 20 });
});

test('shared books-only does not bypass engine searches or give its hidden preference priority', async () => {
    const { mix, instance, bookCalls } = harness({
        books: { suggestionMixMode: 'books', suggestionMixPreferBook: true },
        engine: {}
    });
    instance.getBookMoves = async (position, profile) => profile === 'books'
        ? [{ from: 'c2', to: 'c4', weight: 100, fen: position }] : [];
    await mix.configure();
    const state = mix.begin(fen), search = { fen };
    mix.started('engine', search);
    await mix.end(state);
    assert.equal(mix.selection, null);
    assert.ok(bookCalls.every(call => call.moves.length === 0));
    const random = Math.random;
    try {
        for(const [roll, profile, book] of [[0.25, 'books', true], [0.75, 'engine', false]]) {
            Math.random = () => roll;
            mix.selections.clear();
            await mix.finished('engine', search);
            assert.equal(mix.selection.profile, profile);
            assert.equal(mix.selection.book, book);
            let rerolled = false;
            Math.random = () => { rerolled = true; return 0; };
            await mix.render();
            assert.equal(rerolled, false);
            assert.equal(mix.selection.profile, profile);
        }
    } finally {
        Math.random = random;
    }
});

test('explicit preference prioritizes all shared books, with equal book-profile chances and engine fallback', async () => {
    const { mix, instance, calls } = harness({
        books: { suggestionMixMode: 'books', onlyShowTopMoves: false },
        otherBooks: { suggestionMixMode: 'books', onlyShowTopMoves: false },
        engine: { suggestionMixPreferBook: true, onlyShowTopMoves: false }
    });
    instance.getBookMoves = async (position, profile) => profile === 'engine' ? [] : [
        { from: profile === 'books' ? 'c2' : 'g2', to: profile === 'books' ? 'c4' : 'g4',
            weight: profile === 'books' ? 100 : 0, fen: position }
    ];
    await mix.configure();
    const state = mix.begin(fen), search = { fen };
    mix.started('engine', search);
    const random = Math.random;
    try {
        for(const [roll, profile] of [[0.25, 'books'], [0.75, 'otherBooks']]) {
            Math.random = () => roll;
            mix.selections.clear();
            await mix.end(state);
            assert.equal(mix.selection.profile, profile);
            assert.equal(mix.selection.book, true);
            assert.equal(picks(calls).length, 0);
        }
        instance.getBookMoves = async () => [];
        await mix.render();
        assert.equal(mix.selection.profile, 'engine');
        assert.equal(mix.selection.book, false);
        calls.length = 0;
        await mix.finished('engine', search);
        assert.equal(mix.selection.profile, 'engine');
        assert.equal(mix.selection.book, false);
        assert.equal(picks(calls).length, 1);
    } finally {
        Math.random = random;
    }
});

test('books and preferred books wait for every full participant with Only Top Moves enabled', async () => {
    for(const mode of ['books', 'all']) {
        const { mix, instance, calls, bookCalls } = harness({
            fast: { suggestionMixMode: mode, suggestionMixPreferBook: true },
            slow: { suggestionMixMode: mode }
        });
        instance.getBookMoves = async (position, profile) => [
            { from: 'c2', to: 'c4', weight: 100, fen: position, profile }
        ];
        await mix.configure();
        const state = mix.begin(fen), fast = { fen }, slow = { fen };
        mix.started('fast', fast);
        mix.started('slow', slow);
        await mix.render();
        assert.equal(mix.selection, null);
        assert.ok(bookCalls.every(call => call.moves.length === 0));
        await mix.end(state);
        await mix.finished('fast', fast);
        assert.equal(mix.selection, null);
        assert.equal(picks(calls).length, 0);
        assert.ok(bookCalls.every(call => call.moves.length === 0));
        await mix.finished('slow', slow);
        assert.equal(mix.selection.book, true);
        assert.equal(mode === 'books'
            ? bookCalls.filter(call => call.moves.length > 0).length : picks(calls).length, 1);
    }
});

test('Only Top Moves disabled permits provisional picks but does not skip other profiles wait requirements', async () => {
    const configs = { live: { onlyShowTopMoves: false }, final: {} };
    const { mix, instance, calls } = harness(configs);
    await mix.configure();
    const state = mix.begin(fen), live = { fen }, final = { fen };
    mix.started('live', live);
    mix.started('final', final);
    await mix.end(state);
    assert.equal(mix.selection, null);
    instance.pV.live.hintCandidates.moves = [];
    await mix.finished('final', final);
    assert.equal(mix.selection.profile, 'final');
    configs.final.onlyShowTopMoves = false;
    await mix.configure();
    mix.started('final', final);
    await mix.render();
    assert.equal(mix.selection.profile, 'final');
    instance.pV.final.hintCandidates.moves = [move('c2c4')];
    calls.length = 0;
    await mix.render();
    assert.equal(picks(calls)[0].playerUci, 'c2c4');
});

test('All funnels both sources without book preference and preserves book weights', async () => {
    const { mix, instance, calls, bookCalls } = harness();
    instance.getBookMoves = async () => [
        { from: 'c2', to: 'c4', weight: 9, fen },
        { from: 'g2', to: 'g4', weight: 1, fen }
    ];
    await mix.configure();
    const random = Math.random;
    try {
        for(const [rolls, expected, book] of [
            [[0, 0.95], 'g2g4', true],
            [[0.99, 0, 0], 'e2e4', false]
        ]) {
            Math.random = () => rolls.shift();
            mix.selections.clear();
            calls.length = 0;
            await mix.end(mix.begin(fen));
            assert.equal(picks(calls).length, 1);
            assert.equal(picks(calls)[0].player.join(''), expected);
            assert.equal(mix.selection.book, book);
            assert.deepEqual(bookCalls.at(-1).moves, []);
        }
    } finally {
        Math.random = random;
    }
});

test('book pools respect own-turn restrictions and the profile player color', async () => {
    const { mix, instance, calls } = harness({
        main: { onlyCalculateOwnTurn: true, suggestionMixPreferBook: true }
    });
    instance.currentFen = fen.replace(' w ', ' b ');
    instance.getBookMoves = async position => [{ from: 'e7', to: 'e5', weight: 100, fen: position }];
    await mix.configure();
    await mix.end(mix.begin(instance.currentFen));
    assert.equal(picks(calls).length, 0);
    instance.getPlayerColor = async () => 'b';
    await mix.render(true);
    assert.equal(picks(calls)[0].player.join(''), 'e7e5');
});
