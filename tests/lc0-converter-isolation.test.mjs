import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../tools/leela2onnx/leela2onnx.js', import.meta.url), 'utf8');
const prepare = source.slice(source.indexOf('async function prepare()'), source.indexOf('\nprepare().catch'));
const run = new Function('navigator', 'window', 'location', 'sessionStorage', 'crossOriginIsolated',
    'SharedArrayBuffer', 'URL', 'convert', 'setStatus', 'setTimeout', 'clearTimeout',
    `let ready = false; ${prepare}; return prepare();`);

function fixture(registration, controller = null) {
    const stored = new Map(), events = [];
    const serviceWorker = { controller, register: async () => registration };
    const location = { href: 'http://localhost/A.C.A.S/tools/leela2onnx/', reload: () => events.push('reload') };
    const storage = {
        getItem: key => stored.get(key),
        setItem: (key, value) => stored.set(key, value),
        removeItem: key => stored.delete(key)
    };
    const convert = { disabled: false };
    return {
        events, convert, stored,
        start: () => run({ serviceWorker }, { isSecureContext: true }, location, storage, true,
            SharedArrayBuffer, URL, convert, message => events.push(message), setTimeout, clearTimeout)
    };
}

test('active worker without page control reloads immediately instead of waiting for controllerchange', async () => {
    const f = fixture({ active: {} });
    await f.start();
    assert.deepEqual(f.events, ['reload']);
    assert.equal(f.convert.disabled, true);
    await assert.rejects(f.start(), /active but cannot control/);
    assert.deepEqual(f.events, ['reload'], 'Recovery must not loop indefinitely');
});

test('fresh install waits for activation then reloads for isolation headers', async () => {
    let listener;
    const worker = {
        state: 'installing',
        addEventListener: (type, callback) => { listener = callback; },
        removeEventListener() {}
    };
    const f = fixture({ installing: worker });
    const pending = f.start();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.events, []);
    worker.state = 'activated';
    listener();
    await pending;
    assert.deepEqual(f.events, ['reload']);
});

test('matching controller starts normally and clears the reload guard', async () => {
    const f = fixture({ active: {} }, { scriptURL: 'http://localhost/A.C.A.S/tools/leela2onnx/coi-serviceworker.js' });
    f.stored.set('lc0-isolation-reload:http://localhost/A.C.A.S/tools/leela2onnx/coi-serviceworker.js', '1');
    await f.start();
    assert.deepEqual(f.events, ['Ready.']);
    assert.equal(f.convert.disabled, false);
    assert.equal(f.stored.size, 0);
});
