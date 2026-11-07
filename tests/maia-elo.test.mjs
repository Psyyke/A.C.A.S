// Unit tests (pure Node) plus an end-to-end browser test for the Maia Elo estimator.
// Browser test needs: npm install --no-save --package-lock=false playwright
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findMove, posteriorElo, peakElo, maiaEloGrid } from '../app/assets/js/misc/maiaElo.js';
import { analyze, makeAnalyzers, sumLogProbs } from './maia-elo/analyze.mjs';

const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Log-likelihood totals that peak at the given grid index and fall off quadratically.
const totalsPeakingAt = (index, curvature = 0.5) => maiaEloGrid.map((_, i) => -curvature * (i - index) ** 2);

test('findMove resolves normal, castling and promotion moves', () => {
    assert.equal(findMove(startFen, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'), 'e2e4');
    assert.equal(findMove('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1'), 'e1g1');
    assert.equal(findMove('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'Q7/7k/8/8/8/8/8/K7 b - - 0 1'), 'a7a8q');
});

test('findMove returns null when positions are not one move apart', () => {
    assert.equal(findMove(startFen, startFen), null);
    assert.equal(findMove(startFen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1'), null);
});

test('posteriorElo recovers the likelihood peak when the data is informative', () => {
    const strong = totalsPeakingAt(8).map(value => value * 50);
    assert.ok(Math.abs(peakElo(strong) - maiaEloGrid[8]) < 1);
    const { elo, sd } = posteriorElo(strong);
    assert.ok(Math.abs(elo - maiaEloGrid[8]) < 30, `elo ${elo}`);
    assert.ok(sd < 60, `sd ${sd}`);
});

test('prior pulls weak evidence toward 1500 and uncertainty shrinks with data', () => {
    const weak = posteriorElo(totalsPeakingAt(10, 0.002));
    assert.ok(weak.elo < maiaEloGrid[10] - 300, `weak ${weak.elo}`);
    const little = posteriorElo(totalsPeakingAt(8, 0.05));
    const lots = posteriorElo(totalsPeakingAt(8, 5));
    assert.ok(lots.sd < little.sd);
});

test('analyze scores a synthetic game set with sane error and sums log-probs', () => {
    const games = [];
    for(const trueElo of [1000, 1600, 2200]) {
        const index = (trueElo - 600) / 200;
        const moves = Array.from({ length: 40 }, (_, ply) => ({
            ply, fullmove: Math.floor(ply / 2) + 1, fen: 'x', move: 'e2e4',
            logProbs: maiaEloGrid.map((_, i) => -0.3 * (i - index) ** 2 - 1)
        }));
        games.push({ elo: trueElo, moves });
    }
    const report = analyze(games, { lengths: [10] });
    for(const name of Object.keys(makeAnalyzers())) {
        assert.ok(report[10].overall[name] < 300, `${name} rmse ${report[10].overall[name]}`);
    }
    assert.ok(Object.keys(report[10].perElo).length === 3);
    const pair = [{ logProbs: [1, 2] }, { logProbs: [3, 4] }];
    assert.deepEqual([...sumLogProbs(pair).slice(0, 2)], [4, 6]);
});

let playwrightAvailable = true;
try { await import('playwright'); } catch { playwrightAvailable = false; }

test('browser simulation runs end to end, tolerates failures and ranks Elo correctly', {
    skip: playwrightAvailable ? false : 'playwright not installed: npm install --no-save --package-lock=false playwright',
    timeout: 600000
}, async () => {
    const { runSimulation } = await import('./maia-elo/run.mjs');
    const out = join(tmpdir(), `maia-elo-test-${process.pid}.jsonl`);
    const stats = await runSimulation({ elos: '800,2200', games: 2, plies: 40, engines: 4, out, timeoutSeconds: 500 });
    assert.ok(stats.saved >= 3, `saved ${stats.saved}`);
    const games = readFileSync(out, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    for(const game of games) {
        const scored = game.moves.filter(move => move.logProbs);
        assert.ok(scored.length > 20, 'scored plies present');
        assert.equal(scored[0].logProbs.length, maiaEloGrid.length);
    }
    const estimate = game => {
        const totals = sumLogProbs(game.moves.filter(move => move.logProbs && move.fullmove > 4));
        return posteriorElo(totals).elo;
    };
    const mean = elo => {
        const list = games.filter(game => game.elo === elo).map(estimate);
        return list.reduce((a, b) => a + b, 0) / list.length;
    };
    assert.ok(mean(2200) > mean(800), 'strong players rate above weak players');
});
