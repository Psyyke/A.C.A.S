import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startServer } from '../../../../tests/maia-elo/serve.mjs';

const output = process.env.LC0_POLICY_CORPUS;
const count = Number(process.env.LC0_POLICY_POSITIONS || 1000);
if(!output || !Number.isSafeInteger(count) || count < 1 || count > 10000)
    throw new Error('Set LC0_POLICY_CORPUS and LC0_POLICY_POSITIONS from 1 to 10000.');
const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
let browser;
try {
    browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const original = await readFile(new URL('./browser-inference.js', import.meta.url), 'utf8');
    await context.route('**/browser-inference.js*', async route => {
        if(new URL(route.request().url()).search) {
            await route.fulfill({ contentType: 'text/javascript', body: original });
            return;
        }
        await route.fulfill({ contentType: 'text/javascript', body: `
            import { createBrowserInference as create } from './browser-inference.js?original';
            export { createInferenceDispatcher } from './browser-inference.js?original';
            export async function createBrowserInference(...args) {
                const result = await create(...args), dispatch = result.inference;
                result.inference = (...parameters) => {
                    self.postMessage({ type: 'policy-input', batch: parameters[1],
                        values: Array.from(new Float32Array(parameters[8], parameters[0] >>> 0, parameters[1] * 112 * 64)) });
                    return dispatch(...parameters);
                };
                return result;
            }` });
    });
    const page = await context.newPage();
    await page.goto(url);
    const corpus = await page.evaluate(async count => {
        const { Chess } = await import('/app/assets/engines/libraries/chessjs/chess.js');
        const weights = await fetch('/app/assets/lc0-nets/maia-1500.pb');
        if(!weights.ok) throw new Error(`Weights HTTP ${weights.status}`);
        const worker = new Worker('/app/assets/engines/lc0/worker.js', { type: 'module' });
        const request = (commands, prefix) => new Promise((resolve, reject) => {
            const lines = [], inputs = [];
            const finish = (error, value) => {
                clearTimeout(timer);
                worker.removeEventListener('message', message);
                worker.removeEventListener('error', failed);
                error ? reject(error) : resolve(value);
            };
            const failed = event => finish(new Error(event.message));
            const message = ({ data }) => {
                if(data.type === 'error') finish(new Error(data.message));
                else if(data.type === 'policy-input') inputs.push(data);
                else if(data.type === 'uci') {
                    lines.push(data.line);
                    if(data.line.startsWith('error ')) finish(new Error(data.line));
                    else if(data.line.startsWith(prefix)) finish(null, { lines, inputs });
                } else if(data.type === prefix) finish(null, { lines, inputs });
            };
            const timer = setTimeout(() => finish(new Error(`Corpus worker timed out waiting for ${prefix}`)), 45000);
            worker.addEventListener('message', message);
            worker.addEventListener('error', failed);
            commands.forEach(command => worker.postMessage(command));
        });
        const uci = lines => lines.map(line => ({ type: 'uci', line }));
        try {
            await request([{ type: 'initialize', provider: 'wasm', weights: await weights.arrayBuffer() }], 'ready');
            await request(uci(['uci', 'setoption name Threads value 1', 'setoption name MinibatchSize value 1',
                'setoption name VerboseMoveStats value true', 'isready']), 'readyok');
            let seed = 1500, chess = new Chess(), moves = [];
            const seen = new Set(), samples = [];
            while(samples.length < count) {
                if(chess.game_over() || moves.length >= 100) { chess = new Chess(); moves = []; }
                const legal = chess.moves({ verbose: true });
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                const move = legal[Math.floor(seed / 4294967296 * legal.length)];
                chess.move(move);
                moves.push(move.from + move.to + (move.promotion || ''));
                const key = chess.fen().split(' ').slice(0, 4).join(' ');
                if(moves.length < 8 || chess.game_over() || seen.has(key)) continue;
                seen.add(key);
                const position = `position startpos moves ${moves.join(' ')}`;
                const result = await request(uci(['ucinewgame', position, 'go nodes 1']), 'bestmove ');
                const edges = result.lines.flatMap(line => {
                    const match = line.match(/^info string\s+([a-h][1-8][a-h][1-8][qrbn]?)\s+\(\s*(\d+)\s*\)\s+N:/);
                    return match ? [{ move: match[1], index: Number(match[2]) }] : [];
                });
                if(result.inputs.length !== 1 || result.inputs[0].batch !== 1)
                    throw new Error(`Expected one root inference for ${position}, received ${result.inputs.length}`);
                if(edges.length !== chess.moves().length || new Set(edges.map(edge => edge.index)).size !== edges.length)
                    throw new Error(`Incomplete or duplicate legal root indices for ${position}: ${JSON.stringify(result.lines)}`);
                for(const edge of edges) {
                    const board = new Chess(chess.fen());
                    let move = edge.move;
                    const from = board.get(move.slice(0, 2)), to = board.get(move.slice(2, 4));
                    if(from?.type === 'k' && to?.type === 'r' && from.color === to.color && move[1] === move[3]) {
                        const rank = move[1];
                        move = move.slice(0, 2) + (move[2] > move[0] ? 'g' : 'c') + rank;
                    }
                    if(!board.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }))
                        throw new Error(`Verbose stats contain illegal root move ${edge.move}`);
                }
                samples.push({ batch: 1, values: result.inputs[0].values, legalIndices: [edges.map(edge => edge.index)],
                    position, fen: chess.fen(), legalMoves: edges, network: 'maia-1500.pb',
                    provenance: 'Seeded random legal play, seed 1500. Upstream root encoding and verbose policy indices, classical input only.' });
            }
            return samples;
        } finally { worker.terminate(); }
    }, count);
    assert.equal(corpus.length, count);
    await writeFile(output, JSON.stringify(corpus));
    console.log(`Saved ${corpus.length} distinct Maia root positions and legal policy indices to ${output}.`);
} finally {
    if(browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
}
