import {
    maiaEloGrid, maiaTemperatures, minMaiaMoves, isRatingPosition, ratingPositionKey,
    posteriorElo, posteriorWeights, minimumPolicyProbability
} from '../../app/assets/engines/Maia3/likelihood.js';

export const maxSamplesPerGame = 24;

const jointGrid = maiaEloGrid.flatMap(rating => maiaTemperatures.map(() => rating));
const emptyEvidence = () => ({ version: 1, moves: 0, totals: jointGrid.map(() => 0) });
// Standard chess has fewer than 256 legal moves; this also bounds corrupt saved totals.
const minimumLogLikelihood = Math.log(minimumPolicyProbability) / Math.min(...maiaTemperatures) - Math.log(256);

export function validMoveEvidence(evidence) {
    return evidence?.version === 1
        && Number.isInteger(evidence.moves) && evidence.moves >= 0 && evidence.moves <= maxSamplesPerGame
        && Array.isArray(evidence.totals) && evidence.totals.length === jointGrid.length
        && evidence.totals.every(value => Number.isFinite(value) && value <= 0 && value >= evidence.moves * minimumLogLikelihood)
        && (evidence.moves > 0 || evidence.totals.every(value => value === 0));
}

export function estimateMoveEvidence(games) {
    const combined = emptyEvidence();

    for(const { moveEvidence } of games) {
        if(moveEvidence === undefined) continue;
        if(!validMoveEvidence(moveEvidence)) throw new Error('Invalid EloEye move evidence');

        combined.moves += moveEvidence.moves;
        moveEvidence.totals.forEach((value, index) => { combined.totals[index] += value; });
    }

    if(combined.moves < minMaiaMoves) return null;

    const firstRating = combined.totals.slice(0, maiaTemperatures.length);
    if(combined.totals.every((value, index) => Math.abs(value - firstRating[index % firstRating.length]) < 1e-6)) return null;

    // Sum joint log likelihoods first: one Elo/temperature must explain all moves.
    // Marginalizing temperature separately per move would overfit every decision.
    const estimate = posteriorElo(combined.totals, undefined, jointGrid);
    const weights = posteriorWeights(combined.totals, undefined, jointGrid);
    const temperature = weights.reduce((sum, weight, index) =>
        sum + weight * maiaTemperatures[index % maiaTemperatures.length], 0);

    return { ...estimate, temperature: Math.round(temperature * 100) / 100, moves: combined.moves };
}

export class MoveSampler {
    constructor(opponent, onUpdate, onError) {
        this.opponent = opponent;
        this.onUpdate = onUpdate;
        this.onError = onError;
        this.evidence = emptyEvidence();
        this.seen = new Set();
        this.pending = null;
    }

    observe({ fen, move, legalMoves }) {
        if(this.pending || this.evidence.moves >= maxSamplesPerGame || legalMoves <= 1 || !isRatingPosition(fen)) return;

        const key = ratingPositionKey(fen);
        if(this.seen.has(key)) return;
        this.seen.add(key);

        // At most one sample per board is queued. Busy analysis skips new samples
        // instead of building an unbounded backlog or waiting for an analysis slot.
        this.pending = this.opponent.likelihood(fen, move)
            .then(totals => {
                const sample = { version: 1, moves: 1, totals };
                if(!validMoveEvidence(sample)) throw new Error('Maia returned invalid move evidence');

                totals.forEach((value, index) => { this.evidence.totals[index] += value; });
                this.evidence.moves++;
                this.onUpdate();
            })
            .catch(this.onError)
            .finally(() => { this.pending = null; });
    }

    async finish() {
        await this.pending;
        return { ...this.evidence, totals: [...this.evidence.totals] };
    }
}
