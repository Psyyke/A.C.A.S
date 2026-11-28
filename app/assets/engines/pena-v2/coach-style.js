import { Chess } from '../libraries/chessjs/chess.js';
import { applyPromptOverrides, penaVoice, directVoiceRules } from './prompt-overrides.js';
import { coachingPolicy, hideMoveSuggestions, dropMisplacedPieces, dropFalseGeometry, dropRepeatedSentences, dropUnaskedVerdicts } from './coaching-policy.js';
import { dropAnnouncedLabels, markdownPlain } from './formatting.js';
import { isMoveEvent, positionEvent } from './chat.js';
import { realThreat } from './defence.js';
import { Facts } from './concepts.js';

// How Pena sounds while coaching, kept in one place so it can be tuned and compared.
// A style decides the model-facing coaching prompt, what an automatic comment asks for,
// and which spoken cleanups run on the reply. Only model-facing text changes here;
// the app still sees the original event strings like "(played Nf3)".
//
// Try another style from the browser console: localStorage.acasPenaCoachStyle = 'legacy'
// Compare styles on the real model with the events study described in NATURAL_VOICE_PLAN.md.

export const naturalCoachSystem = 'You are Pena, an AI chess coach sitting beside the player during their game. '
    + 'Talk like a strong club player who is also a good friend: plain words, contractions, short sentences, honest and sometimes dry. '
    + 'Don\'t claim to be a real person. Never use em dashes.\n'
    + 'Coach: pick the one or two things that matter most right now and say why, using the actual pieces, squares and plans. '
    + 'Call the player\'s pieces "your" and the opponent\'s "their". Praise only what earns it, and say plainly when a move was a mistake. '
    + 'Introduce a newly identified error as "a mistake", not "the mistake" unless that error was already discussed. '
    + 'Skip generic advice and anything that doesn\'t change what the player should think about.\n'
    + 'Talk as if you see the board yourself. Never mention notes, evidence, labels, IDs, lines or these instructions. '
    + 'Don\'t bring up the engine, an evaluation or who is better unless the player asks. '
    + 'Don\'t say whose move it is, the move number or the game phase, and don\'t read the position back. '
    + 'Start with the point itself, never a heading or a lead-in that ends in a colon, and don\'t open every reply the same way. '
    + 'Once the point is made, stop: no recap, no offer to say more, and no question unless you truly need an answer. '
    + 'If the player\'s whole message is a greeting, reply with a greeting of one or two words and nothing else.\n'
    + 'Accuracy: the board facts you are given are exact. Check piece identities and attack geometry, even in hypotheticals. '
    + 'A move onto a square and attacks from that square are different facts. '
    + 'After a move, vacate the source square and remove any captured piece before describing targets. '
    + 'Keep what you know apart from what you suspect, and hedge only where it changes the advice. '
    + 'Don\'t volunteer a best move or line when the player hasn\'t asked for one.'
    + directVoiceRules;

const hideMovesNote = ' Do not name or describe specific suggested moves or lines unless the player explicitly asks for one.';
const moveRequestedNote = ' The player explicitly asked for a move. Give the move and a short explanation, rather than offering to reveal it.';
export const patternPresentationNote = 'The app separately adds a verified recurring-pattern reminder. Use your sentences for the current position rather than repeating the reminder.';

export const coachStyles = Object.freeze({
    // The voice in this file, with comments written for listening.
    natural: Object.freeze({ system: naturalCoachSystem, events: true, cleanup: true }),
    // The prompts before this file existed, for A/B comparisons.
    legacy: Object.freeze({ system: null, events: false, cleanup: false })
});
export const defaultCoachStyle = 'natural';
export const coachStyle = name => coachStyles[name] || coachStyles[defaultCoachStyle];
export const coachStyleName = name => Object.hasOwn(coachStyles, name) ? name : defaultCoachStyle;

// A small model keeps opening with "Your knight on f3 ...". When an automatic comment starts that way,
// the worker stops after a few words, before anything is shown or spoken, and asks once more with this nudge.
// The nudge is only sent after the opener appeared, so it never primes the first try.
const stockOpener = /^\W*your\s+(?:king|queen|rook|bishop|knight|pawn)s?\s+on\b/i;
export const opensWithStockOpener = text => stockOpener.test(String(text || ''));
export const openerDecided = text => /[.!?]/.test(text) || String(text).trim().split(/\s+/).length >= 4;
export const openerRetryNote = 'Begin with the idea or the opponent, not with one of the player\'s pieces.';
export function retryOpenerMessages(messages) {
    const last = messages.findLastIndex(message => message.role === 'user');
    return messages.map((message, index) => index === last ? { ...message, content: `${message.content} ${openerRetryNote}` } : message);
}

export function moveGradeKind(label) {
    const text = String(label || '').toLowerCase();
    if(/(?:catastrophic|blunder|mistake|inaccuracy|weak)/.test(text)) return 'bad';
    if(/(?:best|excellent|good|forced)/.test(text)) return 'good';
    return 'unknown';
}

