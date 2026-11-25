// Thinking budgets per effort. "none" disables thinking in the template; its
// small budget is only headroom (a zero budget produced no answer in testing).
export const budgets = { none: 16, low: 160, medium: 512, high: 1536 };
export const efforts = ['none', 'low', 'medium', 'high'];
const ANSWER_RESERVE = 256;

export function chooseEffort(question, override = 'auto', review = false, hasEvidence = false) {
    if(override !== 'auto') {
        if(!Object.hasOwn(budgets, override)) throw new Error('Invalid reasoning effort.');
        return { effort: override, reason: 'Manual override.' };
    }
    const text = question.trim();
    if(review) return { effort: 'high', reason: 'Review requested; the previous answer is not assumed wrong.' };
    if(/\b(fen|pcf\/3p?|mate in|calculate|variation|best move|tactic|evaluate|position|prove|compare)\b/i.test(text)
        || /[prnbqk1-8]+\/[prnbqk1-8]+\/[prnbqk1-8]+/i.test(text) || text.length > 600)
        return { effort: 'high', reason: 'Position, calculation, comparison or substantial evidence detected.' };
    // A greeting never needs the board, even when board evidence is attached.
    if(isSmallTalk(text))
        return { effort: 'none', reason: 'Short greeting or acknowledgement.' };
    if(!hasEvidence && /^(what is|define|explain) (a |an |the )?(pin|fork|skewer|checkmate|stalemate|castling|en passant)( in chess)?[?.!]*$/i.test(text))
        return { effort: 'low', reason: 'Short chess definition; no position supplied.' };
    return { effort: 'medium', reason: hasEvidence
        ? 'Attached evidence; no explicit calculation request. Evidence length alone does not imply high effort.'
        : 'Ambiguous or unfamiliar request; conservative default.' };
}

// Stretched spellings like Hellooo or Hiii count too.
export const isSmallTalk = question => /^(h+i+|h+e+l+o+|h+e+y+|y+o+|sup|moi|hei|morning|good (morning|afternoon|evening|night)|thanks?|thank you|thx|ty|ok(ay)?|got it|cool|nice)( (there|pena|man|bro|dude|mate))?[\s.!?~]*$/i.test(String(question || '').trim());

