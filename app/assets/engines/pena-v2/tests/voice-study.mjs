// Pena voice study: what Pena says on its own while a game goes on, through the production prompt
// building and spoken cleanups, so coaching styles can be compared on the real local model.
// It is a study tool, not part of the test suite. See NATURAL_VOICE_PLAN.md.
//
// node voice-study.mjs prepare POSITIONS.json [count]   events.json with Stockfish 8 records and move grades
// node voice-study.mjs run <label> [count]               one reply per event from llama-server, saved to <label>.jsonl
// node voice-study.mjs analyze <label...>                habit counts and repeated phrases
// node voice-study.mjs show <label> [count]              replies to read, with the raw text when a filter changed it
// node voice-study.mjs prepare POSITIONS.json --game    every ply of each supplied history, in order
// node voice-study.mjs game <label> [count]              sequential run with game-local state
// node voice-study.mjs compare <baseline> <natural>     matched-ID independent board checks
// Ordered input: { id, gameId?, fen, history, playerColor }. Rows sharing gameId are merged,
// rejecting gaps/conflicts. Without gameId each row is one game. Short/truncated histories
// are reported as segments, never as a complete 40-move acceptance sample.
//
// POSITIONS.json is an array of { id, fen, history, playerColor }, where history holds the earlier FENs.
// Environment:
//   PENA_STUDY_DIR    where events and results live (default temp\pena-voice-study)
//   PENA_STUDY_URL    an OpenAI style llama-server (default http://127.0.0.1:18927)
//   PENA_STUDY_STYLE  a coachStyles name from coach-style.js (default natural)
//   PENA_STUDY_SYSTEM a text file tried in place of that style's system prompt
//   PENA_STUDY_HIDE=1 the "Don't give away moves" switch
//   PENA_STUDY_RETRY=0 skips the worker's one retry after a markup loop
//   PENA_STUDY_RAW=1  analyze the model text before any filter
//   PENA_STUDY_CHATTINESS quiet|normal|chatty (game only, default normal; independent always chatty)
//   PENA_STUDY_MODEL_ID immutable model/quantization identity (required for game; preferably GGUF SHA256)
//   PENA_STUDY_CHECKER independent checker path (default temp\pena-format-exp\checker.mjs)
//   PENA_STUDY_CANDIDATES=2 experimental sequential candidate selection (not shipped runtime behavior)
// New runs have <label>.meta.json provenance. Resume requires identical code, inputs and
// settings, and replays saved turns to rebuild state. Old JSONL files remain readable but
// cannot be resumed or presented as validation of the current implementation.
// Example (PowerShell, repository root; games.json contains full histories):
// $env:PENA_STUDY_MODEL_ID='<GGUF SHA256>'; $env:PENA_STUDY_CHATTINESS='normal'
// node app\assets\engines\pena-v2\tests\voice-study.mjs prepare games.json --game
// $env:PENA_STUDY_STYLE='legacy'; node app\assets\engines\pena-v2\tests\voice-study.mjs game baseline
// $env:PENA_STUDY_STYLE='natural'; node app\assets\engines\pena-v2\tests\voice-study.mjs game natural
// node app\assets\engines\pena-v2\tests\voice-study.mjs analyze baseline natural
// node app\assets\engines\pena-v2\tests\voice-study.mjs compare baseline natural
// Repeat with PENA_STUDY_HIDE=1 and fresh labels. Models are never launched by this script.
// Revision 2 records terminal no-visible-answer failures after the bounded retry and
// continues to the next board. Failures are not silent successes or conversation turns.
// /props.model_path must identify a readable local GGUF. Production nativeAI helpers
// read its architecture and normalize effort none (loop Inkling: 16 tokens; standard: 0).
// Revision 3 follows PenaConversation's position lifecycle: only current-position Q/A
// enters model history. Revision-2 reports are pre-parity experiments, not production
// acceptance evidence. Their saved JSON must not be rewritten as if generated here.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analysePosition, PenaConversation } from '../conversation.js';
import { compileAppCoachingSource } from '../app-input.js';
import { compactCoachingInput } from '../coaching-compact.js';
import { packGroundedMessages } from '../grounded-packing.js';
import { englishCoachingInput } from '../pcf-input.js';
import { findPlayedMove } from '../questions.js';
import { moveEvent, positionEvent } from '../chat.js';
import * as formatting from '../formatting.js';
import * as style from '../coach-style.js';
import { cleanEvidenceTalk } from '../thought-injection.js';
import { presentComparisonAnswer } from '../comparison.js';
import { realThreat } from '../defence.js';
import { PlayerPatterns } from '../coach-session.js';
import { normalizeNativeReasoning, readGGUFModelInfo } from '../../../../../appServer/backend/nativeAI.js';

