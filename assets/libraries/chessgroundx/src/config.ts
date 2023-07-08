import { HeadlessState } from './state.js';
import { setCheck, setSelected } from './board.js';
import { read as fenRead } from './fen.js';
import { DrawShape, DrawBrushes } from './draw.js';
import * as cg from './types.js';

export interface Config {
  fen?: cg.FEN; // chess position in Forsyth notation
  orientation?: cg.Color; // board orientation. white | black
  turnColor?: cg.Color; // turn to play. white | black
  check?: cg.Color | boolean | cg.Key[]; // true for current color, false to unset, array to force squares
  lastMove?: cg.Orig[]; // squares part of the last move ["c3", "c4"]
  coordinates?: boolean; // include coords attributes
  autoCastle?: boolean; // immediately complete the castle by moving the rook after king move
  viewOnly?: boolean; // don't bind events: the user will never be able to move pieces around
  disableContextMenu?: boolean; // because who needs a context menu on a chessboard
  addPieceZIndex?: boolean; // adds z-index values to pieces (for 3D)
  addDimensionsCssVarsTo?: HTMLElement; // add --cg-width and --cg-height CSS vars containing the board's dimensions to this element
  blockTouchScroll?: boolean; // block scrolling via touch dragging on the board, e.g. for coordinate training
  // pieceKey: boolean; // add a data-key attribute to piece elements
  highlight?: {
    lastMove?: boolean; // add last-move class to squares
    check?: boolean; // add check class to squares
  };
  animation?: {
    enabled?: boolean;
    duration?: number;
  };
  movable?: {
    free?: boolean; // all moves are valid - board editor
    color?: cg.Color | 'both'; // color that can move. white | black | both | undefined
    dests?: cg.Dests; // valid moves. {"a2" ["a3" "a4"] "b1" ["a3" "c3"]}
    showDests?: boolean; // whether to add the move-dest class on squares
    events?: {
      after?: (orig: cg.Key, dest: cg.Key, metadata: cg.MoveMetadata) => void; // called after the move has been played
      afterNewPiece?: (piece: cg.Piece, key: cg.Key, metadata: cg.MoveMetadata) => void; // called after a new piece is dropped on the board
    };
    rookCastle?: boolean; // castle by moving the king to the rook
  };
  premovable?: {
    enabled?: boolean; // allow premoves for color that can not move
    premoveFunc?: cg.Premove; // function for premove destinations
    predropFunc?: cg.Predrop; // function for predrop destinations
    castle?: boolean; // whether to allow king castle premoves
    dests?: cg.Key[]; // premove destinations for the current selection
    events?: {
      set?: (orig: cg.Orig, dest: cg.Key, metadata?: cg.SetPremoveMetadata) => void; // called after the premove has been set
      unset?: () => void; // called after the premove has been unset
    };
  };
  draggable?: {
    enabled?: boolean; // allow moves & premoves to use drag'n drop
    distance?: number; // minimum distance to initiate a drag; in pixels
    autoDistance?: boolean; // lets chessground set distance to zero when user drags pieces
    showGhost?: boolean; // show ghost of piece being dragged
    deleteOnDropOff?: boolean; // delete a piece when it is dropped off the board
  };
  selectable?: {
    enabled?: boolean; // disable to enforce dragging over click-click move
    selected?: cg.Selectable; // square or piece currently selected "a1"
    fromPocket?: boolean; // whether the selected piece is from the pocket
  };
  events?: {
    change?: () => void; // called after the situation changes on the board
    // called after a piece has been moved.
    // capturedPiece is undefined or like {color: 'white'; 'role': 'queen'}
    move?: (orig: cg.Key, dest: cg.Key, capturedPiece?: cg.Piece) => void;
    dropNewPiece?: (piece: cg.Piece, key: cg.Key) => void;
    select?: (key: cg.Key) => void; // called when a square is selected
    insert?: (elements: cg.Elements) => void; // when the board DOM has been (re)inserted
  };
  drawable?: {
    enabled?: boolean; // can draw
    visible?: boolean; // can view
    defaultSnapToValidMove?: boolean;
    // false to keep the drawing if a movable piece is clicked.
    // Clicking an empty square or immovable piece will clear the drawing regardless.
    eraseOnClick?: boolean;
    shapes?: DrawShape[];
    autoShapes?: DrawShape[];
    brushes?: DrawBrushes;
    onChange?: (shapes: DrawShape[]) => void; // called after drawable shapes change
  };
  dimensions?: cg.BoardDimensions;
  notation?: cg.Notation; // coord notation style
  kingRoles?: cg.Role[]; // roles to be marked with check
  pocketRoles?: cg.PocketRoles; // what pieces have slots in the pocket for each color
}

