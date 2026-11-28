import { Chess } from '../libraries/chessjs/chess.js';
import { factSheet, sanLine, withTurn, citations, formatFactLine } from './factsheet.js';
import { applyInputReferenceRegistry, applyInputAskedBindings } from './input-reference-registry.js';
import { glossary, glossaryTerms, glossaryMentions, demoId, demo, hasDemo, kindTerm, definitionReply } from './glossary.js';
import { personalNotes } from './memory.js';
import { chatPrompt, isBoardEvent, isMoveEvent } from './chat.js';
import { parseQuestionMove, parseQuestionMoves, findPlayedMove, boardMisread } from './questions.js';
import { checkSentence } from './grounding.js';
import { moveMentions, variationFrames } from './teacher.js';
import { speakSan } from '../../js/misc/moveNotation.js';
import { appNotes, appTopics, unsupportedNumbers } from './appnotes.js';
import { realThreat, testDefences } from './defence.js';
import { timelineNotes, alternativeNote } from './timeline.js';
import { TeachingContext } from './teaching-context.js';

// Pena's chat runs on one position at a time. The app does the chess (engine lines, threats,
// move grades, board facts), the adapter does the talking, and every reply is checked against
// the board before the player sees it. Training builds its sheets with chatSheet too.

const positionKey = fen => fen.split(' ').slice(0, 4).join(' ');
const EMPTY = Object.freeze({ squares: [], regions: [], relations: [], frames: [], moves: [], plans: [] });
const squarePattern = /(?<![a-z])[a-h][1-8](?![0-9])/g;
const sanPattern = /(?<![\w-])(?:\d+\.(?:\.\.)?\s*)?(?:\.\.\.)?(O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?)[+#]?(?![\w-])/g;
const tagPattern = /\s*\[[^\]\n]{1,24}\]/g;
const knownTags = String.raw`F\d{1,2}|L[1-3]|A[1-3]|R[1-3]|T|M|H\d|D:[a-z-]+|[SGUP]\d`;
const citedTag = new RegExp(String.raw`\[(${knownTags})\]`, 'g');
const strayTag = new RegExp(String.raw`\s*\[(?!(?:${knownTags})\])[^\]\n]{1,24}\]`, 'g');

// app is the result of appNotes(), its lines only exist when the player asked about A.C.A.S or the match.
// personal is { text, notes } from personalNotes(): local time, plus player facts kept in older saved snapshots.
// timeline is the result of timelineNotes(), the game so far, only when the message is about the past or the game ended.
export function chatSheet(record, { asked = [], playerColor = null, demoTerms = [], app = null, personal = null, timeline = null, earlier = [], question = '', limit = 14 } = {}) {
    const sheet = factSheet(record.fen, { playerColor, engine: record.engine, threat: record.threat, asked, last: record.last, recent: record.recent || [], question, limit });
    sheet.playerColor = playerColor;
    for(const fact of timeline?.facts || []) {
        sheet.facts.push(fact);
        sheet.byId[fact.id] = fact;
    }
    const terms = demoTerms.filter(term => glossary[term]);
    const shown = terms.filter(hasDemo);
    sheet.demos = Object.fromEntries(shown.map(term => [demoId(term), { term, meaning: glossary[term].meaning }]));
    sheet.app = { ...(app?.notes || {}), ...(personal?.notes || {}) };
    const conceptLines = terms.map(term => hasDemo(term)
        ? `[D:${demoId(term)}] demo board for ${glossary[term].title || term}: ${glossary[term].meaning}.`
        : `${glossary[term].title || term}: ${glossary[term].meaning}.`);
    const extra = [app?.text, personal?.text, earlierNote(earlier)].filter(Boolean);
    // The opening name the app already shows on the instance, from the moves played so far.
    const opening = record.opening ? [`Opening played: ${record.opening.replace(/\s*\([A-E]\d{2}\)\s*$/, '')}.`] : [];
    sheet.opening = record.opening || null;
    // The player's message names a piece that is not where they think, the board check says what is really there.
    if(record.misread) opening.push(`Board check: ${record.misread}.`);
    sheet.misread = record.misread || null;
    sheet.text = [sheet.sheet, ...opening, ...conceptLines, ...(timeline?.text ? ['', timeline.text] : []), ...(extra.length ? ['', ...extra] : [])].join('\n');
    return sheet;
}

