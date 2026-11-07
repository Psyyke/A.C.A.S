const warningByCategory = { 2: 'mistake', 3: 'blunder', 4: 'blunder' };

export function getMoveWarning(best, move, compare) {
    const toScore = item => ({
        move: item.playerUci,
        depth: 0,
        cp: Number.isFinite(item.cp) ? item.cp : null,
        mate: Number.isFinite(item.mate) ? item.mate : null
    });
    const [bestScore, moveScore] = [toScore(best), toScore(move)];

    if([bestScore, moveScore].some(score => score.cp === null && score.mate === null)) return null;
    if(bestScore.mate > 0 && !(moveScore.mate > 0)) return 'miss';

    return warningByCategory[compare(bestScore, moveScore).category] ?? null;
}

export function moveSelection(best, move, rank, profile, warning, isCandidate, engine) {
    if(!best || !isCandidate) return { profile, rank, best: false, safe: false };
    const safeAlternative = !warning && (best.mate > 0
        ? move.mate > 0
        : !Number.isFinite(best.mate) && !Number.isFinite(move.mate)
            && Number.isFinite(best.cp) && Number.isFinite(move.cp) && best.cp - move.cp <= 100);
    const safe = isCandidate && (move === best
        || safeAlternative && !['maia2', 'maia3'].includes(engine));
    const category = move === best ? 'best'
        : ['mistake', 'blunder', 'miss'].includes(warning) ? warning : safe ? 'secondary' : 'other';
    return { profile, rank, best: move === best, safe, category };
}
