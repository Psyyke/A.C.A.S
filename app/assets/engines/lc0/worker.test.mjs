import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { lc0ConfigContents } from '../text-files.js';

const source = await readFile(new URL('./worker.js', import.meta.url), 'utf8');
const importLine = "import createLc0 from './dist/lc0.js';";
assert.ok(source.startsWith(importLine));
const workerFactory = new Function('createLc0', 'self', 'lc0ConfigContents', 'installWorkerProxy', source.replace(/^import .*;\r?\n/gm, ''));
const startWorker = (createLc0, self) => workerFactory(createLc0, self, lc0ConfigContents, () => {});

test('strips terminal control sequences from diagnostics and UCI output', async () => {
    const messages = [];
    const self = { crossOriginIsolated: true, postMessage: message => messages.push(message) };
    startWorker(async options => {
        options.printErr('\x1b[1m\x1b[31mLc0 banner\x1b[0m');
        options.print('\x1b[32mbestmove a1a1\x1b[0m');
        options.printErr('Loading weights file from: /network.pb');
        throw new Error('');
    }, self);
    await self.onmessage({ data: { type: 'initialize', weights: new Uint8Array([1]).buffer } });
    assert.deepEqual(messages, [
        { type: 'log', line: 'Lc0 banner' },
        { type: 'uci', line: 'bestmove 0000' },
        { type: 'log', line: 'Loading weights file from: /network.pb' },
        { type: 'error', message: 'Loading weights file from: /network.pb' }
    ]);
});

test('reports the Lc0 diagnostic when an initialization exception has no message', async () => {
    const messages = [];
    const self = { crossOriginIsolated: true, postMessage: message => messages.push(message) };
    startWorker(async options => {
        options.printErr('Unhandled exception: std::bad_alloc');
        throw new Error('');
    }, self);
    await self.onmessage({ data: { type: 'initialize', weights: new Uint8Array([1]).buffer } });
    assert.deepEqual(messages.at(-1), { type: 'error', message: 'Unhandled exception: std::bad_alloc' });
});

test('reports the Lc0 diagnostic when an abort has no message', async () => {
    const messages = [];
    const self = { crossOriginIsolated: true, postMessage: message => messages.push(message) };
    startWorker(async options => {
        options.printErr('Unhandled exception: std::bad_alloc');
        options.onAbort('');
        throw new Error('');
    }, self);
    await self.onmessage({ data: { type: 'initialize', weights: new Uint8Array([1]).buffer } });
    assert.ok(messages.some(message => message.type === 'error'
        && message.message === 'Unhandled exception: std::bad_alloc'));
});

test('gives the weights buffer to MEMFS without copying', async () => {
    const messages = [], writes = [];
    const self = { crossOriginIsolated: true, postMessage: message => messages.push(message) };
    startWorker(async () => ({
        FS: { writeFile: (...args) => writes.push(args) },
        ccall() {}
    }), self);
    const weights = new Uint8Array([1, 2, 3]).buffer;
    await self.onmessage({ data: { type: 'initialize', weights } });
    assert.equal(writes[0][0], '/network.pb');
    assert.equal(writes[0][1].buffer, weights);
    assert.deepEqual(writes[0][2], { canOwn: true });
    assert.deepEqual(messages.at(-1), { type: 'ready' });
});

test('rejects invalid inference precision or float16 without WebGPU', async () => {
    const messages = [];
    const self = { crossOriginIsolated: true, postMessage: message => messages.push(message) };
    startWorker(() => { throw new Error('Should not initialize'); }, self);
    const weights = new Uint8Array([1]).buffer;
    await self.onmessage({ data: { type: 'initialize', weights, inferenceDataType: 'half' } });
    await self.onmessage({ data: { type: 'initialize', weights, inferenceDataType: 'f16', provider: 'wasm' } });
    await self.onmessage({ data: { type: 'initialize', weights, inferenceDataType: 'f16-mixed' } });
    assert.match(messages[0].message, /f32, f16 or f16-mixed/);
    assert.match(messages[1].message, /requires the WebGPU/);
    assert.match(messages[2].message, /requires the WebGPU or WASM ONNX/);
});