function automaticFeatures(record, playerColor) {
    if(!record.fen) return { hanging: [], minor: [], pawns: [], material: false, check: false };
    const facts = new Facts(record.fen), color = playerColor || facts.board.turn();
    const hanging = facts.find(null, color).filter(piece => facts.hanging(piece).length && facts.capturers(piece.square, color === 'w' ? 'b' : 'w').length);
    const minor = facts.find('nb', color).filter(piece => piece.square[1] === (color === 'w' ? '1' : '8'));
    const pawns = facts.find('p', color).filter(piece => facts.passed(piece) || facts.isolated(piece));
    const played = record.last?.fen && playedSan(record.last.fen, record.fen);
    return { hanging, minor, pawns, check: facts.board.in_check(), material: Boolean(played && /x|=/.test(played)),
        endgame: facts.pieces.length <= 10 };
}

// The threat probe is a null move for the side that just moved. After the player's own move it is
// their follow-up, not something the opponent is threatening against them.
function ownThreat(record, playerColor) {
    return Boolean(playerColor && record.fen && record.fen.split(' ')[1] !== playerColor);
}

export function shouldSpeakAutomatic(record = {}, chattiness = 'normal', { silentPlies = 0, calmTurns = 0, playerColor } = {}) {
    if(chattiness === 'chatty') return true;
    if(chattiness === 'quiet') return (realThreat(record.threat) && !ownThreat(record, playerColor)) || Boolean(record.last?.critical)
        || /\b(?:catastrophic|blunder|mistake)\b/i.test(record.last?.label || '');
    const bad = Boolean(record.last && moveGradeKind(record.last.label) === 'bad');
    const threat = realThreat(record.threat);
    const good = Boolean(record.last && moveGradeKind(record.last.label) === 'good');
    if(bad || threat || record.last?.critical) return true;
    const features = automaticFeatures(record, playerColor);
    if(features.check || features.material || features.hanging.length) return true;
    if(good || /neutral|forced/i.test(record.last?.label || '')) return silentPlies >= 1 || calmTurns % 2 === 1;
    if(silentPlies >= 1) return true;
    return true;
}

export function chooseCommentFocus(record = {}, previous = -1, { playerColor } = {}) {
    const threat = realThreat(record.threat) && !ownThreat(record, playerColor);
    const setup = realThreat(record.threat) && !threat;
    const bad = Boolean(record.last && moveGradeKind(record.last.label) === 'bad');
    const features = automaticFeatures(record, playerColor);
    const choices = threat ? ['what your opponent is after', 'what their threat aims at and why it matters']
        : bad ? ['what the move allowed', 'what to do now']
        : record.last?.critical ? ['why this was a particularly good find']
        : features.check ? ['meeting the check']
        : setup ? ['what the move sets up', 'what they have to answer now']
        : features.hanging.length ? [`the pressure on ${features.hanging[0].square}`, 'how the pieces defend each other']
        : features.material ? ['what the exchange changed', 'what the remaining pieces need']
        : ['what the move changed', ...(record.engine?.lines?.[0]?.pv?.length >= 2 ? ['the next few moves'] : []),
            ...(features.minor.length ? [`the undeveloped minor piece on ${features.minor[0].square}`] : []),
            ...(features.pawns.length ? [`the pawn structure around ${features.pawns[0].square}`] : []),
            ...(features.endgame ? ['king activity in this endgame'] : [])];
    const index = ((previous + 1) % choices.length + choices.length) % choices.length;
    return { index, focus: choices[index] };
}

function playedSan(previousFen, fen) {
    if(!previousFen || !fen) return null;
    // chess.js writes an en passant square after every double push, so that field is left out.
    const key = value => value.split(' ').slice(0, 3).join(' ');
    try {
        const board = new Chess(previousFen), target = key(fen);
        for(const move of board.moves({ verbose: true })) {
            board.move(move);
            const reached = key(board.fen()) === target;
            board.undo();
            if(reached) return move.san;
        }
    } catch {}
    return null;
}

/**
 * What an automatic comment asks for, in place of the bare event string.
 * The player typed nothing, so the model hears that plainly instead of guessing the question was cut off.
 */
