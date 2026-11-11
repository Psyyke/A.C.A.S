import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { writeFile } from 'node:fs/promises';

test('upstream Lc0 plays fast legal games between two workers', { timeout: 7200000 }, async () => {
    const gpu = process.env.LC0_GUI_WEBGPU === '1';
    const pairedPrecision = process.env.LC0_MATCH_PAIRED_PRECISION;
    const games = Number(process.env.LC0_MATCH_GAMES || 1);
    const nodes = Number(process.env.LC0_MATCH_NODES || 1);
    const maxPlies = Number(process.env.LC0_MATCH_MAX_PLIES || 600);
    const openingPlies = Number(process.env.LC0_MATCH_OPENING_PLIES || 0);
    if(!Number.isSafeInteger(games) || games < 1 || games > 10000) throw new Error('LC0_MATCH_GAMES must be between 1 and 10000');
    if(!Number.isSafeInteger(nodes) || nodes < 1 || nodes > 1000) throw new Error('LC0_MATCH_NODES must be between 1 and 1000');
    if(!Number.isSafeInteger(maxPlies) || maxPlies < 100 || maxPlies > 2000) throw new Error('LC0_MATCH_MAX_PLIES must be between 100 and 2000');
    if(!Number.isSafeInteger(openingPlies) || openingPlies < 0 || openingPlies > 20) throw new Error('LC0_MATCH_OPENING_PLIES must be between 0 and 20');
    if(pairedPrecision && (!gpu || !['f16', 'f16-mixed'].includes(pairedPrecision) || games % 2 !== 0))
        throw new Error('Paired precision matches need WebGPU, f16 or f16-mixed, and an even game count.');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch(gpu ? { headless: false, executablePath: process.env.LC0_TEST_BROWSER,
        args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] } : {});
    try {
        const page = await browser.newPage();
        await page.exposeFunction('reportMatchProgress', progress => console.log('Lc0 progress:', JSON.stringify(progress)));
        await page.goto(`${url}/app/`);
        const result = await page.evaluate(async ({ useGpu, games, nodes, maxPlies, openingPlies, pairedPrecision }) => {
            const { Chess } = await import('./assets/engines/libraries/chessjs/chess.js');
            const response = await fetch('./assets/lc0-nets/maia-1500.pb');
            if(!response.ok) throw new Error(`Weights HTTP ${response.status}`);
            const weights = await response.arrayBuffer();
            const workers = [];
            const search = (worker, commands, prefix, timeout = 45000) => new Promise((resolve, reject) => {
                const timer = setTimeout(() => finish(new Error(`Timed out waiting for ${prefix}`)), timeout);
                const finish = (error, line) => {
                    clearTimeout(timer);
                    worker.removeEventListener('message', onMessage);
                    worker.removeEventListener('error', onError);
                    error ? reject(error) : resolve(line);
                };
                const onError = event => finish(new Error(event.message));
                const onMessage = ({ data }) => {
                    if(data?.type === 'error') finish(new Error(data.message));
                    else if(data?.type === 'uci' && data.line.startsWith('error ')) finish(new Error(data.line));
                    else if(prefix === 'ready' && data?.type === 'ready') finish(null, 'ready');
                    else if(data?.type === 'uci' && data.line.startsWith(prefix)) finish(null, data.line);
                };
                worker.addEventListener('message', onMessage);
                worker.addEventListener('error', onError);
                commands.forEach(command => worker.postMessage(command));
            });
            try {
                for(let i = 0; i < 2; i++) {
                    const worker = new Worker('./assets/engines/lc0/worker.js', { type: 'module' });
                    workers.push(worker);
                    const copy = weights.slice(0);
                    await search(worker, [{ type: 'initialize', weights: copy, ...(useGpu ? { provider: 'webgpu',
                        inferenceDataType: i === 1 && pairedPrecision ? pairedPrecision : 'f32' } : {}) }], 'ready');
                    await search(worker, ['uci', 'setoption name Threads value 1', 'setoption name MinibatchSize value 1', 'isready']
                        .map(line => ({ type: 'uci', line })), 'readyok');
                }
                const started = performance.now();
                const results = [];
                const latencies = [];
                let seed = 1500;
                const random = () => {
                    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                    return seed / 4294967296;
                };
                const openings = [null, 'e2e4', 'd2d4', 'c2c4', 'g1f3'];
                for(let game = 0; game < games; game++) {
                    if(pairedPrecision) seed = (1500 + Math.floor(game / 2)) >>> 0;
                    workers.forEach(worker => worker.postMessage({ type: 'uci', line: 'ucinewgame' }));
                    const chess = new Chess();
                    const moves = [];
                    const opening = openings[(pairedPrecision ? Math.floor(game / 2) : game) % openings.length];
                    if(opening) {
                        chess.move({ from: opening.slice(0, 2), to: opening.slice(2, 4) });
                        moves.push(opening);
                    }
                    while(moves.length < openingPlies && !chess.game_over()) {
                        const legal = chess.moves({ verbose: true });
                        const move = legal[Math.floor(random() * legal.length)];
                        chess.move(move);
                        moves.push(move.from + move.to + (move.promotion || ''));
                    }
                    while(!chess.game_over() && moves.length < maxPlies) {
                        const worker = workers[(moves.length + game) % 2];
                        const searchStarted = performance.now();
                        const line = await search(worker, [
                            { type: 'uci', line: `position startpos${moves.length ? ` moves ${moves.join(' ')}` : ''}` },
                            { type: 'uci', line: `go nodes ${nodes}` }
                        ], 'bestmove ');
                        latencies.push(performance.now() - searchStarted);
                        const move = line.split(' ')[1];
                        if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) throw new Error(`Invalid bestmove: ${line}`);
                        if(!chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }))
                            throw new Error(`Illegal move ${move} at ply ${moves.length + 1}`);
                        moves.push(move);
                    }
                    results.push({ plies: moves.length, finished: chess.game_over(),
                        candidateColor: pairedPrecision ? (game % 2 === 0 ? 'black' : 'white') : null,
                        outcome: chess.in_checkmate() ? (chess.turn() === 'w' ? 'black' : 'white')
                            : chess.game_over() ? 'draw' : 'ply-cap', moves: moves.join(' ') });
                    if((game + 1) % 25 === 0)
                        await window.reportMatchProgress({ games: game + 1, elapsedMs: Math.round(performance.now() - started) });
                }
                const elapsedMs = Math.round(performance.now() - started);
                latencies.sort((a, b) => a - b);
                return { backend: pairedPrecision ? `webgpu-f32-vs-${pairedPrecision}` : useGpu ? 'webgpu-f32' : 'eigen-wasm',
                    pairedPrecision: pairedPrecision || null, weights: 'maia-1500.pb',
                    nodes, maxPlies, openingPlies, seed: 1500, games: results, elapsedMs, searchedMoves: latencies.length,
                    movesPerSecond: latencies.length / (elapsedMs / 1000),
                    latencyMs: { median: latencies[Math.floor(latencies.length * 0.5)],
                        p95: latencies[Math.floor(latencies.length * 0.95)], max: latencies.at(-1) } };
            } finally {
                workers.forEach(worker => worker.terminate());
            }
        }, { useGpu: gpu, games, nodes, maxPlies, openingPlies, pairedPrecision });
        for(const game of result.games) assert.ok(game.plies >= 40 || game.finished, JSON.stringify(game));
        if(pairedPrecision) {
            const scores = result.games.map(game => game.outcome === 'ply-cap' ? null
                : game.outcome === 'draw' ? 0.5 : Number(game.outcome === game.candidateColor));
            const pairs = [];
            for(let i = 0; i < scores.length; i += 2) {
                if(scores[i] !== null && scores[i + 1] !== null) pairs.push((scores[i] + scores[i + 1]) / 2);
            }
            const mean = pairs.length ? pairs.reduce((sum, score) => sum + score, 0) / pairs.length : null;
            const se = pairs.length > 1
                ? Math.sqrt(pairs.reduce((sum, score) => sum + (score - mean) ** 2, 0) / (pairs.length - 1) / pairs.length) : null;
            result.precisionMatch = {
                wins: scores.filter(score => score === 1).length,
                draws: scores.filter(score => score === 0.5).length,
                losses: scores.filter(score => score === 0).length,
                capped: scores.filter(score => score === null).length,
                completePairs: pairs.length, candidateScore: mean,
                approximatePairedScore95: se === null ? null : [Math.max(0, mean - 1.96 * se), Math.min(1, mean + 1.96 * se)],
                caveat: 'Normal approximation across opening pairs, not proof of Elo equivalence. Capped pairs excluded. One-node results do not establish deep-search strength.'
            };
        }
        if(process.env.LC0_MATCH_REPORT)
            await writeFile(process.env.LC0_MATCH_REPORT, JSON.stringify(result, null, 2));
        const { games: played, ...summary } = result;
        console.log('Lc0 match:', JSON.stringify({ ...summary, games: played.length,
            finished: played.filter(game => game.finished).length,
            capped: played.filter(game => !game.finished).length,
            outcomes: Object.fromEntries(['white', 'black', 'draw', 'ply-cap']
                .map(outcome => [outcome, played.filter(game => game.outcome === outcome).length])) }));
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
