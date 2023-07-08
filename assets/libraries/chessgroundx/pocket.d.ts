import * as cg from './types.js';
import { HeadlessState, State } from './state.js';
export declare function renderPocketsInitial(state: HeadlessState, elements: cg.Elements, pocketTop?: HTMLElement, pocketBottom?: HTMLElement): void;
/**
 * updates each piece element attributes based on state
 * */
export declare function renderPockets(state: State): void;
export declare function drag(s: State, e: cg.MouchEvent): void;
