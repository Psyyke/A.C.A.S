import { knowledge } from './knowledge.js';

// App notes are extra lines in Pena's notes about A.C.A.S itself: the player's settings, the match and the
// usage guide or help page. They only appear when the player asks about those things, so normal chess chats
// keep their usual short prompt and Pena never brings settings up on his own.

const appWords = new RegExp([
    String.raw`\bsettings?\b`, String.raw`\bconfig\w*`, String.raw`\bprofiles?\b`, String.raw`\bpreferences?\b`, String.raw`\btoggle\w*`,
    String.raw`\b(?:en|dis)abl(?:e|ed|ing)\b`, String.raw`\bturn(?:ed|ing)?\s+(?:it\s+|this\s+|that\s+|them\s+)?(?:on|off)\b`,
    String.raw`\bswitch(?:ed)?\s+(?:it\s+)?(?:on|off)\b`, String.raw`\ba\.?c\.?a\.?s\b`, String.raw`\bgui\b`, String.raw`\bhotkeys?\b`,
    String.raw`\bdynamic\s+settings?\b`, String.raw`\bcurves?\b`, String.raw`\blearning\s+mode\b`, String.raw`\bopening\s+book\b`,
    String.raw`\bauto\s?move\b`, String.raw`\barrows?\b`, String.raw`\bmove\s+suggestions?\b`, String.raw`\bsuggestions?\b`,
    String.raw`\bweights?\b`, String.raw`\bpena\s+ai\b`, String.raw`\bread\s+aloud\b`, String.raw`\bneural\s+voice\b`, String.raw`\bvoices?\b`,
    String.raw`\bmemory\b`, String.raw`\bprivacy\b`, String.raw`\bmy\s+data\b`, String.raw`\b(?:delete|wipe|clear|erase)\b.{0,20}\b(?:what\s+you\s+(?:know|remember)|memories)\b`,
    String.raw`\bmic(?:rophone)?\b`, String.raw`\bmove\s+checking\b`, String.raw`\bsearch\s+depth\b`, String.raw`\bfloating\s+panel\b`,
    String.raw`\bpip\b`, String.raw`\bpicture\s+in\s+picture\b`, String.raw`\bactivity\s+log\b`, String.raw`\bconcealment\b`,
    String.raw`\bghost\s+script\b`, String.raw`\btts\b`, String.raw`\btheme\b`, String.raw`\bfusion\b`, String.raw`\bmaia\b`, String.raw`\blc0\b`,
    String.raw`\brodent\b`, String.raw`\blozza\b`, String.raw`\bmultipv\b`, String.raw`\bmovetime\b`, String.raw`\bnodes\b`, String.raw`\bwebhook\b`,
    String.raw`\bexternal\s+(?:engine|server)\b`, String.raw`\bcalculation\s+server\b`, String.raw`\b(?:which|what)\s+(?:chess\s+)?engine\b`,
    String.raw`\bengine(?:'s)?\s+(?:elo|strength|level|depth|settings?|speed)\b`, String.raw`\b(?:engine|elo)\s+(?:is\s+)?(?:set|too)\b`,
    String.raw`\b(?:my|the)\s+elo\s+setting\b`, String.raw`\b(?:weaker|stronger|faster|slower)\s+engine\b`,
    String.raw`\bengine\s+(?:weaker|stronger|faster|slower)\b`, String.raw`\b(?:change|switch|pick|choose|use|using|set)\s+(?:the\s+|my\s+|an?\s+)?(?:engine|elo)\b`,
    String.raw`\b(?:a\.?c\.?a\.?s|app|gui|script|userscript|pena|you|engine|panel|arrows?|suggestions?|voice|sound|audio|mic|download|model)\b.{0,24}`
        + String.raw`\b(?:not\s+working|(?:doesn'?t|does\s+not|isn'?t|is\s+not|aren'?t|are\s+not|won'?t|can'?t|stopped|keeps?\s+not)\s+(?:work|load|show|start|download|connect|appear|respond|talk|speak|answer|reply|say)\w*)`,
    String.raw`\bpena\b.{0,20}\b(?:quiet|silent|slow|stuck|loading|lagg?y|frozen|mute|muted)\b`,
    String.raw`\bbroken\b`, String.raw`\bbugs?\b`, String.raw`\berrors?\b`, String.raw`\bcrash\w*`, String.raw`\bfreez\w*`, String.raw`\blagg?\w*`,
    String.raw`\bno\s+(?:moves|arrows|suggestions|sound|audio)\b`, String.raw`\bnothing\s+(?:shows|happens|appears)\b`,
    String.raw`\btamper\s?monkey\b`, String.raw`\bviolent\s?monkey\b`, String.raw`\buserscripts?\b`, String.raw`\bextensions?\b`,
    String.raw`\bbrowsers?\b`, String.raw`\b(?:firefox|chrome|chromium|edge|safari|brave|opera)\b`, String.raw`\bwebgpu\b`, String.raw`\bgpu\b`, String.raw`\bgraphics\s+card\b`, String.raw`\bvram\b`,
    String.raw`\b(?:moves|suggestions|arrows|hints)\s+(?:are\s+not|aren'?t|not|stopped)\s+(?:showing|appearing|displayed|visible)\b`,
    String.raw`\b(?:only\s+talk\s+when\s+asked|don'?t\s+give\s+away\s+moves|live\s+board\s+teaching|play\s+out\s+future\s+moves|check\s+moves\s+with|explanation\s+mode)\b`,
    String.raw`\bdownload\w*`, String.raw`\binstall\w*`, String.raw`\bstorage\b`, String.raw`\bbann?(?:ed)?\b`, String.raw`\bcheat\w*`,
    String.raw`\bdetect\w*`, String.raw`\bhow\s+(?:do|can|should)\s+i\s+(?:set|change|turn|enable|disable|make|get|use|stop|hide|show|find|fix|install|download|import|export|reset|add|remove)\b`,
    String.raw`\bwhere\s+(?:is|are|do|can)\b.{0,30}\b(?:setting|option|button|toggle|cog|panel|menu)\w*`,
    String.raw`\bwhat\s+does\b.{0,40}\b(?:setting|option|toggle|button|mode)\b.{0,10}\bdo\b`, String.raw`\bis\s+there\s+a\s+(?:way|setting|option)\b`,
    String.raw`\bcan\s+you\s+(?:change|set|turn|enable|disable|switch)\b`
].join('|'), 'i');

