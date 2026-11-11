import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../tools/leela2onnx/coi-serviceworker.js', import.meta.url), 'utf8');
async function request(fetch, mode = 'navigate') {
    let handler, response;
    const errors = [];
    vm.runInNewContext(source, {
        self: { registration: { scope: 'https://example.test/tools/doppelmaia/' },
            addEventListener(name, callback) { if(name === 'fetch') handler = callback; } },
        URL, Request, Response, Headers, fetch,
        console: { error: (...args) => errors.push(args) }
    });
    handler({ request: { url: 'https://example.test/tools/doppelmaia/', mode, method: 'GET', cache: 'default' },
        respondWith(value) { response = value; } });
    return { response: await response, errors };
}

test('transient navigation failures retry once and preserve isolation headers', async () => {
    let calls = 0;
    const result = await request(async (_target, options) => {
        if(++calls === 1) throw new TypeError('Failed to fetch');
        assert.equal(options.cache, 'reload');
        return new Response('Tool page');
    });
    assert.equal(calls, 2);
    assert.equal(result.errors.length, 1);
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.get('Cross-Origin-Embedder-Policy'), 'require-corp');
    assert.equal(await result.response.text(), 'Tool page');
});

test('persistent navigation failures show an explicit noncached retry page instead of rejecting', async () => {
    let calls = 0;
    const result = await request(async () => { calls++; throw new TypeError('Failed to fetch'); });
    assert.equal(calls, 2);
    assert.equal(result.errors.length, 2);
    assert.equal(result.response.status, 503);
    assert.equal(result.response.headers.get('Cache-Control'), 'no-store');
    assert.match(await result.response.text(), /Could not load this tool.*Try again/s);
});

test('failed resource fetches report failure without silently retrying background requests', async () => {
    let calls = 0;
    const result = await request(async () => { calls++; throw new TypeError('Failed to fetch'); }, 'cors');
    assert.equal(calls, 1);
    assert.equal(result.response.status, 503);
    assert.match(await result.response.text(), /could not fetch this resource/);
});
