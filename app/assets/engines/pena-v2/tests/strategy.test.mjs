import test from 'node:test';
import assert from 'node:assert/strict';
import { PositionGraph } from '../positions.js';
import { spatialFacts } from '../spatial.js';
import { developmentCases } from './cases.js';
import { strategicProfile, compareStrategy, renderStrategy, coachingStrategy, strategyCards } from '../strategy.js';

const queen = developmentCases.find(row => row.id === 'queens-gambit-1');
function pair() {
    const graph = new PositionGraph(queen.fen);
    const preferred = graph.branch('preferred', ['g1f3', 'f8e7', 'c1g5', 'e8g8']);
    const alternative = graph.branch('alternative', ['c1g5', 'f8e7', 'c4d5', 'e6d5']);
    return { frames: [graph.root, ...preferred, ...alternative], color: 'w',
        positivePaths: [['root', ...preferred.map(frame => frame.id)]], negativePaths: [['root', ...alternative.map(frame => frame.id)]] };
}

test('paired numeric witnesses preserve three versus two, not FALSE becoming zero', () => {
    const comparison = compareStrategy(pair());
    assert.equal(comparison.positive[0].profile.colors.w.developedMinors.length, 3);
    assert.equal(comparison.negative[0].profile.colors.w.developedMinors.length, 2);
    const text = renderStrategy(comparison);
    assert.match(text, /developed minors 3/); assert.match(text, /developed minors 2/);
    assert.match(text, /conditional sampled/); assert.doesNotMatch(text, /rnbq|\/ppp|"fen"/);
    assert.equal(comparison.usedFallback, false);
    const [card] = strategyCards(comparison);
    assert.equal(card.kind, 'development');
    assert.equal(card.values.preferredOwn.length, 3); assert.equal(card.values.alternativeOwn.length, 2);
    assert.match(card.text, /has 3 minor pieces/); assert.match(card.text, /and 2 in the second/);
    assert.throws(() => renderStrategy(JSON.parse(JSON.stringify(comparison))), /authoritative/);
    assert.throws(() => { comparison.negative[0].profile.colors.w.developedMinors.length = 0; }, TypeError);
});

test('a non-distinguishing library returns no motif, never an unsupported material fallback', () => {
    const input = pair(); input.negativePaths = input.positivePaths;
    const comparison = compareStrategy(input);
    assert.deepEqual(comparison.selected, []);
    assert.deepEqual(strategyCards(comparison), []);
    assert.doesNotMatch(renderStrategy(comparison), /BinProp motif:|material advantage/);
});

test('a motif must hold across every supplied positive, not just a cherry-picked continuation', () => {
    const graph = new PositionGraph(developmentCases.find(row => row.id === 'italian-1').fen);
    const positive = graph.branch('positive', ['c2c3', 'g8f6', 'd2d4', 'e5d4']);
    const negative = graph.branch('negative', ['e1g1', 'g8f6', 'd2d3', 'd7d6']);
    const input = { frames: [graph.root, ...positive, ...negative], color: 'w',
        positivePaths: [['root', ...positive.map(frame => frame.id)]], negativePaths: [['root', ...negative.map(frame => frame.id)]] };
    const matched = compareStrategy(input);
    assert.deepEqual(matched.selected.map(item => item.id), ['f815717572588e18', 'fb1bd91c8d7fde86']);
    const cards = strategyCards(matched);
    assert.equal(cards[0].values.preferred.opponentExtraDoubled, 1);
    assert.equal(cards[0].values.alternative.opponentExtraDoubled, 0);
    assert.equal(cards[1].values.preferredOpponent, 3);
    assert.equal(cards[1].values.alternativeOpponent, 2);
    input.positivePaths.push(input.negativePaths[0]);
    assert.deepEqual(compareStrategy(input).selected, []);
});

test('an overlapping continuation cannot inherit the first pair development contrast', () => {
    const input = pair(), graph = new PositionGraph(queen.fen);
    const nearby = graph.branch('nearby', ['g1f3', 'f8e7', 'c4d5', 'e6d5']);
    input.frames.push(...nearby);
    input.positivePaths.push(['root', ...nearby.map(frame => frame.id)]);
    assert.deepEqual(strategyCards(compareStrategy(input)), []);

    const control = pair();
    control.negativePaths.push(control.positivePaths[0]);
    assert.deepEqual(strategyCards(compareStrategy(control)), []);
});

