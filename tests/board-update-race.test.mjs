import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/assets/js/instance/Interface.js', import.meta.url), 'utf8');
const start = source.indexOf('    async updateBoardFen(');
const end = source.indexOf('\n    }', start) + '\n    }'.length;
const createUpdate = new Function('GET_BOARD_DIMENSIONS_FROM_FEN', 'resetPipHints',
    'prepareFeedbackPosition', 'setDynamicSettingsContext', 'annotateOpponentMove',
    `return ({${source.slice(start, end)}}).updateBoardFen;`);

test('duplicate no-op notification cannot cancel an in-flight forced analysis of the same FEN', async () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const calculations = [], stops = [];
    const instance = {
        boardState: { history: [{ fen: { full: fen, basic: fen.split(' ')[0] } }], playerColor: 'w' },
        currentFen: fen, boardDimensions: { width: 8, height: 8 }, gameStateHistory: [], pV: {},
        instanceElem: { querySelector: () => ({}) },
        engineStopCalculating(...args) { stops.push(args); }, syncDynamicSettings: () => gate,
        renderFeedback: async () => {}, calculateBestMoves: async value => { calculations.push(value); }
    };
    const iface = {
        AcasInstance: instance, lastAcceptedBasicFen: fen.split(' ')[0],
        removeMarkings() {}, removeBookMarkings() {}, updateLearningBoard: async () => {},
        updatePgn: async () => {}
    };
    const update = createUpdate(() => [8, 8], () => {}, () => {}, () => {}, async () => {});
    const running = update.call(iface, { skipValidityChecks: true });
    await update.call(iface);
    release();
    await running;
    assert.deepEqual(calculations, [fen]);
    assert.equal(stops.length, 1);
});

test('a same-position profile refresh does not interrupt or clear other profiles', async () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const calls = [], config = { skipValidityChecks: true, specificProfileName: 'default' };
    const instance = {
        boardState: { history: [{ fen: { full: fen, basic: fen.split(' ')[0] } }] }, currentFen: fen,
        engineStopCalculating() { throw new Error('Current search must not be stopped'); },
        calculateBestMoves: async (...args) => { calls.push(args); }
    };
    const iface = { AcasInstance: instance, lastAcceptedBasicFen: fen.split(' ')[0],
        removeMarkings() { throw new Error('Other profiles must not be cleared'); } };
    const update = createUpdate(() => [8, 8], () => {}, () => {}, () => {}, async () => {});
    await update.call(iface, config);
    assert.deepEqual(calls, [[fen, config]]);
});

test('a changed FEN still cancels searches for the previous position', async () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const stops = [], calculations = [];
    const instance = {
        boardState: { history: [{ fen: { full: fen, basic: fen.split(' ')[0] } }], playerColor: 'w' },
        currentFen: 'previous position', boardDimensions: { width: 8, height: 8 }, gameStateHistory: [], pV: {},
        instanceElem: { querySelector: () => ({}) }, engineStopCalculating(...args) { stops.push(args); },
        syncDynamicSettings: async () => {}, renderFeedback: async () => {},
        calculateBestMoves: async value => { calculations.push(value); }
    };
    const iface = {
        AcasInstance: instance, removeMarkings() {}, removeBookMarkings() {},
        updateLearningBoard: async () => {}, updatePgn: async () => {}
    };
    const update = createUpdate(() => [8, 8], () => {}, () => {}, () => {}, async () => {});
    await update.call(iface);
    assert.deepEqual(stops, [[false, 'New board FEN, any running calculations are now useless!']]);
    assert.deepEqual(calculations, [fen]);
});
