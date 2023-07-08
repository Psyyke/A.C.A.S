import { AnimCurrent } from './anim.js';
import { DragCurrent } from './drag.js';
import { Drawable } from './draw.js';
import * as cg from './types.js';
export interface HeadlessState {
    boardState: cg.BoardState;
    orientation: cg.Color;
    turnColor: cg.Color;
    check?: cg.Key[];
    lastMove?: cg.Orig[];
    coordinates: boolean;
    ranksPosition: cg.RanksPosition;
    autoCastle: boolean;
    viewOnly: boolean;
    disableContextMenu: boolean;
    addPieceZIndex: boolean;
    addDimensionsCssVarsTo?: HTMLElement;
    blockTouchScroll: boolean;
    pieceKey: boolean;
    highlight: {
        lastMove: boolean;
        check: boolean;
    };
    animation: {
        enabled: boolean;
        duration: number;
        current?: AnimCurrent;
    };
    movable: {
        free: boolean;
        color?: cg.Color | 'both';
        dests?: cg.Dests;
        showDests: boolean;
        events: {
            after?: (orig: cg.Key, dest: cg.Key, metadata: cg.MoveMetadata) => void;
            afterNewPiece?: (piece: cg.Piece, dest: cg.Key, metadata: cg.MoveMetadata) => void;
        };
        rookCastle: boolean;
    };
    premovable: {
        enabled: boolean;
        premoveFunc: cg.Premove;
        predropFunc: cg.Predrop;
        castle: boolean;
        dests?: cg.Key[];
        current?: cg.Move;
        events: {
            set?: (orig: cg.Orig, dest: cg.Key, metadata?: cg.SetPremoveMetadata) => void;
            unset?: () => void;
        };
    };
    draggable: {
        enabled: boolean;
        distance: number;
        autoDistance: boolean;
        showGhost: boolean;
        deleteOnDropOff: boolean;
        current?: DragCurrent;
    };
    selectable: {
        enabled: boolean;
        selected?: cg.Selectable;
        fromPocket?: boolean;
    };
    stats: {
        dragged: boolean;
        ctrlKey?: boolean;
    };
    events: {
        change?: () => void;
        move?: (orig: cg.Key, dest: cg.Key, capturedPiece?: cg.Piece) => void;
        dropNewPiece?: (piece: cg.Piece, key: cg.Key) => void;
        select?: (key: cg.Key) => void;
        selectPocket?: (piece: cg.Piece) => void;
        insert?: (elements: cg.Elements) => void;
    };
    drawable: Drawable;
    exploding?: cg.Exploding;
    hold: cg.Timer;
    dimensions: cg.BoardDimensions;
    notation: cg.Notation;
    kingRoles: cg.Role[];
    pocketRoles?: cg.PocketRoles;
}
export interface State extends HeadlessState {
    dom: cg.Dom;
}
export declare function defaults(): HeadlessState;
