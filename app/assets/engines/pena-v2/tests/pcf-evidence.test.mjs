import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { boardAt } from '../positions.js';
import { engineCoachingEvidence, groundedCoachingInput } from '../engine-coaching-input.js';
import { buildPcfEvidence, selectPcfEvidence, encodePcf, decodePcf, derivePcfRuleFrame, renderPcfTeacher, pcfBinPropOrder } from '../pcf-evidence.js';
import { pcfCoachingInput } from '../pcf-input.js';
import { rebuildCoachingNotes } from '../app-input.js';
import { compileAppCoachingSource } from '../app-input.js';
import { qwenAdapterPrompt } from '../adapter-input.js';
import { inklingPrompt } from '../inkling-layout.js';
import { collectPcfReplySearches } from '../pcf-replies.js';
import { strategicProfile, strategyMotifs } from '../strategy.js';
import { binPropValues, pcfBinPropMotifs } from '../binprop-full.js';
import { compactPredicateVector, decodeCompactWireEvidence, renderCompactWireEvidence, decodeLosslessCompactEvidence, renderLosslessCompactEvidence, renderCompactEvidence, renderReadableEvidence, renderReadableMessage } from '../readable-evidence.js';
import { compactHistoryRelations, compactHistorySquares, selectQuestionEvidence } from '../question-evidence-pilot.js';
import { developmentCases } from './cases.js';

function makeInput(fen, history = [], path = null, question = 'What changes?') {
    const board = boardAt(fen);
    const first = board.moves({ verbose: true })[0];
    const moves = path || [first.from + first.to + (first.promotion || '')];
    const snapshot = { schema: 'pena-v2-search/1', fen, history: history.slice(-8), perspective: 'root-side-to-move',
        budget: { nodes: 128, moves: [] }, engine: { networkSha256: 'a'.repeat(64), precision: 'f32', backend: 'webgpu' },
        bestMove: moves[0], lines: [{ pv: moves }],
        candidates: [{ move: moves[0], visits: 64, policyPrior: 0.5, search: { q: 0.1 } }] };
    const engineEvidence = engineCoachingEvidence({ snapshot });
    return groundedCoachingInput({ fen, history, playerColor: 'w', question, engineEvidence });
}

const row = (rows, kind, frame, square) => rows.find(item => item.kind === kind && item.values[0] === frame && item.values[1] === square);

test('every current piece has explicit incoming attacks and outgoing friendly defense plus full geometric controls', () => {
    const fen = '8/8/4K3/8/5kpp/1R6/8/8 w - - 0 55';
    const input = makeInput(fen, [], ['b3b4', 'f4g5']);
    const bank = buildPcfEvidence(input, { playerColor: 'w' });
    const root = bank.frames[0].rows;
    assert.equal(root.filter(item => item.kind === 'R').length, 5);
    assert.equal(row(root, 'R', 'C', 'g4').values[2], 'bP');
    assert.match(row(root, 'R', 'C', 'g4').values[3], /^@\d+$/);
    assert.deepEqual(row(root, 'R', 'C', 'g4').values.slice(4), ['-', 'f4', '-', '-']);
    assert.equal(row(root, 'R', 'C', 'f4').values[7], 'g4');
    assert.equal(row(root, 'G', 'C', 'g4').values[2], 'f3,h3');
    assert.equal(row(root, 'L', 'C', 'g4').values[2], '~');
    assert.equal(root.filter(item => item.kind === 'S').length, 64);
    assert.ok(root.some(item => item.kind === 'J' && item.values[1] === 'g4' && item.values[2] === 'h4'));
    assert.doesNotMatch(JSON.stringify(bank), /(?:[prnbqkPRNBQK1-8]+\/){7}[prnbqkPRNBQK1-8]+/);
});

test('compact records round-trip and readable teacher rendering is derived only from selected student records', () => {
    const fen = '8/8/4K3/8/5kpp/1R6/8/8 w - - 0 55';
    const bank = buildPcfEvidence(makeInput(fen, [], ['b3b4', 'f4g5']), { playerColor: 'w' });
    const selection = selectPcfEvidence(bank, { conditionalFrames: ['V1'] });
    const text = encodePcf(selection), decoded = decodePcf(text), teacher = renderPcfTeacher(text);
    assert.deepEqual(decoded, selection);
    assert.match(text, /@L C\n!b3 SAME/);
    assert.match(text, /\n!e6 SAME \d{8}/);
    assert.match(teacher, /square=f4; piece=bK;.*friendlyTargets=g4/);
    assert.match(text, /@F V1 conditional C !b3b4/);
    assert.doesNotMatch(text, /@F V2 /);
    assert.throws(() => selectPcfEvidence(bank, { conditionalFrames: ['V2'] }), /parent/);
    assert.throws(() => decodePcf(text + '\n@X9 invalid'), /Unknown or malformed/);
    assert.throws(() => decodePcf(text + '\n@Z invalid'), /empty PCF section/);
    assert.throws(() => decodePcf(text.replace('PCF/3', 'PCF/2')), /version/);
    assert.throws(() => decodePcf(text.replace(/(!g4 !bP !@\d+ - )!f4/, '$1-')), /relations disagree/);
});

test('readable pilot preserves selected piece relations, both BinProp perspectives and noncurrent scope', () => {
    const fen = '8/8/4K3/8/5kpp/1R6/8/8 w - - 0 55';
    const input = makeInput(fen, [], ['b3b4', 'f4g5']);
    const pcf = pcfCoachingInput(input, { playerColor: 'w', tokenCount: () => 1 });
    const output = renderReadableEvidence(pcf.pcf.text);
    assert.match(output, /\[C\.g4\] C: Black pawn g4 \(@\d+\); enemy attackers: none; friendly defenders: f4; enemy pieces attacked: none; friendly pieces defended: none\./);
    assert.match(output, /F: frame=V1; scope=conditional; parent=C; move=b3b4/);
    for(const color of ['w', 'b']) {
        const row = pcf.pcf.selection.rows.find(item => item.kind === 'BINS' && item.values[0] === 'C' && item.values[1] === color);
        const line = output.split('\n').find(item => item.startsWith(`C: ${color === 'w' ? 'White' : 'Black'} perspective BinProps:`));
        for(const [index, motif] of pcfBinPropMotifs.entries())
            assert.ok(line.includes(`${motif.name}: ${row.values[index + 2] === '1' ? 'true' : 'false'}`));
    }
    assert.match(output, /Geometric attacks and defenses include pinned pieces/);
    assert.match(output, /Unlisted squares in the complete current S group have zero control counts/);
    assert.doesNotMatch(output, /S: frame=C; square=a1;/);
    assert.match(output, /S: frame=C; square=b1; whiteControlCount=1;/);
    assert.match(output, /O: historySupplied=/);
    assert.throws(() => renderReadableEvidence(pcf.pcf.text.replace('PCF/3', 'PCF/2')), /version/);
});

