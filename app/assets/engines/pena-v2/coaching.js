import { Chess, SQUARES } from '../libraries/chessjs/chess.js';
import { Facts } from './concepts.js';
import { checkSentence } from './grounding.js';
import { explanationBody, sourceSentences } from './commentary.js';
import { variationFrames } from './teacher.js';

const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const other = color => color === 'w' ? 'b' : 'w';
const uciOf = move => move.from + move.to + (move.promotion || '');
const material = (board, color) => board.board().flat().filter(Boolean)
    .reduce((sum, piece) => sum + values[piece.type] * (piece.color === color ? 1 : -1), 0);

export function checkedLine(fen, pv, limit = 6) {
    const board = new Chess(fen);
    return pv.slice(0, limit).map(uci => {
        const beforeFen = board.fen();
        const move = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        if(!move) throw new Error('The coaching check returned an illegal continuation.');
        return { ...move, uci, beforeFen, fen: board.fen(), mate: board.in_checkmate(), check: board.in_check() };
    });
}

// These describe observable mechanisms, not an engine score translated into a made-up reason.
export function moveMechanism(frame, { rationaleOnly = false } = {}) {
    const before = new Facts(frame.beforeFen), after = new Facts(frame.fen);
    const piece = names[frame.promotion || frame.piece];
    if(frame.mate) return 'giving checkmate because the king has no legal escape';
    if(frame.promotion) return `reaching the back rank and turning the pawn into a ${piece}`;
    if(frame.flags.includes('k') || frame.flags.includes('q'))
        return `moving the king away from the center and bringing the rook toward the center`;
    const targets = after.find(null, other(frame.color)).filter(target => target.type !== 'k'
        && after.attackers(target.square, frame.color).includes(frame.to)
        && !before.attackers(target.square, frame.color).includes(frame.from));
    if(frame.check && targets.length)
        return `giving check while the ${piece} also attacks the ${names[targets[0].type]} on ${targets[0].square}`;
    if(frame.captured && !rationaleOnly) return `removing the ${names[frame.captured]} on ${frame.flags.includes('e') ? frame.to[0] + frame.from[1] : frame.to}${frame.check ? ' with check' : ''}`;
    if(frame.check) return 'giving check, so the opponent must deal with the attack on the king';
    if(frame.captured) {
        const square = frame.flags.includes('e') ? frame.to[0] + frame.from[1] : frame.to;
        const relieved = before.find(null, frame.color).find(target => target.type !== 'k' && target.square !== frame.from
            && before.attackers(target.square, other(frame.color)).includes(square)
            && !after.attackers(target.square, other(frame.color)).length);
        if(relieved) return `removing the ${names[frame.captured]} that attacked the ${names[relieved.type]} on ${relieved.square}`;
    }
    if(targets.length) return `attacking the ${names[targets[0].type]} on ${targets[0].square} with the ${piece}`;
    if(frame.piece === 'p' && after.passed({ square: frame.to, color: frame.color }))
        return `advancing a passed pawn toward ${frame.to[0]}${frame.color === 'w' ? '8' : '1'}, where it can become a queen`;
    const attackers = before.attackers(frame.from, other(frame.color));
    if(attackers.length && !after.attackers(frame.to, other(frame.color)).length)
        return `moving the ${piece} out of the ${names[before.board.get(attackers[0]).type]}'s attack from ${attackers[0]}`;
    if(frame.piece === 'r' && frame.from[0] !== frame.to[0] && !after.find(['p']).some(pawn => pawn.square[0] === frame.to[0]))
        return `putting the rook on the open ${frame.to[0]}-file, with no pawns blocking that file`;
    const center = ['d4', 'e4', 'd5', 'e5'].filter(square => after.attackers(square, frame.color).includes(frame.to)
        && !before.attackers(square, frame.color).includes(frame.from));
    if(center.length) return `bringing the ${piece} into reach of ${center.join(' and ')}, important squares in the center`;
    const opened = before.find(['b', 'r', 'q'], frame.color).find(slider => slider.square !== frame.from
        && (!rationaleOnly || !(frame.piece === 'p' && slider.type === 'r' && slider.square[0] === frame.from[0]))
        && SQUARES.some(square => (!rationaleOnly || square !== frame.from && square !== frame.to)
            && after.attackers(square, frame.color).includes(slider.square)
            && !before.attackers(square, frame.color).includes(slider.square)));
    if(opened) return `opening a line for the ${names[opened.type]} on ${opened.square} to reach more squares`;
    const defended = after.find(null, frame.color).find(target => target.type !== 'k' && target.square !== frame.to
        && after.attackers(target.square, frame.color).includes(frame.to)
        && !before.attackers(target.square, frame.color).includes(frame.from));
    if(defended) return `adding protection to the ${names[defended.type]} on ${defended.square}`;
    return rationaleOnly ? '' : `moving the ${piece} from ${frame.from} to ${frame.to}`;
}

