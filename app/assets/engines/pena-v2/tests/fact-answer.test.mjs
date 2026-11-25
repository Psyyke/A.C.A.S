import test from 'node:test';
import assert from 'node:assert/strict';
import { developmentCases } from './cases.js';
import { createFactContext, resolveFactQuestion, compileFactAnswer, renderFactAnswer, defaultFactSelection, packFactAnswer } from '../fact-answer.js';

const start = developmentCases[0].fen;
const pinCase = developmentCases.find(item => item.id === 'pin-black-2');
const context = (fen = start, options = {}) => createFactContext({ gameId: 'test-game', revision: 7, fen, ...options });
const query = (context, question, options) => compileFactAnswer(context, resolveFactQuestion(context, question, options));
const data = (answer, predicate) => answer.cards.filter(card => card.predicate === predicate).map(card => card.data);
const pieceAt = (ctx, square, frameId = 'root') => ctx.frames.find(frame => frame.id === frameId).pieces.find(piece => piece.square === square);

test('the observed c3/f3 failure becomes two independently bound answers, never mixed mobility', () => {
    const ctx = context(pinCase.fen, { history: pinCase.history, playerColor: 'w' });
    const answer = query(ctx, pinCase.question);
    assert.equal(answer.status, 'ambiguous');
    const mobility = data(answer, 'mobility');
    assert.deepEqual(mobility.map(item => item.pieceId), ['wn@b1', 'wn@g1']);
    assert.deepEqual(mobility[0].moves, []);
    assert.ok(mobility[1].moves.some(move => move.from === 'f3' && move.to === 'e5'));
    assert.ok(mobility[1].moves.every(move => move.from === 'f3'));
    const pinned = query(ctx, 'Which of my knights is pinned?');
    assert.equal(pinned.status, 'answerable');
    assert.deepEqual(data(pinned, 'pins').map(item => item.pins.map(pin => pin.pinType)), [['absolute'], ['relative']]);
    const delivered = renderFactAnswer(ctx, answer);
    assert.match(delivered.text, /ambiguous/);
    assert.match(delivered.text, /knight on c3 has no legal move/);
    assert.match(delivered.text, /knight on f3 has 5 legal moves/);
    assert.equal(delivered.segments, delivered.speechSegments);
});

test('singular piece references keep ambiguity; ownership and explicit squares take precedence', () => {
    const ctx = context(pinCase.fen, { playerColor: 'w' });
    assert.equal(query(ctx, 'Can my knight move?').status, 'ambiguous');
    const exact = query(ctx, 'Can my knight on c3 move?');
    assert.equal(exact.status, 'answerable');
    assert.deepEqual(data(exact, 'mobility')[0].moves, []);
    assert.equal(query(ctx, 'Where is the black king?').cards[0].data.piece.color, 'b');
    assert.equal(query(context(pinCase.fen), 'Can my knight move?').status, 'unavailable');
    assert.equal(query(ctx, 'Is my knight hanging?').status, 'unavailable');
    assert.equal(query(ctx, 'What is the best plan?').status, 'unavailable');
});

test('focus is explicit, game/revision/frame-scoped, and other excludes the actual bound entity', () => {
    const ctx = context(pinCase.fen, { playerColor: 'w' });
    const focus = { gameId: ctx.gameId, revision: ctx.revision, frameId: 'root', pieceId: pieceAt(ctx, 'c3').id };
    assert.equal(data(query(ctx, 'Can it move?', { focus }), 'mobility')[0].pieceId, focus.pieceId);
    assert.equal(data(query(ctx, 'Can my other knight move?', { focus }), 'mobility')[0].pieceId, pieceAt(ctx, 'f3').id);
    assert.equal(data(query(ctx, 'Can it move?'), 'unavailable')[0].reason, 'missing-focus');
    for(const patch of [{ revision: 6 }, { gameId: 'another-game' }, { frameId: 'history-0' }, { pieceId: 'missing' }])
        assert.equal(data(query(ctx, 'Can it move?', { focus: { ...focus, ...patch } }), 'unavailable')[0].reason, 'stale-focus');
});

