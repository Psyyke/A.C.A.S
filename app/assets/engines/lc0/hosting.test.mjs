import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

const host = process.env.LC0_TEST_HOST_URL;

test('deployed host serves modules and starts WebGPU Lc0', { skip: !host, timeout: 90000 }, async () => {
    const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    try {
        const page = await browser.newPage();
        await page.goto(new URL('app/', host).href);
        await page.waitForFunction(() => crossOriginIsolated, null, { timeout: 30000 });
        const result = await page.evaluate(async () => {
            const root = new URL('./assets/engines/lc0/', location.href);
            for(const [name, expected] of [
                ['ort.webgpu.bundle.min.mjs', /^(text|application)\/javascript\b/],
                ['ort-wasm-simd-threaded.asyncify.mjs', /^(text|application)\/javascript\b/],
                ['ort-wasm-simd-threaded.asyncify.wasm', /^application\/wasm\b/]
            ]) {
                const response = await fetch(new URL(`dist/${name}`, root), { method: 'HEAD' });
                if(!response.ok || !expected.test(response.headers.get('Content-Type') || ''))
                    throw new Error(`${name}: HTTP ${response.status}, MIME ${response.headers.get('Content-Type')}`);
            }
            const weights = await fetch(new URL('./assets/lc0-nets/maia-1500.pb', location.href));
            if(!weights.ok) throw new Error(`Weights HTTP ${weights.status}`);
            const buffer = await weights.arrayBuffer();
            const worker = new Worker(new URL('worker.js', root), { type: 'module' });
            try {
                return await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error('Hosted WebGPU search timed out')), 45000);
                    const finish = (error, line) => {
                        clearTimeout(timer);
                        error ? reject(error) : resolve(line);
                    };
                    worker.onerror = event => finish(new Error(event.message));
                    worker.onmessage = ({ data }) => {
                        if(data.type === 'error') finish(new Error(data.message));
                        else if(data.type === 'ready') {
                            for(const line of ['uci', 'setoption name Threads value 1',
                                'setoption name MinibatchSize value 1', 'isready'])
                                worker.postMessage({ type: 'uci', line });
                        } else if(data.type === 'uci') {
                            if(data.line.startsWith('error ')) finish(new Error(data.line));
                            else if(data.line === 'readyok') {
                                for(const line of ['position startpos', 'go nodes 1'])
                                    worker.postMessage({ type: 'uci', line });
                            } else if(data.line.startsWith('bestmove ')) finish(null, data.line);
                        }
                    };
                    worker.postMessage({ type: 'initialize', weights: buffer, provider: 'webgpu' }, [buffer]);
                });
            } finally { worker.terminate(); }
        });
        assert.match(result, /^bestmove [a-h][1-8][a-h][1-8][qrbn]?(?: |$)/);
    } finally { await browser.close(); }
});