export function moveRationale(fen, uci) {
    return moveMechanism(checkedLine(fen, [uci])[0], { rationaleOnly: true });
}

function lineText(line) {
    return line.map(frame => {
        const fields = frame.beforeFen.split(' ');
        return `${fields[5]}${fields[1] === 'w' ? '.' : '...'} ${frame.san}`;
    }).join(' ');
}

function consequence(line, color) {
    if(!line.length) return '';
    const last = line.at(-1);
    if(last.mate) return `${last.color === color ? 'giving' : 'allowing'} checkmate`;
    const change = material(new Chess(last.fen), color) - material(new Chess(line[0].beforeFen), color);
    if(change <= -1) return `leaving ${color === 'w' ? 'White' : 'Black'} ${Math.abs(change) === 1 ? 'a pawn' : `${Math.abs(change)} points of material`} down compared with the start of this line`;
    return '';
}

function ownMoveFeedback(intent, review) {
    const line = checkedLine(intent.beforeFen, review.played.pv);
    if(review.uncertain) return `The move check is inconclusive about ${intent.move.san}.`;
    if(review.rejected) {
        const warning = consequence(line, intent.mover);
        if(warning) return `After ${intent.move.san}, ${lineText(line)} is one checked line ${warning}.`;
        const best = checkedLine(intent.beforeFen, review.best.pv)[0];
        return `The search preferred ${best.san} to ${intent.move.san}, but that alone does not explain why.`;
    }
    const reason = moveRationale(intent.beforeFen, intent.uci);
    return reason ? `${intent.move.san}, ${reason}.` : '';
}

function lineTeaching(line, mode) {
    const first = `${line[0].san}, ${moveMechanism(line[0])}.`;
    if(mode === 'brief') return first;
    const continuation = line.slice(1, mode === 'original' ? 5 : 2)
        .map(frame => `${frame.san}, ${moveMechanism(frame)}.`).join(' ');
    return [first, continuation && `One possible continuation is ${continuation}`].filter(Boolean).join(' ');
}

export function coachingReplacement(review, mode) {
    const safe = checkedLine(review.fen, review.best.pv);
    const risky = checkedLine(review.fen, review.played.pv);
    if(!safe.length || safe[0].uci !== review.best.move || risky[0]?.uci !== review.move)
        throw new Error('The coaching check did not return matching move lines.');
    const teaching = lineTeaching(safe, mode);
    if(mode === 'brief') return teaching;
    const warning = consequence(risky, safe[0].color);
    const contrast = warning
        ? `The alternative ${lineText(risky)} is one checked line ${warning}.`
        : `The alternative ${risky[0].san} scored worse in the search, but that alone does not explain why.`;
    // Keep the continuation beside its root move. "Alternative" explicitly restarts the board.
    return `${teaching} ${contrast}`;
}