test('readable pilot replaces only the PCF payload and wire guidance, preserving question and prior messages', () => {
    const input = makeInput('8/8/4K3/8/5kpp/1R6/8/8 w - - 0 55', [], ['b3b4', 'f4g5']);
    const pcf = pcfCoachingInput(input, { playerColor: 'w', tokenCount: () => 1 });
    const original = pcf.messages.at(-1).content;
    const output = renderReadableMessage(original);
    assert.equal(output.slice(0, output.indexOf('\nPena evidence pilot/1')), original.slice(0, original.indexOf('\nC=now V=if H=past.')));
    assert.ok(output.endsWith('\n\nPlayer question: What changes?'));
    assert.doesNotMatch(output, /C=now V=if H=past\.|PCF\/3/);
    assert.throws(() => renderReadableMessage(original.replace('\n\nPlayer question: ', '\nMissing question: ')), /envelope/);
});

test('compact readable pilot preserves both perspectives, piece relations and citations', () => {
    const fen = '8/8/4K3/8/5kpp/1R6/8/8 w - - 0 55';
    const pcf = pcfCoachingInput(makeInput(fen, [], ['b3b4', 'f4g5']), { playerColor: 'w', tokenCount: () => 1 });
    const output = renderCompactEvidence(pcf.pcf.text);
    assert.match(output, /\[C\.g4\] C \| Black \| pawn \| g4 \| @\d+ \| none \| f4 \| none \| none/);
    const white = pcf.pcf.selection.rows.find(row => row.kind === 'BINS' && row.values[0] === 'C' && row.values[1] === 'w');
    const black = pcf.pcf.selection.rows.find(row => row.kind === 'BINS' && row.values[0] === 'C' && row.values[1] === 'b');
    for(const [index, motif] of pcfBinPropMotifs.entries())
        assert.ok(output.includes(`${motif.name}: ${white.values[index + 2] === '1' ? 'true' : 'false'} / ${black.values[index + 2] === '1' ? 'true' : 'false'}`));
    assert.match(output, /F: frame \| scope \| parent \| move/);
    assert.match(output, /V1 \| conditional \| C \| b3b4/);
    assert.doesNotMatch(output, /C \| a1 \| 0 \| 0 \| 0 \| 0/);
    assert.throws(() => renderReadableMessage(pcf.messages.at(-1).content, { format: 'invalid' }), /Unknown evidence pilot format/);
});

test('spatial ablation discloses omissions while retaining full current pieces and BinProps', () => {
    const fen = '8/8/4K3/8/5kpp/1R6/8/8 w - - 0 55';
    const pcf = pcfCoachingInput(makeInput(fen, [], ['b3b4', 'f4g5']), { playerColor: 'w', tokenCount: () => 1 });
    const output = renderCompactEvidence(pcf.pcf.text, { profile: 'spatial-ablation' });
    const rows = pcf.pcf.selection.rows;
    for(const kind of ['A', 'J', 'S', 'X'])
        assert.match(output, new RegExp(`${kind}=${rows.filter(row => row.kind === kind).length}(?:,|\\.)`));
    for(const piece of rows.filter(row => row.kind === 'R' && row.values[0] === 'C'))
        assert.ok(output.includes(`[C.${piece.values[1]}]`));
    assert.match(output, /C BinProps \(White \/ Black\):/);
    assert.match(output, /K and O describe the original selection before these omissions/);
    assert.doesNotMatch(output, /\nS: frame \|/);
    assert.match(output, /\nG: frame \| square \| geometricControls/);
});

test('lossless compact format restores every spatial, historical, conditional and BinProp record', () => {
    const historyFen = '8/8/4K3/8/5kpp/1R6/8/8 w - - 0 55';
    const fen = '8/8/4K3/8/1R3kpp/8/8/8 b - - 1 55';
    const pcf = pcfCoachingInput(makeInput(fen, [historyFen], ['f4g5', 'e6e5'], 'Why?'),
        { playerColor: 'w', history: [historyFen], tokenCount: () => 1 });
    const expected = decodePcf(pcf.pcf.text);
    const output = renderLosslessCompactEvidence(pcf.pcf.text);
    assert.deepEqual(decodeLosslessCompactEvidence(output), expected);
    const compactWire = renderCompactWireEvidence(pcf.pcf.text);
    assert.deepEqual(decodeCompactWireEvidence(compactWire), expected);
    assert.ok(compactWire.includes('R=square,piece,identity,enemy attackers,friendly defenders,enemy targets,friendly targets'));
    for(const kind of ['A', 'J', 'S', 'X', 'R', 'BINS'])
        assert.ok(output.includes(`@${kind} C\n`), kind);
    const bins = expected.rows.filter(item => item.kind === 'BINS');
    assert.equal(bins.every(item => item.values.length === 32), true);
    for(const motif of pcfBinPropMotifs) assert.ok(output.includes(motif.name));
    assert.match(output, /\[C\.g4\]\tbP\t@\d+\t-\tf4\t-\t-/);
    assert.match(output, /\nZERO\t/);
    assert.ok(output.length < renderCompactEvidence(pcf.pcf.text).length);
    assert.throws(() => decodeLosslessCompactEvidence(output.replace('[C.g4]', '[H1.g4]')), /citation/);
    assert.throws(() => decodeLosslessCompactEvidence(output.replace('ZERO\t', 'ZERO\tz9 ')), /zero-control/);
    const original = pcf.messages.at(-1).content;
    assert.equal(renderReadableMessage(original, { format: 'compact-lossless' }),
        original.slice(0, original.indexOf('\nC=now V=if H=past.')) + '\n' + output
        + original.slice(original.lastIndexOf('\n\nPlayer question: ')));
});

