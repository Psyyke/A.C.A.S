import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { candidateConverterSource } from './candidate-converter.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const runtime = resolve(process.env.LC0_BENCH_RUNTIME || join(root, 'dist'));
const candidateModel = process.env.LC0_BENCH_CANDIDATE_ONNX;
const executable = process.env.LC0_NATIVE;
const weights = process.env.LC0_BENCH_WEIGHTS;
const nodes = Number(process.env.LC0_BENCH_NODES || 500);
const runs = Number(process.env.LC0_BENCH_RUNS || 3);
const threads = Number(process.env.LC0_BENCH_THREADS || 1);
const batch = Number(process.env.LC0_BENCH_BATCH || 1);
const gpu = process.env.LC0_BENCH_WEBGPU === '1';
const nativeBackend = process.env.LC0_NATIVE_BACKEND || 'eigen';
const skipCpu = process.env.LC0_BENCH_SKIP_CPU === '1';
const inferenceDataType = process.env.LC0_BENCH_INFERENCE_TYPE || 'f32';
if(!['f32', 'f16', 'f16-mixed'].includes(inferenceDataType))
    throw new Error('LC0_BENCH_INFERENCE_TYPE must be f32, f16 or f16-mixed.');
if(inferenceDataType !== 'f32' && !gpu)
    throw new Error('A precision benchmark requires LC0_BENCH_WEBGPU=1.');
if(candidateModel && inferenceDataType !== 'f16-mixed')
    throw new Error('Candidate benchmarks require f16-mixed float32 tensor interfaces.');
if(!executable || !weights || !Number.isSafeInteger(nodes) || nodes < 16
    || !Number.isSafeInteger(runs) || runs < 1 || !Number.isSafeInteger(threads) || threads < 1 || threads > 128
    || !Number.isSafeInteger(batch) || batch < 1 || batch > 1024)
    throw new Error('Set LC0_NATIVE, LC0_BENCH_WEIGHTS and valid nodes, runs, threads and batch settings.');

const options = [
    `setoption name Threads value ${threads}`, `setoption name MinibatchSize value ${batch}`,
    'setoption name NNCacheSize value 1000', 'setoption name MultiPV value 1',
    'setoption name SmartPruningFactor value 0'
];
const position = 'position startpos moves e2e4';

async function nativeBenchmark() {
    const startupBegan = performance.now();
    const process = spawn(executable, [`--backend=${nativeBackend}`, `--weights=${resolve(weights)}`]);
    let buffer = '', failure, waiter;
    process.on('error', error => { failure = error; if(waiter) waiter(); });
    process.on('exit', code => { failure = new Error(`Native Lc0 exited: ${code}`); if(waiter) waiter(); });
    const lines = [];
    process.stdout.setEncoding('utf8');
    process.stdout.on('data', chunk => {
        buffer += chunk;
        const parts = buffer.split(/\r?\n/);
        buffer = parts.pop();
        lines.push(...parts);
        if(waiter) waiter();
    });
    let stderr = '';
    process.stderr.on('data', chunk => { stderr += chunk; });
    const send = line => process.stdin.write(`${line}\n`);
    const wait = async (prefix, from) => {
        const deadline = Date.now() + 300000;
        while(true) {
            if(failure) throw failure;
            const error = lines.slice(from).find(line => line.startsWith('error '));
            if(error) throw new Error(`Native Lc0: ${error}`);
            const found = lines.slice(from).find(line => line.startsWith(prefix));
            if(found) return found;
            if(Date.now() >= deadline) throw new Error(`Native Lc0 timed out waiting for ${prefix}: ${stderr.slice(-1000)}`);
            await new Promise(resolveWait => { waiter = resolveWait; setTimeout(resolveWait, 100); });
            waiter = null;
        }
    };
    try {
        send('uci');
        await wait('uciok', 0);
        send(`setoption name Backend value ${nativeBackend}`);
        options.forEach(send);
        let start = lines.length;
        send('isready');
        await wait('readyok', start);
        const readyMs = Math.round(performance.now() - startupBegan);
        start = lines.length;
        send(position);
        const warmupBegan = performance.now();
        send('go nodes 16');
        await wait('bestmove ', start);
        const warmupMs = Math.round(performance.now() - warmupBegan);
        const results = [];
        for(let i = 0; i < runs; i++) {
            send('ucinewgame');
            send(position);
            start = lines.length;
            const began = performance.now();
            send(`go nodes ${nodes}`);
            const best = await wait('bestmove ', start);
            const elapsedMs = Math.round(performance.now() - began);
            const info = lines.slice(start).filter(line => /^info .* nodes \d+/.test(line)).at(-1);
            results.push({ elapsedMs, info, best });
        }
        return { identity: lines.find(line => line.startsWith('id name ')), readyMs, warmupMs, runs: results };
    } finally {
        process.stdin.end('quit\n');
    }
}

