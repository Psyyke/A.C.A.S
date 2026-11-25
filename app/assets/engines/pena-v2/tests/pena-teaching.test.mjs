import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Chess } from '../../libraries/chessjs/chess.js';
import { teachingCues, narrationParts, narrationPhrases, compileTeaching, teachingPreview } from '../narration.js';
import { variationFrames } from '../teacher.js';
import { TeachingContext } from '../teaching-context.js';
import { factSheet, sanLine } from '../factsheet.js';
import { assessChatReply, answerChat } from '../chat-reply.js';
import { conceptVisuals, chatSheet, PenaConversation, citationSteps } from '../conversation.js';
import { definitionReply } from '../glossary.js';
import { markCitations, stripMarkers, sentenceCitations, citationFacts } from '../cited-evidence.js';

const start = new Chess().fen();
const cueFor = (text, phrase, fen, context = text, options = {}) => teachingCues(text, fen, context, options)
    .find(cue => cue.index <= text.indexOf(phrase) && cue.end >= text.indexOf(phrase) + phrase.length);

test('pins, attacks and defenses pick each side and piece from the verb and the board', () => {
    // Black's bishop on g4 pins the f3 knight to the d1 queen, and White also has a knight on c3.
    const fen = 'rn1qkbnr/ppp2ppp/3p4/4p3/4P1b1/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 2 4';
    const squares = (text, phrase) => cueFor(text, phrase, fen, text, { rootColor: 'w' })?.references.squares;
    for(const [text, expected] of [
        ["Black's bishop on g4 pins your knight to the queen.", { 'your knight': ['f3'], 'the queen': ['d1'] }],
        ['The bishop pins the knight to the queen.', { 'The bishop': ['g4'], 'the knight': ['f3'], 'the queen': ['d1'] }],
        ['Your knight is pinned to the queen.', { 'Your knight': ['f3'], 'the queen': ['d1'] }],
        ["Black's bishop attacks the knight.", { "Black's bishop": ['g4'], 'the knight': ['f3'] }]
    ]) for(const [phrase, value] of Object.entries(expected)) assert.deepEqual(squares(text, phrase), value, `${text} → ${phrase}`);
    const pin = cueFor("Black's bishop on g4 pins your knight to the queen.", 'pins', fen, undefined, { rootColor: 'w' });
    assert.deepEqual(pin.references.relations.map(pair => [...pair]), [['g4', 'f3'], ['f3', 'd1']]);
});

test('challenging a piece keeps the opposing target through the narrated continuation', () => {
    const fen = '8/5pk1/p5p1/1p1p1r1p/8/bP3B1P/3R1PK1/8 w - - 0 5';
    const text = 'Black just took your a3 pawn, so your rook is the one that can challenge that bishop. '
        + 'Ra2 hits it right away, though Bb4 keeps it safe and then your rook can grab a6.';
    const compiled = compileTeaching(text, fen);
    const bishop = compiled.mentions.find(mention => text.slice(mention.index, mention.end) === 'that bishop');
    assert.equal(bishop.status, 'resolved');
    assert.deepEqual(bishop.entities.map(piece => [piece.square, piece.color]), [['a3', 'b']]);
    assert.deepEqual(cueFor(text, 'that bishop', fen).references.squares, ['a3']);
    assert.deepEqual(cueFor(text, 'hits', fen).references.relations, [['a2', 'a3']]);
    assert.deepEqual(cueFor(text, 'Bb4', fen).references.moves, [['a3', 'b4']]);
    assert.deepEqual(compiled.mentions.filter(mention => mention.kind === 'piece').at(-1).entities.map(piece => piece.square), ['a2']);
});

test('challenge references respect active and passive roles, explicit owners and either player color', () => {
    const fen = '8/5pk1/p5p1/1p1p1r1p/8/bP3B1P/3R1PK1/8 w - - 0 5';
    for(const rootColor of ['w', 'b']) {
        const own = rootColor === 'w' ? 'f3' : 'a3', enemy = rootColor === 'w' ? 'a3' : 'f3';
        for(const [text, expected] of [
            ['Your rook can challenge that bishop.', enemy],
            ['Your rook confronts the bishop.', enemy],
            ['Your rook is challenged by that bishop.', enemy],
            ['Your rook is challenged alongside your bishop.', own],
            ['Your rook can challenge your bishop.', own],
            ['Your rook can protect that bishop.', own]
        ]) {
            const mention = new TeachingContext(text, fen, { rootColor }).results.at(-1);
            assert.deepEqual(mention.entities.map(piece => piece.square), [expected], `${rootColor}: ${text}`);
        }
    }
    const text = 'Your rook on a2 challenges that bishop and attacks it.';
    const after = new Chess(fen); after.move('Ra2');
    assert.deepEqual(cueFor(text, 'attacks', after.fen(), text, { rootColor: 'w' }).references.relations, [['a2', 'a3']]);
    for(const text of ['Your rook can challenge that bishop.', 'Your rook can maneuver against that bishop.'])
        assert.equal(cueFor(text, 'that bishop',
            '4k3/8/8/8/8/b4b2/8/3RK3 w - - 0 1'), undefined,
            'Two enemy bishops must remain ambiguous without a distinguishing reference');
});

test('directed actions resolve their target against the actor across different wording', () => {
    const fen = '8/5pk1/p5p1/1p1p1r1p/8/bP3B1P/3R1PK1/8 w - - 0 5';
    for(const rootColor of ['w', 'b']) {
        const own = rootColor === 'w' ? 'f3' : 'a3', enemy = rootColor === 'w' ? 'a3' : 'f3';
        for(const [text, expected] of [
            ['Your rook can drive away that bishop.', enemy],
            ['Your rook can chase that bishop off.', enemy],
            ['Your rook can force that bishop back.', enemy],
            ['Your rook can trade for that bishop.', enemy],
            ['Your rook can exchange for that bishop.', enemy],
            ['Your rook is driven off by that bishop.', enemy],
            ['Your rook can remove that bishop.', enemy],
            ['Your rook can maneuver against that bishop.', enemy],
            ['Your rook is outplaying that bishop.', enemy],
            ['Your rook can support that bishop.', own],
            ['Your rook can protect that bishop.', own],
            ['Your rook can keep that bishop safe.', own],
            ['Your rook can challenge your bishop.', own]
        ]) {
            const mention = new TeachingContext(text, fen, { rootColor }).results.at(-1);
            assert.deepEqual(mention.entities.map(piece => piece.square), [expected], `${rootColor}: ${text}`);
        }
    }

    const after = new Chess(fen); after.move('Ra2');
    const text = 'Your rook on a2 challenges that bishop.';
    assert.deepEqual(cueFor(text, 'that bishop', after.fen(), text, { rootColor: 'w' })
        .references.relations, [['a2', 'a3']]);
});