// Setting names from the usage guide, so "what does move detail do" counts as an app question without saying A.C.A.S.
// Names that are also everyday chess talk stay out.
const chessy = new Set(['chess engine', 'chess variant', 'material balance', 'display board', 'main settings', 'getting started with the server']);
const penaLabels = ['thinking effort', 'max thinking tokens', 'lora strength', 'evidence amount', 'system prompt', 'local gguf',
    'speech speed', 'speaker id', 'visual duration', 'voice pause', 'graphics memory', 'chess lora', 'pena lora', 'what pena sees'];
const escapeName = name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
const guideNames = new RegExp(String.raw`\b(?:${[...new Set([...knowledge.filter(chunk => chunk.page === 'usage guide')
    .flatMap(chunk => chunk.title.split(/,\s*|\s+and\s+|\s+vs\.\s+/))
    .map(name => name.replace(/\([^)]*\)/g, '').trim().toLowerCase())
    .filter(name => { const words = name.split(/\s+/).length; return words >= 2 && words <= 4 && !chessy.has(name); }), ...penaLabels])]
    .map(escapeName).join('|')})\b`, 'i');

const matchWords = new RegExp([
    String.raw`\b(?:web)?site\b`, String.raw`\bdomain\b`, String.raw`\bchess\.com\b`, String.raw`\blichess\b`, String.raw`\bwhere\s+am\s+i\s+playing\b`,
    String.raw`\bopponent(?:'s)?\s+(?:name|rating|elo|username|profile|country)\b`, String.raw`\bwho\s+(?:am\s+i|are\s+we)\s+(?:playing|against)\b`,
    String.raw`\bwho(?:'s|\s+is)\s+(?:my\s+)?opponent\b`, String.raw`\bhow\s+(?:strong|good)\s+is\s+(?:my\s+)?opponent\b`, String.raw`\bclock\b`,
    String.raw`\btime\s+(?:left|control|remaining|format)\b`, String.raw`\bhow\s+much\s+time\b`, String.raw`\bam\s+i\s+(?:low\s+on|running\s+out\s+of)\s+time\b`,
    String.raw`\bflag(?:ging|ged)?\b`, String.raw`\bincrement\b`, String.raw`\b(?:blitz|bullet|rapid|classical)\s+(?:game|match)\b`,
    String.raw`\bwhat\s+colou?r\s+am\s+i\b`, String.raw`\bam\s+i\s+(?:playing\s+)?(?:as\s+)?(?:white|black)\b`, String.raw`\bwhich\s+side\s+am\s+i\b`,
    String.raw`\bwhat\s+move\s+(?:is\s+it|are\s+we\s+on|number)\b`, String.raw`\bmove\s+number\b`, String.raw`\bvariant\b`, String.raw`960\b`,
    String.raw`\bmy\s+(?:rating|elo)\b`, String.raw`\btheir\s+(?:rating|elo)\b`, String.raw`\bopponent(?:'s)?\s+(?:is\s+)?rated\b`, String.raw`\bwhat\s+is\s+my\s+opponent\s+rated\b`
].join('|'), 'i');

