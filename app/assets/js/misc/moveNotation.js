import { Chess } from '../../engines/libraries/chessjs/chess.js';
import { variantConfig, parseVariantFen, parseVariantMove, getAmazonsShot } from './variantPosition.js';
import { englishVariantSpeech, getVariantSpeech, speechPieceName, shogiSpeechVariants } from './variantSpeech.js';

const notationCache = new Map();
let fairyNotationPromise = null;
let fairyNotationIdleTimeout = null;
let pendingNotationRequests = 0;
const englishSpeech = {
    lang: 'en-US',
    pieces: { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn',
        L: 'Lance', S: 'Silver', G: 'Gold' },
    variantSpeech: englishVariantSpeech,
    move: '{piece} to {square}',
    capture: '{piece} takes {square}',
    origin: '{piece} from {square}',
    hintPiece: 'Move the piece on {square}',
    hintDestination: 'Move to {square}',
    promotion: 'promotes to {piece}',
    castleKingside: 'Castle kingside',
    castleQueenside: 'Castle queenside',
    check: 'check',
    checkmate: 'checkmate',
    opponent: 'Opponent: {move}',
    advantage: ['You are losing badly', 'You are losing', 'You are slightly behind', 'The position is equal',
        'You are slightly ahead', 'You are winning', 'You are winning decisively']
};

export function getMoveSpeechConfig(translateAudio = false) {
    const translated = translateAudio && typeof TRANS_OBJ !== 'undefined' ? TRANS_OBJ?.moveSpeech : null;
    if(!translated) return englishSpeech;
    return { ...englishSpeech, ...translated, pieces: { ...englishSpeech.pieces, ...translated.pieces },
        variantSpeech: getVariantSpeech(TRANS_OBJ?.variantSpeech) };
}

function speechText(template, values) {
    return template.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}

function notationKey(move) {
    const [from, to] = move?.player || [];
    if(move?.hintDetail && move.hintDetail !== 'full') return '';
    // A cached UCI move must never reveal a deliberately hidden destination.
    if(!move?.fen || !/^(?:[a-z]\d+|[a-zA-Z]@)$/.test(from) || !/^[a-z]\d+$/.test(to)) return '';
    const context = variantConfig(move);
    const uci = move.playerUci || `${from}${to}${String(move.playerPromotion || '').toLowerCase()}`;
    if(!parseVariantMove(uci)) return '';
    return `${context.variant}|${context.useChess960}|${move.fen}|${uci}`;
}

export function cacheMoveSan(move, san) {
    const key = notationKey(move);
    if(!key || !san) return;
    notationCache.set(key, san);
    if(notationCache.size > 128) notationCache.delete(notationCache.keys().next().value);
}

export function getMoveSan(move) {
    const key = notationKey(move);
    if(!key) return '';
    if(notationCache.has(key)) return notationCache.get(key);
    const [from, to] = move.player;
    const context = variantConfig(move);
    // Other variants need Fairy's legality and check detection, not chess.js.
    if(context.variant !== 'chess' || context.useChess960
        || !/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) return '';

    let san = '';
    try {
        const board = new Chess();
        if(board.load(move.fen)) san = board.move({ from, to,
            promotion: String(move.playerPromotion || '').toLowerCase() })?.san || '';
    } catch(error) {
        // Invalid positions must not interrupt visual or spoken suggestions.
    }

    cacheMoveSan(move, san);
    return san;
}

// Notation and PiP animation share the same legal, filtered PV prefix.
export function formatPvNotation(pv, config = {}, allowMove) {
    const moves = (Array.isArray(pv) ? pv : String(pv || '').trim().split(/\s+/)).slice(0, 3);
    const context = variantConfig(config);
    // Never use standard-chess rules for variants. Keep their engine notation,
    // or leave just the existing root hint when filtering requires later FENs.
    if(context.variant !== 'chess' || context.useChess960)
        return allowMove ? '' : moves.filter(uci => parseVariantMove(uci)).join(' ➜ ');

    return replayPv(moves, config, allowMove).map(position => position.san).join(' ➜ ');
}

// Replay without starting an engine or changing the live board.
export function replayPv(pv, config = {}, allowMove) {
    const context = variantConfig(config);
    if(context.variant !== 'chess' || context.useChess960) return [];

    const moves = (Array.isArray(pv) ? pv : String(pv || '').trim().split(/\s+/)).slice(0, 3);
    const line = [];
    try {
        const board = new Chess();
        if(!board.load(config.fen)) return [];
        for(const uci of moves) {
            const move = parseVariantMove(uci);
            if(!move || move.drop || uci.includes(',')) break;
            const notationMove = { ...config, fen: board.fen(), player: [move.from, move.to],
                playerUci: uci, playerPromotion: move.promotion };
            if(allowMove && !allowMove(notationMove)) break;
            const played = board.move({ from: move.from, to: move.to, promotion: move.promotion.toLowerCase() });
            if(!played) break;
            cacheMoveSan(notationMove, played.san);
            line.push({ san: played.san, fen: board.fen(), lastMove: [move.from, move.to] });
        }
    } catch(error) {
        // Keep the valid prefix if an engine sends an incomplete or invalid PV.
    }
    return line;
}