test('stranded words join the highlight they lead into, in text and in speech', () => {
    const fen = 'rn1qkbnr/ppp2ppp/3p4/4p3/4P3/2N2b2/PPPP1PPP/R1BQKB1R w KQkq - 0 5';
    const text = "Black's bishop on f3 is attacking your queen on d1, so you have to deal with it.";
    const parts = narrationParts(text, fen, text, { rootColor: 'w' });
    assert.ok(parts.some(part => part.cue && part.text.startsWith('is attacking your queen on d1')), JSON.stringify(parts.map(part => part.text)));
    const phrases = narrationPhrases('The pawn on e4 is strong, so d4 is a natural follow-up.', fen, undefined, { rootColor: 'w' });
    assert.ok(phrases.every(phrase => phrase.text.split(/\s+/).length > 1), JSON.stringify(phrases.map(phrase => phrase.text)));
    assert.ok(phrases.some(phrase => phrase.text.startsWith('so d4')));
});

test('prevented threats stay on their original board rather than following the defensive move', () => {
    const fen = '3qk3/8/8/8/8/8/8/3QK3 w - - 0 1';
    for(const text of ["Qe2 stops Black's threat Qd7.", 'Qe2 stops Qd7.']) {
        const compiled = compileTeaching(text, fen, text, { rootColor: 'w' });
        const cue = compiled.cues.find(cue => text.slice(cue.index, cue.end) === 'Qd7');
        assert.ok(cue, text);
        assert.equal(cue.positionFen.split(' ')[0], fen.split(' ')[0], text);
        const arrows = [...cue.references.moves, ...cue.references.plans.map(plan => [plan.from, plan.to])];
        assert.deepEqual(arrows.map(pair => [...pair]), [['d8', 'd7']], text);
    }
});

test('teaching keeps named and pronominal piece identities across clauses and moves', () => {
    const text = 'Your knight on b1 guards d2. That knight can develop later, while your other knight is already active.';
    const board = new Chess(); board.move('Nf3');
    const fen = board.fen();
    assert.deepEqual(cueFor(text, 'That knight', fen, text, { rootColor: 'w' }).references.squares, ['b1']);
    assert.deepEqual(cueFor(text, 'your other knight', fen, text, { rootColor: 'w' }).references.squares, ['f3']);
    const after = 'It controls d4.';
    const context = 'Nf3. Your knight on f3 is active. ' + after;
    assert.deepEqual(cueFor(after, 'It', start, context, { rootColor: 'w' }).references.squares, ['f3']);
    assert.deepEqual(cueFor(after, 'd4', start, context, { rootColor: 'w' }).references.relations.map(pair => [...pair]), [['f3', 'd4']]);
    const followUp = 'Your knight needs development.';
    assert.deepEqual(cueFor(followUp, 'Your knight', start, 'Nf3. Your knight on b1 guards d2. ' + followUp, { rootColor: 'w' })
        .references.squares, ['b1'], 'A newer named subject beats an older moved piece of the same type');
});

test('guards and coordinated targets visualize the actual actor and not the defended piece', () => {
    const fen = '7k/8/8/3N4/8/5N2/8/K7 w - - 0 1';
    for(const verb of ['guards', 'defends', 'protects', 'supports', 'covers', 'controls']) {
        const text = `Your knight on f3 ${verb} d4 and e5.`;
        const cue = cueFor(text, verb, fen, text, { rootColor: 'w' });
        assert.deepEqual(cue.references.relations, [['f3', 'd4'], ['f3', 'e5']], text);
        assert.deepEqual(cueFor(text, 'd4', fen).references.relations, [['f3', 'd4']], text);
    }
    const guarded = 'Your knight on f3 guards your knight on d4.';
    const position = '7k/8/8/8/3N4/5N2/8/K7 w - - 0 1';
    assert.deepEqual(cueFor(guarded, 'guards', position).references.relations, [['f3', 'd4']]);
    assert.deepEqual(cueFor(guarded, 'your knight on d4', position).references.relations, [['f3', 'd4']]);
    assert.equal(cueFor('Your knight on f3 does not guard d4.', 'guard', fen), undefined);
});

test('a named side in the clause scopes otherwise unnamed pieces', () => {
    const fen = '3q3k/8/8/8/8/8/8/K2Q4 w - - 0 1';
    for(const text of ['Black can improve the queen.', 'The opponent can improve the queen.']) {
        assert.deepEqual(cueFor(text, 'the queen', fen, text, { rootColor: 'w' }).references.squares, ['d8'], text);
    }
    const explicit = 'Black attacks your queen on d1.';
    assert.deepEqual(cueFor(explicit, 'your queen on d1', fen, explicit, { rootColor: 'w' }).references.squares, ['d1']);
    const check = "You're in check from the bishop on c7, which also hits your rook on d8.";
    const checked = '1k1r3r/ppB5/2p2n2/7p/3P4/1BP3PP/PP3P2/R4RK1 b - - 0 24';
    assert.deepEqual(cueFor(check, 'the bishop on c7', checked, check, { rootColor: 'b' }).references.squares, ['c7']);
    assert.deepEqual(cueFor(check, 'hits', checked, check, { rootColor: 'b' }).references.relations, [['c7', 'd8']]);
});

test('a suggested move does not relocate explicitly named live pieces in a later explanation', () => {
    const fen = 'rn2k2r/pp2nppp/1qp5/3p1Q2/1P1P4/R1P1P3/6PP/2B1K1NR w Kkq - 1 16';
    const text = "I would play Qg5. Your queen on f5 is hanging to Black's knight on e7.";
    const cue = cueFor(text, 'Your queen on f5', fen, text, { rootColor: 'w' });
    assert.deepEqual(cue.references.squares, ['f5']);
    assert.equal(cue.positionFen, fen);
    const future = 'Qg5. After that, your queen on f5 is active.';
    assert.equal(cueFor(future, 'your queen on f5', fen, future, { rootColor: 'w' }), undefined);
});

test('alternative moves in one sentence restart from the same live board', () => {
    const fen = 'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR b KQkq - 1 3';
    const text = 'Nf6 is the natural move here, though Bb4, pinning the knight, is just as good.';
    const frames = variationFrames(text, fen, { rootColor: 'w' });
    assert.deepEqual(frames.map(frame => [frame.san, frame.beforeFen]), [['Nf6', fen], ['Bb4', fen]]);
    assert.deepEqual(cueFor(text, 'Bb4', fen).references.moves, [['f8', 'b4']]);
});

test('an observed pawn push is a played recap, not an invented plan from the new board', () => {
    const board = new Chess();
    board.move('d4'); board.move('d5');
    const beforeFen = board.fen();
    board.move('c4');
    const fen = board.fen(), text = 'Your c4 push challenges d5.';
    const cue = cueFor(text, 'c4', fen, text, { rootColor: 'w', beforeFen });
    assert.deepEqual(cue.references.moves, [['c2', 'c4']]);
    assert.equal(cue.references.frames[0].kind, 'historical');
    assert.equal(cue.references.plans.length, 0);
    const planned = compileTeaching('Preparing a c4 push.', fen, undefined, { rootColor: 'w', beforeFen });
    assert.equal(planned.frames.length, 0);
    assert.ok(planned.cues.every(cue => cue.references.moves.length === 0));
});

