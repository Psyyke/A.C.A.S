import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedScore, estimateRating, fisherInformation, nextOpponent } from '../tools/eloeye/eloMatch.js';
import { automaticStatus, automaticRun, automaticEstimate, planBatch, ratingConfidence, batchSizeForBoards } from '../tools/eloeye/eloPolicy.js';
import { parseCheckpoint, measurementProtocol } from '../tools/eloeye/storage.js';

const seeded = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

function simulate(rating, seed, boards, colorAdvantage = 0, groupSize = batchSizeForBoards(boards)) {
    const random = seeded(seed), games = [];
    let duration = 0, everMissed = false;
    while(!automaticStatus(games).done) {
        const batch = planBatch(games, Math.min(groupSize, automaticRun.maxGames - games.length));
        const lanes = Array(boards).fill(0);
        for(const game of batch) {
            const p = expectedScore(rating + (game.acasIsWhite ? colorAdvantage : -colorAdvantage), game.opponent);
            const draw = 0.4 * Math.min(p, 1 - p), u = random();
            game.score = u < p - draw / 2 ? 1 : u < p + draw / 2 ? 0.5 : 0;
            // Strong outcome-dependent delays must not change selection or stopping.
            const time = (game.score === 1 ? 0.4 : game.score === 0 ? 2 : 3) + random();
            const lane = lanes.indexOf(Math.min(...lanes));
            lanes[lane] += time;
        }
        duration += Math.max(...lanes);
        games.push(...batch);
        const { low, high } = ratingConfidence(games);
        everMissed ||= rating < low || rating > high;
    }
    return { games, error: estimateRating(games).rating - rating, duration, everMissed, ...automaticStatus(games) };
}

test('planned batches balance colors at each opponent strength', () => {
    const batch = planBatch([]);
    assert.deepEqual(batch.map(game => game.opponent), [1000, 1000, 2200, 2200]);
    assert.deepEqual(batch.map(game => game.acasIsWhite), [true, false, true, false]);
    const six = planBatch([], 6);
    assert.deepEqual(six.map(game => game.opponent), [1000, 1000, 1600, 1600, 2200, 2200]);
    assert.deepEqual(six.map(game => game.acasIsWhite), [true, false, true, false, true, false]);
    assert.deepEqual(planBatch([], 2).map(game => game.opponent), [1500, 1500]);
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(batchSizeForBoards), [2, 2, 4, 4, 6, 6]);
    assert.deepEqual([7, 8, 9, 10].map(batchSizeForBoards), [8, 8, 10, 10]);
    for(const invalid of [0, 11, 1.5]) assert.throws(() => batchSizeForBoards(invalid));
});

test('completion times cannot change the experiment within each group size', () => {
    for(const rating of [800, 1600, 2400]) {
        for(const boards of [2, 3, 4, 5, 6]) {
            const serial = simulate(rating, 731, 1, 0, batchSizeForBoards(boards));
            const parallel = simulate(rating, 731, boards);
            assert.deepEqual(parallel.games, serial.games);
            assert.equal(parallel.reason, serial.reason);
            assert.equal(parallel.error, serial.error);
            assert.ok(parallel.duration <= serial.duration);
        }
    }
});

test('all board counts retain useful information and measured precision', t => {
    for(const boards of [1, 2, 3, 4, 5, 6]) {
        let squared = 0, bias = 0, misses = 0, count = 0, duration = 0, efficiency = 0;
        const repetitions = 45;
        for(let seed = 0; seed < repetitions; seed++) {
            const rating = [800, 1600, 2400][seed % 3];
            const result = simulate(rating, 6541 + seed * 79, boards);
            squared += result.error ** 2;
            bias += result.error;
            misses += Number(result.everMissed);
            count += result.games.length;
            duration += result.duration;
            efficiency += fisherInformation(rating, result.games) / (result.games.length * (Math.LN10 / 400) ** 2 / 4);
        }
        const rmse = Math.sqrt(squared / repetitions);
        t.diagnostic(`${boards} boards: RMSE ${rmse.toFixed(1)}, bias ${(bias / repetitions).toFixed(1)}, misses ${misses}/${repetitions}, games ${(count / repetitions).toFixed(1)}, simulated duration ${(duration / repetitions).toFixed(1)}, information ${(100 * efficiency / repetitions).toFixed(1)}%`);
        assert.ok(rmse < 45, `${boards} boards RMSE ${rmse}`);
        assert.ok(Math.abs(bias / repetitions) < 20);
        assert.ok(misses <= 5);
        assert.ok(efficiency / repetitions > 0.85);
    }
});

