import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Chess } from '../../libraries/chessjs/chess.js';
import { PlayerPatterns } from '../coach-session.js';
import { voicePhrases } from '../coach-style.js';
import { PenaConversation } from '../conversation.js';
import { acceptanceMetrics, boardAccuracy, buildMessages, buildStudyRequest, createStudyState, failureMetrics, finishTurn, gameCoverage, loadChecker,
    makeProvenance, matchedRows, orderedEvents, planTurn, polish, rollingRepetition, selectCandidate, sourceFingerprint, studyEvidenceClass, validateOrder, validateResume } from './voice-study.mjs';
import { normalizeNativeReasoning, readGGUFModelInfo } from '../../../../../appServer/backend/nativeAI.js';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const harness = fileURLToPath(new URL('voice-study.mjs', import.meta.url));

test('experimental candidate selection scores only screened answers and preserves urgent targets', () => {
    const recent = Array(3).fill('Your knight on f3 is hanging. Do not rush the attack.');
    const repeated = { answer: 'Your knight on f3 is hanging.', failed: false };
    const varied = { answer: 'The attack on f3 needs attention.', failed: false };
    assert.equal(selectCandidate([repeated, varied], recent), 1);
    assert.equal(selectCandidate([repeated, { answer: '', failed: false }], recent), 0);
    assert.equal(selectCandidate([repeated, { ...varied, failed: true }], recent), 0);
    assert.equal(selectCandidate([repeated, { answer: 'The center matters.', failed: false }], recent, { urgent: true }), 0);
    assert.equal(selectCandidate([repeated, varied], recent, { urgent: true }), 1);
    assert.equal(studyEvidenceClass({ config: { candidateCount: 2 } }), 'unshipped-candidate-experiment');
});

function game(moves = ['e4', 'e5', 'Nf3', 'Nc6'], gameId = 'one') {
    const board = new Chess(), history = [];
    for(const san of moves) { history.push(board.fen()); board.move(san); }
    return { id: gameId, gameId, fen: board.fen(), history, playerColor: 'w' };
}

function preparedEvents(row = game()) {
    return orderedEvents([row]).map(event => {
        const move = new Chess(event.fen).moves({ verbose: true })[0];
        const uci = move.from + move.to + (move.promotion || '');
        return { ...event, record: { fen: event.fen,
            engine: { depth: 1, lines: [{ move: uci, pv: [uci], depth: 1, score: { cp: 0, mate: null } }] },
            last: null, threat: null, recent: [] } };
    });
}

function fixtureModelProps(directory) {
    const string = value => {
        const text = Buffer.from(value), size = Buffer.alloc(8);
        size.writeBigUInt64LE(BigInt(text.length));
        return Buffer.concat([size, text]);
    };
    const header = Buffer.alloc(24), type = Buffer.alloc(4);
    header.write('GGUF'); header.writeUInt32LE(3, 4); header.writeBigUInt64LE(1n, 16); type.writeUInt32LE(8);
    const file = new URL('fixture-model.gguf', directory);
    writeFileSync(file, Buffer.concat([header, string('general.architecture'), type, string('inkling2_loop')]));
    return { model_path: fileURLToPath(file), model_alias: 'pena-study', build_info: 'test-fixture', total_slots: 1 };
}

test('direct requests use production architecture normalization, never a filename heuristic', async () => {
    const messages = [{ role: 'user', content: 'Hello' }];
    for(const [architecture, budget] of [['inkling2_loop', 16], ['inkling2', 0]]) {
        const info = { architecture, inkling: true };
        const request = buildStudyRequest(messages, 42, info);
        assert.equal(request.reasoning_budget_tokens, budget);
        assert.equal(request.chat_template_kwargs.reasoning_effort, 'none');
        assert.equal(request.max_tokens, 528);
        assert.deepEqual(request, normalizeNativeReasoning({ model: 'pena-study', messages, seed: 42,
            temperature: 0.3, max_tokens: 528, reasoning_effort: 'none', stream: false, cache_prompt: true }, info));
    }
    assert.throws(() => buildStudyRequest(messages, 42, null), /Verified GGUF architecture/);
});