// Assemble algebraic notation from engine-verified moves and board state.
// Never infer variant legality or check using standard-chess move generation.
export function createVariantSan(fen, uci, legalMoves, result, config = {}) {
    const move = parseVariantMove(uci);
    if(!move || !result?.fen || !legalMoves.includes(uci)) return '';
    const position = parseVariantFen(fen);
    const after = parseVariantFen(result.fen);
    const at = square => position.rows[position.rows.length - Number(square.slice(1))]?.[square.charCodeAt(0) - 97];
    const variant = variantConfig(config).variant;
    const shot = variant === 'amazons' ? move.shot : null;
    if(variant === 'amazons' && !shot) return '';
    if(uci.includes(',') && !shot) return '';
    const xiangqi = ['xiangqi', 'manchu', 'supply', 'minixiangqi'].includes(variant);
    const shogiPromotions = ['shogi', 'checkshogi', 'shoshogi', 'minishogi', 'mini',
        'gorogoro', 'gorogoroplus', 'judkins'].includes(variant)
        ? { P: 'G', L: 'G', N: 'G', S: 'G', B: 'H', R: 'D', ...(variant === 'shoshogi' ? { E: 'K' } : {}) } : null;
    const pieceName = piece => {
        const name = piece?.replace(/~/g, '').toUpperCase();
        // Fairy SAN uses the horse/elephant synonyms, not the FEN's N/B.
        if(xiangqi) return { N: 'H', B: 'E' }[name] || name;
        return name?.startsWith('+') && shogiPromotions ? shogiPromotions[name.slice(1)] || name : name;
    };
    const suffix = result.mate ? '#' : result.checked ? '+' : '';
    if(move.drop) return `${pieceName(move.drop)}@${move.to}${suffix}`;
    const piece = at(move.from);
    if(!piece) return '';
    const name = pieceName(piece);
    // Soldiers retain their P and use normal piece disambiguation, not pawn SAN.
    const isPawn = name === 'P' && !shogiPromotions && !xiangqi;
    const target = at(move.to);
    const sameColor = other => other && (other === other.toUpperCase()) === (piece === piece.toUpperCase());
    const rank = Number(move.from.slice(1));
    const sameRank = rank === Number(move.to.slice(1));
    const rookMoved = position.rows[position.rows.length - rank]?.some((unit, file) =>
        pieceName(unit) === 'R' && sameColor(unit)
        && after.rows[after.rows.length - rank]?.[file] !== unit);
    const castle = name === 'K' && sameRank && (pieceName(target) === 'R' && sameColor(target)
        || Math.abs(move.to.charCodeAt(0) - move.from.charCodeAt(0)) > 1 && rookMoved);
    if(castle && !move.promotion) return `${move.to.charCodeAt(0) > move.from.charCodeAt(0) ? 'O-O' : 'O-O-O'}${suffix}`;

    // A suffix may encode gating rather than promotion. Only describe a real
    // promotion; unsupported gating moves retain their coordinates.
    const promotedPiece = after.rows[after.rows.length - Number(move.to.slice(1))]?.[move.to.charCodeAt(0) - 97];
    const promotionName = pieceName(promotedPiece);
    if(move.promotion === '+' && (!shogiPromotions || !promotionName || promotionName === name)) return '';
    if(move.promotion && move.promotion !== '+' && name !== 'P'
        && promotionName !== move.promotion.toUpperCase()) return '';
    const capture = Boolean(target && !sameColor(target))
        || isPawn && move.from[0] !== move.to[0] && position.fields[3] === move.to;
    const alternatives = legalMoves.map(parseVariantMove).filter(other => other && !other.drop
        && other.from !== move.from && other.to === move.to
        && other.promotion === move.promotion
        && (!shot || other.shot?.to === shot.to)
        && pieceName(at(other.from)) === name && sameColor(at(other.from)));
    let origin = '';
    if(isPawn) origin = capture ? move.from[0] : '';
    else if(alternatives.length) {
        origin = alternatives.every(other => other.from[0] !== move.from[0]) ? move.from[0]
            : alternatives.every(other => other.from.slice(1) !== move.from.slice(1)) ? move.from.slice(1) : move.from;
    }
    const promotion = move.promotion ? `=${move.promotion === '+' ? promotionName : move.promotion.toUpperCase()}` : '';
    return `${isPawn ? '' : name}${origin}${capture ? 'x' : ''}${move.to}${promotion}${shot ? `,${shot.to}` : ''}${suffix}`;
}

