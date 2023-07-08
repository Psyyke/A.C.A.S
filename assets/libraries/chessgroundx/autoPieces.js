import { key2pos, createEl, posToTranslate as posToTranslateFromBounds, translateAndScale, pieceClasses as pieceNameOf, } from './util.js';
import { whitePov } from './board.js';
import { syncShapes } from './sync.js';
export function render(state, autoPieceEl) {
    const autoPieces = state.drawable.autoShapes.filter(autoShape => autoShape.piece);
    const autoPieceShapes = autoPieces.map((s) => {
        return {
            shape: s,
            hash: hash(s),
            current: false,
        };
    });
    syncShapes(autoPieceShapes, autoPieceEl, shape => renderShape(state, shape, state.dom.bounds()));
}
export function renderResized(state) {
    var _a;
    const asWhite = whitePov(state), posToTranslate = posToTranslateFromBounds(state.dom.bounds(), state.dimensions);
    let el = (_a = state.dom.elements.autoPieces) === null || _a === void 0 ? void 0 : _a.firstChild;
    while (el) {
        translateAndScale(el, posToTranslate(key2pos(el.cgKey), asWhite), el.cgScale);
        el = el.nextSibling;
    }
}
function renderShape(state, { shape, hash }, bounds) {
    if (shape.piece) {
        const orig = shape.orig;
        const scale = shape.piece.scale;
        const pieceEl = createEl('piece', pieceNameOf(shape.piece, state.orientation));
        pieceEl.setAttribute('cgHash', hash);
        pieceEl.cgKey = orig;
        pieceEl.cgScale = scale;
        translateAndScale(pieceEl, posToTranslateFromBounds(bounds, state.dimensions)(key2pos(orig), whitePov(state)), scale);
        return pieceEl;
    }
    else {
        return createEl('piece', '');
    }
}
const hash = (autoPiece) => { var _a, _b, _c; return [autoPiece.orig, (_a = autoPiece.piece) === null || _a === void 0 ? void 0 : _a.role, (_b = autoPiece.piece) === null || _b === void 0 ? void 0 : _b.color, (_c = autoPiece.piece) === null || _c === void 0 ? void 0 : _c.scale].join(','); };
//# sourceMappingURL=autoPieces.js.map