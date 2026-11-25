import test from 'node:test';
import assert from 'node:assert/strict';
import { chess, binPropPerspective } from '../binprop-chess.js';
import { binPropValues, pcfBinPropMotifs } from '../binprop-full.js';

test('BinProp compatibility keeps geometric attacks and absolute pins distinct', () => {
    const board = new chess.Board('4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1');
    assert.equal(board.is_pinned(chess.WHITE, chess.square(4, 1)), true);
    assert.ok(board.attacks(chess.square(4, 1)).has(chess.square(3, 1)));
    assert.ok(!board.legal_moves.some(move => move.from_square === chess.square(4, 1) && move.to_square === chess.square(3, 1)));
    assert.ok(board.attackers(chess.WHITE, chess.square(3, 1)).has(chess.square(4, 1)));
});

test('BinProp move replay preserves castling, en-passant and promotion semantics', () => {
    const castle = new chess.Board('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const move = castle.legal_moves.find(item => item.from_square === 4 && item.to_square === 6);
    assert.ok(move);
    castle.push(move);
    assert.deepEqual(castle.piece_at(5), { piece_type: 'r', color: true });
    castle.pop();
    assert.equal(castle.has_kingside_castling_rights(chess.WHITE), true);
    assert.deepEqual(castle.piece_at(7), { piece_type: 'r', color: true });

    const fen = 'rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
    const ep = new chess.Board(fen), capture = ep.legal_moves.find(item => ep.is_en_passant(item));
    assert.ok(capture);
    ep.push(capture);
    assert.equal(ep.piece_at(chess.square(3, 4)), null);
    ep.pop();
    assert.equal(binPropPerspective(fen, 'w').split(' ')[3], 'd6');
    assert.equal(binPropPerspective(fen, 'b').split(' ')[3], '-');

    const promotion = new chess.Board('7k/P7/8/8/8/8/8/K7 w - - 0 1');
    const moves = promotion.legal_moves.filter(item => item.from_square === chess.square(0, 6));
    assert.deepEqual(new Set(moves.map(item => item.promotion)), new Set(['q', 'r', 'b', 'n']));
    promotion.push(moves.find(item => item.promotion === 'n'));
    assert.equal(promotion.piece_type_at(chess.square(0, 7)), 'n');
    promotion.pop();
    assert.equal(promotion.piece_type_at(chess.square(0, 6)), 'p');
});

test('the complete pinned Opus catalog produces booleans for each perspective', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    assert.equal(pcfBinPropMotifs.length, 30);
    for(const side of ['w', 'b']) assert.ok(binPropValues(fen, side).every(value => typeof value === 'boolean'));
});
