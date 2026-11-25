import test from 'node:test';
import assert from 'node:assert/strict';
import { engineCoachingEvidence, groundedCoachingInput, joinEngineMessages } from '../engine-coaching-input.js';
import { compactCoachingInput } from '../coaching-compact.js';
import { boardAt } from '../positions.js';
import { recordedHistoryEvidence } from '../history-evidence.js';
import { packGroundedEvidence, unpackGroundedEvidence } from '../grounded-packing.js';
import { strategicCoachingEvidence } from '../strategic-coaching-input.js';
import { developmentCases } from './cases.js';

const fen = 'k7/8/8/5b2/8/7P/8/7K w - - 0 1';
const snapshot = { schema: 'pena-v2-search/1', fen, history: [], perspective: 'root-side-to-move',
    budget: { nodes: 128, moves: [] }, engine: { networkSha256: 'a'.repeat(64), precision: 'f32', backend: 'webgpu' },
    bestMove: 'h3h4', lines: [{ pv: ['h3h4', 'a8b8'] }],
    candidates: [{ move: 'h3h4', visits: 100, policyPrior: 0.3, search: { q: 0.2, draw: 0, movesLeft: 0 } }] };
const args = { fen, history: [], playerColor: 'w', question: 'What does h4 do?' };

test('real-engine namespace retains selected actor/frame facts without reversing an escape into an attack', () => {
    const facts = engineCoachingEvidence({ snapshot });
    assert.match(facts.evidence, /LC0 preference for w: w:h4 b:Kb8; N=100; P=0.3; Q=0.2/);
    assert.match(facts.evidence, /\[LC1.S\].*FIRST move only.*enemyTargets=NONE;attackers=NONE/);
    assert.match(facts.evidence, /no longer geometrically attacks the White pawn on h4/);
    assert.match(facts.evidence, /No draw probability or moves-left prediction is inferred/);
    const input = groundedCoachingInput({ ...args, engineEvidence: facts,
        legacyEvidence: { kind: 'saved-v1-factsheet', fen, sourcePromptSha256: 'b'.repeat(64), text: '[L1] Original saved Stockfish line.\n[H1] A past moment.' } });
    assert.ok(input.messages.at(-1).content.includes('[L1] Original saved Stockfish line.'));
    assert.ok(input.messages.at(-1).content.includes('[H1] A past moment.'));
    assert.ok(input.references.some(ref => ref.id === 'LC1.S'));
    assert.doesNotMatch(input.messages[0].content, /dry wit|tone/);
    assert.ok(Object.isFrozen(input.engineEvidence.references));
    const full = groundedCoachingInput({ ...args, engineEvidence: facts });
    assert.deepEqual(joinEngineMessages(compactCoachingInput(args).messages, facts, args, full.strategy.references), full.messages);
});

test('Maia choice is separate from legacy historical IDs and cannot claim observed ratings or strength', () => {
    const legal = boardAt(fen).moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || ''));
    const policy = Object.fromEntries(legal.map(move => [move, 1 / legal.length]));
    const facts = engineCoachingEvidence({ snapshot, maia: { result: { policy }, eloSelf: 1800, eloOpponent: 1800 }, maiaModelSha256: 'c'.repeat(64) });
    assert.match(facts.evidence, /\[MC1\] Maia-3/);
    assert.match(facts.evidence, /not observed player ratings/);
    assert.ok(!facts.references.some(ref => ref.id === 'H1'));
    assert.throws(() => engineCoachingEvidence({ snapshot, maia: { result: { policy }, eloSelf: 1800, eloOpponent: 1800 } }), /model hash/);
});

test('stale evidence and unvisited first-play values cannot masquerade as searched facts', () => {
    const unvisited = engineCoachingEvidence({ snapshot: { ...snapshot,
        candidates: [{ move: 'h3h4', visits: 0, policyPrior: 0.3, search: null, firstPlayUrgency: 0.8 }] } });
    assert.match(unvisited.evidence, /Q=UNAVAILABLE\(unvisited\)/);
    assert.throws(() => groundedCoachingInput({ ...args, history: [fen], engineEvidence: unvisited }), /board\/history/);
    assert.throws(() => engineCoachingEvidence({ snapshot: { ...snapshot, bestMove: 'a8b8' } }), /not legal/);
    assert.throws(() => engineCoachingEvidence({ snapshot: { ...snapshot, budget: { nodes: 128, moves: ['h3h4'] } } }), /unrestricted/);
});