test('automatic simulations measure error, stopping coverage and work', t => {
    for(const rating of [800, 1200, 1600, 2000, 2400]) {
        let squared = 0, bias = 0, count = 0, missed = 0, budgets = 0, efficiency = 0;
        const repetitions = 100;
        for(let seed = 0; seed < repetitions; seed++) {
            const result = simulate(rating, 1337 + seed * 103, 4);
            squared += result.error ** 2;
            bias += result.error;
            count += result.games.length;
            missed += Number(result.everMissed);
            budgets += Number(result.reason === 'budget');
            efficiency += fisherInformation(rating, result.games) / (result.games.length * (Math.LN10 / 400) ** 2 / 4);
        }
        const rmse = Math.sqrt(squared / repetitions);
        t.diagnostic(`${rating}: RMSE ${rmse.toFixed(1)}, bias ${(bias / repetitions).toFixed(1)}, games ${(count / repetitions).toFixed(1)}, any-time misses ${missed}/${repetitions}, budget stops ${budgets}, information efficiency ${(100 * efficiency / repetitions).toFixed(1)}%`);
        assert.ok(rmse < 40, `RMSE ${rmse} at ${rating}`);
        assert.ok(Math.abs(bias / repetitions) < 15);
        assert.ok(missed <= 8);
        assert.ok(budgets >= repetitions * 0.9,
            'The tighter precision target normally exceeds the 1000-game budget');
        assert.ok(efficiency / repetitions > 0.85);
    }
});

test('complete and partial version-2 groups round-trip without losing scheduling order', () => {
    const batch = planBatch([]);
    batch[2].score = 1;
    const state = { version: 2, protocol: measurementProtocol, mode: 'auto', total: automaticRun.maxGames, boards: 4, games: [], batch };
    assert.deepEqual(parseCheckpoint(JSON.stringify(state)), state);
    assert.throws(() => parseCheckpoint(JSON.stringify({ ...state, batch: [...batch, ...batch, ...batch] })));
    assert.deepEqual(parseCheckpoint(JSON.stringify({ ...state, batch: planBatch([], 6) })).batch, planBatch([], 6));
    assert.deepEqual(parseCheckpoint(JSON.stringify({ ...state, boards: 10, batch: planBatch([], 10) })).batch, planBatch([], 10));
});

test('automatic runs target 25 Elo and stop honestly at the 1000-game cap', () => {
    assert.equal(automaticRun.maxGames, 1000);
    assert.equal(automaticRun.halfWidth, 25);
    const games = Array.from({ length: 1000 }, () => ({ opponent: 1600, score: 0.5 }));
    assert.equal(automaticStatus(games.slice(0, 996)).done, false);
    const capped = automaticStatus(games);
    assert.equal(capped.reason, 'budget');
    assert.ok(capped.high - capped.low > 50);
    const precise = automaticStatus([...games, ...games, ...games]);
    assert.equal(precise.reason, 'precision');
    assert.ok(precise.high - precise.low <= 50);
});

test('opponents can use finer ratings and the last opening survives a checkpoint', () => {
    const games = Array.from({ length: 40 }, () => ({ opponent: 1537, score: 0.5 }));
    const opponent = nextOpponent(games);
    assert.equal(opponent, 1540);
    assert.notEqual(opponent % 100, 0);
    const state = {
        version: 2, protocol: measurementProtocol, mode: 'auto', total: 1000,
        boards: 2, games: [{ opponent, score: 0.5, acasIsWhite: true, opening: 499 }], batch: []
    };
    assert.deepEqual(parseCheckpoint(JSON.stringify(state)), state);
    assert.throws(() => parseCheckpoint(JSON.stringify({ ...state, total: 1001 })));
    assert.throws(() => parseCheckpoint(JSON.stringify({
        ...state, games: [{ ...state.games[0], opening: 500 }]
    })));
});

test('ordinary estimates at the ceiling do not become confident range exits', () => {
    const games = Array.from({ length: 4 }, () => ({ opponent: 1500, score: 1 }));
    assert.equal(automaticEstimate(games).status, 'upper-edge');
    assert.equal(automaticEstimate(games).reason, null);
    const budget = Array.from({ length: automaticRun.maxGames }, () => ({ opponent: 600, score: 1 }));
    assert.equal(automaticStatus(budget).reason, 'budget');
    assert.ok(automaticStatus(budget).high - automaticStatus(budget).low > 200);
});

test('holdout simulations tolerate color advantage without large systematic error', () => {
    for(const rating of [900, 1700, 2300]) {
        let error = 0, squared = 0;
        for(let seed = 0; seed < 40; seed++) {
            const result = simulate(rating, 9127 + seed * 59, 4, 80);
            error += result.error;
            squared += result.error ** 2;
        }
        assert.ok(Math.abs(error / 40) < 20, `color-shift bias at ${rating}: ${error / 40}`);
        assert.ok(Math.sqrt(squared / 40) < 45);
    }
});

test('range exits require evidence, not a single perfect score', () => {
    assert.equal(automaticStatus([{ opponent: 2600, score: 1 }]).done, false);
    const above = simulate(3000, 181, 4);
    const below = simulate(200, 181, 4);
    assert.equal(above.reason, 'above');
    assert.equal(below.reason, 'below');
    assert.ok(above.games.length < automaticRun.maxGames);
    assert.ok(below.games.length < automaticRun.maxGames);
});
