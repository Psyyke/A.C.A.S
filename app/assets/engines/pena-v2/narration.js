import { Chess } from '../libraries/chessjs/chess.js';
import { formatMoveNotation, speakSan } from '../../js/misc/moveNotation.js';
import { boardRegions, moveArrows, moveMentions, plannedMoves } from './teacher.js';
import { withTurn } from './factsheet.js';
import { conceptCues, pieceCues, tradeCues, mechanismCues, clauseSide } from './concepts.js';
import { glossaryMentions, literalChessText, hasDemo, demo, demoId } from './glossary.js';
import { TeachingContext, negatedConcept } from './teaching-context.js';
import { spokenAppName } from './formatting.js';
import { strategicCues } from './strategic-visuals.js';

export function compileTeaching(text, fen, context = text, options = {}) {
    const literal = literalChessText(text);
    const offset = context.endsWith(text) ? context.length - text.length : 0;
    const model = new TeachingContext(context, fen, options);
    const { frames } = model;
    const allPlans = plannedMoves(context, fen, { includeIdeas: true, rootColor: options.rootColor, frames });
    const plans = allPlans
        .filter(plan => plan.index >= offset)
        .map(plan => ({ ...plan, index: plan.index - offset, end: plan.end - offset }));
    const cues = [];
    const empty = () => ({ squares: [], moves: [], plans: [], regions: [], relations: [], frames: [] });
    const at = index => {
        const position = model.at(offset + index);
        const following = model.results.find(result => result.index >= offset + index && result.status === 'resolved'
            && result.entities.length === 1 && /^develop\w*\s+$/i.test(context.slice(offset + index, result.index)));
        if(following) {
            position.focus = following.entities[0].square;
            position.color = position.subject = following.entities[0].color;
        }
        return { ...position,
            bind: (index, end) => {
                const result = position.bind(index + offset, end + offset);
                return result && { ...result, index: result.index - offset, end: result.end - offset };
            },
            resolve: spec => position.resolve({ ...spec, index: spec.index + offset, end: spec.end + offset }) };
    };
    const squareRelations = (target, index) => model.relations(target, offset + index);
    for(const mention of moveMentions(text)) {
        const frame = frames.find(frame => frame.index === offset + mention.index);
        const plan = !frame && plans.find(plan => plan.index === mention.index);
        if(!frame && !plan) continue;
        const refs = empty();
        if(plan) refs.plans.push(plan);
        else {
            const arrows = moveArrows(frame);
            refs.squares.push(...arrows.flat());
            refs.moves.push(...arrows);
            refs.frames.push(frame);
        }
        const token = text.slice(mention.index, mention.end);
        const sanOffset = typeof mention.input === 'string' ? token.lastIndexOf(mention.input) : 0;
        cues.push({ index: mention.index + Math.max(0, sanOffset), end: mention.end, references: refs,
            spoken: frame ? formatMoveNotation({ fen: frame.beforeFen, player: [frame.from, frame.to],
                playerPromotion: frame.promotion }, true, true)
                : `${{ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[plan.piece]} ${plan.from} to ${plan.to}` });
    }
    for(const match of text.matchAll(/\b[a-h][1-8]\b/g)) {
        if(cues.some(cue => match.index >= cue.index && match.index < cue.end)) continue;
        cues.push({ index: match.index, end: match.index + match[0].length,
            references: { ...empty(), squares: [match[0]], relations: squareRelations(match[0], match.index) } });
    }
    const relationWords = /\b(?:attack(?:s|ing|ed)?|control(?:s|ling|led)?|guard(?:s|ing|ed)?|protect(?:s|ing|ed)?|defend(?:s|ing|ed)?|support(?:s|ing|ed)?|cover(?:s|ing|ed)?|eye(?:s|ing|d)?|hit(?:s|ting)?|target(?:s|ing|ed)?|pressur(?:es|ing|ed))\b/gi;
    for(const match of literal.matchAll(relationWords)) {
        if(negatedConcept(literal.slice(0, match.index))) continue;
        const end = match.index + match[0].length;
        let tail = literal.slice(end).split(/[.!?;]|\b(?:but|while|whereas)\b|,\s+(?:and\s+)?(?:your|white|black|the)\b/i)[0];
        const nextVerb = [...tail.matchAll(relationWords)][0];
        if(nextVerb) {
            const clause = [...tail.slice(0, nextVerb.index).matchAll(/(?:,\s*(?:and|so)?\s*|\band\s+)(?=(?:the|your|white|black|it|they|you)\b)/gi)].at(-1);
            tail = tail.slice(0, clause ? clause.index : nextVerb.index);
        }
        const targets = [
            ...[...tail.matchAll(/\b[a-h][1-8]\b/g)].map(target => ({ square: target[0], index: target.index })),
            ...model.results.filter(result => result.index >= offset + end && result.index < offset + end + tail.length
                && result.status === 'resolved').flatMap(result => result.entities.map(entity =>
                    ({ square: entity.square, index: result.index - offset - end })))
        ];
        const position = at(match.index);
        const facts = model.facts(position.fen);
        let relations;
        if(/^\s+by\b/i.test(tail)) {
            const bound = position.bind(match.index, end);
            const namedSquare = literal.slice(0, match.index).match(/\b([a-h][1-8])\s+(?:(?:is|are|also|well|still)\s+)*$/i)?.[1];
            const victims = namedSquare ? [namedSquare] : bound?.status === 'resolved' ? bound.entities.map(entity => entity.square) : [];
            relations = victims.flatMap(target => targets.filter(source => {
                const piece = facts.board.get(source.square), victim = facts.board.get(target);
                return piece && victim && (piece.color === victim.color) !== /^attack/i.test(match[0])
                    && facts.attackers(target, piece.color).includes(source.square);
            }).map(source => [source.square, target]));
        } else {
            relations = targets.flatMap(target => squareRelations(target.square, end + target.index));
            if(/\b(?:it|them|each other|one another)\b/i.test(tail)) {
                const prior = model.prior(offset + match.index, position.branch);
                const actor = facts.board.get(position.actor);
                if(actor && /\b(?:each other|one another)\b/i.test(tail)) {
                    const peers = prior.slice(-2).flatMap(result => result.entities);
                    relations.push(...peers.flatMap(source => peers.filter(target => target.square !== source.square
                        && facts.attackers(target.square, source.color).includes(source.square)).map(target => [source.square, target.square])));
                } else if(actor) {
                    const target = prior.findLast(result => result.entities.length === 1
                        && result.entities[0].square !== position.actor
                        && (result.entities[0].color !== actor.color) === /^(?:attack|hit|target|eye|pressur)/i.test(match[0]))?.entities[0];
                    if(target && facts.attackers(target.square, actor.color).includes(position.actor))
                        relations.push([position.actor, target.square]);
                }
            }
        }
        const unique = relations.filter((pair, index) => relations.findIndex(other => other[0] === pair[0] && other[1] === pair[1]) === index);
        if(unique.length) cues.push({ index: match.index, end, references: { ...empty(),
            squares: [...new Set(unique.flat())], relations: unique } });
    }
    // Plans and threats join the line moves, so "threatens Qd8#" or "trading rooks with Rxe8+" can point at them.
    const ideas = allPlans.map(plan => {
        const beforeFen = new Chess(plan.beforeFen).turn() === plan.color ? plan.beforeFen : withTurn(plan.beforeFen, plan.color);
        const board = new Chess(beforeFen);
        let move = null;
        try { move = board.move({ from: plan.from, to: plan.to, promotion: 'q' }); } catch {}
        return move && { ...plan, index: plan.index - offset, end: plan.end - offset, san: move.san, captured: move.captured,
            beforeFen, fen: board.fen(), plan: true, threat: /threat/i.test(context.slice(0, plan.index).split(/[.!?]\s+/).at(-1)) };
    }).filter(Boolean);
    const moves = [...frames.map(frame => ({ ...frame, index: frame.index - offset, end: frame.end - offset })), ...ideas]
        .sort((a, b) => a.index - b.index);
    for(const cue of [...pieceCues(literal, at), ...conceptCues(literal, at, moves, options), ...tradeCues(literal, at, moves), ...mechanismCues(literal, at, moves)]) {
        const relations = cue.references.square ? squareRelations(cue.references.square, cue.index) : [];
        cues.push({ ...cue, references: { ...empty(), ...cue.references, relations: [...(cue.references.relations || []), ...relations] } });
    }
    for(const match of literal.matchAll(/\b(?:it|that piece)\b(?=\s+(?:also\s+)?(?:attacks?|controls?|guards?|protects?|defends?|supports?|blocks?|develops?)\b)/gi)) {
        const position = at(match.index);
        const previous = model.prior(offset + match.index, position.branch).at(-1);
        const ids = previous?.entities.map(entity => entity.id) || [];
        const square = [...model.entities(position.fen)].find(([, id]) => ids.includes(id))?.[0];
        if(square && ids.length === 1) cues.push({ index: match.index, end: match.index + match[0].length,
            references: { ...empty(), squares: [square] } });
    }
    const regions = /\b(?:[a-h][1-8][- ](?:bishop|queen|rook|knight|king|pawn)(?:'s)? diagonals?|(?:bishop|queen)(?: on [a-h][1-8])?'s diagonals?|queen[ -]?side|king[ -]?side|(?:extended |broad )?cent(?:er|re|ral)|(?:(?:(?:half[- ]|semi[- ])?open )?[a-h][- ]file|file [a-h])|(?:[1-8](?:st|nd|rd|th)?[- ]rank|rank [1-8])|(?:light|dark)[- ]squares?|back rank|[a-h][1-8]-[a-h][1-8](?: diagonal)?|(?:(?:long|light[- ]squared?|dark[- ]squared?) )?diagonals?(?: for (?:the |your )?(?:[a-h][1-8][- ](?:bishop|queen)|(?:bishop|queen) (?:on|from) [a-h][1-8]))?|king safety|secur\w* (?:the |your )?king|king (?:safe|expos\w*|shelter)|castling|(?:un)?develop\w*(?: (?:(?:the|your|own|white|black|opponent's) )?(?:knights?|bishops?|minor pieces?))?|active (?:piece|bishop|knight)|piece activity|connect\w* (?:the )?rooks|rook (?:coordination|battery)|doubl\w* (?:the )?rooks|pawn structure|connected pawns|outpost|blockad\w*|space advantage)\b/gi;
    for(const match of [...literal.matchAll(regions), ...literal.matchAll(/\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth)[- ]rank\b/gi)]) {
        if(negatedConcept(literal.slice(0, match.index))) continue;
        const position = at(match.index);
        position.color = clauseSide(literal, match.index, position.root) || position.subject || position.root || position.color;
        if(/develop/i.test(match[0])) {
            const type = match[0].match(/\b(knight|bishop)s?\b/i)?.[1];
            const singular = type && !new RegExp(type + 's\\b', 'i').test(match[0]);
            const board = new Chess(position.fen);
            const kind = type === 'knight' ? 'n' : type ? 'b' : null;
            if(kind && (board.get(position.focus)?.type !== kind || board.get(position.focus)?.color !== position.color)) {
                if(/^develop(?:s|ed|ing)\b/i.test(match[0])) continue;
                const candidates = board.board().flat().filter(piece => piece?.type === kind && piece.color === position.color
                    && piece.square[1] === (position.color === 'w' ? '1' : '8'));
                position.focus = candidates.length === 1 ? candidates[0].square : null;
                if(singular && !position.focus) continue;
            }
            const next = frames.find(frame => frame.index >= offset + match.index + match[0].length
                && /^\s+(?:with\s+)?$/.test(context.slice(offset + match.index + match[0].length, frame.index)));
            if(next) {
                position.fen = next.beforeFen;
                position.focus = next.from;
                position.color = new Chess(next.beforeFen).turn();
            } else {
                const named = text.slice(0, match.index).match(/\b(?:bishop|knight) on ([a-h][1-8])\s+(?:(?:is|remains?|still|and)\s+)*$/i);
                if(named) {
                    position.focus = named[1];
                    position.color = new Chess(position.fen).get(position.focus)?.color || position.color;
                } else if(/^development$/i.test(match[0])) position.focus = null;
            }
        }
        if(/diagonal/i.test(match[0])) {
            const named = match[0].match(/\b([a-h][1-8])[- ](?:bishop|queen|rook|knight|king|pawn)\b|\b(?:on|from) ([a-h][1-8])\b/i);
            if(named) position.focus = named[1] || named[2];
            else if(!['b', 'q'].includes(new Chess(position.fen).get(position.focus)?.type)) position.focus = null;
        }
        const both = /castl/i.test(match[0]) && /\bboth sides\b/i.test(literal.slice(match.index).split(/[.!?;]/)[0]);
        const regions = both ? ['w', 'b'].flatMap(color => boardRegions(match[0], position.fen, { ...position, color }))
            : boardRegions(match[0], position.fen, position);
        if(!regions.length) continue;
        cues.push({ index: match.index, end: match.index + match[0].length,
            references: { ...empty(), regions } });
    }
    for(const cue of strategicCues(literal, at, moves, cues, options))
        cues.push({ ...cue, references: { ...empty(), ...cue.references } });
    for(const mention of glossaryMentions(text)) {
        if(!hasDemo(mention.term) || negatedConcept(literal.slice(0, mention.index))) continue;
        const prefix = literal.slice(0, mention.index).split(/[.!?;]\s+/).at(-1);
        const tail = literal.slice(mention.end);
        const definition = /(?:^|\b)(?:an?|the)\s+$/i.test(prefix)
            && /^\s+(?:is|means|happens|occurs|involves|describes)\b/i.test(tail)
            || /(?:^|\b)in\s+(?:an?|the)\s+$/i.test(prefix);
        if(!definition || cues.some(cue => cue.index < mention.end && cue.end > mention.index
            && (cue.references.regions.length || cue.references.relations.length))) continue;
        const shown = demo(mention.term);
        if(shown) cues.push({ index: mention.index, end: mention.end, references: { ...empty(), ...shown.references },
            positionFen: shown.finalFen, demo: { id: `D:${demoId(mention.term)}`, fact: { term: mention.term } } });
    }
    const merged = [];
    for(const cue of cues.sort((a, b) => a.index - b.index || b.end - a.end)) {
        const previous = merged.at(-1);
        if(!previous || previous.end <= cue.index) {
            merged.push(cue);
            continue;
        }
        // A piece phrase can overlap a tactic or pawn feature. Keep both visuals at one speech mark.
        previous.end = Math.max(previous.end, cue.end);
        for(const key of ['squares', 'moves', 'plans', 'regions', 'relations', 'frames']) {
            const values = [...previous.references[key], ...cue.references[key]];
            previous.references[key] = values.filter((value, index) =>
                values.findIndex(other => JSON.stringify(other) === JSON.stringify(value)) === index);
        }
        previous.positionFen ||= cue.positionFen;
        previous.demo ||= cue.demo;
    }
    for(const cue of merged) {
        const position = at(cue.index);
        cue.positionFen ||= cue.references.frames[0]?.beforeFen || cue.references.plans[0]?.beforeFen || position.fen;
        cue.branch = cue.references.frames[0]?.branch || position.branch;
    }
    const mentions = [
        ...model.results.filter(result => result.index >= offset).map(result => ({ ...result, kind: 'piece', index: result.index - offset, end: result.end - offset })),
        ...moveMentions(text).map(mention => {
            const frame = frames.find(frame => frame.index === mention.index + offset);
            const plan = plans.find(plan => plan.index === mention.index);
            return { ...mention, kind: 'move', status: frame || plan ? 'resolved' : 'unsupported', frame, plan };
        }),
        ...glossaryMentions(text).map(mention => ({ ...mention, kind: 'concept',
            status: negatedConcept(literal.slice(0, mention.index)) ? 'not board-specific'
                : merged.some(cue => cue.index < mention.end && cue.end > mention.index
                    && !cue.demo && (cue.references.regions.length || cue.references.relations.length)) ? 'resolved'
                    : hasDemo(mention.term) ? 'demonstration' : 'unsupported' }))
    ];
    return { text, fen, frames, cues: merged, mentions };
}

export function teachingCues(text, fen, context = text, options = {}) {
    return (options.compiled || compileTeaching(text, fen, context, options)).cues;
}

export function teachingPreview(compiled, cue, fen) {
    if(!cue?.positionFen || cue.positionFen.split(' ')[0] === fen.split(' ')[0]) return null;
    const move = cue.references.frames?.[0];
    if(move) {
        const index = compiled.frames.findIndex(frame => frame.index === move.index);
        if(index >= 0) return { frames: compiled.frames, index, before: true };
    }
    const index = compiled.frames.findLastIndex(frame => frame.fen.split(' ')[0] === cue.positionFen.split(' ')[0]);
    if(index >= 0) return { frames: compiled.frames, index, before: false };
    // An idea or a historical feature can have a valid board without a full spoken line.
    return { frames: [{ fen: cue.positionFen, san: cue.demo ? `Example: ${cue.demo.fact.term}` : 'Position being discussed',
        branch: cue.branch }], index: 0, before: false };
}

// A word or two stranded between highlights reads and sounds odd alone, so it joins the phrase it leads into.
// Move numbers and articles always travel with the move or piece they introduce.
const leadWords = 'by|to|of|on|in|at|for|with|from|against|into|onto|towards?|behind|through|over|under|beside|near|via|along|across|around|between|among|without|within|past|beyond|after|before|than|toward';
const trailingLead = new RegExp(`\\s((?:(?:next|close|right|straight|away)\\s+)?(?:by|to|of|with|from|for|at|into|onto|towards?|against|via|between|among|than|and|or|but|nor|the|an?|your|their|his|her|its|my|our)(?:\\s+(?:the|an?|your|their|his|her|its|my|our|own))*)$`, 'i');
export function bridgeLoneWords(text, cues) {
    let end = 0;
    for(const cue of cues.sort((a, b) => a.index - b.index)) {
        let start = Math.max(end, cue.index);
        start -= text.slice(end, start).match(/(?:^|\s)(\d{1,3}\.(?:\.\.)?\s*)$/)?.[1].length || 0;
        start -= text.slice(end, start).match(/(?:^|\s)((?:(?:the|an?|your|their|his|her|its|my|our|this|these|those|both|each|enemy|white['’]s|black['’]s|opponent['’]s|own)\s+){1,2})$/i)?.[1].length || 0;
        // A preposition belongs to the phrase it introduces. Ending a clip on "by" or "to" also lets the voice swallow it.
        start -= text.slice(end, start).match(new RegExp(`(?:^|\\s)((?:(?:next|close|right|straight|away)\\s+)?(?:${leadWords})\\s+)$`, 'i'))?.[1].length || 0;
        const gap = text.slice(end, start);
        const pieces = gap.split(/[,;:!?()"“”—–]|\.(?=\s)/);
        const tail = pieces.at(-1);
        const words = tail.trim().split(/\s+/).filter(Boolean);
        // A sentence may open with its own subject and verb. Mid-sentence, a short run belongs to what follows.
        const sentenceStart = pieces.length === 1 ? end === 0 : /[.!?]["”)]*\s*$/.test(gap.slice(0, gap.length - tail.length));
        if(words.length && words.length <= (sentenceStart ? 1 : 2) && words.every(word => /^[\p{L}'’-]+$/u.test(word)))
            start -= tail.length - tail.search(/\S/);
        if(start < cue.index) {
            const lead = text.slice(start, cue.index);
            if(cue.spoken) cue.spoken = lead + (/\s$/.test(lead) ? '' : ' ') + cue.spoken;
            cue.index = start;
        }
        end = Math.max(end, cue.end);
    }
    return cues;
}

// Neural speech does not expose word timestamps. Split at references so their real
// audio start, not an estimated fraction of a sentence, triggers each cue.
export function narrationParts(text, fen, context = text, options) {
    const cues = teachingCues(text, fen, context, options).map(cue => ({ ...cue }));
    // Pronunciation does not require inventing a legal source square for an unresolved move.
    for(const mention of moveMentions(text)) {
        if(typeof mention.input !== 'string') continue;
        const existing = cues.find(cue => cue.index < mention.end && cue.end > mention.index);
        if(existing?.spoken) continue;
        const spoken = speakSan(mention.input);
        if(existing) {
            existing.index = Math.min(existing.index, mention.index);
            existing.end = Math.max(existing.end, mention.end);
            existing.spoken = spoken;
        } else cues.push({ ...mention, spoken, references: null });
    }
    bridgeLoneWords(text, cues);
    const parts = [];
    let end = 0;
    for(const cue of cues) {
        if(cue.index > end) {
            const prefix = text.slice(end, cue.index);
            if(parts.length) parts.at(-1).text += prefix;
            else if(prefix.trim()) parts.push({ text: prefix, cue: null });
        }
        parts.push({ text: cue.spoken || text.slice(cue.index, cue.end), cue: cue.references ? cue : null });
        end = cue.end;
    }
    if(end < text.length) {
        if(parts.length) parts.at(-1).text += text.slice(end);
        else parts.push({ text, cue: null });
    }
    return parts.map(part => ({ ...part, text: part.text.replace(/\s*\(plan\)/gi, '') }))
        .filter(part => part.text.trim());
}

// A cue starts after a short audible breath, including inside an explanatory aside.
export function narrationPhrases(text, fen, context = text, options) {
    let spoken = '';
    const marks = [];
    for(const part of narrationParts(text, fen, context, options)) {
        if(part.cue) {
            // Keep a clause's short subject with its verb instead of synthesizing "it" alone.
            const subject = spoken.match(/(?:^|[.!?;,]\s*)((?:it|they|he|she|this|that|these|those)(?:['’](?:s|re))?\s+(?:(?:also|still|now|just|already|then)\s+)*)$/i);
            const at = subject ? spoken.length - subject[1].length : spoken.length;
            marks.push({ at, cue: part.cue });
        }
        spoken += spokenAppName(part.text);
    }

    const breaks = new Map([[0, 0], [spoken.length, 0]]);
    for(const mark of marks) breaks.set(mark.at, 180);
    for(const match of spoken.matchAll(/[()]/g)) {
        const index = match.index + (match[0] === ')' ? 1 : 0);
        breaks.set(index, Math.max(120, breaks.get(index) || 0));
    }
    let start = 0;
    for(const match of spoken.matchAll(/(?!(?<=(?:^|\s)\d{1,3}\.*)\.)[,;.!?]\s+/g)) {
        const end = match.index + match[0].length;
        if(spoken.slice(start, end).trim().split(/\s+/).length >= 4) {
            if(!breaks.has(end)) breaks.set(end, 0);
            start = end;
        }
    }
    const boundaries = [...breaks.keys()].sort((a, b) => a - b);
    const phrases = boundaries.slice(0, -1).map((from, index) => {
        const to = boundaries[index + 1];
        const raw = spoken.slice(from, to);
        return { text: raw.replace(/[()]/g, '').trim(), pauseBefore: breaks.get(from),
            marks: marks.filter(mark => mark.at >= from && mark.at < to).map(mark => ({ at: 0, cue: mark.cue })) };
    }).filter(phrase => phrase.text);
    // No clip may end on a word that leads into the next one. The voice tends to swallow it.
    for(let index = 0; index < phrases.length - 1; index++) {
        const lead = phrases[index].text.match(trailingLead);
        if(!lead || lead.index === 0) continue;
        phrases[index].text = phrases[index].text.slice(0, lead.index);
        phrases[index + 1].text = `${lead[1]} ${phrases[index + 1].text}`;
    }
    // A voice reading one bare word on its own stretches it out, so it rides with a neighbor.
    for(let index = 0; index < phrases.length && phrases.length > 1; index++) {
        const phrase = phrases[index];
        if(phrase.text.split(/\s+/).length > 1) continue;
        const next = /[.!?…]$/.test(phrase.text) && !/^\d+\.+$/.test(phrase.text) && index ? null : phrases[index + 1];
        if(next) phrases[index + 1] = { text: `${phrase.text} ${next.text}`, pauseBefore: phrase.pauseBefore, marks: [...phrase.marks, ...next.marks] };
        else {
            const previous = phrases[index - 1];
            const at = previous.text.length + 1;
            Object.assign(previous, { text: `${previous.text} ${phrase.text}`, marks: [...previous.marks, ...phrase.marks.map(mark => ({ ...mark, at: mark.at + at }))] });
        }
        phrases.splice(index--, 1);
    }
    return phrases;
}

