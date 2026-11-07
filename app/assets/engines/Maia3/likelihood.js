export const maiaEloGrid = Object.freeze(Array.from({ length: 11 }, (_, index) => 600 + index * 200));
export const maiaTemperatures = Object.freeze([0.25, 0.5, 0.75, 1, 1.5, 2]);
export const minMaiaMoves = 6;
export const eloPrior = Object.freeze({ center: 1500, sd: 700 });
export const minimumPolicyProbability = 1e-12;

export const isRatingPosition = fen => Number(fen.split(' ')[5]) > 4;
export const ratingPositionKey = fen => fen.split(' ').slice(0, 4).join(' ');

function logSumExp(values) {
    const peak = Math.max(...values);
    return peak + Math.log(values.reduce((sum, value) => sum + Math.exp(value - peak), 0));
}

// Elo-major, temperature-minor order. Temperature changes sampling probabilities,
// not the ordering of Maia's deterministic top-policy moves.
export function moveLogLikelihoods(results, move, temperatures = [1]) {
    if(!results.length || temperatures.some(value => !Number.isFinite(value) || value <= 0) || !temperatures.length) {
        throw new Error('Invalid Maia likelihood grid');
    }

    return results.flatMap(({ policy }) => {
        const entries = Object.entries(policy ?? {});
        const probabilities = entries.map(([, probability]) => probability);
        const index = entries.findIndex(([candidate]) => candidate === move);
        const total = probabilities.reduce((sum, value) => sum + value, 0);

        if(index < 0 || probabilities.some(value => !Number.isFinite(value) || value < 0)
            || !Number.isFinite(total) || total <= 0) {
            throw new Error(`Invalid Maia policy for played move ${move}`);
        }

        const logs = probabilities.map(value => Math.log(Math.max(minimumPolicyProbability, value / total)));

        return temperatures.map(temperature => {
            const scaled = logs.map(value => value / temperature);
            return Math.min(0, scaled[index] - logSumExp(scaled));
        });
    });
}

export function posteriorWeights(totals, prior = eloPrior, grid = maiaEloGrid) {
    const logs = Array.from(totals, (value, index) =>
        value - 0.5 * ((grid[index] - prior.center) / prior.sd) ** 2);
    const normalizer = logSumExp(logs);

    return logs.map(value => Math.exp(value - normalizer));
}

export function posteriorElo(totals, prior = eloPrior, grid = maiaEloGrid) {
    const weights = posteriorWeights(totals, prior, grid);
    const mean = weights.reduce((sum, weight, index) => sum + weight * grid[index], 0);
    const variance = weights.reduce((sum, weight, index) => sum + weight * (grid[index] - mean) ** 2, 0);

    return { elo: Math.round(mean / 10) * 10, sd: Math.round(Math.sqrt(variance) / 10) * 10 };
}