export function applyAnimation(state: HeadlessState, config: Config): void {
  if (config.animation) {
    deepMerge(state.animation, config.animation);
    // no need for such short animations
    if ((state.animation.duration || 0) < 70) state.animation.enabled = false;
  }
}

export function configure(state: HeadlessState, config: Config): void {
  // don't merge destinations and autoShapes. Just override.
  if (config.movable?.dests) state.movable.dests = undefined;
  if (config.drawable?.autoShapes) state.drawable.autoShapes = [];

  deepMerge(state, config);

  // if a fen was provided, replace the pieces
  if (config.fen) {
    const boardState = fenRead(config.fen, state.dimensions);
    // prevent calling cancel() if piece drag is already started from pocket!
    const draggedPiece = state.boardState.pieces.get('a0');
    if (draggedPiece !== undefined) boardState.pieces.set('a0', draggedPiece);
    // set the pocket to empty instead of undefined if pocketRoles exists
    // likewise, set the pocket to undefined if pocketRoles is undefined
    if (state.pocketRoles) boardState.pockets = boardState.pockets ?? { white: new Map(), black: new Map() };
    else boardState.pockets = undefined;
    state.boardState = boardState;
    state.drawable.shapes = [];
  }

  // apply config values that could be undefined yet meaningful
  if ('check' in config || 'kingRoles' in config) setCheck(state, config.check || false);
  if ('lastMove' in config && !config.lastMove) state.lastMove = undefined;
  // in case of ZH drop last move, there's a single square.
  // if the previous last move had two squares,
  // the merge algorithm will incorrectly keep the second square.
  else if (config.lastMove) state.lastMove = config.lastMove;

  // fix move/premove dests
  if (state.selectable.selected) setSelected(state, state.selectable.selected, state.selectable.fromPocket);

  applyAnimation(state, config);

  if (!state.movable.rookCastle && state.movable.dests) {
    const rank = state.movable.color === 'white' ? '1' : '8',
      kingStartPos = ('e' + rank) as cg.Key,
      dests = state.movable.dests.get(kingStartPos),
      king = state.boardState.pieces.get(kingStartPos);
    if (!dests || !king || king.role !== 'k-piece') return;
    state.movable.dests.set(
      kingStartPos,
      dests.filter(
        d =>
          !(d === 'a' + rank && dests.includes(('c' + rank) as cg.Key)) &&
          !(d === 'h' + rank && dests.includes(('g' + rank) as cg.Key))
      )
    );
  }
}

function deepMerge(base: any, extend: any): void {
  for (const key in extend) {
    if (Object.prototype.hasOwnProperty.call(extend, key)) {
      if (Object.prototype.hasOwnProperty.call(base, key) && isPlainObject(base[key]) && isPlainObject(extend[key]))
        deepMerge(base[key], extend[key]);
      else base[key] = extend[key];
    }
  }
}

function isPlainObject(o: unknown): boolean {
  if (typeof o !== 'object' || o === null) return false;
  const proto = Object.getPrototypeOf(o);
  return proto === Object.prototype || proto === null;
}