async function withNotationEngine(callback) {
    clearTimeout(fairyNotationIdleTimeout);
    pendingNotationRequests++;
    try {
        // Lazy import avoids a module-initialization cycle. Share this worker
        // between notation consumers, separately from long feedback searches.
        fairyNotationPromise ??= import('../FairyAnalysis.js').then(({ default: FairyAnalysis }) => new FairyAnalysis());
        return await callback(await fairyNotationPromise);
    } finally {
        pendingNotationRequests--;
        if(!pendingNotationRequests) {
            const promise = fairyNotationPromise;
            fairyNotationIdleTimeout = setTimeout(() => {
                if(pendingNotationRequests || fairyNotationPromise !== promise) return;
                fairyNotationPromise = null;
                promise?.then(analyzer => analyzer.terminate()).catch(() => {});
            }, 30000);
        }
    }
}

export async function replayPvAsync(pv, config = {}, allowMove, isCurrent = () => true) {
    if(!isCurrent()) return [];
    const context = variantConfig(config);
    if(context.variant === 'chess' && !context.useChess960) return replayPv(pv, config, allowMove);
    try {
        const line = await withNotationEngine(analyzer => {
            const request = analyzer.replayPv(pv, { ...config, isCurrent }, allowMove);
            analyzer.cancelStaleRequests();
            return request;
        });
        return isCurrent() ? line : [];
    } catch(error) {
        console.warn('[Notation] Variant continuation unavailable:', error);
        return [];
    }
}

export async function formatPvNotationAsync(pv, config = {}, allowMove, isCurrent = () => true) {
    const line = await replayPvAsync(pv, config, allowMove, isCurrent);
    return line.map(position => position.san).join(' ➜ ');
}

export function getVariantPgn(history, config, transitions) {
    return withNotationEngine(analyzer => {
        const request = analyzer.createPgn(history, config, transitions);
        analyzer.cancelStaleRequests();
        return request;
    });
}

export function resolveVariantMove(fen, postFen, hint, config) {
    return withNotationEngine(analyzer => {
        const request = analyzer.resolveMove(fen, postFen, hint, config);
        analyzer.cancelStaleRequests();
        return request;
    });
}

export async function formatMoveNotationAsync(move, useSan = false, forSpeech = false, speech = englishSpeech, isCurrent = () => true) {
    if(useSan && notationKey(move) && !getMoveSan(move) && isCurrent()) {
        try {
            await withNotationEngine(async analyzer => {
                if(isCurrent()) {
                    // Register the newest consumer before cancelling old ones, so
                    // another depth update can reuse the same in-flight conversion.
                    const request = analyzer.notateMove(move, isCurrent);
                    analyzer.cancelStaleRequests();
                    await request;
                }
            });
        } catch(error) {
            console.warn('[Notation] Variant notation unavailable:', error);
        }
    }
    return formatMoveNotation(move, useSan, forSpeech, speech);
}

function speakSquare(square, speech) {
    const isEnglish = speech.lang.toLowerCase().startsWith('en');
    // Separate the file from the rank without spelling multi-digit ranks digit by digit.
    const parts = String(square).toUpperCase().match(/\d+|./g) || [];
    return parts.map(part => isEnglish && part === 'A' ? 'AA' : part).join(' ');
}

function speechSourcePiece(move) {
    const from = move?.player?.[0];
    if(!move?.fen || !/^[a-z]\d+$/.test(from)) return null;
    const position = parseVariantFen(move.fen);
    return position.rows[position.rows.length - Number(from.slice(1))]?.[from.charCodeAt(0) - 97] || null;
}

function promotionPieceName(promotion, move, speech) {
    const source = speechSourcePiece(move);
    // SAN can collapse several promoted Shogi pieces to G. The source FEN
    // retains their identity, so say "promoted lance", not "gold general".
    const shogiPromotion = shogiSpeechVariants.has(variantConfig(move).variant)
        && move.playerPromotion === '+' && source && !source.startsWith('+');
    return speechPieceName(shogiPromotion ? `+${source}` : promotion, move, speech);
}