test('bounded conversational wording binds demonstratives, other one and imperfect English without guessing', () => {
    const ctx = context(pinCase.fen, { playerColor: 'w' });
    const focus = { gameId: ctx.gameId, revision: ctx.revision, frameId: 'root', pieceId: pieceAt(ctx, 'c3').id };
    for(const question of ['Can that knight move?', 'Why can\'t it move?', 'why it cant move', 'my knigth c3 cannot move?']) {
        const answer = query(ctx, question, { focus });
        assert.equal(answer.status, 'answerable', question);
        assert.equal(data(answer, 'mobility')[0].pieceId, focus.pieceId, question);
        assert.deepEqual(data(answer, 'mobility')[0].moves, []);
    }
    assert.equal(data(query(ctx, 'Can the other one move?', { focus }), 'mobility')[0].pieceId, pieceAt(ctx, 'f3').id);
    assert.equal(query(ctx, 'Can that knight move?').cards[0].data.reason, 'missing-focus');
    assert.equal(query(ctx, 'Can that rook move?', { focus }).cards[0].data.reason, 'missing-focus');
    assert.equal(query(ctx, 'Can my knight on f3 move?', { focus }).cards[0].data.pieceId, pieceAt(ctx, 'f3').id);
    assert.equal(query(ctx, 'Why should it move?', { focus }).status, 'unavailable');
    assert.equal(query(ctx, 'Can my knight on c3 move to e5?').query.uci, 'c3e5');
    assert.equal(query(ctx, 'Can it go to e5?', { focus }).query.uci, 'c3e5');
    assert.equal(query(ctx, 'Can that knight move to e5?', { focus }).cards[0].data.legal, false);
    assert.equal(query(ctx, 'Can my knight go to e5?', { focus }).status, 'unavailable');
    assert.equal(query(ctx, 'Can my knight on f3 move to z9?').status, 'unavailable');
    assert.equal(query(ctx, 'Can my knight on c3 move to e5 or d5?').status, 'unavailable');
    for(const question of ['Where was my knight before the last move?', 'Would my knight on f3 move?', 'Can it move if I trade?',
        'Is c3e5 legal for my rook?', 'Can it play f3e5?', 'Can my knight on c3 play f3e5?', 'Can c3e5 f3e5 be played?'])
        assert.equal(query(ctx, question, { focus }).status, 'unavailable', question);
});

test('uncertain or malformed coordinates cannot disappear and become an apparently definite piece answer', () => {
    const ctx = context('4k3/8/8/8/8/8/5N2/4K3 w - - 0 1', { playerColor: 'w' });
    for(const question of ['Where is my knight on f9?', 'Is my knight on i2 defended?', 'Can my knight on a10 move?',
        'Is f2z9 legal?', 'Can my knight on f2 go to z9?'])
        assert.equal(query(ctx, question).status, 'unavailable', question);
    assert.equal(query(ctx, 'Where is my knight on f2?').status, 'answerable');
    assert.equal(query(ctx, 'Is f2h3 legal?').cards[0].data.legal, true);
});

test('absent pieces and empty controlled squares never become invented captures', () => {
    const ctx = context('8/8/4p1p1/1k1p2P1/2bP1P2/2P5/pK2p3/R7 b - - 5 46',
        { branches: [{ id: 'bishop', moves: ['c4d3'] }] });
    const absent = compileFactAnswer(ctx, { intent: 'locate', frameId: 'bishop-1', subject: { type: 'p', color: 'w', square: 'c2' } });
    assert.equal(absent.status, 'absent');
    assert.equal(absent.cards[0].data.occupant, null);
    assert.match(renderFactAnswer(ctx, absent).text, /c2.*empty/);
    const controls = compileFactAnswer(ctx, { intent: 'controls', frameId: 'bishop-1', subject: { type: 'b', color: 'b', square: 'd3' } });
    assert.ok(controls.cards[0].data.squares.includes('c2'));
    assert.ok(!controls.cards[0].data.targets.some(piece => piece.square === 'c2'));
    const noCapture = compileFactAnswer(ctx, { intent: 'legal-move', frameId: 'bishop-1', uci: 'd3c2' });
    assert.equal(noCapture.cards[0].data.reason, 'other-side-to-move');
    const wrongType = compileFactAnswer(ctx, { intent: 'locate', subject: { type: 'n', square: 'c3' } });
    assert.equal(wrongType.status, 'absent');
    assert.equal(wrongType.cards[0].data.occupant.type, 'p');
});

