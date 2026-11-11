import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';

let server, url, browser;
before(async () => {
    ({ server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' }));
    browser = await chromium.launch();
});
after(async () => {
    await browser?.close();
    await new Promise(resolve => server?.close(resolve));
});

async function workerPage(t, route) {
    const page = await browser.newPage();
    t.after(() => page.close());
    if(route) await route(page);
    // No isolation headers: Rodent must not depend on SharedArrayBuffer.
    await page.route('**/rodent-fixture', route => route.fulfill({ contentType: 'text/html', body: '<title>Rodent test</title>' }));
    await page.goto(`${url}/rodent-fixture`);
    await page.evaluate(() => {
        window.lines = [];
        window.failure = '';
        window.ready = false;
        window.worker = new Worker('/app/assets/engines/rodent-v/worker.js');
        worker.onmessage = ({ data }) => {
            if(data === true) window.ready = true;
            else if(data?.type === 'error') window.failure = data.message;
            else window.lines.push(data);
        };
        worker.onerror = event => { window.failure = event.message; };
    });
    await page.waitForFunction(() => window.ready || window.failure, null, { timeout: 60000 });
    return page;
}

async function send(page, ...commands) {
    return page.evaluate(commands => {
        const from = lines.length;
        for(const command of commands) worker.postMessage(command);
        return from;
    }, commands);
}

async function until(page, pattern, from = 0, timeout = 30000) {
    await page.waitForFunction(({ pattern, from }) =>
        window.failure || lines.slice(from).some(line => new RegExp(pattern).test(line)),
    { pattern: pattern.source, from }, { timeout });
    assert.equal(await page.evaluate(() => window.failure), '');
    return page.evaluate(from => lines.slice(from), from);
}

async function search(page, position = 'position startpos', go = 'go depth 3') {
    const from = await send(page, position, go);
    const lines = await until(page, /^bestmove /, from);
    return { lines, move: lines.find(line => line.startsWith('bestmove ')).split(' ')[1] };
}

test('Rodent advertises usable browser options without requiring isolation', async t => {
    const page = await workerPage(t);
    assert.equal(await page.evaluate(() => crossOriginIsolated), false);
    const lines = await until(page, /^uciok$/, await send(page, 'uci'));
    assert.ok(lines.includes('id name Rodent V 1.2.03 Scalar'));
    for(const name of ['Personality', 'PersonalityFile', 'NnuePath', 'OwnSafety', 'OppSafety', 'hceWeight', 'nnueWeight',
        'nnueScale', 'UCI_Elo', 'UCI_LimitStrength', 'MultiPV', 'UCI_Chess960'])
        assert.ok(lines.some(line => line.startsWith(`option name ${name} type `)), name);
    assert.ok(lines.includes('option name Hash type spin default 16 min 1 max 256'));
    assert.ok(lines.includes('option name Threads type spin default 1 min 1 max 1'));
    assert.ok(!lines.some(line => /option name (Save Personality|UCI_ShowWDL)/.test(line)));
    await until(page, /^readyok$/, await send(page, 'isready'));
});

test('Rodent reports the Go panic output when the WASM runtime exits', async t => {
    const page = await workerPage(t);
    await page.evaluate(() => {
        window.runtimeMessages = [];
        window.runtime = new Worker('/app/assets/engines/rodent-v/runtime-worker.js?networkSize=512');
        runtime.onmessage = ({ data }) => runtimeMessages.push(data);
    });
    await page.waitForFunction(() => runtimeMessages.includes(true), null, { timeout: 60000 });
    await page.evaluate(() => runtime.postMessage('uci'));
    await page.waitForFunction(() => runtimeMessages.includes('uciok'), null, { timeout: 30000 });
    await page.evaluate(() => runtime.postMessage(
        'setoption name NnuePath value nets/rodent_4kb_768hl_8ob_v2.bin',
    ));
    await page.waitForFunction(() => runtimeMessages.some(message => message?.type === 'error'), null, { timeout: 30000 });
    const error = await page.evaluate(() => runtimeMessages.find(message => message?.type === 'error').message);
    assert.match(error, /Go runtime exited with code 2/);
    assert.match(error, /does not match the 512-neuron runtime/);
});

test('Rodent supports depth, nodes, engine movetime, MultiPV and new games', { timeout: 90000 }, async t => {
    const page = await workerPage(t);
    await send(page, 'setoption name MultiPV value 3');
    let result = await search(page);
    for(const rank of [1, 2, 3])
        assert.ok(result.lines.some(line => new RegExp(`depth 3 .*multipv ${rank} .*score .*pv `).test(line)), result.lines.join('\n'));
    const chess = new Chess();
    for(const line of result.lines.filter(line => /\bpv /.test(line))) {
        const board = new Chess();
        for(const move of line.split(' pv ')[1].split(' ')) {
            assert.ok(board.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }), line);
        }
    }
    assert.ok(chess.move({ from: result.move.slice(0, 2), to: result.move.slice(2, 4) }));
    await send(page, 'setoption name MultiPV value 1', 'ucinewgame');
    result = await search(page, 'position startpos moves e2e4 e7e5', 'go nodes 500');
    assert.ok(result.lines.includes('info string search limited to 500 nodes'));
    const finalNodes = result.lines.filter(line => /\bnodes \d+/.test(line)).at(-1).match(/\bnodes (\d+)/)[1];
    assert.ok(Number(finalNodes) > 0 && Number(finalNodes) <= 1600, finalNodes);
    const started = Date.now();
    result = await search(page, 'position startpos', 'go movetime 300');
    assert.match(result.move, /^[a-h][1-8][a-h][1-8][qrbn]?$/);
    assert.ok(Date.now() - started < 2500, 'Engine movetime must finish without an app-side stop');
});

