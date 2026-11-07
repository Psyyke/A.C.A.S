const key = move => `${move.from}${move.to}${move.promotion || 'q'}`;
const candidateKey = candidate => Array.isArray(candidate.move)
    ? `${candidate.move[0]}${candidate.move[1]}${candidate.move[2] || 'q'}` : null;

export const defaultSelectionWeights = Object.freeze({
    best: 90, alternative: 10, secondary: 0, mistake: 0, blunder: 0, miss: 0, other: 0
});
export const moveCategories = Object.keys(defaultSelectionWeights);

export function validateSelectionWeights(weights) {
    if(weights && weights.alternative === undefined) weights = { ...weights, alternative: 0 };
    if(!weights || moveCategories.some(category => !Number.isFinite(weights[category])
        || weights[category] < 0 || weights[category] > 100)
        || Math.abs(moveCategories.reduce((sum, category) => sum + weights[category], 0) - 100) > 0.000001)
        throw new Error('Move percentages must be between 0 and 100 and total 100%.');
    return Object.fromEntries(moveCategories.map(category => [category, weights[category]]));
}

export function rebalanceSelectionWeights(weights, category, value, categories = moveCategories) {
    weights = validateSelectionWeights(weights);
    if(!categories.includes(category) || !Number.isFinite(value) || value < 0 || value > 100)
        throw new Error('Choose a percentage between 0 and 100.');
    const others = categories.filter(name => name !== category);
    const total = others.reduce((sum, name) => sum + weights[name], 0);
    const result = Object.fromEntries(moveCategories.map(name => [name, 0]));
    result[category] = value;
    let remaining = 100 - value;
    const recipients = total ? others.filter(name => weights[name] > 0) : others.slice(0, 1);
    recipients.forEach((name, index) => {
        const share = Math.max(0, Math.min(remaining, index === recipients.length - 1 ? remaining
            : Math.round((100 - value) * weights[name] / total * 100) / 100));
        result[name] = Math.round(share * 1e10) / 1e10;
        remaining -= share;
    });
    return validateSelectionWeights(result);
}

// Conflicting labels are resolved conservatively, without comparing engines' scores.
const priority = ['best', 'secondary', 'other', 'mistake', 'miss', 'blunder'];
const categoryOf = candidate => priority.includes(candidate.category) ? candidate.category
    : candidate.best === true && candidate.safe === true ? 'best'
    : candidate.safe === true ? 'secondary' : 'other';

export function selectHintMove(moves, candidates = [], random = Math.random, weights = defaultSelectionWeights) {
    weights = validateSelectionWeights(weights);
    const available = new Map(moves.map(move => [key(move), move]));
    const ranked = candidates.filter(candidate => candidate && available.has(candidateKey(candidate))
        && typeof candidate.profile === 'string' && Number.isInteger(candidate.rank) && candidate.rank >= 0);
    if(!ranked.length) return { move: null, legacy: true };
    const unique = new Map();
    for(const candidate of ranked) {
        const id = candidateKey(candidate), category = categoryOf(candidate), previous = unique.get(id);
        if(!previous || priority.indexOf(category) > priority.indexOf(previous))
            unique.set(id, category);
    }
    let groups = moveCategories.map(category => ({
        category, weight: weights[category],
        moves: [...unique].filter(([, label]) => category === 'alternative' ? label !== 'best' : label === category)
            .map(([id]) => available.get(id))
    })).filter(group => group.weight > 0 && group.moves.length);
    const fallback = groups.length === 0;
    if(fallback) groups = [{ category: 'fallback', weight: 100,
        moves: [...unique.keys()].map(id => available.get(id)) }];
    const total = groups.reduce((sum, group) => sum + group.weight, 0);
    if(!total) return { move: null, legacy: false };
    let draw = random() * total;
    const group = groups.find(group => (draw -= group.weight) < 0) || groups.at(-1);
    return { move: group.moves[Math.floor(random() * group.moves.length)], category: group.category, legacy: false, fallback };
}
