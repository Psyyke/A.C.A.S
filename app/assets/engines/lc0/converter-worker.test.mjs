import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./converter-worker.js', import.meta.url), 'utf8');
const importLine = "import createLc0 from './dist/lc0.js';";
assert.ok(source.startsWith(importLine));
const workerFactory = new Function('createLc0', 'self', 'installWorkerProxy', source.replace(/^import .*;\r?\n/gm, ''));
function startWorker(createLc0, self) {
    workerFactory(createLc0, self, () => {});
}

test('strips terminal colors from converter logs and failure diagnostics', async () => {
    const messages = [];
    const self = { crossOriginIsolated: true, postMessage: message => messages.push(message) };
    startWorker(async options => {
        options.print('\x1b[1m\x1b[31mLc0 banner\x1b[0m');
        options.printErr('\x1b[31mConversion failed\x1b[0m');
        throw new Error('');
    }, self);
    await self.onmessage({ data: { type: 'convert', weights: new ArrayBuffer(1) } });
    assert.deepEqual(messages, [
        { type: 'log', line: 'Lc0 banner' },
        { type: 'log', line: 'Conversion failed' },
        { type: 'error', message: 'Conversion failed' }
    ]);
});

function setupWorker(failTransfer = false) {
    const messages = [], writes = [], unlinked = [], argumentsList = [];
    const self = {
        crossOriginIsolated: true,
        postMessage(message, transfer) {
            if(message.type === 'converted' && failTransfer)
                throw new Error('Model transfer failed');
            messages.push({ message, transfer });
        }
    };
    const createLc0 = async options => {
        argumentsList.push(options.arguments);
        const module = {
            FS: {
                writeFile: (...args) => writes.push(args),
                readFile() { return new Uint8Array([1, 2, 3]); },
                unlink: path => unlinked.push(path)
            }
        };
        options.preRun(module);
        options.onExit(0);
    };
    startWorker(createLc0, self);
    return { self, messages, writes, unlinked, argumentsList };
}

test('transfers converted model and rejects another conversion', async () => {
    const { self, messages } = setupWorker();
    const data = { type: 'convert', weights: new Uint8Array([1]).buffer };
    await self.onmessage({ data });
    assert.deepEqual([...new Uint8Array(messages[0].message.output)], [1, 2, 3]);
    assert.deepEqual(messages[0].transfer, [messages[0].message.output]);
    await self.onmessage({ data });
    assert.match(messages[1].message.message, /only be used once/);
});

test('reports a failed model transfer rather than silently finishing', async () => {
    const { self, messages } = setupWorker(true);
    await self.onmessage({ data: { type: 'convert', weights: new Uint8Array([1]).buffer } });
    assert.deepEqual(messages, [{ message: { type: 'error', message: 'Model transfer failed' }, transfer: undefined }]);
});

test('returns the original weights when requested by the inference worker', async () => {
    const { self, messages, writes, unlinked } = setupWorker();
    const weights = new Uint8Array([5, 6]).buffer;
    await self.onmessage({ data: { type: 'convert', weights, returnWeights: true } });
    assert.equal(messages[0].message.weights, weights);
    assert.deepEqual(messages[0].transfer, [messages[0].message.output, weights]);
    assert.equal(writes[0][1].buffer, weights);
    assert.deepEqual(writes[0][2], { canOwn: true });
    assert.deepEqual(unlinked, ['/input.pb']);
});

test('reports the upstream diagnostic for an exception with no message', async () => {
    const messages = [];
    const self = { crossOriginIsolated: true, postMessage: message => messages.push(message) };
    startWorker(async options => {
        options.printErr('Unhandled exception: std::bad_alloc');
        throw new Error('');
    }, self);
    await self.onmessage({ data: { type: 'convert', weights: new Uint8Array([1]).buffer } });
    assert.deepEqual(messages.at(-1), { type: 'error', message: 'Unhandled exception: std::bad_alloc' });
});

test('reports useful diagnostics instead of object stringification for runtime exceptions', async () => {
    const messages = [];
    const self = { crossOriginIsolated: true, postMessage: message => messages.push(message) };
    startWorker(async options => {
        options.printErr('Unknown command line flag: --onnx-fp16-weights.');
        throw { status: 1 };
    }, self);
    await self.onmessage({ data: { type: 'convert', weights: new ArrayBuffer(1) } });
    assert.deepEqual(messages.at(-1), {
        type: 'error', message: 'Unknown command line flag: --onnx-fp16-weights.'
    });
});

for(const dataType of ['f32', 'f16', 'f16-mixed']) {
    test(`passes explicit ${dataType} conversion flags to upstream`, async () => {
        const { self, messages, argumentsList } = setupWorker();
        await self.onmessage({ data: { type: 'convert', weights: new ArrayBuffer(1), dataType } });
        assert.equal(messages.at(-1).message.type, 'converted');
        assert.ok(argumentsList[0].includes(`--onnx-data-type=${dataType === 'f16-mixed' ? 'f32' : dataType}`));
        assert.equal(argumentsList[0].includes('--onnx-fp16-weights'), dataType === 'f16-mixed');
    });
}

test('rejects unknown precision without starting a conversion', async () => {
    const { self, messages, argumentsList } = setupWorker();
    await self.onmessage({ data: { type: 'convert', weights: new ArrayBuffer(1), dataType: 'half' } });
    assert.match(messages.at(-1).message.message, /Expected the f32, f16 or f16-mixed/);
    assert.deepEqual(argumentsList, []);
});
