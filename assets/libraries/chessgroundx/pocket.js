import * as util from './util.js';
import * as board from './board.js';
import { clear as drawClear } from './draw.js';
import { dragNewPiece } from './drag.js';
export function renderPocketsInitial(state, elements, pocketTop, pocketBottom) {
    if (pocketTop) {
        pocketTop.innerHTML = '';
        elements.pocketTop = pocketTop;
        pocketView(state, elements.pocketTop, 'top');
    }
    if (pocketBottom) {
        pocketBottom.innerHTML = '';
        elements.pocketBottom = pocketBottom;
        pocketView(state, elements.pocketBottom, 'bottom');
    }
}
function pocketView(state, pocketEl, position) {
    if (!state.pocketRoles)
        return;
    const color = position === 'top' ? util.opposite(state.orientation) : state.orientation;
    const roles = state.pocketRoles[color];
    const pl = String(roles.length);
    const files = String(state.dimensions.width);
    const ranks = String(state.dimensions.height);
    pocketEl.setAttribute('style', `--pocketLength: ${pl}; --files: ${files}; --ranks: ${ranks}`);
    pocketEl.classList.add('pocket', position);
    roles.forEach(role => {
        const pieceName = util.pieceClasses({ role: role, color: color }, state.orientation);
        const sq = util.createEl('square');
        const p = util.createEl('piece', pieceName);
        sq.appendChild(p);
        p.setAttribute('data-color', color);
        p.setAttribute('data-role', role);
        renderPiece(state, sq);
        pocketEl.appendChild(sq);
    });
}
/**
 * updates each piece element attributes based on state
 * */
export function renderPockets(state) {
    renderPocket(state, state.dom.elements.pocketBottom);
    renderPocket(state, state.dom.elements.pocketTop);
}
function renderPocket(state, pocketEl) {
    if (pocketEl) {
        let sq = pocketEl.firstChild;
        if (sq && sq.firstChild) {
            const color = sq.firstChild.getAttribute('data-color');
            pocketEl.classList.toggle('usable', !state.viewOnly &&
                (state.movable.free || state.movable.color === 'both' || (!!color && state.movable.color === color)));
            while (sq) {
                renderPiece(state, sq);
                sq = sq.nextSibling;
            }
        }
    }
}
function renderPiece(state, sq) {
    var _a, _b, _c;
    const p = sq.firstChild;
    const role = p.getAttribute('data-role');
    const color = p.getAttribute('data-color');
    p.setAttribute('data-nb', '' + ((_a = state.boardState.pockets[color].get(role)) !== null && _a !== void 0 ? _a : 0));
    const piece = { role, color };
    const selected = state.selectable.selected;
    sq.classList.toggle('selected-square', !!selected && util.isPiece(selected) && state.selectable.fromPocket && util.samePiece(selected, piece));
    const premoveOrig = (_b = state.premovable.current) === null || _b === void 0 ? void 0 : _b[0];
    sq.classList.toggle('premove', !!premoveOrig && util.isDropOrig(premoveOrig) && util.roleOf(premoveOrig) === role && state.turnColor !== color);
    sq.classList.toggle('last-move', state.highlight.lastMove && !!((_c = state.lastMove) === null || _c === void 0 ? void 0 : _c.includes(util.dropOrigOf(role))) && state.turnColor !== color);
}
export function drag(s, e) {
    if (!e.isTrusted || (e.button !== undefined && e.button !== 0))
        return; // only touch or left click
    if (e.touches && e.touches.length > 1)
        return; // support one finger touch only
    const el = e.target, role = el.getAttribute('data-role'), color = el.getAttribute('data-color'), n = Number(el.getAttribute('data-nb'));
    if (n === 0)
        return;
    const piece = { role, color };
    const previouslySelected = s.selectable.selected;
    if (!previouslySelected && s.drawable.enabled && (s.drawable.eraseOnClick || piece.color !== s.turnColor))
        drawClear(s);
    // Prevent touch scroll and create no corresponding mouse event
    if (e.cancelable !== false)
        e.preventDefault();
    const hadPremove = !!s.premovable.current;
    s.stats.ctrlKey = e.ctrlKey;
    board.select(s, piece);
    const selected = s.selectable.selected;
    const stillSelected = selected && util.isSame(selected, piece);
    if (stillSelected && board.isDraggable(s, piece, true)) {
        dragNewPiece(s, piece, true, e, previouslySelected);
    }
    else {
        if (hadPremove)
            board.unsetPremove(s);
    }
    s.dom.redraw();
}
//# sourceMappingURL=pocket.js.map