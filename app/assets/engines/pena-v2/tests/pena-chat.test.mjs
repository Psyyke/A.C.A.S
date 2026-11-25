import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess, SQUARES } from '../../libraries/chessjs/chess.js';
import { Facts } from '../concepts.js';
import { factSheet, citations, numberedLine, sanLine } from '../factsheet.js';
import { glossary, glossaryTerms, glossaryMentions, demo, hasDemo } from '../glossary.js';
import { PenaConversation, chatSheet, checkReply, displayText, citationSteps, chatPhrases, conceptVisuals, pastAlternative } from '../conversation.js';
import { gradeGame, boardResult, timelineNotes, timelineChain, pastTopic } from '../timeline.js';
import { testDefences } from '../defence.js';
import { boardMisread } from '../questions.js';
import { withoutLines, isRepeatAsk } from '../chat.js';
import { personalNotes, timeNote } from '../memory.js';
import { checkSentence } from '../grounding.js';
import { assessChatReply, answerChat, repairChatPrompt } from '../chat-reply.js';

const squareSet = new Set(SQUARES);

test('Pena keeps player and coach names distinct and answers the clock without model guesses', () => {
    const items = [{ kind: 'name', key: 'name', fact: 'Their name is Hannu.', shown: 'Your name is Hannu.' }];
    const now = new Date(2026, 10, 14, 17, 52);
    assert.equal(personalNotes('What is my name?', { items }).reply, 'Your name is Hannu.');
    assert.equal(personalNotes("What's your name?", { items }).reply, "I'm Pena.");
    assert.equal(personalNotes('What is my name?', { enabled: false }).reply, null, 'the model answers, so a name in the system prompt works');
    const personal = personalNotes('What time is it', { items, now });
    assert.match(personal.reply, /17:52/);
    assert.doesNotMatch(personal.reply, /SQUARE|Play|Hannu/);
    assert.ok(personal.notes.P0);
    const record = { fen: new Chess().fen(), engine: { lines: [] } };
    const checked = assessChatReply(personal.reply, chatSheet(record, { personal }), { record, player: 'What time is it' });
    assert.match(checked.text, /17:52/);
    assert.deepEqual(checked.removed, []);
    assert.equal(personalNotes('What should I play?', { items, now }).reply, null);
});