function speakSan(san, speech, move) {
    const shot = getAmazonsShot(move);
    const compound = shot && san.match(/^(.*),([a-z]\d+)([+#]?)$/);
    if(compound && compound[2] === shot.to) {
        return `${speakSan(compound[1] + compound[3], speech, { ...move, playerUci: null })}, ${speechText(
            (speech.variantSpeech || englishVariantSpeech).shoot, { square: speakSquare(shot.to, speech) })}`;
    }
    const suffix = san.endsWith('#') ? `, ${speech.checkmate}` : san.endsWith('+') ? `, ${speech.check}` : '';
    if(/^O-O(?:-O)?[+#]?$/.test(san)) {
        return `${san.startsWith('O-O-O') ? speech.castleQueenside : speech.castleKingside}${suffix}`;
    }

    const drop = san.match(/^(\+?[A-Z])@([a-z]\d+)[+#]?$/);
    if(drop) return speechText((speech.variantSpeech || englishVariantSpeech).drop,
        { piece: speechPieceName(drop[1], move, speech), square: speakSquare(drop[2], speech) }) + suffix;
    const match = san.match(/^(\+?[A-Z])?([a-z]?\d*x?)([a-z]\d+)(?:=(\+?[A-Z]))?[+#]?$/);
    if(!match) return san;
    const [, piece, prefix, destination, promotion] = match;
    // Resolve the capture marker before reading disambiguation. Otherwise the
    // optional origin file greedily consumes 'x' in moves such as Rxg7.
    const capture = prefix.endsWith('x');
    const origin = capture ? prefix.slice(0, -1) : prefix;
    const source = speechSourcePiece(move);
    const name = piece ? speechPieceName(source?.startsWith('+') ? source : piece, move, speech) : '';
    const subject = piece ? (origin ? speechText(speech.origin, {
        piece: name, square: speakSquare(origin, speech)
    }) : name) : origin ? speakSquare(origin, speech) : '';
    const square = speakSquare(destination, speech);
    const spokenMove = capture || subject
        ? speechText(capture ? speech.capture : speech.move, { piece: subject, square }) : square;
    const spokenPromotion = promotion ? `, ${speechText(speech.promotion, { piece: promotionPieceName(promotion, move, speech) })}` : '';
    return `${spokenMove}${spokenPromotion}${suffix}`;
}

// PIP and Move TTS use the same conversion/cache and coordinate fallback.
export function formatMoveNotation(move, useSan = false, forSpeech = false, speech = englishSpeech) {
    const [from, to] = move?.player || [];
    if(!from || !to) return '';
    const isPartialHint = move.hintDetail === 'piece' || move.hintDetail === 'destination';
    if(isPartialHint) {
        const isPieceOnly = move.hintDetail === 'piece';
        const translations = typeof TRANS_OBJ === 'undefined' ? null : TRANS_OBJ;
        const square = isPieceOnly ? from : to;
        const isDropHint = isPieceOnly && /^[a-zA-Z]@$/.test(square);
        if(isDropHint) {
            return speechPieceName(square[0], move, forSpeech ? speech : getMoveSpeechConfig(Boolean(translations)));
        }
        // Partial suggestions reveal only the square, without an instruction prefix.
        return forSpeech ? speakSquare(square, speech) : square.toUpperCase();
    }
    const san = useSan ? getMoveSan(move) : '';
    if(san) return forSpeech ? speakSan(san, speech, move) : san;
    const shot = getAmazonsShot(move);
    if(shot) {
        if(!forSpeech) return `${from.toUpperCase()} ➔ ${to.toUpperCase()}, 🏹 ${shot.to.toUpperCase()}`;
        const piece = speechText(speech.origin, {
            piece: speechPieceName('Q', move, speech), square: speakSquare(from, speech)
        });
        return `${speechText(speech.move, { piece, square: speakSquare(to, speech) })}, ${speechText(
            (speech.variantSpeech || englishVariantSpeech).shoot, { square: speakSquare(shot.to, speech) })}`;
    }
    // Keep compound moves intact. Visual '+' promotions retain UCI; speech
    // resolves the promoted piece from the variant and source FEN below.
    if(notationKey(move) && (move.playerUci?.includes(',') || (!forSpeech && move.playerPromotion === '+'))) return move.playerUci
        || `${from}${to}${move.playerPromotion}`;
    if(/^[a-zA-Z]@$/.test(from)) {
        if(!forSpeech) return `${from[0].toUpperCase()}@${to}`;
        return speechText((speech.variantSpeech || englishVariantSpeech).drop,
            { piece: speechPieceName(from[0], move, speech), square: speakSquare(to, speech) });
    }
    if(!forSpeech) return `${from.toUpperCase()} ➔ ${to.toUpperCase()}${move.playerPromotion ? `=${String(move.playerPromotion).toUpperCase()}` : ''}`;
    const coordinates = [from, to].map(square => speakSquare(square, speech).split(' ').map(letter => `"${letter}"`).join('\n')).join('\n');
    const promotion = String(move.playerPromotion || '').toUpperCase();
    const source = speechSourcePiece(move);
    const promotionText = promotion === '+' && !source
        ? (speech.variantSpeech || englishVariantSpeech).promotionOnly
        : promotion ? speechText(speech.promotion, {
            piece: promotionPieceName(promotion === '+' ? `+${source}` : promotion, move, speech)
        }) : '';
    return coordinates + (promotionText ? `, ${promotionText}` : '');
}