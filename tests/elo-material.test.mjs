import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';
import { materialWinner, materialStabilityPlies } from '../tools/eloeye/materialAdjudication.js';
import { parseCheckpoint, measurementProtocol } from '../tools/eloeye/storage.js';

test('only king and queen versus a bare king qualifies, symmetrically', () => {
    for(const [fen, expected] of [
        ['7k/8/8/8/8/8/Q7/K7 w - - 0 1', 'w'],
        ['7k/8/8/8/8/8/Q7/K7 b - - 0 1', 'w'],
        ['k7/q7/8/8/8/8/8/7K b - - 0 1', 'b'],
        ['k7/q7/8/8/8/8/8/7K w - - 0 1', 'b'],
        ['7k/8/8/8/8/8/R7/K7 w - - 0 1', null],
        ['7k/8/8/8/8/8/QQ6/K7 w - - 0 1', null],
        ['7k/p7/8/8/8/8/Q7/K7 w - - 0 1', null],
        ['7k/8/8/8/8/8/B7/K7 w - - 0 1', null],
        ['7k/8/8/8/8/8/Q7/K7 w - - 61 1', null],
        ['7k/8/8/8/8/8/Q7/K7 w - - 100 1', null],
        ['7k/5Q2/5K2/8/8/8/8/8 b - - 0 1', null],
        ['7k/6Q1/5K2/8/8/8/8/8 b - - 0 1', null],
        ['7k/6Q1/8/8/8/8/8/K7 b - - 0 1', null],
        ['7k/6Q1/8/8/8/8/8/K7 w - - 0 1', null]
    ]) {
        const chess = new Chess(fen), before = chess.fen();
        assert.equal(materialWinner(chess), expected, fen);
        assert.equal(chess.fen(), before, 'Legal reply checks must undo all speculative moves');
        assert.equal(chess.history().length, 0);
    }
});

async function runner(humanMove) {
    const source = await readFile(new URL('../tools/eloeye/eloPlayer.js', import.meta.url), 'utf8');
    const start = source.indexOf('export async function playGame(');
    const end = source.indexOf('// Works out whether', start);
    return vm.runInNewContext(source.slice(start, end).replace('export async', 'async') + '; playGame', {
        Chess, materialWinner, materialStabilityPlies, defaultSelectionWeights: {},
        timings: { connectTimeoutMs: 100, paceMs: 0 }, destsOf: () => ({}), humanMove
    });
}

test('stable non-repeating material needs eight played plies and scores both sides correctly', async () => {
    for(const acasIsWhite of [true, false]) {
        const chess = new Chess('7k/8/8/8/8/8/Q7/K7 w - - 0 1');
        const visited = new Set([chess.fen().split(' ').slice(0, 4).join(' ')]);
        const choose = () => {
            for(const move of chess.moves({ verbose: true })) {
                chess.move(move);
                const key = chess.fen().split(' ').slice(0, 4).join(' ');
                const allowed = materialWinner(chess) === 'w' && !visited.has(key);
                chess.undo();
                if(allowed) {
                    visited.add(key);
                    return move;
                }
            }
            throw new Error('Fixture has no stable continuation');
        };
        const play = await runner(async () => choose());
        let adjudications = 0, lastPosition;
        const frame = {
            statuses: new Set(['connected']), whenReady: async () => {},
            waitFor: async predicate => predicate(), setPosition: position => { lastPosition = position; }
        };
        const score = await play({ frame, chess, manual: true, acasIsWhite,
            signal: new AbortController().signal,
            opponentEngine: { move: async () => { const move = choose(); return move.from + move.to; } },
            onAdjudication: winner => { assert.equal(winner, 'w'); adjudications++; }
        });
        assert.equal(chess.history().length, materialStabilityPlies);
        assert.equal(score, acasIsWhite ? 1 : 0);
        assert.equal(adjudications, 1);
        assert.equal(lastPosition.fen, chess.fen());
        assert.equal(chess.game_over(), false);
    }
});

test('repeating queen endgames reach a real draw instead of a material win', async () => {
    const chess = new Chess('7k/8/8/8/8/8/Q7/K7 w - - 0 1');
    const sequence = ['a2b2', 'h8g8', 'b2a2', 'g8h8'];
    const choose = () => {
        const uci = sequence[chess.history().length % sequence.length];
        return { from: uci.slice(0, 2), to: uci.slice(2) };
    };
    const play = await runner(async () => choose());
    const score = await play({
        frame: { statuses: new Set(['connected']), whenReady: async () => {},
            waitFor: async predicate => predicate(), setPosition() {} },
        chess, acasIsWhite: true, manual: true, signal: new AbortController().signal,
        opponentEngine: { move: async () => { const move = choose(); return move.from + move.to; } },
        onAdjudication: () => assert.fail('Repetition must not be adjudicated')
    });
    assert.equal(score, 0.5);
    assert.equal(chess.in_threefold_repetition(), true);
});

test('material-result labels persist and older scoring checkpoints are rejected', () => {
    const data = { version: 1, protocol: measurementProtocol, mode: 'auto', boards: 1, total: 1,
        games: [{ opponent: 1500, opening: 0, acasIsWhite: true, score: 1, materialAdjudication: true }] };
    assert.equal(parseCheckpoint(JSON.stringify(data)).games[0].materialAdjudication, true);
    assert.throws(() => parseCheckpoint(JSON.stringify({ ...data, protocol: 'maia-top-policy-paired-openings-pooled-personality-v4' })), /older/);
    data.games[0].score = 0.5;
    assert.throws(() => parseCheckpoint(JSON.stringify(data)), /Invalid/);
});
