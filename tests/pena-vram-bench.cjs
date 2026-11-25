// Manual VRAM benchmark for Inkling (native llama-server) + ZONOS3 (browser WebGPU). Needs an NVIDIA GPU,
// Chrome, and Pena's downloaded runtime and model. Never runs as part of the normal test suite.
// Usage: node tests\pena-vram-bench.cjs '<json config>'
//   config: { name, mode: 'inkling'|'zonos'|'both', args: [extra llama-server args], ctx, promptTokens,
//             ngl: GPU layers (default 99, null omits it so --fit can choose) }
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const { readFile, appendFile } = require('node:fs/promises');
const path = require('node:path');
const { mkdirSync } = require('node:fs');
const crypto = require('node:crypto');
const { chromium } = require(path.join(__dirname, '..', 'app', 'assets', 'engines', 'lc0', 'node_modules', 'playwright'));

const cfg = Object.assign({ name: 'default', mode: 'both', args: [], ctx: 8192, promptTokens: 6800 }, JSON.parse(process.argv[2] || '{}'));
const exe = path.join(process.env.APPDATA, 'acas-local-server', 'pena', 'runtime', 'b12633-win32-x64-cuda13', 'llama-server.exe');
const model = path.join(process.env.APPDATA, 'acas-local-server', 'pena', 'models', 'Inkling-2-Mini-Uncensored-AD-IQ2_M.gguf');
const vendor = path.join(__dirname, '..', 'app', 'assets', 'engines', 'pena-v2', 'vendor', 'zonos3');
const out = path.join(__dirname, '..', 'temp', 'pena-vram-bench');
const profile = path.join(out, 'chrome-profile');
mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Whole-card sampler with phase labels.
let phase = 'idle';
const peaks = {};
let current = 0;
const smi = spawn('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits', '-lms', '100']);
smi.stdout.on('data', chunk => {
    for(const line of String(chunk).split(/\r?\n/)) {
        const mib = Number(line.trim());
        if(!Number.isFinite(mib) || !line.trim()) continue;
        current = mib;
        peaks[phase] = Math.max(peaks[phase] || 0, mib);
    }
});
const mark = name => { phase = name; };