test('evidence switches drop optional extras but keep the current board and the previous position', () => {
    const historyFen = '8/8/4K3/8/5kpp/1R6/8/8 w - - 0 55';
    const fen = '8/8/4K3/8/1R3kpp/8/8/8 b - - 1 55';
    const snapshot = { schema: 'pena-v2-search/1', fen, history: [historyFen], perspective: 'root-side-to-move',
        budget: { nodes: 128, moves: [] }, engine: { networkSha256: 'a'.repeat(64), precision: 'f32', backend: 'webgpu' },
        bestMove: 'f4g5', lines: [{ pv: ['f4g5', 'e6e5'] }], candidates: [{ move: 'f4g5', visits: 64, policyPrior: 0.5, search: { q: 0.1 } }] };
    const input = groundedCoachingInput({ fen, history: [historyFen], playerColor: 'w', question: 'Why?', maxPlies: 6,
        continuations: [{ id: 'L1', moves: ['f4g5', 'e6e5', 'g4g3'] }, { id: 'L2', moves: ['f4f3', 'b4b3'] }],
        source: { kind: 'saved-stockfish-analysis', depth: 12, preferredLineId: 'L1' },
        evaluations: [{ lineId: 'L1', perspective: 'root-side-to-move', score: { kind: 'cp', value: 30 } }],
        engineEvidence: engineCoachingEvidence({ snapshot }) });
    const build = include => pcfCoachingInput(input, { playerColor: 'w', history: [historyFen], tokenCount: () => 1, include }).pcf.selectedFrames;
    const full = build(undefined);
    assert.ok(full.plyRefs.length && full.conditionalFrames.length && full.comparisonKeys.length);
    const none = build({ lines: false, replies: false, comparisons: false, whatIf: false, history: false });
    assert.deepEqual([none.plyRefs, none.replyRefs, none.comparisonKeys, none.conditionalFrames, none.historicalFrames], [[], [], [], [], ['H1']]);
    const noLines = build({ lines: false });
    assert.deepEqual([noLines.plyRefs, noLines.conditionalFrames, noLines.comparisonKeys], [[], full.conditionalFrames, full.comparisonKeys]);
});

test('question-focused pilot keeps the requested move, current graph and BinProps and discloses omissions', () => {
    const fen = '8/8/4K3/8/5kpp/1R6/8/8 w - - 0 55', question = 'What would Rb4 change?';
    const pcf = pcfCoachingInput(makeInput(fen, [], ['b3b4', 'f4g5'], question), { playerColor: 'w', tokenCount: () => 1 });
    const focused = selectQuestionEvidence(pcf.pcf.selection, { question, fen });
    assert.deepEqual(focused.askedMoves, ['b3b4']);
    assert.ok(focused.rows.some(item => item.kind === 'F' && item.values[0] === 'V1' && item.values[3] === 'b3b4'));
    assert.equal(focused.rows.filter(item => item.kind === 'R' && item.values[0] === 'C').length, 5);
    assert.equal(focused.rows.filter(item => item.kind === 'BINS' && item.values[0] === 'C').length, 2);
    assert.ok(focused.omitted.S > 0);
    const rendered = renderReadableMessage(pcf.messages.at(-1).content, { format: 'question-focused', fen });
    assert.match(rendered, /Records omitted after selection:/);
    assert.match(rendered, /Omitted records are unavailable here, not false/);
    assert.match(rendered, /C BinProps \(White \/ Black\):/);
    assert.match(rendered, /V1\tconditional\tC\tb3b4/);
    assert.match(rendered, /\[C\.b3\]\tWhite\trook\t@/);
    const rookControls = focused.rows.find(item => item.kind === 'G' && item.values[0] === 'C' && item.values[1] === 'b3').values[2];
    assert.ok(rendered.includes(`b3\t${rookControls.replace(/,/g, ' ')}`));
    const white = focused.rows.find(item => item.kind === 'BINS' && item.values[0] === 'C' && item.values[1] === 'w').values;
    const black = focused.rows.find(item => item.kind === 'BINS' && item.values[0] === 'C' && item.values[1] === 'b').values;
    for(let i = 0; i < pcfBinPropMotifs.length; i++)
        assert.ok(rendered.includes(`${pcfBinPropMotifs[i].name}: ${white[i + 2]}/${black[i + 2]}`));
    assert.throws(() => selectQuestionEvidence(pcf.pcf.selection, { question, fen: '8/8/4K3/8/5kpp/8/8/1R6 w - - 0 55' }), /does not match/);
    assert.throws(() => renderReadableMessage(pcf.messages.at(-1).content, { format: 'question-focused' }), /requires the original position/);
    const unresolved = selectQuestionEvidence(pcf.pcf.selection, { question: 'Can I play Ra8?', fen });
    assert.equal(unresolved.unresolved, true);
    assert.equal(unresolved.rows.length, pcf.pcf.selection.rows.length);
    assert.deepEqual(selectQuestionEvidence(pcf.pcf.selection, { question: 'Can I play b3b4?', fen }).askedMoves, ['b3b4']);
    const missing = selectQuestionEvidence(pcf.pcf.selection, { question: 'Can I play Rb5?', fen });
    assert.deepEqual(missing.missingMoves, ['b3b5']);
    assert.deepEqual(missing.derivedMoves, ['b3b5']);
    assert.ok(missing.derived.some(item => item.kind === 'F' && item.values[0] === 'VQ1' && item.values[3] === 'b3b5'));
    assert.ok(missing.derived.some(item => item.kind === 'R' && item.values[0] === 'VQ1' && item.values[1] === 'b5'));
    const questionMessage = pcf.messages.at(-1).content.replace('What would Rb4 change?', 'Can I play Rb5?');
    const derivedMessage = renderReadableMessage(questionMessage, { format: 'question-focused', fen });
    assert.match(derivedMessage, /rule-derived conditional frame \[VQ1\].*not an engine search/);
    assert.doesNotMatch(derivedMessage, /(?:[prnbqkPRNBQK1-8]+\/){7}[prnbqkPRNBQK1-8]+/);
});

test('rule-derived frames preserve special-move identities and the resulting board', () => {
    for(const [fen, move, capture, promotion] of [
        ['k7/8/8/3pP3/8/8/8/7K w - d6 0 1', 'e5d6', 'd5', '-'],
        ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1', '-', '-'],
        ['7k/P7/8/8/8/8/8/7K w - - 0 1', 'a7a8n', '-', 'n']
    ]) {
        const pcf = pcfCoachingInput(makeInput(fen, [], [move]), { playerColor: 'w', tokenCount: () => 1 });
        const derived = derivePcfRuleFrame(fen, pcf.pcf.selection.rows, move, 'VQ1', 'w');
        const wrongClock = fen.replace(/\d+$/, value => String(Number(value) + 1));
        assert.throws(() => derivePcfRuleFrame(wrongClock, pcf.pcf.selection.rows, move, 'VQ1', 'w'), /position status/);
        const board = boardAt(fen);
        assert.ok(board.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }));
        const expected = board.board().flat().filter(Boolean)
            .map(piece => `${piece.square}:${piece.color}${piece.type.toUpperCase()}`).sort();
        const actual = derived.filter(item => item.kind === 'R').map(item => `${item.values[1]}:${item.values[2]}`).sort();
        assert.deepEqual(actual, expected);
        const transition = derived.find(item => item.kind === 'T').values;
        assert.equal(transition[2], move);
        assert.equal(transition[6], capture);
        assert.equal(transition[8], promotion);
        if(move === 'e1g1') assert.match(transition[9], /\.h1\.f1/);
    }
});

