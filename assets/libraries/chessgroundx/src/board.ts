import { HeadlessState } from './state.js';
import {
  pos2key,
  key2pos,
  opposite,
  distanceSq,
  allPos,
  computeSquareCenter,
  roleOf,
  dropOrigOf,
  changeNumber,
  isKey,
  isSame,
} from './util.js';
import { queen, knight, janggiElephant } from './premove.js';
import * as cg from './types.js';

export function callUserFunction<T extends (...args: any[]) => void>(f: T | undefined, ...args: Parameters<T>): void {
  if (f) setTimeout(() => f(...args), 1);
}

export function toggleOrientation(state: HeadlessState): void {
  state.orientation = opposite(state.orientation);
  state.animation.current = state.draggable.current = state.selectable.selected = undefined;
}

export function reset(state: HeadlessState): void {
  state.lastMove = undefined;
  unselect(state);
  unsetPremove(state);
}

export function setPieces(state: HeadlessState, pieces: cg.PiecesDiff): void {
  for (const [key, piece] of pieces) {
    if (piece) state.boardState.pieces.set(key, piece);
    else state.boardState.pieces.delete(key);
  }
}

export function setCheck(state: HeadlessState, arg: cg.Color | boolean | cg.Key[]): void {
  if (Array.isArray(arg)) state.check = arg;
  else {
    const color = arg === true ? state.turnColor : arg;
    state.check = [];
    if (color)
      for (const [k, p] of state.boardState.pieces)
        if (state.kingRoles.includes(p.role) && p.color === color)
          state.check.push(k);
  }
}

function setPremove(state: HeadlessState, orig: cg.Orig, dest: cg.Key, meta: cg.SetPremoveMetadata): void {
  state.premovable.current = [orig, dest];
  callUserFunction(state.premovable.events.set, orig, dest, meta);
}

export function unsetPremove(state: HeadlessState): void {
  if (state.premovable.current) {
    state.premovable.current = undefined;
    callUserFunction(state.premovable.events.unset);
  }
}

function tryAutoCastle(state: HeadlessState, orig: cg.Key, dest: cg.Key): boolean {
  if (!state.autoCastle) return false;

  const king = state.boardState.pieces.get(orig);
  if (!king || king.role !== 'k-piece') return false;

  const origPos = key2pos(orig);
  const destPos = key2pos(dest);
  if ((origPos[1] !== 0 && origPos[1] !== 7) || origPos[1] !== destPos[1]) return false;
  if (origPos[0] === 4 && !state.boardState.pieces.has(dest)) {
    if (destPos[0] === 6) dest = pos2key([7, destPos[1]]);
    else if (destPos[0] === 2) dest = pos2key([0, destPos[1]]);
  }
  const rook = state.boardState.pieces.get(dest);
  if (!rook || rook.color !== king.color || rook.role !== 'r-piece') return false;

  state.boardState.pieces.delete(orig);
  state.boardState.pieces.delete(dest);

  if (origPos[0] < destPos[0]) {
    state.boardState.pieces.set(pos2key([6, destPos[1]]), king);
    state.boardState.pieces.set(pos2key([5, destPos[1]]), rook);
  } else {
    state.boardState.pieces.set(pos2key([2, destPos[1]]), king);
    state.boardState.pieces.set(pos2key([3, destPos[1]]), rook);
  }
  return true;
}

