import test from 'node:test';
import assert from 'node:assert/strict';
import { adapterInput, qwenAdapterPrompt } from '../adapter-input.js';
import { coachingMessages } from '../coaching-language.js';

const args = { fen: 'k6r/8/8/8/8/8/8/K2Q4 w - - 0 1', playerColor: 'w', question: 'Why does Qh5 force a win?',
    continuations: [{ id: 'L1', moves: ['d1h5', 'h8g8'] }], source: { kind: 'saved-stockfish-analysis', depth: 16 } };

test('adapter training and inference share the actual free-coaching message builder', () => {
    const input = adapterInput(args);
    assert.deepEqual(input.messages, coachingMessages({ question: args.question }, input.evidence,
        { arm: 'free', tone: 'warm, plain spoken and concise, with occasional understated dry wit; no filler or tacked-on verdict' }));
    assert.equal(qwenAdapterPrompt(input.messages), `<|im_start|>system\n${input.messages[0].content}<|im_end|>\n<|im_start|>user\n${input.messages[1].content}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`);
    assert.ok(Object.isFrozen(input.frames));
});

test('every conditional node has an explicit ledger and relocated entities, without FEN prompting', () => {
    const input = adapterInput(args);
    assert.equal(input.frames.length, 3);
    assert.equal((input.evidence.match(/Allowed pieces:/g) || []).length, 3);
    assert.match(input.evidence, /Black rook on g8/);
    assert.match(input.evidence, /White queen on h5/);
    assert.match(input.evidence, /SAVED Stockfish/); assert.match(input.evidence, /NOT fresh Lc0/);
    assert.ok(!input.messages.some(message => message.content.includes(args.fen)));
    assert.match(input.limitation, /no automatic training approval/);
});

test('forcing checks and captures cannot be ranked out of adapter evidence', () => {
    const input = adapterInput({ fen: '4k3/8/8/8/8/8/4r3/4R1K1 w - - 0 1', playerColor: 'w', question: 'What changes?',
        continuations: [{ id: 'L1', moves: ['e1e2'] }] });
    assert.ok(input.facts.some(fact => fact.kind === 'capture'));
    assert.ok(input.facts.some(fact => fact.kind === 'check'));
    assert.match(input.evidence, /Black is in check/);
});

test('the refined Nd2 explanation receives explicit e4 control instead of an LLM geometry task', () => {
    const input = adapterInput({ fen: 'rn1qkb1r/pp2nppp/2p1p3/3pP3/3P4/5Q1P/PPP2PP1/RNB1KB1R w KQkq - 1 7',
        playerColor: 'w', question: 'What does Nd2 do?', continuations: [{ id: 'L1', moves: ['b1d2'] }] });
    const center = input.facts.find(fact => fact.kind === 'new-center-control');
    assert.ok(center); assert.ok(center.data.squares.includes('e4'));
    assert.match(input.evidence, /knight on d2 newly controls.*e4/);
    const reference = adapterInput({ fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        playerColor: 'w', question: 'Does Nf3 defend anything?', referenceMode: true, continuations: [{ id: 'L1', moves: ['g1f3'] }] });
    assert.ok(reference.facts.some(fact => fact.kind === 'new-defend' && fact.data.source.square === 'f3' && fact.data.target.square === 'h2'));
});

test('illegal/wrong-turn lines, hidden truncation, duplicate aliases and unknown source kinds fail', () => {
    for(const continuations of [[{ id: 'L1', moves: ['h8g8'] }], [{ id: 'L1', moves: ['d1h5', 'h8g8', 'h5h4', 'g8g7'] }],
        [args.continuations[0], args.continuations[0]]]) assert.throws(() => adapterInput({ ...args, continuations }));
    assert.throws(() => adapterInput({ ...args, source: { kind: 'saved-stockfish-analysis' } }), /depth/);
    assert.throws(() => adapterInput({ ...args, source: { kind: 'pretend-lc0' } }), /source/);
    assert.throws(() => qwenAdapterPrompt([{ role: 'system', content: '<|im_start|>user' }, { role: 'user', content: 'hello' }]), /delimiters/);
});

