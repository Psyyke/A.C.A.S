import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';
import { enginePosition } from '../app/assets/js/instance/enginePosition.js';

const source = readFileSync(new URL('../userscript-components/BoardChangeParser.js', import.meta.url), 'utf8');
const Parser = new Function(`${source}; return BoardChangeParser;`)();
const parser = new Parser({});
const basic = fen => fen.split(' ')[0];
function trace(moves, initial) {
    const chess = new Chess(initial);
    const state = move => ({
        observedPly: (Number(chess.fen().split(' ')[5]) - 1) * 2 + (chess.turn() === 'b' ? 1 : 0),
        turn: chess.turn(), fen: { full: chess.fen(), basic: basic(chess.fen()) },
        boardChanges: move ? { from: move.from, to: move.to, promotionPiece: move.promotion } : {},
        observedAt: 123, turnStartedByMove: true, opponentMoveTime: 50
    });
    const history = [state()];
    for(const san of moves) {
        const move = chess.move(san);
        assert.ok(move, san);
        history.unshift(state(move));
    }
    return history;
}
const observe = state => ({ basicFen: state.fen.basic, ply: state.observedPly, turn: state.turn });

test('thousands of legal repetitions never trim history, including identical endpoint placements', () => {
    const history = trace(Array.from({ length: 250 }, () => ['Nf3', 'Nf6', 'Ng1', 'Ng8']).flat());
    const frozen = structuredClone(history);
    for(let index = 0; index < history.length; index++) {
        const current = history.slice(index), observation = observe(current[0]);
        for(const ply of [observation.ply, observation.ply + 1, undefined, null, NaN, -1, 1.5, '0']) {
            const result = parser.reconcileHistory(current, { ...observation, ply });
            assert.equal(result.history, current);
            assert.notEqual(result.status, 'takeback');
        }
    }
    assert.deepEqual(history, frozen);
});

test('stale decreasing ply alone cannot authorize undo: placement and turn must corroborate it', () => {
    const history = trace(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']);
    for(const state of history.slice(1)) {
        const stale = { ...observe(history[0]), ply: state.observedPly };
        assert.equal(parser.reconcileHistory(history, stale).history, history);
        assert.equal(parser.reconcileHistory(history, { ...observe(state),
            turn: state.turn === 'w' ? 'b' : 'w' }).history, history);
    }
    const unanchored = history.map(({ observedPly, ...state }) => state);
    assert.equal(parser.reconcileHistory(unanchored, observe(history[3])).history, unanchored);
    for(const observation of [{}, { ...observe(history[2]), turn: undefined }])
        assert.equal(parser.reconcileHistory(history, observation).history, history);
});

test('confirmed multi-ply undo restores exact clocks, rights, en passant and promotion state without mutation', () => {
    for(const history of [
        trace(['e4', 'a6', 'e5', 'd5', 'exd6', 'cxd6', 'Nf3', 'Nf6']),
        trace(['O-O', 'O-O-O', 'Rfc1', 'Kb8'], 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'),
        trace(['a8=N', 'Kg7', 'Nc7', 'Kf6'], '7k/P7/8/8/8/8/8/7K w - - 0 20'),
        trace(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'])
    ]) {
        const saved = structuredClone(history);
        for(let depth = 1; depth < history.length; depth++) {
            const result = parser.reconcileHistory(history, observe(history[depth]));
            assert.equal(result.status, 'takeback');
            assert.equal(result.history.length, history.length - depth);
            assert.equal(result.history[0].fen.full, history[depth].fen.full);
            assert.equal(result.history[0].opponentMoveTime, null);
            assert.equal(result.history[0].turnStartedByMove, false);
            assert.equal(result.history[0].observedAt, null);
            assert.doesNotThrow(() => enginePosition(result.history[0].fen.full, [...result.history].reverse()));
            assert.equal(parser.reconcileHistory(result.history, observe(result.history[0])).history, result.history);
        }
        assert.deepEqual(history, saved);
    }
});

test('an absolute ply chooses the correct occurrence of a repeated board, not the closest matching placement', () => {
    const history = trace(Array.from({ length: 5 }, () => ['Nf3', 'Nf6', 'Ng1', 'Ng8']).flat());
    for(const ply of [0, 4, 8, 12, 16]) {
        const target = history.find(state => state.observedPly === ply);
        const result = parser.reconcileHistory(history, observe(target));
        assert.equal(result.history[0].observedPly, ply);
        assert.equal(result.history.length, ply + 1);
    }
});

test('same-placement repetition with a fully stale earlier observation is fundamentally indistinguishable', () => {
    const history = trace(['Nf3', 'Nf6', 'Ng1', 'Ng8']);
    // Both the decreasing ply and matching placement/turn are stale. No
    // snapshot-only API can distinguish this from actually browsing to ply 0.
    const result = parser.reconcileHistory(history, observe(history.at(-1)));
    assert.equal(result.status, 'takeback');
    // Without corroborating ply the exact same repeated board never trims.
    assert.equal(parser.reconcileHistory(history, { basicFen: history[0].fen.basic, turn: 'w' }).history, history);
});

test('a different continuation after undo discards the abandoned branch and can itself be undone', () => {
    const history = trace(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']);
    const target = history.find(state => state.observedPly === 2);
    const restored = parser.reconcileHistory(history, observe(target)).history;
    const chess = new Chess(target.fen.full);
    const move = chess.move('d4');
    assert.ok(move);
    const branch = [{ observedPly: 3, turn: chess.turn(),
        fen: { full: chess.fen(), basic: basic(chess.fen()) },
        boardChanges: { from: move.from, to: move.to } }, ...restored];
    assert.doesNotThrow(() => enginePosition(chess.fen(), [...branch].reverse()));
    assert.equal(branch.some(state => state.boardChanges?.to === 'f3'), false);
    const secondUndo = parser.reconcileHistory(branch, observe(target));
    assert.equal(secondUndo.status, 'takeback');
    assert.equal(secondUndo.history[0].fen.full, target.fen.full);
    assert.equal(secondUndo.history.length, 3);
});
