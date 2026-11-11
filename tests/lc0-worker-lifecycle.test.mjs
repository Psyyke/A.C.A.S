import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

test('Lc0 releases all worker VMs after repeated starts and stops', { timeout: 120000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const gpu = process.env.LC0_LIFECYCLE_WEBGPU === '1';
    const browser = await chromium.launch(gpu ? {
        headless: false, executablePath: process.env.LC0_TEST_BROWSER, args: ['--enable-unsafe-webgpu']
    } : {});
    try {
        const page = await browser.newPage();
        await page.route('**/lifecycle', route => route.fulfill({
            contentType: 'text/html',
            headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' },
            body: '<title>Lc0 worker lifecycle</title>'
        }));
        await page.goto(`${url}/lifecycle`);
        const cdp = await browser.newBrowserCDPSession();
        const workers = async () => (await cdp.send('Target.getTargets')).targetInfos
            .filter(target => target.type === 'worker' && target.url.startsWith(url));
        const assertNoWorkers = async label => {
            const deadline = Date.now() + 5000;
            while((await workers()).length && Date.now() < deadline)
                await new Promise(resolve => setTimeout(resolve, 50));
            assert.deepEqual((await workers()).map(target => target.url), [], label);
        };
        for(const [iteration, scenario] of [
            {}, ...Array.from({ length: 5 }, () => ({ provider: 'wasm' })),
            { provider: 'wasm', stopOnInfo: true },
            { provider: 'wasm', invalid: true }, { provider: 'wasm', invalid: true },
            ...(gpu ? Array.from({ length: 4 }, () => ({ provider: 'webgpu' })) : [])
        ].entries()) {
            const result = await page.evaluate(async ({ provider, invalid, stopOnInfo }) => {
                const { default: load, getEngineWorkerConfig } = await import('/app/assets/js/instance/engineWorker.js');
                return new Promise((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error('Lc0 search timed out')), 30000);
                    const worker = load({ ...getEngineWorkerConfig('lc0-v0.32.1-wasm'), provider }, {
                        type: 'lc0-v0.32.1-wasm', profileName: 'default', pendingLoads: new Set(),
                        isCurrent: () => true,
                        loadWeights: async () => invalid ? new Uint8Array([1, 2, 3]).buffer
                            : (await fetch('/app/assets/lc0-nets/maia-1100.pb')).arrayBuffer(),
                        onReady: engine => {
                            engine.sendMsg('position startpos');
                            engine.sendMsg(stopOnInfo ? 'go infinite' : 'go nodes 4');
                        },
                        onMessage: line => {
                            if(stopOnInfo && /\bnodes\s+[1-9]\d*\b/.test(line) && /\bpv\s/.test(line)) {
                                clearTimeout(timer);
                                worker.terminate();
                                resolve({ stopped: true });
                                return;
                            }
                            if(!line.startsWith('bestmove ')) return;
                            clearTimeout(timer);
                            worker.terminate();
                            resolve({ best: line });
                        },
                        onError: error => {
                            clearTimeout(timer);
                            worker.terminate();
                            if(invalid) resolve({ error: error.message });
                            else reject(error);
                        }
                    });
                });
            }, scenario);
            if(scenario.invalid) assert.match(result.error, /weights|network|parse|truncated/i);
            else if(scenario.stopOnInfo) assert.equal(result.stopped, true);
            else assert.match(result.best, /^bestmove [a-h][1-8][a-h][1-8]/);
            await assertNoWorkers(`Workers leaked on iteration ${iteration}`);
        }
        for(let iteration = 0; iteration < 2; iteration++) {
            await page.evaluate(async () => {
                const { default: load, getEngineWorkerConfig } = await import('/app/assets/js/instance/engineWorker.js');
                window.loadingWorker = load({ ...getEngineWorkerConfig('lc0-v0.32.1-wasm'), provider: 'wasm' }, {
                    type: 'lc0-v0.32.1-wasm', profileName: 'default', pendingLoads: new Set(),
                    isCurrent: () => true,
                    loadWeights: async () => (await fetch('/app/assets/lc0-nets/maia-1100.pb')).arrayBuffer(),
                    onReady() {}, onMessage() {}, onError(error) { window.loadingError = error.message; }
                });
            });
            const deadline = Date.now() + 10000;
            let converting;
            do {
                converting = (await workers()).some(target => new URL(target.url).pathname.endsWith('/converter-worker.js'));
                if(!converting) await new Promise(resolve => setTimeout(resolve, 10));
            } while(!converting && Date.now() < deadline);
            assert.ok(converting, 'Expected an active converter before cancellation');
            await page.evaluate(() => {
                window.loadingWorker.terminate();
                delete window.loadingWorker;
            });
            await assertNoWorkers(`Workers leaked after cancelling conversion ${iteration}`);
        }
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
