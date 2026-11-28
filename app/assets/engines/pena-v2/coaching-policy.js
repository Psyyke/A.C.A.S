import { moveHint, sourceSentences } from './commentary.js';
import { moveMentions, moveOwner, variationFrames } from './teacher.js';
import { markdownPlain } from './formatting.js';
import { Chess, SQUARES } from '../libraries/chessjs/chess.js';
import { withTurn } from './factsheet.js';
import { wrongMoveClaim } from './move-claims.js';

export const coachingPolicy = 'Explain the purpose behind an idea, its tradeoffs and possible counterplay in natural language rather than listing evidence. '
    + 'Use chess knowledge to reason from the position, but distinguish inference from verified board facts and avoid claiming uncertain outcomes as certain. '
    + 'Check piece identities and attack geometry even in hypothetical statements. A move onto a square and attacks from that square are different facts. '
    + 'After a move, vacate the source square and remove any captured piece before describing targets. '
    + 'Do not volunteer a best move or line when the player has not asked for one.';

// Squares named in a question about a knight, such as "where does a knight on d5 see?".
const imaginedKnightSquares = question => /\bknights?\b/i.test(question || '')
    ? [...new Set((String(question).match(/\b[a-h][1-8]\b/gi) || []).map(square => square.toLowerCase()))] : [];

// Keep the trained PCF payload intact, with a small readable reminder for the live model.
export function boardGroundingNotes(fen, question) {
    const board = new Chess(fen);
    const names = Object.fromEntries(Object.entries(pieceTypes).map(([name, type]) => [type, name]));
    const ledger = ['w', 'b'].map(color => `${color === 'w' ? 'White' : 'Black'}: ` + SQUARES
        .filter(square => board.get(square)?.color === color)
        .map(square => `${names[board.get(square).type]} ${square}`).join(', ') + '.');
    const notes = ['Rule-checked CURRENT board, not a future position:', ...ledger,
        `${board.turn() === 'w' ? 'White' : 'Black'} to move. Unlisted squares are empty.`, ...hypotheticalKnights(board, question)];
    return notes.join('\n');
}

function hypotheticalKnights(board, question) {
    // Phrased as a task, not a disclaimer, because the model tends to recite disclaimers back to the player.
    return imaginedKnightSquares(question).map(from => `Imagined knight on ${from}, not on the board: it would control `
        + `${SQUARES.filter(to => reaches(board, from, to, 0, { type: 'n' })).join(', ')}. `
        + 'Just name those squares and what sits on them.');
}

/** Only the question's imagined-knight lines, for prompts that already list the board. */
export function hypotheticalKnightNotes(fen, question) {
    return hypotheticalKnights(new Chess(fen), question).join('\n');
}

