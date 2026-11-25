import { speakSan } from '../../js/misc/moveNotation.js';

// The model writes light Markdown. These helpers turn it into real formatting on screen,
// clean plain text for the board cues, and words the voice can actually say.

const inline = new RegExp([
    String.raw`(\x60+)([^\x60]+?)\1`,
    String.raw`\*\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*\*`,
    String.raw`\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*`,
    String.raw`(?<!\w)__(?=\S)([\s\S]+?)(?<=\S)__(?!\w)`,
    String.raw`~~(?=\S)([\s\S]+?)(?<=\S)~~`,
    String.raw`(?<![\w*])\*(?=[^\s*])([^*\n]+?)(?<=[^\s*])\*(?![\w*])`,
    String.raw`(?<![\w_])_(?=[^\s_])([^_\n]+?)(?<=[^\s_])_(?![\w_])`,
    String.raw`\[([^\]\n]+)\]\([^)\s]+\)`
].join('|'), 'g');

// Each span is { text, bold, italic, code, strike }.
function parseInline(text, style = {}) {
    const spans = [];
    let last = 0;
    const plain = value => { if(value) spans.push({ ...style, text: value.replace(/\*\*|__|~~/g, '') }); };
    for(const match of text.matchAll(inline)) {
        plain(text.slice(last, match.index));
        const [, , code, boldItalic, bold, underBold, strike, italic, underItalic, link] = match;
        if(code !== undefined) spans.push({ ...style, text: code, code: true });
        else if(boldItalic !== undefined) spans.push(...parseInline(boldItalic, { ...style, bold: true, italic: true }));
        else if(bold !== undefined || underBold !== undefined) spans.push(...parseInline(bold ?? underBold, { ...style, bold: true }));
        else if(strike !== undefined) spans.push(...parseInline(strike, { ...style, strike: true }));
        else if(italic !== undefined || underItalic !== undefined) spans.push(...parseInline(italic ?? underItalic, { ...style, italic: true }));
        else spans.push(...parseInline(link, style));
        last = match.index + match[0].length;
    }
    plain(text.slice(last));
    return spans;
}

// A numbered line that starts with a move is a move list, not a Markdown list.
const startsWithMove = /^(?:\.\.\.\s*)?(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x?[a-h]?[1-8]|O-O)/;

/** Blocks are { type: 'p' | 'h' | 'ul' | 'ol' | 'pre', lines: spans[][] } or, for lists, items: spans[][]. */
export function parseMarkdown(text) {
    const blocks = [];
    let paragraph = null, list = null, fence = null;
    const close = () => { paragraph = null; list = null; };
    for(const raw of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
        if(fence) {
            if(/^\s*\x60{3}/.test(raw)) fence = null;
            else fence.lines.push([{ text: raw, code: true }]);
            continue;
        }
        if(/^\s*\x60{3}/.test(raw)) { close(); fence = { type: 'pre', lines: [] }; blocks.push(fence); continue; }
        const line = raw.trim();
        if(!line || /^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) { close(); continue; }
        const heading = line.match(/^#{1,6}\s+(.*?)\s*#*$/);
        if(heading) { close(); blocks.push({ type: 'h', lines: [parseInline(heading[1])] }); continue; }
        const bullet = line.match(/^[-*+\u2022]\s+(.*)$/);
        const number = line.match(/^(\d+)[.)]\s+(.*)$/);
        const item = bullet ? ['ul', bullet[1]] : number && !startsWithMove.test(number[2]) ? ['ol', number[2], Number(number[1])] : null;
        if(item) {
            paragraph = null;
            if(list?.type !== item[0]) { list = { type: item[0], items: [], start: item[2] || 1 }; blocks.push(list); }
            list.items.push(parseInline(item[1]));
            continue;
        }
        const content = parseInline(line.replace(/^>\s?/, ''));
        if(list && /^\s{2,}/.test(raw)) { list.items.at(-1).push({ text: ' ' }, ...content); continue; }
        list = null;
        if(!paragraph) { paragraph = { type: 'p', lines: [] }; blocks.push(paragraph); }
        paragraph.lines.push(content);
    }
    return blocks.filter(block => (block.lines || block.items).length);
}

const joinSpans = spans => spans.map(span => span.text).join('');

/** The text without any Markdown, one line per paragraph line or list item. */
export function markdownPlain(text) {
    return parseMarkdown(text).map(block => (block.lines || block.items).map(joinSpans).join('\n')).join('\n\n').trim();
}

function spanNode(span) {
    let node = document.createTextNode(span.text);
    for(const [flag, tag] of [['code', 'code'], ['strike', 's'], ['italic', 'em'], ['bold', 'strong']]) {
        if(!span[flag]) continue;
        const wrapper = document.createElement(tag);
        wrapper.append(node);
        node = wrapper;
    }
    return node;
}

/** Builds the formatted answer with DOM nodes only, so model text can never become HTML. */
export function renderMarkdown(text) {
    const fragment = document.createDocumentFragment();
    for(const block of parseMarkdown(text)) {
        if(block.items) {
            const list = document.createElement(block.type);
            if(block.type === 'ol' && block.start !== 1) list.start = block.start;
            for(const item of block.items) {
                const entry = document.createElement('li');
                entry.append(...item.map(spanNode));
                list.append(entry);
            }
            fragment.append(list);
            continue;
        }
        const element = document.createElement(block.type === 'h' ? 'p' : block.type);
        element.className = block.type === 'h' ? 'pena-md-heading' : '';
        block.lines.forEach((line, index) => {
            if(index) element.append(document.createElement('br'));
            element.append(...line.map(spanNode));
        });
        fragment.append(element);
    }
    return fragment;
}

const sanToken = /(?<![\w\-=.])(?:\d+\.(?:\.\.)?\s*|\.\.\.\s*)?((?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][18]=[QRBN]|[a-h][1-8]|[O0]-[O0](?:-[O0])?)[+#]?)(?:[!?]{1,2})?(?![\w\-=])/g;

export function spokenAppName(text) {
    return text.replace(/(?<![\w.])A\.C\.A\.S(?:\.(?=[’']s\b))?([’']s)?(?!\w)/gi,
        (_, possessive) => `A-CAS${possessive ? "'s" : ''}`);
}

/** What the voice should say: no Markdown symbols, moves read as words and numbers read naturally. */
export function spokenText(text) {
    const lines = parseMarkdown(text).flatMap(block => (block.lines || block.items).map(joinSpans));
    return spokenAppName(lines.map(line => line.trim()).filter(Boolean)
        // Separate lines need a pause, so a line without its own ending gets one.
        .map(line => /[.!?:;,]$/.test(line) ? line : `${line}.`).join(' '))
        .replace(/(?<![\w.])\d+\.(?:\.\.)?\s*(?=(?:\.\.\.)?\s*(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x?[a-h]?[1-8]|O-O))/g, '')
        .replace(sanToken, (_, san) => speakSan(san.replace(/0/g, 'O')))
        .replace(/(?<![\w.])([+-\u2212])M(\d+)\b/g, (_, sign, moves) => `${sign === '+' ? 'white' : 'black'} mates in ${moves}`)
        .replace(/(?<![\w.#])#(\d+)\b/g, 'mate in $1')
        .replace(/(?<![\w.])\+(\d+(?:\.\d+)?)(?!\w|\.\d)/g, 'plus $1')
        .replace(/(?<![\w.\-])[-\u2212](\d+(?:\.\d+)?)(?!\w|\.\d)/g, 'minus $1')
        .replace(/\s*(?:->|=>|\u2192)\s*/g, ' to ')
        .replace(/\s&\s/g, ' and ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}
