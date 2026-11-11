import { Chess } from '../../../app/assets/engines/libraries/chessjs/chess.js';
import { parseGameFiles, buildDataset } from '../data.js';

export function randomGenerator(seed) {
    let value = seed >>> 0;
    return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

// Maia 3 sees mover-relative piece placement, not FEN counters or castling flags.
export function modelPositionKey(fen) {
    const [placement, turn] = fen.split(' ');
    return turn === 'w' ? placement : placement.split('/').reverse().map(rank =>
        [...rank].map(piece => /[a-z]/.test(piece) ? piece.toUpperCase() : piece.toLowerCase()).join('')).join('/');
}

export function knightChoices(sample) {
    const board = new Chess(sample.fen || sample.history[0]);
    return sample.legalMoves.map(move => board.get(move.slice(0, 2))?.type === 'n');
}

function generatePgn(count, seed, split) {
    const random = randomGenerator(seed), games = [];
    for(let i = 0; i < count; i++) {
        const board = new Chess(), color = i % 2 ? 'b' : 'w';
        board.header('Event', `Synthetic KnightFan ${split} ${seed}-${i + 1}`,
            'White', color === 'w' ? 'KnightFan' : 'RandomOpponent',
            'Black', color === 'b' ? 'KnightFan' : 'RandomOpponent', 'Result', '*');
        for(let ply = 0; ply < 72 && !board.game_over(); ply++) {
            const moves = board.moves({ verbose: true });
            let pool = moves;
            if(ply >= 12 && board.turn() === color) {
                const knights = moves.filter(move => move.piece === 'n');
                if(knights.length) pool = knights;
            }
            const move = pool[Math.floor(random() * pool.length)];
            board.move({ from: move.from, to: move.to, promotion: move.promotion });
        }
        games.push(board.pgn({ max_width: 100 }));
    }
    return games.join('\n\n');
}

function extract(pgn, maxPositions) {
    const imported = parseGameFiles([{ name: 'knightfan.pgn', text: pgn }]);
    if(imported.diagnostics.some(item => item.status !== 'accepted'))
        throw new Error(`Synthetic PGN import failed: ${JSON.stringify(imported.diagnostics)}`);
    const dataset = buildDataset(imported.games, 'knightfan', {
        maxPositions: 10000, maxPerGame: 200, skipFirstPlies: 12, validationFraction: 0.2, seed: 42
    });
    const samples = [...dataset.train.samples, ...dataset.validation.samples].filter(sample => {
        const choices = knightChoices(sample);
        return choices.some(Boolean) && choices.some(value => !value);
    });
    return { samples, gameIds: imported.games.map(game => game.id), maxPositions };
}

function unique(pool, seen) {
    const samples = [];
    for(const sample of pool.samples) {
        const key = modelPositionKey(sample.fen);
        if(seen.has(key)) continue;
        seen.add(key);
        samples.push(sample);
        if(samples.length >= pool.maxPositions) break;
    }
    if(!samples.length) throw new Error('Not enough independent synthetic style positions.');
    return { gameIds: [...new Set(samples.map(sample => sample.gameId))], samples };
}

export function makeStyleStudy({ seed = 20261110, trainGames = 70, validationGames = 20, testGames = 25,
    trainPositions = 1200, validationPositions = 240, testPositions = 300 } = {}) {
    const pgn = {
        train: generatePgn(trainGames, seed, 'train'),
        validation: generatePgn(validationGames, seed + 100000, 'validation'),
        test: generatePgn(testGames, seed + 200000, 'test')
    };
    const seen = new Set();
    const train = unique(extract(pgn.train, trainPositions), seen);
    const validation = unique(extract(pgn.validation, validationPositions), seen);
    const test = unique(extract(pgn.test, testPositions), seen);
    return {
        dataset: { version: 1, player: 'knightfan',
            options: { maxPositions: train.samples.length + validation.samples.length, maxPerGame: 200,
                skipFirstPlies: 12, validationFraction: 0.2, seed: 42 }, train, validation },
        test, pgn,
        design: { seed, style: 'After 12 random opening plies, always move a knight when legal. Opponents choose random legal moves.',
            testSubset: 'Only positions offering both a knight move and a non-knight move',
            deduplication: 'No shared mover-relative piece placement within or across train, validation and test',
            warning: 'Artificial legal games, not human play or evidence of chess strength.' }
    };
}

export function randomizeTrainingLabels(dataset, seed = 77123) {
    const random = randomGenerator(seed);
    return { ...dataset, train: { ...dataset.train, samples: dataset.train.samples.map(sample => ({
        ...sample, move: sample.legalMoves[Math.floor(random() * sample.legalMoves.length)]
    })) } };
}

export function summarizeStyle(samples, base, trained, control, seed = 42) {
    if(!samples.length || [base, trained, control].some(rows => rows.length !== samples.length))
        throw new Error('Incomplete style-study predictions.');
    const names = { base, trained, randomLabelControl: control };
    const summary = Object.fromEntries(Object.entries(names).map(([name, rows]) => [name, {
        positions: rows.length, knightProbability: rows.reduce((sum, row) => sum + row.knightProbability, 0) / rows.length,
        knightTop1: rows.reduce((sum, row) => sum + Number(row.knightTop1), 0) / rows.length,
        moveMatch: rows.reduce((sum, row) => sum + Number(row.moveMatch), 0) / rows.length,
        crossEntropy: rows.reduce((sum, row) => sum + row.crossEntropy, 0) / rows.length
    }]));
    const clusters = new Map();
    samples.forEach((sample, i) => {
        if(!clusters.has(sample.gameId)) clusters.set(sample.gameId, []);
        clusters.get(sample.gameId).push(i);
    });
    const games = [...clusters.values()], random = randomGenerator(seed);
    const bootstrap = against => {
        const differences = [];
        for(let iteration = 0; iteration < 2000; iteration++) {
            let sum = 0, count = 0;
            for(let draw = 0; draw < games.length; draw++) {
                for(const i of games[Math.floor(random() * games.length)]) {
                    sum += trained[i].knightProbability - against[i].knightProbability; count++;
                }
            }
            differences.push(sum / count);
        }
        differences.sort((a, b) => a - b);
        return { low: differences[49], high: differences[1949], method: '2000 paired game-cluster bootstrap draws, 95% percentile interval' };
    };
    return { ...summary, testGames: games.length,
        knightProbabilityGainVsBase95: bootstrap(base),
        knightProbabilityGainVsRandomLabels95: bootstrap(control) };
}
