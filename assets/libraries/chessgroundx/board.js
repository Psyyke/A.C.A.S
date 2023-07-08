import { pos2key, key2pos, opposite, distanceSq, allPos, computeSquareCenter, roleOf, dropOrigOf, changeNumber, isKey, isSame, } from './util.js';
import { queen, knight, janggiElephant } from './premove.js';
export function callUserFunction(f, ...args) {
    if (f)
        setTimeout(() => f(...args), 1);
}
export function toggleOrientation(state) {
    state.orientation = opposite(state.orientation);
    state.animation.current = state.draggable.current = state.selectable.selected = undefined;
}
export function reset(state) {
    state.lastMove = undefined;
    unselect(state);
    unsetPremove(state);
}
export function setPieces(state, pieces) {
    for (const [key, piece] of pieces) {
        if (piece)
            state.boardState.pieces.set(key, piece);
        else
            state.boardState.pieces.delete(key);
    }
}
export function setCheck(state, arg) {
    if (Array.isArray(arg))
        state.check = arg;
    else {
        const color = arg === true ? state.turnColor : arg;
        state.check = [];
        if (color)
            for (const [k, p] of state.boardState.pieces)
                if (state.kingRoles.includes(p.role) && p.color === color)
                    state.check.push(k);
    }
}
function setPremove(state, orig, dest, meta) {
    state.premovable.current = [orig, dest];
    callUserFunction(state.premovable.events.set, orig, dest, meta);
}
export function unsetPremove(state) {
    if (state.premovable.current) {
        state.premovable.current = undefined;
        callUserFunction(state.premovable.events.unset);
    }
}
function tryAutoCastle(state, orig, dest) {
    if (!state.autoCastle)
        return false;
    const king = state.boardState.pieces.get(orig);
    if (!king || king.role !== 'k-piece')
        return false;
    const origPos = key2pos(orig);
    const destPos = key2pos(dest);
    if ((origPos[1] !== 0 && origPos[1] !== 7) || origPos[1] !== destPos[1])
        return false;
    if (origPos[0] === 4 && !state.boardState.pieces.has(dest)) {
        if (destPos[0] === 6)
            dest = pos2key([7, destPos[1]]);
        else if (destPos[0] === 2)
            dest = pos2key([0, destPos[1]]);
    }
    const rook = state.boardState.pieces.get(dest);
    if (!rook || rook.color !== king.color || rook.role !== 'r-piece')
        return false;
    state.boardState.pieces.delete(orig);
    state.boardState.pieces.delete(dest);
    if (origPos[0] < destPos[0]) {
        state.boardState.pieces.set(pos2key([6, destPos[1]]), king);
        state.boardState.pieces.set(pos2key([5, destPos[1]]), rook);
    }
    else {
        state.boardState.pieces.set(pos2key([2, destPos[1]]), king);
        state.boardState.pieces.set(pos2key([3, destPos[1]]), rook);
    }
    return true;
}
export function baseMove(state, orig, dest) {
    const origPiece = state.boardState.pieces.get(orig), destPiece = state.boardState.pieces.get(dest);
    if (orig === dest || !origPiece)
        return false;
    const captured = destPiece && destPiece.color !== origPiece.color ? destPiece : undefined;
    if (dest === state.selectable.selected)
        unselect(state);
    callUserFunction(state.events.move, orig, dest, captured);
    if (!tryAutoCastle(state, orig, dest)) {
        state.boardState.pieces.set(dest, origPiece);
        state.boardState.pieces.delete(orig);
    }
    state.lastMove = [orig, dest];
    state.check = undefined;
    callUserFunction(state.events.change);
    return captured || true;
}
export function baseNewPiece(state, piece, dest, fromPocket, force) {
    if (state.boardState.pieces.has(dest)) {
        if (force)
            state.boardState.pieces.delete(dest);
        else
            return false;
    }
    callUserFunction(state.events.dropNewPiece, piece, dest);
    state.boardState.pieces.set(dest, piece);
    if (fromPocket)
        changeNumber(state.boardState.pockets[piece.color], piece.role, -1);
    state.lastMove = [dropOrigOf(piece.role), dest];
    state.check = undefined;
    callUserFunction(state.events.change);
    state.movable.dests = undefined;
    state.turnColor = opposite(state.turnColor);
    return true;
}
function baseUserMove(state, orig, dest, fromPocket, force) {
    const result = isKey(orig) ? baseMove(state, orig, dest) : baseNewPiece(state, orig, dest, fromPocket, force);
    if (result) {
        state.movable.dests = undefined;
        state.turnColor = opposite(state.turnColor);
        state.animation.current = undefined;
    }
    return result;
}
export function userMove(state, orig, dest, fromPocket, force) {
    if (canMove(state, orig, dest, fromPocket) || force) {
        const result = baseUserMove(state, orig, dest, fromPocket, force);
        if (result) {
            const holdTime = state.hold.stop();
            unselect(state);
            const metadata = {
                premove: false,
                ctrlKey: state.stats.ctrlKey,
                holdTime,
            };
            if (result !== true)
                metadata.captured = result;
            if (isKey(orig))
                callUserFunction(state.movable.events.after, orig, dest, metadata);
            else
                callUserFunction(state.movable.events.afterNewPiece, orig, dest, metadata);
            return true;
        }
    }
    else if (canPremove(state, orig, dest, fromPocket)) {
        setPremove(state, isKey(orig) ? orig : dropOrigOf(orig.role), dest, {
            ctrlKey: state.stats.ctrlKey,
        });
        unselect(state);
        return true;
    }
    unselect(state);
    return false;
}
export function select(state, selected, force) {
    if (isKey(selected))
        callUserFunction(state.events.select, selected);
    else
        callUserFunction(state.events.selectPocket, selected);
    if (state.selectable.selected) {
        if (isSame(state.selectable.selected, selected) && !state.draggable.enabled) {
            unselect(state);
            state.hold.cancel();
            return;
        }
        else if ((state.selectable.enabled || force) && isKey(selected) && state.selectable.selected !== selected) {
            if (userMove(state, state.selectable.selected, selected, !!state.selectable.fromPocket)) {
                state.stats.dragged = false;
                return;
            }
        }
    }
    if ((state.selectable.enabled || state.draggable.enabled) &&
        (isMovable(state, selected, true) || isPremovable(state, selected, true))) {
        setSelected(state, selected, true);
        state.hold.start();
    }
}
export function setSelected(state, selected, fromPocket) {
    if (isKey(selected))
        setSelectedKey(state, selected);
    else
        setDropMode(state, selected, !!fromPocket);
}
export function setSelectedKey(state, key) {
    state.selectable.selected = key;
    state.selectable.fromPocket = false;
    if (isPremovable(state, key, false)) {
        state.premovable.dests = state.premovable.premoveFunc(state.boardState, key, state.premovable.castle);
    }
    else {
        state.premovable.dests = undefined;
    }
}
export function setDropMode(state, piece, fromPocket) {
    state.selectable.selected = piece;
    state.selectable.fromPocket = fromPocket;
    if (isPremovable(state, piece, fromPocket)) {
        state.premovable.dests = state.premovable.predropFunc(state.boardState, piece);
    }
    else {
        state.premovable.dests = undefined;
    }
}
export function unselect(state) {
    state.selectable.selected = undefined;
    state.premovable.dests = undefined;
    state.hold.cancel();
}
export function pieceAvailability(state, orig, fromPocket) {
    var _a, _b;
    let piece;
    let available = false;
    if (isKey(orig)) {
        piece = state.boardState.pieces.get(orig);
        available = !!piece;
    }
    else {
        piece = orig;
        const num = (_b = (_a = state.boardState.pockets) === null || _a === void 0 ? void 0 : _a[piece.color].get(piece.role)) !== null && _b !== void 0 ? _b : 0;
        available = !fromPocket || num > 0;
    }
    return [piece, available];
}
function isMovable(state, orig, fromPocket) {
    const [piece, available] = pieceAvailability(state, orig, fromPocket);
    return (available &&
        (state.movable.color === 'both' || (state.movable.color === piece.color && state.turnColor === piece.color)));
}
export const canMove = (state, orig, dest, fromPocket) => {
    var _a, _b;
    return orig !== dest &&
        isMovable(state, orig, fromPocket) &&
        (state.movable.free || !!((_b = (_a = state.movable.dests) === null || _a === void 0 ? void 0 : _a.get(isKey(orig) ? orig : dropOrigOf(orig.role))) === null || _b === void 0 ? void 0 : _b.includes(dest)));
};
function isPremovable(state, orig, fromPocket) {
    const [piece, available] = pieceAvailability(state, orig, fromPocket);
    return (available && state.premovable.enabled && state.movable.color === piece.color && state.turnColor !== piece.color);
}
const canPremove = (state, orig, dest, fromPocket) => orig !== dest &&
    isPremovable(state, orig, fromPocket) &&
    (isKey(orig)
        ? state.premovable.premoveFunc(state.boardState, orig, state.premovable.castle).includes(dest)
        : state.premovable.predropFunc(state.boardState, orig).includes(dest));
