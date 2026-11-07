import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync, constants } from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { parsePgn, readPgn } from './lichess-database/pgn.mjs';
import { analyzeGames, metrics } from './lichess-database/analyze.mjs';
import { optionsFromArgs, runCorpus } from './lichess-database/run.mjs';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';
import { fileURLToPath } from 'node:url';
import { decompressZstd } from './lichess-database/zstd.mjs';

const pgn = `[Event "Fixture \\"quoted\\" \\\\ slash"]
[White "Test unicode \u00e4"]
[Result "1-0"]

1.e4$1 { [%clk 0:01:00] } e5 (1... c5 (2.Nf3 d6) 2.Nf3) 2.Nf3 Nc6
; ignore this comment
3.Bb5 a6 1-0

[Event "En passant"]
[FEN "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"]
[SetUp "1"]

1. exd6 Kd7 *

[Event "Promotion"]
[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]

1.a8=N Kg7 *
`;
async function* chunks(buffer, size = 1) {
    for(let i = 0; i < buffer.length; i += size) yield buffer.subarray(i, i + size);
}
async function collect(iterable) {
    const values = [];
    for await(const value of iterable) values.push(value);
    return values;
}
async function fixture(t) {
    const directory = await mkdtemp(join(tmpdir(), 'acas-pgn-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    return directory;
}
const argsFor = directory => optionsFromArgs(['--directory', directory, '--output', join(directory, 'report.json'),
    '--workers', '2', '--batch-games', '1']);

test('incremental PGN lexer handles every chunk boundary, UTF-8, nested variations, annotations and results', async () => {
    const buffer = Buffer.from(pgn);
    const expected = await collect(parsePgn([buffer]));
    assert.equal(expected.length, 3);
    assert.deepEqual(expected[0].moves, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    assert.equal(expected[0].headers.Event, 'Fixture "quoted" \\ slash');
    assert.equal(expected[0].headers.White, 'Test unicode \u00e4');
    for(const size of [1, 2, 3, 7, 31, 1024])
        assert.deepEqual(await collect(parsePgn(chunks(buffer, size))), expected);
    const escaped = await collect(parsePgn([Buffer.from('% ignored line\n1.e4 ; comment\n1...e5 *')]));
    assert.deepEqual(escaped[0].moves, ['e4', 'e5']);
});

test('malformed/truncated PGN and oversized records fail explicitly', async () => {
    for(const text of ['1.e4 { unfinished', '1.e4 (1.d4', '[Event "broken', '1.e4 ) *',
        '1.e4', '[Event "x"]', '1.e4 [Event "next"]', '[Event unquoted] *']) {
        await assert.rejects(collect(parsePgn([Buffer.from(text)])), /PGN/);
    }
    await assert.rejects(collect(parsePgn([Buffer.from('1.e4 e5 *')], { maxGameChars: 4 })), /exceeds/);
});

test('plain PGN, Zstandard frames and concatenated frames produce identical games', async t => {
    const directory = await fixture(t);
    const plain = join(directory, 'a.pgn'), compressed = join(directory, 'a.pgn.zst'), frames = join(directory, 'b.pgn.zst');
    await writeFile(plain, pgn);
    await writeFile(compressed, zstdCompressSync(Buffer.from(pgn)));
    await writeFile(frames, Buffer.concat([zstdCompressSync(Buffer.from(pgn)), zstdCompressSync(Buffer.from(pgn))]));
    const expected = await collect(readPgn(plain));
    assert.deepEqual(await collect(readPgn(compressed)), expected);
    assert.deepEqual(await collect(readPgn(frames)), [...expected, ...expected]);
    await writeFile(join(directory, 'bad.pgn.zst'), Buffer.from('not zstandard'));
    await assert.rejects(collect(readPgn(join(directory, 'bad.pgn.zst'))));
    const full = zstdCompressSync(Buffer.from(pgn));
    await writeFile(join(directory, 'truncated.pgn.zst'), full.subarray(0, full.length - 4));
    await assert.rejects(collect(readPgn(join(directory, 'truncated.pgn.zst'))));
});

test('Zstandard frame boundaries, large blocks, checksums and skippable frames survive arbitrary chunking', async () => {
    const data = Buffer.alloc(400000);
    for(let i = 0; i < data.length; i++) data[i] = (Math.imul(i, 2654435761) >>> 16) & 255;
    for(const flags of [
        {}, { [constants.ZSTD_c_checksumFlag]: 1 },
        { [constants.ZSTD_c_contentSizeFlag]: 0 }
    ]) {
        const compressed = zstdCompressSync(data, { params: flags });
        for(const size of [1, 17, 65536]) {
            assert.deepEqual(Buffer.concat(await collect(decompressZstd(chunks(compressed, size)))), data);
        }
    }
    const small = zstdCompressSync(Buffer.from('test'));
    const skip = Buffer.alloc(8 + 5);
    skip.writeUInt32LE(0x184D2A5F);
    skip.writeUInt32LE(5, 4);
    Buffer.from('skip!').copy(skip, 8);
    const frames = Buffer.concat([skip, small, skip, small]);
    assert.equal(Buffer.concat(await collect(decompressZstd(chunks(frames, 1)))).toString(), 'testtest');
    for(let length = 1; length < small.length; length++) {
        await assert.rejects(collect(decompressZstd(chunks(small.subarray(0, length), 3))), /Truncated|Zstandard/);
    }
    const corrupt = zstdCompressSync(data, { params: { [constants.ZSTD_c_checksumFlag]: 1 } });
    corrupt[corrupt.length - 1] ^= 0xFF;
    await assert.rejects(collect(decompressZstd(chunks(corrupt, 65536))));
});

test('oracle analysis scores all fields, missed plies and invalid inputs without counting partial games', async () => {
    const games = await collect(parsePgn([Buffer.from(pgn)]));
    const stats = analyzeGames(games);
    assert.equal(stats.games, 3);
    assert.equal(stats.plies, 10);
    assert.equal(stats.single.exact, stats.single.total);
    assert.equal(stats.single.falseRecovery, 0);
    assert.equal(stats.matches.singleExact, 3);
    assert.equal(stats.matches.withMoves, 3);
    assert.equal(stats.matches.withGaps, 3);
    assert.equal(stats.gaps.illegal, 0);
    assert.equal(stats.events.enPassant, 1);
    assert.equal(stats.events.promotions, 1);
    const invalid = analyzeGames([
        { headers: {}, moves: ['e4', 'illegal'], record: 1 },
        { headers: { FEN: 'invalid' }, moves: [], record: 2 },
        { headers: { Variant: 'Atomic' }, moves: ['e4'], record: 3 }
    ]);
    assert.equal(invalid.invalidGames, 2);
    assert.equal(invalid.skippedVariants, 1);
    assert.equal(invalid.plies, 0);
    assert.equal(invalid.single.total, 0);
    assert.equal(invalid.records, 3);
    assert.equal(metrics(invalid).gapRmse, null);
});

test('full-history metadata and optional oracle highlights are reported distinctly', async () => {
    const games = await collect(parsePgn([Buffer.from(
        '[FEN "7k/8/1p6/p1p5/1B6/8/8/7K w - - 0 1"]\n1.Bxc5 bxc5 *\n')]));
    const baseline = analyzeGames(games);
    const hinted = analyzeGames(games, { hints: true });
    assert.equal(baseline.gaps.alternative, 1);
    assert.equal(baseline.matches.gapsExact, 0);
    assert.equal(hinted.gaps.exact, 1);
    assert.equal(hinted.matches.gapsExact, 1);
    assert.equal(metrics(hinted).gapRmse, 0);
    assert.equal(metrics(baseline).gapRmse, 1);
});

test('stress scoring covers every overlapping 3-5 ply window without calling shorter aliases exact', () => {
    const game = { headers: {}, moves: ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'] };
    const stats = analyzeGames([game], { stress: true });
    assert.equal(stats.games, 1);
    assert.equal(stats.single.exact, 8);
    assert.equal(stats.stress.duplicates.total, 8);
    assert.equal(stats.stress.duplicates.errors, 0);
    assert.equal(stats.stress.staleHints.total, 7);
    for(const missed of [2, 3, 4]) {
        const group = stats.stress[`missed${missed}`];
        assert.equal(group.total, 8 - missed);
        assert.equal(group.noRecovery + group.legalShorterHistory + group.illegalRecovery, group.total);
        assert.equal(group.illegalRecovery, 0);
    }
    assert.equal(stats.stress.missed3.unchanged, 5);
    assert.ok(stats.stress.missed4.apparentSingleMove > 0);
    assert.equal(stats.stressCalls, 8 + 7 + 6 + 5 + 4);
    assert.equal(analyzeGames([game]).stressCalls, 0);
});

test('stress patterns include both colors, hidden special moves and captures across burst boundaries', () => {
    const games = [
        { headers: {}, moves: ['e4', 'a6', 'e5', 'd5', 'exd6', 'cxd6', 'Nf3', 'Nf6'] },
        { headers: {}, moves: ['a3', 'e5', 'a4', 'e4', 'd4', 'exd3', 'cxd3', 'Nf6'] },
        { headers: { FEN: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1' },
            moves: ['O-O', 'O-O-O', 'Rfc1', 'Kb8', 'Rc7', 'Rc8'] },
        { headers: { FEN: 'r1b1k3/1P6/8/8/8/8/8/4K3 w - - 0 1' },
            moves: ['b8=Q', 'Rxb8', 'Kd2', 'Kd7', 'Ke3', 'Ke6'] }
    ];
    const stats = analyzeGames(games, { stress: true });
    assert.equal(stats.invalidGames, 0);
    assert.equal(stats.games, games.length);
    assert.equal(stats.single.exact, stats.single.total);
    assert.equal(stats.stress.duplicates.errors, 0);
    assert.equal(stats.stress.staleHints.illegal, 0);
    assert.equal(stats.events.enPassant, 2);
    assert.equal(stats.events.promotions, 1);
    assert.equal(stats.events.castling, 2);
    for(const missed of [2, 3, 4]) {
        assert.equal(stats.stress[`missed${missed}`].total,
            games.reduce((sum, game) => sum + game.moves.length - missed, 0));
    }
});

test('a real three-ply burst that aliases a legal two-ply history remains an explicit stress failure', () => {
    const game = {
        headers: { FEN: '6r1/p3b2p/1p1p4/5k2/PP6/2PP4/5KPP/4R3 b - - 1 24' },
        moves: ['Bh4+', 'g3', 'Bg5']
    };
    const stats = analyzeGames([game], { stress: true });
    assert.equal(stats.invalidGames, 0);
    assert.equal(stats.single.exact, 3);
    assert.equal(stats.stress.missed2.total, 1);
    assert.equal(stats.stress.missed2.legalShorterHistory, 1);
    assert.equal(stats.stress.missed2.illegalRecovery, 0);
    assert.equal(stats.examples.filter(example => example.kind === 'missed2-legalShorterHistory').length, 1);
    const conservative = analyzeGames([game], { stress: true, conservative: true });
    assert.equal(conservative.single.exact, 3);
    assert.equal(conservative.stress.missed2.legalShorterHistory, 0);
    assert.equal(conservative.stress.missed2.noRecovery, 1);
});

test('corpus takeback scoring checks forward repetitions, all undo depths and resumed legal moves', () => {
    const games = [
        { headers: {}, moves: ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'] },
        { headers: {}, moves: ['e4', 'a6', 'e5', 'd5', 'exd6', 'cxd6'] },
        { headers: { FEN: '7k/P7/8/8/8/8/8/7K w - - 0 20' }, moves: ['a8=N', 'Kg7'] }
    ];
    const stats = analyzeGames(games, { takebacks: true });
    assert.equal(stats.takebacks.games, 3);
    assert.equal(stats.takebacks.forwardChecks, 32);
    assert.equal(stats.takebacks.repetitionChecks, 10);
    assert.equal(stats.takebacks.confirmed, 10);
    assert.equal(stats.takebacks.resumeChecks, 10);
    assert.equal(stats.takebacks.unverifiedChecks, 10);
    for(const key of ['falseTakebacks', 'restorationErrors', 'resumeErrors']) assert.equal(stats.takebacks[key], 0);
});

test('parallel runner matches serial oracle, limits input safely and samples records deterministically', async t => {
    const directory = await fixture(t);
    await writeFile(join(directory, 'a.pgn.zst'), zstdCompressSync(Buffer.from(pgn.repeat(10))));
    const options = argsFor(directory), report = await runCorpus(options);
    assert.equal(report.status, 'complete');
    assert.equal(report.stats.games, 30);
    assert.equal(report.stats.plies, 100);
    assert.equal(report.inputs[0].complete, true);
    assert.equal(report.parserHash.length, 64);
    assert.deepEqual(JSON.parse(await readFile(options.output, 'utf8')).stats, report.stats);
    const serial = analyzeGames(await collect(readPgn(join(directory, 'a.pgn.zst'))));
    assert.deepEqual(report.stats.single, serial.single);
    assert.deepEqual(report.stats.gaps, serial.gaps);
    assert.deepEqual(report.stats.events, serial.events);
    const limited = await runCorpus({ ...options, 'max-games': 1 });
    assert.equal(limited.stats.records, 1);
    assert.equal(limited.inputs[0].complete, false);
    const sampled = await runCorpus({ ...options, 'sample-every': 3 });
    assert.equal(sampled.stats.records, 10);
    assert.equal(sampled.stats.plies, 60);
    assert.equal(sampled.seen, 30);
    assert.ok(sampled.stats.examples.length <= options.examples);
    const heldOut = await runCorpus({ ...options, 'skip-games': 1, 'max-games': 1 });
    assert.equal(heldOut.seen, 2);
    assert.equal(heldOut.stats.records, 1);
    assert.equal(heldOut.stats.events.enPassant, 1);
    const skippedSample = await runCorpus({ ...options, 'skip-games': 3, 'sample-every': 3 });
    assert.equal(skippedSample.stats.records, 9);
    assert.equal(skippedSample.stats.plies, 54);
    assert.equal(skippedSample.seen, 30);
    const stressed = await runCorpus({ ...options, stress: true });
    const serialStress = analyzeGames(await collect(readPgn(join(directory, 'a.pgn.zst'))), { stress: true });
    assert.deepEqual(stressed.stats.stress, serialStress.stress);
    assert.equal(stressed.stressValidation.enabled, true);
    assert.equal(stressed.stressValidation.fullMultiGapRecoverySupported, false);
    const undoReport = await runCorpus({ ...options, takebacks: true });
    const serialUndo = analyzeGames(await collect(readPgn(join(directory, 'a.pgn.zst'))), { takebacks: true });
    assert.deepEqual(undoReport.stats.takebacks, serialUndo.takebacks);
    assert.equal(undoReport.takebackValidation.passed, true);
});

test('runner refuses absent/empty input, changed formats, duplicate inputs and overwriting a database', async t => {
    const directory = await fixture(t);
    await assert.rejects(runCorpus(argsFor(directory)), /No .pgn/);
    await writeFile(join(directory, 'a.pgn'), pgn);
    await assert.rejects(runCorpus({ ...argsFor(directory), files: [join(directory, 'a.pgn'), join(directory, 'a.pgn')] }), /Duplicate/);
    await assert.rejects(runCorpus({ ...argsFor(directory), output: join(directory, 'a.pgn') }), /overwrite/);
    await writeFile(join(directory, 'empty.pgn'), '');
    await assert.rejects(runCorpus(argsFor(directory)), /nonempty/);
});

test('limiting a large compressed frame cancels decoding without losing selected games', async t => {
    const directory = await fixture(t);
    await writeFile(join(directory, 'large.pgn.zst'), zstdCompressSync(Buffer.from(pgn.repeat(10000))));
    const report = await runCorpus({ ...argsFor(directory), 'max-games': 17, 'batch-games': 4 });
    assert.equal(report.status, 'complete');
    assert.equal(report.selected, 17);
    assert.equal(report.stats.records, 17);
    assert.equal(report.stats.games, 17);
    assert.equal(report.inputs[0].complete, false);
    assert.equal(report.error, null);
});

test('stream corruption writes a failed partial report, never a success-shaped result', async t => {
    const directory = await fixture(t);
    await writeFile(join(directory, 'bad.pgn.zst'), Buffer.from('bad compressed file'));
    const options = argsFor(directory);
    await assert.rejects(runCorpus(options), /Partial failure report/);
    const report = JSON.parse(await readFile(options.output, 'utf8'));
    assert.equal(report.status, 'failed');
    assert.ok(report.error);
});

test('a failed result consumer aborts all workers and produces a failure report', async t => {
    const directory = await fixture(t);
    await writeFile(join(directory, 'a.pgn'), pgn.repeat(10));
    const options = argsFor(directory);
    await assert.rejects(runCorpus(options, () => { throw new Error('test consumer failed'); }), /test consumer failed/);
    const report = JSON.parse(await readFile(options.output, 'utf8'));
    assert.equal(report.status, 'failed');
    assert.equal(report.validation.passed, false);
});

test('CLI validates arguments and strict mode exposes irreducible snapshot ambiguity', async t => {
    const directory = await fixture(t);
    for(const args of [['--workers', '0'], ['--max-games', '-1'], ['--skip-games', '-1'],
        ['--skip-games', '1.5'], ['--examples', 'NaN'], ['--typo']])
        assert.throws(() => optionsFromArgs(args));
    const file = join(directory, 'ambiguous.pgn');
    await writeFile(file, `[FEN "4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1"]\n1.e3 dxe3 *\n`);
    const runner = new URL('./lichess-database/run.mjs', import.meta.url);
    const args = [fileURLToPath(runner), file,
        '--workers', '1', '--output', join(directory, 'out.json')];
    const normal = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(normal.status, 0, normal.stderr);
    const strict = spawnSync(process.execPath, [...args, '--strict'], { encoding: 'utf8' });
    assert.equal(strict.status, 1, strict.stderr);
    const report = JSON.parse(await readFile(join(directory, 'out.json'), 'utf8'));
    assert.equal(report.stats.gaps.alternative, 1);
    assert.equal(report.metrics.gapRmse, 1);
    assert.ok(report.metrics.gapBoardRmse > 0);
    assert.equal(report.stats.gaps.illegal, 0);
    const help = execFileSync(process.execPath, [args[0], '--help'], { encoding: 'utf8' });
    assert.match(help, /last-move-hints/);
});

test('a large legal fixture reports throughput without needing external downloads', async t => {
    const directory = await fixture(t);
    const chess = new Chess(), moves = [];
    for(let i = 0; i < 10; i++) moves.push('Nf3', 'Nf6', 'Ng1', 'Ng8');
    for(const move of moves) assert.ok(chess.move(move));
    const text = `[Event "Throughput fixture"]\n\n${moves.map((move, i) => i % 2 ? move : `${i / 2 + 1}.${move}`).join(' ')} *\n`;
    await writeFile(join(directory, 'speed.pgn.zst'), zstdCompressSync(Buffer.from(text.repeat(100))));
    const report = await runCorpus({ ...argsFor(directory), 'batch-games': 16 });
    assert.equal(report.stats.plies, 4000);
    assert.equal(report.stats.single.exact, 4000);
    assert.equal(report.stats.gaps.exact, 3900);
    t.diagnostic(JSON.stringify({ pliesPerSecond: report.pliesPerSecond, ...report.metrics }));
});

test('varied legal matches survive the complete compressed worker pipeline', async t => {
    const directory = await fixture(t);
    let text = '', plies = 0;
    for(let seed = 1; seed <= 30; seed++) {
        const chess = new Chess(), moves = [];
        let state = seed;
        for(let ply = 0; ply < 80; ply++) {
            const legal = chess.moves();
            if(!legal.length) break;
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            const san = legal[Math.floor(state / 0x100000000 * legal.length)];
            assert.ok(chess.move(san));
            moves.push(ply % 2 ? san : `${Math.floor(ply / 2) + 1}.${san}`);
            plies++;
        }
        text += `[Event "Varied ${seed}"]\n\n${moves.join(' ')} *\n`;
    }
    await writeFile(join(directory, 'varied.pgn.zst'), zstdCompressSync(Buffer.from(text)));
    const report = await runCorpus({ ...argsFor(directory), 'batch-games': 8 });
    assert.equal(report.stats.games, 30);
    assert.equal(report.stats.plies, plies);
    assert.equal(report.stats.single.exact, plies);
    assert.equal(report.stats.gaps.illegal, 0);
    assert.equal(report.validation.passed, true);
    t.diagnostic(JSON.stringify({ pliesPerSecond: report.pliesPerSecond, ...report.metrics,
        gaps: report.stats.gaps }));
});
