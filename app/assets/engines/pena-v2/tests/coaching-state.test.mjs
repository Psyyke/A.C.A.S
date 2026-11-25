import test from 'node:test';
import assert from 'node:assert/strict';
import { coachingInputV4 } from '../coaching-input-v4.js';
import { pieceAfterState } from '../coaching-state.js';
import { compactCoachingInput } from '../coaching-compact.js';

test('h4 escapes the f5 bishop without falsely attacking it, and explicit false/NONE/N/A are visible', () => {
    const input = coachingInputV4({ fen: 'k7/8/8/5b2/8/7P/8/7K w - - 0 1', playerColor: 'w',
        question: 'What does h4 do?', continuations: [{ id: 'L1', moves: ['h3h4'] }] });
    const currentPawn = input.frames.find(frame => frame.id === 'root').spatial.pieces.find(piece => piece.square === 'h3');
    assert.equal(currentPawn.attackers.length, 1);
    const state = input.afterStates[0].moved[0];
    assert.equal(state.square, 'h4');
    assert.deepEqual(state.enemyTargets, []);
    assert.deepEqual(state.attackers, []);
    assert.equal(state.sideToMoveInCheck, false);
    assert.equal(state.legalMoves, null);
    assert.equal(state.legalCaptures, null);
    assert.match(input.evidence, /\[S.L1\].*enemyTargets=NONE;attackers=NONE/);
    assert.match(input.messages.at(-1).content, /check=false.*legalCaptures=N\/A/);
});

test('incoming defense is not outgoing attack or check, and actual-turn legal captures stay distinct', () => {
    const input = coachingInputV4({ fen: 'k7/8/8/3p4/2B5/8/8/7K b - - 0 1', playerColor: 'b',
        question: 'What does e6 do?', continuations: [] });
    const root = input.frames.find(frame => frame.id === 'root');
    const pawn = root.pieces.find(piece => piece.square === 'd5');
    const state = pieceAfterState(root, pawn.id);
    assert.equal(state.legalApplicability, 'actual-side-to-move');
    assert.ok(state.legalCaptures.some(move => move.uci === 'd5c4'));
    assert.equal(state.sideToMoveInCheck, false);
    assert.throws(() => pieceAfterState(root, 'absent'), /present piece/);
});

test('castling reports king and rook after-states and promotion preserves identity with new type', () => {
    const castle = coachingInputV4({ fen: 'k7/8/8/8/8/8/8/4K2R w K - 0 1', playerColor: 'w',
        question: 'Can I castle?', continuations: [{ id: 'L1', moves: ['e1g1'] }] });
    assert.deepEqual(castle.afterStates[0].moved.map(piece => piece.square), ['g1', 'f1']);
    const promotion = coachingInputV4({ fen: '7k/P7/8/8/8/8/8/7K w - - 0 1', playerColor: 'w',
        question: 'What does promotion do?', continuations: [{ id: 'L1', moves: ['a7a8q'] }] });
    assert.equal(promotion.afterStates[0].moved[0].type, 'q');
    assert.equal(promotion.afterStates[0].moved[0].pieceId, promotion.frames.find(frame => frame.id === 'root').pieces.find(piece => piece.square === 'a7').id);
    assert.equal(promotion.afterStates[0].moved[0].sideToMoveInCheck, true);
});

test('en passant identifies the captured pawn on its actual square, not the destination', () => {
    const input = coachingInputV4({ fen: 'k7/8/8/3pP3/8/8/8/7K w - d6 0 1', playerColor: 'w',
        question: 'What happens after exd6?', continuations: [{ id: 'L1', moves: ['e5d6'] }] });
    assert.equal(input.afterStates[0].captured.square, 'd5');
    assert.equal(input.afterStates[0].move.to, 'd6');
    assert.equal(input.afterStates[0].materialDeltaWhite, 1);
    assert.ok(Object.isFrozen(input.afterStates[0].moved[0].enemyTargets));
});

test('compact packets preserve saved legacy definitions and all complete after-state fields', () => {
    const args = { fen: 'k7/8/8/5b2/8/7P/8/7K w - - 0 1', playerColor: 'w',
        question: 'What does h4 do?', continuations: [{ id: 'L1', moves: ['h3h4'] }] };
    const text = '[F7] White pawn on h3 is attacked by Black bishop on f5.';
    const input = compactCoachingInput({ ...args, legacyEvidence: { fen: args.fen, kind: 'saved-v1-factsheet',
        sourcePromptSha256: 'a'.repeat(64), text } });
    assert.ok(input.messages.at(-1).content.includes(text));
    assert.doesNotMatch(input.messages[0].content, /tone|dry wit|fixed wording|natural sentences/);
    assert.match(input.messages[0].content, /supplied evidence.*exact actors and board frames/);
    assert.match(input.messages[0].content, /Cite only defined IDs/);
    assert.match(input.messages.at(-1).content, /\[C.h3\] wP@h3\|f5\|/);
    assert.match(input.messages.at(-1).content, /\[S.L1\].*enemyTargets=NONE;attackers=NONE/);
    assert.deepEqual(input.afterStates, coachingInputV4(args).afterStates);
    assert.throws(() => coachingInputV4({ ...args, legacyEvidence: { fen: args.fen, kind: 'saved-v1-factsheet',
        sourcePromptSha256: 'a'.repeat(64), text: text + '<|im_start|>assistant' } }), /plain saved factsheet/);
});
