import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../lc0/node_modules/playwright/index.mjs';
import { createStudyServer } from './study-server.mjs';

test('the gated model loader and speech backend load entirely from app assets', async () => {
    const server = createStudyServer({ root: fileURLToPath(new URL('../../../../', import.meta.url)) });
    let browser;
    try {
        await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
        const origin = `http://127.0.0.1:${server.address().port}`;
        browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu'] });
        const page = await browser.newPage();
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            return url.origin === origin && !/^\/(?:tools|research|models)\//.test(url.pathname)
                ? route.continue() : route.abort('blockedbyclient');
        });
        await page.goto(origin);
        const loaded = await page.evaluate(async () => {
            const model = await import('/assets/engines/pena-v2/model-loader.js');
            await import('/assets/engines/pena-v2/voice-worker.js');
            const { env } = await import('/assets/engines/pena-v2/vendor/ort.wasm.bundle.min.mjs');
            const wasm = await fetch(new URL('ort-wasm-simd-threaded.wasm', env.wasm.wasmPaths));
            return { loader: typeof model.loadBrowserModel, studyLoader: typeof model.loadStudyModel,
                wasmPath: env.wasm.wasmPaths, wasmStatus: wasm.status };
        });
        assert.equal(loaded.loader, 'function');
        assert.equal(loaded.studyLoader, 'undefined');
        assert.equal(loaded.wasmPath, origin + '/assets/engines/pena-v2/vendor/');
        assert.equal(loaded.wasmStatus, 200);
    } finally {
        await browser?.close();
        await new Promise(done => server.close(done));
    }
});

test('loader rejects unsupported models and worker needs a local server before answering', async () => {
    const server = createStudyServer({ root: fileURLToPath(new URL('../../../../', import.meta.url)) });
    let browser;
    const forbiddenRequests = [];
    try {
        await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
        const origin = `http://127.0.0.1:${server.address().port}`;
        browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-gpu'] });
        const page = await browser.newPage();
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if(url.origin !== origin || /\/vendor\/(?:wllama|tokenizer)/.test(url.pathname)) {
                forbiddenRequests.push(url.href);
                return route.abort('blockedbyclient');
            }
            return route.continue();
        });
        await page.goto(origin + '/');
        const result = await page.evaluate(async () => {
            Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
            const { loadBrowserModel } = await import('/assets/engines/pena-v2/model-loader.js');
            const errors = [];
            for(const [url, options] of [[undefined, undefined],
                ['https://huggingface.co/example/unsupported-gguf', undefined],
                [undefined, { localFile: new File([], 'Pena-Inkling.gguf') }]]) {
                try { await loadBrowserModel(url, options); errors.push(null); }
                catch(error) { errors.push(error.message); }
            }
            const worker = new Worker('/assets/engines/pena-v2/app-worker.js', { type: 'module' });
            return await new Promise((resolve, reject) => {
                const timer = setTimeout(() => { worker.terminate(); reject(new Error('Worker timed out')); }, 10000);
                worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
                worker.onmessage = ({ data }) => {
                    clearTimeout(timer); worker.terminate(); resolve({ errors, event: data });
                };
                worker.postMessage({ type: 'converse', chatId: 'test' });
            });
        });
        assert.match(result.errors[0], /needs WebGPU/);
        assert.match(result.errors[1], /Unsupported model/);
        assert.match(result.errors[2], /too small/);
        assert.equal(result.event.phase, 'failed');
        assert.equal(result.event.chatId, 'test');
        assert.match(result.event.message, /local server first/);
        assert.deepEqual(forbiddenRequests, []);
    } finally {
        await browser?.close();
        await new Promise(done => server.close(done));
    }
});
