import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { Chess } from '../../libraries/chessjs/chess.js';
import { CommentaryStream, sourceSentences } from '../commentary.js';
import { CoachingChecks, moveRationale } from '../coaching.js';
import { moveIntent, questionLead, QuestionAnswer } from '../questions.js';
import { decodeExplanation } from '../position.js';

const start = new Chess().fen();
const review = (fen, move, { best = move, pv = [move], bestPv = [best], loss = 0, provisional = false } = {}) => ({
    fen, move, depth: 12, cpLoss: loss, provisional,
    best: { move: best, cp: 30, mate: null, pv: bestPv },
    played: { move, cp: 30 - loss, mate: null, pv }
});
const intentFor = (fen, san) => {
    const board = new Chess(fen);
    return moveIntent(fen, board.move(san), { yours: true });
};

test('Pena does not count blank paragraph separators as checked coaching sentences', () => {
    const raw = 'The best move is Nf3.\n\nThe knight controls e5.';
    assert.equal(sourceSentences(raw).length, 2);
    const result = new CommentaryStream({ fen: start, mode: 'original' }).update(raw, true);
    assert.equal(result.assessments.length, 2);
    assert.ok(result.assessments.every(item => item.source.trim()));
});

test('Pena omits a routine own-move lead instead of dressing a recap up as a reason', () => {
    const board = new Chess();
    board.move('e4');
    const intent = intentFor(board.fen(), 'a6');
    assert.equal(moveRationale(intent.beforeFen, intent.uci), '');
    assert.equal(questionLead(intent, { checkedCoaching: true }), '');
    const capture = intentFor('4k3/1b6/2B5/8/8/8/8/4K3 b - - 0 1', 'Bxc6');
    assert.doesNotMatch(questionLead(capture, { checkedCoaching: true }), /captures the white bishop|removing the bishop on c6/);
});

test('Pena preserves a concrete own-move reason and the useful checked reply, without the recap prefix', async () => {
    const intent = intentFor(start, 'Nf3');
    const answer = new QuestionAnswer(intent, { checkedCoaching: true });
    const checks = new CoachingChecks({ fen: intent.analysisFen, evaluate: async (fen, move) => review(fen, move) });
    const raw = 'The best move is d5, challenging the center. This opens a line for the bishop.';
    let result, previous = '';
    await checks.update(answer.stream, raw, true, { onUpdate: (_, options) => {
        result = answer.update(raw, options.complete, options);
        assert.ok(result.text.startsWith(previous));
        previous = result.text;
    } });
    assert.match(result.text, /^Nf3, bringing the knight into reach of d4 and e5/);
    assert.match(result.text, /After Nf3, Black could reply with d5, challenging the center/);
    assert.doesNotMatch(result.text, /Your Nf3|moves the knight from|Nice|good move/);
    assert.equal(result.presentation.emptyReason, null);
});

test('Pena drops an obsolete Nd7 recap while retaining its reason and reply analysis', async () => {
    const intent = intentFor('r1bqkb1r/ppp1pppp/2n2n2/3p4/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 1 2', 'Nd7');
    const answer = new QuestionAnswer(intent, { checkedCoaching: true });
    const checks = new CoachingChecks({ fen: intent.analysisFen, evaluate: async (fen, move) => review(fen, move) });
    const raw = 'The best move is Nc3, developing a piece and supporting the center.';
    let result;
    await checks.update(answer.stream, raw, true, { onUpdate: (_, options) => {
        result = answer.update(raw, options.complete, options);
    } });
    assert.match(result.text, /Nd7.*e5/);
    assert.match(result.text, /After Nd7, White could reply with Nc3/);
    assert.doesNotMatch(result.text, /Your Nd7|moves the knight from f6 to d7/);
});

