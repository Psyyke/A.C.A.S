import assert from 'node:assert/strict';
import test from 'node:test';
import { trackLc0WeightUpload, cancelLc0WeightUpload, confirmLc0WeightLoaded } from '../app/assets/js/gui/lc0WeightNotifications.js';

test('waiting toast closes on cancellation or replacement without reporting success', () => {
    const previous = globalThis.toast;
    const events = [];
    globalThis.toast = {
        instance: (message, duration, waitingNote) => {
            assert.equal(duration, undefined);
            assert.equal(waitingNote, 'Large weights can take a while to prepare. Confirmation waits until analysis starts.');
            events.push(message);
            return { close: () => events.push('closed') };
        },
        success: () => assert.fail('Cancelled uploads must not report success')
    };
    try {
        trackLc0WeightUpload('test', 'first.pb');
        trackLc0WeightUpload('test', 'replacement.pb');
        cancelLc0WeightUpload('test');
        cancelLc0WeightUpload('test');
        confirmLc0WeightLoaded('test');
        assert.deepEqual(events, [
            'Loading Lc0 weights: first.pb', 'closed',
            'Loading Lc0 weights: replacement.pb', 'closed'
        ]);
    } finally {
        if(previous === undefined) delete globalThis.toast;
        else globalThis.toast = previous;
    }
});