const [action, ...args] = process.argv.slice(2);
const root = new URL('../../../../../', import.meta.url);
const directory = pathToFileURL(resolve(fileURLToPath(root), process.env.PENA_STUDY_DIR || 'temp\\pena-voice-study') + sep);
const eventsFile = new URL('events.json', directory);
const serverUrl = (process.env.PENA_STUDY_URL || 'http://127.0.0.1:18927').replace(/\/$/, '');
const chatMarkup = /<\|[a-z_]+\|>/i;
const candidateSystem = process.env.PENA_STUDY_SYSTEM ? readFileSync(process.env.PENA_STUDY_SYSTEM, 'utf8').trim() : '';
const readRows = name => readFileSync(new URL(`${name}.jsonl`, directory), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const checkerFile = () => process.env.PENA_STUDY_CHECKER ? pathToFileURL(resolve(process.env.PENA_STUDY_CHECKER))
    : new URL('temp/pena-format-exp/checker.mjs', root);
const words = text => String(text || '').toLowerCase().replace(/’/g, "'").match(/[a-z][a-z0-9]*(?:'[a-z]+)?/g) || [];
// The shared adapter accepts system + four complete exchanges + current user (10 messages).
const conversationLimit = 4;
const historyPolicy = 'production-current-position-only/1';
const seedFor = id => 9000 + (/^\d+[pm]?$/.test(String(id)) ? Number.parseInt(id, 10) : Number.parseInt(sha(String(id)).slice(0, 7), 16));
const plyOf = fen => (Number(fen.split(' ')[5]) - 1) * 2 + (fen.split(' ')[1] === 'b' ? 1 : 0);

export function orderedEvents(rows) {
    const games = new Map();
    for(const [index, row] of rows.entries()) {
        if(!Array.isArray(row.history) || !['w', 'b'].includes(row.playerColor)) throw new Error('Game input requires history and playerColor.');
        const gameId = String(row.gameId ?? `game-${row.id ?? index}`);
        if(!games.has(gameId)) games.set(gameId, { playerColor: row.playerColor, positions: new Map() });
        const game = games.get(gameId);
        if(game.playerColor !== row.playerColor) throw new Error(`Conflicting player colors in ${gameId}.`);
        for(const fen of [...row.history, row.fen]) {
            const ply = plyOf(fen);
            if(!Number.isSafeInteger(ply) || ply < 0) throw new Error(`Invalid FEN ply in ${gameId}.`);
            if(game.positions.has(ply) && game.positions.get(ply) !== fen) throw new Error(`Conflicting ply ${ply} in ${gameId}.`);
            game.positions.set(ply, fen);
        }
    }
    const events = [];
    for(const [gameId, game] of games) {
        const sequence = [...game.positions].sort((a, b) => a[0] - b[0]);
        if(sequence.length < 2) throw new Error(`No moves in ${gameId}.`);
        for(let index = 1; index < sequence.length; index++) {
            const [ply, fen] = sequence[index], [previousPly, beforeFen] = sequence[index - 1];
            const played = findPlayedMove(beforeFen, fen);
            if(ply !== previousPly + 1 || !played) throw new Error(`Missing or illegal transition in ${gameId} at ply ${ply}.`);
            const kind = played.color === game.playerColor ? 'played' : 'position';
            events.push({ id: `${gameId}:${ply}`, gameId, ply, gameStartPly: sequence[0][0], kind, fen, beforeFen,
                history: sequence.slice(0, index).map(([, prior]) => prior), playerColor: game.playerColor,
                playedSan: kind === 'played' ? played.san : undefined,
                question: kind === 'played' ? moveEvent(played.san) : positionEvent });
        }
    }
    return events;
}

export function validateOrder(events) {
    const ids = new Set(), closed = new Set();
    let previous;
    for(const event of events) {
        if(ids.has(event.id)) throw new Error(`Duplicate event ${event.id}.`);
        ids.add(event.id);
        if(!event.gameId || !Number.isSafeInteger(event.ply)) throw new Error('Use prepare POSITIONS.json --game first.');
        const played = findPlayedMove(event.beforeFen, event.fen);
        if(!played || plyOf(event.fen) !== event.ply || plyOf(event.beforeFen) !== event.ply - 1
            || !Array.isArray(event.history) || event.history.at(-1) !== event.beforeFen
            || event.history.length !== event.ply - event.gameStartPly
            || (played.color === event.playerColor ? 'played' : 'position') !== event.kind)
            throw new Error(`Invalid ordered transition/history at ${event.id}.`);
        if(previous && previous.gameId !== event.gameId) closed.add(previous.gameId);
        if(closed.has(event.gameId)) throw new Error('Games must be contiguous.');
        if(previous?.gameId === event.gameId && (event.ply !== previous.ply + 1 || event.beforeFen !== previous.fen
            || event.playerColor !== previous.playerColor || JSON.stringify(event.history.slice(0, -1)) !== JSON.stringify(previous.history)))
            throw new Error(`Out-of-order game at ${event.id}.`);
        previous = event;
    }
}

// Include transitive local prompt/filter dependencies, not just this script's timestamp.
export function sourceFingerprint(entry = import.meta.url) {
    const files = new Map();
    function visit(url) {
        if(files.has(url.href)) return;
        const source = readFileSync(url, 'utf8');
        files.set(url.href, sha(source));
        for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"](\.[^'"]+\.[cm]?js)['"]/g)) visit(new URL(match[1], url));
    }
    visit(new URL(entry));
    return sha([...files].map(([url, hash]) => [url.replace(root.href, ''), hash]).sort(([a], [b]) => a.localeCompare(b)));
}

export function makeProvenance(events, config, code = sourceFingerprint()) {
    const identity = { schema: 'pena-voice-study/2', code, events: sha(events), eventCount: events.length, config, node: process.version };
    return { ...identity, fingerprint: sha(identity), createdAt: new Date().toISOString() };
}

export function validateResume(saved, current, rows, events) {
    const { fingerprint, createdAt, ...identity } = saved || {};
    if(!saved || fingerprint !== current.fingerprint || sha(identity) !== fingerprint)
        throw new Error('Resume provenance mismatch; use a fresh label. Historical runs do not validate new code.');
    if(rows.length > events.length) throw new Error('Resume has more rows than the selected events.');
    for(const [index, row] of rows.entries()) {
        if(row.id !== events[index].id || row.fen !== events[index].fen || row.fingerprint !== current.fingerprint
            || typeof row.answer !== 'string') throw new Error(`Resume is not a matching ordered prefix at row ${index + 1}.`);
    }
}

export function createStudyState(patterns = new PlayerPatterns(null)) {
    return { gameId: null, gameIndex: -1, conversation: [], recent: [], focus: -1, frequency: {}, patterns,
        session: new PenaConversation({ engine: {}, tokenCount: () => 0 }) };
}

export function planTurn(state, event, chattiness) {
    if(state.gameId !== event.gameId) {
        state.gameId = event.gameId;
        state.gameIndex = state.patterns.beginGame();
        state.conversation = []; state.recent = []; state.focus = -1;
        state.session.reset(null);
        state.frequency = { silentPlies: 0, calmTurns: 0, playerColor: event.playerColor };
    }
    // Reuse the production lifecycle, including its clock-insensitive position key.
    // Older exchanges become earlier notes internally, but board-event snapshots omit them.
    state.session.exchanges = state.conversation;
    state.session.follow(event.fen);
    state.conversation = state.session.exchanges;
    const selected = style.chooseCommentFocus(event.record, state.focus, { playerColor: event.playerColor });
    state.focus = selected.index;
    state.patterns.observe(event.record, event.playerColor, state.gameIndex);
    const pattern = state.patterns.reminder(event.record, event.playerColor, state.gameIndex);
    const patternComment = state.patterns.comment(event.record, event.playerColor, state.gameIndex);
    const normalCalmTurn = !style.shouldSpeakAutomatic(event.record, 'normal', { playerColor: event.playerColor });
    const speak = style.shouldSpeakAutomatic(event.record, chattiness, { ...state.frequency, playerColor: event.playerColor });
    if(normalCalmTurn) state.frequency.calmTurns++;
    return { speak, focus: selected.focus, recent: state.recent.slice(-4).map(text => words(text).slice(0, 3).join(' ')), pattern, patternComment,
        avoid: style.leanedPhrases(state.recent),
        conversation: state.conversation.slice(-conversationLimit) };
}

export function finishTurn(state, event, turn, answer) {
    state.frequency.silentPlies = turn.speak && answer.trim() ? 0 : (state.frequency.silentPlies || 0) + 1;
    if(!turn.speak || !answer.trim()) return;
    state.conversation = [...state.conversation, { player: event.question, pena: answer }].slice(-conversationLimit);
    state.recent = [...state.recent, answer].slice(-9);
    if(turn.patternComment && answer.includes(turn.patternComment)) state.patterns.markMentioned(state.gameIndex);
}

async function engineAdapter() {
    // Stockfish 8 runs in Node once it is loaded as CommonJS.
    const copy = new URL('sf8.cjs', directory);
    if(!existsSync(copy)) copyFileSync(new URL('../../stockfish-8/stockfish-8.js', import.meta.url), copy);
    const sf = createRequire(import.meta.url)(fileURLToPath(copy))();
    let out = [];
    sf.onmessage = line => { if(typeof line === 'string') out.push(line); };
    const send = command => sf.postMessage(command);
    const until = prefix => new Promise(resolve => { const timer = setInterval(() => {
        if(out.some(line => line.startsWith(prefix))) { clearInterval(timer); resolve(); } }, 2); });
    send('uci'); await until('uciok');
    let queue = Promise.resolve();
    const search = async (fen, { depth = 12, multipv = 1, moves = null } = {}) => {
        out = [];
        send(`setoption name MultiPV value ${multipv}`);
        send('ucinewgame');
        send(`position fen ${fen}`);
        send(`go depth ${depth}${moves?.length ? ` searchmoves ${moves.join(' ')}` : ''}`);
        await until('bestmove');
        const best = new Map();
        let deepest = 0;
        for(const line of out) {
            const match = line.match(/ depth (\d+) .*?multipv (\d+) .*?score (cp|mate) (-?\d+).* pv ((?:[a-h][1-8][a-h][1-8][qrbn]? ?)+)/);
            if(!match || / lowerbound| upperbound/.test(line)) continue;
            const d = Number(match[1]);
            if(d < deepest) continue;
            if(d > deepest) { deepest = d; best.clear(); }
            const pv = match[5].trim().split(' ');
            best.set(Number(match[2]), { move: pv[0], pv, depth: d,
                score: { cp: match[3] === 'cp' ? Number(match[4]) : null, mate: match[3] === 'mate' ? Number(match[4]) : null } });
        }
        return [...best.entries()].sort((a, b) => a[0] - b[0]).map(([, line]) => line);
    };
    // MoveEvaluator needs a DOM, so its grading methods are lifted out of the source as they are.
    const source = readFileSync(new URL('../../../js/MoveEvaluator.js', import.meta.url), 'utf8');
    const constructorBody = source.slice(source.indexOf('this.resultLabels'), source.indexOf('winningChances(score)'));
    const methods = source.slice(source.indexOf('winningChances(score)'), source.indexOf('async evaluateJob'));
    const Grader = new Function(`return class { constructor() { ${constructorBody.replace(/\}\s*$/, '')} } ${methods} }`)();
    const grader = new Grader();
    return {
        lines: (fen, options) => (queue = queue.then(() => search(fen, options))),
        compare: (...values) => grader.compare(...values),
        quit: () => sf.postMessage('quit')
    };
}

// Each picked position gives two events: the player's own move, and the opponent's reply that follows it.
async function prepare(positionsPath, ...options) {
    if(!positionsPath) throw new Error('Usage: node voice-study.mjs prepare POSITIONS.json [count]');
    const rows = JSON.parse(readFileSync(positionsPath, 'utf8'));
    const game = options.includes('--game');
    const wanted = Number(options.find(item => item !== '--game')) || (game ? Infinity : 120);
    const engine = await engineAdapter();
    const events = [];
    if(game) {
        try {
            for(const event of orderedEvents(rows).slice(0, wanted)) {
                event.record = await analysePosition(engine, event.fen, { history: event.history, depth: 12 });
                events.push(event);
                console.log(`${events.length} events: ${event.id}`);
            }
        } finally { engine.quit(); }
        writeFileSync(eventsFile, JSON.stringify(events));
        return;
    }
    for(const row of rows.filter(item => item.history.length >= 3).filter((_, index) => index % 7 === 0)) {
        if(events.length >= wanted) break;
        const played = findPlayedMove(row.history.at(-2), row.history.at(-1));
        if(!played || played.color !== row.playerColor) continue;
        const position = { kind: 'position', id: `${row.id}p`, fen: row.fen, history: row.history, playerColor: row.playerColor,
            question: positionEvent };
        const after = { kind: 'played', id: `${row.id}m`, fen: row.history.at(-1), history: row.history.slice(0, -1),
            beforeFen: row.history.at(-2), playedSan: played.san, playerColor: row.playerColor, question: moveEvent(played.san) };
        for(const event of [position, after]) {
            event.record = await analysePosition(engine, event.fen, { history: event.history, depth: 12 });
            events.push(event);
        }
        console.log(`${events.length} events`);
    }
    writeFileSync(eventsFile, JSON.stringify(events.slice(0, wanted)));
    engine.quit();
}

// The messages the worker sends for an automatic comment, from the shared source through the English board.
export async function buildMessages(event, { hideMoves, conversation = [], focus, recent = [], patternComment = '', avoid = [] }) {
    const { fen, history, playerColor, question, record } = event;
    const { args: source } = await compileAppCoachingSource({ schema: 'pena-live-notes-source/1', fen, history, record, playerColor, question,
        conversation: conversation.slice(-conversationLimit) });
    const compact = compactCoachingInput(source);
    const input = { ...compact, messages: packGroundedMessages(compact.messages, question) };
    const english = englishCoachingInput(input, { history, playerColor, inkling: true });
    const messages = style.styleCoachingMessages(english.messages, { style: process.env.PENA_STUDY_STYLE, english: true, automatic: true,
        question, hideMoves, moveRequested: false, fen, previousFen: history.at(-1) || '',
        moveGrade: record.last?.label || '', focus: focus || style.chooseCommentFocus(record, -1, { playerColor }).focus,
        recent, avoid, pattern: patternComment ? style.patternPresentationNote : '' });
    const system = style.coachStyle(process.env.PENA_STUDY_STYLE).system;
    if(!candidateSystem || !system) return messages;
    return messages.map((message, index) => index === 0 ? { ...message, content: message.content.replace(system, () => candidateSystem) } : message);
}

// What the player finally hears, in the order service.js applies its checks.
export function polish(raw, event, { hideMoves, previous = [], recent = [], patternComment = '' }) {
    const cut = raw.search(chatMarkup);
    let text = cleanEvidenceTalk(cut >= 0 ? raw.slice(0, cut) : raw).replace(/\s*—\s*/g, ', ').replace(/(^|[.!?])\s*,\s*/g, '$1 ')
        .replace(/,\s*([.!?;:]|$)/g, '$1').replace(/ {2,}/g, ' ').trim();
    text = presentComparisonAnswer(text).replace(/\[([^\]\n]+)\]\([^\s)]+\)/g, '$1').replace(/[ \t]*\[([^\]\n]+)\]/g, '');
    text = style.screenCoachReply(text, { fen: event.fen, beforeFen: event.beforeFen || event.history.at(-1),
        playerColor: event.playerColor, question: '', playedSan: event.playedSan, hideMoves,
        style: process.env.PENA_STUDY_STYLE, event: true, previous, recent, patternComment,
        moveGrade: event.record?.last?.label || '',
        urgent: style.shouldSpeakAutomatic(event.record, 'quiet', { playerColor: event.playerColor }) }).text;
    return formatting.markdownPlain(text).trim();
}