test('Pena does not call the already-played Bxe5 illegal on the resulting board', async () => {
    const before = 'r2q1rk1/pbpnbppp/1p3n2/4p3/5B2/2PBPN2/PP1NQPPP/2R1K2R w K - 0 10';
    const board = new Chess(before);
    assert.ok(board.move('Bxe5'));
    const record = { fen: board.fen(), engine: { lines: [] },
        last: { fen: before, uci: 'f4e5', san: 'Bxe5', label: 'Mistake' } };
    const chat = new PenaConversation({ engine: {}, tokenCount: text => text.length / 4, context: 4000 });
    chat.follow(record.fen);
    chat.analyse = async () => record;
    const prepared = await chat.prepare('(played Bxe5)', { fen: record.fen, playerColor: 'w' });
    assert.doesNotMatch(prepared.sheet.text, /\[A\d\].*(?:not legal|can't|cannot)/i);
    const checked = assessChatReply("That was a mistake, Bxe5 isn't legal here. Black can answer with Nxe5 [M].",
        prepared.sheet, { record, player: '(played Bxe5)' });
    assert.doesNotMatch(checked.text, /isn't legal/);
    assert.match(checked.removed[0].reason, /verified legal move/);
    const retry = assessChatReply("Bxe5 isn't legal here.", prepared.sheet, { record, player: 'Can I play Bxe5 again?' });
    assert.match(retry.text, /isn't legal/, 'A repeat attempt is still judged on the current board');
});

test('Pena withholds leaked internal model tokens instead of displaying them as time or prose', () => {
    const record = { fen: new Chess().fen(), engine: { lines: [] } };
    const checked = assessChatReply('Saturday 14 November <SQUARE_10> <SQUARE_47>, 17:52. Hello.', chatSheet(record), { record });
    assert.doesNotMatch(checked.text, /SQUARE|17:52/);
    assert.match(checked.text, /Hello/);
    assert.match(checked.removed[0].reason, /Internal model tokens/);
});

test('chat checks claimed exchanges against captures, not the pieces named in a legal line', () => {
    const fen = 'r1bk1bnr/3pq1pp/3N1p2/p1p1P3/8/5N1P/PPPBQ1P1/R3KB1R w KQ a6 0 14';
    const board = new Chess(fen);
    const pv = ['Qb5', 'Qxd6', 'exd6', 'Bxd6'].map(san => { const move = board.move(san); return move.from + move.to; });
    const record = { fen, engine: { lines: [{ move: pv[0], pv, score: { cp: 1130, mate: null } }] } };
    const sheet = chatSheet(record, { playerColor: 'w' });
    const prefix = 'After Qb5 Qxd6 exd6 Bxd6, ';
    const bad = assessChatReply(prefix + "you've traded your knight for Black's queen and bishop [L1].", sheet, { record });
    assert.equal(bad.text, '');
    assert.match(bad.removed[0].reason, /material exchange/);
    for(const claim of ["Black has taken your knight and your queen", 'That costs you a knight and queen for a bishop', 'White has given up a knight for a pawn']) {
        const checked = assessChatReply(prefix + claim + ' [L1].', sheet, { record });
        assert.equal(checked.text, '', claim);
        assert.match(checked.removed[0].reason, /material exchange/);
    }
    const good = assessChatReply(prefix + "you've traded your knight and pawn for Black's queen [L1].", sheet, { record });
    assert.equal(good.removed.length, 0);
    assert.match(good.text, /queen/);
    assert.equal(assessChatReply('After Qxd6 exd6 Bxd6, Black has lost the queen [L1].', sheet, { record }).removed.length, 0);
    assert.match(assessChatReply('After Qb5 Qxd6 Bxd6, the exchanges are finished [L1].', sheet, { record }).removed[0].reason, /continuation/);
});

test('concrete replay checks future piece identities without treating a later plan as already played', () => {
    const fen = '2r2rk1/2q1R2p/pp3pp1/2p4n/2Pn4/1PQ3P1/PB3PBP/4R1K1 b - - 6 27';
    const prefix = 'After Qd8 Qe3 Rc7 Rxc7 Qxc7, ';
    assert.equal(checkSentence(prefix + 'the rook on c7 is active.', fen).status, 'contradicted');
    assert.notEqual(checkSentence(prefix + 'the queen on c7 is active.', fen).status, 'contradicted');
    assert.notEqual(checkSentence(prefix + 'you could eventually put the rook on d8.', fen).status, 'contradicted');
});

test('chat distinguishes player ownership from the side to move', () => {
    const fen = '4r1k1/pp3ppp/2p5/3p4/3Pn3/2PBB3/P4PPP/4R1K1 b - - 0 22';
    const record = { fen, engine: { lines: [] } };
    const sheet = chatSheet(record, { playerColor: 'w' });
    sheet.header += ' Black knight on e4.';
    assert.match(assessChatReply('Your knight on e4 is active.', sheet, { record }).removed[0].reason, /placement/);
    assert.equal(assessChatReply('Their knight on e4 is active.', sheet, { record }).removed.length, 0);
    const capture = { fen, engine: { lines: [{ move: 'e4c3', pv: ['e4c3'], score: { cp: 0, mate: null } }] } };
    const captureSheet = chatSheet(capture, { playerColor: 'w' });
    assert.equal(assessChatReply('After Nxc3, Black is removing your pawn on c3 [L1].', captureSheet, { record: capture }).removed.length, 0);
    assert.notEqual(checkSentence('White has a pawn chain with a2, b3 and c4.', new Chess().fen()).reason, 'The stated material inventory contradicts the board.');
});

test('a last-move alternative is checked on its previous board, not offered as a current move', () => {
    const before = 'rnbqkb1r/pp2pp1p/2pp1np1/8/2PPP3/2N5/PP3PPP/R1BQKBNR w KQkq - 0 5';
    const board = new Chess(before); board.move('Bd3');
    const line = new Chess(before);
    const pv = ['Be2', 'Bg7', 'Nf3', 'O-O', 'O-O'].map(san => { const move = line.move(san); return move.from + move.to; });
    const record = { fen: board.fen(), engine: { lines: [{ move: 'e7e5', pv: ['e7e5'], score: { cp: 50, mate: null } }] },
        last: { fen: before, uci: 'f1d3', bestUci: 'f1e2', pv, label: 'Neutral' } };
    const sheet = chatSheet(record, { playerColor: 'w' });
    const checked = assessChatReply('Be2 was more precise [M]. After Be2 Bg7 Nf3 O-O O-O, both sides have castled [M].', sheet, { record });
    assert.equal(checked.removed.length, 0);
    assert.match(checked.text, /Be2 was more precise/);
    assert.equal(new Chess(record.fen).move('Be2'), null);
    assert.equal(checkReply('Be2 is best [L1].', sheet, { record }).text, '');
    assert.equal(assessChatReply("Bd3 was playable, but Be2 was more precise [M]. After Bd3, Black's best reply is e5 [L1].", sheet, { record }).removed.length, 0);
    assert.equal(assessChatReply('After Bd3, Be2 was the more precise choice [M]. After Be2, the line continues with Nf3, O-O, and O-O [M].', sheet, { record }).removed.length, 0);
});

const replyFixture = () => {
    const record = { fen: new Chess().fen(), engine: { lines: [] } };
    const sheet = chatSheet(record, { playerColor: 'w' });
    return { sheet, record, player: 'hi', history: [], prompt: 'initial prompt' };
};

test('chat repairs rejected drafts even when an asked move has no legal continuation', async () => {
    const prepared = replyFixture();
    prepared.sheet = chatSheet(prepared.record, { asked: [{ san: 'Qh5' }] });
    prepared.player = 'Can I play Qh5?';
    assert.deepEqual(prepared.sheet.byId.A1.line, []);
    let calls = 0;
    const runtime = { manifest: { context: 2304 }, tokenCount: () => 100,
        async chat() { return { raw: ++calls === 1 ? 'Your queen is on d4.' : 'Qh5 is not legal here [A1].',
            tokens: 10, finishReason: 'stop' }; } };
    const answer = await answerChat(runtime, prepared.record.fen, [], prepared);
    assert.equal(calls, 2);
    assert.match(answer.raw, /Qh5 is not legal/);
});

test('chat advice drops unsolicited lines and repetitive equal-position filler but retains the idea', () => {
    const record = { fen: new Chess().fen(), engine: { lines: [{ move: 'g1f3', pv: ['g1f3', 'd7d5', 'd2d4'], score: { cp: 0 } }] } };
    const sheet = chatSheet(record, { playerColor: 'w' });
    const raw = 'The line continues Nf3 d5 d4, with an equal position [L1]. '
        + 'Nf3 develops your knight and controls d4, with the position about equal [L1]. '
        + 'The position is about equal [L1]. All three are playable, and the position remains about equal [L1].';
    const checked = assessChatReply(raw, sheet, { record, player: 'What should I do?' });
    assert.match(checked.text, /Nf3 develops your knight and controls d4\./);
    assert.doesNotMatch(checked.text, /equal|line continues|All three/);
    assert.ok(checked.removed.some(item => /immediate recommendation/.test(item.reason)));
    const evaluation = assessChatReply('The position is about equal [L1].', sheet, { record, player: 'Am I better or worse?' });
    assert.match(evaluation.text, /equal/);
    const line = assessChatReply('The line continues Nf3 d5 d4 [L1].', sheet, { record, player: 'Show me the line' });
    assert.match(line.text, /Nf3 d5 d4/);
});

test('chat rejects a rook diagonal instead of inventing a visual for it', () => {
    const prepared = replyFixture();
    const checked = assessChatReply("Clear the h1-rook's diagonal.", prepared.sheet,
        { record: prepared.record, player: 'What about the rook on h1?' });
    assert.equal(checked.text, '');
    assert.match(checked.removed[0].reason, /Rooks move on ranks and files/);
});

test('chat removes first-person equal-position filler from casual answers without losing the answer', () => {
    const { sheet, record } = replyFixture();
    for(const verdict of ["I'd rate it about equal", 'I\u2019d rate it about equal', 'I rate it roughly equal',
        'I would assess this as balanced']) {
        const mixed = assessChatReply(`I do play chess, and ${verdict}.`, sheet, { record, player: 'Do you like chess?' });
        assert.equal(mixed.text, 'I do play chess.', verdict);
        const standalone = assessChatReply(`Yes, I enjoy chess. ${verdict}.`, sheet, { record, player: 'Do you like chess?' });
        assert.equal(standalone.text, 'Yes, I enjoy chess.', verdict);
        assert.ok(standalone.removed.some(item => /verdict/.test(item.reason)));
        const asked = assessChatReply(`${verdict}.`, sheet, { record, player: 'How would you rate this position?' });
        assert.match(asked.text, /equal|balanced/, 'Keep an explicitly requested assessment');
    }
    assert.equal(assessChatReply('Equal rights matter.', sheet, { record, player: 'Do you like chess?' }).text,
        'Equal rights matter.', 'The word equal alone is not an evaluation verdict');
});

test('chat retries with a correction and returns only the selected supported draft', async () => {
    const calls = [], prepared = replyFixture();
    const runtime = { manifest: { context: 2304 }, tokenCount: () => 100,
        async chat(fen, history, prompt, options) {
            calls.push({ prompt, options });
            return { raw: calls.length === 1 ? 'Your queen is on d4.' : 'Evening. How goes the game?', tokens: 9, finishReason: 'stop' };
        } };
    const answer = await answerChat(runtime, prepared.record.fen, [], prepared);
    assert.equal(calls.length, 2);
    assert.match(calls[1].prompt, /Piece placement on d4/);
    assert.equal(calls[0].options.onText, undefined);
    assert.equal(answer.raw, 'Evening. How goes the game?');
    assert.equal(answer.quality.status, 'screened');
    assert.equal(answer.quality.attempts.length, 2);
    assert.deepEqual(answer.quality.removed, [], 'Discarded drafts must not inflate the selected answer\'s removal count');
    assert.equal(repairChatPrompt(prepared, [], { tokenCount: () => 3000 }), null);
});

test('chat bounds repeated failures without a canned successful fallback', async () => {
    let calls = 0;
    const prepared = replyFixture();
    const runtime = { manifest: { context: 2304 }, tokenCount: () => 100,
        async chat() { calls++; return { raw: 'Your queen is on d4.', tokens: 6, finishReason: 'stop' }; } };
    const answer = await answerChat(runtime, prepared.record.fen, [], prepared);
    assert.equal(calls, 3);
    assert.equal(answer.raw, '');
    assert.equal(answer.quality.status, 'withheld');
});

test('chat deadline stops generation, external cancellation and real failures still propagate', async () => {
    const prepared = replyFixture();
    const runtime = { manifest: { context: 2304 }, tokenCount: () => 100,
        chat(fen, history, prompt, { signal }) {
            return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
        } };
    assert.equal((await answerChat(runtime, prepared.record.fen, [], prepared, { budgetMs: 15 })).quality.status, 'withheld');
    const controller = new AbortController();
    const pending = answerChat(runtime, prepared.record.fen, [], prepared, { signal: controller.signal });
    controller.abort(new DOMException('Board changed', 'AbortError'));
    await assert.rejects(pending, { name: 'AbortError' });
    await assert.rejects(answerChat({ ...runtime, chat: async () => { throw new Error('GPU lost'); } }, prepared.record.fen, [], prepared), /GPU lost/);
});

const validReferences = references => {
    for(const item of [...references.relations, ...references.moves]) assert.ok(squareSet.has(item[0]) && squareSet.has(item[1]), String(item));
    for(const item of references.regions) assert.ok(item.squares.length && item.squares.every(square => squareSet.has(square)), item.label);
    for(const square of references.squares) assert.ok(squareSet.has(square), square);
};

test('every glossary demo is a legal position with a legal line and valid drawings', () => {
    for(const term of Object.keys(glossary)) {
        assert.ok(glossary[term].meaning, term);
        if(!hasDemo(term)) { assert.equal(demo(term), null, term); continue; }
        const shown = demo(term);
        assert.ok(shown, term);
        assert.equal(shown.frames.length, (glossary[term].line || []).length, term);
        validReferences(shown.references);
    }
});

test('glossary demos really show what they claim', () => {
    const after = term => new Facts(demo(term).finalFen);
    assert.deepEqual(after('fork').targets('c7').map(item => item.square).sort(), ['a8', 'e8']);
    assert.ok(new Facts(glossary.pin.fen).lines().some(line => line.kind === 'pin' && line.front === 'c3' && line.back === 'e1'));
    assert.equal(new Chess(demo('skewer').finalFen).get('e8').type, 'r');
    assert.ok(new Chess(demo('discovered attack').finalFen).in_check());
    const passed = new Facts(glossary['passed pawn'].fen);
    assert.ok(passed.passed(passed.find(['p'], 'w')[0]));
    const isolani = new Facts(glossary['isolated pawn'].fen);
    assert.ok(isolani.isolated(isolani.pieces.find(item => item.square === 'd4')));
    const backward = new Facts(glossary['backward pawn'].fen);
    assert.ok(backward.backward(backward.pieces.find(item => item.square === 'd6')));
    assert.ok(new Chess(demo('back rank mate').finalFen).in_checkmate());
    assert.ok(new Chess(demo('smothered mate').finalFen).in_checkmate());
    assert.ok(new Chess(glossary.stalemate.fen).in_stalemate());
    assert.equal(new Chess(demo('promotion').finalFen).get('e8').type, 'q');
    assert.equal(new Chess(demo('castling').finalFen).get('g1').type, 'k');
    assert.equal(new Chess(demo('en passant').finalFen).get('d5'), null);
    const outpost = new Facts(glossary.outpost.fen);
    assert.ok(!outpost.find(['p'], 'b').some(pawn => Math.abs(pawn.square.charCodeAt(0) - 100) === 1 && Number(pawn.square[1]) > 5));
});

test('glossary terms are found inside natural questions', () => {
    assert.deepEqual(glossaryTerms('What is a break?'), ['pawn break']);
    assert.deepEqual(glossaryTerms('whats an isolated queen pawn'), ['isolated pawn']);
    assert.deepEqual(glossaryTerms('explain zugzwang pls'), ['zugzwang']);
    assert.deepEqual(glossaryTerms('Should I play Nf3?'), []);
    assert.deepEqual(glossaryTerms('The central question is opening the app, not a fork in the road.'), []);
    assert.deepEqual(glossaryTerms('The central question is controlling the center.'), ['center']);
});

test('several concepts in one sentence are found, opening names only in opening talk', () => {
    assert.deepEqual(glossaryMentions('That back rank mate idea and a pin, plus the Caro Kann and kings gambit').map(item => item.term),
        ['back rank mate', 'pin', 'caro-kann defense', "king's gambit"]);
    assert.deepEqual(glossaryTerms('I play the London as white'), ['london system']);
    assert.deepEqual(glossaryTerms('I am from London, do you speak English?'), []);
});

test('concepts Pena mentions get a live fact or a demo board, never when negated or about the real board', () => {
    const record = { fen: glossary.pin.fen, engine: { lines: [] } };
    const sheet = chatSheet(record, { playerColor: 'w' });
    const checked = checkReply('That pin is annoying. A fork and a skewer are the classic tricks.', sheet, { record });
    const shown = conceptVisuals(checked, sheet);
    assert.deepEqual(shown.citations.map(item => item.id), ['F2', 'D:fork', 'D:skewer']);
    assert.equal(shown.text, checked.text);
    assert.equal(shown.tagged, checked.tagged, 'added tags stay out of chat history');
    assert.ok(chatPhrases(shown.text, shown.citations).some(phrase => phrase.cited.some(item => item.id === 'D:fork')));
    assert.equal(conceptVisuals(checkReply('There is no fork here.', sheet, { record }), sheet).citations.length, 0);
    const steps = citationSteps(conceptVisuals(checkReply('The Caro-Kann is solid.', sheet, { record }), sheet).citations[0], record.fen);
    assert.equal(steps[0].line.frames[0].san, 'Caro-Kann Defense');
});

test('local time only reaches the notes on greetings, goodbyes and time talk', () => {
    const now = new Date(2026, 10, 13, 23, 40);
    assert.equal(timeNote('hey', { now }), 'Local time: Friday 13 November 2026, 23:40 (night).');
    assert.match(timeNote("it's so late", { now }), /night/);
    assert.equal(timeNote('why is Nf3 good?', { now }), '');
    assert.equal(timeNote('how much time is on the clock?', { now }), '');
});

test('fact sheet lists grounded facts with drawable references', () => {
    const fen = '4r1k1/pp3ppp/2p5/3p4/3Pn3/2PBB3/P4PPP/4R1K1 b - - 0 22';
    const sheet = factSheet(fen, { playerColor: 'b', engine: { lines: [{ move: 'e4c3', pv: ['e4c3', 'e3d2'], score: { cp: 180, mate: null } }] },
        asked: [{ uci: 'e4c3', label: 'Best Move', score: { cp: 180, mate: null }, pv: ['e4c3'], bestUci: 'e4c3' }, { uci: 'g8h9' }] });
    assert.match(sheet.sheet, /^You play Black\. Black to move/);
    assert.match(sheet.byId.A1.text, /^Nxc3 is rated Best Move/);
    assert.match(sheet.byId.A2.text, /not a legal move/);
    assert.match(sheet.byId.L1.text, /^Nxc3 \(-1\.8, Black better\), removing the pawn on c3, line 22\.\.\.Nxc3 23\.Bd2/);
    assert.ok(sheet.facts.some(item => item.kind === 'hanging' && /White pawn c3/.test(item.text)));
    for(const item of sheet.facts) validReferences(item.references);
});

test('fact sheet ignores quiet structures that only look notable', () => {
    const opening = factSheet('r1b1k2r/ppppqppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 1 6');
    assert.ok(!opening.facts.some(item => item.kind === 'bad bishop'));
    const rookless = factSheet('8/5pk1/6p1/3P4/8/6P1/5PK1/8 w - - 0 40');
    assert.ok(!rookless.facts.some(item => item.kind === 'open file' || item.kind === 'pawn break'));
    assert.ok(rookless.facts.some(item => item.kind === 'king activity'));
});

test('citations are removed from the spoken text and keep their position', () => {
    const sheet = factSheet('8/5pk1/6p1/3P4/8/6P1/5PK1/8 w - - 0 40');
    const result = citations('Your d-pawn is passed [F1] and that is huge [F42]. Push it [L1].', sheet);
    assert.equal(result.text, 'Your d-pawn is passed and that is huge. Push it.');
    assert.deepEqual(result.citations.map(item => [item.id, item.index]), [['F1', 21]]);
});

test('lines are numbered like a book', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
    assert.equal(numberedLine(fen, sanLine(fen, ['g8f6', 'd2d3', 'f8c5'])), '3...Nf6 4.d3 Bc5');
});

const italian = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
const fakeEngine = (searched = []) => ({
    async lines(fen, { multipv, moves }) {
        searched.push({ fen, multipv, moves });
        const legal = new Chess(fen).moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || ''));
        const pool = moves || ['g8f6', 'f8c5', ...legal];
        return [...new Set(pool)].filter(move => legal.includes(move)).slice(0, multipv)
            .map((move, index) => ({ move, pv: [move], depth: 12, score: { cp: -20 - index * 90, mate: null } }));
    },
    compare: (best, played) => played.move === best.move ? { label: 'Best Move', reason: 'Top choice.' } : { label: 'Mistake', reason: 'Avoidable loss.' }
});

test('chat grades the move the player asks about and keeps the prompt inside the context', async () => {
    const searched = [];
    const chat = new PenaConversation({ engine: fakeEngine(searched), tokenCount: text => text.length / 4, context: 1100, replyTokens: 200 });
    const first = await chat.prepare('should i play knight to f6?', { fen: italian, playerColor: 'b' });
    assert.match(first.sheet.byId.A1.text, /^Nf6 is rated Best Move/);
    assert.ok(first.prompt.endsWith('Player question: should i play knight to f6?<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n'));
    assert.ok(!first.prompt.includes('## Metadata') && !first.prompt.includes('rated about 2600'));
    chat.remember(first, 'Yes, Nf6 is the move [A1].');
    const second = await chat.prepare('what about h6', { fen: italian, playerColor: 'b' });
    assert.match(second.sheet.byId.A2.text, /^h6 is rated Mistake/);
    const both = await new PenaConversation({ engine: fakeEngine([]), tokenCount: text => text.length / 4, context: 4000, replyTokens: 200 })
        .prepare('d6 or Nf6?', { fen: italian, playerColor: 'b' });
    assert.match(both.sheet.byId.A1.text, /^d6 is rated/);
    assert.match(both.sheet.byId.A2.text, /^Nf6 is rated Best Move/);
    assert.ok(second.prompt.includes('Yes, Nf6 is the move [A1].'));
    for(let i = 0; i < 6; i++) chat.remember(second, 'x'.repeat(400));
    const third = await chat.prepare('why?', { fen: italian, playerColor: 'b' });
    assert.ok(third.prompt.length / 4 + 200 <= 1100 && third.history.length < 4);
    assert.equal(searched.filter(item => item.fen === italian && item.multipv === 3).length, 1);
    chat.follow('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
    assert.equal(chat.exchanges.length, 0);
    const terms = async message => (await new PenaConversation({ engine: fakeEngine([]), tokenCount: text => text.length / 4, context: 4000, replyTokens: 200 })
        .prepare(message, { fen: italian, playerColor: 'b' })).pending.demoTerms;
    assert.deepEqual(await terms('what is elo'), ['elo']);
    assert.deepEqual(await terms('how do I lower the engine elo'), []);
});

test('chat remembers earlier positions as plain notes and a new game forgets them', async () => {
    const chat = new PenaConversation({ engine: fakeEngine([]), tokenCount: text => text.length / 4, context: 4000, replyTokens: 200, maxEarlier: 2 });
    const first = await chat.prepare('(played Bc4)', { fen: italian, playerColor: 'w' });
    chat.remember(first, 'Nice, the bishop eyes f7 [F1]. Next Nf6 is natural [L1].');
    const after = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    const second = await chat.prepare('why was that good?', { fen: after, playerColor: 'w' });
    assert.match(second.prompt, /Earlier in this chat, at older positions, not the board now\. Pieces have moved since, so never reuse these words:\nMove 3, Black to move, player: \(played Bc4\) Pena: Nice, the bishop eyes f7\. Next Nf6 is natural\./);
    assert.ok(!/Earlier in this chat[\s\S]*\[F1\]/.test(second.prompt.split('<|im_start|>user')[0].split('Earlier in this chat')[1] || ''));
    // An automatic board update gets no older replies, so the model has nothing stale to copy.
    for(const event of ['(position updated)', '(played O-O)'])
        assert.ok(!(await chat.prepare(event, { fen: after, playerColor: 'w' })).prompt.includes('Earlier in this chat'), event);
    chat.remember(second, 'It develops with a threat [F1].');
    chat.follow(italian.replace(' b ', ' w '));
    const third = await chat.prepare('ok', { fen: italian.replace(' b ', ' w '), playerColor: 'w' });
    assert.equal((third.prompt.match(/, player: /g) || []).length, 2);
    chat.reset(italian);
    const fresh = await chat.prepare('hi', { fen: italian, playerColor: 'w' });
    assert.ok(!fresh.prompt.includes('Earlier in this chat'));
});

test('a message that misreads the board gets a board check the reply may use', () => {
    // Misread pieces get a board check, plain talk about real pieces does not.
    const start = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
    assert.equal(boardMisread('can I take the bishop on b5?', start, 'b'), 'b5 is empty, not their bishop, their bishops are on c4 and c1');
    assert.equal(boardMisread('is my knight on c5 safe', start, 'b'), 'c5 is empty, not your knight, your knights are on g8 and c6');
    assert.equal(boardMisread('can i take his queen', '4k3/8/8/8/8/8/4P3/4K3 b - - 0 1', 'b'), 'the opponent has no queen on the board');
    for(const text of ['can I take the bishop on c4?', 'is the knight safe', 'what should I play']) assert.equal(boardMisread(text, start, 'b'), '', text);
    const sheet = chatSheet({ fen: start, engine: { lines: [] }, misread: boardMisread('can I take the bishop on b5?', start, 'b') }, { playerColor: 'b' });
    assert.match(sheet.text, /^Board check: b5 is empty, not their bishop/m);
    assert.equal(checkReply('Nothing on b5, the bishop sits on c4.', sheet, { record: { fen: start } }).removed.length, 0);
});

test('hidden lines drop only the sentences that give the best line away and repeats are spotted', () => {
    assert.equal(withoutLines('Solid move [F1]. The best line goes Nf6 [L1]. Watch the e5 pawn [F2].'), 'Solid move [F1]. Watch the e5 pawn [F2].');
    for(const text of ['say that again', 'Can you repeat that please?', 'come again?', 'what did you say', 'pardon', 'again!']) assert.ok(isRepeatAsk(text), text);
    for(const text of ['say that again about the bishop', 'why again?', 'play it again later', 'what should I say']) assert.ok(!isRepeatAsk(text), text);
});

test('chat replies keep only sentences the board supports', () => {
    const fen = '4r1k1/pp3ppp/2p5/3p4/3Pn3/2PBB3/P4PPP/4R1K1 b - - 0 22';
    const record = { fen, engine: { lines: [{ move: 'e4c3', pv: ['e4c3', 'e3d2'], score: { cp: 180, mate: null } }] } };
    const sheet = chatSheet(record, { playerColor: 'b' });
    const result = checkReply('Grab the pawn with Nxc3 [L1]. Then your queen lands on h2 for mate. Nice and simple.', sheet, { record });
    assert.equal(result.text, 'Grab the pawn with Nxc3. Nice and simple.');
    assert.deepEqual(result.citations.map(item => item.id), ['L1']);
    assert.match(result.removed[0].reason, /h2/);
    assert.equal(displayText('Take on c3 [L1] and then [F'), 'Take on c3 and then');
});

test('chat retains a useful file explanation even when its real rook was not named in the notes', async () => {
    const record = { fen: '4r1k1/pp3ppp/2p5/3p4/3Pn3/2PBB3/P4PPP/3R2K1 w - - 0 22', engine: { lines: [] } };
    const sheet = chatSheet(record, { playerColor: 'w' });
    const player = 'Why is opening the d-file so important?';
    const explanation = "It opens your rook on d1 and gives your pieces more room, so it's a good plan.";
    const checked = assessChatReply(explanation, sheet, { record, player });
    assert.equal(checked.text, explanation, 'Retain the actual reason, not just a variation or an empty answer');
    assert.deepEqual(checked.removed, []);
    assert.equal(checked.sentences[0].status, 'unchecked', 'A plausible strategic explanation is not independently verified');
    const prepared = { record, sheet, player, history: [], prompt: 'initial prompt' };
    let calls = 0;
    const answer = await answerChat({ manifest: { context: 2304 }, tokenCount: () => 100,
        async chat() { calls++; return { raw: explanation, tokens: 24, finishReason: 'stop' }; } }, record.fen, [], prepared);
    assert.equal(answer.raw, explanation);
    assert.equal(calls, 1, 'Do not spend retries replacing useful reasoning that was not contradicted');
    const invented = assessChatReply('It opens your queen on d1 and gives your pieces more room.', sheet, { record, player });
    assert.equal(invented.text, '', 'Keep concrete piece-identity checks');
    assert.match(invented.removed[0].reason, /placement/);
});

test('chat accepts a legal uncited continuation beyond the engine notes', () => {
    const record = { fen: new Chess().fen(), engine: { lines: [] } };
    const sheet = chatSheet(record, { playerColor: 'w' });
    const text = 'After e4 e5 Nf3 Nc6 Bb5, your bishop puts pressure on the knight on c6.';
    const checked = assessChatReply(text, sheet, { record, player: 'Explain the idea behind this line.' });
    assert.equal(checked.text, text);
    assert.deepEqual(checked.removed, []);
});

test('game timeline grades the past and shows it when the player asks about it', async () => {
    const board = new Chess();
    const fens = [board.fen()];
    for(const san of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']) { board.move(san); fens.push(board.fen()); }
    const value = score => score.mate ? Math.sign(score.mate) * 10000 : score.cp;
    const engine = {
        async lines(fen) {
            const position = new Chess(fen);
            if(fen.startsWith('r1bqkb1r/pppp1ppp/2n2n2/4p2Q')) return [{ move: 'h5f7', pv: ['h5f7'], score: { cp: null, mate: 1 }, depth: 12 }];
            const best = position.fen() === fens[5] ? 'g7g6' : (move => move.from + move.to)(position.moves({ verbose: true })[0]);
            return [{ move: best, pv: [best], score: { cp: 0, mate: null }, depth: 12 }];
        },
        compare: (best, played) => ({ label: value(best) - value(played) > 300 ? 'Blunder' : 'Best Move', reason: '' })
    };
    const moves = await gradeGame(engine, fens);
    assert.deepEqual(moves.map(move => move.label), ['Best Move', 'Best Move', 'Best Move', 'Best Move', 'Best Move', 'Blunder', 'Best Move']);
    const result = boardResult(fens.at(-1));
    assert.deepEqual(result, { over: true, winner: 'w', reason: 'checkmate' });

    const timeline = { moves, result: { over: false } };
    for(const message of ['that hurt. what happened?', 'could I have won there at some point?', 'I resigned', 'gg']) assert.ok(pastTopic(message), message);
    for(const message of ['what should I play', 'is my king safe?', 'explain a fork']) assert.ok(!pastTopic(message), message);
    assert.equal(timelineNotes('what should I play here', timeline, { playerColor: 'b' }), null);
    assert.deepEqual(timelineChain(['aww man what did I do wrong', 'and now?'], timeline, { playerColor: 'b' }).map(Boolean), [true, true]);
    const notes = timelineNotes('anything', { moves, result }, { playerColor: 'b' });
    assert.match(notes.text, /Game over: the opponent won by checkmate/);
    assert.match(notes.text, /\[H0\] game story: .*checkmate for the opponent.*you made 1 blunder/);
    assert.match(notes.text, /\[H1\] game moment \(you\): move 3, you played 3\.\.\.Nf6, rated Blunder, 3\.\.\.g6 was better/);

    const record = { fen: fens.at(-1), engine: { lines: [] } };
    const sheet = chatSheet(record, { playerColor: 'b', timeline: notes });
    const checked = checkReply('Nf6 let the queen take on f7 with mate [H1].', sheet, { record });
    assert.deepEqual(checked.citations.map(item => item.id), ['H1']);
    const steps = citationSteps(checked.citations[0], record.fen);
    assert.deepEqual(steps.map(step => step.line.frames[step.line.index].san), ['Move 3', 'Nf6', 'Better', 'g6']);
    assert.equal(steps[0].line.frames[0].fen, fens[5]);
    assert.deepEqual(steps[1].references.moves, [['g8', 'f6']]);
});

test('defences are tested against the real threat and stay stable in the chat notes', async () => {
    // The black bishop wants the rook on a1. Moving the rook holds, guarding it with the knight still loses the exchange.
    const fen = '4k3/8/8/2N5/8/2b5/8/R6K w - - 0 1';
    const threat = { pv: ['c3a1'], gain: 500, score: { cp: 500, mate: null } };
    const lines = [{ move: 'a1a3', pv: ['a1a3', 'e8d7'], score: { cp: -300, mate: null } }];
    const searched = [];
    const search = async (at, { moves }) => {
        searched.push(moves[0]);
        return moves[0].startsWith('a1') ? [{ move: moves[0], pv: [moves[0], 'e8d7'], score: { cp: -300, mate: null } }]
            : [{ move: moves[0], pv: [moves[0], 'c3a1', 'c5a1'], score: { cp: -800, mate: null } }];
    };
    const defences = await testDefences(fen, threat, lines, search, { depth: 10 });
    assert.deepEqual(defences.map(item => [item.kind, item.verdict]), [['engine', 'holds'], ['away', 'holds'], ['guard', 'fails']]);
    assert.ok(!searched.includes('a1a3'), 'engine lines are reused, not searched again');
    assert.equal(defences[2].how, 'guards a1');
    assert.ok(defences.every(item => !item.stops), 'the bishop can still go to a1, it just wins nothing');
    assert.deepEqual(await testDefences(fen, { pv: ['c3a1'], gain: 40, score: { cp: 40 } }, lines, search), [], 'small ideas are not threats');

    const sheet = chatSheet({ fen, engine: { lines }, threat: { ...threat, defences }, opening: 'Italian Game: Two Knights Defense (C55)' }, { playerColor: 'w' });
    assert.match(sheet.text, /\[R1\] defence that holds \(you\): Ra3, .*engine best, the threat is no longer dangerous after it/);
    assert.match(sheet.text, /\[R3\] defence that fails \(you\): Nb3, guards a1/);
    assert.match(sheet.text, /^Opening played: Italian Game: Two Knights Defense\.$/m);
    assert.deepEqual(checkReply('The bishop wants your rook [T]. Ra3 keeps it safe [R1], Nb3 does not help [R3].', sheet, { record: { fen } }).citations.map(item => item.id), ['T', 'R1', 'R3']);

    // Moves the player names come first, and a moment keeps its tag for the rest of the chat.
    const board = new Chess();
    const moves = [];
    for(const [ply, san] of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7'].entries()) {
        const beforeFen = board.fen(), move = board.move(san);
        moves.push({ ply: ply + 1, color: move.color, san: move.san, uci: move.from + move.to, beforeFen, label: { 6: 'Mistake', 9: 'Inaccuracy', 10: 'Blunder' }[ply] || 'Best Move', reason: '', bestUci: move.from + move.to, pv: [], value: 0 });
    }
    const timeline = { moves, result: { over: false } };
    const notes = timelineNotes('why was Ng5 bad on move 4?', timeline, { playerColor: 'w' });
    assert.ok(notes.facts.some(fact => fact.id !== 'H0' && fact.ply === 7), 'the named move is a moment');
    assert.match(timelineNotes('was my opening ok?', timeline, { playerColor: 'w' }).text, /In the first 12 moves you made a mistake with Ng5 on move 4, a blunder with Nxf7 on move 6/);
    const chain = timelineChain(['what did I do wrong', 'and what about move 5?', 'ok and the first one?'], timeline, { playerColor: 'w' });
    const plies = chain.map(item => Object.fromEntries(item.facts.filter(fact => fact.ply).map(fact => [fact.id, fact.ply])));
    for(const [id, ply] of Object.entries(plies[0])) assert.equal(plies[1][id], ply, `${id} kept its move`);
    assert.ok(Object.values(plies[1]).includes(9), 'the newly asked move joins the notes');

    // "What if" questions grade the alternative back then and add it to that moment, nothing is graded as a move for now.
    assert.equal(pastAlternative('what if I take on f7', timeline, 'w'), null);
    assert.equal(pastAlternative('what about Nc3 instead of Bc4', timeline, 'w').move.ply, 5);
    const now = board.fen();
    const chat = new PenaConversation({ engine: fakeEngine([]), tokenCount: text => text.length / 4, context: 4000, replyTokens: 200 });
    const asked = await chat.prepare('what if I had played d3 on move 4?', { fen: now, playerColor: 'w', timeline });
    const moment = asked.sheet.facts.find(fact => fact.ply === 7);
    assert.match(moment.text, /If you had played 4\.d3 instead, it would have been rated Mistake \(Avoidable loss\)/);
    assert.ok(asked.prompt.includes(moment.text));
    assert.ok(!asked.sheet.byId.A1, 'the past move is not graded on the board now');
    const steps = citationSteps({ id: moment.id, fact: moment }, now);
    assert.deepEqual(steps.map(step => step.line.frames[step.line.index].san).slice(-2), ['What if', 'd3']);
    assert.deepEqual(checkReply(`Ng5 was early, 4.d3 was calmer [${moment.id}].`, asked.sheet, { record: asked.record }).citations.map(item => item.id), [moment.id]);
    chat.remember(asked, `Ng5 was early, 4.d3 was calmer [${moment.id}].`);
    const why = await chat.prepare('why?', { fen: now, playerColor: 'w', timeline });
    assert.match(why.sheet.byId[moment.id].text, /If you had played 4\.d3 instead/, 'the follow up keeps the graded alternative');
});

test('chat visuals and speech follow the cited facts', () => {
    const fen = '4r1k1/pp3ppp/2p5/3p4/3Pn3/2PBB3/P4PPP/4R1K1 b - - 0 22';
    const record = { fen, engine: { lines: [{ move: 'e4c3', pv: ['e4c3', 'e3d2', 'c3a2'], score: { cp: 180, mate: null } }] } };
    const sheet = chatSheet(record, { playerColor: 'b', demoTerms: ['fork'] });
    const { text, citations: found } = checkReply('I like Nxc3, grabbing a pawn [L1], and a fork is a double attack [D:fork].', sheet, { record });
    const line = citationSteps(found[0], fen);
    assert.deepEqual(line[0].references.moves, [['e4', 'c3']]);
    assert.deepEqual(line.slice(1).map(step => [step.line.index, step.references.moves[0].join('')]), [[1, 'e3d2'], [2, 'c3a2']]);
    const fork = citationSteps(found[1], fen);
    assert.equal(fork[0].line.frames[0].fen, glossary.fork.fen);
    const phrases = chatPhrases(text, found);
    assert.ok(phrases.every(phrase => !/Nxc3/.test(phrase.text)));
    assert.deepEqual(phrases.filter(phrase => phrase.cited.length).map(phrase => [phrase.cited[0].id, phrase.pauseBefore]), [['L1', 0], ['D:fork', 180]]);
});

test('structure facts keep separate pawn groups apart and only offer empty outposts', () => {
    const kinds = fen => Object.fromEntries(factSheet(fen, { limit: 40 }).facts.filter(fact => /chain|doubled|outpost|king safety/.test(fact.kind)).map(fact => [`${fact.kind} ${fact.side}`, fact.text]));
    const pawns = kinds('4k3/8/8/8/4P2P/1PP1P1P1/P1P2P2/4K3 w - - 0 30');
    assert.match(pawns['doubled pawns w'], /c-file \(c2 and c3\) and on the e-file \(e3 and e4\)/);
    assert.match(pawns['pawn chain w'], /pawns e3, f2, g3, h4 .*base on f2/);
    assert.ok(!/a2|b3/.test(pawns['pawn chain w']));
    assert.ok(!Object.values(kinds('4k3/pp4pp/8/3P4/4PN2/8/PP4PP/4K3 w - - 0 30')).some(text => /\bd5 is an outpost/.test(text)));
    const king = kinds('r2q1r2/ppp2pkp/2n3p1/8/8/2N5/PPPQ1PPP/R3R1K1 b - - 0 15');
    assert.match(king['king safety b'], /no longer able to castle/);
    assert.match(factSheet('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 3 3', { playerColor: 'w' }).header, /opponent's move, so the engine lines are what they will likely play/);
});

test('placing one piece is not read as a count of that piece', () => {
    const fen = 'r7/5p2/2p2k2/8/1n2p2p/2K1b3/8/3r4 b - - 7 42';
    assert.notEqual(checkSentence('Black has a rook on a8.', fen, {}).status, 'contradicted');
    assert.equal(checkSentence('Black has a rook on b8.', fen, {}).status, 'contradicted');
    assert.equal(checkSentence('Black has a rook and a knight.', fen, {}).status, 'contradicted');
});
