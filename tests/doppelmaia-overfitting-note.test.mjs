import assert from 'node:assert/strict';
import test from 'node:test';
import { overfittingNote } from '../tools/doppelmaia/files.js';

const baseline = { trainLoss: 1.505, validationLoss: 1.479, validationAccuracy: 0.529 };
const overfit = { trainLoss: 1.433, validationLoss: 1.647, validationAccuracy: 0.499 };

test('suggests lowering the rate when training improves but validation loss and accuracy worsen', () => {
    assert.match(overfittingNote([baseline, overfit]), /may indicate overfitting.*lower learning rate/);
    assert.match(overfittingNote([baseline, overfit]), /lowest validation loss/);
});

test('does not diagnose overfitting from missing data or validation improvement', () => {
    for(const history of [undefined, [], [baseline], [baseline, { ...overfit, validationLoss: 1.4 }],
        [baseline, { ...overfit, trainLoss: 1.6 }], [baseline, { ...overfit, validationAccuracy: 0.55 }],
        [baseline, { ...overfit, trainLoss: NaN }]])
        assert.equal(overfittingNote(history), '');
});
