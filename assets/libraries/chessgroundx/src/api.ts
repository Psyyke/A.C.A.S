import { State } from './state.js';
import * as board from './board.js';
import { write as fenWrite } from './fen.js';
import { Config, configure, applyAnimation } from './config.js';
import { anim, render } from './anim.js';
import { cancel as dragCancel, dragNewPiece } from './drag.js';
import { DrawShape } from './draw.js';
import { explosion } from './explosion.js';
import { roleOf, isDropOrig, changeNumber } from './util.js';
import * as cg from './types.js';

export interface Api {
  // reconfigure the instance. Accepts all config options, except for viewOnly & drawable.visible.
  // board will be animated accordingly, if animations are enabled.
  set(config: Config): void;

  // read chessground state; write at your own risks.
  state: State;

  // get the position as a FEN string (only contains pieces, no flags)
  // e.g. rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR
  getFen(): cg.FEN;

  // change the view angle
  toggleOrientation(): void;

  // perform a move programmatically
  move(orig: cg.Orig, dest: cg.Key): void;

  // add and/or remove arbitrary pieces on the board
  setPieces(pieces: cg.PiecesDiff): void;

  // add and/or remove arbitrary pieces from the pocket
  changePocket(piece: cg.Piece, num: number): void;

  // click a square programmatically
  selectSquare(key: cg.Key | null, force?: boolean): void;

  // click a pocket piece programmatically
  selectPocket(piece: cg.Piece | null): void;

  // unselect everything programmatically
  unselect(): void;

  // put a new piece on the board
  newPiece(piece: cg.Piece, dest: cg.Key, fromPocket: boolean): void;

  // play the current premove, if any; returns true if premove was played
  playPremove(): boolean;

  // cancel the current premove, if any
  cancelPremove(): void;

  // cancel the current move being made
  cancelMove(): void;

  // cancel current move and prevent further ones
  stop(): void;

  // make squares explode (atomic chess)
  explode(keys: cg.Key[]): void;

  // programmatically draw user shapes
  setShapes(shapes: DrawShape[]): void;

  // programmatically draw auto shapes
  setAutoShapes(shapes: DrawShape[]): void;

  // square name at this DOM position (like "e4")
  getKeyAtDomPos(pos: cg.NumberPair): cg.Key | undefined;

  // only useful when CSS changes the board width/height ratio (for 3D)
  redrawAll: cg.Redraw;

  // for crazyhouse and board editors
  dragNewPiece(piece: cg.Piece, fromPocket: boolean, event: cg.MouchEvent, force?: boolean): void;

  // unbinds all events
  // (important for document-wide events like scroll and mousemove)
  destroy: cg.Unbind;
}

// see API types and documentations in dts/api.d.ts
export function start(state: State, redrawAll: cg.Redraw): Api {
  function toggleOrientation(): void {
    board.toggleOrientation(state);
    redrawAll();
  }

  return {
    set(config): void {
      if (config.orientation && config.orientation !== state.orientation) toggleOrientation();
      applyAnimation(state, config);
      (config.fen ? anim : render)(state => configure(state, config), state);
    },

    state,

    getFen: () => fenWrite(state.boardState, state.dimensions),

    toggleOrientation,

    setPieces(pieces): void {
      anim(state => board.setPieces(state, pieces), state);
    },

    changePocket(piece, num): void {
      if (state.pocketRoles?.[piece.color].includes(piece.role)) {
        changeNumber(state.boardState.pockets![piece.color], piece.role, num);
        state.dom.redraw();
      }
    },

    selectSquare(key, force): void {
      if (key) anim(state => board.select(state, key, force), state);
      else if (state.selectable.selected) {
        board.unselect(state);
        state.dom.redraw();
      }
    },

    selectPocket(piece): void {
      if (piece) anim(state => board.select(state, piece), state);
      else if (state.selectable.selected) {
        board.unselect(state);
        state.dom.redraw();
      }
    },

    unselect(): void {
      board.unselect(state);
    },

    move(orig, dest): void {
      if (isDropOrig(orig)) board.baseNewPiece(state, { role: roleOf(orig), color: state.turnColor }, dest, true);
      else anim(state => board.baseMove(state, orig, dest), state);
    },

    newPiece(piece, key, fromPocket): void {
      anim(state => board.baseNewPiece(state, piece, key, fromPocket), state);
    },

    playPremove(): boolean {
      if (state.premovable.current) {
        if (anim(board.playPremove, state)) return true;
        // if the premove couldn't be played, redraw to clear it up
        state.dom.redraw();
      }
      return false;
    },

    cancelPremove(): void {
      render(board.unsetPremove, state);
    },

    cancelMove(): void {
      render(state => {
        board.cancelMove(state);
        dragCancel(state);
      }, state);
    },

    stop(): void {
      render(state => {
        board.stop(state);
        dragCancel(state);
      }, state);
    },

    explode(keys: cg.Key[]): void {
      explosion(state, keys);
    },

    setAutoShapes(shapes: DrawShape[]): void {
      render(state => (state.drawable.autoShapes = shapes), state);
    },

    setShapes(shapes: DrawShape[]): void {
      render(state => (state.drawable.shapes = shapes), state);
    },

    getKeyAtDomPos(pos): cg.Key | undefined {
      return board.getKeyAtDomPos(pos, board.whitePov(state), state.dom.bounds(), state.dimensions);
    },

    redrawAll,

    dragNewPiece(piece, fromPocket, event, force): void {
      dragNewPiece(state, piece, fromPocket, event, undefined, force);
    },

    destroy(): void {
      board.stop(state);
      state.dom.unbind && state.dom.unbind();
      state.dom.destroyed = true;
    },
  };
}
