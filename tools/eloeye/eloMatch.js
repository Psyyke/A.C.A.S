// Rating maths for the Elo estimator: pure functions, no DOM or engines.
// A game is { opponent, score } where opponent is the Maia 3 rating played against
// and score is 1 (win), 0.5 (draw) or 0 (loss) from the rated engine's point of view.

export const ratingRange = { min: 600, max: 2600 };
export const opponentStep = 10;

const scale = Math.LN10 / 400;

export const expectedScore = (rating, opponent) => 1 / (1 + 10 ** ((opponent - rating) / 400));

// Score residual of the logistic Elo model, with an optional Gaussian prior.
// The residual is strictly decreasing in `rating`, so the root is found by bisection.
function solve(games, prior) {
    const residual = rating => {
        let total = 0;
        for(const game of games) total += game.score - expectedScore(rating, game.opponent);
        if(prior) total -= (rating - prior.center) / (prior.sd ** 2 * scale);
        return total;
    };

    let low = 0;
    let high = 4000;
    for(let step = 0; step < 60; step++) {
        const middle = (low + high) / 2;
        if(residual(middle) > 0) low = middle;
        else high = middle;
    }
    return (low + high) / 2;
}

export function fisherInformation(rating, games) {
    let total = 0;
    for(const game of games) {
        const expected = expectedScore(rating, game.opponent);
        total += expected * (1 - expected);
    }
    return total * scale ** 2;
}

// Maximum-likelihood rating, clamped to the range Maia 3 can anchor. The status says
// when the engine sits beyond that range, where only a bound can be reported.
export function estimateRating(games) {
    if(!games.length) return null;

    const raw = solve(games);
    const rating = Math.min(ratingRange.max, Math.max(ratingRange.min, raw));
    const standardError = 1 / Math.sqrt(fisherInformation(rating, games));
    const status = raw >= ratingRange.max ? 'above' : raw <= ratingRange.min ? 'below' : 'ok';

    return {
        rating,
        standardError,
        low: Math.max(ratingRange.min, rating - 1.96 * standardError),
        high: Math.min(ratingRange.max, rating + 1.96 * standardError),
        status,
        games: games.length
    };
}

// A weak prior keeps early estimates finite (a perfect score would otherwise run off to
// infinity) while still moving a full step per result. Only used to pick opponents.
const searchPrior = { center: 1500, sd: 600 };

export function nextOpponent(games, pending = [], openingCount = 1, moveHint = null) {
    const count = Math.max(1, Math.min(21, openingCount));
    if(games.length + pending.length < count) {
        const opening = Array.from({ length: count }, (_, index) => count === 1 ? 1500
            : Math.round((ratingRange.min + index * (ratingRange.max - ratingRange.min) / (count - 1)) / opponentStep) * opponentStep);
        const used = new Set([...games, ...pending].map(game => game.opponent));
        return opening.find(rating => !used.has(rating)) ?? 1500;
    }

    // Integrate over plausible strengths, including outside Maia's range. Pending games
    // contribute expected information, never invented wins/draws/losses.
    const posterior = [];
    for(let rating = 0; rating <= 4000; rating += 50) {
        let logWeight = -0.5 * ((rating - searchPrior.center) / searchPrior.sd) ** 2;
        // Move resemblance is not strength. Limit its search-only influence and
        // keep it broad even when the policy model claims a very precise fit.
        if(moveHint) {
            const distance = (rating - moveHint.elo) / Math.max(400, moveHint.sd);
            logWeight += moveHint.weight * Math.max(-2, -0.5 * distance ** 2);
        }
        let information = 1 / searchPrior.sd ** 2;
        for(const game of games) {
            const p = expectedScore(rating, game.opponent);
            logWeight += game.score * Math.log(p) + (1 - game.score) * Math.log1p(-p);
            information += scale ** 2 * p * (1 - p);
        }
        for(const game of pending) {
            const p = expectedScore(rating, game.opponent);
            information += scale ** 2 * p * (1 - p);
        }
        posterior.push({ rating, logWeight, information });
    }
    const maxWeight = Math.max(...posterior.map(point => point.logWeight));
    let bestRating = 1500;
    let bestUtility = -Infinity;
    for(let opponent = ratingRange.min; opponent <= ratingRange.max; opponent += opponentStep) {
        let utility = 0;
        for(const point of posterior) {
            const p = expectedScore(point.rating, opponent);
            utility += Math.exp(point.logWeight - maxWeight)
                * Math.log1p(scale ** 2 * p * (1 - p) / point.information);
        }
        if(utility > bestUtility) {
            bestUtility = utility;
            bestRating = opponent;
        }
    }
    return bestRating;
}

export function tally(games) {
    const wins = games.filter(game => game.score === 1).length;
    const losses = games.filter(game => game.score === 0).length;
    return { wins, draws: games.length - wins - losses, losses };
}
