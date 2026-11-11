import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const host = process.env.LC0_TEST_HOST_URL || 'http://localhost/A.C.A.S/';
const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
try {
    const page = await browser.newPage();
    await page.goto(new URL('app/', host).href);
    await page.waitForFunction(() => crossOriginIsolated, null, { timeout: 30000 });
    const reports = [];
    for(const weights of ['maia-1500.pb', 'goodgyal-7.pb']) {
        for(const legacy of [true, false]) {
            const report = await page.evaluate(async ({ weights, legacy }) => {
                const worker = new Worker(legacy ? './assets/engines/zerofish/zerofishWorker.js'
                    : './assets/engines/lc0/worker.js', { type: 'module' });
                const send = line => worker.postMessage(legacy
                    ? { method: 'zero', args: [line] } : { type: 'uci', line });
                const lines = [];
                let waiter, failure;
                worker.onerror = event => { failure = new Error(event.message); waiter?.(); };
                worker.onmessage = ({ data }) => {
                    if(data === true || data?.type === 'ready') lines.push('worker-ready');
                    else if(typeof data === 'string') lines.push(data);
                    else if(data?.type === 'uci') lines.push(data.line);
                    else if(data?.type === 'error') failure = new Error(data.message);
                    waiter?.();
                };
                const wait = async (prefix, from) => {
                    const deadline = Date.now() + 180000;
                    while(true) {
                        if(failure) throw failure;
                        const error = lines.slice(from).find(line => line.startsWith('error '));
                        if(error) throw new Error(error);
                        const found = lines.slice(from).find(line => line.startsWith(prefix));
                        if(found) return found;
                        if(Date.now() > deadline) throw new Error(`Timeout: ${prefix}`);
                        await new Promise(resolve => {
                            const timer = setTimeout(resolve, 50);
                            waiter = () => { clearTimeout(timer); resolve(); };
                        });
                        waiter = null;
                    }
                };
                let poll;
                try {
                    const response = await fetch(`./assets/lc0-nets/${weights}`);
                    if(!response.ok) throw new Error(`Weights HTTP ${response.status}`);
                    const bytes = await response.arrayBuffer();
                    if(legacy) poll = setInterval(() => worker.postMessage({ method: 'acas_check_loaded', args: [] }), 100);
                    else worker.postMessage({ type: 'initialize', weights: bytes, provider: 'webgpu' }, [bytes]);
                    await wait('worker-ready', 0);
                    clearInterval(poll);
                    if(legacy) worker.postMessage({ method: 'setZeroWeights', args: [new Uint8Array(bytes)] });
                    send('uci');
                    await wait('uciok', 0);
                    for(const option of ['Threads value 1', 'MinibatchSize value 1', 'NNCacheSize value 0',
                        'MultiPV value 1', 'SmartPruningFactor value 0']) send(`setoption name ${option}`);
                    send('isready');
                    await wait('readyok', 0);
                    const run = async nodes => {
                        send('ucinewgame');
                        send('position startpos moves e2e4');
                        const from = lines.length, start = performance.now();
                        send(`go nodes ${nodes}`);
                        const bestmove = await wait('bestmove ', from);
                        return { elapsedMs: performance.now() - start, bestmove,
                            info: lines.slice(from).filter(line => /\bnodes \d+/.test(line)).at(-1) };
                    };
                    await run(16);
                    const runs = [];
                    for(let i = 0; i < 3; i++) runs.push(await run(500));
                    return { weights, backend: legacy ? 'legacy-eigen-wasm' : 'modern-webgpu-f32',
                        identity: lines.find(line => line.startsWith('id name ')), nodes: 500,
                        threads: 1, batch: 1, cache: 0, runs };
                } finally { clearInterval(poll); worker.terminate(); }
            }, { weights, legacy });
            for(const run of report.runs) {
                assert.ok(Number(run.info?.match(/\bnodes (\d+)/)?.[1]) >= report.nodes);
                assert.match(run.bestmove, /^bestmove [a-h][1-8][a-h][1-8]/);
            }
            reports.push(report);
            console.log(JSON.stringify(report));
        }
    }
    if(process.env.LC0_BENCH_REPORT)
        await writeFile(process.env.LC0_BENCH_REPORT, JSON.stringify({
            browser: browser.version(), host, reports,
            caveat: 'Different Lc0 versions can search different trees. Same weights, position and explicit limits, not equal playing strength.'
        }, null, 2));
} finally { await browser.close(); }