export function baseMove(state: HeadlessState, orig: cg.Key, dest: cg.Key): cg.Piece | boolean {
  const origPiece = state.boardState.pieces.get(orig),
    destPiece = state.boardState.pieces.get(dest);
  if (orig === dest || !origPiece) return false;
  const captured = destPiece && destPiece.color !== origPiece.color ? destPiece : undefined;
  if (dest === state.selectable.selected) unselect(state);
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

export function baseNewPiece(
  state: HeadlessState,
  piece: cg.Piece,
  dest: cg.Key,
  fromPocket: boolean,
  force?: boolean
): boolean {
  if (state.boardState.pieces.has(dest)) {
    if (force) state.boardState.pieces.delete(dest);
    else return false;
  }
  callUserFunction(state.events.dropNewPiece, piece, dest);
  state.boardState.pieces.set(dest, piece);
  if (fromPocket) changeNumber(state.boardState.pockets![piece.color], piece.role, -1);
  state.lastMove = [dropOrigOf(piece.role), dest];
  state.check = undefined;
  callUserFunction(state.events.change);
  state.movable.dests = undefined;
  state.turnColor = opposite(state.turnColor);
  return true;
}

function baseUserMove(
  state: HeadlessState,
  orig: cg.Selectable,
  dest: cg.Key,
  fromPocket: boolean,
  force?: boolean
): cg.Piece | boolean {
  const result = isKey(orig) ? baseMove(state, orig, dest) : baseNewPiece(state, orig, dest, fromPocket, force);
  if (result) {
    state.movable.dests = undefined;
    state.turnColor = opposite(state.turnColor);
    state.animation.current = undefined;
  }
  return result;
}

export function userMove(
  state: HeadlessState,
  orig: cg.Selectable,
  dest: cg.Key,
  fromPocket: boolean,
  force?: boolean
): boolean {
  if (canMove(state, orig, dest, fromPocket) || force) {
    const result = baseUserMove(state, orig, dest, fromPocket, force);
    if (result) {
      const holdTime = state.hold.stop();
      unselect(state);
      const metadata: cg.MoveMetadata = {
        premove: false,
        ctrlKey: state.stats.ctrlKey,
        holdTime,
      };
      if (result !== true) metadata.captured = result;
      if (isKey(orig)) callUserFunction(state.movable.events.after, orig, dest, metadata);
      else callUserFunction(state.movable.events.afterNewPiece, orig, dest, metadata);
      return true;
    }
  } else if (canPremove(state, orig, dest, fromPocket)) {
    setPremove(state, isKey(orig) ? orig : dropOrigOf(orig.role), dest, {
      ctrlKey: state.stats.ctrlKey,
    });
    unselect(state);
    return true;
  }
  unselect(state);
  return false;
}

export function select(state: HeadlessState, selected: cg.Selectable, force?: boolean): void {
  if (isKey(selected)) callUserFunction(state.events.select, selected);
  else callUserFunction(state.events.selectPocket, selected);
  if (state.selectable.selected) {
    if (isSame(state.selectable.selected, selected) && !state.draggable.enabled) {
      unselect(state);
      state.hold.cancel();
      return;
    } else if ((state.selectable.enabled || force) && isKey(selected) && state.selectable.selected !== selected) {
      if (userMove(state, state.selectable.selected, selected, !!state.selectable.fromPocket)) {
        state.stats.dragged = false;
        return;
      }
    }
  }
  if (
    (state.selectable.enabled || state.draggable.enabled) &&
    (isMovable(state, selected, true) || isPremovable(state, selected, true))
  ) {
    setSelected(state, selected, true);
    state.hold.start();
  }
}

export function setSelected(state: HeadlessState, selected: cg.Selectable, fromPocket?: boolean): void {
  if (isKey(selected)) setSelectedKey(state, selected);
  else setDropMode(state, selected, !!fromPocket);
}

export function setSelectedKey(state: HeadlessState, key: cg.Key): void {
  state.selectable.selected = key;
  state.selectable.fromPocket = false;
  if (isPremovable(state, key, false)) {
    state.premovable.dests = state.premovable.premoveFunc(state.boardState, key, state.premovable.castle);
  } else {
    state.premovable.dests = undefined;
  }
}

export function setDropMode(state: HeadlessState, piece: cg.Piece, fromPocket: boolean): void {
  state.selectable.selected = piece;
  state.selectable.fromPocket = fromPocket;
  if (isPremovable(state, piece, fromPocket)) {
    state.premovable.dests = state.premovable.predropFunc(state.boardState, piece);
  } else {
    state.premovable.dests = undefined;
  }
}

export function unselect(state: HeadlessState): void {
  state.selectable.selected = undefined;
  state.premovable.dests = undefined;
  state.hold.cancel();
}

export function pieceAvailability(
  state: HeadlessState,
  orig: cg.Selectable,
  fromPocket: boolean
): [cg.Piece | undefined, boolean] {
  let piece: cg.Piece | undefined;
  let available = false;
  if (isKey(orig)) {
    piece = state.boardState.pieces.get(orig);
    available = !!piece;
  } else {
    piece = orig;
    const num = state.boardState.pockets?.[piece.color].get(piece.role) ?? 0;
    available = !fromPocket || num > 0;
  }
  return [piece, available];
}

function isMovable(state: HeadlessState, orig: cg.Selectable, fromPocket: boolean): boolean {
  const [piece, available] = pieceAvailability(state, orig, fromPocket);
  return (
    available &&
    (state.movable.color === 'both' || (state.movable.color === piece!.color && state.turnColor === piece!.color))
  );
}

export const canMove = (state: HeadlessState, orig: cg.Selectable, dest: cg.Key, fromPocket: boolean): boolean =>
  orig !== dest &&
  isMovable(state, orig, fromPocket) &&
  (state.movable.free || !!state.movable.dests?.get(isKey(orig) ? orig : dropOrigOf(orig.role))?.includes(dest));

function isPremovable(state: HeadlessState, orig: cg.Selectable, fromPocket: boolean): boolean {
  const [piece, available] = pieceAvailability(state, orig, fromPocket);
  return (
    available && state.premovable.enabled && state.movable.color === piece!.color && state.turnColor !== piece!.color
  );
}

const canPremove = (state: HeadlessState, orig: cg.Selectable, dest: cg.Key, fromPocket: boolean): boolean =>
  orig !== dest &&
  isPremovable(state, orig, fromPocket) &&
  (isKey(orig)
    ? state.premovable.premoveFunc(state.boardState, orig, state.premovable.castle).includes(dest)
    : state.premovable.predropFunc(state.boardState, orig).includes(dest));

export function isDraggable(state: HeadlessState, orig: cg.Selectable, fromPocket: boolean): boolean {
  const [piece, available] = pieceAvailability(state, orig, fromPocket);
  return (
    available &&
    state.draggable.enabled &&
    (state.movable.color === 'both' ||
      (state.movable.color === piece!.color && (state.turnColor === piece!.color || state.premovable.enabled)))
  );
}

export function playPremove(state: HeadlessState): boolean {
  const move = state.premovable.current;
  if (!move) return false;
  const orig = isKey(move[0]) ? move[0] : { role: roleOf(move[0]), color: state.turnColor };
  const dest = move[1];
  let success = false;
  if (canMove(state, orig, dest, true)) {
    const result = baseUserMove(state, orig, dest, true);
    if (result) {
      const metadata: cg.MoveMetadata = { premove: true };
      if (result !== true) metadata.captured = result;
      if (isKey(orig)) callUserFunction(state.movable.events.after, orig, dest, metadata);
      else callUserFunction(state.movable.events.afterNewPiece, orig, dest, metadata);
      success = true;
    }
  }
  unsetPremove(state);
  return success;
}

export function cancelMove(state: HeadlessState): void {
  unsetPremove(state);
  unselect(state);
}

export function stop(state: HeadlessState): void {
  state.movable.color = state.movable.dests = state.animation.current = undefined;
  cancelMove(state);
}

export function getKeyAtDomPos(
  pos: cg.NumberPair,
  asWhite: boolean,
  bounds: ClientRect,
  bd: cg.BoardDimensions
): cg.Key | undefined {
  let file = Math.floor((bd.width * (pos[0] - bounds.left)) / bounds.width);
  if (!asWhite) file = bd.width - 1 - file;
  let rank = bd.height - 1 - Math.floor((bd.height * (pos[1] - bounds.top)) / bounds.height);
  if (!asWhite) rank = bd.height - 1 - rank;
  return file >= 0 && file < bd.width && rank >= 0 && rank < bd.height ? pos2key([file, rank]) : undefined;
}

export function getSnappedKeyAtDomPos(
  orig: cg.Key,
  pos: cg.NumberPair,
  asWhite: boolean,
  bounds: ClientRect,
  bd: cg.BoardDimensions
): cg.Key | undefined {
  const origPos = key2pos(orig);
  const validSnapPos = allPos(bd).filter(pos2 => {
    return (
      queen(origPos[0], origPos[1], pos2[0], pos2[1]) ||
      knight(origPos[0], origPos[1], pos2[0], pos2[1]) ||
      // Only apply this to 9x10 board to avoid interfering with other variants beside Janggi
      (bd.width === 9 && bd.height === 10 && janggiElephant(origPos[0], origPos[1], pos2[0], pos2[1]))
    );
  });
  const validSnapCenters = validSnapPos.map(pos2 => computeSquareCenter(pos2key(pos2), asWhite, bounds, bd));
  const validSnapDistances = validSnapCenters.map(pos2 => distanceSq(pos, pos2));
  const [, closestSnapIndex] = validSnapDistances.reduce(
    (a, b, index) => (a[0] < b ? a : [b, index]),
    [validSnapDistances[0], 0]
  );
  return pos2key(validSnapPos[closestSnapIndex]);
}

export const whitePov = (s: HeadlessState): boolean => s.orientation === 'white';
