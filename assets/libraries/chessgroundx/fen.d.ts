import * as cg from './types.js';
export declare const initial: cg.FEN;
export declare function read(fen: cg.FEN, bd: cg.BoardDimensions): cg.BoardState;
export declare function write(boardState: cg.BoardState, bd: cg.BoardDimensions): cg.FEN;
export declare function writeBoard(pieces: cg.Pieces, bd: cg.BoardDimensions): cg.FEN;
