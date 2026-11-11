import assert from 'node:assert/strict';
import test from 'node:test';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';
import { parseGameFiles, buildDataset, validateDataset } from '../tools/doppelmaia/data.js';

function longGames() {
    let state = 42;
    const files = [];
    for(let i = 0; i < 40; i++) {
        const chess = new Chess();
        chess.header('White', 'Me', 'Black', 'Other');
        for(let ply = 0; ply < 90; ply++) {
            const moves = chess.moves();
            if(!moves.length) break;
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            chess.move(moves[state % moves.length]);
        }
        files.push({ name: `game-${i}.pgn`, text: chess.pgn() });
    }
    return parseGameFiles(files).games;
}

test('tight budgets sample beyond openings even when there are more games than positions', () => {
    const games = longGames();
    assert.equal(games.length, 40);
    for(const maxPositions of [20, 60, 100]) {
        const options = { maxPositions, seed: 42, validationFraction: 0.2 };
        const dataset = buildDataset(games, 'Me', options);
        assert.deepEqual(dataset, buildDataset(games, 'Me', options));
        assert.equal(dataset.train.samples.length + dataset.validation.samples.length, maxPositions);
        assert.equal(new Set([...dataset.train.gameIds, ...dataset.validation.gameIds]).size, games.length);
        for(const split of [dataset.train, dataset.validation]) {
            const later = split.samples.filter(sample => sample.ply >= 24);
            assert(later.length >= split.samples.length * 0.4,
                `${maxPositions}: ${later.length}/${split.samples.length} later positions`);
            assert.equal(new Set(split.samples.map(sample => `${sample.gameId}:${sample.ply}`)).size, split.samples.length);
        }
        assert([...dataset.train.samples, ...dataset.validation.samples].some(sample => sample.ply >= 50),
            `${maxPositions}: Must reach later game moves`);
        validateDataset(dataset);
    }
});