test('question-focused pilot keeps the original selection for ambiguous moves', () => {
    const fen = '8/8/4K3/8/5kpp/1R5R/8/8 w - - 0 55';
    const pcf = pcfCoachingInput(makeInput(fen), { playerColor: 'w', tokenCount: () => 1 });
    const selected = selectQuestionEvidence(pcf.pcf.selection, { question: 'Can I play Rd3?', fen });
    assert.equal(selected.unresolved, true);
    assert.equal(selected.rows.length, pcf.pcf.selection.rows.length);
    assert.deepEqual(selected.omitted, {});
});

test('comparison vectors preserve defaults and named exceptions', () => {
    const values = Array(30).fill('0');
    values[1] = '2';
    values[4] = '1';
    assert.equal(compactPredicateVector(values.join(',')),
        `all 0 except ${pcfBinPropMotifs[1].name}=2, ${pcfBinPropMotifs[4].name}=1`);
    assert.equal(compactPredicateVector('1'.repeat(30), true), 'all 1');
    assert.equal(compactPredicateVector('01'.repeat(15), true), '01'.repeat(15));
    assert.throws(() => compactPredicateVector('0,1'), /Invalid BinProp comparison vector/);
});

test('question-focused pilot retains move context from previous user questions', () => {
    const fen = '8/8/4K3/8/5kpp/1R6/8/8 w - - 0 55';
    const pcf = pcfCoachingInput(makeInput(fen, [], ['b3b4', 'f4g5', 'e6e5']), { playerColor: 'w', tokenCount: () => 1 });
    const options = { question: 'What next?', fen };
    const selection = pcf.pcf.selection;
    assert.ok(!selectQuestionEvidence(selection, options).rows.some(item => item.kind === 'F' && item.values[0] === 'V1'));
    const selected = selectQuestionEvidence(selection, { ...options,
        priorMessages: [{ role: 'user', content: 'What about Rb4?' }] });
    assert.ok(selected.rows.some(item => item.kind === 'F' && item.values[0] === 'V1'));
    assert.deepEqual(selected.askedMoves, []);
    assert.deepEqual(selected.missingMoves, []);
    assert.equal(selectQuestionEvidence(selection, { ...options,
        priorMessages: [{ role: 'user', content: 'Can I play Ra8?' }] }).unresolved, false);
    assert.throws(() => selectQuestionEvidence(pcf.pcf.selection, { ...options,
        priorMessages: [{ role: 'invalid', content: 'No' }] }), /Invalid question-focused/);
});

test('PCF model and teacher messages share selected facts, preserve citations and enforce the complete prompt budget', () => {
    const fen = '8/8/4K3/8/5kpp/1R6/8/8 w - - 0 55';
    const base = makeInput(fen, [], ['b3b4', 'f4g5']);
    const full = pcfCoachingInput(base, { playerColor: 'w', history: [], tokenCount: text => text.length, maxPromptTokens: 100000 });
    assert.equal(full.schema, 'pena-v2-pcf-coaching-input/3');
    assert.match(full.messages.at(-1).content, /!g4 !bP !@\d+ - !f4(?:\n|$)/);
    assert.ok(full.references.some(ref => ref.id === 'C.g4'));
    assert.match(full.teacherMessages.at(-1).content, /square=g4; piece=bP;.*friendlyDefenders=f4/);
    assert.match(full.teacherMessages.at(-1).content, /square=f4; piece=bK;.*friendlyTargets=g4/);
    assert.doesNotMatch(JSON.stringify([full.messages, full.teacherMessages]), /(?:[prnbqkPRNBQK1-8]+\/){7}[prnbqkPRNBQK1-8]+/);
    assert.deepEqual(decodePcf(full.pcf.text), full.pcf.selection);
    const bounded = pcfCoachingInput(base, { playerColor: 'w', history: [], tokenCount: text => text.includes('@F V1') ? 900 : 100, maxPromptTokens: 200 });
    assert.equal(bounded.pcf.promptTokens, 100);
    assert.deepEqual(bounded.pcf.selection.rows.at(-1).values.slice(4, 6), ['2', '0']);
    assert.throws(() => pcfCoachingInput(base, { playerColor: 'w', tokenCount: () => 201, maxPromptTokens: 200 }), /Mandatory PCF/);
    const rawFenQuestion = makeInput(fen, [], ['b3b4', 'f4g5'], `Explain ${fen}`);
    assert.throws(() => pcfCoachingInput(rawFenQuestion, { playerColor: 'w', tokenCount: () => 1 }), /cannot contain a raw FEN/);
});

test('PCF budgets the selected Inkling runtime template', () => {
    const input = makeInput('8/8/4K3/8/5kpp/1R6/8/8 w - - 0 55', [], ['b3b4', 'f4g5']);
    const options = { playerColor: 'w', inkling: true, plain: true, tokenCount: text => text.length, maxPromptTokens: 100000 };
    const base = pcfCoachingInput(input, options);
    const serializePrompt = messages => inklingPrompt(messages) + 'runtime suffix';
    const current = pcfCoachingInput(input, { ...options, serializePrompt });
    assert.equal(base.pcf.promptTokens, inklingPrompt(base.messages).length);
    assert.equal(current.pcf.promptTokens, serializePrompt(current.messages).length);
    assert.ok(current.pcf.promptTokens > base.pcf.promptTokens);
    assert.deepEqual(current.pcf.selection, base.pcf.selection);
    const mandatoryOnly = { ...options, tokenCount: text => text.includes('@F V1') ? 1000000 : text.length };
    const mandatory = pcfCoachingInput(input, mandatoryOnly);
    assert.throws(() => pcfCoachingInput(input, { ...mandatoryOnly,
        maxPromptTokens: mandatory.pcf.promptTokens, serializePrompt }), /Mandatory PCF/);
});