const chessMention = /(?<![\w-])(?:O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x?[a-h]?[1-8])(?![\w-])/;
const chessTalk = /\b(?:position|plan|attack\w*|threat\w*|pieces?|pawns?|knights?|bishops?|rooks?|queens?|kings?|castl\w*|trade|mate|eval\w*|winning|losing|tactic\w*|endgame|opening)\b/i;

/**
 * Which kinds of app notes a message asks for. A short follow-up without chess in it keeps the topics
 * of the turn before, so "and how do I turn it off?" still gets the notes it needs.
 */
export function appTopics(message, previous = null) {
    const text = String(message || '');
    const topics = { app: appWords.test(text) || guideNames.test(text), match: matchWords.test(text) };
    if(!topics.app && !topics.match && (previous?.app || previous?.match)
        && text.trim().split(/\s+/).length <= 14 && !chessMention.test(text) && !chessTalk.test(text)) return { ...previous, carried: true };
    return topics;
}

const engines = {
    'acas-fusion': 'Fusion', 'stockfish-19': 'Stockfish 19', 'stockfish-19-lite-single': 'Stockfish 19 Lite Single',
    'stockfish-18-single': 'Stockfish 18 Single', 'stockfish-18-lite-single': 'Stockfish 18 Lite Single', 'stockfish-17-single': 'Stockfish 17 Single',
    'stockfish-17-lite-single': 'Stockfish 17 Lite Single', 'stockfish-16-1-wasm': 'Stockfish 16', 'fairy-stockfish-nnue-wasm': 'Fairy Stockfish 14',
    maia3: 'Maia 3', maia2: 'Maia 2', lc0: 'CPU Lc0 v0.29.0', 'lc0-v0.32.1-wasm': 'CPU Lc0 v0.32.1', 'lc0-v0.32.1-webgpu': 'GPU Lc0 v0.32.1',
    'rodent-v': 'Rodent V', 'lozza-9': 'Lozza 9', 'lozza-5': 'Lozza 5', 'stockfish-11': 'Stockfish 11', 'stockfish-8': 'Stockfish 8'
};
export const engineIds = Object.keys(engines);
export const engineName = id => engines[id] || String(id || 'an unknown engine').replace(/[-_]+/g, ' ');

const features = [
    ['learningMode', 'Learning Mode'], ['enableMoveRatings', 'Move Ratings'], ['displayMovesOnExternalSite', 'Moves On External Site'],
    ['onlyShowTopMoves', 'Only Top Moves'], ['movesOnDemand', 'Moves On Demand'], ['onlyCalculateOwnTurn', 'Only Own Turn'],
    ['alwaysMyTurn', 'Always My Turn'], ['reverseSide', 'Reverse Side'], ['showOpponentMoveGuess', 'Opponent Move Guess'],
    ['ttsVoiceEnabled', 'Move TTS'], ['pip', 'Floating Panel']
];
const hints = { full: 'Full move', piece: 'Piece only', destination: 'Destination only', captures: 'Captures only', movement: 'Non-captures only',
    'captures-destination': 'Captures only, destination only', 'movement-destination': 'Non-captures only, destination only',
    'captures-piece': 'Captures only, piece only', 'movement-piece': 'Non-captures only, piece only' };