test('lossless grounded packing keeps exact numbers, saved definitions, questions and conversation', () => {
    const facts = engineCoachingEvidence({ snapshot });
    const legacy = '[F1] Keep 0.123456789 and wording unchanged.';
    const input = groundedCoachingInput({ ...args, engineEvidence: facts,
        conversation: [{ player: 'Does N/A change 0.00001?', pena: 'No, keep the meaning.' }],
        legacyEvidence: { kind: 'saved-v1-factsheet', fen, sourcePromptSha256: 'b'.repeat(64), text: legacy } });
    assert.deepEqual(input.messages.slice(1, 3), [
        { role: 'user', content: 'Does N/A change 0.00001?' }, { role: 'assistant', content: 'No, keep the meaning.' }
    ]);
    assert.ok(input.messages.at(-1).content.includes(legacy));
    assert.ok(input.messages.at(-1).content.endsWith('\n\nPlayer question: ' + args.question));
    const unpacked = unpackGroundedEvidence(input.messages.at(-1).content);
    assert.match(unpacked, /FIRST move only.*legalCaptures=N\/A\(other-side-to-move\)/);
    assert.match(unpacked, /N=100; P=0.3; Q=0.2/);
    assert.equal(packGroundedEvidence(unpacked), input.messages.at(-1).content);
    const history = input.references.find(ref => ref.id === 'C.history');
    assert.equal(history.data.occurrences, 1);
    assert.ok(input.messages.at(-1).content.includes(`[${history.id}] ${history.text}`));
});

