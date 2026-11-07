import test from 'node:test';
import assert from 'node:assert/strict';
import {
    maiaEloGrid, maiaTemperatures, moveLogLikelihoods
} from '../app/assets/engines/Maia3/likelihood.js';
import { MoveSampler, maxSamplesPerGame, estimateMoveEvidence, validMoveEvidence } from '../tools/eloeye/moveEvidence.js';
import { planBatch, ratingConfidence, automaticRun, automaticStatus } from '../tools/eloeye/eloPolicy.js';
import { estimateRating, expectedScore, fisherInformation } from '../tools/eloeye/eloMatch.js';
import { parseCheckpoint, measurementProtocol } from '../tools/eloeye/storage.js';

const joint = callback => maiaEloGrid.flatMap(elo => maiaTemperatures.map(temperature => callback(elo, temperature)));
const evidenceAt = (elo, temperature = 1) => ({
    version: 1, moves: 12,
    totals: joint((rating, temp) => -1 - 2 * ((rating - elo) / 200) ** 2 - 20 * (temp - temperature) ** 2)
});
const stripEvidence = games => games.map(({ moveEvidence, ...game }) => game);
const entry = (fullmove = 5, legalMoves = 20) => ({
    fen: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 ${fullmove}`,
    move: 'e2e4', legalMoves
});

test('temperature likelihoods are normalized exactly without sampling or extra inference', () => {
    const [ordinary, cool] = moveLogLikelihoods([{ policy: { e2e4: 0.8, d2d4: 0.2 } }], 'e2e4', [1, 0.5]);
    assert.ok(Math.abs(ordinary - Math.log(0.8)) < 1e-12);
    assert.ok(Math.abs(cool - Math.log(0.64 / 0.68)) < 1e-12);

    for(const temperature of maiaTemperatures) {
        const probabilities = ['e2e4', 'd2d4'].map(move =>
            Math.exp(moveLogLikelihoods([{ policy: { e2e4: 0.8, d2d4: 0.2 } }], move, [temperature])[0]));
        assert.ok(Math.abs(probabilities[0] + probabilities[1] - 1) < 1e-12);
    }
});

test('rare moves stay distinguishable and invalid policies or promotion aliases are rejected', () => {
    const result = probability => moveLogLikelihoods([{ policy: { e2e4: probability, d2d4: 1 - probability } }], 'e2e4')[0];
    assert.ok(result(1e-6) < result(1e-5) - 2);
    assert.ok(Number.isFinite(result(0)));
    for(const policy of [{}, { e2e4: -1 }, { e2e4: 0 }, { e2e4: NaN }, { e2e4: Infinity }]) {
        assert.throws(() => moveLogLikelihoods([{ policy }], 'e2e4'));
    }
    assert.throws(() => moveLogLikelihoods([{ policy: { a7a8: 1 } }], 'a7a8n'));
    assert.throws(() => moveLogLikelihoods([{ policy: { e2e4: 1 } }], 'e2e4', [0]));
    assert.throws(() => moveLogLikelihoods([], 'e2e4'));
});

test('joint fit recovers informative Elo and temperature but does not rate empty or flat evidence', () => {
    const estimate = estimateMoveEvidence([{ moveEvidence: evidenceAt(2200, 0.5) }]);
    assert.ok(Math.abs(estimate.elo - 2200) < 50);
    assert.ok(Math.abs(estimate.temperature - 0.5) < 0.1);
    assert.equal(estimate.moves, 12);
    assert.equal(estimateMoveEvidence([]), null);
    assert.equal(estimateMoveEvidence([{ moveEvidence: { ...evidenceAt(2200), moves: 5 } }]), null);
    assert.equal(estimateMoveEvidence([{ moveEvidence: { ...evidenceAt(2200), totals: joint(() => -1) } }]), null);
});

test('one temperature must explain the whole run instead of changing for every move', () => {
    const sample = preferred => ({
        version: 1, moves: 6,
        totals: joint((elo, temperature) => elo === 1000 && temperature === preferred ? -1
            : elo === 1600 && temperature === 1 ? -3 : -20)
    });
    const games = [0.25, 2].map(temperature => ({ moveEvidence: sample(temperature) }));
    const estimate = estimateMoveEvidence(games);
    assert.ok(Math.abs(estimate.elo - 1600) < 20, JSON.stringify(estimate));
    assert.ok(Math.abs(estimate.temperature - 1) < 0.05);
});

test('sampler skips books, forced moves, repeated positions and busy work with a hard sample bound', async () => {
    let release, requests = 0, updates = 0;
    const errors = [];
    const sampler = new MoveSampler({
        likelihood() {
            requests++;
            return new Promise(resolve => { release = resolve; });
        }
    }, () => updates++, error => errors.push(error));

    sampler.observe(entry(4));
    sampler.observe(entry(5, 1));
    assert.equal(requests, 0);
    sampler.observe(entry());
    sampler.observe(entry(6));
    assert.equal(requests, 1);
    release(evidenceAt(1800).totals);
    await sampler.finish();
    sampler.observe(entry(7));
    assert.equal(requests, 1, 'move clocks do not make a repeated position new');

    for(let i = 1; i < maxSamplesPerGame; i++) {
        sampler.observe({ ...entry(), fen: `position-${i} w - - 0 5` });
        release(evidenceAt(1800).totals);
        await sampler.finish();
    }
    sampler.observe({ ...entry(), fen: 'last w - - 0 5' });
    assert.equal(requests, maxSamplesPerGame);
    assert.equal(updates, maxSamplesPerGame);
    assert.equal(errors.length, 0);
    const saved = await sampler.finish();
    saved.totals[0] = 1;
    assert.ok(validMoveEvidence(await sampler.finish()), 'returned snapshots cannot mutate the sampler');
});

test('sampler reports inference and malformed-output failures without inventing evidence', async () => {
    for(const result of [Promise.reject(new Error('inference failed')), Promise.resolve([0])]) {
        const errors = [];
        const sampler = new MoveSampler({ likelihood: () => result }, () => assert.fail('must not report success'), error => errors.push(error));
        sampler.observe(entry());
        assert.equal((await sampler.finish()).moves, 0);
        assert.equal(errors.length, 1);
        assert.match(errors[0].message, /failed|invalid move evidence/);
    }
});

test('completed evidence round-trips, old checkpoints remain valid and partial evidence is rejected', () => {
    const games = planBatch([], 2).map(game => ({ ...game, score: 0.5, moveEvidence: evidenceAt(1800) }));
    const saved = { version: 2, protocol: measurementProtocol, mode: 'auto', total: 256, boards: 2, games, batch: [] };
    assert.deepEqual(parseCheckpoint(JSON.stringify(saved)), saved);
    const partial = { ...saved, games: [], batch: [{ ...games[0], score: undefined }] };
    assert.throws(() => parseCheckpoint(JSON.stringify(partial)));
    const legacy = { ...saved, games: stripEvidence(games) };
    assert.deepEqual(parseCheckpoint(JSON.stringify(legacy)), legacy);

    for(const moveEvidence of [
        { ...evidenceAt(1800), version: 2 }, { ...evidenceAt(1800), moves: 25 },
        { ...evidenceAt(1800), moves: 0 }, { ...evidenceAt(1800), totals: [0] },
        { ...evidenceAt(1800), totals: joint(() => 1) }, { ...evidenceAt(1800), totals: joint(() => NaN) },
        { ...evidenceAt(1800), totals: joint(() => -1e300) }
    ]) {
        assert.throws(() => parseCheckpoint(JSON.stringify({
            ...saved, games: [{ ...games[0], moveEvidence }]
        })));
    }
});

test('move evidence guides only early completed groups, never the final estimate or stopping', () => {
    const games = planBatch([], 2).map((game, i) => ({
        ...game, score: i, moveEvidence: evidenceAt(2400)
    }));
    const baseline = stripEvidence(games);
    assert.ok(planBatch(games, 2)[0].opponent > planBatch(baseline, 2)[0].opponent);
    assert.deepEqual(ratingConfidence(games), ratingConfidence(baseline));
    assert.deepEqual(estimateRating(games), estimateRating(baseline));
    assert.deepEqual(automaticStatus(games), automaticStatus(baseline));

    const later = Array.from({ length: automaticRun.minGames }, (_, index) => games[index % 2]);
    assert.deepEqual(planBatch(later), planBatch(stripEvidence(later)));
    const restored = JSON.parse(JSON.stringify(games));
    assert.deepEqual(planBatch(restored), planBatch(games));
});

test('hybrid simulations quantify early information and tolerate misleading move resemblance', t => {
    let baselineInformation = 0, guidedInformation = 0, squaredError = 0, misses = 0;
    const repetitions = 30;

    for(let seed = 0; seed < repetitions; seed++) {
        const rating = seed % 2 ? 800 : 2400;

        for(const mode of ['baseline', 'helpful', 'misleading']) {
            let randomState = 7651 + seed * 103;
            const random = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 2 ** 32);
            const games = [];
            let missed = false;

            while(!automaticStatus(games).done) {
                const batch = planBatch(games, 2);
                for(const game of batch) {
                    game.score = random() < expectedScore(rating, game.opponent) ? 1 : 0;
                    if(mode !== 'baseline' && games.length < automaticRun.minGames) {
                        game.moveEvidence = evidenceAt(mode === 'helpful' ? rating : 3200 - rating);
                    }
                }
                games.push(...batch);
                const interval = ratingConfidence(games);
                missed ||= rating < interval.low || rating > interval.high;
            }

            const earlyInformation = fisherInformation(rating, games.slice(0, automaticRun.minGames));
            if(mode === 'baseline') baselineInformation += earlyInformation;
            if(mode === 'helpful') guidedInformation += earlyInformation;
            if(mode === 'misleading') {
                squaredError += (estimateRating(games).rating - rating) ** 2;
                misses += Number(missed);
            }
        }
    }

    const informationRatio = guidedInformation / baselineInformation;
    const rmse = Math.sqrt(squaredError / repetitions);
    t.diagnostic(`Helpful resemblance: early information ${informationRatio.toFixed(3)}x baseline; misleading resemblance: RMSE ${rmse.toFixed(1)}, anytime misses ${misses}/${repetitions}`);
    assert.ok(informationRatio > 1);
    assert.ok(rmse < 60);
    assert.ok(misses <= 4);
});
