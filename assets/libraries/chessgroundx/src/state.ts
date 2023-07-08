import * as fen from './fen.js';
import { AnimCurrent } from './anim.js';
import { DragCurrent } from './drag.js';
import { Drawable } from './draw.js';
import { timer } from './util.js';
import { premove } from './premove.js';
import { predrop } from './predrop.js';
import * as cg from './types.js';

export interface HeadlessState {
  boardState: cg.BoardState;
  orientation: cg.Color; // board orientation. white | black
  turnColor: cg.Color; // turn to play. white | black
  check?: cg.Key[]; // squares currently in check ["a2"]
  lastMove?: cg.Orig[]; // squares or dropping piece part of the last move ["c3"; "c4"]
  coordinates: boolean; // include coords attributes
  ranksPosition: cg.RanksPosition; // position ranks on either side. left | right
  autoCastle: boolean; // immediately complete the castle by moving the rook after king move
  viewOnly: boolean; // don't bind events: the user will never be able to move pieces around
  disableContextMenu: boolean; // because who needs a context menu on a chessboard
  addPieceZIndex: boolean; // adds z-index values to pieces (for 3D)
  addDimensionsCssVarsTo?: HTMLElement; // add --cg-width and --cg-height CSS vars containing the board's dimensions to this element
  blockTouchScroll: boolean; // block scrolling via touch dragging on the board, e.g. for coordinate training
  pieceKey: boolean; // add a data-key attribute to piece elements
  highlight: {
    lastMove: boolean; // add last-move class to squares
    check: boolean; // add check class to squares
  };
  animation: {
    enabled: boolean;
    duration: number;
    current?: AnimCurrent;
  };
  movable: {
    free: boolean; // all moves are valid - board editor
    color?: cg.Color | 'both'; // color that can move. white | black | both
    dests?: cg.Dests; // valid moves. {"a2" ["a3" "a4"] "b1" ["a3" "c3"]}
    showDests: boolean; // whether to add the move-dest class on squares
    events: {
      after?: (orig: cg.Key, dest: cg.Key, metadata: cg.MoveMetadata) => void; // called after the move has been played
      afterNewPiece?: (piece: cg.Piece, dest: cg.Key, metadata: cg.MoveMetadata) => void; // called after a new piece is dropped on the board
    };
    rookCastle: boolean; // castle by moving the king to the rook
  };
  premovable: {
    enabled: boolean; // allow premoves for color that can not move
    premoveFunc: cg.Premove; // function for premove destinations
    predropFunc: cg.Predrop; // function for predrop destinations
    castle: boolean; // whether to allow king castle premoves
    dests?: cg.Key[]; // premove destinations for the current selection
    current?: cg.Move; // keys of the current saved premove ["e2" "e4"]
    events: {
      set?: (orig: cg.Orig, dest: cg.Key, metadata?: cg.SetPremoveMetadata) => void; // called after the premove has been set
      unset?: () => void; // called after the premove has been unset
    };
  };
  draggable: {
    enabled: boolean; // allow moves & premoves to use drag'n drop
    distance: number; // minimum distance to initiate a drag; in pixels
    autoDistance: boolean; // lets chessground set distance to zero when user drags pieces
    showGhost: boolean; // show ghost of piece being dragged
    deleteOnDropOff: boolean; // delete a piece when it is dropped off the board
    current?: DragCurrent;
  };
  selectable: {
    // disable to enforce dragging over click-click move
    enabled: boolean;
    selected?: cg.Selectable;
    fromPocket?: boolean;
  };
  stats: {
    // was last piece dragged or clicked?
    // needs default to false for touch
    dragged: boolean;
    ctrlKey?: boolean;
  };
  events: {
    change?: () => void; // called after the situation changes on the board
    // called after a piece has been moved.
    // capturedPiece is undefined or like {color: 'white'; 'role': 'queen'}
    move?: (orig: cg.Key, dest: cg.Key, capturedPiece?: cg.Piece) => void;
    dropNewPiece?: (piece: cg.Piece, key: cg.Key) => void;
    select?: (key: cg.Key) => void; // called when a square is selected
    selectPocket?: (piece: cg.Piece) => void; // called when a pocket piece is selected
    insert?: (elements: cg.Elements) => void; // when the board DOM has been (re)inserted
  };
  drawable: Drawable;
  exploding?: cg.Exploding;
  hold: cg.Timer;
  dimensions: cg.BoardDimensions; // number of lines and ranks of the board {width: 10, height: 8}
  notation: cg.Notation;
  kingRoles: cg.Role[]; // roles to be marked with check
  pocketRoles?: cg.PocketRoles; // undefined for non-pocket variants. Possible pieces that a pocket can hold for each color
}

export interface State extends HeadlessState {
  dom: cg.Dom;
}

export function defaults(): HeadlessState {
  return {
    boardState: fen.read(fen.initial, { width: 8, height: 8 }),
    orientation: 'white',
    turnColor: 'white',
    coordinates: true,
    ranksPosition: 'right',
    autoCastle: true,
    viewOnly: false,
    disableContextMenu: false,
    addPieceZIndex: false,
    blockTouchScroll: false,
    pieceKey: false,
    highlight: {
      lastMove: true,
      check: true,
    },
    animation: {
      enabled: true,
      duration: 200,
    },
    movable: {
      free: true,
      color: 'both',
      showDests: true,
      events: {},
      rookCastle: true,
    },
    premovable: {
      enabled: true,
      premoveFunc: premove('chess', false, { width: 8, height: 8 }),
      predropFunc: predrop('chess', { width: 8, height: 8 }),
      castle: true,
      events: {},
    },
    draggable: {
      enabled: true,
      distance: 3,
      autoDistance: true,
      showGhost: true,
      deleteOnDropOff: false,
    },
    selectable: {
      enabled: true,
    },
    stats: {
      // on touchscreen, default to "tap-tap" moves
      // instead of drag
      dragged: !('ontouchstart' in window),
    },
    events: {},
    drawable: {
      enabled: true, // can draw
      visible: true, // can view
      defaultSnapToValidMove: true,
      eraseOnClick: true,
      shapes: [],
      autoShapes: [],
      brushes: {
        green: { key: 'g', color: '#15781B', opacity: 1, lineWidth: 10 },
        red: { key: 'r', color: '#882020', opacity: 1, lineWidth: 10 },
        blue: { key: 'b', color: '#003088', opacity: 1, lineWidth: 10 },
        yellow: { key: 'y', color: '#e68f00', opacity: 1, lineWidth: 10 },
        paleBlue: { key: 'pb', color: '#003088', opacity: 0.4, lineWidth: 15 },
        paleGreen: { key: 'pg', color: '#15781B', opacity: 0.4, lineWidth: 15 },
        paleRed: { key: 'pr', color: '#882020', opacity: 0.4, lineWidth: 15 },
        paleGrey: {
          key: 'pgr',
          color: '#4a4a4a',
          opacity: 0.35,
          lineWidth: 15,
        },
      },
      prevSvgHash: '',
    },
    hold: timer(),
    dimensions: { width: 8, height: 8 },
    notation: cg.Notation.ALGEBRAIC,
    kingRoles: ['k-piece'],
  };
}