test('Pena can explain a bad own move only through an actual searched consequence', async () => {
    const before = '4k3/8/8/8/3q4/8/4R3/4K3 w - - 0 1';
    const intent = intentFor(before, 'Re4');
    const answer = new QuestionAnswer(intent, { checkedCoaching: true });
    const calls = [];
    const checks = new CoachingChecks({ fen: intent.analysisFen, evaluate: async (fen, move, current, depth) => {
        calls.push({ fen, move, depth });
        return fen === before ? review(fen, move, { best: 'e2d2', pv: ['e2e4', 'd4e4'], loss: 500 })
            : review(fen, move);
    } });
    const raw = 'The best move is Qxe4, capturing the rook.';
    let result;
    await checks.update(answer.stream, raw, true, { onUpdate: (_, options) => {
        result = answer.update(raw, options.complete, options);
    } });
    assert.match(result.text, /Re4.*Qxe4.*leaving White 5 points of material down compared with the start of this line/);
    assert.doesNotMatch(result.text, /Nice|good move|because it improves/);
    assert.equal(calls.find(call => call.fen === before).depth, 12);
});

test('Pena does not invent a cause from a worse score or praise an inconclusive own-move check', async () => {
    for(const provisional of [false, true]) {
        const intent = intentFor(start, 'a3');
        const answer = new QuestionAnswer(intent, { checkedCoaching: true });
        const checks = new CoachingChecks({ fen: intent.analysisFen, evaluate: async (fen, move) =>
            fen === start ? review(fen, move, { best: 'g1f3', loss: 300, provisional }) : review(fen, move) });
        const raw = 'The best move is d5, challenging the center.';
        let result;
        await checks.update(answer.stream, raw, true, { onUpdate: (_, options) => {
            result = answer.update(raw, options.complete, options);
        } });
        assert.match(result.text, provisional ? /inconclusive about a3/ : /preferred Nf3 to a3, but that alone does not explain why/);
        assert.doesNotMatch(result.text, /Your a3|moves the pawn from|winning|Nice/);
    }
});

test('Pena cancels the own-move review before publishing any advice', async () => {
    const intent = intentFor(start, 'Nf3');
    const answer = new QuestionAnswer(intent, { checkedCoaching: true });
    let current = true, publications = 0;
    const checks = new CoachingChecks({ fen: intent.analysisFen, isCurrent: () => current, evaluate: async (fen, move) => {
        current = false;
        return review(fen, move);
    } });
    await assert.rejects(checks.update(answer.stream, 'The best move is d5.', true,
        { onUpdate: () => publications++ }), { name: 'AbortError' });
    assert.equal(publications, 0);
    assert.equal(answer.stream.text, '');
    assert.equal(answer.stream.ownMoveReview, undefined);
});

test('Pena distinguishes budget, duplicate, incomplete and safety empty output without a fabricated answer', async () => {
    const reason = 'The best move is Nf3, developing a piece and preparing to castle.';
    const once = new CommentaryStream({ fen: start }).update(reason, true);
    const duplicate = new CommentaryStream({ fen: start, previous: [once.text] }).update(reason, true);
    assert.equal(duplicate.text, '');
    assert.equal(duplicate.presentation.emptyReason, 'repeated');
    const budget = new CommentaryStream({ fen: start }).update(
        `The best move is Nf3, ${'carefully considering the central position '.repeat(15)}.`, true);
    assert.equal(budget.text, '');
    assert.equal(budget.presentation.emptyReason, 'budget');
    const incomplete = await new CoachingChecks({ fen: start, evaluate: async (fen, move) => review(fen, move) })
        .update(new CommentaryStream({ fen: start }), 'The position is quiet. The best move', true, { truncated: true });
    assert.equal(incomplete.presentation.emptyReason, 'incomplete');
    const checks = new CoachingChecks({ fen: start, evaluate: async (fen, move) =>
        review(fen, move, { best: 'g1f3', loss: 300, provisional: true }) });
    const withheld = await checks.update(new CommentaryStream({ fen: start }), 'The best move is a3.', true);
    assert.equal(withheld.text, '');
    assert.equal(withheld.presentation.emptyReason, 'withheld');
    assert.equal(withheld.presentation.shown, 0);
    assert.ok(withheld.presentation.withheld > 0);
});

