import { State } from './state.js';
import * as cg from './types.js';
export interface DrawShape {
    orig: cg.Key;
    dest?: cg.Key;
    brush?: string;
    modifiers?: DrawModifiers;
    piece?: DrawShapePiece;
    customSvg?: string;
}
export interface DrawShapePiece {
    role: cg.Role;
    color: cg.Color;
    promoted?: boolean;
    scale?: number;
}
export interface DrawBrush {
    key: string;
    color: string;
    opacity: number;
    lineWidth: number;
}
export interface DrawBrushes {
    [name: string]: DrawBrush;
}
export interface DrawModifiers {
    lineWidth?: number;
}
export interface Drawable {
    enabled: boolean;
    visible: boolean;
    defaultSnapToValidMove: boolean;
    eraseOnClick: boolean;
    onChange?: (shapes: DrawShape[]) => void;
    shapes: DrawShape[];
    autoShapes: DrawShape[];
    current?: DrawCurrent;
    brushes: DrawBrushes;
    prevSvgHash: string;
}
export interface DrawCurrent {
    orig: cg.Key;
    dest?: cg.Key;
    mouseSq?: cg.Key;
    pos: cg.NumberPair;
    brush: string;
    snapToValidMove: boolean;
}
export declare function start(state: State, e: cg.MouchEvent): void;
export declare function processDraw(state: State): void;
export declare function move(state: State, e: cg.MouchEvent): void;
export declare function end(state: State): void;
export declare function cancel(state: State): void;
export declare function clear(state: State): void;
