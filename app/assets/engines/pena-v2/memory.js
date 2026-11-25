import { glossaryMentions } from './glossary.js';

// Local time notes, plus replaying the player facts that older saved coaching snapshots carry.
// The live app keeps nothing about the player. People add that to the system prompt instead.

const asksAboutMe = /\b(?:what (?:do|did) you (?:know|remember)|do you (?:know|remember) (?:me|my|who i am|anything|what)|what(?:'s| is) my name|who am i\b|remember me|what have i told you|what did i tell you|what i told you|do you still remember|have we met)/;
const greetingPattern = /^(?:\W*)(?:hi|hey|hello|hiya|howdy|yo|sup|heya|moi|hei|terve|good (?:morning|afternoon|evening|day|night)|morning|afternoon|evening|gm|gn|greetings|what's up|whats up)\b/;
const farewellPattern = /\b(?:bye|goodbye|good night|goodnight|gn|see (?:you|ya)|cya|gotta go|got to go|heading (?:out|off|to bed)|going to (?:bed|sleep)|time for bed|that's it for today|thanks for the game)\b/;
const timeQuestion = /\b(?:what(?:'s| is)? the (?:time|date|day)|what time|what day|which day|today's date|it's late|so late|too late|late night|this late|still up|early morning|so early|can't sleep|tired|sleepy|bedtime|tonight|this morning|this evening|weekend)\b/;
const topics = [
    { kinds: ['opening', 'color'], pattern: /\b(?:openings?|repertoire|defen[cs]es?|gambits?|first moves?|what (?:should i|to) play (?:as|against|with)|as white|as black)\b/ },
    { kinds: ['goal', 'struggle', 'level', 'rating', 'note'], pattern: /\b(?:improve|improving|get better|getting better|study|studying|practi[cs]e|train|training|work on|tips?|advice|learn|lessons?|weak(?:ness|nesses)?|strengths?|progress|for me|my game|what should i (?:study|focus|do)|coach me)\b/ },
    { kinds: ['rating', 'level'], pattern: /\b(?:rating|elo|level|rated|how good|am i good|my strength|beginner|too hard|too easy|for my level)\b/ },
    { kinds: ['speed', 'site'], pattern: /\b(?:blitz|bullet|rapid|classical|time controls?|time management|flag|flagging|lichess|chess\.com)\b/ },
    { kinds: ['style'], pattern: /\b(?:style|aggressive|positional|tactical|solid|sharp|what kind of player|attacking player)\b/ }
];

const parts = [[5, 'morning'], [12, 'afternoon'], [18, 'evening'], [22, 'night']];
export function partOfDay(date) {
    const hour = date.getHours();
    if(hour < 5) return 'late night';
    return [...parts].reverse().find(([start]) => hour >= start)[1];
}

/** "Local time: Friday 13 November 2026, 09:14 (morning)." only on greetings, goodbyes or time talk. */
export function timeNote(message, { now = new Date(), first = false } = {}) {
    const lower = String(message || '').toLowerCase();
    const greeting = greetingPattern.test(lower.trim()) || farewellPattern.test(lower);
    if(!greeting && !timeQuestion.test(lower) && !(first && lower.split(/\s+/).length <= 4 && !/[a-h][1-8]/.test(lower))) return '';
    const day = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(',', '');
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return `Local time: ${day}, ${time} (${partOfDay(now)}).`;
}

/**
 * The few memory lines that fit this message, tagged [P1], [P2]. Normal mid-match chess talk gets none.
 * update is what this message just changed, so Pena can acknowledge it without guessing.
 */
export function recallMemories(message, items = [], { first = false, enabled = true, update = null } = {}) {
    const lower = String(message || '').toLowerCase().replace(/[\u2018\u2019]/g, "'");
    const lines = [];
    if(update?.command === 'clear') lines.push('Memory: you just forgot everything you knew about the player, as they asked.');
    else if(update?.command === 'kind' || update?.command === 'last') lines.push(update.removed?.length ? `Memory: you just forgot ${update.removed.map(entry => `"${entry.fact}"`).join(' and ')}, as they asked.` : 'Memory: there was nothing like that to forget.');
    else if(update?.command === 'disable') lines.push('Memory: you stopped remembering things about the player, as they asked. They can turn it back on in the Pena AI window.');
    else if(update?.command === 'enable') lines.push('Memory: memory is on again.');
    const asking = asksAboutMe.test(lower);
    if(!enabled) {
        if(asking || /\b(?:remember|memory)\b/.test(lower)) lines.push('Pena keeps nothing about the player between chats. They can tell Pena about themselves in the system prompt in Pena settings.');
        return { text: lines.join('\n'), notes: {}, items: [] };
    }
    const fresh = new Set((update?.added || []).map(entry => entry.key));
    const wanted = new Map();
    const want = (entry, score) => wanted.set(entry, Math.max(score, wanted.get(entry) || 0));
    for(const entry of items) {
        if(fresh.has(entry.key)) want(entry, 5);
        if(asking) want(entry, 2);
        if(entry.kind === 'name' && (asking || /\bmy name\b/.test(lower) || greetingPattern.test(lower.trim()) || farewellPattern.test(lower) || first && lower.split(/\s+/).length <= 6)) want(entry, 4);
        for(const topic of topics) if(topic.pattern.test(lower) && topic.kinds.includes(entry.kind)) want(entry, 3);
        if(entry.kind === 'opening' && glossaryMentions(lower).some(mention => entry.key === `opening:${mention.term}`)) want(entry, 4);
    }
    const chosen = [...wanted].sort((a, b) => b[1] - a[1] || (b[0].at || 0) - (a[0].at || 0)).slice(0, asking ? 6 : 3).map(([entry]) => entry);
    if(asking && !items.length) lines.push('Memory: you do not remember anything about the player yet.');
    const notes = {};
    chosen.forEach((entry, index) => {
        notes[`P${index + 1}`] = { id: `P${index + 1}`, text: entry.fact };
        lines.push(`[P${index + 1}] ${entry.fact}${fresh.has(entry.key) ? ' (just told you)' : ''}`);
    });
    if(chosen.length) lines.splice(lines.length - chosen.length, 0, 'What you remember about the player:');
    return { text: lines.join('\n'), notes, items: chosen };
}

/** Time and memory lines for one message, in the shape chatSheet expects. */
export function personalNotes(message, { items = [], enabled = true, now = null, first = false, update = null } = {}) {
    const memory = recallMemories(message, items, { first, enabled, update });
    let time = now ? timeNote(message, { now, first }) : '';
    const question = String(message || '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[?!.,]+$/g, '').trim();
    let reply = null;
    if(/^(?:what(?:'s| is) (?:your|the coach's) name|who are you)$/.test(question)) reply = "I'm Pena.";
    if(/^(?:what(?:'s| is) my name|who am i|do you (?:know|remember) my name)$/.test(question)) {
        const name = enabled && items.find(entry => entry.kind === 'name')?.fact.match(/^Their name is (.+)\.$/)?.[1];
        // Without a saved name the model answers, so a name written in the system prompt still works.
        if(name) reply = `Your name is ${name}.`;
    }
    if(now && /^(?:what time(?: is it)?|what(?:'s| is) the (?:time|date)|what (?:day|date) is (?:it|today))$/.test(question)) {
        time ||= timeNote('what time is it', { now });
        reply = time.replace(/^Local time: /, '') + ' [P0]';
    }
    const notes = { ...memory.notes };
    if(time) notes.P0 = { id: 'P0', text: time };
    return { text: [time, memory.items.some(entry => entry.kind === 'name')
        ? 'Remembered names belong to the player. The coach is Pena, never the player.' : '', memory.text].filter(Boolean).join('\n'),
        notes, recalled: memory.items, reply };
}