export function selectCandidate(candidates, recent = [], { urgent = false } = {}) {
    const counts = new Map();
    for(const answer of recent.slice(-9)) for(const phrase of style.voicePhrases(answer))
        counts.set(phrase, (counts.get(phrase) || 0) + 1);
    const first = candidates.find(candidate => !candidate.failed && candidate.answer.trim());
    const required = urgent ? new Set(first?.answer.match(/\b[a-h][1-8]\b/g) || []) : new Set();
    const score = candidate => {
        if(candidate.failed || !candidate.answer.trim()) return Infinity;
        if([...required].some(square => !new RegExp(`\\b${square}\\b`).test(candidate.answer))) return Infinity;
        const phrases = [...style.voicePhrases(candidate.answer)];
        const repeated = phrases.filter(phrase => (counts.get(phrase) || 0) >= 3).length;
        const overlap = phrases.reduce((sum, phrase) => sum + (counts.get(phrase) || 0), 0) / Math.max(1, phrases.length);
        const opener = /^your (?:king|queen|rook|bishop|knight|pawn) on\b/i.test(candidate.answer) ? 1 : 0;
        return repeated * 10 + opener * 3 + overlap;
    };
    return candidates.reduce((best, candidate, index) => score(candidate) < score(candidates[best]) ? index : best, 0);
}

