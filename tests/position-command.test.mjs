import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPositionCommand } from '../app/assets/js/instance/positionCommand.js';

const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
const afterE5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';

const history = [
    { fen: { full: afterE5 }, boardChanges: { from: 'e7', to: 'e5' } },
    { fen: { full: afterE4 }, boardChanges: { from: 'e2', to: 'e4' } },
    { fen: { full: start }, boardChanges: {} }
];

test('verified external history becomes a UCI position command', () => {
    assert.equal(buildPositionCommand(afterE5, history), 'position fen ' + start + ' moves e2e4 e7e5');
});

test('history that does not reproduce the current position falls back to current FEN', () => {
    assert.equal(buildPositionCommand(start, history), 'position fen ' + start);
});

test('incomplete history and nonstandard variants use the safe FEN command', () => {
    assert.equal(buildPositionCommand(afterE5, history.slice(0, 1)), 'position fen ' + afterE5);
    assert.equal(buildPositionCommand(afterE5, history, 'atomic'), 'position fen ' + afterE5);
});

test('invalid or incomplete move records fall back to current FEN', () => {
    const incomplete = [{ fen: { full: afterE5 } }, { fen: { full: start }, boardChanges: {} }];
    assert.equal(buildPositionCommand(afterE5, incomplete), 'position fen ' + afterE5);
});