test('a named capturer does not change the captured piece to the capturer side', () => {
    const fen = 'r3kb1r/1p3ppp/2b1p3/1p2P3/P2P3P/8/2P5/R1B1K2R b KQkq - 0 18';
    const text = 'After 18...Bxh1, Black has captured that rook and is winning.';
    assert.deepEqual(cueFor(text, 'that rook', fen, text, { rootColor: 'b' }).references.squares, ['h1']);
    const wrong = "After 18...Bxh1, Black has captured Black's rook.";
    const compiled = compileTeaching(wrong, fen, wrong, { rootColor: 'b' });
    assert.equal(compiled.mentions.find(mention => mention.kind === 'piece').status, 'contradicted');
    assert.ok(compiled.mentions.filter(mention => mention.kind === 'piece' && mention.status === 'resolved')
        .every(mention => mention.entities.length > 0));
});

test('live prose binds explicit key squares and pin victims instead of unrelated previous pieces', () => {
    const fen = 'rn2kb1r/ppp1pppp/5n2/q7/3P2b1/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 4 6';
    const text = "Black's queen on a5 pins your knight on c3 to your king on e1.";
    const cue = cueFor(text, 'pins', fen, text, { rootColor: 'w' });
    assert.deepEqual(cue.references.regions.flatMap(region => region.squares), ['c3']);
    assert.deepEqual(cue.references.relations.map(pair => [...pair]), [['a5', 'c3'], ['c3', 'e1']]);
    const key = 'The key squares are e5 and d4.';
    const context = "Black's bishop on c5 is active. " + key;
    const italian = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    assert.deepEqual(cueFor(key, 'key squares', italian, context).references.regions.flatMap(region => region.squares), ['e5', 'd4']);
});

test('live guard wording handles passive defenders, mutual support and undeveloped groups', () => {
    const fen = 'rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4';
    const text = "Black's d5 pawn is guarded by e6 and the knight on f6.";
    assert.deepEqual(cueFor(text, 'guarded', fen, text, { rootColor: 'w' }).references.relations, [['e6', 'd5'], ['f6', 'd5']]);
    const square = 'e6 is guarded by f7.';
    assert.deepEqual(cueFor(square, 'guarded', fen).references.relations, [['f7', 'e6']]);
    const chain = "Black's f7 pawn is the base of that chain.";
    assert.deepEqual(cueFor(chain, 'chain', fen, chain, { rootColor: 'w' }).references.relations.map(pair => pair.join('')).sort(), ['e6d5', 'f7e6']);
    const ruy = 'r1bqk2r/2ppbppp/p1n2n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1 b kq - 1 7';
    const group = 'White has two minor pieces still at home.';
    assert.deepEqual(cueFor(group, 'two minor pieces', ruy, group, { rootColor: 'b' }).references.squares.sort(), ['b1', 'c1']);
});

test('teaching does not substitute unrelated pieces for an ambiguous singular or a false property', () => {
    const board = new Chess(); board.move('Nf3');
    const text = 'Your knight is useful.';
    assert.equal(cueFor(text, 'Your knight', board.fen(), text, { rootColor: 'w' }), undefined);
    const named = 'The undefended knight on d7 is a target.';
    const fen = '7k/3n4/8/5b2/8/8/8/K2R4 w - - 0 1';
    assert.ok(!teachingCues(named, fen).flatMap(cue => cue.references.regions).some(region => /Undefended/.test(region.label)));
    const pinned = '4k3/4b3/8/8/1N6/8/8/4R2K w - - 0 1';
    const hanging = position => teachingCues('Your knight on b4 is hanging.', position, undefined, { rootColor: 'w' })
        .flatMap(cue => cue.references.regions).filter(region => /Hanging/.test(region.label));
    assert.deepEqual(hanging(pinned), [], 'A pinned geometric attacker cannot legally take the knight');
    assert.deepEqual(hanging(pinned.replace('4R2K', '7K')).flatMap(region => region.squares), ['b4']);
});

test('teaching binds a pin to its described subject instead of drawing every pin', () => {
    const fen = '3q3k/3n2b1/8/8/1b6/2N5/8/3RK3 w - - 0 1';
    const text = 'Your knight on c3 is pinned.';
    const cue = cueFor(text, 'pinned', fen, text, { rootColor: 'w' });
    assert.deepEqual(cue.references.regions.flatMap(region => region.squares), ['c3']);
    assert.deepEqual(cue.references.relations.map(pair => [...pair]), [['b4', 'c3'], ['c3', 'e1']]);
    assert.ok(!teachingCues('Your knight on c3 is not pinned.', fen, undefined, { rootColor: 'w' })
        .flatMap(cue => cue.references.regions).some(region => /Pinned/.test(region.label)));
});

test('property cues bind pronouns and predicate wording to the discussed piece, not board-wide matches', () => {
    const fen = '7k/3n4/2p5/1B6/8/8/8/K2R4 w - - 0 1';
    for(const text of [
        'The knight on d7 looks completely undefended.',
        'The knight on d7 is a target. It is undefended.',
        "The knight on d7 is a target. It's undefended.",
        'The knight on d7 is a target. It is hanging.',
        'Your rook on d1 attacks the knight on d7, which is undefended.',
        'Your rook on d1 attacks the knight on d7, leaving it unprotected.',
        'The knight on d7 is a target. That piece is undefended.'
    ]) {
        const phrase = text.match(/undefended|unprotected|hanging/)[0];
        const cue = cueFor(text, phrase, fen, text, { rootColor: 'w' });
        assert.deepEqual(cue?.references.regions.flatMap(region => region.squares), ['d7'], text);
        assert.ok(cue.references.relations.every(([, to]) => to === 'd7'), text);
    }
    const followUp = 'It is undefended.';
    assert.deepEqual(cueFor(followUp, 'undefended', fen, followUp, { rootColor: 'w',
        antecedent: 'The knight on d7 is a target.' })?.references.regions.flatMap(region => region.squares), ['d7']);
    const move = 'Nh3 leaves it undefended.';
    assert.deepEqual(cueFor(move, 'undefended', '7k/8/8/8/8/8/8/KN4N1 w - - 0 1', move, { rootColor: 'w' })
        ?.references.regions.flatMap(region => region.squares), ['h3']);
    const attacked = "Your bishop on f4 needs protection. Black's Nh5 attacks it, leaving it undefended.";
    assert.deepEqual(cueFor(attacked, 'undefended', '4k3/8/5n2/8/5B2/8/8/4K3 w - - 0 1', attacked, { rootColor: 'w' })
        ?.references.regions.flatMap(region => region.squares), ['f4'], 'An object pronoun keeps its target across an enemy move');
    const pawnText = 'The pawn on a2 needs attention. It is isolated.';
    assert.deepEqual(cueFor(pawnText, 'isolated', '7k/8/2p5/8/8/8/P7/K7 w - - 0 1', pawnText, { rootColor: 'w' })
        ?.references.regions.flatMap(region => region.squares), ['a2']);
});

