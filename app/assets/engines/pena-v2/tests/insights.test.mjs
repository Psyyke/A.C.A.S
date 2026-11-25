import test from 'node:test';
import assert from 'node:assert/strict';
import { PositionGraph } from '../positions.js';
import { spatialFacts } from '../spatial.js';
import { coachingCases } from './coaching-cases.js';
import { moveInsightFacts, buildCoachingRecord, analyseCoaching, coachingPacket, renderCoachingEvidence, deterministicCoaching } from '../insights.js';
import { coachingMessages, renderHybrid } from '../coaching-language.js';

const start = coachingCases[0].fen;
const engine = { networkSha256: 'test-network', backend: 'fixture', settings: { Contempt: 0 } };
function search(fen, moves, { history = [], restriction = [], nodes = 64 } = {}) {
    return { schema: 'pena-v2-search/1', searchId: `search:${fen}:${moves.join(',')}:${restriction.join(',')}`, fen, history,
        engine, budget: { nodes, moves: restriction }, perspective: 'root-side-to-move', bestMove: moves[0] || null,
        candidates: moves.length ? [{ move: moves[0], visits: 63, search: { q: 0.12 } }] : [],
        lines: moves.length ? [{ rank: 1, pv: moves, score: null }] : [] };
}
function study() {
    const root = search(start, ['g1f3', 'g8f6']);
    const [after] = new PositionGraph(start).branch('a', ['g1f3']);
    const restricted = search(start, ['g1f3', 'g8f6'], { restriction: ['g1f3'] });
    const reply = search(after.fen, ['g8f6', 'd2d4'], { history: [start] });
    reply.lines.push({ rank: 2, pv: ['e7e5', 'e2e4'] });
    return { root, candidates: [{ move: 'g1f3', search: restricted, reply }] };
}
const options = { question: 'Why Nf3?', playerColor: 'w', focusMove: 'g1f3' };

test('ray mechanism stops at the real pawn instead of calling a blocked file open', () => {
    const fixture = coachingCases.find(item => item.id === 'blocked-rook');
    const graph = new PositionGraph(fixture.fen), [after] = graph.branch('move', ['d3e2']);
    const ray = moveInsightFacts(graph.root, after).find(fact => fact.kind === 'extended-ray' && fact.data.slider.square === 'd1');
    assert.equal(ray.data.formerBlocker.square, 'd3');
    assert.deepEqual(ray.data.gainedSquares, ['d4']);
    assert.ok(!ray.text.includes('open file'));
    assert.ok(!ray.text.includes('d5'));
});

test('a relevant legal blocker change changes the exact insight, not just the wording', () => {
    const blocked = new PositionGraph('6k1/8/8/8/3P4/3B4/8/3R2K1 w - - 0 1');
    const clear = new PositionGraph('6k1/8/8/8/8/3B4/8/3R2K1 w - - 0 1');
    const ray = graph => moveInsightFacts(graph.root, graph.branch('move', ['d3e2'])[0])
        .find(fact => fact.kind === 'extended-ray' && fact.data.slider.square === 'd1').data.gainedSquares;
    assert.deepEqual(ray(blocked), ['d4']);
    assert.deepEqual(ray(clear), ['d4', 'd5', 'd6', 'd7', 'd8']);
});

test('enemy conditional attack identifies the exact bishop and does not assert a legal capture', () => {
    const fixture = coachingCases.find(item => item.id === 'enemy-conditional');
    const graph = new PositionGraph(fixture.fen), [before, after] = graph.branch('line', ['e1f2', 'f6h5']);
    const attack = moveInsightFacts(before, after).find(fact => fact.kind === 'new-attack');
    assert.equal(attack.data.source.id, 'bn@f6');
    assert.equal(attack.data.source.square, 'h5');
    assert.equal(attack.data.target.id, 'wb@f4');
    assert.equal(attack.data.target.square, 'f4');
    assert.match(attack.text, /does not establish/);
    assert.equal(spatialFacts(after).turn, 'w');
});

test('a bishop retreat explicitly ends the knight attack without requiring model geometry', () => {
    const fixture = coachingCases.find(item => item.id === 'bishop-reply');
    const graph = new PositionGraph(fixture.fen, fixture.history);
    const [before, after] = graph.branch('reply', ['e4g3', 'f5g6']);
    const escape = moveInsightFacts(before, after).find(fact => fact.kind === 'lost-attack'
        && fact.data.source.square === 'g3' && fact.data.target.square === 'g6');
    assert.ok(escape);
    assert.equal(escape.data.beforeTarget.square, 'f5');
    assert.match(escape.text, /no longer geometrically attacks/);
});

