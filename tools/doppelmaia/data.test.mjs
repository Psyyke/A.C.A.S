import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../../app/assets/engines/libraries/chessjs/chess.js';
import { parseGameFiles, buildDataset, validateDataset } from './data.js';

const pgn = (moves = '1. e4 e5 2. Nf3 Nc6', white = 'Alice', black = 'Bob', extra = '') =>
    `[Event "Local"]\n[White "${white}"]\n[Black "${black}"]\n${extra}\n${moves} *`;
const file = (text, name = 'games.pgn') => ({ name, text });
const parse = (...files) => parseGameFiles(files);
const samples = dataset => [...dataset.train.samples, ...dataset.validation.samples];

test('multi-game PGN, annotations, multi-file and explicit duplicate diagnostics', () => {
    const result = parse(file(pgn() + '\n\n' + pgn('1. d4 d5', 'Carol')),
        file(pgn('1.e4 {comment} e5 2.Nf3 (2. Bc4 Nc6 (2...Nf6)) Nc6'), 'second.pgn'));
    assert.equal(result.games.length, 2);
    assert.deepEqual(result.players, ['Alice', 'Bob', 'Carol']);
    assert.deepEqual(result.diagnostics.map(item => item.status), ['accepted', 'accepted', 'duplicate']);
    assert.equal(result.diagnostics[2].file, 'second.pgn');
    assert.deepEqual(result.games[0].moves, ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
});

test('Chess.com archive shape and cross-format canonical deduplication', () => {
    const archive = { games: [{ pgn: pgn(), white: { username: 'ALICE' }, black: { username: 'Bob' }, rules: 'chess' }] };
    const lichess = { id: 'abc', players: { white: { user: { name: 'Alice', id: 'alice' } },
        black: { user: { name: 'Bob', id: 'bob' } } }, moves: 'e4 e5 Nf3 Nc6', variant: 'standard', winner: 'white' };
    const result = parse(file(JSON.stringify(archive), 'archive.json'), file(JSON.stringify(lichess), 'lichess.json'));
    assert.equal(result.games.length, 1);
    assert.equal(result.games[0].white, 'ALICE');
    assert.equal(result.diagnostics[1].status, 'duplicate');
    assert.equal(buildDataset(result.games, ' aLiCe ', { skipFirstPlies: 0 }).train.samples.length, 2);
});

test('Lichess NDJSON, JSON arrays, ID aliases, winners and draws', () => {
    const game = { id: 'abc', players: { white: { user: { name: 'Alice', id: 'alice-id' } },
        black: { user: { name: 'Bob', id: 'bob-id' } } }, moves: 'e4 e5', winner: 'black', status: 'mate', variant: 'standard' };
    const draw = { ...game, id: 'def', moves: 'd4 d5', winner: undefined, status: 'draw' };
    const result = parse(file(JSON.stringify(game) + '\n{broken}\n' + JSON.stringify(draw), 'games.ndjson'),
        file(JSON.stringify([{ ...game, moves: 'c4 e5' }]), 'array.json'));
    assert.equal(result.games.length, 3);
    assert.equal(result.diagnostics.filter(item => item.status === 'rejected').length, 1);
    assert.equal(result.games[0].result, '0-1');
    assert.equal(result.games[1].result, '1/2-1/2');
    assert.equal(result.games[0].sourceId, 'abc');
    assert.equal(samples(buildDataset(result.games, 'ALICE-ID', { skipFirstPlies: 0 })).length, 3);
});

test('castling, promotion, setup FEN and black-to-move histories', () => {
    const castle = pgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6');
    const promotion = pgn('1. a8=Q+', 'Alice', 'Bob', '[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]');
    const black = pgn('8... h1=Q+', 'Bob', 'Alice', '[FEN "7k/8/8/8/8/8/7p/K7 b - - 0 8"]');
    const result = parse(file(castle + '\n' + promotion + '\n' + black));
    assert.equal(result.games.length, 3);
    assert.equal(result.games[0].moves[6], 'e1g1');
    assert.equal(result.games[1].moves[0], 'a7a8q');
    assert.equal(result.games[2].moves[0], 'h2h1q');
    const dataset = buildDataset(result.games, 'Alice', { skipFirstPlies: 0, validationFraction: 0 });
    assert(samples(dataset).some(sample => sample.move === 'h2h1q' && sample.color === 'b'));
    validateDataset(JSON.parse(JSON.stringify(dataset)));
});

test('rejects invalid full games, variants, malformed entries and mismatched results', () => {
    const invalid = [
        { pgn: pgn('1. e4 e5 2. Qh9') },
        { pgn: pgn(), rules: 'chess960' },
        { moves: 'e4', variant: 'antichess' },
        { moves: 'e4', initialFen: 'not a fen' },
        { moves: 'e4', initialFen: '8/8/8/8/8/8/8/8 w - - 0 1' },
        { pgn: '[SetUp "1"]\n\n1. e4 *' },
        { pgn: '[Result "1-0"]\n\n1. e4 0-1' },
        { pgn: '[White "Alice"]\n\n1. e4 {unfinished' },
        {}, null, { moves: '' }, { pgn: pgn() + '\n' + pgn('1. d4') }
    ];
    const result = parse(file(JSON.stringify(invalid), 'bad.json'), file(''), file('{bad', 'bad.json'));
    assert.equal(result.games.length, 0);
    assert.equal(result.diagnostics.length, invalid.length + 2);
    assert(result.diagnostics.every(item => item.status === 'rejected'));
    const partlyValid = parse(file(pgn('1. e4 bogus') + '\n' + pgn('1. d4 d5')));
    assert.equal(partlyValid.games.length, 1);
    assert.equal(partlyValid.diagnostics[0].status, 'rejected');
});

test('result-delimited headerless games and comments with delimiters', () => {
    const result = parse(file('1. e4 { [Event "Not a game"] 0-1 } e5 1-0\n1. d4 d5 0-1'));
    assert.equal(result.games.length, 2);
    assert.deepEqual(result.games.map(game => game.result), ['1-0', '0-1']);
    assert.equal(parse(file('{ Leading comment }\n1. e4 e5 *')).games.length, 1);
    assert.equal(parse(file('{ Only a comment }')).diagnostics[0].status, 'rejected');
});

test('case-insensitive targeting of both colors, current-first history and legal move labels', () => {
    const result = parse(file(pgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5')),
        file(pgn('1. d4 d5 2. c4 e6', 'Bob', 'aLiCe')));
    const dataset = buildDataset(result.games, 'ALICE', { skipFirstPlies: 0, validationFraction: 0 });
    assert.equal(samples(dataset).length, 8);
    assert(samples(dataset).some(sample => sample.color === 'b'));
    for (const sample of samples(dataset)) {
        assert.equal(sample.history[0], sample.fen);
        assert.equal(sample.history.length, Math.min(sample.ply + 1, 8));
        assert.equal(sample.repetitions.length, sample.history.length);
        assert(sample.legalMoves.includes(sample.move));
        assert.equal(new Chess(sample.fen).turn(), sample.color);
    }
    assert.equal(buildDataset(result.games, 'Alice', { validationFraction: 0 }).train.samples.length, 8);
    assert.equal(samples(buildDataset(result.games, 'Nobody')).length, 0);
});

test('seeded game-level splits have no leakage, dedup input and respect sampling caps', () => {
    const games = parse(file(['e4 e5', 'd4 d5', 'c4 e5', 'Nf3 d5', 'b3 e5', 'g3 d5']
        .map(moves => pgn(moves)).join('\n'))).games;
    const options = { skipFirstPlies: 0, seed: 42, validationFraction: 0.34 };
    const dataset = buildDataset([...games, games[0]], 'Alice', options);
    assert.equal(dataset.validation.gameIds.length, 2);
    assert.equal(dataset.train.gameIds.length, 4);
    assert(dataset.train.gameIds.every(id => !dataset.validation.gameIds.includes(id)));
    assert.deepEqual(dataset, buildDataset([...games].reverse(), 'alice', options));
    assert.notDeepEqual(dataset.train.gameIds, buildDataset(games, 'Alice', { ...options, seed: 9 }).train.gameIds);
    const capped = buildDataset(games, 'Alice', { ...options, maxPositions: 3, maxPerGame: 1 });
    assert.equal(samples(capped).length, 3);
    assert.equal(samples(buildDataset(games, 'Alice', { ...options, maxPositions: 0 })).length, 0);
    assert.equal(samples(buildDataset(games, 'Alice', { ...options, maxPerGame: 0 })).length, 0);
});

test('starting position is part of the deduplication key', () => {
    const one = pgn('1. a4', 'Alice', 'Bob', '[FEN "7k/8/8/8/8/8/P7/7K w - - 0 1"]');
    const two = pgn('1. a4', 'Alice', 'Bob', '[FEN "6k1/8/8/8/8/8/P7/7K w - - 0 1"]');
    assert.equal(parse(file(one + '\n' + two)).games.length, 2);
});

test('validates JSON dataset schema and rejects tampering before training', () => {
    const games = parse(file(pgn('1. e4 e5 2. Nf3 Nc6'))).games;
    const dataset = buildDataset(games, 'Alice', { skipFirstPlies: 0 });
    assert.equal(validateDataset(dataset), dataset);
    const corruptions = [
        d => { d.version = 2; },
        d => { d.train.samples[0].move = 'a1a8'; },
        d => { d.train.samples[0].legalMoves.pop(); },
        d => { d.train.samples[0].history = []; },
        d => { d.train.samples[0].color = 'b'; },
        d => { d.train.samples[0].repetitions = [2]; },
        d => { d.train.samples[0].result = 'win'; },
        d => { d.validation.gameIds = [...d.train.gameIds]; },
        d => { d.train.samples[0].gameId = 'unknown'; },
        d => { d.train.samples.push(d.train.samples[0]); },
        d => { d.train.samples[1].history[1] = d.train.samples[0].fen; }
    ];
    for (const corrupt of corruptions) {
        const copy = JSON.parse(JSON.stringify(dataset));
        corrupt(copy);
        assert.throws(() => validateDataset(copy));
    }
    for (const options of [{ seed: -1 }, { validationFraction: NaN }, { maxPositions: -1 }, { skipFirstPlies: 0.2 }])
        assert.throws(() => buildDataset(games, 'Alice', options));
    assert.throws(() => buildDataset(games, ''));
    const copy = JSON.parse(JSON.stringify(games));
    copy[0].moves.push('a1a8');
    assert.throws(() => buildDataset(copy, 'Alice'));
});

test('full-game repetitions survive skipped plies and the eight-position history window', () => {
    const moves = '1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. Nf3 Nf6 6. Ng1 Ng8';
    const games = parse(file(pgn(moves))).games;
    const dataset = buildDataset(games, 'Alice', { validationFraction: 0, skipFirstPlies: 10 });
    const sample = dataset.train.samples[0];
    assert.equal(sample.ply, 10);
    assert.equal(sample.history.length, 8);
    assert.equal(sample.repetitions[0], 1);
    assert.deepEqual(sample.repetitions, [1, 1, 1, 1, 1, 1, 1, 0]);
    validateDataset(dataset);
    assert.equal(dataset.options.maxPositions, 6000);
});

test('round-robin sampling balances long games before applying a global cap', () => {
    const games = parse(file([
        pgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'),
        pgn('1. d4 d5 2. c4 e6 3. Nc3 Nf6'),
        pgn('1. c4 e5 2. Nc3 Nf6 3. g3 d5')
    ].join('\n'))).games;
    const dataset = buildDataset(games, 'Alice', { skipFirstPlies: 0, validationFraction: 0, maxPositions: 4 });
    assert.equal(new Set(dataset.train.samples.slice(0, 3).map(sample => sample.gameId)).size, 3);
    assert.equal(dataset.train.samples.length, 4);
    validateDataset(dataset);
});

test('default imports retain early opening habits while capped games cover later play too', () => {
    const games = parse(file(pgn('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 5. Nf3 Nf6 6. Ng1 Ng8 7. Nf3 Nf6 8. Ng1 Ng8 9. Nf3 Nf6 10. Ng1 Ng8 11. Nf3 Nf6 12. Ng1 Ng8 13. Nf3 Nf6 14. Ng1 Ng8 15. Nf3 Nf6 16. Ng1 Ng8'))).games;
    const dataset = buildDataset(games, 'Alice', { validationFraction: 0, maxPositions: 4 });
    assert.equal(dataset.options.skipFirstPlies, 0);
    assert.equal(dataset.train.samples.length, 4);
    assert.equal(dataset.train.samples[0].ply, 0);
    assert.ok(dataset.train.samples.some(sample => sample.ply >= 24));
    validateDataset(dataset);
});
