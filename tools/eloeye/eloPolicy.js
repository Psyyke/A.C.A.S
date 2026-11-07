import { estimateRating, expectedScore, nextOpponent } from './eloMatch.js';
import { estimateMoveEvidence } from './moveEvidence.js';

export const automaticRun = Object.freeze({
    batchSize: 4,
    minGames: 16,
    maxGames: 1000,
    halfWidth: 25,
    alpha: 0.05
});

export const maxBoards = 10;

export function batchSizeForBoards(boards) {
    if(!Number.isInteger(boards) || boards < 1 || boards > maxBoards) throw new Error('EloEye supports 1-10 boards');
    return Math.max(2, Math.ceil(boards / 2) * 2);
}

export function planBatch(games, count = automaticRun.batchSize) {
    const batch = [];
    const pairs = Math.ceil(count / 2);
    const resemblance = games.length < automaticRun.minGames ? estimateMoveEvidence(games) : null;
    const moveHint = resemblance ? { ...resemblance, weight: 1 - games.length / automaticRun.minGames } : null;

    for(let index = 0; index < count; index++) {
        const opponent = index % 2 ? batch[index - 1].opponent
            : games.length === 0
                ? pairs === 1 ? 1500 : 1000 + Math.round(12 * (index / 2) / (pairs - 1)) * 100
                : nextOpponent(games, batch, 1, moveHint);
        batch.push({ opponent, acasIsWhite: index % 2 === 0, opening: Math.floor((games.length + index) / 2) });
    }
    return batch;
}

const alternatives = Array.from({ length: 81 }, (_, index) => ({
    rating: index * 50,
    logWeight: -0.5 * ((index * 50 - 1600) / 700) ** 2
}));
const logSumExp = values => {
    const max = Math.max(...values);
    return max + Math.log(values.reduce((sum, value) => sum + Math.exp(value - max), 0));
};
const priorNormalizer = logSumExp(alternatives.map(point => point.logWeight));

function logLikelihood(rating, games) {
    return games.reduce((sum, game) => {
        const p = expectedScore(rating, game.opponent);
        return sum + game.score * Math.log(p) + (1 - game.score) * Math.log1p(-p);
    }, 0);
}

// A fixed mixture of likelihood ratios is a test supermartingale for bounded
// scores with the Elo conditional mean (draws included). Evaluate only complete,
// preplanned batches: outcome-dependent completion order must not select evidence.
export function ratingConfidence(games) {
    if(!games.length) return { low: 0, high: 4000 };
    const mixture = logSumExp(alternatives.map(point => point.logWeight + logLikelihood(point.rating, games))) - priorNormalizer;
    const cutoff = mixture - Math.log(1 / automaticRun.alpha);
    let left = 0, right = 4000;
    for(let iteration = 0; iteration < 45; iteration++) {
        const middle = (left + right) / 2;
        const residual = games.reduce((sum, game) => sum + game.score - expectedScore(middle, game.opponent), 0);
        if(residual > 0) left = middle; else right = middle;
    }
    const peak = (left + right) / 2;
    function boundary(a, b, lower) {
        for(let iteration = 0; iteration < 45; iteration++) {
            const middle = (a + b) / 2;
            const inside = logLikelihood(middle, games) >= cutoff;
            if(inside === lower) b = middle; else a = middle;
        }
        return (a + b) / 2;
    }
    return {
        low: logLikelihood(0, games) >= cutoff ? 0 : boundary(0, peak, true),
        high: logLikelihood(4000, games) >= cutoff ? 4000 : boundary(peak, 4000, false)
    };
}

export function automaticStatus(games) {
    const interval = ratingConfidence(games);
    let reason = null;
    if(games.length >= automaticRun.minGames) {
        if(interval.low > 2600) reason = 'above';
        else if(interval.high < 600) reason = 'below';
        else if(interval.high - interval.low <= 2 * automaticRun.halfWidth) reason = 'precision';
    }
    if(!reason && games.length >= automaticRun.maxGames) reason = 'budget';
    return { ...interval, reason, done: reason !== null };
}

export function automaticEstimate(games) {
    const estimate = estimateRating(games);
    if(!estimate) return null;
    const status = automaticStatus(games);
    return {
        ...estimate, low: status.low, high: status.high, reason: status.reason,
        intervalMethod: 'confidence-sequence',
        status: status.reason === 'above' || status.reason === 'below' ? status.reason
            : estimate.status === 'above' ? 'upper-edge' : estimate.status === 'below' ? 'lower-edge' : 'ok'
    };
}