const labels = { engineElo: 'Engine Elo', engineEnemyElo: 'Opponent Elo', chessEngine: 'Chess Engine', maxMovetime: 'Max Movetime',
    moveSuggestionAmount: 'Move Suggestions', moveDisplayDelay: 'Move Delay', hintDetail: 'Move Detail', ...Object.fromEntries(features) };
const variables = { pieceCount: 'Piece Count', moveNumber: 'Move Number', evaluation: 'Evaluation', opponentMoveTime: 'Opponent Move Time',
    materialBalance: 'Material Balance' };
const label = key => labels[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase());

/** A small, privacy friendly summary of one profile. Only these fields ever reach Pena. */
export function profileSummary(name, config = {}, running = false) {
    const external = Boolean(config.useExternalChessEngine);
    return {
        name: String(name || 'Default').slice(0, 40), running: Boolean(running), enabled: config.engineEnabled !== false,
        engine: external ? 'an external engine' : engineName(config.chessEngine), engineId: external ? 'external' : config.chessEngine,
        elo: Number(config.engineElo) || null, opponentElo: Number(config.engineEnemyElo) || null, advancedElo: Boolean(config.enableAdvancedElo),
        depth: Number(config.advancedEloDepth) || null, suggestions: Number(config.moveSuggestionAmount) || null,
        movetime: Number(config.maxMovetime) || null, delay: Number(config.moveDisplayDelay) || 0, hintDetail: config.hintDetail || 'full',
        on: features.filter(([key]) => config[key] === true).map(([key]) => key),
        book: config.openingBookName ? true : false,
        dynamic: Object.entries(config.dynamicSettings || {}).filter(([, curve]) => curve?.enabled).map(([key, curve]) => [key, curve.variable]).slice(0, 4)
    };
}

const humanEngine = summary => /maia|fusion/i.test(summary.engine);

function profileLine(summary) {
    const state = !summary.enabled ? 'is turned off' : summary.running ? 'is running' : 'is on';
    let text = `Profile "${summary.name}" ${state} with ${summary.engine}`;
    if(summary.advancedElo) text += `, Advanced Elo on${summary.depth ? ` with Depth ${summary.depth}` : ''}`;
    else if(summary.elo) text += ` at Engine Elo ${summary.elo}${humanEngine(summary) && summary.opponentElo ? ` and Opponent Elo ${summary.opponentElo}` : ''}`;
    const parts = [];
    if(summary.suggestions) parts.push(`${summary.suggestions} move suggestion${summary.suggestions === 1 ? '' : 's'}`);
    if(summary.movetime) parts.push(`Max Movetime ${summary.movetime} ms`);
    if(summary.delay) parts.push(`Move Delay ${summary.delay} ms`);
    if(summary.hintDetail !== 'full') parts.push(`Move Detail ${hints[summary.hintDetail] || summary.hintDetail}`);
    if(summary.book) parts.push('an opening book loaded');
    const on = features.filter(([key]) => summary.on.includes(key)).map(([, name]) => name);
    const off = features.filter(([key]) => !summary.on.includes(key) && ['learningMode', 'enableMoveRatings', 'displayMovesOnExternalSite', 'pip'].includes(key)).map(([, name]) => name);
    text += parts.length ? `, ${parts.join(', ')}.` : '.';
    if(on.length) text += ` On: ${on.join(', ')}.`;
    if(off.length) text += ` Off: ${off.join(', ')}.`;
    if(summary.dynamic.length) text += ` Dynamic settings: ${summary.dynamic.map(([key, variable]) => `${label(key)} follows ${variables[variable] || 'a graph'}`).join(', ')}.`;
    return text;
}

const speech = { off: 'off', browser: 'the browser voice', neural: 'a neural voice' };

