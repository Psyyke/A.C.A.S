import test from 'node:test';
import assert from 'node:assert/strict';
import { rangePoint, updateRangeHistory, chartGeometry, chartTicks, validRangeHistory } from '../tools/eloeye/rangeChart.js';
import { ratingConfidence } from '../tools/eloeye/eloPolicy.js';
import { estimateRating } from '../tools/eloeye/eloMatch.js';
import { measurementProtocol, parseCheckpoint } from '../tools/eloeye/storage.js';

const game = (index, score = 0.5) => ({ opponent: 1500, score, acasIsWhite: index % 2 === 0, opening: Math.floor(index / 2) });

test('range snapshots use the same estimate and confidence bounds as the run', () => {
    const games = Array.from({ length: 4 }, (_, index) => game(index, index % 2));
    const point = rangePoint(games, true);
    const interval = ratingConfidence(games);
    assert.deepEqual(point, { matches: 4, low: interval.low, high: interval.high, rating: estimateRating(games).rating });
    const legacy = estimateRating(games);
    assert.deepEqual(rangePoint(games, false), { matches: 4, low: legacy.low, high: legacy.high, rating: legacy.rating });
    assert.equal(rangePoint([], true), null);
});

test('history adds only new committed groups and draws correct endpoints', () => {
    const games = Array.from({ length: 6 }, (_, index) => game(index));
    let points = updateRangeHistory([], games.slice(0, 2), true);
    assert.equal(updateRangeHistory(points, games.slice(0, 2), true), points);
    points = updateRangeHistory(points, games, true);
    assert.deepEqual(points.map(point => point.matches), [2, 6]);
    assert.equal(validRangeHistory(points, 6), true);
    const geometry = chartGeometry(points);
    assert.equal(geometry.first, 2);
    assert.equal(geometry.last, 6);
    assert.equal(geometry.latest.x, 424);
    assert.equal(Number(geometry.estimate.split(' ')[0].split(',')[0]), 44);
    assert.ok(geometry.latest.high < geometry.latest.low);
    assert.equal(geometry.estimate.split(' ').length, 2);
    assert.equal(geometry.area.split(' ').length, 4);
    assert.equal(chartGeometry([]), null);
    assert.throws(() => updateRangeHistory(points, games.slice(0, 2), true), /exceeds/);
});

test('resumed history uses the full width and a single point is centered', () => {
    const point = matches => ({ matches, low: 900, high: 1100, rating: 1000 });
    const geometry = chartGeometry([point(80), point(90), point(102)]);
    const coordinates = geometry.estimate.split(' ').map(item => Number(item.split(',')[0]));
    assert.equal(geometry.first, 80);
    assert.equal(geometry.last, 102);
    assert.equal(coordinates[0], 44);
    assert.equal(coordinates[2], 424);
    assert.ok(Math.abs(coordinates[1] - (44 + 380 * 10 / 22)) < 0.01);
    assert.equal(chartGeometry([point(80)]).latest.x, 234);
});

test('wide charts shrink axis margins without changing match proportions', () => {
    const points = [80, 90, 100].map(matches => ({ matches, low: 900, high: 1100, rating: 1000 }));
    const narrow = chartGeometry(points, null, 300);
    const wide = chartGeometry(points, null, 880);
    assert.equal(narrow.left, 44);
    assert.equal(narrow.right, 424);
    assert.equal(wide.left, 22);
    assert.equal(wide.right, 432);
    assert.equal(wide.samples[0].x, wide.left);
    assert.equal(wide.samples[1].x, (wide.left + wide.right) / 2);
    assert.equal(wide.samples[2].x, wide.right);
});

test('tall chart uses its available view height for the plotted range', () => {
    const point = { matches: 2, low: 900, high: 1100, rating: 1000 };
    const normal = chartGeometry([point], null, 300);
    const tall = chartGeometry([point], null, 300, 800);
    assert.equal(tall.bottom, 770);
    assert.ok(tall.latest.low - tall.latest.high > 2 * (normal.latest.low - normal.latest.high));
    assert.equal(chartTicks(tall, 300).find(tick => tick.current).y, tall.latest.rating);
});

test('projection extends a short distance and never exceeds the match limit', () => {
    const point = matches => ({ matches, low: 900, high: 1100, rating: 1000 });
    const geometry = chartGeometry([point(80), point(90), point(100)], 1000);
    assert.equal(geometry.projectedLast, 125);
    assert.ok(geometry.latest.x > 44 && geometry.latest.x < 424);
    assert.equal(geometry.projection.x, 424);
    assert.equal(geometry.projection.rating, geometry.latest.rating);
    assert.equal(chartGeometry([point(80), point(100)], 105).projectedLast, 105);
    assert.equal(chartGeometry([point(100)], 100).projection, null);
    assert.equal(chartGeometry([point(2)], 100).latest.x, 44);
    assert.equal(chartGeometry([point(2)], 100).projectedLast, 4);
});