export class CoachingChecks {
    constructor({ fen, evaluate, isCurrent = () => true, depth = 12 }) {
        if(!Number.isInteger(depth) || depth < 1 || depth > 20)
            throw new Error('Pena move-check depth must be a whole number from 1 to 20.');
        this.fen = new Chess(fen).fen();
        this.depth = depth;
        this.evaluate = evaluate;
        this.isCurrent = isCurrent;
        this.moves = new Map();
        this.sentences = new Map();
    }

    current() {
        if(!this.isCurrent()) throw new DOMException('Coaching check cancelled.', 'AbortError');
    }

    async move(fen, uci, root = fen === this.fen) {
        this.current();
        const depth = root ? this.depth : Math.max(1, this.depth - 2);
        const key = `${fen}|${uci}|${depth}`;
        if(!this.moves.has(key)) this.moves.set(key, Promise.resolve().then(async () => {
            const result = await this.evaluate(fen, uci, this.isCurrent, depth);
            this.current();
            const exact = score => score && (score.mate === null && Number.isFinite(score.cp)
                || score.cp === null && Number.isFinite(score.mate));
            if(!result || result.fen !== fen || result.move !== uci || result.depth < depth
                || !exact(result.best) || !exact(result.played)
                || !result.best.pv?.length || !result.played.pv?.length
                || result.best.pv[0] !== result.best.move || result.played.pv[0] !== uci)
                throw new Error('Move checking is unavailable. Pena has held back the unchecked advice.');
            checkedLine(fen, result.best.pv);
            checkedLine(fen, result.played.pv);
            const unsafe = comparison => comparison.played.mate !== null && comparison.played.mate <= 0
                    && (comparison.best.mate === null || comparison.best.mate > 0)
                || comparison.cpLoss >= 150 && comparison.played.cp !== null && comparison.played.cp < 300;
            const rejected = unsafe(result);
            const consistent = result.recent?.length >= 2 && result.recent.slice(-2).every(unsafe);
            return { ...result, rejected, uncertain: Boolean(rejected && result.provisional && !consistent) };
        }));
        return this.moves.get(key);
    }