test('an infinite search stops promptly and a following search still works', async t => {
    const page = await workerPage(t);
    const from = await send(page, 'position startpos', 'go infinite');
    await until(page, /^info depth [2-9]/, from);
    const stoppedAt = Date.now();
    await send(page, 'stop');
    await until(page, /^bestmove /, from, 3000);
    assert.ok(Date.now() - stoppedAt < 2000, 'stop must yield back to the worker event loop');
    const result = await search(page, 'position startpos moves d2d4', 'go depth 2');
    const chess = new Chess();
    chess.move('d4');
    assert.ok(chess.move({ from: result.move.slice(0, 2), to: result.move.slice(2, 4) }));
});

test('changing architecture during search preserves bestmove ordering and queued positions', async t => {
    const page = await workerPage(t);
    const from = await send(page, 'position startpos', 'go infinite');
    await until(page, /^info depth [2-9]/, from);
    await send(page, 'setoption name Personality value tal_nnue',
        'position startpos moves d2d4', 'go depth 2 searchmoves d7d5');
    await until(page, /^bestmove d7d5(?: |$)/, from);
    const lines = await page.evaluate(from => window.lines.slice(from), from);
    const bestmoves = lines.filter(line => /^bestmove /.test(line));
    assert.equal(bestmoves.length, 2, lines.join('\n'));
    assert.ok(lines.indexOf(bestmoves[0]) < lines.indexOf('info string Rodent loading 768-neuron runtime'));
    assert.match(bestmoves[1], /^bestmove d7d5(?: |$)/);
});

test('Moves On Demand restrictions are honored with books and do not leak to the next search', async t => {
    const page = await workerPage(t);
    await until(page, /^info string Rodent personality: tal_hybrid/, await send(page, 'setoption name Personality value tal_hybrid'));
    await send(page, 'setoption name OwnBook value true', 'setoption name MultiPV value 3');
    for(const go of ['go depth 2 searchmoves a2a3', 'go nodes 500 searchmoves a2a3', 'go movetime 200 searchmoves a2a3']) {
        const result = await search(page, 'position startpos', go);
        assert.equal(result.move, 'a2a3');
        assert.ok(result.lines.filter(line => /\bpv /.test(line)).every(line => / pv a2a3(?: |$)/.test(line)));
    }
    await send(page, 'setoption name OwnBook value false');
    const result = await search(page, 'position startpos', 'go depth 2');
    assert.ok(result.lines.some(line => /multipv 2 /.test(line)), 'root restrictions must reset');
});

