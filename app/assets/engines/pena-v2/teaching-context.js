import { Chess } from '../libraries/chessjs/chess.js';
import { Facts, ownerColor, pieceMentions, negatedConcept } from './concepts.js';
import { variationFrames } from './teacher.js';
import { findPlayedMove } from './questions.js';
import { literalChessText } from './glossary.js';

const types = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' };
const other = color => color === 'w' ? 'b' : 'w';
const identity = piece => `${piece.color}${piece.type}@${piece.square}`;
const capture = /\b(?:captur\w*|tak\w*|remov\w*|eliminat\w*)\s+(?:(?:the|an?|your|their|opponent's|undefended|unprotected|hanging|loose)\s+)*$/i;
const fillers = 'is|are|was|were|remains?|looks?|seems?|still|now|also|completely|entirely|currently|totally|quite|rather|very|left|became|becomes?|simply|just|sits?|sitting|stands?|standing|already|clearly|actually|basically|effectively|both|attacked and|under attack and|(?:passed|isolated|doubled|backward|weak|undefended|unprotected|hanging|pinned|advanced|loose|exposed),? (?:but|and|yet)';
const predicate = new RegExp(`^(?:\\s|,)*(?:(?:${fillers})\\s+)*$`, 'i');
const pronounPredicate = new RegExp(`\\b(it|they|them|both(?: of them)?|neither(?: of them)?)(?:'s|'re)?\\s+(?:(?:${fillers})\\s+)*$`, 'i');
// "which just captured there and sits undefended": a short relative clause that ends in a state verb.
const relativeState = new RegExp(`^(?:[\\w'-]+\\s+){0,6}?(?:and\\s+)?(?:is|are|was|were|sits?|sitting|stands?|standing|remains?|looks?|left)\\s+(?:(?:${fillers})\\s+)*$`, 'i');
const directedActions = '(?:in check from|under attack from|attack\\w*|target\\w*|captur\\w*|tak(?:e|es|ing)|grab\\w*|snap\\w*(?: up| off)?|wins?|kick\\w*|chas(?:e|es|ing)|challeng\\w*|confront\\w*|driv\\w*(?: away| off| back)?|drove(?: away| off| back)?|forc\\w*(?: away| off| back)?|push\\w*(?: away| off| back)?|repel\\w*|dislodg\\w*|trade\\w*(?: for| with)?|exchang\\w*(?: for| with)?|sacrific\\w*|eliminat\\w*|remov\\w*|clear\\w*|get rid of|deal with|pin(?:s|ning|ned)?|skewer\\w*|fork\\w*|threat\\w*|hit(?:s|ting)?|trap\\w*|harass\\w*|pressur\\w*|go(?:es)? after|check(?:s|ing)?)';
const directedAction = new RegExp(`\\b${directedActions}\\b`, 'i');
const relationAction = /\b(?:attack\w*|control\w*|defend\w*|protect\w*|support\w*|guard\w*|cover\w*|eye\w*|hit\w*|target\w*|pressur\w*|challeng\w*|confront\w*)\b/gi;
const targetAction = new RegExp(`\\b(?:${directedActions}|defend\\w*|protect\\w*|support\\w*|guard\\w*|cover\\w*|eye\\w*)\\s+(?:(?:the|that|this|your|their)\\s+)?$`, 'i');
const cooperativeAction = /\b(?:defend\w*|protect\w*|support\w*|guard\w*|cover\w*|shield\w*|shelter\w*|help\w*|aid\w*|assist\w*|back\w*|bolster\w*|reinforce\w*|save\w*|rescue\w*|keep\w*\b[^.!?;]*\b(?:safe|protected|defended|guarded|covered))\b/i;
const stateVerbs = new Set(['be', 'is', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had', 'seem', 'seems', 'look', 'looks', 'remain', 'remains', 'stay', 'stays', 'sit', 'sits', 'stand', 'stands', 'lie', 'lies', 'appear', 'appears', 'feel', 'feels']);

function activePredicate(clause, subjectEnd) {
    const tail = clause.slice(subjectEnd).replace(/\s+(?:the|that|this|your|their)\s*$/i, '');
    const modalVerb = [...tail.matchAll(/\b(?:can|could|will|would|may|might|should|must|do|does|did)\s+(?:(?:not|also|directly|immediately|still|then)\s+)*([a-z][\w'-]*)\b/gi)].at(-1)?.[1].toLowerCase();
    if(modalVerb) return !stateVerbs.has(modalVerb);
    const leadingVerb = tail.match(/^\s*(?:also|directly|immediately|still|then)?\s*([a-z][\w'-]*)\b/i)?.[1].toLowerCase();
    if(leadingVerb && !stateVerbs.has(leadingVerb)) return true;
    return /\b(?:is|are|was|were|be|been|being)\s+[a-z][\w'-]*ing\b/i.test(tail);
}
export { negatedConcept } from './concepts.js';

export class TeachingContext {
    constructor(text, fen, { rootColor, beforeFen, history = [], evidenceLines = [], citations = [], antecedent = '', question = '' } = {}) {
        this.text = literalChessText(text).replace(/[\u2018\u2019]/g, "'");
        this.fen = new Chess(fen).fen();
        this.root = rootColor || new Chess(fen).turn();
        this.citations = citations;
        this.cache = new Map();
        this.locations = new Map();
        this.results = [];
        this.frames = variationFrames(this.text, this.fen, { rootColor, beforeFen, history, evidence: evidenceLines,
            lines: citations.map(({ fact }) => fact.line || []) });
        const played = beforeFen && findPlayedMove(beforeFen, this.fen);
        this.recent = played ? { ...played, beforeFen, fen: this.fen, index: -1, end: -1,
            branch: this.frames[0]?.branch || 1, capturedSquare: played.captured
                ? played.flags.includes('e') ? played.to[0] + played.from[1] : played.to : null } : null;
        this.entities(beforeFen || this.fen);
        for(const { fact } of citations) for(const frame of fact.line || []) this.advance(frame);
        for(const frame of [...(this.recent ? [this.recent] : []), ...this.frames]) this.advance(frame);
        // Previous chat contributes referents, never a second replay of its variations.
        for(const mention of pieceMentions(literalChessText(antecedent))) {
            if(!mention.square) continue;
            const result = this.resolve({ ...mention, index: -1, end: -1 });
            if(result.status === 'resolved') this.results.push(result);
        }
        if(question) {
            const query = new TeachingContext(question, this.fen, { rootColor: this.root });
            for(const result of query.results.filter(result => result.status === 'resolved')) {
                const entities = result.entities.filter(piece => this.facts(this.fen).board.get(piece.square)?.type === piece.type
                    && this.facts(this.fen).board.get(piece.square)?.color === piece.color)
                    .map(piece => ({ ...piece, id: this.entities(this.fen).get(piece.square), fen: this.fen }));
                if(entities.length) this.results.push({ ...result, index: -1, end: -1, fen: this.fen, entities });
            }
            for(const match of question.matchAll(/\b[a-h][1-8]\b/g)) {
                if(query.results.some(result => result.index <= match.index && result.end >= match.index + 2)) continue;
                const square = match[0], piece = this.facts(this.fen).board.get(square);
                if(!piece) continue;
                this.results.push({ index: -1, end: -1, status: 'resolved', name: Object.keys(types).find(name => types[name] === piece.type),
                    fen: this.fen, entities: [{ ...piece, square, id: this.entities(this.fen).get(square), fen: this.fen }] });
            }
        }
        for(const mention of pieceMentions(this.text)) this.results.push(this.resolve(mention));
    }

    facts(fen) {
        if(!this.cache.has(fen)) this.cache.set(fen, new Facts(fen));
        return this.cache.get(fen);
    }

    entities(fen) {
        if(!this.locations.has(fen)) {
            const same = [...this.locations].find(([position]) => position.split(' ')[0] === fen.split(' ')[0]);
            this.locations.set(fen, same ? new Map(same[1])
                : new Map(this.facts(fen).pieces.map(piece => [piece.square, identity(piece)])));
        }
        return this.locations.get(fen);
    }

    advance(frame) {
        const before = this.entities(frame.beforeFen);
        const after = new Map(before);
        const id = before.get(frame.from);
        after.delete(frame.from);
        if(frame.capturedSquare) after.delete(frame.capturedSquare);
        after.set(frame.to, id);
        if(/^O-O/.test(frame.san)) {
            const rank = frame.from[1], from = (frame.to[0] === 'g' ? 'h' : 'a') + rank;
            after.set((frame.to[0] === 'g' ? 'f' : 'd') + rank, before.get(from));
            after.delete(from);
        }
        const occupied = new Set(this.facts(frame.fen).pieces.map(piece => piece.square));
        for(const square of after.keys()) if(!occupied.has(square)) after.delete(square);
        this.locations.set(frame.fen, after);
    }

    frameAt(index) {
        const paragraph = this.text.lastIndexOf('\n\n', index);
        return this.frames.findLast(frame => frame.end <= index && frame.index >= paragraph) || this.recent;
    }

    prior(index, branch) {
        return this.results.filter(result => result.end <= index && result.status === 'resolved'
            && (result.index < 0 || result.branch === branch));
    }

    resolve(spec) {
        const frame = this.frameAt(spec.index);
        const fen = frame?.fen || this.fen;
        const branch = frame?.branch || 1;
        const clause = this.text.slice(0, spec.index).split(/[.!?;,]|\b(?:while|whereas|but)\b/i).at(-1);
        const clauseStart = spec.index - clause.length;
        const namedSubject = clause.match(/^\s*(?:and\s+|so\s+|then\s+)?(?:the\s+)?(white|black|opponent|enemy|player|your|you)\b/i)?.[1];
        // "The bishop on g4 pins..." names its side through the piece itself.
        const subjectPiece = this.results.find(result => result.index >= clauseStart && result.index < spec.index
            && result.status === 'resolved' && result.entities.length
            && /^\s*(?:(?:and|so|then|now|here|also)\s+)?(?:(?:the\s+)?(?:white|black|opponent|enemy|player|your|you)(?:'s)?\s*)?$/i.test(clause.slice(0, result.index - clauseStart)));
        const subjectColor = ownerColor(namedSubject, this.root)
            || (subjectPiece && new Set(subjectPiece.entities.map(entity => entity.color)).size === 1 ? subjectPiece.entities[0].color : null);
        const roleContext = `${clause} ${this.text.slice(spec.end).split(/[.!?;,]|\b(?:while|whereas|but)\b/i)[0]}`;
        // "Your knight is pinned to the queen" keeps one side. "pinned by the bishop" names the other one.
        const agent = /\b(?:by|from)\s+(?:the\s+|an?\s+)?$/i.test(clause) && directedAction.test(clause);
        const passive = /\b(?:is|are|was|were|been|being|gets?|got|stays?|remains?)\s+(?:(?:still|now|already|badly|absolutely|completely|also|just)\s+)*(?:pinned|skewered|forked|attacked|threatened|targeted|trapped|hit|pressured|captured|checked|challenged|confronted|chased|driven(?:\s+(?:away|off|back))?|repelled|dislodged)\b/i.test(clause);
        // "Take it with the knight" names the tool, so the subject's side holds.
        const instrument = /\bwith\s+(?:the\s+|an?\s+)?$/i.test(clause) && !/\bdeal\s+with\s+(?:the\s+|an?\s+)?$/i.test(clause);
        const actionBySubject = subjectPiece && activePredicate(clause, subjectPiece.end - clauseStart);
        const opposingSubject = agent || !passive && !instrument
            && (directedAction.test(roleContext) || actionBySubject && !cooperativeAction.test(roleContext));
        const color = ownerColor(spec.owner, this.root)
            || (/^(?:their|his|her)$/i.test(spec.determiner || '') ? other(this.root) : null)
            || (!spec.square && subjectColor ? opposingSubject ? other(subjectColor) : subjectColor : null);
        const kinds = spec.group ? { minor: ['n', 'b'], major: ['r', 'q'], active: ['n', 'b', 'r', 'q'] }[spec.group.toLowerCase()]
            : spec.pair ? ['b'] : spec.name === 'piece' ? ['p', 'n', 'b', 'r', 'q'] : [types[spec.name]];
        const plural = Boolean(spec.plural || spec.group || spec.pair || /^(?:both|two|all)$/i.test(spec.determiner || ''));
        const captured = frame?.captured && kinds.includes(frame.captured)
            && capture.test(this.text.slice(0, spec.index)) && (!spec.square || spec.square === frame.capturedSquare);
        let sourceFen = captured ? frame.beforeFen : fen;
        if(spec.square && frame && !captured) {
            const present = this.facts(sourceFen).board.get(spec.square);
            const live = this.facts(this.fen).board.get(spec.square);
            const sentence = this.text.slice(0, spec.index).split(/[.!?]\s+/).at(-1);
            const future = /\b(?:after|then|once|following|will|would|could|if|soon|later)\b/i.test(sentence);
            const origin = /\b(?:bring\w*|retreat\w*|rerout\w*|pull\w*)\b[^.!?]*$/i.test(sentence);
            if((!present || !kinds.includes(present.type) || color && present.color !== color)
                && live && kinds.includes(live.type) && (!color || live.color === color) && (!future || origin))
                sourceFen = this.fen;
        }
        const facts = this.facts(sourceFen);
        const locations = this.entities(sourceFen);
        let candidates = facts.find(kinds, color).map(piece => ({ ...piece, id: locations.get(piece.square), fen: sourceFen }));
        if(spec.file) candidates = candidates.filter(piece => piece.square[0] === spec.file);
        const actor = !spec.square && !passive && subjectPiece?.entities.length === 1 && subjectPiece.entities[0];
        if(actor && candidates.length > 1 && facts.board.get(actor.square)?.color === actor.color) {
            const verb = clause.slice(subjectPiece.end - clauseStart);
            const lined = /\b(?:pin(?:s|ning|ned)?|skewer\w*)\b/i.test(verb)
                ? candidates.filter(piece => facts.lines().some(line => line.slider === actor.square && (line.front === piece.square || line.back === piece.square)))
                : /\b(?:attack\w*|target\w*|hit(?:s|ting)?|threat\w*|fork\w*|pressur\w*|eye(?:s|ing)?)\b/i.test(verb)
                    ? candidates.filter(piece => piece.color !== actor.color && facts.attackers(piece.square, actor.color).includes(actor.square))
                    : /\b(?:defend\w*|protect\w*|guard\w*|support\w*|cover\w*)\b/i.test(verb)
                        ? candidates.filter(piece => piece.color === actor.color && facts.attackers(piece.square, actor.color).includes(actor.square))
                        : [];
            // The board itself says which of two knights the bishop pins or hits.
            if(lined.length && lined.length < candidates.length) candidates = lined;
        }
        if(!spec.square && candidates.length > 1) {
            // "Your knight is pinned" or "the bishop attacks the knight" points at one piece through what follows.
            const after = this.text.slice(spec.end).split(/[.!?;]/)[0];
            // Board facts like a pin can pick the piece. Claims like "undefended" would only confirm themselves.
            const state = after.match(/^\s+(?:is|are|was|were|remains?|stays?|gets?|got|looks?)\s+(?:(?:still|now|already|badly|absolutely|completely|also|just|being)\s+)*(pinned|skewered|attacked|threatened|targeted|hit)\b/i)?.[1].toLowerCase();
            const act = after.match(/^\s+(?:(?:also|now|still|directly|already|is)\s+)*(pin\w*|skewer\w*|attack\w*|hit\w*|target\w*|threat\w*|fork\w*|eye\w*|defend\w*|protect\w*|guard\w*|support\w*)\s+(?:(?:the|your|their|its|white's|black's|opponent's|an?|both)\s+)?(king|queen|rook|bishop|knight|pawn)/i);
            let narrowed = [];
            // "The knight can't take f4" means the knight that actually reaches f4.
            const reach = after.match(/^\s+(?:(?:can(?:not|'t)?|could(?:n't)?|would(?:n't)?|will|won't|wants? to|threatens? to|is threatening to|might|may)\s+)?(?:not\s+)?(?:just\s+)?(?:take|capture|grab|jump to|land on|hop to|go to)\s+(?:on\s+)?([a-h][1-8]|it)\b/i);
            const reachSquare = reach && (/^it$/i.test(reach[1])
                ? [...this.text.slice(0, spec.index).split(/[.!?]\s/).at(-1).matchAll(/\b[a-h][1-8]\b/g)][0]?.[0]
                : reach[1].toLowerCase());
            if(reachSquare) narrowed = candidates.filter(piece => facts.attackers(reachSquare, piece.color).includes(piece.square));
            else if(state === 'pinned' || state === 'skewered')
                narrowed = candidates.filter(piece => facts.lines().some(line => line.kind === { pinned: 'pin', skewered: 'skewer' }[state] && line.front === piece.square));
            else if(state === 'attacked' || state === 'threatened' || state === 'targeted' || state === 'hit')
                narrowed = candidates.filter(piece => facts.attackers(piece.square, other(piece.color)).length > 0);
            else if(act) {
                const target = types[act[2].toLowerCase()], friendly = /^(?:defend|protect|guard|support)/i.test(act[1]);
                narrowed = candidates.filter(piece => /^(?:pin|skewer)/i.test(act[1])
                    ? facts.lines().some(line => line.slider === piece.square && facts.board.get(line.front)?.type === target)
                    : facts.find([target], friendly ? piece.color : other(piece.color))
                        .some(victim => victim.square !== piece.square && facts.attackers(victim.square, piece.color).includes(piece.square)));
            }
            if(narrowed.length && narrowed.length < candidates.length) candidates = narrowed;
        }
        const result = (status, entities = [], evidence = '') => ({ ...spec, status, entities, evidence, fen: sourceFen, branch });
        if(spec.shade) candidates = candidates.filter(piece => piece.type !== 'b'
            || (piece.square.charCodeAt(0) - 97 + Number(piece.square[1])) % 2 === (spec.shade.toLowerCase() === 'dark' ? 1 : 0));
        if(spec.square) {
            candidates = candidates.filter(piece => piece.square === spec.square);
            return result(candidates.length ? 'resolved' : 'contradicted', candidates, 'explicit square, type and owner');
        }
        if(captured) {
            const victim = candidates.filter(piece => piece.square === frame.capturedSquare);
            return result(victim.length ? 'resolved' : 'contradicted', victim, 'verified capture');
        }
        const property = spec.property?.toLowerCase();
        const matching = pieces => !property || negatedConcept(this.text.slice(0, spec.index)) ? pieces
            : pieces.filter(piece => property === 'passed' ? piece.type === 'p' && facts.passed(piece)
                : property === 'isolated' ? piece.type === 'p' && facts.isolated(piece)
                    : property === 'doubled' ? piece.type === 'p' && facts.doubled(piece)
                        : property === 'backward' ? piece.type === 'p' && facts.backward(piece)
                            : property === 'undeveloped' ? ['n', 'b'].includes(piece.type) && piece.square[1] === (piece.color === 'w' ? '1' : '8')
                            : property === 'hanging' ? !facts.attackers(piece.square, piece.color).length && facts.capturers(piece.square, other(piece.color)).length > 0
                                : /^(?:undefended|unprotected|loose)$/.test(property) ? !facts.attackers(piece.square, piece.color).length
                                    : property === 'pinned' ? facts.lines().some(line => line.kind === 'pin' && line.front === piece.square) : true);
        const previous = this.prior(spec.index, branch).findLast(item => item.entities.some(entity => kinds.includes(entity.type)
            && (!color || color === entity.color)));
        if(spec.other) candidates = candidates.filter(piece => !previous?.entities.some(entity => entity.id === piece.id));
        if(plural) {
            const prefix = this.text.slice(0, spec.index).split(/[.!?;]/).at(-1);
            const subject = prefix.match(/\b(white|black|player|opponent|you)\s+(?:(?:can|should|could|must)\s+)?(?:develop\w*|doubl\w*|connect\w*|activat\w*|improv\w*|coordinat\w*)\b/i)?.[1];
            const side = color || ownerColor(subject, this.root) || previous?.entities[0]?.color || this.root;
            const scoped = color || subject || spec.group || spec.pair || /^(?:its|his|her|their|both|two)$/i.test(spec.determiner || '')
                && !kinds.includes('k') || /\b(?:develop\w*|doubl\w*|connect\w*|activat\w*|improv\w*)\s+(?:the\s+)?$/i.test(prefix);
            const selected = matching(scoped ? candidates.filter(piece => piece.color === side) : candidates);
            return result(selected.length && (!spec.pair || selected.length === 2) ? 'resolved' : 'unsupported', selected, 'explicit piece set');
        }
        const cited = this.citations.flatMap(({ fact }) => {
            const refs = fact.references || {};
            return [...(refs.squares || []), ...(refs.regions || []).flatMap(region => region.squares || [])];
        });
        const antecedent = candidates.filter(piece => previous?.entities.some(entity => entity.id === piece.id));
        if(antecedent.length === 1 && /^(?:that|this|its)$/i.test(spec.determiner || '') && !spec.other)
            return result('resolved', antecedent, 'compatible antecedent');
        const moved = [...(this.recent ? [this.recent] : []), ...this.frames].findLast(move => move.end <= spec.index && move.branch === branch
            && candidates.some(piece => piece.id === this.entities(move.fen).get(move.to)));
        if(antecedent.length === 1 && !spec.other && (!moved || previous.end > moved.end))
            return result('resolved', antecedent, 'more recent explicit subject');
        const moving = moved && candidates.filter(piece => piece.id === this.entities(moved.fen).get(moved.to));
        if(moving?.length === 1) return result('resolved', moving, 'discussed move actor');
        if(antecedent.length === 1 && !spec.other) return result('resolved', antecedent, 'compatible antecedent');
        const fromFact = candidates.filter(piece => cited.includes(piece.square));
        if(fromFact.length === 1) return result('resolved', fromFact, 'compatible cited fact');
        candidates = matching(candidates);
        if(!color && candidates.length > 1) {
            const own = candidates.filter(piece => piece.color === this.root);
            if(own.length === 1) return result('resolved', own, 'unique player piece');
        }
        return result(candidates.length === 1 ? 'resolved' : candidates.length ? 'ambiguous' : 'unsupported',
            candidates.length === 1 ? candidates : [], 'board candidates');
    }

    binding(index, end) {
        const described = this.results.find(result => result.index < end && result.end > index);
        if(described) return described;
        const frame = this.frameAt(index), branch = frame?.branch || 1;
        const previous = this.results.findLast(result => result.end <= index && (result.index < 0 || result.branch === branch));
        const gap = previous && this.text.slice(Math.max(0, previous.end), index);
        const prefix = this.text.slice(0, index);
        const pronoun = prefix.match(pronounPredicate);
        const relative = gap && /^\s*,?\s*(?:which|that)\s+/i.exec(gap);
        if(!pronoun && !(previous && (predicate.test(gap) || relative && (predicate.test(gap.slice(relative[0].length))
            || relativeState.test(gap.slice(relative[0].length)))))) return null;
        const fen = previous?.status === 'resolved' && (!frame || previous.end > frame.end)
            ? previous.fen : frame?.fen || this.fen;
        const locations = this.entities(fen);
        const plural = pronoun ? !/^it$/i.test(pronoun[1]) : Boolean(previous?.plural || previous?.group || previous?.pair);
        let source = previous;
        const objectPronoun = pronoun && /\b(?:leav\w*|keep\w*|render\w*|mak\w*)\s+$/i.test(prefix.slice(0, pronoun.index));
        if(pronoun && frame && (!previous || !objectPronoun && frame.end > previous.end)) {
            const piece = this.facts(fen).pieces.find(piece => piece.square === frame.to);
            source = { status: 'resolved', entities: piece ? [{ ...piece, id: locations.get(piece.square) }] : [] };
        }
        const ids = source?.entities.map(entity => entity.id) || [];
        const entities = this.facts(fen).pieces.filter(piece => ids.includes(locations.get(piece.square)))
            .map(piece => ({ ...piece, id: locations.get(piece.square), fen }));
        const resolved = source?.status === 'resolved' && entities.length > 0 && (plural || entities.length === 1);
        return { index, end, fen, branch, plural, name: previous?.name || 'piece', antecedentSquare: pronoun ? undefined : previous?.square,
            status: resolved ? 'resolved' : source?.status === 'contradicted' ? 'contradicted' : 'ambiguous',
            entities: resolved ? entities : [], evidence: 'contextual predicate subject' };
    }

    at(index) {
        const frame = this.frameAt(index);
        const branch = frame?.branch || 1;
        const prior = this.prior(index, branch);
        const sentence = Math.max(0, ...[...this.text.slice(0, index).matchAll(/[.!?;]\s+/g)].map(match => match.index + match[0].length));
        const actor = prior.findLast(result => result.index >= sentence && result.entities.length === 1
            && !targetAction.test(this.text.slice(sentence, result.index)));
        const described = this.results.find(result => result.index <= index && result.end > index);
        const entity = (described?.status === 'resolved' && described.entities.length === 1 ? described.entities[0] : null)
            || actor?.entities[0];
        const fen = described?.status === 'resolved' ? described.fen
            : actor && (!frame || actor.end > frame.end) ? actor.fen : frame?.fen || this.fen;
        const antecedent = prior.at(-1)?.entities.length === 1 ? prior.at(-1).entities[0].square : null;
        return { fen, root: this.root, branch, frame, beforeFen: frame?.beforeFen,
            focus: entity?.square || frame?.to || antecedent,
            actor: actor?.entities[0]?.square || frame?.to || antecedent,
            color: entity?.color || frame?.color || (frame ? new Chess(frame.beforeFen).turn() : this.root),
            subject: entity?.color || null, captured: frame?.captured || null, capturedSquare: frame?.capturedSquare,
            bind: (start, end) => this.binding(start, end),
            resolve: spec => this.results.find(result => result.index === spec.index && result.end === spec.end) || this.resolve(spec) };
    }

    relations(target, index) {
        const prefix = this.text.slice(0, index);
        const verb = [...prefix.matchAll(relationAction)].at(-1);
        if(!verb || /[.!?;]/.test(prefix.slice(verb.index)) || /^\s+by\b/i.test(prefix.slice(verb.index + verb[0].length))) return [];
        const position = this.at(verb.index);
        const source = position.actor;
        if(!source || source === target) return [];
        const facts = this.facts(position.fen), piece = facts.board.get(source);
        return piece && facts.attackers(target, piece.color).includes(source) ? [[source, target]] : [];
    }
}
