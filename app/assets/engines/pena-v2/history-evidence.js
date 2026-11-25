import { boardAt } from './positions.js';

function repetitionKey(fen) {
    const fields = boardAt(fen).fen().split(' ');
    if(fields[3] !== '-' && !boardAt(fen).moves({ verbose: true }).some(move => move.flags.includes('e'))) fields[3] = '-';
    return fields.slice(0, 4).join(' ');
}

export function recordedHistoryFact(fen, history = []) {
    if(!Array.isArray(history) || history.length > 1024) throw new Error('Invalid recorded game history.');
    boardAt(fen);
    const current = repetitionKey(fen);
    const occurrences = 1 + history.filter(prior => repetitionKey(prior) === current).length;
    const halfmoves = Number(fen.split(' ')[4]);
    const text = `CURRENT recorded-history occurrences=${occurrences}; threefold threshold observed=${occurrences >= 3}; `
        + `halfmoves since pawn move/capture=${halfmoves}; fifty-move threshold=${halfmoves >= 100}. `
        + 'Same position includes turn/castling/legal en-passant. Counts cover supplied history only, not missing earlier play; claim thresholds are not automatic game outcomes. '
        + 'LC0 search repetition horizon=last 8 prior positions, not full-game adjudication.';
    return Object.freeze({ id: 'C.history', kind: 'recorded-history', frameId: 'root', text,
        data: Object.freeze({ occurrences, threefoldThresholdObserved: occurrences >= 3, halfmoves,
            fiftyMoveThreshold: halfmoves >= 100, suppliedPriorPositions: history.length,
            earlierHistoryMayBeMissing: true, lc0PriorPositionHorizon: 8 }) });
}

export function recordedHistoryEvidence(fen, history = []) {
    const fact = recordedHistoryFact(fen, history);
    return `[${fact.id}] ${fact.text}`;
}