export function eventInstruction(question, { fen = '', previousFen = '', hideMoves = false, moveGrade = '', focus = '', recent = [], pattern = '', avoid = [] } = {}) {
    const text = String(question || '').trim();
    const rules = `No greeting, no question, and don't say whose move it is.${hideMoves ? ' Don\'t name or hint at a move for them.' : ''}`;
    const leaned = avoid.slice(0, 3).map(phrase => `"${phrase}"`).join(', ');
    const variety = (recent.length ? ` Do not copy these recent openings: ${recent.slice(-4).join('; ')}.` : '')
        + (leaned ? ` Recent comments already leaned on ${leaned}, so word it differently this time.` : '');
    const intent = focus ? `Focus on ${focus}, unless the position makes that wrong.` : '';
    const recurrence = pattern ? ` ${pattern}` : '';
    if(isMoveEvent(text)) {
        const san = text.slice('(played '.length, -1);
        let grade = 'If it was a mistake, say so plainly.';
        if(/(?:catastrophic|blunder|mistake)/i.test(moveGrade))
            grade = `It was a mistake or worse. Say plainly what ${san} allowed.`;
        else if(/(?:inaccuracy|weak)/i.test(moveGrade))
            grade = 'It was a small concession, not a major mistake. Explain the tradeoff without overstating it.';
        else if(/neutral/i.test(moveGrade))
            grade = 'It was playable, not a mistake. Talk about what changed or what comes next.';
        else if(/(?:best|excellent|good|forced)/i.test(moveGrade))
            grade = 'It was a good move, so do not grade it. Talk about what changed or what comes next.';
        return `(The player didn't say anything. They just played ${san}.) React like a coach watching over their shoulder, `
            + 'in one or two short sentences: what the move does or allows, or what their opponent is after now. '
            + `${grade}${intent ? ` ${intent}` : ''}${recurrence}${variety} ${rules}`;
    }
    if(text === positionEvent) {
        const san = playedSan(previousFen, fen);
        return `(The player didn't say anything.${san ? ` Their opponent just played ${san}.` : ''}) `
            + 'Like a coach watching over their shoulder, tell them in one or two short sentences what matters most now and why. '
            + `${intent}${recurrence}${variety}${intent || recurrence || variety ? ' ' : ''}${rules}`;
    }
    return null;
}

// Earlier automatic turns read as the event that happened, not as a strange question.
const earlierEvent = text => isMoveEvent(text) ? `(No message. They played ${String(text).trim().slice('(played '.length, -1)}.)`
    : String(text || '').trim() === positionEvent ? '(No message. The board changed.)' : null;

const questionMarker = 'Player question: ';
const binding = /^(?:CURRENT question-subject|Question subject)[^\n]*\n?/gm;

/**
 * The coaching messages as the model reads them, styled for one request.
 * english is false for the PCF LoRA, which keeps the trained wording.
 */
export function styleCoachingMessages(messages, { style, english = true, overrides = {}, custom = false, automatic = false,
    question = '', hideMoves = false, moveRequested = false, reminder = '', fen = '', previousFen = '',
    moveGrade = '', focus = '', recent = [], pattern = '', avoid = [] } = {}) {
    const chosen = coachStyle(style);
    const natural = english && chosen.system;
    const extra = moveRequested && !hideMoves ? moveRequestedNote : hideMoves ? hideMovesNote : '';
    let styled = custom ? applyPromptOverrides(messages, overrides)
        : messages.map((item, index) => index === 0 && item.role === 'system'
            ? { ...item, content: natural ? chosen.system : `${item.content} ${penaVoice}` } : item);
    // A custom character keeps its voice, but still coaches by the same rules.
    styled = styled.map((item, index) => index === 0 && item.role === 'system'
        ? { ...item, content: `${item.content}${natural && !custom ? '' : ` ${coachingPolicy}`}${extra}` } : item);
    const instruction = english && chosen.events && automatic
        ? eventInstruction(question, { fen, previousFen, hideMoves, moveGrade, focus, recent, pattern, avoid }) : null;
    const lastIndex = styled.length - 1;
    return styled.map((item, index) => {
        if(index === lastIndex) {
            let content = item.content;
            const at = instruction ? content.lastIndexOf(questionMarker) : -1;
            if(at >= 0) {
                const before = content.slice(0, at).replace(binding, '').trimEnd();
                content = before ? `${before}\n\n${instruction}` : instruction;
            }
            return reminder ? { ...item, content: `${reminder}\n\n${content}` } : { ...item, content };
        }
        if(english && chosen.events && item.role === 'user' && earlierEvent(item.content))
            return { ...item, content: earlierEvent(item.content) };
        if(english && chosen.cleanup && item.role === 'assistant')
            return { ...item, content: dropAnnouncedLabels(item.content, {
                previous: styled.slice(0, index).filter(earlier => earlier.role === 'assistant').map(earlier => earlier.content),
                question: styled[index - 1]?.role === 'user' ? styled[index - 1].content : ''
            }).text };
        return item;
    });
}

// ---------- spoken cleanup ----------
// Each filter takes only what a listener would wait through, keeps the rest word for word,
// and gives back { text, removed } like the other reply checks.

const markerChars = /[\uE000-\uF8FF]/g;
const plain = text => String(text).replace(markerChars, '');

