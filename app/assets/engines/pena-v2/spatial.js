import { SQUARES } from '../libraries/chessjs/chess.js';
import { Facts } from './concepts.js';
import { boardAt } from './positions.js';

const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const other = color => color === 'w' ? 'b' : 'w';
const uciOf = move => move.from + move.to + (move.promotion || '');

export function spatialFacts(frame) {
    const board = boardAt(frame.fen), facts = new Facts(frame.fen);
    const at = new Map(frame.pieces.map(piece => [piece.square, piece]));
    if(at.size !== frame.pieces.length || frame.pieces.length !== facts.pieces.length
        || frame.pieces.some(piece => !piece.id || board.get(piece.square)?.color !== piece.color || board.get(piece.square)?.type !== piece.type))
        throw new Error('Spatial facts require a complete, exact frame piece ledger.');
    const legalMoves = board.moves({ verbose: true }).map(move => {
        const capturedSquare = move.captured ? move.flags.includes('e') ? move.to[0] + move.from[1] : move.to : null;
        return { uci: uciOf(move), san: move.san, pieceId: at.get(move.from).id, from: move.from, to: move.to,
            capturedId: capturedSquare ? at.get(capturedSquare).id : null, capturedSquare,
            promotion: move.promotion || null, castle: move.flags.includes('k') ? 'kingside' : move.flags.includes('q') ? 'queenside' : null };
    });
    const controls = new Map(frame.pieces.map(piece => [piece.id, []]));
    for(const square of SQUARES) for(const color of ['w', 'b'])
        for(const source of facts.attackers(square, color)) controls.get(at.get(source).id).push(square);
    const pieces = frame.pieces.map(piece => ({ ...piece, controls: controls.get(piece.id),
        attackers: facts.attackers(piece.square, other(piece.color)).map(square => at.get(square).id),
        defenders: facts.attackers(piece.square, piece.color).map(square => at.get(square).id),
        legalMoves: piece.color === board.turn() ? legalMoves.filter(move => move.pieceId === piece.id).map(move => move.uci) : null }));
    const rays = [];
    for(const piece of frame.pieces.filter(piece => ['b', 'r', 'q'].includes(piece.type))) {
        for(const [dx, dy] of directions.filter(([dx, dy]) => piece.type === 'q' || (piece.type === 'b' ? dx && dy : !dx || !dy))) {
            const emptySquares = [];
            let firstBlocker = null;
            for(let x = piece.square.charCodeAt(0) - 97 + dx, y = Number(piece.square[1]) + dy;
                x >= 0 && x < 8 && y >= 1 && y <= 8; x += dx, y += dy) {
                const square = 'abcdefgh'[x] + y, blocker = at.get(square);
                if(blocker) { firstBlocker = { pieceId: blocker.id, square }; break; }
                emptySquares.push(square);
            }
            rays.push({ pieceId: piece.id, pieceType: piece.type, color: piece.color, from: piece.square, dx, dy, emptySquares, firstBlocker });
        }
    }
    const pins = facts.lines().map(line => ({ kind: line.kind,
        pinType: line.kind === 'pin' ? at.get(line.back).type === 'k' ? 'absolute' : 'relative' : null,
        sliderId: at.get(line.slider).id, frontId: at.get(line.front).id, backId: at.get(line.back).id,
        slider: line.slider, front: line.front, back: line.back,
        frontLegalMoves: at.get(line.front).color === board.turn() ? legalMoves.filter(move => move.from === line.front).map(move => move.uci) : null }));
    const material = Object.fromEntries(['w', 'b'].map(color => {
        const counts = Object.fromEntries(Object.keys(values).map(type => [type, frame.pieces.filter(piece => piece.color === color && piece.type === type).length]));
        return [color, { counts, points: Object.entries(counts).reduce((sum, [type, count]) => sum + values[type] * count, 0) }];
    }));
    material.whiteMinusBlack = material.w.points - material.b.points;
    const pawns = facts.find('p').map(pawn => ({ pieceId: at.get(pawn.square).id, square: pawn.square, color: pawn.color,
        passed: facts.passed(pawn), isolated: facts.isolated(pawn), doubled: facts.doubled(pawn) }));
    const whiteKing = frame.pieces.find(piece => piece.type === 'k' && piece.color === 'w').square;
    const blackKing = frame.pieces.find(piece => piece.type === 'k' && piece.color === 'b').square;
    const fileDistance = Math.abs(whiteKing.charCodeAt(0) - blackKing.charCodeAt(0));
    const rankDistance = Math.abs(Number(whiteKing[1]) - Number(blackKing[1]));
    const interveningSquares = [];
    if(!fileDistance || !rankDistance || fileDistance === rankDistance) {
        const dx = Math.sign(blackKing.charCodeAt(0) - whiteKing.charCodeAt(0));
        const dy = Math.sign(Number(blackKing[1]) - Number(whiteKing[1]));
        for(let step = 1; step < Math.max(fileDistance, rankDistance); step++)
            interveningSquares.push(String.fromCharCode(whiteKing.charCodeAt(0) + dx * step) + (Number(whiteKing[1]) + dy * step));
    }
    const betweenSquare = fileDistance === 0 && rankDistance === 2
        ? whiteKing[0] + (Number(whiteKing[1]) + Number(blackKing[1])) / 2
        : rankDistance === 0 && fileDistance === 2 ? String.fromCharCode((whiteKing.charCodeAt(0) + blackKing.charCodeAt(0)) / 2) + whiteKing[1] : null;
    const kingGeometry = { whiteKing, blackKing, fileDistance, rankDistance,
        interveningSquares, interveningOccupants: interveningSquares.filter(square => at.has(square)).map(square => at.get(square).id),
        kingMoveDistance: Math.max(fileDistance, rankDistance),
        directOppositionShape: betweenSquare !== null && !at.has(betweenSquare), betweenSquare };
    return { schema: 'pena-v2-spatial/1', frameId: frame.id, turn: board.turn(), check: board.in_check(),
        checkmate: board.in_checkmate(), stalemate: board.in_stalemate(), material, kingGeometry, pieces, rays, pins, pawns, legalMoves,
        semantics: 'Controls include pinned pieces and friendly occupied targets. Legal moves/captures are ONLY for the actual side to move. Material uses P=1 N=B=3 R=5 Q=9, not engine evaluation.' };
}

