import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCoachAnswer, cleanEvidenceTalk, engineNote, factsAfter, flaggedReminder, lineOutcome, liveThinking, nullMove, replyHits, rootThreat, selfQuestion, Spotter, spot } from '../thought-injection.js';
import { currentClaim, gamePlies, historyNotes, pastMention, timeQuestion } from '../thought-time.js';
import { answerQuestion } from '../thought-questions.js';
import { Chess } from '../../libraries/chessjs/chess.js';
import { parseSearch } from '../verdict-engine.js';

const FEN = 'r1b1k2r/pp1pbppp/8/2p1q2n/2Q5/2N1B3/PPP2PPP/2KR1B1R b kq - 3 11';
const AFTER_BF8 = 'r1b1kb1r/pp1p1ppp/8/2p1q2n/2Q5/2N1B3/PPP2PPP/2KR1B1R w kq - 4 12';

test('answers never talk about the supplied evidence or the private checks', () => {
    assert.equal(cleanEvidenceTalk('According to the supplied evidence, e5 is weak.'), 'e5 is weak.');
    assert.equal(cleanEvidenceTalk('The provided facts show that the knight is loose.'), 'The knight is loose.');
    assert.equal(cleanCoachAnswer('Rd5 hits the queen. I would not trust it without checking the follow-up. Then Rxh5 wins the knight.'),
        'Rd5 hits the queen. Then Rxh5 wins the knight.');
});

test('lines report who comes out ahead once the captures settle', () => {
    const line = lineOutcome(AFTER_BF8, ['Rd5', 'Qe6', 'Rxh5', 'Qxc4', 'Bxc4', 'd6']);
    assert.equal(line.net('w'), 3);
    assert.match(line.line, /^Rd5 \.\.\.Qe6 Rxh5 \.\.\.Qxc4 Bxc4/);
    assert.equal(replyHits(AFTER_BF8, 'Rd5'), 'Rd5 hits the queen on e5.');
});

test('engine verdicts carry a concrete reason instead of just a better move', async () => {
    const scores = { [FEN]: { score: 0.3, best: 'Nf6', pv: ['Nf6'] },
        [AFTER_BF8]: { score: 3.6, best: 'Rd5', pv: ['Rd5', 'Qe6', 'Rxh5', 'Qxc4', 'Bxc4', 'd6'] } };
    const engine = { search: async fen => scores[fen] || null };
    const note = await engineNote(engine, FEN, AFTER_BF8, { color: 'b', san: 'Bf8' });
    assert.match(note.text, /a serious mistake, \.\.\.Nf6 was better/);
    assert.match(note.text, /White comes out a piece ahead/);
    assert.match(note.text, /The key is that Rd5 hits the queen on e5/);
    const hidden = await engineNote(engine, FEN, AFTER_BF8, { color: 'b', san: 'Bf8' }, { nameMoves: false });
    assert.doesNotMatch(hidden.text, /Nf6/);
});

test('Stockfish output becomes a White-side score and a SAN line', () => {
    const black = parseSearch(FEN, 'info depth 12 score cp -150 pv g8f6', 'g8f6');
    assert.equal(black.score, 1.5);
    const mate = parseSearch(AFTER_BF8, 'info depth 12 score mate 2 pv d1d5', 'd1d5');
    assert.equal(mate.score, 98);
    assert.deepEqual(mate.pv, ['Rd5']);
});

