import { getPenaPreferences, PENA_CHECK_DEPTH } from './preferences.js';
import { promptOverridesFrom } from './prompt-overrides.js';
import { PenaSpeech, PenaMicrophone } from './speech.js';
import { PenaTeacher, variationFrames, moveMentions } from './teacher.js';
import { recognitionRequest } from './recognition.js';
import { recognizedSpeech } from './vad.js';
import { CommentaryStream, rememberCommentary, sourceSentences, explanationBody } from './commentary.js';
import { bridgeLoneWords, narrationParts, narrationPhrases, compileTeaching, teachingPreview } from './narration.js';
import { glossaryMentions, glossary, hasDemo, demoId } from './glossary.js';
import { penaPosition, readPenaPosition } from './input.js';
import { PenaConversation, citationSteps, conceptVisuals } from './conversation.js';
import { assessChatReply } from './chat-reply.js';
import { appNotes, profileSummary } from './appnotes.js';
import { markdownPlain, renderMarkdown, spokenText } from './formatting.js';
import { markCitations, markerPattern, stripMarkers, sentenceCitations, citationFacts } from './cited-evidence.js';
import { isSmallTalk } from './inkling-effort.js';
import { reportServerVersion } from '../../js/gui/serverVersion.js';
import { PenaVariation } from './variation.js';
import { friendlyPenaError } from './runtime.js';
import { understandQuestion, QuestionAnswer, moveIntent, findPlayedMove } from './questions.js';
import { gradeGame, boardResult, pastTopic } from './timeline.js';
import { moveEvent, positionEvent, withoutLines, isRepeatAsk } from './chat.js';
import MoveEvaluator from '../../js/MoveEvaluator.js';
import { CoachingChecks } from './coaching.js';
import { isMobileDevice } from './platform.js';
import { setupView } from './setup-view.js';
import { liveCoachingInput } from './app-input.js';
import { LiveCoachingEvidence } from './app-evidence.js';
import { presentComparisonAnswer } from './comparison.js';
import { penaText, setPenaText, initializePenaTranslations, penaFilename } from './i18n.js';
import { asksForMove, dropFalseGeometry, dropMisplacedPieces, dropRepeatedSentences, dropUnaskedVerdicts, hideMoveSuggestions } from './coaching-policy.js';

// One Pena for the whole app. It follows the newest open match, so two matches never load
// two copies of the model onto the GPU at once.
const READ_ALOUD_KEY = 'penaReadAloud';
const POSITION_KEY = 'penaWindowPosition';
const HEIGHT_KEY = 'penaWindowHeight';
const MIN_HEIGHT = 200;
const MIN_WIDTH = 240;
const ICONS = {
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/><path class="pena-mic-slash" d="M4 3l16 18"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path class="pena-sound-waves" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v4.5h4.5"/></svg>',
    minimize: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>',
    checked: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3-8 3v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="m8 12 3 3 5-6"/></svg>',
    warning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3z"/><path d="M12 9v5m0 3v.1"/></svg>',
    removed: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>'
};
const EMPTY_REFERENCES = Object.freeze({ squares: [], regions: [], relations: [], frames: [], moves: [], plans: [] });

const pena = {
    enabled: false,
    worker: null,
    verifier: null,
    idleTurns: [], idleApp: null,
    canChat: false,
    conversation: null,
    modelId: null,
    state: 'off',
    instance: null,
    fen: null,
    previousFen: null,
    withheldMoveFen: null,
    response: null,
    lastLive: null,
    memory: [],
    // Chats of tabs Pena stopped following, by instance ID. A reconnecting tab gets its own chat back.
    paused: new Map(),
    // What Pena remembers about the player, kept in this browser only. Created in initializePena.
    player: null,
    settings: null,
    readAloud: (localStorage.getItem(READ_ALOUD_KEY) ?? 'true') === 'true',
    speechInterrupted: false,
    spokenOffset: 0
};
let ui;

const concealed = () => typeof CONCEAL_ASSISTANCE_ACTIVE !== 'undefined' && CONCEAL_ASSISTANCE_ACTIVE;
const latestInstance = () => [...(window.AcasInstances || [])].reverse()
    .map(entry => entry.instance).find(instance => instance && !instance.instanceClosed) || null;

// With no match open, Pena still chats. She gets the starting position and a note that nothing is being played.
const IDLE_BOARD = Object.freeze({ idle: true, currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    gameStateHistory: [], pV: {}, getPlayerColor: async () => 'w' });
const boardFen = () => pena.instance ? pena.instance.currentFen : IDLE_BOARD.currentFen;
const askBoard = () => pena.instance ? (pena.instance.currentFen ? pena.instance : null) : pena.canChat ? IDLE_BOARD : null;

function setStatus(text, values) {
    setPenaText(ui.status, text, values);
    ui.status.title = '';
    ui.status.hidden = !text;
}

// The one visible line for when a message can't be sent. The status line stays for screen readers.
function notice(text) {
    clearTimeout(pena.noticeTimer);
    setPenaText(ui.notice, text);
    ui.notice.hidden = !text;
    if(text) pena.noticeTimer = setTimeout(() => notice(''), 6000);
}

function visualDuration(fallback) {
    return pena.settings?.penaVisualDuration === undefined ? fallback : pena.settings.penaVisualDuration * 1000;
}

function setState(state) {
    pena.state = state;
    ui.window.dataset.state = state;
    const down = state !== 'ready';
    ui.input.disabled = ui.send.disabled = down;
    ui.microphone.disabled = down;
    ui.input.dataset.penaPlaceholder = down ? 'unavailableInput' : 'askPosition';
    ui.input.placeholder = penaText(ui.input.dataset.penaPlaceholder);
}

function failure(error) {
    if(error?.name === 'AbortError') return;
    console.error('[Pena]', error);
    setStatus(friendlyPenaError(error));
    toast.error(`Pena: ${friendlyPenaError(error)}`, 10000);
    // A question that failed still gets a reply bubble, so the chat doesn't look like it ate the message.
    if(ui.answer && ui.turn?.querySelector('.pena-message-user') && !ui.answer.textContent.trim()) {
        ui.answer.hidden = false;
        ui.answer.classList.add('pena-answer-error');
        ui.answer.textContent = friendlyPenaError(error);
    }
}

// When nothing is left to say, the bubble still answers in quiet grey text. It is shown, never spoken.
function quietAnswer(response, withheld) {
    if(pena.shown !== response || pena.text.trim() || !withheld && response.event) return;
    const note = document.createElement('span');
    note.className = 'pena-quiet-note';
    setPenaText(note, withheld ? 'moveHiddenNote' : 'nothingNew');
    ui.answer.replaceChildren(note);
    ui.answer.classList.add('pena-answer-quiet');
    ui.answer.hidden = false;
}

function stopSpeech() {
    pena.speech.stop();
    pena.spokenOffset = 0;
}

function interruptSpeech(answer) {
    if(pena.shown !== answer) return;
    pena.speechInterrupted = true;
    stopSpeech();
    clearBoard();
}

function clearBoard(fade = false) {
    pena.hover = null;
    clearTimeout(pena.followTimer);
    clearTimeout(pena.stepTimer);
    pena.stepsEnd = 0;
    if(fade && pena.teacher?.fade) {
        pena.teacher.fade();
        pena.followTimer = setTimeout(() => { pena.variation?.clear(); pena.following = false; }, 180);
        return;
    }
    pena.following = false;
    pena.teacher?.clear();
    pena.variation?.clear();
}

function resetAnswer() {
    stopSpeech();
    clearBoard();
    pena.text = '';
    if(!ui.turn.textContent.trim()) ui.turn.remove();
    ui.turn = document.createElement('div');
    ui.turn.className = 'pena-turn';
    ui.answer = document.createElement('div');
    ui.answer.className = 'pena-answer pena-message pena-message-assistant';
    ui.answer.hidden = true;
    ui.turn.append(ui.answer, ui.meta);
    ui.log.append(ui.turn);
    while(ui.log.children.length > 41) ui.log.querySelector('.pena-turn').remove();
    ui.raw.textContent = '';
    ui.checks.hidden = true;
    ui.checkList.replaceChildren();
}

function scrollToTurn() {
    ui.log.scrollTop = ui.log.scrollHeight;
}

function setBusy(busy) {
    pena.busy = busy;
    ui.thinking.hidden = !busy;
    ui.send.innerHTML = busy ? ICONS.stop : ICONS.send;
    ui.send.dataset.penaLabel = ui.send.dataset.penaTitle = busy ? 'stop' : 'ask';
    ui.send.setAttribute('aria-label', penaText(busy ? 'stop' : 'ask'));
    ui.send.title = penaText(busy ? 'stop' : 'ask');
    ui.send.type = busy ? 'button' : 'submit';
    ui.send.hidden = !busy;
}

function cancel(message = '', { keepAnalysis = false } = {}) {
    pena.requestRevision = (pena.requestRevision || 0) + 1;
    pena.response?.controller?.abort();
    if(pena.response) pena.worker?.postMessage({ type: 'cancel' });
    pena.response = null;
    if(!keepAnalysis) pena.verifier?.cancelPending();
    stopSpeech();
    clearBoard();
    setBusy(false);
    if(message) setStatus(message);
}

// Board cues are worked out on the position being discussed and drawn on the live board.
function teachingFor(response, text, context, fen = response.analysisFen || response.fen, citations = []) {
    response.teaching ||= new Map();
    const key = JSON.stringify([fen, text, context, citations.map(citation => citation.id), response.hideMoves]);
    if(!response.teaching.has(key)) response.teaching.set(key, compileTeaching(text, fen, context, {
        rootColor: response.playerColor, beforeFen: response.beforeFen, history: response.history || [], citations,
        hideMoves: response.hideMoves,
        question: response.question,
        evidenceLines: fen === response.fen ? (response.prepared?.sheet?.facts || []).filter(fact => fact.line?.length).map(fact => fact.line) : [],
        antecedent: response.prepared?.history?.at(-1)?.pena || ''
    }));
    return response.teaching.get(key);
}

// The model's tags name the facts it is reading, resolved once per reply.
function citationResolver(response) {
    const cache = new Map();
    return ids => ids.flatMap(id => {
        if(!cache.has(id)) cache.set(id, citationFacts([id], { sheet: response.prepared?.sheet, input: response.input, fen: response.fen }));
        return cache.get(id);
    });
}

function cueFor(response, text, context) {
    const cues = narrationParts(text, response.analysisFen || response.fen, context, { compiled: teachingFor(response, text, context) })
        .filter(item => item.cue).map(item => item.cue.references);
    if(!cues.length) return null;
    return Object.fromEntries(Object.keys(EMPTY_REFERENCES).map(key =>
        [key, cues.flatMap(references => references[key] || [])]));
}

// Later moves use a temporary board over the instance without changing the live position.
function followLine(response, text, context, cue, compiled = teachingFor(response, text, context)) {
    if(!pena.settings?.penaFollowLine || response.analysisFen !== response.fen || !cue || !context) return null;
    return teachingPreview(compiled, cue, response.fen);
}