export async function readStudyModel(url = serverUrl) {
    const response = await fetch(`${url}/props`, { signal: AbortSignal.timeout(10000) });
    if(!response.ok) throw new Error(`Cannot verify study model: /props HTTP ${response.status}.`);
    const props = await response.json();
    if(typeof props.model_path !== 'string' || !existsSync(props.model_path))
        throw new Error('Study requires /props.model_path pointing to a readable local GGUF; architecture is never inferred from its filename.');
    const info = await readGGUFModelInfo(props.model_path);
    if(!info?.architecture) throw new Error('GGUF architecture unavailable; refusing unverified native reasoning normalization.');
    const file = statSync(props.model_path);
    return { info, source: 'production-readGGUFModelInfo-via-server-props', path: props.model_path,
        size: file.size, mtimeMs: file.mtimeMs,
        runtime: { build: props.build_info || null, alias: props.model_alias || null,
            context: props.default_generation_settings?.n_ctx || null, slots: props.total_slots || null,
            templateSha256: sha(props.chat_template || ''), defaults: props.default_generation_settings?.params || null } };
}

export function buildStudyRequest(messages, seed, modelInfo, temperature = 0.3) {
    if(!modelInfo?.architecture) throw new Error('Verified GGUF architecture is required for study requests.');
    return normalizeNativeReasoning({ model: 'pena-study', messages, seed, temperature, max_tokens: 528,
        reasoning_effort: 'none', stream: false, cache_prompt: true }, modelInfo);
}

