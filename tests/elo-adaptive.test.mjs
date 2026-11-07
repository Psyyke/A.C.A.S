import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateRating, nextOpponent, expectedScore, fisherInformation, opponentStep } from '../tools/eloeye/eloMatch.js';
import { parseCheckpoint, measurementProtocol } from '../tools/eloeye/storage.js';

const seeded = seed => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
};

function legacyOpponent(games) {
    let low = 0, high = 4000;
    for(let i = 0; i < 40; i++) {
        const rating = (low + high) / 2;
        const residual = games.reduce((sum, game) => sum + game.score - expectedScore(rating, game.opponent), 0)
            - (rating - 1500) / (600 ** 2 * Math.LN10 / 400);
        if(residual > 0) low = rating; else high = rating;
    }
    return Math.max(600, Math.min(2600, Math.round((low + high) / 200) * 100));
}

function simulate(rating, count, boards, seed, select = nextOpponent) {
    const random = seeded(seed);
    const games = [], pending = [];
    let started = 0;
    const launch = () => {
        pending.push({ opponent: select(games, pending, Math.min(boards, count)), acasIsWhite: started++ % 2 === 0 });
    };
    while(started < Math.min(boards, count)) launch();
    while(pending.length) {
        // Completion order is independent of both opponent strength and outcome.
        const index = Math.floor(random() * pending.length);
        const [game] = pending.splice(index, 1);
        const p = expectedScore(rating, game.opponent);
        const draw = 0.4 * Math.min(p, 1 - p);
        const u = random();
        game.score = u < p - draw / 2 ? 1 : u < p + draw / 2 ? 0.5 : 0;
        games.push(game);
        if(started < count) launch();
    }
    return games;
}

test('eight opening boards span the supported range without duplicate ratings', () => {
    const pending = [];
    for(let i = 0; i < 8; i++) pending.push({ opponent: nextOpponent([], pending, 8) });
    const ratings = pending.map(game => game.opponent);
    assert.equal(new Set(ratings).size, 8);
    assert.equal(Math.min(...ratings), 600);
    assert.equal(Math.max(...ratings), 2600);
    assert.ok(ratings.every(rating => rating % opponentStep === 0));
    assert.equal(nextOpponent([]), 1500);
});

test('follow-up selection concentrates near balanced results, not a single upset', () => {
    const games = Array.from({ length: 40 }, (_, i) => ({ opponent: 1900, score: i % 2 }));
    assert.ok(Math.abs(nextOpponent(games) - 1900) <= 100);
    games.push({ opponent: 2600, score: 1 });
    assert.ok(Math.abs(nextOpponent(games) - 1900) <= 100);
    assert.equal(nextOpponent(Array.from({ length: 20 }, () => ({ opponent: 2600, score: 1 }))), 2600);
    assert.equal(nextOpponent(Array.from({ length: 20 }, () => ({ opponent: 600, score: 0 }))), 600);
});

test('pending games are not scored and the selector leaves inputs unchanged', () => {
    const games = Object.freeze([Object.freeze({ opponent: 1700, score: 0.5 })]);
    const pending = Object.freeze(Array.from({ length: 7 }, () => Object.freeze({ opponent: 1700 })));
    const before = estimateRating(games);
    const opponent = nextOpponent(games, pending, 8);
    assert.ok(opponent >= 600 && opponent <= 2600);
    assert.deepEqual(estimateRating(games), before);
});

test('parallel Monte Carlo: 40 games locate in-range strengths with RMSE below 100', t => {
    let newEdgeInformation = 0, oldEdgeInformation = 0;
    for(const rating of [800, 1200, 1600, 2000, 2400]) {
        let squaredError = 0, errorSum = 0;
        const repetitions = 100;
        for(let i = 0; i < repetitions; i++) {
            const games = simulate(rating, 40, 8, 19 + i * 103);
            const error = estimateRating(games).rating - rating;
            squaredError += error ** 2;
            errorSum += error;
            if(rating === 800 || rating === 2400) {
                newEdgeInformation += fisherInformation(rating, games);
                oldEdgeInformation += fisherInformation(rating, simulate(rating, 40, 8, 19 + i * 103, legacyOpponent));
            }
        }
        const rmse = Math.sqrt(squaredError / repetitions);
        const bias = errorSum / repetitions;
        t.diagnostic(`${rating}: 8 boards / 40 games, RMSE ${rmse.toFixed(1)}, bias ${bias.toFixed(1)}`);
        assert.ok(rmse < 100, `RMSE ${rmse} at ${rating}`);
        assert.ok(Math.abs(bias) < 30, `bias ${bias} at ${rating}`);
    }
    t.diagnostic(`Information near range edges vs old selector: ${(newEdgeInformation / oldEdgeInformation).toFixed(2)}x`);
    assert.ok(newEdgeInformation > oldEdgeInformation);
});

test('checkpoints preserve completed observations and reject corrupt or incompatible data', () => {
    const checkpoint = {
        version: 1, protocol: measurementProtocol, mode: 'auto', total: 40, boards: 8,
        games: [{ opponent: 2200, score: 0.5, acasIsWhite: false, opening: 0 }]
    };
    assert.equal(parseCheckpoint(null), null);
    assert.deepEqual(parseCheckpoint(JSON.stringify(checkpoint)), checkpoint);
    for(const changed of [
        { version: 2 }, { protocol: undefined }, { protocol: 'old' },
        { protocol: 'maia-top-policy-paired-openings-weighted-hints-v1' },
        { protocol: 'maia-top-policy-paired-openings-direct-gui-weighted-hints-v2' },
        { protocol: 'maia-top-policy-paired-openings-pooled-personality-v5' },
        { mode: 'bad' }, { total: 0 }, { boards: 101 },
        { games: [{ ...checkpoint.games[0], opening: undefined }] },
        { games: [{ ...checkpoint.games[0], opening: 500 }] },
        { games: [{ opponent: 2800, score: 1, acasIsWhite: true }] },
        { games: [{ opponent: 1500, score: 2, acasIsWhite: true }] },
        { games: [{ opponent: 1500, score: 1 }] }
    ]) assert.throws(() => parseCheckpoint(JSON.stringify({ ...checkpoint, ...changed })));
    assert.throws(() => parseCheckpoint('{broken'));
    const selectionWeights = { best: 50, alternative: 0, secondary: 20, mistake: 10, blunder: 10, miss: 5, other: 5 };
    assert.deepEqual(parseCheckpoint(JSON.stringify({ ...checkpoint, selectionWeights })).selectionWeights, selectionWeights);
    assert.throws(() => parseCheckpoint(JSON.stringify({
        ...checkpoint, selectionWeights: { ...selectionWeights, blunder: 11 }
    })));
});
