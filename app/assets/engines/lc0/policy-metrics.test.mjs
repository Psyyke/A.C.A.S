import assert from 'node:assert/strict';
import test from 'node:test';
import { comparePolicy, summarizePolicies } from './policy-metrics.mjs';

test('stable softmax ignores constant logit shifts and handles extreme values', () => {
    const result = comparePolicy([10000, 9999, -10000], [10010, 10009, -9990]);
    assert.equal(result.kl, 0);
    assert.equal(result.totalVariation, 0);
    assert.equal(result.top1Match, true);
});

test('KL direction and rank inversions match an analytic distribution', () => {
    const result = comparePolicy([Math.log(0.75), Math.log(0.25)], [Math.log(0.25), Math.log(0.75)]);
    assert.ok(Math.abs(result.kl - 0.5 * Math.log(3)) < 1e-12);
    assert.ok(Math.abs(result.totalVariation - 0.5) < 1e-12);
    assert.equal(result.top1Match, false);
    assert.equal(result.top3OrderMatch, false);
});

test('legal mask excludes illegal logits and labels unmasked diagnostics explicitly', () => {
    const result = comparePolicy([100, 2, 1], [-100, 2, 1], [1, 2]);
    assert.equal(result.kl, 0);
    assert.equal(result.scope, 'legal-moves');
    assert.deepEqual(result.referenceTop, [1, 2]);
    assert.equal(comparePolicy([1], [1]).scope, 'all-output-indices');
    assert.equal(comparePolicy([1], [1], [0]).referenceTopMargin, null);
});

test('rejects invalid logits and masks instead of reporting misleading metrics', () => {
    for(const [a, b, mask] of [[[], []], [[1], [NaN]], [[1], [1, 2]],
        [[1], [1], []], [[1], [1], [0, 0]], [[1], [1], [1]]])
        assert.throws(() => comparePolicy(a, b, mask));
});

test('summaries weight positions rather than tensor batches', () => {
    const a = comparePolicy([2, 1], [2, 1]);
    const b = comparePolicy([2, 1], [1, 2]);
    const result = summarizePolicies([a, b]);
    assert.equal(result.positions, 2);
    assert.equal(result.top1MatchRate, 0.5);
    assert.equal(result.meanKl, b.kl / 2);
    assert.throws(() => summarizePolicies([]));
    assert.throws(() => summarizePolicies([a, comparePolicy([1], [1], [0])]));
});
