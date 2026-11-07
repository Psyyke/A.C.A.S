import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Chess } from '../../app/assets/engines/libraries/chessjs/chess.js';

const source = readFileSync(new URL('../../acas.user.js', import.meta.url), 'utf8');
const component = readFileSync(new URL('../../userscript-components/BoardChangeParser.js', import.meta.url), 'utf8');
function declaration(name) {
    const start = new RegExp(`^function ${name}\\(`, 'm').exec(source)?.index;
    if(start === undefined) throw new Error(`Missing userscript helper: ${name}`);
    const end = source.indexOf('\n}', start);
    if(end < start) throw new Error(`Unterminated userscript helper: ${name}`);
    return source.slice(start, end + 2);
}
const parser = new Function(`${component}
    ${['getBoardChangesObjTemplate', 'getFenPieceColor'].map(declaration).join('\n')}
    return new BoardChangeParser({ getBoardChangesObjTemplate, getFenPieceColor });`)();
export const parserHash = createHash('sha256').update(component).digest('hex');
const basic = fen => fen.split(' ')[0];
const token = (piece, color) => piece ? color === 'w' ? piece.toUpperCase() : piece : null;

export function emptyStats() {
    return {
        records: 0, games: 0, skippedVariants: 0, invalidGames: 0, plies: 0,
        single: { total: 0, exact: 0, falseRecovery: 0 },
        gaps: { total: 0, exact: 0, alternative: 0, illegal: 0, unresolved: 0, squareErrors: 0 },
        matches: { singleExact: 0, withMoves: 0, gapsExact: 0, withGaps: 0 },
        events: { captures: 0, promotions: 0, castling: 0, enPassant: 0 },
        takebacks: { games: 0, forwardChecks: 0, repetitionChecks: 0, falseTakebacks: 0, confirmed: 0,
            restorationErrors: 0, resumeChecks: 0, resumeErrors: 0, unverifiedChecks: 0 },
        stress: Object.fromEntries(['missed2', 'missed3', 'missed4'].map(key => [key, {
            total: 0, unchanged: 0, noRecovery: 0, legalShorterHistory: 0, illegalRecovery: 0,
            apparentSingleMove: 0
        }]).concat([
            ['duplicates', { total: 0, errors: 0 }],
            ['staleHints', { total: 0, exact: 0, alternative: 0, unresolved: 0, illegal: 0 }]
        ])),
        stressMs: 0, stressCalls: 0,
        parserMs: 0, parserCalls: 0, examples: []
    };
}

export function mergeStats(target, source, maxExamples = 100) {
    for(const key of ['records', 'games', 'skippedVariants', 'invalidGames', 'plies', 'parserMs', 'parserCalls',
        'stressMs', 'stressCalls'])
        target[key] += source[key];
    for(const group of ['single', 'gaps', 'matches', 'events', 'takebacks']) {
        for(const key of Object.keys(target[group])) target[group][key] += source[group][key];
    }
    for(const group of Object.keys(target.stress)) {
        for(const key of Object.keys(target.stress[group])) target.stress[group][key] += source.stress[group][key];
    }
    for(const example of source.examples) {
        if(target.examples.length < maxExamples) target.examples.push(example);
    }
    return target;
}

