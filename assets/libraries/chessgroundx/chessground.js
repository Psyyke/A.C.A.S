import { start } from './api.js';
import { configure } from './config.js';
import { defaults } from './state.js';
import { renderWrap } from './wrap.js';
import * as events from './events.js';
import { render, renderResized, updateBounds } from './render.js';
import * as autoPieces from './autoPieces.js';
import * as svg from './svg.js';
import * as util from './util.js';
import { renderPockets, renderPocketsInitial } from './pocket.js';
export function Chessground(element, config, pocketTop, pocketBottom) {
    const maybeState = defaults();
    configure(maybeState, config || {});
    function redrawAll() {
        const prevUnbind = 'dom' in maybeState ? maybeState.dom.unbind : undefined;
        prevUnbind === null || prevUnbind === void 0 ? void 0 : prevUnbind();
        // compute bounds from existing board element if possible
        // this allows non-square boards from CSS to be handled (for 3D)
        const elements = renderWrap(element, maybeState), bounds = util.memo(() => elements.board.getBoundingClientRect()), redrawNow = (skipSvg) => {
            if (state.dom.destroyed || state.dom.elements !== elements)
                return;
            render(state);
            renderPockets(state);
            if (elements.autoPieces)
                autoPieces.render(state, elements.autoPieces);
            if (!skipSvg && elements.svg)
                svg.renderSvg(state, elements.svg, elements.customSvg);
        }, onResize = () => {
            if (state.dom.destroyed || state.dom.elements !== elements)
                return;
            updateBounds(state);
            renderResized(state);
            if (elements.autoPieces)
                autoPieces.renderResized(state);
        };
        if (elements.pocketTop)
            pocketTop = elements.pocketTop;
        if (elements.pocketBottom)
            pocketBottom = elements.pocketBottom;
        renderPocketsInitial(maybeState, elements, pocketTop, pocketBottom);
        const state = maybeState;
        const redraw = debounceRedraw(redrawNow);
        state.dom = {
            elements,
            bounds,
            redraw: redraw.schedule,
            redrawNow,
        };
        state.drawable.prevSvgHash = '';
        updateBounds(state);
        redrawNow(false);
        const unbindBoard = events.bindBoard(state, onResize);
        const unbindDocument = events.bindDocument(state, onResize);
        state.dom.unbind = () => {
            redraw.cancel();
            unbindBoard();
            unbindDocument();
        };
        state.events.insert && state.events.insert(elements);
        return state;
    }
    return start(redrawAll(), redrawAll);
}
function debounceRedraw(redrawNow) {
    let frame;
    return {
        schedule() {
            if (frame !== undefined)
                return;
            frame = requestAnimationFrame(() => {
                frame = undefined;
                redrawNow();
            });
        },
        cancel() {
            if (frame !== undefined)
                cancelAnimationFrame(frame);
            frame = undefined;
        },
    };
}
//# sourceMappingURL=chessground.js.map