function flash(response, text, references, duration = 1500, line = null, persistent = false) {
    if(pena.settings?.penaCoaching === false || !pena.settings?.penaTeacher || concealed() || pena.instance?.currentFen !== response.fen) return;
    if(pena.hover && !persistent) return;
    if(!persistent) duration = visualDuration(duration);
    clearTimeout(pena.followTimer);
    if(!line && pena.following) {
        pena.following = false;
        pena.variation.clear();
    }
    pena.teacher.profile = Object.keys(pena.instance.pV || {})[0] || 'default';
    pena.teacher.show(text, response.fen, { references, duration, line, persistent });
    if(persistent) clearTimeout(pena.variation?.timeout);
    if(line && !persistent) {
        pena.following = true;
        // Hand the picture back to the live position once the talk moves on.
        pena.followTimer = setTimeout(() => { if(pena.following) pena.variation.clear(); pena.following = false; }, duration + 3000);
    }
}

function narrationEnabled() {
    return Boolean(pena.settings && pena.readAloud && !pena.speechInterrupted
        && !pena.speechUnavailable && pena.settings.penaSpeech !== 'off');
}

function queueNarration(response, text, context, fen = response.analysisFen, citations = []) {
    const compiled = teachingFor(response, text, context, fen, citations);
    const wantsLine = /\b(?:show|play|walk|line|variation|continuation)\b/i.test(response.question || '');
    const lineFor = cue => fen === response.fen && (wantsLine || response.input && cue.positionFen !== response.fen)
        ? followLine(response, text, context, cue, compiled) : null;
    const phrases = narrationPhrases(text, fen, context, { compiled });
    for(const phrase of phrases) {
        const marks = phrase.marks.map(({ at, cue }) => ({ at, run: () => {
            if(!narrationEnabled() || pena.response !== response && pena.shown !== response) return;
            const line = lineFor(cue);
            if(response.input && !line && !samePlacement(cue.positionFen, response.fen)) return;
            flash(response, text, cue.references, 1400, line);
        } }));
        pena.speech.say(phrase.text, pena.settings, () => {}, marks, {
            pauseBefore: phrase.pauseBefore || 0,
            minimumStartDelay: () => {
                const cue = phrase.marks[0]?.cue;
                if(!cue) return 0;
                const line = lineFor(cue);
                const frame = line?.frames[line.index];
                const target = frame ? line.before ? frame.beforeFen : frame.fen : response.fen;
                const delay = pena.teacher?.delayFor?.(target) || 0;
                const previous = pena.teacher?.position?.split('|')[0];
                // Long visual lifetimes should not turn a preview transition into a long silence.
                return line || previous && previous !== response.fen ? Math.min(delay, 1000) : delay;
            }
        });
    }
}

function streamSpeech(response, text) {
    if(!narrationEnabled()) return;
    if(response.idle) {
        if(pena.spokenOffset >= text.length) return;
        pena.spokenOffset = text.length;
        pena.speech.say(spokenText(text), pena.settings, () => {}, []);
        return;
    }
    const body = explanationBody(text);
    if(body.length <= pena.spokenOffset) return;
    const start = pena.spokenOffset;
    pena.spokenOffset = body.length;
    for(const sentence of sourceSentences(body.slice(start))) {
        const end = body.indexOf(sentence.text, start + sentence.index) + sentence.text.length;
        const context = body.slice(0, end);
        queueNarration(response, sentence.text, context, undefined, response.spokenCitations?.get(sentence.text) || []);
    }
}

function referenceSentence(response, text, context, cited = [], fen = response.analysisFen || response.fen) {
    const span = document.createElement('span');
    span.className = 'pena-sentence';
    const compiled = teachingFor(response, text, context, fen, cited);
    const cues = compiled.cues.map(cue => ({ ...cue }));
    for(const mention of glossaryMentions(text)) {
        const resolution = compiled.mentions.find(item => item.kind === 'concept' && item.index === mention.index);
        if(resolution?.status === 'not board-specific') continue;
        const resolved = resolution?.status === 'resolved';
        const citation = cited.find(item => item.id.startsWith('D:') && item.fact.term === mention.term)
            || (!resolved && hasDemo(mention.term)
                ? { id: `D:${demoId(mention.term)}`, fact: { term: mention.term } } : null);
        const existing = cues.find(cue => cue.index < mention.end && cue.end > mention.index);
        const definition = glossary[mention.term].meaning;
        if(existing) { existing.demo ||= citation; existing.definition = definition; }
        else cues.push({ index: mention.index, end: mention.end, references: EMPTY_REFERENCES, demo: citation, definition,
            positionFen: fen, status: resolution?.status || 'unsupported' });
    }
    let end = 0;
    for(const cue of bridgeLoneWords(text, cues)) {
        span.append(text.slice(end, cue.index));
        const term = document.createElement('span');
        term.className = 'pena-reference';
        term.textContent = text.slice(cue.index, cue.end);
        term.tabIndex = 0;
        const interactive = cue.demo || Object.values(cue.references).some(values => Array.isArray(values) && values.length);
        if(interactive) term.setAttribute('role', 'button');
        term.dataset.penaPosition = cue.positionFen || fen;
        term.dataset.penaResolution = cue.status || 'resolved';
        if(cue.definition) term.title = (cue.demo ? 'Example, not the live position: ' : '') + cue.definition;
        const owner = { term, response };
        let hovering = false, focusing = false;
        const show = (preview = false, persistent = false) => {
            const demo = cue.demo && pena.settings?.penaFollowLine && !response.event && preview;
            const line = preview || response.input && cue.positionFen !== fen
                ? followLine(response, text, context, cue, compiled) : null;
            if(response.input && !samePlacement(cue.positionFen, fen) && !line) return;
            const steps = demo ? citationSteps(cue.demo, response.fen)
                : [{ references: cue.references, line, duration: 2400 }];
            playSteps(response, term.textContent, steps.map(step => ({ ...step,
                duration: persistent ? step.duration : visualDuration(step.duration) })), persistent);
        };
        const enter = () => {
            if(pena.hover === owner) return;
            clearBoard();
            pena.hover = owner;
            show(false, true);
        };
        const leave = () => {
            if(!hovering && !focusing && pena.hover === owner) clearBoard();
        };
        term.addEventListener('pointerenter', event => {
            if(event.pointerType === 'touch') return;
            hovering = true;
            enter();
        });
        term.addEventListener('pointerleave', () => { hovering = false; leave(); });
        term.addEventListener('focus', () => {
            focusing = term.matches(':focus-visible');
            if(focusing) enter();
        });
        term.addEventListener('blur', () => { focusing = false; leave(); });
        term.addEventListener('pointerdown', () => { focusing = false; });
        term.addEventListener('click', () => show(true, hovering || focusing));
        term.addEventListener('keydown', event => {
            if(event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            focusing = true;
            enter();
            show(true, true);
        });
        span.append(term);
        end = cue.end;
    }
    span.append(text.slice(end));
    return span;
}

function renderText(response, text) {
    text = markdownPlain(text);
    if(concealed() || pena.instance?.currentFen !== response.fen) return;
    pena.shown = response;
    if(text === pena.text) { streamSpeech(response, text); return; }
    const atBottom = ui.log.scrollHeight - ui.log.scrollTop - ui.log.clientHeight < 35;
    ui.answer.hidden = !text.trim();
    const offset = pena.text && text.startsWith(pena.text) ? pena.text.length : 0;
    if(!offset) {
        ui.answer.replaceChildren();
        stopSpeech();
    }
    pena.text = text;
    streamSpeech(response, text);
    const sentences = new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text.slice(offset));
    ui.answer.append(...[...sentences].map(({ segment, index }) => {
        const context = text.slice(0, offset + index + segment.length);
        return referenceSentence(response, segment, context);
    }));
    if(atBottom) scrollToTurn();
}

function renderChecks(assessments) {
    const blocked = item => item.status === 'contradicted' || item.rejectedLine;
    const false_ = assessments.filter(blocked).length;
    const checked_ = assessments.filter(item => !blocked(item)
        && (item.status === 'verified' || item.moveChecks?.length)).length;
    ui.checks.hidden = !assessments.length;
    const checked = document.createElement('span');
    checked.className = 'pena-check-count';
    checked.innerHTML = ICONS.checked;
    const checkedLabel = document.createElement('span');
    setPenaText(checkedLabel, 'checkedCount', { count: checked_ });
    checked.append(checkedLabel);
    ui.checkSummary.replaceChildren(checked);
    if(false_) {
        const removed = document.createElement('span');
        removed.className = 'pena-check-count';
        removed.innerHTML = ICONS.removed;
        const removedLabel = document.createElement('span');
        setPenaText(removedLabel, 'removedCount', { count: false_ });
        removed.append(removedLabel);
        ui.checkSummary.append(removed);
    }
    ui.checkSummary.dataset.penaTitle = pena.settings?.penaCoaching !== false ? 'checksEnabled' : 'coachingUnchecked';
    ui.checkSummary.title = penaText(ui.checkSummary.dataset.penaTitle);
    ui.checkList.replaceChildren(...assessments.map(item => {
        const row = document.createElement('li');
        const wrong = Boolean(blocked(item));
        row.dataset.state = wrong ? 'removed' : item.shown ? 'shown' : 'skipped';
        row.textContent = item.source;
        const title = wrong || item.repairedTactic ? item.reason || 'contradictsBoard' : item.replacement
            ? 'replacedPick'
            : item.shown ? item.moveChecks?.length ? 'moveChecked' : 'shown' : item.omitted || 'skipped';
        row.dataset.penaTitle = title;
        row.title = penaText(title);
        return row;
    }));
}

async function evaluateForCoaching(fen, uci, isCurrent, depth) {
    pena.verifier ??= new MoveEvaluator(true, 'stockfish-18-lite-single');
    const verifier = pena.verifier;
    let timer;
    try {
        return await Promise.race([
            verifier.eval([uci.slice(0, 2), uci.slice(2, 4), uci[4]], { fen, depth, isCurrent }),
            new Promise((resolve, reject) => {
                timer = setTimeout(() => {
                    if(isCurrent()) verifier.cancelPending();
                    reject(new Error('Move checking took too long. Pena has held back the unchecked advice.'));
                }, 25000);
            })
        ]);
    } finally { clearTimeout(timer); }
}

async function present(response, data) {
    const final = data.phase === 'complete';
    const truncated = data.finishReason === 'length';
    ui.raw.textContent = data.text || '';
    if(!response.answer) {
        response.commentary ??= new CommentaryStream({ fen: response.fen, mode: response.event ? 'brief' : 'original',
            hideMove: Boolean(pena.settings.penaHideMoves), you: Boolean(response.you),
            previous: pena.memory.filter(item => item.fen === response.fen
                || !/\b(?:[a-h][1-8]|threat|check|mate|win|lose|must|avoid)\b/i.test(item.text)).map(item => item.text) });
    }
    const stream = response.answer?.stream || response.commentary;
    let result;
    const publish = checked => {
        result = checked;
        renderChecks(result.assessments);
        renderText(response, result.text);
    };
    if(pena.settings.penaCoaching !== false) {
        response.checks ??= new CoachingChecks({ fen: response.analysisFen, evaluate: evaluateForCoaching,
            depth: PENA_CHECK_DEPTH,
            isCurrent: () => pena.response === response && boardFen() === response.fen && !concealed() });
        await response.checks.update(stream, data.text || '', final, { truncated, onUpdate: (checked, options) => {
            publish(response.answer ? response.answer.update(data.text || '', options.complete, options) : checked);
        } });
    } else publish(response.answer ? response.answer.update(data.text || '', final, { truncated })
        : stream.update(data.text || '', final, { truncated }));
    if(final) {
        const reason = result.presentation?.emptyReason;
        if(!result.text) setStatus(reason === 'incomplete' ? 'answerLimit'
            : reason === 'withheld' ? result.assessments.some(item => item.rejectedLine) ? 'heldBack' : 'contradictsBoard'
                : 'nothingNew');
        else {
            setStatus('');
            if(!response.answer) rememberCommentary(pena.memory, result.text, response.fen);
        }
    }
}