test('multi-continuation cards retain every endpoint and exact disjoint count ranges', () => {
    const input = pair(), graph = new PositionGraph(queen.fen);
    const positive = graph.branch('positive2', ['g1f3', 'f8b4', 'c1g5', 'e8g8']);
    const negative = graph.branch('negative2', ['c1g5', 'f8b4', 'c4d5', 'e6d5']);
    input.frames.push(...positive, ...negative);
    input.positivePaths.push(['root', ...positive.map(frame => frame.id)]);
    input.negativePaths.push(['root', ...negative.map(frame => frame.id)]);
    const [card] = strategyCards(compareStrategy(input));
    assert.equal(card.schema, 'pena-v2-strategy-range-card/1');
    assert.equal(card.kind, 'development');
    assert.deepEqual(card.values.preferred.own, { min: 3, max: 3 });
    assert.deepEqual(card.values.alternative.own, { min: 2, max: 2 });
    assert.equal(card.samples.preferred.length, 2);
    assert.equal(card.samples.alternative.length, 2);
    assert.deepEqual(card.samples.preferred.map(sample => sample.frameId), input.positivePaths.map(path => path.at(-1)));
    assert.deepEqual(card.samples.preferred[1].path, input.positivePaths[1].slice(1));
    assert.match(card.text, /2 preferred and 2 alternative sampled 4-ply/);
    assert.match(card.text, /White minor pieces off the home rank: 3 versus 2/);
    assert.match(card.scope, /not forced/);
    assert.throws(() => { card.samples.preferred[1].own.length = 0; }, TypeError);
});

test('duplicate move sequences are not counted as additional continuation support', () => {
    const input = pair(), graph = new PositionGraph(queen.fen);
    const duplicate = graph.branch('alias', ['g1f3', 'f8e7', 'c1g5', 'e8g8']);
    input.frames.push(...duplicate);
    input.positivePaths.push(input.positivePaths[0], ['root', ...duplicate.map(frame => frame.id)]);
    const comparison = compareStrategy(input);
    assert.equal(comparison.positive.length, 1);
    assert.equal(comparison.sampling.positiveSupplied, 3);
    assert.equal(comparison.sampling.positiveUnique, 1);
    assert.equal(strategyCards(comparison)[0].schema, undefined);
    duplicate.at(-1).pieces[0].id = 'foreign';
    assert.throws(() => compareStrategy(input), /identities/);
});

test('multi-reply pawn scores remain heuristic, witness-bound and order-independent', () => {
    const graph = new PositionGraph(developmentCases.find(row => row.id === 'italian-1').fen);
    const lines = [
        ['c2c3', 'g8f6', 'd2d4', 'e5d4'], ['c2c3', 'c6b8', 'd2d4', 'e5d4'],
        ['e1g1', 'g8f6', 'd2d3', 'd7d6'], ['e1g1', 'c6b8', 'd2d3', 'd7d6']
    ].map((moves, i) => graph.branch(`sample${i}`, moves));
    const paths = lines.map(line => ['root', ...line.map(frame => frame.id)]);
    const input = { frames: [graph.root, ...lines.flat()], positivePaths: paths.slice(0, 2), negativePaths: paths.slice(2), color: 'w' };
    const [card] = strategyCards(compareStrategy(input));
    assert.equal(card.kind, 'pawn-structure');
    assert.deepEqual(card.values.preferred.balance, { min: 1.5, max: 1.5 });
    assert.deepEqual(card.values.alternative.balance, { min: 0, max: 0 });
    assert.equal(card.samples.preferred[1].opponent.doubledExtraPawns, 1);
    assert.match(card.text, /not engine evaluations/);
    const [reordered] = strategyCards(compareStrategy({ ...input, positivePaths: [...input.positivePaths].reverse(), negativePaths: [...input.negativePaths].reverse() }));
    assert.deepEqual(card.values, reordered.values);
    assert.deepEqual(card.distinguishing, reordered.distinguishing);
    assert.equal(card.text, reordered.text);
});

test('complete equal-horizon legal paths and exact identities are mandatory', () => {
    const input = pair();
    assert.throws(() => compareStrategy({ ...input, negativePaths: [input.negativePaths[0].slice(0, 2)] }), /equal-ply/);
    const changed = structuredClone(input);
    changed.frames[1].move.san = 'Nf6';
    assert.throws(() => compareStrategy(changed), /legal replay/);
    const wrong = structuredClone(input);
    wrong.frames[1].pieces[0].id = 'foreign';
    assert.throws(() => compareStrategy(wrong), /identities/);
    assert.throws(() => compareStrategy({ ...input, color: null }), /perspective/);
});