test('blocker queries return the exact first occupant and do not substitute another rook', () => {
    const ctx = context(developmentCases.find(item => item.id === 'file-plan-3').fen, { playerColor: 'w' });
    const answer = compileFactAnswer(ctx, { intent: 'blockers', subject: { type: 'r', color: 'w' }, direction: 'north' });
    assert.equal(answer.cards[0].data.rays.length, 1);
    assert.deepEqual(answer.cards[0].data.rays[0].emptySquares, ['d2']);
    assert.equal(answer.cards[0].data.rays[0].firstBlocker.square, 'd3');
    assert.match(renderFactAnswer(ctx, answer).text, /White bishop on d3/);
    const bishop = compileFactAnswer(ctx, { intent: 'blockers', subject: { square: 'd3' }, direction: 'north' });
    assert.equal(bishop.cards[0].data.rays.length, 0);
    assert.equal(query(ctx, 'Which piece is stopping my rook?').status, 'answerable');
});

test('pinned geometric attacks, legal captures and absolute pin mobility remain distinct', () => {
    const ctx = context('k3r3/8/8/8/5p2/8/4N3/4K3 w - - 0 1');
    const control = compileFactAnswer(ctx, { intent: 'controls', subject: { square: 'e2' } });
    assert.ok(control.cards[0].data.squares.includes('f4'));
    const legal = compileFactAnswer(ctx, { intent: 'legal-move', uci: 'e2f4' });
    assert.equal(legal.cards[0].data.legal, false);
    assert.equal(legal.cards[0].data.reason, 'king-would-be-in-check');
    const slider = context('k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1');
    const pins = compileFactAnswer(slider, { intent: 'pins', subject: { square: 'e2' } });
    assert.equal(data(pins, 'pins')[0].pins[0].pinType, 'absolute');
    assert.ok(data(pins, 'mobility')[0].moves.some(move => move.uci === 'e2e8'));
    const black = context('4k3/4n3/8/5P2/8/8/8/K3R3 b - - 0 1', { playerColor: 'b' });
    assert.equal(query(black, 'Can my knight on e7 move?').cards[0].data.moves.length, 0);
    assert.ok(query(black, 'What does my knight on e7 control?').cards[0].data.squares.includes('f5'));
});

test('incoming relations are not reversed, and compound or unsupported premises are explicit', () => {
    const ctx = context(pinCase.fen, { playerColor: 'w' });
    const incoming = query(ctx, 'Which piece attacks my knight on c3?');
    assert.equal(incoming.query.intent, 'defense');
    assert.ok(incoming.cards[0].data.attackers.includes(pieceAt(ctx, 'a5').id));
    assert.equal(query(ctx, 'What does my knight on c3 attack?').query.intent, 'controls');
    for(const question of ['Is my rook in check?', 'Is my knight pinned or undefended?', 'Where is my king and my rook?', 'Does Kf2 defend my bishop?'])
        assert.equal(query(ctx, question).status, 'unavailable');
});

test('history and explicit enemy branches preserve exact actor, target, parent and scope', () => {
    const ctx = context('4k3/8/5n2/8/5B2/8/8/4K3 w - - 0 1', {
        branches: [{ id: 'reply', moves: ['e1f2', 'f6h5'] }, { id: 'idea', assumedTurn: 'b', moves: ['f6h5'] }]
    });
    for(const frameId of ['reply-2', 'idea-1']) {
        const answer = compileFactAnswer(ctx, { intent: 'controls', frameId, subject: { color: 'b', type: 'n' } });
        const result = renderFactAnswer(ctx, answer);
        assert.equal(answer.cards[0].data.targets.find(piece => piece.square === 'f4').type, 'b');
        assert.ok(result.segments.some(segment => segment.references.relations.some(relation => relation.from === 'h5' && relation.to === 'f4')));
        assert.equal(answer.scope.kind, frameId === 'reply-2' ? 'conditional' : 'hypothetical');
        assert.match(result.text, frameId === 'reply-2' ? /conditional line/ : /Not a legal pass/);
    }
    assert.equal(query(ctx, 'What changed after Nh5?').status, 'unavailable');
    const historic = context(pinCase.fen, { history: pinCase.history });
    const effect = query(historic, 'What changed after the last move?');
    assert.equal(effect.status, 'answerable');
    assert.equal(effect.cards[0].data.move.san, 'Bg4');
    assert.equal(effect.cards[0].segments[0].references.frameId, 'history-9');
    assert.equal(query(context(), 'What changed after the last move?').status, 'unavailable');
});

