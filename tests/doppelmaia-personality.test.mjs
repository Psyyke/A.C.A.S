import assert from 'node:assert/strict';
import test from 'node:test';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';
import { personalityTraits, personalityPresets, personalityCandidates, validatePersonality, validatePersonalityEvidence, personalityFeatures,
    personalityScores, personalityTargets } from '../tools/doppelmaia/personality.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateDataset } from '../tools/doppelmaia/data.js';
import { positionSignature, signatureKey } from '../tools/doppelmaia/repertoire.js';

const sample = fen => {
    const board = new Chess(fen);
    return { fen: board.fen(), legalMoves: board.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || '')) };
};

test('historical exploration candidates retain explicit bounded numeric controls', () => {
    assert.equal(personalityCandidates.length, 50);
    assert.equal(new Set(personalityCandidates.map(row => row.id)).size, 50);
    assert.equal(new Set(personalityCandidates.map(row => JSON.stringify([row.strength, row.weights]))).size, 50);
    for(const preset of personalityCandidates) {
        assert.deepEqual(validatePersonality(preset), { strength: preset.strength, weights: preset.weights });
        assert.equal(Object.keys(preset.weights).length, personalityTraits.length);
        assert.ok(Object.values(preset.weights).some(value => value !== 0));
    }
    const first = personalityPresets[0];
    for(const strength of [-1, 4, Infinity, NaN, '1'])
        assert.throws(() => validatePersonality({ ...first, strength }), /weights/);
    assert.throws(() => validatePersonality({ ...first, weights: { ...first.weights, unknown: 1 } }), /weights/);
    assert.throws(() => validatePersonality({ ...first, weights: { ...first.weights, knight: 5 } }), /weights/);
});

test('personality scores are legal, mover relative and consistently prefer their stated trait', () => {
    const board = new Chess(), white = sample(board.fen()), black = sample(board.fen().replace(' w ', ' b '));
    const w = personalityFeatures(white), b = personalityFeatures(black);
    for(let i = 0; i < white.legalMoves.length; i++) {
        const move = white.legalMoves[i], mirrored = move[0] + (9 - Number(move[1])) + move[2] + (9 - Number(move[3]));
        assert.deepEqual(w[i], b[black.legalMoves.indexOf(mirrored)]);
    }
    const knight = personalityCandidates.find(row => row.id === 'knight-fan');
    const scores = personalityScores(w, knight);
    assert.ok(scores[white.legalMoves.indexOf('g1f3')] > scores[white.legalMoves.indexOf('e2e4')]);
    const king = sample('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
    assert.ok(personalityFeatures(king).every(row => row.every(Number.isFinite)));
    assert.throws(() => personalityFeatures({ ...white, legalMoves: ['e2e5'] }), /Illegal/);
    assert.throws(() => personalityFeatures({ fen: 'not a board', legalMoves: ['e2e4'] }), /board position/);
});

test('soft personality teachers retain the base at zero and do not invent human labels', () => {
    const base = [1, 2, -1], ordinary = personalityTargets(base, [0, 0, 0]);
    const tilted = personalityTargets(base, [4, 0, 0]);
    assert.ok(tilted[0] > ordinary[0]);
    assert.ok(Math.abs(tilted.reduce((a, b) => a + b) - 1) < 1e-12);
    assert.deepEqual(personalityTargets(base, [5, 5, 5]), ordinary);
    assert.throws(() => personalityTargets(base, [0]), /logits/);
    assert.throws(() => personalityTargets(base, [0, NaN, 0]), /logits/);
});

test('bundled practice positions are legal complete datasets with no board leakage', async () => {
    const dataset = validateDataset(JSON.parse(await readFile(new URL('../tools/doppelmaia/personality-positions.json', import.meta.url), 'utf8')));
    const train = new Set(dataset.train.samples.map(row => signatureKey(positionSignature(row.fen))));
    assert.equal(train.size, dataset.train.samples.length);
    assert.ok(dataset.validation.samples.every(row => !train.has(signatureKey(positionSignature(row.fen)))));
    assert.ok(dataset.train.samples.length > 2000);
    assert.ok(dataset.validation.samples.length > 500);
    assert.equal(dataset.source.license, 'CC0');
});

test('preset evidence is bound to the exact shipped configuration', async () => {
    const evidence = JSON.parse(await readFile(new URL('../tools/doppelmaia/personality-evidence.json', import.meta.url), 'utf8'));
    assert.equal(evidence.version, 2);
    assert.equal(validatePersonalityEvidence(evidence), evidence);
    assert.throws(() => validatePersonalityEvidence({ ...evidence, version: 1 }), /Unsupported/);
    assert.throws(() => validatePersonalityEvidence({ ...evidence, curation: { ...evidence.curation, confirmed: false } }), /Unsupported/);
    assert.throws(() => validatePersonalityEvidence({ ...evidence, curation: { ...evidence.curation, selected: [] } }), /Unsupported/);
    assert.equal(evidence.browserDatasetSHA256, createHash('sha256')
        .update(await readFile(new URL('../tools/doppelmaia/personality-positions.json', import.meta.url))).digest('hex'));
    assert.equal(evidence.profiles.length, personalityCandidates.length);
    assert.equal(evidence.curation.confirmed, true);
    assert.deepEqual(evidence.curation.selected, personalityPresets.map(row => row.id));
    const thresholds = evidence.curation.protocol.thresholds;
    for(const preset of personalityPresets) {
        const checked = evidence.profiles.find(row => row.id === preset.id);
        assert.deepEqual(checked.configuration, preset);
        assert.equal(checked.passed, true);
        assert.ok(checked.learnedKL < checked.baseKL);
        assert.ok(checked.rolloutScoreChange > 0);
        const curated = evidence.curation.profiles.find(row => row.id === preset.id);
        assert.deepEqual(curated.configuration, preset);
        assert.equal(curated.eligible, true);
        assert.equal(curated.confirmation.passed, true);
        assert.equal(curated.confirmation.personalGames, 12);
        assert.equal(curated.confirmation.baseControlGames, 12);
        assert.ok(curated.confirmation.pairedOpeningScoreChange95.low > 0);
        assert.ok(curated.confirmation.positiveOpeningFraction >= thresholds.positiveOpeningFraction);
        assert.ok(curated.baseDeparture.JS >= thresholds.baseJS);
        assert.ok(curated.baseDeparture.topMoveDisagreement >= thresholds.baseTopMoveDisagreement);
    }
    const pairs = evidence.curation.pairs;
    assert.equal(pairs.length, personalityPresets.length * (personalityPresets.length - 1) / 2);
    assert.equal(new Set(pairs.map(row => [...row.profiles].sort().join(','))).size, pairs.length);
    for(const pair of pairs) {
        assert.equal(pair.distinct, true);
        assert.ok(pair.profiles.every(id => personalityPresets.some(row => row.id === id)));
        assert.ok(pair.JS >= thresholds.pairJS);
        assert.ok(pair.topMoveDisagreement >= thresholds.pairTopMoveDisagreement);
        assert.ok(pair.disagreement95.low >= thresholds.pairDisagreementLower95);
    }
});