test('profiles recompute supplied geometry and never flip the actual turn for attack/legal facts', () => {
    const graph = new PositionGraph('4k3/8/8/8/3p4/2N5/3P4/4K3 w - - 0 1');
    graph.root.spatial = { misleading: true };
    const white = strategicProfile(graph.root, 'w'), black = strategicProfile(graph.root, 'b');
    assert.equal(white.colors.w.developedMinors.length, 1);
    assert.equal(black.colors.w.developedMinors.length, 1);
    assert.equal(white.standardMaterial, -black.standardMaterial);
    assert.equal(graph.root.fen.split(' ')[1], 'w');
    assert.deepEqual(graph.root.spatial, { misleading: true });
});

test('defensive-duty witnesses name targets and deduplicate a defender guarding several units', () => {
    const graph = new PositionGraph('4k3/1b6/8/7p/4P1P1/5Q2/8/4K3 w - - 0 1');
    const facts = spatialFacts(graph.root);
    const profile = strategicProfile(graph.root, 'w');
    assert.equal(profile.colors.w.defensiveDuties.rows.length, 2);
    assert.equal(profile.colors.w.defensiveDuties.value, 1);
    for(const row of profile.colors.w.defensiveDuties.rows) {
        assert.ok(row.target.attackers.length);
        assert.ok(row.target.defenders.includes(row.piece.id));
        assert.equal(row.piece.type === 'p', false);
    }
    assert.equal(profile.colors.w.defensiveDuties.value, new Set(profile.colors.w.defensiveDuties.rows.map(row => row.piece.id)).size);
    assert.ok(facts.pieces.length);
});

test('pawn structure distinguishes pawn islands, isolated pawns and actual paired scores', () => {
    const frame = new PositionGraph('4k3/pp6/8/8/8/8/P1P5/4K3 w - - 0 1').root;
    const profile = strategicProfile(frame, 'w');
    assert.equal(profile.colors.w.pawnStructure.islands, 2);
    assert.equal(profile.colors.b.pawnStructure.islands, 1);
    assert.equal(profile.colors.w.pawnStructure.rows.filter(row => row.isolated).length, 2);
    assert.equal(profile.colors.w.pawnStructure.rows.find(row => row.piece.square === 'c2').passed, false);
});

test('king-zone witnesses exclude king guards explicitly rather than declaring safe squares', () => {
    const graph = new PositionGraph('6k1/8/8/8/8/8/2B5/5RK1 w - - 0 1');
    const profile = strategicProfile(graph.root, 'w'), data = profile.colors.w.kingZonePressure;
    assert.equal(data.king.square, 'g8');
    assert.equal(data.value, 5);
    assert.equal(data.units.length, 2);
    const f8 = data.rows.find(row => row.square === 'f8');
    assert.deepEqual(f8.attackers.map(piece => piece.square), ['f1']);
    assert.deepEqual(f8.defenders, []);
    assert.ok(spatialFacts(graph.root).pieces.find(piece => piece.square === 'g8').controls.includes('f8'));
    assert.equal(profile.motifs.d7f4da2534e3d415, true);
    const mirror = strategicProfile(new PositionGraph('5rk1/2b5/8/8/8/8/8/6K1 b - - 0 1').root, 'b');
    assert.equal(mirror.colors.b.kingZonePressure.value, data.value);
    assert.equal(mirror.motifs.d7f4da2534e3d415, true);
    const checked = strategicProfile(new PositionGraph('6k1/8/8/8/8/8/2B5/5RKr w - - 0 1').root, 'w');
    assert.equal(checked.motifs.d7f4da2534e3d415, false);
});