function penaLine(pena) {
    const on = value => value ? 'on' : 'off';
    return `Pena AI settings: Don't give away moves ${on(pena.penaHideMoves)}, `
        + `Only talk when asked ${on(pena.penaOnlyWhenAsked)}, Live board teaching ${on(pena.penaTeacher !== false)}, `
        + `Play out future moves ${on(pena.penaFollowLine !== false)}, Check moves with Stockfish ${on(pena.penaMoveCheck !== false)}`
        + `${pena.penaMoveCheck !== false ? ` at Search depth ${pena.penaCheckDepth || 12}` : ''}, Read aloud with ${speech[pena.penaSpeech] || speech.browser}.`;
}

const sides = { w: 'White', b: 'Black' };

function matchLines(match = {}) {
    const lines = [];
    const fen = String(match.fen || '').split(' ');
    const turn = sides[fen[1]];
    const move = Number(fen[5]) || null;
    const where = match.site ? `The game is on ${match.site}` : 'The chess site is unknown';
    const color = sides[match.color] ? `, you play ${sides[match.color]}` : '';
    const variant = match.variant && !/^(?:chess|standard)$/i.test(match.variant) ? `, variant ${match.variant}` : ', standard chess';
    lines.push(`${where}${color}${variant}${move ? `, move ${move}` : ''}${turn ? ` with ${turn} to move` : ''}.`);
    lines.push("A.C.A.S can't see the clock, the time control, ratings or player names, so those are unknown.");
    return lines;
}

const stop = new Set(('a an the and or but if then so of to in on at by for with from is are was were be been being am do does did done have has had '
    + 'i me my you your we our it its this that these those there here what which who whom how why when where can could should would will '
    + 'just not no yes ok okay please hey hi really very much more less too also any some all get got make makes making set use using '
    + 'want need like know think see tell show help thing things way still even about into out up down off over again only one two').split(' '));
// Chess words are everywhere in the guide, they say nothing about which section a question needs.
const chessWords = new Set('king queen rook bishop knight pawn piece pieces move moves moving play playing played game games win winning attack defend check mate board position best square squares side white black opponent'.split(' '));
const stem = word => word.replace(/'s$/, '').replace(/(?<=\w{4})(?:ing|ed|es|s)$/, '');
const terms = text => String(text).toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g)?.map(stem).filter(word => word.length > 1 && !stop.has(word) && !chessWords.has(word)) || [];
// Everyday words for things the guide names differently.
const synonyms = { weak: 'elo', weaker: 'elo', strong: 'elo', stronger: 'elo', easier: 'elo', harder: 'elo', strength: 'elo', level: 'elo',
    rating: 'elo', quiet: 'pena', silent: 'pena', talk: 'pena', talking: 'pena', coach: 'pena', arrows: 'arrow', popup: 'panel', window: 'panel' };
const queryTerms = text => [...new Set(String(text).toLowerCase().match(/[a-z0-9]+/g)?.flatMap(word => synonyms[word] ? [synonyms[word]] : []).concat(terms(text)) || [])];

let index = null;
function knowledgeIndex() {
    if(index) return index;
    const docs = knowledge.map(chunk => ({ chunk, title: new Set(terms(chunk.title)), body: new Set(terms(chunk.text)), name: chunk.title.toLowerCase() }));
    const counts = new Map();
    for(const doc of docs) for(const term of new Set([...doc.title, ...doc.body])) counts.set(term, (counts.get(term) || 0) + 1);
    const idf = term => Math.log(1 + docs.length / (counts.get(term) || docs.length));
    index = { docs, idf };
    return index;
}

/** The guide sections that best answer a question, best first. */
export function searchKnowledge(query, { limit = 2, minimum = 4 } = {}) {
    const { docs, idf } = knowledgeIndex();
    const wanted = queryTerms(query);
    if(!wanted.length) return [];
    const lower = String(query).toLowerCase();
    const named = [...lower.matchAll(new RegExp(guideNames.source, 'gi'))].map(match => match[0].replace(/\s+/g, ' '));
    const scored = docs.map((doc, position) => {
        let score = 0;
        for(const term of wanted) score += idf(term) * ((doc.title.has(term) ? 2.5 : 0) + (doc.body.has(term) ? 1 : 0));
        for(const name of doc.name.split(/,\s*/)) if(name.length > 4 && lower.includes(name.replace(/\?$/, ''))) score += 6;
        for(const name of named) if(doc.chunk.text.toLowerCase().includes(name)) score += 4;
        return { position, score, chunk: doc.chunk };
    }).filter(item => item.score >= minimum).sort((a, b) => b.score - a.score);
    const picked = [];
    for(const item of scored) {
        if(picked.length >= limit || (picked.length && item.score < picked[0].score * 0.75)) break;
        picked.push(item);
    }
    return picked;
}