test('new insight facts preserve castling actors, en-passant victim and underpromotion', () => {
    const castle = new PositionGraph('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const castleFacts = moveInsightFacts(castle.root, castle.branch('a', ['e1g1'])[0]);
    assert.match(castleFacts[0].text, /rook also moves from h1 to f1/);
    const ep = new PositionGraph('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
    assert.match(moveInsightFacts(ep.root, ep.branch('a', ['e5d6'])[0]).find(fact => fact.kind === 'capture').text, /pawn on d5 en passant/);
    const promote = new PositionGraph('7k/P7/8/8/8/8/8/7K w - - 0 1');
    assert.match(moveInsightFacts(promote.root, promote.branch('a', ['a7a8n'])[0]).find(fact => fact.kind === 'promotion').text, /knight on a8/);
});

test('independent candidate and child searches keep complete legal scoped witnesses', () => {
    const record = buildCoachingRecord(study(), options), branch = record.branches[0];
    assert.equal(branch.q, 0.12);
    assert.equal(branch.lines.length, 2);
    assert.equal(branch.lines[0].materialDeltaWhite, 0);
    assert.equal(record.facts.find(fact => fact.kind === 'new-center-control').data.piece.id, 'wn@g1');
    for(const fact of record.facts) {
        assert.ok(record.frames.some(frame => frame.id === fact.frameId));
        assert.ok(record.frames.some(frame => frame.id === fact.beforeFrameId));
    }
    const packet = coachingPacket(record), text = renderCoachingEvidence(packet);
    assert.ok(!text.includes(start));
    assert.ok(!text.includes('"fen"'));
    assert.match(text, /not a forced sequence|NOT forced/);
    assert.match(deterministicCoaching(packet), /not prove the reason/);
    for(const item of packet.branches.flatMap(branch => branch.lines)) {
        const actions = item.factIds.map(id => packet.facts.find(fact => fact.id === id)).filter(fact => record.facts.find(source => source.id === fact.id).kind === 'action');
        assert.equal(actions.length, item.moves.length);
    }
});

test('strategic evidence is opt-in and supplies exact paired cards without changing original packets', () => {
    const input = study(), [after] = new PositionGraph(start).branch('alternative', ['d2d4']);
    input.candidates.push({ move: 'd2d4', search: search(start, ['d2d4', 'd7d5'], { restriction: ['d2d4'] }),
        reply: search(after.fen, ['d7d5', 'c2c4'], { history: [start] }) });
    const record = buildCoachingRecord(input, options);
    const baseline = coachingPacket(record), enriched = coachingPacket(record, { includeStrategy: true });
    assert.equal(Object.hasOwn(baseline, 'strategyComparisons'), false);
    assert.equal(enriched.strategyComparisons.length, 1);
    assert.deepEqual(enriched.facts, baseline.facts);
    const [card] = enriched.strategyComparisons[0].cards;
    assert.equal(card.kind, 'development');
    assert.equal(card.schema, 'pena-v2-strategy-range-card/1');
    assert.deepEqual(card.values.preferred.own, { min: 1, max: 1 });
    assert.deepEqual(card.values.alternative.own, { min: 0, max: 0 });
    assert.equal(card.samples.preferred.length, 2);
    assert.match(renderCoachingEvidence(enriched), /VERIFIED PAIRED STRATEGIC EVIDENCE/);
    assert.equal(renderCoachingEvidence(baseline).includes('STRATEGIC EVIDENCE'), false);
});

test('mismatched search identity, budget, history, restriction and missing searched values fail explicitly', () => {
    for(const mutate of [
        data => { data.candidates[0].search.engine = { ...engine, networkSha256: 'other' }; },
        data => { data.candidates[0].search.budget.nodes++; },
        data => { data.candidates[0].search.budget.moves = []; },
        data => { data.candidates[0].search.candidates[0].search = null; },
        data => { data.candidates[0].reply.history = []; },
        data => { data.candidates[0].reply.lines = []; },
        data => { data.candidates[0].reply.lines[0].pv[0] = 'e7e4'; }
    ]) {
        const data = study(); mutate(data);
        assert.throws(() => buildCoachingRecord(data, options));
    }
});

test('requested subject defense stays distinct from the moved king', () => {
    const fixture = coachingCases.find(item => item.id === 'enemy-conditional'), fen = fixture.fen;
    const [after] = new PositionGraph(fen).branch('a', ['e1f2']);
    const root = search(fen, ['e1f2', 'f6h5']);
    const data = { root, candidates: [{ move: 'e1f2', search: search(fen, ['e1f2'], { restriction: ['e1f2'] }),
        reply: search(after.fen, ['f6h5'], { history: [fen] }),
        probe: search(after.fen, ['f6h5'], { history: [fen], restriction: ['f6h5'] }) }] };
    const record = buildCoachingRecord(data, fixture);
    const defense = record.facts.find(fact => fact.kind === 'subject-defense');
    assert.equal(defense.data.piece.id, 'wb@f4');
    assert.deepEqual(defense.data.defenders, []);
    assert.match(defense.text, /0 geometric defenders/);
    assert.throws(() => buildCoachingRecord(data, { ...fixture, opponentMove: 'f6d5' }), /opponent investigation/);
    data.candidates[0].probe = null;
    assert.throws(() => buildCoachingRecord(data, fixture), /opponent investigation/);
});

test('the requested rook ray and its exact first blocker cannot be ranked out of the model packet', () => {
    const fixture = coachingCases.find(item => item.id === 'blocked-rook'), fen = fixture.fen;
    const [after] = new PositionGraph(fen).branch('a', ['d3e2']);
    const root = search(fen, ['d3e2']);
    const data = { root, candidates: [{ move: 'd3e2', search: search(fen, ['d3e2'], { restriction: ['d3e2'] }),
        reply: search(after.fen, ['e4c3'], { history: [fen] }) }] };
    const record = buildCoachingRecord(data, fixture), packet = coachingPacket(record);
    const ray = record.facts.find(fact => fact.kind === 'subject-ray');
    assert.equal(ray.data.blocker.square, 'd4');
    assert.equal(ray.data.blocker.color, 'w');
    assert.deepEqual(ray.data.ray.emptySquares, ['d2', 'd3']);
    assert.ok(packet.branches[0].immediateIds.includes(ray.id));
    assert.match(deterministicCoaching(packet), /White pawn on d4 as its first blocker/);
});

test('h3 does not silently free or merge the two differently pinned knights', () => {
    const fixture = coachingCases.find(item => item.id === 'pin-counterplay'), fen = fixture.fen;
    const [after] = new PositionGraph(fen, fixture.history).branch('a', ['h2h3']);
    const root = search(fen, ['h2h3'], { history: fixture.history });
    const data = { root, candidates: [{ move: 'h2h3', search: search(fen, ['h2h3'], { history: fixture.history, restriction: ['h2h3'] }),
        reply: search(after.fen, ['g4h5'], { history: [...fixture.history, fen] }) }] };
    const packet = coachingPacket(buildCoachingRecord(data, fixture));
    const text = renderCoachingEvidence(packet);
    assert.match(text, /knight on c3.*absolute/);
    assert.match(text, /knight on f3.*relative/);
    assert.match(text, /not a claim about the position after an opponent reply/);
});

test('analysis independently searches preferred/user moves and replies without a turn flip', async () => {
    const calls = [];
    const fake = { async search(fen, options) {
        calls.push({ fen, ...options });
        const pv = options.moves || (fen === start ? ['g1f3', 'g8f6'] : ['g8f6']);
        return search(fen, pv, { history: options.history, restriction: options.moves || [], nodes: options.nodes });
    } };
    const result = await analyseCoaching(fake, start, { ...options, nodes: 64 });
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[1].moves, ['g1f3']);
    assert.notEqual(calls[2].fen, start);
    assert.deepEqual(calls[2].history, [start]);
    assert.equal(result.record.branches.length, 1);
});

test('all coaching research fixtures have legal requested moves and actual-turn opponent probes', () => {
    for(const item of coachingCases) {
        const graph = new PositionGraph(item.fen, item.history);
        const frames = graph.branch('test', [item.focusMove, ...(item.opponentMove ? [item.opponentMove] : [])]);
        assert.ok(frames.length);
        assert.equal(spatialFacts(graph.root).turn, item.playerColor);
    }
});

test('hybrid realization preserves expressive prose and exact facts without equating format with truth', () => {
    const packet = coachingPacket(buildCoachingRecord(study(), options));
    const choice = { lead: 'Give that knight a job rather than a sightseeing tour.',
        factIds: packet.branches[0].immediateIds.slice(0, 2), closing: 'Which of those squares matters most to your next idea?' };
    const rendered = renderHybrid(JSON.stringify(choice), packet);
    assert.ok(rendered.text.startsWith(choice.lead));
    assert.ok(rendered.text.endsWith(choice.closing));
    for(const id of choice.factIds) assert.ok(rendered.text.includes(packet.facts.find(fact => fact.id === id).text));
    assert.match(rendered.caveat, /semantic evaluation/);
    for(const factIds of [[choice.factIds[0], choice.factIds[0]], ['unknown', choice.factIds[1]], []])
        assert.throws(() => renderHybrid(JSON.stringify({ ...choice, factIds }), packet), /Invalid hybrid/);
});

test('hybrid insertion cannot strip a selected continuation fact of its conditional path', () => {
    const record = buildCoachingRecord(study(), options), packet = coachingPacket(record);
    const later = record.facts.find(fact => fact.kind === 'action' && fact.data.move.uci === 'g8f6');
    const choice = { lead: 'One possibility is worth comparing.', factIds: [packet.branches[0].immediateIds[0], later.id], closing: 'Those are examples, not compulsory replies.' };
    const delivery = renderHybrid(JSON.stringify(choice), packet);
    assert.match(delivery.text, /Conditional line: White Nf3, Black Nf6/);
});

test('expression arms see byte-identical evidence and questions while tone does not change evidence', () => {
    const packet = coachingPacket(buildCoachingRecord(study(), options)), evidence = renderCoachingEvidence(packet);
    const hybrid = coachingMessages(packet, evidence, { arm: 'hybrid' });
    const free = coachingMessages(packet, evidence, { arm: 'free', tone: 'dryly humorous and concise' });
    assert.equal(hybrid[1].content, free[1].content);
    assert.notEqual(hybrid[0].content, free[0].content);
    assert.match(free[0].content, /no fixed wording is required/);
});
