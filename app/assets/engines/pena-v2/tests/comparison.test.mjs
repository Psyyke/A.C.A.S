import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonMessages, checkComparisonInputs, assessComparisonAnswer, presentComparisonAnswer } from '../comparison.js';

const evidence = JSON.stringify({ schema: 'pena-v2-evidence/1', question: 'Why Nf3?', claims: [{ id: 'claim-1' }] });
const input = { id: 'test', question: 'Why Nf3?', evidence, messages: comparisonMessages('Why Nf3?', evidence) };

test('matched comparison rejects changed evidence/questions or model-specific messages', () => {
    assert.doesNotThrow(() => checkComparisonInputs([input]));
    assert.throws(() => checkComparisonInputs([input, input]), /distinct/);
    assert.throws(() => checkComparisonInputs([{ ...input, question: 'What now?' }]), /mismatch/);
    assert.throws(() => checkComparisonInputs([{ ...input, messages: comparisonMessages('Different question', evidence) }]), /differs/);
});

test('comparison checks preserve raw explanations and flag invented references or thinking markup', () => {
    const raw = 'Nf3 develops your knight [claim-1], but the win is not proven [claim-99].';
    assert.deepEqual(assessComparisonAnswer(raw, evidence).unknownReferences, ['claim-99']);
    assert.equal(assessComparisonAnswer(raw, evidence).empty, false);
    assert.equal(assessComparisonAnswer('<think>not disabled</think>', evidence).reasoningMarkup, true);
    assert.equal(assessComparisonAnswer('', evidence).empty, true);
    assert.deepEqual(assessComparisonAnswer('Reason [claim-1, claim-99][candidate-2].', evidence).unknownReferences, ['claim-99', 'candidate-2']);
});

test('non-thinking presentation removes only the exact empty runtime prefix', () => {
    const answer = "The bishop on d3 attacks d5. This claim is wrong and must remain visible in evaluation.";
    assert.equal(presentComparisonAnswer('<think>\n\n</think>\n\n' + answer), answer);
    assert.equal(presentComparisonAnswer('<think>Actual generated reasoning</think>\n' + answer), '<think>Actual generated reasoning</think>\n' + answer);
    assert.equal(presentComparisonAnswer(answer), answer);
});

