import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PenaSetup, chooseRuntime, PENA_RELEASE, PENA_LORA, LORA_BASE_MODEL } from '../appServer/backend/aiSetup.js';
import { attachAIClient, AI_DEFAULTS, buildLlamaArgs } from '../appServer/backend/nativeAI.js';
import { browserModel, browserModelFileUrl, penaLora } from '../app/assets/engines/pena-v2/models.js';
import { setupView } from '../app/assets/engines/pena-v2/setup-view.js';

const bytes = text => Buffer.from(text);
const sha = data => createHash('sha256').update(data).digest('hex');
const runtimeZip = bytes('runtime-archive');
const modelData = bytes('model-weights-0123456789');
const release = {
    runtimeTag: 'b1',
    builds: { 'win32-x64-vulkan': { backend: 'vulkan', files: [
        { name: 'runtime.zip', url: 'https://example.test/runtime.zip', bytes: runtimeZip.length, sha256: sha(runtimeZip) }] } },
    model: { name: 'pena.gguf', url: 'https://example.test/pena.gguf', bytes: modelData.length, sha256: sha(modelData) },
    lora: null
};
const files = { 'https://example.test/runtime.zip': runtimeZip, 'https://example.test/pena.gguf': modelData };

class FakeHost extends EventEmitter {
    constructor() { super(); this.state = 'offline'; this.starts = []; }
    status() { return { state: this.state, model: this.state === 'ready' ? 'pena.gguf' : null, error: null }; }
    async start(settings) { this.starts.push(settings); this.state = 'ready'; this.emit('status', this.status()); return this.status(); }
    async stop() { this.state = 'offline'; return this.status(); }
}

async function makeSetup(t, overrides = {}) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pena-setup-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const host = new FakeHost(), toasts = [], requests = [];
    let autoStart = false;
    const setup = new PenaSetup({
        host, release, platform: 'win32', arch: 'x64', detectNvidia: async () => 0, progressInterval: 0,
        notify: (type, text) => toasts.push({ type, text }),
        fetchFile: async (url, { headers }) => {
            requests.push({ url, range: headers.Range || null });
            const data = files[url];
            const offset = Number(/bytes=(\d+)-/.exec(headers.Range || '')?.[1] || 0);
            return new Response(data.subarray(offset), { status: offset ? 206 : 200 });
        },
        extract: async (_archive, target) => writeFile(path.join(target, 'llama-server.exe'), 'exe'),
        ...overrides
    });
    await setup.configure({ root, getSettings: () => ({ backend: 'auto', context: 8192 }), setAutoStart: value => { autoStart = value; } });
    return { setup, host, root, toasts, requests, autoStart: () => autoStart };
}

test('one run downloads, resumes partial files, verifies, unpacks and starts Pena', async t => {
    const { setup, host, root, toasts, requests, autoStart } = await makeSetup(t);
    await mkdir(path.join(root, 'downloads'), { recursive: true });
    await writeFile(path.join(root, 'downloads', 'pena.gguf.part'), modelData.subarray(0, 10));

    const status = await setup.run();
    assert.equal(status.state, 'ready');
    assert.equal(status.setup.installed, true);
    assert.deepEqual(requests.map(request => request.range), [null, 'bytes=10-']);
    assert.deepEqual(await readFile(path.join(root, 'models', 'pena.gguf')), modelData);
    assert.equal(host.starts[0].executablePath, path.join(root, 'runtime', 'b1-win32-x64-vulkan', 'llama-server.exe'));
    assert.equal(host.starts[0].backend, 'vulkan');
    assert.equal(autoStart(), true);
    assert.match(toasts.at(-1).text, /ready/);
    await assert.rejects(stat(path.join(root, 'downloads', 'runtime.zip.part')));

    // Already installed, so a relaunch only starts the server.
    await host.stop();
    await setup.run({ allowDownload: false });
    assert.equal(requests.length, 2);
    assert.equal(host.starts.length, 2);
});

test('bad checksums and low disk space are reported as toasts without starting', async t => {
    const { setup, host, root, toasts } = await makeSetup(t, {
        fetchFile: async () => new Response(bytes('x'.repeat(runtimeZip.length)))
    });
    const status = await setup.run();
    assert.match(status.setup.error, /failed its checksum/);
    assert.equal(toasts.at(-1).type, 'error');
    assert.equal(host.starts.length, 0);
    await assert.rejects(stat(path.join(root, 'downloads', 'runtime.zip.part')));

    const full = await makeSetup(t, { freeSpace: async () => 1000 });
    assert.match((await full.setup.run()).setup.error, /free disk space/);
});

test('launch never downloads and the web GUI can only trigger the pinned setup', async t => {
    const { setup, host, requests } = await makeSetup(t);
    assert.equal((await setup.run({ allowDownload: false })).setup.installed, false);
    assert.equal(requests.length, 0);

    const socket = { readyState: 1, messages: [], send(text) { this.messages.push(JSON.parse(text)); }, on() {}, once() {} };
    const handle = attachAIClient(socket, host, setup);
    await handle({ action: 'setup', requestId: 'a' });
    assert.equal(socket.messages.find(message => message.requestId === 'a').setup.busy, true);
    await setup.task;
    assert.equal(host.state, 'ready');
    assert.equal(host.starts[0].executablePath.includes('runtime'), true);
});

