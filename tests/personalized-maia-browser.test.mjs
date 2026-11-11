import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

test('browser fine-tunes real Maia and verifies its Lc0 weight export', { timeout: 180000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const provider = process.env.PERSONAL_MAIA_PROVIDER || 'wasm';
    const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    try {
        const page = await browser.newPage();
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => crossOriginIsolated
            && document.querySelector('#status')?.textContent.startsWith('Ready.'));
        const result = await page.evaluate(async provider => {
            const { Chess } = await import('/app/assets/engines/libraries/chessjs/chess.js');
            const chess = new Chess(), history = [chess.fen()];
            for(const move of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'Nf6', 'Nc3', 'd6']) {
                chess.move(move); history.unshift(chess.fen());
            }
            const moves = chess.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || ''));
            const sample = { history: history.slice(0, 8), repetitions: Array(8).fill(false), legalMoves: moves, move: 'c1e3' };
            const weights = await (await fetch('/app/assets/lc0-nets/maia-1500.pb')).arrayBuffer();
            const worker = new Worker('./trainer-worker.js', { type: 'module' });
            let trained;
            try {
                trained = await new Promise((resolve, reject) => {
                    const events = [];
                    worker.onerror = event => reject(new Error(event.message));
                    worker.onmessage = ({ data }) => {
                        events.push({ ...data, weights: undefined });
                        if(data.type === 'error') reject(new Error(`${data.message}\n${JSON.stringify(events)}`));
                        if(data.type === 'complete') resolve({ output: data.weights, bytes: data.weights.byteLength, report: data.report, events });
                    };
                    worker.postMessage({ type: 'train', weights, provider,
                        dataset: { train: { samples: [sample, sample, sample, sample] }, validation: { samples: [sample, sample] } },
                        options: { epochs: 3, learningRate: 0.005, batchSize: 2 } }, [weights]);
                });
            } finally { worker.terminate(); }
            const engine = new Worker('/app/assets/engines/lc0/worker.js', { type: 'module' });
            try {
                const request = (commands, prefix) => new Promise((resolve, reject) => {
                    const lines = [];
                    const timer = setTimeout(() => finish(new Error(`Exported engine timed out: ${prefix}`)), 30000);
                    const finish = (error, value) => {
                        clearTimeout(timer); engine.removeEventListener('message', message);
                        error ? reject(error) : resolve(value);
                    };
                    const message = ({ data }) => {
                        if(data.type === 'error') finish(new Error(data.message));
                        if(data.type === 'uci') {
                            lines.push(data.line);
                            if(data.line.startsWith(prefix)) finish(null, lines);
                        } else if(data.type === prefix) finish(null, lines);
                    };
                    engine.addEventListener('message', message);
                    commands.forEach(command => engine.postMessage(command));
                });
                await request([{ type: 'initialize', weights: trained.output }], 'ready');
                const uci = lines => lines.map(line => ({ type: 'uci', line }));
                await request(uci(['uci', 'setoption name Threads value 1', 'isready']), 'readyok');
                const lines = await request(uci(['position startpos', 'go nodes 1']), 'bestmove ');
                return { ...trained, output: undefined, bestmove: lines.find(line => line.startsWith('bestmove ')) };
            } finally { engine.terminate(); }
        }, provider);
        assert.ok(result.bytes > 100000);
        assert.equal(result.report.exportVerified, true);
        assert.match(result.bestmove, /^bestmove [a-h][1-8][a-h][1-8]/);
        assert.equal(result.report.improved, true);
        assert.ok(result.report.exportedMetrics.loss < result.report.history[0].validationLoss);
        assert.ok(result.events.some(event => event.type === 'batch'));
        assert.equal(result.events.filter(event => event.type === 'features').length, 6);
        console.log(JSON.stringify({ provider, bestmove: result.bestmove, bestEpoch: result.report.bestEpoch,
            baseline: result.report.history[0], exported: result.report.exportedMetrics, bytes: result.bytes }));
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
