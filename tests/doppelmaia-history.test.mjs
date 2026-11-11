import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { parsePosition } from '../app/assets/engines/Maia3/utils.js';
import { openingSamples } from '../tools/doppelmaia/objectives.js';
import { float32Maia3, historyMaia3 } from '../tools/doppelmaia/maia3-model.js';
import { fields, get } from '../tools/doppelmaia/weights.js';

const line = 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5';
const samples = openingSamples(line);
const command = 'position startpos moves ' + samples.map(sample => sample.move).join(' ');

test('UCI and opening replay retain only causal current-first history and reset at FEN boundaries', () => {
    const position = parsePosition(command);
    assert.equal(position.history.length, 8);
    assert.equal(position.history[0], position.fen);
    assert.deepEqual(position.history.slice(1), samples.slice(-7).reverse().map(sample => sample.fen));
    for(let i = 0; i < samples.length; i++)
        assert.deepEqual(samples[i].history, samples.slice(Math.max(0, i - 7), i + 1).reverse().map(sample => sample.fen));
    assert.deepEqual(parsePosition('position fen ' + position.fen).history, [position.fen]);
    assert.equal(parsePosition('position startpos').history.length, 1);
    assert.throws(() => parsePosition('position startpos moves e2e5'), /Illegal/);
    assert.throws(() => parsePosition('position fen invalid'), /Invalid/);
    assert.throws(() => parsePosition('position startpos unexpected'), /Invalid/);
    const promotion = parsePosition('position fen k7/4P3/8/8/8/8/8/7K w - - 0 1 moves e7e8n');
    assert.match(promotion.fen, /^k3N3/);
    assert.equal(promotion.history.length, 2);
});

test('context conversion changes the input wrapper without changing any learned initializer', async () => {
    const source = float32Maia3(new Uint8Array(await readFile(new URL('../app/assets/engines/Maia3/model/maia3_simplified.onnx', import.meta.url))));
    const original = fields(get(source, 7)), graph = fields(get(historyMaia3(source), 7));
    const text = value => new TextDecoder().decode(value);
    assert.ok(original.some(item => item.id === 1 && text(get(item.value, 3)) === '/Tile'));
    assert.ok(!graph.some(item => item.id === 1 && text(get(item.value, 3)) === '/Tile'));
    const input = graph.find(item => item.id === 11 && text(get(item.value, 1)) === 'tokens');
    assert.equal(get(fields(get(get(get(input.value, 2), 1), 2))[2].value, 1), 96);
    const weights = new Map(original.filter(item => item.id === 5).map(item => [text(get(item.value, 8)), item.value]));
    for(const item of graph.filter(item => item.id === 5)) assert.deepEqual(item.value, weights.get(text(get(item.value, 8))));
    assert.throws(() => historyMaia3(historyMaia3(source)), /repeated-board wrapper/);
});

test('browser history encoding, exported context inference and legacy models work in the actual app', { timeout: 180000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    try {
        const page = await browser.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${url}/tools/doppelmaia/`);
        const result = await page.evaluate(async ({ samples, command }) => {
            const { preprocessMaia3 } = await import('../../app/assets/engines/Maia3/tensor.js');
            const { float32Maia3, historyMaia3 } = await import('./maia3-model.js');
            const { savePersonalModel } = await import('../../app/assets/engines/Maia3/personal-models.js');
            const { default: MaiaEngine } = await import('../../app/assets/engines/Maia3/maiaEngine.js');
            let compared = 0;
            for(const sample of samples) {
                const actual = preprocessMaia3(sample.fen, sample.history);
                const current = preprocessMaia3(sample.fen);
                if(actual.legalMoves.some((value, i) => value !== current.legalMoves[i])) throw new Error('Legal mask changed.');
                for(let frame = 0; frame < 8; frame++) {
                    const expected = preprocessMaia3(sample.history[Math.min(7 - frame, sample.history.length - 1)]).boardTokens;
                    for(let square = 0; square < 64; square++)
                        for(let piece = 0; piece < 12; piece++) {
                            if(actual.boardTokens[square * 96 + frame * 12 + piece] !== expected[square * 12 + piece])
                                throw new Error('Incorrect history orientation or earliest-frame padding.');
                            compared++;
                        }
                }
            }
            let rejected = 0;
            for(const history of [[], Array(9).fill(samples[0].fen), [samples[1].fen]]) {
                try { preprocessMaia3(samples[0].fen, history); }
                catch { rejected++; }
            }
            const source = new Uint8Array(await (await fetch('../../app/assets/engines/Maia3/model/maia3_simplified.onnx')).arrayBuffer());
            const id = await savePersonalModel(new File([historyMaia3(float32Maia3(source))], 'context-test.onnx'), 1800);
            const lines = [], engine = new MaiaEngine({ modelId: id, provider: 'wasm', onMessage: message => lines.push(message) });
            let context;
            try {
                await engine.init();
                await engine.uci(command);
                const fen = engine.currentFen, history = engine.currentHistory;
                const full = await engine.evaluate(fen, 1800, 2000);
                const repeated = await engine.evaluate(fen, 1800, 2000, [fen]);
                const batch = await engine.evaluateBatch([fen, history[1]], [1800, 1800], [2000, 2000], [history, history.slice(1)]);
                const missing = await engine.evaluateBatch([fen], [1800], [2000]);
                const difference = (a, b) => Object.keys(a.policy).reduce((sum, move) => sum + Math.abs(a.policy[move] - b.policy[move]), 0);
                await engine.uci('go nodes 1');
                const channels = engine.maia.tokenChannels, length = history.length;
                await engine.uci('ucinewgame');
                context = { channels, length, resetLength: engine.currentHistory.length, causalDifference: difference(full, repeated),
                    batchDifference: difference(full, batch.result[0]), paddingDifference: difference(repeated, missing.result[0]), lines };
            } finally { engine.dispose(); }
            const legacy = new MaiaEngine();
            try {
                await legacy.init();
                const output = await legacy.evaluate(samples[1].fen, 1800, 2000);
                return { compared, rejected, context, legacyChannels: legacy.maia.tokenChannels,
                    legacyLegalMoves: Object.keys(output.policy).length };
            } finally { legacy.dispose(); }
        }, { samples, command });
        assert.equal(result.compared, samples.length * 64 * 96);
        assert.equal(result.rejected, 3);
        assert.equal(result.context.channels, 96);
        assert.equal(result.context.length, 8);
        assert.equal(result.context.resetLength, 1);
        assert.ok(result.context.causalDifference > 0.0001);
        assert.ok(result.context.batchDifference < 0.0001);
        assert.ok(result.context.paddingDifference < 0.0001);
        assert.ok(result.context.lines.some(line => /^bestmove [a-h][1-8][a-h][1-8]/.test(line)));
        assert.equal(result.legacyChannels, 12);
        assert.ok(result.legacyLegalMoves > 0);
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
