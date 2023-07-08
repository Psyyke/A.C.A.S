import * as board from './board.js';
import { write as fenWrite } from './fen.js';
import { configure, applyAnimation } from './config.js';
import { anim, render } from './anim.js';
import { cancel as dragCancel, dragNewPiece } from './drag.js';
import { explosion } from './explosion.js';
import { roleOf, isDropOrig, changeNumber } from './util.js';
// see API types and documentations in dts/api.d.ts
export function start(state, redrawAll) {
    function toggleOrientation() {
        board.toggleOrientation(state);
        redrawAll();
    }
    return {
        set(config) {
            if (config.orientation && config.orientation !== state.orientation)
                toggleOrientation();
            applyAnimation(state, config);
            (config.fen ? anim : render)(state => configure(state, config), state);
        },
        state,
        getFen: () => fenWrite(state.boardState, state.dimensions),
        toggleOrientation,
        setPieces(pieces) {
            anim(state => board.setPieces(state, pieces), state);
        },
        changePocket(piece, num) {
            var _a;
            if ((_a = state.pocketRoles) === null || _a === void 0 ? void 0 : _a[piece.color].includes(piece.role)) {
                changeNumber(state.boardState.pockets[piece.color], piece.role, num);
                state.dom.redraw();
            }
        },
        selectSquare(key, force) {
            if (key)
                anim(state => board.select(state, key, force), state);
            else if (state.selectable.selected) {
                board.unselect(state);
                state.dom.redraw();
            }
        },
        selectPocket(piece) {
            if (piece)
                anim(state => board.select(state, piece), state);
            else if (state.selectable.selected) {
                board.unselect(state);
                state.dom.redraw();
            }
        },
        unselect() {
            board.unselect(state);
        },
        move(orig, dest) {
            if (isDropOrig(orig))
                board.baseNewPiece(state, { role: roleOf(orig), color: state.turnColor }, dest, true);
            else
                anim(state => board.baseMove(state, orig, dest), state);
        },
        newPiece(piece, key, fromPocket) {
            anim(state => board.baseNewPiece(state, piece, key, fromPocket), state);
        },
        playPremove() {
            if (state.premovable.current) {
                if (anim(board.playPremove, state))
                    return true;
                // if the premove couldn't be played, redraw to clear it up
                state.dom.redraw();
            }
            return false;
        },
        cancelPremove() {
            render(board.unsetPremove, state);
        },
        cancelMove() {
            render(state => {
                board.cancelMove(state);
                dragCancel(state);
            }, state);
        },
        stop() {
            render(state => {
                board.stop(state);
                dragCancel(state);
            }, state);
        },
        explode(keys) {
            explosion(state, keys);
        },
        setAutoShapes(shapes) {
            render(state => (state.drawable.autoShapes = shapes), state);
        },
        setShapes(shapes) {
            render(state => (state.drawable.shapes = shapes), state);
        },
        getKeyAtDomPos(pos) {
            return board.getKeyAtDomPos(pos, board.whitePov(state), state.dom.bounds(), state.dimensions);
        },
        redrawAll,
        dragNewPiece(piece, fromPocket, event, force) {
            dragNewPiece(state, piece, fromPocket, event, undefined, force);
        },
        destroy() {
            board.stop(state);
            state.dom.unbind && state.dom.unbind();
            state.dom.destroyed = true;
        },
    };
}
//# sourceMappingURL=api.js.map