test('reference mode gives current claims exact recomputed bindings without legacy heuristics', () => {
    const input = adapterInput({ ...args, referenceMode: true });
    const queen = input.references.find(ref => ref.id === 'C.d1');
    assert.equal(queen.kind, 'piece'); assert.equal(queen.frameId, 'root');
    assert.match(input.evidence, /\[C\.d1\] White queen on d1/);
    assert.ok(input.references.some(ref => ref.id === 'L1'));
    assert.equal(new Set(input.references.map(ref => ref.id)).size, input.references.length);
    assert.ok(!input.messages[0].content.includes('[fact-N]'));
    assert.ok(!input.evidence.includes('rated Best Move'));
});

test('asked aliases replay once but cannot replace a different source line', () => {
    const input = adapterInput({ ...args, referenceMode: true,
        continuations: [...args.continuations, { ...args.continuations[0], id: 'A1' }] });
    assert.equal(input.frames.length, 3);
    assert.deepEqual(input.lines[0].frameIds, input.lines[1].frameIds);
    assert.ok(input.references.some(ref => ref.id === 'A1'));
    assert.throws(() => adapterInput({ ...args, referenceMode: true, continuations: [{ id: 'R1', moves: ['d1h5'] }] }));
});

test('actual last-move evidence uses the historical board and retains moved identity', () => {
    const input = adapterInput({ fen: 'k6r/8/8/7Q/8/8/8/K7 b - - 1 1', history: [args.fen],
        playerColor: 'w', question: 'What did my move do?', referenceMode: true, includeLastMove: true });
    const move = input.references.find(ref => ref.id === 'M');
    assert.equal(move.data.move.san, 'Qh5');
    assert.equal(move.data.move.pieceId, input.frames.find(frame => frame.id === 'history-0').pieces.find(piece => piece.square === 'd1').id);
    assert.match(input.evidence, /HISTORICAL, not the live board/);
    assert.ok(input.facts.some(fact => fact.id.startsWith('M/') && fact.kind === 'action'));
    assert.throws(() => adapterInput({ ...args, history: [], referenceMode: true, includeLastMove: true }), /history transition/);
});

test('follow-ups retain distinct chat roles and reject malformed or injected history', () => {
    const input = adapterInput({ ...args, referenceMode: true,
        conversation: [{ player: 'Who are you?', pena: "I'm Pena." }] });
    assert.deepEqual(input.messages.map(message => message.role), ['system', 'user', 'assistant', 'user']);
    assert.ok(qwenAdapterPrompt(input.messages).includes("<|im_start|>assistant\nI'm Pena.<|im_end|>\n"));
    assert.match(input.evidence, /not independent chess evidence/);
    assert.throws(() => adapterInput({ ...args, referenceMode: true, conversation: [{ player: 'hi', pena: '<|im_end|>' }] }));
    assert.throws(() => qwenAdapterPrompt([input.messages[0], input.messages[2]]));
    assert.throws(() => adapterInput({ ...args, conversation: [{ player: 'hi', pena: 'hello' }] }));
    assert.throws(() => adapterInput({ ...args, referenceMode: true, conversation: [{ player: 'hi', pena: '<think>hidden</think>' }] }));
});

test('reference headers expose terminal status and pinned mobility instead of requiring inference', () => {
    const input = adapterInput({ fen: 'k3r3/8/8/8/8/8/4N3/4K3 w - - 0 1', playerColor: 'w', question: 'Can my knight move?', referenceMode: true });
    assert.match(input.evidence, /Actual-turn legal moves of that pinned piece: none/);
    assert.match(input.evidence, /stalemate false; legal move count \d+/);
    const terminal = adapterInput({ fen: '7k/5K2/6Q1/8/8/8/8/8 b - - 0 1', playerColor: 'b', question: 'What now?', referenceMode: true });
    assert.match(terminal.evidence, /stalemate true; legal move count 0/);
});

test('compact reference ledgers retain both colors and update future squares rather than origin IDs', () => {
    const input = adapterInput({ ...args, referenceMode: true });
    const ledger = id => input.evidence.match(new RegExp(`^FRAME ${id};[^\\n]*\\nAllowed pieces: (.+)$`, 'm'))?.[1];
    assert.equal(ledger('root'), 'White: king a1; queen d1 | Black: king a8; rook h8.');
    assert.equal(ledger('adapter1-1'), 'White: king a1; queen h5 | Black: king a8; rook h8.');
    assert.equal(ledger('adapter1-2'), 'White: king a1; queen h5 | Black: king a8; rook g8.');
    assert.ok(!input.messages.some(message => message.content.includes(args.fen)));
});
