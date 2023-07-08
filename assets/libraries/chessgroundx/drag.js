import * as board from './board.js';
import * as util from './util.js';
import { clear as drawClear } from './draw.js';
import { anim } from './anim.js';
export function start(s, e) {
    if (!e.isTrusted || (e.button !== undefined && e.button !== 0))
        return; // only touch or left click
    if (e.touches && e.touches.length > 1)
        return; // support one finger touch only
    const bounds = s.dom.bounds(), position = util.eventPosition(e), orig = board.getKeyAtDomPos(position, board.whitePov(s), bounds, s.dimensions);
    if (!orig)
        return;
    const piece = s.boardState.pieces.get(orig);
    const previouslySelected = s.selectable.selected;
    if (!previouslySelected && s.drawable.enabled && (s.drawable.eraseOnClick || !piece || piece.color !== s.turnColor))
        drawClear(s);
    // Prevent touch scroll and create no corresponding mouse event, if there
    // is an intent to interact with the board.
    if (e.cancelable !== false &&
        (!e.touches || s.blockTouchScroll || piece || previouslySelected || pieceCloseTo(s, position)))
        e.preventDefault();
    const hadPremove = !!s.premovable.current;
    s.stats.ctrlKey = e.ctrlKey;
    if (s.selectable.selected && board.canMove(s, s.selectable.selected, orig, !!s.selectable.fromPocket)) {
        anim(state => board.select(state, orig), s);
    }
    else {
        board.select(s, orig);
    }
    const stillSelected = s.selectable.selected === orig;
    const element = pieceElementByKey(s, orig);
    if (piece && element && stillSelected && board.isDraggable(s, orig, false)) {
        s.draggable.current = {
            orig,
            piece,
            origPos: position,
            pos: position,
            started: s.draggable.autoDistance && s.stats.dragged,
            element,
            previouslySelected,
            originTarget: e.target,
            keyHasChanged: false,
        };
        element.cgDragging = true;
        element.classList.add('dragging');
        // place ghost
        const ghost = s.dom.elements.ghost;
        if (ghost) {
            ghost.className = 'ghost ' + util.pieceClasses(piece, s.orientation);
            util.translate(ghost, util.posToTranslate(bounds, s.dimensions)(util.key2pos(orig), board.whitePov(s)));
            util.setVisible(ghost, true);
        }
        processDrag(s);
    }
    else {
        if (hadPremove)
            board.unsetPremove(s);
    }
    s.dom.redraw();
}
function pieceCloseTo(s, pos) {
    const asWhite = board.whitePov(s), bounds = s.dom.bounds(), radiusSq = Math.pow(bounds.width / s.dimensions.width, 2);
    for (const key of s.boardState.pieces.keys()) {
        const center = util.computeSquareCenter(key, asWhite, bounds, s.dimensions);
        if (util.distanceSq(center, pos) <= radiusSq)
            return true;
    }
    return false;
}
export function dragNewPiece(s, piece, fromPocket, e, previouslySelected, force) {
    s.dom.redraw();
    const position = util.eventPosition(e);
    s.boardState.pieces.set('a0', piece);
    s.draggable.current = {
        orig: 'a0',
        piece,
        origPos: position,
        pos: position,
        started: true,
        element: () => pieceElementByKey(s, 'a0'),
        previouslySelected,
        originTarget: e.target,
        fromPocket: fromPocket,
        force: !!force,
        keyHasChanged: false,
    };
    processDrag(s);
}
export function processDrag(s) {
    requestAnimationFrame(() => {
        var _a;
        const cur = s.draggable.current;
        if (!cur)
            return;
        // cancel animations while dragging
        if ((_a = s.animation.current) === null || _a === void 0 ? void 0 : _a.plan.anims.has(cur.orig))
            s.animation.current = undefined;
        // if moving piece is gone, cancel
        const origPiece = s.boardState.pieces.get(cur.orig);
        if (!util.samePiece(origPiece, cur.piece))
            cancel(s);
        else {
            if (!cur.started && util.distanceSq(cur.pos, cur.origPos) >= Math.pow(s.draggable.distance, 2))
                cur.started = true;
            if (cur.started) {
                // support lazy elements
                if (typeof cur.element === 'function') {
                    const found = cur.element();
                    if (!found)
                        return;
                    found.cgDragging = true;
                    found.classList.add('dragging');
                    cur.element = found;
                }
                const bounds = s.dom.bounds();
                util.translate(cur.element, [
                    cur.pos[0] - bounds.left - bounds.width / (2 * s.dimensions.width),
                    cur.pos[1] - bounds.top - bounds.height / (2 * s.dimensions.height),
                ]);
                if (cur.orig !== 'a0')
                    cur.keyHasChanged || (cur.keyHasChanged = cur.orig !== board.getKeyAtDomPos(cur.pos, board.whitePov(s), bounds, s.dimensions));
            }
        }
        processDrag(s);
    });
}
export function move(s, e) {
    // support one finger touch only
    if (s.draggable.current && (!e.touches || e.touches.length < 2)) {
        s.draggable.current.pos = util.eventPosition(e);
    }
}
export function end(s, e) {
    var _a;
    const cur = s.draggable.current;
    if (!cur)
        return;
    // create no corresponding mouse event
    if (e.type === 'touchend' && e.cancelable !== false)
        e.preventDefault();
    // comparing with the origin target is an easy way to test that the end event
    // has the same touch origin
    if (e.type === 'touchend' && cur.originTarget !== e.target) {
        s.draggable.current = undefined;
        return;
    }
    board.unsetPremove(s);
    // touchend has no position; so use the last touchmove position instead
    const eventPos = util.eventPosition(e) || cur.pos;
    const dest = board.getKeyAtDomPos(eventPos, board.whitePov(s), s.dom.bounds(), s.dimensions);
    const target = e.target;
    const onPocket = Number((_a = target.getAttribute('data-nb')) !== null && _a !== void 0 ? _a : -1) >= 0;
    const targetPiece = onPocket
        ? { role: target.getAttribute('data-role'), color: target.getAttribute('data-color') }
        : undefined;
    if (dest && cur.started && cur.orig !== dest) {
        s.stats.ctrlKey = e.ctrlKey;
        if (board.userMove(s, cur.orig !== 'a0' ? cur.orig : cur.piece, dest, !!cur.fromPocket))
            s.stats.dragged = true;
    }
    else if (s.draggable.deleteOnDropOff && !dest) {
        s.boardState.pieces.delete(cur.orig);
        if (cur.fromPocket)
            util.changeNumber(s.boardState.pockets[cur.piece.color], cur.piece.role, -1);
        board.callUserFunction(s.events.change);
    }
    if (((cur.previouslySelected &&
        (cur.orig === cur.previouslySelected || util.isSame(cur.piece, cur.previouslySelected))) ||
        cur.keyHasChanged) &&
        (cur.orig === dest || !dest))
        board.unselect(s);
    if (cur.orig === 'a0' && (!targetPiece || !util.samePiece(cur.piece, targetPiece)))
        board.unselect(s);
    else if (!s.selectable.enabled)
        board.unselect(s);
    if (cur.orig === 'a0')
        s.boardState.pieces.delete('a0');
    removeDragElements(s);
    s.draggable.current = undefined;
    s.dom.redraw();
}
export function cancel(s) {
    const cur = s.draggable.current;
    if (cur) {
        s.draggable.current = undefined;
        s.boardState.pieces.delete('a0');
        board.unselect(s);
        removeDragElements(s);
        s.dom.redraw();
    }
}
function removeDragElements(s) {
    const e = s.dom.elements;
    if (e.ghost)
        util.setVisible(e.ghost, false);
}
export function pieceElementByKey(s, key) {
    let el = s.dom.elements.board.firstChild;
    while (el) {
        if (el.cgKey === key && el.tagName === 'PIECE')
            return el;
        el = el.nextSibling;
    }
    return;
}
//# sourceMappingURL=drag.js.map