test('advanced control uses current pawn-file geometry, not permanent outposts', () => {
    const blocked = strategicProfile(new PositionGraph('7k/3p4/8/8/4N3/8/8/K7 w - - 0 1').root, 'w').colors.w.advancedControl;
    const clear = strategicProfile(new PositionGraph('7k/8/8/8/3pN3/8/8/K7 w - - 0 1').root, 'w').colors.w.advancedControl;
    assert.equal(blocked.rows.some(row => row.square === 'c5'), false);
    const row = clear.rows.find(row => row.square === 'c5');
    assert.deepEqual(row.adjacentEnemyPawns.map(piece => piece.square), ['d4']);
    assert.deepEqual(row.attackers.map(piece => piece.square), ['e4']);
    assert.equal(row.weight, 1);
    const capped = strategicProfile(new PositionGraph('7k/8/8/8/4Q3/8/8/K4B2 w - - 0 1').root, 'w').colors.w.advancedControl;
    assert.equal(capped.scanStopped, true);
    assert.ok(capped.value >= 14);
    assert.equal(capped.value, capped.rows.reduce((sum, row) => sum + row.weight, 0));
    const mirrored = strategicProfile(new PositionGraph('k4b2/8/8/4q3/8/8/8/7K b - - 0 1').root, 'b').colors.b.advancedControl;
    assert.equal(mirrored.value, capped.value);
});

test('geometric range cards name only controls shared at the exact current piece squares', () => {
    const graph = new PositionGraph('6k1/8/8/8/8/8/2B5/5RK1 w - - 0 1');
    const lines = [['f1f2', 'g8h8'], ['f1f2', 'g8g7'], ['c2d1', 'g8h8']]
        .map((moves, i) => graph.branch(`control${i}`, moves));
    const paths = lines.map(line => ['root', ...line.map(frame => frame.id)]);
    const comparison = compareStrategy({ frames: [graph.root, ...lines.flat()], positivePaths: paths.slice(0, 2), negativePaths: paths.slice(2), color: 'w' });
    const card = strategyCards(comparison).find(card => card.kind === 'king-zone-pressure');
    assert.deepEqual(card.values.preferred.own, { min: 3, max: 7 });
    assert.deepEqual(card.values.alternative.own, { min: 1, max: 1 });
    assert.ok(card.sharedControls.preferred.some(row => row.piece.id === 'wr@f1' && row.piece.square === 'f2'));
    for(const relation of card.sharedControls.preferred) for(const sample of card.samples.preferred) {
        assert.ok(sample.own.rows.some(row => row.square === relation.square
            && row.attackers.some(piece => piece.id === relation.piece.id && piece.square === relation.piece.square)));
    }
    assert.match(card.text, /White rook f2 geometrically controls/);
    assert.match(card.text, /not safe squares, legal access or a mating threat/);
});

test('v2 coaching hook is explicitly opt-in and retains complete conditional paths', () => {
    assert.deepEqual(coachingStrategy(null), []);
    const input = pair();
    const branch = (path, recommended) => ({ move: input.frames.find(frame => frame.id === path[1]).move.uci,
        recommended, frameId: path[1], lines: [{ role: 'searched-reply', frameIds: path.slice(2) }] });
    const record = { schema: 'pena-v2-coaching/1', frames: input.frames, rootFrameId: 'root', playerColor: 'w',
        branches: [branch(input.positivePaths[0], true), branch(input.negativePaths[0], false)] };
    const [result] = coachingStrategy(record, { enabled: true });
    assert.equal(result.comparison.horizon, 4);
    assert.match(result.text, /White Nf3, Black Be7, White Bg5, Black O-O/);
    assert.throws(() => coachingStrategy({}, { enabled: true }), /verified/);
});

test('an explicitly investigated opponent idea participates in strategic qualification', () => {
    const graph = new PositionGraph(queen.fen), [choice] = graph.branch('choice', ['g1f3']);
    const searched = graph.branch('searched', ['f8e7', 'c1g5', 'e8g8'], { parent: choice.id });
    const asked = graph.branch('asked', ['f8e7', 'c4d5', 'e6d5'], { parent: choice.id });
    const alternative = graph.branch('alternative', ['c1g5', 'f8e7', 'c4d5', 'e6d5']);
    const record = { schema: 'pena-v2-coaching/1', frames: [graph.root, choice, ...searched, ...asked, ...alternative], rootFrameId: 'root', playerColor: 'w',
        branches: [
            { move: choice.move.uci, recommended: true, frameId: choice.id, lines: [
                { role: 'searched-reply', frameIds: searched.map(frame => frame.id) },
                { role: 'asked-opponent-idea', frameIds: asked.map(frame => frame.id) }
            ] },
            { move: alternative[0].move.uci, recommended: false, frameId: alternative[0].id,
                lines: [{ role: 'searched-reply', frameIds: alternative.slice(1).map(frame => frame.id) }] }
        ] };
    const [result] = coachingStrategy(record, { enabled: true });
    assert.equal(result.comparison.positive.length, 2);
    assert.deepEqual(result.cards, []);
});