test('whole-game preparation merges overlapping histories, orders plies and assigns actual mover', () => {
    const long = game(), short = game(['e4', 'e5']);
    const events = orderedEvents([long, short]);
    assert.equal(events.length, 4);
    assert.deepEqual(events.map(row => [row.ply, row.kind]), [[1, 'played'], [2, 'position'], [3, 'played'], [4, 'position']]);
    assert.equal(events[0].playedSan, 'e4');
    assert.equal(events[3].beforeFen, events[2].fen);
    assert.equal(events[3].history.length, 4);
    validateOrder(events);
    assert.throws(() => validateOrder([events[1], events[0]]), /order/i);
    assert.throws(() => validateOrder([events[0], events[0]]), /duplicate/i);
    assert.throws(() => orderedEvents([long, game(['d4'], 'one')]), /conflicting ply/i);
    assert.throws(() => orderedEvents([{ ...long, history: [long.history[0], long.history[2]] }]), /transition/i);
});

test('short or truncated histories never count as 40-move samples', () => {
    const events = preparedEvents();
    assert.equal(gameCoverage(events).met, false);
    assert.equal(gameCoverage([]).met, null);
    const segment = preparedEvents({ ...game(), history: game().history.slice(2) });
    assert.equal(segment[0].gameStartPly, 2);
    assert.equal(gameCoverage(segment).fortyMoveSamples, 0);
});

test('ordered state resets model history on changed positions while retaining comments and rotating focus', () => {
    const events = preparedEvents(), state = createStudyState();
    const first = planTurn(state, events[0], 'chatty');
    finishTurn(state, events[0], first, 'Keep things simple.');
    const second = planTurn(state, events[1], 'chatty');
    assert.notEqual(second.focus, first.focus);
    assert.deepEqual(second.conversation, []);
    assert.deepEqual(second.recent, ['keep things simple']);
    assert.deepEqual(state.recent, ['Keep things simple.']);
    finishTurn(state, events[1], second, '');
    assert.equal(state.frequency.silentPlies, 1);
    const next = planTurn(state, { ...events[0], gameId: 'two' }, 'chatty');
    assert.deepEqual(next.conversation, []);
    assert.deepEqual(next.recent, []);
    assert.equal(state.frequency.silentPlies, 0);
    assert.equal(state.gameIndex, 2);
    assert.equal(state.patterns.data.games, 2);
});

test('automatic game history matches actual PenaConversation lifecycle and live source snapshots', async () => {
    const events = preparedEvents(), first = events[1], next = events[3];
    const live = new PenaConversation({ tokenCount: () => 0, engine: {
        lines: async () => { throw new Error('Unexpected real engine request'); }
    } });
    const prepare = async (event, question = event.question) => {
        live.follow(event.fen);
        live.analysis = Promise.resolve(event.record);
        return live.prepare(question, { fen: event.fen, history: event.history, playerColor: event.playerColor });
    };
    const state = createStudyState(), answer = 'Your pawn on e4 is undefended.';
    const initial = await prepare(first);
    assert.deepEqual(initial.notesSnapshot.conversation, []);
    live.remember(initial, answer);
    const initialTurn = planTurn(state, first, 'chatty');
    finishTurn(state, first, initialTurn, answer);
    const typed = await prepare(first, 'What changed?');
    const samePosition = planTurn(state, first, 'chatty');
    assert.deepEqual(samePosition.conversation, typed.notesSnapshot.conversation.map(({ player, pena }) => ({ player, pena })));
    assert.equal(samePosition.conversation.length, 1);
    const typedMessages = await buildMessages({ ...first, question: 'What changed?' }, { hideMoves: false, ...samePosition });
    assert.equal(typedMessages.filter(message => message.role === 'assistant').length, 1);
    const clockOnly = first.fen.split(' ');
    clockOnly[4] = '17'; clockOnly[5] = '12';
    assert.equal(planTurn(state, { ...first, fen: clockOnly.join(' ') }, 'chatty').conversation.length, 1);
    const changed = await prepare(next);
    assert.ok(live.earlier.length > 0);
    assert.deepEqual(changed.notesSnapshot.earlier, []);
    assert.deepEqual(changed.notesSnapshot.conversation, []);
    assert.deepEqual(changed.history, []);
    const nextTurn = planTurn(state, next, 'chatty');
    assert.deepEqual(nextTurn.conversation, changed.notesSnapshot.conversation);
    assert.deepEqual(state.recent, [answer]);
    assert.deepEqual(nextTurn.recent, ['your pawn on']);
    const messages = await buildMessages(next, { hideMoves: false, ...nextTurn });
    assert.equal(messages.filter(message => message.role === 'assistant').length, 0);
    assert.ok(messages.every(message => !message.content.includes(answer)));
});

