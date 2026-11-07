// Measures how well the Maia Elo estimators recover the known Elo of simulated games.
// CLI: node tests/maia-elo/analyze.mjs [games.jsonl]
//   env: LENGTHS=10,20,30 PRIORS=450,700 SKIP=4 STEP=1 (STEP=2 scores only every 2nd grid Elo)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { maiaEloGrid, peakElo, posteriorElo } from '../../app/assets/js/misc/maiaElo.js';
import { dataDir } from './serve.mjs';

export function loadGames(file) {
    // Older captures used a 100-Elo grid (21 values); every second value is the current grid.
    const convert = logProbs => logProbs?.length === 21 ? logProbs.filter((_, index) => index % 2 === 0) : logProbs;
    return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => {
        try {
            const game = JSON.parse(line);
            game.moves.forEach(move => { move.logProbs = convert(move.logProbs); });
            return [game];
        } catch(error) { return []; }
    });
}

// Builds estimators over a (possibly coarser) grid: step 2 uses every second grid Elo.
export function makeAnalyzers({ priors = [450, 700], center = 1500, step = 1 } = {}) {
    const indices = maiaEloGrid.map((_, index) => index).filter(index => index % step === 0);
    const grid = indices.map(index => maiaEloGrid[index]);
    const pick = totals => Float64Array.from(indices, index => totals[index]);
    return {
        mle: totals => ({ elo: peakElo(pick(totals), grid) }),
        ...Object.fromEntries(priors.map(sd =>
            [`prior${sd}`, totals => posteriorElo(pick(totals), { center, sd }, grid)]))
    };
}

// Summed log-likelihood per grid Elo over a list of moves.
export function sumLogProbs(moves) {
    const totals = new Float64Array(maiaEloGrid.length);
    for(const move of moves) move.logProbs.forEach((value, index) => { totals[index] += value; });
    return totals;
}

// One game holds both sides at the same Elo; each side is an independent sample.
const sideMoves = (game, side, skip) => game.moves.filter(move =>
    move.ply % 2 === side && move.fullmove > skip && move.logProbs?.length === maiaEloGrid.length);

// Returns { [length]: { perElo: { [elo]: { [method]: { n, bias, rmse } } }, overall: { [method]: rmse } } }
export function analyze(games, { lengths = [10, 20, 30], skip = 4, ...analyzerOptions } = {}) {
    const analyzers = makeAnalyzers(analyzerOptions);
    const names = Object.keys(analyzers);
    const byElo = new Map();
    for(const game of games) byElo.set(game.elo, [...(byElo.get(game.elo) || []), game]);

    const report = {};
    for(const length of lengths) {
        const perElo = {};
        const squared = Object.fromEntries(names.map(name => [name, 0]));
        let count = 0;
        for(const [elo, group] of [...byElo].sort((a, b) => a[0] - b[0])) {
            const errors = Object.fromEntries(names.map(name => [name, []]));
            for(const game of group) for(const side of [0, 1]) {
                const moves = sideMoves(game, side, skip);
                for(let start = 0; start + length <= moves.length; start += length) {
                    const totals = sumLogProbs(moves.slice(start, start + length));
                    for(const name of names) errors[name].push(analyzers[name](totals).elo - elo);
                }
            }
            const n = errors[names[0]].length;
            if(!n) continue;
            count += n;
            perElo[elo] = Object.fromEntries(names.map(name => {
                const list = errors[name];
                squared[name] += list.reduce((sum, value) => sum + value * value, 0);
                return [name, {
                    n,
                    bias: list.reduce((sum, value) => sum + value, 0) / n,
                    rmse: Math.sqrt(list.reduce((sum, value) => sum + value * value, 0) / n)
                }];
            }));
        }
        report[length] = {
            perElo,
            overall: Object.fromEntries(names.map(name => [name, count ? Math.sqrt(squared[name] / count) : NaN]))
        };
    }
    return report;
}

export function printReport(report, skip) {
    for(const [length, { perElo, overall }] of Object.entries(report)) {
        const names = Object.keys(overall);
        console.log(`\n== ${length} moves per side (first ${skip} skipped): rmse / bias ==`);
        console.log('true   n  ' + names.map(name => name.padStart(16)).join(''));
        for(const [elo, methods] of Object.entries(perElo)) {
            const cells = names.map(name => `${Math.round(methods[name].rmse)} / ${Math.round(methods[name].bias)}`.padStart(16));
            console.log(`${elo.padEnd(6)} ${String(methods[names[0]].n).padStart(3)}  ${cells.join('')}`);
        }
        console.log('overall rmse: ' + names.map(name => `${name}=${Math.round(overall[name])}`).join('  '));
    }
}

if(process.argv[1]?.endsWith('analyze.mjs')) {
    const file = process.argv[2] || join(dataDir, 'games.jsonl');
    if(!existsSync(file)) throw new Error(`No games at ${file}; run tests/maia-elo/run.mjs first`);
    const games = loadGames(file);
    const skip = Number(process.env.SKIP ?? 4);
    console.log(`${games.length} games from ${file}`);
    printReport(analyze(games, {
        skip, step: Number(process.env.STEP ?? 1),
        lengths: (process.env.LENGTHS || '10,20,30').split(',').map(Number),
        priors: (process.env.PRIORS || '450,700').split(',').map(Number)
    }), skip);
}