async function drainPresentation(response) {
    if(response.presenting) return;
    response.presenting = true;
    try {
        while(pena.response === response && response.pending) {
            const data = response.pending;
            response.pending = null;
            await present(response, data);
            if(pena.response !== response) return;
            if(data.phase !== 'complete') continue;
            const stream = response.answer?.stream || response.commentary;
            const main = stream?.assessments.find(item => item.main && item.shown);
            if(!response.answer && main?.mainMove)
                pena.lastLive = { fen: response.fen, bestMove: main.mainMove, replaced: Boolean(main.replacement || main.blunder) };
            pena.response = null;
            setBusy(false);
            ui.thinking.hidden = true;
            if(data.finishReason === 'length') setStatus('answerLimit');
        }
    } catch(error) {
        if(pena.response !== response) return;
        cancel();
        ui.thinking.hidden = true;
        failure(error);
    } finally { response.presenting = false; }
}

function chatEngine() {
    const verifier = () => {
        if(pena.settings?.penaCoaching === false) throw new DOMException('Chess coaching is off.', 'AbortError');
        return pena.verifier ??= new MoveEvaluator(true, 'stockfish-18-lite-single');
    };
    return {
        lines: (fen, options) => verifier().lines(fen, options),
        compare: (...args) => verifier().compare(...args)
    };
}

// The game so far, read for the chat.
const sameSquares = (a, b) => a.split(' ').slice(0, 4).join(' ') === b.split(' ').slice(0, 4).join(' ');
const samePlacement = (a, b) => a.split(' ')[0] === b.split(' ')[0];

function gameFens(instance, fen) {
    try { return [...readPenaPosition(penaPosition(fen, instance.gameStateHistory).command, fen).history, fen]; }
    catch { return [fen]; }
}

const matching = (moves, fens) => {
    let count = 0;
    while(count < moves.length && count < fens.length - 1 && sameSquares(moves[count].beforeFen, fens[count])) count++;
    return count;
};

// The game so far is graded in the background, one search per new position, so questions about
// earlier moves have their answers ready. A takeback keeps the moves that still match.
function catchUpGame(instance, fen) {
    if(pena.settings?.penaCoaching === false || !pena.canChat || !pena.conversation) return null;
    const fens = gameFens(instance, fen);
    if(pena.game && !sameSquares(pena.game.start, fens[0])) {
        pena.game = null;
        pena.conversation.reset(fen);
    }
    const game = pena.game ??= { start: fens[0], moves: [], fens, queue: Promise.resolve() };
    game.fens = fens;
    game.queue = game.queue.then(async () => {
        if(pena.settings?.penaCoaching === false || pena.game !== game || game.fens !== fens) return;
        const moves = await gradeGame(chatEngine(), fens, { depth: 10, known: game.moves.slice(0, matching(game.moves, fens)) });
        if(pena.game === game) game.moves = moves;
    }).catch(error => console.warn('[Pena] Game grading stopped:', error));
    return game;
}

// Only questions about the past, their follow ups and a finished game wait for the grades.
async function gameTimeline(instance, fen, message) {
    const result = boardResult(fen);
    if(!result.over && !pastTopic(message) && !pena.conversation?.past?.previous) return null;
    const game = catchUpGame(instance, fen);
    if(!game) return null;
    await Promise.race([game.queue, new Promise(resolve => setTimeout(resolve, 20000))]);
    const moves = game.moves.slice(0, matching(game.moves, game.fens));
    return moves.length ? { moves, result } : null;
}

const openingName = instance => instance?.instanceElem?.querySelector('.instance-opening-container span')?.textContent?.trim() || null;

// Facts on the live board light up together. Lines and demo boards then play one move at a time.
function chatSteps(response, cited, text = '', preview = false, context = text) {
    const follow = Boolean(pena.settings?.penaFollowLine);
    const references = text ? cueFor(response, text, context) : null;
    const steps = references ? [{ line: null, references, duration: 2400 }] : [];
    if(preview && follow && !response.event) {
        const frames = teachingFor(response, text, context).frames;
        const offset = context.endsWith(text) ? context.length - text.length : 0;
        for(const [index, frame] of frames.entries()) {
            if(frame.index < offset || frame.beforeFen === response.fen) continue;
            steps.push({ line: { frames, index, before: true }, duration: 1300,
                references: { ...EMPTY_REFERENCES, moves: [[frame.from, frame.to]], frames: [frame] } });
        }
    }
    const requestedDemo = cited.every(citation => citation.id.startsWith('D:'))
        && /\b(?:what|explain|show|mean|define)\b/i.test(response.question || '');
    if(follow && !response.event && text && (preview || requestedDemo)) {
        for(const citation of cited) {
            if(citation.id.startsWith('D:') && text.toLowerCase().includes(citation.fact.term.toLowerCase())
                || /^H\d$/.test(citation.id) && preview && moveMentions(text).length)
                steps.push(...citationSteps(citation, response.fen));
        }
    }
    return steps.map(step => ({ ...step, duration: visualDuration(step.duration) }));
}

function playSteps(response, text, steps, persistent = false) {
    clearTimeout(pena.stepTimer);
    if(!steps.length) { clearBoard(true); return; }
    const lines = steps.some(step => step.line);
    const wait = step => step.duration;
    pena.stepsEnd = lines ? Date.now() + steps.reduce((total, step) => total + wait(step), 0) : 0;
    let index = 0;
    const next = () => {
        if(pena.shown !== response) return;
        if(index >= steps.length) {
            if(lines && !persistent) clearBoard();
            return;
        }
        const step = steps[index++];
        flash(response, text, step.references, step.duration, step.line, persistent);
        if(!persistent || index < steps.length) pena.stepTimer = setTimeout(next, wait(step));
    };
    next();
}

function chatSentenceContext(response, sentences, index) {
    const fenOf = sentence => sentence.analysisFen || response.analysisFen || response.fen;
    const fen = fenOf(sentences[index]);
    let start = index;
    while(start > 0 && fenOf(sentences[start - 1]) === fen) start--;
    return sentences.slice(start, index + 1).map(sentence => sentence.text.trim()).join(' ');
}

function renderChatAnswer(response, checked) {
    if(concealed() || boardFen() !== response.fen) return;
    pena.shown = response;
    pena.text = checked.text;
    ui.answer.hidden = !checked.text.trim();
    ui.answer.replaceChildren(...checked.sentences.map((sentence, index) => {
        const context = chatSentenceContext(response, checked.sentences, index);
        const span = referenceSentence(response, markdownPlain(sentence.text), context, sentence.citations,
            sentence.analysisFen || response.analysisFen || response.fen);
        if(index) span.prepend(' ');
        return span;
    }));
    scrollToTurn();
}

function speakChat(response, checked) {
    checked.sentences.forEach((sentence, index) => {
        const context = chatSentenceContext(response, checked.sentences, index);
        const analysisFen = sentence.analysisFen || response.analysisFen || response.fen;
        queueNarration(response, markdownPlain(sentence.text), context, analysisFen, sentence.citations);
    });
}

function finishChat(response, data) {
    const { prepared } = response;
    const options = { record: prepared.record, player: response.question, history: prepared.history };
    let raw = response.hideLines ? withoutLines(data.raw) : data.raw;
    let withheld = false, allWithheld = false;
    if(response.hideMoves) {
        const played = response.beforeFen && findPlayedMove(response.beforeFen, response.fen);
        const filtered = hideMoveSuggestions(raw, { playedSan: played?.san, fen: response.fen, playerColor: response.playerColor });
        raw = filtered.text;
        withheld = filtered.withheld;
        allWithheld = withheld && !response.event && !raw.trim();
        if(allWithheld) raw = penaText('keepMoveReply');
    }
    let checked = assessChatReply(raw, prepared.sheet, options);
    if(response.event) checked = assessChatReply(checked.sentences
        .filter(sentence => moveMentions(sentence.text).length <= 1).slice(0, 2)
        .map(sentence => sentence.tagged).join(' '), prepared.sheet, options);
    const removed = [...(response.hideMoves ? [] : data.quality?.removed || []), ...checked.removed]
        .filter((item, index, all) => all.findIndex(other => other.sentence === item.sentence && other.reason === item.reason) === index);
    if(checked.tagged.trim()) pena.conversation?.remember(prepared, checked.tagged);
    checked = conceptVisuals(checked, prepared.sheet, { ...(response.event ? { maxDemos: 0 } : {}), hideMoves: response.hideMoves });
    pena.withheldMoveFen = withheld || response.keepMoveOffer ? response.fen : null;
    pena.lastChat = { response, checked };
    pena.response = null;
    setBusy(false);
    ui.thinking.hidden = true;
    ui.raw.textContent = response.hideMoves ? raw : data.quality?.selectedRaw || data.raw || '';
    renderChecks([...checked.sentences.map(sentence => ({ status: sentence.status, shown: true, source: sentence.text.trim() })),
        ...removed.map(item => ({ status: 'contradicted', source: item.sentence, reason: item.reason }))]);
    renderChatAnswer(response, checked);
    quietAnswer(response, withheld);
    setStatus(!checked.text.trim() ? (response.event ? '' : withheld ? 'moveHidden' : 'contradictsBoard')
        : data.finishReason === 'length' ? 'answerLimit' : '');
    if(narrationEnabled() && pena.shown === response) speakChat(response, checked);
}

function chatEvent(response, data) {
    if(data.phase === 'complete') {
        try { finishChat(response, data); }
        catch(error) { cancel(); ui.thinking.hidden = true; failure(error); }
    }
}