test('a published LoRA is downloaded with its base model and passed to the server', async t => {
    const baseData = bytes('plain-base-weights'), loraData = bytes('pena-lora-adapter');
    files['https://example.test/base.gguf'] = baseData;
    files['https://example.test/pena-lora.gguf'] = loraData;
    const { setup, host, root, requests } = await makeSetup(t);
    await setup.run();
    assert.equal(host.starts[0].loraPath, '');

    // Publishing the LoRA swaps the model, so an existing install fetches only what changed.
    setup.release = { ...release,
        model: { name: 'base.gguf', url: 'https://example.test/base.gguf', bytes: baseData.length, sha256: sha(baseData) },
        lora: { name: 'pena-lora.gguf', url: 'https://example.test/pena-lora.gguf', bytes: loraData.length, sha256: sha(loraData) } };
    await host.stop();
    assert.equal(setup.status().installed, false);
    assert.equal(setup.status().downloadBytes, baseData.length + loraData.length);
    const status = await setup.run();
    assert.equal(status.setup.installed, true);
    assert.deepEqual(requests.slice(2).map(request => request.url),
        ['https://example.test/base.gguf', 'https://example.test/pena-lora.gguf']);
    assert.equal(host.starts[1].loraPath, path.join(root, 'models', 'pena-lora.gguf'));
    assert.deepEqual(await readFile(host.starts[1].loraPath), loraData);
    await assert.rejects(stat(path.join(root, 'models', 'pena.gguf')));
});

test('a fresh user gets uncensored Inkling with no LoRA and without selecting any local files', async t => {
    assert.equal(PENA_RELEASE.model.url, browserModelFileUrl);
    assert.equal(PENA_RELEASE.model.sha256, browserModel.sha256);
    assert.equal(PENA_RELEASE.lora, null);
    assert.equal(PENA_LORA.url, penaLora.url);
    assert.equal(LORA_BASE_MODEL.url, penaLora.base.url);
    assert.notEqual(LORA_BASE_MODEL.sha256, PENA_RELEASE.model.sha256);
    const runtime = PENA_RELEASE.builds['win32-x64-vulkan'];
    const publicRelease = { ...PENA_RELEASE,
        builds: { 'win32-x64-vulkan': { ...runtime, files: [
            { ...runtime.files[0], bytes: runtimeZip.length, sha256: sha(runtimeZip) }] } },
        model: { ...PENA_RELEASE.model, bytes: modelData.length, sha256: sha(modelData) }
    };
    const downloads = new Map([
        [runtime.files[0].url, runtimeZip],
        [PENA_RELEASE.model.url, modelData]
    ]);
    const { setup, host, root, requests } = await makeSetup(t, {
        release: publicRelease,
        fetchFile: async url => {
            requests.push({ url });
            assert.equal(new URL(url).protocol, 'https:');
            return new Response(downloads.get(url));
        }
    });
    setup.getSettings = () => ({ ...AI_DEFAULTS });
    assert.equal(setup.status().mode, 'managed');
    assert.equal(setup.status().loraAvailable, false);
    assert.equal((await setup.run()).state, 'ready');
    assert.deepEqual(requests.map(request => request.url), [...downloads.keys()]);
    const launch = host.starts[0];
    assert.equal(launch.modelPath, path.join(root, 'models', 'Inkling-2-Mini-Uncensored-AD-IQ2_M.gguf'));
    assert.equal(launch.loraPath, '');
    assert.equal(buildLlamaArgs(launch, 49152, 'test-key').includes('--lora'), false);
});

test('runtime choice covers NVIDIA drivers, AMD and other systems', () => {
    assert.equal(chooseRuntime({ platform: 'win32', arch: 'x64', nvidiaDriver: 581, preference: 'auto' }), 'win32-x64-cuda13');
    assert.equal(chooseRuntime({ platform: 'win32', arch: 'x64', nvidiaDriver: 560, preference: 'auto' }), 'win32-x64-cuda12');
    assert.equal(chooseRuntime({ platform: 'win32', arch: 'x64', nvidiaDriver: 0, preference: 'auto' }), 'win32-x64-vulkan');
    assert.equal(chooseRuntime({ platform: 'linux', arch: 'x64', nvidiaDriver: 0, preference: 'auto' }), 'linux-x64-vulkan');
    assert.equal(chooseRuntime({ platform: 'darwin', arch: 'arm64', nvidiaDriver: 0, preference: 'auto' }), 'darwin-arm64-metal');
});

test('the website tells a closed app server apart from Pena not being ready', () => {
    assert.equal(setupView({ connected: false }).text, 'startLocalServer');
    assert.equal(setupView({ connected: false }).action, 'reconnect');
    assert.equal(setupView({ connected: true, state: 'offline' }).text, 'updateAppServer');
    const fresh = setupView({ connected: true, state: 'offline', setup: { installed: false, downloadBytes: 8.7e9 } });
    assert.deepEqual([fresh.action, fresh.actionLabel, fresh.values.size], ['setup', 'downloadPena', '8.7 GB']);
    const downloading = setupView({ connected: true, state: 'offline',
        setup: { busy: true, phase: 'downloading', progress: 0.5, received: 1e9, total: 2e9 } });
    assert.deepEqual([downloading.values.percent, downloading.action, downloading.progress], [50, 'cancelSetup', 0.5]);
    assert.equal(setupView({ connected: true, state: 'offline', setup: { installed: true, error: 'boom' } }).actionLabel, 'tryAgain');
    assert.equal(setupView({ connected: true, state: 'ready', setup: { installed: true } }).state, 'ready');
});
