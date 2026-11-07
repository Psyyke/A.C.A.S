// Compares Maia-likelihood, engine-loss and combined Elo estimators on games recorded with --sf.
// Usage: node tests/maia-elo/combine.mjs [file]   (LENGTHS=10,20,30)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { posteriorElo, maiaEloGrid } from '../../app/assets/js/misc/maiaElo.js';
import { dataDir } from './serve.mjs';

const file = process.argv[2] || join(dataDir, 'combined.jsonl');
const games = readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line));
const lengths = (process.env.LENGTHS || '10,20,30').split(',').map(Number);

const solve = (rows, targets) => {
    // Ordinary least squares with an intercept via normal equations.
    const k = rows[0].length + 1;
    const a = Array.from({ length: k }, () => new Array(k + 1).fill(0));
    rows.forEach((row, index) => {
        const x = [1, ...row];
        for(let i = 0; i < k; i++) { for(let j = 0; j < k; j++) a[i][j] += x[i] * x[j]; a[i][k] += x[i] * targets[index]; }
    });
    for(let i = 0; i < k; i++) {
        let pivot = i;
        for(let r = i + 1; r < k; r++) if(Math.abs(a[r][i]) > Math.abs(a[pivot][i])) pivot = r;
        [a[i], a[pivot]] = [a[pivot], a[i]];
        for(let r = 0; r < k; r++) if(r !== i) {
            const factor = a[r][i] / a[i][i];
            for(let c = i; c <= k; c++) a[r][c] -= factor * a[i][c];
        }
    }
    return a.map((row, i) => row[k] / row[i]);
};
const predict = (beta, row) => beta[0] + row.reduce((sum, value, index) => sum + value * beta[index + 1], 0);

function features(game, length) {
    const out = [];
    for(const side of [0, 1]) {
        const moves = game.moves.filter(move => move.fullmove > 4 && move.logProbs && move.loss != null && move.ply % 2 === side);
        for(let start = 0; start + length <= moves.length; start += length) {
            const chunk = moves.slice(start, start + length);
            const totals = new Float64Array(maiaEloGrid.length);
            for(const move of chunk) move.logProbs.forEach((value, index) => { totals[index] += value; });
            const loss = chunk.reduce((sum, move) => sum + move.loss, 0) / length;
            out.push({ elo: game.elo, game, maia: posteriorElo(totals).elo, lnLoss: Math.log(Math.max(0.5, loss)) });
        }
    }
    return out;
}

const rmse = (rows, fn) => Math.sqrt(rows.reduce((sum, row) => sum + (fn(row) - row.elo) ** 2, 0) / rows.length);

for(const length of lengths) {
    const rows = games.flatMap(game => features(game, length));
    // Alternate games between train and test so a game never appears in both.
    const index = new Map(games.map((game, i) => [game, i]));
    const train = rows.filter(row => index.get(row.game) % 2 === 0), test = rows.filter(row => index.get(row.game) % 2 === 1);
    const models = {
        'maia prior': [row => [row.maia]],
        'loss only': [row => [row.lnLoss]],
        'combined': [row => [row.maia, row.lnLoss]]
    };
    const parts = [`${length} moves/side (n=${test.length}):`];
    for(const [name, [make]] of Object.entries(models)) {
        const beta = solve(train.map(make), train.map(row => row.elo));
        const beta2 = solve(test.map(make), test.map(row => row.elo));
        parts.push(`${name} ${rmse(test, row => predict(beta, make(row))).toFixed(0)} (swap ${rmse(train, row => predict(beta2, make(row))).toFixed(0)})`);
    }
    console.log(parts.join('  |  '));
}
