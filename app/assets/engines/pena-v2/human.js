import { boardAt } from './positions.js';

export function humanCandidates(result, fen, { eloSelf, eloOpponent, limit = 2 } = {}) {
    if(!result?.policy || !Number.isSafeInteger(limit) || limit < 1 || limit > 3
        || ![eloSelf, eloOpponent].every(elo => Number.isSafeInteger(elo) && elo >= 400 && elo <= 3000))
        throw new Error('Human candidates need a Maia policy, explicit player ratings and a bounded limit.');
    const board = boardAt(fen);
    const legal = new Set(board.moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || '')));
    const entries = Object.entries(result.policy);
    if(entries.length !== legal.size || entries.some(([move, probability]) => !legal.has(move)
        || !Number.isFinite(probability) || probability < 0 || probability > 1)
        || entries.length && Math.abs(entries.reduce((sum, [, probability]) => sum + probability, 0) - 1) > 0.001)
        throw new Error('Maia policy must contain exactly the current legal moves with normalized probabilities.');
    return entries.filter(([, probability]) => probability > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit)
        .map(([move, probability]) => ({ move, probability, eloSelf, eloOpponent, color: board.turn(),
            source: 'Maia-3', semantics: 'Human move-choice estimate, NOT move strength or probability of winning.' }));
}

export async function suggestHumanCandidates(maia, fen, { history = [], eloSelf, eloOpponent, limit = 2, signal } = {}) {
    if(![eloSelf, eloOpponent].every(elo => Number.isSafeInteger(elo) && elo >= 400 && elo <= 3000))
        throw new Error('Specify valid Maia self/opponent ratings before inference.');
    signal?.throwIfAborted();
    const graphHistory = [fen, ...history.slice().reverse()].slice(0, 8);
    const result = await maia.evaluate(fen, eloSelf, eloOpponent, graphHistory);
    signal?.throwIfAborted();
    return humanCandidates(result, fen, { eloSelf, eloOpponent, limit });
}