export function planEffort(question, override, { maxTokens, context, budget, hasEvidence = false }, review = false) {
    for(const value of [maxTokens, context, budget])
        if(!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid token limits.');
    const selected = chooseEffort(question, override, review, hasEvidence);
    return { ...selected, ...budgetFor(selected.effort, { maxTokens, context, budget }) };
}

function budgetFor(effort, { maxTokens, context, budget }) {
    const total = Math.min(maxTokens, 4096, Math.floor(context / 2));
    if(total < 96) throw new Error('Use at least 96 generated tokens to leave room for a final answer.');
    // End tags consume generated tokens too, so keep answer headroom.
    const reserve = Math.min(ANSWER_RESERVE, total - 16);
    const reasoningBudget = Math.max(1, Math.min(budgets[effort], budget, total - reserve));
    return { maxTokens: total, reasoningBudget };
}

// One step up when a cheaper effort ran out of room, produced nothing, or
// visibly argued with itself in the answer. Returns null when no retry is warranted.
const SELF_CORRECTION = /\b(actually|wait|hmm|let['’]s (re)?check|let me (re)?check)\b/i;

export function escalation(plan, result, limits) {
    if(!result || result.cancelled) return null;
    const answer = result.answer?.trim() || '';
    const muddled = SELF_CORRECTION.test(answer);
    const failed = !answer || result.finishReason === 'length' || muddled;
    if(!failed || plan.effort === 'high' || plan.escalated) return null;
    const effort = plan.effort === 'none' ? 'medium' : 'high';
    const why = !answer ? 'gave no answer' : muddled ? 'second-guessed itself' : 'was cut off';
    return {
        effort, escalated: true,
        reason: `Escalated from ${plan.effort}: the first attempt ${why}.`,
        ...budgetFor(effort, limits)
    };
}

export const ESCALATION_NOTE = 'Hmm, wait. I need to think about this one a bit more carefully.';
export const STILL_READING = 'Still reading the position, nearly there.';
export const STILL_READING_AFTER_MS = 8000;

export function progressText(state, elapsedSeconds) {
    let phase = 'Preparing input / waiting for runtime progress';
    if(state.phase === 'prefill') {
        phase = 'Reading the position (prefill)';
        const p = state.prompt;
        if(p && Number.isFinite(p.total) && p.total > 0 && Number.isFinite(p.processed)
            && p.processed >= 0 && p.processed <= p.total)
            phase += `: ${p.processed}/${p.total} tokens processed`;
    } else if(state.phase === 'reasoning') phase = 'Thinking out loud (see the thoughts panel)';
    else if(state.phase === 'answer') phase = 'Generating the answer';
    return `${phase} - ${elapsedSeconds.toFixed(1)} seconds elapsed.`;
}

// Splits streamed content into answer text and thought text. Some templates emit
// <think> tags in content rather than reasoning_content, so partial tags are
// buffered and never shown as raw markup.
export class ThoughtSplitter {
    pending = '';
    hidden = null;
    text = '';
    thoughts = '';

    push(content = '', final = false) {
        this.pending += content;
        while(this.pending) {
            const tags = this.hidden ? [`</${this.hidden}>`] : ['<think>', '<analysis>'];
            const matches = tags.map(tag => ({ tag, index: this.pending.indexOf(tag) }))
                .filter(match => match.index >= 0).sort((a, b) => a.index - b.index);
            if(matches.length) {
                const { tag, index } = matches[0];
                this.#emit(this.pending.slice(0, index));
                this.pending = this.pending.slice(index + tag.length);
                this.hidden = this.hidden ? null : tag.slice(1, -1);
                continue;
            }
            let hold = 0;
            for(const tag of tags)
                for(let n = 1; n < tag.length; n++)
                    if(this.pending.endsWith(tag.slice(0, n))) hold = Math.max(hold, n);
            if(final) hold = 0;
            this.#emit(this.pending.slice(0, this.pending.length - hold));
            this.pending = this.pending.slice(this.pending.length - hold);
            break;
        }
        return this.text;
    }

    #emit(text) {
        if(this.hidden) this.thoughts += text;
        else this.text += text;
    }
}

// Collects complete sentences from a stream so they can be spoken one at a time.
export class SentenceChunker {
    buffer = '';

    push(text = '', final = false) {
        this.buffer += text;
        const out = [];
        const pattern = /[^.!?\n]*[.!?]+(?=\s)|[^\n]*\n/g;
        let match, used = 0;
        while((match = pattern.exec(this.buffer))) {
            const sentence = match[0].trim();
            if(sentence.length > 1) out.push(sentence);
            used = pattern.lastIndex;
        }
        this.buffer = this.buffer.slice(used);
        if(final) {
            if(this.buffer.trim().length > 1) out.push(this.buffer.trim());
            this.buffer = '';
        }
        return out;
    }
}

const chessWords = /\b[a-h][1-8]\b|\b(?:kings?|queens?|rooks?|bishops?|knights?|pawns?|pin(?:s|ned)?|forks?|checks?|checkmate|mate|threat(?:s|en|ens)?|attack(?:s|ed|ing)?|defen[ds](?:s|ed|ing)?|captures?|trades?|exchanges?|castl(?:e|es|ed|ing)|sacrifices?|files?|diagonals?|ranks?|cent(?:er|re)|development|tempo|material|endgame|skewer|discovered|outpost|weak(?:ness)?|blunder|hangs?|hanging|loose)\b/i;
const metaWords = /\b(?:user|question|answer(?:s|ed)?|respond|response|reply|evidence|cite|citations?|system|instructions?|prompt|format|concise|guidelines?|IDs?|mention|output|final answer|sentences?|explain|explanation|verified|records?|frames?)\b|^(?:need|needs|ok|okay|alright|hmm)\b|^(?:i|we) (?:need|should|must|will|can)\b|[@{}<>|=]|\/.*\//i;

// Board reading, open questions and self-corrections are useful in the raw
// thoughts but sound confusing when said out loud.
const boardParsing = /[?:]$|^(?:board|position|fen|ranks?\s*\d?|files?|white|black|pieces?)\s*:|[a-h][1-8]-[a-h][1-8]|^(?:wait|actually|but|hmm|so wait)\b|\b[a-h][1-8] empty\b/i;

/** A thought sentence worth showing or saying to the player, or null for meta talk. */
export function coachNote(sentence) {
    const text = String(sentence).replace(/\[[A-Z]{1,3}\d*\.([^\]\s]{1,12})\]/g, '$1')
        .replace(/\[[A-Z]{1,3}\d*\]/g, '').replace(/\s+/g, ' ').replace(/\s([,.!?])/g, '$1').trim();
    if(text.length < 12 || text.length > 200 || !chessWords.test(text) || metaWords.test(text) || /\S{25,}/.test(text)
        || boardParsing.test(text) || text.split(/\s+/).length < 5 || (text.match(/,/g) || []).length > 2) return null;
    return text;
}

/** Dedupes coach notes so the same observation is never said twice. */
export class CoachNotes {
    seen = new Set();
    notes = [];
    push(sentence) {
        const note = coachNote(sentence);
        if(!note) return null;
        const key = note.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if(this.seen.has(key)) return null;
        this.seen.add(key);
        this.notes.push(note);
        return note;
    }
}

const acknowledgements = {
    medium: ['Let me take a look.', 'Okay, give me a moment with this.', 'Let me check the board.'],
    high: ['Good one. Let me look at this properly, I will tell you what I notice as I go.',
        'Let me dig into this, I will share what I spot along the way.',
        'Okay, this needs a real look. I will think out loud.']
};

/** A short instant reply so the player never sits in silence. Fast efforts need none. */
export function acknowledgement(question, effort) {
    const options = acknowledgements[effort];
    if(!options) return '';
    let hash = 0;
    for(const char of String(question)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return options[hash % options.length];
}