test('whole-game prompt bounds older exchanges before the shared adapter serializes them', async () => {
    const event = preparedEvents()[0];
    const conversation = Array.from({ length: 7 }, (_, index) => ({ player: `(played e4)`, pena: `Remembered response ${index}.` }));
    const messages = await buildMessages(event, { hideMoves: false, conversation });
    assert.equal(messages.length, 11);
    assert.deepEqual(messages.slice(0, 2).map(message => message.role), ['system', 'system']);
    assert.deepEqual(messages.slice(2).map(message => message.role), ['user', 'assistant', 'user', 'assistant', 'user', 'assistant', 'user', 'assistant', 'user']);
    assert.deepEqual(messages.filter(message => message.role === 'assistant').map(message => message.content),
        conversation.slice(-4).map(turn => turn.pena));
    assert.ok(!messages.some(message => message.content.includes('Remembered response 0.')));
    const state = createStudyState();
    for(let index = 0; index < 7; index++) {
        const turn = planTurn(state, event, 'chatty');
        finishTurn(state, event, turn, conversation[index].pena);
    }
    assert.equal(state.conversation.length, 4);
    assert.equal(state.recent.length, 7);
});

test('normal frequency supplies production silence state and does not store suppressed turns', () => {
    const event = preparedEvents()[0], state = createStudyState();
    event.record.last = { label: 'Good' };
    let turn = planTurn(state, event, 'normal');
    assert.equal(turn.speak, false);
    finishTurn(state, event, turn, '');
    assert.equal(state.frequency.silentPlies, 1);
    assert.equal(state.conversation.length, 0);
    turn = planTurn(state, event, 'normal');
    assert.equal(turn.speak, true);
    const screened = polish('Keep things simple.', event, { hideMoves: false,
        recent: ['Keep things simple.', 'Keep things simple.', 'Keep things simple.'] });
    assert.equal(screened, '');
    finishTurn(state, event, turn, screened);
    assert.equal(state.frequency.silentPlies, 2);
    assert.equal(state.conversation.length, 0);
    turn = planTurn(state, event, 'normal');
    assert.equal(turn.speak, true);
    finishTurn(state, event, turn, 'Keep things simple.');
    assert.equal(state.frequency.silentPlies, 0);
});

test('normal commentary alternates isolated calm turns across forced comments', () => {
    const state = createStudyState();
    const [base] = preparedEvents();
    const calm = { ...base, record: { last: { label: 'Good' } } };
    const mistake = { ...base, id: `${base.id}:mistake`, record: { last: { label: 'Mistake' } } };
    const turns = [];
    for(let index = 0; index < 4; index++) {
        const calmTurn = planTurn(state, calm, 'normal');
        turns.push(calmTurn.speak);
        finishTurn(state, calm, calmTurn, calmTurn.speak ? 'The center is open.' : '');
        const urgentTurn = planTurn(state, mistake, 'normal');
        assert.equal(urgentTurn.speak, true);
        finishTurn(state, mistake, urgentTurn, 'That move allowed a check.');
    }
    assert.deepEqual(turns, [false, true, false, true]);
    assert.equal(state.frequency.calmTurns, 4);
});

test('production pattern state sees board-backed recurrence across games and cooldown', () => {
    const row = game(['e4', 'e5', 'Qh5']);
    const event = preparedEvents(row).at(-1);
    event.record.last = { fen: event.beforeFen, san: 'Qh5', uci: 'd1h5', label: 'Mistake' };
    const state = createStudyState(new PlayerPatterns(null));
    let turn = planTurn(state, event, 'chatty');
    assert.equal(turn.pattern, '');
    finishTurn(state, event, turn, 'Give yourself room to think.');
    const next = { ...event, gameId: 'two' };
    turn = planTurn(state, next, 'chatty');
    assert.match(turn.pattern, /across games/);
    finishTurn(state, next, turn, 'Keep things simple.');
    assert.notEqual(planTurn(state, next, 'chatty').pattern, '', 'A prompt alone must not consume the reminder cooldown');
    const answer = polish('Your king on e1 is safe.', next, { hideMoves: true, patternComment: turn.patternComment });
    assert.ok(answer.includes(turn.patternComment));
    finishTurn(state, next, turn, answer);
    assert.equal(planTurn(state, next, 'chatty').pattern, '');
    const third = planTurn(state, { ...event, gameId: 'three' }, 'chatty');
    assert.equal(third.pattern, '');
});