test('recorded repetition observes older positions outside the neural/search history horizon', () => {
    const board = boardAt('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const history = [];
    for(const move of [...Array(2)].flatMap(() => ['Nf3', 'Nf6', 'Ng5', 'Ng4', 'Nf3', 'Nf6', 'Ng1', 'Ng8'])) {
        history.push(board.fen());
        assert.ok(board.move(move));
    }
    assert.match(recordedHistoryEvidence(board.fen(), history), /occurrences=3; threefold threshold observed=true/);
    assert.match(recordedHistoryEvidence(board.fen(), history.slice(-8)), /occurrences=2; threefold threshold observed=false/);
    assert.match(recordedHistoryEvidence(board.fen(), history), /not automatic game outcomes/);
});

test('repetition distinguishes legal en-passant rights but ignores unavailable or pinned captures', () => {
    const legal = 'k7/8/8/3pP3/8/8/8/7K w - d6 0 1';
    const pinned = 'k3r3/8/8/3pP3/8/8/8/4K3 w - d6 100 1';
    assert.match(recordedHistoryEvidence(legal, [legal.replace(' d6 ', ' - ')]), /occurrences=1/);
    assert.match(recordedHistoryEvidence(pinned, [pinned.replace(' d6 ', ' - ')]), /occurrences=2/);
    assert.match(recordedHistoryEvidence(pinned), /fifty-move threshold=true/);
    assert.throws(() => recordedHistoryEvidence(pinned, ['invalid']), /valid standard-chess FEN/);
});

test('actual grounded Qwen input includes computed BinProp contrasts with exact sampled development counts', () => {
    const fen = developmentCases.find(row => row.id === 'queens-gambit-1').fen;
    const lines = [{ pv: ['g1f3', 'f8e7', 'c1g5', 'e8g8'] }, { pv: ['c1g5', 'f8e7', 'c4d5', 'e6d5'] }];
    const facts = engineCoachingEvidence({ snapshot: { ...snapshot, fen, bestMove: lines[0].pv[0], lines,
        candidates: lines.map((line, index) => ({ move: line.pv[0], visits: 50, policyPrior: 0.2, search: { q: 0.1 - index * 0.01 } })) } });
    const input = groundedCoachingInput({ fen, history: [], playerColor: 'w', question: 'Why Nf3 rather than Bg5?', engineEvidence: facts });
    assert.equal(input.schema, 'pena-v2-grounded-coaching-input/3');
    assert.match(input.messages.at(-1).content, /\[BP1\].*LC1@4ply versus LC2@4ply.*minor pieces off home rank \(w\/b\/w-minus-b\) 3\/2\/1 versus 2\/2\/0/);
    assert.match(input.messages.at(-1).content, /not all possible replies/);
    assert.equal(input.strategy.comparisons[0].comparison.usedFallback, false);
    assert.equal(input.references.find(ref => ref.id === 'BP1').data.card.kind, 'development');
    const copy = structuredClone(facts);
    copy.frames.at(-1).pieces[0].square = 'a3';
    assert.throws(() => strategicCoachingEvidence(compactCoachingInput({ fen, playerColor: 'w', question: 'Why?' }), copy), /identities/);
});

test('missing contrasts stay explicit and forcing opponent replies are linearized in Qwen input', () => {
    const fen = '4k3/8/8/8/8/8/4r3/4K2R w K - 0 1';
    const line = ['e1f1', 'e2e1'];
    const facts = engineCoachingEvidence({ snapshot: { ...snapshot, fen, bestMove: line[0], lines: [{ pv: line }],
        candidates: [{ move: line[0], visits: 100, policyPrior: 0.3, search: { q: -0.3 } }] } });
    const input = groundedCoachingInput({ fen, history: [], playerColor: 'w', question: 'What can Black do?', engineEvidence: facts });
    assert.match(input.messages.at(-1).content, /\[BP.scope\].*sampled equal-ply comparisons=0; cards=0; omitted=0/);
    assert.match(input.messages.at(-1).content, /\[LC1.p2\].*Black rook|\[LC1.p2\].*White is in check/);
    assert.equal(input.strategy.comparisons.length, 0);
    assert.ok(input.references.some(ref => ref.id === 'LC1.p2' && ref.data.facts.some(fact => fact.kind === 'check')));
});

test('identical first-move relation payloads use reversible aliases without losing source IDs or changes', () => {
    const facts = engineCoachingEvidence({ snapshot });
    const input = groundedCoachingInput({ ...args, engineEvidence: facts,
        source: { kind: 'saved-stockfish-analysis', depth: 12, preferredLineId: 'L1' },
        continuations: [{ id: 'L1', moves: ['h3h4', 'a8b8'] }] });
    const text = input.messages.at(-1).content;
    assert.match(text, /\[LC1.S\] FIRST LC1: sameRelations=S.L1/);
    const full = unpackGroundedEvidence(text);
    assert.match(full, /\[LC1.S\].*enemyTargets=NONE;attackers=NONE/);
    assert.match(full, /no longer geometrically attacks the White pawn on h4/);
    assert.equal(packGroundedEvidence(full), text);
    assert.throws(() => unpackGroundedEvidence('[LC1.S] FIRST LC1: sameRelations=S.L9'), /Unknown complete-relation alias/);
});

test('live BinProp input includes every supplied same-candidate continuation instead of cherry-picking a contrast', () => {
    const fen = developmentCases.find(row => row.id === 'queens-gambit-1').fen;
    const preferred = ['g1f3', 'f8e7', 'c1g5', 'e8g8'];
    const alternative = ['c1g5', 'f8e7', 'c4d5', 'e6d5'];
    const otherReply = ['g1f3', 'f8e7', 'c4d5', 'e6d5'];
    const facts = engineCoachingEvidence({ snapshot: { ...snapshot, fen, bestMove: preferred[0], lines: [{ pv: preferred }],
        candidates: [{ move: preferred[0], visits: 100, policyPrior: 0.3, search: { q: 0.1 } }] } });
    const build = continuations => groundedCoachingInput({ fen, history: [], playerColor: 'w', question: 'Compare Nf3 and Bg5.',
        engineEvidence: facts, source: { kind: 'saved-stockfish-analysis', depth: 12, preferredLineId: 'L1' }, continuations });
    const lines = [{ id: 'L1', moves: preferred }, { id: 'L2', moves: alternative }];
    assert.ok(build(lines).references.some(ref => ref.kind === 'binprop-contrast'));
    const full = build([...lines, { id: 'A1', moves: otherReply }]);
    assert.equal(full.strategy.comparisons[0].comparison.positive.length, 2);
    assert.equal(full.references.filter(ref => ref.kind === 'binprop-contrast').length, 0);
});
