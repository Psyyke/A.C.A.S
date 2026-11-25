import { sanLine } from './factsheet.js';
import { sourceSentences } from './commentary.js';

// The model tags what it is reading, like [L1.p3] or [T]. Those tags pick the exact board a move belongs to,
// so they travel with the text as invisible markers until the reply is drawn.
const FIRST = 0xE000, LAST = 0xF8FF;
export const markerPattern = /[\uE000-\uF8FF]/g;

/** Turns known tags into markers. Returns the marked text and the id behind every marker. */
export function markCitations(text, known) {
    const ids = [];
    const marked = String(text || '').replace(/[ \t]*\[([^\]\n]+)\]/g, (match, id) => {
        if(!known(id)) return match;
        if(FIRST + ids.length > LAST) return '';
        ids.push(id);
        return String.fromCharCode(FIRST + ids.length - 1);
    });
    return { marked, ids };
}

/** Removes the markers and remembers where each one sat in the clean text. */
export function stripMarkers(text, ids, offset = 0) {
    const marks = [];
    let clean = '';
    for(const char of String(text || '')) {
        const code = char.charCodeAt(0);
        if(code >= FIRST && code <= LAST) {
            const id = ids[code - FIRST];
            if(id) marks.push({ id, at: offset + clean.length });
        } else clean += char;
    }
    return { clean, marks };
}

/** Sentences of the clean text, each with the ids cited inside it or right after its last word. */
export function sentenceCitations(clean, marks) {
    const lead = clean.length - clean.trimStart().length;
    return sourceSentences(clean.slice(lead)).map(sentence => {
        const index = sentence.index + lead, end = index + sentence.text.length;
        return { index, end, text: sentence.text,
            ids: [...new Set(marks.filter(mark => mark.at >= index && mark.at <= end).map(mark => mark.id))] };
    });
}

/** Cited ids become { id, fact } with the exact line plies, the same shape the teaching resolver reads. */
export function citationFacts(ids, { sheet = null, input = null, fen = null } = {}) {
    const found = [];
    for(const id of ids) {
        const [, prefix, base, ply, first] = id.match(/^(?:([SE])\.)?(.+?)(?:\.p(\d+)|(\.S))?$/) || [];
        if(!base) continue;
        let fact = sheet?.byId?.[id] || sheet?.byId?.[base] || null;
        if(!fact?.line?.length) {
            const ref = input?.references?.find(item => item.id === base);
            const moves = Array.isArray(ref?.data?.moves) ? ref.data.moves : typeof ref?.data?.move === 'string' ? [ref.data.move] : [];
            let line = [];
            try { line = moves.length && fen ? sanLine(fen, moves, 6) : []; } catch {}
            if(line.length) fact = { ...(fact || {}), kind: fact?.kind || ref.kind, line };
        }
        if(!fact) continue;
        const step = first || prefix === 'S' ? 1 : Number(ply) || 0;
        if(step) fact = { ...fact, line: fact.line?.[step - 1] ? [fact.line[step - 1]] : [] };
        found.push({ id, fact });
    }
    return found;
}
