import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

test('app transport runs upstream Lc0 and changes weights with a new worker', { timeout: 120000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const compressed = gzipSync(await readFile('app\\assets\\lc0-nets\\maia-1100.pb'));
        await page.route(/\/assets\/lc0-nets\/maia-1100\.(pb\.gz|gz)$/, route => route.fulfill({
            contentType: 'application/octet-stream', body: compressed
        }));
        await page.route('**/app/', route => route.fulfill({
            status: 200,
            contentType: 'text/html',
            headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' },
            body: '<!doctype html><title>Lc0 app transport</title>'
        }));
        await page.goto(`${url}/app/`);
        const result = await page.evaluate(async () => {
            const { default: load, getEngineWorkerConfig } = await import('./assets/js/instance/engineWorker.js');
            const pendingLoads = new Set();
            async function run(name) {
                let engine;
                let rejectSearch;
                let resolveSearch;
                const search = new Promise((resolve, reject) => { resolveSearch = resolve; rejectSearch = reject; });
                const timer = setTimeout(() => rejectSearch(new Error('Lc0 app search timed out')), 45000);
                const lines = [];
                const worker = load(getEngineWorkerConfig('modern-lc0'), {
                    type: 'modern-lc0', profileName: 'default', pendingLoads, isCurrent: () => true,
                    loadWeights: async signal => {
                        const response = await fetch(`assets/lc0-nets/${name}`, { signal });
                        if(!response.ok) throw new Error(`Weights HTTP ${response.status}`);
                        return response.arrayBuffer();
                    },
                    onReady: value => {
                        engine = value;
                        for(const command of ['uci', 'setoption name Threads value 1', 'position startpos', 'go nodes 4'])
                            engine.sendMsg(command);
                    },
                    onMessage: line => {
                        lines.push(line);
                        if(line.startsWith('bestmove ')) resolveSearch(line);
                    },
                    onError: rejectSearch
                });
                try {
                    const best = await search;
                    return { best, identity: lines.find(line => line.startsWith('id name ')), pending: pendingLoads.size };
                } finally {
                    clearTimeout(timer);
                    worker.terminate();
                }
            }
            return { first: await run('maia-1100.pb'), second: await run('goodgyal-7.pb'),
                gzip: await run('maia-1100.pb.gz'), shortGzip: await run('maia-1100.gz'),
                legacy: getEngineWorkerConfig('lc0').path };
        });
        for(const run of [result.first, result.second, result.gzip, result.shortGzip]) {
            assert.match(run.identity, /Lc0 v0\.32\.1/);
            assert.match(run.best, /^bestmove [a-h][1-8][a-h][1-8]/);
            assert.equal(run.pending, 0);
        }
        assert.equal(result.gzip.best, result.first.best);
        assert.equal(result.shortGzip.best, result.first.best);
        assert.equal(result.legacy, 'zerofish/zerofishWorker');
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