/** Rebuild original-format notes from captured live state, never cached prose or a target reply. */
export function rebuildCoachingNotes(snapshot) {
    if(snapshot?.schema !== 'pena-live-notes-source/1' || snapshot.record?.fen !== snapshot.fen
        || typeof snapshot.question !== 'string' || !snapshot.question.trim()
        || ['target', 'legacyEvidence', 'notes', 'text', 'prompt'].some(key => key in snapshot))
        throw new Error('Coaching notes require a structured live source snapshot, not cached notes or a target.');
    const { fen, question, playerColor, earlier = [], conversation = [],
        appSnapshot = null, appState = null, personalSnapshot = null, timeline = null,
        timelineState = {}, limit = 14 } = snapshot;
    const record = { ...snapshot.record, opening: snapshot.opening ?? snapshot.record.opening ?? null };
    const asked = structuredClone(snapshot.asked || []);
    const topics = appTopics(question, appState?.topics);
    const demoTerms = [...new Set([...(snapshot.demoTerms || []), ...glossaryTerms(question)
        .filter(term => !(topics.app && term === 'elo')).slice(0, 3)])].slice(-3);
    let parsed = { status: 'none' }, named = [];
    try { parsed = parseQuestionMove(question, fen); named = parseQuestionMoves(question, fen); } catch {}
    const discussingLast = record.last?.san && (isMoveEvent(question) || /\b(?:played|just|was|last move)\b/i.test(question))
        && moveMentions(question).some(mention => typeof mention.input === 'string'
            && mention.input.replace(/[+#]/g, '') === record.last.san.replace(/[+#]/g, ''));
    if(discussingLast) { parsed = { status: 'none' }; named = []; record.misread = null; }
    const alternative = pastAlternative(question, timeline, playerColor);
    const own = named.filter(item => !item.opponent && (!alternative || item.move.san !== alternative.san));
    if(alternative && parsed.move?.san === alternative.san) parsed = { status: 'none' };
    if(parsed.status === 'move' && !parsed.opponent && !own.length) own.push(parsed);
    const unavailableRequestedMoves = [];
    for(const item of own) {
        const uci = item.move.from + item.move.to + (item.move.promotion || '');
        if(asked.some(entry => entry.uci === uci)) continue;
        const captured = record.asked?.find(entry => entry.uci === uci);
        if(captured) asked.push(structuredClone(captured));
        else unavailableRequestedMoves.push(uci);
    }
    if(!own.length && parsed.status === 'illegal' && parsed.spec?.text) {
        const reason = String(parsed.reason || '').trim().replace(/\.$/, '');
        const why = reason ? reason[0].toLowerCase() + reason.slice(1) : '';
        if(!asked.some(entry => entry.san === parsed.spec.text && entry.why === why)) asked.push({ san: parsed.spec.text, why });
    }
    if(record.misread === undefined) {
        try { record.misread = boardMisread(question, fen, playerColor) || null; } catch { record.misread = null; }
    }
    const app = appNotes(question, appSnapshot, { previous: appState });
    const personal = personalSnapshot ? personalNotes(question, { ...personalSnapshot,
        now: personalSnapshot.now ? new Date(personalSnapshot.now) : null }) : { text: '', notes: {}, reply: null };
    const past = timelineNotes(question, timeline, { playerColor, previous: Boolean(timelineState.previous), keep: timelineState.keep || [] });
    if(past) for(const alternative of timelineState.alternatives || []) alternativeNote(past, alternative, playerColor);
    // F* is a stable position dictionary. Query-specific geometry belongs to the grounded Q* rows,
    // not a question-dependent reassignment of an existing citation to a different piece.
    const selectedAsked = applyInputAskedBindings({ fen, asked, registry: snapshot.referenceRegistry });
    // Asked-move slots must not evict definitions from the stable root dictionary.
    let sheet = chatSheet(record, { asked: selectedAsked, playerColor, demoTerms, app, personal, timeline: past, earlier,
        limit: limit + selectedAsked.length, question: '' });
    if(snapshot.referenceRegistry) sheet = applyInputReferenceRegistry(sheet, snapshot.referenceRegistry, { fen, playerColor, formatFactLine });
    const history = conversation.map(item => ({ ...item, pena: item.pena.replace(/\[(F\d{1,2})\]/g, (tag, id) => {
        if(!item.facts?.[id]) return tag;
        const fact = sheet.facts.find(fact => fact.text === item.facts[id]);
        return fact ? `[${fact.id}]` : '';
    }) }));
    return { sheet, record, history, prompt: chatPrompt(sheet.text, history, question),
        directReply: personal.reply || definitionReply(question),
        appState: app.text ? { topics: app.topics, usage: app.usage } : null,
        timelineState: past ? { previous: true, keep: past.facts.filter(fact => /^H[1-9]$/.test(fact.id)
            && fact.ply != null).map(fact => fact.ply), alternatives: timelineState.alternatives || [] } : structuredClone(timelineState),
        notesSnapshot: structuredClone({ ...snapshot, asked: selectedAsked, demoTerms, unavailableRequestedMoves }) };
}

// What was said at earlier positions of this game. It is plain text without tags, so it never draws
// on the board; it only keeps the conversation going.
export function earlierNote(earlier = []) {
    if(!earlier?.length) return '';
    const short = text => {
        const plain = displayText(text);
        if(plain.length <= 220) return plain;
        const cut = plain.slice(0, 220);
        return (cut.match(/^[\s\S]*[.!?](?=\s)/)?.[0] || cut.replace(/\s+\S*$/, '') + '...').trim();
    };
    return ['Earlier in this chat, at older positions, not the board now. Pieces have moved since, so never reuse these words:',
        ...earlier.map(item => `${item.label}, player: ${String(item.player || '').trim()} Pena: ${short(item.pena)}`)].join('\n');
}

export const moveLabel = fen => {
    const [, turn, , , , number] = fen.split(' ');
    return `Move ${number || 1}, ${turn === 'b' ? 'Black' : 'White'} to move`;
};

// What the player sees while the reply streams in. A half written tag at the end stays hidden too.
export function displayText(raw) {
    return String(raw || '').replace(tagPattern, '').replace(/\s*\[[^\]\n]{0,24}$/, '').replace(/[ \t]+([.,!?])/g, '$1').trim();
}

const toScore = line => ({ ...line.score, move: line.move, depth: line.depth });

const pastFraming = /\b(?:had|(?:should|could|would)(?:'ve|\s+have)|(?:should|could|would) i have|back then|at that point)\b/i;
const uciOf = move => move.from + move.to + (move.promotion || '');
const bareSan = san => String(san || '').replace(/[+#]/g, '');

/**
 * "What if I had played Nd5 on move 14": the player's own earlier move the question points at, and the
 * alternative named, legal back then. A move number or "instead of" a played move picks the moment,
 * otherwise past framing tries the last few moves of the player, newest first. Plain "what if I take" stays about now.
 */
export function pastAlternative(message, timeline, playerColor = null) {
    const text = String(message || '');
    if(!timeline?.moves?.length) return null;
    const number = Number(text.match(/\bmove (\d{1,3})\b/i)?.[1]) || null;
    const mine = timeline.moves.filter(move => !playerColor || move.color === playerColor);
    const replaced = /\b(?:instead of|rather than)\b/i.test(text)
        ? mine.filter(move => new RegExp(`(?<![\\w-])${bareSan(move.san).replace(/[+]/g, '')}(?![\\w-])`).test(text)) : [];
    let candidates;
    if(number && (pastFraming.test(text) || /\b(?:what if|instead|rather|better)\b/i.test(text)))
        candidates = mine.filter(move => (Number(move.beforeFen.split(' ')[5]) || 1) === number);
    else if(replaced.length) candidates = replaced.slice(-1);
    else if(pastFraming.test(text)) candidates = mine.slice(-6).reverse();
    else return null;
    for(const move of candidates) {
        let named = [];
        try { named = parseQuestionMoves(text, move.beforeFen, 4); } catch {}
        const alternative = named.find(item => !item.opponent && uciOf(item.move) !== move.uci && bareSan(item.move.san) !== bareSan(move.san));
        if(alternative) return { move, uci: uciOf(alternative.move), san: alternative.move.san };
    }
    return null;
}

// Grades the alternative at the old position, in the shape alternativeNote() adds to that moment's H note.
async function gradeAlternative(engine, alternative, depth) {
    const fen = alternative.move.beforeFen;
    const lines = await engine.lines(fen, { depth, multipv: Math.min(2, new Chess(fen).moves().length) });
    const graded = await gradeMove(engine, { fen, engine: { lines } }, alternative.uci, depth);
    return graded && { ply: alternative.move.ply, fen, color: alternative.move.color, uci: alternative.uci, label: graded.label, reason: graded.reason, pv: graded.pv };
}

/**
 * Engine work for one position, in the same shape the training data used.
 * @param {{ lines(fen: string, options: { depth: number, multipv: number, moves?: string[] }): Promise<any[]>,
 *   compare(best: object, played: object, forced: boolean, runner?: object): { label: string, reason: string } }} engine
 */
export async function analysePosition(engine, fen, { history = [], depth = 14 } = {}) {
    const board = new Chess(fen);
    const recent = [];
    const tail = [...history.slice(-7), fen];
    for(let i = 1; i < tail.length; i++) {
        try { recent.push(findPlayedMove(tail[i - 1], tail[i])?.san); } catch {}
    }
    const record = { fen, engine: { depth, lines: [] }, threat: null, last: null, recent: recent.filter(Boolean) };
    if(board.game_over()) return record;
    record.engine.lines = await engine.lines(fen, { depth, multipv: Math.min(3, board.moves().length) });
    const best = record.engine.lines[0];
    if(!best) return record;
    const previous = history.at(-1);
    let played = null;
    try { played = previous && findPlayedMove(previous, fen); } catch {}
    if(played) {
        const uci = played.from + played.to + (played.promotion || '');
        const choices = new Chess(previous).moves().length;
        const [before, runner] = await engine.lines(previous, { depth: depth - 2, multipv: Math.min(2, choices) });
        const line = before?.move === uci ? before : (await engine.lines(previous, { depth: depth - 2, multipv: 1, moves: [uci] }))[0];
        if(before && line) {
            const grade = engine.compare(toScore(before), { ...line.score, move: uci, depth: line.depth }, choices === 1, runner ? toScore(runner) : null);
            record.last = { fen: previous, uci, san: played.san, label: grade.label, reason: grade.reason,
                critical: Boolean(grade.critical), bestUci: before.move, pv: before.pv };
        }
    }
    if(!board.in_check()) {
        const flipped = withTurn(fen, board.turn() === 'w' ? 'b' : 'w');
        const probe = new Chess();
        if(probe.validate_fen(flipped).valid && probe.load(flipped) && !probe.in_check() && probe.moves().length) {
            const [line] = await engine.lines(flipped, { depth: Math.max(10, depth - 4), multipv: 1 });
            if(line) {
                const value = score => score.cp ?? (score.mate > 0 ? 3000 : -3000);
                record.threat = { pv: line.pv, score: line.score, gain: value(line.score) + value(best.score) };
                if(realThreat(record.threat))
                    record.threat.defences = await testDefences(fen, record.threat, record.engine.lines, (at, options) => engine.lines(at, options), { depth });
            }
        }
    }
    return record;
}

export async function gradeMove(engine, record, uci, depth = 14) {
    const lines = record.engine.lines;
    const best = lines[0];
    if(!best) return null;
    const known = lines.find(line => line.move === uci);
    const played = known || (await engine.lines(record.fen, { depth: depth - 2, multipv: 1, moves: [uci] }))[0];
    if(!played) return null;
    const forced = new Chess(record.fen).moves().length === 1;
    const grade = engine.compare(toScore(best), { ...played.score, move: uci, depth: played.depth }, forced, lines[1] ? toScore(lines[1]) : null);
    return { uci, label: grade.label, reason: grade.reason, score: played.score, pv: played.pv, bestUci: best.move };
}

// Tags right after a full stop belong to the sentence before them.
function taggedSentences(raw) {
    const sentences = [];
    for(let part of String(raw || '').trim().split(/(?<=[.!?])\s+(?=\S)/)) {
        const lead = part.match(/^(?:\s*\[[^\]\n]{1,24}\])+/);
        if(lead && sentences.length) {
            sentences[sentences.length - 1] += lead[0];
            part = part.slice(lead[0].length).trim();
        }
        if(part) sentences.push(part);
    }
    return sentences;
}

/**
 * Rejects concrete contradictions, not strategic reasoning the compact notes did not enumerate.
 * Unverified advice stays unverified; a missing citation is not evidence that it is false.
 */
export function checkReply(raw, sheet, { record, player = '', history = [] } = {}) {
    const fen = sheet.fen;
    const known = new Set();
    const addMoves = list => list?.forEach(move => known.add(move.san.replace(/[+#]/g, '')));
    for(const item of history) {
        for(const match of `${item.player} ${item.pena}`.matchAll(sanPattern)) known.add(match[1].replace(/[+#]/g, ''));
    }
    for(const match of player.matchAll(sanPattern)) known.add(match[1].replace(/[+#]/g, ''));
    for(const fact of sheet.facts) addMoves(fact.line);
    for(const move of new Chess(fen).moves()) known.add(move.replace(/[+#]/g, ''));
    for(const line of record?.engine?.lines || []) addMoves(sanLine(fen, line.pv, 10));
    const kept = [], removed = [], sentences = [];
    let context = '';
    const said = [player, ...history.map(item => `${item.player} ${displayText(item.pena)}`)].join(' ');
    for(const sentence of taggedSentences(raw)) {
        if(/<(?:SQUARE|PIECE)_[^>]*>|<\|[^>]*\|>/.test(sentence)) {
            removed.push({ sentence, reason: 'Internal model tokens are not a reply. Use ordinary words instead.' });
            continue;
        }
        const spoken = displayText(sentence);
        let past = null;
        for(const match of sentence.matchAll(citedTag)) {
            const fact = sheet.byId[match[1]] || sheet.app?.[match[1]];
            if(fact?.alternative) {
                addMoves(fact.alternative.line);
                if(moveMentions(spoken).some(mention => typeof mention.input === 'string'
                    && bareSan(mention.input) === bareSan(fact.alternative.line[0].san))) past = fact.alternative.fen;
            }
            past ??= fact?.moment?.fen || null;
            if(fact?.moment) {
                addMoves(fact.line);
            }
            const term = match[1].startsWith('D:') && sheet.demos?.[match[1].slice(2)]?.term;
            const shown = term && demo(term);
            if(shown) {
                addMoves(shown.frames);
            }
        }
        // A move by the side not on move is a plan, never the current best move or part of a current engine line.
        const current = /\[(?:L|LC)\d/.test(sentence) || /\b(?:(?:is|are|was)\s+(?:the\s+)?(?:best|strongest|top)|best\s+move)\b/i.test(spoken);
        addMoves(variationFrames((past ? '' : context) + spoken, past || fen, { rootColor: sheet.playerColor })
            .filter(frame => !current || frame.kind !== 'hypothetical'));
        const unknown = [...spoken.matchAll(sanPattern)].map(match => match[1].replace(/[+#]/g, '')).filter(san => !known.has(san));
        const numbers = unsupportedNumbers(sentence, sheet.app, said + ' ' + context);
        let reason = unknown.length ? `unknown moves ${unknown.join(' ')}`
            : numbers.length ? `unsupported numbers ${numbers.join(' ')}` : '';
        let result;
        if(!reason) {
            // A sentence about an earlier moment is checked on the board as it was back then.
            result = checkSentence(spoken, past || fen, { context: past ? '' : context, rootColor: sheet.playerColor });
            if(result?.status === 'contradicted' && !/cannot be replayed|after checkmate/i.test(result.reason || '')) reason = result.reason || 'contradicts the board';
        }
        if(reason) { removed.push({ sentence: spoken, reason }); continue; }
        const tagged = result?.repairs?.length && result.text
            ? result.text + ' ' + [...sentence.matchAll(citedTag)].map(match => match[0]).join(' ') : sentence;
        sentences.push({ tagged, analysisFen: past || fen, status: result?.status || 'unchecked',
            reason: result?.reason, repairs: result?.repairs || [], ...citations(tagged.replace(strayTag, ''), sheet) });
        kept.push(tagged);
        context += displayText(tagged) + ' ';
    }
    const tagged = kept.join(' ').replace(strayTag, '');
    return { tagged, removed, sentences, ...citations(tagged, sheet) };
}

// A plain, honest reply built from the notes when the model's own words did not survive checking.
export function fallbackReply(sheet) {
    const fact = sheet.byId.A1 || sheet.byId.L1 || sheet.facts[0];
    if(!fact) return '';
    const text = fact.text.replace(/\s*\([^)]*\)/g, '');
    return `Here is what I can say for sure. ${text[0].toUpperCase()}${text.slice(1)} [${fact.id}].`;
}

const references = (value = {}) => ({ ...EMPTY, ...value });

const negation = /\b(?:no|not|never|without|nor|isn't|aren't|wasn't|weren't|don't|doesn't|didn't|won't|can't|cannot|avoid(?:s|ing)?|instead of|rather than)\s+(?:\S+\s+){0,2}$/i;
const yoursWords = /\b(?:you|your|yours)\b/i;
const theirsWords = /\b(?:they|their|theirs|opponent|opponent's|he|his|she|her|enemy)\b/i;

/**
 * Lets Pena show what he talks about even when he forgot the tag. Every chess concept he mentions gets
 * a visual: a matching fact on the live board when there is one, otherwise the demo board for it.
 * Demos only fill in for general talk, a sentence that names squares or moves is about the real game.
 * Works on a checkReply result and returns a new one, the tags it adds stay out of chat history.
 */
export function conceptVisuals(checked, sheet, { maxFacts = 4, maxDemos = 3, hideMoves = false } = {}) {
    sheet.demos ||= {};
    const shown = new Set();
    let facts = 0, demos = 0, added = 0;
    let context = '', contextFen;
    const tagged = checked.sentences.map(sentence => {
        let text = sentence.tagged;
        const masked = text.replace(/\[[^\]\n]{1,24}\]/g, tag => ' '.repeat(tag.length));
        const spoken = displayText(text);
        const named = [...new Set(spoken.match(squarePattern) || [])];
        const fen = sentence.analysisFen || sheet.fen;
        if(fen !== contextFen) { context = ''; contextFen = fen; }
        const model = new TeachingContext(context + masked, fen, { rootColor: sheet.playerColor, citations: sentence.citations });
        const offset = context.length;
        const aboutBoard = named.length > 0 || spoken.search(sanPattern) >= 0
            || /\b(?:your|their|opponent's|white|black)\b/i.test(spoken);
        const inserts = [];
        for(const mention of glossaryMentions(masked)) {
            const term = mention.term;
            if(negation.test(masked.slice(Math.max(0, mention.index - 40), mention.index))) continue;
            const before = masked.slice(Math.max(0, mention.index - 30), mention.index);
            const position = model.at(offset + mention.index);
            const binding = position.bind(offset + mention.index, offset + mention.end);
            if((binding && binding.status !== 'resolved') || (term === 'hanging piece' && !binding)) continue;
            const targets = binding?.entities.map(entity => entity.square);
            const side = binding?.entities[0]?.color || position.subject || (yoursWords.test(before) ? sheet.playerColor || null
                : theirsWords.test(before) && sheet.playerColor ? (sheet.playerColor === 'w' ? 'b' : 'w') : null);
            const target = targets?.length === 1 ? targets[0] : position.focus;
            const key = JSON.stringify([term, fen, side, target || named]);
            if(shown.has(key) || sentence.citations.some(citation => kindTerm(citation.fact.kind) === term)) continue;
            // A concept word alone must not reveal the concrete move behind it when moves are hidden.
            let candidates = sheet.facts.filter(fact => kindTerm(fact.kind) === term && !fact.moment
                && !(hideMoves && (fact.references?.moves?.length || fact.line?.length)));
            const subject = fact => {
                if(fact.kind === 'pin' && /pinned/i.test(mention.phrase)) {
                    const square = fact.references?.regions?.[0]?.squares?.[0];
                    return square && new Chess(fen).get(square)?.color;
                }
                return fact.side;
            };
            if(side) candidates = candidates.filter(fact => !subject(fact) || subject(fact) === side);
            if(target || named.length) candidates = candidates.filter(fact => {
                const refs = fact.references || {};
                const squares = term === 'hanging piece' ? (refs.regions || []).flatMap(region => region.squares)
                    : [...(refs.squares || []), ...(refs.regions || []).flatMap(region => region.squares),
                        ...(refs.relations || []).flatMap(pair => [pair[0], pair[1]])];
                return targets ? targets.some(square => squares.includes(square))
                    : target ? squares.includes(target) : named.some(square => squares.includes(square));
            });
            const fact = facts < maxFacts && candidates.length === 1 ? candidates[0] : null;
            let id = null;
            if(fact) { id = fact.id; facts++; }
            else if(!mention.weak && !aboutBoard && hasDemo(term) && demos < maxDemos && !sheet.facts.some(other => kindTerm(other.kind) === term)) {
                id = `D:${demoId(term)}`;
                sheet.demos[demoId(term)] = { term, meaning: glossary[term].meaning };
                demos++;
            }
            if(!id) continue;
            shown.add(key);
            inserts.push({ at: mention.end, tag: ` [${id}]` });
        }
        context += masked + ' ';
        for(const insert of inserts.reverse()) text = text.slice(0, insert.at) + insert.tag + text.slice(insert.at);
        added += inserts.length;
        return text;
    });
    if(!added) return checked;
    const sentences = tagged.map((text, index) => ({ ...checked.sentences[index], tagged: text,
        ...citations(text.replace(strayTag, ''), sheet) }));
    const all = tagged.join(' ').replace(strayTag, '');
    return { ...checked, sentences, ...citations(all, sheet), visuals: added };
}

/**
 * Turns one citation into board steps. Facts light up on the live board, lines and demo positions
 * play out move by move on Pena's temporary board over the instance.
 * @returns {{ references: object, line: { frames: object[], index: number, before?: boolean } | null, duration: number }[]}
 */
export function citationSteps(citation, fen) {
    const { id, fact } = citation;
    if(id.startsWith('D:')) {
        const shown = demo(fact.term);
        if(!shown) return [];
        const frames = [{ san: shown.title || fact.term, fen: shown.fen, beforeFen: shown.fen }, ...shown.frames];
        // Opening lines can run ten moves, so they move along a little quicker than a tactic does.
        const pace = shown.frames.length > 4 ? 800 : 1300;
        return [{ references: references(shown.frames.length ? {} : shown.references), line: { frames, index: 0 }, duration: shown.frames.length ? 1200 : 3200 },
            ...shown.frames.map((frame, index) => ({ references: references({ moves: [[frame.from, frame.to]] }),
                line: { frames, index: index + 1, before: true }, duration: pace })),
            ...(shown.frames.length ? [{ references: references(shown.references),
                line: { frames, index: frames.length - 1 }, duration: 3200 }] : [])];
    }
    if(/^H\d$/.test(id)) {
        const moment = fact.moment;
        if(!moment?.played) return [];
        // A past moment plays on the temporary board: the position back then, the move made, then the better way.
        const title = san => ({ san, fen: moment.fen, beforeFen: moment.fen });
        const frames = [title(`Move ${moment.number}`), moment.played,
            ...(moment.better?.length ? [title('Better'), ...moment.better] : []),
            ...(moment.alternative?.length ? [title('What if'), ...moment.alternative] : [])];
        return frames.map((frame, index) => ({ references: references({ moves: frame.from ? [[frame.from, frame.to]] : [] }),
            line: { frames, index }, duration: index === 0 ? 1600 : frame.from ? 1300 : 1100 }));
    }
    const steps = [{ references: references(fact.references), line: null, duration: 2400 }];
    const line = fact.line || [];
    // The first move is on the live board already, so the temporary board only picks up from the reply.
    if(/^(?:L\d|A\d|R\d|T)$/.test(id) && line.length > 1) {
        const frames = line.map(move => ({ ...move }));
        for(let index = 1; index < frames.length; index++)
            steps.push({ references: references({ moves: [[frames[index].from, frames[index].to]] }), line: { frames, index, before: true }, duration: 1300 });
    }
    return steps;
}

const clauseBreak = /(?:[.!?]\s+|[,;:]\s+|\(\s*|\s(?=(?:and|but|while|because|so|then|after|which|where)\s))/g;

// Words in the reply that belong to a cited fact: its moves, its squares or the demo term.
function factWords(citation) {
    const { fact } = citation;
    if(citation.id.startsWith('D:')) return [fact.term];
    const references = fact.references || {};
    return [...(fact.line || []).slice(0, 1).map(move => move.san.replace(/[+#]/g, '')), ...(references.squares || []),
        ...(references.moves || []).flat(), ...(references.relations || []).flatMap(item => [item[0], item[1]])].filter(Boolean);
}

/**
 * Splits a checked reply into spoken phrases. Each citation's visual starts with the clause that
 * first mentions what it shows, after a tiny breath, and moves are read the way people say them.
 */
export function chatPhrases(text, found) {
    const anchors = new Map();
    for(const citation of found) {
        const sentence = Math.max(0, ...[...text.slice(0, citation.index).matchAll(/[.!?]\s+/g)].map(match => match.index + match[0].length));
        const segment = text.slice(sentence, citation.index).toLowerCase();
        const first = Math.min(citation.index, ...factWords(citation).map(word => segment.indexOf(word.toLowerCase())).filter(index => index >= 0).map(index => sentence + index));
        let start = sentence;
        for(const match of text.slice(0, first).matchAll(clauseBreak)) {
            const end = match.index + match[0].length;
            if(end > sentence && end <= first) start = end;
        }
        anchors.set(start, [...(anchors.get(start) || []), citation]);
    }
    let spoken = '', last = 0;
    const map = new Map();
    const mapUpTo = position => {
        for(const anchor of anchors.keys()) if(anchor >= last && anchor <= position && !map.has(anchor)) map.set(anchor, spoken.length + anchor - last);
    };
    for(const mention of moveMentions(text)) {
        if(typeof mention.input !== 'string' || mention.index < last) continue;
        mapUpTo(mention.index);
        spoken += text.slice(last, mention.index);
        spoken += speakSan(mention.input);
        last = mention.end;
    }
    mapUpTo(text.length);
    spoken += text.slice(last);
    const marks = [...anchors].map(([anchor, cited]) => ({ at: map.get(anchor) ?? 0, cited })).sort((a, b) => a.at - b.at);
    const breaks = new Map([[0, 0], [spoken.length, 0]]);
    for(const mark of marks) if(mark.at > 0) breaks.set(mark.at, 180);
    for(const match of spoken.matchAll(/[()]/g)) {
        const index = match.index + (match[0] === ')' ? 1 : 0);
        breaks.set(index, Math.max(120, breaks.get(index) || 0));
    }
    let start = 0;
    for(const match of spoken.matchAll(/[,;:.!?]\s+/g)) {
        const end = match.index + match[0].length;
        if(spoken.slice(start, end).trim().split(/\s+/).length >= 4) {
            if(!breaks.has(end)) breaks.set(end, 0);
            start = end;
        }
    }
    const boundaries = [...breaks.keys()].sort((a, b) => a - b);
    return boundaries.slice(0, -1).map((from, index) => {
        const to = boundaries[index + 1];
        return { text: spoken.slice(from, to).replace(/[()]/g, '').trim(), pauseBefore: breaks.get(from),
            cited: marks.filter(mark => mark.at >= from && mark.at < to).flatMap(mark => mark.cited) };
    }).filter(phrase => phrase.text);
}

/**
 * Conversation state for the position on the board. A new position starts a fresh chat, like the
 * training conversations did.
 */
export class PenaConversation {
    constructor({ engine, tokenCount, context = 2304, replyTokens = 400, maxHistory = 4, maxEarlier = 2, depth = 14 }) {
        Object.assign(this, { engine, tokenCount, context, replyTokens, maxHistory, maxEarlier, depth });
        this.reset(null);
    }

    // A new chat or game forgets everything; a new position keeps a few exchanges as plain notes.
    reset(fen) {
        this.earlier = [];
        this.exchanges = [];
        this.talked = false;
        this.position(fen);
    }

    position(fen) {
        if(this.exchanges?.length && this.fen) {
            const label = moveLabel(this.fen);
            this.earlier.push(...this.exchanges.map(item => ({ label, player: item.player, pena: item.pena })));
            this.earlier = this.earlier.slice(-this.maxEarlier);
        }
        this.fen = fen;
        this.key = fen ? positionKey(fen) : null;
        this.exchanges = [];
        this.asked = [];
        this.demoTerms = [];
        this.appState = null;
        this.past = { previous: false, keep: [] };
        this.analysis = null;
        this.inputReferenceRegistry = null;
    }

    // A copy of everything this chat remembers, so a tab that drops its connection can pick up where it left off.
    save() {
        const keys = ['earlier', 'talked', 'fen', 'key', 'exchanges', 'asked', 'demoTerms', 'appState', 'past', 'analysis', 'inputReferenceRegistry'];
        return Object.fromEntries(keys.map(key => [key, this[key]]));
    }

    restore(saved) {
        if(saved) Object.assign(this, saved);
    }
    follow(fen) {
        if(!fen || positionKey(fen) !== this.key) this.position(fen);
    }

    analyse(fen, history) {
        this.follow(fen);
        this.analysis ??= analysePosition(this.engine, fen, { history, depth: this.depth }).catch(error => {
            this.analysis = null;
            throw error;
        });
        return this.analysis;
    }

    /**
     * snapshot is an optional async function returning the app snapshot for appNotes(). It only runs when
     * the message asks about A.C.A.S, the site or the match. now is the local time.
     * timeline is { moves, result } from gradeGame() and boardResult() for the game so far, opening the name the app shows.
     */
    async prepare(message, { fen, history = [], playerColor = null, snapshot = null, now = new Date(), timeline = null, opening = null }) {
        const record = { ...await this.analyse(fen, history), opening: opening || null };
        const immutableReplay = (record.inputReferenceRegistry || this.inputReferenceRegistry)?.source === 'immutable-original-input';
        try { record.misread = boardMisread(message, fen, playerColor) || null; } catch {}
        let parsed = { status: 'none' };
        let named = [];
        try { parsed = parseQuestionMove(message, fen); named = parseQuestionMoves(message, fen); } catch {}
        const lastMove = record.last?.san;
        const discussingLast = lastMove && (isMoveEvent(message) || /\b(?:played|just|was|last move)\b/i.test(message))
            && moveMentions(message).some(mention => typeof mention.input === 'string'
                && mention.input.replace(/[+#]/g, '') === lastMove.replace(/[+#]/g, ''));
        if(discussingLast) { parsed = { status: 'none' }; named = []; record.misread = null; }
        const asked = this.asked.filter(item => !discussingLast || item.san?.replace(/[+#]/g, '') !== lastMove.replace(/[+#]/g, ''));
        const alternative = pastAlternative(message, timeline, playerColor);
        // A move asked about in the past tense is graded back then, not as a move to play now.
        if(alternative) named = named.filter(item => item.move.san !== alternative.san);
        const own = named.filter(item => !item.opponent);
        if(alternative && parsed.move?.san === alternative.san) parsed = { status: 'none' };
        if(parsed.status === 'move' && !parsed.opponent && !own.length) own.push(parsed);
        if(own.length) {
            for(const item of own) {
                const uci = item.move.from + item.move.to + (item.move.promotion || '');
                if(asked.some(entry => entry.uci === uci)) continue;
                const captured = record.asked?.find(entry => entry.uci === uci);
                const graded = captured || (immutableReplay ? null : await gradeMove(this.engine, record, uci, this.depth));
                if(graded) asked.push(graded);
            }
        } else if(parsed.status === 'illegal' && parsed.spec?.text) {
            const why = String(parsed.reason || '').trim().replace(/\.$/, '');
            const reason = why ? why[0].toLowerCase() + why.slice(1) : '';
            if(!asked.some(entry => entry.san === parsed.spec.text && entry.why === reason)) asked.push({ san: parsed.spec.text, why: reason });
        }
        const topics = appTopics(message, this.appState?.topics);
        // "lower the engine elo" is a settings question, not a request to define Elo.
        const newTerms = glossaryTerms(message).filter(term => !(topics.app && term === 'elo')).slice(0, 3);
        const demoTerms = [...new Set([...this.demoTerms, ...newTerms])].slice(-3);
        let snap = null;
        if((topics.app || topics.match) && snapshot) {
            try { snap = await snapshot(); } catch {}
        }
        const app = appNotes(message, snap, { previous: this.appState });
        const personalSnapshot = { items: [], enabled: false, now, first: !this.talked, update: null };
        const personal = personalNotes(message, personalSnapshot);
        // The game so far wakes up on questions about the past and stays for the follow ups, with the same H tags.
        const keep = alternative && !this.past.keep.includes(alternative.move.ply) ? [...this.past.keep, alternative.move.ply] : this.past.keep;
        const past = timelineNotes(message, timeline, { playerColor, previous: this.past.previous || Boolean(alternative), keep });
        // Alternatives asked earlier in this chat stay on their moments, so "why?" after "what if" still has the grade.
        let alternatives = this.past.alternatives || [];
        if(alternative && past) {
            const known = alternatives.find(item => item.ply === alternative.move.ply && item.uci === alternative.uci);
            let graded = known;
            try { graded ??= immutableReplay ? null : await gradeAlternative(this.engine, alternative, this.depth); } catch {}
            if(graded) alternatives = [graded, ...alternatives.filter(item => item !== known)].slice(0, 3);
        }
        if(past) for(const item of alternatives) alternativeNote(past, item, playerColor);
        const pastState = past ? { previous: true, keep: past.facts.filter(fact => /^H[1-9]$/.test(fact.id) && fact.ply != null).map(fact => fact.ply), alternatives } : this.past;
        let exchanges = this.exchanges.slice(-this.maxHistory);
        // A comment on a fresh board starts clean. Small models copy an older reply word for word otherwise.
        let earlier = isBoardEvent(message) ? [] : this.earlier;
        let limit = 14;
        const topic = exchanges.at(-1)?.topic;
        const followUp = /^(?:(?:which|what) (?:knight|bishop|rook|queen|king|pawn|piece)(?: do you mean)?|why(?: is that)?)[?.!]*$/i.test(message.trim());
        const question = followUp && topic?.beforeFen === record.fen ? `${message} About ${topic.san}.` : message;
        const build = () => {
            return rebuildCoachingNotes({ schema: 'pena-live-notes-source/1', record, fen, history, playerColor,
                question: message, conversation: exchanges, asked: asked.slice(-3), demoTerms, earlier, limit,
                appSnapshot: snap, appState: this.appState, personalSnapshot,
                referenceRegistry: record.inputReferenceRegistry || this.inputReferenceRegistry || null,
                timeline, timelineState: { previous: this.past.previous || Boolean(alternative), keep, alternatives } });
        };
        let { sheet, prompt, history: preparedHistory, notesSnapshot } = build();
        // Older talk goes first when the context is full, this position's chat before the earlier positions.
        while((exchanges.length || earlier.length) && this.tokenCount(prompt) + this.replyTokens > this.context) {
            if(exchanges.length) exchanges = exchanges.slice(1);
            else earlier = earlier.slice(1);
            ({ sheet, prompt, history: preparedHistory, notesSnapshot } = build());
        }
        while(limit > 0 && this.tokenCount(prompt) + this.replyTokens > this.context) {
            limit--;
            ({ sheet, prompt, history: preparedHistory, notesSnapshot } = build());
        }
        if(this.tokenCount(prompt) + this.replyTokens > this.context)
            throw new Error('Pena question and required notes exceed the model context. Shorten the question.');
        return { prompt, sheet, record, history: preparedHistory, notesSnapshot, directReply: personal.reply || definitionReply(message),
            pending: { message, asked: asked.slice(-3), demoTerms, appState: app.text ? { topics: app.topics, usage: app.usage } : null, past: pastState } };
    }

    remember(prepared, tagged) {
        if(positionKey(prepared.sheet.fen) !== this.key) return;
        this.asked = prepared.pending.asked;
        this.demoTerms = prepared.pending.demoTerms;
        this.appState = prepared.pending.appState;
        this.past = prepared.pending.past || this.past;
        const facts = Object.fromEntries(citations(tagged, prepared.sheet).citations
            .filter(({ id }) => /^F\d+$/.test(id)).map(({ id, fact }) => [id, fact.text]));
        const topic = citations(tagged, prepared.sheet).citations.map(({ fact }) => fact.line?.[0])
            .find(frame => frame?.beforeFen === prepared.sheet.fen) || null;
        this.exchanges.push({ player: prepared.pending.message, pena: tagged, facts, topic });
        this.exchanges = this.exchanges.slice(-8);
        this.talked = true;
    }
}