test('a property or citation cannot replace an already identified piece with a different matching piece', () => {
    const fen = '7k/3n4/2p5/5b2/8/5n2/8/K2R4 w - - 0 1';
    const citations = [{ id: 'F1', fact: { kind: 'hanging', side: 'b', references: {
        regions: [{ label: 'Hanging', squares: ['f3'] }]
    } } }];
    for(const suffix of ['That undefended knight is a target.', 'That knight is undefended.']) {
        const text = 'The knight on d7 is a target. ' + suffix;
        const cue = cueFor(text, suffix.startsWith('That undefended') ? 'That undefended knight' : 'That knight', fen, text,
            { rootColor: 'w', citations });
        assert.deepEqual(cue?.references.squares, ['d7'], text);
        assert.deepEqual(teachingCues(text, fen, text, { rootColor: 'w', citations })
            .flatMap(cue => cue.references.regions).filter(region => /Undefended/.test(region.label)), [], text);
    }
});

test('unresolved property subjects stay unresolved while explicit plural subjects still visualize their set', () => {
    const fen = '7k/3n4/2p5/8/8/5n2/8/K2R4 w - - 0 1';
    for(const text of ['It is undefended.', 'The knight looks completely undefended.',
        'The knights are targets. It is undefended.']) {
        assert.deepEqual(teachingCues(text, fen, text, { rootColor: 'w' })
            .flatMap(cue => cue.references.regions).filter(region => /Undefended/.test(region.label)), [], text);
    }
    const plural = 'The undefended black knights are targets.';
    assert.deepEqual(cueFor(plural, 'undefended', fen, plural, { rootColor: 'w' })?.references.regions
        .flatMap(region => region.squares).sort(), ['d7', 'f3']);
});

test('chat concept enrichment uses the same predicate subject without suppressing useful prose', () => {
    const record = { fen: '7k/3n4/2p5/8/8/5n2/8/K2R4 w - - 0 1', engine: { lines: [] } };
    const sheet = chatSheet(record, { playerColor: 'w' });
    for(const text of ['It is undefended.', 'The knight needs attention. It is undefended.']) {
        const checked = conceptVisuals(assessChatReply(text, sheet, { record }), sheet);
        assert.equal(checked.text, text);
        assert.ok(!checked.citations.some(({ fact }) => fact.kind === 'hanging'), text);
    }
    const text = 'Your rook on d1 attacks the knight on d7. It is undefended.';
    const checked = conceptVisuals(assessChatReply(text, sheet, { record }), sheet);
    assert.equal(checked.text, text);
    assert.deepEqual(checked.sentences.at(-1).citations.filter(({ fact }) => fact.kind === 'hanging')
        .flatMap(({ fact }) => fact.references.regions.flatMap(region => region.squares)), ['d7']);
    const last = checked.sentences.at(-1);
    assert.deepEqual(cueFor(last.text, 'undefended', record.fen, checked.text,
        { rootColor: 'w', citations: last.citations })?.references.regions.flatMap(region => region.squares), ['d7']);
});

test('opponent move ownership survives adjectives, ellipses, numbered replies and independent branches', () => {
    const fen = '4k3/8/5n2/8/5B2/8/8/4K3 w - - 0 1';
    for(const prefix of ["Black's strongest reply is", "The opponent's idea is", 'Black responds with', '1...']) {
        const text = `${prefix} Nh5, attacking your bishop on f4.`;
        const cue = cueFor(text, 'Nh5', fen, text, { rootColor: 'w' });
        assert.deepEqual(cue?.references.moves, [['f6', 'h5']], text);
        assert.ok(cue.references.frames.every(frame => frame.kind === 'hypothetical'));
    }
    const text = 'After Qh5 e5, that line fails. Instead, Nf3 develops your knight.';
    assert.deepEqual(variationFrames(text, start).map(frame => frame.san), ['Nf3']);
    assert.ok(variationFrames(text, start).unresolved.length > 0);
    const checked = '4r2k/8/8/8/2n5/5N2/8/4K3 w - - 0 1';
    assert.ok(new Chess(checked).move('Ne5'), 'A same-SAN player move can evade check');
    assert.equal(variationFrames("Black's Ne5.", checked, { rootColor: 'w' }).length, 0,
        'Never substitute the player move when the named opponent cannot move');
    const line = sanLine(start, ['g1f3', 'd7d5']);
    const reply = compileTeaching("Black's d5 attacks the center.", start, undefined, { rootColor: 'w',
        citations: [{ id: 'L1', fact: { line } }] });
    assert.equal(reply.frames[0].beforeFen, line[1].beforeFen, 'Prefer the supplied reply branch to an invented turn switch');
});

