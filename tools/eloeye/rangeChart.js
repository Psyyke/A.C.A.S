import { estimateRating } from './eloMatch.js';
import { ratingConfidence } from './eloPolicy.js?v=10boards';

export function rangePoint(games, automatic) {
    const estimate = estimateRating(games);
    if(!estimate) return null;
    const range = automatic ? ratingConfidence(games) : estimate;
    return { matches: games.length, low: range.low, high: range.high, rating: estimate.rating };
}

export function validRangeHistory(points, maxMatches) {
    return Array.isArray(points) && points.length <= maxMatches && points.every((point, index) =>
        point && Number.isInteger(point.matches) && point.matches > 0 && point.matches <= maxMatches
        && (!index || point.matches > points[index - 1].matches)
        && [point.low, point.high, point.rating].every(Number.isFinite)
        && point.low >= 0 && point.low <= point.high && point.high <= 4000
        && point.rating >= 600 && point.rating <= 2600);
}

export function updateRangeHistory(points, games, automatic) {
    if(!games.length || points.at(-1)?.matches === games.length) return points;
    if(points.at(-1)?.matches > games.length) throw new Error('EloEye range history exceeds completed matches');
    return [...points, rangePoint(games, automatic)];
}

export function chartTicks(geometry, width) {
    const { min, max, top, bottom, latest } = geometry;
    const scale = width / 440;
    const intervals = Math.max(1, Math.min(10, max - min, Math.floor((bottom - top) * scale / 28)));
    const spacing = 18 / scale;
    const rating = Math.round(latest.value);
    const ticks = Array.from({ length: intervals + 1 }, (_, i) => ({
        y: top + (bottom - top) * i / intervals,
        label: Math.round(max - (max - min) * i / intervals),
        current: false
    })).filter(tick => Math.abs(tick.y - latest.rating) >= spacing && tick.label !== rating);
    ticks.push({ y: latest.rating, label: rating, current: true });
    ticks.sort((a, b) => a.y - b.y);
    return ticks;
}

export function chartGeometry(points, matchLimit = null, width = 440, viewHeight = 340) {
    if(!points.length) return null;
    const marginScale = width > 440 ? 440 / width : 1;
    const left = 44 * marginScale, right = 440 - 16 * marginScale, top = 14, bottom = viewHeight - 30;
    const first = points[0].matches, last = points.at(-1).matches;
    const horizon = Math.max(2, Math.ceil(last * 0.25));
    const projectedLast = matchLimit > last ? Math.min(matchLimit, last + horizon) : last;
    const recent = points.slice(-5);
    const meanMatches = recent.reduce((sum, point) => sum + point.matches, 0) / recent.length;
    const meanRating = recent.reduce((sum, point) => sum + point.rating, 0) / recent.length;
    const variance = recent.reduce((sum, point) => sum + (point.matches - meanMatches) ** 2, 0);
    const slope = variance ? recent.reduce((sum, point) =>
        sum + (point.matches - meanMatches) * (point.rating - meanRating), 0) / variance : 0;
    const projectedRating = Math.max(600, Math.min(2600, points.at(-1).rating + slope * (projectedLast - last)));
    const lowest = Math.min(projectedRating, ...points.map(point => Math.min(point.low, point.rating)));
    const highest = Math.max(projectedRating, ...points.map(point => Math.max(point.high, point.rating)));
    const padding = Math.max(5, (highest - lowest) * 0.03);
    const min = Math.max(0, Math.floor(lowest - padding));
    const max = Math.min(4000, Math.ceil(highest + padding));
    const x = matches => first === projectedLast ? (left + right) / 2
        : left + (right - left) * (matches - first) / (projectedLast - first);
    const y = rating => bottom - (bottom - top) * (rating - min) / (max - min);
    const coordinate = (point, value) => `${x(point.matches).toFixed(2)},${y(value).toFixed(2)}`;
    return {
        min, max, first, last, projectedLast, left, right, top, bottom, marginScale,
        samples: points.map(point => ({ x: x(point.matches), y: y(point.rating), point })),
        area: points.map(point => coordinate(point, point.high))
            .concat([...points].reverse().map(point => coordinate(point, point.low))).join(' '),
        estimate: points.map(point => coordinate(point, point.rating)).join(' '),
        latest: { x: x(last), low: y(points.at(-1).low), high: y(points.at(-1).high), rating: y(points.at(-1).rating), value: points.at(-1).rating },
        projection: projectedLast > last ? { x: x(projectedLast), rating: y(projectedRating), value: projectedRating } : null
    };
}