    async sentence(record, context, mode) {
        if(!record.text || record.unresolvedContinuation) return record;
        const frames = variationFrames(context + record.source, this.fen)
            .filter(frame => frame.index >= context.length && !frame.recap);
        const checks = [];
        for(const frame of frames) {
            const review = await this.move(frame.beforeFen, uciOf(frame));
            checks.push(review);
            // A warning may deliberately demonstrate a bad move. It isn't a recommendation.
            const warning = !record.main && /\b(?:do not|don't|avoid|mistake|tempting|bad move|inferior|worst|weaker|less precise)\b/i.test(record.source);
            const hypothetical = !record.main && /\b(?:if|might|could|possible|for example)\b/i.test(record.source);
            if(!review.rejected || warning || hypothetical) continue;
            const reason = review.uncertain ? 'Recent searches disagree, so this advice is held back.'
                : 'The move loses substantial ground in the independent search.';
            if(record.main && frame.beforeFen === this.fen && !review.uncertain) {
                return { ...record, text: coachingReplacement(review, mode), mainMove: review.best.move,
                    replacement: review, reason, blunder: undefined, tactical: true, moveChecks: checks };
            }
            return { ...record, text: '', reason, status: review.uncertain ? 'unchecked' : 'contradicted',
                rejectedLine: true, moveChecks: checks };
        }
        const materialClaim = record.text.match(/\bwin(?:s|ning)? (?:the |a |an )?(?:white |black )?(queen|rook|bishop|knight|pawn|piece|material)\b/i);
        const mateClaim = record.text.match(/\bforced (?:mate(?: in (\d+))?|win)\b|\bmate in (\d+)\b/i);
        const conditional = /\b(?:if|could|might|would|threaten\w*|prepar\w*|plan\w*|cannot|can't|not|never)\b/i.test(record.text);
        if((materialClaim || mateClaim) && !conditional) {
            const claim = materialClaim || mateClaim;
            const claimContext = record.main ? '' : context;
            const frame = variationFrames(claimContext + record.text, this.fen)
                .findLast(frame => frame.end <= claimContext.length + claim.index);
            const review = frame && await this.move(frame.beforeFen, uciOf(frame));
            const line = review && checkedLine(frame.beforeFen, review.played.pv);
            const subject = record.text.slice(0, claim.index).match(/\b(white|black|the player|the opponent|you)\s+(?:then |simply |immediately )?$/i)?.[1]?.toLowerCase();
            const rootColor = new Chess(this.fen).turn();
            const winner = subject === 'white' || subject === 'black' ? subject[0]
                : subject === 'the opponent' ? other(rootColor) : subject ? rootColor : line?.[0].color;
            const sign = line?.[0].color === winner ? 1 : -1;
            let supported = false;
            if(mateClaim) {
                const distance = Number(mateClaim[1] || mateClaim[2]);
                supported = review?.played.mate * sign > 0 && (!distance || Math.abs(review.played.mate) === distance);
            }
            if(materialClaim && line?.length) {
                const kind = Object.keys(names).find(type => names[type] === materialClaim[1].toLowerCase());
                const gain = material(new Chess(line.at(-1).fen), winner) - material(new Chess(frame.beforeFen), winner);
                const materialSupported = gain >= (values[kind] || 1) && review.played.cp * sign >= (values[kind] || 1) * 100
                    && (!kind || line.some(move => move.color === winner && move.captured === kind));
                supported = materialSupported && (!mateClaim || supported);
            }
            if(!supported) {
                const reason = 'The searched line does not substantiate the claimed forced win or material gain.';
                if(record.main && record.mainMove) {
                    const rootReview = await this.move(this.fen, record.mainMove);
                    return { ...record, text: lineTeaching(checkedLine(this.fen, rootReview.played.pv), mode),
                        repairedTactic: true, reason, moveChecks: checks };
                }
                return { ...record, text: '', reason, status: 'unchecked', rejectedLine: true, moveChecks: checks };
            }
        }
        return { ...record, moveChecks: checks };
    }

    async update(stream, text, final, { truncated = false, onUpdate = () => {} } = {}) {
        const options = { truncated, checks: this.sentences };
        if(stream.ownMove && stream.ownMoveReview === undefined) {
            const intent = stream.ownMove;
            const review = await this.move(intent.beforeFen, intent.uci, true);
            this.current();
            stream.ownMoveReview = review;
            stream.ownMoveFeedback = ownMoveFeedback(intent, review);
        }
        for(const sentence of sourceSentences(text, final && !truncated)) {
            this.current();
            if(this.sentences.has(sentence.index)) continue;
            const context = explanationBody(text).slice(0, sentence.index);
            const record = { ...checkSentence(sentence.text, this.fen, { context }), source: sentence.text };
            const quarantined = stream.unsafeLine && !record.main && !record.alternative;
            this.sentences.set(sentence.index, quarantined ? record : await this.sentence(record, context, stream.mode));
            this.current();
            onUpdate(stream.update(text, false, options), { ...options, complete: false });
        }
        if(final && !stream.mainFound) {
            const lead = stream.bestMoveLead(text);
            if(lead) {
                const review = await this.move(this.fen, lead.mainMove);
                this.sentences.set(-1, review.rejected
                    ? review.uncertain ? { ...lead, text: '', rejectedLine: true, reason: 'The move check is inconclusive.' }
                        : { ...lead, text: coachingReplacement(review, stream.mode), mainMove: review.best.move,
                            replacement: review, blunder: undefined, moveChecks: [review] }
                    : { ...lead, text: lead.blunder ? lead.text : lineTeaching(checkedLine(this.fen, review.played.pv), stream.mode),
                        moveChecks: [review] });
            }
        }
        this.current();
        const result = stream.update(text, final, options);
        onUpdate(result, { ...options, complete: final });
        return result;
    }
}