/**
 * Builds the app notes for one message. Returns no text when the player didn't ask about A.C.A.S,
 * the site or the match. snapshot is { profiles: profileSummary[], others: string[], pena: settings, match }.
 */
export function appNotes(message, snapshot, { previous = null } = {}) {
    const topics = appTopics(message, previous?.topics);
    const empty = { text: '', notes: {}, topics, usage: [] };
    if(!topics.app && !topics.match) return empty;
    const lines = [];
    if(topics.app && snapshot) {
        const profiles = (snapshot.profiles || []).slice(0, 3);
        profiles.forEach(profile => lines.push(profileLine(profile)));
        const others = [...(snapshot.others || []), ...(snapshot.profiles || []).slice(3).map(profile => profile.name)];
        if(others.length) lines.push(`Other profiles: ${others.slice(0, 6).map(name => `"${String(name).slice(0, 40)}"`).join(', ')}.`);
        if(snapshot.pena) lines.push(penaLine(snapshot.pena));
    }
    const settings = lines.map((text, index) => ({ id: `S${index + 1}`, text }));
    const game = topics.match && snapshot ? matchLines(snapshot.match).map((text, index) => ({ id: `G${index + 1}`, text })) : [];
    let found = [];
    const earlier = (previous?.usage || []).map(position => ({ position, chunk: knowledge[position] })).filter(item => item.chunk);
    // A short follow up about "it" or "that" means the section from the turn before, not whatever shares a word.
    const pointing = earlier.length && /\b(?:it|that|this|them|those)\b/i.test(message) && String(message).trim().split(/\s+/).length <= 10;
    if(topics.app && !pointing) found = searchKnowledge(message);
    // The section being discussed keeps its tag so follow ups can still lean on it.
    if(topics.app && earlier.length) found = [earlier[0], ...found.filter(item => item.position !== earlier[0].position)].slice(0, 3);
    if(found.length === 1 && earlier[1] && (pointing || topics.carried)) found.push(earlier[1]);
    const usage = found.map((item, index) => ({ id: `U${index + 1}`, position: item.position,
        text: `From the ${item.chunk.page}, ${item.chunk.title}: ${item.chunk.text}` }));
    const all = [...settings, ...game, ...usage];
    if(!all.length) return empty;
    return {
        text: ['App notes, the player asked about A.C.A.S:', ...all.map(note => `[${note.id}] ${note.text}`)].join('\n'),
        notes: Object.fromEntries(all.map(note => [note.id, note])), topics, usage: usage.map(note => note.position)
    };
}

/** The notes each message of a chat gets, carried turn to turn exactly like PenaConversation does it live. */
export function appNotesChain(messages, snapshot) {
    let previous = null;
    return messages.map(message => {
        const app = appNotes(message, snapshot, { previous });
        previous = app.text ? { topics: app.topics, usage: app.usage } : null;
        return app;
    });
}

const numberPattern = /(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g;
export const appTag = /\[([SGUP]\d)\]/g;
const suggesting = /\b(?:try|trying|could|might|maybe|lower|raise|drop|bump|reduce|increase|decrease|change|instead|around|somewhere|something like|go for|start with|i'?d)\b/i;

/**
 * Numbers Pena states about the player's setup must come from the notes he cites, the player or the chat so far.
 * Suggestions like "try 1200" are his own advice, so they are left alone.
 */
export function unsupportedNumbers(sentence, notes, said = '') {
    const cited = [...sentence.matchAll(appTag)].map(match => notes?.[match[1]]?.text).filter(Boolean);
    if(!cited.length || suggesting.test(sentence)) return [];
    const known = new Set([...cited.join(' ').matchAll(numberPattern), ...String(said).matchAll(numberPattern)].map(match => match[0]));
    return [...new Set([...sentence.replace(appTag, '').matchAll(numberPattern)].map(match => match[0]))].filter(number => !known.has(number));
}
