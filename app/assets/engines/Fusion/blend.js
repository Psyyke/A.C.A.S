import { personalities } from './options.js';
import { personalityAdjustment } from './personality.js';
import { seededValue } from './identity.js';

export function scoreValue(candidate) {
    if(candidate.mate != null) {
        return candidate.mate > 0 ? 100000 - candidate.mate : -100000 - candidate.mate;
    }
    return candidate.cp;
}

export function objectiveRoot(search) {
    return [...search.candidates.values()]
        .filter(candidate => search.legal.has(candidate.move) && Number.isFinite(scoreValue(candidate)))
        .sort((a, b) => scoreValue(b) - scoreValue(a) || a.move.localeCompare(b.move))[0];
}

// Maia defines the eligible move pool. Missing MultiPV entries are never 0 cp.
export function blendMoves(search, sample = false) {
    const options = search.options;
    const personality = personalities[options.Personality] || personalities.Balanced;
    const weight = Math.min(95, Math.max(0, options['Stockfish Weight'])) / 100;
    const policy = search.policy;
    if(!policy) return [];

    const humanMoves = [...search.legal.keys()].filter(move => Number.isFinite(policy[move]) && policy[move] > 0);
    if(!humanMoves.length) return [];

    const mostLikely = Math.max(...humanMoves.map(move => policy[move]));
    const threshold = mostLikely * (options['Human Plausibility'] / 100);
    const plausible = new Set(humanMoves.filter(move => policy[move] >= threshold));
    const evaluated = [...search.candidates.values()].filter(candidate =>
        search.legal.has(candidate.move) && Number.isFinite(scoreValue(candidate)));

    // The factual reference includes Stockfish's best move even when Maia finds
    // that move implausible. Otherwise a human blunder could appear to lose 0 cp.
    const root = objectiveRoot(search);
    const best = root ? scoreValue(root) : null;
    const tolerance = options['Max Centipawn Loss'] * personality.tolerance;

    const temperature = options['Maia Temperature'] / 100 * personality.temperature;
    const window = options['Score Window'];

    const rankCandidates = (candidates, humanOnly) => candidates.map(candidate => {
        const probability = policy[candidate.move];
        const hasScore = Number.isFinite(scoreValue(candidate));
        const loss = best === null || !hasScore ? 0 : best - scoreValue(candidate);
        const humanScore = Math.log(probability) / temperature;
        const style = personalityAdjustment(search.features?.get(candidate.move), personality,
            options['Personality Strength'], search.personalStyle);
        const penalty = humanOnly || best === null ? 0 : weight / (1 - weight) * loss / window;
        const safetyEnabled = weight > 0 && options['Tactical Safety'];
        const safe = !safetyEnabled || (hasScore && root != null && (root.mate != null
            ? candidate.mate === root.mate : loss <= tolerance));

        return { ...candidate, probability, safe, blendScore: humanScore + style - penalty,
            maiaFallback: humanOnly && weight > 0 };
    }).filter(candidate => humanOnly || candidate.safe)
        .sort((a, b) => b.blendScore - a.blendScore || a.move.localeCompare(b.move));

    let ranked = weight > 0
        ? rankCandidates(evaluated.filter(candidate => plausible.has(candidate.move)), false) : [];

    if(!ranked.length) {
        // A valid Maia policy always has a most-likely allowed move. If no mixed
        // candidate qualifies, keep its plausible pool, personality and identity,
        // but remove Stockfish's selection penalty and safety veto. Preserve real
        // scores where available; never label an unsearched move safe or 0 cp.
        const humanCandidates = [...plausible].map(move =>
            search.candidates.get(move) || { move, pv: [move], depth: 0 });
        ranked = rankCandidates(humanCandidates, true);
    }

    if(!ranked.length) return [];

    const maximum = Math.max(...ranked.map(candidate => candidate.blendScore));
    const total = ranked.reduce((sum, candidate) => sum + Math.exp(candidate.blendScore - maximum), 0);
    ranked.forEach(candidate => candidate.blendProbability = Math.exp(candidate.blendScore - maximum) / total);

    if(sample && options.Randomness > 0) {
        let cumulative = 0;
        const pool = [];
        for(const candidate of ranked) {
            pool.push(candidate);
            cumulative += candidate.blendProbability;
            if(cumulative >= options['Top P'] / 100) break;
        }

        const position = search.fen.split(' ').slice(0, 4).join(' ');
        const random = seededValue(search.identitySeed, `sample:gate:${position}`);
        const chance = options.Randomness / 100;
        if(random < chance) {
            const target = seededValue(search.identitySeed, `sample:choice:${position}`) * cumulative;
            let sum = 0;
            const chosen = pool.find(candidate => (sum += candidate.blendProbability) > target) || pool[0];
            ranked.splice(ranked.indexOf(chosen), 1);
            ranked.unshift(chosen);
        }
    }

    return ranked;
}