async function startZonos() {
    const server = createServer(async (req, res) => {
        const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
        if(name === 'index.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>z</title>'); return; }
        if(!['engine.js', 'worker.js', 'codec-worker.js'].includes(name)) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': 'text/javascript' });
        res.end(await readFile(path.join(vendor, name)));
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true });
    const page = context.pages()[0] || await context.newPage();
    page.on('pageerror', e => console.error('pageerror:', e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const t0 = Date.now();
    await page.evaluate(async () => {
        const { engine, localFetch } = await import('./engine.js');
        await engine.init(() => {}, { base: 'https://huggingface.co/Zyphra/ZONOS3-Mini/resolve/2921b8821772b0bd10a04456863d21abf9d2f283/web/' });
        window.say = async text => {
            const start = performance.now();
            const response = await localFetch('/v2/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, language: 'en_us', stream: false, speaker_embedding_id: 'default_3c00e421e684f949', format: 'wav', seed: 1 }) });
            if(!response.ok) throw new Error(`Synthesis ${response.status}: ${await response.text()}`);
            const audio = await new AudioContext().decodeAudioData(await response.arrayBuffer());
            return { seconds: (performance.now() - start) / 1000, audio: audio.duration };
        };
    });
    const initSeconds = (Date.now() - t0) / 1000;
    return { page, initSeconds, close: async () => { await context.close(); server.close(); } };
}

const speech = 'Your knight on f3 is doing a lot of work, so trading it for that bishop would loosen your kingside. '
    + 'I would rather push the c pawn first, then bring the rook to the open file once the center settles.';
async function zonosTurns(z, n = 3) {
    const out = [];
    for(let i = 0; i < n; i++) out.push(await z.page.evaluate(t => window.say(t), speech));
    return out;
}

async function startInkling() {
    const key = crypto.randomBytes(16).toString('hex');
    const port = 18000 + Math.floor(Math.random() * 1000);
    const args = ['--host', '127.0.0.1', '--port', String(port), '--model', model, '--ctx-size', String(cfg.ctx),
        ...(cfg.ngl === null ? [] : ['--n-gpu-layers', String(cfg.ngl ?? 99)]), '--parallel', '1', '--flash-attn', 'auto', '--reasoning-budget', '0',
        '--no-webui', '--offline', '--jinja', '--api-key', key, ...cfg.args];
    // Later flags override earlier ones in llama.cpp argument parsing.
    const proc = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    proc.stdout.on('data', d => { log += d; });
    proc.stderr.on('data', d => { log += d; });
    const t0 = Date.now();
    for(;;) {
        if(proc.exitCode !== null) throw new Error(`llama-server exited ${proc.exitCode}\n${log.slice(-3000)}`);
        try { if((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch {}
        await sleep(250);
    }
    return { proc, port, key, log: () => log, loadSeconds: (Date.now() - t0) / 1000 };
}

function longPrompt(tokens) {
    const lines = [];
    for(let i = 0; lines.join('\n').length < tokens * 3.6; i++)
        lines.push(`Note ${i}: after move ${i % 40 + 1}, the ${['knight', 'bishop', 'rook', 'queen'][i % 4]} on ${'abcdefgh'[i % 8]}${i % 8 + 1} `
            + `eyes the ${['long diagonal', 'open file', 'weak square', 'back rank'][i % 4]}, and the pawn structure shifts by ${i * 7 % 13} units.`);
    return `${lines.join('\n')}\nSummarize the single most important idea above in two sentences.`;
}

async function inklingTurn(ink, nPredict = 128) {
    const response = await fetch(`http://127.0.0.1:${ink.port}/completion`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ink.key}` },
        body: JSON.stringify({ prompt: longPrompt(cfg.promptTokens), n_predict: nPredict, cache_prompt: false, temperature: 0.3, seed: 1 }) });
    const json = await response.json();
    if(!response.ok) throw new Error(JSON.stringify(json).slice(0, 500));
    const t = json.timings;
    return { promptTokens: t.prompt_n, promptTps: +t.prompt_per_second.toFixed(1), genTokens: t.predicted_n, genTps: +t.predicted_per_second.toFixed(1) };
}

(async () => {
    await sleep(800);
    const result = { name: cfg.name, mode: cfg.mode, ctx: cfg.ctx, args: cfg.args.join(' ') };
    result.idleMiB = current;
    let z, ink;
    try {
        if(cfg.mode !== 'inkling') {
            mark('zonosLoad'); z = await startZonos(); result.zonosInit = z.initSeconds;
            mark('zonosWarm'); await zonosTurns(z, 1);
            mark('zonosSpeak'); const turns = await zonosTurns(z, 3);
            result.speechRatio = +(turns.reduce((a, t) => a + t.seconds, 0) / turns.reduce((a, t) => a + t.audio, 0)).toFixed(2);
            await sleep(500); result.zonosSteadyMiB = current;
        }
        if(cfg.mode !== 'zonos') {
            mark('inklingLoad'); ink = await startInkling(); result.inklingLoad = ink.loadSeconds;
            await sleep(500); result.inklingIdleMiB = current;
            mark('inklingTurn'); Object.assign(result, await inklingTurn(ink));
            const breakdown = ink.log().split(/\r?\n/).filter(l => /model buffer size|KV buffer size|compute buffer size|RS buffer size|offloaded \d+\/\d+ layers|n_layer|expert_count|memory breakdown|\| *(CUDA|Host)/.test(l));
            result.log = breakdown.map(l => l.trim()).slice(0, 40); await require('node:fs/promises').writeFile(path.join(out, cfg.name + '.log'), ink.log());
        }
        if(cfg.mode === 'both') {
            mark('together');
            const [text, voice] = await Promise.all([inklingTurn(ink), zonosTurns(z, 3)]);
            result.togetherGenTps = text.genTps;
            result.togetherPromptTps = text.promptTps;
            result.togetherSpeechRatio = +(voice.reduce((a, t) => a + t.seconds, 0) / voice.reduce((a, t) => a + t.audio, 0)).toFixed(2);
            for(let i = 0; i < 2; i++) await Promise.all([inklingTurn(ink, 64), zonosTurns(z, 1)]);
        }
    } catch(error) {
        result.error = String(error.message || error).slice(0, 1500);
    } finally {
        mark('teardown');
        if(ink) { ink.proc.kill(); await new Promise(r => ink.proc.exitCode !== null ? r() : ink.proc.once('exit', r)); }
        if(z) await z.close();
        smi.kill();
    }
    result.peaks = Object.fromEntries(Object.entries(peaks).filter(([k]) => k !== 'teardown'));
    result.peakMiB = Math.max(...Object.values(result.peaks));
    result.peakAboveIdleMiB = result.peakMiB - result.idleMiB;
    console.log('RESULT', JSON.stringify(result, null, 1));
    await appendFile(path.join(out, 'results.jsonl'), JSON.stringify(result) + '\n');
})();