function expand(fen) {
    return basic(fen).replace(/[1-8]/g, count => '.'.repeat(Number(count))).replaceAll('/', '');
}
function squareErrors(expected, actual) {
    if(!actual) return 64;
    const a = expand(expected), b = expand(actual);
    let count = 0;
    for(let i = 0; i < 64; i++) if(a[i] !== b[i]) count++;
    return count;
}
function singleErrors(diff, move, before, after) {
    const castling = /[kq]/.test(move.flags);
    const expected = {
        from: move.from, to: move.to, movedPiece: token(move.piece, move.color),
        movedPieceColor: move.color,
        capturedPiece: token(move.captured, move.color === 'w' ? 'b' : 'w'),
        capturedSquare: move.captured ? move.flags.includes('e') ? move.to[0] + move.from[1] : move.to : null,
        isPromotion: Boolean(move.promotion), promotionPiece: token(move.promotion, move.color),
        isEnPassant: move.flags.includes('e'), pieceAmountChange: move.captured ? -1 : 0,
        changedSquaresAmount: castling ? 4 : move.flags.includes('e') ? 3 : 2,
        missedFen: null
    };
    const errors = Object.keys(expected).filter(key => diff[key] !== expected[key]);
    const oldBoard = expand(before), newBoard = expand(after);
    for(const [key, board, length] of [
        ['removed', oldBoard, castling || move.captured ? 2 : 1],
        ['added', newBoard, castling ? 2 : 1]
    ]) {
        const seen = new Set();
        if(diff[key].length !== length) errors.push(`${key}.length`);
        for(const entry of diff[key]) {
            const index = entry.row * 8 + entry.col;
            if(!Number.isInteger(entry.row) || !Number.isInteger(entry.col) ||
                entry.row < 0 || entry.row > 7 || entry.col < 0 || entry.col > 7 ||
                seen.has(index) || board[index] !== entry.piece || oldBoard[index] === newBoard[index] ||
                entry.square !== String.fromCharCode(97 + entry.col) + (8 - entry.row)) errors.push(key);
            seen.add(index);
        }
    }
    if(diff.movedPieces.length !== diff.removed.length ||
        diff.movedPieces.some((piece, index) => piece !== diff.removed[index].piece)) errors.push('movedPieces');
    return errors;
}
function legalRecovery(full, middle, after) {
    const chess = new Chess(full);
    for(const target of [middle, after]) {
        const diff = parser.getBoardChanges(basic(chess.fen()), target);
        if(!diff.from || !diff.to) return false;
        const move = chess.move({ from: diff.from, to: diff.to, promotion: diff.promotionPiece?.toLowerCase() });
        if(!move || basic(chess.fen()) !== target) return false;
    }
    return true;
}
function historyContext(full) {
    const fields = full.split(' ');
    return { castlingRights: fields[2], enPassantTarget: fields[3] };
}

function legalSingle(full, after, diff) {
    if(!diff.from || !diff.to) return false;
    const chess = new Chess(full);
    return Boolean(chess.move({ from: diff.from, to: diff.to,
        promotion: diff.promotionPiece?.toLowerCase() })) && basic(chess.fen()) === after;
}