export function moveMechanism(before, after) {
    const old = before.spatial || spatialFacts(before), next = after.spatial || spatialFacts(after);
    if(after.parentId !== before.id || !after.move) throw new Error('A move mechanism requires consecutive legal frames.');
    const actor = before.pieces.find(piece => piece.id === after.move.pieceId);
    const moved = [{ pieceId: actor.id, from: actor.square, to: after.move.to, beforeType: actor.type,
        afterType: after.pieces.find(piece => piece.id === actor.id).type }];
    for(const piece of before.pieces) {
        const destination = after.pieces.find(next => next.id === piece.id);
        if(piece.id !== actor.id && destination && destination.square !== piece.square)
            moved.push({ pieceId: piece.id, from: piece.square, to: destination.square, beforeType: piece.type, afterType: destination.type });
    }
    const key = pin => `${pin.kind}:${pin.sliderId}:${pin.frontId}:${pin.backId}`;
    return { moved, captured: before.pieces.find(piece => piece.id === after.move.capturedId) || null,
        materialDeltaWhite: next.material.whiteMinusBlack - old.material.whiteMinusBlack,
        check: next.check, checkmate: next.checkmate,
        removedPins: old.pins.filter(pin => !next.pins.some(next => key(next) === key(pin))),
        createdPins: next.pins.filter(pin => !old.pins.some(old => key(old) === key(pin))),
        scope: 'Exact immediate changes, not a proof of strategic purpose, safety or a forced material gain.' };
}
