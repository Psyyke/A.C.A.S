import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

test('browser planes and all legal policy indices match upstream Lc0 search', { timeout: 90000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const context = await browser.newContext({ serviceWorkers: 'block' });
        const source = await readFile(new URL('../app/assets/engines/lc0/browser-inference.js', import.meta.url), 'utf8');
        await context.route('**/browser-inference.js*', async route => {
            if(new URL(route.request().url()).search) return route.fulfill({ contentType: 'text/javascript', body: source });
            await route.fulfill({ contentType: 'text/javascript', body: `
                import { createBrowserInference as create } from './browser-inference.js?reference';
                export async function createBrowserInference(...args) {
                    const result = await create(...args), infer = result.inference;
                    result.inference = (...parameters) => {
                        self.postMessage({ type: 'encoded', values: Array.from(new Float32Array(
                            parameters[8], parameters[0] >>> 0, parameters[1] * 112 * 64)) });
                        return infer(...parameters);
                    };
                    return result;
                }` });
        });
        const page = await context.newPage();
        await page.goto(url);
        const results = await page.evaluate(async () => {
            const { Chess } = await import('/app/assets/engines/libraries/chessjs/chess.js');
            const { encodePlanes, sampleIndices } = await import('/tools/doppelmaia/encoding.js');
            const weights = await (await fetch('/app/assets/lc0-nets/maia-1500.pb')).arrayBuffer();
            const worker = new Worker('/app/assets/engines/lc0/worker.js', { type: 'module' });
            const request = (commands, prefix) => new Promise((resolve, reject) => {
                const lines = [], encoded = [];
                const timer = setTimeout(() => finish(new Error(`Timed out: ${prefix}`)), 30000);
                const finish = (error, value) => {
                    clearTimeout(timer); worker.removeEventListener('message', message);
                    error ? reject(error) : resolve(value);
                };
                const message = ({ data }) => {
                    if(data.type === 'error') finish(new Error(data.message));
                    if(data.type === 'encoded') encoded.push(data.values);
                    if(data.type === 'uci') {
                        lines.push(data.line);
                        if(data.line.startsWith(prefix)) finish(null, { lines, encoded });
                    } else if(data.type === prefix) finish(null, { lines, encoded });
                };
                worker.addEventListener('message', message);
                commands.forEach(command => worker.postMessage(command));
            });
            const commands = lines => lines.map(line => ({ type: 'uci', line }));
            try {
                await request([{ type: 'initialize', weights, provider: 'wasm' }], 'ready');
                await request(commands(['uci', 'setoption name Threads value 1', 'setoption name MinibatchSize value 1',
                    'setoption name VerboseMoveStats value true', 'setoption name NNCacheSize value 0', 'isready']), 'readyok');
                const sequences = [
                    ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'Nf6'],
                    ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'Nf6', 'Nc3'],
                    ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']
                ];
                const output = [];
                for(const sequence of sequences) {
                    const chess = new Chess(), history = [chess.fen()], moves = [], seen = new Map(), repetitions = [];
                    const remember = () => {
                        const key = chess.fen().split(' ').slice(0, 4).join(' ');
                        repetitions.unshift(Number(seen.has(key)));
                        seen.set(key, true);
                    };
                    remember();
                    for(const san of sequence) {
                        const move = chess.move(san); moves.push(move.from + move.to + (move.promotion || ''));
                        history.unshift(chess.fen()); remember();
                    }
                    const legalMoves = chess.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || ''));
                    const sample = { history: history.slice(0, 8), repetitions: repetitions.slice(0, 8),
                        legalMoves, move: legalMoves[0] };
                    const result = await request(commands(['ucinewgame', `position startpos moves ${moves.join(' ')}`, 'go nodes 1']), 'bestmove ');
                    const calculated = encodePlanes(sample.history, sample.repetitions);
                    const reference = result.encoded[0];
                    if(!reference || result.encoded.length !== 1) throw new Error('Expected one upstream root encoding.');
                    let different = 0;
                    for(let i = 0; i < calculated.length; i++) if(calculated[i] !== reference[i]) different++;
                    const indices = result.lines.flatMap(line => {
                        const match = line.match(/^info string\s+([a-h][1-8][a-h][1-8][qrbn]?)\s+\(\s*(\d+)\s*\)\s+N:/);
                        return match ? [Number(match[2])] : [];
                    });
                    output.push({ different, calculated: sampleIndices(sample).legal.sort((a, b) => a - b),
                        upstream: indices.sort((a, b) => a - b), fen: chess.fen() });
                }
                return output;
            } finally { worker.terminate(); }
        });
        for(const result of results) {
            assert.equal(result.different, 0, result.fen);
            assert.deepEqual(result.calculated, result.upstream, result.fen);
        }
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
