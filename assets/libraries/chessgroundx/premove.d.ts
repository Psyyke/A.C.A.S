import * as cg from './types.js';
declare type Mobility = (x1: number, y1: number, x2: number, y2: number) => boolean;
export declare const knight: Mobility;
export declare const queen: Mobility;
export declare const janggiElephant: Mobility;
export declare function premove(variant: string, chess960: boolean, bd: cg.BoardDimensions): cg.Premove;
export {};