test('move lines keep siblings, skipped replies, victims, threats, numbered history and evidence on the right board', () => {
    const boards = frames => frames.map(frame => [frame.san, frame.kind, frame.beforeFen.split(' ').slice(0, 2).join(' ')]);
    const pawn = '4k3/8/8/8/3p4/4B3/8/3RK3 w - - 0 1';
    assert.deepEqual(boards(variationFrames('Rxd4 or Bxd4 both win the pawn.', pawn, { rootColor: 'w' })).map(([, , board]) => board),
        ['4k3/8/8/8/3p4/4B3/8/3RK3 w', '4k3/8/8/8/3p4/4B3/8/3RK3 w'], '"X or Y" are two choices from one board');
    const walk = variationFrames('Kd2 and Kc2 is too slow.', '8/8/8/8/8/8/p7/4K2k w - - 0 1', { rootColor: 'w' });
    assert.deepEqual(walk.map(frame => frame.san), ['Kd2', 'Kc2'], 'A same-side follow-up skips the reply');
    assert.equal(walk[1].beforeFen.split(' ')[0], '8/8/8/8/8/8/p2K4/7k');
    assert.deepEqual(variationFrames('The bishop can hit b7. Nc3 is still fine.', start).map(frame => frame.san), ['Nc3'],
        'A square before a period is not a move number');
    const knights = '4k3/8/5n2/8/8/2N1B3/8/4K3 w - - 0 1';
    assert.equal(variationFrames('Nd5, hitting your bishop, is the idea.', knights, { rootColor: 'w' })[0].from, 'f6');
    assert.equal(variationFrames('Nd5 is the idea.', knights, { rootColor: 'w' })[0].from, 'c3');

    const mate = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1';
    const threat = 'White threatens Rd8#, so play h6 first.';
    const frames = variationFrames(threat, mate, { rootColor: 'b' });
    assert.deepEqual(frames.map(frame => frame.san), ['h6'], 'A threat never moves the line board');
    assert.deepEqual(frames.ideas.map(idea => [idea.san, idea.kind]), [['Rd8#', 'threat']]);
    const cue = cueFor(threat, 'Rd8#', mate, threat, { rootColor: 'b' });
    assert.deepEqual(cue.references.plans.map(plan => [plan.from, plan.to, plan.color]), [['d1', 'd8', 'w']]);

    const game = new Chess(), history = [start];
    for(const san of ['e4', 'c5', 'Nf3']) { game.move(san); history.push(game.fen()); }
    game.move('d6');
    const past = variationFrames('Your 2...d6 was fine, but 2...Nc6 is more common.', game.fen(), { rootColor: 'b', history });
    assert.deepEqual(past.map(frame => [frame.san, frame.kind, frame.beforeFen]), [['d6', 'historical', history[3]], ['Nc6', 'historical', history[3]]],
        'A numbered move is played only on the board with that number');

    const text = '1. e4 e5 2. Nf3, then Bb5 pins nothing yet.';
    const line = sanLine(start, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5']);
    assert.equal(variationFrames(text, start, { rootColor: 'w', evidence: [line] }).at(-1).beforeFen, line[4].beforeFen,
        'The engine line fills in the reply the prose skipped');
    assert.equal(variationFrames(text, start, { rootColor: 'w' }).at(-1).beforeFen.split(' ')[0], 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R');
    assert.equal(variationFrames('Nf3 develops.', start, { rootColor: 'w', evidence: [line] })[0].beforeFen, start,
        'Evidence lines never replace a legal move on the live board');
});

test('concept words link to the named threat, pin, castled shelter and are skipped when negated', () => {
    const all = (text, fen, rootColor) => teachingCues(text, fen, text, { rootColor });
    const pairs = cues => cues.flatMap(cue => cue.references.relations.map(pair => pair.join('-')));
    const labels = cues => cues.flatMap(cue => cue.references.regions.map(region => region.label));
    const threat = all('Black is threatening Rxg2+.', '1k6/1p2b1R1/p7/2p1p2r/2Ppn3/PP1P3P/5rRK/2B5 w - - 0 38', 'w');
    assert.ok(pairs(threat).includes('f2-g2'));
    assert.ok(threat.some(cue => cue.references.regions.some(region => region.label === 'Threat' && region.squares.includes('g2'))));
    const pin = all("Black's rook on e8 is pinning your bishop to the king.", 'r1b1r3/pppk1p1p/2p2p2/8/8/2N2N2/PP2BPPP/R3K2R w KQ - 1 13', 'w');
    assert.ok(pairs(pin).includes('e8-e2') && pairs(pin).includes('e2-e1'));
    const castled = 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQ1RK1 w - - 6 5';
    const shelter = all('Your king is safely castled.', castled, 'w').flatMap(cue => cue.references.regions)
        .find(region => region.label === 'King shelter');
    assert.ok(shelter?.squares.includes('g1') && !shelter.squares.includes('g8'));
    assert.ok(!labels(all("White can't threaten anything right now.", castled, 'b')).includes('Threat'));
});

test('later file-pawn and home-piece mentions have their own complete visual spans', () => {
    const fen = '4k3/4p3/4p3/8/7P/8/7P/1N2K3 w - - 0 1';
    const text = 'Your h-pawns are doubled. Black has doubled e-pawns. Your knight on b1 is still at home.';
    const compiled = compileTeaching(text, fen, text, { rootColor: 'w' });
    assert.deepEqual(cueFor(text, 'Your h-pawns', fen, text, { rootColor: 'w' }).references.squares.sort(), ['h2', 'h4']);
    assert.deepEqual(cueFor(text, 'doubled e-pawns', fen, text, { rootColor: 'w' }).references.squares.sort(), ['e6', 'e7']);
    assert.ok(compiled.cues.some(cue => text.slice(cue.index, cue.end) === 'at home'
        && cue.references.regions.some(region => region.squares.includes('b1'))));
    const file = 'Your rook uses the half-open a-file.';
    assert.ok(cueFor(file, 'half-open a-file', start).references.regions
        .some(region => region.squares.length === 8 && region.squares.every(square => square[0] === 'a')));
});

test('the knight the player has to take is the enemy knight, not their own', () => {
    const fen = 'r1bqkb1r/pppp1ppp/8/4p3/5B2/3nP3/PPP2PPP/RN1QKBNR w KQkq - 0 5';
    const antecedent = "Black's knight on d3 is annoying, it checks your king and hits b2 and f4.";
    const text = "Yeah, f4 is guarded by e3, so the knight can't take it for free. The real problem is the check, your king has to move or you have to take the knight.";
    for(const options of [{ rootColor: 'w', antecedent }, { rootColor: 'w' }]) {
        const pieces = new TeachingContext(text, fen, options).results
            .filter(result => /knight/i.test(result.name)).flatMap(result => result.entities.map(entity => entity.color + entity.square));
        assert.ok(pieces.length && pieces.every(square => square === 'bd3'), JSON.stringify(pieces));
    }
});
test('the latest player question replaces an old piece antecedent for predicate visuals', () => {
    const fen = 'rnbqk1nr/ppp2ppp/3bp3/3p4/7N/7P/PPPPPPPR/RNBQKB2 b Qkq - 3 4';
    const text = "It's hanging, and your queen on d8 has a clear diagonal to it.";
    const cue = cueFor(text, 'hanging', fen, text, { rootColor: 'b',
        antecedent: 'Your bishop on d6 attacks the rook on h2.', question: 'Is the knight on h4 hanging?' });
    assert.deepEqual(cue.references.regions.flatMap(region => region.squares), ['h4']);
    assert.ok(cue.references.relations.some(([from, to]) => from === 'd8' && to === 'h4'));
    const bare = cueFor("It's hanging.", 'hanging', '7k/8/8/3n4/8/8/3R4/4K3 w - - 0 1',
        "It's hanging.", { rootColor: 'w', question: 'What about d5?' });
    assert.deepEqual(bare.references.regions.flatMap(region => region.squares), ['d5']);
});

test('definition demos and threat ideas preview their own boards, not the preceding line', () => {
    const definition = 'A double check is two pieces checking the king at once.';
    const compiled = compileTeaching(definition, start, definition, { rootColor: 'w' });
    const cue = compiled.cues.find(cue => cue.demo?.fact.term === 'double check');
    assert.ok(cue, 'A generic definition gets a labelled example rather than a guess about this game');
    const preview = teachingPreview(compiled, cue, start);
    assert.match(preview.frames[0].san, /^Example:/);
    const board = new Chess(preview.frames[0].fen);
    assert.equal(board.in_check(), true);
    assert.equal(cue.references.relations.length, 2);
    for(const [from, to] of cue.references.relations)
        assert.ok(board.get(from) && board.get(to)?.type === 'k');
    const steps = citationSteps(cue.demo, start);
    assert.equal(steps[0].references.relations.length, 0, 'Do not draw final tactic relations on the setup board');
    const last = steps.at(-1);
    assert.equal(last.line.frames[last.line.index].fen, cue.positionFen);
    assert.equal(last.references.relations.length, 2);
    const text = 'Black is threatening Rxg2+.';
    const fen = '1k6/1p2b1R1/p7/2p1p2r/2Ppn3/PP1P3P/5rRK/2B5 w - - 0 38';
    const threat = compileTeaching(text, fen, text, { rootColor: 'w' });
    const mentioned = threat.cues.find(cue => cue.references.plans.length);
    assert.equal(mentioned.positionFen.split(' ')[0], fen.split(' ')[0]);
});

test('hidden moves cannot reappear through concept enrichment or castling arrows', () => {
    const board = new Chess(); board.move('e4'); board.move('e5');
    const record = { fen: board.fen(), engine: { lines: [] } };
    const sheet = chatSheet(record, { playerColor: 'w' });
    const pawnBreak = sheet.facts.find(fact => fact.references.moves?.length);
    assert.ok(pawnBreak);
    const checked = assessChatReply('A pawn break helps open lines.', sheet, { record });
    const hidden = conceptVisuals(checked, sheet, { hideMoves: true });
    assert.ok(!hidden.citations.some(citation => citation.fact.references?.moves?.length));
    const cues = teachingCues('Castling helps king safety.', start, undefined, { rootColor: 'w', hideMoves: true });
    assert.ok(!cues.flatMap(cue => cue.references.relations).some(([from]) => from === 'e1' || from === 'h1'));
    assert.ok(cues.flatMap(cue => cue.references.regions).some(region => region.label === 'King shelter'));
});

test('strategic visual recipes draw concrete duties, blocked x-rays, shields, space and infiltration', () => {
    const check = (text, fen, color, label) => {
        const cues = teachingCues(text, fen, text, { rootColor: color });
        const refs = cues.flatMap(cue => cue.references.regions).filter(region => region.label === label);
        assert.ok(refs.length, `${text}: missing ${label}`);
        return { squares: [...new Set(refs.flatMap(region => region.squares))],
            relations: cues.flatMap(cue => cue.references.relations).map(pair => pair.join('-')) };
    };
    const duties = check('Your knight on e5 is overloaded.', '7k/3b4/6b1/4n3/8/8/8/K2R2R1 w - - 0 1', 'b', 'Defensive duties');
    assert.deepEqual(duties.squares.sort(), ['d7', 'e5', 'g6']);
    assert.ok(duties.relations.includes('e5-d7') && duties.relations.includes('e5-g6'));
    const xray = check('Your queen on b7 has an x-ray through the pawn.', '4k3/1q6/8/1p6/8/1Q6/8/4K3 b - - 0 1', 'b', 'X-ray (blocked line)');
    assert.deepEqual(xray.squares.sort(), ['b3', 'b5', 'b7']);
    assert.ok(xray.relations.includes('b7-b3'));
    const shield = check('Your pawn shield protects the king.', '4k3/8/8/8/4q3/8/5PPP/6K1 w - - 0 1', 'w', 'Pawn shield');
    assert.deepEqual(shield.squares.sort(), ['f2', 'g2', 'h2']);
    const developed = new Chess(); developed.move('Nf3');
    const space = check('Your central control matters.', developed.fen(), 'w', 'Central control');
    assert.ok(space.squares.every(square => ['d4', 'e4', 'd5', 'e5'].includes(square)));
    const infiltration = check('Your rook on d7 has infiltrated.', '4k3/3R4/8/8/8/8/8/4K3 w - - 0 1', 'w', 'Pieces in the enemy camp');
    assert.deepEqual(infiltration.squares, ['d7']);
    assert.ok(!teachingCues('Your knight on e5 is not overloaded.', '7k/3b4/6b1/4n3/8/8/8/K2R2R1 w - - 0 1', undefined, { rootColor: 'b' })
        .flatMap(cue => cue.references.regions).some(region => region.label === 'Defensive duties'));
});

test('teaching explains tempo through the move and target without claiming the reply is forced', () => {
    const fen = '4k3/8/5n2/8/5B2/8/8/4K3 b - - 0 1';
    const text = 'Nh5 attacks your bishop on f4 with tempo.';
    const cue = cueFor(text, 'tempo', fen, text, { rootColor: 'w' });
    assert.deepEqual(cue.references.relations.map(pair => [...pair]), [['h5', 'f4']]);
    assert.ok(cue.references.regions.every(region => !/forced/i.test(region.label)));
    assert.deepEqual(narrationParts(text, fen, text, { rootColor: 'w' })
        .filter(part => part.cue).map(part => part.cue.references), teachingCues(text, fen, text, { rootColor: 'w' }).map(cue => cue.references));
});

test('concept enrichment never substitutes an opposite-side fact or hides a second concrete subject', () => {
    const fen = '3q3k/3n2b1/8/8/1b6/2N5/8/3RK3 w - - 0 1';
    const record = { fen, engine: { lines: [] } };
    const sheet = chatSheet(record, { playerColor: 'w' });
    const text = 'Your knight on c3 is pinned. The black knight on d7 is pinned too.';
    const checked = conceptVisuals(assessChatReply(text, sheet, { record }), sheet);
    assert.ok(checked.sentences[1].citations.some(({ fact }) => fact.references.regions.some(region => region.squares.includes('d7'))));
    const wrongSide = { ...sheet, facts: sheet.facts.filter(fact => fact.kind !== 'pin' || fact.side === 'w') };
    const own = conceptVisuals(assessChatReply('Your knight is pinned.', wrongSide, { record }), wrongSide);
    assert.ok(!own.citations.some(({ fact }) => fact.kind === 'pin' && fact.side === 'w'));
});

test('question-focused facts retain the requested file and its concrete purpose under a small note limit', () => {
    const fen = '4r1k1/pp3ppp/2p5/3p4/3Pn3/2PBB3/P4PPP/3R2K1 w - - 0 22';
    const sheet = factSheet(fen, { playerColor: 'w', question: 'Why is opening the d-file important?', limit: 4 });
    assert.ok(sheet.facts.some(fact => fact.kind === 'file plan' && fact.text.includes('d-file') && fact.text.includes('d1')));
    assert.match(sheet.sheet, /d4.*d5|d5.*d4/);
    assert.doesNotMatch(sheet.facts.find(fact => fact.kind === 'file plan').text, /wins|forced|engine prefers/i);
});

test('teaching preserves identity through promotion and castling and reports unresolved references honestly', () => {
    const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
    const text = 'Your pawn on a7 can promote with a8=N. That knight controls b6.';
    const compiled = compileTeaching(text, fen, text, { rootColor: 'w' });
    const pawn = compiled.mentions.find(mention => mention.kind === 'piece' && mention.square === 'a7');
    const knight = compiled.mentions.find(mention => mention.name === 'knight');
    assert.equal(knight.entities[0].id, pawn.entities[0].id);
    assert.deepEqual(knight.entities.map(piece => piece.square), ['a8']);
    const castleFen = '4k3/8/8/8/8/8/8/4K2R w K - 0 1';
    const castleText = 'Your rook on h1 joins in after O-O. That rook is now on f1.';
    const castle = compileTeaching(castleText, castleFen, castleText, { rootColor: 'w' });
    const rooks = castle.mentions.filter(mention => mention.kind === 'piece' && mention.name === 'rook');
    assert.equal(rooks[0].entities[0].id, rooks[1].entities[0].id);
    const enPassant = '7k/8/8/3pP3/8/8/8/K7 w - d6 0 2';
    const capturedText = 'exd6, capturing the undefended pawn on d5.';
    const captured = cueFor(capturedText, 'undefended pawn on d5', enPassant, capturedText, { rootColor: 'w' });
    assert.deepEqual(captured.references.regions.flatMap(region => region.squares), ['d5']);
    const ambiguous = compileTeaching('Your knight is useful. Qh5 is impossible here.', start, undefined, { rootColor: 'w' });
    assert.ok(ambiguous.mentions.some(mention => mention.name === 'knight' && mention.status === 'ambiguous'));
    assert.ok(ambiguous.mentions.some(mention => mention.kind === 'move' && mention.status === 'unsupported'));
});

test('chat applies a surgical checker repair rather than retaining the false clause or deleting its explanation', () => {
    const record = { fen: '3r1rk1/pp1n1p1p/2pPp1p1/4q1P1/1P2N3/P1P5/4BPP1/R2R2K1 w - - 3 13', engine: { lines: [] } };
    const sheet = chatSheet(record, { playerColor: 'w' });
    const checked = assessChatReply('Bf3, where it supports the white pawn on g5 and eyes the kingside.', sheet, { record, player: 'Why Bf3?' });
    assert.match(checked.text, /Bf3, where it eyes the kingside/);
    assert.doesNotMatch(checked.text, /supports.*g5/);
    assert.deepEqual(checked.removed, []);
});

test('a clean non-answer cannot displace a surviving useful explanation during private retries', async () => {
    const record = { fen: start, engine: { lines: [] } };
    const prepared = { record, sheet: chatSheet(record, { playerColor: 'w' }), history: [],
        prompt: 'initial', player: 'Why Nf3?' };
    let calls = 0;
    const runtime = { manifest: { context: 2304 }, tokenCount: () => 100,
        async chat() { return { raw: ++calls === 1 ? 'Nf3 develops your knight and controls d4. Your queen is on d4.' : 'Nice and simple.',
            finishReason: 'stop', tokens: 20 }; } };
    const answer = await answerChat(runtime, start, [], prepared);
    assert.equal(answer.raw, 'Nf3 develops your knight and controls d4.');
    assert.equal(calls, 3);
    assert.ok(answer.quality.removed.some(item => /placement/.test(item.reason)));
});

test('explicit term questions use the checked glossary without replacing board-specific explanations', async () => {
    for(const question of ['What does with tempo mean?', 'What is a tempo?', 'Can you explain a tempo?']) {
        const answer = definitionReply(question);
        assert.match(answer, /^Tempo: one move of time/);
        assert.doesNotMatch(answer, /most useful|does not waste material/);
    }
    for(const question of ['Why does this gain a tempo?', 'What is the best move for king safety?', 'Explain my pawn structure here.', 'What is tempo compared with initiative?'])
        assert.equal(definitionReply(question), null, question);
    const record = { fen: start, engine: { lines: [] } };
    const conversation = new PenaConversation({ engine: {}, tokenCount: text => text.length / 4, context: 4000 });
    conversation.analyse = async () => record;
    const prepared = await conversation.prepare('What does with tempo mean?', { fen: start, playerColor: 'w' });
    assert.match(prepared.directReply, /^Tempo: one move of time/);
    assert.equal(assessChatReply(prepared.directReply, prepared.sheet, { record, player: 'What does with tempo mean?' }).text, prepared.directReply);
});

test('unnamed defender claims resolve the actual pieces and preserve the useful enemy-move explanation', () => {
    const fen = '4k3/8/5n2/8/5B2/8/8/4K3 w - - 0 1';
    const record = { fen, engine: { lines: [] } };
    const sheet = chatSheet(record, { playerColor: 'w' });
    const text = "Black's Nh5 attacks your bishop on f4. Your bishop is defended by the king, so it isn't simply lost.";
    const checked = assessChatReply(text, sheet, { record, player: "What does Black's Nh5 threaten?" });
    assert.match(checked.text, /Nh5 attacks your bishop on f4/);
    assert.doesNotMatch(checked.text, /defended by/);
    assert.match(checked.removed[0].reason, /relation.*e1.*f4/);
    const nearKing = { fen: '4k3/8/5n2/8/5B2/4K3/8/8 w - - 0 1', engine: { lines: [] } };
    assert.equal(assessChatReply('Your bishop on f4 is defended by the king.', chatSheet(nearKing, { playerColor: 'w' }),
        { record: nearKing }).removed.length, 0);
});

test('coverage tooling checks independently specified targets and rejects a wrong target', async t => {
    const folder = await mkdtemp(join(tmpdir(), 'pena-targets-'));
    t.after(() => rm(folder, { recursive: true }));
    const file = join(folder, 'targets.jsonl');
    const samples = [
        { fen: start, playerColor: 'w', text: 'Nf3 develops your knight and controls d4.',
            expected: [{ phrase: 'Nf3', moves: [['g1', 'f3']], fen: start }, { phrase: 'develops your knight', squares: ['f3'] },
                { phrase: 'd4', relations: [['f3', 'd4']] }] },
        { fen: '4k3/8/5n2/8/5B2/8/8/4K3 w - - 0 1', playerColor: 'w', text: "Black's strongest reply is Nh5, attacking your bishop on f4.",
            expected: [{ phrase: 'Nh5', moves: [['f6', 'h5']] }, { phrase: 'your bishop on f4', squares: ['f4'] }] },
        { fen: '6k1/5ppp/8/8/2B5/8/8/6K1 w - - 0 1', playerColor: 'w', text: 'White bishop on c4 controls f7.',
            expected: [{ phrase: 'bishop on c4', squares: ['c4'] }, { phrase: 'f7', relations: [['c4', 'f7']] }] },
        { fen: '6k1/8/8/8/8/8/8/R5K1 w - - 0 1', playerColor: 'w', text: 'The a-file is open.',
            expected: [{ phrase: 'a-file', regionSquares: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'] }] },
        { fen: '7k/8/8/3N4/4P3/8/8/K7 w - - 0 1', playerColor: 'w', text: 'Your knight on d5 sits on an outpost.',
            expected: [{ phrase: 'knight on d5', squares: ['d5'] }, { phrase: 'outpost', regionSquares: ['d5'] }] },
        { fen: '7k/8/8/8/2P5/8/8/K7 w - - 0 1', playerColor: 'w', text: 'Your isolated pawn on c4 needs protection.',
            expected: [{ phrase: 'isolated pawn on c4', squares: ['c4'], regionSquares: ['c4'] }] },
        { fen: '7k/8/3n4/3P4/8/8/8/K7 w - - 0 1', playerColor: 'w', text: 'The knight blockades your pawn.',
            expected: [{ phrase: 'The knight', squares: ['d6'] }, { phrase: 'blockades', relations: [['d6', 'd5']], regionSquares: ['d6', 'd5'] }] },
        { fen: '8/8/4k3/8/4K3/8/8/8 w - - 0 1', playerColor: 'w', text: 'The kings are in opposition.',
            expected: [{ phrase: 'The kings', squares: ['e4', 'e6'] }, { phrase: 'opposition', regionSquares: ['e4', 'e5', 'e6'] }] },
        { fen: 'k7/8/4P3/8/8/8/8/7K w - - 0 1', playerColor: 'w', text: 'A passed pawn heads toward promotion.',
            expected: [{ phrase: 'passed pawn', squares: ['e6'], relations: [['e6', 'e8']] }, { phrase: 'promotion', regionSquares: ['e8'] }] },
        { fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1', playerColor: 'w', text: 'O-O brings the rook into play.',
            expected: [{ phrase: 'O-O', moves: [['e1', 'g1'], ['h1', 'f1']] }, { phrase: 'the rook', squares: ['f1'] }] },
        { fen: '7k/3q4/8/8/8/8/8/K2R4 w - - 0 1', playerColor: 'w', text: 'Rxd7 captures the queen.',
            expected: [{ phrase: 'Rxd7', moves: [['d1', 'd7']] }, { phrase: 'the queen', squares: ['d7'] }] },
        { fen: '4k3/6p1/8/8/8/8/8/4K3 w - - 0 1', playerColor: 'w', text: 'Black can play g5.',
            expected: [{ phrase: 'g5', moves: [['g7', 'g5']] }] },
        { fen: start, playerColor: 'w', text: 'The third rank gives room.',
            expected: [{ phrase: 'third rank', regionSquares: ['a3', 'b3', 'c3', 'd3', 'e3', 'f3', 'g3', 'h3'] }] },
        { fen: '6k1/8/8/8/2B5/8/8/6K1 w - - 0 1', playerColor: 'w', text: 'Your bishop on c4 is not pinned.',
            expected: [{ phrase: 'pinned', squares: [], relations: [], regionSquares: [] }] },
        { fen: '7k/7p/8/8/8/8/PP6/K7 w - - 0 1', playerColor: 'w', text: 'Your extra pawn matters.',
            expected: [{ phrase: 'extra pawn', regionSquares: ['a2', 'b2', 'h7'] }] }
    ];
    const run = () => promisify(execFile)(process.execPath, [fileURLToPath(new URL('./pena-visual-coverage.mjs', import.meta.url)), file, '--assert-targets']);
    await writeFile(file, samples.map(item => JSON.stringify(item)).join('\n'));
    const result = await run();
    assert.match(result.stdout, /Exact annotated targets: 25\/25 \(100.0%\)/);
    assert.match(result.stdout, /opponent: 2\/2/);
    samples[1].expected[0].moves = [['b8', 'h5']];
    await writeFile(file, samples.map(item => JSON.stringify(item)).join('\n'));
    await assert.rejects(run(), /Wrong annotated target/);
});

test('a sentence keeps the lines it cited, so a fresh idea lands on the board the model named', () => {
    const fen = 'rnbq1rk1/ppp1ppbp/3p1np1/8/4P3/3P1N2/PPP1BPPP/RNBQ1RK1 w - - 4 6';
    const flipped = fen.replace(' w ', ' b ');
    const sheet = { byId: { L3: { id: 'L3', line: sanLine(fen, ['b1d2', 'c7c5', 'c2c3']) }, T: { id: 'T', line: sanLine(flipped, ['c7c5']) } } };
    const input = { references: [{ id: 'LC1', kind: 'lc0-line', data: { moves: ['b1c3', 'e7e5'] } }] };
    const tagged = 'The engine likes Nbd2 [L3]. Black would like to play c5 [T], and after Nc3 [LC1.p1] the knight eyes d5 [UNKNOWN].';
    const { marked, ids } = markCitations(tagged, id => id !== 'UNKNOWN');
    const { clean, marks } = stripMarkers(marked, ids);
    assert.equal(clean, 'The engine likes Nbd2. Black would like to play c5, and after Nc3 the knight eyes d5 [UNKNOWN].');
    const sentences = sentenceCitations(clean, marks);
    assert.deepEqual(sentences.map(sentence => sentence.ids), [['L3'], ['T', 'LC1.p1']]);
    const facts = citationFacts(sentences[1].ids, { sheet, input, fen });
    assert.deepEqual(facts.map(({ id, fact }) => [id, fact.line.map(frame => frame.san)]), [['T', ['c5']], ['LC1.p1', ['Nc3']]]);
    assert.deepEqual(citationFacts(['L3.p2', 'S.L3', 'LC1.S'], { sheet, input, fen }).map(({ fact }) => fact.line.map(frame => frame.san)), [['c5'], ['Nbd2'], ['Nc3']]);
    const text = sentences[1].text, context = clean.slice(0, sentences[1].end);
    const boardOf = citations => compileTeaching(text, fen, context, { rootColor: 'w', citations })
        .cues.find(cue => cue.references.moves.some(([from, to]) => from === 'c7' && to === 'c5'))?.positionFen?.split(' ')[0];
    assert.notEqual(boardOf([]), fen.split(' ')[0]);
    assert.equal(boardOf(facts), fen.split(' ')[0]);
});

test('concept words fall back to the piece that fits when the subject is vague or bare', () => {
    const regionsAt = (text, fen, phrase, rootColor = 'w') => compileTeaching(text, fen, text, { rootColor }).cues
        .filter(cue => cue.index <= text.indexOf(phrase) && cue.end >= text.indexOf(phrase) + phrase.length)
        .flatMap(cue => cue.references.regions.map(region => `${region.label}:${[...region.squares].sort()}`));
    assert.deepEqual(regionsAt("Your queen is centralized. It's isolated, and both kings are active.", '8/8/8/3p1K2/3k4/4q3/8/8 w - - 4 79', 'isolated', 'b'), ['Isolated:d5']);
    assert.deepEqual(regionsAt('Your queenside is still undeveloped and b7 is loose.', 'rn1qk1nr/ppp2ppp/8/2bpp3/2P5/PQ4PB/1P1PPP1P/RNB1K2R b KQkq - 0 6', 'loose', 'b'), ['Undefended pawn:b7']);
    assert.deepEqual(regionsAt('Your hanging b5 rook needs care.', '4k3/8/8/1R6/8/8/8/4K3 b - - 0 1', 'hanging'), ['Undefended rook:b5']);
    assert.deepEqual(regionsAt("Black's doubled pawns on e5 are a weakness.", '4k3/8/8/4p3/4p3/8/8/4K3 w - - 0 1', 'doubled'), ['Doubled:e4,e5']);
    const castled = regionsAt('Material is equal and both kings are safely castled.', 'r1bq1rk1/pp2ppbp/2np1np1/2p5/2P1P3/3PBN2/PP2BPPP/RN1Q1RK1 w - - 4 8', 'castled');
    assert.equal(castled.filter(label => label.startsWith('King shelter')).length, 2);
    const development = 'You are imagining this. The position just calls for normal development.';
    const developFen = 'r1bqkbnr/1p3ppp/p1np4/4p3/4P3/N7/PPP1BPPP/RNBQK2R b KQkq - 1 7';
    assert.deepEqual(compileTeaching(development, developFen, development, { rootColor: 'b', beforeFen: 'r1bqkbnr/1p3ppp/p1np4/1N2p3/4P3/8/PPP1BPPP/RNBQK2R w KQkq - 0 7' })
        .cues.flatMap(cue => cue.references.regions.map(region => region.label)), ['Pieces to develop']);
});