test('resume requires exact provenance and ordered prefix, not just an old matching ID', () => {
    const events = preparedEvents(), config = { style: 'natural', modelIdentity: 'fixture' };
    const meta = makeProvenance(events, config, 'source-one');
    const row = { id: events[0].id, fen: events[0].fen, answer: 'Hello.', fingerprint: meta.fingerprint };
    validateResume(meta, makeProvenance(events, config, 'source-one'), [row], events);
    for(const changed of [makeProvenance(events, config, 'source-two'),
        makeProvenance(events, { ...config, style: 'legacy' }, 'source-one'),
        makeProvenance(events.slice(1), config, 'source-one')]) {
        assert.throws(() => validateResume(meta, changed, [row], events), /provenance mismatch/i);
    }
    assert.throws(() => validateResume(null, meta, [row], events), /historical/i);
    assert.throws(() => validateResume(meta, meta, [{ ...row, id: events[1].id }], events), /prefix/i);
    assert.match(sourceFingerprint(), /^[a-f0-9]{64}$/);
    assert.equal(studyEvidenceClass({ config: { studyRevision: 2 } }), 'pre-parity-experiment');
});

test('rolling metric counts meaningful non-chess bigrams once per comment, with game boundaries', () => {
    assert.ok(voicePhrases('Keep things simple.').has('keep things'));
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: String(i), gameId: 'one',
        answer: i < 4 ? 'Keep things simple. Keep things simple.' : 'The knight on f3.' }));
    const report = rollingRepetition(rows);
    assert.equal(report.windows, 1);
    assert.equal(report.maximum, 4);
    assert.equal(report.met, false);
    assert.ok(report.violations.some(row => row.phrase === 'keep things' && row.count === 4));
    rows[3].answer = 'The knight on f3.';
    assert.equal(rollingRepetition(rows).met, true);
    assert.equal(rollingRepetition(rows.map((row, i) => ({ ...row, gameId: i < 5 ? 'one' : 'two' }))).met, null);
    assert.equal(rollingRepetition([...rows.slice(0, 9), { id: 'silent', gameId: 'one', answer: '' }]).windows, 0);
});

test('shared production gate screens repetition before stored speech and conversation', () => {
    const event = preparedEvents()[0];
    const text = 'Keep things simple.';
    assert.equal(polish(text, event, { hideMoves: false, recent: [text, text, text] }), '');
    assert.equal(polish(text, event, { hideMoves: false, recent: [text, text] }), text);
});

test('automatic presentation passes engine grade to the shared verdict cleanup', () => {
    const event = preparedEvents()[0];
    const originalStyle = process.env.PENA_STUDY_STYLE;
    process.env.PENA_STUDY_STYLE = 'natural';
    try {
        for(const label of ['Good', 'Neutral']) {
            event.record.last = { label };
            assert.equal(polish('e4 is fine, but it gives your bishop room.', event, { hideMoves: false }), 'e4 gives your bishop room.');
        }
        event.record.last = { label: 'Mistake' };
        assert.equal(polish('e4 is fine, but it gives your bishop room.', event, { hideMoves: false }), 'e4 is fine, but it gives your bishop room.');
    } finally {
        if(originalStyle === undefined) delete process.env.PENA_STUDY_STYLE;
        else process.env.PENA_STUDY_STYLE = originalStyle;
    }
});

test('urgent repeated chess advice survives the shared gate even when its voice repetition metric fails', () => {
    const event = preparedEvents()[0];
    event.record.last = { label: 'Mistake' };
    const advice = 'Your pawn on e4 needs attention.';
    const answer = polish(advice, event, { hideMoves: false, previous: [advice], recent: [advice, advice, advice] });
    assert.equal(answer, advice);
    const rows = Array.from({ length: 10 }, (_, index) => ({ id: String(index), gameId: 'one',
        answer: index < 4 ? answer : 'The knight on f3.' }));
    assert.equal(rollingRepetition(rows).met, false);
});