function finishGroundedChat(response, data) {
    if(response.raw) {
        if(data.inputSchema !== 'pena-plain-chat/1') throw new Error('Plain model returned an unexpected reply format.');
        const text = String(data.raw || '').trim();
        if(/<\|(?:im_start|im_end|endoftext)\|>|<\/?think>/.test(text))
            throw new Error('The model emitted internal chat markup; answer withheld.');
        pena.response = null;
        pena.shown = response;
        setBusy(false);
        ui.raw.textContent = text;
        ui.answer.hidden = !text;
        ui.answer.replaceChildren(renderMarkdown(text));
        ui.checks.hidden = true;
        pena.text = markdownPlain(text);
        if(text) pena.idleTurns = [...pena.idleTurns, { player: response.question, pena: text }].slice(-6);
        setStatus('coachingUnchecked');
        streamSpeech(response, pena.text);
        scrollToTurn();
        return;
    }
    if(boardFen() !== response.fen || concealed()) return;
    // Markdown links keep only their words, so they aren't mistaken for evidence tags.
    const raw = presentComparisonAnswer(String(data.raw || '')).replace(/\[([^\]\n]+)\]\([^\s)]+\)/g, '$1');
    if(/<\|(?:im_start|im_end|endoftext)\|>|<\/?think>/.test(raw))
        throw new Error('Pena emitted internal model markup; answer withheld.');
    const plain = data.inputSchema === 'pena-plain-chat/1' && response.idle;
    if(!plain && !['pena-v2-pcf-coaching-input/3', 'pena-v2-english-coaching-input/1'].includes(data.inputSchema) || !Array.isArray(data.definedIds)
        || data.definedIds.some(id => typeof id !== 'string' || !id || /[\]\r\n]/.test(id)))
        throw new Error('Pena did not report the exact PCF evidence references; answer withheld.');
    const known = new Set(data.definedIds);
    const unknown = [...raw.matchAll(/\[([^\]\n]+)\]/g)].filter(match => !known.has(match[1]));
    const citationLike = id => /^(?:[A-Z]+\d+(?:[.:][A-Za-z0-9_-]+)*|[A-Z][.:][A-Za-z0-9_.:-]+|[A-Z][A-Z0-9]*_[A-Z0-9_]+)$/.test(id);
    let cleanHistory = raw.replace(/[ \t]*\[([^\]\n]+)\]/g,
        (match, id) => !known.has(id) && citationLike(id) ? '' : match);
    pena.response = null;
    pena.shown = response;
    setBusy(false);
    // Known tags ride along as invisible markers so each sentence keeps the exact lines it cited.
    const { marked, ids: citedIds } = markCitations(raw, id => known.has(id));
    // Free prose is not verified by the former Queen citation/repair pipeline.
    let formatted = marked.replace(/[ \t]*\[([^\]\n]+)\]/g,
        (match, id) => citationLike(id) ? '' : match).trim();
    let withheld = false, allWithheld = false;
    const boardRemoved = [];
    if(response.hideMoves) {
        const played = response.beforeFen && findPlayedMove(response.beforeFen, response.fen);
        const filtered = hideMoveSuggestions(formatted, { playedSan: played?.san, fen: response.fen, playerColor: response.playerColor });
        formatted = filtered.text;
        withheld = filtered.withheld;
        // A question deserves an answer, even when the whole answer was the move.
        allWithheld = withheld && !response.event && !formatted.replace(markerPattern, '').trim();
        if(allWithheld) formatted = penaText('keepMoveReply');
    }
    // A piece named on a square it no longer stands on belongs to an older board. Those sentences go.
    if(!plain && !allWithheld) {
        const board = { fen: response.fen, beforeFen: response.beforeFen, playerColor: response.playerColor };
        const checked = { ...board, question: response.event ? '' : response.question };
        const placed = dropMisplacedPieces(formatted, checked);
        boardRemoved.push(...placed.removed);
        formatted = placed.text;
        cleanHistory = dropMisplacedPieces(cleanHistory, checked).text;
        // And sentences whose guard, line or pin claims don't match the real board geometry.
        const geometry = dropFalseGeometry(formatted, checked);
        boardRemoved.push(...geometry.removed);
        formatted = geometry.text;
        cleanHistory = dropFalseGeometry(cleanHistory, checked).text;
        // So do sentences copied word for word from what was said at another position.
        const older = (pena.saidBefore || []).filter(item => !sameSquares(item.fen, response.fen)).map(item => item.text);
        formatted = dropRepeatedSentences(formatted, older).text;
        cleanHistory = dropRepeatedSentences(cleanHistory, older).text;
        // Who is winning is left out unless the player asked. Other features already show that.
        const asked = response.event ? '' : response.question;
        formatted = dropUnaskedVerdicts(formatted, asked).text;
        cleanHistory = dropUnaskedVerdicts(cleanHistory, asked).text;
    }
    pena.withheldMoveFen = withheld || response.keepMoveOffer ? response.fen : null;
    const unmarked = formatted.replace(markerPattern, '');
    ui.raw.textContent = response.hideMoves ? unmarked : raw;
    const spoken = stripMarkers(markdownPlain(formatted), citedIds);
    pena.text = spoken.clean;
    const factsFor = citationResolver(response);
    response.spokenCitations = new Map(sentenceCitations(spoken.clean, spoken.marks)
        .map(sentence => [sentence.text, factsFor(sentence.ids)]));
    ui.answer.hidden = !pena.text.trim();
    ui.answer.replaceChildren(renderMarkdown(formatted));
    const walker = document.createTreeWalker(ui.answer, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    const pieces = [];
    let context = '';
    const marks = [];
    for(const node of nodes) {
        // Lines and blocks stay apart, so sentences never merge across paragraphs.
        const block = node.parentElement?.closest('p, li, pre');
        if(context && (block !== pieces.at(-1)?.block || node.previousSibling?.nodeName === 'BR')) context += '\n';
        const stripped = stripMarkers(node.data, citedIds, context.length);
        pieces.push({ node, block, start: context.length, text: stripped.clean });
        marks.push(...stripped.marks);
        context += stripped.clean;
    }
    const sentences = sentenceCitations(context, marks);
    for(const { node, start, text } of pieces) {
        if(response.idle || !text.trim()) { node.data = text; continue; }
        // Each sentence gets its own cues and citations, so later sentences draw as well as the first.
        const fragment = document.createDocumentFragment();
        let at = 0;
        const loose = (from, to) => fragment.append(text.slice(from, to).trim()
            ? referenceSentence(response, text.slice(from, to), context.slice(0, start + to)) : text.slice(from, to));
        for(const sentence of sentences) {
            const from = Math.max(sentence.index, start) - start, to = Math.min(sentence.end, start + text.length) - start;
            if(to <= from || to <= at) continue;
            if(from > at) loose(at, from);
            fragment.append(referenceSentence(response, text.slice(Math.max(from, at), to), context.slice(0, start + to), factsFor(sentence.ids)));
            at = to;
        }
        if(at < text.length) loose(at, text.length);
        node.replaceWith(fragment);
    }
    if(unknown.length) {
        const warning = document.createElement('span');
        warning.className = 'pena-evidence-warning';
        warning.tabIndex = 0;
        warning.setAttribute('role', 'img');
        warning.dataset.penaLabel = warning.dataset.penaTitle = 'unknownEvidenceWarning';
        warning.setAttribute('aria-label', penaText('unknownEvidenceWarning'));
        warning.title = penaText('unknownEvidenceWarning');
        warning.innerHTML = ICONS.warning;
        ui.answer.append(warning);
    }
    if(boardRemoved.length) renderChecks(boardRemoved.map(source =>
        ({ status: 'contradicted', shown: false, source, reason: 'contradictsBoard' })));
    else ui.checks.hidden = true;
    quietAnswer(response, withheld);
    setStatus(!pena.text.trim() ? (response.event ? '' : withheld ? 'moveHidden' : boardRemoved.length ? 'contradictsBoard' : 'nothingNew')
        : plain ? (response.raw ? 'Plain Inkling · nothing is checked.' : 'Pena · plain chat.') : `Pena · ${pena.modelId || 'local model'} · PCF/3 · ${data.promptTokens} prompt tokens · generated advice is not verified.`
        + (data.finishReason === 'length' ? ' Reply reached its token limit.' : '')
        + (pena.groundedEngines?.maiaWarning ? ` ${pena.groundedEngines.maiaWarning}` : ''));
    if(cleanHistory.trim() && plain) pena.idleTurns = [...pena.idleTurns, { player: response.question, pena: cleanHistory }].slice(-6);
    else if(unmarked.trim()) pena.conversation.remember(response.prepared, response.hideMoves ? unmarked : cleanHistory);
    if(!plain && unmarked.trim()) pena.saidBefore = [...(pena.saidBefore || []), { fen: response.fen, text: unmarked }].slice(-8);
    streamSpeech(response, pena.text);
    scrollToTurn();
}

// Only what Pena's app notes need, read when the player asks about A.C.A.S or the match.
async function appSnapshot(instance, response) {
    const running = new Set(Object.keys(instance.pV || {}));
    let profiles = [];
    try { profiles = (await GET_PROFILES(instance.instanceID)).filter(Boolean); } catch {}
    const summaries = profiles.map(profile => profileSummary(profile.name, profile.config, running.has(profile.name)));
    const active = summaries.filter(summary => summary.enabled);
    return {
        profiles: active.length ? active : summaries.slice(0, 1),
        others: summaries.filter(summary => !active.includes(summary)).map(summary => summary.name),
        pena: { ...pena.settings },
        match: { site: instance.domain, color: response.playerColor || instance.boardState?.playerColor,
            variant: instance.activeVariant || instance.detectedChessVariant, fen: response.fen }
    };
}

async function converse(response, instance) {
    pena.response = response;
    response.controller = new AbortController();
    response.moveRequested = !response.event && asksForMove(response.question, { offeredMove: pena.withheldMoveFen === response.fen });
    response.keepMoveOffer = pena.withheldMoveFen === response.fen && !response.moveRequested
        && /^(?:what|why|huh|sorry|pardon)[.!?]*$/i.test(String(response.question || '').trim());
    response.hideMoves = Boolean(pena.settings?.penaHideMoves && !response.moveRequested);
    const question = response.moveRequested && !asksForMove(response.question)
        ? `${response.question}\nShow me the move you held back for this position, with a short explanation.`
        : response.question;
    ui.thought.textContent = '';
    setBusy(true);
    ui.thinking.hidden = false;
    // Small talk skips the board evidence, which takes far longer to read than the reply takes to write.
    // With chess coaching off every question goes to plain Inkling the same way.
    const raw = pena.settings?.penaCoaching === false;
    if(raw || response.idle || response.chat && !response.moveRequested && isSmallTalk(response.question)) {
        response.board = !response.idle;
        response.raw = raw;
        response.idle = true;
        response.hideMoves = false;
        plainChat(response);
        return;
    }
    const position = penaPosition(response.fen, instance.gameStateHistory);
    let history = [];
    try { history = readPenaPosition(position.command, response.fen).history; } catch {}
    if(response.beforeFen && history.at(-1) !== response.beforeFen
        && findPlayedMove(response.beforeFen, response.fen)) history = [...history, response.beforeFen];
    response.beforeFen = history.at(-1);
    response.history = history;
    try {
        const timeline = await gameTimeline(instance, response.fen, question);
        if(pena.response !== response) return;
        response.prepared = await pena.conversation.prepare(question, { fen: response.fen, history, playerColor: response.playerColor,
            snapshot: () => appSnapshot(instance, response), timeline, opening: openingName(instance) });
    } catch(error) {
        if(pena.response !== response) return;
        cancel();
        ui.thinking.hidden = true;
        failure(error);
        return;
    }
    if(pena.response !== response || boardFen() !== response.fen) return;
    if(response.prepared.directReply) {
        finishChat(response, { raw: response.prepared.directReply, tokens: 0, finishReason: 'stop' });
        setStatus('localReply');
        return;
    }
    try {
        if(!pena.groundedEngines) {
            pena.groundedEngines = new LiveCoachingEvidence();
            pena.groundedReady = pena.groundedEngines.initialize(message => setStatus(message));
        }
        await pena.groundedReady;
        if(pena.response !== response) return;
        setStatus('collectingEvidence');
        const evidenceStart = performance.now();
        const engineEvidence = await pena.groundedEngines.collect(response.fen, history, response.controller.signal);
        response.timing = { evidenceMs: performance.now() - evidenceStart };
        if(pena.response !== response || boardFen() !== response.fen) return;
        response.input = await liveCoachingInput({ prepared: response.prepared, fen: response.fen, history,
            playerColor: response.playerColor, question, engineEvidence });
        if(pena.response !== response) return;
        setStatus('generatingCoaching');
        const s = pena.settings || {};
        response.timing.posted = performance.now();
        pena.worker.postMessage({ type: 'converse', chatId: response.chatId, input: response.input,
            history, playerColor: response.playerColor, automatic: Boolean(response.event),
            hideMoves: response.hideMoves,
            moveRequested: response.moveRequested,
            effort: s.penaEffort, thinkingTokens: s.penaThinkingTokens, temperature: s.penaTemperature, prompt: promptOverridesFrom(s) });
    } catch(error) {
        if(pena.response !== response) return;
        cancel();
        failure(error);
    }
}

