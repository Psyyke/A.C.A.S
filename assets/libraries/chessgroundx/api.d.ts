import { State } from './state.js';
import { Config } from './config.js';
import { DrawShape } from './draw.js';
import * as cg from './types.js';
export interface Api {
    set(config: Config): void;
    state: State;
    getFen(): cg.FEN;
    toggleOrientation(): void;
    move(orig: cg.Orig, dest: cg.Key): void;
    setPieces(pieces: cg.PiecesDiff): void;
    changePocket(piece: cg.Piece, num: number): void;
    selectSquare(key: cg.Key | null, force?: boolean): void;
    selectPocket(piece: cg.Piece | null): void;
    unselect(): void;
    newPiece(piece: cg.Piece, dest: cg.Key, fromPocket: boolean): void;
    playPremove(): boolean;
    cancelPremove(): void;
    cancelMove(): void;
    stop(): void;
    explode(keys: cg.Key[]): void;
    setShapes(shapes: DrawShape[]): void;
    setAutoShapes(shapes: DrawShape[]): void;
    getKeyAtDomPos(pos: cg.NumberPair): cg.Key | undefined;
    redrawAll: cg.Redraw;
    dragNewPiece(piece: cg.Piece, fromPocket: boolean, event: cg.MouchEvent, force?: boolean): void;
    destroy: cg.Unbind;
}
export declare function start(state: State, redrawAll: cg.Redraw): Api;
