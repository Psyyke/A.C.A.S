import test from 'node:test';
import assert from 'node:assert/strict';
import { coachingInput } from '../coaching-input.js';
import { adapterInput } from '../adapter-input.js';

const args = { fen: 'k7/8/8/8/6b1/5P2/8/7K w - - 0 1', playerColor: 'w', question: 'Is my knight on f3 attacked?' };

test('question facts explicitly correct the premise and describe the actual pawn attack in both directions', () => {
    const input = coachingInput(args);
    assert.match(input.evidence, /No White knight matches that reference on f3.*That square contains White pawn on f3/);
    assert.match(input.evidence, /White pawn on f3 has no geometric defenders\. Geometric attackers: Black bishop on g4/);
    assert.ok(Object.isFrozen(input.query));
    assert.equal(new Set(input.references.map(ref => ref.id)).size, input.references.length);
    const empty = coachingInput({ ...args, fen: 'k7/8/8/8/6b1/8/8/7K w - - 0 1' });
    assert.match(empty.evidence, /That square is empty/);
    const black = coachingInput({ fen: '7k/8/5n2/6B1/8/8/8/K7 b - - 0 1', playerColor: 'b', question: 'Is my knight on f6 attacked?' });
    assert.match(black.evidence, /Black knight on f6.*Geometric attackers: White bishop on g5/);
});

test('tracked current and conditional subjects are explicit without treating the line as played', () => {
    const input = coachingInput({ fen: 'k7/8/8/8/8/8/8/4K1N1 w - - 0 1', playerColor: 'w',
        question: 'After Nf3 in L1, is my knight still on g1 on the live board?', continuations: [{ id: 'L1', moves: ['g1f3'] }] });
    assert.equal(input.query.explicitlyCurrent, true);
    assert.match(input.evidence, /CURRENT White knight on g1\. CONDITIONAL L1 leaf: White knight on f3\. The live board is unchanged/);
    assert.ok(input.references.some(ref => ref.id === 'L1.p1'));
    assert.ok(input.facts.every(fact => input.references.some(ref => ref.id === fact.referenceId)));
    assert.ok(!input.evidence.includes('k7/'));
});

test('saved evaluations preserve root and player perspective without importing old quality labels', () => {
    const input = coachingInput({ fen: 'k6r/8/8/8/8/8/8/K2Q4 b - - 0 1', playerColor: 'w', question: 'How is the position?',
        source: { kind: 'saved-stockfish-analysis', depth: 16, preferredLineId: 'L1' }, continuations: [{ id: 'L1', moves: ['h8g8'] }],
        evaluations: [{ lineId: 'L1', perspective: 'root-side-to-move', score: { kind: 'cp', value: 125 } }] });
    assert.match(input.evidence, /centipawns from White -125, from player -125/);
    assert.match(input.evidence, /recorded depth 16/);
    assert.match(input.evidence, /Recorded Black search preference/);
    assert.ok(!input.evidence.includes('Best Move'));
    assert.throws(() => coachingInput({ ...args, evaluations: [{ lineId: 'L1', score: { kind: 'cp', value: 5 } }] }), /distinct supplied|authenticated source/);
    assert.throws(() => coachingInput({ ...args, source: { kind: 'legal-analysis-only', preferredLineId: 'L1' } }), /search preference/);
});

test('Lc0 searched values and Maia human likelihood stay distinct and require actual source metadata', () => {
    const base = { ...args, source: { kind: 'qualified-lc0-analysis', searchId: 'checked-search' },
        continuations: [{ id: 'L1', moves: ['f3g4'] }] };
    const input = coachingInput({ ...base, evaluations: [{ lineId: 'L1', perspective: 'root-side-to-move', search: { q: 0.2, draw: 0.3, visits: 100 } }] });
    assert.match(input.evidence, /not calibrated confidence or human move likelihood/);
    assert.throws(() => coachingInput({ ...base, evaluations: [{ lineId: 'L1', perspective: 'root-side-to-move', search: { q: 0.2, draw: 0.3, visits: 0 } }] }), /visited candidate/);
    assert.throws(() => coachingInput({ ...base, maia: { result: { policy: {} } } }), /model hash/);
    assert.throws(() => coachingInput({ ...base, evaluations: [{ lineId: 'L1', perspective: 'player', score: { kind: 'cp', value: 0 } }] }), /root perspective/);
});

test('new conversational prompt does not force board advice or citations onto greetings', () => {
    const input = coachingInput({ ...args, question: "What's your name?", conversation: [{ player: 'Hi.', pena: 'Hello.' }] });
    assert.match(input.messages[0].content, /need no board advice or chess citation/);
    assert.match(input.messages[0].content, /as few natural sentences/);
    assert.deepEqual(input.messages.map(message => message.role), ['system', 'user', 'assistant', 'user']);
    assert.ok(adapterInput({ ...args, referenceMode: true }).messages[0].content.includes('Write two to four'));
});

test('longer legal evidence is opt-in and bounded rather than silently extending the historical contract', () => {
    const input = coachingInput({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', playerColor: 'w', question: 'Show the line.', maxPlies: 6,
        continuations: [{ id: 'L1', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'] }] });
    assert.equal(input.lines[0].frameIds.length, 6);
    assert.match(input.evidence, /White Bb5, Black a6/);
    assert.throws(() => adapterInput({ ...args, referenceMode: true, continuations: [{ id: 'L1', moves: ['f3g4', 'a8b8', 'h1g2', 'b8c8'] }] }), /ply budget/);
    assert.throws(() => coachingInput({ ...args, maxPlies: 7 }), /Invalid/);
});

test('compact ply blocks retain every selected fact, including both moved-piece attacks and defenses', () => {
    const input = coachingInput({ fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        playerColor: 'w', question: 'What does Nf3 do?', continuations: [{ id: 'L1', moves: ['g1f3'] }] });
    const effects = input.references.filter(ref => ref.kind === 'effects');
    assert.equal(effects.flatMap(ref => ref.data).length, input.facts.length);
    assert.match(effects[0].text, /newly attacks Black pawn on e5/);
    assert.match(effects[0].text, /White knight on f3 newly defends[^;]*White pawn on h2/);
    assert.ok(input.facts.every(fact => effects.some(ref => ref.id === fact.referenceId && ref.data.some(item => item.id === fact.id))));
});

test('a complete Maia policy is labelled as human choice, not engine preference or win probability', () => {
    const legal = coachingInput(args).frames.find(frame => frame.id === 'root').spatial.legalMoves;
    const policy = Object.fromEntries(legal.map(move => [move.uci, 1 / legal.length]));
    const input = coachingInput({ ...args, maia: { modelSha256: 'a'.repeat(64), eloSelf: 1400, eloOpponent: 1600, result: { policy } } });
    assert.equal(input.human.length, 2);
    assert.match(input.evidence, /self\/opponent Elo 1400\/1600/);
    assert.match(input.evidence, /NOT move quality, winning probability/);
    assert.ok(!input.source.preferredLineId);
    assert.throws(() => coachingInput({ ...args, maia: { modelSha256: 'a'.repeat(64), eloSelf: 1400, eloOpponent: 1600,
        result: { policy: { [legal[0].uci]: 1 } } } }), /exactly the current legal moves/);
});
