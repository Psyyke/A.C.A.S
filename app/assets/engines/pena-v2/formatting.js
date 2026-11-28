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

const labelWords = String.raw`(?:(?:one|another|a)\s+(?:more\s+|last\s+|small\s+|honest\s+|important\s+|practical\s+|quick\s+)*(?:caution|caveat|warning|note|nuance|detail|tradeoff|point|idea|thing(?:\s+to\s+(?:watch|note|keep in mind|remember|be (?:honest|careful|clear) about))?)(?:\s+(?:worth\s+(?:noting|knowing|mentioning)|to\s+note))?`
    + String.raw`|the\s+(?:short|simple|quick|practical|honest|long)\s+(?:version|answer|story)`
    + String.raw`|the\s+(?:bigger|big|whole)\s+picture`
    + String.raw`|(?:the\s+)?(?:(?:main|key|real|important|practical|basic|other|first|second|sensible|simple|natural|obvious|safe|best|tricky|useful|sharp)\s+)*(?:thing|point|idea|issue|takeaway|problem|plan|lesson|catch|upshot|tradeoff|danger|risk|downside|upside|question|move|part|cost|warning|concern|benefit)(?:\s+(?:here|to (?:watch|remember|keep in mind|know)))?(?:\s+(?:is|was)(?:\s+(?:just|simply|really|basically|pretty))?(?:\s+(?!(?:the|a|an|your|my|his|her|their|black|white|that|this)\b)[a-z'-]+){0,3})?`
    + String.raw`|let's\s+(?:check|see|look)|what it does|here's (?:the thing|why)`
    + String.raw`|(?:(?:piece\s+)?development|king\s+safety|(?:the\s+)?cent(?:er|re)(?:\s+control)?|(?:piece\s+)?activity|(?:the\s+)?(?:pawn\s+)?structure|space|tempo|time|coordination|castling|counterplay|safety|defen[cs]e|(?:the\s+)?attack)`
    + String.raw`\s+(?:is|stays?|remains?)(?:\s+(?:still|also|really|clearly|just|now))*\s+(?:(?:the|a|your)\s+)?(?:(?:bigger|big|main|real|key|first|top|immediate|biggest|whole|clear|obvious|only|other)\s+)*(?:priority|theme|issue|point|story|focus|concern|job|task|headline|question|thing)`
    + String.raw`|(?:also\s+)?worth\s+(?:noting|knowing|watching|remembering)|bottom line|in short|short version|uncertainty|caveat|tradeoff|in other words|good news|bad news`
    + String.raw`|(?:development|developmental plans?|the development|your development|the (?:bigger|main|real|practical|long-term)\s+priority)`
    + String.raw`|(?:[^.!?]{0,30}\b(?:priority|theme|plan|goal)\b(?:\s+(?:is|remains|stays|should be)\s+(?:just\s+)?(?:development|active|simple|clear))?))`;
const announcedLabel = new RegExp(String.raw`(^|[.!?]["')\]\uE000-\uF8FF]*\s+|\n\s*)((?:(?:so|and|but|also|plus|still|anyway),?\s+)?${labelWords})\s*:\s+([^.!?\n]*)`, 'gi');
const notationStart = /^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]|O-O)/;
const vagueImportance = String.raw`the\s+(?:(?:real|main|key|actual|true|important|central|essential)\s+)+(?:ideas?|plans?|points?|issues?|story|focus|priority|takeaways?)\b`;
const sentenceLead = String.raw`(^[ \t]*(?:(?:[-*+]|\d+[.)])\s+)?|[.!?]["')\]\uE000-\uF8FF]*\s+|\n[ \t]*(?:(?:[-*+]|\d+[.)])\s+)?)`;
const adviceSubject = String.raw`(?:the|a|an|your)\s+(?:(?:real|main|key|actual|true|important|central|essential|first|next|useful|practical|big)\s+)*(?:thing|idea|plan|point|priority|goal|task|aim|focus)(?:\s+(?:here|now))?`;
const adviceWrapper = String.raw`${adviceSubject}\s+is\s+(?:(?:just|simply|basically)\s+)*(?:to|that)\s+`
    + String.raw`|what\s+matters(?:\s+(?:here|now|most))?\s+is\s+(?:to|that)\s+`
    + String.raw`|what\s+you\s+(?:need|have)\s+to\s+do\s+is\s+(?:to\s+)?`
    + String.raw`|(?:it\s+is|it['\u2019]s)\s+(?:worth\s+(?:noting|mentioning|remembering)|important\s+to\s+(?:note|remember))\s+that\s+`;
