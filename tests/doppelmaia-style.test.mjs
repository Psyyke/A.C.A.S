import assert from 'node:assert/strict';
import test from 'node:test';
import { makeStyleStudy, randomizeTrainingLabels, modelPositionKey, knightChoices, summarizeStyle } from '../tools/doppelmaia/experiments/style-data.mjs';
import { validateDataset } from '../tools/doppelmaia/data.js';

test('style study uses legal knight targets, isolated games and no identical Maia 3 inputs across splits', () => {
    const study = makeStyleStudy({ seed: 125, trainGames: 8, validationGames: 4, testGames: 4,
        trainPositions: 60, validationPositions: 25, testPositions: 25 });
    validateDataset(study.dataset);
    const games = new Set(), positions = new Set();
    for(const split of [study.dataset.train, study.dataset.validation, study.test]) {
        assert.ok(split.samples.length >= 20);
        for(const id of split.gameIds) { assert.ok(!games.has(id)); games.add(id); }
        for(const sample of split.samples) {
            const key = modelPositionKey(sample.fen), choices = knightChoices(sample);
            assert.ok(!positions.has(key)); positions.add(key);
            assert.equal(choices[sample.legalMoves.indexOf(sample.move)], true);
            assert.ok(choices.some(choice => !choice));
        }
    }
    const randomized = randomizeTrainingLabels(study.dataset);
    assert.deepEqual(randomized.validation, study.dataset.validation);
    assert.ok(randomized.train.samples.some((sample, i) => sample.move !== study.dataset.train.samples[i].move));
    for(const sample of randomized.train.samples) assert.ok(sample.legalMoves.includes(sample.move));
    assert.equal(modelPositionKey('8/8/8/8/4P3/8/8/8 w - - 0 1'),
        modelPositionKey('8/8/8/4p3/8/8/8/8 b - - 0 1'));
});

test('game-cluster style intervals are paired, deterministic and not position-independent claims', () => {
    const samples = [{ gameId: 'a' }, { gameId: 'a' }, { gameId: 'b' }];
    const rows = value => samples.map(() => ({ knightProbability: value, knightTop1: value > 0.5,
        moveMatch: false, crossEntropy: 2 }));
    const result = summarizeStyle(samples, rows(0.1), rows(0.7), rows(0.2));
    assert.equal(result.testGames, 2);
    assert.ok(Math.abs(result.knightProbabilityGainVsBase95.low - 0.6) < 1e-10);
    assert.ok(Math.abs(result.knightProbabilityGainVsRandomLabels95.high - 0.5) < 1e-10);
    assert.deepEqual(result, summarizeStyle(samples, rows(0.1), rows(0.7), rows(0.2)));
});
