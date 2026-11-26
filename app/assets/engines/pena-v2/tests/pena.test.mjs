import { markdownPlain } from '../formatting.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Chess } from '../../libraries/chessjs/chess.js';
import { moveFacts, decodeExplanation } from '../position.js';
import { boardReferences, boardRegions, variationFrames, PenaTeacher, plannedMoves, normalizeNotation, labelPlacement } from '../teacher.js';
import { checkSentence, compactExplanation } from '../grounding.js';
import { CommentaryStream, sourceSentences, speakToYou, moveHint } from '../commentary.js';
import { narrationParts, narrationPhrases, teachingCues, compileTeaching, teachingPreview } from '../narration.js';
import { friendlyPenaError } from '../runtime.js';
import { readPenaPosition, penaPosition } from '../input.js';
import { moveIntent, findPlayedMove, questionLead, understandQuestion, QuestionAnswer } from '../questions.js';
import { explanationBody, explanationExcerpt, getPenaPreferences } from '../preferences.js';
import { voiceCatalogue, ensureVoice, DEFAULT_VOICE, PIPER_BASE, importVoice } from '../assets.js';
import { PenaSpeech, PenaMicrophone, speechPause, speechSegments } from '../speech.js';
import { SpeechDetector, SpeechSegments, recognizedSpeech } from '../vad.js';
import { VAD_MODEL } from '../assets.js';
import { recognitionRequest, releaseRecognitionModel } from '../recognition.js';
import { CoachingChecks, checkedLine, moveMechanism } from '../coaching.js';
import { answerChat } from '../chat-reply.js';
import { assessChatReply } from '../chat-reply.js';
import { chatSheet, citationSteps, chatPhrases, conceptVisuals } from '../conversation.js';
import { moveArrowConfig } from '../../../js/misc/arrowStyle.js';
import { moveMentions } from '../teacher.js';
import { asksForMove, boardGroundingNotes, dropFalseGeometry, dropMisplacedPieces, dropRepeatedSentences, dropUnaskedVerdicts, hideMoveSuggestions } from '../coaching-policy.js';
import { positionEvent } from '../chat.js';
import { promptOverridesFrom } from '../prompt-overrides.js';

const start = new Chess().fen();
function settle() { return new Promise(resolve => setImmediate(resolve)); }