async function browserBenchmark(provider) {
    const files = new Map([
        ['/weights', resolve(weights)],
        ...['worker.js', 'converter-worker.js', 'browser-inference.js', 'float16.js',
            'dist/lc0.js', 'dist/lc0.wasm', 'dist/ort.webgpu.bundle.min.mjs',
            'dist/ort-wasm-simd-threaded.jsep.mjs', 'dist/ort-wasm-simd-threaded.jsep.wasm',
            'dist/ort-wasm-simd-threaded.asyncify.mjs', 'dist/ort-wasm-simd-threaded.asyncify.wasm']
            .map(name => [`/${name}`, join(root, ...name.split('/'))])
    ]);
    for(const name of ['ort.webgpu.bundle.min.mjs', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm',
        'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'])
        files.set(`/dist/${name}`, join(runtime, name));
    let candidateHash;
    if(candidateModel) {
        candidateHash = createHash('sha256').update(await readFile(resolve(weights))).digest('hex');
        files.set('/candidate-onnx', resolve(candidateModel));
        files.set('/original-converter-worker.js', join(root, 'converter-worker.js'));
    }
    const server = createServer(async (req, res) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        if(req.url === '/') { res.end('<title>Lc0 benchmark</title>'); return; }
        if(candidateModel && req.url === '/converter-worker.js') {
            res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(candidateConverterSource(candidateHash));
            return;
        }
        const file = files.get(req.url);
        if(!file) { res.writeHead(404).end(); return; }
        try {
            res.setHeader('Content-Type', extname(file) === '.wasm' ? 'application/wasm'
                : /\.(?:js|mjs)$/.test(file) ? 'text/javascript' : 'application/octet-stream');
            res.end(await readFile(file));
        } catch(error) {
            console.error('Benchmark server:', error);
            res.writeHead(500).end(error.message);
        }
    });
    await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
    const browser = await chromium.launch({ headless: !provider, executablePath: process.env.LC0_TEST_BROWSER,
        ...(provider ? { args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] } : {}) });
    try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        const result = await page.evaluate(async ({ provider, options, position, nodes, runs, inferenceDataType }) => {
            const weights = await (await fetch('/weights')).arrayBuffer();
            const startupBegan = performance.now();
            const worker = new Worker('/worker.js', { type: 'module' });
            const lines = [];
            let failure;
            worker.onmessage = ({ data }) => {
                if(data.type === 'error') failure = new Error(data.message);
                else if(data.type === 'uci') {
                    if(data.line.startsWith('error ')) failure = new Error(data.line);
                    lines.push(data.line);
                }
                if(data.type === 'ready') lines.push('worker-ready');
            };
            worker.onerror = event => { failure = new Error(event.message); };
            const wait = async (prefix, from) => {
                const deadline = Date.now() + 300000;
                while(Date.now() < deadline) {
                    if(failure) throw failure;
                    const line = lines.slice(from).find(value => value.startsWith(prefix));
                    if(line) return line;
                    await new Promise(resolveWait => setTimeout(resolveWait, 5));
                }
                throw new Error(`Browser Lc0 timed out waiting for ${prefix}`);
            };
            const send = line => worker.postMessage({ type: 'uci', line });
            try {
                worker.postMessage({ type: 'initialize', weights,
                    ...(provider ? { provider, inferenceDataType } : {}) }, [weights]);
                await wait('worker-ready', 0);
                send('uci');
                await wait('uciok', 0);
                options.forEach(send);
                let start = lines.length;
                send('isready');
                await wait('readyok', start);
                const readyMs = Math.round(performance.now() - startupBegan);
                start = lines.length;
                send(position);
                const warmupBegan = performance.now();
                send('go nodes 16');
                await wait('bestmove ', start);
                const warmupMs = Math.round(performance.now() - warmupBegan);
                const results = [];
                for(let i = 0; i < runs; i++) {
                    send('ucinewgame');
                    send(position);
                    start = lines.length;
                    const began = performance.now();
                    send(`go nodes ${nodes}`);
                    const best = await wait('bestmove ', start);
                    const elapsedMs = Math.round(performance.now() - began);
                    const info = lines.slice(start).filter(line => /^info .* nodes \d+/.test(line)).at(-1);
                    results.push({ elapsedMs, info, best });
                }
                return { readyMs, warmupMs, runs: results };
            } finally { worker.terminate(); }
        }, { provider, options, position, nodes, runs, inferenceDataType });
        return { ...result, browserVersion: browser.version() };
    } finally {
        await browser.close();
        await new Promise(resolveClose => server.close(resolveClose));
    }
}

const native = await nativeBenchmark();
console.log(`Native ${nativeBackend}:`, JSON.stringify(native));
const browserCpu = skipCpu ? null : await browserBenchmark(null);
if(browserCpu) console.log('Browser Eigen:', JSON.stringify(browserCpu));
const browserWebgpu = gpu ? await browserBenchmark('webgpu') : null;
const report = { weights: resolve(weights), nativeBackend, inferenceDataType, nodes, runs, options, position,
    runtime, candidateModel: candidateModel ? resolve(candidateModel) : null, native, browserCpu, browserWebgpu };
for(const [backend, result] of Object.entries({ native, browserCpu, browserWebgpu })) {
    if(!result) continue;
    for(const run of result.runs) {
        const reported = Number(run.info?.match(/\bnodes (\d+)\b/)?.[1]);
        if(!Number.isSafeInteger(reported) || reported < nodes || !/^bestmove [a-h][1-8][a-h][1-8][qrbn]?(?:\s|$)/.test(run.best))
            throw new Error(`Incomplete ${backend} benchmark result: ${JSON.stringify(run)}`);
    }
}
if(process.env.LC0_BENCH_REPORT)
    await writeFile(process.env.LC0_BENCH_REPORT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