export function asksForMove(question, { offeredMove = false } = {}) {
    const text = String(question || '').trim();
    if(/\b(?:do not|don't|without|avoid|hide|not)\b[^.!?]*\b(?:moves?|lines?|variations?)\b/i.test(text)) return false;
    if(offeredMove && /^(?:please\s+|just\s+|ok(?:ay)?,?\s+)*(?:yes|yeah|yep|yup|sure|go ahead|go on|do it|i(?: (?:want|would like|need)|['’]d like) (?:it|that|to (?:see|know|hear) (?:it|that))|(?:show|tell|give|reveal) (?:me )?(?:it|that)|(?:show|tell) me|let me (?:see|know|hear)(?: it| that)?|let['’]s (?:see|hear) it|what is it)(?:,?\s+please)?[.!?]*$/i.test(text))
        return true;
    return /\b(?:what|which|where|how|should|could|can|would|want|need|recommend|suggest|tell|show|give|reveal)\b[^.!?]*\b(?:moves?|play|push|capture|castle|line|variation|continuation)\b/i.test(text)
        || /\b(?:play|push|try|move|capture)\s+[a-h][1-8]\b/i.test(text)
        || moveMentions(text).length > 0;
}

// Moves the player could make right now, and the opponent's replies or threats, read from the real board.
function sides(fen, playerColor) {
    if(!fen || !/^[wb]$/.test(playerColor || '')) return null;
    try {
        new Chess(fen);
        return { fen, player: playerColor, other: playerColor === 'w' ? 'b' : 'w' };
    } catch { return null; }
}

function legalMoves(fen, color) {
    try { return new Chess(withTurn(fen, color)).moves({ verbose: true }); } catch { return []; }
}

function matches(moves, input) {
    if(!input) return [];
    if(typeof input === 'object') return moves.filter(move => move.from === input.from && move.to === input.to);
    const san = input.replace(/[+#!?]/g, '');
    return moves.filter(move => move.san.replace(/[+#]/g, '') === san);
}

// Only a move the player could make right now gives the answer away. Once the line starts with
// an opponent move, the rest is the consequence being explained, like a forced mate after ignoring a threat.
function playerMentions(plain, mentions, board) {
    if(!board) return mentions;
    const mine = legalMoves(board.fen, board.player), theirs = legalMoves(board.fen, board.other);
    let line = null;
    return mentions.filter(mention => {
        const owner = moveOwner(plain.slice(0, mention.index), board.player);
        if(line) {
            const next = matches(line.moves({ verbose: true }), mention.input)[0];
            if(next) { line.move(next); return false; }
        }
        if(owner !== board.other && matches(mine, mention.input).length) return true;
        const threat = matches(theirs, mention.input)[0];
        if(!threat) return owner !== board.other && !line;
        try { line = new Chess(withTurn(board.fen, board.other)); line.move(threat); } catch { line = null; }
        return false;
    });
}

const captureTarget = String.raw`(?:(?:the|that|this|their|(?:your|the) opponent's|white's|black's)\s+(?:(?:free|loose|hanging|undefended)\s+)?(?:pawn|knight|bishop|rook|queen|piece)|it|them)`;
// "Take it" after naming a hanging piece gives the move away without notation.
// Limit this to player-directed commands, not past captures or what the opponent can do.
const captureCommand = new RegExp(String.raw`(?:^\s*(?:then\s+)?|[,;:]\s*)(?:(?:so|you\s+(?:can|could|should|must|need to)|try to|just|simply|now)\s+)*`
    + String.raw`(?:(?:take(?!\s+it\s+(?:seriously|personally|slowly|easy|from me|as|for granted)\b)|capture|remove|grab|recapture|(?:swap|trade|exchange)(?:\s+off)?)\s+${captureTarget}\b`
    + String.raw`|pick\s+(?:off\s+${captureTarget}\b|${captureTarget}\s+off\b)|get\s+(?:rid of\s+${captureTarget}\b|${captureTarget}\s+off the board\b))`, 'i');

function describedSuggestion(plain, board, mine) {
    if(!board) return false;
    const otherName = board.other === 'w' ? 'white' : 'black';
    const owner = word => /^(?:your|you)$/i.test(word) ? board.player
        : /^(?:their|opponent's|the opponent's)$/i.test(word) ? board.other : word[0].toLowerCase();
    const consequence = new RegExp(`\\b(?:if|after|when|once)\\s+(?:${otherName}|they|their|(?:your |the )?opponent)\\b`, 'i');
    const actors = /\b(your|their|white|black|opponent's|the opponent's)\s+(?:[a-h][1-8]\s+)?(pawn|knight|bishop|rook|queen|king)s?(?:\s+on\s+[a-h][1-8])?\s+(?:can|could|should|must|needs? to|has to|have to)\s+([^.!?]+)/gi;
    for(const match of plain.matchAll(actors)) {
        if(owner(match[1]) !== board.player || consequence.test(plain.slice(0, match.index))) continue;
        const type = pieceTypes[match[2].toLowerCase()];
        const actions = match[3].replace(/^(?:(?:just|also|simply)\s+)*/i, '');
        if(/\b(?:earlier|previously|last (?:move|turn))\b/i.test(actions)) continue;
        if(/^(?:take|capture|remove|recapture|trade|exchange)\b/i.test(actions) && mine.some(move => move.piece === type && move.captured)) return true;
        if(/^(?:give|deliver)\s+check\b/i.test(actions) && mine.some(move => move.piece === type && /[+#]$/.test(move.san))) return true;
        const file = actions.match(/^(?:get|go|move)\s+to\s+(?:the\s+)?(?:open\s+|half-open\s+)?([a-h])[- ]file\b/i);
        if(file && mine.some(move => move.piece === type && move.to[0] === file[1].toLowerCase())) return true;
        if(/^(?:move|retreat)(?:\s+or\s+be\s+protected)?\b/i.test(actions) && mine.some(move => move.piece === type)) return true;
    }
    const check = plain.match(/\b(?:the\s+)?(queen|bishop|rook|knight|king|pawn)\s+has\s+a\s+check\b/i);
    if(check && !new RegExp(`\\b(?:their|opponent's|${otherName}(?:'s)?)\\b`, 'i').test(plain.slice(0, check.index))
        && mine.some(move => move.piece === pieceTypes[check[1].toLowerCase()]
            && /[+#]$/.test(move.san))) return true;
    const capture = /\b(?:taking|capturing|removing|recapturing|trading|exchanging)\s+(?:it|that\s+(?:piece|pawn|knight|bishop|rook|queen)|the\s+(?:piece|pawn|knight|bishop|rook|queen))\s+(?:(?:also|just|simply)\s+)*(?:is|wins?|clears?|stops?|breaks?|keeps?)\b/i.exec(plain);
    if(capture && mine.some(move => move.captured) && !consequence.test(plain.slice(0, capture.index))
        && !new RegExp(`\\b(?:${otherName}|they|the opponent)\\s+$`, 'i').test(plain.slice(0, capture.index))) return true;
    return mine.some(move => move.captured) && /\bit\s+has\s+to\s+come\s+off\b/i.test(plain)
        || /(?:^|[,;:]\s*)(?:so\s+)?move\s+(?:it|that\s+(?:piece|pawn|knight|bishop|rook|queen))\s+(?:out|away|to safety)\b/i.test(plain);
}

function adviceActor(text, board) {
    const references = [...text.matchAll(/\b(pawn|knight|bishop|rook|queen|king)(?:\s+on\s+([a-h][1-8]))?\b/gi)];
    const reference = references.at(-1);
    if(!reference) return null;
    const preceding = text.slice(Math.max(0, reference.index - 24), reference.index);
    const marker = preceding.match(/\b(your|you|their|opponent's|the opponent's|white's|black's|white|black)\s*$/i)?.[1]?.toLowerCase();
    const type = pieceTypes[reference[1].toLowerCase()];
    let color = null;
    if(marker === 'your' || marker === 'you') color = board.player;
    else if(marker === 'their' || marker === "opponent's" || marker === "the opponent's") color = board.other;
    else if(marker === "white's" || marker === 'white') color = 'w';
    else if(marker === "black's" || marker === 'black') color = 'b';
    else if(reference[2]) color = pieceAt(new Chess(board.fen), reference[2])?.color || null;
    else color = board.player;
    return { type, color };
}

function hasSuggestion(plain, playedSan = '', board = null) {
    const mine = board ? legalMoves(board.fen, board.player) : [];
    // The move that was just played is history, like "Nd5 is a good move", once the player can't play it again.
    const past = playedSan && (/\b(?:played|just played|last move|your move|that move|after)\b/i.test(plain)
        || board && !matches(mine, playedSan).length);
    const suggestions = playerMentions(plain, moveMentions(plain).filter(mention => !(past && typeof mention.input === 'string'
        && mention.input.replace(/[+#]/g, '') === playedSan.replace(/[+#]/g, ''))), board);
    const verbs = /\b(?:play\w*|push\w*|mov\w*|advanc\w*|captur\w*|tak\w*|put\w*|bring\w*|develop\w*|jump\w*|land\w*|retreat\w*)\b[^.!?]*?\b(to|on|from)\s+([a-h][1-8])\b/gi;
    const verbal = [...plain.matchAll(verbs)].some(([, by, square]) => !board
        || mine.some(move => move[by.toLowerCase() === 'from' ? 'from' : 'to'] === square.toLowerCase()));
    const pawnMove = /\b(?:consider|try|recommend|suggest|choose|prefer|favor|favour)\s+[a-h][1-8]\b|^\s*[a-h][1-8]\s+(?:develops|controls|attacks|opens|protects|threatens|wins|loses|works|looks)\b/i.test(plain);
    const namedPlan = [...plain.matchAll(/\b(?:(?:press\w*|build\w*|expand\w*|develop\w*|continu\w*|respond\w*|break\w*|strik\w*|lever\w*|kick\w*|meet\w*|answer\w*|counter\w*)\s+(?:(?:it|them|that|this)\s+)?with|(?:pawn\s+)?(?:break|push|advance)s?)\s+([a-h][1-8](?:\s+(?:or|and)\s+[a-h][1-8])*)\b/gi)].some(match => {
        const clause = plain.slice(0, match.index).split(/[,;:]|\b(?:but|so)\b/i).at(-1);
        if(/\b(?:(?:could|would|should) have|had been|was|were|earlier|previously)\b/i.test(clause)) return false;
        if(board && moveOwner(clause, board.player) === board.other) return false;
        return !board || [...match[1].matchAll(/[a-h][1-8]/gi)].some(square => matches(mine, square[0]).length);
    });
    const wayToAct = /\b(?:has|have|offers?)\s+(?:(?:a|the|one|clean|safe|good|natural|clear|direct)\s+){0,3}way\s+to\s+(?:hit|attack|check|capture|take|target|press)\b/i.exec(plain);
    const actor = wayToAct && board ? adviceActor(plain.slice(0, wayToAct.index), board) : null;
    const pieceWay = Boolean(actor?.color === board?.player && mine.some(move => move.piece === actor.type));
    const chosenCapture = /\b(?:cleanest|safest|best|easiest|only)\s+(?:way|move|answer)\s+(?:is|would be)\s+to\s+(?:take|capture|remove|trade|exchange)\b/i.exec(plain);
    const captureWay = Boolean(chosenCapture && board && moveOwner(plain.slice(0, chosenCapture.index), board.player) !== board.other
        && mine.some(move => move.captured));
    const checkOnSquare = /\b(?:(your|their|white's|black's|the opponent's|opponent's)\s+)?(queen|rook|bishop|knight|pawn|king)(?:'s)?\s+check\s+on\s+([a-h][1-8])\b[^.!?]{0,40}\b(?:is|would be)\s+(?:the\s+)?move\b/i.exec(plain);
    const namedCheck = Boolean(checkOnSquare && board
        && (!checkOnSquare[1] || ownerColor(checkOnSquare[1], board.player, board.player) === board.player)
        && mine.some(move => move.piece === pieceTypes[checkOnSquare[2].toLowerCase()]
            && move.to === checkOnSquare[3].toLowerCase() && /[+#]$/.test(move.san)));
    const checkThenHit = /\bcheck\s+first\b[^.!?]{0,45}\b(?:hit|attack|capture|take)\b/i.exec(plain);
    const checkingAdvice = Boolean(checkThenHit && board && moveOwner(plain.slice(0, checkThenHit.index), board.player) !== board.other
        && mine.some(move => /[+#]$/.test(move.san)));
    const pieceMove = /\bmove\s+(?:(?:your|their|the|white's|black's|the opponent's|opponent's)\s+)?(pawn|knight|bishop|rook|queen|king)\b[^.!?]{0,45}\b(?:with|to|toward|towards|like|rather than)\b/i.exec(plain);
    const movingPiece = pieceMove && board ? adviceActor(plain.slice(0, pieceMove.index + pieceMove[0].length), board) : null;
    const moveAdvice = Boolean(movingPiece?.color === board?.player && mine.some(move => move.piece === movingPiece.type));
    const rookLift = /\b(rook|queen|bishop|knight|king)\s+(?:lift|swing|shift)\s+(?:up|to|along)\s+(?:the\s+)?([a-h])[- ]file\b/i.exec(plain);
    const liftActor = rookLift && board ? adviceActor(plain.slice(0, rookLift.index + rookLift[0].length), board) : null;
    const liftAdvice = Boolean(liftActor?.color === board?.player
        && mine.some(move => move.piece === liftActor.type && move.to[0] === rookLift[2].toLowerCase()));
    const pawnMoveIdea = /\b(?:a|the)\s+(?:(?:central|pawn|center|centre)\s+)*pawn\s+move\b[^.!?]{0,45}\b(?:natural|best|cleanest|safest)\s+way\b/i.test(plain);
    // "so f4 is the natural way to kick it" recommends a pawn move by its square alone.
    const squareChoice = [...plain.matchAll(/\b([a-h][1-8])\s+(?:is|would be|looks like)\s+(?:(?:the|a|your)\s+)?(?:(?:most|very|really)\s+)?(?:natural|best|cleanest|safest|right|simplest|strongest|obvious|thematic|logical|key)\s+(?:way|move|idea|push|break|try|choice|answer|reply|plan|follow-up)\b/gi)]
        .some(match => board && moveOwner(plain.slice(0, match.index).split(/[,;:]|\b(?:but|so)\b/i).at(-1), board.player) !== board.other
            && matches(mine, match[1]).length);
    // "The f6 break is still there" keeps a specific pawn move on the table.
    const openBreak = [...plain.matchAll(/\b([a-h][1-8])\s+(?:pawn\s+)?(?:break|push|lever|thrust|advance)\s+(?:is|remains|stays)\s+(?:still\s+)?(?:there|available|possible|on|coming|an option|in the air)\b/gi)]
        .some(match => board && moveOwner(plain.slice(0, match.index).split(/[,;:]|\b(?:but|so)\b/i).at(-1), board.player) !== board.other
            && matches(mine, match[1]).length);
    // "it can come to a3 or e3" sends a named piece to concrete squares.
    const destination = [...plain.matchAll(/\b(?:can|could|should|might|wants? to|would like to|is ready to|needs? to|has to|ought to)\s+(?:(?:still|also|easily|then|later|now|just)\s+)?(?:come|go|head|drop|swing|reroute|settle|hop|slide)\s+(?:back\s+)?(?:to|into|onto)\s+([a-h][1-8](?:\s*,\s*[a-h][1-8])*(?:,?\s+(?:or|and)\s+[a-h][1-8])?)\b/gi)]
        .some(match => {
            if(!board) return false;
            const actor = adviceActor(plain.slice(0, match.index), board);
            if(!actor || actor.color !== board.player) return false;
            return [...match[1].matchAll(/[a-h][1-8]/gi)].some(([square]) =>
                mine.some(move => move.piece === actor.type && move.to === square.toLowerCase()));
        });
    const namedAction = /^\s*(?:castle|promote)\b|\b(?:should|could|can|try|consider|recommend|suggest|prefer|best move is)\s+(?:to\s+)?(?:castle|promote)\b|\b(?:push|advance|move)\s+(?:(?:your|the|own)\s+)?[a-h][- ]pawn\b/i.test(plain);
    return Boolean(suggestions.length || verbal || pawnMove || namedPlan || namedAction || captureCommand.test(plain)
        || pieceWay || captureWay || namedCheck || checkingAdvice || moveAdvice || liftAdvice || pawnMoveIdea || squareChoice || openBreak || destination
        || describedSuggestion(plain, board, mine));
}

export function hideMoveSuggestions(text, { playedSan = '', fen = '', playerColor = '' } = {}) {
    let withheld = false;
    const board = sides(fen, playerColor);
    const sentences = sourceSentences(text).map(({ text: sentence }) => {
        const plain = markdownPlain(sentence);
        if(!hasSuggestion(plain, playedSan, board)) return sentence;
        withheld = true;
        const breaks = [...sentence.matchAll(/[,;:]\s*(?:(?:and|so|but)\s+)?/gi)].reverse();
        for(const split of breaks) {
            const prefix = sentence.slice(0, split.index).trim();
            // "If you want to keep the pawn" alone is a condition with nothing it leads to.
            const onlyCondition = /^\s*(?:if|when|whenever|once|unless|because|since|although|though|while|after|before|until|as long as|so that|even if)\b/i.test(markdownPlain(prefix))
                && !/[,;:]/.test(prefix);
            if(!onlyCondition && /\b(?:pawn|knight|bishop|rook|queen|king|[a-h][1-8])\b/i.test(markdownPlain(prefix))
                && !hasSuggestion(markdownPlain(prefix), playedSan, board)) return prefix.replace(/[.!?]?$/, '.');
        }
        const hint = moveHint(plain);
        return hint.startsWith('Look for a move ') && !hasSuggestion(hint) ? hint : '';
    }).filter(Boolean);
    return { text: withheld ? sentences.join(' ') : text, withheld };
}

const pieceTypes = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
const squareList = String.raw`[a-h][1-8](?:(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+)[a-h][1-8](?![a-z0-9-]))*`;
const ownerWord = String.raw`a|an|any|the|your|my|our|their|(?:the\s+)?opponent's|white's|black's|white|black`;
const adjective = String.raw`(?:own|other|light-squared|dark-squared|remaining|last|lone|extra|passed|isolated|doubled|backward|loose|undefended|unprotected|pinned|trapped|bad|good|active|passive|hanging|advanced|central|queenside|kingside|[a-h]-)`;
const placementPattern = new RegExp(String.raw`\b(?:(${ownerWord})\s+)?(?:${adjective}\s*)*(pawn|knight|bishop|rook|queen|king)(s)?\s+(?:on|at|(?:still|sitting|standing|sat)\s+on)\s+(${squareList})`
    + String.raw`|\b(?:(${ownerWord})\s+)?([a-h][1-8])[- ](pawn|knight|bishop|rook|queen|king)\b`, 'gi');
// A placement after these words is about a later or imagined board, not the one on screen.
const elsewhere = /\b(?:if|after|once|when|whenever|following|would|imagine|suppose|instead|then|later|eventually|next|push\w*|playing|plays?|moving)\b|\b(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8]|O-O)|\.\.\.\s*[a-h][1-8]/i;
const wishes = /\b(?:put|puts|putting|bring|brings|bringing|get|gets|getting|place|places|placing|want|wants|wanting|land|lands|landing|reach|reaches|reaching|aim|aims|aiming|heading|reroute|rerouting|route|like|love|with|without|for|needs?|swap|swaps|trade|trades|trading|plant|plants|planting|post|posting|establish|establishing|park|parks|parking|develop\w*|to)\s+(?:\w+\s+){0,2}$/i;
const denied = /\b(?:no|not|never|isn't|aren't|wasn't|nor)\s+(?:\w+\s+){0,2}$/i;
const hypothetical = /^\s*(?:would|will|could|might|break|breaks|push|lever)\b/i;
const past = /\b(?:was|were|had|used to|moved|left|went|came|gone|captured|took|taken|traded|lost|missing|played|started|began|hung|picked|opened|just|no longer|anymore|on move \d+)\b/i;

function ownerColor(word, playerColor, inherited) {
    const owner = String(word || '').toLowerCase().replace(/\s+/g, ' ');
    if(/^(?:your|my|our)$/.test(owner)) return playerColor || null;
    if(/^(?:their|(?:the )?opponent's)$/.test(owner)) return playerColor ? (playerColor === 'w' ? 'b' : 'w') : null;
    if(/^white/.test(owner)) return 'w';
    if(/^black/.test(owner)) return 'b';
    return inherited;
}

function pieceAt(board, square) {
    try { return board.get(square) || null; } catch { return null; }
}

const sanLetters = { K: 'k', Q: 'q', R: 'r', B: 'b', N: 'n' };
const namedMove = /\b([KQRBN])[a-h]?[1-8]?x?([a-h][1-8])\b|\b(pawn|knight|bishop|rook|queen|king)\s+(?:\w+\s+)?(?:to|into|onto|lands on|goes on)\s+([a-h][1-8])\b/gi;

// Moves named in the question or reply, like Qd5 or "queen to d5", put that piece on an imagined square.
function imaginedPlacements(...texts) {
    const placed = new Set();
    for(const text of texts) for(const match of markdownPlain(String(text || '')).matchAll(namedMove)) {
        const type = match[1] ? sanLetters[match[1]] : pieceTypes[match[3].toLowerCase()];
        placed.add(type + (match[2] || match[4]).toLowerCase());
    }
    return placed;
}

// "Your knight on b1" after that knight already left: the sentence describes an older board.
function misplaced(plain, boards, playerColor, imagined = new Set()) {
    let inherited = null, previousEnd = -1;
    for(const match of plain.matchAll(placementPattern)) {
        const square = Boolean(match[6]);
        const word = square ? match[5] : match[1];
        const type = pieceTypes[(square ? match[7] : match[2]).toLowerCase()];
        // "the rook on g8, and g7 is empty" names one rook, so only a plural takes the whole list.
        const listed = (square ? match[6] : match[4]).toLowerCase().match(/[a-h][1-8]/g);
        const squares = !square && match[3] ? listed : listed.slice(0, 1);
        const before = plain.slice(0, match.index);
        const after = plain.slice(match.index + match[0].length);
        const joined = !word && previousEnd >= 0 && /^\s*(?:,\s*)?(?:and\s+|or\s+)?$/.test(plain.slice(previousEnd, match.index));
        const color = ownerColor(word, playerColor, joined ? inherited : null);
        inherited = color;
        previousEnd = match.index + match[0].length;
        if(/^(?:a|an|any)$/i.test(word || '') || wishes.test(before)
            || denied.test(before) || hypothetical.test(after)) continue;
        const hypotheticalOwner = /\b(?:if|after|once|when|would|could|might|will|imagine|suppose|instead|then|later|eventually|next|captur\w*|tak\w*|trad\w*|swap\w*)\b/i.test(before);
        const historicalOwner = /\b(?:was|were|had|used to|earlier|previously|before|captured|took|taken|traded|lost|played|started|began)\b/i.test(plain);
        if(color && !hypotheticalOwner && !historicalOwner && squares.some(at => {
            const piece = pieceAt(boards.now, at);
            return piece?.type === type && piece.color !== color && !imagined.has(type + at);
        })) return true;
        if(elsewhere.test(before)) continue;
        const holds = board => squares.every(at => {
            const piece = pieceAt(board, at);
            return piece?.type === type && (!color || piece.color === color);
        });
        if(holds(boards.now) || squares.every(at => imagined.has(type + at))) continue;
        if(past.test(plain) && (!boards.before || holds(boards.before))) continue;
        return true;
    }
    return false;
}

export function dropMisplacedPieces(text, { fen = '', beforeFen = '', playerColor = '', question = '' } = {}) {
    let now, before = null;
    try { now = new Chess(fen); } catch { return { text, removed: [] }; }
    try { if(beforeFen) before = new Chess(beforeFen); } catch {}
    const removed = [];
    const imagined = imaginedPlacements(question, text);
    const kept = sourceSentences(text).filter(({ text: sentence }) => {
        if(!misplaced(markdownPlain(sentence), { now, before }, playerColor, imagined)) return true;
        removed.push(sentence);
        return false;
    }).map(({ text: sentence }) => sentence);
    return { text: removed.length ? kept.join(' ') : text, removed };
}

const wordsOf = sentence => markdownPlain(sentence).toLowerCase().replace(/\[[^\]\n]*\]/g, ' ').match(/[a-z0-9]+/g) || [];

// A reply copied from an older position talks about a board that is gone, so copied sentences go.
export function dropRepeatedSentences(text, earlier = []) {
    const old = earlier.flatMap(reply => sourceSentences(String(reply || '')).map(({ text: sentence }) => wordsOf(sentence)))
        .filter(words => words.length >= 5);
    if(!old.length) return { text, removed: [] };
    const squares = words => words.filter(word => /^[a-h][1-8]$/.test(word)).sort().join(' ');
    const copied = words => words.length >= 5 && old.some(previous => {
        // Same wording about different squares is news, like a fresh check from another piece.
        if(squares(words) !== squares(previous)) return false;
        const seen = new Set(previous);
        const shared = words.filter(word => seen.has(word)).length;
        return shared / Math.max(words.length, previous.length) >= 0.85;
    });
    const removed = [];
    const kept = sourceSentences(text).filter(({ text: sentence }) => {
        if(!copied(wordsOf(sentence))) return true;
        removed.push(sentence);
        return false;
    }).map(({ text: sentence }) => sentence);
    return { text: removed.length ? kept.join(' ') : text, removed };
}

const side = String.raw`(?:white|black|you|you're|your opponent|your side|the opponent|he|she|they|we|it|things|the position|this position|this|that|the game)`;
const degree = String.raw`(?:(?:a\s+)?(?:bit|little|lot|touch)\s+|slightly\s+|clearly\s+|much\s+|way\s+|far\s+|still\s+|now\s+|just\s+|probably\s+|definitely\s+|already\s+|comfortably\s+|completely\s+|totally\s+|only\s+|objectively\s+|technically\s+)*`;
const verdicts = [
    new RegExp(String.raw`(?<!\b(?:does|do|did|doing|handles?|handled|makes?|made|plays?|played|puts?|says?|said|times?|timed)\s)\b${side}\s*(?:is|are|'s|'re|stands?|looks?|seems?|feels?|remains?|stays?)?\s+${degree}(?:better|worse|winning|losing|ahead|behind|on top|in control|for choice|in the driver's seat|in great shape|in trouble|lost|won|fine|okay|ok|comfortable|level|equal|even|balanced)\b(?!\s+(?:at|for\s+(?:the|a|an|\w+ing)|to|on|in\s+(?:development|space|the cent(?:er|re)|material|time|the race)|of|by\s+(?:a|an|one|two)\s+(?:pawn|piece|tempo|move)|a|an|the|your|his|her|their|its|that|this|material|time|tempo|tempi|development|space|placed|off|square|squares|bishop|knight|rook|queen|pawn|pawns|piece|pieces|move|moves|exchange|trade)\b)`, 'i'),
    new RegExp(String.raw`\b${side}\s+(?:has|have|holds?|keeps?|got|gets?)\s+(?:a|an|the)\s+${degree}(?:small\s+|slight\s+|big\s+|clear\s+|real\s+|nice\s+|comfortable\s+|decisive\s+|winning\s+)*(?:edge|advantage|upper hand|plus|lead)\b`, 'i'),
    /\b(?:about|roughly|basically|pretty much|dead|more or less|close to|near|totally|completely|fairly|kind of)\s+(?:equal|level|even|balanced)\b/i,
    /\b(?:eval|evaluation|engine score)\b/i,
    /(?:^|\s)[+-]\d+(?:\.\d+)?(?:\s|[.,]|$)/,
    /\b(?:winning|losing|lost|won|equal|level|balanced|even)\s+(?:position|game|ending|endgame)\b/i,
    /\b(?:stay|stays|remain|remains|keep|keeps|keeping|staying|remaining)\s+(?:(?:clearly|comfortably|completely|totally|slightly)\s+)?(?:winning|better|ahead|on top)\b/i,
    /\b(?:with|keep\w*|leav\w*)\s+(?:(?:a|an|the|your|you)\s+)?(?:slight|small|clear|big|decisive|comfortable|winning)\s+(?:edge|advantage|plus|lead)\b/i
];
const asksStanding = /\b(?:who(?:'s| is)?\s+(?:winning|better|ahead|losing)|winning|losing|better|worse|ahead|behind|advantage|edge|equal|level|eval\w*|score|how\s+(?:am i|are we|is it|is the game|is the position|does it look|do i stand|has the game|did the game|did i do)|am i (?:doing|lost|ok|okay|fine)|is (?:it|this) (?:lost|won|over|drawn|hopeless)|chances?|assess\w*|stand|save|hold|hopeless|draw\w*|win (?:this|it|the game|from here)|recap|sum (?:it )?up|so far|gone|going|changed?|blunder\w*|mistake\w*|turn(?:ed|ing)? (?:it )?around|still true)\b/i;
const filler = String.raw`(?:only|just|it|you|the|position|game|things|white|black|your|opponent|them|a|an|in|with|still|clearly|slightly|about|roughly|approximately|comfortably|much|small|clear|big|nice|is|are|'s|'re|stays?|remains?|now|here|you're|it's|they're|keep|keeps?|keeping|totally|completely|pretty|fairly|dead|level|also|slight|winning|small)`;
const outcome = String.raw`(?:equal|level|balanced|winning|better|worse|ahead|edge|advantage|upper hand)(?:\s+(?:position|game))?`;
const clauseBody = String.raw`(?:though|but|although|while|and|so|with|in|keep(?:s|ing)?|leav(?:e|es|ing)|retain(?:s|ing)?|reach(?:es|ing)?|stay(?:s|ing)?|remain(?:s|ing)?|giv(?:e|es|ing)|about|roughly|approximately)(?:\s+${filler})*\s+${outcome}(?:\s+(?:here|now|overall|either way|for now|with best play|for (?:you|white|black|them|us)|in (?:all of them|both|every line|all lines)))?`;
const markers = String.raw`(?:\s|[\uE000-\uF8FF]|\[[^\]\n]*\])*`;
// Only a verdict that ends the sentence, or sits between commas, comes out without breaking the grammar.
const verdictClause = new RegExp(String.raw`(?:,\s*|\s+)${clauseBody}(?=${markers}(?:[.!?;]|$))|,\s*${clauseBody}(?=${markers},)`, 'gi');
const verdictLead = new RegExp(String.raw`^\s*(?:honestly,\s*)?(?:(?:white|black|you|it|the position|things)(?:'s|'re)?(?:\s+(?:is|are|stays?|remains?))?(?:\s+${filler})*\s+${outcome}|it's\s+(?:about|roughly)\s+(?:equal|level))(?:\s+(?:here|now|overall))?\s*,\s*(?:but|and|so)\s+`, 'i');
const dangling = /\b(?:that|which|the|is|are|was|be|and|to|a|an|it|its|your|with|in|of|but|though|so|still|also|just|now|then|really|remains?|stays?|keeps?|looks?|seems?|feels?|you|we|they|he|she|white|black|leaves?|gives?|while|whereas|although)\s*$/i;

// Who is winning is already on screen elsewhere, so Pena leaves verdicts out unless the player asks.
// A verdict tacked onto real advice loses only its clause. A sentence that is nothing but a verdict goes.
// An engine number in brackets, like "c4 (+0.4)", is only the aside that goes.
const evalAside = /[ \t]*\((?:[^()\n]*?\s)?[+\-−]\d+(?:\.\d+)?\b[^()\n]*\)/g;

export function dropUnaskedVerdicts(text, question = '') {
    if(asksStanding.test(String(question || ''))) return { text, removed: [] };
    const asides = String(text).match(evalAside) || [];
    const source = asides.length ? String(text).replace(evalAside, '') : text;
    const removed = asides.map(aside => aside.trim());
    let dropped = false;
    const isVerdict = sentence => verdicts.some(pattern => pattern.test(markdownPlain(sentence).replace(/\[[^\]\n]*\]/g, '')));
    const kept = sourceSentences(source).map(({ text: sentence }) => {
        if(!isVerdict(sentence)) return sentence;
        dropped = true;
        const end = sentence.match(/[.!?]+(?=[^.!?]*$)/)?.[0] || '.';
        let body = sentence.replace(verdictLead, '').replace(verdictClause, '');
        if(body !== sentence) {
            const tail = sentence.slice(sentence.search(/[.!?]+[^.!?]*$/) >= 0 ? sentence.search(/[.!?]+[^.!?]*$/) : sentence.length);
            body = body.replace(/[.!?]+[^.!?]*$/, '').replace(/[\s,;]+$/, '');
            if(/^[a-z]/.test(body) && !/^(?:[a-h]x?[a-h]?[1-8]|O-O)/.test(body)) body = body.charAt(0).toUpperCase() + body.slice(1);
            // "the position is still" lost its point, so the sentence ends at the last clause that still stands.
            if(dangling.test(markdownPlain(body))) body = body.replace(/,\s*(?:(?:and|but|so|though|while)\s+)?[^,]*$/, '');
            // A lone move left after the last full stop, like "a4", lost the sentence it started.
            body = body.replace(/([.!?])\s+\S+$/, '$1');
            const words = markdownPlain(body).match(/[A-Za-z0-9]+/g) || [];
            if(words.length >= 4 && !dangling.test(markdownPlain(body)) && !isVerdict(body)) {
                removed.push(sentence);
                return /[.!?]$/.test(body) ? body : body + (tail || end);
            }
        }
        removed.push(sentence);
        return null;
    }).filter(sentence => sentence !== null);
    return { text: dropped ? kept.join(' ') : source, removed };
}

const files = 'abcdefgh';
const coords = square => [files.indexOf(square[0]), Number(square[1]) - 1];
const squareName = (x, y) => files[x] + (y + 1);
const lineKinds = { diagonal: ([fx, fy], [tx, ty]) => fx !== tx && Math.abs(fx - tx) === Math.abs(fy - ty),
    file: ([fx, fy], [tx, ty]) => fx === tx && fy !== ty, rank: ([fx, fy], [tx, ty]) => fy === ty && fx !== tx };

// Whether the piece on from reaches to, looking through at most one piece, so batteries and x-rays still count.
// A piece that only eyes a square may look through any number of pieces, as long as the square is on its line.
function reaches(board, from, to, blockerLimit = 1, piece = pieceAt(board, from)) {
    if(!piece || from === to) return false;
    const [fx, fy] = coords(from), [tx, ty] = coords(to);
    const dx = tx - fx, dy = ty - fy;
    if(piece.type === 'p') return Math.abs(dx) === 1 && dy === (piece.color === 'w' ? 1 : -1);
    if(piece.type === 'n') return Math.abs(dx * dy) === 2;
    if(piece.type === 'k') return Math.max(Math.abs(dx), Math.abs(dy)) === 1;
    const straight = !dx || !dy, diagonal = Math.abs(dx) === Math.abs(dy);
    if(piece.type === 'r' && !straight || piece.type === 'b' && !diagonal || piece.type === 'q' && !straight && !diagonal) return false;
    const steps = Math.max(Math.abs(dx), Math.abs(dy)), sx = Math.sign(dx), sy = Math.sign(dy);
    let blockers = 0;
    for(let step = 1; step < steps; step++) if(pieceAt(board, squareName(fx + sx * step, fy + sy * step))) blockers++;
    return blockers <= blockerLimit;
}

// A pinned piece that can still slide along the pin line is not stuck.
function stuckByPin(board, fen, square) {
    const piece = pieceAt(board, square);
    if(!piece) return true;
    const moves = legalMoves(fen, piece.color).filter(move => move.from === square);
    if(!moves.length) return true;
    const [x, y] = coords(square);
    for(const [sx, sy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const ray = sign => {
            for(let step = 1; step < 8; step++) {
                const nx = x + sx * sign * step, ny = y + sy * sign * step;
                if(nx < 0 || nx > 7 || ny < 0 || ny > 7) return null;
                const found = pieceAt(board, squareName(nx, ny));
                if(found) return found;
            }
            return null;
        };
        const ahead = ray(1), behind = ray(-1);
        const slides = found => found && found.type === 'q' || found?.type === (sx && sy ? 'b' : 'r');
        const pinned = [[ahead, behind], [behind, ahead]].some(([pinner, shielded]) => pinner && shielded
            && pinner.color !== piece.color && shielded.color === piece.color && slides(pinner));
        if(!pinned) continue;
        return !moves.some(move => {
            const [mx, my] = coords(move.to);
            return (mx - x) * sy === (my - y) * sx;
        });
    }
    return false;
}

const namedPiece = /\b(pawn|knight|bishop|rook|queen|king)\s+on\s+([a-h][1-8])\b|\b([a-h][1-8])[- ](pawn|knight|bishop|rook|queen|king)\b/gi;
// Base forms also cover modals such as "would attack".
const sightVerb = String.raw`looks?\s+at|eyes?|sees?|aims?\s+at|points?\s+at|leans?\s+on|stares?\s+at|x-rays?|targets?|(?:is|are|'s)\s+(?:looking\s+at|eyeing|aiming\s+at|pointing\s+at|leaning\s+on|staring\s+at|targeting)`;
const guardVerb = String.raw`guards?|defends?|protects?|covers?|supports?|attacks?|hits?|controls?|(?:is|are|'s)\s+(?:guarding|defending|protecting|covering|supporting|attacking|hitting)|(?:is|are|'s)\s+tied\s+(?:down\s+)?to|${sightVerb}`;
const sighting = new RegExp(String.raw`^(?:${sightVerb})\b`, 'i');
const pieceNoun = String.raw`(?:(?:the|your|their|its|that|this|black's|white's|opponent's)\s+)?(?:[\w-]+\s+)?(?:pawn|knight|bishop|rook|queen|king|piece)`;
const claimPattern = new RegExp(String.raw`\b(?:is|are|sits|stands|lies)?\s*(?:on|along)\s+the\s+same\s+(diagonal|file|rank)\s+as\s+(?:${pieceNoun}\s+on\s+)?([a-h][1-8])\b`
    + String.raw`|\b(?:${guardVerb})\s+(?:${pieceNoun}\s+on\s+([a-h][1-8])|(${squareList})\b|(that|this)\s+(?:pawn|piece|square)|(it)\b)`, 'gi');
const passiveClaim = new RegExp(String.raw`\b([a-h][1-8])\s+is\s+(?:\w+\s+)?(?:guarded|defended|protected|covered|supported|attacked|hit)\s+by\s+(?:the|your|their|its|black's|white's|a)\s+(?:[\w-]+\s+)?(pawn|knight|bishop|rook|queen|king)\s+on\s+([a-h][1-8])\b(?!\s*,?\s*and\b)`, 'gi');
const stuckClaim = /\b([a-h][1-8])(?:[- ](?:pawn|knight|bishop|rook|queen|king))?\s+(?:cannot|can't|can not|is unable to)\s+move\b(?!\s+(?:without|or|because|since|until|unless|safely|freely|away))/gi;
const unsure = /(?:\b(?:not|never|no longer|nothing|no one|none|would|could|will|might|may|can|to|once|soon|then|also|only)|n't)\s+(?:\w+\s+)?$/i;
const clauseStart = /(?:^|[,;:]|\b(?:and|but|so|while|because|since|though|although|when|where|as)\b)(?![\s\S]*(?:[,;:]|\b(?:and|but|so|while|because|since|though|although|when|where|as)\b))([\s\S]*)$/i;
// Words that make the piece an object or put it inside a phrase, so it isn't who the claim is about.
const notSubject = /\b(?:by|with|from|than|of|against|behind|for|to|like|into|onto|at|in|on|toward|towards|after|threatening|attacking|hitting|checks?|hits?|attacks?|moves?|takes?|pins?|forks?|traps?|wipes|captures?|defending|guarding|protecting|covering|eyes|targets?|has|have|had|is|are|was|were)\b/i;
const moving = /\b(?:go|goes|going|went|jumps?|jumping|moves?|moving|lands?|landing|comes?|coming|heads?|heading|steps?|stepping|retreats?|retreating|travels?|reroutes?|drops?|returns?|swings?|lifts?|slides?|pushes|pushed|advances?|later|then|after|once)\b/i;
const pieceWord = /\b(?:pawn|knight|bishop|rook|queen|king|piece|it's)s?\b/i;

// "The bishop on e2 is on the same diagonal as f2" when it is not: the model misread the board.
function falseGeometry(plain, board, fen, context = '', imagined = []) {
    const offset = context.length;
    plain = context + plain;
    const frames = variationFrames(plain, fen);
    const boardAt = index => {
        const frame = frames.findLast(frame => frame.end <= index);
        return frame ? new Chess(frame.fen) : board;
    };
    const settled = !elsewhere.test(plain.slice(offset));
    const subjects = [
        ...[...plain.matchAll(namedPiece)].map(match => ({ index: match.index, end: match.index + match[0].length,
            type: pieceTypes[(match[1] || match[4]).toLowerCase()], square: (match[2] || match[3]).toLowerCase() })),
        ...[...plain.matchAll(/\bN[a-h]?[1-8]?x?([a-h][1-8])[+#]?/g)].map(match =>
            ({ index: match.index, end: match.index + match[0].length, type: 'n', square: match[1].toLowerCase() }))
    ]
        .filter(item => {
            const lead = plain.slice(0, item.index).split(/[.!?]\s+/).at(-1);
            return !notSubject.test(lead.match(clauseStart)?.[1] || '')
                && !/\b(?:by|with)\b/i.test(lead.split(/[,;:]/).at(-1));
        });
    // "From d5 it eyes e6" answers a question about a knight on d5, so "it" is that imagined knight.
    for(const match of plain.matchAll(/\bfrom\s+([a-h][1-8])\s*,?\s+(?:(it)|(?:a|the|your|that|this)\s+knight)\b/gi))
        if(!match[2] || imagined.includes(match[1].toLowerCase()))
            subjects.push({ index: match.index, end: match.index + match[0].length, type: 'n', square: match[1].toLowerCase() });
    subjects.sort((a, b) => a.end - b.end);
    for(const move of plain.matchAll(/\b(?:go(?:es)?|jump(?:s)?|move(?:s)?|land(?:s)?)\s+(?:to|onto)\s+([a-h][1-8])\b/gi)) {
        if(move.index < offset) continue;
        const subject = subjects.filter(item => item.end <= move.index).at(-1);
        if(subject?.type !== 'n') continue;
        const gap = plain.slice(subject.end, move.index);
        if(/[.!?;]|\b(?:not|never|cannot|can't|couldn't|doesn't|won't|wouldn't)\b/i.test(gap)
            || pieceWord.test(gap) || moving.test(gap)) continue;
        if(!reaches(board, subject.square, move[1].toLowerCase(), 0, { type: 'n' })) return true;
    }
    // A pronoun target only looks back within its own sentence, never at squares from earlier sentences.
    const squaresBefore = index => [...plain.slice(offset, index).matchAll(/\b[a-h][1-8]\b/gi)].map(match => match[0].toLowerCase());
    for(const claim of plain.matchAll(claimPattern)) {
        if(claim.index < offset) continue;
        const before = plain.slice(0, claim.index);
        // "e3 protects d4": a bare square right before the verb is the subject.
        let bare = !claim[1] && before.match(/\b([a-h][1-8])(?:[- ]pawn)?\s+(?:still\s+|now\s+|already\s+)?$/i);
        if(bare && subjects.some(item => item.square === bare[1].toLowerCase()
            && /^\s*$/.test(plain.slice(item.end, claim.index)))) bare = null;
        let subject = bare ? { square: bare[1].toLowerCase(), type: pieceAt(board, bare[1].toLowerCase())?.type } : subjects.filter(item => item.end <= claim.index).at(-1);
        if(!subject?.type) continue;
        // "b7 is tied to the rook on a8" loosely means the pawn's fall exposes the rook, so only pieces count for "tied to".
        if(/\btied\b/i.test(claim[0]) && subject.type === 'p') continue;
        // Knight geometry is board-independent, even for an explicitly imagined placement.
        // Other hypothetical pieces still need a replayed board before their blockers are known.
        const knight = subject.type === 'n';
        const current = boardAt(claim.index);
        if(!settled && !knight) continue;
        if(unsure.test(before) && !knight || /\b(?:not|never|no longer|cannot)\s+(?:\w+\s+)?$/i.test(before)
            || /n't\s*(?:\w+\s+)?$/i.test(before)) continue;
        if(!knight && pieceAt(current, subject.square)?.type !== subject.type) continue;
        if(!bare) {
            const gap = plain.slice(subject.end, claim.index);
            if(pieceWord.test(gap) || moving.test(gap) || /\b(?:[KQRBN]x?[a-h][1-8]|[a-h]x[a-h][1-8])/.test(gap)) continue;
            if(/\band\s+(?:(?:the|your|their|its)\s+)?$/i.test(plain.slice(0, subject.index))) continue;
        }
        if(claim[1]) {
            if(!lineKinds[claim[1].toLowerCase()](coords(subject.square), coords(claim[2].toLowerCase()))) return true;
            continue;
        }
        const targets = (claim[3] || claim[4] || (claim[5] || claim[6]) && squaresBefore(claim.index).filter(square => square !== subject.square).at(-1) || '')
            .toLowerCase().match(/[a-h][1-8]/g) || [];
        if(targets.some(target => !reaches(current, subject.square, target, sighting.test(claim[0].trim()) ? 7 : 1,
            knight ? { type: 'n' } : pieceAt(current, subject.square)))) return true;
        const victim = claim[3] && claim[0].match(/\b(pawn|knight|bishop|rook|queen|king)\s+on\s+([a-h][1-8])/i);
        if(victim && !frames.incomplete && pieceAt(current, victim[2].toLowerCase())?.type !== pieceTypes[victim[1].toLowerCase()]) return true;
    }
    for(const claim of settled ? plain.matchAll(passiveClaim) : []) {
        if(claim.index < offset) continue;
        const square = claim[3].toLowerCase();
        if(pieceAt(board, square)?.type === pieceTypes[claim[2].toLowerCase()] && !reaches(board, square, claim[1].toLowerCase())) return true;
    }
    if(/\bpinn\w*\b/i.test(plain)) for(const claim of plain.matchAll(stuckClaim))
        if(claim.index >= offset && !stuckByPin(board, fen, claim[1].toLowerCase())) return true;
    return false;
}
const lastMoveClaim = /\b(?:white|black|you|your opponent|the opponent|they|he|she)\s+(?:has\s+)?just\s+(?:played|moved)\s+(?:\.\.\.)?([KQRBN]?[a-h]?[1-8]?x?([a-h][1-8])(?:=[QRBN])?|O-O(?:-O)?)(?![\w-])|\blast move was\s+(?:\.\.\.)?([KQRBN]?[a-h]?[1-8]?x?([a-h][1-8])(?:=[QRBN])?|O-O(?:-O)?)(?![\w-])/gi;
function playedMove(beforeFen, fen) {
    if(!beforeFen) return null;
    try {
        const board = fen.split(' ')[0], before = new Chess(beforeFen);
        return before.moves({ verbose: true }).find(move => {
            before.move(move);
            const same = before.fen().split(' ')[0] === board;
            before.undo();
            return same;
        }) || null;
    } catch { return null; }
}
// "White just played N1g3" with no such move on record is a made-up history.
function inventedLastMove(plain, played) {
    for(const claim of plain.matchAll(lastMoveClaim)) {
        const san = claim[1] || claim[3], to = claim[2] || claim[4];
        if(!played) return true;
        if(/^O-O/i.test(san) ? !/^O-O/.test(played.san) || /-O-O/i.test(san) !== /-O-O/.test(played.san)
            : to.toLowerCase() !== played.to || (/^[KQRBN]/.test(san) ? san[0].toLowerCase() : 'p') !== played.piece) return true;
    }
    return false;
}
export function dropFalseGeometry(text, { fen = '', beforeFen = '', question = '' } = {}) {
    let board;
    try { board = new Chess(fen); } catch { return { text, removed: [] }; }
    const removed = [];
    const imagined = imaginedKnightSquares(question);
    const played = playedMove(beforeFen, fen);
    let context = '';
    const kept = sourceSentences(text).filter(({ text: sentence }) => {
        const plain = markdownPlain(sentence);
        const wrong = falseGeometry(plain, board, fen, context, imagined) || inventedLastMove(plain, played)
            || wrongMoveClaim(plain, { rootFen: fen, context });
        context += plain + ' ';
        if(!wrong) return true;
        removed.push(sentence);
        return false;
    }).map(({ text: sentence }) => sentence);
    return { text: removed.length ? kept.join(' ') : text, removed };
}