test('question-bound absence and mistaken-piece premises are explicit without board reconstruction', () => {
    const fen = '8/8/4K3/8/5kpp/1R6/8/8 w - - 0 55';
    const empty = makeInput(fen, [], ['b3b4', 'f4g5'], 'Is there actually a piece on a2?');
    const pcf = pcfCoachingInput(empty, { playerColor: 'w', tokenCount: () => 1 });
    const fact = pcf.pcf.selection.rows.find(row => row.kind === 'H' && row.values[1] === 'Q1');
    assert.deepEqual(fact.values.slice(1, 7), ['Q1', 'absence', 'a2', '?', '?', '-']);
    assert.match(pcf.pcf.text, /\[Q1\] absence !a2 \? \?/);
    assert.match(pcf.teacherMessages.at(-1).content, /\[Q1\] H:.*predicate=absence; subject=a2; value1=\?; value2=\?; value3=-/);
    assert.ok(pcf.references.some(ref => ref.id === 'Q1'));
    const mistaken = makeInput(fen, [], ['b3b4', 'f4g5'], 'Where is my knight on e6?');
    const corrected = pcfCoachingInput(mistaken, { playerColor: 'w', tokenCount: () => 1 });
    const absence = corrected.pcf.selection.rows.find(row => row.kind === 'H' && row.values[2] === 'absence');
    assert.equal(absence.values[3], 'e6');
    assert.equal(absence.values[5], 'N');
    assert.equal(absence.values[6], 'wK');
});

test('conditional frame deltas include attack and defense changes of unmoved pieces', () => {
    const fen = '8/8/4K3/8/5kpp/1R6/8/8 w - - 0 55';
    const bank = buildPcfEvidence(makeInput(fen, [], ['b3b4', 'f4g5']), { playerColor: 'w' });
    const second = bank.frames.find(frame => frame.id === 'V2');
    assert.ok(second.rows.some(item => item.kind === 'D' && item.values[1] === '+' && item.values[2] === 'defend'
        && item.values[4] === 'g5' && item.values[5] === 'h4'));
    assert.equal(row(second.rows, 'R', 'V2', 'g4').values[7], '-');
});

test('recorded principal-variation plies retain citable compact move mechanisms', () => {
    const fen = '8/8/4K3/8/5kpp/1R6/8/8 w - - 0 55', moves = ['b3b4', 'f4g5', 'e6e5', 'h4h3'];
    const engineEvidence = makeInput(fen, [], moves).engineEvidence;
    const input = groundedCoachingInput({ fen, history: [], playerColor: 'w', question: 'Why?', engineEvidence,
        source: { kind: 'saved-stockfish-analysis', depth: 12, preferredLineId: 'L1' }, continuations: [{ id: 'L1', moves }] });
    const pcf = pcfCoachingInput(input, { playerColor: 'w', tokenCount: () => 1 });
    const first = pcf.pcf.selection.rows.find(row => row.kind === 'Z' && row.values[1] === 'L1.p1');
    const second = pcf.pcf.selection.rows.find(row => row.kind === 'Z' && row.values[1] === 'L1.p2');
    assert.match(first.values[5], /action\.wR\.b3\.b4\.Rb4\+/);
    assert.match(second.values[5], /defend\.bK\.g5\.bP\.h4/);
    assert.match(pcf.teacherMessages.at(-1).content, /\[L1\.p1\] Conditional line L1, ply 1, move b3b4:.*White rook moves b3 to b4 \(Rb4\+\)/);
    assert.match(pcf.pcf.text, /!MORE\.!e4/);
    assert.throws(() => decodePcf(pcf.pcf.text.replace('!MORE.!e4', '!MORE.!invalid')), /Malformed PCF repeated effect/);
    assert.deepEqual(pcf.pcf.selection.rows.at(-1).values.slice(12, 14), ['8', '4']);
    assert.ok(pcf.references.some(ref => ref.id === 'L1.p1') && pcf.references.some(ref => ref.id === 'L1.p2'));
    assert.deepEqual(decodePcf(pcf.pcf.text), pcf.pcf.selection);
    const focused = renderReadableMessage(pcf.messages.at(-1).content, { format: 'question-focused', fen });
    assert.ok(focused.includes(`[L1.p1]\t${first.values[4]}\t${first.values[5]}`));
    assert.ok(focused.includes(`[L1.p2]\t${second.values[4]}\t${second.values[5]}`));
    assert.match(focused, /Z effects use dot-separated fields/);
});

