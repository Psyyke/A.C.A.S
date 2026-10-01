import { Chess } from '../../engines/libraries/chessjs/chess.js';
import { variantConfig, parseVariantFen, parseVariantMove } from './variantPosition.js';

const notationCache = new Map();
let fairyNotationPromise = null;
let fairyNotationIdleTimeout = null;
let pendingNotationRequests = 0;
const englishSpeech = {
    lang: 'en-US',
    pieces: { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight' },
    move: '{piece} to {square}',
    capture: '{piece} takes {square}',
    origin: '{piece} from {square}',
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
    return { ...englishSpeech, ...translated, pieces: { ...englishSpeech.pieces, ...translated.pieces } };
}

function speechText(template, values) {
    return template.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}

function notationKey(move) {
    const [from, to] = move?.player || [];
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

// Assemble algebraic notation from engine-verified moves and board state.
// Never infer variant legality or check using standard-chess move generation.
export function createVariantSan(fen, uci, legalMoves, result) {
    const move = parseVariantMove(uci);
    if(!move || !result?.fen || !legalMoves.includes(uci) || uci.includes(',')) return '';
    const position = parseVariantFen(fen);
    const after = parseVariantFen(result.fen);
    const at = square => position.rows[position.rows.length - Number(square.slice(1))]?.[square.charCodeAt(0) - 97];
    const pieceName = piece => piece?.replace(/~/g, '').toUpperCase();
    const suffix = result.mate ? '#' : result.checked ? '+' : '';
    if(move.drop) return `${move.drop.toUpperCase()}@${move.to}${suffix}`;
    const piece = at(move.from);
    if(!piece) return '';
    const name = pieceName(piece);
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
    // promotion; compound/gating moves retain their unambiguous coordinates.
    const promotedPiece = after.rows[after.rows.length - Number(move.to.slice(1))]?.[move.to.charCodeAt(0) - 97];
    if(move.promotion && (move.promotion === '+' || name !== 'P'
        && pieceName(promotedPiece) !== move.promotion.toUpperCase())) return '';
    const capture = Boolean(target && !sameColor(target))
        || name === 'P' && move.from[0] !== move.to[0] && position.fields[3] === move.to;
    const alternatives = legalMoves.map(parseVariantMove).filter(other => other && !other.drop
        && other.from !== move.from && other.to === move.to
        && pieceName(at(other.from)) === name && sameColor(at(other.from)));
    let origin = '';
    if(name === 'P') origin = capture ? move.from[0] : '';
    else if(alternatives.length) {
        origin = alternatives.every(other => other.from[0] !== move.from[0]) ? move.from[0]
            : alternatives.every(other => other.from.slice(1) !== move.from.slice(1)) ? move.from.slice(1) : move.from;
    }
    const promotion = move.promotion ? `=${move.promotion.toUpperCase()}` : '';
    return `${name === 'P' ? '' : name}${origin}${capture ? 'x' : ''}${move.to}${promotion}${suffix}`;
}

export async function formatMoveNotationAsync(move, useSan = false, forSpeech = false, speech = englishSpeech, isCurrent = () => true) {
    if(useSan && notationKey(move) && !getMoveSan(move) && isCurrent()) {
        clearTimeout(fairyNotationIdleTimeout);
        pendingNotationRequests++;
        try {
            // Lazy import avoids a module-initialization cycle. One lightweight
            // queue serves PIP and speech without waiting behind feedback searches.
            fairyNotationPromise ??= import('../FairyAnalysis.js').then(({ default: FairyAnalysis }) => new FairyAnalysis());
            const analyzer = await fairyNotationPromise;
            if(isCurrent()) {
                // Register the newest consumer before cancelling old ones, so
                // another depth update can reuse the same in-flight conversion.
                const request = analyzer.notateMove(move, isCurrent);
                analyzer.cancelStaleRequests();
                await request;
            }
        } catch(error) {
            console.warn('[Notation] Variant notation unavailable:', error);
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
    return formatMoveNotation(move, useSan, forSpeech, speech);
}

function speakSquare(square, speech) {
    const isEnglish = speech.lang.toLowerCase().startsWith('en');
    return String(square).toUpperCase().split('').map(letter => isEnglish && letter === 'A' ? 'AA' : letter).join(' ');
}

function speakSan(san, speech) {
    const suffix = san.endsWith('#') ? `, ${speech.checkmate}` : san.endsWith('+') ? `, ${speech.check}` : '';
    if(/^O-O(?:-O)?[+#]?$/.test(san)) {
        return `${san.startsWith('O-O-O') ? speech.castleQueenside : speech.castleKingside}${suffix}`;
    }

    const drop = san.match(/^([A-Z])@([a-z]\d+)[+#]?$/);
    if(drop) return speechText(speech.move, { piece: speech.pieces[drop[1]] || drop[1], square: speakSquare(drop[2], speech) }) + suffix;
    const match = san.match(/^(\+?[A-Z])?([a-z]?\d*x?)([a-z]\d+)(?:=([A-Z]))?[+#]?$/);
    if(!match) return san;
    const [, piece, prefix, destination, promotion] = match;
    // Resolve the capture marker before reading disambiguation. Otherwise the
    // optional origin file greedily consumes 'x' in moves such as Rxg7.
    const capture = prefix.endsWith('x');
    const origin = capture ? prefix.slice(0, -1) : prefix;
    const subject = piece ? (origin ? speechText(speech.origin, {
        piece: speech.pieces[piece] || piece, square: speakSquare(origin, speech)
    }) : speech.pieces[piece] || piece) : origin ? speakSquare(origin, speech) : '';
    const square = speakSquare(destination, speech);
    const spokenMove = capture || subject
        ? speechText(capture ? speech.capture : speech.move, { piece: subject, square }) : square;
    const spokenPromotion = promotion ? `, ${speechText(speech.promotion, { piece: speech.pieces[promotion] || promotion })}` : '';
    return `${spokenMove}${spokenPromotion}${suffix}`;
}

// PIP and Move TTS use the same conversion/cache and coordinate fallback.
export function formatMoveNotation(move, useSan = false, forSpeech = false, speech = englishSpeech) {
    const [from, to] = move?.player || [];
    if(!from || !to) return '';
    const san = useSan ? getMoveSan(move) : '';
    if(san) return forSpeech ? speakSan(san, speech) : san;
    // Preserve the full engine notation for compound moves or '+' promotions;
    // dropping their extra component would describe a different move.
    if(notationKey(move) && (move.playerUci?.includes(',') || move.playerPromotion === '+')) return move.playerUci
        || `${from}${to}${move.playerPromotion}`;
    if(!forSpeech) return `${from.toUpperCase()} ➔ ${to.toUpperCase()}${move.playerPromotion ? `=${String(move.playerPromotion).toUpperCase()}` : ''}`;
    if(/^[a-zA-Z]@$/.test(from)) {
        return speechText(speech.move, { piece: speech.pieces[from[0].toUpperCase()] || from[0], square: speakSquare(to, speech) });
    }
    const coordinates = [from, to].map(square => speakSquare(square, speech).split(' ').map(letter => `"${letter}"`).join('\n')).join('\n');
    const promotion = String(move.playerPromotion || '').toUpperCase();
    return coordinates + (promotion ? `, ${speechText(speech.promotion, { piece: speech.pieces[promotion] || promotion })}` : '');
}