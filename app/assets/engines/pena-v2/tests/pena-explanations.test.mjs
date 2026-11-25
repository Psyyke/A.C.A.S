import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../../libraries/chessjs/chess.js';
import { factSheet, citations } from '../factsheet.js';

const closedFile = '4r1k1/pp3ppp/2p5/3p4/3Pn3/2PBB3/P4PPP/3R2K1 w - - 0 22';
const promptCount = sheet => (sheet.sheet.match(/^\[[^\]]+\]/gm) || []).length;

test('a requested closed file has concrete obstructions and a conditional practical purpose', () => {
    const sheet = factSheet(closedFile, { playerColor: 'w', question: 'Why is opening the d-file important?', limit: 4 });
    const plan = sheet.promptFacts.find(fact => fact.kind === 'file plan');
    assert.ok(plan);
    assert.match(plan.text, /d-file.*not open/);
    assert.match(plan.text, /White rook d1/);
    assert.match(plan.text, /Black pawn d5/);
    assert.match(plan.text, /White pawn d4/);
    assert.match(plan.text, /White bishop d3/);
    assert.match(plan.text, /If.*could.*pressure|If.*could.*entry squares/);
    assert.doesNotMatch(plan.text, /wins|forced|engine prefers|queen d1/i);
    assert.ok(promptCount(sheet) <= 4);
    assert.ok(sheet.promptFacts.every(fact => fact.text.includes('d-file')), 'Unrelated files must not distract a focused explanation');
    assert.deepEqual(citations(`It could provide entry squares [${plan.id}].`, sheet).citations.map(item => item.fact), [plan]);
});

test('file plans identify actual queens and both sides rather than assuming a rook on d1', () => {
    const fen = '3r2k1/8/3p4/8/3P4/8/8/R2Q2K1 b - - 0 22';
    const sheet = factSheet(fen, { playerColor: 'w', question: 'Why open file d?', limit: 1 });
    const [plan] = sheet.promptFacts;
    assert.equal(plan.kind, 'file plan');
    assert.match(plan.text, /White queen d1/);
    assert.match(plan.text, /Black rook d8/);
    assert.match(plan.text, /Black pawn d6.*White pawn d4|White pawn d4.*Black pawn d6/);
    assert.doesNotMatch(plan.text, /White rook d1|White queen d8|already open/);
});

test('off-turn owner and pawn concept select the player or opponent without losing the other local facts', () => {
    const fen = '4k3/pp4pp/1p6/8/8/PP6/P5PP/4K3 b - - 0 30';
    for(const [question, color] of [['How bad are my doubled pawns?', 'w'], ['How bad are their doubled pawns?', 'b'], ["What about my opponent's doubled pawns?", 'b'], ["What about Black's doubled pawns?", 'b']]) {
        const sheet = factSheet(fen, { playerColor: 'w', question, limit: 1 });
        assert.equal(sheet.turn, 'b');
        assert.equal(sheet.promptFacts[0].kind, 'doubled pawns', question);
        assert.equal(sheet.promptFacts[0].side, color, question);
        assert.ok(sheet.facts.some(fact => fact.kind === 'doubled pawns' && fact.side !== color));
        assert.equal(promptCount(sheet), 1);
    }
});

test('a named pinned victim can select an opposing-side pin instead of an unrelated pin', () => {
    const fen = '3q3k/3n2b1/8/8/1b6/2N5/8/3RK3 b - - 0 1';
    const sheet = factSheet(fen, { playerColor: 'w', question: 'Why is my knight on c3 pinned?', limit: 1 });
    const [pin] = sheet.promptFacts;
    assert.equal(pin.kind, 'pin');
    assert.equal(pin.side, 'b');
    assert.match(pin.text, /Black bishop b4 pins White knight c3/);
    assert.ok(sheet.facts.some(fact => fact.kind === 'pin' && fact.side === 'w'));
});

test('prompt limits include special facts and the Pena pick while the complete pool stays available', () => {
    const fen = new Chess().fen();
    const score = { cp: 0, mate: null };
    const options = { question: 'Why Nf3?', playerColor: 'w', penaMove: 'b1c3',
        engine: { lines: ['g1f3', 'b1c3', 'e2e4'].map(move => ({ move, pv: [move], score })) },
        asked: ['a2a3', 'b2b3', 'c2c3'].map(uci => ({ uci, pv: [uci], score })) };
    const complete = factSheet(fen, { ...options, limit: 40 });
    for(const limit of [0, 1, 4, 14]) {
        const sheet = factSheet(fen, { ...options, limit });
        assert.equal(promptCount(sheet), Math.min(limit, complete.promptFacts.length));
        assert.equal(sheet.promptFacts.length, promptCount(sheet));
        assert.equal(sheet.facts.length, complete.facts.length);
        if(limit < complete.facts.length) assert.ok(sheet.facts.length > sheet.promptFacts.length);
        assert.ok(sheet.byId.Q);
        assert.ok(sheet.byId.L3);
        for(const fact of sheet.facts) assert.equal(sheet.byId[fact.id], fact);
    }
    assert.doesNotMatch(complete.byId.A1.text, /engine choice/);
});

test('question context does not displace an asked check, the best line or a real immediate threat', () => {
    const score = { cp: 20, mate: null };
    const sheet = factSheet(closedFile, { playerColor: 'w', question: 'Why open the d-file?', limit: 4,
        asked: [{ uci: 'g1h1', pv: ['g1h1'] }],
        engine: { lines: [{ move: 'd3e2', pv: ['d3e2'], score }] },
        threat: { pv: ['e4c3'], gain: 200, score } });
    assert.deepEqual(sheet.promptFacts.slice(0, 3).map(fact => fact.id), ['A1', 'L1', 'T']);
    assert.equal(sheet.promptFacts[3].kind, 'file plan');
    assert.equal(promptCount(sheet), 4);
});

test('named moves supply reusable checked before/after evidence including off-turn ownership', () => {
    const start = new Chess().fen();
    const sheet = factSheet(start, { playerColor: 'w', question: 'Why does Nf3 help control d4?', limit: 1 });
    const [effect] = sheet.promptFacts;
    assert.equal(effect.kind, 'move effect');
    assert.match(effect.text, /White knight from g1 to f3/);
    assert.match(effect.text, /now covers d4.*did not cover from g1/);
    assert.equal(effect.line[0].beforeFen, start);
    assert.equal(new Chess(effect.line[0].fen).get('f3').type, 'n');
    assert.doesNotMatch(effect.text, /wins|forced|engine prefers/);
    const offTurn = factSheet(start.replace(' w ', ' b '), { playerColor: 'w', question: 'What would my Nf3 change?', limit: 1 });
    assert.equal(offTurn.promptFacts[0].side, 'w');
    assert.match(offTurn.promptFacts[0].text, /if White had the move/);
    const pawn = factSheet(start, { question: 'Why does e4 help the bishop on f1?', limit: 1 }).promptFacts[0];
    assert.equal(pawn.kind, 'move effect');
    assert.match(pawn.text, /White bishop f1 gains a line covering/);
});