// With no board open Pena just chats. No engines, no position notes.
function plainChat(response) {
    const s = pena.settings || {};
    if(response.raw) {
        setStatus('chattingRaw');
        pena.idleApp = null;
        pena.worker.postMessage({ type: 'converse', plain: true, raw: true, chatId: response.chatId, input: { question: response.question },
            conversation: pena.idleTurns, history: [],
            effort: s.penaEffort, thinkingTokens: s.penaThinkingTokens, temperature: s.penaTemperature, prompt: promptOverridesFrom(s) });
        return;
    }
    setStatus('chattingWithoutBoard');
    // With no board, the usage guide and Pena's own settings are all he can look at.
    const app = appNotes(response.question, { pena: s }, { previous: pena.idleApp });
    pena.idleApp = app.text ? { topics: app.topics, usage: app.usage } : null;
    pena.worker.postMessage({ type: 'converse', plain: true, chatId: response.chatId, input: { question: response.question },
        board: Boolean(response.board), conversation: pena.idleTurns, history: [], notes: app.text.replace(/\[[SGUP]\d\] /g, '- '), effort: s.penaEffort, thinkingTokens: s.penaThinkingTokens,
        temperature: s.penaTemperature, prompt: promptOverridesFrom(s) });
}

// Chat notes take a few engine searches, so they start while the player is still thinking.
function warmConversation(instance, fen) {
    if(pena.settings?.penaCoaching === false || !pena.canChat || !pena.conversation) return;
    let history = [];
    try { history = readPenaPosition(penaPosition(fen, instance.gameStateHistory).command, fen).history; } catch {}
    pena.conversation.analyse(fen, history).catch(() => {});
}

// Only the tail of the reasoning shows, faded, so the player sees what Pena is chewing on.
function showThought(response, text) {
    response.thought = `${response.thought || ''}${text || ''}`.slice(-400);
    const tail = response.thought.replace(/\s+/g, ' ').trim();
    const shown = tail.length > 140 ? `\u2026${tail.slice(-140).replace(/^\S*\s/, '')}` : tail;
    ui.thought.textContent = shown ? `\u200e${shown}\u200e` : '';
}

// Reading a long board prompt is the slow part, so the player sees it move and the console gets the numbers.
function showPrefill(response, { processed, total }) {
    if(!(total > 0)) return;
    if(processed < total) {
        setStatus(response.idle ? 'readingMessageProgress' : 'readingBoardProgress',
            { percent: Math.round(100 * processed / total) });
        return;
    }
    setStatus('');
    const timing = response.timing;
    if(!timing?.posted || timing.logged) return;
    timing.logged = true;
    const seconds = (performance.now() - timing.posted) / 1000;
    console.info(`[Pena] Engines took ${(timing.evidenceMs / 1000).toFixed(1)} s. Read ${total} prompt tokens in ${seconds.toFixed(1)} s (${Math.round(total / seconds)} tokens/s).`);
}

function handleEvent(data) {
    if(data.phase === 'loading') { showLoading(data.progress); return; }
    const response = pena.response;
    if(!response || data.chatId !== response.chatId) return;
    if(boardFen() !== response.fen) { tick(); return; }
    if(data.mode === 'grounded' && data.phase === 'complete') {
        try { finishGroundedChat(response, data); } catch(error) { cancel(); failure(error); }
        return;
    }
    if(data.phase === 'thought') { if(!response.hideMoves) showThought(response, data.text); return; }
    if(data.phase === 'prefill') { showPrefill(response, data); return; }
    if(data.mode === 'converse' && data.phase !== 'thinking' && data.phase !== 'failed') { chatEvent(response, data); return; }
    if(data.phase === 'thinking') {
        setBusy(true);
        if(!response.question) setStatus('');
        ui.thinking.hidden = false;
    } else if(data.phase === 'text' || data.phase === 'complete') {
        response.pending = data;
        void drainPresentation(response);
    } else if(data.phase === 'failed') {
        ui.thinking.hidden = true;
        cancel();
        if(/cancel|replaced/i.test(data.message)) return;
        // A lost or full GPU will not recover on its own, so stop instead of failing on every move.
        if(/OutOfMemory|out of memory|CreateCommittedResource|device (?:was )?(?:lost|removed)|Device removed/i.test(data.message)) {
            failWorker(new Error(data.message));
        } else failure(new Error(data.message));
    }
}

function showLoading(progress) {
    if(typeof progress?.progress === 'number') {
        const percent = Math.round(Math.max(0, Math.min(1, progress.progress)) * 100);
        setState('loading');
        ui.status.classList.add('is-setup');
        setStatus(progress.text || 'preparing');
        ui.loading.hidden = false;
        ui.loadingBar.style.width = `${percent}%`;
        setPenaText(ui.loadingText, progress.text);
        return;
    }
    const ratio = progress?.total ? Math.min(1, progress.received / progress.total) : 0;
    const percent = Math.round(ratio * 100);
    const stage = progress.received < 16 ? 'readingBoard'
        : progress.received < 60 ? 'loadingExplanation' : 'warmingGpu';
    setState('loading');
    ui.status.classList.add('is-setup');
    setStatus(stage);
    ui.loading.hidden = false;
    ui.loadingBar.style.width = `${percent}%`;
    setPenaText(ui.loadingText, stage);
}

function runSetupAction() {
    if(pena.setupAction === 'reconnect') {
        if(pena.enabled) startWorker().catch(failure);
        return;
    }
    if(pena.worker && pena.setupAction) {
        pena.worker.postMessage({ type: pena.setupAction });
        return;
    }
}

async function startWorker() {
    stopWorker();
    setState('unavailable');
    ui.status.classList.add('is-setup');
    setStatus('connectingLocalServer');
    if(!pena.enabled || isMobileDevice()) return;
    const worker = new Worker(new URL('./app-worker.js', import.meta.url), { type: 'module' });
    pena.worker = worker;
    worker.onmessage = ({ data }) => {
        if(pena.worker !== worker) return;
        if(data?.type === 'pena') handleEvent(data);
        else if(data?.type === 'serverVersion') reportServerVersion(data.version);
        else if(data?.type === 'ready') {
            ui.loading.hidden = true;
            ui.setup.hidden = true;
            ui.status.classList.remove('is-error', 'is-setup');
            pena.setupAction = null;
            setStatus('');
            pena.modelId = data.model;
            pena.canChat = Boolean(data.canChat);
            // Only the loaded model tokenizer gates context, after the complete production builder.
            pena.conversation = pena.canChat ? new PenaConversation({ engine: chatEngine(), tokenCount: () => 0 }) : null;
            setState('ready');
            pena.fen = null;
            tick();
        } else if(data?.type === 'connection') {
            const interrupted = Boolean(pena.response?.question);
            cancel();
            pena.canChat = false;
            const view = setupView(data);
            pena.setupAction = view.action || null;
            setState(view.state);
            setStatus(view.text, view.values);
            ui.status.classList.toggle('is-error', Boolean(view.error));
            ui.status.classList.add('is-setup');
            ui.loading.hidden = view.progress === null || view.progress === undefined;
            if(!ui.loading.hidden) {
                ui.loadingBar.style.width = `${Math.round(view.progress * 100)}%`;
                setPenaText(ui.loadingText, '');
            }
            ui.setup.hidden = !view.action;
            if(view.action) setPenaText(ui.setup, view.actionLabel);
            if(interrupted) failure(new Error(data.error || penaText('serverDisconnected')));
        } else if(data?.type === 'error') {
            failWorker(new Error(data.message));
        }
    };
    worker.onerror = event => {
        if(pena.worker !== worker) return;
        failWorker(new Error(event.message || penaText('workerStopped')));
    };
    const s = pena.settings || {};
    const configuredPort = Number(localStorage.getItem('acasExternalEngineServerPort') || 2800);
    pena.serverPort = Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65535 ? configuredPort : 2800;
    worker.postMessage({ type: 'initialize', port: pena.serverPort, thinkingTokens: s.penaThinkingTokens, effort: s.penaEffort });
}

function failWorker(error) {
    stopWorker(false);
    setState('failed');
    failure(error);
    ui.status.classList.add('is-setup', 'is-error');
    pena.setupAction = 'reconnect';
    setPenaText(ui.setup, 'tryAgain');
    ui.setup.hidden = false;
}

function stopWorker(resetState = true) {
    stopMicrophone();
    cancel();
    pena.verifier?.terminate();
    pena.verifier = null;
    pena.canChat = false;
    pena.conversation = null;
    pena.worker?.terminate();
    pena.worker = null;
    pena.groundedEngines?.dispose();
    pena.groundedEngines = pena.groundedReady = null;
    ui.loading.hidden = true;
    ui.setup.hidden = true;
    ui.status.classList.remove('is-error', 'is-setup');
    pena.setupAction = null;
    ui.thinking.hidden = true;
    if(resetState) setState('off');
}

const PAUSED_TABS = 6, PAUSED_FOR = 30 * 60 * 1000;

// Leaving a tab, or losing its connection, puts its chat aside instead of throwing it away.
function pauseChat(instance) {
    if(!instance?.instanceID || !pena.fen) return;
    const log = [...ui.log.children].filter(node => node !== ui.setupPanel && node.textContent.trim());
    pena.paused.delete(instance.instanceID);
    pena.paused.set(instance.instanceID, { domain: instance.domain, at: Date.now(), fen: pena.fen, previousFen: pena.previousFen,
        settings: pena.settings, lastLive: pena.lastLive, memory: pena.memory, game: pena.game, lastChat: pena.lastChat,
        saidBefore: pena.saidBefore, conversation: pena.conversation?.save(), log, fens: gameFens(instance, pena.fen) });
    while(pena.paused.size > PAUSED_TABS) pena.paused.delete(pena.paused.keys().next().value);
}

