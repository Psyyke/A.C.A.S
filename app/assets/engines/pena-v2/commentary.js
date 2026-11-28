import { Chess } from '../libraries/chessjs/chess.js';
import { moveMentions } from './teacher.js';
import { checkSentence } from './grounding.js';
import { pickProblem, problemText } from './safety.js';
import { dropAnnouncedLabels } from './formatting.js';

export function explanationBody(text) {
    return text.split(/\n(?:BEST_MOVE|CRITICAL_LINE|PROMISING_MOVES|EVALUATION):/)[0]
        .replace(/^ANALYSIS:\s*/, '').trim();
}

export function sourceSentences(text, final = true) {
    const body = explanationBody(text);
    const masked = body.replace(/\b\d+\.(?:\.\.)?|\.\.\./g, value => value.replaceAll('.', 'x'));
    return [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(masked)]
        .filter(({ segment, index }) => final || index + segment.length < body.length || /[.!?]\s+$|\n$/.test(segment))
        .map(({ segment, index }) => ({ text: body.slice(index, index + segment.length).trim(), index }))
        .filter(sentence => sentence.text);
}

function signature(text) {
    return new Set(text.toLowerCase().match(/[a-z][a-z0-9'-]*/g) || []);
}

function repeated(text, previous) {
    const ungloss = value => Object.values(termMeanings).reduce((result, meaning) => result.replaceAll(` (${meaning})`, ''), value);
    text = ungloss(text);
    const words = signature(text);
    // Keep distinct moves, pieces, colors and negated claims.
    const anchors = value => [
        ...(value.toLowerCase().match(/\b(?:[a-h][1-8]|white|black|not|never|no|cannot|[a-z]+n't|(?:pawn|knight|bishop|rook|queen|king)s?)\b/g) || []),
        ...moveMentions(value).map(({ input }) => JSON.stringify(input).toLowerCase())
    ].sort().join('|');
    const currentAnchors = anchors(text);
    return previous.some(sentence => {
        sentence = ungloss(sentence);
        const other = signature(sentence);
        if(currentAnchors !== anchors(sentence)) return false;
        const shared = [...words].filter(word => other.has(word)).length;
        return shared / Math.max(1, words.size, other.size) >= 0.8;
    });
}

export function explanationExcerpt(text, final = false, options = {}) {
    return new CommentaryStream(options).update(text, final).text;
}

export class CommentaryStream {
    constructor({ fen, previous = [], mode = 'brief', hideMove = false, you = false } = {}) {
        const board = new Chess();
        if(!fen || !board.load(fen)) throw new Error('Pena commentary needs a valid position for factuality checks.');
        this.fen = fen;
        this.previous = previous;
        this.mode = mode;
        this.hideMove = hideMove;
        this.you = you;
        this.expanded = mode === 'original' || mode === 'dynamic' && board.in_check();
        this.seen = new Set();
        this.selected = [];
        this.text = '';
        this.assessments = [];
        this.words = 0;
        this.lines = 0;
        this.context = [];
        this.mainFound = false;
        this.unsafeLine = false;
        this.closed = false;
        this.explainedTerms = new Set();
    }

    update(text, final = false, { truncated = false, checks = null } = {}) {
        let pending = false;
        for(const sentence of sourceSentences(text, final && !truncated)) {
            if(this.seen.has(sentence.index)) continue;
            if(checks && !checks.has(sentence.index)) { pending = true; break; }
            this.seen.add(sentence.index);
            const assessment = checks?.get(sentence.index) || checkSentence(sentence.text, this.fen, {
                context: explanationBody(text).slice(0, sentence.index)
            });
            const record = { ...sentence, ...assessment, source: sentence.text };
            if(this.you && record.text) record.text = speakToYou(record.text);
            this.assessments.push(record);
            if(record.rejectedLine) {
                this.unsafeLine = true;
                record.omitted = record.reason;
                continue;
            }
            if(this.unsafeLine && !assessment.alternative && !assessment.main) {
                record.omitted = 'This continuation follows the rejected pick.';
                continue;
            }
            if(assessment.alternative || assessment.main) this.unsafeLine = false;
            // Dynamic talks longer only when the move itself is sharp, not whenever a later line has a capture.
            if(this.mode === 'dynamic' && assessment.main && !this.mainFound
                && (assessment.tactical || sharp.test(assessment.text))) this.expanded = true;
            if((this.mode !== 'original' || checks) && !this.mainFound && !assessment.main) {
                this.context.push(record);
                continue;
            }
            if(this.mode !== 'original' && this.mainFound && assessment.alternative) {
                record.omitted = 'Prioritizing the main explanation over other candidates.';
                this.closed = true;
                continue;
            }
            if(assessment.main) {
                if(this.mainFound && this.mode !== 'original') {
                    if(repeated(assessment.text, this.selected)) {
                        record.omitted = 'Repeated explanation.';
                        continue;
                    }
                    record.omitted = 'An alternative recommendation would distract from the main explanation.';
                    this.closed = true;
                    continue;
                }
                if(final && this.mainFound)
                    for(const record of this.context) record.omitted ??= 'Prioritizing the recommendation and its explanation.';
                if(record.replacement || record.repairedTactic)
                    for(const introductory of this.context)
                        introductory.omitted = 'The introduction belongs to the rejected recommendation.';
                if(checks && this.mode === 'original' && !this.mainFound) {
                    for(const introductory of this.context.splice(0)) {
                        if(record.replacement || record.repairedTactic) introductory.omitted = 'The introduction belongs to the rejected recommendation.';
                        else this.append(introductory);
                    }
                }
                this.mainFound = true;
            }
            this.append(record);
            // The rest of the model's line follows its unsafe pick, so it would only teach the mistake.
            if(record.blunder || record.replacement || record.repairedTactic) {
                this.unsafeLine = true;
                if(this.mode !== 'original') this.closed = true;
            }
        }
        if(final && !pending && !this.mainFound) {
            const lead = checks ? checks.get(-1) : this.bestMoveLead(text);
            if(lead) {
                if(!this.assessments.includes(lead)) this.assessments.unshift(lead);
                if(lead.text) {
                    this.mainFound = true;
                    this.append(lead);
                }
            }
            for(const record of this.context.splice(0)) {
                if(checks && (!this.mainFound || lead?.replacement))
                    record.omitted = 'No checked recommendation supports this introduction.';
                else this.append(record);
            }
        }
        if(final && !pending && this.mainFound)
            for(const record of this.context.splice(0))
                record.omitted ??= 'Prioritizing the recommendation and its explanation.';
        const shown = this.assessments.filter(record => record.shown).length;
        const withheld = this.assessments.filter(record => record.rejectedLine || record.status === 'contradicted').length;
        const omitted = reason => this.assessments.some(record => record.omitted === reason);
        const emptyReason = this.text ? null : pending ? 'checking' : !final ? 'generating'
            : omitted('Repeated explanation.') ? 'repeated'
                : omitted('Concise coaching budget.') ? 'budget'
                    : withheld ? 'withheld' : truncated ? 'incomplete' : 'noRecommendation';
        this.presentation = { shown, withheld, skipped: this.assessments.length - shown,
            moveChecked: this.assessments.filter(record => record.moveChecks?.length).length,
            emptyReason, pending, truncated };
        return { text: this.text, assessments: this.assessments, expanded: this.expanded,
            presentation: this.presentation };
    }

    // The prose sometimes explains the position without ever naming a move. The model still
    // gives its pick in BEST_MOVE, so lead with that and let the prose explain the position.
    bestMoveLead(text) {
        const match = text.match(/\nBEST_MOVE:\s*(white|black) (pawn|knight|bishop|rook|queen|king) ([a-h][1-8])(?:-([a-h][1-8])| takes (?:white|black) \w+ ([a-h][1-8]))([qrbn])?/i);
        if(!match) return null;
        const uci = match[3] + (match[4] || match[5]) + (match[6] || '');
        const board = new Chess(this.fen);
        const move = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
        if(!move) return null;
        const blunder = pickProblem(this.fen, move.from + move.to + (move.promotion || ''));
        if(blunder) return { text: problemText(blunder), source: 'BEST_MOVE', status: 'unchecked', main: true,
            mainMove: blunder.alternative.uci, blunder, hasMoves: true, tactical: true, index: -1 };
        const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
        const reason = board.in_checkmate() ? 'delivering checkmate'
            : move.captured ? `capturing the ${names[move.captured]}${board.in_check() ? ' with check' : ''}`
                : move.promotion ? `promoting to a ${names[move.promotion]}`
                    : move.flags.includes('k') || move.flags.includes('q') ? 'castling'
                        : board.in_check() ? 'giving check' : '';
        if(this.mode === 'dynamic' && (move.captured || board.in_check())) this.expanded = true;
        return { text: reason ? `${move.san}, ${reason}.` : `Pena's pick is ${move.san}.`, source: 'BEST_MOVE',
            status: 'unchecked', main: true, mainMove: move.from + move.to + (move.promotion || ''),
            hasMoves: true, tactical: Boolean(move.captured || board.in_check()), index: -1 };
    }

    append(record) {
        if(!record.text) return;
        if(record.unresolvedContinuation) {
            record.omitted = 'A preceding move in this continuation could not be replayed.';
            return;
        }
        const preceding = this.assessments[this.assessments.indexOf(record) - 1];
        if(record.contextual && preceding && !preceding.shown
            && (preceding.hasMoves || preceding.omitted === 'A preceding move was not shown.')
            && preceding.omitted !== 'Repeated explanation.') {
            record.omitted = 'A preceding move was not shown.';
            return;
        }
        if(/^(?:This|That|It|These|Those|Such|As a result|Therefore|Consequently)\b/.test(record.source)
            && preceding && !preceding.shown && preceding.omitted !== 'Repeated explanation.') {
            record.omitted = 'Its preceding explanation was not shown.';
            return;
        }
        if(repeated(record.text, [...this.previous, ...this.selected])) {
            record.omitted = 'Repeated explanation.';
            return;
        }
        if(this.mode !== 'original' && /^(?:The|An|Another) alternative\b|^Alternatively\b/i.test(record.text)) {
            record.omitted = 'Side lines would distract from the main idea.';
            return;
        }
        if(this.hideMove && record.hasMoves) {
            if(!record.main) {
                record.omitted = 'Moves stay hidden until you ask.';
                return;
            }
            record.text = moveHint(record.blunder || record.replacement || record.repairedTactic ? sourceSentences(record.text)[0].text : record.text);
            // With no reason to share, Pena simply stays quiet about the move.
            if(!record.text) {
                record.omitted = 'Moves stay hidden until you ask.';
                return;
            }
        }
        const briefReason = this.mainFound && this.selected[0]?.split(/\s+/).length <= 10
            && !/\b(?:develop|prepar|protect|prevent|support|creat|allow|captur|checkmat|attack|control|threaten|open|challeng)\w*/i.test(this.selected[0])
            && !record.hasMoves && /^(?:This|It|That|The (?:pawn|knight|bishop|rook|queen|king))\s+(?:(?:also|directly|simultaneously|immediately)\s+)?(?:develops|opens|prepares|protects|prevents|challenges|supports|creates|allows|keeps|attacks|threatens|controls)\b/i.test(record.text);
        const budget = this.mode === 'original' ? { words: Infinity, points: Infinity, lines: Infinity }
            : this.mode === 'brief' ? { words: 45, points: briefReason ? 2 : 1, lines: 0 }
                : this.expanded ? { words: 130, points: 5, lines: 3 } : { words: 75, points: 3, lines: 2 };
        // A beginner can follow a reply or two in their head. Longer chains of bare moves lose them.
        const line = !record.main && moveLine.test(record.text);
        if(line && this.mode !== 'original' && /^(?:One reply is|Continue with|Then comes|Then)\s+\S+\.$/.test(record.text.trim())) {
            record.omitted = 'A move with no reason does not teach anything.';
            this.closed = true;
            return;
        }
        if(line && this.lines >= budget.lines) {
            record.omitted = 'Long move sequences are hard to follow.';
            this.closed = true;
            return;
        }
        record.text = dropAnnouncedLabels(record.text).text;
        if(this.mode === 'brief' && record.text.split(/\s+/).length > budget.words) {
            const boundaries = [...record.text.matchAll(/,\s+(?:where|which|while|and|with|after|creating|preparing|supporting|opening|keeping|allowing)\b/gi)];
            const shorter = boundaries.map(match => record.text.slice(0, match.index))
                .findLast(value => value.includes(',') && value.split(/\s+/).length <= budget.words);
            if(shorter) record.text = shorter.replace(/[,:;]$/, '') + '.';
        }
        const explained = beginnerTerms(record.text, this.explainedTerms);
        // Keep the reason within the mode's budget. Definitions never replace it.
        if(this.words + explained.text.split(/\s+/).length <= budget.words) record.text = explained.text;
        const words = record.text.split(/\s+/).length;
        if(this.closed || this.words + words > budget.words || this.selected.length >= budget.points) {
            record.omitted = 'Concise coaching budget.';
            if(record.main || this.selected.length) this.closed = true;
            return;
        }
        this.text += (this.selected.length ? record.main ? '\n\n' : ' ' : '') + record.text;
        this.selected.push(record.text);
        if(record.text === explained.text) explained.terms.forEach(term => this.explainedTerms.add(term));
        this.words += words;
        if(line) this.lines++;
        record.shown = true;
    }
}

const sharp = /\b(?:mate|checkmat\w*|fork\w*|pin\w*|skewer\w*|hang\w*|trap\w*|threat\w*|sacrific\w*|discovered)\b/i;
const moveLine = /^(?:One reply is|Continue with|Then\b|After\b|The opponent\b|You (?:then |can then )?(?:continue|play|follow)|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?,|O-O)/;

const termMeanings = {
    'outpost': 'a useful square enemy pawns cannot easily chase a piece from',
    'central tension': 'central pawns that could capture each other',
    'pawn break': 'a pawn push to challenge enemy pawns and open lines',
    'bishop pair': 'two bishops working on opposite square colors',
    'passed pawn': 'a pawn with no enemy pawn ahead on its file or either neighboring file',
    'isolated pawn': 'a pawn with no friendly pawn on either neighboring file',
    'doubled pawns': 'two friendly pawns on one file',
    'pawn chain': 'pawns protecting each other diagonally',
    'fianchetto': 'developing a bishop to b2, g2, b7 or g7 behind a pawn',
    'with tempo': 'while making a threat the opponent needs to address',
    'battery': 'two sliding pieces lined up to work together'
};

function beginnerTerms(text, seen) {
    const terms = [];
    for(const [term, meaning] of Object.entries(termMeanings)) {
        if(seen.has(term)) continue;
        const pattern = new RegExp(`\\b${term}\\b(?!\\s*\\()`, 'i');
        if(!pattern.test(text)) continue;
        text = text.replace(pattern, match => `${match} (${meaning})`);
        terms.push(term);
    }
    return { text, terms };
}

// Live commentary talks to the person at the board, so "the player" becomes "you".
export function speakToYou(text) {
    const plain = verb => /(?:sh|ch|x|ss|z)es$/.test(verb) ? verb.slice(0, -2) : verb.endsWith('ies') ? `${verb.slice(0, -3)}y` : verb.slice(0, -1);
    return text
        .replace(/\bthe player's\b/g, 'your').replace(/\bThe player's\b/g, 'Your')
        .replace(/\b([Tt])he player to move\b/g, (_, t) => `${t === 'T' ? 'Y' : 'y'}ou are to move`)
        .replace(/\b([Ff]or|[Tt]o|[Aa]gainst|[Bb]y|[Ff]rom|[Ww]ith) the player\b/g, '$1 you')
        .replace(/\bthe ((?:(?:only|sole|most|least|active|passive|remaining) )+)the player (pieces?|pawns?|king|queen|rooks?|bishops?|knights?)\b/gi, 'your $1$2')
        .replace(/\bthe player (pieces?|pawns?|king|queen|rooks?|bishops?|knights?)\b/gi, 'your $1')
        .replace(/\b([Tt])he player ((?:then|also|now|still|simply|immediately|first) )?(is|has|was)\b/g,
            (_, t, adverb = '', verb) => `${t === 'T' ? 'Y' : 'y'}ou ${adverb}${{ is: 'are', has: 'have', was: 'were' }[verb]}`)
        .replace(/\b([Tt])he player ((?:then|also|now|still|simply|immediately|first) )?([a-z]+s)\b/g,
            (match, t, adverb = '', verb) => /(?:ss|us|is)$/.test(verb) ? match : `${t === 'T' ? 'Y' : 'y'}ou ${adverb}${plain(verb)}`)
        .replace(/\bthe player\b/g, 'you').replace(/\bThe player\b/g, 'You');
}

// Without naming the move, the reason behind it still points the way.
export function moveHint(text) {
    const reason = text.match(/^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?|castle (?:king|queen)side)[!?]*,?\s+(.+)$/i)?.[1];
    if(reason && /^[a-z]+ing\b/.test(reason)) return `Look for a move ${reason.replace(/^([a-z]+)ing\b/, (_, stem) => `that ${verb(stem)}`)}`;
    return '';
}

function verb(stem) {
    const special = { mak: 'makes', tak: 'takes', giv: 'gives', creat: 'creates', prepar: 'prepares', secur: 'secures',
        improv: 'improves', remov: 'removes', resolv: 'resolves', centraliz: 'centralizes', reduc: 'reduces', challeng: 'challenges',
        activat: 'activates', eliminat: 'eliminates', relocat: 'relocates', liquidat: 'liquidates', exchang: 'exchanges',
        increas: 'increases', us: 'uses', complet: 'completes', provok: 'provokes', forc: 'forces', escap: 'escapes',
        sav: 'saves', leav: 'leaves', mov: 'moves', retreat: 'retreats', stabiliz: 'stabilizes', neutraliz: 'neutralizes',
        recaptur: 'recaptures', captur: 'captures', clos: 'closes', overload: 'overloads', reinforc: 'reinforces', rerout: 'reroutes' };
    if(special[stem]) return special[stem];
    if(/(?:s|sh|ch|x|z)$/.test(stem)) return `${stem}es`;
    if(/([b-df-hj-np-tv-z])\1$/.test(stem) && !/(?:ll|ss|ff|zz)$/.test(stem)) return `${stem.slice(0, -1)}s`;
    return `${stem}s`;
}

export function rememberCommentary(memory, text, fen) {
    memory.push(...sourceSentences(text).map(sentence => ({ text: sentence.text, fen })));
    memory.splice(0, Math.max(0, memory.length - 24));
}
