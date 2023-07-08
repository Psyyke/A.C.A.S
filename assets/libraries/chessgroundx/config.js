import { setCheck, setSelected } from './board.js';
import { read as fenRead } from './fen.js';
export function applyAnimation(state, config) {
    if (config.animation) {
        deepMerge(state.animation, config.animation);
        // no need for such short animations
        if ((state.animation.duration || 0) < 70)
            state.animation.enabled = false;
    }
}
export function configure(state, config) {
    var _a, _b, _c;
    // don't merge destinations and autoShapes. Just override.
    if ((_a = config.movable) === null || _a === void 0 ? void 0 : _a.dests)
        state.movable.dests = undefined;
    if ((_b = config.drawable) === null || _b === void 0 ? void 0 : _b.autoShapes)
        state.drawable.autoShapes = [];
    deepMerge(state, config);
    // if a fen was provided, replace the pieces
    if (config.fen) {
        const boardState = fenRead(config.fen, state.dimensions);
        // prevent calling cancel() if piece drag is already started from pocket!
        const draggedPiece = state.boardState.pieces.get('a0');
        if (draggedPiece !== undefined)
            boardState.pieces.set('a0', draggedPiece);
        // set the pocket to empty instead of undefined if pocketRoles exists
        // likewise, set the pocket to undefined if pocketRoles is undefined
        if (state.pocketRoles)
            boardState.pockets = (_c = boardState.pockets) !== null && _c !== void 0 ? _c : { white: new Map(), black: new Map() };
        else
            boardState.pockets = undefined;
        state.boardState = boardState;
        state.drawable.shapes = [];
    }
    // apply config values that could be undefined yet meaningful
    if ('check' in config || 'kingRoles' in config)
        setCheck(state, config.check || false);
    if ('lastMove' in config && !config.lastMove)
        state.lastMove = undefined;
    // in case of ZH drop last move, there's a single square.
    // if the previous last move had two squares,
    // the merge algorithm will incorrectly keep the second square.
    else if (config.lastMove)
        state.lastMove = config.lastMove;
    // fix move/premove dests
    if (state.selectable.selected)
        setSelected(state, state.selectable.selected, state.selectable.fromPocket);
    applyAnimation(state, config);
    if (!state.movable.rookCastle && state.movable.dests) {
        const rank = state.movable.color === 'white' ? '1' : '8', kingStartPos = ('e' + rank), dests = state.movable.dests.get(kingStartPos), king = state.boardState.pieces.get(kingStartPos);
        if (!dests || !king || king.role !== 'k-piece')
            return;
        state.movable.dests.set(kingStartPos, dests.filter(d => !(d === 'a' + rank && dests.includes(('c' + rank))) &&
            !(d === 'h' + rank && dests.includes(('g' + rank)))));
    }
}
function deepMerge(base, extend) {
    for (const key in extend) {
        if (Object.prototype.hasOwnProperty.call(extend, key)) {
            if (Object.prototype.hasOwnProperty.call(base, key) && isPlainObject(base[key]) && isPlainObject(extend[key]))
                deepMerge(base[key], extend[key]);
            else
                base[key] = extend[key];
        }
    }
}
function isPlainObject(o) {
    if (typeof o !== 'object' || o === null)
        return false;
    const proto = Object.getPrototypeOf(o);
    return proto === Object.prototype || proto === null;
}
//# sourceMappingURL=config.js.map