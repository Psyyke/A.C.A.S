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
    const calculations = [];
    const instance = {
        boardState: { history: [{ fen: { full: fen, basic: fen.split(' ')[0] } }], playerColor: 'w' },
        currentFen: fen, boardDimensions: { width: 8, height: 8 }, gameStateHistory: [], pV: {},
        instanceElem: { querySelector: () => ({}) },
        engineStopCalculating() {}, syncDynamicSettings: () => gate,
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
});