test('Pena does not revive an unsupported introduction in a checked topic answer', async () => {
    const intent = { kind: 'position', topic: 'pawns', fen: start, analysisFen: start, mover: 'w' };
    const answer = new QuestionAnswer(intent, { checkedCoaching: true });
    const checks = new CoachingChecks({ fen: start, evaluate: async (fen, move) =>
        review(fen, move, { best: 'g1f3', loss: 300 }) });
    const raw = 'The pawn storm is unstoppable. The best move is a3, preparing a pawn storm.';
    let result;
    await checks.update(answer.stream, raw, true, { onUpdate: (_, options) => {
        result = answer.update(raw, options.complete, options);
    } });
    assert.doesNotMatch(result.text, /unstoppable|pawn storm/);
    const empty = new QuestionAnswer(intent, { checkedCoaching: true }).update('The best move', true);
    assert.equal(empty.text, '');
    assert.doesNotMatch(empty.text, /nothing special/);
});

test('Pena quarantines the continuation of a factually contradicted main recommendation', async () => {
    const stream = new CommentaryStream({ fen: start, mode: 'original' });
    const checks = new CoachingChecks({ fen: start, evaluate: async (fen, move) => review(fen, move) });
    const result = await checks.update(stream,
        'The best move is Nf3, giving checkmate. This wins immediately. The opponent should play d5.', true);
    assert.equal(result.text, '');
    assert.equal(result.presentation.emptyReason, 'withheld');
    assert.ok(result.assessments.some(item => item.rejectedLine));
    const repaired = await new CoachingChecks({ fen: start, evaluate: async (fen, move) => review(fen, move) })
        .update(new CommentaryStream({ fen: start }),
            'The best move is Nf3, giving checkmate.\nBEST_MOVE: white knight g1-f3', true);
    assert.match(repaired.text, /^Nf3,.*d4 and e5/);
    assert.doesNotMatch(repaired.text, /checkmate/);
});

test('Pena saved mate output cannot invent a reply after checkmate or misname the destination rank', async () => {
    // Saved 4613-position corpus case 95916fc2fbf6cf5b4934fafa14f7ffe16b759c39db8a3e4f2a8ae02005b42cb7.
    const fen = 'r2k1bnr/ppp3pp/3p4/3Np1P1/4P1Q1/8/PP1P2PP/n1B2RK1 w - - 2 12';
    const raw = 'The best move is 14.white rook f1 takes black bishop f8, capturing the bishop and deeply infiltrating the rook on the first rank. '
        + "The opponent's best attempt is 14...black king d8-d7, but this leads to forced mate. "
        + 'The player responds 15.white rook f8-f7, placing the rook on the second rank where it dominates the black king.';
    const result = await new CoachingChecks({ fen, evaluate: async (position, move) => review(position, move) })
        .update(new CommentaryStream({ fen, mode: 'original' }), raw, true);
    assert.match(result.text, /Rxf8#.*8th rank/);
    assert.doesNotMatch(result.text, /first rank|best attempt|Kd8-d7|Rf8-f7|second rank/);
    assert.ok(result.assessments.some(item => item.reason === 'No reply is legal after checkmate.'));
});

const corpusFiles = process.env.PENA_COMMENTARY_CORPUS?.split(';').filter(Boolean) || [];
test('Pena replays saved real model outputs append-only with explicit omission reasons', { skip: !corpusFiles.length }, () => {
    const rows = corpusFiles.flatMap(file => readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse));
    const limit = Number(process.env.PENA_COMMENTARY_LIMIT || 24);
    const chosen = rows.filter((row, index) => index % Math.max(1, Math.floor(rows.length / limit)) === 0).slice(0, limit);
    assert.ok(chosen.length);
    for(const row of chosen) {
        const raw = decodeExplanation(row.raw, row.fen.split(' ')[1]);
        for(const mode of ['brief', 'dynamic', 'original']) {
            const stream = new CommentaryStream({ fen: row.fen, mode, you: true });
            let previous = '';
            for(let end = 73; end < raw.length; end += 347) {
                const next = stream.update(raw.slice(0, end)).text;
                assert.ok(next.startsWith(previous), row.id);
                previous = next;
            }
            const result = stream.update(raw, true, { truncated: row.finishReason === 'length' });
            assert.ok(result.text.startsWith(previous), row.id);
            assert.ok(result.assessments.every(item => !item.shown || item.status !== 'contradicted'), row.id);
            assert.ok(result.text || result.presentation.emptyReason, row.id);
        }
    }
    console.log(`Saved Pena replay: ${rows.length} available, ${chosen.length} sampled, ${chosen.length * 3} mode replays.`);
});

