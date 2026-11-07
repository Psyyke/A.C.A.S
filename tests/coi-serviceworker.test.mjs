import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('service worker propagates network errors instead of returning undefined', async () => {
    const script = await readFile(new URL('../app/coi-serviceworker.js', import.meta.url), 'utf8');
    const listeners = {};
    const failure = new Error('network failed');
    const logged = [];
    const self = { addEventListener: (type, listener) => { listeners[type] = listener; } };
    vm.runInNewContext(script, {
        self, fetch: () => Promise.reject(failure),
        console: { error: error => logged.push(error) }
    });
    let response;
    listeners.fetch({
        request: { cache: 'default', mode: 'same-origin' },
        respondWith: promise => { response = promise; }
    });
    await assert.rejects(response, error => error === failure);
    assert.deepEqual(logged, [failure]);
});
