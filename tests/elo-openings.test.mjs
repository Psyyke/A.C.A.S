import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildOpenings, openingCount } from '../tools/eloeye/openings.js';
import { planBatch, batchSizeForBoards, automaticRun } from '../tools/eloeye/eloPolicy.js';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';

const records = JSON.parse(await readFile(new URL('../app/assets/openings/pgn.json', import.meta.url), 'utf8'));
const openings = buildOpenings(records);

test('opening suite supplies 500 distinct legal non-capture positions deterministically', () => {
    assert.equal(openings.length, openingCount);
    assert.equal(new Set(openings.map(opening => opening.fen.split(' ').slice(0, 4).join(' '))).size, openingCount);
    assert.deepEqual(buildOpenings(records), openings);
    for(const opening of openings) {
        const chess = new Chess();
        assert.ok([6, 8, 10, 12].includes(opening.moves.length));
        for(const san of opening.moves) {
            const move = chess.move(san);
            assert.ok(move);
            assert.equal(move.captured, undefined);
            assert.ok(!['k', 'r'].includes(move.piece));
        }
        assert.equal(chess.fen(), opening.fen);
        assert.equal(chess.turn(), 'w');
        assert.equal(chess.in_check(), false);
        assert.equal(chess.game_over(), false);
    }
    assert.deepEqual(openings.slice(0, 4).map(opening => opening.moves[0]), ['e4', 'd4', 'c4', 'Nf3']);
});

test('every board count uses each opening exactly twice with swapped colors through the full budget', () => {
    for(const boards of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const games = [];
        while(games.length < automaticRun.maxGames) {
            games.push(...planBatch(games, Math.min(batchSizeForBoards(boards), automaticRun.maxGames - games.length))
                .map(game => ({ ...game, score: 0.5 })));
        }
        for(let index = 0; index < games.length; index += 2) {
            const [white, black] = games.slice(index, index + 2);
            assert.equal(white.opening, index / 2);
            assert.equal(white.opening, black.opening);
            assert.equal(white.opponent, black.opponent);
            assert.equal(white.acasIsWhite, true);
            assert.equal(black.acasIsWhite, false);
            assert.ok(openings[white.opening]);
        }
    }
});

test('insufficient opening data fails explicitly rather than repeating positions', () => {
    assert.throws(() => buildOpenings([]), /Not enough/);
});