test('axis includes the exact current estimate position without overlapping nearby labels', () => {
    for(const rating of [600, 600.49, 1000, 1499.6, 2599.7, 2600]) {
        const geometry = chartGeometry([
            { matches: 2, low: 0, high: 4000, rating: 1500 },
            { matches: 4, low: rating, high: rating, rating }
        ], 100);
        const ticks = chartTicks(geometry, 440);
        const current = ticks.find(tick => tick.current);
        assert.equal(current.label, Math.round(rating));
        assert.equal(current.y, geometry.latest.rating);
        assert.ok(ticks.every((tick, index) => !index || tick.y - ticks[index - 1].y >= 18));
    }
    const narrow = chartGeometry([{ matches: 2, low: 1495, high: 1505, rating: 1504.9 }]);
    const ticks = chartTicks(narrow, 440);
    assert.equal(ticks.find(tick => tick.current).y, narrow.latest.rating);
    assert.ok(ticks.every((tick, index) => !index || tick.label < ticks[index - 1].label));
    assert.ok(chartTicks(narrow, 880).length > chartTicks(narrow, 300).length);
});

test('rough projection follows recent rising, falling and stable trends with irregular group spacing', () => {
    for(const slope of [2, -2, 0]) {
        const points = [40, 44, 52, 60, 70].map(matches => ({
            matches, low: 1200, high: 1800, rating: 1500 + slope * (matches - 40)
        }));
        const geometry = chartGeometry(points, 1000);
        assert.equal(geometry.projection.value, points.at(-1).rating + slope * (geometry.projectedLast - 70));
        assert.ok(geometry.projection.rating >= geometry.top && geometry.projection.rating <= geometry.bottom);
        const older = { matches: 2, low: 0, high: 4000, rating: 600 };
        assert.equal(chartGeometry([older, ...points], 1000).projection.value, geometry.projection.value);
    }
    for(const [ratings, expected] of [[[2400, 2600], 2600], [[800, 600], 600]]) {
        const points = ratings.map((rating, index) => ({ matches: 100 + index * 2, low: rating, high: rating, rating }));
        assert.equal(chartGeometry(points, 1000).projection.value, expected);
    }
});

test('vertical scale fits the full history with modest padding, including narrow and flat ranges', () => {
    const points = [
        { matches: 2, low: 1495, high: 1505, rating: 1500 },
        { matches: 4, low: 1498, high: 1502, rating: 1510 }
    ];
    const geometry = chartGeometry(points);
    assert.equal(geometry.min, 1490);
    assert.equal(geometry.max, 1515);
    assert.equal(geometry.bottom - geometry.top, 296);
    const area = geometry.area.split(' ').map(item => Number(item.split(',')[1]));
    assert.ok(Math.max(...area) - Math.min(...area) > 85);
    const estimates = geometry.estimate.split(' ').map(item => Number(item.split(',')[1]));
    assert.ok(estimates.every(y => y >= geometry.top && y <= geometry.bottom));

    for(const rating of [600, 1500, 2600]) {
        const flat = chartGeometry([{ matches: 2, low: rating, high: rating, rating }]);
        assert.ok(flat.min < flat.max);
        assert.equal(flat.latest.rating, (flat.top + flat.bottom) / 2);
    }
    const edge = chartGeometry([{ matches: 2, low: 0, high: 4000, rating: 1500 }]);
    assert.equal(edge.min, 0);
    assert.equal(edge.max, 4000);
    assert.equal(edge.latest.high, edge.top);
    assert.equal(edge.latest.low, edge.bottom);
});

test('checkpoints preserve range history and recover saved matches if chart data is invalid', t => {
    const games = Array.from({ length: 4 }, (_, index) => game(index));
    const state = { version: 2, protocol: measurementProtocol, mode: 'auto', total: 10, boards: 2, games, batch: [] };
    assert.deepEqual(parseCheckpoint(JSON.stringify(state)), state);
    const rangeHistory = updateRangeHistory([], games, true);
    assert.deepEqual(parseCheckpoint(JSON.stringify({ ...state, rangeHistory })).rangeHistory, rangeHistory);
    const warnings = [];
    t.mock.method(console, 'warn', message => warnings.push(message));
    for(const bad of [
        [{ ...rangeHistory[0], matches: 5 }],
        [{ ...rangeHistory[0], low: 5000 }],
        [rangeHistory[0], rangeHistory[0]],
        [{ ...rangeHistory[0], rating: null }]
    ]) assert.deepEqual(parseCheckpoint(JSON.stringify({ ...state, rangeHistory: bad })), state);
    assert.equal(warnings.length, 4);
});