// Use the same architecture-specific request normalization as the native host.
async function ask(messages, seed, modelInfo, temperature = 0.3) {
    const response = await fetch(`${serverUrl}/v1/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(240000),
        body: JSON.stringify(buildStudyRequest(messages, seed, modelInfo, temperature))
    });
    const result = await response.json();
    if(!response.ok) throw new Error(JSON.stringify(result));
    const raw = result.choices[0].message.content || '';
    // Like the worker: a reply that is only chat markup gets one more try, a little warmer.
    if(process.env.PENA_STUDY_RETRY !== '0' && temperature < 0.4 && !raw.replace(/<\|[a-z_]+\|>[\s\S]*$/i, '').trim()) {
        const again = await ask(messages, seed + 1000, modelInfo, 0.4);
        return { ...again, retried: true, firstRaw: raw, firstTokens: result.usage?.completion_tokens };
    }
    const failed = !raw.split(chatMarkup)[0].trim();
    return { raw, reasoning: result.choices[0].message.reasoning_content || '',
        finish: result.choices[0].finish_reason, tokens: result.usage?.completion_tokens, retried: false, failed,
        ...(failed ? { error: { code: 'NO_VISIBLE_MODEL_ANSWER', message: 'No visible model answer after the configured bounded attempt(s).' } } : {}) };
}

async function run(label, ...options) {
    if(!label) throw new Error('Usage: node voice-study.mjs run <label> [count]');
    const hideMoves = process.env.PENA_STUDY_HIDE === '1';
    const game = action === 'game' || options.includes('--game');
    const countArg = options.find(item => item !== '--game');
    const events = JSON.parse(readFileSync(eventsFile, 'utf8')).slice(0, Number(countArg) || undefined);
    if(!events.length) throw new Error('No study events.');
    if(new Set(events.map(event => event.id)).size !== events.length) throw new Error('Duplicate event IDs.');
    if(game) validateOrder(events);
    const chattiness = game ? process.env.PENA_STUDY_CHATTINESS || 'normal' : 'chatty';
    if(!['quiet', 'normal', 'chatty'].includes(chattiness)) throw new Error('Invalid PENA_STUDY_CHATTINESS.');
    const candidateCount = Number(process.env.PENA_STUDY_CANDIDATES || 1);
    if(![1, 2].includes(candidateCount)) throw new Error('PENA_STUDY_CANDIDATES must be 1 or 2.');
    const modelIdentity = process.env.PENA_STUDY_MODEL_ID || '';
    if(game && !modelIdentity) throw new Error('Set PENA_STUDY_MODEL_ID to an immutable model/quantization identity (prefer a GGUF SHA256).');
    const nativeModel = await readStudyModel();
    const normalized = buildStudyRequest([], 0, nativeModel.info);
    const provenance = makeProvenance(events, { mode: game ? 'game' : 'independent', chattiness, hideMoves,
        style: style.coachStyleName(process.env.PENA_STUDY_STYLE), system: candidateSystem,
        retry: process.env.PENA_STUDY_RETRY !== '0', serverUrl, modelIdentity, model: 'pena-study',
        temperature: 0.3, retryTemperature: 0.4, maxTokens: 528, effort: 'none', seed: '9000+legacy-numeric-id-or-sha256-prefix',
        conversationTurns: conversationLimit, studyRevision: 5, historyPolicy, candidateCount, openerRetry: 'production-opensWithStockOpener-once', terminalFailurePolicy: 'record-no-visible-answer-and-continue',
        nativeModel, nativeReasoning: { reasoning_effort: normalized.reasoning_effort || null,
            reasoning_budget_tokens: normalized.reasoning_budget_tokens ?? null, chat_template_kwargs: normalized.chat_template_kwargs || null },
        patternHelper: 'production-PlayerPatterns', phraseHelper: 'production-voicePhrases', presentation: 'production-screenCoachReply' });
    const file = new URL(`${label}.jsonl`, directory);
    const metaFile = new URL(`${label}.meta.json`, directory);
    const saved = existsSync(file) ? readRows(label) : [];
    if(existsSync(file) || existsSync(metaFile)) {
        validateResume(existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : null, provenance, saved, events);
    } else writeFileSync(metaFile, JSON.stringify(provenance, null, 2), { flag: 'wx' });
    const state = createStudyState();
    let finished = 0;
    const start = Date.now();
    // Both modes persist an ordered prefix; game mode additionally carries state across turns.
    for(const [index, event] of events.entries()) {
        const turn = game ? planTurn(state, event, chattiness) : { speak: true };
        const messages = turn.speak ? await buildMessages(event, { hideMoves, ...turn }) : [];
        if(index < saved.length) {
            if(saved[index].promptHash !== sha(messages) || saved[index].requested !== turn.speak)
                throw new Error(`Resume conversation/state mismatch at ${event.id}; use a fresh label.`);
            if(game) finishTurn(state, event, turn, saved[index].answer);
            continue;
        }
        const started = Date.now();
        const candidates = [];
        for(let candidate = 0; candidate < (turn.speak ? candidateCount : 1); candidate++) {
            let result = turn.speak ? await ask(messages, seedFor(event.id) + candidate * 2000, nativeModel.info)
                : { raw: '', tokens: 0, finish: 'suppressed', failed: false, retried: false };
            // Like the worker: a natural comment opening "Your <piece> on" is asked once more with a nudge.
            if(turn.speak && provenance.config.style === 'natural' && !result.failed && style.opensWithStockOpener(result.raw.split(chatMarkup)[0])) {
                const again = await ask(style.retryOpenerMessages(messages), seedFor(event.id) + candidate * 2000 + 2000, nativeModel.info);
                result = { ...again, openerRetry: true, openerFirstRaw: result.raw, openerFirstTokens: result.tokens };
            }
            const answer = result.failed ? '' : polish(result.raw, event, { hideMoves, previous: game ? state.recent : [], recent: game ? state.recent : [], patternComment: turn.patternComment });
            candidates.push({ ...result, answer });
        }
        const selected = selectCandidate(candidates, game ? state.recent : [], { urgent: style.shouldSpeakAutomatic(event.record, 'quiet', { playerColor: event.playerColor }) });
        const { answer, ...result } = candidates[selected];
        const row = { id: event.id, gameId: event.gameId, ply: event.ply, kind: event.kind, fen: event.fen,
            playerColor: event.playerColor, hideMoves, style: provenance.config.style,
            fingerprint: provenance.fingerprint, seed: seedFor(event.id), promptHash: sha(messages),
            requested: turn.speak, focus: turn.focus, pattern: turn.pattern || '', patternComment: turn.patternComment || '',
            ...result, ...(candidateCount > 1 ? { candidates, selected, totalTokens: candidates.reduce((sum, candidate) => sum + (candidate.tokens || 0) + (candidate.firstTokens || 0), 0) } : {}),
            status: result.failed ? 'failed' : !turn.speak ? 'suppressed' : answer ? 'spoken' : 'filtered-empty',
            answer, elapsedMs: Date.now() - started };
        appendFileSync(file, JSON.stringify(row) + '\n');
        if(game) finishTurn(state, event, turn, answer);
        if(++finished % 20 === 0) console.log(`${label}: ${finished}/${events.length - saved.length}, ${Math.round((Date.now() - start) / finished)} ms each`);
    }
    if(sourceFingerprint() !== provenance.code) throw new Error('Implementation changed during generation. Saved rows are NOT acceptance evidence; use a fresh label.');
    console.log(JSON.stringify({ label, generated: finished, failures: failureMetrics(readRows(label)), seconds: (Date.now() - start) / 1000 }));
}

// Habits a listener notices over a long game. Add a pattern here before chasing a new one.
const habits = {
    'opens with whose move': /^(?:(?:White|Black)(?: is)? to move|It'?s (?:your|White's|Black's|their) (?:move|turn)|Your move|Your turn)\b/i,
    'whose move anywhere': /\b(?:White|Black)(?: is)? to move\b|\bit'?s (?:your|White's|Black's|their) (?:move|turn)\b/i,
    'move number or phase': /\bmove \d+\b|\b(?:in the|still the|an?) (?:opening|middlegame|endgame) (?:phase|stage)\b/i,
    'ends with a question': /\?\s*$/,
    'any question': /\?/,
    'offer to say more': /\b(?:if you (?:want|like)|want me to|(?:I|we) can (?:walk|show|go|explain|dig|break|look|talk|compare)|let me know|happy to|shall (?:I|we))\b/i,
    'thinks the question was cut off': /\bcut off\b|what (?:are|were) you asking|(?:no|your) question|didn'?t (?:say|ask)|you(?:'re| are) asking|what do you want me to/i,
    'engine talk': /\bengine\b/i,
    'evidence or notes talk': /\b(?:evidence|notes?|rule-checked|supplied|verified|the facts)\b/i,
    'line talk': /\b(?:the|engine|that|this) lines?\b|\bline (?:points|says|shows|goes)\b/i,
    'natural': /\bnatural\b/i,
    'priority': /\bpriority\b/i,
    'label colon': /\b[A-Za-z][A-Za-z' ]{2,40}:\s+\S/,
    'evaluation': /[+-]\d+\.\d|\b(?:slightly|clearly) better\b|\bequal\b/i,
    'nothing forced': /\b(?:nothing (?:here )?is forced|not forced|no forced|nothing urgent|no single urgent)\b/i,
    'still': /\bstill\b/i,
    'empty': /^\s*$/
};

export function rollingRepetition(rows, { window = 10, limit = 3, phrases = style.voicePhrases } = {}) {
    if(typeof phrases !== 'function') throw new Error('Production voicePhrases helper is required for the acceptance metric.');
    const games = new Map();
    for(const row of rows.filter(row => !isFailed(row) && row.answer?.trim())) {
        const game = row.gameId || '(independent events, not a game)';
        if(!games.has(game)) games.set(game, []);
        games.get(game).push(row);
    }
    let windows = 0, maximum = 0, violationCount = 0;
    const violations = [];
    for(const [gameId, comments] of games) {
        const sets = comments.map(row => new Set(phrases(row.answer)));
        for(let start = 0; start + window <= comments.length; start++) {
            windows++;
            const counts = new Map();
            for(const set of sets.slice(start, start + window)) for(const phrase of set) counts.set(phrase, (counts.get(phrase) || 0) + 1);
            for(const [phrase, count] of counts) {
                maximum = Math.max(maximum, count);
                if(count <= limit) continue;
                violationCount++;
                if(violations.length < 50) violations.push({ gameId, phrase, count,
                    startId: comments[start].id, endId: comments[start + window - 1].id });
            }
        }
    }
    return { window, limit, windows, maximum, violationCount, violations,
        met: windows ? violationCount === 0 : null, definition: 'Production voicePhrases (2-6 words); unique per spoken comment; game-local complete rolling windows; excludes chess/function-word-only phrases.' };
}

export function gameCoverage(events) {
    const games = new Map();
    for(const event of events) {
        if(!event.gameId) continue;
        if(!games.has(event.gameId)) games.set(event.gameId, []);
        games.get(event.gameId).push(event);
    }
    const samples = [...games].map(([gameId, turns]) => ({ gameId, startPly: turns[0].gameStartPly,
        plies: turns.length, endPly: turns.at(-1).ply,
        fortyMovesFromStart: turns[0].gameStartPly === 0 && turns[0].ply === 1 && turns.length >= 80 }));
    return { games: samples, fortyMoveSamples: samples.filter(game => game.fortyMovesFromStart).length,
        met: samples.length ? samples.every(game => game.fortyMovesFromStart) : null,
        limit: 'At least 80 contiguous plies from the start, not proof the game reached a terminal result.' };
}

const isFailed = row => row.failed === true || row.status === 'failed';

export function failureMetrics(rows) {
    const requested = rows.filter(row => row.requested !== false);
    const failed = rows.filter(isFailed);
    return { events: rows.length, requested: requested.length, failed: failed.length,
        failedAfterRetry: failed.filter(row => row.retried).length,
        failureRatePerRequest: requested.length ? failed.length / requested.length : null,
        failureRatePerEvent: rows.length ? failed.length / rows.length : null,
        failures: failed.map(row => ({ id: row.id, error: row.error, retried: Boolean(row.retried) })),
        target: 'Zero terminal model failures', met: requested.length ? failed.length === 0 : null };
}

export function acceptanceMetrics(rows, events) {
    const byId = new Map(events.map(event => [event.id, event]));
    const spoken = rows.filter(row => !isFailed(row) && row.answer?.trim());
    const played = spoken.filter(row => row.kind === 'played');
    const verdict = /\b(?:is|was|looks?|seems?)\s+(?:a\s+)?(?:fine|good|great|excellent|best|solid|okay|ok|nice|playable)\b/i;
    const verdicts = played.filter(row => verdict.test(row.answer)).length;
    const fine = played.filter(row => /\b(?:is|was) fine\b/i.test(row.answer)).length;
    const pieceOpeners = spoken.filter(row => /^your\s+(?:king|queen|rook|bishop|knight|pawn)\s+on\b/i.test(row.answer)).length;
    const frequency = { events: rows.length, requested: 0, spoken: spoken.length, suppressed: 0, failed: 0,
        filteredEmpty: 0, calm: 0, calmSilent: 0, calmNoComment: 0,
        mistakes: 0, mistakesRequested: 0, mistakesSpoken: 0, threats: 0, threatsRequested: 0, threatsSpoken: 0 };
    for(const row of rows) {
        const event = byId.get(row.id), record = event?.record || {};
        const requested = row.requested !== false;
        const failed = isFailed(row);
        if(failed) frequency.failed++;
        if(requested) frequency.requested++; else frequency.suppressed++;
        if(requested && !failed && !row.answer?.trim()) frequency.filteredEmpty++;
        const threat = realThreat(record.threat), bad = row.kind === 'played' && style.moveGradeKind(record.last?.label) === 'bad';
        const calm = !style.shouldSpeakAutomatic(record, 'normal', { silentPlies: 0, playerColor: event?.playerColor });
        if(calm) {
            frequency.calm++;
            if(!requested) frequency.calmSilent++;
            if(!failed && !row.answer?.trim()) frequency.calmNoComment++;
        }
        if(bad) { frequency.mistakes++; if(requested) frequency.mistakesRequested++; if(row.answer?.trim()) frequency.mistakesSpoken++; }
        if(threat) { frequency.threats++; if(requested) frequency.threatsRequested++; if(row.answer?.trim()) frequency.threatsSpoken++; }
    }
    const ratio = (n, d) => d ? n / d : null;
    frequency.calmSilentRate = ratio(frequency.calmSilent, frequency.calm);
    frequency.calmNoCommentRate = ratio(frequency.calmNoComment, frequency.calm);
    frequency.calmDefinition = 'Events suppressed by production normal policy with silentPlies=0 (not every strategically calm position).';
    frequency.allMistakesSpoken = frequency.mistakes ? frequency.mistakes === frequency.mistakesSpoken : null;
    frequency.allThreatsSpoken = frequency.threats ? frequency.threats === frequency.threatsSpoken : null;
    return { frequency, generation: failureMetrics(rows), coverage: gameCoverage(events.filter(event => rows.some(row => row.id === event.id))),
        verdict: { playedComments: played.length, verdicts, fine, fineRate: ratio(fine, played.length),
            target: 'is/was fine in at most 5 of 60 played comments', met: played.length >= 60 ? fine / played.length <= 5 / 60 : null },
        opening: { comments: spoken.length, yourPieceOn: pieceOpeners, rate: ratio(pieceOpeners, spoken.length),
            target: 'Your <piece> on in fewer than 15 of 120 comments', met: spoken.length >= 120 ? pieceOpeners / spoken.length < 15 / 120 : null },
        repetition: rollingRepetition(rows),
        patternPrompts: rows.filter(row => row.requested !== false && row.pattern).map(row => ({ id: row.id, gameId: row.gameId, reminder: row.pattern })),
        limit: 'Pattern prompts are not proof the model mentioned the pattern; manual listening/reading is required.' };
}

export async function loadChecker(url = checkerFile()) {
    if(!existsSync(url)) throw new Error(`Independent board checker unavailable: ${fileURLToPath(url)}. Accuracy NOT measured.`);
    const checker = await import(url.href);
    if(typeof checker.checkAnswer !== 'function') throw new Error('Independent checker must export checkAnswer(position, answer). Accuracy NOT measured.');
    return { check: checker.checkAnswer, fingerprint: sourceFingerprint(url) };
}

export function boardAccuracy(rows, events, check, field = 'answer') {
    const byId = new Map(events.map(event => [event.id, event]));
    let comments = 0, claims = 0, wrongClaims = 0, wrongComments = 0, failedEvents = 0;
    const issues = [];
    for(const row of rows) {
        const event = byId.get(row.id);
        if(!event || event.fen !== row.fen) throw new Error(`Missing or mismatched board for ${row.id}. Accuracy NOT measured.`);
        if(isFailed(row)) { failedEvents++; continue; }
        if(!String(row[field] || '').trim()) continue;
        comments++;
        const result = check({ ...event, question: '', engine: [] }, row[field]);
        if(!Array.isArray(result.issues) || !result.claims) throw new Error('Invalid independent checker result.');
        claims += Object.values(result.claims).reduce((sum, count) => sum + count, 0);
        wrongClaims += result.issues.length;
        if(result.issues.length) { wrongComments++; issues.push({ id: row.id, issues: result.issues }); }
    }
    return { comments, claims, wrongClaims, wrongComments, failedEvents, completeWithoutModelFailures: failedEvents === 0,
        wrongClaimsPerComment: comments ? wrongClaims / comments : null,
        wrongCommentRate: comments ? wrongComments / comments : null, issues };
}

export function studyEvidenceClass(meta) {
    if(meta?.config?.candidateCount > 1) return 'unshipped-candidate-experiment';
    if(meta?.config?.studyRevision === 2 && meta.config.historyPolicy !== historyPolicy) return 'pre-parity-experiment';
    return meta?.config?.historyPolicy === historyPolicy ? 'current-position-parity' : 'historical-or-unknown';
}

function provenanceStatus(label, rows, events) {
    const file = new URL(`${label}.meta.json`, directory);
    if(!existsSync(file)) return { eligible: false, reason: 'Historical unversioned saved run; not validation of current code.' };
    const meta = JSON.parse(readFileSync(file, 'utf8'));
    const classification = studyEvidenceClass(meta);
    const { fingerprint, createdAt, ...identity } = meta;
    const selected = events.slice(0, meta.eventCount);
    const eligible = classification === 'current-position-parity' && meta.schema === 'pena-voice-study/2' && sha(identity) === fingerprint
        && meta.code === sourceFingerprint() && meta.events === sha(selected)
        && rows.length === selected.length && rows.every((row, index) => row.fingerprint === fingerprint && row.id === selected[index].id)
        && Boolean(meta.config.modelIdentity);
    return { eligible, classification, reason: classification === 'pre-parity-experiment'
        ? 'Revision-2 pre-parity experiment: previous-position Q/A was supplied unlike production automatic events. NOT production acceptance evidence; saved JSON is unchanged.'
        : eligible ? 'Current matching implementation and complete selected events; model identity is operator supplied.'
            : 'Stale code, inputs, incomplete run, missing model identity or invalid provenance; NOT current acceptance evidence.', meta };
}

export function matchedRows(baseline, natural) {
    if(new Set(baseline.map(row => row.id)).size !== baseline.length || new Set(natural.map(row => row.id)).size !== natural.length)
        throw new Error('Duplicate comparison IDs.');
    const byId = new Map(natural.map(row => [row.id, row]));
    if(baseline.length !== natural.length) throw new Error('Comparison requires identical event IDs, including suppressed events.');
    return baseline.map(row => {
        const match = byId.get(row.id);
        if(!match || row.fen !== match.fen || row.seed !== match.seed || row.hideMoves !== match.hideMoves)
            throw new Error(`Mismatched baseline/natural event ${row.id}.`);
        return [row, match];
    });
}

async function compare(baselineLabel, naturalLabel) {
    if(!baselineLabel || !naturalLabel) throw new Error('Usage: voice-study.mjs compare <baseline> <natural>');
    const checker = await loadChecker();
    const events = JSON.parse(readFileSync(eventsFile, 'utf8'));
    const baseline = readRows(baselineLabel), natural = readRows(naturalLabel);
    const pairs = matchedRows(baseline, natural);
    const baseStatus = provenanceStatus(baselineLabel, baseline, events), natStatus = provenanceStatus(naturalLabel, natural, events);
    const a = baseStatus.meta, b = natStatus.meta;
    if(a && b && (a.events !== b.events || a.code !== b.code || a.config.modelIdentity !== b.config.modelIdentity
        || a.config.mode !== b.config.mode || a.config.retry !== b.config.retry
        || sha(a.config.nativeModel || null) !== sha(b.config.nativeModel || null)
        || sha(a.config.nativeReasoning || null) !== sha(b.config.nativeReasoning || null)))
        throw new Error('Comparison provenance differs in inputs, code, model, native runtime/normalization or request/retry mode.');
    if(a && b && (a.config.style !== 'legacy' || b.config.style !== 'natural')) throw new Error('Compare expects legacy baseline then natural candidate.');
    const common = pairs.filter(([base, nat]) => !isFailed(base) && !isFailed(nat) && base.answer.trim() && nat.answer.trim());
    const summaries = list => ({ baseline: boardAccuracy(list.map(pair => pair[0]), events, checker.check),
        natural: boardAccuracy(list.map(pair => pair[1]), events, checker.check) });
    const all = summaries(pairs), commonSpoken = summaries(common);
    const generation = { baseline: failureMetrics(baseline), natural: failureMetrics(natural) };
    const eligible = baseStatus.eligible && natStatus.eligible && b.config.mode === 'game' && gameCoverage(events.slice(0, b.eventCount)).met === true;
    const report = { baseline: baselineLabel, natural: naturalLabel, matchedEvents: pairs.length,
        checker: { path: fileURLToPath(checkerFile()), fingerprint: checker.fingerprint,
            limit: 'Bounded placement/geometry/passive-claim detector, not complete chess truth or move-leak verification.' },
        provenance: { baseline: baseStatus, natural: natStatus }, all, commonSpoken, generation,
        generationGate: { eligible: baseStatus.eligible && natStatus.eligible,
            met: baseStatus.eligible && natStatus.eligible ? generation.natural.met : null },
        raw: { baseline: boardAccuracy(baseline, events, checker.check, 'raw'), natural: boardAccuracy(natural, events, checker.check, 'raw') },
        accuracyGate: { eligible, met: eligible && generation.natural.failed ? false
            : eligible && common.length && all.baseline.comments && all.natural.comments
                ? all.natural.wrongClaimsPerComment <= all.baseline.wrongClaimsPerComment
                    && commonSpoken.natural.wrongClaimsPerComment <= commonSpoken.baseline.wrongClaimsPerComment : null },
        acceptance: 'No automatic release claim: fresh whole-game samples, hide-mode manual reading, scripted pattern tests and worker/audio tests are separate gates.' };
    writeFileSync(new URL(`${naturalLabel}-vs-${baselineLabel}-accuracy.json`, directory), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
}

async function analyze(labels) {
    if(!labels.length) throw new Error('Usage: voice-study.mjs analyze <label...>');
    const events = JSON.parse(readFileSync(eventsFile, 'utf8'));
    const checker = await loadChecker();
    const words = text => String(text || '').toLowerCase().replace(/[’]/g, "'").match(/[a-z][a-z0-9]*(?:'[a-z]+)?/g) || [];
    for(const name of labels) {
        const rows = readRows(name).map(row => process.env.PENA_STUDY_RAW
            ? { ...row, answer: String(row.raw || '').split(chatMarkup)[0].trim() } : row);
        const spokenRows = rows.filter(row => !isFailed(row) && row.answer?.trim());
        const generation = failureMetrics(rows);
        const count = pattern => rows.filter(row => !isFailed(row) && row.requested !== false && pattern.test(row.answer)).length;
        const ngrams = new Map(), openers = new Map();
        for(const row of spokenRows) {
            const tokens = words(row.answer);
            const opener = tokens.slice(0, 3).join(' ');
            openers.set(opener, (openers.get(opener) || 0) + 1);
            const seen = new Set();
            for(let size = 3; size <= 6; size++) for(let i = 0; i <= tokens.length - size; i++) seen.add(tokens.slice(i, i + size).join(' '));
            for(const gram of seen) ngrams.set(gram, (ngrams.get(gram) || 0) + 1);
        }
        const provenance = provenanceStatus(name, rows, events);
        const report = { label: name, count: rows.length, provenance,
            currentVersionedRun: provenance.eligible,
            currentAcceptanceEvidence: provenance.eligible && provenance.meta.config.mode === 'game'
                && gameCoverage(events.slice(0, provenance.meta.eventCount)).met === true && generation.failed === 0,
            generationGate: { eligible: provenance.eligible, met: provenance.eligible ? generation.met : null },
            metrics: acceptanceMetrics(rows, events),
            board: boardAccuracy(rows, events, checker.check), checkerFingerprint: checker.fingerprint,
            averageWords: spokenRows.length ? +(spokenRows.reduce((sum, row) => sum + words(row.answer).length, 0) / spokenRows.length).toFixed(1) : null,
            averageSentences: spokenRows.length ? +(spokenRows.reduce((sum, row) => sum + (row.answer.match(/[.!?](?:\s|$)/g) || []).length, 0) / spokenRows.length).toFixed(2) : null,
            reasoningLeak: rows.filter(row => row.reasoning).length, retried: rows.filter(row => row.retried).length,
            cutAtLimit: rows.filter(row => row.finish === 'length').length,
            ...Object.fromEntries(Object.entries(habits).map(([key, pattern]) => [key, count(pattern)])),
            openers: [...openers].sort((a, b) => b[1] - a[1]).slice(0, 12),
            phrases: [...ngrams].filter(([gram, n]) => n >= Math.max(4, rows.length * 0.05) && gram.split(' ').length >= 4)
                .sort((a, b) => b[1] - a[1]).slice(0, 25) };
        writeFileSync(new URL(`${name}${process.env.PENA_STUDY_RAW ? '-raw' : ''}-analysis.json`, directory), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report));
    }
}

function show(label, countArg) {
    for(const row of readRows(label).slice(0, Number(countArg) || 20)) {
        console.log(`[${row.id} ${row.kind}${isFailed(row) ? ' FAILED' : ''}${row.retried ? ' retried' : ''}] ${isFailed(row)
            ? `(FAILED: ${row.error?.message || 'No visible model answer'})` : row.answer || `(${row.status || 'silent'})`}`);
        if(row.raw.trim() !== row.answer) console.log(`    raw: ${row.raw.trim()}`);
        console.log('');
    }
}

if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    try {
        mkdirSync(directory, { recursive: true });
        if(action === 'prepare') await prepare(...args);
        else if(action === 'run' || action === 'game') await run(...args);
        else if(action === 'analyze') await analyze(args);
        else if(action === 'compare') await compare(...args);
        else if(action === 'show') show(...args);
        else throw new Error('Usage: node voice-study.mjs prepare|run|game|analyze|compare|show ... (see the top of this file)');
    } catch(error) { console.error(error.message); process.exitCode = 1; }
}