test('accuracy requires exact baseline/natural IDs, counts spoken denominators, and reports missing checker', async () => {
    const events = preparedEvents().slice(0, 2);
    const rows = events.map(event => ({ id: event.id, fen: event.fen, seed: 1, hideMoves: false, answer: 'bad' }));
    assert.equal(matchedRows(rows, [...rows].reverse()).length, 2);
    assert.throws(() => matchedRows(rows, rows.slice(1)), /identical event IDs/i);
    assert.throws(() => matchedRows(rows, [rows[0], rows[0]]), /duplicate/i);
    assert.throws(() => matchedRows(rows, rows.map(row => ({ ...row, seed: 2 }))), /mismatched/i);
    const stats = boardAccuracy([{ ...rows[0], answer: '' }, rows[1]], events,
        () => ({ claims: { placement: 1 }, issues: [{ kind: 'placement' }] }));
    assert.equal(stats.comments, 1);
    assert.equal(stats.wrongClaimsPerComment, 1);
    assert.throws(() => boardAccuracy([{ ...rows[0], fen: 'different' }], events, () => ({})), /mismatched board/i);
    await assert.rejects(loadChecker(new URL('missing-independent-checker.mjs', import.meta.url)), /Accuracy NOT measured/);
    const checker = await loadChecker();
    const checked = boardAccuracy([{ ...rows[0], answer: 'Your knight on e4 is active.' }], events, checker.check);
    assert.equal(checked.wrongComments, 1);
});

test('verdict, opener and frequency metrics keep suppressed events in their denominators', () => {
    const events = preparedEvents().slice(0, 2);
    events[0].record.last = { label: 'Good' };
    const rows = events.map((event, index) => ({ ...event, requested: Boolean(index), answer: index ? 'Your knight on f3 is fine.' : '' }));
    const metrics = acceptanceMetrics(rows, events);
    assert.equal(metrics.frequency.events, 2);
    assert.equal(metrics.frequency.spoken, 1);
    assert.equal(metrics.frequency.suppressed, 1);
    assert.equal(metrics.opening.yourPieceOn, 1);
    assert.equal(metrics.repetition.met, null);
    assert.equal(metrics.coverage.met, false);
});

function cli(args, env) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [harness, ...args], { cwd: root, env: { ...process.env, ...env }, windowsHide: true });
        let stdout = '', stderr = '';
        child.stdout.on('data', value => { stdout += value; });
        child.stderr.on('data', value => { stderr += value; });
        child.on('error', reject);
        child.on('close', code => resolve({ code, stdout, stderr }));
    });
}