test('move cards bind both castle actors, en-passant victim and promotion identity/type', () => {
    for(const fixture of [
        { fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', uci: 'e1g1', moved: [['e1', 'g1'], ['h1', 'f1']] },
        { fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2', uci: 'e5d6', victim: 'd5' },
        { fen: '7k/P7/8/8/8/8/8/7K w - - 0 1', uci: 'a7a8n', promotion: 'n', delta: 2 }
    ]) {
        const ctx = context(fixture.fen, { branches: [{ id: 'move', moves: [fixture.uci] }] });
        const result = compileFactAnswer(ctx, { intent: 'move-effects', frameId: 'move-1' });
        const mechanism = result.cards[0].data.mechanism;
        if(fixture.moved) assert.deepEqual(mechanism.moved.map(move => [move.from, move.to]), fixture.moved);
        if(fixture.victim) assert.equal(mechanism.captured.square, fixture.victim);
        if(fixture.promotion) {
            assert.equal(mechanism.moved[0].afterType, fixture.promotion);
            assert.equal(mechanism.materialDeltaWhite, fixture.delta);
            assert.equal(mechanism.moved[0].pieceId, 'wp@a7');
        }
        assert.doesNotThrow(() => renderFactAnswer(ctx, result));
    }
});

test('context differences do not imply a continuation or forced result; status does not infer draws', () => {
    const ctx = context(start, { branches: [{ id: 'a', moves: ['e2e4'] }, { id: 'b', moves: ['d2d4'] }] });
    const answer = compileFactAnswer(ctx, { intent: 'compare-frames', frameId: 'a-1', otherFrameId: 'b-1' });
    assert.equal(answer.cards[0].data.changes.length, 2);
    assert.match(renderFactAnswer(ctx, answer).text, /does not assert.*legal move/);
    for(const [fen, key] of [['7k/6Q1/5K2/8/8/8/8/8 b - - 0 1', 'checkmate'], ['7k/5K2/6Q1/8/8/8/8/8 b - - 0 1', 'stalemate']]) {
        const terminal = context(fen);
        const result = compileFactAnswer(terminal, { intent: 'status' });
        assert.equal(result.cards[0].data[key], true);
        assert.equal(result.cards[0].data.drawRules, 'not-assessed');
    }
    const king = context('8/8/8/4k3/8/4K3/8/8 w - - 0 1');
    assert.match(renderFactAnswer(king, query(king, 'What is opposition here?')).text, /does not establish zugzwang/);
});

test('atomic packets cannot drop mobility, swap subjects, alter facts or sneak uncited prose into delivery', () => {
    const ctx = context(pinCase.fen, { playerColor: 'w' });
    const answer = query(ctx, 'Is my knight pinned?');
    const selected = defaultFactSelection(answer);
    assert.doesNotThrow(() => renderFactAnswer(ctx, answer, { ...selected, cardIds: [...selected.cardIds].reverse() }));
    for(const mutation of [
        { ...selected, cardIds: [] }, { ...selected, cardIds: selected.cardIds.slice(1) },
        { ...selected, cardIds: selected.cardIds.map(() => selected.cardIds[0]) },
        { ...selected, cardIds: selected.cardIds.map((id, i) => i ? id : 'invented') },
        { ...selected, text: 'The knight can move to e5.' }, { ...selected, revision: 6 }, { ...selected, frameId: 'wrong' }
    ]) assert.throws(() => renderFactAnswer(ctx, answer, mutation));
    const mutate = fn => { const copy = structuredClone(answer); fn(copy); assert.throws(() => renderFactAnswer(ctx, copy)); };
    mutate(copy => { copy.cards[0].data.pieceId = 'wn@other'; });
    mutate(copy => { copy.cards[0].data.moves.push({ from: 'c3', to: 'e5' }); });
    mutate(copy => { copy.cards[1].data.pins[0].pinType = 'relative'; });
    mutate(copy => { copy.cards[0].segments[0].text = 'This knight can move to e5.'; });
    mutate(copy => { copy.cards[0].segments[0].references.frameId = 'other'; });
    mutate(copy => { copy.cards[0].segments[0].anchors[0].references.squares = ['f3']; });
    mutate(copy => { copy.requiredCardIds.pop(); });
    assert.throws(() => renderFactAnswer(context(pinCase.fen, { revision: 8, playerColor: 'w' }), answer), /Stale/);
    assert.throws(() => compileFactAnswer({ ...ctx }, { intent: 'material' }), /verified/);
    const full = packFactAnswer(ctx, answer, { tokenCount: text => text.length, maxTokens: 100000 });
    assert.deepEqual(JSON.parse(full), answer);
    assert.ok(!full.includes(pinCase.fen));
    assert.throws(() => packFactAnswer(ctx, answer, { tokenCount: text => text.length, maxTokens: 20 }), /complete.*exceeds/);
    assert.throws(() => packFactAnswer(ctx, answer, { tokenCount: () => NaN, maxTokens: 100 }), /token count/);
});

test('irrelevant branches, renamed branch IDs and question paraphrases do not change root factual answers', () => {
    const a = context(pinCase.fen, { playerColor: 'w' });
    const b = context(pinCase.fen, { playerColor: 'w', branches: [{ id: 'renamed', moves: ['h2h3'] }] });
    const expected = query(a, 'Can my knight on c3 move?');
    for(const question of ['Can my knight on c3 move?', 'My knight on c3 unable move?', 'Which moves for my knight on c3?',
        'Where can my knight on c3 go?', 'What destinations can my knight on c3 reach?']) {
        const actual = query(b, question);
        assert.deepEqual(actual.cards, expected.cards);
        assert.equal(actual.status, expected.status);
    }
    const movedBlocker = context('4r1k1/pp3ppp/2p5/3p4/3Pn3/2P1B3/P3BPPP/3R2K1 w - - 0 22', { playerColor: 'w' });
    const blocker = compileFactAnswer(movedBlocker, { intent: 'blockers', subject: { square: 'd1' }, direction: 'north' });
    assert.equal(blocker.cards[0].data.rays[0].firstBlocker.square, 'd4');
});

test('contract rejects malformed queries and structurally impossible board inputs rather than guessing', () => {
    const ctx = context();
    for(const q of [{ intent: 'material', subject: {} }, { intent: 'material', invented: true },
        { intent: 'locate', subject: {} }, { intent: 'mobility', subject: { square: 'z9' } },
        { intent: 'legal-move', uci: 'Nf3' }, { intent: 'material', frameId: 'missing' },
        { intent: 'unavailable', reason: 'whatever' }, { intent: 'compare-frames', otherFrameId: 'missing' },
        { intent: 'locate', subject: { type: 'constructor' } }, { intent: 'blockers', subject: { square: 'a1' }, direction: 'constructor' }])
        assert.throws(() => compileFactAnswer(ctx, q));
    for(const fen of ['4k3/4R3/8/8/8/8/8/4K3 w - - 0 1', '4k3/8/8/8/8/8/8/P3K3 w - - 0 1',
        '4k3/8/8/8/8/8/8/4K3 w K - 0 1', '4k3/8/8/8/8/8/8/4K3 w - d6 0 1']) {
        assert.throws(() => context(fen));
    }
    assert.throws(() => context('8/8/8/8/8/8/4k3/4K3 w - - 0 1'), /king in check/);
    assert.throws(() => context(start, { branches: [{ id: 'x', moves: ['e2e5'] }] }), /Illegal move/);
    assert.throws(() => context(start, { branches: [{ moves: ['e2e4'] }] }), /IDs/);
    assert.throws(() => context(pinCase.fen, { historyComplete: true }), /initial position/);
    assert.equal(context(start, { historyComplete: true }).historyComplete, true);
});
