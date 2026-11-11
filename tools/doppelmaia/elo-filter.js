export function ratingSummary(dataset) {
    const ids = [...dataset.train.gameIds, ...dataset.validation.gameIds];
    const ratings = ids.map(id => dataset.gameRatings?.[id]).filter(Number.isFinite);
    return { rated: ratings.length, missing: ids.length - ratings.length,
        minimum: ratings.length ? ratings.reduce((a, b) => Math.min(a, b)) : undefined,
        maximum: ratings.length ? ratings.reduce((a, b) => Math.max(a, b)) : undefined };
}

export function filterDatasetElo(dataset, target, tolerance) {
    if(!Number.isInteger(target) || target < 1 || target > 4000
        || !Number.isInteger(tolerance) || tolerance < 0 || tolerance > 4000)
        throw new Error('Choose a target Elo from 1 to 4,000 and a range from 0 to 4,000.');
    const gameRatings = {};
    const split = source => {
        const gameIds = source.gameIds.filter(id => {
            const rating = dataset.gameRatings?.[id];
            if(!Number.isFinite(rating) || Math.abs(rating - target) > tolerance) return false;
            gameRatings[id] = rating;
            return true;
        });
        const indices = new Map(gameIds.map((id, index) => [id, index]));
        const samples = source.samples.filter(sample => indices.has(sample.gameId))
            .map(sample => ({ ...sample, gameIndex: indices.get(sample.gameId) }));
        if(!samples.length) throw new Error('This Elo range needs positions in both training and validation games. Widen the range or import more games.');
        return { ...source, gameIds, samples };
    };
    const train = split(dataset.train), validation = split(dataset.validation);
    const ratings = Object.values(gameRatings);
    return { ...dataset, train, validation, gameRatings,
        playerElo: Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length),
        options: { ...dataset.options, eloFilter: { target, tolerance } } };
}
