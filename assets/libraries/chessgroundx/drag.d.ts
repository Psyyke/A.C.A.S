import { State } from './state.js';
import * as cg from './types.js';
export interface DragCurrent {
    orig: cg.Key;
    piece: cg.Piece;
    origPos: cg.NumberPair;
    pos: cg.NumberPair;
    started: boolean;
    element: cg.PieceNode | (() => cg.PieceNode | undefined);
    fromPocket?: boolean;
    force?: boolean;
    previouslySelected?: cg.Selectable;
    originTarget: EventTarget | null;
    keyHasChanged: boolean;
}
export declare function start(s: State, e: cg.MouchEvent): void;
export declare function dragNewPiece(s: State, piece: cg.Piece, fromPocket: boolean, e: cg.MouchEvent, previouslySelected?: cg.Selectable, force?: boolean): void;
export declare function processDrag(s: State): void;
export declare function move(s: State, e: cg.MouchEvent): void;
export declare function end(s: State, e: cg.MouchEvent): void;
export declare function cancel(s: State): void;
export declare function pieceElementByKey(s: State, key: cg.Key): cg.PieceNode | undefined;
