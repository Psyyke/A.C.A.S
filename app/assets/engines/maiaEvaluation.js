// Maia predicts human outcomes, not searched centipawns. Use the same scale as
// MoveEvaluator.winningChances so conversion does not amplify small value changes.
export function maiaValueToCp(value) {
    if(!Number.isFinite(value)) return null;

    const probability = Math.max(0.0001, Math.min(0.9999, value));
    return Math.round(Math.log(probability / (1 - probability)) / 0.00368208);
}

export async function scoreMaiaCandidates(fen, policy, multiPV, evaluateReply, ChessLib) {
    const moves = Object.entries(policy).sort((a, b) => b[1] - a[1])
        .slice(0, Math.max(1, Math.min(20, Number(multiPV) || 1)));
    const scores = new Map();

    // Keep policy order for suggestions, but evaluate the actual resulting boards.
    // A candidate's value is from the replying side: invert it back to the mover.
    for(const [move] of moves) {
        const board = new ChessLib(fen);
        const played = board.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
        if(!played) continue;

        if(board.in_checkmate()) {
            scores.set(move, { cp: null, mate: 1 });
        } else if(board.in_draw()) {
            scores.set(move, { cp: 0, mate: null });
        } else {
            const value = await evaluateReply(board.fen());
            if(!Number.isFinite(value)) continue;

            const cp = maiaValueToCp(1 - value);
            if(cp !== null) scores.set(move, { cp, mate: null });
        }
    }

    return scores;
}