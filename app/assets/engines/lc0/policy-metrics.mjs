export function comparePolicy(reference, candidate, legalIndices) {
    if(reference.length !== candidate.length || !reference.length
        || !Array.from(reference).every(Number.isFinite) || !Array.from(candidate).every(Number.isFinite))
        throw new Error('Policy logits must have matching, nonempty, finite values.');
    const indices = legalIndices ?? Array.from({ length: reference.length }, (_, index) => index);
    if(!Array.isArray(indices) || !indices.length || new Set(indices).size !== indices.length
        || indices.some(index => !Number.isSafeInteger(index) || index < 0 || index >= reference.length))
        throw new Error('Legal policy indices must be unique valid indices with at least one move.');
    const distribution = logits => {
        const values = indices.map(index => logits[index]);
        const max = Math.max(...values);
        const logSum = Math.log(values.reduce((sum, value) => sum + Math.exp(value - max), 0));
        return values.map(value => value - max - logSum);
    };
    const p = distribution(reference), q = distribution(candidate);
    const rank = logits => [...indices].sort((a, b) => logits[b] - logits[a] || a - b).slice(0, 3);
    const referenceTop = rank(reference), candidateTop = rank(candidate);
    return {
        scope: legalIndices ? 'legal-moves' : 'all-output-indices',
        kl: Math.max(0, p.reduce((sum, value, index) => sum + Math.exp(value) * (value - q[index]), 0)),
        totalVariation: p.reduce((sum, value, index) => sum + Math.abs(Math.exp(value) - Math.exp(q[index])), 0) / 2,
        top1Match: referenceTop[0] === candidateTop[0],
        top3OrderMatch: referenceTop.every((value, index) => value === candidateTop[index]),
        referenceTop, candidateTop,
        referenceTopMargin: indices.length > 1 ? reference[referenceTop[0]] - reference[referenceTop[1]] : null
    };
}

export function summarizePolicies(metrics) {
    if(!metrics.length) throw new Error('At least one policy comparison is required.');
    const scopes = new Set(metrics.map(metric => metric.scope));
    if(scopes.size !== 1) throw new Error('Do not aggregate legal and unmasked policies together.');
    const sorted = metrics.map(metric => metric.kl).sort((a, b) => a - b);
    return {
        scope: metrics[0].scope, positions: metrics.length,
        meanKl: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
        p95Kl: sorted[Math.ceil(sorted.length * 0.95) - 1], maxKl: sorted.at(-1),
        top1MatchRate: metrics.filter(metric => metric.top1Match).length / metrics.length,
        top3OrderMatchRate: metrics.filter(metric => metric.top3OrderMatch).length / metrics.length
    };
}