// Sentences with the spacing after them, so joining them back changes nothing else.
function segments(text) {
    const masked = text.replace(/\b\d+\.(?:\.\.)?|\.\.\./g, value => value.replaceAll('.', 'x'));
    return [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(masked)]
        .map(({ segment, index }) => text.slice(index, index + segment.length));
}
const hasWords = text => /[A-Za-z0-9]/.test(plain(text));
const capitalize = text => text.replace(/^([\s\uE000-\uF8FF"'(]*)([a-z])/, (_, lead, letter) =>
    /^[a-h](?:x|[1-8])/.test(text.slice(lead.length)) ? lead + letter : lead + letter.toUpperCase());

const turnTail = String.raw`(?:,?\s+(?:on\s+|at\s+)?move\s+\d+)?(?:,?\s+(?:in\s+)?(?:the\s+|an?\s+)?(?:opening|middlegame|endgame|ending)(?:\s+(?:phase|stage|position))?)?`;
// "Your move" can start a real sentence ("Your move to e4 was strong"), so only the unmistakable forms lose a lead-in.
const clearTurn = String.raw`(?:(?:(?:it'?s|it\s+is)\s+)?(?:white|black)(?:\s+is)?\s+(?:to\s+(?:move|play)|on\s+move)|(?:it'?s|it\s+is)\s+(?:white's|black's|your|their|the\s+opponent's|your\s+opponent's)\s+(?:move|turn)|you(?:'re|\s+are)\s+(?:to\s+(?:move|play)|on\s+move))${turnTail}`;
const anyTurn = String.raw`(?:${clearTurn}|(?:white's|black's|your|their|the\s+opponent's|your\s+opponent's)\s+(?:move|turn)${turnTail})`;
const turnSentence = new RegExp(String.raw`^\s*(?:(?:so|okay|ok|right|alright|now|well),?\s+)?${anyTurn}\s*[.!]*["')\]\s\uE000-\uF8FF]*$`, 'i');
const turnLead = new RegExp(String.raw`^(\s*)(?:(?:so|okay|ok|right|alright|now|well),?\s+)?(?:with\s+)?${clearTurn}\s*(?:,\s*(?:and|so|but)\s+|,\s+(?=(?:the|your|their|black's|white's|his|her|my)\s)|:\s+|;\s+|\s+and\s+|\s*[\u2013-]\s+)`, 'i');
const midTurnLead = /^(\s*)(?:the\s+)?position\s+is\s+(?:white|black)\s+to\s+move(?:,\s*move\s+\d+)?(?:,\s*with\b)?\s*(?:,?\s*)/i;
const asksTurn = /\b(?:whose|who'?s|who\s+is)\b[^?]*\b(?:move|turn)\b|\b(?:my|your)\s+(?:move|turn)\b|\bto\s+move\b/i;

/** "White to move." opens a comment the listener already knows. The sentence or its lead-in goes. */
export function dropTurnStatements(text, { question = '' } = {}) {
    if(asksTurn.test(String(question || ''))) return { text, removed: [] };
    const parts = segments(String(text || '')), removed = [];
    const kept = parts.map(part => {
        if(turnSentence.test(plain(part))) { removed.push(part.trim()); return ''; }
        const mid = part.match(midTurnLead);
        if(mid && hasWords(part.slice(mid[0].length))) {
            removed.push(mid[0].trim());
            return capitalize(mid[1] + part.slice(mid[0].length));
        }
        const lead = part.match(turnLead);
        if(lead && hasWords(part.slice(lead[0].length))) {
            removed.push(lead[0].trim());
            return capitalize(lead[1] + part.slice(lead[0].length));
        }
        return part;
    });
    const result = kept.join('');
    return removed.length ? { text: result.trim(), removed } : { text, removed: [] };
}

// "If you want to keep the bishop, play Be2" is advice, so "if you want" counts only before a comma or an "I can".
const offer = /^\s*(?:(?:and|but|so|also|anyway|or),?\s+)?(?:if\s+you(?:'d)?\s+(?:want|like|wish|prefer)(?:\s*,|\s+(?:me|i|we)\b|\s+to\s+(?:see|hear|know|go\s+deeper|dig))|if\s+(?:it|that)\s+helps|whenever\s+you(?:'re|\s+are)\s+ready|want\s+me\s+to|would\s+you\s+like|do\s+you\s+want\s+me\s+to|shall\s+(?:i|we)|should\s+i|let\s+me\s+know|feel\s+free|happy\s+to|i\s+can\s+(?:also\s+)?(?:walk|show|go|explain|break|look|dig|compare|check|talk|give|point|run)|(?:i|we)\s+could\s+(?:also\s+)?(?:walk|look|go|dig|compare|check|talk|run))(?:\b|(?<=,))/i;
const checkIn = /^\s*(?:(?:so|and|anyway|now|or),?\s+)?(?:(?:what|which|where|how)\b[^?]{0,90}\b(?:you|your)\b[^?]{0,70}\b(?:want|like|prefer|focus|focusing|thinking|think|planning|plan|considering|go\s+with|take\s+it|look\s+at|dig\s+into|tackle|curious|lean(?:ing)?)\b[^?]*|(?:does|did)\s+(?:that|this)\s+(?:help|make\s+sense)[^?]*|makes?\s+sense|any\s+(?:questions|thoughts)[^?]*|sounds?\s+good|(?:do\s+you\s+)?want\s+(?:me\s+)?to\b[^?]*|shall\s+(?:i|we)\b[^?]*|ready\b[^?]*|what(?:'s|\s+is)\s+your\s+(?:plan|idea|thinking|move|call)[^?]*|thoughts)\s*\?/i;
// An automatic comment answers nothing, so talk about a missing question is confusion, not coaching.
const confused = /\b(?:question|message)\b[^.!?]{0,40}\b(?:cut\s+off|cut\s+short|missing|empty|incomplete|blank|truncated|got\s+lost)\b|\bwhat\s+(?:are|were)\s+you\s+asking\b|\byou\s+didn'?t\s+(?:ask|say|type)\b|\bno\s+question\b|\bnothing\s+(?:was\s+)?asked\b|\bwhat\s+do\s+you\s+want\s+me\s+to\s+(?:look\s+at|focus\s+on|check)\b/i;
const metaOnly = /\b(?:(?:board\s+)?facts|evidence|notes?|labels?|instructions?|prompt|data)\b/i;
const metaWithChess = /\b(?:the|a)\s+(?:pawn-chain|pawn chain|engine|piece|position|board|opening|stockfish|computer)\s+note\b|\b(?:engine|pawn-chain|pawn chain)\s+(?:line|note)\b/i;
const chessWord = /\b[a-h][1-8]\b|\b(?:king|queen|rook|bishop|knight|pawn|piece)s?\b|\b[KQRBN]?[a-h]?x?[a-h][1-8]\b|\bO-O\b/;
// The model planning its reply out loud, which only belongs in its thoughts.
const planning = /^\s*(?:(?:so|okay|ok|now),?\s+)?(?:i(?:\s+(?:should|need\s+to|will|must)|['’]ll)\s+(?:give|answer|keep|focus|respond|reply|stay|avoid|not|mention|explain|say|stick|point\s+out|be\s+(?:brief|short|concise|careful))|the\s+(?:user|player)\s+(?:is\s+asking|asks|asked|wants|wanted|didn'?t|did\s+not|just\s+(?:played|moved|made))|the\s+question\s+is\s+(?:open|vague|broad|general|asking|about|unclear)|(?:this|that)\s+is\s+an?\s+(?:open|automatic|general)\b)/i;

/**
 * Offers to say more and check-in questions at the end, the "anything else?" of a coach, go.
 * An automatic comment also loses any closing question and any talk about a question it never got.
 */
export function dropClosingOffers(text, { event = false } = {}) {
    let parts = segments(String(text || ''));
    const removed = [];
    const drop = index => { removed.push(parts[index].trim()); parts = parts.filter((_, at) => at !== index); };
    const words = () => parts.filter(hasWords).length;
    if(event) for(let index = parts.length - 1; index >= 0; index--) {
        const sentence = plain(parts[index]);
        if(confused.test(sentence) || metaOnly.test(sentence) && (!chessWord.test(sentence) || metaWithChess.test(sentence))) drop(index);
    }
    for(let index = parts.length - 1; index >= 0; index--) {
        const sentence = plain(parts[index]);
        if(offer.test(sentence) || planning.test(sentence) && !chessWord.test(sentence)) drop(index);
    }
    while(words() > 0) {
        const last = parts.findLastIndex(hasWords), sentence = plain(parts[last]).trim();
        if(!/\?["')\]]*$/.test(sentence) || !(event || checkIn.test(sentence))) break;
        drop(last);
    }

    return removed.length ? { text: parts.join('').trim(), removed } : { text, removed };
}

const functionWords = new Set('a an the is are was were be been being to of in on at by for from with into onto toward towards around against over under through behind after before about out up down off across along past between among within without and or but so as if then than that this it its your their you they we our my his her not no can could should would will do does did have has had just also now still here there it\'s that\'s there\'s here\'s it\'ll you\'re they\'re we\'re'.split(' '));
const chessWords = /^(?:[a-h][1-8]|[kqrbn]?[a-h]?[1-8]?x?[a-h][1-8]|king|queen|rook|bishop|knight|pawn|piece|square|file|rank|diagonal|move|white|black|check|castle|castling|castled|centre|center|development|endgame|opening|middlegame|pin|pinned|fork|forked|skewer|skewered|checkmate|mate|stalemate|promotion|promote|queening|underpromotion)s?$/;

// "the open e-file" is one chess term, not the phrase "open e".
const chessTerms = text => text.replace(/\b(?:half-)?open\s+(?:[a-h]-)?(files?)\b|\b[a-h]-(files?|pawns?)\b/gi, (_, open, single) => open || single);

export function voicePhrases(text) {
    const words = chessTerms(markdownPlain(plain(text))).toLowerCase().replace(/’/g, "'").match(/[a-z][a-z0-9]*(?:'[a-z]+)?/g) || [];
    const found = new Set();
    for(let size = 2; size <= 6; size++) for(let index = 0; index <= words.length - size; index++) {
        const group = words.slice(index, index + size);
        if(group.some(word => chessWords.test(word.replace(/'s$/, ''))) || group.every(word => functionWords.has(word))) continue;
        found.add(group.join(' '));
    }
    return found;
}

// The wording recent comments keep reaching for, longest form first, so the next prompt can steer away before the limit is hit.
// Phrases a stock rewording already covers come last, because the repetition limit can still vary those after generation.
export function leanedPhrases(recent = [], { window = 10, least = 2, most = 3 } = {}) {
    const counts = new Map();
    for(const previous of recent.slice(-(window - 1)))
        for(const phrase of voicePhrases(previous)) counts.set(phrase, (counts.get(phrase) || 0) + 1);
    const candidates = [...counts].filter(([, count]) => count >= least);
    const reworded = candidates.map(([phrase]) => phrase).filter(phrase => stockWordings.some(([pattern]) => pattern.test(phrase)));
    const covered = phrase => reworded.some(longer => ` ${longer} `.includes(` ${phrase} `)) ? 1 : 0;
    const frequent = candidates.sort((a, b) => covered(a[0]) - covered(b[0]) || b[1] - a[1] || b[0].split(' ').length - a[0].split(' ').length);
    const chosen = [];
    for(const [phrase] of frequent) {
        if(chosen.some(kept => ` ${kept} `.includes(` ${phrase} `) || ` ${phrase} `.includes(` ${kept} `))) continue;
        chosen.push(phrase);
        if(chosen.length >= most) break;
    }
    return chosen;
}

// Same-meaning wordings for the stock coaching phrases that pile up over a game.
// They only replace a phrase that has already been said in too many recent comments.
const stockWordings = [
    [/\b(is|are)\s+hanging\s+to\b/i, ['$1 unprotected against', 'can be taken for free by']],
    [/\bhanging\s+to\b/i, ['loose against', 'unprotected against']],
    [/\b(is|are)\s+hanging\b(?!\s+to\b)/i, ['$1 loose', 'can be taken for free']],
    [/\bhangs\b/i, ['drops', 'loses']],
    [/\bso\s+don['’]t\b/i, ['so you shouldn\'t', 'so be careful not to']],
    [/\bdon['’]t\s+let\b/i, ['avoid letting', 'be careful not to let']],
    [/\b(has|have|need|needs)\s+to\s+deal\s+with\b/i, ['$1 to handle', '$1 to take care of']],
    [/\bdeal\s+with\b/i, ['handle', 'take care of']],
    [/\bunder\s+fire\b/i, ['under attack']],
    [/\bthe\s+(?:thing|piece|one)\s+to\s+watch\b/i, ['the main danger', 'what needs watching']],
    [/\bkeep\s+an\s+eye\s+on\b/i, ['watch', 'be ready for']],
    [/\bthe\s+real\s+([a-z]+)\b/i, ['the main $1', 'the bigger $1']],
    [/\bstuck\s+in\b/i, ['caught in', 'left in']],
    [/\bso\s+keep\b/i, ['so make sure you keep', 'so try to keep']],
    [/\b(is|are)\s+doing\s+nothing\b/i, ['$1 idle', 'has no job']],
    [/\bkeeps\s+the\s+([a-z]+)\s+(active|useful|guarded|safe|protected)\b/i, ['leaves the $1 $2', 'lets the $1 stay $2']],
    [/\bkeep\s+the\s+([a-z]+)\s+(active|useful|guarded|safe|protected)\b/i, ['make sure the $1 stays $2', 'leave the $1 $2']],
    [/\bkeep\s+(the|your)\s+((?:[a-z]+\s+){1,2}and\s+(?:the\s+|your\s+)?[a-z]+)\s+(active|useful|guarded|safe|protected|alive|busy|developed)\b/i,
        ['make sure $1 $2 stay $3', 'leave $1 $2 $3']],
    [/\bkeep\s+(the|your)\s+(?=bishop\s+pair\b)/i, ['hold on to $1 ', 'hang on to $1 ']],
    [/\bthe\s+one\s+thing\b/i, ['the only thing', 'the single thing']],
    [/\bkeeps\s+the\s+(?=(?:centre|center|pressure|initiative|tension|structure|balance)\b)/i, ['holds the ', 'maintains the ']],
    [/\bkeep\s+the\s+(?=(?:centre|center|pressure|initiative|tension|structure|balance)\b)/i, ['hold the ', 'maintain the ']],
    [/\ba\s+bit\b(?!\s+of\b)/i, ['slightly', 'somewhat']],
    [/\bwill\s+likely\b/i, ['will probably', 'will most likely']],
    [/\bunder\s+pressure\b/i, ['under attack', 'being targeted']],
    [/\b(in|on|toward|towards|into|through|across)\s+the\s+middle\b(?!\s+of\b)/i, ['$1 the centre']],
    [/\beyeing\b/i, ['aiming at', 'looking at']],
    [/\btake\s+it\b(?!\s+(?:easy|slow|back)\b)/i, ['capture it', 'grab it']],
    [/\bneeds\s+to\b/i, ['has to', 'must']],
    [/\bneed\s+to\b/i, ['have to']],
    [/\bdon['’]t\s+rush\b/i, ['no need to rush']],
    [/\bthe\s+natural\s+(move|way|follow-up|break|reply|plan|choice|idea|square|recapture|response)\b/i, ['the obvious $1', 'the normal $1']],
    [/\bactive\s+on\s+the\s+(?=(?:(?:half-)?open\s+)?(?:[a-h]-)?(?:files?|ranks?|diagonals?)\b|(?:\d(?:st|nd|rd|th)|first|second|seventh|eighth)\s+rank\b)/i, ['active along the ', 'working on the ']],
    [/\bkeep\s+the\s+([a-z0-9]+(?:\s+and\s+[a-z]+)?)\s+coordinated\b/i, ['coordinate the $1', 'make the $1 work together']],
    [/\bkeep\s+the\s+([a-z0-9]+(?:\s+and\s+[a-z]+)?)\s+(connected|together)\b/i, ['leave the $1 $2']],
    [/\band\s+keeps?\s+(?=(?:the|your|their)\b)/i, ['while keeping ']],
    [/\b(?:(?:make\s+sure\s+(?:that\s+)?you|try\s+to)\s+)?keep\s+(the|your)\s+(king|queen|rook|bishop|knight|pawn)\s+(?=(?:tied|pinned|posted|placed|parked|close|near|next|on|in|behind|ready|busy)\b)/i,
        ['make sure $1 $2 stays ', '$1 $2 should stay ']],
    [/\b(?:(?:make\s+sure\s+(?:that\s+)?you|try\s+to)\s+)?keep\s+(the|your)\s+(king|queen|rook|bishop|knight|pawn)\s+(guarding|defending|covering|protecting|watching|supporting|controlling|blocking|holding)\b/i,
        ['make sure $1 $2 is still $3', 'let $1 $2 carry on $3']],
    [/\b(?:(and\s+)(?:it\s+)?|it\s+)(also\s+)?leaves\s+((?:(?:your|the|their)\s+)?[a-h][1-8](?:\s+(?:pawn|square|knight|bishop|rook|queen|king))?|(?:your|the|their)\s+(?:king|queen|rook|bishop|knight|pawn))\s+(?!(?:and|or|side|safety|shelter|cover|wing|file|diagonal|rank)\b)(?=[a-z])/i,
        ['$1$3 is $2left ']],
    [/\b(?:(and\s+)(?:it\s+)?|it\s+)(also\s+)?leaves\s+([a-h][1-8]\s+and\s+[a-h][1-8](?:\s+(?:pawns|squares))?|(?:your|the|their)\s+(?:pawns|pieces|rooks|knights|bishops))\s+(?!(?:and|or)\b)(?=[a-z])/i,
        ['$1$3 are $2left ']],
    [/\b(is|are)\s+((?:also|still)\s+)?doing\s+(?:real|a\s+lot\s+of)\s+work\b/i, ['$1 $2working hard', '$1 $2very busy']],
    [/\b(is|are)\s+((?:also|still)\s+)?doing\s+(defensive|attacking|useful|important|heavy|good)\s+work\b/i, ['$1 $2busy with $3 work']],
    [/\b(is|are)\s+((?:also|still)\s+)?doing\s+the\s+work\b/i, ['$1 $2carrying the load']],
    [/\bthing\s+to\s+(?=(?:answer|deal|handle|fix|solve|address|meet|stop)\b)/i, ['problem to ', 'issue to ']],
    [/\b(?:right\s+)?in\s+the\s+middle\s+of\s+(?=(?:black's|white's|black’s|white’s|their|the\s+enemy|enemy|the\s+opponent's)\b)/i, ['surrounded by ']],
    [/\bthe\s+pressure\b/i, ['the squeeze', 'the grip']],
    [/\bpressure\s+on\b/i, ['pressure against']]
];

function overused(sentence, counts, limit) {
    return [...voicePhrases(sentence)].filter(phrase => (counts.get(phrase) || 0) >= limit);
}

// Rewords the overused stock phrases in one sentence, keeping its chess content word for word.
function varyStockWording(sentence, counts, limit) {
    let current = sentence, worst = overused(current, counts, limit);
    for(const [pattern, wordings] of stockWordings) {
        if(!worst.length) break;
        const found = current.match(pattern);
        if(!found) continue;
        const own = (found[0].toLowerCase().replace(/’/g, "'").match(/[a-z][a-z0-9]*(?:'[a-z]+)?/g) || []).filter(word => !functionWords.has(word));
        if(!worst.some(phrase => phrase.split(' ').some(word => own.includes(word)))) continue;
        const options = wordings.map(wording => {
            const replaced = current.replace(pattern, (...match) => wording.replace(/\$(\d)/g, (_, at) => match[at] ?? ''));
            const result = /^\s*[A-Z]/.test(current) ? capitalize(replaced) : replaced;
            return { result, left: overused(result, counts, limit) };
        });
        const best = options.reduce((chosen, option) => option.left.length < chosen.left.length ? option : chosen);
        if(best.left.length < worst.length) { current = best.result; worst = best.left; }
    }
    return current;
}

export function limitVoiceRepetition(text, recent = [], { limit = 3, window = 10 } = {}) {
    const counts = new Map();
    for(const previous of recent.slice(-(window - 1)))
        for(const phrase of voicePhrases(previous)) counts.set(phrase, (counts.get(phrase) || 0) + 1);
    const removed = [];
    let changed = false;
    const kept = segments(text).map(original => {
        const sentence = varyStockWording(original, counts, limit);
        if(sentence !== original) changed = true;
        if(chessWord.test(plain(sentence).toLowerCase())) return sentence;
        if(!overused(sentence, counts, limit).length) return sentence;
        removed.push(sentence.trim());
        return null;
    }).filter(sentence => sentence !== null);
    return { text: removed.length || changed ? kept.join('').trim() : text, removed };
}

// Both streaming speech and the final presentation use this ordered gate.
export function screenCoachReply(text, options = {}) {
    const { hideMoves = false, event = false, previous = [], recent = [] } = options;
    const hidden = hideMoves ? hideMoveSuggestions(text, options) : { text, withheld: false };
    const placed = dropMisplacedPieces(hidden.text, options);
    const geometry = dropFalseGeometry(placed.text, options);
    const repeated = options.urgent ? { text: geometry.text, removed: [] } : dropRepeatedSentences(geometry.text, previous);
    const verdict = dropUnaskedVerdicts(repeated.text, event ? '' : options.question || '');
    const labelled = dropAnnouncedLabels(verdict.text, { previous: options.descriptionHistory || previous, question: options.question });
    const polished = polishCoaching(labelled.text, options);
    const varied = event ? limitVoiceRepetition(polished.text, recent) : polished;
    const removed = [...placed.removed, ...geometry.removed];
    let result = varied.text;
    const pattern = event && coachStyle(options.style).cleanup ? options.patternComment : '';
    // This sentence comes from cross-game board evidence, not the model remembering a prompt.
    if(pattern && result.trim() && !result.includes(pattern)) result = `${pattern} ${result}`;
    if(hidden.withheld || removed.length) result = capitalize(result.replace(/^(?:Now|So),?\s+(?=(?:the|your|their|it|this|that|you)\b)/i, ''));
    const assessments = [
        ...segments(result).filter(sentence => /\b[a-h][1-8]\b|\b(?:king|queen|rook|bishop|knight|pawn|pin|check|castl)\w*\b/i.test(plain(sentence)))
            .map(source => ({ status: 'screened', shown: true, source: markdownPlain(plain(source)).trim() })),
        ...removed.map(source => ({ status: 'contradicted', shown: false, source: markdownPlain(plain(source)).trim(), reason: 'contradictsBoard' }))
    ];
    return { text: result, withheld: hidden.withheld, removed, assessments };
}

/** The spoken cleanups a style asks for, in order. */
export function polishCoaching(text, { style, event = false, question = '', moveGrade = '' } = {}) {
    if(!coachStyle(style).cleanup) return { text, removed: [] };
    const turns = dropTurnStatements(text, { question });
    const closing = dropClosingOffers(turns.text, { event });
    let introduced = event ? closing.text.replace(
        /^(\s*(?:(?:That|This|Your)\s+)?(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x?[a-h]?[1-8])(?:=[QRBN])?[+#]?\s+(?:is|was)) the mistake\b/i,
        '$1 a mistake') : closing.text;
    if(event && (moveGradeKind(moveGrade) === 'good' || /neutral/i.test(moveGrade))) {
        const lead = introduced.match(/^((?:(?:That|Your)\s+)?(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x?[a-h]?[1-8])[+#]?)\s+(?:is|was)\s+(?:fine|good|solid|okay|ok)(?:\s+move)?(?:,\s*(?:(?:but|and)\s+)?|\s+(?:but|and|because)\s+)/i);
        if(lead) {
            const tail = introduced.slice(lead[0].length);
            introduced = /^it\s+/i.test(tail) ? `${lead[1]} ${tail.replace(/^it\s+/i, '')}` : capitalize(tail);
        } else introduced = introduced.replace(/^(?:(?:That|Your)\s+)?(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x?[a-h]?[1-8])[+#]?\s+(?:is|was)\s+(?:fine|good|solid|okay|ok)(?:\s+move)?[.!]\s*/i, '');
    }
    return { text: introduced, removed: [...turns.removed, ...closing.removed] };
}