// The same tab coming back with the same game gets its chat back. A board that didn't change gets no new comment.
function resumeChat(instance, fen) {
    const saved = pena.paused.get(instance.instanceID);
    pena.paused.delete(instance.instanceID);
    if(!saved || saved.domain !== instance.domain || Date.now() - saved.at > PAUSED_FOR) return false;
    // Only the same game continues. A new game that merely passes through the saved board starts fresh.
    const same = sameSquares(saved.fen, fen), fens = gameFens(instance, fen);
    const continues = saved.fens.length <= fens.length && saved.fens.every((item, index) => sameSquares(item, fens[index]));
    if(!continues && !(same && fens.length === 1)) return false;
    Object.assign(pena, { previousFen: saved.previousFen, settings: saved.settings, lastLive: saved.lastLive, memory: saved.memory,
        game: saved.game, lastChat: saved.lastChat, saidBefore: saved.saidBefore });
    pena.conversation?.restore(saved.conversation);
    ui.log.replaceChildren(ui.setupPanel, ...saved.log, ui.turn);
    scrollToTurn();
    if(!same) return false;
    pena.fen = pena.previousFen = fen;
    if(pena.state === 'ready') setStatus(pena.settings?.penaOnlyWhenAsked ? 'askAnytime' : '');
    return true;
}

function attach(instance) {
    cancel();
    clearBoard();
    pauseChat(pena.instance);
    pena.instance = instance;
    pena.fen = null;
    pena.previousFen = null;
    pena.withheldMoveFen = null;
    pena.lastLive = null;
    pena.memory = [];
    pena.game = null;
    pena.lastChat = null;
    pena.saidBefore = [];
    pena.conversation?.reset(null);
    resetAnswer();
    ui.log.replaceChildren(ui.setupPanel, ui.turn);
    if(!instance) {
        pena.teacher = null;
        pena.variation = null;
        if(pena.state === 'ready') setStatus('openMatch');
        return;
    }
    pena.teacher = new PenaTeacher(instance);
    pena.variation = new PenaVariation(instance, () => Boolean(pena.settings?.penaFollowLine), () => visualDuration(3000) + 3000);
    pena.teacher.showVariation = (frames, index, before) => pena.variation.show(frames, pena.fen, index, before);
}

// A fresh start: every message and everything Pena remembers from this chat is dropped.
function clearChat() {
    cancel();
    pena.idleTurns = [];
    pena.idleApp = null;
    pena.lastChat = null;
    pena.saidBefore = [];
    pena.paused.clear();
    pena.conversation?.reset(pena.fen);
    pena.withheldMoveFen = null;
    resetAnswer();
    ui.log.replaceChildren(ui.setupPanel, ui.turn);
    notice('');
    if(pena.state === 'ready') setStatus('');
    ui.input.focus();
}

function explain(response, positionCommand) {
    pena.response = response;
    setBusy(true);
    pena.worker.postMessage({ type: 'explain', chatId: response.chatId, fen: response.analysisFen, positionCommand });
}

