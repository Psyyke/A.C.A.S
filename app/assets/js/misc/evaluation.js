// UCI scores describe the side being analyzed, not necessarily White or the player.
// Both the eval bar and dynamic settings consume this conversion.
export function evaluationForPlayer(score, mate, analyzedColor, playerColor) {
    if(score == null || score === '' || !Number.isFinite(Number(score))
        || !['w', 'b'].includes(analyzedColor) || !['w', 'b'].includes(playerColor)) return null;
    const numericScore = Number(score);
    // Mate 0 means the analyzed side is already checkmated.
    const analyzedEvaluation = mate ? (numericScore > 0 ? 1000 : -1000) : numericScore;
    const playerEvaluation = analyzedColor === playerColor ? analyzedEvaluation : -analyzedEvaluation;
    const whiteEvaluation = analyzedColor === 'w' ? analyzedEvaluation : -analyzedEvaluation;
    const whiteAdvantage = mate ? (whiteEvaluation > 0 ? 1 : 0) : 1 / (1 + 10 ** (-whiteEvaluation / 800));
    return { playerEvaluation, whiteEvaluation, whiteAdvantage };
}