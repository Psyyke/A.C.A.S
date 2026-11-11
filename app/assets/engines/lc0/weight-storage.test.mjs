import assert from 'node:assert/strict';
import test from 'node:test';
import { getLc0Weights } from './weight-storage.js';

test('unset selections load the bundled Maia 1500 asset without IndexedDB', async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async url => {
        calls.push(url.href);
        return new Response(new Uint8Array([1, 2, 3]));
    });
    for(const id of [undefined, null, '']) {
        const file = await getLc0Weights(id);
        assert.equal(file.name, 'maia-1500.pb');
        assert.equal(file.size, 3);
    }
    assert.deepEqual(calls, Array(3).fill(new URL('../../lc0-nets/maia-1500.pb', import.meta.url).href));
});

test('default network HTTP errors are reported rather than silently ignored', async t => {
    t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
    await assert.rejects(getLc0Weights(''), /default Maia 1500 weights: HTTP 404/);
});

test('empty default weights are rejected', async t => {
    t.mock.method(globalThis, 'fetch', async () => new Response(new ArrayBuffer(0)));
    await assert.rejects(getLc0Weights(''), /Default Maia 1500 weights are empty/);
});

test('default network loading receives the profile cancellation signal', async t => {
    const controller = new AbortController();
    controller.abort();
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(options.signal, controller.signal);
        options.signal.throwIfAborted();
    });
    await assert.rejects(getLc0Weights('', controller.signal), { name: 'AbortError' });
});

test('invalid selections do not select the default', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected default fetch'); });
    for(const id of [0, false, {}, []])
        await assert.rejects(getLc0Weights(id), /Invalid Lc0 weights selection/);
    assert.equal(fetch.mock.callCount(), 0);
});