test('rapid board changes including a return to the first FEN cannot revive stale preparation', async () => {
    const code = (await readFile(new URL('../service.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify('https://pena.test/service.js'));
    const settings = { penaOnlyWhenAsked: false };
    const pending = [], replies = [], messages = [];
    let reads = 0;
    const instance = { currentFen: start, environmentSetupRun: true, gameStateHistory: [],
        getPlayerColor: async () => 'w' };
    const context = vm.createContext({ localStorage: { getItem: () => null }, clearTimeout, AbortController, crypto,
        penaPosition, findPlayedMove, positionEvent, window: { AcasInstances: [{ instance }] },
        getPenaPreferences: () => ++reads <= 2 ? new Promise(resolve => pending.push(() => resolve(settings))) : Promise.resolve(settings),
        replies });
    vm.runInContext(code + `
        resetAnswer = () => {};
        setBusy = () => {};
        setStatus = () => {};
        catchUpGame = () => {};
        converse = async response => { replies.push(response.fen); };
        ui = { window: { classList: { toggle() {} } }, log: { replaceChildren() {} } };
        globalThis.live = { pena, tick };
    `, context);
    const { pena, tick } = context.live;
    pena.instance = instance;
    pena.enabled = true;
    pena.state = 'ready';
    pena.canChat = true;
    pena.conversation = { reset() {} };
    pena.speech = { stop() {} };
    pena.worker = { postMessage: data => messages.push(data) };
    const controller = new AbortController();
    pena.response = { controller };
    tick();
    assert.equal(controller.signal.aborted, true);
    assert.equal(messages.at(-1).type, 'cancel');
    const board = new Chess(); board.move('e4');
    instance.currentFen = board.fen();
    tick();
    instance.currentFen = start;
    tick();
    await settle();
    pending.forEach(release => release());
    await settle();
    assert.deepEqual(replies, [start]);
    assert.equal(pena.fen, start);
});

test('external-only teaching publishes the same shapes without needing a GUI drawer', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const packets = [];
    const instance = { currentFen: start, boardState: { boardOrientation: 'b' },
        getConfigValue: async () => true, CommLink: { commands: { renderVisualsToSite: packet => packets.push(packet) } } };
    const teacher = new PenaTeacher(instance);
    try {
        teacher.show('Nf3', start, { duration: 2000 });
        await settle();
        const entries = packets.at(-1);
        assert.ok(entries.some(entry => entry.shapeType === 'arrow' && entry.shapeSquare.join('') === 'g1f3'));
        assert.ok(entries.every(entry => entry.category === 'pena-teaching' && entry.positionFen === start && entry.expiresAt > Date.now()));
        teacher.fade();
        await settle();
        t.mock.timers.tick(180);
        await settle();
        assert.ok(packets.at(-1).every(entry => !entry.shapeType));
        teacher.show('Nf3', start, { duration: 2000 });
        instance.currentFen = new Chess().fen().replace(' w ', ' b ');
        await settle();
        assert.ok(packets.at(-1).every(entry => !entry.shapeType), 'An asynchronous external setting read cannot publish stale cues');
    } finally { teacher.clear(); await settle(); }
});

test('conversation restrictions cancel already running unsolicited replies without cancelling an asked move', async () => {
    const code = (await readFile(new URL('../service.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify('https://pena.test/service.js'));
    let settings = { penaEnabled: true, penaOnlyWhenAsked: false, penaHideMoves: false, penaSpeech: 'off' };
    const messages = [], instance = { instanceID: 'board', currentFen: start };
    const context = vm.createContext({ localStorage: { getItem: () => null }, clearTimeout, AbortController, DOMException,
        asksForMove, isMobileDevice: () => false, window: { AcasInstances: [{ instance }] },
        getPenaPreferences: async () => settings });
    vm.runInContext(code + `
        resetAnswer = () => {};
        setBusy = () => {};
        ui = { window: { hidden: false } };
        globalThis.live = { pena, refreshSettings, chatEngine };
    `, context);
    const { pena, refreshSettings, chatEngine } = context.live;
    pena.instance = instance;
    pena.enabled = true;
    pena.serverPort = 2800;
    pena.settings = settings;
    pena.speech = { stop() {} };
    pena.worker = { postMessage: data => messages.push(data) };
    const automatic = new AbortController();
    pena.response = { event: true, controller: automatic };
    settings = { ...settings, penaOnlyWhenAsked: true };
    await refreshSettings('penaOnlyWhenAsked');
    assert.equal(automatic.signal.aborted, true);
    assert.equal(messages.at(-1).type, 'cancel');
    const manual = new AbortController();
    pena.response = { question: 'What should I play?', controller: manual };
    settings = { ...settings, penaHideMoves: true };
    await refreshSettings('penaHideMoves');
    assert.equal(manual.signal.aborted, false);
    settings = { ...settings, penaHideMoves: false };
    await refreshSettings('penaHideMoves');
    const advice = new AbortController();
    pena.response = { question: 'What should I focus on?', controller: advice };
    settings = { ...settings, penaHideMoves: true };
    await refreshSettings('penaHideMoves');
    assert.equal(advice.signal.aborted, true);
    const rawSwitch = new AbortController();
    let terminated = 0, disposed = 0;
    pena.response = { question: 'Tell me about this position.', controller: rawSwitch };
    pena.verifier = { cancelPending() {}, terminate() { terminated++; } };
    pena.groundedEngines = { dispose() { disposed++; } };
    pena.game = { moves: [] };
    pena.idleTurns = [{ player: 'Old board question', pena: 'Old chess reply' }];
    settings = { ...settings, penaCoaching: false };
    await refreshSettings('penaCoaching');
    assert.equal(rawSwitch.signal.aborted, true);
    assert.equal(terminated, 1);
    assert.equal(disposed, 1);
    assert.equal(pena.verifier, null);
    assert.equal(pena.groundedEngines, null);
    assert.equal(pena.game, null);
    assert.equal(pena.idleTurns.length, 0, 'Switching modes clears earlier board chat');
    assert.throws(() => chatEngine().lines(start, {}), { name: 'AbortError' },
        'Pending game grading cannot restart an engine after coaching is switched off');
});

test('ZONOS starts loading on startup alongside the model when Pena reads aloud', async () => {
    const code = (await readFile(new URL('../service.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify('https://pena.test/service.js'));
    for(const [speech, readAloud, expected] of [['neural', true, true], ['neural', false, false], ['browser', true, false]]) {
        const events = [], worker = {}, prefs = { penaEnabled: true, penaSpeech: speech };
        const context = vm.createContext({ localStorage: { getItem: key => key === 'penaReadAloud' ? String(readAloud) : null },
            isMobileDevice: () => false, window: { AcasInstances: [] }, events, worker,
            getPenaPreferences: async () => ({ ...prefs }) });
        vm.runInContext(code + `
            restorePosition = () => {};
            startWorker = () => { events.push('worker'); return new Promise(resolve => { worker.finish = resolve; }); };
            stopMicrophone = cancel = setState = attach = voiceProgress = () => {};
            const shown = () => ({ hidden: false, classList: { remove() {} } });
            ui = { window: { hidden: true }, loading: shown(), setup: shown(), status: shown(), thinking: shown() };
            globalThis.live = { pena, refreshSettings, stopWorker };
        `, context);
        const { pena, refreshSettings, stopWorker } = context.live;
        pena.speech = { prepare: () => events.push('voice'), unload: () => events.push('unload') };
        const startup = refreshSettings();
        await settle();
        assert.deepEqual([...events], expected ? ['voice', 'worker'] : ['worker'], `${speech}, read aloud ${readAloud}`);
        worker.finish();
        await startup;
        pena.worker = { terminate() {} };
        pena.serverPort = 2800;
        await refreshSettings();
        assert.equal(events.filter(event => event === 'voice').length, expected ? 1 : 0, 'Later refreshes do not reload the voice');
        stopWorker();
        assert.equal(events.includes('unload'), false, 'Restarting the model keeps the voice that is already loading');
        prefs.penaEnabled = false;
        await refreshSettings();
        assert.equal(events.at(-1), 'unload', 'Turning Pena off lets the voice go');
    }
});

test('move hiding distinguishes a request from position advice and keeps the explanation', () => {
    for(const text of ['What should I play?', 'What is the best move?', 'Should I play e4?', 'Why is Nf3 good?', 'Nf3?', 'I want the move.'])
        assert.equal(asksForMove(text), true, text);
    for(const text of ['What should I focus on?', 'Explain the knight on f3.', "Don't give me the best move."])
        assert.equal(asksForMove(text), false, text);
    for(const text of ['Play **Nf3**.', 'The best move is e4.', 'Consider e4.', 'e4 controls the center.',
        'Move your knight to f3.', 'Try putting your knight on f3.', 'Play Nf3 and then e5.',
        'You should castle.', 'Castle now.', 'Push your e-pawn two squares.'])
        assert.equal(hideMoveSuggestions(text).text, '', text);
    const explanation = 'Your knight on g1 needs development.';
    assert.equal(hideMoveSuggestions(`Play Nf3. ${explanation}`).text, explanation);
    assert.equal(hideMoveSuggestions('Nf3, developing your knight.').text, 'Look for a move that develops your knight.');
    assert.doesNotMatch(hideMoveSuggestions('Nf3, developing your knight while Black can play e5.').text, /Nf3|e5/);
    assert.equal(hideMoveSuggestions('You played Nf3. Your knight is active.', { playedSan: 'Nf3' }).withheld, false);
    assert.equal(hideMoveSuggestions('Castling helps king safety. Your e-pawn guards d5.').withheld, false);
    assert.equal(hideMoveSuggestions('You played Nf3, but Black can reply with d5.', { playedSan: 'Nf3' }).withheld, true);
    const markdown = '**Development** matters.\n\n- Protect your king.';
    assert.equal(hideMoveSuggestions(markdown).text, markdown);
});

test('a sentence naming a piece on a square it already left is dropped', () => {
    // The real repeat: Pena still talked about the knight on b1 right after Nc3.
    const fen = 'r2qkb1r/pppn1ppp/5n2/3pp3/3P4/P1N1PQ1P/1PP2PP1/R1B1KB1R b KQkq - 1 7';
    const board = { fen, beforeFen: 'r2qkb1r/pppn1ppp/5n2/3pp3/3P4/P3PQ1P/1PP2PP1/RNB1KB1R w KQkq - 0 7', playerColor: 'w' };
    const stale = 'Your knight on b1 and bishops on c1 and f1 are still at home.';
    const kept = "Black's pawns on d5 and e5 are solid.";
    assert.deepEqual(dropMisplacedPieces(`${kept} ${stale}`, board), { text: kept, removed: [stale] });
    for(const text of ['Your knight on c3 hits d5.', 'Your knight on b1 moved to c3.', 'There is no knight on b1 now.',
        'Putting a knight on d5 would be lovely.', "That stops Black's e4 pawn break.", 'After Nxe5, the knight on e5 is strong.',
        'Your queen on f3, and h3 keeps g4 covered.', "Your bishop on c1, the f6 knight and Black's queen on d8 all matter."])
        assert.equal(dropMisplacedPieces(text, board).text, text, text);
    assert.equal(dropMisplacedPieces('Your knight on b1 waits.', { ...board, beforeFen: '' }).text, '');
    // A move named in the question or the reply puts that piece on an imagined square, so it isn't stale.
    const start = { fen: 'rnbqkbnr/ppp1pppp/8/8/3P4/2N5/PPP2PPP/R1BQKBNR b KQkq d3 0 4', playerColor: 'b' };
    const answer = 'The queen on d5 is attacked by the knight on c3, and the likely line is 4...Qd5 5.Nxd5.';
    assert.equal(dropMisplacedPieces(answer, start).text, answer);
    const asked = 'The evidence flags it as Catastrophic, and the reason is concrete: the queen on d5 is attacked by the knight on c3.';
    assert.equal(dropMisplacedPieces(asked, { ...start, question: 'What happens if I play Qd5?' }).text, asked);
    assert.equal(dropMisplacedPieces(asked, start).text, '');
    assert.equal(dropMisplacedPieces('Your queen on c3 is loose.', { ...start, question: 'What happens if I play Qd5?' }).text, '');
});

test('a sentence whose guard, line or pin claim misreads the board is dropped', () => {
    const fen = '3r4/1p3pk1/p5p1/3p3p/3b1r2/P6P/1PR1BPK1/5R2 w - - 2 5';
    const kept = 'Your king on g2 guards f2. The bishop on e2 covers f1. The rook on f4 is pinning f2 to your rook on f1.';
    const text = `The bishop on e2 is on the same diagonal as f2, so it guards that pawn. ${kept} So f2 cannot move while pinned.`;
    assert.equal(dropFalseGeometry(text, { fen }).text, kept);
    assert.equal(dropFalseGeometry(`Your bishop on e2 already looks at d5. ${kept}`, { fen }).text, kept, 'e2 and d5 share no line');
    assert.equal(dropFalseGeometry(`d5 is guarded by your bishop on e2. ${kept}`, { fen }).text, kept,
        'A rejected passive claim must not reject the following independent sentences');
    for(const fine of ['Protected by your rook on f1 and your bishop on e2, it hits b5.', 'Nothing is guarding it.',
        'Your bishop on e2 and rook on c2 cover d1.', 'Your bishop on e2 goes to d3 and hits b5.', 'Your bishop on e2 eyes h5.',
        "Black's bishop on d4 is eyeing b2."])
        assert.equal(dropFalseGeometry(fine, { fen }).text, fine, fine);
});
test('a made-up "just played" move is dropped, the real one is kept', () => {
    const beforeFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const fen = 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1';
    const kept = 'White just played Nf3, so e5 is watched.';
    const text = `White just played N1g3, and that knight hits e4. ${kept}`;
    assert.equal(dropFalseGeometry(text, { fen, beforeFen }).text, kept);
    assert.equal(dropFalseGeometry(kept, { fen }).text, '', 'with no previous board there is no last move to name');
});
test('a sentence copied from a reply at an older position is dropped', () => {
    const earlier = ['Quiet position. Your knight on b1 is the one piece still waiting to move.'];
    const fresh = 'Black hits your bishop on f3 now.';
    assert.equal(dropRepeatedSentences(`Your knight on b1 is the one piece still waiting to move. ${fresh}`, earlier).text, fresh);
    assert.equal(dropRepeatedSentences(fresh, earlier).text, fresh);
});

test('hypothetical knight claims keep their exact geometry and target identities', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/8/3P4/2N5/PPP2PPP/R1BQKBNR b KQkq d3 0 4';
    const wrong = [
        'A knight on d5 would eye c7, b6, b4, c3, e3, f4, f6 and e7, so it hits the queen on c3 and the pawn on c7.',
        'A knight on d5 would eye c7, e7 and f6, so it hits your queen on d8 and eyes the c7 pawn.',
        'A knight on d5 would eye c7, e7 and d8.',
        'Your knight on c3 can jump to e5.',
        'Your knight on c3 could move to c5.'
    ];
    for(const text of wrong) assert.deepEqual(dropFalseGeometry(text, { fen }), { text: '', removed: [text] }, text);
    for(const text of [
        'A knight on d5 would eye c7, b6, b4, c3, e3, f4, f6 and e7.',
        'Your knight on c3 can jump to d5.',
        'Your knight on c3 cannot jump to e5.',
        'A knight on d5 would not attack d8.',
        'A knight on d5 cannot attack d8.',
        'After Qd5, Nxd5 captures the queen.',
        'A knight on d5 would attack c7. It also attacks e7.',
        'After Qd5, the queen on d5 attacks d4.'
    ]) assert.equal(dropFalseGeometry(text, { fen }).text, text, text);
    const text = 'A knight on d5 would attack c7. It also attacks d8.';
    assert.equal(dropFalseGeometry(text, { fen }).text, 'A knight on d5 would attack c7.');
    // Real Pena replies: "it" names the knight the player asked about, but pronoun targets stay in their sentence.
    const question = 'Think where a knight sees if it goes to d5';
    assert.equal(dropFalseGeometry('From d5 it eyes c7 and e6, and it can jump to b6 or f6.', { fen, question }).text, '');
    assert.equal(dropFalseGeometry('From d5 it hits b4, b6, c3, c7, e3, e7, f4 and f6. On your board that covers c7 and e7, so it can hit your queen on d8.',
        { fen, question }).text, 'From d5 it hits b4, b6, c3, c7, e3, e7, f4 and f6.');
    assert.equal(dropFalseGeometry('From d5 it eyes c7 and e7.', { fen, question }).text, 'From d5 it eyes c7 and e7.');
    const fair = 'The pawn on d4 still limits things. Qd5 does not help; it just puts the queen where the c3 knight can hit it.';
    assert.equal(dropFalseGeometry(fair, { fen }).text, fair);
    const board = new Chess(fen);
    assert.ok(board.move('Qd5'));
    const capture = board.move('Nxd5');
    assert.equal(capture.from, 'c3');
    assert.equal(capture.captured, 'q');
});

test('live board reminders use actual occupants and complete knight geometry without moving a piece', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/8/3P4/2N5/PPP2PPP/R1BQKBNR b KQkq d3 0 4';
    const notes = boardGroundingNotes(fen, 'Think where a knight sees if it goes to d5');
    assert.match(notes, /White: [^\n]*knight c3[^\n]*queen d1/);
    assert.match(notes, /Black: [^\n]*queen d8/);
    assert.match(notes, /Black to move/);
    const controls = notes.match(/knight on d5: complete geometric controls ([^.]+)/)[1].split(', ');
    assert.deepEqual(controls.sort(), ['b4', 'b6', 'c3', 'c7', 'e3', 'e7', 'f4', 'f6']);
    assert.doesNotMatch(notes, /rnbqkbnr\//);
    assert.doesNotMatch(boardGroundingNotes(fen, 'Where is my queen?'), /Hypothetical/);
    const corner = boardGroundingNotes(fen, 'Could a knight on A1 see a1?');
    assert.match(corner, /knight on a1: complete geometric controls b3, c2/);
    assert.equal((corner.match(/Hypothetical knight/g) || []).length, 1);
});

test('who is winning is left out unless the player asks', () => {
    assert.equal(dropUnaskedVerdicts("It's about equal. Your rook wants the open c-file.", 'what now?').text,
        'Your rook wants the open c-file.');
    assert.equal(dropUnaskedVerdicts('Play Rg6 to save the rook, though Black is still better.', 'eli5').text,
        'Play Rg6 to save the rook.');
    assert.equal(dropUnaskedVerdicts('Nxd5 is a mistake. It takes back the pawn, but cxd5 does it much better.', 'Nxd5').text,
        'Nxd5 is a mistake. It takes back the pawn, but cxd5 does it much better.');
    for(const question of ["who's winning?", 'how am I doing', 'is it equal?'])
        assert.equal(dropUnaskedVerdicts('White is winning, so keep it simple.', question).text, 'White is winning, so keep it simple.', question);
});
test('move hiding keeps the opponent threat and the forced line that explains it', () => {
    const board = { fen: '4k3/8/8/8/8/5b1q/PPPP1PPP/RNBQ1RK1 w - - 0 1', playerColor: 'w' };
    for(const text of ["If you don't, Black plays Bxd1 and you're lost.", 'If you ignore it, Qxg2 is checkmate.',
        'Then Bxd1, Rxd1, and Qxg2 follows.', 'Then the bishop captures on d1 and wins your queen.'])
        assert.equal(hideMoveSuggestions(text, board).text, text, text);
    for(const text of ['Play gxf3 and the threat is gone.', 'You can defend with Qe1.', 'The cleanest fix is to take on f3.'])
        assert.equal(hideMoveSuggestions(text, board).text, '', text);
});

test('short requests only reveal a move when one was withheld in the conversation', () => {
    for(const text of ['I want it', "I'd like it.", 'Yes, please', 'Tell me', 'Show it', 'Please show it', 'Go ahead', 'What is it?',
        'Just tell me', 'OK, tell me', 'Let me see it', 'Reveal it', 'I want to see it']) {
        assert.equal(asksForMove(text), false, text);
        assert.equal(asksForMove(text, { offeredMove: true }), true, text);
    }
    for(const text of ['What', 'OK', 'Thanks', "I don't want it", "Don't show the move", 'Explain something else']) {
        assert.equal(asksForMove(text, { offeredMove: true }), false, text);
    }
});

test('grounded speech uses board cues and rejects stale visual marks', async () => {
    const code = (await readFile(new URL('../service.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify('https://pena.test/service.js'));
    const context = vm.createContext({ localStorage: { getItem: () => null }, narrationParts, narrationPhrases, compileTeaching, teachingPreview,
        sourceSentences, explanationBody, clearTimeout() {}, setTimeout() {} });
    vm.runInContext(code + '\nglobalThis.visuals = { pena, streamSpeech };', context);
    const { pena, streamSpeech } = context.visuals;
    const response = { fen: start, analysisFen: start, playerColor: 'w', input: {}, question: 'Explain development.' };
    const shown = [], marks = [];
    pena.instance = { currentFen: start };
    pena.shown = response;
    pena.readAloud = true;
    pena.settings = { penaSpeech: 'browser', penaTeacher: true };
    pena.teacher = { show: (text, fen, options) => shown.push(options.references), clear() {} };
    pena.speech = { say: (text, settings, start, cues) => marks.push(...cues) };
    streamSpeech(response, 'Your knight on g1 needs development.');
    assert.ok(marks.length > 0);
    marks.forEach(mark => mark.run());
    assert.ok(shown.some(refs => refs.squares.includes('g1')));
    marks.length = 0;
    shown.length = 0;
    pena.spokenOffset = 0;
    streamSpeech(response, 'Black can play Nf6.');
    marks.forEach(mark => mark.run());
    assert.ok(shown.some(refs => refs.moves.some(pair => pair.join('') === 'g8f6')),
        'An illustrative opponent turn uses the same physical board, not a missing future preview');
    const changed = new Chess(); changed.move('e4');
    pena.instance.currentFen = changed.fen();
    shown.length = 0;
    marks.forEach(mark => mark.run());
    assert.equal(shown.length, 0);
});

test('grounded narration previews consequences after the first move rather than dropping or misplacing them', async () => {
    const code = (await readFile(new URL('../service.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify('https://pena.test/service.js'));
    const context = vm.createContext({ localStorage: { getItem: () => null }, narrationPhrases, compileTeaching, teachingPreview,
        clearTimeout() {}, setTimeout() {} });
    vm.runInContext(code + '\nglobalThis.visuals = { pena, queueNarration };', context);
    const { pena, queueNarration } = context.visuals;
    const response = { fen: start, analysisFen: start, playerColor: 'w', input: {}, question: 'Why does development help?' };
    const marks = [], shown = [];
    pena.instance = { currentFen: start, pV: {} };
    pena.response = response;
    pena.readAloud = true;
    pena.settings = { penaSpeech: 'browser', penaTeacher: true, penaFollowLine: true };
    pena.teacher = { show: (text, fen, options) => shown.push(options), clear() {} };
    pena.variation = { clear() {} };
    pena.speech = { say: (text, settings, start, cues) => marks.push(...cues) };
    const text = 'Nf3 develops your knight and controls d4.';
    queueNarration(response, text, text);
    marks.forEach(mark => mark.run());
    assert.ok(shown.some(item => !item.line && item.references.moves.some(pair => pair.join('') === 'g1f3')));
    const consequence = shown.find(item => item.references.squares.includes('f3') && item.line);
    assert.ok(consequence, 'The moved knight must have a visual on its actual after-board');
    assert.equal(consequence.line.index, 0);
    assert.equal(consequence.line.before, false);
    const after = new Chess(); after.move('Nf3');
    assert.equal(consequence.line.frames[0].fen, after.fen());
});

test('narration limits preview transition waits without changing other visual delays', async () => {
    const code = (await readFile(new URL('../service.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify('https://pena.test/service.js'));
    const after = new Chess(); after.move('Nf3');
    const future = after.fen();
    const liveCue = { positionFen: start, references: {} };
    const futureCue = { positionFen: future, references: {} };
    const line = { index: 0, frames: [{ beforeFen: start, fen: future }] };
    const context = vm.createContext({
        localStorage: { getItem: () => null }, compileTeaching: () => ({}),
        narrationPhrases: () => [liveCue, futureCue].map(cue => ({ text: 'cue', marks: [{ at: 0, cue }] })),
        teachingPreview: (_compiled, cue) => cue === futureCue ? line : null,
        clearTimeout() {}, setTimeout() {}
    });
    vm.runInContext(code + '\nglobalThis.visuals = { pena, queueNarration };', context);
    const { pena, queueNarration } = context.visuals;
    const response = { fen: start, analysisFen: start, input: {}, playerColor: 'w' };
    const options = [];
    pena.settings = { penaFollowLine: true };
    pena.teacher = { position: `${start}|w`, delayFor: target => target === pena.teacher.position.split('|')[0] ? 0 : 5000 };
    pena.speech = { say: (_text, _settings, _start, _marks, settings) => options.push(settings) };
    queueNarration(response, 'cue', 'cue');

    assert.equal(options[0].minimumStartDelay(), 0, 'Same-board cues do not wait');
    assert.equal(options[1].minimumStartDelay(), 1000, 'A future board does not wait for the full five-second lifetime');
    pena.teacher.position = `${future}|w`;
    assert.equal(options[0].minimumStartDelay(), 1000, 'Returning to the live board is also bounded');
    assert.equal(options[1].minimumStartDelay(), 0, 'Cues on the same future board do not wait');
    pena.settings.penaFollowLine = false;
    pena.teacher.position = `${start}|w`;
    pena.teacher.delayFor = () => 5000;
    assert.equal(options[0].minimumStartDelay(), 5000, 'Non-preview delays remain unchanged');
});

test('grounded neural speech uses short clips and retains mid-sentence board cues', async () => {
    const code = (await readFile(new URL('../service.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify('https://pena.test/service.js'));
    const context = vm.createContext({ localStorage: { getItem: () => null }, narrationParts, narrationPhrases,
        compileTeaching, teachingPreview, sourceSentences, explanationBody, clearTimeout() {}, setTimeout() {} });
    vm.runInContext(code + '\nglobalThis.visuals = { pena, streamSpeech };', context);
    const { pena, streamSpeech } = context.visuals;
    const response = { fen: start, analysisFen: start, playerColor: 'w', input: {}, question: 'Explain development.' };
    const requests = [], shown = [];
    pena.instance = { currentFen: start };
    pena.shown = response;
    pena.readAloud = true;
    pena.settings = { penaSpeech: 'neural', penaTeacher: true };
    pena.teacher = { show: (text, fen, options) => shown.push(options.references), clear() {} };
    pena.speech = { say: (text, settings, onStart, marks) => requests.push({ text, marks }) };
    const text = 'Your knight on g1 needs development. Your pawn on e2 supports the center.';
    streamSpeech(response, text);
    assert.ok(requests.length > 1);
    assert.ok(requests.some(request => /knight/i.test(request.text) && request.marks.some(mark => mark.at === 0)));
    assert.ok(requests.some(request => /pawn/i.test(request.text) && request.marks.some(mark => mark.at === 0)));
    requests.flatMap(request => request.marks).forEach(mark => mark.run());
    assert.ok(shown.some(refs => refs.squares.includes('g1')));
    assert.ok(shown.some(refs => refs.squares.includes('e2')));
});

test('read aloud starts enabled and remembers when it is turned off', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage();
    const initialize = () => page.evaluate(async () => {
        window.GET_GM_CFG_BASE_VALUE = async key => key === 'penaEnabled' ? false : key === 'penaSpeech' ? 'browser' : undefined;
        (await import('./assets/engines/pena-v2/service.js')).initializePena();
    });
    await page.goto(`${url}/app/index.html`);
    await initialize();
    const speaker = page.locator('#pena-window .pena-read-aloud');
    assert.equal(await speaker.getAttribute('aria-pressed'), 'true');
    await speaker.evaluate(button => button.click());
    assert.equal(await speaker.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => localStorage.getItem('penaReadAloud')), 'false');
    await page.reload();
    await initialize();
    assert.equal(await speaker.getAttribute('aria-pressed'), 'false');
    await speaker.evaluate(button => button.click());
    assert.equal(await page.evaluate(() => localStorage.getItem('penaReadAloud')), 'true');
    await page.reload();
    await initialize();
    assert.equal(await speaker.getAttribute('aria-pressed'), 'true');
});

test('Pena connects locally, keeps its settings and cannot load models in the browser', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('https://huggingface.co/**/voices.json', route =>
        route.fulfill({ json: {}, headers: { 'Access-Control-Allow-Origin': '*' } }));
    await page.route('**/pena-v2/storage.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `
            export const DEFAULT_PENA_PACKAGE_URL = ${JSON.stringify('https://example.invalid/retired-queen.json')};
            export const ADAPTER_FILE = 'chat-lora.bin';
            export const listModels = () => window.fixture.models;
            export const openModel = async id => {
                if(!listModels().some(model => model.id === id)) throw new Error('Missing saved model');
            };
            export const downloadModel = (url, {signal, onProgress}) => {
                window.fixture.downloads.push(url);
                onProgress({phase: 'loading', file: 'embedding.bin', received: 5, total: 10});
                return new Promise((resolve, reject) => {
                    signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), {once: true});
                    window.fixture.finish = () => {
                        signal.throwIfAborted();
                        const model = {id: 'installed', name: 'queen_pawn-8', precision: 'q4',
                            revision: '5027687fac08b64b2403b13aca5b198e68294fe9', bytes: 10};
                        window.fixture.models.push(model);
                        resolve(model);
                    };
                    window.fixture.fail = () => reject(new Error('Pena download failed (HTTP 503).'));
                });
            };
            export const importModel = async () => { throw new Error('Unexpected import'); };
            export const removeModel = async () => { throw new Error('Unexpected removal'); };
        `
    }));
    await page.goto(`${url}/app/index.html`);
    await page.evaluate(async () => {
        window.fixture = { models: [], downloads: [], workers: [], config: { global: { penaEnabled: false, penaModel: '' } } };
        window.USERSCRIPT = {
            getValue: async () => structuredClone(window.fixture.config),
            setValue: async (key, value) => { window.fixture.config = structuredClone(value); }
        };
        GET_GM_CFG_BASE_VALUE = async key => window.fixture.config.global[key];
        GET_PROFILE_FOR_INSTANCE = async () => null;
        Object.defineProperty(navigator, 'gpu', { configurable: true,
            value: { requestAdapter: async () => ({ info: {} }) } });
        window.Worker = class {
            constructor(url) { this.url = String(url); window.fixture.workers.push(this); }
            postMessage(message) {
                (this.sent ||= []).push(message);
                if(message.type === 'initialize') {
                    this.download = message.download;
                    this.init = message;
                }
            }
            terminate() { this.terminated = true; }
        };
        const settings = await import('./assets/engines/pena-v2/app-settings.js');
        const service = await import('./assets/engines/pena-v2/service.js');
        const retired = 'https://huggingface.co/example/unsupported-gguf';
        window.fixture.config.global.penaModel = retired;
        settings.initializePenaSettings();
        service.initializePena();
        window.fixture.toggle = enabled => {
            window.fixture.config.global.penaEnabled = enabled;
            const channel = new BroadcastChannel(GUI_BROADCAST_NAME);
            channel.postMessage({ type: 'settingSave', data: { key: 'penaEnabled' } });
            channel.close();
        };
    });
    assert.equal(await page.evaluate(() => window.fixture.downloads.length), 0);
    assert.equal(await page.locator('[data-pena-model-url]').count(), 0);
    assert.equal(await page.locator('#pena-floaty [data-key="penaReplyMode"]').count(), 0);
    assert.equal(await page.locator('#pena-floaty .pena-model-advanced').count(), 0);
    assert.equal(await page.locator('[data-pena-model-load]').count(), 0);
    assert.equal(await page.locator('[data-pena-model-pick]').count(), 0);
    assert.equal(await page.locator('[data-pena-server-status], [data-pena-server-connect]').count(), 0);
    assert.doesNotMatch(await page.locator('#pena-floaty').innerText(), /setup pending/i);
    assert.equal(await page.evaluate(() => window.fixture.workers.length), 0);
    await page.evaluate(() => window.fixture.toggle(true));
    await page.waitForFunction(() => window.fixture.workers.at(-1)?.init);
    assert.equal(await page.locator('#pena-window .pena-title').textContent(), 'AI');
    const titleBadge = await page.locator('.pena-heading').evaluate(element => {
        const title = element.querySelector('.pena-title').getBoundingClientRect();
        const badge = element.querySelector('.pena-beta').getBoundingClientRect();
        return { gap: badge.left - title.right, width: badge.width,
            verticalOffset: Math.abs((badge.top + badge.bottom - title.top - title.bottom) / 2) };
    });
    assert.ok(titleBadge.width > 0 && titleBadge.gap >= 0 && titleBadge.gap <= 8
        && titleBadge.verticalOffset < 1, JSON.stringify(titleBadge));
    assert.equal(await page.evaluate(() => window.fixture.config.global.penaEnabled), true);
    assert.equal(await page.evaluate(() => window.fixture.workers.at(-1).init.port), 2800);
    assert.equal(await page.evaluate(() => window.fixture.workers.at(-1).init.download), undefined);
    assert.match(await page.evaluate(() => window.fixture.workers.at(-1).url), /pena-v2\/app-worker\.js$/);
    await page.evaluate(() => window.fixture.workers.at(-1).onmessage({
        data: { type: 'connection', state: 'offline' }
    }));
    await page.waitForFunction(() => document.querySelector('#pena-window').dataset.state === 'unavailable');
    assert.equal(await page.evaluate(() => Boolean(window.fixture.workers.at(-1).terminated)), false);
    assert.match(await page.locator('#pena-window .pena-feedback').textContent(), /app server/);
    assert.equal(await page.locator('#pena-window .pena-chip').count(), 0);
    assert.equal(await page.locator('#pena-window .pena-setup').textContent(), 'Reconnect');
    const before = await page.evaluate(() => window.fixture.workers.length);
    await page.locator('#pena-window .pena-setup').click();
    await page.waitForFunction(before => window.fixture.workers.length > before && window.fixture.workers.at(-1).init.port === 2800, before);
    // A running app server without Pena offers the one-click setup instead of saying disconnected.
    await page.evaluate(() => window.fixture.workers.at(-1).onmessage({ data: { type: 'connection', state: 'offline', connected: true,
        setup: { installed: false, busy: false, downloadBytes: 8.7e9 } } }));
    assert.equal(await page.locator('#pena-window .pena-match').count(), 0);
    assert.equal(await page.locator('#pena-window .pena-setup').textContent(), 'Download Pena');
    assert.equal(await page.locator('#pena-window .pena-chat-log .pena-feedback').isVisible(), true);
    await page.mouse.move(0, 0);
    const setupStyle = await page.locator('#pena-window .pena-setup').evaluate(element => {
        const style = getComputedStyle(element);
        return { color: style.color, background: style.backgroundColor, border: style.borderBottomWidth };
    });
    assert.equal(setupStyle.color, 'rgba(255, 255, 255, 0.85)');
    assert.equal(setupStyle.background, 'rgba(255, 255, 255, 0.05)');
    assert.equal(setupStyle.border, '5px');
    await page.locator('#pena-window .pena-setup').click();
    assert.equal(await page.evaluate(() => window.fixture.workers.at(-1).sent.at(-1).type), 'setup');
    await page.evaluate(() => window.fixture.workers.at(-1).onmessage({ data: { type: 'connection', state: 'offline', connected: true,
        setup: { installed: false, busy: true, phase: 'downloading', progress: 0.5, received: 1e9, total: 2e9 } } }));
    assert.match(await page.locator('#pena-window .pena-feedback').textContent(), /50%/);
    assert.equal(await page.locator('#pena-window .pena-setup').textContent(), 'Pause');
    await page.locator('#pena-window .pena-clear').click();
    assert.equal(await page.locator('#pena-window .pena-chat-log .pena-setup').textContent(), 'Pause');
    assert.match(await page.locator('#pena-window .pena-feedback').textContent(), /50%/);
    await page.evaluate(fen => {
        window.fixture.oldTurn = document.querySelector('.pena-turn');
        window.AcasInstances = [{ instance: { instanceID: 'fixture', currentFen: fen,
            environmentSetupRun: true, gameStateHistory: [], getPlayerColor: async () => 'w' } }];
    }, start);
    await page.waitForFunction(() => document.querySelector('.pena-turn') !== window.fixture.oldTurn);
    assert.match(await page.locator('#pena-window .pena-feedback').textContent(), /50%/);
    await page.evaluate(() => { window.AcasInstances = []; });
    await page.locator('#pena-window .pena-setup').click();
    assert.equal(await page.evaluate(() => window.fixture.workers.at(-1).sent.at(-1).type), 'cancelSetup');
    await page.evaluate(() => window.fixture.workers.at(-1).onmessage({ data: { type: 'connection', state: 'offline', connected: true,
        setup: { installed: true, error: 'Test failure' } } }));
    assert.match(await page.locator('#pena-window .pena-feedback').textContent(), /Test failure/);
    assert.equal(await page.locator('#pena-window .pena-setup').textContent(), 'Try again');
    await page.evaluate(() => window.fixture.workers.at(-1).onmessage({ data: { type: 'ready', canChat: true, model: 'test.gguf' } }));
    assert.equal(await page.locator('#pena-window .pena-setup').isVisible(), false);
    assert.equal(await page.locator('#pena-window .pena-question-form input').isEnabled(), true);
    await page.evaluate(() => window.fixture.workers.at(-1).onerror({ message: 'Worker failed' }));
    assert.equal(await page.locator('#pena-window .pena-feedback').isVisible(), true);
    assert.match(await page.locator('#pena-window .pena-feedback').textContent(), /Worker failed/);
    assert.equal(await page.locator('#pena-window .pena-setup').textContent(), 'Try again');
    const failedWorkerCount = await page.evaluate(() => window.fixture.workers.length);
    await page.locator('#pena-window .pena-setup').click();
    await page.waitForFunction(count => window.fixture.workers.length > count, failedWorkerCount);
    for(const key of ['penaSpeech', 'penaCoaching', 'penaEffort', 'penaTemperature', 'penaSystemPrompt'])
        assert.equal(await page.locator(`#pena-floaty [data-key="${key}"]`).count(), 1, key);
    for(const key of ['penaPreset', 'penaLora', 'penaLoraScale', 'penaMoveCheck', 'penaCheckDepth', 'penaEvidenceAmount'])
        assert.equal(await page.locator(`#pena-floaty [data-key="${key}"]`).count(), 0, key);
    assert.match(await page.locator('#pena-floaty [data-key="penaSystemPrompt"]').inputValue(), /^You are Pena/,
        'The built-in prompt fills the box so it can be edited');
    const locked = key => page.evaluate(key => document.querySelector(`#pena-floaty [data-key="${key}"]`)
        .closest('.custom-input').getAttribute('aria-disabled'), key);
    await page.evaluate(async () => {
        const { setInputValue } = await import('./assets/js/gui/domInputs.js');
        setInputValue(document.querySelector('#pena-floaty [data-key="penaCoaching"]'), false);
    });
    for(const key of ['penaHideMoves', 'penaOnlyWhenAsked', 'penaTeacher', 'penaFollowLine'])
        assert.equal(await locked(key), 'true', key);
    for(const key of ['penaEffort', 'penaThinkingTokens', 'penaTemperature', 'penaSystemPrompt'])
        assert.equal(await page.locator(`#pena-floaty [data-key="${key}"]`).isEnabled(), true, key);
    await page.evaluate(async () => {
        const { setInputValue } = await import('./assets/js/gui/domInputs.js');
        setInputValue(document.querySelector('#pena-floaty [data-key="penaCoaching"]'), true);
    });
    assert.equal(await page.locator('#pena-floaty [data-key="penaVoice"]').count(), 0);
    assert.equal(await page.locator('#pena-floaty [data-value="neural"]').textContent(), 'ZONOS3 neural voice');
    assert.equal(await page.locator('#pena-floaty [data-key="penaSpeech"]').inputValue(), 'neural');
    assert.equal(await page.evaluate(async () =>
        (await (await import('./assets/engines/pena-v2/preferences.js')).getPenaPreferences()).penaSpeech), 'neural');
    assert.equal(await page.locator('#pena-floaty [data-key="penaTemperature"]').inputValue(), '0.3');
    assert.equal(await page.evaluate(async () => {
        window.fixture.config.global.penaTemperature = 0;
        const result = (await (await import('./assets/engines/pena-v2/preferences.js')).getPenaPreferences()).penaTemperature;
        delete window.fixture.config.global.penaTemperature;
        return result;
    }), 0, 'An explicitly saved zero temperature stays unchanged');
    const sections = await page.locator('#pena-floaty .pena-personalization').evaluateAll(elements => elements.map(section => ({
        title: section.querySelector('.setting-panel-title').textContent,
        keys: [...section.querySelectorAll('[data-key]')].map(input => input.dataset.key)
    })));
    assert.deepEqual(sections, [
        { title: 'Conversation', keys: ['penaCoaching', 'penaHideMoves', 'penaOnlyWhenAsked', 'penaTeacher', 'penaFollowLine',
            'penaVisualDuration', 'penaVoicePause'] },
        { title: 'Voice', keys: ['penaSpeech', 'penaZonosVoice', 'penaBrowserVoice', 'penaSpeechRate'] },
        { title: 'Thinking & Prompt', keys: ['penaEffort', 'penaThinkingTokens', 'penaTemperature', 'penaSystemPrompt'] }
    ]);
    assert.equal(await page.locator('#pena-floaty [data-key="penaSpeech"]').evaluate(input =>
        input.closest('.custom-input').querySelector('.input-subtitle').textContent), 'Downloads voice models when needed.');
    assert.equal(await page.locator('#pena-floaty [data-key="penaZonosVoice"]').evaluate(input =>
        input.closest('.custom-input').querySelector('.input-subtitle').textContent), '');
    assert.deepEqual(await page.evaluate(async () => {
        const { setInputValue } = await import('./assets/js/gui/domInputs.js');
        const input = document.querySelector('#pena-floaty [data-key="penaZonosVoice"]');
        setInputValue(input, 'builtin-pena');
        const migrated = { value: input.value, label: input.parentElement.dataset.penaChoiceLabel };
        setInputValue(input, 'default_3765f0d1140c05c0');
        const saved = input.value;
        setInputValue(input, input.dataset.defaultValue);
        return { migrated, saved };
    }), { migrated: { value: 'default_3c00e421e684f949', label: 'Thaddeus (English, masculine)' },
        saved: 'default_3765f0d1140c05c0' });
    assert.equal(await page.locator('#pena-floaty [data-key="penaSystemPrompt"]').evaluate(input =>
        input.closest('.custom-input').querySelector('.input-subtitle').textContent), 'Who Pena is and how he talks');
    const sizes = await page.evaluate(() => {
        const dialog = document.querySelector('#pena-floaty');
        dialog.showModal();
        const container = key => dialog.querySelector(`[data-key="${key}"]`).closest('.dropdown-input-container');
        const effort = container('penaEffort');
        const effortList = effort.querySelector('.dropdown-list-container');
        effortList.style.display = 'block';
        const sizes = { effort: effort.getBoundingClientRect().width, effortList: effortList.getBoundingClientRect().width,
            other: container('penaSpeech').getBoundingClientRect().width };
        effortList.style.display = '';
        dialog.close();
        return sizes;
    });
    assert.ok(sizes.effort >= 105 && sizes.effort <= 125, JSON.stringify(sizes));
    assert.ok(sizes.effortList >= sizes.effort && sizes.effortList <= 220, JSON.stringify(sizes));
    assert.ok(sizes.other > sizes.effort, JSON.stringify(sizes));
    await page.setViewportSize({ width: 500, height: 800 });
    const narrow = await page.evaluate(async () => {
        const dialog = document.querySelector('#pena-floaty');
        dialog.showModal();
        const { updatePenaChoices } = await import('./assets/engines/pena-v2/i18n.js');
        const results = [];
        for(const key of ['penaEffort']) {
            const input = dialog.querySelector(`[data-key="${key}"]`);
            const container = input.closest('.dropdown-input-container');
            const list = container.querySelector('.dropdown-list-container');
            const item = list.querySelector(`[data-value="${input.value}"]`);
            const original = item.textContent;
            item.textContent = 'A longer translated option';
            updatePenaChoices(container.parentElement);
            list.style.display = 'block';
            const bounds = list.getBoundingClientRect(), dialogBounds = dialog.getBoundingClientRect();
            results.push({ left: bounds.left, right: bounds.right, dialogLeft: dialogBounds.left,
                dialogRight: dialogBounds.right, title: input.title });
            list.style.display = '';
            item.textContent = original;
            updatePenaChoices(container.parentElement);
        }
        dialog.close();
        return results;
    });
    for(const bounds of narrow) {
        assert.ok(bounds.left >= bounds.dialogLeft && bounds.right <= bounds.dialogRight, JSON.stringify(bounds));
        assert.equal(bounds.title, 'A longer translated option');
    }
    for(const viewportWidth of [320, 500, 1280]) {
        await page.setViewportSize({ width: viewportWidth, height: 800 });
        for(const direction of ['ltr', 'rtl']) {
            const results = await page.evaluate(direction => {
                const dialog = document.querySelector('#pena-floaty');
                dialog.style.width = '350px';
                dialog.dir = direction;
                dialog.showModal();
                const results = [];
                for(const key of ['penaEffort', 'penaSpeech']) {
                    const input = dialog.querySelector(`[data-key="${key}"]`);
                    const list = input.closest('.dropdown-input-container').querySelector('.dropdown-list-container');
                    const item = list.querySelector('.dropdown-item');
                    const original = item.textContent;
                    item.textContent = 'AReallyLongTranslatedDropdownOptionWithoutSpaces';
                    list.style.display = 'block';
                    const bounds = list.getBoundingClientRect(), dialogBounds = dialog.getBoundingClientRect();
                    const range = document.createRange();
                    range.selectNodeContents(item);
                    const style = getComputedStyle(list);
                    results.push({ key, left: bounds.left, right: bounds.right, dialogLeft: dialogBounds.left,
                        direction: style.direction, insetLeft: style.left, insetRight: style.right,
                        dialogRight: dialogBounds.right, text: [...range.getClientRects()].map(rect => ({ left: rect.left, right: rect.right })) });
                    list.style.display = '';
                    item.textContent = original;
                }
                dialog.close();
                dialog.style.width = '';
                dialog.removeAttribute('dir');
                return results;
            }, direction);
            for(const bounds of results) {
                assert.ok(bounds.left >= bounds.dialogLeft && bounds.right <= bounds.dialogRight,
                    `${viewportWidth} ${direction}: ${JSON.stringify(bounds)}`);
                for(const text of bounds.text)
                    assert.ok(text.left >= bounds.left && text.right <= bounds.right, JSON.stringify(bounds));
            }
        }
    }
    await page.setViewportSize({ width: 500, height: 800 });
    await page.evaluate(async () => {
        const { initializeDropdown } = await import('./assets/js/gui/domDropdown.js');
        initializeDropdown(document.querySelector('#pena-floaty [data-key="penaEffort"]').closest('.dropdown-input'));
        document.querySelector('#pena-floaty').showModal();
    });
    const effortControl = page.locator('#pena-floaty [data-key="penaEffort"]').locator('..');
    await effortControl.scrollIntoViewIfNeeded();
    await effortControl.hover();
    const highOption = effortControl.locator('.dropdown-item[data-value="high"]');
    await highOption.click();
    await page.waitForFunction(() => document.querySelector('#pena-floaty [data-key="penaEffort"]').value === 'high');
    await page.evaluate(() => document.querySelector('#pena-floaty').close());
    await page.setViewportSize({ width: 1280, height: 720 });
    assert.equal(await locked('penaHideMoves'), 'false');
    await page.evaluate(() => {
        const box = document.querySelector('#pena-floaty [data-key="penaCoaching"]');
        box.checked = false;
        box.dispatchEvent(new Event('change'));
    });
    for(const key of ['penaHideMoves', 'penaOnlyWhenAsked', 'penaTeacher', 'penaFollowLine', 'penaVisualDuration'])
        assert.equal(await locked(key), 'true', `${key} is locked while chess coaching is off`);
    assert.notEqual(await locked('penaVoicePause'), 'true');
    await page.evaluate(() => {
        const box = document.querySelector('#pena-floaty [data-key="penaCoaching"]');
        box.checked = true;
        box.dispatchEvent(new Event('change'));
    });
    assert.equal(await locked('penaVisualDuration'), 'false');
    assert.equal(await page.evaluate(async () => {
        const { setInputValue } = await import('./assets/js/gui/domInputs.js');
        const { coachingSystem } = await import('./assets/engines/pena-v2/coaching-compact.js');
        const { defaultPenaPrompt } = await import('./assets/engines/pena-v2/prompt-overrides.js');
        const input = document.querySelector('#pena-floaty [data-key="penaSystemPrompt"]');
        setInputValue(input, coachingSystem);
        const legacyUpdated = input.value === defaultPenaPrompt;
        const previousPrompt = 'You are Pena, a chess coach who talks like a relaxed, sharp player beside the board. '
            + 'Be observant, candid and grounded, with a quiet sense of humor when it fits. '
            + 'Have opinions when there is a reason for them, admit uncertainty, and let the conversation breathe. '
            + 'React to what the player actually says instead of following a script. Greet simply, disagree plainly, '
            + 'and give praise only when it is specific and deserved. No forced enthusiasm, flattery, customer-service phrases, '
            + 'announcements about what you will do, or constant reassurance. Call the player you. '
            + 'The app is written A.C.A.S, never with a dot after the last S.';
        setInputValue(input, previousPrompt);
        const previousUpdated = input.value === defaultPenaPrompt;
        setInputValue(input, `${previousPrompt} Extra.`);
        const modifiedPreserved = input.value === `${previousPrompt} Extra.`;
        setInputValue(input, 'Custom persona');
        return legacyUpdated && previousUpdated && modifiedPreserved && input.value === 'Custom persona';
    }), true, 'An old built-in prompt is refreshed without changing a custom prompt');
    await page.locator('#pena-floaty [data-key="penaSystemPrompt"]').evaluate(input => { input.value = 'Custom prompt'; });
    await page.locator('#pena-floaty [data-aux="reset-prompts"]').evaluate(button => button.click());
    await page.waitForFunction(() => document.querySelector('#pena-floaty [data-key="penaSystemPrompt"]').value.startsWith('You are Pena'));
    await page.waitForFunction(() => window.fixture.config.global.penaSystemPrompt
        === document.querySelector('#pena-floaty [data-key="penaSystemPrompt"]').value);
    await page.evaluate(() => window.fixture.toggle(false));
    await page.waitForFunction(() => document.querySelector('#pena-window').hidden);
    assert.equal(await page.evaluate(() => window.fixture.workers.at(-1).terminated), true);
    assert.equal(await page.evaluate(() => window.fixture.downloads.length), 0);
});

test('Pena continuous microphone submits successive questions on the current board and discards cancelled recognition', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.route('https://huggingface.co/**/voices.json', route => route.fulfill({
        json: {}, headers: { 'Access-Control-Allow-Origin': '*' }
    }));
    await page.route('**/pena-v2/recognition.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `
            export function recognitionRequest(message, {signal, onWord} = {}) {
                if(message.type === 'prepare') return window.fixture.prepareError
                    ? Promise.reject(window.fixture.prepareError) : Promise.resolve({});
                return new Promise((resolve, reject) => {
                    window.fixture.recognitions.push({audio: message.audio, signal, onWord, resolve});
                    signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), {once: true});
                });
            }
            export function releaseRecognitionModel() {}
        `
    }));
    await page.goto(`${url}/app/index.html`);
    await page.evaluate(async fen => {
        window.fixture = { recognitions: [], questions: [], messages: [], starts: 0,
            config: { global: { penaEnabled: false, penaModel: 'fixture', penaOnlyWhenAsked: true } } };
        window.USERSCRIPT = {
            getValue: async () => structuredClone(window.fixture.config),
            setValue: async (key, value) => { window.fixture.config = structuredClone(value); }
        };
        GET_GM_CFG_BASE_VALUE = async key => window.fixture.config.global[key];
        GET_PROFILE_FOR_INSTANCE = async () => null;
        Object.defineProperty(navigator, 'gpu', { configurable: true,
            value: { requestAdapter: async () => ({ info: {} }) } });
        window.Worker = class {
            postMessage(message) {
                window.fixture.messages.push(message);
                if(message.type === 'initialize') queueMicrotask(() => this.onmessage({ data: { type: 'ready' } }));
            }
            terminate() {}
        };
        window.fixture.instance = { instanceID: 'fixture', domain: 'voice fixture', currentFen: fen, environmentSetupRun: true,
            gameStateHistory: [], getPlayerColor: async () => 'w' };
        window.AcasInstances = [{ instance: window.fixture.instance }];
        const { PenaMicrophone, PenaSpeech } = await import('./assets/engines/pena-v2/speech.js');
        const stopSpeech = PenaSpeech.prototype.stop;
        PenaSpeech.prototype.stop = function() {
            window.fixture.speech = this;
            window.fixture.speechStops = (window.fixture.speechStops || 0) + 1;
            return stopSpeech.call(this);
        };
        PenaMicrophone.prototype.startContinuous = async function(callbacks) {
            this.active = true;
            window.fixture.starts++;
            window.fixture.callbacks = callbacks;
        };
        (await import('./assets/engines/pena-v2/service.js')).initializePena();
        document.querySelector('.pena-question-form').addEventListener('submit', () =>
            window.fixture.questions.push(document.querySelector('.pena-question-form input').value), true);
        window.fixture.toggle = enabled => {
            window.fixture.config.global.penaEnabled = enabled;
            const channel = new BroadcastChannel(GUI_BROADCAST_NAME);
            channel.postMessage({ type: 'settingSave', data: { key: 'penaEnabled' } });
            channel.close();
        };
        window.fixture.emit = () => window.fixture.callbacks.onUtterance({ audio: new Float32Array(48000), sampleRate: 48000 });
        window.fixture.toggle(true);
    }, start);
    await page.waitForFunction(() => document.querySelector('#pena-window').dataset.state === 'ready');
    await page.evaluate(() => { window.AcasInstances = [{ instance: window.fixture.instance }]; });
    await page.waitForFunction(() => document.querySelector('.pena-feedback').dataset.penaText === 'askAnytime');
    await page.locator('.pena-microphone').click();
    await page.waitForFunction(() => window.fixture.starts === 1);
    await page.evaluate(() => { window.fixture.emit(); });
    await page.waitForFunction(() => window.fixture.recognitions.length === 1);
    assert.equal(await page.evaluate(() => window.fixture.recognitions[0].audio.length), 16000);
    const played = new Chess();
    played.move('e4');
    await page.evaluate(fen => { window.fixture.instance.currentFen = fen; }, played.fen());
    await page.waitForFunction(() => document.querySelector('.pena-feedback').dataset.penaText === 'askAnytime');
    await page.evaluate(() => window.fixture.recognitions[0].resolve({ text: 'What should I do?' }));
    await page.waitForFunction(() => window.fixture.messages.some(message => message.type === 'explain'));
    assert.deepEqual(await page.locator('.pena-message-user').allTextContents(), ['What should I do?']);
    assert.equal(await page.evaluate(() => window.fixture.messages.find(message => message.type === 'explain').fen), played.fen());
    await page.locator('.pena-send').click();
    assert.equal(await page.locator('.pena-microphone').getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => { window.fixture.emit(); });
    await page.waitForFunction(() => window.fixture.recognitions.length === 2);
    await page.evaluate(() => window.fixture.recognitions[1].resolve({ text: 'That sounds interesting' }));
    await page.waitForFunction(() => window.fixture.questions.length === 2);
    assert.deepEqual(await page.evaluate(() => window.fixture.questions), ['What should I do?', 'That sounds interesting']);
    await page.evaluate(() => { window.fixture.emit(); });
    await page.waitForFunction(() => window.fixture.recognitions.length === 3);
    await page.evaluate(() => window.fixture.recognitions[2].resolve({ text: ' [noise] 123 ... ' }));
    await page.waitForFunction(() => document.querySelector('.pena-feedback').dataset.penaText === 'listening');
    assert.equal(await page.evaluate(() => window.fixture.questions.length), 2);
    await page.evaluate(() => {
        window.fixture.speech.browserSpeaking = true;
        window.fixture.speechStops = 0;
        window.fixture.callbacks.onPreview({ audio: new Float32Array(16000), sampleRate: 16000 })
            .then(() => { window.fixture.previewDone = true; });
    });
    await page.waitForFunction(() => window.fixture.recognitions.length === 4);
    assert.equal(await page.evaluate(() => window.fixture.speechStops), 0);
    assert.equal(await page.evaluate(() => window.fixture.questions.length), 2);
    await page.evaluate(() => window.fixture.recognitions[3].resolve({ text: 'Hello' }));
    await page.waitForFunction(() => window.fixture.previewDone);
    assert.equal(await page.evaluate(() => window.fixture.speechStops), 1);
    assert.equal(await page.evaluate(() => window.fixture.speech.browserSpeaking), false);
    await page.evaluate(() => { window.fixture.emit(); });
    await page.waitForFunction(() => window.fixture.recognitions.length === 5);
    await page.evaluate(() => { window.fixture.oldCallbacks = window.fixture.callbacks; });
    await page.locator('.pena-microphone').click();
    assert.equal(await page.evaluate(() => window.fixture.recognitions[4].signal.aborted), true);
    await page.evaluate(() => { window.fixture.prepareError = new DOMException('Unexpected capture abort', 'AbortError'); });
    await page.locator('.pena-microphone').click();
    await page.waitForFunction(() => document.querySelector('.pena-microphone').getAttribute('aria-pressed') === 'false');
    assert.match(await page.locator('.pena-feedback').textContent(), /stopped unexpectedly/);
    await page.evaluate(() => { window.fixture.prepareError = null; });
    await page.locator('.pena-microphone').click();
    await page.waitForFunction(() => window.fixture.starts === 2);
    await page.evaluate(() => window.fixture.oldCallbacks.onUtterance({ audio: new Float32Array(16000), sampleRate: 16000 }));
    assert.equal(await page.evaluate(() => window.fixture.recognitions.length), 5);
    await page.evaluate(() => { window.fixture.emit(); });
    await page.waitForFunction(() => window.fixture.recognitions.length === 6);
    await page.evaluate(() => window.fixture.toggle(false));
    await page.waitForFunction(() => document.querySelector('#pena-window').hidden);
    assert.equal(await page.evaluate(() => window.fixture.recognitions[5].signal.aborted), true);
    assert.equal(await page.locator('.pena-microphone').getAttribute('aria-pressed'), 'false');
});

test('Pena chat presentation uses grounded input, labels prose unverified and keeps clean conversation messages', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.route('https://huggingface.co/**/voices.json', route => route.fulfill({
        json: {}, headers: { 'Access-Control-Allow-Origin': '*' }
    }));
    await page.route('**/js/MoveEvaluator.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `
            import { Chess } from '../engines/libraries/chessjs/chess.js';
            export default class {
                async lines(fen, { depth, multipv, moves }) {
                    window.fixture.engineCalls = (window.fixture.engineCalls || 0) + 1;
                    const legal = new Chess(fen).moves({ verbose: true }).map(move => move.from + move.to + (move.promotion || ''));
                    const order = [...new Set([...(moves || []), 'e2e4', 'd2d4', 'g1f3', ...legal])].filter(move => legal.includes(move)
                        && (!moves || moves.includes(move)));
                    return order.slice(0, multipv).map((move, index) => ({ move, pv: [move], depth, score: { cp: 30 - index * 15, mate: null } }));
                }
                compare(best, played) { return { label: best.move === played.move ? 'Best Move' : 'Good', reason: '' }; }
                cancelPending() {}
                cancelStaleRequests() {}
                terminate() {}
            }`
    }));
    await page.route('**/pena-v2/app-evidence.js', route => route.fulfill({
        contentType: 'text/javascript', body: `
            import { engineCoachingEvidence } from './engine-coaching-input.js';
            import { Chess } from '../libraries/chessjs/chess.js';
            export class LiveCoachingEvidence {
                async initialize() { return this; }
                async collect(fen, history) {
                    const legal = new Chess(fen).moves({verbose:true});
                    const first = legal[0];
                    const move = first.from + first.to + (first.promotion || '');
                    return engineCoachingEvidence({ snapshot: { schema: 'pena-v2-search/1', fen, history: history.slice(-8),
                        perspective: 'root-side-to-move', budget: {nodes:128,moves:[]},
                        engine: {networkSha256:'a'.repeat(64),precision:'f32',backend:'webgpu'}, bestMove:move,
                        lines:[{pv:[move]}], candidates:[{move,visits:100,policyPrior:0.2,search:{q:0.1}}] } });
                }
                dispose() {}
            }`
    }));
    await page.goto(`${url}/app/index.html`);
    await page.evaluate(async fen => {
        window.fixture = { messages: [], spoken: [],
            config: { global: { penaEnabled: false, penaModel: 'fixture', penaOnlyWhenAsked: true,
                penaHideMoves: true, penaSpeech: 'browser' } } };
        window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
            getVoices: () => [{ lang: 'en-US' }],
            speak: utterance => { window.fixture.spoken.push(utterance.text); utterance.onstart(); utterance.onend(); },
            cancel() {}
        } });
        window.USERSCRIPT = {
            getValue: async () => structuredClone(window.fixture.config),
            setValue: async (key, value) => { window.fixture.config = structuredClone(value); }
        };
        GET_GM_CFG_BASE_VALUE = async key => window.fixture.config.global[key];
        GET_PROFILE_FOR_INSTANCE = async () => null;
        Object.defineProperty(navigator, 'gpu', { configurable: true,
            value: { requestAdapter: async () => ({ info: {} }) } });
        window.Worker = class {
            postMessage(message) {
                window.fixture.worker = this;
                window.fixture.messages.push(message);
                if(message.type === 'initialize') queueMicrotask(() => this.onmessage({ data: { type: 'ready', canChat: true } }));
            }
            terminate() {}
        };
        window.fixture.instance = { instanceID: 'fixture', currentFen: fen, environmentSetupRun: true,
            gameStateHistory: [], getPlayerColor: async () => 'w' };
        window.AcasInstances = [{ instance: window.fixture.instance }];
        (await import('./assets/engines/pena-v2/service.js')).initializePena();
        window.fixture.config.global.penaEnabled = true;
        const channel = new BroadcastChannel(GUI_BROADCAST_NAME);
        channel.postMessage({ type: 'settingSave', data: { key: 'penaEnabled' } });
        channel.close();
    }, start);
    await page.waitForFunction(() => document.querySelector('#pena-window').dataset.state === 'ready');
    assert.equal(await page.locator('.pena-read-aloud').getAttribute('aria-pressed'), 'true');
    const ask = async question => {
        const before = await page.evaluate(() => window.fixture.messages.filter(message => message.type === 'converse').length);
        await page.locator('.pena-question-form input').fill(question);
        await page.locator('.pena-question-form input').press('Enter');
        await page.waitForFunction(count => window.fixture.messages.filter(message => message.type === 'converse').length > count, before);
        return page.evaluate(() => window.fixture.messages.filter(message => message.type === 'converse').at(-1));
    };
    const reply = (message, raw, quality) => page.evaluate(async ({ message, raw, quality }) => {
        const { pcfCoachingInput } = await import('./assets/engines/pena-v2/pcf-input.js');
        const input = pcfCoachingInput(message.input, { history: message.history, playerColor: message.playerColor,
            tokenCount: text => Math.ceil(text.length / 6) });
        const send = data => window.fixture.worker.onmessage({ data: { type: 'pena', mode: 'grounded', chatId: message.chatId, ...data } });
        send({ phase: 'thinking' });
        send({ phase: 'complete', raw, tokens: 30, promptTokens: input.pcf.promptTokens, finishReason: 'stop', quality,
            inputSchema: input.schema, definedIds: [...input.references.map(ref => ref.id), ...input.legacyReferenceIds] });
    }, { message, raw, quality });

    const first = await ask('Should I play e4?');
    assert.equal(first.hideMoves, false);
    assert.equal(first.input.frames.find(frame => frame.id === 'root').fen, start);
    assert.equal(first.input.schema, 'pena-v2-grounded-coaching-input/3');
    assert.deepEqual(first.history, []);
    assert.equal(first.playerColor, 'w');
    assert.match(first.input.messages.at(-1).content, /\[A1\][^\n]*e4/);
    assert.match(first.input.messages.at(-1).content, /Should I play e4\?/);
    await page.evaluate(message => window.fixture.worker.onmessage({ data: { type: 'pena', mode: 'converse',
        chatId: message.chatId, fen: message.fen, phase: 'text', raw: 'Unchecked draft must stay hidden.' } }), first);
    assert.doesNotMatch(await page.locator('.pena-answer').textContent(), /Unchecked draft/);
    await reply(first, 'Yes, e4 is the engine favorite [A1].', {
        attempts: [{ removed: [{ sentence: 'Discarded private draft.', reason: 'An earlier attempt was rejected.' }] }],
        removed: []
    });
    await page.waitForFunction(() => /favorite/.test(document.querySelector('.pena-answer').textContent));
    const answer = await page.locator('.pena-answer').textContent();
    assert.match(answer, /e4 is the engine favorite\./);
    assert.doesNotMatch(answer, /\[|Qxh7/);
    assert.equal(await page.locator('.pena-check-count').count(), 0);
    assert.match(await page.locator('.pena-feedback').textContent(), /Pena.*not verified/);
    assert.ok(await page.locator('.pena-answer .pena-reference').count() > 0);
    assert.equal(await page.locator('.pena-answer').first().textContent(), 'Yes, e4 is the engine favorite.');
    assert.equal(await page.locator('.pena-evidence-warning').count(), 0);
    const second = await ask('Why?');
    assert.equal(second.input.messages.length, 4);
    assert.equal(second.input.messages[2].content, 'Yes, e4 is the engine favorite [A1].');
    await reply(second, 'No additional evidence is available [NOT_DEFINED]. Consider [your own plan] and say [OK].');
    await page.waitForFunction(() => !document.querySelector('.pena-thinking') || document.querySelector('.pena-thinking').hidden);
    assert.equal(await page.locator('.pena-answer').last().textContent(), 'No additional evidence is available. Consider [your own plan] and say [OK].');
    assert.equal(await page.locator('.pena-answer.pena-answer-error').count(), 0);
    const warning = page.locator('.pena-answer').last().locator('.pena-evidence-warning');
    assert.equal(await warning.isVisible(), true);
    assert.match(await warning.getAttribute('title'), /doesn't match its evidence/);
    assert.equal(await warning.getAttribute('aria-label'), await warning.getAttribute('title'));
    assert.equal(await warning.getAttribute('tabindex'), '0');
    assert.match(await page.locator('.pena-feedback').textContent(), /not verified/);
    await page.waitForFunction(() => window.fixture.spoken.some(text => text.includes('No additional evidence is available')));
    assert.doesNotMatch((await page.evaluate(() => window.fixture.spoken)).join(' '), /NOT_DEFINED/);
    await page.locator('.pena-read-aloud').click();
    assert.deepEqual(await page.locator('.pena-message-user').allTextContents(), ['Should I play e4?', 'Why?']);
    assert.match(await page.locator('.pena-answer').first().textContent(), /engine favorite/);
    assert.equal(await page.locator('.pena-original').count(), 0);
    assert.equal(await page.locator('.pena-chat-hint, .pena-status, #pena-window .pena-memory').count(), 0);
    assert.equal(await page.locator('#pena-floaty .pena-memory').count(), 0);
    assert.equal(await page.locator('.pena-window-header .pena-read-aloud').count(), 1);
    const gaps = await page.locator('.pena-turn').first().evaluate(element => {
        const [question, answer] = element.children;
        return answer.getBoundingClientRect().top - question.getBoundingClientRect().bottom;
    });
    assert.ok(gaps >= 8, `Message gap was ${gaps}px`);
    const latestLayout = await page.locator('.pena-turn').last().evaluate(element => ({
        height: element.getBoundingClientRect().height, viewport: element.parentElement.clientHeight,
        minimum: getComputedStyle(element).minHeight, display: getComputedStyle(element.parentElement).display
    }));
    assert.ok(latestLayout.height >= latestLayout.viewport - 1, JSON.stringify(latestLayout));
    assert.equal(await page.locator('.pena-send').isVisible(), false);
    const input = page.locator('.pena-question-form input');
    assert.equal(await input.getAttribute('enterkeyhint'), 'send');
    assert.equal(await page.locator('.pena-window-body').evaluate(element => getComputedStyle(element).padding), '0px');
    const speaker = page.locator('.pena-read-aloud');
    const containerBounds = () => page.evaluate(() => Object.fromEntries(
        ['#pena-window', '.pena-window-header', '.pena-window-body', '.pena-chat-log', '.pena-question-form', '.pena-question-form input']
            .map(selector => [selector, document.querySelector(selector).getBoundingClientRect().toJSON()])));
    const beforeHold = await containerBounds();
    const speakerBox = await speaker.boundingBox();
    await page.mouse.move(speakerBox.x + 10, speakerBox.y + 10);
    await page.mouse.down();
    assert.deepEqual(await containerBounds(), beforeHold);
    await page.mouse.move(0, 0);
    await page.mouse.up();
    const minimize = page.locator('.pena-minimize');
    const minimizeBox = await minimize.boundingBox();
    await page.mouse.move(minimizeBox.x + 10, minimizeBox.y + 10);
    const beforeMinimizeHold = await containerBounds();
    await page.mouse.down();
    assert.deepEqual(await containerBounds(), beforeMinimizeHold);
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await page.setViewportSize({ width: 390, height: 700 });
    const mobile = await ask('What about development?');
    assert.doesNotMatch(JSON.stringify(mobile.input.messages), /NOT_DEFINED/);
    await reply(mobile, 'Develop your [pieces](mailto:example) naturally.');
    assert.equal(await page.locator('.pena-answer').last().textContent(), 'Develop your pieces naturally.');
    assert.equal(await page.locator('.pena-evidence-warning').count(), 1, 'The warning stays with the previous answer');
    assert.equal(await page.locator('.pena-message-user').last().textContent(), 'What about development?');
    const exchange = await page.locator('.pena-turn').last().evaluate(element => {
        const bounds = element.parentElement.getBoundingClientRect();
        const [question, answer] = [...element.children].map(child => child.getBoundingClientRect());
        return { visible: question.top >= bounds.top - 1 && answer.bottom <= bounds.bottom + 1,
            previousHidden: element.previousElementSibling.getBoundingClientRect().bottom <= bounds.top + 1 };
    });
    assert.deepEqual(exchange, { visible: true, previousHidden: true });
    const formBeforeScroll = await page.locator('.pena-question-form').boundingBox();
    await page.locator('.pena-window-body').evaluate(element => { element.scrollTop = 1000; });
    await page.locator('#pena-window').evaluate(element => { element.scrollTop = 1000; });
    await page.locator('.pena-chat-log').evaluate(element => { element.scrollTop = 0; });
    await input.focus();
    assert.deepEqual(await page.locator('.pena-question-form').boundingBox(), formBeforeScroll);
    assert.equal(await page.locator('.pena-window-body').evaluate(element => element.scrollTop), 0);
    assert.equal(await page.locator('#pena-window').evaluate(element => element.scrollTop), 0);
    for(const [question, expected] of [["What's your name?", "I'm Pena."]]) {
        const count = await page.evaluate(() => window.fixture.messages.filter(message => message.type === 'converse').length);
        await input.fill(question);
        await input.press('Enter');
        await page.waitForFunction(text => [...document.querySelectorAll('.pena-answer')].at(-1).textContent === text, expected);
        assert.equal(await page.evaluate(() => window.fixture.messages.filter(message => message.type === 'converse').length), count);
    }
    await page.evaluate(() => {
        window.fixture.drawn = [];
        window.fixture.instance.BoardDrawer = { addedShapes: [], orientation: 'w', createShape(type, square, config) {
            window.fixture.drawn.push({ type, square, config });
            const element = document.createElement('span');
            this.addedShapes.push({ element });
            return element;
        } };
    });
    const visual = await ask('Should I play Nf3?');
    const knightLine = visual.input.lines.find(line => line.id.startsWith('A') && line.moves[0] === 'g1f3');
    assert.ok(knightLine);
    await reply(visual, `Nf3 develops your knight and controls d4 [${knightLine.id}].`);
    assert.match(await page.locator('.pena-answer').last().textContent(), /controls d4/);
    const terms = page.locator('.pena-answer').last().locator('.pena-reference');
    assert.ok((await terms.allTextContents()).some(text => text.includes('Nf3')));
    assert.deepEqual(await page.evaluate(() => window.fixture.drawn), [], 'No automatic marks when speech is off');
    await terms.filter({ hasText: 'Nf3' }).first().hover();
    assert.ok((await page.evaluate(() => window.fixture.drawn))
        .some(shape => shape.type === 'arrow' && shape.square.join('') === 'g1f3'),
    'A legal move mentioned in unverified prose is shown without claiming the advice is verified');
    await page.evaluate(() => { window.fixture.drawn = []; });
    const hidden = await ask('What should I focus on?');
    assert.equal(hidden.hideMoves, true);
    await page.evaluate(message => {
        const send = data => window.fixture.worker.onmessage({ data: { type: 'pena', mode: 'grounded', chatId: message.chatId, ...data } });
        send({ phase: 'thought', text: 'I should recommend Nf3.' });
        send({ phase: 'sentence', text: 'Play Nf3.' });
    }, hidden);
    assert.doesNotMatch(await page.locator('#pena-window').textContent(), /I should recommend Nf3|Play Nf3/);
    await reply(hidden, 'Play **Nf3**. Your knight on g1 needs development.');
    assert.doesNotMatch(await page.locator('.pena-answer').last().textContent(), /Nf3/);
    assert.match(await page.locator('.pena-answer').last().textContent(), /knight on g1/);
    await page.locator('.pena-answer').last().locator('.pena-reference').filter({ hasText: 'knight on g1' }).first().hover();
    const hiddenDrawn = await page.evaluate(() => window.fixture.drawn);
    assert.ok(hiddenDrawn.some(shape => shape.square === 'g1'));
    assert.ok(!hiddenDrawn.some(shape => shape.type === 'arrow' && shape.square.join('') === 'g1f3'));
    await page.locator('.pena-read-aloud').click();
    const withheld = await ask('How can I improve this position?');
    const spokenBefore = await page.evaluate(() => window.fixture.spoken.length);
    await reply(withheld, 'Play Nf3.');
    assert.match(await page.locator('.pena-answer').last().textContent(), /rather let you find it/);
    assert.doesNotMatch(await page.locator('.pena-answer').last().textContent(), /Nf3/);
    assert.equal(await page.locator('.pena-answer-quiet').count(), 0, 'A spoken reply already explains itself, so no grey note');
    await reply(await ask('What is the plan here?'), 'Your knight on g1 still needs a square.');
    assert.equal(await page.locator('.pena-answer-quiet').count(), 0, 'An answer that kept its words stays a normal reply');
    const spokenQuiet = await page.evaluate(() => window.fixture.spoken.length);
    await reply(await ask('Where should my rook go?'), "It's about equal.");
    const quiet = page.locator('.pena-answer').last();
    assert.ok(await quiet.isVisible(), 'An answer emptied by the filters still shows a bubble');
    assert.match(await quiet.getAttribute('class'), /pena-answer-quiet/);
    assert.match(await quiet.textContent(), /Nothing new/);
    assert.equal(await page.evaluate(() => window.fixture.spoken.length), spokenQuiet, 'The grey reply is never spoken');
    const clarification = await ask('What');
    assert.equal(clarification.hideMoves, true, 'An ambiguous question must not disclose a move');
    await reply(clarification, 'Play Nf3.');
    assert.match(await page.locator('.pena-answer').last().textContent(), /rather let you find it/);
    const spokenWithheld = await page.evaluate(count => window.fixture.spoken.slice(count).join(' '), spokenBefore);
    assert.doesNotMatch(spokenWithheld, /Nf3|Knight to F 3|held back|Ask if you want|Pena|give away|left out/,
        'A withheld answer stays first person and never speaks the move');
    const anotherClarification = await ask('What?');
    await reply(anotherClarification, 'It develops a piece.');
    const reveal = await ask('I want it');
    const spokenBeforeReveal = await page.evaluate(() => window.fixture.spoken.length);
    assert.equal(reveal.hideMoves, false);
    assert.equal(reveal.moveRequested, true);
    assert.match(reveal.input.question, /I want it[\s\S]*Show me the move you held back/);
    await reply(reveal, 'Play Nf3.');
    assert.match(await page.locator('.pena-answer').last().textContent(), /Nf3/);
    await page.waitForFunction(count => window.fixture.spoken.length > count, spokenBeforeReveal);
    assert.doesNotMatch((await page.evaluate(count => window.fixture.spoken.slice(count), spokenBeforeReveal)).join(' '), /held back|Ask if you want|Pena/);
    await page.locator('.pena-read-aloud').click();
    const later = await ask('What should I focus on?');
    assert.equal(later.hideMoves, true, 'Revealing one move must not turn off the setting');
    await reply(later, 'Play Nf3.');
    const changedTopic = await ask('Explain pawn structure.');
    await reply(changedTopic, 'Pawns support each other.');
    const unrelated = await ask('I want it');
    assert.equal(unrelated.hideMoves, true, 'A new topic must not retain an old offer to reveal a move');
    await reply(unrelated, 'Which idea do you mean?');
    await page.evaluate(() => { window.fixture.drawn = []; });
    const beforeDefinition = await page.evaluate(() => window.fixture.messages.filter(message => message.type === 'converse').length);
    await input.fill('What is a fork?');
    await input.press('Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('.pena-answer')].at(-1).textContent.startsWith('Fork:'));
    assert.equal(await page.evaluate(() => window.fixture.messages.filter(message => message.type === 'converse').length), beforeDefinition,
        'A simple term definition uses the glossary rather than another model guess');
    assert.ok((await page.locator('.pena-answer').last().locator('.pena-reference').allTextContents()).some(text => text.toLowerCase() === 'fork'),
        'Concept demos remain attached to their own words');
    assert.match(await page.locator('.pena-answer').last().locator('.pena-reference').filter({ hasText: /fork/i }).getAttribute('title'),
        /Example, not the live position/);
    await input.hover();
    assert.deepEqual(await input.evaluate(element => ({ border: getComputedStyle(element).borderColor,
        shadow: getComputedStyle(element).boxShadow })), { border: 'rgba(0, 0, 0, 0)', shadow: 'none' });
    const greeting = await ask('hello');
    assert.equal(greeting.plain, true);
    await page.evaluate(message => window.fixture.worker.onmessage({ data: {
        type: 'pena', mode: 'grounded', chatId: message.chatId, phase: 'complete',
        raw: 'Hello there [NOT_DEFINED]!', inputSchema: 'pena-plain-chat/1', definedIds: []
    } }), greeting);
    assert.equal(await page.locator('.pena-answer').last().textContent(), 'Hello there!');
    assert.equal(await page.locator('.pena-answer').last().locator('.pena-evidence-warning').isVisible(), true);
    const greetingAgain = await ask('hi');
    assert.doesNotMatch(JSON.stringify(greetingAgain.conversation), /NOT_DEFINED/);
    await page.evaluate(message => window.fixture.worker.onmessage({ data: {
        type: 'pena', mode: 'grounded', chatId: message.chatId, phase: 'complete',
        raw: 'Nice to chat.', inputSchema: 'pena-plain-chat/1', definedIds: []
    } }), greetingAgain);
    const invalid = await ask('hey');
    await page.evaluate(message => window.fixture.worker.onmessage({ data: {
        type: 'pena', mode: 'grounded', chatId: message.chatId, phase: 'complete',
        raw: 'This has invalid metadata.', inputSchema: 'pena-plain-chat/1'
    } }), invalid);
    assert.match(await page.locator('.pena-answer').last().textContent(), /exact PCF evidence references/);
    const hallucination = await ask('Would a knight on d5 attack d8?');
    await reply(hallucination, 'A knight on d5 would attack d8. Knights move in L shapes.');
    assert.equal(await page.locator('.pena-answer').last().textContent(), 'Knights move in L shapes.');
    assert.equal(await page.locator('.pena-checks').isVisible(), true);
    assert.match(await page.locator('.pena-checks li').last().textContent(), /knight on d5 would attack d8/);
    const afterHallucination = await ask('Why does it move that way?');
    assert.doesNotMatch(JSON.stringify(afterHallucination.input.messages), /would attack d8/);
    await reply(afterHallucination, 'That is how a knight moves.');
    await page.locator('.pena-chat-log').evaluate(element => {
        for(let i = 0; i < 30; i++) element.prepend(element.querySelector('.pena-turn').cloneNode(true));
    });
    assert.equal(await page.locator('.pena-chat-log').evaluate(element => element.scrollHeight > element.clientHeight), true);
    assert.equal(await page.locator('.pena-window-body').evaluate(element => element.scrollHeight <= element.clientHeight), true);

    await page.evaluate(() => { window.fixture.config.global.penaOnlyWhenAsked = false; });
    const next = new Chess();
    next.move('e4');
    next.move('e5');
    await page.evaluate(fen => { window.fixture.instance.currentFen = fen; }, next.fen());
    await page.waitForFunction(() => window.fixture.messages.some(message => message.automatic));
    const automatic = await page.evaluate(() => window.fixture.messages.find(message => message.automatic));
    assert.equal(automatic.hideMoves, true);
    assert.match(automatic.input.messages.at(-1).content, /Player question: \(position updated\)/);
    await reply(automatic, 'Keep your pieces active. Look after your king. Here is a lengthy extra lesson.');
    assert.equal(await page.locator('.pena-answer').last().textContent(), 'Keep your pieces active. Look after your king. Here is a lengthy extra lesson.');
    assert.match(await page.locator('.pena-feedback').textContent(), /not verified/);
    const automaticCount = await page.evaluate(() => window.fixture.messages.filter(message => message.automatic).length);
    next.move('Nf3');
    next.move('Nc6');
    await page.evaluate(fen => { window.fixture.instance.currentFen = fen; }, next.fen());
    await page.waitForFunction(count => window.fixture.messages.filter(message => message.automatic).length > count, automaticCount);
    const quietAutomatic = await page.evaluate(() => window.fixture.messages.filter(message => message.automatic).at(-1));
    const spokenAutomatic = await page.evaluate(() => window.fixture.spoken.length);
    await reply(quietAutomatic, 'Play Bc4.');
    assert.match(await page.locator('.pena-answer').last().textContent(), /Don't give away moves/);
    assert.match(await page.locator('.pena-answer').last().getAttribute('class'), /pena-answer-quiet/,
        'Coaching that was only a move still shows a quiet grey reply instead of vanishing');
    assert.equal(await page.evaluate(() => window.fixture.spoken.length), spokenAutomatic, 'The grey reply is never spoken');
    assert.equal(await page.locator('.pena-feedback').textContent(), '');
    // The same tab drops its connection and comes back on the same board. Its chat returns and nothing is said again.
    const bubbles = () => page.locator('.pena-chat-log .pena-message:not([hidden])').allTextContents();
    const chatBefore = await bubbles();
    const messagesBefore = await page.evaluate(() => window.fixture.messages.filter(message => message.type === 'converse').length);
    await page.evaluate(() => { window.fixture.instance.instanceClosed = true; });
    await page.waitForFunction(() => !document.querySelector('.pena-chat-log').textContent.includes('Keep your pieces active'));
    await page.evaluate(() => {
        window.fixture.instance = { ...window.fixture.instance, instanceClosed: false };
        window.AcasInstances = [{ instance: window.fixture.instance }];
    });
    await page.waitForFunction(() => document.querySelector('.pena-chat-log').textContent.includes('Keep your pieces active'));
    await page.waitForTimeout(700);
    assert.deepEqual(await bubbles(), chatBefore, 'A reconnected tab gets its own chat back');
    assert.equal(await page.evaluate(() => window.fixture.messages.filter(message => message.type === 'converse').length), messagesBefore,
        'An unchanged board after a reconnect gets no new comment');
    // Another tab is another match. It starts with an empty chat and none of the earlier exchanges.
    await page.evaluate(fen => {
        window.fixture.firstTab = window.fixture.instance;
        window.fixture.instance = { ...window.fixture.instance, instanceID: 'other tab', currentFen: fen, gameStateHistory: [] };
        window.AcasInstances.push({ instance: window.fixture.instance });
    }, start);
    await page.waitForFunction(() => !document.querySelector('.pena-chat-log').textContent.includes('Keep your pieces active'));
    const otherTab = await ask('What is going on here?');
    assert.deepEqual(otherTab.history, [], 'A different match never sees the chat of the previous one');
    assert.doesNotMatch(await page.locator('.pena-chat-log').textContent(), /Keep your pieces active/);
    await reply(otherTab, 'Your knight on g1 still needs a square.');
    await page.evaluate(() => {
        window.fixture.instance = { ...window.fixture.firstTab, instanceClosed: false };
        window.AcasInstances = [{ instance: window.fixture.instance }];
    });
    await page.waitForFunction(() => document.querySelector('.pena-chat-log').textContent.includes('Keep your pieces active'));
    assert.doesNotMatch(await page.locator('.pena-chat-log').textContent(), /What is going on here/,
        'Going back to the first tab brings back only its own chat');
    await page.evaluate(fen => {
        window.fixture.config.global.penaOnlyWhenAsked = true;
        window.fixture.instance.currentFen = fen;
        window.fixture.instance.gameStateHistory = [];
    }, start);
    await page.waitForFunction(() => document.querySelectorAll('.pena-message-user').length === 0);
    assert.equal(await page.locator('.pena-turn').count(), 1);
    const afterReset = await ask('I want it');
    assert.equal(afterReset.hideMoves, true, 'A different board must not retain permission from an earlier position');
    await reply(afterReset, 'Which idea do you mean?');
    // Chess coaching off hands every question to plain Inkling with no board at all, and nothing comments by itself.
    await page.waitForTimeout(300);
    const engineCalls = await page.evaluate(() => window.fixture.engineCalls);
    await page.evaluate(() => { Object.assign(window.fixture.config.global, { penaCoaching: false, penaOnlyWhenAsked: false,
        penaSystemPrompt: 'You are a grumpy pirate.', penaEffort: 'high', penaThinkingTokens: 320, penaTeacher: true, penaFollowLine: true }); });
    const raw = await ask('Where can my knight on g1 go?');
    assert.equal(raw.raw, true);
    assert.equal(raw.plain, true);
    assert.equal(raw.fen, undefined);
    assert.equal(raw.board, undefined);
    assert.equal(raw.notes, undefined);
    assert.equal(raw.prompt.systemPrompt, 'You are a grumpy pirate.');
    assert.equal(raw.effort, 'high');
    assert.equal(raw.thinkingTokens, 320);
    assert.deepEqual(raw.input, { question: 'Where can my knight on g1 go?' });
    await page.evaluate(message => window.fixture.worker.onmessage({ data: { type: 'pena', mode: 'grounded', chatId: message.chatId,
        phase: 'complete', raw: 'Your knight on g1 can go to e5. Supplied evidence [A1]—[my link](https://example.com).', tokens: 9, finishReason: 'stop',
        inputSchema: 'pena-plain-chat/1', definedIds: [] } }), raw);
    assert.equal(await page.locator('.pena-answer').last().textContent(), 'Your knight on g1 can go to e5. Supplied evidence [A1]—my link.',
        'Plain Inkling answers are shown as they are, without board filters');
    assert.equal(await page.locator('.pena-answer').last().locator('.pena-reference, .pena-evidence-warning').count(), 0);
    assert.match(await page.locator('.pena-feedback').textContent(), /coaching is off/i);
    const rawCount = await page.evaluate(() => window.fixture.messages.filter(message => message.type === 'converse').length);
    const moved = new Chess();
    moved.move('d4');
    moved.move('d5');
    await page.evaluate(fen => { window.fixture.instance.currentFen = fen; }, moved.fen());
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.fixture.messages.filter(message => message.type === 'converse').length), rawCount,
        'Plain Inkling never comments on a move by itself');
    assert.equal(await page.evaluate(() => window.fixture.engineCalls), engineCalls,
        'Plain mode does not grade new positions or search user questions');
    await page.evaluate(() => { window.fixture.config.global.penaCoaching = true; });
    const privateCoaching = await ask('Why should I develop my pieces?');
    await reply(privateCoaching, 'The quiet lantern phrase belongs to this conversation.');
    assert.match(await page.locator('.pena-answer').last().textContent(), /quiet lantern phrase/);
    await page.locator('.pena-clear').click();
    assert.equal(await page.locator('.pena-message-user').count(), 0);
    const freshChat = await ask('What should I focus on?');
    assert.doesNotMatch(JSON.stringify(freshChat.input.messages), /quiet lantern phrase/,
        'New chat must remove the preceding exchange from actual model messages');
    await reply(freshChat, 'Keep developing your pieces.');
    await page.evaluate(() => window.fixture.worker.onmessage({ data: { type: 'serverVersion', version: '1.2.0' } }));
    assert.equal(await page.locator('#server-update-floaty').isVisible(), true,
        'Pena-only server connections can open the update warning');
    await page.evaluate(() => window.fixture.worker.onmessage({ data: { type: 'serverVersion', version: '1.2.1' } }));
    assert.equal(await page.locator('#server-update-floaty').isVisible(), false);
});

test('Pena gives a reconnected tab its chat back only when the same game continues', async () => {
    const code = (await readFile(new URL('../service.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify('https://pena.test/service.js'));
    const context = vm.createContext({ localStorage: { getItem: () => null }, AbortController, penaPosition, readPenaPosition });
    vm.runInContext(code + `
        scrollToTurn = setStatus = () => {};
        ui = { setupPanel: {}, turn: {}, log: { children: [{ textContent: 'Your knight on g1 still needs a square.' }],
            replaceChildren(...nodes) { this.children = nodes; } } };
        globalThis.tabs = { pena, ui, pauseChat, resumeChat };
    `, context);
    const { pena, ui, pauseChat, resumeChat } = context.tabs;
    const game = (...moves) => {
        const chess = new Chess(), history = [{ fen: { full: chess.fen() } }];
        for(const move of moves) {
            const played = chess.move(move);
            history.push({ fen: { full: chess.fen() }, boardChanges: { from: played.from, to: played.to } });
        }
        return { instanceID: 'tab', domain: 'chess.com', currentFen: chess.fen(), gameStateHistory: history };
    };
    const leave = instance => {
        pena.fen = instance.currentFen;
        ui.log.children = [{ textContent: 'Your knight on g1 still needs a square.' }];
        pauseChat(instance);
        ui.log.children = [];
    };
    const dropped = game('e4', 'e5');
    leave(dropped);
    assert.equal(resumeChat(game('e4', 'e5'), dropped.currentFen), true, 'The same board comes back quietly');
    assert.equal(ui.log.children.length, 3);
    leave(dropped);
    const later = game('e4', 'e5', 'Nf3');
    assert.equal(resumeChat(later, later.currentFen), false, 'Moves played meanwhile still get a comment');
    assert.equal(ui.log.children.length, 3, 'but the chat of that game comes back');
    leave(game('e4', 'e5', 'Nc3', 'Nf6', 'Nf3', 'Nc6'));
    const fresh = game('e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6', 'Bb5');
    assert.equal(resumeChat(fresh, fresh.currentFen), false);
    assert.equal(ui.log.children.length, 0, 'A new game that only passes through the old board starts fresh');
    leave(dropped);
    const elsewhere = { ...game('e4', 'e5'), domain: 'lichess.org' };
    assert.equal(resumeChat(elsewhere, elsewhere.currentFen), false);
    assert.equal(ui.log.children.length, 0, 'Another site is another match');
});

test('plain chat history stays with its game across switches and is cleared for a new game or chat', async () => {
    const code = (await readFile(new URL('../service.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify('https://pena.test/service.js'));
    const messages = [];
    const context = vm.createContext({ localStorage: { getItem: () => null }, penaPosition, readPenaPosition, promptOverridesFrom,
        PenaTeacher: class {}, PenaVariation: class {} });
    vm.runInContext(code + `
        cancel = clearBoard = scrollToTurn = setStatus = notice = () => {};
        resetAnswer = () => { ui.turn = { textContent: '' }; };
        ui = { setupPanel: {}, turn: { textContent: '' }, input: { focus() {} },
            log: { children: [], replaceChildren(...nodes) { this.children = nodes; } } };
        globalThis.tabs = { pena, attach, resumeChat, plainChat, onPosition, clearChat };
    `, context);
    const { pena, attach, resumeChat, plainChat, onPosition, clearChat } = context.tabs;
    pena.worker = { postMessage: message => messages.push(structuredClone(message)) };
    const first = { instanceID: 'first', domain: 'chess.com', currentFen: start, gameStateHistory: [] };
    const board = new Chess(); board.move('e4'); board.move('e5');
    const second = { ...first, instanceID: 'second', currentFen: board.fen() };
    const send = () => { plainChat({ raw: true, chatId: 'test', question: 'Hello.' }); return messages.at(-1); };
    pena.instance = first;
    pena.fen = pena.previousFen = start;
    pena.idleTurns = [{ player: 'First private question', pena: 'First private reply' }];
    assert.match(JSON.stringify(send().conversation), /First private question/);
    const firstApp = { topics: { app: true } };
    pena.idleApp = firstApp;

    attach(second);
    assert.equal(pena.idleApp, null);
    assert.deepEqual(send().conversation, [], 'A different game must not receive the first chat');
    pena.fen = pena.previousFen = second.currentFen;
    pena.idleTurns = [{ player: 'Second private question', pena: 'Second private reply' }];
    const secondApp = { topics: { match: true } };
    pena.idleApp = secondApp;
    attach(first);
    assert.equal(resumeChat(first, start), true);
    assert.equal(pena.idleApp, firstApp);
    const restored = send();
    assert.match(JSON.stringify(restored.conversation), /First private question/);
    assert.doesNotMatch(JSON.stringify(restored.conversation), /Second private/);

    attach(null);
    assert.deepEqual(send().conversation, [], 'A chat without a board must start separately');
    attach(second);
    assert.equal(resumeChat(second, second.currentFen), true);
    assert.equal(pena.idleApp, secondApp);
    assert.match(JSON.stringify(send().conversation), /Second private question/);
    pena.fen = start;
    await onPosition(start);
    assert.deepEqual(send().conversation, [], 'A new game in the same tab must start separately');
    assert.equal(pena.idleApp, null);

    pena.idleTurns = [{ player: 'Another private question', pena: 'Another private reply' }];
    clearChat();
    assert.deepEqual(send().conversation, [], 'New chat must also clear plain history');
});

test('Pena waits through thinking pauses and keeps quiet gaps inside a spoken question', () => {
    const messages = [];
    const segments = new SpeechSegments(message => messages.push(message));
    const feed = (seconds, probability) => {
        for(let i = 0; i < Math.ceil(seconds * 16000 / 512); i++) segments.accept(new Float32Array(512), probability);
    };
    feed(0.5, 0.65);
    feed(1.8, 0.01);
    assert.equal(messages.some(message => message.type === 'utterance'), false);
    feed(0.5, 0.65);
    feed(2.4, 0.01);
    assert.equal(messages.some(message => message.type === 'utterance'), false);
    feed(0.2, 0.01);
    const utterances = messages.filter(message => message.type === 'utterance');
    assert.equal(utterances.length, 1);
    assert.ok(utterances[0].audio.length > 2.8 * 16000, 'Keep the internal pause for recognition context');
});

test('Pena joins a resumed voice question rather than submitting its earlier half during transcription', async () => {
    const code = (await readFile(new URL('../service.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify('https://pena.test/service.js'));
    const requests = [], submitted = [];
    let callbacks;
    const context = vm.createContext({ localStorage: { getItem: () => null }, AbortController,
        recognizedSpeech, penaText: value => value, setPenaText: (element, value) => { element.dataset.penaText = value; },
        recognitionRequest: data => data.type === 'prepare' ? Promise.resolve({})
            : new Promise(resolve => requests.push(resolve)) });
    vm.runInContext(code + `
        ui = { status: { dataset: {} }, microphone: { setAttribute() {} }, input: { value: '' }, form: {} };
        globalThis.voice = { pena, ui, listen };
    `, context);
    const { pena, ui, listen } = context.voice;
    pena.state = 'ready';
    pena.settings = { penaVoicePause: 4 };
    pena.speech = { stop() {} };
    pena.microphone = { startContinuous: async options => { callbacks = options; } };
    ui.form.requestSubmit = () => submitted.push(ui.input.value);
    await listen();
    assert.equal(callbacks.pauseMs, 4000);
    callbacks.onSpeech();
    const first = callbacks.onUtterance({ audio: new Float32Array(16000), sampleRate: 16000 });
    await new Promise(resolve => setImmediate(resolve));
    callbacks.onSpeech();
    requests.shift()({ text: 'Why not trade' });
    await first;
    assert.deepEqual(submitted, []);
    const second = callbacks.onUtterance({ audio: new Float32Array(16000), sampleRate: 16000 });
    await new Promise(resolve => setImmediate(resolve));
    requests.shift()({ text: 'the bishop to b5?' });
    await second;
    assert.deepEqual(submitted, ['Why not trade the bishop to b5?']);
});

test('Pena requires recognized words rather than captions, numbers or non-speech', () => {
    for(const text of ['', '...', '123 456', '[Music]', '(noise)', 'music', '<|blank_audio|>'])
        assert.equal(recognizedSpeech(text), '', text);
    for(const text of ['Hello', 'Why?', 'e4', 'What should I do?', 'Thanks'])
        assert.equal(recognizedSpeech(text), text);
});

test('Pena ignores figurative chess words without losing literal cues in the same sentence', () => {
    for(const text of ['The central question is what you want.', 'The central issue is patience.',
        'Pin that down, check your settings and consider the fork in the road.', 'Developing an app takes time.']) {
        assert.deepEqual(boardRegions(text, start), [], text);
        assert.deepEqual(narrationParts(text, start).filter(part => part.cue), [], text);
    }
    const mixed = 'The central question is whether you can control the center.';
    assert.equal(narrationParts(mixed, start).filter(part => part.cue).length, 1);
});

test('Pena keeps live citations visible before explicit previews and returns to the current board afterwards', async t => {
    const code = (await readFile(new URL('../service.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify('https://pena.test/service.js'));
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const shown = [];
    let cleared = 0;
    const context = vm.createContext({ localStorage: { getItem: () => null },
        citationSteps, moveMentions, narrationParts, compileTeaching, teachingPreview, variationFrames, setTimeout, clearTimeout });
    vm.runInContext(code + '\nglobalThis.visuals = { pena, chatSteps, playSteps };', context);
    const { pena, chatSteps, playSteps } = context.visuals;
    const response = { fen: start };
    pena.settings = { penaTeacher: true, penaFollowLine: true };
    pena.instance = { currentFen: start };
    pena.shown = response;
    pena.teacher = { show: (text, fen, options) => shown.push(options), clear() {} };
    pena.variation = { clear: () => cleared++ };
    const frames = variationFrames('1. e4 e5 2. Nf3', start);
    const cited = [{ id: 'L1', fact: { line: frames, references: { moves: [['e2', 'e4']] } } }];
    assert.equal(chatSteps(response, cited, 'Earlier I mentioned that you\'re slightly better, and you\'re about equal now with an equal position.').length, 0,
        'An evaluation citation must not invent a move cue');
    assert.equal(chatSteps(response, cited, 'Play e4.').length, 1, 'Hover shows explicit move references');
    const demoCitation = [{ id: 'D:fork', fact: { term: 'fork' } }];
    assert.equal(chatSteps({ ...response, question: 'What is a fork?' }, demoCitation).length, 0);
    assert.ok(chatSteps({ ...response, question: 'What is a fork?' }, demoCitation, 'A fork attacks two pieces.').length > 0,
        'An explicitly requested concept can still use its demo while spoken');
    const steps = chatSteps(response, cited, '1. e4 e5 2. Nf3', true);
    assert.equal(steps.length, 3);
    playSteps(response, 'A possible continuation', steps);
    assert.equal(shown.length, 1);
    assert.equal(shown[0].line, null);
    t.mock.timers.tick(2399);
    assert.equal(shown.length, 1);
    t.mock.timers.tick(1);
    assert.equal(shown[1].line.index, 1);
    t.mock.timers.tick(1300);
    assert.equal(shown[2].line.index, 2);
    t.mock.timers.tick(1300);
    assert.equal(cleared, 1);
    assert.equal(chatSteps({ ...response, event: true }, cited, '1. e4 e5 2. Nf3', true).length, 1,
        'Unprompted comments never play future boards');
    pena.settings.penaVisualDuration = 7;
    const count = shown.length;
    playSteps(response, 'A possible continuation', chatSteps(response, cited, '1. e4 e5 2. Nf3', true));
    assert.equal(shown.at(-1).duration, 7000);
    t.mock.timers.tick(6999);
    assert.equal(shown.length, count + 1);
    t.mock.timers.tick(1);
    assert.equal(shown.length, count + 2, 'Do not cover the live marks before their configured duration');
    t.mock.timers.tick(14000);
});

test('Pena visualizes named alternatives, black replies and English piece retreats without inventing a line', () => {
    const fen = '4k3/7p/8/8/5B2/8/7P/4K2R w K - 0 1';
    const text = "h3 is the best move here, clearing the h1-rook's diagonal and preparing castling. "
        + 'Bg3 also keeps the position about equal. Bg5 is slightly less precise, as Black can answer with h6 '
        + 'and the bishop retreats to h4, with the position still about equal.';
    const frames = variationFrames(text, fen);
    assert.deepEqual(frames.map(frame => frame.san), ['h3', 'Bg3', 'Bg5', 'h6', 'Bh4']);
    const arrows = narrationParts(text, fen).flatMap(part => part.cue?.references.moves || []);
    for(const pair of [['h2', 'h3'], ['f4', 'g3'], ['f4', 'g5'], ['h7', 'h6'], ['g5', 'h4']])
        assert.ok(arrows.some(arrow => JSON.stringify(arrow) === JSON.stringify(pair)), `Missing ${pair}`);
});

test('Pena binds development to the named player piece, not the next side to move', () => {
    const text = 'That develops your knight and controls d4.';
    const cues = teachingCues(text, start, 'Nf3. ' + text, { rootColor: 'w' });
    const development = cues.find(cue => text.slice(cue.index, cue.end).includes('develops'));
    assert.equal(text.slice(development.index, development.end), 'develops your knight');
    assert.deepEqual(development.references.squares, ['f3']);
    assert.deepEqual(development.references.regions.flatMap(region => region.squares), ['f3']);
    assert.deepEqual(cues.find(cue => text.slice(cue.index, cue.end) === 'd4').references.relations, [['f3', 'd4']]);
    const black = teachingCues(text, start, 'Nf3 Nf6. ' + text, { rootColor: 'b' });
    assert.deepEqual(black.find(cue => text.slice(cue.index, cue.end).includes('develops')).references.squares, ['f6']);
    const afterReply = teachingCues(text, start, 'Nf3 b6. ' + text, { rootColor: 'w' });
    assert.deepEqual(afterReply.find(cue => text.slice(cue.index, cue.end).includes('develops')).references.squares, ['f3']);
    assert.deepEqual(afterReply.find(cue => text.slice(cue.index, cue.end) === 'd4').references.relations, [['f3', 'd4']]);
    assert.ok(!teachingCues('Develop your knight.', start, undefined, { rootColor: 'w' })
        .some(cue => cue.references.regions.length), 'Do not guess one knight when both are possible');
    const live = new Chess(start);
    live.move('Nf3');
    const liveCues = teachingCues(text, live.fen(), text, { rootColor: 'w', beforeFen: start });
    assert.deepEqual(liveCues.find(cue => text.slice(cue.index, cue.end).includes('develops')).references.regions
        .flatMap(region => region.squares), ['f3'], 'The played move need not be repeated in the reply');
    assert.ok(!teachingCues(text, live.fen(), text, { rootColor: 'w' }).flatMap(cue => cue.references.regions)
        .some(region => region.squares.includes('b1')), 'Missing move history cannot turn a completed development into a different home knight');
});

test('Pena visualizes explicitly named opponent moves independently of the live turn', () => {
    const fen = '4k3/8/5n2/8/5B2/8/8/4K3 w - - 0 1';
    for(const prefix of ["Black's", 'Black\u2019s', 'Black could play', 'Black can reply with', "The opponent's", 'Your opponent could play']) {
        const text = `${prefix} Nh5 would attack your bishop on f4.`;
        const cues = teachingCues(text, fen, text, { rootColor: 'w' });
        assert.deepEqual(cues.find(cue => text.slice(cue.index, cue.end) === 'Nh5')?.references.moves, [['f6', 'h5']], text);
        assert.ok(cues.some(cue => cue.references.squares.includes('f4')));
        assert.ok(cues.flatMap(cue => cue.references.relations).some(([from, to]) => from === 'h5' && to === 'f4'));
    }
    const impossible = teachingCues("Black's Nh4 would attack your bishop on f4.", fen);
    assert.equal(impossible.flatMap(cue => cue.references.moves).length, 0);
    const mirror = '4k3/8/8/5b2/8/5N2/8/4K3 b - - 0 1';
    const text = "Your opponent's Nh4 would attack your bishop on f5.";
    assert.deepEqual(teachingCues(text, mirror, text, { rootColor: 'b' })
        .find(cue => text.slice(cue.index, cue.end) === 'Nh4')?.references.moves, [['f3', 'h4']]);
    const checked = '4k3/8/5n2/8/5B2/8/8/4K2r w - - 0 1';
    assert.equal(teachingCues("Black's Nh5 would attack your bishop on f4.", checked)
        .flatMap(cue => cue.references.moves).length, 0, 'Do not switch turns while the live side is in check');
});

test('Pena maps phonemes through the selected voice vocabulary instead of the phonemizer default IDs', async () => {
    const source = await readFile(new URL('../voice-worker.js', import.meta.url), 'utf8');
    const start = source.indexOf('export function voicePhonemeIds');
    const end = source.indexOf('\nself.onmessage', start);
    const warnings = [];
    const map = vm.runInNewContext(source.slice(start, end).replace('export ', '') + '\nvoicePhonemeIds', {
        console: { warn: (...args) => warnings.push(args) }
    });
    const config = { num_symbols: 130, phoneme_id_map: { '^': [1], '_': [0], '$': [2], a: [42], b: [55, 56] } };
    assert.deepEqual([...map(['a', 'b'], config)], [1, 0, 42, 0, 55, 56, 0, 2]);
    assert.throws(() => map(['a'], { ...config, phoneme_id_map: { ...config.phoneme_id_map, a: [144] } }), /Invalid voice phoneme mapping/);
    assert.deepEqual([...map(['a', 'unsupported'], config)], [1, 0, 42, 0, 2]);
    assert.equal(warnings.length, 1, 'Unsupported phonemes must be reported, not silently discarded');
    assert.throws(() => map(['unsupported'], config), /could not pronounce/);
});

test('Pena resolves square-first piece phrases and only draws valid piece diagonals', () => {
    const text = "The c1-bishop's diagonal is blocked.";
    const cues = teachingCues(text, start);
    assert.equal(cues.length, 1);
    assert.equal(text.slice(cues[0].index, cues[0].end), "c1-bishop's diagonal");
    assert.deepEqual(cues[0].references.squares, ['c1']);
    assert.ok(cues[0].references.regions.every(region => region.squares.includes('c1')));
    assert.ok(cues[0].references.regions.length > 0);
    assert.deepEqual(teachingCues("The h1-rook's diagonal.", start).flatMap(cue => cue.references.regions), []);
    assert.deepEqual(teachingCues('The h1-rook is waiting.', start).flatMap(cue => cue.references.squares), ['h1']);
});

test('Pena fades manual marks and never lets an old fade clear a new cue', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const drawer = { addedShapes: [], createShape() {
        const element = { removed: false, remove() { this.removed = true; }, animate() {} };
        this.addedShapes.push({ element });
        return element;
    } };
    const teacher = new PenaTeacher({ currentFen: start, BoardDrawer: drawer });
    teacher.show('Play e4', start);
    const old = teacher.elements[0];
    teacher.fade();
    t.mock.timers.tick(179);
    assert.equal(old.removed, false);
    t.mock.timers.tick(1);
    assert.equal(old.removed, true);
    teacher.show('Play e4', start);
    teacher.fade();
    teacher.show('Play d4', start);
    const fresh = teacher.elements[0];
    t.mock.timers.tick(180);
    assert.equal(fresh.removed, false);
    teacher.clear();
});

test('Pena fades from the current opacity and keeps labels above later markings', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.goto(`${url}/app/index.html`);
    const result = await page.evaluate(async fen => {
        const { PenaTeacher } = await import('./assets/engines/pena-v2/teacher.js');
        const instanceElem = document.createElement('div');
        instanceElem.className = 'acas-instance';
        const board = document.createElement('div');
        board.className = 'chessground-x';
        board.style.cssText = 'width:400px;height:400px';
        instanceElem.appendChild(board);
        document.querySelector('#acas-instance-container').appendChild(instanceElem);
        const drawer = new UniversalBoardDrawer(board);
        const teacher = new PenaTeacher({ currentFen: fen, BoardDrawer: drawer });
        teacher.show('', fen, { duration: 10000, references: {
            squares: ['e4'], moves: [['g1', 'f3']], plans: [], relations: [['f3', 'e4']], frames: [],
            regions: [{ label: 'Guard', squares: ['e4'] }]
        } });
        for(const marking of teacher.markings) {
            marking.animation.pause();
            marking.animation.currentTime = 9000;
        }
        const before = teacher.elements.map(element => Number(getComputedStyle(element).opacity));
        const order = [...drawer.boardContainerElem.children].map(element => element.localName);
        teacher.fade();
        const animations = teacher.elements.map(element => element.getAnimations().at(-1));
        animations.forEach(animation => animation.pause());
        const samples = [];
        for(const time of [0, 45, 90, 135, 179]) {
            animations.forEach(animation => { animation.currentTime = time; });
            drawer.updateShapes();
            samples.push(teacher.elements.map(element => Number(getComputedStyle(element).opacity)));
        }
        teacher.clear();
        drawer.terminate();
        instanceElem.remove();
        return { before, samples, order, error: drawer.lastError?.message };
    }, start);
    assert.equal(result.before.length, 5, JSON.stringify(result));
    assert.ok(result.before.every(opacity => Math.abs(opacity - 0.5) < 0.01));
    let previous = result.before;
    for(const sample of result.samples) {
        assert.ok(sample.every((opacity, index) => opacity <= previous[index] + 0.01),
            `Fade must not brighten: ${JSON.stringify({ previous, sample })}`);
        previous = sample;
    }
    assert.equal(result.order.at(-1), 'text', 'Labels must paint above all highlights and arrows');
});

test('Pena keeps hover marks locally and renews external leases until explicitly cleared', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
    const packets = [], elements = [];
    const instance = { currentFen: start, getConfigValue: async () => true,
        CommLink: { commands: { renderVisualsToSite: async shapes => packets.push(shapes) } },
        BoardDrawer: { addedShapes: [], createShape() {
            const element = { removed: false, animations: 0, remove() { this.removed = true; }, animate() { this.animations++; } };
            elements.push(element);
            this.addedShapes.push({ element });
            return element;
        } } };
    const teacher = new PenaTeacher(instance);
    try {
        teacher.show('Nf3', start, { duration: 500, persistent: true });
        await settle();
        t.mock.timers.tick(31000);
        await settle();
        assert.ok(elements.every(element => !element.removed && element.animations === 0));
        assert.ok(packets.at(-1).every(shape => shape.expiresAt > Date.now() && shape.expiresAt <= Date.now() + 3000));
        teacher.clear();
        await settle();
        assert.ok(elements.every(element => element.removed));
        assert.ok(packets.at(-1).every(shape => !shape.shapeType));
        const count = packets.length;
        t.mock.timers.tick(5000);
        await settle();
        assert.equal(packets.length, count, 'A cleared hover must not renew or resurrect');
    } finally { teacher.clear(); }
});

test('Pena binds loose-piece labels to the described type, owner and square, including captured pieces', () => {
    const fen = '7k/3n4/2p5/1B6/8/8/8/3RK3 w - - 0 1';
    const text = "I'd play Rxd7, taking the undefended knight on d7.";
    const cues = teachingCues(text, fen);
    const target = cues.find(cue => text.slice(cue.index, cue.end).includes('undefended'));
    assert.deepEqual(target.references.squares, ['d7']);
    assert.deepEqual(target.references.regions.flatMap(region => region.squares), ['d7']);
    assert.ok(target.references.relations.every(([, to]) => to === 'd7'));
    for(const [type, name] of Object.entries({ n: 'knight', b: 'bishop', r: 'rook', q: 'queen', p: 'pawn' })) {
        const captureFen = `7k/3${type}4/2p5/1B6/8/8/8/3RK3 w - - 0 1`;
        const captureText = `Rxd7, taking an undefended ${name} on d7.`;
        const captured = teachingCues(captureText, captureFen).find(cue => captureText.slice(cue.index, cue.end).includes('undefended'));
        assert.deepEqual(captured.references.regions.flatMap(region => region.squares), ['d7'], captureText);
        for(const color of ['w', 'b']) {
            const board = new Chess(); board.clear();
            board.put({ type: 'k', color: 'w' }, 'a1');
            board.put({ type: 'k', color: 'b' }, 'h8');
            board.put({ type, color }, 'd5');
            board.put({ type: 'p', color: color === 'w' ? 'b' : 'w' }, 'g6');
            const side = color === 'w' ? 'white' : 'black';
            for(const phrase of [`The undefended ${side} ${name} on d5.`, `The ${side} ${name} on d5 is unprotected.`,
                `The ${side} d5-${name} is undefended.`, `The loose ${side} ${name} on d5.`, `The ${side}'s ${name} on d5 is undefended.`]) {
                const regions = teachingCues(phrase, board.fen()).flatMap(cue => cue.references.regions)
                    .filter(region => /Undefended/.test(region.label));
                assert.equal(regions.length, 1, phrase);
                assert.deepEqual(regions[0].squares, ['d5'], phrase);
            }
        }
    }
    const protectedFen = '7k/3n4/8/5b2/8/8/8/K2R4 w - - 0 1';
    assert.ok(!teachingCues('The undefended knight on d7.', protectedFen)
        .some(cue => cue.references.regions.some(region => /Undefended/.test(region.label))),
        'A named defended piece must not fall back to some other undefended piece');
    assert.ok(!teachingCues('The undefended rook on d7.', fen)
        .some(cue => cue.references.regions.some(region => /Undefended/.test(region.label))), 'Do not label a knight as a rook');
    const namedPawn = teachingCues('The isolated pawn on a2.', '7k/8/8/8/8/8/PP2P3/K7 w - - 0 1');
    assert.ok(!namedPawn.some(cue => cue.references.regions.some(region => /Isolated/.test(region.label))),
        'Other pawn features must not substitute an unrelated piece either');
});

test('Pena chat speech marks every described move, including black replies, even beside a concept demo', async () => {
    const code = (await readFile(new URL('../service.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify('https://pena.test/service.js'));
    const context = vm.createContext({ localStorage: { getItem: () => null }, markdownPlain, narrationParts, narrationPhrases, compileTeaching, teachingPreview,
        variationFrames, moveMentions, citationSteps, chatPhrases, clearTimeout() {}, setTimeout() {} });
    vm.runInContext(code + '\nglobalThis.visuals = { pena, speakChat };', context);
    const { pena, speakChat } = context.visuals;
    const fen = '4k3/7p/8/8/5B2/8/7P/4K2R w K - 0 1';
    const response = { fen, analysisFen: fen, playerColor: 'w', question: 'Explain this position' };
    const arrows = [];
    pena.instance = { currentFen: fen };
    pena.shown = response;
    pena.readAloud = true;
    pena.settings = { penaSpeech: 'browser', penaTeacher: true, penaFollowLine: false };
    pena.teacher = { show: (text, root, options) => arrows.push(...options.references.moves), clear() {} };
    pena.speech = { say: (text, settings, start, marks) => marks.forEach(mark => mark.run()) };
    const sentences = [
        { text: 'Bg5 is a candidate, as Black can answer with h6 and the bishop retreats to h4.', citations: [] },
        { text: 'A fork attacks two pieces.', citations: [{ id: 'D:fork', fact: { term: 'fork' }, index: 6 }] }
    ];
    speakChat(response, { sentences });
    assert.ok(arrows.some(([from, to]) => from === 'h7' && to === 'h6'));
    assert.ok(arrows.some(([from, to]) => from === 'g5' && to === 'h4'));
});

test('Pena preserves historical alternatives through visual enrichment and narrates the next live reply separately', async () => {
    const before = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const board = new Chess(before); board.move('Nc3');
    const fen = board.fen();
    const record = { fen, engine: { lines: [{ move: 'd8e7', pv: ['d8e7'], score: { cp: 0 } }] },
        last: { fen: before, uci: 'b1c3', bestUci: 'g1f3', pv: ['g1f3', 'b8c6'], label: 'Inaccuracy' } };
    const sheet = chatSheet(record, { playerColor: 'w' });
    const checked = conceptVisuals(assessChatReply("That was an inaccuracy, with Nf3 the better choice [M]. "
        + "Black's strongest reply is Qe7 [L1]. A fork attacks two pieces.", sheet, { record }), sheet);
    assert.ok(checked.visuals > 0, 'Adding a concept demo must not erase the board context of other sentences');
    assert.equal(checked.sentences[0].analysisFen, before);
    assert.equal(checked.sentences[1].analysisFen, fen);
    const code = (await readFile(new URL('../service.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify('https://pena.test/service.js'));
    const context = vm.createContext({ localStorage: { getItem: () => null }, markdownPlain, narrationParts, narrationPhrases, compileTeaching, teachingPreview,
        variationFrames, moveMentions, citationSteps, chatPhrases, clearTimeout() {}, setTimeout() {} });
    vm.runInContext(code + '\nglobalThis.visuals = { pena, speakChat, chatSentenceContext };', context);
    const { pena, speakChat, chatSentenceContext } = context.visuals;
    const response = { fen, analysisFen: fen, playerColor: 'w', event: true };
    const shown = [];
    pena.instance = { currentFen: fen };
    pena.shown = response;
    pena.readAloud = true;
    pena.settings = { penaSpeech: 'browser', penaTeacher: true, penaFollowLine: true };
    pena.teacher = { show: (text, liveFen, options) => shown.push({ liveFen, ...options }), clear() {} };
    pena.speech = { say: (text, settings, start, marks) => marks.forEach(mark => mark.run()) };
    const liveContext = chatSentenceContext(response, checked.sentences, 1);
    assert.doesNotMatch(liveContext, /Nf3/);
    assert.ok(teachingCues(checked.sentences[0].text, before,
        chatSentenceContext(response, checked.sentences, 0)).some(cue => cue.references.moves.some(([from, to]) => from === 'g1' && to === 'f3')));
    speakChat(response, checked);
    assert.ok(shown.some(item => item.liveFen === fen && item.references.moves.some(([from, to]) => from === 'g1' && to === 'f3')));
    assert.ok(shown.some(item => item.references.moves.some(([from, to]) => from === 'd8' && to === 'e7')));
    assert.ok(shown.every(item => !item.line), 'A historical arrow must not replace the current board');
});

test('Pena uses regular engine arrow geometry and ghost styling, with stronger square and region highlights', async () => {
    const source = await readFile(new URL('../../../js/instance/Interface.js', import.meta.url), 'utf8');
    const method = source.slice(source.indexOf('    getMoveVisualSettings('), source.indexOf('    getMoveShapes('));
    const scale = source.slice(source.indexOf('function computeArrowScale('), source.indexOf('export default class'));
    const visuals = vm.runInNewContext(`${scale}\n({${method}})`, { moveArrowConfig });
    const current = visuals.getMoveVisualSettings({ player: ['g1', 'f3'] }, 0, 1,
        { primaryArrowColorHex: '#ffd166', arrowOpacity: 0.85 }).shapeConfig;
    const future = visuals.getMoveVisualSettings({ player: ['f3', 'd4'], isFuture: true }, 0, 1,
        { arrowOpacity: 0.85 }).shapeConfig;
    const drawn = [];
    const drawer = { addedShapes: [], createShape(type, square, config) {
        drawn.push({ type, square, config });
        const element = { remove() {} };
        this.addedShapes.push({ element });
        return element;
    } };
    const teacher = new PenaTeacher({ currentFen: start, BoardDrawer: drawer });
    try {
        teacher.show('Nf3', start);
        assert.deepEqual(drawn.find(shape => shape.type === 'arrow').config, current);
        teacher.clear(); drawn.length = 0;
        teacher.show('Controlling d4 and the kingside', start, { references: { squares: ['d4'], moves: [], plans: [], frames: [],
            regions: boardRegions('kingside', start), relations: [['f3', 'd4']] } });
        assert.deepEqual(drawn.find(shape => shape.type === 'arrow').config, future);
        const fills = drawn.filter(shape => shape.type === 'rectangle').map(shape => Number(shape.config.style.match(/fill-opacity:([\d.]+)/)[1]));
        assert.ok(fills.every(opacity => opacity >= 0.45));
        assert.ok(fills.some(opacity => opacity >= 0.7));
    } finally { teacher.clear(); }
});

function coachingReview(fen, move, { best = move, pv = [move], bestPv = [best], loss = 0, provisional = false } = {}) {
    return { fen, move, depth: 12, cpLoss: loss, provisional,
        best: { move: best, pv: bestPv, cp: 30, mate: null },
        played: { move, pv, cp: 30 - loss, mate: null } };
}

test('Pena previews future positions over the instance board without changing the live board', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.goto(`${url}/app/index.html`);
    await page.clock.install();
    await page.evaluate(async fen => {
        window.ChessgroundX = (await import('../../../../../assets/libraries/chessgroundx/chessground.js')).Chessground;
        const { PenaVariation } = await import('./assets/engines/pena-v2/variation.js');
        const { variationFrames } = await import('./assets/engines/pena-v2/teacher.js');
        const instanceElem = document.createElement('div');
        instanceElem.className = 'acas-instance';
        instanceElem.style.width = '400px';
        instanceElem.innerHTML = '<div class="chessboard-components merida"><div class="chessground-x" style="width:320px;height:320px"></div></div><div class="instance-opening-container"><span>Opening name</span></div>';
        document.querySelector('#acas-instance-container').append(instanceElem);
        const host = instanceElem.querySelector('.chessground-x');
        const board = window.ChessgroundX(host, { fen, viewOnly: true, orientation: 'black' });
        const drawer = new UniversalBoardDrawer(host, { boardDimensions: [8, 8],
            parentElem: document.querySelector('#board-drawings'), zIndex: 500 });
        drawer.setOrientation('b');
        const instance = { instanceElem, currentFen: fen, BoardDrawer: drawer };
        window.previewFixture = { instance, host, board, enabled: true,
            frames: variationFrames('Illustrative legal line: e4 e5 Nf3 Nc6.', fen) };
        previewFixture.originalBounds = instanceElem.getBoundingClientRect().toJSON();
        previewFixture.openingBounds = instanceElem.querySelector('.instance-opening-container').getBoundingClientRect().toJSON();
        previewFixture.preview = new PenaVariation(instance, () => previewFixture.enabled);
        previewFixture.preview.show(previewFixture.frames, fen);
    }, start);
    assert.equal(await page.evaluate(() => previewFixture.preview.container.parentElement === previewFixture.host), true);
    const host = await page.locator('.acas-instance .chessboard-components > .chessground-x').boundingBox();
    const overlay = await page.locator('.pena-variation-board').boundingBox();
    assert.deepEqual(overlay, host);
    const controls = page.locator('.pena-variation-actions');
    let controlBounds = await controls.boundingBox();
    assert.ok(controlBounds.y >= host.y + host.height, 'Preview controls must not cover the board');
    assert.equal(await controls.evaluate(element => getComputedStyle(element).position), 'absolute');
    assert.equal(await page.evaluate(() => previewFixture.instance.instanceElem.getBoundingClientRect().height),
        await page.evaluate(() => previewFixture.originalBounds.height), 'Floating controls must not resize the instance');
    assert.equal(await page.evaluate(() => previewFixture.instance.instanceElem.querySelector('.instance-opening-container').getBoundingClientRect().y),
        await page.evaluate(() => previewFixture.openingBounds.y), 'Floating controls must not push other content down');
    assert.equal(await controls.getAttribute('aria-label'), 'Preview');
    assert.equal(await controls.locator('.pena-variation-label').textContent(), 'Preview');
    await page.evaluate(() => {
        previewFixture.instance.instanceElem.style.width = '240px';
        previewFixture.host.style.width = '180px';
        previewFixture.host.style.height = '180px';
    });
    const narrowBoard = await page.locator('.pena-variation-board').boundingBox();
    controlBounds = await controls.boundingBox();
    const instanceBounds = await page.locator('.acas-instance').last().boundingBox();
    assert.ok(controlBounds.y >= narrowBoard.y + narrowBoard.height, 'Controls stay below a smaller board');
    assert.ok(controlBounds.x >= instanceBounds.x && controlBounds.x + controlBounds.width <= instanceBounds.x + instanceBounds.width);
    assert.equal(await page.evaluate(() => previewFixture.board.getFen()), start.split(' ')[0]);
    assert.equal(await page.evaluate(() => previewFixture.preview.board.state.orientation), 'black');
    assert.equal(await page.evaluate(() => previewFixture.instance.BoardDrawer.boardContainerElem.style.visibility), 'hidden');
    assert.equal(await page.evaluate(() => {
        previewFixture.mark = previewFixture.preview.drawer.createShape('rectangle', 'e4', { style: 'fill:#fff;' });
        previewFixture.preview.show(previewFixture.frames, previewFixture.instance.currentFen);
        return previewFixture.mark.isConnected;
    }), true, 'Returning to the same preview position must keep its readable markings');
    assert.equal(await controls.count(), 1, 'Repeated previews reuse the controls');
    await controls.locator('[data-step="-1"]').click();
    assert.equal(await page.evaluate(() => previewFixture.preview.index), 2);
    assert.equal(await page.evaluate(() => previewFixture.mark.isConnected), false, 'A different position must not inherit stale markings');
    await controls.locator('[data-step="1"]').click();
    assert.equal(await page.evaluate(() => previewFixture.preview.index), 3);
    await controls.locator('[data-close]').click();
    assert.equal(await page.locator('.pena-variation').count(), 0);
    assert.equal(await controls.count(), 0);
    assert.equal(await page.evaluate(() => previewFixture.instance.BoardDrawer.boardContainerElem.style.visibility), '');
    assert.equal(await page.evaluate(() => previewFixture.instance.penaPreview), null);
    assert.equal(await page.evaluate(() => {
        previewFixture.enabled = false;
        return previewFixture.preview.show(previewFixture.frames, previewFixture.instance.currentFen);
    }), null);
    assert.equal(await page.locator('.pena-variation').count(), 0);
    await page.evaluate(() => {
        previewFixture.enabled = true;
        previewFixture.preview.show(previewFixture.frames, previewFixture.instance.currentFen);
    });
    await controls.locator('[data-close]').focus();
    await page.keyboard.press('Escape');
    assert.equal(await controls.count(), 0, 'Escape closes the separate controls as well');
    await page.evaluate(() => previewFixture.preview.show(previewFixture.frames, previewFixture.instance.currentFen));
    await page.clock.fastForward(6001);
    assert.equal(await page.locator('.pena-variation').count(), 0);
    assert.equal(await controls.count(), 0);
    assert.equal(await page.evaluate(() => previewFixture.board.getFen()), start.split(' ')[0]);
    await page.evaluate(() => { previewFixture.instance.BoardDrawer.terminate(); previewFixture.board.destroy(); });
});

test('Pena only marks the board automatically while narration is enabled, but keeps manual teaching', async () => {
    const source = (await readFile(new URL('../service.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify(new URL('../service.js', import.meta.url).href));
    const spoken = [];
    let markings = 0;
    let timers = 0;
    const context = vm.createContext({
        localStorage: { getItem: () => null },
        explanationBody: text => text,
        sourceSentences: text => [{ text, index: 0 }],
        compileTeaching,
        narrationPhrases: text => [{ text, marks: [{ at: 0, cue: { references: {} } }] }],
        setTimeout: () => { timers++; },
        clearTimeout: () => {}
    });
    vm.runInContext(source + '\nglobalThis.coaching = { pena, streamSpeech, flash, interruptSpeech };', context);
    const { pena, streamSpeech, flash, interruptSpeech } = context.coaching;
    const response = { fen: start, analysisFen: start };
    pena.settings = { penaTeacher: true, penaFollowLine: false, penaReplyMode: 'brief', penaSpeech: 'browser' };
    pena.instance = { currentFen: start };
    pena.response = response;
    pena.shown = response;
    pena.teacher = { show: () => { markings++; }, clear: () => {} };
    pena.variation = { clear: () => {} };
    pena.speech = { say: (...args) => spoken.push(args), stop: () => {} };
    for(const state of [
        { readAloud: false, speechUnavailable: false, mode: 'browser' },
        { readAloud: true, speechUnavailable: false, mode: 'off' },
        { readAloud: true, speechUnavailable: true, mode: 'browser' }
    ]) {
        Object.assign(pena, { readAloud: state.readAloud, speechUnavailable: state.speechUnavailable });
        pena.settings.penaSpeech = state.mode;
        streamSpeech(response, 'Develop your knight.');
    }
    assert.equal(spoken.length, 0);
    assert.equal(markings, 0);
    assert.equal(timers, 0);
    Object.assign(pena, { readAloud: true, speechUnavailable: false });
    streamSpeech(response, 'Develop your knight.');
    assert.equal(spoken.length, 1);
    pena.readAloud = false;
    spoken[0][3][0].run();
    assert.equal(markings, 0);
    pena.readAloud = true;
    spoken[0][3][0].run();
    assert.equal(markings, 1);
    pena.shown = { fen: start };
    interruptSpeech(response);
    assert.equal(pena.speechInterrupted, false);
    pena.shown = response;
    interruptSpeech(response);
    streamSpeech(response, 'More explanation arrives while you are talking.');
    assert.equal(spoken.length, 1);
    pena.readAloud = false;
    flash(response, 'Develop your knight.', {});
    assert.equal(markings, 2);
});

test('Pena waits for the move check, then streams append-only without waiting for generation to finish', async () => {
    let release, calls = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const checks = new CoachingChecks({ fen: start, evaluate: async (fen, move) => {
        calls++;
        await gate;
        return coachingReview(fen, move);
    } });
    const stream = new CommentaryStream({ fen: start, mode: 'dynamic' });
    const published = [];
    const raw = 'The best move is Nf3, developing a piece and preparing to castle. The next';
    const pending = checks.update(stream, raw, false, { onUpdate: result => published.push(result.text) });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(published, []);
    release();
    await pending;
    assert.match(stream.text, /Nf3.*preparing to castle/);
    await checks.update(stream, raw.replace('The next', 'The white bishop is on f1.'), true,
        { onUpdate: result => published.push(result.text) });
    assert.equal(calls, 1);
    assert.ok(published.every((text, index) => !index || text.startsWith(published[index - 1])));
});

test('Pena replaces an independently rejected pick in every mode without narrating the rejected continuation', async () => {
    for(const mode of ['brief', 'dynamic', 'original']) {
        const checks = new CoachingChecks({ fen: start, evaluate: async (fen, move) =>
            coachingReview(fen, move, { best: 'g1f3', bestPv: ['g1f3', 'd7d5'], loss: 300 }) });
        const stream = new CommentaryStream({ fen: start, mode });
        const raw = 'The best move is a3, preparing a pawn storm. It creates a winning attack. '
            + 'After a6, White takes over the board.';
        const result = await checks.update(stream, raw, true);
        assert.match(result.text, /^Nf3,/);
        assert.match(result.text, /d4 and e5/);
        assert.doesNotMatch(result.text, /pawn storm|winning attack|takes over/);
        assert.equal(result.assessments.find(item => item.shown).mainMove, 'g1f3');
        const frames = variationFrames(result.text, start);
        assert.equal(frames[0].from + frames[0].to, 'g1f3');
        if(mode !== 'brief') assert.ok(frames.some(frame => frame.from + frame.to === 'd7d5'));
        assert.equal(frames.incomplete, false);
        assert.ok(result.text.split(/\s+/).length <= (mode === 'brief' ? 45 : mode === 'dynamic' ? 130 : Infinity));
    }
});

test('Pena preserves a searched gambit instead of using material balance as a blunder verdict', async () => {
    const board = new Chess();
    board.move('e4'); board.move('e5');
    const fen = board.fen();
    const checks = new CoachingChecks({ fen, evaluate: async (root, move) =>
        coachingReview(root, move, { best: 'g1f3', bestPv: ['g1f3'], pv: ['f2f4', 'e5f4'], loss: 60 }) });
    const result = await checks.update(new CommentaryStream({ fen, mode: 'original' }),
        'The best move is f4, challenging the center and opening the f-file.', true);
    assert.match(result.text, /^f4.*challenging the center/);
    assert.equal(result.assessments[0].replacement, undefined);
});

test('Pena holds back failed, shallow, inconsistent and stale checks instead of speaking unchecked advice', async () => {
    for(const evaluate of [
        async () => null,
        async (fen, move) => ({ ...coachingReview(fen, move), depth: 4 }),
        async (fen, move) => ({ ...coachingReview(fen, move), fen: 'wrong' }),
        async (fen, move) => ({ ...coachingReview(fen, move), played: { cp: null, mate: null, pv: [move] } })
    ]) {
        const stream = new CommentaryStream({ fen: start });
        const checks = new CoachingChecks({ fen: start, evaluate });
        await assert.rejects(checks.update(stream, 'The best move is Nf3, developing a piece.', true), /checking is unavailable/);
        assert.equal(stream.text, '');
    }
    let current = true;
    const stream = new CommentaryStream({ fen: start });
    const checks = new CoachingChecks({ fen: start, isCurrent: () => current, evaluate: async (fen, move) => {
        current = false;
        return coachingReview(fen, move);
    } });
    await assert.rejects(checks.update(stream, 'The best move is Nf3.', true), { name: 'AbortError' });
    assert.equal(stream.text, '');
});

test('Pena holds an unstable rejection and verifies BEST_MOVE-only answers too', async () => {
    const checks = new CoachingChecks({ fen: start, evaluate: async (fen, move) =>
        coachingReview(fen, move, { best: 'g1f3', loss: 300, provisional: true }) });
    const result = await checks.update(new CommentaryStream({ fen: start }),
        'The best move is a3, preparing a pawn storm.', true);
    assert.equal(result.text, '');
    assert.ok(result.assessments.some(item => item.rejectedLine));
    const inconclusive = new CoachingChecks({ fen: start, evaluate: checks.evaluate });
    const incomplete = await inconclusive.update(new CommentaryStream({ fen: start }),
        'ANALYSIS: White is to move.\nBEST_MOVE: white pawn a2-a3', true);
    assert.equal(incomplete.text, '');
    assert.ok(incomplete.assessments.some(item => item.rejectedLine && /inconclusive/.test(item.reason)));
    const stable = new CoachingChecks({ fen: start, evaluate: async (fen, move) =>
        coachingReview(fen, move, { best: 'g1f3', loss: 300 }) });
    const fallback = await stable.update(new CommentaryStream({ fen: start }),
        'ANALYSIS: White is to move.\nBEST_MOVE: white pawn a2-a3', true);
    assert.match(fallback.text, /^Nf3,/);
});

test('Pena checked questions share the gate, avoid sacrifice judgements and do not leak hidden alternatives', async () => {
    const intent = understandQuestion('What should I do?', start);
    const answer = new QuestionAnswer(intent, { checkedCoaching: true });
    const checks = new CoachingChecks({ fen: start, evaluate: async (fen, move) =>
        coachingReview(fen, move, { best: 'g1f3', bestPv: ['g1f3', 'd7d5'], loss: 300 }) });
    const raw = 'White is to move. The best move is a3, preparing a pawn storm.';
    let result;
    await checks.update(answer.stream, raw, true, { onUpdate: (_, options) => { result = answer.update(raw, options.complete, options); } });
    assert.match(result.text, /Nf3/);
    assert.doesNotMatch(result.text, /pawn storm/);
    const hidden = new CommentaryStream({ fen: start, mode: 'original', hideMove: true });
    await new CoachingChecks({ fen: start, evaluate: async (fen, move) =>
        coachingReview(fen, move, { best: 'g1f3', bestPv: ['g1f3', 'd7d5'], loss: 300 })
    }).update(hidden, raw, true);
    assert.doesNotMatch(hidden.text, /Nf3|\bd5\b|\ba3\b/);
    const board = new Chess();
    board.move('e4'); board.move('e5');
    const before = board.fen(), played = board.move('f4');
    const reaction = new QuestionAnswer(moveIntent(before, played, { yours: true }), { checkedCoaching: true });
    assert.doesNotMatch(reaction.lead, /taken|hanging|points down|preferred|best/);
});

test('Pena generated teaching describes legal, board-grounded mechanisms including en passant', () => {
    const frame = checkedLine(start, ['g1f3'])[0];
    assert.match(moveMechanism(frame), /d4 and e5/);
    assert.throws(() => checkedLine(start, ['e2e5']), /illegal continuation/);
    const fen = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1';
    assert.match(moveMechanism(checkedLine(fen, ['e5d6'])[0]), /pawn on d5/);
});

test('Pena does not quarantine an explicitly bad alternative or confuse changing grades with changing evidence', async () => {
    const checks = new CoachingChecks({ fen: start, evaluate: async (fen, move) => {
        const review = coachingReview(fen, move, { best: 'g1f3', loss: move === 'g1f3' ? 0 : 300, provisional: true });
        return { ...review, recent: [review, review] };
    } });
    const result = await checks.update(new CommentaryStream({ fen: start, mode: 'original' }),
        'The best move is a3, preparing a pawn storm. The alternative h3 is the worst option.', true);
    assert.match(result.text, /^Nf3,/);
    assert.ok(result.assessments.some(item => item.replacement));
    assert.ok(result.assessments.some(item => /worst option/.test(item.source) && !item.rejectedLine));
});

test('Pena does not mistake a checked move for proof that its explanation wins material', async () => {
    for(const mode of ['brief', 'dynamic', 'original']) {
        const checks = new CoachingChecks({ fen: start, evaluate: async (fen, move) => coachingReview(fen, move) });
        const result = await checks.update(new CommentaryStream({ fen: start, mode }),
            'The best move is Nf3, winning the queen. This is a forced mate in five.', true);
        assert.match(result.text, /Nf3.*d4 and e5/);
        assert.doesNotMatch(result.text, /winning the queen|forced mate/);
        assert.ok(result.assessments.some(item => item.repairedTactic));
    }
    const multi = new CoachingChecks({ fen: start, evaluate: async (fen, move) => coachingReview(fen, move) });
    const continuation = await multi.update(new CommentaryStream({ fen: start, mode: 'original' }),
        'The best move is Nf3, then d5, winning the queen.', true);
    assert.match(continuation.text, /^Nf3,/);
    assert.equal(variationFrames(continuation.text, start).incomplete, false);
    const fen = '4k3/8/8/8/8/8/4q3/3RK3 w - - 0 1';
    const checks = new CoachingChecks({ fen, evaluate: async (root, move) => {
        const review = coachingReview(root, move);
        review.best.cp = review.played.cp = 950;
        return review;
    } });
    const result = await checks.update(new CommentaryStream({ fen }),
        'The best move is Kxe2, winning the queen.', true);
    assert.match(result.text, /Kxe2.*winning the queen/);
});

test('Pena recognizes practical defensive recommendations and teaches a BEST_MOVE-only mechanism', async () => {
    const text = 'The best practical try is Nf3, developing a piece and preparing to castle.';
    assert.equal(checkSentence(text, start).main, true);
    assert.equal(checkSentence(text, start).text, 'Nf3, developing a piece and preparing to castle.');
    const checks = new CoachingChecks({ fen: start, evaluate: async (fen, move) => coachingReview(fen, move) });
    const result = await checks.update(new CommentaryStream({ fen: start }),
        'ANALYSIS: White is to move.\nBEST_MOVE: white knight g1-f3', true);
    assert.match(result.text, /Nf3.*d4 and e5/);
    assert.equal(speakToYou('The player to move in a sharply tactical position.'), 'You are to move in a sharply tactical position.');
});

test('Pena checked topic answers never move newly selected notes ahead of spoken advice', async () => {
    const answer = new QuestionAnswer({ kind: 'position', topic: 'pawns', fen: start, analysisFen: start, mover: 'w' },
        { checkedCoaching: true });
    const checks = new CoachingChecks({ fen: start, evaluate: async (fen, move) => coachingReview(fen, move) });
    let previous = '';
    const raw = 'The best move is Nf3, developing a piece.\n\nThe white pawn is on e2.';
    await checks.update(answer.stream, raw, true, { onUpdate: (_, options) => {
        const result = answer.update(raw, options.complete, options);
        assert.ok(result.text.startsWith(previous), `${previous} -> ${result.text}`);
        previous = result.text;
    } });
    assert.match(previous, /Nf3/);
    assert.match(previous, /pawn is on e2/);
});

test('Pena reuses the serial engine transport with standard Stockfish without requiring SharedArrayBuffer', async () => {
    const source = (await readFile(new URL('../../../js/FairyAnalysis.js', import.meta.url), 'utf8'))
        .replace(/^import .+;\r?$/gm, '').replace('export default class FairyAnalysis', 'class FairyAnalysis')
        .replaceAll('import.meta.url', '"file:///C:/app/assets/js/FairyAnalysis.js"');
    const workers = [];
    const context = vm.createContext({ URL, console, setTimeout, clearTimeout, setInterval, clearInterval,
        SharedArrayBuffer: undefined,
        getEngineWorkerConfig: type => type === 'fairy-stockfish-nnue-wasm'
            ? { path: 'fairy/worker', commandMethod: 'postMessage', initializeFiles: true, poll: true }
            : { path: 'stockfish-19-lite-single/stockfish-19-lite-single', readiness: 'message' },
        Worker: class {
            constructor(url) { this.url = url; this.messages = []; workers.push(this); }
            postMessage(message) { this.messages.push(message); }
            terminate() { this.stopped = true; }
        } });
    vm.runInContext(source + '\nglobalThis.Analysis = FairyAnalysis;', context);
    const standard = new context.Analysis(true, 'stockfish-19-lite-single');
    const fairy = new context.Analysis();
    try {
        assert.deepEqual(workers[0].messages, ['uci']);
        standard.uci('isready');
        assert.equal(workers[0].messages.at(-1), 'isready');
        workers[0].onmessage({ data: 'uciok\nreadyok' });
        await standard.readyPromise;
        assert.equal(standard.readyok, true);
        await assert.rejects(fairy.readyPromise, /requires SharedArrayBuffer/);
        assert.equal(workers.length, 1);
    } finally { standard.terminate(); fairy.terminate(); }
});

test('Pena teaching resolves legal lines and exact squares without inventing arrows or ambiguous pieces', () => {
    const references = boardReferences('Nf3, then Nf6. Look at e4 and the white king.', start);
    assert.deepEqual(references.moves, [['g1', 'f3'], ['g8', 'f6']]);
    assert.ok(references.squares.includes('e1'));
    assert.ok(references.squares.includes('e4'));
    const illegal = boardReferences('e2-e5. The knight and queen.', start);
    assert.deepEqual(illegal.moves, []);
    assert.deepEqual(illegal.squares, ['e2', 'e5']);
    assert.deepEqual(boardReferences('g1-f3, g8-f6, e2-e4.', start).moves,
        [['g1', 'f3'], ['g8', 'f6'], ['e2', 'e4']]);
    assert.deepEqual(boardReferences('g1f3', start).moves, [['g1', 'f3']]);
    assert.deepEqual(boardReferences('1. e4, then 1... d5, then exd5.', start).moves,
        [['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5']]);
    assert.deepEqual(boardReferences('Look at e2 and e4, or e2 e4.', start).moves, []);
});

test('Pena teaching clears only its own shapes and never draws stale or concealed positions', () => {
    const arrows = [];
    const existing = { element: { remove() { throw new Error('Removed another feature marking.'); } } };
    const drawer = { addedShapes: [existing], createShape(type, coordinates) {
        if(type === 'arrow') arrows.push(coordinates);
        const element = { removed: false, remove() { this.removed = true; } };
        this.addedShapes.push({ element });
        return element;
    } };
    const instance = { BoardDrawer: drawer, currentFen: start };
    const teacher = new PenaTeacher(instance);
    teacher.show('1. e4 e5 2. Nf3 Nc6.', start);
    assert.deepEqual(arrows, [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6']]);
    const owned = [...teacher.elements];
    assert.ok(owned.length);
    instance.currentFen = 'changed';
    teacher.show('Nf3', start);
    assert.ok(owned.every(element => element.removed));
    assert.deepEqual(drawer.addedShapes, [existing]);
    instance.currentFen = start;
    globalThis.CONCEAL_ASSISTANCE_ACTIVE = true;
    try { teacher.show('Nf3', start); assert.equal(teacher.elements.length, 0); }
    finally { delete globalThis.CONCEAL_ASSISTANCE_ACTIVE; teacher.clear(); }
});

test('Pena sends short-lived profile-bound teaching packets only while external display is enabled', async () => {
    let enabled = false, release;
    const packets = [];
    const instance = { currentFen: start,
        BoardDrawer: { addedShapes: [], createShape() {
            const element = { remove() {} };
            this.addedShapes.push({ element });
            return element;
        } },
        getConfigValue: async (key, profile) => {
            assert.equal(key, 'displayMovesOnExternalSite');
            assert.equal(profile, 'pena-profile');
            return release ? new Promise(resolve => { release = resolve; }) : enabled;
        },
        CommLink: { commands: { renderVisualsToSite: async data => packets.push(data) } } };
    const teacher = new PenaTeacher(instance, 'pena-profile');
    try {
        teacher.show('Nf3', start);
        await new Promise(resolve => setImmediate(resolve));
        assert.ok(teacher.elements.length, 'The local board still teaches with the external toggle off');
        assert.ok(packets.every(packet => !packet[0].shapeType));
        enabled = true;
        teacher.show('Nf3', start);
        await new Promise(resolve => setImmediate(resolve));
        const packet = packets.at(-1);
        assert.ok(packet.some(shape => shape.shapeType === 'arrow'));
        assert.ok(packet.every(shape => shape.category === 'pena-teaching'
            && shape.profileID === 'pena-profile' && shape.positionFen === start
            && shape.expiresAt > Date.now() && shape.expiresAt <= Date.now() + 1600));
        release = true;
        teacher.show('Nf3', start);
        instance.currentFen = 'new position';
        release(true);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(packets.at(-1)[0].shapeType, undefined);
        teacher.clear();
        await new Promise(resolve => setImmediate(resolve));
        assert.ok(packets.at(-1)[0].teachingRevision > packet[0].teachingRevision);
    } finally { teacher.clear(); }
});

test('Pena renews repeated mentions without recreating shapes or expiring other labels', t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
    const created = [];
    const drawer = { addedShapes: [], createShape(type, square, config) {
        const element = { type, square, config, animations: [], removed: false,
            remove() { this.removed = true; }, animate(frames) { this.animations.push(frames); } };
        created.push(element);
        this.addedShapes.push({ element });
        return element;
    } };
    const teacher = new PenaTeacher({ currentFen: start, BoardDrawer: drawer });
    const references = (label, square) => ({ squares: [], moves: [], plans: [], relations: [], frames: [],
        regions: [{ label, squares: [square] }] });
    try {
        teacher.show('', start, { references: references('First idea', 'e4'), duration: 1000 });
        const first = [...teacher.elements];
        t.mock.timers.tick(300);
        teacher.show('', start, { references: references('First idea', 'e4'), duration: 1000 });
        assert.equal(created.length, 2, 'The same square and label must not be recreated');
        assert.ok(first[0].animations.at(-1).every(frame => 'strokeOpacity' in frame));
        teacher.show('', start, { references: references('Second idea', 'e4'), duration: 1400 });
        const second = created.at(-1);
        assert.notDeepEqual(second.config.position, first[1].config.position, 'Different labels need separate reading space');
        assert.ok(first.every(element => !element.removed));
        assert.equal(teacher.delayFor('another position'), 1400);
        assert.equal(teacher.delayFor(start), 0);
        t.mock.timers.tick(700);
        assert.ok(first.every(element => !element.removed), 'A later mention renews its own highlight and label');
        assert.equal(second.removed, false, 'The new label keeps its own duration');
        t.mock.timers.tick(300);
        assert.equal(first[1].removed, true, 'The original label expires on its renewed lease');
        assert.equal(first[0].removed, false, 'The shared square follows the newest mention');
        t.mock.timers.tick(400);
        assert.equal(second.removed, true);
        assert.deepEqual(drawer.addedShapes, []);
    } finally { teacher.clear(); }
});

test('Pena resolves natural reply moves after a descriptive recap without turning square names into moves', async () => {
    const { teachingCues } = await import('../narration.js');
    const fen = '4b1k1/8/8/8/8/8/5NP1/6K1 w - - 0 2';
    const text = 'Your Be8 moves the bishop from c6 to e8. After Be8, White could reply with g4, '
        + 'gaining kingside space and preparing the thematic g4-g5 (plan) push.';
    const cues = teachingCues(text, fen);
    assert.ok(cues.some(cue => cue.references.moves.some(([from, to]) => from === 'g2' && to === 'g4')));
    assert.ok(cues.some(cue => cue.references.plans.some(plan => plan.from === 'g4' && plan.to === 'g5')));
    assert.deepEqual(variationFrames('White could reply with Nd3.', fen).map(frame => [frame.from, frame.to]), [['f2', 'd3']]);
    assert.equal(variationFrames('It controls g4 and d3. The g4 square is weak.', fen).length, 0);
    assert.equal(variationFrames('White could reply with g5.', fen).length, 0);
    assert.deepEqual(teachingCues('Your bishop is active.', fen, undefined, { rootColor: 'b' })
        .flatMap(cue => cue.references.squares), ['e8']);
});

test('Pena grounds parenthetical pawn definitions and hyphenated features as several separate visuals', async () => {
    const { teachingCues } = await import('../narration.js');
    const fen = '4k3/8/8/4P3/3P4/2P5/8/4K3 w - - 0 1';
    const text = 'Your pawn chain (pawns protecting each other diagonally) supports a passed-pawn threat.';
    const cues = teachingCues(text, fen);
    const definition = cues.find(cue => text.slice(cue.index, cue.end).includes('protecting'));
    assert.deepEqual(definition.references.relations.map(arrow => [...arrow]).sort(), [['c3', 'd4'], ['d4', 'e5']]);
    assert.ok(cues.some(cue => cue.references.regions.some(region => region.label === 'Passed pawns')));
    assert.ok(cues.filter(cue => cue.references.regions.length).length >= 3);
    assert.ok(!teachingCues('A pawn chain (pawns protecting each other diagonally) is useful.', start)
        .some(cue => cue.references.regions.some(region => region.label === 'Pawn chain')));
    assert.deepEqual(boardRegions('An outpost is useful.', start), [], 'Do not invent a central square for an unresolved concept');
    assert.equal(teachingCues('A passed-pawn threat.', start).length, 0);
});

test('Pena pronounces SAN independently of move legality and pauses before teaching and parenthetical asides', () => {
    const text = 'Try Bxg3, then O-O or 0-0-0 (pawns protecting each other diagonally).';
    const parts = narrationParts(text, start);
    const speech = parts.map(part => part.text).join('');
    assert.match(speech, /Bishop takes G 3/i);
    assert.match(speech, /Castle kingside/i);
    assert.match(speech, /Castle queenside/i);
    assert.doesNotMatch(speech, /Bxg3|O-O|0-0/);
    assert.ok(!parts.some(part => part.cue?.references.moves.length), 'Pronunciation alone must not invent legal arrows');
    const fen = '4k3/8/8/4P3/3P4/2P5/8/4K3 w - - 0 1';
    const phrases = narrationPhrases('Your pawn chain (pawns protecting each other diagonally) is useful.', fen);
    assert.ok(phrases.find(phrase => phrase.text.includes('protecting')).pauseBefore >= 120);
    assert.ok(phrases.every(phrase => !/[()]/.test(phrase.text)));
    for(const phrase of phrases.filter(phrase => phrase.marks.length)) {
        assert.equal(phrase.marks[0].at, 0);
        assert.equal(phrase.pauseBefore, 180);
    }
});

test('Pena resolves a named attacking piece without a preceding move and includes pawn targets in double attacks', async () => {
    const { teachingCues } = await import('../narration.js');
    const fen = '4k3/8/4r3/5p2/3N4/8/8/6K1 w - - 0 1';
    const cues = teachingCues('The white knight on d4 creates a double attack on the rook and pawn.', fen);
    const fork = cues.find(cue => cue.references.regions.some(region => region.label === 'Fork'));
    assert.deepEqual(fork.references.relations.map(arrow => [...arrow]).sort(), [['d4', 'e6'], ['d4', 'f5']]);
    const threat = teachingCues('The white knight on d4 threatens the rook.', fen);
    assert.ok(threat.some(cue => cue.references.relations.some(([from, to]) => from === 'd4' && to === 'e6')));
    assert.ok(!teachingCues('The black rook on e6 threatens the king.', fen)
        .some(cue => cue.references.regions.some(region => region.label === 'Threat')));
});

test('Pena narration pronounces the app name and keeps board cues aligned', () => {
    const text = 'A.C.A.S shows your knight on g1.';
    const phrases = narrationPhrases(text, start);
    assert.match(phrases.map(phrase => phrase.text).join(' '), /\bA-CAS\b/);
    assert.doesNotMatch(phrases.map(phrase => phrase.text).join(' '), /A\.C\.A\.S/);
    assert.deepEqual(speechSegments('A-CAS shows your knight.').map(segment => segment.text),
        ['A-CAS shows your knight.']);
    const cue = phrases.find(phrase => phrase.marks.length);
    assert.ok(cue);
    assert.equal(cue.marks[0].at, 0);
    assert.match(cue.text, /knight/i);
});

test('narration keeps short clause subjects with visualized verbs instead of isolated speech clips', () => {
    for(const clause of ['it eyes', 'it also eyes', 'they guard', 'this controls', 'it attacks']) {
        const text = `Nf3 is the cleanest way to start, ${clause} d4 and e5. Nd2 does the same job from the other side.`;
        const phrases = narrationPhrases(text, start);
        assert.equal(phrases.map(phrase => phrase.text).join(' '),
            text.replace('Nf3', 'Knight to F 3').replace('Nd2', 'Knight to D 2'));
        assert.ok(phrases.some(phrase => phrase.text.startsWith(clause)), clause);
        const clips = phrases.flatMap(phrase => speechSegments(phrase.text).map(segment => segment.text.trim()));
        assert.ok(!clips.some(clip => /^(?:it|they|this)(?: also)?$/i.test(clip)), clause);
        assert.ok(phrases.some(phrase => phrase.text.startsWith(clause) && phrase.marks.length), clause);
    }
});

test('narration never leaves a lead-in word or one bare word as its own voice clip', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/2NP4/PPPBPPPP/R2QKBNR w KQkq - 0 1';
    const clipsFor = text => narrationPhrases(text, fen, text, { rootColor: 'w' })
        .flatMap(phrase => speechSegments(phrase.text, phrase.marks.map(mark => mark.at)).map(segment => segment.text.trim()));
    const shut = clipsFor('Your knight on c3 is fine, and your bishop on d2 is shut in by your own pawns, so it has no scope.');
    assert.ok(shut.some(clip => clip.startsWith('by your own pawns')), shut.join(' | '));
    for(const text of ['Your knight on c3 is fine, and your bishop on d2 is shut in by your own pawns, so it has no scope.',
        'Yes, the knight on c3 covers d5, check.', 'Your bishop pair would benefit from a more open centre.']) {
        const clips = clipsFor(text);
        assert.ok(!clips.some(clip => /\s(?:by|to|of|with|and|the|your)$/i.test(clip)), clips.join(' | '));
        assert.ok(clips.length === 1 || clips.every(clip => /\s/.test(clip)), clips.join(' | '));
    }
});

test('Pena pauses browser speech and its cue together and cancels during the pause', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
    const original = { window: globalThis.window, SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance };
    const spoken = [], marks = [];
    globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    globalThis.window = { speechSynthesis: { getVoices: () => [{ lang: 'en-US' }],
        speak: utterance => spoken.push(utterance), cancel() {} } };
    const speech = new PenaSpeech(() => {}, error => { throw error; });
    const settle = async () => { for(let i = 0; i < 12; i++) await Promise.resolve(); };
    const settings = { penaSpeech: 'browser', languageCode: 'en', penaSpeechRate: 1 };
    try {
        speech.say('The pawn chain.', settings, () => {}, [{ at: 0, run: () => marks.push(Date.now()) }],
            { pauseBefore: 180, minimumStartDelay: () => 350 });
        await settle();
        t.mock.timers.tick(349);
        await settle();
        assert.equal(spoken.length, 0);
        assert.deepEqual(marks, []);
        t.mock.timers.tick(1);
        await settle();
        assert.equal(spoken.length, 1);
        assert.deepEqual(marks, []);
        spoken[0].onstart();
        assert.deepEqual(marks, [1350]);
        spoken[0].onend();
        await speech.queue;
        speech.say('The next cue.', settings, () => {}, [], { pauseBefore: 180 });
        await settle();
        speech.stop();
        t.mock.timers.tick(180);
        await settle();
        assert.equal(spoken.length, 1, 'Cancelling a pause must not start another utterance');
    } finally { speech.stop(); Object.assign(globalThis, original); }
});

test('Pena schedules neural cue pauses on the audio timeline and waits for the previous visual before changing boards', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    const source = (await readFile(new URL('../speech.js', import.meta.url), 'utf8'))
        .split('export class PenaMicrophone')[0].replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify(new URL('../speech.js', import.meta.url).href));
    const context = vm.createContext({ setTimeout, Date, crypto, DOMException, AbortController,
        ensureVoice: async () => ({ language: 'en' }), penaText: text => text });
    const Speech = vm.runInContext(source + '\nPenaSpeech;', context);
    const starts = [], cues = [], errors = [];
    const speech = new Speech(() => {}, error => errors.push(error));
    speech.context = { get currentTime() { return Date.now() / 1000; }, destination: {},
        createBuffer: (_, length, sampleRate) => ({ duration: length / sampleRate, copyToChannel() {} }),
        createBufferSource: () => ({ connect() {}, stop() {}, start(at) { starts.push(at); } }) };
    speech.unlock = async () => {};
    speech.request = async () => ({ audio: new Float32Array(100), sampleRate: 1000 });
    const settle = async () => { for(let i = 0; i < 24; i++) await Promise.resolve(); };
    const settings = { penaSpeech: 'neural', languageCode: 'en', penaSpeechRate: 1 };
    let expiresAt = 0;
    try {
        speech.say('First cue.', settings, () => {}, [{ at: 0, run: () => { cues.push('first'); expiresAt = Date.now() + 1400; } }],
            { pauseBefore: 180 });
        speech.say('Another board.', settings, () => {}, [{ at: 0, run: () => cues.push('second') }],
            { pauseBefore: 180, minimumStartDelay: () => Math.max(0, expiresAt - Date.now()) });
        await settle();
        assert.deepEqual(errors, []);
        assert.deepEqual(starts.map(at => Math.round(at * 1000)), [200]);
        t.mock.timers.tick(0);
        await settle();
        assert.equal(starts.length, 1, 'Look-ahead must wait for the preceding cue to exist before calculating its lifetime');
        t.mock.timers.tick(200);
        await settle();
        assert.deepEqual(cues, ['first']);
        assert.equal(Math.round(starts[1] * 1000), 1600, 'The next board cannot replace an unread cue');
        speech.stop();
        t.mock.timers.tick(2000);
        await settle();
        assert.deepEqual(cues, ['first']);
        assert.deepEqual(errors, []);
    } finally { speech.stop(); }
});

test('Pena splits and pauses at sentences, quotes, colons and dashes', () => {
    const text = 'Here is the advice: "Stay calm" — keep going - be patient. Next sentence.';
    const segments = speechSegments(text);
    assert.equal(segments.map(segment => segment.text).join(''), text);
    assert.ok(segments.length >= 5);
    for(let i = 1; i < segments.length; i++)
        assert.ok(speechPause(segments[i - 1].text, segments[i].text) > 0, segments[i].text);
    for(const end of ['Look:', '"calm"', 'keep —', 'keep –', 'keep -', 'keep--',
        'Done.', 'Really?', 'Yes!', 'Wait…', 'Finished."'])
        assert.ok(speechPause(end) > 0, end);
    assert.ok(speechPause('Keep', '"going"') > 0);
    assert.deepEqual(speechSegments('A well-known move.').map(segment => segment.text), ['A well-known move.']);
    assert.equal(speechSegments('  "Wait." Then go.').map(segment => segment.text).join(''), '  "Wait." Then go.');
    const variants = 'Try “this” – or «that» -- and this--too.';
    assert.equal(speechSegments(variants).map(segment => segment.text).join(''), variants);
    assert.ok(speechSegments(variants).length > 2);
    assert.deepEqual(speechSegments('After Queen to H 6, check, F 4 blocks it.').map(segment => segment.text.trim()),
        ['After Queen to H 6, check,', 'F 4 blocks it.'], 'One bare word never becomes its own clip');
});

test('browser speech pauses between sentences without delaying the first clip', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    const original = { window: globalThis.window, SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance };
    const starts = [];
    globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    globalThis.window = { speechSynthesis: { getVoices: () => [{ lang: 'en-US' }],
        speak: utterance => { starts.push(Date.now()); utterance.onstart(); utterance.onend(); }, cancel() {} } };
    const speech = new PenaSpeech(() => {}, error => { throw error; });
    const settle = async () => { for(let i = 0; i < 24; i++) await Promise.resolve(); };
    try {
        speech.say('First line. Second line.', { penaSpeech: 'browser', languageCode: 'en', penaSpeechRate: 1 });
        await settle();
        assert.deepEqual(starts, [0]);
        t.mock.timers.tick(299);
        await settle();
        assert.deepEqual(starts, [0]);
        t.mock.timers.tick(1);
        await settle();
        assert.deepEqual(starts, [0, 300]);
    } finally { speech.stop(); Object.assign(globalThis, original); }
});

test('Pena pauses neural clips and starts board cues with their spoken words', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    const source = (await readFile(new URL('../speech.js', import.meta.url), 'utf8'))
        .split('export class PenaMicrophone')[0].replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify(new URL('../speech.js', import.meta.url).href));
    const context = vm.createContext({ setTimeout, Date, crypto, DOMException, AbortController,
        ensureVoice: async () => ({ language: 'en' }), penaText: text => text });
    const Speech = vm.runInContext(source + '\nPenaSpeech;', context);
    const starts = [], spoken = [], cues = [];
    const speech = new Speech(() => {}, error => { throw error; });
    speech.context = { get currentTime() { return Date.now() / 1000; }, destination: {},
        createBuffer: (_, length, sampleRate) => ({ duration: length / sampleRate, copyToChannel() {} }),
        createBufferSource: () => ({ connect() {}, stop() {}, start(at) { starts.push(at); } }) };
    speech.unlock = async () => {};
    speech.request = async ({ text }) => { spoken.push(text.trim()); return { audio: new Float32Array(100), sampleRate: 1000 }; };
    const text = 'Look here: the pawn moves. Then push.';
    try {
        speech.say(text, { penaSpeech: 'neural', languageCode: 'en', penaSpeechRate: 1 }, () => {},
            [{ at: text.indexOf('pawn'), run: () => cues.push(Date.now()) }]);
        for(let i = 0; i < 100; i++) { for(let j = 0; j < 24; j++) await Promise.resolve(); t.mock.timers.tick(20); }
        assert.deepEqual(spoken, ['Look here:', 'the pawn moves.', 'Then push.'], 'The article travels with its piece');
        assert.equal(cues.length, 1);
        assert.equal(cues[0], Math.round(starts[1] * 1000), 'The cue starts with the clip containing the named piece');
        assert.ok(starts[1] - starts[0] >= 0.32, 'The colon adds a pause after the first clip');
        assert.ok(starts[2] - starts[1] >= 0.399, 'The sentence boundary adds a pause');
    } finally { speech.stop(); }
});

test('stopping neural speech cancels later teaching clips and cues', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    const speech = new PenaSpeech(() => {}, error => { throw error; });
    speech.context = { get currentTime() { return Date.now() / 1000; }, destination: {},
        createBuffer: (_, length, rate) => ({ duration: length / rate, copyToChannel() {} }),
        createBufferSource: () => ({ connect() {}, stop() {}, start() {} }) };
    speech.unlock = async () => {};
    speech.request = async () => ({ audio: new Float32Array(2000), sampleRate: 1000 });
    const marks = [];
    try {
        speech.say('The knight moves and the pawn follows.', { penaSpeech: 'neural', penaSpeechRate: 2 }, () => {},
            [{ at: 4, run: () => marks.push(Date.now()) }, { at: 25, run: () => marks.push(Date.now()) }]);
        for(let i = 0; i < 100 && !marks.length; i++) {
            for(let j = 0; j < 24; j++) await Promise.resolve();
            t.mock.timers.tick(20);
        }
        assert.equal(marks.length, 1);
        const first = marks[0];
        speech.stop();
        t.mock.timers.tick(1000);
        assert.deepEqual(marks, [first]);
    } finally { speech.stop(); }
});

test('Pena reports why an answer is empty without letting removed notes override useful advice or a more specific reason', async () => {
    const source = (await readFile(new URL('../service.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')
        .replaceAll('import.meta.url', JSON.stringify(new URL('../service.js', import.meta.url).href));
    const context = vm.createContext({ localStorage: { getItem: () => null },
        setPenaText: (element, key) => { element.key = key; }, rememberCommentary: () => {} });
    vm.runInContext(source + `
        ui = { raw: {}, status: globalThis.status = {} };
        renderChecks = () => {};
        renderText = () => {};
        pena.settings = { penaCoaching: false };
        globalThis.presentAnswer = present;
    `, context);
    for(const [text, emptyReason, rejectedLine, expected] of [
        ['Useful advice remains.', null, true, ''],
        ['', 'budget', true, 'nothingNew'],
        ['', 'repeated', true, 'nothingNew'],
        ['', 'incomplete', true, 'answerLimit'],
        ['', 'withheld', true, 'heldBack'],
        ['', 'withheld', false, 'contradictsBoard']
    ]) {
        const result = { text, presentation: { emptyReason }, assessments: [{ status: 'contradicted', rejectedLine }] };
        await context.presentAnswer({ commentary: { update: () => result } }, { phase: 'complete' });
        assert.equal(context.status.key, expected, emptyReason || 'nonempty');
    }
});

test('Pena concise advice preserves why, shortens notation and skips repeated or contradictory prose', () => {
    assert.equal(explanationBody('ANALYSIS: Develop Nf3.\nBEST_MOVE: private\nEVALUATION: equal'), 'Develop Nf3.');
    assert.throws(() => explanationExcerpt('ANALYSIS: Play Nf3.'), /valid position/);
    assert.equal(explanationExcerpt('ANALYSIS: Do not capture e5 because', false, { fen: start }), '');
    const advice = 'The best move is white knight g1-f3, developing a piece and preparing to castle.';
    const text = `ANALYSIS: The position arises after 1.e4 e5 2.d4. The white pawn is on e5. ${advice} ${advice}`;
    const grounded = 'Nf3, developing a piece and preparing to castle.';
    assert.equal(explanationExcerpt(text, true, { fen: start }), grounded);
    assert.equal(explanationExcerpt(text, true, { fen: start, previous: [grounded] }), '');
    assert.equal(explanationExcerpt('ANALYSIS: The best move is e2-e5 because it wins a queen.', true, { fen: start }), '');
    assert.match(explanationExcerpt('ANALYSIS: Do not play e2-e4 because it loses the queen.', true, { fen: start }), /Do not play e4 because/);
    const different = explanationExcerpt('The best move is Nc3 because it wins a queen.', true, { fen: start, previous: [grounded] });
    assert.match(different, /Nc3/);
    assert.match(different, /because it wins a queen/);
});

test('Pena streams an unchanged recommendation with its reason before generation finishes', () => {
    const text = 'ANALYSIS: The best move is 2...white knight g1-f3, developing a piece and preparing to castle. '
        + 'The white queen is on e4. White is to move. The white bishop is on f1. '
        + 'The best move is white pawn e2-e4, controlling the whole board.\nBEST_MOVE: white knight g1-f3';
    const stream = new CommentaryStream({ fen: start });
    let previous = '';
    let firstAt = 0;
    for(let length = 1; length <= text.length; length++) {
        const result = stream.update(text.slice(0, length));
        assert.ok(result.text.startsWith(previous), `Rewrote already emitted words at character ${length}`);
        if(!firstAt && result.text) firstAt = length;
        previous = result.text;
    }
    const result = stream.update(text, true);
    assert.ok(firstAt > text.indexOf('castle.') && firstAt < text.indexOf('BEST_MOVE:'));
    assert.match(result.text, /preparing to castle/);
    assert.doesNotMatch(result.text, /whole board|queen is on e4|2\.\.\./);
    assert.ok(result.assessments.some(item => item.status === 'contradicted'));
    assert.equal(result.text, new CommentaryStream({ fen: start }).update(text, true).text);
    assert.equal(sourceSentences('The best move is 2...Nf3, about 0.25 pawns better. Next', false).length, 1);
});

test('Pena swaps a pick that allows mate in one for a guarding move and keeps the rest of its line quiet', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3';
    const raw = 'ANALYSIS:\nThe best move is 3...black knight g8-f6, developing the knight with tempo on the queen. '
        + 'After 4.white queen h5-f7 the game is over.\n\nBEST_MOVE: ';
    const result = new CommentaryStream({ fen, mode: 'dynamic' }).update(raw, true);
    assert.equal(result.text, 'Nh6, guarding f7. The tempting alternative Nf6 runs into Qxf7#, which is checkmate.');
    assert.equal(result.assessments.find(item => item.blunder).mainMove, 'g8h6');
    // A gambit that only drops material is still Pena's call, as Stockfish rates many of those as fine.
    assert.equal(checkSentence('The best move is Nf6, developing with tempo.',
        'rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2').blunder, undefined);
    assert.equal(checkSentence('The best move is g6, chasing the queen.', fen).blunder, undefined);
});

test('Pena factuality checks distinguish contradictions, unchecked claims and precise board facts', () => {
    assert.equal(checkSentence('The white bishop is on f1.', start).status, 'verified');
    assert.equal(checkSentence('The white bishop is not on f1.', start).status, 'contradicted');
    assert.equal(checkSentence('Black is to move.', start).status, 'contradicted');
    assert.equal(checkSentence('The white bishop on f1 attacks d3.', start).status, 'contradicted');
    assert.equal(checkSentence('The white knight on g1 attacks f3.', start).text, 'The white knight on g1 attacks f3.');
    assert.equal(checkSentence('The white knight is on g1, so White has a forced win.', start).status, 'unchecked');
    assert.equal(checkSentence('The best move is white bishop g1-f3.', start).status, 'contradicted');
    assert.equal(checkSentence('The best move is e2-e4, then e7-e3.', start).status, 'contradicted');
    assert.doesNotMatch(checkSentence('The best move is e2-e4, delivering checkmate.', start).text, /checkmate/);
    assert.equal(checkSentence('The best move is e4.', start).text, 'e4.');
    const trimmed = checkSentence('The best move is Nf3 where it controls e5 and h8.', start);
    assert.notEqual(trimmed.status, 'contradicted');
    assert.doesNotMatch(trimmed.text, /h8/);
    const alternatives = checkSentence('The candidate e2-e4, instead the best move is d2-d4.', start, { allowLine: true });
    assert.match(alternatives.text, /candidate e4, instead.*d4/);
    assert.doesNotMatch(alternatives.text, /Illustrative legal line|Pena suggests/);
});

test('Pena explains the central break instead of filling brief advice with legal alternatives', () => {
    const board = new Chess(start);
    board.move('e4');
    const text = 'White has a pawn in the center. Black is to move. Black needs to develop. '
        + 'The best move is black pawn d7-d5, challenging the center and opening the diagonal for the c8 bishop. '
        + 'This forces White to decide whether to exchange or maintain the central tension. '
        + 'Another candidate is c7-c6, preparing d5. Another candidate is e7-e6, supporting d5.';
    const advice = explanationExcerpt(text, true, { fen: board.fen() });
    assert.equal(advice, 'd5, challenging the center and opening the diagonal for the c8 bishop.');
    const dynamic = explanationExcerpt(text, true, { fen: board.fen(), mode: 'dynamic' });
    assert.match(dynamic, /This forces White/);
    assert.ok(dynamic.length > advice.length);
    assert.doesNotMatch(advice, /Legal option|back rank|c6|e6/);
    assert.deepEqual(variationFrames(advice, board.fen()).map(frame => frame.san), ['d5']);
    assert.deepEqual(narrationParts(advice, board.fen()).find(part => part.cue)?.cue.references.moves, [['d7', 'd5']]);
    const full = explanationExcerpt(text, true, { fen: board.fen(), mode: 'original' });
    assert.match(full, /Another candidate is c6/);
});

test('Pena recognizes file descriptions without losing the actual move or its continuation', () => {
    const fen = '3q1rk1/2p2ppp/2p2b2/1r1Pp3/6b1/2PP1N2/P4PPP/RN1Q1RK1 b - - 0 15';
    const source = 'The best move is black rook b5 takes white pawn d5, placing the rook on the open d8-d1.';
    assert.equal(checkSentence(source, fen).text, 'Rxd5, placing the rook on the open d-file.');
    assert.deepEqual(variationFrames(source, fen).map(frame => frame.san), ['Rxd5']);
    const full = 'The position arises after 1.e4 e7 2.e4. Play d6, preparing the center. '
        + 'One reply is Nf3. Continue with Nf6.';
    const afterE4 = new Chess(start);
    afterE4.move('e4');
    assert.deepEqual(variationFrames(full, afterE4.fen()).map(frame => frame.san), ['d6', 'Nf3', 'Nf6']);
    assert.equal(checkSentence('Play e2-e5.', start).status, 'contradicted');
    const broken = 'The best move is Nf3, preparing to castle. The opponent responds with e7-e3. '
        + 'The player then plays b1-c3. This continues the attack.';
    assert.equal(explanationExcerpt(broken, true, { fen: start }), 'Nf3, preparing to castle.');
});

test('Pena checks discussed variations rather than falsely rejecting future piece placements', () => {
    const context = 'The best move is e2-e4, opening lines for the bishop. ';
    const point = 'The white pawn on e4 controls d5.';
    assert.equal(checkSentence(point, start).status, 'contradicted');
    assert.equal(checkSentence(point, start, { context }).text, point);
    assert.equal(checkSentence('After the pawn advances, the bishop on d3 would aim at h7.', start).status, 'unchecked');
    assert.equal(checkSentence('The c1-h6 diagonal may become useful.', start).status, 'unchecked');
    assert.equal(checkSentence('The bishop can work along the f1-a6 diagonal.', start).status, 'unchecked');
    assert.equal(checkSentence('The rook can operate along the a1-a8.', start).text,
        'The rook can operate along the a-file.');
    const conditionalFen = 'rnbqkb1r/5ppp/p2ppn2/1p6/3NP3/2N2B2/PPP2PPP/R1BQ1RK1 b kq - 1 8';
    assert.equal(checkSentence('If 8...Bb7, then 9.e5 is possible.', conditionalFen,
        { context: 'The candidate is a8-a7. ' }).status, 'unchecked');
    const answer = explanationExcerpt(context + point, true, { fen: start, mode: 'dynamic' });
    assert.match(answer, /opening lines.*pawn on e4 controls d5/);
    const castleFen = 'rnbq1r1k/ppp1bpp1/4pn1p/3p4/3P4/2PBPNBP/PPQN1PP1/R3K2R w KQ - 0 13';
    const castleContext = 'The best move is white king e1-g1. This candidate keeps central options open. ';
    const follow = 'After 13.black pawn c7-c5, respond with 13...white pawn d4 takes black pawn c5, creating a white pawn on c5.';
    assert.equal(checkSentence(follow, castleFen, { context: castleContext }).status, 'unchecked');
    assert.match(checkSentence(follow, castleFen, { context: castleContext }).text, /c5.*dxc5/);
    assert.equal(checkSentence('The best move is e2-e4, capturing the queen.', start).status, 'contradicted');
    assert.equal(checkSentence('The best move is Nf3, giving check.', start).status, 'contradicted');
    assert.equal(checkSentence('The best move is Nf3#.', start).status, 'contradicted');
    assert.equal(checkSentence('The best move is e2-e4+.', start).status, 'contradicted');
    assert.equal(checkSentence('The white pawn is on e5.', start,
        { context: 'The best move is e2-e5. ' }).status, 'unchecked');
    const pawnClaim = 'The best move is e4-f5, creating a passed white pawn on f5.';
    const trimmedPawnClaim = checkSentence(pawnClaim, '4k3/8/4p3/5p2/4P3/8/8/4K3 w - - 0 1');
    assert.equal(trimmedPawnClaim.status, 'unchecked');
    assert.doesNotMatch(trimmedPawnClaim.text, /passed/);
    assert.match(trimmedPawnClaim.text, /exf5/);
    assert.equal(checkSentence(pawnClaim, '4k3/8/8/5p2/4P3/8/8/4K3 w - - 0 1').status, 'unchecked');
    const captureFen = '4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1';
    assert.equal(checkSentence('The best move is white pawn e4 takes black bishop d5.', captureFen).status, 'contradicted');
    assert.equal(checkSentence('The best move is e4-d5, capturing the black queen on d5.', captureFen).status, 'unchecked');
    const threatFen = 'rn2kb1r/pp3ppp/2p2n2/1q2p3/4P1b1/1B1P1P2/PPPB2PP/RN1QK1NR w KQkq - 3 8';
    assert.equal(checkSentence('The best move is f3-g4, removing the immediate threat to the white pawn on f3.',
        threatFen).status, 'unchecked');
    assert.equal(checkSentence('The black bishop on e2 directly attacks the white king on e1.',
        '2kr2nr/1pp2ppp/p1p5/8/1b2P3/2N1B3/PPP1bPPP/R3K2R w KQ - 0 11').status, 'contradicted');
    const disconnected = 'The best move is e4-f5, creating a passed white pawn on f5. '
        + 'Black responds with e6-f5. The black pawn is on f5.';
    const disconnectedResult = new CommentaryStream({ fen: '4k3/8/4p3/5p2/4P3/8/8/4K3 w - - 0 1' })
        .update(disconnected, true);
    assert.equal(disconnectedResult.text, 'exf5.');
});

test('Pena omits dangling reasoning and unfinished generated tails without erasing its main explanation', () => {
    const source = 'The best move is Nf3, preparing to castle. The white queen is on e4. '
        + 'This wins material. The knight can later contest the center. It also helps because';
    const result = new CommentaryStream({ fen: start, mode: 'dynamic' }).update(source, true, { truncated: true });
    assert.match(result.text, /preparing to castle.*contest the center/);
    assert.doesNotMatch(result.text, /queen is on e4|This wins|helps because/);
    const repeated = 'The best move is Nf3, preparing to castle. '.repeat(2)
        + 'It also contests the central squares.';
    assert.equal(explanationExcerpt(repeated, true, { fen: start, mode: 'dynamic' }),
        'Nf3, preparing to castle. It also contests the central squares.');
    const positional = 'The aim is to keep the center closed. This gives time to prepare a kingside attack.';
    assert.equal(explanationExcerpt(positional, true, { fen: start, mode: 'dynamic' }), positional);
});

test('Pena plans stay faint and distinct from legal moves, and only legal notation becomes SAN', () => {
    const text = 'Preparing the natural ...white bishop f1-d3 development.';
    const plans = plannedMoves(text, start);
    assert.deepEqual(plans.map(plan => [plan.from, plan.to]), [['f1', 'd3']]);
    assert.equal(variationFrames(text, start).length, 0);
    assert.equal(plannedMoves('Preparing the white knight f1-d3 development.', start).length, 0);
    assert.equal(plannedMoves('Preparing the white bishop f1-d4 development.', start).length, 0);
    assert.match(normalizeNotation(text, start), /Bf1-d3 \(plan\)/);
    assert.equal(normalizeNotation(normalizeNotation(text, start), start), normalizeNotation(text, start));
    assert.equal(normalizeNotation('It prepares...black pawn e7-e5.', '8/4p3/8/8/8/8/8/K6k w - - 0 1'), 'It prepares ...e7-e5 (plan).');
    assert.equal(normalizeNotation('The best move is white knight g1-f3.', start), 'The best move is Nf3.');
    const captureFen = '4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1';
    assert.equal(normalizeNotation('white pawn e4 takes black queen d5.', captureFen), 'exd5.');
    const promotionFen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
    const decoded = decodeExplanation('<PIECE_MP><SQUARE_49><SQUARE_57><PIECE_MN>', 'w');
    assert.equal(normalizeNotation(decoded, promotionFen), 'a8=N');
    assert.match(checkSentence(`The best move is ${decoded}.`, promotionFen).text, /a8=N/);
    assert.match(checkSentence('The best move is a8=N.', promotionFen).text, /a8=N/);
    assert.match(narrationParts('Pena suggests a8=N.', promotionFen).find(part => part.cue).text, /knight/i);
    const grounded = checkSentence(text, start);
    assert.match(grounded.text, /Bf1-d3 \(plan\)/);
    const parts = narrationParts(grounded.text, start);
    assert.ok(parts.find(part => part.cue?.references.plans.length && part.text.startsWith('bishop f1 to d3')));
    assert.doesNotMatch(parts.map(part => part.text).join(' '), /\(plan\)/i);
    assert.match(grounded.text, /\(plan\)/, 'The visual plan label must remain in the displayed explanation');
    assert.equal(narrationParts('A future idea (plan) is worth considering.', start).map(part => part.text).join(''),
        'A future idea is worth considering.');
});

test('Pena narration puts move and square cues at the start of their own audible chunks', async () => {
    const parts = narrationParts('Pena suggests Nf3. Look at e4 and the kingside.', start);
    assert.equal(parts[0].cue, null);
    assert.match(parts[1].text, /^knight/i);
    assert.deepEqual(parts[1].cue.references.moves, [['g1', 'f3']]);
    assert.equal(parts[2].text.trim(), 'Look at e4', 'A short opener and its preposition travel with the square');
    assert.deepEqual(parts[2].cue.references.squares, ['e4']);
    assert.equal(parts[3].text.trim(), 'and the kingside.', 'Stranded link words join the phrase they lead into');
    assert.equal(parts[3].cue.references.regions[0].label, 'Kingside');
    assert.equal(variationFrames('Illustrative legal line: e4 e5 Nf3 Nc6.', start).length, 4);
    const attack = narrationParts('The white knight on g1 geometrically attacks f3.', start);
    assert.deepEqual(attack.find(part => part.text.startsWith('f3')).cue.references.relations, [['g1', 'f3']]);
    const future = narrationParts('From f3, it geometrically attacks e5.', start);
    assert.deepEqual(future.find(part => part.text.startsWith('e5')).cue.references.relations, []);
    const original = { window: globalThis.window, SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance };
    const spoken = [], events = [];
    globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    globalThis.window = { speechSynthesis: { getVoices: () => [{ lang: 'en-US' }],
        speak(utterance) { spoken.push(utterance); }, cancel() {} } };
    const speech = new PenaSpeech(() => {}, error => { throw error; });
    try {
        speech.say(parts[1].text, { penaSpeech: 'browser', languageCode: 'en', penaSpeechRate: 1 }, () => events.push('move'));
        await Promise.resolve(); await Promise.resolve();
        assert.deepEqual(events, []);
        spoken[0].onstart();
        assert.deepEqual(events, ['move']);
        spoken[0].onend();
        speech.stop();
        await speech.queue;
        spoken[0].onstart();
        assert.equal(events.length, 1, 'Cancelled audio must not redraw stale cues');
    } finally { speech.stop(); Object.assign(globalThis, original); }
});

test('Pena dynamic mode expands only for a checked tactical move or check', () => {
    const startStream = new CommentaryStream({ fen: start, mode: 'dynamic' });
    assert.equal(startStream.update('The best move is Nf3, winning the queen.', true).expanded, false);
    const captureFen = '4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1';
    assert.equal(new CommentaryStream({ fen: captureFen, mode: 'dynamic' })
        .update('The best move is e4-d5.', true).expanded, true);
    const points = ['White is to move.', 'The white bishop is on f1.', 'The white king is on e1.',
        'The white knight is on g1.', 'The white rook is on h1.', 'The black rook is on h8.'].join(' ');
    const brief = new CommentaryStream({ fen: start }).update(points, true);
    const dynamic = new CommentaryStream({ fen: start, mode: 'original' }).update(points, true);
    assert.equal(sourceSentences(brief.text).length, 1);
    assert.equal(sourceSentences(dynamic.text).length, 6);
    assert.ok(dynamic.text.split(/\s+/).length <= 180);
});

test('Pena factual move notes verify captures and promotions without inferring strategic strength', () => {
    assert.deepEqual(moveFacts(start, 'e2e4'), { san: 'e4', effects: ['It places a pawn in the center.'] });
    assert.deepEqual(moveFacts('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1', 'e4d5').effects,
        ['It captures the black queen.']);
    assert.deepEqual(moveFacts('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a7a8q').effects,
        ['It gives check.', 'It promotes to a queen.']);
});

test('Pena regions have chess coordinates independent of orientation and attack lines use actual geometry', () => {
    const regions = boardRegions('Queenside, kingside, center and the e-file.', start);
    assert.equal(regions.find(region => region.label === 'Queenside').squares.length, 32);
    assert.ok(regions.find(region => region.label === 'Queenside').squares.every(square => square[0] <= 'd'));
    assert.deepEqual(regions.find(region => region.label === 'Center').squares, ['d4', 'e4', 'd5', 'e5']);
    assert.equal(boardRegions('The a1-h8 diagonal and 7th rank.', start)[0].squares.length, 8);
    assert.deepEqual(boardReferences('The knight attacks e4.', start).relations, []);
    const board = new Chess();
    board.move('Nf3');
    assert.ok(boardReferences('The knight attacks e5.', board.fen()).relations.some(([from, to]) => from === 'f3' && to === 'e5'));
});

test('Pena teaches the screenshot long diagonal in the bishop continuation, with arrows for every move', () => {
    const fen = 'rnbqk2r/pppp1ppp/5n2/4B3/1b6/5N2/P1PPPPPP/RN1QKB1R b KQkq - 3 4';
    const text = 'O-O, castling to safety and connecting the rooks. One reply is Bb2, '
        + 'retreating the bishop to the long diagonal where it supports the queenside. '
        + 'Continue with d5. White continues with e3, preparing Bf1-e2 (plan).';
    const parts = narrationParts(text, fen);
    const diagonal = parts.find(part => part.text.startsWith('to the long diagonal'));
    assert.ok(diagonal, 'The phrase itself must trigger a timed cue');
    assert.deepEqual(diagonal.cue.references.regions.map(region => region.label), ['Long diagonal a1-h8']);
    assert.deepEqual([...diagonal.cue.references.regions[0].squares].sort(),
        ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8']);
    const moveParts = parts.filter(part => part.cue?.references.moves.length);
    assert.deepEqual(moveParts.flatMap(part => part.cue.references.moves),
        [['e8', 'g8'], ['h8', 'f8'], ['e5', 'b2'], ['d7', 'd5'], ['e2', 'e3']]);
    assert.ok(parts.some(part => part.cue?.references.plans.some(plan => plan.from === 'f1' && plan.to === 'e2')));
    assert.ok(parts.some(part => part.cue?.references.regions.some(region => region.label === 'King shelter')));
    assert.ok(parts.some(part => part.cue?.references.regions.some(region => region.label === 'Rooks working together')));
    assert.doesNotMatch(parts.map(part => part.text).join(' '), /\(plan\)/);
    const shapes = [];
    const instance = { currentFen: fen, BoardDrawer: { addedShapes: [], createShape(type, square, config) {
        shapes.push({ type, square, config });
        return { remove() {} };
    } } };
    const teacher = new PenaTeacher(instance);
    try {
        teacher.show(text, fen, { references: diagonal.cue.references });
        assert.equal(shapes.filter(shape => shape.type === 'rectangle').length, 8);
        assert.ok(shapes.some(shape => shape.type === 'text' && shape.config.text === 'Long diagonal a1-h8'));
        shapes.length = 0;
        const reply = moveParts.find(part => part.cue.references.moves.some(([from]) => from === 'e5'));
        teacher.show(text, fen, { references: reply.cue.references });
        assert.ok(shapes.some(shape => shape.type === 'arrow' && shape.square.join('-') === 'e5-b2'));
        assert.ok(shapes.some(shape => shape.type === 'text' && shape.config.text === 'Line: Bb2'));
    } finally { teacher.clear(); }
});

test('Pena resolves terminology without guessing one of two possible long diagonals', () => {
    const both = boardRegions('the long diagonal', start);
    assert.equal(both.length, 2);
    assert.deepEqual(boardRegions('the light-squared diagonal', start).map(region => region.label), ['Long diagonal h1-a8']);
    assert.deepEqual(boardRegions('the dark-squared diagonal', start).map(region => region.label), ['Long diagonal a1-h8']);
    const text = 'e4, opening the diagonal for the f1 bishop.';
    assert.ok(narrationParts(text, start).some(part => part.cue?.references.regions
        .some(region => region.label.startsWith('Diagonal ') && region.squares.includes('a6'))));
    assert.equal(boardRegions('The bishop diagonal from d4.', start).length, 2);
    assert.deepEqual(variationFrames('e4 is a central square.', start), Object.assign([], { incomplete: false }));
    assert.ok(narrationParts('Nf3, controlling e5.', start).some(part => part.cue?.references.relations
        .some(([from, to]) => from === 'f3' && to === 'e5')));
    const future = narrationParts('Nf3 Nf6, controlling e4.', start);
    assert.ok(future.some(part => part.cue?.references.relations.some(([from, to]) => from === 'f6' && to === 'e4')));
    assert.ok(!narrationParts('Nf3, attacking e4.', start)
        .some(part => part.cue?.references.relations.length));
    const fen = '4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1';
    assert.deepEqual(variationFrames('Castle kingside, securing the king.', fen).map(frame => frame.san), ['O-O']);
    assert.deepEqual(narrationParts('Castle kingside, securing the king.', fen)
        .find(part => part.cue?.references.moves.length).cue.references.moves, [['e1', 'g1'], ['h1', 'f1']]);
    const development = narrationParts('Nf3, developing a piece and supporting the center.', start);
    assert.ok(development.some(part => part.cue?.references.regions.some(region => region.label === 'Active piece'
        && region.squares.includes('f3'))));
});

test('Pena brief mode keeps one short rationale while dynamic mode retains supporting explanation', () => {
    const source = 'The best move is Nf3, developing the knight and preparing to castle. '
        + 'This keeps the central pawn breaks flexible. The knight also contests e5.';
    const brief = explanationExcerpt(source, true, { fen: start });
    const dynamic = explanationExcerpt(source, true, { fen: start, mode: 'dynamic' });
    assert.equal(brief, 'Nf3, developing the knight and preparing to castle.');
    assert.equal(sourceSentences(dynamic).length, 3);
    assert.ok(brief.split(/\s+/).length <= 45);
    assert.doesNotMatch(brief, /^Play\b/);
    const oversized = 'The best move is Nf3, developing the knight to support the central pawn breaks, '
        + 'while keeping the entire position flexible and avoiding any early commitments that might '
        + 'otherwise let the opponent gain time by attacking the queen or forcing an unwanted exchange '
        + 'before the king can find a safe square.';
    const concise = explanationExcerpt(oversized, true, { fen: start });
    assert.equal(concise, 'Nf3, developing the knight to support the central pawn breaks.');
    const stream = new CommentaryStream({ fen: start });
    let previous = '';
    for(let length = 1; length <= oversized.length; length++) {
        const next = stream.update(oversized.slice(0, length)).text;
        assert.ok(next.startsWith(previous));
        previous = next;
    }
    assert.equal(stream.update(oversized, true).text, concise);
    const fallback = 'The position is ' + 'very '.repeat(46) + 'complex. The open file gives the rook more activity.';
    assert.equal(explanationExcerpt(fallback, true, { fen: start }), 'The open file gives the rook more activity.');
});

test('Pena opening advice drops invented history and false pawn shapes but keeps the move', () => {
    const start = new Chess().fen();
    const source = 'The position arises after 1.e4 e5 2.d4, a symmetrical structure. '
        + 'The best move is white pawn d2-d4, immediately challenging the center and establishing a solid pawn duo on d4 and e4.';
    const brief = new CommentaryStream({ fen: start, mode: 'brief' }).update(normalizeNotation(source, start), true);
    assert.equal(brief.text, 'd4, immediately challenging the center.');
    const italian = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    const line = normalizeNotation('The best move is 4...white pawn d2-d3, preparing the...white pawn d3-d4 advance. '
        + 'After the reply 5.black knight g8-f6, preparing to castle, the player should castle with 5...white king e1-g1.', italian);
    assert.match(line, /d3, preparing the d3-d4 \(plan\) advance/);
    assert.match(line, /castle with O-O\./);
    const black = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const plan = normalizeNotation('The best move is black pawn d7-d6, preparing the thematic...black pawn e7-e5 break.', black);
    assert.match(plan, /the thematic \.\.\.e7-e5 \(plan\) break/);
    assert.equal(normalizeNotation(plan, black), plan);
});

test('Pena full advice preserves recommendation boundaries without a spoken Play lead-in', () => {
    const board = new Chess();
    board.move('e4');
    const source = 'The position arises after 1.e4 e5. '
        + 'The best move is black pawn e7-e5, challenging the center. '
        + 'White continues with Nf3, developing a piece.';
    const result = explanationExcerpt(source, true, { fen: board.fen(), mode: 'original' });
    assert.match(result, /^e5, challenging the center\./);
    assert.doesNotMatch(result, /arises after/);
    assert.doesNotMatch(result, /\bPlay\b/);
    assert.deepEqual(variationFrames(result, board.fen()).map(frame => frame.san), ['e5', 'Nf3']);
    assert.equal(variationFrames(result, board.fen()).incomplete, false);
});

test('Pena future positions replay legal moves and stop an invalid branch without inventing a repair', () => {
    const frames = variationFrames('1. e4 e5 2. Nf3 Nc6.', start);
    assert.equal(frames.length, 4);
    assert.equal(new Chess(frames[3].fen).get('c6').type, 'n');
    assert.equal(new Chess(frames[3].fen).get('b8'), null);
    assert.equal(variationFrames('e2-e5, then Nf6 and e2-e4.', start).length, 0);
    const board = new Chess();
    board.move('e4'); board.move('d5');
    assert.equal(variationFrames('white pawn e4 takes black pawn d5.', board.fen())[0].san, 'exd5');
});

test('Pena questions use legally replayed history, reject a wrong turn and expose missing history', () => {
    const board = new Chess();
    board.move('e4');
    const history = [{ fen: { full: start } }, { fen: { full: board.fen() }, boardChanges: { from: 'e2', to: 'e4' } }];
    const position = penaPosition(board.fen(), history);
    assert.equal(position.warning, '');
    assert.deepEqual(readPenaPosition(position.command, board.fen()).history, [start]);
    assert.throws(() => readPenaPosition(position.command, board.fen().replace(' b ', ' w ')), /wrong turn/);
    const warning = console.warn;
    console.warn = () => {};
    try {
        const unavailable = penaPosition(board.fen(), [{ ...history[0], historyIncomplete: true }, history[1]]);
        assert.match(unavailable.warning, /turn cannot be independently confirmed/);
        assert.deepEqual(readPenaPosition(unavailable.command).history, []);
    } finally { console.warn = warning; }
});

test('Pena settings are global and ignore retired reply-mode, language and personality preferences', async () => {
    const settings = { penaReplyMode: 'balanced', penaLanguage: 'fi', penaLanguageQuality: 'quality',
        penaTone: 'playful', penaInputLanguage: 'fi', penaSpeechRate: 1.2 };
    const reads = [];
    const original = globalThis.GET_GM_CFG_BASE_VALUE;
    globalThis.GET_GM_CFG_BASE_VALUE = async (key, instanceID, profileID) => {
        reads.push(profileID);
        return settings[key] ?? null;
    };
    try {
        const result = await getPenaPreferences('instance-1');
        assert.equal(result.penaReplyMode, undefined);
        assert.equal(result.languageCode, 'en');
        assert.equal(result.penaSpeechRate, 1.2);
        assert.equal(result.penaEnabled, false);
        assert.equal(result.penaLanguageQuality, undefined);
        assert.ok(reads.every(profileID => profileID === false));
        settings.penaReplyMode = 'original';
        assert.equal((await getPenaPreferences()).penaReplyMode, undefined);
    } finally { globalThis.GET_GM_CFG_BASE_VALUE = original; }
});

test('Pena reacts to your own played move against its previous pick', () => {
    const before = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    const after = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N1P/PPPP1PP1/RNBQKB1R b KQkq - 0 3';
    const played = findPlayedMove(before, after);
    assert.equal(played.san, 'h3');
    assert.equal(findPlayedMove(before, before), null);
    assert.equal(questionLead(moveIntent(before, played, { yours: true, bestMove: 'f1b5' })),
        'Your h3 is possible, but Pena preferred Bb5.');
    assert.equal(questionLead(moveIntent(before, played, { yours: true, bestMove: 'h2h3' })),
        "Nice, h3 was Pena's pick too.");
    assert.equal(moveIntent(before, { from: 'h2', to: 'h5' }, { yours: true }), null);
});

test('Pena loads English voice choices automatically, shares downloads, reuses cache and retries failed files', async () => {
    const original = { caches: globalThis.caches, fetch: globalThis.fetch, confirm: globalThis.confirm };
    const stored = new Map();
    const path = 'en/en_US/ljspeech/high/en_US-ljspeech-high.onnx';
    const entry = { name: 'LJ Speech', language: { code: 'en_US' }, files: { [path]: {} } };
    const catalogue = { [DEFAULT_VOICE]: entry, finnish: { ...entry, language: { code: 'fi_FI' } } };
    const requests = [];
    let fail = false;
    let approvals = 0;
    globalThis.caches = { open: async () => ({
        match: async url => stored.has(url) ? new Response(stored.get(url)) : undefined,
        put: async (url, response) => stored.set(url, await response.text()),
        delete: async url => stored.delete(url)
    }) };
    globalThis.fetch = async (url, options) => {
        options?.signal?.throwIfAborted();
        requests.push(url);
        if(fail && url.endsWith('.onnx')) return new Response('Unavailable', { status: 503 });
        return new Response(url.endsWith('voices.json') ? JSON.stringify(catalogue) : 'fixture');
    };
    globalThis.confirm = () => { approvals++; return true; };
    try {
        assert.deepEqual(Object.keys(await voiceCatalogue()), [DEFAULT_VOICE]);
        const controller = new AbortController();
        const cancelled = ensureVoice(DEFAULT_VOICE, { signal: controller.signal });
        const shared = ensureVoice(DEFAULT_VOICE);
        controller.abort();
        await assert.rejects(cancelled, { name: 'AbortError' });
        const voice = await shared;
        assert.equal(voice.model, PIPER_BASE + path);
        assert.equal(requests.filter(url => url.endsWith('.onnx')).length, 1);
        assert.equal(approvals, 1);
        const before = requests.length;
        assert.deepEqual(await ensureVoice(DEFAULT_VOICE), voice);
        assert.equal(requests.length, before);
        stored.delete(voice.model);
        fail = true;
        await assert.rejects(ensureVoice(DEFAULT_VOICE), /HTTP 503/);
        fail = false;
        assert.deepEqual(await ensureVoice(DEFAULT_VOICE), voice);
    } finally { Object.assign(globalThis, original); }
});

test('Pena rejects non-English voice imports before caching files', async () => {
    const config = { espeak: { voice: 'fi' }, language: { code: 'fi_FI' },
        audio: { sample_rate: 22050 }, phoneme_id_map: { a: [1] } };
    await assert.rejects(importVoice([new File(['fixture'], 'voice.onnx'),
        new File([JSON.stringify(config)], 'voice.onnx.json'), new File(['terms'], 'MODEL_CARD')]),
    /English voice packs only/);
});

const microphoneWorkletSource = await readFile(new URL('../microphone-worklet.js', import.meta.url), 'utf8');

function microphoneProcessor(sampleRate = 16000, onMessage = () => {}, segment = true) {
    let Processor;
    const messages = [];
    const emit = data => { messages.push(data); onMessage(data); };
    const segments = new SpeechSegments(emit, false, { pauseMs: 800 });
    const classifyFixture = audio => audio.some(sample => Math.abs(sample) > 0.02) ? 0.95 : 0.01;
    vm.runInNewContext(microphoneWorkletSource, {
        sampleRate, Float32Array,
        AudioWorkletProcessor: class { constructor() {
            this.port = { postMessage: data => {
                if(segment) segments.accept(data.audio, classifyFixture(data.audio));
                else emit(data);
            } };
        } },
        registerProcessor: (name, processor) => { assert.equal(name, 'pena-microphone'); Processor = processor; }
    });
    const processor = new Processor();
    let cursor = 0;
    return {
        messages,
        feed(seconds, amplitude = 0) {
            let remaining = Math.round(seconds * sampleRate);
            while(remaining > 0) {
                const count = Math.min(128, remaining);
                const input = Float32Array.from({ length: count }, () =>
                    amplitude * Math.sin(2 * Math.PI * 220 * cursor++ / sampleRate));
                const output = new Float32Array(count).fill(1);
                assert.equal(processor.process([[input]], [[output]]), true);
                assert.equal(output.some(Boolean), false);
                remaining -= count;
            }
        }
    };
}

test('Pena continuous microphone rejects silence and brief classifier spikes', () => {
    const capture = microphoneProcessor();
    capture.feed(2);
    capture.feed(2, 0.002);
    for(const duration of [0.02, 0.1, 0.2]) {
        capture.feed(duration, 0.08);
        capture.feed(1);
    }
    for(let i = 0; i < 40; i++) {
        capture.feed(0.02, 0.08);
        capture.feed(0.1);
    }
    capture.feed(1);
    assert.deepEqual(capture.messages, []);
    capture.feed(0.5, 0.08);
    capture.feed(0.82);
    assert.equal(capture.messages.filter(message => message.type === 'utterance').length, 1);
});

test('Pena continuous microphone segments successive utterances by audio samples, not tab timers', () => {
    for(const sampleRate of [16000, 48000]) {
        const capture = microphoneProcessor(sampleRate);
        capture.feed(0.5);
        capture.feed(0.4, 0.08);
        capture.feed(0.4);
        capture.feed(0.4, 0.08);
        capture.feed(0.78);
        assert.deepEqual(capture.messages.map(message => message.type), ['speech']);
        capture.feed(0.1);
        assert.deepEqual(capture.messages.map(message => message.type), ['speech', 'utterance']);
        const first = capture.messages[1];
        assert.equal(first.sampleRate, 16000);
        assert.ok(first.audio instanceof Float32Array);
        assert.ok(Math.abs(first.audio.length / first.sampleRate - 1.5) < 0.1);
        assert.ok(first.audio.some(sample => Math.abs(sample) > 0.05));
        capture.feed(0.45, 0.06);
        capture.feed(0.88);
        assert.deepEqual(capture.messages.map(message => message.type), ['speech', 'utterance', 'speech', 'utterance']);
    }
});

test('Pena continuous microphone has no fixed recording cap and stays ready after a long utterance', () => {
    const capture = microphoneProcessor();
    capture.feed(21, 0.08);
    assert.deepEqual(capture.messages.map(message => message.type), ['speech']);
    capture.feed(0.88);
    assert.ok(capture.messages[1].audio.length > 21 * 16000);
    capture.feed(0.4, 0.08);
    capture.feed(0.88);
    assert.equal(capture.messages.filter(message => message.type === 'utterance').length, 2);
});

test('Pena continuous microphone previews are early, bounded, independently owned and tied to the final utterance', () => {
    const messages = [];
    const segments = new SpeechSegments(message => messages.push(message), true, { pauseMs: 800 });
    for(let i = 0; i < 140; i++) segments.accept(new Float32Array(512).fill(i + 1), 0.99);
    const previews = messages.filter(message => message.type === 'preview');
    assert.ok(previews.length > 3);
    assert.ok(previews[0].endSample <= 16000 * 0.55);
    assert.ok(previews.every(preview => preview.audio.length <= 16000 * 2.5));
    assert.equal(messages.some(message => message.type === 'utterance'), false);
    previews[0].audio.fill(-1);
    for(let i = 0; i < 25; i++) segments.accept(new Float32Array(512), 0.01);
    const final = messages.at(-1);
    assert.equal(final.type, 'utterance');
    assert.equal(final.audio[0], 1);
    assert.ok(final.audio.length > 140 * 512);
    assert.ok(previews.every(preview => preview.utteranceId === final.utteranceId));
    const previous = final.utteranceId;
    for(let i = 0; i < 20; i++) segments.accept(new Float32Array(512).fill(1), 0.99);
    assert.ok(messages.at(-1).utteranceId > previous);
});

function continuousMicrophoneFixture(t, { permission, module, resume, detector } = {}) {
    const contexts = [], nodes = [], streams = [], constraints = [], workers = [];
    const makeStream = () => {
        const track = { stopped: 0, stop() { this.stopped++; } };
        const stream = { track, getTracks: () => [track] };
        streams.push(stream);
        return stream;
    };
    const replacements = {
        navigator: { mediaDevices: { getUserMedia: options => {
            constraints.push(options);
            return permission ? permission(makeStream) : Promise.resolve(makeStream());
        } } },
        AudioContext: class {
            constructor() {
                this.state = 'suspended';
                this.sampleRate = 48000;
                this.destination = {};
                this.audioWorklet = { addModule: url => {
                    assert.match(url.pathname, /microphone-worklet\.js$/);
                    return module ? module() : Promise.resolve();
                } };
                contexts.push(this);
            }
            async resume() { if(resume) await resume(); this.state = 'running'; }
            close() { this.closed = (this.closed || 0) + 1; this.state = 'closed'; return Promise.resolve(); }
            createMediaStreamSource() {
                this.source = { connect() {}, disconnect() { this.disconnected = true; } };
                return this.source;
            }
        },
        AudioWorkletNode: class {
            constructor(context, name, options) {
                assert.equal(name, 'pena-microphone');
                assert.equal(options.channelCount, 1);
                this.port = { close() { this.closed = true; } };
                this.capture = microphoneProcessor(context.sampleRate, data => this.port.onmessage?.({ data }), false);
                nodes.push(this);
            }
            connect() {}
            disconnect() { this.disconnected = true; }
        },
        Worker: class {
            constructor(url) {
                assert.match(url.pathname, /vendor\/vad-worker\.js$/);
                workers.push(this);
            }
            postMessage({ port, previews }) {
                const segments = new SpeechSegments(data => this.onmessage?.({ data }), previews, { pauseMs: 800 });
                port.onmessage = ({ data }) => {
                    if(this.terminated) return;
                    const probability = data.audio.some(sample => Math.abs(sample) > 0.02) ? 0.95 : 0.01;
                    segments.accept(data.audio, probability);
                };
                if(detector) Promise.resolve(detector()).then(
                    () => this.onmessage?.({ data: { type: 'ready' } }),
                    error => this.onmessage?.({ data: { type: 'error', message: error.message } })
                );
                else queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }));
            }
            terminate() { this.terminated = true; }
        }
    };
    for(const [key, value] of Object.entries(replacements)) {
        const original = Object.getOwnPropertyDescriptor(globalThis, key);
        Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        t.after(() => { if(original) Object.defineProperty(globalThis, key, original); else delete globalThis[key]; });
    }
    const microphone = new PenaMicrophone();
    t.after(() => microphone.cancel());
    return { microphone, contexts, nodes, streams, constraints, workers, makeStream };
}

test('Pena continuous microphone delivers multiple raw utterances and disposes capture on cancel', async t => {
    const h = continuousMicrophoneFixture(t);
    const utterances = [], speech = [], previews = [], errors = [];
    await h.microphone.startContinuous({
        onSpeech: () => speech.push(true), onUtterance: result => utterances.push(result),
        onPreview: result => previews.push(result),
        onError: error => errors.push(error)
    });
    assert.deepEqual(h.constraints[0], {
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false
    });
    assert.equal(h.microphone.active, true);
    for(let i = 0; i < 2; i++) { h.nodes[0].capture.feed(0.4, 0.08); h.nodes[0].capture.feed(0.82); }
    assert.equal(utterances.length, 2);
    assert.equal(speech.length, 2);
    assert.equal(h.microphone.active, true);
    assert.ok(utterances[0].audio instanceof Float32Array);
    assert.equal(utterances[0].sampleRate, 16000);
    assert.ok(previews.length > 0);
    const previewCount = previews.length;
    const stale = h.workers[0].onmessage;
    h.microphone.cancel();
    assert.equal(h.microphone.active, false);
    assert.equal(h.streams[0].track.stopped, 1);
    assert.equal(h.contexts[0].closed, 1);
    assert.equal(h.contexts[0].source.disconnected, true);
    assert.equal(h.nodes[0].disconnected, true);
    assert.equal(h.nodes[0].port.closed, true);
    assert.equal(h.workers[0].terminated, true);
    await h.microphone.startContinuous({ onUtterance: result => utterances.push(result) });
    stale({ data: { type: 'speech' } });
    stale({ data: { type: 'utterance', ...utterances[0] } });
    stale({ data: { ...utterances[0], type: 'preview' } });
    assert.equal(utterances.length, 2);
    assert.equal(speech.length, 2);
    assert.equal(previews.length, previewCount);
    assert.deepEqual(errors, []);
});

test('Pena continuous microphone cancellation during permission cannot stop or publish into a restart', async t => {
    let allow;
    let calls = 0;
    const h = continuousMicrophoneFixture(t, { permission: makeStream =>
        ++calls === 1 ? new Promise(resolve => { allow = () => resolve(makeStream()); }) : Promise.resolve(makeStream())
    });
    const utterances = [];
    const pending = h.microphone.startContinuous({ onUtterance: () => assert.fail('Stale utterance') });
    h.microphone.cancel();
    await h.microphone.startContinuous({ onUtterance: result => utterances.push(result) });
    allow();
    await pending;
    assert.equal(h.contexts[0].closed, 1);
    assert.equal(h.streams[1].track.stopped, 1);
    assert.equal(h.streams[0].track.stopped, 0);
    assert.equal(h.microphone.active, true);
    h.nodes[0].capture.feed(0.4, 0.08);
    h.nodes[0].capture.feed(0.82);
    assert.equal(utterances.length, 1);
});

test('Pena continuous microphone cancels module, resume and classifier setup without stale nodes or errors', async t => {
    for(const stage of ['module', 'resume', 'detector']) {
        await t.test(stage, async t => {
            let reject;
            const gate = new Promise((resolve, fail) => { reject = fail; });
            const h = continuousMicrophoneFixture(t, { [stage]: () => gate });
            const errors = [];
            const pending = h.microphone.startContinuous({ onUtterance: () => {}, onError: error => errors.push(error) });
            await new Promise(resolve => setImmediate(resolve));
            h.microphone.cancel();
            reject(new Error('Cancelled setup'));
            await pending;
            assert.equal(h.nodes.length, stage === 'detector' ? 1 : 0);
            if(stage === 'detector') assert.equal(h.workers[0].terminated, true);
            assert.equal(h.streams[0].track.stopped, 1);
            assert.equal(h.contexts[0].closed, 1);
            assert.equal(h.microphone.active, false);
            assert.deepEqual(errors, []);
        });
    }
});

test('Pena continuous microphone reports audio failures once and releases every capture resource', async t => {
    for(const failure of ['processor', 'track', 'context']) {
        await t.test(failure, async t => {
            const h = continuousMicrophoneFixture(t);
            const errors = [];
            await h.microphone.startContinuous({ onUtterance: () => {}, onError: error => errors.push(error) });
            const fail = failure === 'processor' ? h.nodes[0].onprocessorerror
                : failure === 'track' ? h.streams[0].track.onended : h.contexts[0].onstatechange;
            if(failure === 'context') h.contexts[0].state = 'closed';
            fail();
            fail();
            assert.equal(errors.length, 1);
            assert.equal(h.microphone.active, false);
            assert.equal(h.streams[0].track.stopped, 1);
            assert.equal(h.nodes[0].port.closed, true);
        });
    }
});

test('Pena continuous microphone rejects failed setup and suppresses stale callback rejections', async t => {
    await t.test('setup failure', async t => {
        const h = continuousMicrophoneFixture(t, { module: () => Promise.reject(new Error('Module unavailable')) });
        await assert.rejects(h.microphone.startContinuous({ onUtterance: () => {} }), /Module unavailable/);
        assert.equal(h.streams[0].track.stopped, 1);
        assert.equal(h.contexts[0].closed, 1);
        assert.equal(h.microphone.active, false);
    });
    await t.test('callback rejection', async t => {
        const h = continuousMicrophoneFixture(t);
        let reject;
        const errors = [];
        await h.microphone.startContinuous({
            onUtterance: () => new Promise((resolve, fail) => { reject = fail; }), onError: error => errors.push(error)
        });
        h.nodes[0].capture.feed(0.4, 0.08);
        h.nodes[0].capture.feed(0.82);
        h.microphone.cancel();
        await h.microphone.startContinuous({ onUtterance: () => {} });
        reject(new Error('Stale consumer'));
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(errors, []);
        assert.equal(h.microphone.active, true);
    });
});

test('Pena microphone recognition streams validated words without completing or resurrecting cancelled requests', async () => {
    const original = globalThis.Worker;
    const workers = [], words = [];
    globalThis.Worker = class {
        constructor() { workers.push(this); }
        postMessage(message) { this.message = message; }
        terminate() {}
    };
    try {
        let completed = false;
        const request = recognitionRequest({ type: 'transcribe', preview: true, audio: new Float32Array(512) }, {
            onWord: word => words.push(word)
        }).then(result => { completed = true; return result; });
        const worker = workers[0], id = worker.message.id;
        worker.onmessage({ data: { id, type: 'word', word: 'Why' } });
        await Promise.resolve();
        assert.deepEqual(words, ['Why']);
        assert.equal(completed, false);
        worker.onmessage({ data: { id, type: 'result', result: { text: 'Why', speech: true } } });
        assert.equal((await request).text, 'Why');
        const controller = new AbortController();
        const cancelled = recognitionRequest({ type: 'transcribe', preview: true }, {
            signal: controller.signal, onWord: word => words.push(word)
        });
        const cancelledId = worker.message.id;
        controller.abort();
        await assert.rejects(cancelled, { name: 'AbortError' });
        worker.onmessage({ data: { id: cancelledId, type: 'word', word: 'stale' } });
        assert.deepEqual(words, ['Why']);
    } finally { releaseRecognitionModel(); globalThis.Worker = original; }
});

test('Pena retries microphone preparation in a fresh worker after a backend-loading error', async () => {
    const original = globalThis.Worker;
    const workers = [];
    globalThis.Worker = class {
        constructor() { workers.push(this); }
        postMessage({ id }) {
            const fail = workers.length === 1;
            queueMicrotask(() => this.onmessage({ data: {
                id, type: fail ? 'error' : 'result',
                message: 'no available backend found', result: { prepared: true }
            } }));
        }
        terminate() { this.terminated = true; }
    };
    try {
        await assert.rejects(recognitionRequest({ type: 'prepare' }), /no available backend/);
        assert.equal(workers[0].terminated, true);
        assert.deepEqual(await recognitionRequest({ type: 'prepare' }), { prepared: true });
        assert.equal(workers.length, 2);
    } finally { releaseRecognitionModel(); globalThis.Worker = original; }
});

test('Pena speech reports unavailable speech once per answer without retrying every queued sentence', async () => {
    const original = globalThis.window;
    globalThis.window = {};
    const errors = [];
    const speech = new PenaSpeech(() => {}, error => errors.push(error));
    try {
        const settings = { penaSpeech: 'browser' };
        speech.say('First sentence.', settings);
        speech.say('Second sentence.', settings);
        await speech.queue;
        assert.equal(errors.length, 1);
        speech.stop();
        speech.say('A new answer may retry.', settings);
        await speech.queue;
        assert.equal(errors.length, 2);
    } finally { speech.stop(); globalThis.window = original; }
});

test('Pena trims impossible support claims instead of dropping the recommendation', () => {
    const fen = '3r1rk1/pp1n1p1p/2pPp1p1/4q1P1/1P2N3/P1P5/4BPP1/R2R2K1 w - - 3 13';
    const result = checkSentence('Pena recommends Bf3, activating the bishop on the a8-h1 diagonal where it eyes the kingside and supports the white pawn on g5.', fen);
    assert.notEqual(result.status, 'contradicted');
    assert.doesNotMatch(result.text, /g5/);
    assert.match(result.text, /Bf3/);
    const where = checkSentence('Pena recommends Bf3, where it supports the white pawn on g5 and eyes the kingside.', fen);
    assert.match(where.text, /where it eyes the kingside/);
    assert.notEqual(checkSentence('Pena recommends Bf3, where it defends the knight on e4.', fen).status, 'contradicted');
});

test('Pena checks direct support and unnamed passed-pawn claims without losing the useful plan', () => {
    const sicilian = 'r1bqkbnr/pp1ppppp/2n5/2p5/4P3/3P4/PPP2PPP/RNBQKBNR w KQkq - 1 3';
    const support = checkSentence('The best move is c2-c3, supporting the d3 pawn and preparing the d3-d4 break.', sicilian);
    assert.doesNotMatch(support.text, /supporting the d3/);
    assert.match(support.text, /c3.*preparing.*d3-d4/);
    const blocked = '1k1r3r/ppq2pp1/2nbpnp1/6B1/N1PP4/5NP1/P4P1P/R2QR1K1 w - - 1 16';
    const passed = checkSentence('The best move is c4-c5, restricting the bishop and creating a passed pawn.', blocked);
    assert.match(passed.text, /^c5, restricting the bishop/);
    assert.doesNotMatch(passed.text, /passed/);
    assert.match(checkSentence('The best move is d5-d6, creating a passed pawn.',
        '4k3/8/8/3P4/8/8/8/4K3 w - - 0 1').text, /passed pawn/);
    assert.match(checkSentence('The best move is c4-c5, preparing to create a passed pawn.', blocked).text, /preparing/);
});

test('Pena rejects invented material and named pin geometry in Full advice too', () => {
    const fen = '1k1r3r/ppq2pp1/2nbpnp1/6B1/N1PP4/5NP1/P4P1P/R2QR1K1 w - - 1 16';
    for(const text of [
        'The player holds a material edge with an extra pawn and the bishop pair.',
        'The white bishop on g5 pins the black knight on f6 to the black queen on c7.'
    ]) assert.equal(checkSentence(text, fen).status, 'contradicted', text);
    const inventory = 'Material is equal, with both sides retaining queen, two rooks, two knights, two bishops, and seven pawns.';
    assert.equal(checkSentence(inventory, 'r2q1rk1/pp3ppp/4bn2/4p3/4P3/P1NPQ2P/5PP1/R3KB1R w KQ - 1 14').status, 'contradicted');
    assert.equal(checkSentence('Material is equal.', start).status, 'unchecked');
    const ending = '5r2/p2p2k1/1pb5/4R2p/3P1p2/2P5/PP3PPP/R5K1 w - - 0 25';
    const holdings = "The player holds a decisive material advantage with two rooks and six pawns against the opponent's rook, bishop, and four pawns.";
    assert.equal(checkSentence(holdings, ending).status, 'contradicted');
    assert.notEqual(checkSentence(holdings.replace('six pawns', 'seven pawns').replace('four pawns', 'five pawns'), ending).status, 'contradicted');
    const correct = 'The white bishop on b5 pins the black knight on c6 to the black king on e8.';
    assert.notEqual(checkSentence(correct, 'r1bqkbnr/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4').status, 'contradicted');
    const result = new CommentaryStream({ fen, mode: 'original' }).update(
        'The player has the bishop pair. The best move is c4-c5, restricting the bishop. '
        + 'The opponent replies with Be7, keeping the bishop protected. '
        + 'Continue with Rb1, preparing to put pressure on the b-file.', true);
    assert.doesNotMatch(result.text, /bishop pair/);
    assert.match(result.text, /c5.*Be7.*Rb1/s);
    assert.equal(checkSentence('White holds a dominant material advantage with three queens, two knights, and a king against a lone black king.',
        '2k5/Q7/1Q6/1NN5/2K5/8/8/8 w - - 41 78').status, 'contradicted');
});

test('Pena preserves a development plan while repairing a false relative support clause', () => {
    const fen = 'rn1qkbnr/pbp1pppp/1p1p4/8/3PP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 2 4';
    const result = checkSentence('The best move is white knight b1-c3, developing a minor piece to a central square that supports d4 and prepares...white bishop c1-e3.', fen);
    assert.equal(result.mainMove, 'b1c3');
    assert.doesNotMatch(result.text, /supports d4/);
    assert.match(result.text, /Nc3.*preparing.*Bc1-e3/);
});

test('Pena quarantines board claims after a broken line until a legal alternative restarts it', () => {
    const raw = 'The best move is Nf3, developing a piece. The opponent plays e7-e3. '
        + 'The black pawn on e3 restricts the king. White has no escape squares. '
        + 'The alternative d4 is also playable, taking central space.';
    const result = new CommentaryStream({ fen: start, mode: 'original' }).update(raw, true);
    assert.match(result.text, /Nf3.*alternative d4/s);
    assert.doesNotMatch(result.text, /pawn on e3|escape squares/);
    assert.ok(result.assessments.find(item => /no escape/.test(item.source)).unresolvedContinuation);
    assert.equal(checkSentence('The winning move is e4, taking central space.', start).mainMove, 'e2e4');
    assert.doesNotMatch(checkSentence('The only legal move is white pawn e2-e4.', start).text, /only legal/);
});

test('Pena corrects a mirrored destination rank without losing the explanation', () => {
    const fen = '4k3/8/8/4r3/8/8/8/K7 b - - 0 1';
    const result = checkSentence('The best move is Re4, activating the rook to the fifth rank where it restricts the king.', fen);
    assert.match(result.text, /Re4.*4th rank where it restricts the king/);
    assert.equal(result.repairs.length, 1);
    assert.equal(checkSentence('The best move is Re4, activating the rook to the fourth rank.', fen).repairs, undefined);
    assert.match(checkSentence('The rook could move to the fifth rank later.', fen).text, /fifth rank/);
});

test('Pena removes false pinning clauses without discarding independent position features', () => {
    const blocked = 'r2qkbnr/pppb1ppp/2np4/1B2p3/3PP3/5N2/PPP2PPP/RNBQK2R w KQkq - 1 5';
    const sentence = 'The player has an active white bishop on b5 pinning the black knight on c6 to the black king, and pawns on d4 and e4.';
    const result = checkSentence(sentence, blocked);
    assert.match(result.text, /bishop on b5, and pawns on d4 and e4/);
    assert.doesNotMatch(result.text, /pinning/);
    assert.equal(result.repairs.length, 1);
    const clear = 'r1bqkbnr/ppp2ppp/2np4/1B2p3/3PP3/5N2/PPP2PPP/RNBQK2R w KQkq - 1 5';
    assert.match(checkSentence(sentence, clear).text, /pinning.*black king/);
    const queenBlocked = 'rn2kbnr/ppq1pppp/2pp4/8/2PP2b1/2N2N2/PP2PPPP/R1BQKB1R w KQkq - 4 5';
    assert.doesNotMatch(checkSentence("The opponent's black bishop on g4 is active, pinning the white knight on f3 to the white queen on d1.", queenBlocked).text, /pinning/);
});

test('Pena replays an explicit recap without losing the following explained moves', () => {
    const text = 'The best move is Nf3, developing a piece. After Nf3, the opponent replies with d5, taking space. '
        + 'Continue with d4, contesting the center.';
    const frames = variationFrames(text, start);
    assert.deepEqual(frames.map(frame => frame.san), ['Nf3', 'Nf3', 'd5', 'd4']);
    const result = new CommentaryStream({ fen: start, mode: 'original' }).update(text, true);
    assert.match(result.text, /d5, taking space.*d4, contesting/s);
});

test('Pena Full advice checks candidate wording, forcing claims and unsafe continuations', () => {
    const text = 'The best candidate is e4, opening a line for the bishop. '
        + "The opponent's only legal response is e5, claiming space.";
    const result = new CommentaryStream({ fen: start, mode: 'original' }).update(text, true);
    assert.ok(result.assessments.some(item => item.main && item.mainMove === 'e2e4'));
    assert.doesNotMatch(result.text, /only legal/);
    assert.match(result.text, /One reply is e5/);
    assert.equal(checkSentence('e8 is covered by the white bishop on c1.', start).status, 'contradicted');
    assert.notEqual(checkSentence('e5 is controlled by the white knight on f3.',
        'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1').status, 'contradicted');
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3';
    const unsafe = new CommentaryStream({ fen, mode: 'original' }).update(
        'The best move is Nf6, developing with tempo. This protects the king and solves the problem. '
        + 'After Qxf7#, the game is over.', true);
    assert.match(unsafe.text, /Nh6, guarding f7/);
    assert.doesNotMatch(unsafe.text, /solves the problem/);
    const threat = checkSentence('The best move is black queen h4-h3, attacking the white rook on h1 and threatening...black queen h3-g2+.',
        'k7/8/8/8/7q/8/7P/K6R b - - 0 1');
    assert.match(threat.text, /^Qh3, threatening.*Qh3-g2 \(plan\)/);
    assert.doesNotMatch(threat.text, /attacking|Qh3Qg2/);
    assert.equal(checkSentence('After c4-c5, the player retains an extra pawn.',
        '1k1r3r/ppq2pp1/2nbpnp1/6B1/N1PP4/5NP1/P4P1P/R2QR1K1 w - - 1 16').status, 'contradicted');
});

test('Pena visuals keep your pieces, captured pawns and future plans tied to the discussed board', async () => {
    const { teachingCues } = await import('../narration.js');
    const cue = (text, fen, phrase, context = text) =>
        teachingCues(text, fen, context).find(item => text.slice(item.index, item.end) === phrase)?.references;
    const rooks = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const text = 'You can connect the two rooks.';
    assert.deepEqual(cue(text, rooks, 'two rooks', `Kf1 Kf7. ${text}`).squares.sort(), ['a1', 'h1']);
    const capture = 'Nxe5, capturing the advanced pawn.';
    assert.deepEqual(cue(capture, 'rnbqkbnr/pppp1ppp/8/4p3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 1',
        'the advanced pawn').squares, ['e5']);
    const plan = 'Prepare d4-d5.';
    assert.deepEqual(cue(plan, start, 'd4-d5', `d4 Nf6. ${plan}`).plans.map(item => [item.from, item.to]), [['d4', 'd5']]);
    const majority = cue('White has a queenside pawn majority.', '4k3/p7/8/8/8/8/PPP5/4K3 w - - 0 1', 'queenside pawn majority');
    assert.deepEqual(majority.regions[0].squares.sort(), ['a2', 'b2', 'c2']);
    assert.match(majority.regions[0].label, /3 vs 1/);
    const chain = cue('White has a pawn chain.', '4k3/8/8/8/4P3/3P4/8/4K3 w - - 0 1', 'pawn chain');
    assert.deepEqual(chain.relations.map(item => [...item]), [['d3', 'e4']]);
    assert.equal(cue('White has a pawn chain.', start, 'pawn chain'), undefined);
});

test('Pena visualizes piece groups and board concepts from real Pena phrasing', async () => {
    const { teachingCues } = await import('../narration.js');
    const cue = (text, fen, phrase) => teachingCues(text, fen).find(item => text.slice(item.index, item.end).includes(phrase))?.references;
    const rooks = cue('White doubles the two rooks.', 'r3k3/8/8/8/8/8/8/R2RK2q w q - 0 1', 'two rooks');
    assert.deepEqual(rooks.squares.sort(), ['a1', 'd1']);
    assert.deepEqual(cue('It targets the opponent\'s queen.', 'r3k3/8/8/8/8/8/8/R2RK2q w q - 0 1', 'the opponent\'s queen').squares, ['h1']);
    const passed = cue('The passed pawn decides the game.', '4k3/8/3P4/8/8/8/8/4K3 w - - 0 1', 'passed pawn');
    assert.deepEqual(passed.relations.map(item => [...item]), [['d6', 'd8']]);
    const pin = cue('The bishop pins the knight to the king.', '4k3/8/2n5/8/B7/8/8/4K3 w - - 0 1', 'pins');
    assert.deepEqual(pin.regions[0].squares, ['c6']);
    const castle = cue('Nf3, preparing to castle.', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'castle');
    assert.deepEqual(castle.relations.map(item => [...item]), [['e1', 'g1'], ['h1', 'f1']]);
    assert.deepEqual(cue('Nxe5, capturing the pawn.', 'rnbqkbnr/pppp1ppp/8/4p3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 1', 'the pawn').squares, ['e5']);
    assert.equal(cue('Pena suggests Nf3.', start, 'Pena'), undefined);
    assert.deepEqual(cue('Queen can move along a file.', start, 'Queen').squares, ['d1']);
});

test('Pena visualizes trades only where the board pins them down', async () => {
    const { teachingCues } = await import('../narration.js');
    const cue = (text, fen, phrase) => teachingCues(text, fen).find(item => text.slice(item.index, item.end) === phrase)?.references;
    const arrows = references => references.relations.map(item => [...item]).sort();
    const center = 'rnbqkbnr/pppp1ppp/8/4p3/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2';
    const exchange = cue('Black exchanges with exd4, and White recaptures.', center, 'exchanges');
    assert.equal(exchange.regions[0].label, 'Trade on d4');
    assert.deepEqual(arrows(exchange), [['d1', 'd4'], ['e5', 'd4']]);
    const offer = cue('The opponent responds Qh3, offering a queen trade.', '4r1k1/pppq1pp1/1b1p3p/3P2NQ/2P5/1P4P1/P4PKP/5R2 b - - 0 25', 'trade');
    assert.equal(offer.regions[0].label, 'Trade on h3');
    assert.deepEqual(arrows(offer), [['g2', 'h3'], ['g5', 'h3'], ['h5', 'h3']]);
    assert.equal(cue('Decide whether to exchange or keep the tension.', center, 'exchange'), undefined);
    assert.equal(cue('It accepts doubled pawns in exchange for activity.', center, 'exchange'), undefined);
});

test('Pena understands everyday questions and answers them directly', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const open = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    assert.equal(understandQuestion('what is the best thing to do here?', start).topic, 'plan');
    assert.equal(understandQuestion('any good moves?', start).topic, 'plan');
    assert.equal(understandQuestion('how am I doing', start).topic, 'evaluation');
    const hanging = understandQuestion('is anything hanging?', start);
    assert.equal(hanging.kind, 'threat');
    assert.match(questionLead(hanging), /^Nothing of White's is hanging right now\./);
    const capture = understandQuestion('can I take on e5', open);
    assert.equal(capture.kind, 'move');
    assert.equal(capture.move.san, 'Nxe5');
    assert.equal(understandQuestion('what should black do', start).kind, 'threat');

    const answer = new QuestionAnswer(understandQuestion('what is the best thing to do here?', start));
    const { text } = answer.update('ANALYSIS: e4, taking the center.', true);
    assert.match(text, /^I'd play e4\b/);
});

test('Pena speaks to the player directly without broken verbs', () => {
    assert.equal(speakToYou('The player then plays Bxe7+ and the player pushes on. The player has time.'),
        'You then play Bxe7+ and you push on. You have time.');
    assert.equal(speakToYou("The player's bishop is strong."), 'Your bishop is strong.');
    assert.equal(speakToYou('The question for the player is how to develop.'), 'The question for you is how to develop.');
    assert.equal(speakToYou('This is the only active the player piece.'), 'This is your only active piece.');
});

test('Pena explains terminology once without replacing the reason or truncating Full advice', () => {
    const fen = '4k3/8/8/3P4/8/8/8/4K3 w - - 0 1';
    const raw = 'The best move is d6, advancing the passed pawn. This passed pawn ties down the enemy king. '
        + 'The king must watch the promotion square.';
    for(const mode of ['brief', 'dynamic', 'original']) {
        const result = new CommentaryStream({ fen, mode }).update(raw, true);
        assert.match(result.text, /d6, advancing the passed pawn \(a pawn with no enemy pawn ahead/);
        assert.equal(result.text.match(/a pawn with no enemy pawn ahead/g).length, 1);
        if(mode === 'original') assert.match(result.text, /must watch the promotion square/);
        else assert.ok(result.text.split(/\s+/).length <= (mode === 'brief' ? 45 : 75));
    }
    const brief = new CommentaryStream({ fen: start, mode: 'brief' }).update(
        'The best move is Nf3. This develops the knight toward the center and prepares to castle.', true);
    assert.match(brief.text, /Nf3\. This develops/);
    const why = new CommentaryStream({ fen: start, mode: 'brief' }).update(
        'The best move is Nf3, heading toward the center. The knight controls e5 and d4.', true);
    assert.match(why.text, /The knight controls/);
    const sentence = 'The white passed pawn on d5 ties down the enemy king.';
    const repeated = new CommentaryStream({ fen, mode: 'original' }).update(`${sentence} ${sentence}`, true);
    assert.equal(sourceSentences(repeated.text).length, 1);
});

test('Pena distinguishes adjacent pawns from a protecting chain and keeps plan word boundaries', () => {
    const fen = 'r1bqkbnr/ppp1pppp/2n5/3p4/3P4/4P3/PPP2PPP/RNBQKBNR w KQkq - 1 3';
    const result = checkSentence('The best move is c4, challenging the center and creating a pawn chain on c4 and d4.', fen);
    assert.match(result.text, /c4, challenging the center/);
    assert.doesNotMatch(result.text, /pawn chain/);
    assert.match(checkSentence('Prepare white pawn d2-d3 followed by...white pawn d3-d4.', start).text, /followed by d3-d4/);
    const endgame = '8/2P3p1/3K2k1/6P1/8/8/7R/2r5 w - - 1 57';
    const ranks = checkSentence('The best move is white rook h2-h8, placing the rook on the a8-h8 where it can swing to the c1-c8 or d1-d8.', endgame);
    assert.equal(ranks.mainMove, 'h2h8');
    assert.match(ranks.text, /Rh8.*8th rank.*c-file or the d-file/);
    assert.deepEqual(boardReferences('h2-h8', endgame).moves, [['h2', 'h8']]);
    assert.deepEqual(boardReferences('h1-h8', '4k3/8/8/8/8/8/8/4K2R w - - 0 1').moves, [['h1', 'h8']]);
    const opening = 'r1bqk1nr/pppp1ppp/4p3/8/1nPP4/P7/1P2PPPP/RN1QKBNR b KQkq - 0 5';
    const plan = checkSentence('The best move is black knight b4-c6, repositioning the knight where it supports the...black pawn e6-e5 break and eyes d4.', opening);
    assert.equal(plan.mainMove, 'b4c6');
    assert.match(plan.text, /Nc6.*e6-e5 \(plan\)/);
    assert.equal(checkSentence('The best available move is Nf3, developing a piece.', start).mainMove, 'g1f3');
});

test('Pena keeps overlapping pawn visuals and absolute ranks for either side', async () => {
    const { teachingCues } = await import('../narration.js');
    const fen = '4k3/8/3P4/8/8/8/8/4K3 b - - 0 1';
    const cues = teachingCues('The dangerous passed pawn is close to promotion.', fen);
    assert.ok(cues.some(cue => cue.references.squares.includes('d6')));
    assert.ok(cues.some(cue => cue.references.relations.some(([from, to]) => from === 'd6' && to === 'd8')));
    const ranks = teachingCues('Black controls the seventh rank.', fen).flatMap(cue => cue.references.regions);
    assert.ok(ranks.some(region => region.squares.length === 8 && region.squares.every(square => square[1] === '7')));
    const development = teachingCues('The opponent develops with Nf6.', start, 'Nf3. The opponent develops with Nf6.');
    assert.ok(development.find(cue => cue.index === 13)?.references.regions.some(region => region.squares.includes('g8')));
    const idleText = 'The black bishop on f8 is still undeveloped.';
    const idle = teachingCues(idleText, start);
    assert.ok(idle.find(cue => cue.index === idleText.indexOf('undeveloped'))?.references.regions.some(region => region.squares.includes('f8')));
});

test('Pena keeps the move to itself when asked to', () => {
    assert.equal(moveHint('Nf3, developing the knight toward the center.'), 'Look for a move that develops the knight toward the center.');
    assert.equal(moveHint('Nf3.'), '', 'A bare move leaves nothing to hint, so nothing is said');
    const text = 'Nf3, developing the knight toward the center. One reply is d5, taking space in the middle.';
    const result = new CommentaryStream({ fen: start, mode: 'dynamic', hideMove: true }).update(text, true);
    assert.doesNotMatch(result.text, /Nf3|d5/);
});

test('Pena drops bare continuations and side alternatives', () => {
    const text = 'Nf3, developing the knight toward the center. One reply is d5, taking space in the middle. Continue with d4. '
        + 'The alternative e4 is also fine.';
    const result = new CommentaryStream({ fen: start, mode: 'dynamic' }).update(text, true);
    assert.match(result.text, /One reply is d5/);
    assert.doesNotMatch(result.text, /Continue with d4|alternative/);
});

test('Pena leads with its BEST_MOVE when the prose never names a move', () => {
    const fen = '2rr2k1/pp3pp1/7p/1p2P3/8/P7/1P3PPP/3Q2K1 b - - 0 26';
    const text = 'You have a strong position with active rooks.\n\nBEST_MOVE: black rook d8 takes white queen d1';
    const result = new CommentaryStream({ fen, mode: 'dynamic' }).update(text, true);
    assert.match(result.text, /^Rxd1#, delivering checkmate\./);
});

test('Pena turns raw ranks and model tokens into plain words', () => {
    assert.equal(compactExplanation('Rooks along a8-h8 and the e1-e8. No the opponent piece can block.'),
        'Rooks along the 8th rank and the e-file. No enemy piece can block.');
});

test('Pena leaves a small speech break at every teaching cue without losing the sentence', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    const phrases = narrationPhrases('Bb5, pinning the knight on c6 to the king, and preparing to castle soon.', fen);
    assert.ok(phrases.length >= 1);
    for(const phrase of phrases) for(const mark of phrase.marks) assert.ok(mark.at >= 0 && mark.at <= phrase.text.length);
    assert.ok(phrases.filter(phrase => phrase.marks.length).every(phrase => phrase.pauseBefore === 180
        && phrase.marks.every(mark => mark.at === 0)));
    assert.match(phrases.map(phrase => phrase.text).join(' '), /pinning.*knight.*king.*preparing.*castle/);
});

test('Pena centers region labels on the region', () => {
    const { anchor, offset } = labelPlacement(['d4', 'e4', 'd5', 'e5']);
    assert.equal(anchor, 'd4');
    assert.deepEqual(offset, [0.5, 0.5]);
});

test('Pena explains GPU failures in plain words', () => {
    assert.match(friendlyPenaError(new Error('ID3D12Device::CreateCommittedResource\n- While handling unexpected error type OutOfMemory')),
        /ran out of memory/);
    assert.match(friendlyPenaError(new Error('Device removed reason: S_OK')), /driver reset/);
});
