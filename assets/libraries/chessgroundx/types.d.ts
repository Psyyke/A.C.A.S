export declare type Color = typeof colors[number];
export declare type Side = typeof sides[number];
export declare type Alphabet = typeof letters[number];
export declare type Letter = `${'' | '+'}${Alphabet | Uppercase<Alphabet> | '*'}`;
export declare type Role = `${'' | 'p'}${Alphabet | '_'}-piece`;
export declare type File = typeof files[number];
export declare type Rank = typeof ranks[number];
export declare type Key = 'a0' | `${File}${Rank}`;
export declare type DropOrig = `${Uppercase<Letter>}@`;
export declare type Orig = DropOrig | Key;
export declare type FEN = string;
export declare type Pos = [number, number];
export interface Piece {
    role: Role;
    color: Color;
    promoted?: boolean;
}
export interface Drop {
    role: Role;
    key: Key;
}
export declare type Pieces = Map<Key, Piece>;
export declare type PiecesDiff = Map<Key, Piece | undefined>;
export declare type PocketPosition = 'top' | 'bottom';
export declare type Pocket = Map<Role, number>;
export declare type Pockets = Record<Color, Pocket>;
export declare type PocketRoles = Record<Color, Role[]>;
export declare type BoardState = {
    pieces: Pieces;
    pockets?: Pockets;
};
export declare type Selectable = Key | Piece;
export declare type Move = [Orig, Key];
export declare type NumberPair = [number, number];
export declare type NumberQuad = [number, number, number, number];
export interface BoardDimensions {
    width: number;
    height: number;
}
export declare enum Notation {
    ALGEBRAIC = 0,
    SHOGI_ENGLET = 1,
    SHOGI_ARBNUM = 2,
    SHOGI_HANNUM = 3,
    JANGGI = 4,
    XIANGQI_ARBNUM = 5,
    XIANGQI_HANNUM = 6,
    THAI_ALGEBRAIC = 7
}
export declare type Premove = (boardState: BoardState, key: Key, canCastle: boolean) => Key[];
export declare type Predrop = (boardState: BoardState, piece: Piece) => Key[];
export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}
export declare type Dests = Map<Orig, Key[]>;
export interface Elements {
    board: HTMLElement;
    pocketTop?: HTMLElement;
    pocketBottom?: HTMLElement;
    wrap: HTMLElement;
    container: HTMLElement;
    ghost?: HTMLElement;
    svg?: SVGElement;
    customSvg?: SVGElement;
    autoPieces?: HTMLElement;
}
export interface Dom {
    elements: Elements;
    bounds: Memo<ClientRect>;
    redraw: () => void;
    redrawNow: (skipSvg?: boolean) => void;
    unbind?: Unbind;
    destroyed?: boolean;
}
export interface Exploding {
    stage: number;
    keys: readonly Key[];
}
export interface MoveMetadata {
    premove: boolean;
    ctrlKey?: boolean;
    holdTime?: number;
    captured?: Piece;
}
export interface SetPremoveMetadata {
    ctrlKey?: boolean;
}
export declare type MouchEvent = Event & Partial<MouseEvent & TouchEvent>;
export interface KeyedNode extends HTMLElement {
    cgKey: Key;
}
export interface PieceNode extends KeyedNode {
    tagName: 'PIECE';
    cgPiece: string;
    cgAnimating?: boolean;
    cgFading?: boolean;
    cgDragging?: boolean;
    cgScale?: number;
}
export interface SquareNode extends KeyedNode {
    tagName: 'SQUARE';
}
export interface Memo<A> {
    (): A;
    clear: () => void;
}
export interface Timer {
    start: () => void;
    cancel: () => void;
    stop: () => number;
}
export declare type Redraw = () => void;
export declare type Unbind = () => void;
export declare type Milliseconds = number;
export declare type KHz = number;
export declare type RanksPosition = 'left' | 'right';
export declare const colors: readonly ["white", "black"];
export declare const sides: readonly ["ally", "enemy"];
export declare const files: readonly ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"];
export declare const ranks: readonly ["1", "2", "3", "4", "5", "6", "7", "8", "9", ":", ";", "<", "=", ">", "?", "@"];
export declare const letters: readonly ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"];