export function isDraggable(state, orig, fromPocket) {
    const [piece, available] = pieceAvailability(state, orig, fromPocket);
    return (available &&
        state.draggable.enabled &&
        (state.movable.color === 'both' ||
            (state.movable.color === piece.color && (state.turnColor === piece.color || state.premovable.enabled))));
}
export function playPremove(state) {
    const move = state.premovable.current;
    if (!move)
        return false;
    const orig = isKey(move[0]) ? move[0] : { role: roleOf(move[0]), color: state.turnColor };
    const dest = move[1];
    let success = false;
    if (canMove(state, orig, dest, true)) {
        const result = baseUserMove(state, orig, dest, true);
        if (result) {
            const metadata = { premove: true };
            if (result !== true)
                metadata.captured = result;
            if (isKey(orig))
                callUserFunction(state.movable.events.after, orig, dest, metadata);
            else
                callUserFunction(state.movable.events.afterNewPiece, orig, dest, metadata);
            success = true;
        }
    }
    unsetPremove(state);
    return success;
}
export function cancelMove(state) {
    unsetPremove(state);
    unselect(state);
}
export function stop(state) {
    state.movable.color = state.movable.dests = state.animation.current = undefined;
    cancelMove(state);
}
export function getKeyAtDomPos(pos, asWhite, bounds, bd) {
    let file = Math.floor((bd.width * (pos[0] - bounds.left)) / bounds.width);
    if (!asWhite)
        file = bd.width - 1 - file;
    let rank = bd.height - 1 - Math.floor((bd.height * (pos[1] - bounds.top)) / bounds.height);
    if (!asWhite)
        rank = bd.height - 1 - rank;
    return file >= 0 && file < bd.width && rank >= 0 && rank < bd.height ? pos2key([file, rank]) : undefined;
}
export function getSnappedKeyAtDomPos(orig, pos, asWhite, bounds, bd) {
    const origPos = key2pos(orig);
    const validSnapPos = allPos(bd).filter(pos2 => {
        return (queen(origPos[0], origPos[1], pos2[0], pos2[1]) ||
            knight(origPos[0], origPos[1], pos2[0], pos2[1]) ||
            // Only apply this to 9x10 board to avoid interfering with other variants beside Janggi
            (bd.width === 9 && bd.height === 10 && janggiElephant(origPos[0], origPos[1], pos2[0], pos2[1])));
    });
    const validSnapCenters = validSnapPos.map(pos2 => computeSquareCenter(pos2key(pos2), asWhite, bounds, bd));
    const validSnapDistances = validSnapCenters.map(pos2 => distanceSq(pos, pos2));
    const [, closestSnapIndex] = validSnapDistances.reduce((a, b, index) => (a[0] < b ? a : [b, index]), [validSnapDistances[0], 0]);
    return pos2key(validSnapPos[closestSnapIndex]);
}
export const whitePov = (s) => s.orientation === 'white';
//# sourceMappingURL=board.js.map