test('all 30 BinProp predicates and support-fit scores remain visible even without a strict contrast', () => {
    const fen = developmentCases.find(item => item.id === 'queens-gambit-1').fen;
    const paths = [['g1f3', 'f8e7', 'c1g5', 'e8g8'], ['c1g5', 'f8e7', 'c4d5', 'e6d5']];
    const snapshot = { schema: 'pena-v2-search/1', fen, history: [], perspective: 'root-side-to-move',
        budget: { nodes: 128, moves: [] }, engine: { networkSha256: 'a'.repeat(64), precision: 'f32', backend: 'webgpu' },
        bestMove: paths[0][0], lines: paths.map(pv => ({ pv })),
        candidates: paths.map((moves, index) => ({ move: moves[0], visits: 100, policyPrior: 0.3, search: { q: 0.2 - index * 0.01 } })) };
    const input = groundedCoachingInput({ fen, history: [], playerColor: 'w', question: 'Why?', engineEvidence: engineCoachingEvidence({ snapshot }) });
    const bank = buildPcfEvidence(input, { playerColor: 'w' }), root = input.frames.find(frame => frame.id === 'root');
    for(const color of ['w', 'b']) {
        const flags = bank.frames[0].rows.find(item => item.kind === 'BINS' && item.values[1] === color).values.slice(2);
        const original = strategicProfile(root, color).motifs;
        assert.deepEqual(flags.slice(0, 5), strategyMotifs.map(motif => original[motif.id] ? '1' : '0'));
        assert.deepEqual(flags, binPropValues(root.fen, color).map(value => value ? '1' : '0'));
    }
    const comparison = input.strategy.comparisons[0].comparison;
    const frames = [...input.frames, ...input.engineEvidence.frames];
    const values = sample => binPropValues(frames.find(frame => frame.id === sample.profile.frameId).fen, comparison.color);
    const group = bank.comparisonGroups.find(item => item.kind === 'binprop' && item.rows.some(row => row.kind === 'BINCOMP' && row.values[1] === 'lc0'));
    for(const sample of [...comparison.positive, ...comparison.negative]) {
        const id = input.engineEvidence.references.find(ref => ref.kind === 'lc0-line' && ref.data.frameIds.includes(sample.path[0].frameId)).id;
        const sampleRow = group.rows.find(item => item.kind === 'BINLINE' && item.values[1] === 'lc0' && item.values[2] === id);
        assert.equal(sampleRow.values[5], values(sample).map(value => value ? '1' : '0').join(''));
    }
    const row = group.rows.find(item => item.kind === 'BINCOMP').values;
    const expectedPos = pcfBinPropOrder.map((_, index) => comparison.positive.filter(sample => values(sample)[index]).length);
    const expectedNeg = pcfBinPropOrder.map((_, index) => comparison.negative.filter(sample => !values(sample)[index]).length);
    const fits = expectedPos.map((count, index) => Math.min(count / comparison.positive.length, expectedNeg[index] / comparison.negative.length));
    assert.equal(row[8], expectedPos.join(','));
    assert.equal(row[9], expectedNeg.join(','));
    assert.deepEqual(row[10].split(',').map(Number), fits);
    assert.deepEqual(row[11].split(',').map(Number), fits.map((fit, index) => fit * pcfBinPropMotifs[index].delta));
    const omitted = selectPcfEvidence(bank), selected = selectPcfEvidence(bank, { comparisonKeys: [group.key] });
    assert.equal(omitted.rows.at(-1).values.at(-1), '0');
    assert.equal(selected.rows.at(-1).values.at(-1), '1');
    const text = encodePcf(selected), teacher = renderPcfTeacher(text);
    assert.deepEqual(decodePcf(text), selected);
    assert.deepEqual(decodeLosslessCompactEvidence(renderLosslessCompactEvidence(text)), selected);
    assert.deepEqual(decodeCompactWireEvidence(renderCompactWireEvidence(text)), selected);
    assert.match(teacher, /BINLINE:.*AC \(advanced control with current pawn-file exclusions\)=(?:true|false)/);
    assert.match(teacher, /BINCOMP:.*AC \(advanced control with current pawn-file exclusions\): preferred true \d+\/\d+; alternative false \d+\/\d+; fit/);
    assert.doesNotMatch(teacher, /weightedScores=/);
    for(const pilot of [renderReadableEvidence(text), renderCompactEvidence(text)]) {
        assert.match(pilot, /BINLINE predicate bits and BINCOMP per-predicate lists follow the same 30-name order/);
        assert.match(pilot, /positiveTrueCounts/);
        assert.match(pilot, /negativeFalseCounts/);
    }
    const metricGroups = bank.comparisonGroups.filter(item => item.kind === 'metric');
    assert.ok(metricGroups.length);
    const metricSelection = selectPcfEvidence(bank, { comparisonKeys: metricGroups.map(item => item.key) });
    const focused = renderCompactEvidence(encodePcf(metricSelection), { profile: 'question-focused', question: 'Why?', fen });
    const metric = metricSelection.rows.find(item => item.kind === 'M').values;
    const range = (min, max) => min === max ? min : `${min}..${max}`;
    assert.ok(focused.includes(`M comparison C: ${metric.slice(1, 5).join('\t')}`));
    assert.ok(focused.includes(`\t${metric[6]}\t${range(metric[7], metric[8])}\t${range(metric[9], metric[10])}\t${range(metric[11], metric[12])}\t${metric[13]}`));
    assert.match(focused, /Difference ranges compare preferred minus alternative samples/);
    const ranged = structuredClone(metricSelection);
    const rangedRow = ranged.rows.find(item => item.kind === 'M').values;
    rangedRow.splice(7, 7, '-2.5', '3.5', '1', '1', '-3.5', '2.5', '1');
    const rangedOutput = renderCompactEvidence(encodePcf(ranged), { profile: 'question-focused', question: 'Why?', fen });
    assert.ok(rangedOutput.includes(`\t${rangedRow[6]}\t-2.5..3.5\t1\t-3.5..2.5\t1`));
    assert.deepEqual(decodeLosslessCompactEvidence(renderLosslessCompactEvidence(encodePcf(ranged))), ranged);
    assert.deepEqual(decodeCompactWireEvidence(renderCompactWireEvidence(encodePcf(ranged))), ranged);
});

test('upstream predicate wins over a legacy rounded threshold at a near-boundary position', () => {
    const fen = '2kr2r1/p2q2bp/6p1/3pPp1P/1Pp5/4PN2/PPQ5/1K3RR1 b - - 0 23';
    const input = makeInput(fen), root = input.frames.find(frame => frame.id === 'root');
    assert.equal(strategicProfile(root, 'b').motifs.f815717572588e18, true);
    const bank = buildPcfEvidence(input, { playerColor: 'w' });
    const black = bank.frames[0].rows.find(item => item.kind === 'BINS' && item.values[1] === 'b');
    assert.equal(black.values[3], '0');
    assert.deepEqual(decodePcf(encodePcf(selectPcfEvidence(bank))), selectPcfEvidence(bank));
    const plain = encodePcf(selectPcfEvidence(bank), { plain: true });
    assert.ok(plain.startsWith('PCF/3p\n') && !plain.includes('!') && /,/.test(plain));
    assert.deepEqual(decodePcf(plain), selectPcfEvidence(bank));
    assert.throws(() => decodePcf(plain.replace(/,/, ',!')), /Malformed|marker/);
    const inaccurate = structuredClone(input);
    const profile = strategicProfile(root, 'b');
    inaccurate.references.push({ id: 'BP99', kind: 'binprop-contrast', data: { card: { kind: 'pawn-structure' }, source: 'LC0',
        positiveIds: ['LC1'], negativeIds: ['LC2'], horizon: 1,
        comparison: { color: 'b', positive: [{ profile }], negative: [{ profile }] } } });
    const filtered = buildPcfEvidence(inaccurate, { playerColor: 'w' });
    assert.ok(!filtered.engineRows.some(row => row.kind === 'W' && row.values[1] === 'BP99'));
});