export function analyzeGames(games, { context = true, hints = false, stress = false,
    conservative = false, takebacks = false, maxExamples = 100 } = {}) {
    const batch = emptyStats();
    for(const game of games) {
        batch.records++;
        if(game.headers.Variant && !['Standard', 'From Position'].includes(game.headers.Variant)) {
            batch.skippedVariants++;
            continue;
        }
        const stats = emptyStats();
        const example = (kind, data) => {
            if(stats.examples.length < maxExamples)
                stats.examples.push({ kind, record: game.record, file: game.file, ...data });
        };
        const chess = new Chess();
        const initial = game.headers.FEN;
        if(initial && !chess.load(initial)) {
            batch.invalidGames++;
            if(batch.examples.length < maxExamples) batch.examples.push({
                kind: 'invalid-fen', record: game.record, file: game.file, fen: initial
            });
            continue;
        }
        let previous = null, invalid = false, full = chess.fen();
        const observations = [];
        const absolutePly = fen => (Number(fen.split(' ')[5]) - 1) * 2 + (fen.split(' ')[1] === 'b' ? 1 : 0);
        const undoHistory = takebacks ? [{
            observedPly: absolutePly(full), turn: chess.turn(),
            fen: { full, basic: basic(full) }
        }] : null;
        const seenPlacements = takebacks ? new Set([basic(full)]) : null;
        for(let ply = 0; ply < game.moves.length; ply++) {
            const beforeFull = full, before = basic(beforeFull), turn = chess.turn();
            const move = chess.move(game.moves[ply]);
            if(!move) {
                batch.invalidGames++;
                if(batch.examples.length < maxExamples) batch.examples.push({
                    kind: 'invalid-san', record: game.record, file: game.file, ply: ply + 1,
                    san: game.moves[ply], fen: beforeFull
                });
                invalid = true;
                break;
            }
            full = chess.fen();
            const after = basic(full);
            if(takebacks) {
                undoHistory.unshift({ observedPly: absolutePly(full), turn: chess.turn(),
                    fen: { full, basic: after }, boardChanges: { from: move.from, to: move.to,
                        promotionPiece: token(move.promotion, move.color) } });
                for(const ply of [absolutePly(full), undefined]) {
                    const result = parser.reconcileHistory(undoHistory, { basicFen: after, turn: chess.turn(), ply });
                    stats.takebacks.forwardChecks++;
                    if(seenPlacements.has(after)) stats.takebacks.repetitionChecks++;
                    if(result.history !== undoHistory) stats.takebacks.falseTakebacks++;
                }
                seenPlacements.add(after);
            }
            if(stress) {
                const timedParse = (from, to, previousTurn, metadata) => {
                    const started = performance.now();
                    const result = parser.getBoardChanges(from, to, previousTurn, {
                        ...metadata, conservative, ...(conservative ? { currentTurn: chess.turn() } : {})
                    });
                    stats.stressMs += performance.now() - started;
                    stats.stressCalls++;
                    return result;
                };
                const duplicate = timedParse(after, after, chess.turn(), context ? historyContext(full) : {});
                stats.stress.duplicates.total++;
                if(duplicate.missedFen || duplicate.from || duplicate.to || duplicate.changedSquaresAmount ||
                    duplicate.pieceAmountChange || duplicate.removed.length || duplicate.added.length) {
                    stats.stress.duplicates.errors++;
                    example('duplicate', { ply: ply + 1, after, actual: duplicate });
                }
                for(const missed of [2, 3, 4]) {
                    if(observations.length < missed) continue;
                    const origin = observations[observations.length - missed];
                    const metadata = context ? historyContext(origin.full) : {};
                    if(hints) metadata.lastMoveSquares = [move.from, move.to];
                    const diff = timedParse(origin.before, after, origin.turn, metadata);
                    const group = stats.stress[`missed${missed}`];
                    group.total++;
                    if(origin.before === after) group.unchanged++;
                    if(!diff.missedFen) {
                        group.noRecovery++;
                        if(legalSingle(origin.full, after, diff)) group.apparentSingleMove++;
                    } else {
                        // A legal two-ply explanation is NOT recovery of a longer
                        // PGN history, even if it happens to reach the final board.
                        const kind = legalRecovery(origin.full, diff.missedFen, after)
                            ? 'legalShorterHistory' : 'illegalRecovery';
                        group[kind]++;
                        example(`missed${missed}-${kind}`, { ply: ply + 1, before: origin.full,
                            after, inferred: diff.missedFen, moves: game.moves.slice(ply - missed, ply + 1) });
                    }
                }
                if(previous) {
                    const metadata = context ? historyContext(previous.full) : {};
                    // The preceding observation's highlights, not an oracle of
                    // the latest move. At the initial position there are none.
                    const stale = observations.at(-2)?.move;
                    metadata.lastMoveSquares = stale ? [stale.from, stale.to] : [];
                    const diff = timedParse(previous.before, after, previous.turn, metadata);
                    const group = stats.stress.staleHints;
                    group.total++;
                    const kind = diff.missedFen === before ? 'exact' : !diff.missedFen ? 'unresolved'
                        : legalRecovery(previous.full, diff.missedFen, after) ? 'alternative' : 'illegal';
                    group[kind]++;
                    if(kind === 'illegal') example('stale-hint-illegal', {
                        ply: ply + 1, before: previous.full, after, inferred: diff.missedFen, context: metadata
                    });
                }
            }
            const currentContext = context ? historyContext(beforeFull) : {};
            if(conservative) Object.assign(currentContext, { conservative, currentTurn: chess.turn() });
            let start = performance.now();
            const single = parser.getBoardChanges(before, after, turn, currentContext);
            stats.parserMs += performance.now() - start; stats.parserCalls++;
            const errors = singleErrors(single, move, before, after);
            stats.single.total++;
            if(!errors.length) stats.single.exact++;
            else example('single', { ply: ply + 1, before, after, san: game.moves[ply], errors, actual: single });
            if(single.missedFen) stats.single.falseRecovery++;
            if(previous) {
                const gapContext = context ? historyContext(previous.full) : {};
                if(conservative) Object.assign(gapContext, { conservative, currentTurn: chess.turn() });
                if(hints) gapContext.lastMoveSquares = [move.from, move.to];
                start = performance.now();
                const gap = parser.getBoardChanges(previous.before, after, previous.turn, gapContext);
                stats.parserMs += performance.now() - start; stats.parserCalls++;
                stats.gaps.total++;
                const inferred = gap.missedFen;
                stats.gaps.squareErrors += squareErrors(before, inferred);
                if(inferred === before) stats.gaps.exact++;
                else {
                    const kind = !inferred ? 'unresolved'
                        : legalRecovery(previous.full, inferred, after) ? 'alternative' : 'illegal';
                    stats.gaps[kind]++;
                    example(kind, { ply: ply + 1, before: previous.full, expected: before, after, inferred,
                        moves: [previous.san, game.moves[ply]], context: gapContext });
                }
            }
            stats.plies++;
            if(move.captured) stats.events.captures++;
            if(move.promotion) stats.events.promotions++;
            if(/[kq]/.test(move.flags)) stats.events.castling++;
            if(move.flags.includes('e')) stats.events.enPassant++;
            previous = { full: beforeFull, before, turn, san: game.moves[ply] };
            if(stress) {
                observations.push({ ...previous, move });
                if(observations.length > 4) observations.shift();
            }
        }
        if(!invalid) {
            if(takebacks) {
                stats.takebacks.games++;
                for(const depth of new Set([1, 2, 5, undoHistory.length - 1])) {
                    if(depth < 1 || depth >= undoHistory.length) continue;
                    const target = undoHistory[depth];
                    const observation = { basicFen: target.fen.basic, turn: target.turn, ply: target.observedPly };
                    const result = parser.reconcileHistory(undoHistory, observation);
                    stats.takebacks.confirmed++;
                    if(result.status !== 'takeback' || result.history.length !== undoHistory.length - depth ||
                        result.history.some((state, index) => state.fen.full !== undoHistory[index + depth].fen.full) ||
                        result.history[0].opponentMoveTime !== null || result.history[0].turnStartedByMove !== false)
                        stats.takebacks.restorationErrors++;
                    const unverified = parser.reconcileHistory(undoHistory, { ...observation, ply: undefined });
                    stats.takebacks.unverifiedChecks++;
                    if(unverified.history !== undoHistory) stats.takebacks.falseTakebacks++;
                    const replay = new Chess(result.history[0].fen.full);
                    const san = game.moves[game.moves.length - depth];
                    stats.takebacks.resumeChecks++;
                    if(!replay.move(san) || replay.fen() !== undoHistory[depth - 1].fen.full)
                        stats.takebacks.resumeErrors++;
                }
            }
            stats.games++;
            if(stats.single.total) {
                stats.matches.withMoves++;
                if(stats.single.exact === stats.single.total) stats.matches.singleExact++;
            }
            if(stats.gaps.total) {
                stats.matches.withGaps++;
                if(stats.gaps.exact === stats.gaps.total) stats.matches.gapsExact++;
            }
            mergeStats(batch, stats, maxExamples);
        }
    }
    return batch;
}

export function metrics(stats) {
    const gaps = stats.gaps.total;
    return {
        singleExactRate: stats.single.total ? stats.single.exact / stats.single.total : null,
        gapExactRate: gaps ? stats.gaps.exact / gaps : null,
        gapRecoveryRate: gaps ? (gaps - stats.gaps.unresolved) / gaps : null,
        // Binary target: exact=0 error; wrong or unresolved=1 error.
        gapRmse: gaps ? Math.sqrt((gaps - stats.gaps.exact) / gaps) : null,
        // One-hot board cell mismatch; unresolved snapshots count as 64 errors.
        gapBoardRmse: gaps ? Math.sqrt(stats.gaps.squareErrors / (gaps * 64)) : null,
        parserMicrosecondsPerCall: stats.parserCalls ? stats.parserMs * 1000 / stats.parserCalls : null
    };
}