const savedChecks = process.env.PENA_COMMENTARY_CHECKS;
test('Pena replays real saved move-check evidence without rerunning a model or inventing search results',
    { skip: !savedChecks || !corpusFiles.length }, async () => {
        const sources = new Map(corpusFiles.flatMap(file => readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse))
            .map(row => [row.id, row]));
        const saved = readFileSync(savedChecks, 'utf8').trim().split('\n').map(JSON.parse);
        const evidence = new Map();
        for(const row of saved) for(const record of row.assessments) for(const check of record.moveChecks || []) {
            const key = `${check.fen}|${check.move}`;
            if(!evidence.has(key) || evidence.get(key).depth < check.depth) evidence.set(key, check);
        }
        const results = [];
        let requests = 0;
        const usedReviews = new Set();
        for(const row of saved) {
            const source = sources.get(row.id);
            assert.ok(source, `No saved source for ${row.id}`);
            const raw = decodeExplanation(source.raw, row.fen.split(' ')[1]);
            const stream = new CommentaryStream({ fen: row.fen, mode: row.mode, you: true });
            const checks = new CoachingChecks({ fen: row.fen, evaluate: async (fen, move, current, depth) => {
                requests++;
                usedReviews.add(`${fen}|${move}|${depth}`);
                const actual = evidence.get(`${fen}|${move}`);
                assert.ok(actual && actual.depth >= depth, `Missing saved search: ${row.id}: ${fen}|${move} at ${depth}`);
                return actual;
            } });
            let previous = '';
            const onUpdate = result => {
                assert.ok(result.text.startsWith(previous), row.id);
                previous = result.text;
                assert.ok(result.assessments.every(item => !item.shown || item.status !== 'contradicted'), row.id);
            };
            await checks.update(stream, raw.slice(0, Math.floor(raw.length / 2)), false, { onUpdate });
            const result = await checks.update(stream, raw, true,
                { truncated: source.finishReason === 'length', onUpdate });
            results.push({ ...row, ...result });
        }
        const reacted = new Set();
        for(const row of saved) {
            if(reacted.has(row.id)) continue;
            const actual = row.assessments.flatMap(record => record.moveChecks || []).find(check => check.fen === row.fen);
            assert.ok(actual, `Missing root evidence for own-move reaction: ${row.id}`);
            const intent = moveIntent(row.fen, { from: actual.move.slice(0, 2), to: actual.move.slice(2, 4),
                promotion: actual.move[4] }, { yours: true });
            const answer = new QuestionAnswer(intent, { checkedCoaching: true });
            const checks = new CoachingChecks({ fen: intent.analysisFen, evaluate: async (fen, move) => {
                assert.equal(fen, actual.fen);
                assert.equal(move, actual.move);
                return actual;
            } });
            let result;
            await checks.update(answer.stream, '', true,
                { onUpdate: (_, options) => { result = answer.update('', options.complete, options); } });
            assert.doesNotMatch(result.text, /Your .* moves the|Your .* captures the|Nice,|good move/i, row.id);
            assert.ok(result.text || result.presentation.emptyReason, row.id);
            assert.ok(answer.stream.ownMoveReview, row.id);
            reacted.add(row.id);
        }
        if(process.env.PENA_COMMENTARY_REPLAY_OUTPUT)
            writeFileSync(process.env.PENA_COMMENTARY_REPLAY_OUTPUT, results.map(row => JSON.stringify(row)).join('\n') + '\n');
        console.log(JSON.stringify({ savedSearchReplay: true, positions: new Set(results.map(row => row.id)).size,
            answers: results.length, replayedSearchRequests: requests, uniqueSavedReviews: usedReviews.size,
            ownMoveReactions: reacted.size,
            empty: results.filter(row => !row.text).length,
            withheldAnswers: results.filter(row => row.presentation.withheld).length,
            replacements: results.filter(row => row.assessments.some(item => item.replacement)).length }));
    });