test('optional separate child searches expose best and secondary opponent replies without changing perspective', async () => {
    const fen = '8/8/4K3/8/5kpp/1R6/8/8 w - - 0 55', first = ['b3b4', 'f4g5'], second = ['e6f6', 'h4h3'];
    const engineEvidence = makeInput(fen, [], first).engineEvidence;
    const base = groundedCoachingInput({ fen, history: [], playerColor: 'w', question: 'What can Black reply?', engineEvidence,
        source: { kind: 'saved-stockfish-analysis', depth: 12, preferredLineId: 'L1' },
        continuations: [{ id: 'L1', moves: first }, { id: 'L2', moves: second }] });
    let calls = 0;
    const mock = { search: async (childFen, { history, nodes }) => {
        calls++;
        const board = boardAt(childFen);
        const moves = board.moves({ verbose: true }).slice(0, 3).map(move => move.from + move.to + (move.promotion || ''));
        return { schema: 'pena-v2-search/1', fen: childFen, history, engine: engineEvidence.source.engine,
            perspective: 'root-side-to-move', budget: { nodes, moves: [] }, bestMove: moves[0],
            lines: moves.map((move, index) => ({ rank: index + 1, pv: [move] })),
            candidates: moves.map((move, index) => ({ move, visits: 20 - index, policyPrior: 0.1, search: { q: 0.25 - index * 0.01 } })) };
    } };
    const replies = await collectPcfReplySearches(base, mock);
    assert.equal(calls, 2);
    const pcf = pcfCoachingInput(base, { playerColor: 'w', replyEvidence: replies, tokenCount: () => 1 });
    const rows = pcf.pcf.selection.rows.filter(row => row.kind === 'REPLY');
    assert.equal(rows.length, 6);
    assert.deepEqual(rows.filter(row => row.values[2] === 'b3b4').map(row => row.values[4]).sort(), ['1', '2', '3']);
    assert.ok(rows.every(row => row.values[6] === 'b'));
    assert.ok(pcf.references.some(ref => ref.id === 'RP1.2' && ref.data.perspective === 'conditional-child-side-to-move'));
    assert.match(pcf.teacherMessages.at(-1).content, /\[RP1\.2\] REPLY:.*childTurn=b/);
    assert.deepEqual(decodePcf(pcf.pcf.text), pcf.pcf.selection);
    const absent = pcfCoachingInput(base, { playerColor: 'w', tokenCount: () => 1 });
    assert.deepEqual(absent.pcf.selection.rows.at(-1).values.slice(18, 21), ['?', '?', '0']);
    const forged = structuredClone(replies); forged.records[0].snapshot.fen = fen;
    assert.throws(() => pcfCoachingInput(base, { playerColor: 'w', replyEvidence: forged, tokenCount: () => 1 }), /differs from its exact board/);
    const wrongRank = structuredClone(replies); wrongRank.records[0].snapshot.lines[0].rank = 2;
    assert.throws(() => pcfCoachingInput(base, { playerColor: 'w', replyEvidence: wrongRank, tokenCount: () => 1 }), /duplicate MultiPV rank/);
});