test('CLI game/resume/analyze/compare/show uses a tiny fake endpoint, rejects stale settings and old labels', { timeout: 60000 }, async () => {
    const scratch = new URL(`voice-study-fixture-${process.pid}/`, import.meta.url);
    mkdirSync(scratch);
    const props = fixtureModelProps(scratch);
    assert.equal((await readGGUFModelInfo(props.model_path)).architecture, 'inkling2_loop');
    const prompts = [];
    const answers = new Map();
    const server = createServer(async (req, res) => {
        if(req.url === '/props') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(props)); return; }
        let body = '';
        for await(const chunk of req) body += chunk;
        const request = JSON.parse(body);
        prompts.push(request);
        if(!answers.has(request.seed)) answers.set(request.seed, answers.size % 2 ? 'Give yourself room to think.' : 'Keep things simple.');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: answers.get(request.seed) }, finish_reason: 'stop' }],
            usage: { completion_tokens: 8 } }));
    });

    test('terminal loop failures are explicit, resumed without retry, excluded from silent/accuracy successes, and fail natural acceptance', { timeout: 60000 }, async () => {
        const scratch = new URL(`voice-study-failure-fixture-${process.pid}/`, import.meta.url);
        mkdirSync(scratch);
        const props = fixtureModelProps(scratch);
        let mode = 'loop', modeRequests = 0;
        const requests = [];
        const server = createServer(async (req, res) => {
            if(req.url === '/props') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(props)); return; }
            let body = '';
            for await(const chunk of req) body += chunk;
            requests.push(JSON.parse(body));
            modeRequests++;
            const httpFailure = mode === 'http' || mode === 'retry-http' && modeRequests === 2;
            res.writeHead(httpFailure ? 503 : 200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(httpFailure ? { error: 'server unavailable' } : {
                choices: [{ message: { content: mode === 'loop' && modeRequests <= 2 || mode === 'retry-http'
                    ? '<|message_model|><|content_thinking|>' : 'Keep things simple.' }, finish_reason: 'stop' }],
                usage: { completion_tokens: 9 }
            }));
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const env = { PENA_STUDY_DIR: fileURLToPath(scratch), PENA_STUDY_URL: `http://127.0.0.1:${server.address().port}`,
            PENA_STUDY_MODEL_ID: 'fake-failure-test-only', PENA_STUDY_STYLE: 'natural', PENA_STUDY_CHATTINESS: 'normal',
            PENA_STUDY_HIDE: '0', PENA_STUDY_RAW: '', PENA_STUDY_SYSTEM: '', PENA_STUDY_CHECKER: '', PENA_STUDY_RETRY: '1' };
        try {
            const events = preparedEvents(game(['e4', 'e5']));
            events[0].record.last = { label: 'Mistake' };
            events[1].record.last = { label: 'Good' };
            writeFileSync(new URL('events.json', scratch), JSON.stringify(events));
            const run = await cli(['game', 'natural-r2'], env);
            assert.equal(run.code, 0, run.stderr);
            assert.equal(requests.length, 3);
            assert.equal(requests[1].seed, requests[0].seed + 1000);
            assert.equal(requests[1].temperature, 0.4);
            assert.equal(requests[0].reasoning_budget_tokens, 16);
            assert.equal(requests[1].reasoning_budget_tokens, 16);
            assert.equal(requests[2].messages.filter(message => message.role === 'assistant').length, 0);
            const rows = readFileSync(new URL('natural-r2.jsonl', scratch), 'utf8').trim().split('\n').map(JSON.parse);
            assert.deepEqual(rows.map(row => row.status), ['failed', 'spoken']);
            assert.equal(rows[0].failed, true);
            assert.equal(rows[0].requested, true);
            assert.equal(rows[0].retried, true);
            assert.equal(rows[0].error.code, 'NO_VISIBLE_MODEL_ANSWER');
            assert.equal(rows[0].answer, '');
            assert.equal(rows[1].answer, 'Keep things simple.');
            assert.equal(failureMetrics(rows).failureRatePerRequest, 0.5);
            const metrics = acceptanceMetrics(rows, events);
            assert.equal(metrics.generation.met, false);
            assert.equal(metrics.frequency.failed, 1);
            assert.equal(metrics.frequency.suppressed, 0);
            assert.equal(metrics.frequency.filteredEmpty, 0);
            assert.equal(metrics.frequency.allMistakesSpoken, false);
            assert.equal((await cli(['game', 'natural-r2'], env)).code, 0);
            assert.equal(requests.length, 3);
            const shown = await cli(['show', 'natural-r2'], env);
            assert.match(shown.stdout, /FAILED retried/);
            assert.equal((await cli(['analyze', 'natural-r2'], env)).code, 0);
            const report = JSON.parse(readFileSync(new URL('natural-r2-analysis.json', scratch)));
            assert.equal(report.generationGate.met, false);
            assert.equal(report.board.failedEvents, 1);
            assert.equal(report.board.comments, 1);
            assert.equal(report.currentAcceptanceEvidence, false);
            mode = 'success'; modeRequests = 0;
            assert.equal((await cli(['game', 'baseline-r2'], { ...env, PENA_STUDY_STYLE: 'legacy' })).code, 0);
            assert.equal((await cli(['compare', 'baseline-r2', 'natural-r2'], env)).code, 0);
            const comparison = JSON.parse(readFileSync(new URL('natural-r2-vs-baseline-r2-accuracy.json', scratch)));
            assert.equal(comparison.generationGate.met, false);
            assert.equal(comparison.generation.natural.failed, 1);
            for(const nextMode of ['http', 'retry-http']) {
                mode = nextMode; modeRequests = 0;
                const fatal = await cli(['game', `fatal-${mode}`], env);
                assert.equal(fatal.code, 1);
                assert.match(fatal.stderr, /server unavailable/);
                assert.equal(existsSync(new URL(`fatal-${mode}.jsonl`, scratch)), false);
            }
            const before = requests.length;
            assert.equal((await cli(['game', 'bad-config'], { ...env, PENA_STUDY_CHATTINESS: 'invalid' })).code, 1);
            assert.equal(requests.length, before);
        } finally {
            await new Promise(resolve => server.close(resolve));
            rmSync(scratch, { recursive: true, force: true });
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const env = { PENA_STUDY_DIR: fileURLToPath(scratch), PENA_STUDY_URL: `http://127.0.0.1:${server.address().port}`,
        PENA_STUDY_MODEL_ID: 'fake-test-only-not-real-generation', PENA_STUDY_STYLE: 'natural', PENA_STUDY_CHATTINESS: 'chatty',
        PENA_STUDY_HIDE: '0', PENA_STUDY_RAW: '', PENA_STUDY_SYSTEM: '', PENA_STUDY_CHECKER: '', PENA_STUDY_RETRY: '1' };
    try {
        writeFileSync(new URL('events.json', scratch), JSON.stringify(preparedEvents(game(['e4', 'e5']))));
        const first = await cli(['game', 'natural'], env);
        assert.equal(first.code, 0, first.stderr);
        assert.equal(prompts.length, 2);
        assert.equal(prompts[1].messages.filter(message => message.role === 'assistant').length, 0);
        const resume = await cli(['game', 'natural'], env);
        assert.equal(resume.code, 0, resume.stderr);
        assert.equal(prompts.length, 2);
        const output = new URL('natural.jsonl', scratch);
        writeFileSync(output, readFileSync(output, 'utf8').split('\n')[0] + '\n');
        const partialResume = await cli(['game', 'natural'], env);
        assert.equal(partialResume.code, 0, partialResume.stderr);
        assert.equal(prompts.length, 3);
        assert.equal(prompts[2].messages.filter(message => message.role === 'assistant').length, 0);
        const mismatch = await cli(['game', 'natural'], { ...env, PENA_STUDY_HIDE: '1' });
        assert.equal(mismatch.code, 1);
        assert.match(mismatch.stderr, /provenance mismatch/i);
        const analysis = await cli(['analyze', 'natural'], env);
        assert.equal(analysis.code, 0, analysis.stderr);
        const report = JSON.parse(readFileSync(new URL('natural-analysis.json', scratch)));
        assert.equal(report.currentVersionedRun, true);
        assert.equal(report.currentAcceptanceEvidence, false);
        assert.equal(report.metrics.repetition.met, null);
        const base = await cli(['run', 'baseline', '--game'], { ...env, PENA_STUDY_STYLE: 'legacy' });
        assert.equal(base.code, 0, base.stderr);
        const comparison = await cli(['compare', 'baseline', 'natural'], env);
        assert.equal(comparison.code, 0, comparison.stderr);
        assert.equal(JSON.parse(readFileSync(new URL('natural-vs-baseline-accuracy.json', scratch))).accuracyGate.met, null);
        assert.match((await cli(['show', 'natural', '1'], env)).stdout, /Keep things simple/);
        writeFileSync(new URL('historical.jsonl', scratch), readFileSync(new URL('natural.jsonl', scratch)));
        const historical = await cli(['game', 'historical'], env);
        assert.equal(historical.code, 1);
        assert.match(historical.stderr, /Historical runs do not validate new code/);
        assert.equal((await cli(['analyze', 'historical'], env)).code, 0);
        assert.equal(JSON.parse(readFileSync(new URL('historical-analysis.json', scratch))).currentVersionedRun, false);
        const missing = await cli(['analyze', 'natural'], { ...env, PENA_STUDY_CHECKER: fileURLToPath(new URL('missing.mjs', scratch)) });
        assert.equal(missing.code, 1);
        assert.match(missing.stderr, /Accuracy NOT measured/);
    } finally {
        await new Promise(resolve => server.close(resolve));
        rmSync(scratch, { recursive: true, force: true });
    }
});
