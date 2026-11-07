import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchCommand } from '../app/assets/js/instance/searchCommand.js';

test('external engines use engine-side movetime when a budget is configured', () => {
    assert.deepEqual(buildSearchCommand({ nodes: 5000, depth: 18, movetime: 2500, externalEngine: true }), {
        command: 'go movetime 2500', goalDepth: null, goalNodes: null
    });
});

test('movetime preserves requested searchmoves and floors fractional milliseconds', () => {
    assert.deepEqual(buildSearchCommand({ nodes: 0, depth: 18, movetime: 1200.9, externalEngine: true, specificMoves: ' searchmoves e2e4 d2d4' }), {
        command: 'go movetime 1200 searchmoves e2e4 d2d4', goalDepth: null, goalNodes: null
    });
});

test('built-in engines retain node and depth limits even with a movetime setting', () => {
    assert.equal(buildSearchCommand({ nodes: 5000, depth: 18, movetime: 2500, externalEngine: false }).command, 'go nodes 5000');
    assert.equal(buildSearchCommand({ nodes: 0, depth: 18, movetime: 2500, externalEngine: false }).command, 'go depth 18');
});

test('external engines without a positive finite budget retain node and depth limits', () => {
    assert.equal(buildSearchCommand({ nodes: 5000, depth: 18, movetime: 0, externalEngine: true }).command, 'go nodes 5000');
    assert.equal(buildSearchCommand({ nodes: 0, depth: 18, movetime: Infinity, externalEngine: true }).command, 'go depth 18');
});