test('mate and check suffixes use explicit mnemonic wire flags and round-trip to exact SAN', () => {
    const fen = '7R/7P/8/2p5/1p6/1Pk5/2P4r/1K1R4 w - - 1 42', moves = ['d1d3'];
    const engineEvidence = makeInput(fen, [], moves).engineEvidence;
    const input = groundedCoachingInput({ fen, history: [], playerColor: 'w', question: 'What happens?', engineEvidence,
        source: { kind: 'saved-stockfish-analysis', depth: 12, preferredLineId: 'L1' }, continuations: [{ id: 'L1', moves }] });
    const pcf = pcfCoachingInput(input, { playerColor: 'w', tokenCount: () => 1 });
    assert.match(pcf.pcf.text, /Rd3\.!MATE/);
    assert.doesNotMatch(pcf.pcf.text, /#!/);
    const action = decodePcf(pcf.pcf.text).rows.find(row => row.kind === 'Z' && row.values[1] === 'L1.p1');
    assert.match(action.values[5], /Rd3#/);
});

test('historical frames replay actual moves and do not conflate them with conditional frames', () => {
    const board = boardAt('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const history = [];
    for(const move of ['e4', 'e5', 'Nf3']) { history.push(board.fen()); assert.ok(board.move(move)); }
    const input = makeInput(board.fen(), history, ['b8c6']);
    const bank = buildPcfEvidence(input, { playerColor: 'w', history });
    assert.equal(bank.historySupplied, 3);
    assert.deepEqual(bank.historyFrames.map(frame => frame.id), ['H2', 'H3']);
    const selection = selectPcfEvidence(bank, { historicalFrames: ['H3'] });
    assert.match(encodePcf(selection), /@F H3 history/);
    assert.deepEqual(selection.rows.at(-1).values.slice(0, 6), ['3', '2', '1', '?', '1', '0']);
    assert.throws(() => buildPcfEvidence(input, { playerColor: 'w', history, historyIndexes: [99] }), /historical frame indexes/);
});

test('requested historical moments are selected together or explicitly reported missing under budget pressure', () => {
    const board = boardAt('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const history = [];
    for(const move of ['e4', 'e5', 'Nf3']) { history.push(board.fen()); assert.ok(board.move(move)); }
    const input = makeInput(board.fen(), history, ['b8c6'], 'What happened on move 1?');
    const included = pcfCoachingInput(input, { playerColor: 'w', history, tokenCount: () => 100, maxPromptTokens: 200 });
    assert.deepEqual(included.pcf.selection.rows.at(-1).values.slice(8, 12), ['1', '1', '3', '3']);
    const focused = renderReadableMessage(included.messages.at(-1).content, { format: 'question-focused', fen: board.fen() });
    assert.match(focused, /H3 G: same as current by square except below/);
    assert.match(focused, /H3 P: same as current by square except below/);
    assert.match(focused, /H3 BinProps \(White \/ Black\):/);
    for(const kind of ['G', 'P']) {
        const current = included.pcf.selection.rows.filter(item => item.kind === kind && item.values[0] === 'C');
        const before = included.pcf.selection.rows.filter(item => item.kind === kind && item.values[0] === 'H3');
        const delta = compactHistorySquares(current, before, kind);
        const restored = new Map(current.filter(item => !delta.absent.includes(item.values[1]))
            .map(item => [item.values[1], ['H3', ...item.values.slice(1)]]));
        for(const changed of delta.changed) restored.set(changed.values[1], changed.values);
        assert.deepEqual([...restored.values()].sort((a, b) => a[1].localeCompare(b[1])),
            before.map(item => item.values).sort((a, b) => a[1].localeCompare(b[1])));
    }
    const omitted = pcfCoachingInput(input, { playerColor: 'w', history,
        tokenCount: prompt => /@F H[12] /.test(prompt) ? 900 : 100, maxPromptTokens: 200 });
    assert.deepEqual(omitted.pcf.selection.rows.at(-1).values.slice(8, 12), ['1', '1', '3', '1']);
    assert.doesNotMatch(omitted.pcf.text, /@F H[12] /);
    assert.match(omitted.pcf.text, /@F H3 history/);
});

test('the previous position, played move and exact BinProp changes are mandatory even for ordinary advice', () => {
    const board = boardAt('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const history = [board.fen()]; board.move('e4');
    const input = makeInput(board.fen(), history, ['e7e5'], 'What should I play?');
    const output = pcfCoachingInput(input, { playerColor: 'w', history,
        tokenCount: prompt => /@F V1 /.test(prompt) ? 900 : 100, maxPromptTokens: 200 });
    assert.deepEqual(output.pcf.selectedFrames.historicalFrames, ['H1']);
    assert.match(output.pcf.text, /BASE C/);
    const decoded = decodePcf(output.pcf.text);
    assert.deepEqual(decoded, output.pcf.selection);
    assert.deepEqual(decodeLosslessCompactEvidence(renderLosslessCompactEvidence(output.pcf.text)), decoded);
    assert.deepEqual(decodeCompactWireEvidence(renderCompactWireEvidence(output.pcf.text)), decoded);
    assert.equal(row(decoded.rows, 'R', 'H1', 'e2').values[2], 'wP');
    assert.equal(row(decoded.rows, 'R', 'H1', 'e4'), undefined);
    const played = decoded.rows.find(item => item.kind === 'T' && item.values[0] === 'C');
    assert.equal(played.values[1], 'H1'); assert.equal(played.values[2], 'e2e4');
    assert.ok(decoded.rows.some(item => item.kind === 'D' && item.values[0] === 'C'));
    assert.equal(decoded.rows.filter(item => item.kind === 'BCHANGE').length, 2);
    assert.match(output.teacherMessages.at(-1).content, /BCHANGE: frame=C; before=H1; color=w/);
    const change = decoded.rows.find(item => item.kind === 'BCHANGE' && item.values.slice(3, 5).some(value => value !== '-'));
    if(change) {
        const code = change.values.slice(3, 5).find(value => value !== '-').split(',')[0];
        const name = pcfBinPropMotifs.find(motif => motif.code === code).name;
        assert.ok(renderReadableEvidence(output.pcf.text).includes(name));
        assert.ok(renderCompactEvidence(output.pcf.text).includes(name));
    }
    assert.throws(() => pcfCoachingInput(input, { playerColor: 'w', history, tokenCount: () => 201, maxPromptTokens: 200 }), /previous position/);
    const tampered = structuredClone(decoded);
    tampered.rows.find(item => item.kind === 'BCHANGE').values[5] = '999';
    assert.throws(() => encodePcf(tampered), /played-move changes disagree/);
    assert.throws(() => decodePcf(output.pcf.text.replace('BASE C', 'BASE H1')), /malformed|Invalid|Unknown/i);
});

test('mandatory played context preserves real en-passant captures, castling and promotion', () => {
    for(const [fen, move, capture, promotion] of [
        ['k7/8/8/3pP3/8/8/8/7K w - d6 0 1', 'e5d6', 'd5', '-'],
        ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1', '-', '-'],
        ['7k/P7/8/8/8/8/8/7K w - - 0 1', 'a7a8n', '-', 'n']
    ]) {
        const board = boardAt(fen), history = [board.fen()];
        assert.ok(board.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }));
        const input = makeInput(board.fen(), history);
        const output = pcfCoachingInput(input, { playerColor: 'w', history, tokenCount: () => 1 });
        const decoded = decodePcf(output.pcf.text);
        assert.deepEqual(decoded, output.pcf.selection);
        const currentPieces = decoded.rows.filter(item => item.kind === 'R' && item.values[0] === 'C');
        const historyPieces = decoded.rows.filter(item => item.kind === 'R' && item.values[0] === 'H1');
        const delta = compactHistoryRelations(currentPieces, historyPieces);
        const restored = new Map(currentPieces.filter(item => !delta.absent.includes(item.values[3]))
            .map(item => [item.values[3], ['H1', ...item.values.slice(1)]]));
        for(const changed of delta.changed) restored.set(changed.values[3], changed.values);
        assert.deepEqual([...restored.values()].sort((a, b) => a[3].localeCompare(b[3])),
            historyPieces.map(item => item.values).sort((a, b) => a[3].localeCompare(b[3])));
        const focused = renderReadableMessage(output.messages.at(-1).content, { format: 'question-focused', fen: board.fen() });
        assert.match(focused, /H1 pieces: same as current by identity except below/);
        const played = decoded.rows.find(row => row.kind === 'T' && row.values[0] === 'C');
        assert.equal(played.values[2], move);
        assert.equal(played.values[6], capture);
        assert.equal(played.values[8], promotion);
        if(move === 'e1g1') assert.match(played.values[9], /\.h1\.f1/);
        assert.doesNotMatch(JSON.stringify(output.messages), /(?:[prnbqkPRNBQK1-8]+\/){7}[prnbqkPRNBQK1-8]+/);
    }
});

test('special moves preserve promotion and en-passant captures without exposing FEN', () => {
    const promotion = makeInput('7k/P7/8/8/8/8/8/7K w - - 0 1', [], ['a7a8n']);
    const pcf = buildPcfEvidence(promotion, { playerColor: 'w' });
    const promoted = row(pcf.frames[1].rows, 'R', 'V1', 'a8');
    assert.equal(promoted.values[2], 'wN');
    assert.equal(promoted.values[3], row(pcf.frames[0].rows, 'R', 'C', 'a7').values[3]);
    assert.equal(pcf.frames[1].rows.find(item => item.kind === 'T').values[8], 'n');
    const ep = makeInput('k7/8/8/3pP3/8/8/8/7K w - d6 0 1', [], ['e5d6']);
    const epBank = buildPcfEvidence(ep, { playerColor: 'w' });
    assert.equal(epBank.frames[0].rows.find(item => item.kind === 'F').values[8], 'e5d6');
    assert.equal(epBank.frames[0].rows.find(item => item.kind === 'U' && item.values[1] === 'e5d6').values[2], 'd5');
    assert.deepEqual(row(epBank.frames[0].rows, 'C', 'C', 'd5').values.slice(2), ['e5d6', '1']);
    assert.equal(epBank.frames[1].rows.find(item => item.kind === 'T').values[6], 'd5');
    assert.equal(row(epBank.frames[1].rows, 'R', 'V1', 'd5'), undefined);
    const pinned = buildPcfEvidence(makeInput('k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'), { playerColor: 'w' });
    assert.deepEqual(row(pinned.frames[0].rows, 'C', 'C', 'd5').values.slice(2), ['-', '0']);
    const castle = buildPcfEvidence(makeInput('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', [], ['e1g1']), { playerColor: 'w' });
    const moved = castle.frames[1].rows.find(item => item.kind === 'T').values[9];
    assert.match(moved, /\.e1\.g1/);
    assert.match(moved, /\.h1\.f1/);
});
