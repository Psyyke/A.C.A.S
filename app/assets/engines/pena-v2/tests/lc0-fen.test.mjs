import test from 'node:test';
import assert from 'node:assert/strict';
import { uciFen } from '../lc0.js';

test('impossible en passant squares are cleared before Lc0 sees the FEN', () => {
    assert.equal(uciFen('rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq d3 0 3'),
        'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3');
    assert.equal(uciFen('rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3'),
        'rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3');
});