async function onPosition(fen) {
    const instance = pena.instance;
    const previousFen = pena.previousFen;
    pena.previousFen = fen;
    pena.withheldMoveFen = null;
    cancel();
    const revision = pena.requestRevision;
    resetAnswer();
    if(previousFen && !sameSquares(previousFen, fen)
        && sameSquares(fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')) {
        pena.conversation?.reset(fen);
        pena.game = pena.lastChat = pena.lastLive = null;
        pena.saidBefore = [];
        pena.memory = [];
        ui.log.replaceChildren(ui.setupPanel, ui.turn);
    }
    if(pena.state !== 'ready' || concealed()) return;
    setStatus('');
    if(instance.detectedChessVariant && !/^(?:chess|standard)$/i.test(instance.detectedChessVariant)) {
        setStatus('standardOnly');
        return;
    }
    const settings = await getPenaPreferences(instance.instanceID);
    const playerColor = String(await instance.getPlayerColor()).toLowerCase()[0];
    if(pena.requestRevision !== revision || pena.fen !== fen || pena.instance !== instance || boardFen() !== fen) return;
    pena.settings = settings;
    const turn = fen.split(' ')[1];
    const position = penaPosition(fen, instance.gameStateHistory);
    const response = { chatId: crypto.randomUUID(), fen, analysisFen: fen, playerColor, event: true };
    catchUpGame(instance, fen);
    if(pena.settings.penaCoaching === false) {
        setStatus('askAnytime');
        return;
    }
    if(pena.settings.penaOnlyWhenAsked) {
        setStatus('askAnytime');
        warmConversation(instance, fen);
        return;
    }
    if(turn === playerColor) {
        if(pena.canChat && pena.conversation) {
            await converse({ ...response, question: positionEvent, chat: true }, instance);
            return;
        }
        response.you = true;
        explain(response, position.command);
        return;
    }
    // Right after your move, Pena reacts to it and shows what the opponent wants now.
    const played = previousFen && findPlayedMove(previousFen, fen);
    if(!played || played.color !== playerColor) {
        setStatus(turn === 'w' ? 'waitingWhite' : 'waitingBlack');
        warmConversation(instance, fen);
        return;
    }
    // With the chat model the comment is part of the conversation, so "why?" afterwards just works.
    if(pena.canChat && pena.conversation) {
        await converse({ ...response, beforeFen: previousFen, question: moveEvent(played.san), chat: true, event: true, hideLines: Boolean(pena.settings.penaHideMoves) }, instance);
        return;
    }
    const bestMove = pena.lastLive?.fen === previousFen && !pena.lastLive.replaced ? pena.lastLive.bestMove : null;
    const intent = moveIntent(previousFen, played, { yours: true, bestMove });
    response.answer = new QuestionAnswer(intent, { previous: pena.memory.map(item => item.text), checkedCoaching: true });
    renderText(response, response.answer.lead);
    explain(response, position.command);
}

async function ask(question) {
    const instance = askBoard();
    const fen = instance?.currentFen;
    if(!fen || pena.state !== 'ready') {
        notice(pena.state === 'loading' ? 'stillLoading' : pena.state === 'ready' ? 'matchRequired' : 'notLoaded');
        return;
    }
    cancel('', { keepAnalysis: pena.canChat });
    const revision = pena.requestRevision;
    // Chat notes for this position may already be on the way, so only stale coaching checks stop.
    if(pena.canChat) pena.verifier?.cancelStaleRequests();
    resetAnswer();
    const message = document.createElement('div');
    message.className = 'pena-message pena-message-user';
    message.textContent = question;
    ui.turn.insertBefore(message, ui.answer);
    scrollToTurn();
    pena.speechInterrupted = false;
    const settings = await getPenaPreferences(instance.instanceID);
    const playerColor = String(await instance.getPlayerColor()).toLowerCase()[0];
    if(pena.requestRevision !== revision || askBoard() !== instance || instance.currentFen !== fen) return;
    pena.settings = settings;
    if(pena.canChat && pena.conversation) {
        setStatus('');
        // "Say that again" replays the last answer instead of writing a new one.
        const last = pena.lastChat;
        if(isRepeatAsk(question) && last?.response.fen === fen) {
            renderChatAnswer(last.response, last.checked);
            if(narrationEnabled()) speakChat(last.response, last.checked);
            return;
        }
        await converse({ chatId: crypto.randomUUID(), fen, analysisFen: fen, question, playerColor, chat: true, idle: Boolean(instance.idle) }, instance);
        return;
    }
    let intent;
    try { intent = understandQuestion(question, fen, {
        bestMove: pena.lastLive?.fen === fen && !pena.lastLive.replaced ? pena.lastLive.bestMove : null
    }); }
    catch(error) { setStatus(error.message); return; }
    const response = { chatId: crypto.randomUUID(), fen, analysisFen: intent.analysisFen || fen, question, playerColor };
    response.answer = new QuestionAnswer(intent, { checkedCoaching: true });
    setStatus('');
    if(intent.move) flash(response, intent.move.san, { ...EMPTY_REFERENCES, moves: [[intent.move.from, intent.move.to]] }, 2200);
    if(response.answer.lead) renderText(response, response.answer.lead);
    if(!intent.analysisFen) return;
    let command;
    if(intent.kind === 'move') {
        const base = penaPosition(fen, instance.gameStateHistory).command;
        command = /\bmoves\b/.test(base) ? `${base} ${intent.uci}` : `${base} moves ${intent.uci}`;
    } else if(intent.kind === 'threat') command = `position fen ${intent.analysisFen}`;
    else command = penaPosition(fen, instance.gameStateHistory).command;
    explain(response, command);
}

async function refreshSettings(changedKey) {
    const instance = latestInstance();
    const settings = await getPenaPreferences(instance?.instanceID);
    const active = pena.response || pena.shown;
    const askedOnly = settings.penaOnlyWhenAsked && !pena.settings?.penaOnlyWhenAsked;
    const hideMoves = settings.penaHideMoves && !pena.settings?.penaHideMoves;
    if(askedOnly && (!active || active.event)
        || hideMoves && active && (active.event || !(active.moveRequested || asksForMove(active.question)))) {
        cancel();
        resetAnswer();
    }
    const checksChanged = pena.settings && settings.penaCoaching !== pena.settings.penaCoaching;
    if(checksChanged) {
        cancel();
        resetAnswer();
        pena.fen = null;
        pena.idleTurns = [];
    }
    if(!settings.penaCoaching) {
        pena.verifier?.terminate();
        pena.verifier = null;
        pena.groundedEngines?.dispose();
        pena.groundedEngines = pena.groundedReady = null;
        pena.game = null;
    }
    if(!settings.penaFollowLine) pena.variation?.clear();
    if(pena.settings && settings.penaSpeech !== pena.settings.penaSpeech) {
        stopSpeech();
        pena.speech?.unload?.();
        voiceProgress({ status: 'idle' });
        pena.speechUnavailable = false;
    }
    if(pena.settings && (settings.penaZonosVoice !== pena.settings.penaZonosVoice
        || settings.penaBrowserVoice !== pena.settings.penaBrowserVoice)) {
        stopSpeech();
        pena.speechUnavailable = false;
    }
    const startup = !pena.settings;
    pena.settings = settings;
    const enabled = Boolean(settings.penaEnabled) && !isMobileDevice();
    if(enabled !== pena.enabled) {
        pena.enabled = enabled;
        ui.window.hidden = !enabled;
        if(!enabled) {
            stopWorker();
            pena.speech?.unload?.();
            voiceProgress({ status: 'idle' });
            attach(null);
            pena.paused.clear();
            return;
        }
        restorePosition();
    }
    // The voice starts loading right away, alongside the model, so the first reply isn't kept waiting.
    if(settings.penaSpeech === 'neural' && (changedKey === 'penaSpeech'
        || (startup || changedKey === 'penaEnabled') && enabled && pena.readAloud)) {
        pena.speechUnavailable = false;
        pena.speech.prepare();
    }
    if(enabled && (!pena.worker || pena.serverPort !== Number(localStorage.getItem('acasExternalEngineServerPort') || 2800)))
        await startWorker();
}

function tick() {
    if(!pena.enabled) return;
    ui.window.classList.toggle('pena-concealed', concealed());
    if(concealed()) { if(pena.response || pena.text) { cancel(); resetAnswer(); } return; }
    const instance = latestInstance();
    if(instance !== pena.instance) attach(instance);
    const fen = instance?.currentFen;
    // The GUI board is normally built when an engine loads. Pena still needs it with every engine off.
    if(instance && !instance.environmentSetupRun && instance.boardState?.fen && window.ChessgroundX)
        instance.setupEnvironment(instance.boardState.fen, GET_BOARD_DIMENSIONS_FROM_FEN(instance.boardState.fen)).catch(console.error);
    if(!fen || fen === pena.fen) return;
    if(!pena.fen && resumeChat(instance, fen)) return;
    pena.fen = fen;
    onPosition(fen).catch(failure);
}

const COMPACT_QUERY = '(max-width: 700px), (pointer: coarse) and (max-width: 1100px)';
const compact = () => matchMedia(COMPACT_QUERY).matches;

function savedHeights() {
    try { return JSON.parse(localStorage.getItem(HEIGHT_KEY) || '{}') || {}; }
    catch(error) {
        console.error('Pena panel height could not be restored.', error);
        return {};
    }
}

function restorePosition() {
    const height = Number(savedHeights()[compact() ? 'compact' : 'desktop']);
    const maxHeight = Math.max(0, innerHeight - (compact() ? 8 : 16));
    ui.window.style.height = height > 0 ? `${Math.min(height, maxHeight)}px` : '';
    // On small screens Pena is a full width sheet, so a saved desktop spot would push it off screen.
    if(compact()) {
        ui.window.classList.remove('is-minimized');
        ui.minimize.setAttribute('aria-expanded', 'true');
        ui.window.style.width = '';
        ui.window.style.left = ui.window.style.top = '';
        ui.window.classList.remove('is-dragged');
        return;
    }
    try {
        const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
        if(!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) return;
        if(Number.isFinite(saved.width) && saved.width > 0)
            ui.window.style.width = `${Math.max(Math.min(MIN_WIDTH, innerWidth - 16), Math.min(saved.width, innerWidth - 16))}px`;
        const rect = ui.window.getBoundingClientRect();
        const left = Math.max(0, Math.min(saved.left, innerWidth - rect.width));
        const top = Math.max(0, Math.min(saved.top, innerHeight - rect.height));
        ui.window.style.left = `${left}px`;
        ui.window.style.top = `${top}px`;
        ui.window.classList.add('is-dragged');
    } catch(error) {
        console.error('Pena panel position could not be restored.', error);
    }
}

function savePosition(rect = ui.window.getBoundingClientRect()) {
    try {
        localStorage.setItem(POSITION_KEY, JSON.stringify({ left: rect.left, top: rect.top, width: rect.width ?? ui.window.getBoundingClientRect().width }));
    } catch(error) {
        console.error('Pena panel position could not be saved.', error);
    }
}

function pin() {
    const rect = ui.window.getBoundingClientRect();
    ui.window.style.left = `${rect.left}px`;
    ui.window.style.top = `${rect.top}px`;
    ui.window.classList.add('is-dragged');
}

function pointerGesture(target, { start, move, end }) {
    let active = null;
    target.addEventListener('pointerdown', event => {
        if(event.button !== 0 || (target === ui.header && event.target.closest('button'))) return;
        active = { id: event.pointerId, state: start(event) };
        if(!active.state) { active = null; return; }
        target.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    target.addEventListener('pointermove', event => {
        if(active && event.pointerId === active.id) move(event, active.state);
    });
    const stop = event => {
        if(!active || event.pointerId !== active.id) return;
        const { state } = active;
        active = null;
        end(state);
    };
    target.addEventListener('pointerup', stop);
    target.addEventListener('pointercancel', stop);
}

function resizeTo(height, top = ui.window.getBoundingClientRect().top) {
    const limit = compact() ? innerHeight - 8 : innerHeight - top - 8;
    ui.window.style.height = `${Math.round(Math.max(Math.min(MIN_HEIGHT, limit), Math.min(height, limit)))}px`;
}

function saveHeight() {
    try {
        localStorage.setItem(HEIGHT_KEY, JSON.stringify({ ...savedHeights(),
            [compact() ? 'compact' : 'desktop']: ui.window.getBoundingClientRect().height }));
    } catch(error) {
        console.error('Pena panel height could not be saved.', error);
    }
}

function makeDraggable() {
    // The compact sheet keeps a small resize grip in place of its header.
    pointerGesture(ui.header, {
        start(event) {
            const rect = ui.window.getBoundingClientRect();
            if(compact()) return ui.window.classList.contains('is-minimized') ? null : { sheet: true, y: event.clientY, height: rect.height };
            ui.window.classList.add('is-dragged');
            return { x: event.clientX - rect.left, y: event.clientY - rect.top };
        },
        move(event, state) {
            if(state.sheet) return resizeTo(state.height - (event.clientY - state.y));
            const rect = ui.window.getBoundingClientRect();
            ui.window.style.left = `${Math.max(0, Math.min(event.clientX - state.x, innerWidth - rect.width))}px`;
            ui.window.style.top = `${Math.max(0, Math.min(event.clientY - state.y, innerHeight - rect.height))}px`;
        },
        end(state) {
            if(state.sheet) return saveHeight();
            savePosition();
        }
    });
    pointerGesture(ui.sheetResize, {
        start(event) {
            return { y: event.clientY, height: ui.window.getBoundingClientRect().height };
        },
        move(event, state) { resizeTo(state.height - (event.clientY - state.y)); },
        end: saveHeight
    });
    ui.sheetResize.addEventListener('keydown', event => {
        if(!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        resizeTo(ui.window.getBoundingClientRect().height + (event.key === 'ArrowUp' ? 10 : -10));
        saveHeight();
    });
    const resizeCorner = (corner, rect, dx, dy) => {
        const maxHeight = Math.max(0, innerHeight - rect.top - 8);
        const height = Math.min(maxHeight, Math.max(Math.min(MIN_HEIGHT, maxHeight), rect.height + dy));
        ui.window.style.height = `${height}px`;
        if(corner === 'left') {
            const left = Math.max(0, Math.min(rect.right - Math.min(MIN_WIDTH, rect.right), rect.left + dx));
            ui.window.style.left = `${left}px`;
            ui.window.style.width = `${rect.right - left}px`;
        } else {
            const maxWidth = Math.max(0, innerWidth - rect.left - 8);
            ui.window.style.width = `${Math.min(maxWidth, Math.max(Math.min(MIN_WIDTH, maxWidth), rect.width + dx))}px`;
        }
    };
    ui.resize.forEach(handle => {
        const corner = handle.dataset.corner;
        pointerGesture(handle, {
            start(event) {
                if(ui.window.classList.contains('is-minimized')) return null;
                pin();
                const rect = ui.window.getBoundingClientRect();
                return { x: event.clientX, y: event.clientY, rect };
            },
            move: (event, state) => resizeCorner(corner, state.rect, event.clientX - state.x, event.clientY - state.y),
            end() {
                saveHeight();
                savePosition();
            }
        });
        handle.addEventListener('keydown', event => {
            if(!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            pin();
            const dx = event.key === 'ArrowLeft' ? -10 : event.key === 'ArrowRight' ? 10 : 0;
            const dy = event.key === 'ArrowUp' ? -10 : event.key === 'ArrowDown' ? 10 : 0;
            resizeCorner(corner, ui.window.getBoundingClientRect(), dx, dy);
            saveHeight();
            savePosition();
        });
    });
    matchMedia(COMPACT_QUERY).addEventListener('change', restorePosition);
    window.addEventListener('resize', () => {
        if(ui.window.hidden) return;
        if(compact()) {
            restorePosition();
            return;
        }
        if(!ui.window.classList.contains('is-dragged')) return;
        const width = ui.window.getBoundingClientRect().width;
        if(width > innerWidth - 16) ui.window.style.width = `${Math.max(0, innerWidth - 16)}px`;
        const rect = ui.window.getBoundingClientRect();
        const left = Math.max(0, Math.min(rect.left, innerWidth - rect.width));
        const top = Math.max(0, Math.min(rect.top, innerHeight - rect.height));
        ui.window.style.left = `${left}px`;
        ui.window.style.top = `${top}px`;
        savePosition({ left, top });
    });
}

function createWindow() {
    const element = document.createElement('section');
    element.id = 'pena-window';
    element.className = 'pena-window';
    element.dataset.runtime = 'local-server';
    element.hidden = true;
    element.dataset.penaLabel = 'settingsTitle';
    element.innerHTML = `
        <div class="floaty-container pena-container">
            <button type="button" class="pena-sheet-resize" data-pena-label="resize" data-pena-title="resize" aria-label="Resize Pena" title="Resize Pena"></button>
            <header class="floaty-header pena-window-header">
                <div class="pena-heading">
                    <span class="pena-title" data-pena-title="settingsTitle">AI</span>
                    <span class="pena-beta">BETA</span>
                </div>
                <button type="button" class="pena-icon-btn pena-clear" data-pena-label="clearChat" data-pena-title="clearChat" aria-label="New chat" title="New chat">${ICONS.clear}</button>
                <button type="button" class="pena-icon-btn pena-read-aloud" data-pena-label="readAloud" data-pena-title="readAloud" aria-label="Read aloud" title="Read aloud" aria-pressed="false">${ICONS.speaker}</button>
                <button type="button" class="pena-icon-btn pena-minimize" data-pena-label="minimize" aria-label="Minimize Pena" aria-expanded="true">${ICONS.minimize}</button>
            </header>
            <div class="floaty-body pena-window-body">
                <div class="pena-voice-progress" hidden>
                    <progress data-pena-label="voiceProgress" aria-label="Pena voice loading"></progress>
                    <div role="status" aria-live="polite"></div>
                </div>
                <div class="pena-chat-log" role="log" aria-live="polite">
                <div class="pena-setup-panel">
                    <span class="pena-feedback" role="status" aria-live="polite" hidden></span>
                    <div class="pena-loading" hidden><div class="pena-loading-track"><span></span></div><p></p></div>
                    <button type="button" class="acas-fancy-button pena-setup" hidden></button>
                </div>
                <div class="pena-turn"><div class="pena-answer pena-message pena-message-assistant" hidden></div>
                <div class="pena-answer-meta">
                    <div class="pena-thinking" hidden aria-hidden="true"><span></span><span></span><span></span><small class="pena-thought"></small></div>
                    <details class="pena-checks" hidden><summary></summary><ul></ul></details>
                </div>
                </div></div>
                <div class="pena-raw" hidden></div>
                <p class="pena-language-note" data-pena-english-note data-pena-text="englishOnly" hidden>Coaching and chat are English only</p>
                <p class="pena-notice" role="alert" hidden></p>
                <form class="pena-question-form" autocomplete="off" data-lpignore="true" data-1p-ignore data-bwignore data-form-type="other">
                    <input type="text" maxlength="500" autocomplete="off" autocorrect="off" spellcheck="false" writingsuggestions="false" data-lpignore="true" data-1p-ignore data-bwignore data-form-type="other" enterkeyhint="send" data-pena-placeholder="askPosition" data-pena-label="askPositionLabel" placeholder="Send a message" aria-label="Message Pena">
                    <button type="button" class="pena-icon-btn pena-microphone" data-pena-label="askVoice" data-pena-title="askVoice" aria-label="Ask with your voice" title="Ask with your voice" aria-pressed="false">${ICONS.mic}</button>
                    <button type="submit" class="pena-icon-btn pena-send" data-pena-label="ask" data-pena-title="ask" aria-label="Ask" title="Ask" hidden>${ICONS.send}</button>
                </form>
            </div>
            <button class="pena-resize-handle pena-resize-left" data-corner="left" type="button" data-pena-label="resize" data-pena-title="resize" aria-label="Resize Pena" title="Resize Pena"></button>
            <button class="pena-resize-handle pena-resize-right" data-corner="right" type="button" data-pena-label="resize" data-pena-title="resize" aria-label="Resize Pena" title="Resize Pena"></button>
        </div>`;
    document.body.appendChild(element);
    const $ = selector => element.querySelector(selector);
    return {
        window: element, header: $('.pena-window-header'), sheetResize: $('.pena-sheet-resize'), setupPanel: $('.pena-setup-panel'),
        loading: $('.pena-loading'), loadingBar: $('.pena-loading-track span'), loadingText: $('.pena-loading p'),
        status: $('.pena-feedback'), setup: $('.pena-setup'), log: $('.pena-chat-log'), turn: $('.pena-turn'), answer: $('.pena-answer'), meta: $('.pena-answer-meta'), thinking: $('.pena-thinking'), thought: $('.pena-thought'),
        checks: $('.pena-checks'), checkSummary: $('.pena-checks summary'), checkList: $('.pena-checks ul'),
        raw: $('.pena-raw'), notice: $('.pena-notice'), form: $('form'), input: $('form input'), microphone: $('.pena-microphone'),
        readAloud: $('.pena-read-aloud'), send: $('.pena-send'), clear: $('.pena-clear'), minimize: $('.pena-minimize'), resize: [...element.querySelectorAll('.pena-resize-handle')]
    };
}

function progressText(update) {
    if(update.status === 'ready') { setStatus(''); return; }
    if(update.status === 'fallback') {
        console.warn('[Pena ZONOS]', update.message);
        setStatus('zonosFallback');
        toast.error(`Pena: ${penaText('zonosFallback')}`, 10000);
        return;
    }
    const received = update.received ?? update.loaded ?? 0;
    if(!update.file) { setStatus('preparing'); return; }
    setStatus(`${penaFilename(update.file)}`
        + (update.total ? ` (${(received / 1024 ** 2).toFixed(0)} / ${(update.total / 1024 ** 2).toFixed(0)} MiB)` : ''));
    ui.status.title = update.file;
}

function voiceProgress(update) {
    const loading = !update.status || update.status === 'preparing';
    const total = Number(update.total);
    const loaded = Number(update.loaded ?? update.received ?? 0);
    const known = loading && Number.isFinite(total) && total > 0;
    const key = update.status === 'fallback' ? 'zonosFallback'
        : update.status === 'cancelled' ? 'zonosCancelled'
        : update.status === 'error' ? 'zonosError'
        : known ? 'zonosLoading' : 'zonosPreparing';
    const values = { loaded: (loaded / 1024 ** 2).toFixed(0), total: (total / 1024 ** 2).toFixed(0), error: update.message || '' };
    for(const element of document.querySelectorAll('.pena-voice-progress')) {
        element.hidden = update.status === 'idle' || update.status === 'ready';
        if(element.hidden) continue;
        const bar = element.querySelector('progress');
        const group = element.querySelector('.pena-model-progress');
        if(group) group.hidden = !loading;
        else bar.hidden = !loading;
        if(known) { bar.max = total; bar.value = Math.max(0, Math.min(loaded, total)); }
        else bar.removeAttribute('value');
        setPenaText(element.querySelector('[role="status"]'), key, values);
    }
    if(update.status === 'fallback') {
        console.warn('[Pena ZONOS]', update.message);
        toast.error(`Pena: ${penaText('zonosFallback')}`, 10000);
    }
}

function stopMicrophone() {
    pena.microphoneController?.abort();
    pena.microphoneController = null;
    pena.microphone?.cancel();
    if(ui) {
        ui.microphone.setAttribute('aria-pressed', 'false');
        ui.microphone.disabled = pena.state === 'failed';
    }
}

async function microphoneAudio({ audio, sampleRate }, signal) {
    signal.throwIfAborted();
    if(sampleRate === 16000) return audio;
    const offline = new OfflineAudioContext(1, Math.max(1, Math.round(audio.length * 16000 / sampleRate)), 16000);
    const buffer = offline.createBuffer(1, audio.length, sampleRate);
    buffer.copyToChannel(audio, 0);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    signal.throwIfAborted();
    return new Float32Array(rendered.getChannelData(0));
}

async function listen() {
    if(pena.state === 'failed') return;
    if(pena.microphoneController) {
        stopMicrophone();
        if(['listening', 'preparing', 'transcribing'].includes(ui.status.dataset.penaText)) setStatus('');
        return;
    }
    const controller = new AbortController();
    pena.microphoneController = controller;
    ui.microphone.setAttribute('aria-pressed', 'true');
    const current = () => pena.microphoneController === controller && !controller.signal.aborted;
    const report = error => {
        if(!current()) return;
        stopMicrophone();
        failure(error?.name === 'AbortError' ? new Error(penaText('microphoneStopped'), { cause: error }) : error);
    };
    const speaking = () => Boolean(pena.speech.browserSpeaking || pena.speech.sources?.size || pena.speech.requests?.size);
    const wordRecognized = answer => { if(current() && speaking()) interruptSpeech(answer); };
    let queue = Promise.resolve();
    let preview = null;
    let speechVersion = 0;
    const pendingWords = [];
    try {
        stopSpeech();
        await recognitionRequest({ type: 'prepare' }, { signal: controller.signal, onProgress: progressText });
        controller.signal.throwIfAborted();
        await pena.microphone.startContinuous({
            pauseMs: (pena.settings?.penaVoicePause ?? 2.5) * 1000,
            onSpeech: () => { if(current()) { speechVersion++; setStatus('listening'); } },
            onPreview: packet => {
                if(!current() || preview || !speaking()) return;
                const answer = pena.shown;
                preview = (async () => {
                    const audio = await microphoneAudio(packet, controller.signal);
                    const result = await recognitionRequest({ type: 'transcribe', audio, preview: true }, {
                        signal: controller.signal
                    });
                    if(current() && recognizedSpeech(result.text)) wordRecognized(answer);
                })().catch(report).finally(() => { preview = null; });
                return preview;
            },
            onUtterance: packet => {
                const version = speechVersion;
                queue = queue.then(async () => {
                    if(!current()) return;
                    const answer = pena.shown;
                    setStatus('transcribing');
                    const audio = await microphoneAudio(packet, controller.signal);
                    const result = await recognitionRequest({ type: 'transcribe', audio }, {
                        signal: controller.signal,
                        onProgress: update => { if(current()) progressText(update); }
                    });
                    if(!current()) return;
                    const text = recognizedSpeech(result.text);
                    if(text) pendingWords.push(text);
                    if(version !== speechVersion) return;
                    if(!pendingWords.length) {
                        setStatus('listening');
                        return;
                    }
                    wordRecognized(answer);
                    ui.input.value = [ui.input.value.trim(), ...pendingWords.splice(0)].filter(Boolean).join(' ');
                    setStatus('');
                    ui.form.requestSubmit();
                }).catch(report);
                return queue;
            },
            onError: report
        });
        controller.signal.throwIfAborted();
        setStatus('listening');
    } catch(error) { report(error); }
}

export function initializePena() {
    if(isMobileDevice()) return;
    if(ui) return;
    ui = createWindow();
    // Player memory was removed. Clear what older versions saved in this browser.
    for(const key of ['acas.pena.memory.v1', 'acas.pena.memory.enabled', 'acas.queen.memory.v1', 'acas.queen.memory.enabled']) localStorage.removeItem(key);
    initializePenaTranslations();
    pena.microphone = new PenaMicrophone();
    pena.speech = new PenaSpeech(() => {}, error => {
        pena.speechUnavailable = true;
        if(error.name === 'AbortError') setStatus('voiceCancelled');
        else {
            if(pena.settings?.penaSpeech === 'neural') voiceProgress({ status: 'error', message: error.message });
            failure(error);
        }
    }, voiceProgress);
    document.querySelector('#pena-floaty .pena-voice-progress .pena-cancel-button')?.addEventListener('click', () => {
        stopSpeech();
        pena.speech.unload();
        voiceProgress({ status: 'cancelled' });
    });
    ui.readAloud.setAttribute('aria-pressed', String(pena.readAloud));
    ui.readAloud.addEventListener('click', () => {
        pena.readAloud = !pena.readAloud;
        pena.speechInterrupted = false;
        pena.speechUnavailable = false;
        localStorage.setItem(READ_ALOUD_KEY, String(pena.readAloud));
        ui.readAloud.setAttribute('aria-pressed', String(pena.readAloud));
        stopSpeech();
        if(!pena.readAloud) pena.speech.unload();
        if(!pena.readAloud) clearBoard();
        if(pena.readAloud && pena.settings?.penaSpeech === 'neural') pena.speech.prepare();
        if(pena.readAloud && pena.shown) pena.speech.unlock()
            .then(() => streamSpeech(pena.shown, pena.text)).catch(error => failure(error));
    });
    ui.microphone.addEventListener('click', listen);
    ui.send.addEventListener('click', event => {
        if(!pena.busy) return;
        event.preventDefault();
        cancel('stopped');
    });
    ui.form.addEventListener('submit', event => {
        event.preventDefault();
        const question = ui.input.value.trim();
        if(!question) return;
        // Keep the text when Pena can't answer yet, so it can be sent once she's ready.
        if(askBoard() && pena.state === 'ready') ui.input.value = '';
        ask(question).catch(error => failure(error));
    });
    ui.input.addEventListener('input', () => notice(''));
    ui.input.addEventListener('keydown', event => {
        if(event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        ui.form.requestSubmit();
    });
    ui.clear.addEventListener('click', clearChat);
    ui.minimize.addEventListener('click', () => {
        const minimized = ui.window.classList.toggle('is-minimized');
        ui.minimize.setAttribute('aria-expanded', String(!minimized));
    });
    makeDraggable();
    const channel = new BroadcastChannel(GUI_BROADCAST_NAME);
    ui.setup.addEventListener('click', runSetupAction);
    document.querySelector('#external-engine-server-port')?.addEventListener('change', () => refreshSettings().catch(failure));
    channel.addEventListener('message', ({ data }) => {
        if(data?.type !== 'settingSave' || !String(data.data?.key).startsWith('pena')) return;
        refreshSettings(data.data.isDirectlyCausedByUser ? data.data.key : undefined).catch(failure);
        if(['penaTeacher', 'penaHideMoves', 'penaOnlyWhenAsked', 'penaFollowLine'].includes(data.data.key)) pena.fen = null;
    });
    refreshSettings().catch(failure);
    document.addEventListener('acas-board-position', tick);
    setInterval(tick, 300);
}

export function activePenaModel() {
    return pena.canChat ? pena.modelId : null;
}
