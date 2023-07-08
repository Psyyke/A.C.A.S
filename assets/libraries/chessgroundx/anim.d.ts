import { State } from './state.js';
import * as cg from './types.js';
export declare type Mutation<A> = (state: State) => A;
export declare type AnimVector = cg.NumberQuad;
export declare type AnimVectors = Map<cg.Key, AnimVector>;
export declare type AnimFadings = Map<cg.Key, cg.Piece>;
export interface AnimPlan {
    anims: AnimVectors;
    fadings: AnimFadings;
}
export interface AnimCurrent {
    start: DOMHighResTimeStamp;
    frequency: cg.KHz;
    plan: AnimPlan;
}
export declare const anim: <A>(mutation: Mutation<A>, state: State) => A;
export declare function render<A>(mutation: Mutation<A>, state: State): A;