test('move generation, promotion, terminal boards and Chess960 castling work', async t => {
    const page = await workerPage(t);
    let lines = await until(page, /^Nodes:/, await send(page, 'position startpos', 'perft 3'));
    assert.match(lines.at(-1), /^Nodes: 8902 /);
    let result = await search(page, 'position fen 8/P6k/8/8/8/8/8/K7 w - - 0 1', 'go depth 2 searchmoves a7a8q');
    assert.equal(result.move, 'a7a8q');
    result = await search(page, 'position fen 7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
    assert.equal(result.move, '0000');
    await send(page, 'setoption name UCI_Chess960 value true');
    result = await search(page, 'position fen 4k3/8/8/8/8/8/8/RK5R w AH - 0 1', 'go depth 2 searchmoves b1h1');
    assert.equal(result.move, 'b1h1');
    await until(page, /^readyok$/, await send(page, 'ucinewgame', 'isready'));
});

test('all seven authentic presets load with the matching architecture and can return to the latest default', { timeout: 120000 }, async t => {
    const page = await workerPage(t);
    for(const preset of ['ampere', 'chaotic', 'hector', 'nimzoid', 'rodent', 'tal_hybrid', 'tal_nnue', 'default']) {
        const lines = await until(page, new RegExp(`^info string Rodent personality: ${preset} `),
            await send(page, `setoption name Personality value ${preset}`));
        assert.ok(!lines.some(line => /failed|failure|not found|panic/i.test(line)), lines.join('\n'));
        const result = await search(page, 'position startpos moves e2e4', 'go depth 2');
        const board = new Chess();
        board.move('e4');
        assert.ok(board.move({ from: result.move.slice(0, 2), to: result.move.slice(2, 4) }), preset);
    }
    const lines = await page.evaluate(() => window.lines);
    assert.ok(lines.includes('info string Rodent loading 768-neuron runtime'));
    assert.ok(lines.includes('info string Rodent loading 512-neuron runtime'));
});

test('manual style overrides and search options survive personality and architecture changes', async t => {
    const page = await workerPage(t);
    await send(page, 'setoption name hceWeight value 0', 'setoption name OwnSafety value 150',
        'setoption name UCI_LimitStrength value true', 'setoption name UCI_Elo value 800', 'setoption name MultiPV value 2');
    await until(page, /^info string Rodent personality: tal_hybrid \(2 explicit/,
        await send(page, 'setoption name Personality value tal_hybrid'));
    const result = await search(page, 'position startpos', 'go depth 3');
    assert.ok(result.lines.includes('info string search limited to 870 nodes'), result.lines.join('\n'));
    assert.ok(result.lines.some(line => /multipv 2 /.test(line)));
    await until(page, /^info string Rodent personality: default \(2 explicit/,
        await send(page, 'setoption name Personality value default'));
    // Explicit network selection takes precedence even for a 768-neuron preset.
    await send(page, 'setoption name NnuePath value nets/rodent_8kb_512hl_8ob_v7.bin');
    await until(page, /^info string Rodent personality: tal_nnue \(3 explicit/,
        await send(page, 'setoption name Personality value tal_nnue'));
    assert.match((await search(page)).move, /^[a-h][1-8][a-h][1-8]/);
});

for(const missing of ['rodent-512.wasm', 'assets/books/active.bin']) {
    test(`a missing ${missing} produces an explicit error`, async t => {
        const page = await workerPage(t, page => page.route(`**/rodent-v/dist/${missing}`,
            route => route.fulfill({ status: 404, body: 'missing' })));
        if(missing.includes('active.bin')) await send(page, 'setoption name Personality value tal_hybrid');
        await page.waitForFunction(() => window.failure, null, { timeout: 30000 });
        assert.match(await page.evaluate(() => window.failure), /HTTP 404/);
        assert.ok(!(await page.evaluate(() => lines)).some(line => /^info string Rodent personality: tal_hybrid/.test(line)));
    });
}