test('open danger questions get the opponent threat with its reason, early in the thinking', async () => {
    const fen = 'r1b1kb1r/ppq3pp/n2p1p1n/1N1Bp3/1P2P3/P4N1P/2PB1PP1/R2Q1RK1 b kq - 2 13';
    const flipped = nullMove(fen);
    const scores = { [fen]: { score: 0.5, best: 'Qd7', pv: ['Qd7'] }, [flipped]: { score: 6, best: 'Nxc7+', pv: ['Nxc7+', 'Nxc7'] } };
    const engine = { search: async f => scores[f] || null };
    const note = await rootThreat(engine, fen);
    assert.match(note, /if White could move now, Nxc7\+ would win/);
    assert.match(note, /Nxc7\+ hits the king \(check\), the rook on a8 and the knight on a6 at once/);
    const quiet = { search: async f => ({ score: 0.2, best: f === fen ? 'Qd7' : 'a4', pv: [f === fen ? 'Qd7' : 'a4'] }) };
    assert.match(await rootThreat(quiet, fen), /no immediate tactical threat/);

    const prompts = [];
    const script = [[{ content: 'The player wants to know what to watch out for, so let me look at the position first.', tokens: [1] }, { content: '\n', tokens: [2] }],
        [{ content: 'So the queen must move.', tokens: [3] }, { content: '', tokens: [200010] }],
        [{ content: 'Your queen on c7 is hit by the knight.', tokens: [4], stop: true }]];
    const complete = async ({ prompt, onData }) => { prompts.push(prompt); for(const event of script[prompts.length - 1] || []) onData(event); };
    const checks = [];
    await liveThinking({ complete, prompt: 'P', rootFen: fen, question: 'What should I watch out for here?', engine,
        thinkBudget: 300, answerBudget: 100, room: 4000, onCheck: n => checks.push(n) });
    assert.equal(checks.length, 1);
    assert.match(prompts[1], /position first\.\n\n\[Rule-checked, current board\. Threat check: if White could move now/);
    // A question about a specific move is the spotter's job, not a threat scan.
    checks.length = 0; prompts.length = 0;
    await liveThinking({ complete, prompt: 'P', rootFen: fen, question: 'Is Qd7 careful enough?', engine,
        thinkBudget: 300, answerBudget: 100, room: 4000, onCheck: n => checks.push(n) });
    assert.ok(!checks.some(n => /Threat check/.test(n)));
});

test('a half pawn at +12 is not called weaker, and an immediate mate threat is named as mate', async () => {
    const before = 'rnbbn1k1/pp1p2pp/2p5/8/3PPQ2/2N5/PPP2PPP/R1B2RK1 w - - 0 15';
    const after = 'rnbbn1k1/pp1p2pp/2p5/4Q3/3PP3/2N5/PPP2PPP/R1B2RK1 b - - 1 15';
    const scores = { [before]: { score: 12.6, best: 'Qe3', pv: ['Qe3'] }, [after]: { score: 12.1, best: 'Nc7', pv: ['Nc7'] },
        [nullMove(after)]: { score: 99, best: 'Qxe8#', pv: ['Qxe8#'] } };
    const note = await engineNote({ search: async f => scores[f] || null }, before, after, { color: 'w', san: 'Qe5' });
    assert.match(note.text, /as good as the best move/);
    assert.match(note.text, /threatens Qxe8#, which is checkmate/);
});

test('moves the checks flagged are restated before the reply', () => {
    const checks = [{ note: 'Board after ...Bc5: Black\'s bishop is now on c5. Engine: a serious mistake, ...Bb7 was better.' },
        { note: 'Board after ...Bb4+: Black\'s bishop is now on b4. Engine: this is as good as the best move.' },
        { note: 'Board after ...Nd5: Black\'s knight is now on d5. Engine: a serious mistake.' },
        { note: 'Board after Nh4 ...g6: Engine: a serious mistake.' }];
    assert.match(flaggedReminder(checks), /^My checks showed that \.\.\.Bc5 and \.\.\.Nd5 are mistakes here/);
    assert.equal(flaggedReminder(checks.slice(1, 2)), '');
    assert.equal(cleanCoachAnswer('It hits b6. The engine evidence calls it a mistake. And per your note, this is only geometry.'),
        'It hits b6. The engine calls it a mistake.');
    assert.equal(cleanEvidenceTalk('The queen on g7 is attacked twice (F1). Qxf8 wins a rook [L1, Q2].'), 'The queen on g7 is attacked twice. Qxf8 wins a rook.');
});

test('a quoted engine line keeps its sides, and the threat note goes in before the first move note', async () => {
    const fen = '3r2k1/1p6/p5pp/4b1p1/1PP1PqP1/P7/4QPP1/2R2RK1 w - - 1 28';
    const spotter = new Spotter(fen);
    const thought = 'Evidence: engine best g3, line 28.g3 Qd2 29.Qxd2 Rxd2 ';
    const first = await spot(thought, 0, spotter);
    assert.match(first.text, /^Board after g3: White's pawn is now on g3/);
    const second = await spot(thought, first.end, spotter);
    assert.match(second.text, /^Board after g3 \.\.\.Qd2: Black's queen is now on d2/);

    const threat = { [fen]: { score: 4, best: 'g3', pv: ['g3'] }, [nullMove(fen)]: { score: -99, best: 'Qh2#', pv: ['Qh2#'] } };
    const engine = { search: async f => threat[f] || { score: 4, best: null, pv: [] } };
    const prompts = [], script = [[{ content: 'Watch out question. Maybe Qd2', tokens: [1] }, { content: ' here.', tokens: [2] }], [{ content: '', tokens: [200010] }], [{ content: 'Stop ...Qh2#.', tokens: [3], stop: true }]];
    const complete = async ({ prompt, onData }) => { prompts.push(prompt); for(const event of script[prompts.length - 1] || []) onData(event); };
    const checks = [];
    await liveThinking({ complete, prompt: 'P', rootFen: fen, question: 'What should I watch out for?', engine, thinkBudget: 300, answerBudget: 100, room: 4000, onCheck: n => checks.push(n) });
    assert.match(checks[0], /^Threat check: if Black could move now, \.\.\.Qh2# would lead to mate/);
    assert.match(checks[1], /^Board after Qd2/);
    assert.match(prompts.at(-1), /The most urgent thing is the threat \.\.\.Qh2#, which would lead to mate\./);
});

test('a self-question about a piece on a board Pena is not tracking stays unanswered', () => {
    const fen = '1n3r2/2k1r1Qp/1q1p4/p1p1pn2/P1Pp3P/B7/5PP1/R3R1K1 w - - 1 27';
    assert.equal(answerQuestion('Rook b1 is defended by rook a1?', [{ label: 'Current board', chess: new Chess(fen) }]), null);
});

test('an imagined move gets a rule-checked note in the thinking and the thought resumes', async () => {
    const prompts = [];
    const script = [
        [{ content: 'Maybe Qe6 is the move', tokens: [1] }, { content: ' here.', tokens: [2] }],
        [{ content: 'So the queens can trade.', tokens: [3] }, { content: '', tokens: [200010] }],
        [{ content: 'The supplied evidence shows Qe6 hits the queen on c4.', tokens: [4], stop: true }]
    ];
    const complete = async ({ prompt, onData }) => {
        prompts.push(prompt);
        for(const event of script[prompts.length - 1] || []) onData(event);
    };
    const checks = [];
    const result = await liveThinking({ complete, prompt: 'P', rootFen: FEN, question: 'What about Qe6?',
        thinkBudget: 300, answerBudget: 100, room: 4000, onCheck: note => checks.push(note) });
    assert.equal(checks.length, 1);
    assert.match(checks[0], /Black's queen is now on e6\. From e6 it now attacks the queen on c4/);
    assert.match(prompts[1], /Maybe Qe6\s*\n\[Rule-checked future board/);
    assert.match(prompts[2], /<\|content_text\|>$/);
    assert.equal(result.answer, 'Qe6 hits the queen on c4.');
});

// Past, current and future boards. 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6, the real board is after ...a6.
const ruy = () => {
    const game = new Chess(), fens = [game.fen()];
    for(const san of ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']) { game.move(san); fens.push(game.fen()); }
    const root = fens.pop();
    return { root, history: fens, plies: gamePlies(fens, root) };
};
const spotAll = async (text, spotter) => {
    const notes = [];
    for(let r = await spot(text, 0, spotter); r; r = r.end < text.length ? await spot(text, r.end, spotter) : null) if(r.text) notes.push(r);
    return notes;
};

test('the real game history is read as plies ending at the current board', () => {
    const { plies } = ruy();
    assert.deepEqual(plies.map(p => p.label), ['e4', '...e5', 'Nf3', '...Nc6', 'Bb5', '...a6']);
});

test('a thought about the last move gets a past note, never a future note or a line', async () => {
    const { root, plies } = ruy();
    const spotter = new Spotter(root, { plies });
    const notes = await spotAll('Black just played ...a6, which is the Morphy Defence. ', spotter);
    assert.equal(notes.length, 1);
    assert.ok(notes[0].past);
    assert.match(notes[0].text, /From a6 it attacks the bishop on b5/);
    assert.match(notes[0].text, /This already happened/);
    assert.deepEqual(spotter.line, []);
    // An older move that is legal again from the real board must not turn into an imagined line either.
    const older = new Spotter(root, { plies });
    assert.deepEqual(await spotAll('Earlier White played Nf3 to develop. ', older), []);
    assert.deepEqual(older.line, []);
    const future = new Spotter(root, { plies });
    await spotAll('If White plays Ba4 the bishop keeps the pin. ', future);
    assert.deepEqual(future.line, ['Ba4']);
});

test('a wrong "just played" is corrected with the real last move', async () => {
    const { root, plies } = ruy();
    const notes = await spotAll('Black just played ...Nf6 to hit e4. ', new Spotter(root, { plies }));
    assert.equal(notes.length, 1);
    assert.match(notes[0].text, /\.\.\.a6/);
    assert.doesNotMatch(notes[0].text, /Board after/);
});

test('timed questions are answered on the board they name, or not at all', () => {
    const { root, plies } = ruy();
    const ask = q => timeQuestion(q, { rootFen: root, plies });
    assert.match(ask('After Bxc6, is the bishop on c6 attacked?').text, /^Board after Bxc6: .*attacked by pawn b7 and pawn d7/);
    assert.match(ask('Is e5 defended after Nxe5?').text, /^Board after Nxe5: White's knight on e5 is attacked by knight c6/);
    assert.deepEqual(ask('After Bxf7, is the king safe?'), { skip: true });
    assert.match(ask('Before ...a6, was the bishop on b5 attacked?').text, /^Board before the last move \.\.\.a6: .*attacked by nothing/);
    assert.deepEqual(ask('Was the bishop on b5 attacked?'), { skip: true });
    assert.match(ask('Is the bishop on b5 attacked right now?').text, /^Current board: .*attacked by pawn a6/);
    assert.match(ask('What did Black just play?').text, /\.\.\.a6/);
});

test('a question inside an imagined line is skipped when the line and the real board disagree', async () => {
    const { root, plies } = ruy();
    const spotter = new Spotter(root, { plies });
    const text = 'If Bxc6 dxc6 then White can think. After Nxe5, is the knight on e5 attacked? ';
    await spotAll(text.slice(0, 30), spotter);
    // Inside the line the c6 knight is gone, on the real board it still hits e5. Either answer could land on the wrong board.
    assert.equal(selfQuestion(text, 30, spotter), null);
    // "right now" pins it to the real board even mid-line.
    const now = 'If Bxc6 dxc6 then hmm. Is the bishop on b5 attacked right now? ';
    const other = new Spotter(root, { plies });
    await spotAll(now.slice(0, 22), other);
    assert.match(selfQuestion(now, 22, other).text, /^Current board: .*attacked by pawn a6/);
});

test('a wrong claim about the current board is corrected, true claims and claims after a line are left alone', () => {
    const { root } = ruy();
    assert.match(currentClaim('Hmm. The knight on c6 is undefended right now. ', 0, root).text, /^Current board: .*defended by pawn b7 and pawn d7/);
    assert.equal(currentClaim('Hmm. The bishop on b5 is undefended right now. ', 0, root), null);
    assert.equal(currentClaim('Bxc6 dxc6 is interesting. The knight on c6 is undefended. ', 0, root), null);
});

test('plain "now" means the current board only when nothing nearby points at another board', async () => {
    const { root, plies } = ruy();
    // Current board: a plain "now" claim or question is checked on the board on screen.
    assert.match(currentClaim('Hmm. The knight on c6 is now undefended. ', 0, root).text, /^Current board: .*defended by pawn b7 and pawn d7/);
    assert.match(currentClaim('Hmm. Now the knight on c6 is undefended. ', 0, root).text, /^Current board: /);
    assert.equal(currentClaim('Hmm. The knight on c6 is now defended. ', 0, root), null, 'true claims stay quiet');
    const plainQ = 'Let me see. Is the bishop on b5 attacked now? ';
    assert.match(selfQuestion(plainQ, 0, new Spotter(root, { plies })).text, /^Current board: .*attacked by pawn a6/);
    // Future board: after a described move, "now" is the board after it.
    assert.equal(currentClaim('The bishop goes back to a4. The knight on c6 is now undefended. ', 0, root), null);
    assert.equal(currentClaim('Bxc6 dxc6 is interesting. The knight on c6 is now undefended. ', 0, root), null);
    assert.equal(currentClaim('Hmm. Now that the bishop takes, the knight on c6 is undefended. ', 0, root), null);
    assert.match(timeQuestion('After Bxc6 dxc6, is the pawn on e5 now defended?', { rootFen: root, plies }).text, /^Board after Bxc6 \.\.\.dxc6: /);
    const midLine = 'If Bxc6 dxc6 then hmm. Is the knight on c6 attacked now? ';
    const inLine = new Spotter(root, { plies });
    await spotAll(midLine.slice(0, 22), inLine);
    assert.equal(selfQuestion(midLine, 22, inLine), null, 'mid-line "now" could be either board, so nothing is said');
    // Past board: "now" next to a look back, or "just now" / "until now", is not the current board.
    assert.equal(currentClaim('Earlier the game was quiet. The knight on c6 is now undefended. ', 0, root), null);
    assert.equal(currentClaim('Hmm. The knight on c6 is just now undefended. ', 0, root), null);
    assert.equal(currentClaim('Hmm. Until now the knight on c6 is undefended. ', 0, root), null);
    assert.deepEqual(timeQuestion('Was the bishop on b5 attacked until now?', { rootFen: root, plies }), { skip: true });
});

test('a played-move question gets the real game history note while thinking', async () => {
    const { root, history } = ruy();
    const prompts = [];
    const script = [
        [{ content: 'The user is asking about the move that was played in the game. ', tokens: [1] }, { content: 'Let me look.', tokens: [2] }],
        [{ content: 'Fine.', tokens: [3] }, { content: '', tokens: [200010] }],
        [{ content: 'It kicks the bishop.', tokens: [4], stop: true }]
    ];
    const complete = async ({ prompt, onData }) => { prompts.push(prompt); for(const event of script[prompts.length - 1] || []) onData(event); };
    const checks = [];
    await liveThinking({ complete, prompt: 'P', rootFen: root, question: '(played a6)', history, thinkBudget: 300, answerBudget: 100, room: 4000, onCheck: n => checks.push(n) });
    assert.ok(checks.some(n => /From a6 it attacks the bishop on b5/.test(n)));
    assert.ok(prompts.some(p => /\[Rule-checked, real game history\./.test(p)));
    assert.ok(!prompts.some(p => /\[Rule-checked future board[^\]]*a6/.test(p)));
});

test('history questions get the moves so far and past-tense notes, other questions get none', () => {
    const { root, history } = ruy();
    const older = historyNotes('Why did I play Bb5 earlier?', history, root);
    assert.match(older, /^Moves so far \(H, already played\): 1\.e4 e5 2\.Nf3 Nc6 3\.Bb5 a6\./);
    assert.match(older, /move 3\.Bb5 by White.*Right after it, from b5 it attacked the knight on c6\..*none of this describes the current board/);
    assert.doesNotMatch(older, /it attacks/);
    assert.match(historyNotes('What happened on move 2?', history, root), /2\.Nf3 by White[\s\S]*2\.\.\.Nc6 by Black/);
    for(const question of ['Should I play Nf3?', 'Is Bxc6 good?', 'What should I do now?', '(played a6)'])
        assert.equal(historyNotes(question, history, root), '', question);
});

test('a past marker covers the move right after it, not a square named later in the sentence', () => {
    const text = "asking about Black's last move a6, attacking the bishop on b5";
    assert.deepEqual(pastMention(text, text.indexOf('a6'), text.indexOf('a6') + 2), { strong: true });
    assert.equal(pastMention(text, text.lastIndexOf('b5'), text.lastIndexOf('b5') + 2), null);
});

test('a retreat that keeps its target says so', async () => {
    const { root } = ruy();
    const chess = new Chess(root), move = chess.move('Ba4');
    const note = await factsAfter(['Ba4'], chess, move, root, { force: true });
    assert.match(note, /From a4 it still attacks the knight on c6\./);
    assert.match(note, /It no longer attacks the pawn on a6\./);
});

test('the same self-question asked twice is answered once', async () => {
    const { root, history } = ruy();
    const prompts = [];
    const ask = 'Hmm, let me check the board first. Is the bishop on b5 attacked right now?';
    const script = [[{ content: ask, tokens: [1] }], [{ content: ` Okay. ${ask}`, tokens: [2] }], [{ content: ' Fine.', tokens: [3] }, { content: '', tokens: [200010] }],
        [{ content: 'It is.', tokens: [4], stop: true }]];
    const complete = async ({ prompt, onData }) => { prompts.push(prompt); for(const event of script[prompts.length - 1] || []) onData(event); };
    const checks = [];
    await liveThinking({ complete, prompt: 'P', rootFen: root, question: 'What now?', history, thinkBudget: 300, answerBudget: 100, room: 4000, onCheck: n => checks.push(n) });
    assert.equal(checks.filter(n => /^Current board: White's bishop on b5 is attacked by pawn a6/.test(n)).length, 1);
});

test('a wrong move claim made after the note gets a correction mid-thought', async () => {
    const root = 'r2qr1k1/ppp2p1p/6p1/1N1B4/1P6/P3b2P/1BP4P/1K1R4 b - - 1 19';
    const prompts = [];
    // The move note comes first, then Inkling ignores it and claims the bishop takes, which the monitor catches.
    const script = [[{ content: 'Rooks belong on open files here. What about ...Re5? ', tokens: [1] }],
        [{ content: 'Fine. So ...Re5 can be taken by the bishop on d5. ', tokens: [2] }],
        [{ content: 'Right, Bxe5 then.', tokens: [3] }, { content: '', tokens: [200010] }], [{ content: 'Keep the rook on e8.', tokens: [4], stop: true }]];
    const complete = async ({ prompt, onData }) => { prompts.push(prompt); for(const event of script[prompts.length - 1] || []) onData(event); };
    const checks = [];
    const result = await liveThinking({ complete, prompt: 'P', rootFen: root, question: 'Where should my rook go?', thinkBudget: 300, answerBudget: 100, room: 4000, onCheck: n => checks.push(n) });
    assert.ok(checks.includes('Board after ...Re5: the bishop on d5 cannot take the rook on e5. White can take it with Bxe5.'));
    assert.match(result.thought, /bishop on d5\.\n\[Rule-checked, Board after \.\.\.Re5: /);
});

test('bare evidence ids are cleaned out of answers', () => {
    assert.equal(cleanEvidenceTalk('F1: Your king is safe. L1/L2 point to Nd5 as best.'), 'Your king is safe. The engine lines point to Nd5 as best.');
    assert.equal(cleanEvidenceTalk('The rook pins it (F7, F11'), 'The rook pins it');
    assert.equal(cleanEvidenceTalk('Play Rf1 and then e4.'), 'Play Rf1 and then e4.');
    assert.equal(cleanEvidenceTalk('The outcome is not proven by the supplied lines.'), 'The outcome is not proven by the engine lines.');
});