const announcedIdea = new RegExp(String.raw`${sentenceLead}(${adviceWrapper})([^.!?\n]+)`, 'gi');
const importancePredicate = new RegExp(String.raw`(\b(?:is|was|are|were|be|been|being|remains?|seems?)\s+|['\u2019]s\s+)(?:(?:really|actually|still|just)\s+)*(\*\*|__)?${vagueImportance}\2(?=(?:\s|[\uE000-\uF8FF])*(?:[:.!?,]|$|(?:because|since|and|but|here|now)\b))`, 'gi');
const importanceAside = new RegExp(String.raw`,\s*${vagueImportance}\s*,\s*`, 'gi');
const proposedIdea = /(^|[.!?]["')\]\uE000-\uF8FF]*\s+|\n\s*)(the\s+(?:(?:real|main|key|actual|true|important|central|essential)\s+)+(?:ideas?|plans?)\s+(?:is|was|are|were)\s+)(?!(?:not|never|that|to)\b)([^.!?\n]+)/gi;
const attentionFrame = new RegExp(String.raw`(?:${sentenceLead}|([,;]\s+))(?:(so|and|but)\s+)?([^.!?;,\n:]+?)(?:\s+(?:is|are|remains?)|['\u2019](?:s|re))\s+(?:the\s+(?:(?:main|key|important|next)\s+)*(?:things?|issues?|points?|concerns?)\s+to|what\s+you\s+(?:need\s+to|should|must))\s+(watch(?:\s+out\s+for|\s+for)?|focus\s+on|pay\s+attention\s+to|keep\s+an?\s+eye\s+on|deal\s+with|respond\s+to|address|remember|consider)(?=(?:\s|[\uE000-\uF8FF])*(?:[.!?;,:]|$|(?:before|after|while|if|unless|when)\b))`, 'gi');
const progressiveWrapper = /(\b(?:is|was|are|were)|['\u2019](?:s|re))\s+(the\s+(?:one\s+(?:piece|unit)|ones?)(?:\s+(?:that|which)\s+(is|was|are|were))?\s+)(?=(?:(?:[a-z]+ly|still|now|just)\s+)*[a-z]+ing\b)/gi;
const relevanceWrapper = /(\b(?:is|are|was|were)|['\u2019](?:s|re))\s+(\*\*|__)?(the\s+(?:ones?|things?|pieces?|pawns?)\s+(?:that|which)\s+|what\s+)((?:(?:[a-z]+ly|still|now|just)\s+)*)(matters?|mattered|counts?|counted|makes?\s+(?:a|the)\s+difference|made\s+(?:a|the)\s+difference)\b\2/gi;
const recommendationWrapper = /(\b(?:is|was|are|were|be|been|being)|['\u2019](?:s|re))(\s+)(\*\*|__)?the\s+(\*\*|__)?(?:(things?)\s+to\s+do|(moves?)\s+to\s+make|(steps?)\s+to\s+take|(ways?)\s+to\s+go)\b\4\3/gi;
const abstractPressure = String.raw`(?:(?:the|this|that|your|their)\s+)?(?:pressure|danger|risk|tension|threats?)`;
const emptySummary = String.raw`${abstractPressure}\s+(?:(?:is|are|remains?)\s+(?:(?:clearly|really|definitely|certainly|very)\s+)*(?:real|there|present)|matters?)`
    + String.raw`|(?:this|that|it)(?:\s+is|['\u2019]s)\s+(?:important|worth\s+(?:noting|remembering)|something\s+to\s+(?:remember|keep\s+in\s+mind)|the\s+(?:(?:main|real|key)\s+)?(?:point|idea|story))`;
const summaryEnding = new RegExp(String.raw`([,;]\s+(?:(?:and\s+)?so|and)\s+|[.!?]\s+(?:(?:so|and)\s+)?)(${emptySummary})([\uE000-\uF8FF]*)(?=$|[.!?](?:\s|$))([.!?]?)`, 'gi');

const descriptiveHead = String.raw`(?:weakness|vulnerability|target|spot|point|problem|issue|liability|asset|advantage|disadvantage|mistake|error|inaccuracy|opportunity|chance|resource|option|possibility|idea|plan|threat|concern|factor|motif|pattern|bottleneck)`;
const descriptivePhrase = String.raw`(?:(?!(?:is|are|was|were|not|that|which|who|whose|of|for|to|in|on|at|and|but|because|since)\b)[a-z][a-z0-9-]*\s+)*${descriptiveHead}\b`;
const descriptionPredicate = String.raw`(?:\b(?:is|was|be|been|being|becomes?|became|seems?)\s+|['\u2019]s\s+)(?:(?:really|just|actually|also|still|probably)\s+)*`;
const descriptionEnd = String.raw`(?=(?:\s|[\uE000-\uF8FF])*(?:[:.!?,;]|$|(?:because|since)\b))`;
const definiteDescription = new RegExp(String.raw`(${descriptionPredicate})(\*\*|__)?the\s+(\*\*|__)?(${descriptivePhrase})\3\2${descriptionEnd}`, 'gi');
const mentionedDescription = new RegExp(String.raw`${descriptionPredicate}(?:\*\*|__)?(?:a|an|the)\s+(?:\*\*|__)?(${descriptivePhrase})(?:\*\*|__)?${descriptionEnd}`, 'gi');

function descriptionSubject(text, offset) {
    const subject = markdownPlain(text.slice(0, offset)).split(/[.!?;,:\n]|\b(?:and|but|so)\s+/i).at(-1).trim().toLowerCase();
    const squares = subject.match(/\b[a-h][1-8]\b/g) || [];
    if(squares.length === 1) return `${subject.match(/\b(?:king|queen|rook|bishop|knight|pawn)\b/)?.[0] || ''}:${squares[0]}`;
    return subject.replace(/^(?:the|a|an|this|that)\s+/, '');
}

function descriptionArticle(phrase) {
    if(/^(?:honest|honou?r|hour|heir)/i.test(phrase)) return 'an';
    if(/^(?:uni(?:corn|form|que|t\b|vers)|us(?:e|eful|ual|er)|one\b|euro)/i.test(phrase)) return 'a';
    return /^(?:[aeiou]|[afh][1-8]\b)/i.test(phrase) ? 'an' : 'a';
}

// Countable judgements introduce a description, not a uniquely identified board occupant.
export function introduceDescriptions(text, { previous = [], question = '' } = {}) {
    const changed = [];
    const result = String(text || '').replace(definiteDescription, (all, verb, outer, inner, phrase, offset, source) => {
        const words = phrase.toLowerCase().split(/\s+/);
        if(words.some(word => /^(?:only|sole|one|single|unique|main|key|primary|principal|first|second|third|fourth|last|next|final|same|other|right|correct|chosen|selected|best|worst|most|least|forced)$/.test(word)
            || /est$/.test(word) && !/^(?:honest|modest)$/.test(word))) return all;
        const label = words.join(' '), subject = descriptionSubject(source, offset);
        const asked = new RegExp(String.raw`\bthe\s+${words.join('\\s+')}\b`, 'i').test(markdownPlain(question));
        const established = [...previous, source.slice(0, offset)].some(earlier =>
            [...String(earlier).matchAll(mentionedDescription)].some(match => match[1].toLowerCase().replace(/\s+/g, ' ') === label
                && descriptionSubject(String(earlier), match.index) === subject));
        if(asked || established) return all;
        changed.push(all);
        return `${verb}${outer || ''}${descriptionArticle(phrase)} ${inner || ''}${phrase}${inner || ''}${outer || ''}`;
    });
    return { text: changed.length ? result : text, changed };
}

// Spoken aloud, "One caution:" or "The plan is simple:" is a label the listener learns to wait through.
// Only that empty lead goes. A colon that introduces real content, like the pieces under attack, stays.
export function dropAnnouncedLabels(text, options = {}) {
    const removed = [];
    const concise = String(text || '').replace(relevanceWrapper, (all, copula, mark, label, adverbs, verb) => {
        const past = /^(?:was|were)$/i.test(copula);
        const pastAction = /^(?:mattered|counted|made)\b/i.test(verb);
        if(past !== pastAction) return all;
        const singular = /^(?:is|['\u2019]s)$/i.test(copula);
        if(!past && singular !== /^(?:matters|counts|makes)\b/i.test(verb)) return all;
        removed.push(`${copula} ${label.trim()}`);
        return `${/^['\u2019]/.test(copula) ? ' ' : ''}${mark || ''}${adverbs}${verb}${mark || ''}`;
    });
    const recommended = concise.replace(recommendationWrapper, (all, verb, space, outer, inner, thing, move, step, way) => {
        const plural = /s$/i.test(thing || move || step || way);
        const forms = thing ? ['a good idea', 'good ideas']
            : move ? ['a sensible choice', 'sensible choices']
                : step ? ['a useful step', 'useful steps'] : ['a reasonable approach', 'reasonable approaches'];
        const description = forms[plural ? 1 : 0];
        removed.push(all);
        return `${verb}${space}${outer || ''}${inner || ''}${description}${inner || ''}${outer || ''}`;
    });
    const direct = recommended.replace(progressiveWrapper, (all, verb, label, relativeVerb) => {
        const tense = /['\u2019]s/i.test(verb) ? 'is' : /['\u2019]re/i.test(verb) ? 'are' : verb.toLowerCase();
        if(relativeVerb && relativeVerb.toLowerCase() !== tense) return all;
        removed.push(label.trim());
        return `${verb} `;
    }).replace(/\b(idea|plan|threat)\s+(is|was)\s+the real thing(?=\s*[:.!?,]|\s*$)/gi,
        (all, subject, verb) => {
            removed.push(all);
            return `${subject} ${verb.toLowerCase() === 'was' ? 'mattered' : 'matters'}`;
        });
    let unwrapped = direct, previous;
    do {
        previous = unwrapped;
        unwrapped = unwrapped.replace(announcedIdea, (all, before, label, rest) => {
            const statement = /\bthat\s+$/i.test(label);
            if(statement && /^of\b/i.test(rest)) return all;
            if(!statement && /^(?:not|never)\b/i.test(rest)) return all;
            if((rest.match(/[A-Za-z0-9]+/g) || []).length < (statement ? 3 : 1)) return all;
            removed.push(label.trim());
            return before + (/^[a-z]/.test(rest) && !notationStart.test(rest) ? rest.charAt(0).toUpperCase() + rest.slice(1) : rest);
        });
    } while(unwrapped !== previous);
    const proposed = unwrapped.replace(proposedIdea, (all, before, label, rest) => {
        removed.push(label.trim());
        return `${before}Consider ${rest}`;
    });
    const labelled = proposed.replace(announcedLabel, (all, before, label, rest) => {
        if((rest.match(/[A-Za-z0-9]+/g) || []).length < 3) return all;
        removed.push(label);
        return before + (/^[a-z]/.test(rest) && !notationStart.test(rest) ? rest.charAt(0).toUpperCase() + rest.slice(1) : rest);
    });
    const important = labelled.replace(importanceAside, (all) => {
        removed.push(all.trim());
        return ' ';
    }).replace(importancePredicate, (all, verb) => {
        removed.push(all.trim());
        return verb + (/\b(?:ideas?|plans?)\b/i.test(all) ? 'worth considering' : 'important');
    });
    const attended = important.replace(attentionFrame, (all, sentence, clause, conjunction, subject, action) => {
        if(/^(?:if|unless|when|while|because|although|whether|since|as|why|how)\b/i.test(subject.trim())) return all;
        removed.push(all.trim());
        const target = subject.trim().replace(/^(?:The|Your|Their|This|That|These|Those|A|An)\b/, word => word.toLowerCase())
            .replace(/^(?:I|we|you|he|she|it|they)$/i, word => ({ i: 'me', we: 'us', you: 'you', he: 'him', she: 'her', it: 'it', they: 'them' })[word.toLowerCase()]);
        const verb = action.toLowerCase();
        const lead = conjunction ? `${conjunction} ${verb}` : clause ? verb : verb.charAt(0).toUpperCase() + verb.slice(1);
        return `${sentence || clause || ''}${lead} ${target}`;
    });
    const result = attended.replace(summaryEnding, (all, separator, summary, markers, ending, offset, source) => {
        if((markdownPlain(source.slice(0, offset)).match(/[a-z0-9]+/gi) || []).length < 2) return all;
        removed.push(summary);
        const punctuation = /^[.!?]/.test(separator) ? separator[0] : ending || '.';
        return `${markers}${punctuation}`;
    });
    const introduced = introduceDescriptions(result, options);
    return { text: removed.length || introduced.changed.length ? introduced.text : text, removed };
}
