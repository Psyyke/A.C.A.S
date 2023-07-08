import * as cg from './types.js';
export const invRanks = [...cg.ranks].reverse();
function files(n) {
    return cg.files.slice(0, n);
}
function ranks(n) {
    return cg.ranks.slice(0, n);
}
export function allKeys(bd) {
    return Array.prototype.concat(...files(bd.width).map(c => ranks(bd.height).map(r => c + r)));
}
export function allPos(bd) {
    return allKeys(bd).map(key2pos);
}
export const pos2key = (pos) => (cg.files[pos[0]] + cg.ranks[pos[1]]);
export const key2pos = (k) => [k.charCodeAt(0) - 97, k.charCodeAt(1) - 49];
export function roleOf(letter) {
    return (letter.replace('+', 'p').replace('*', '_').replace('@', '').toLowerCase() + '-piece');
}
export function letterOf(role, uppercase = false) {
    const letterPart = role.slice(0, role.indexOf('-'));
    const letter = (letterPart.length > 1 ? letterPart.replace('p', '+') : letterPart).replace('_', '*');
    return (uppercase ? letter.toUpperCase() : letter);
}
export function dropOrigOf(role) {
    return (letterOf(role, true) + '@');
}
export function isDropOrig(orig) {
    return orig[0] === orig[0].toUpperCase();
}
export function isKey(selectable) {
    return typeof selectable === 'string' && selectable[0] === selectable[0].toLowerCase();
}
export function isPiece(selectable) {
    return typeof selectable !== 'string';
}
export function isSame(lhs, rhs) {
    if (isPiece(lhs) && isPiece(rhs))
        return samePiece(lhs, rhs);
    else
        return lhs === rhs;
}
export function changeNumber(map, key, num) {
    var _a;
    map.set(key, ((_a = map.get(key)) !== null && _a !== void 0 ? _a : 0) + num);
}
// TODO cover two-digit numbers
// This function isn't used anywhere inside chessground btw, it's probably used in Lichess
// Pychess has this in chess.ts
export const uciToMove = (uci) => {
    if (!uci)
        return undefined;
    if (uci[1] === '@')
        return [uci.slice(2, 4)];
    return [uci.slice(0, 2), uci.slice(2, 4)];
};
export function memo(f) {
    let v;
    const ret = () => {
        if (v === undefined)
            v = f();
        return v;
    };
    ret.clear = () => {
        v = undefined;
    };
    return ret;
}
export const timer = () => {
    let startAt;
    return {
        start() {
            startAt = performance.now();
        },
        cancel() {
            startAt = undefined;
        },
        stop() {
            if (!startAt)
                return 0;
            const time = performance.now() - startAt;
            startAt = undefined;
            return time;
        },
    };
};
export const opposite = (c) => (c === 'white' ? 'black' : 'white');
export const samePiece = (p1, p2) => p1.role === p2.role && p1.color === p2.color && !!p1.promoted === !!p2.promoted;
export const pieceSide = (p, o) => (p.color === o ? 'ally' : 'enemy');
export const pieceClasses = (p, o) => `${p.color} ${pieceSide(p, o)} ${p.promoted ? 'promoted ' : ''}${p.role}`;
export const distanceSq = (pos1, pos2) => {
    const dx = pos1[0] - pos2[0], dy = pos1[1] - pos2[1];
    return dx * dx + dy * dy;
};
export const posToTranslate = (bounds, bd) => (pos, asWhite) => [
    ((asWhite ? pos[0] : bd.width - 1 - pos[0]) * bounds.width) / bd.width,
    ((asWhite ? bd.height - 1 - pos[1] : pos[1]) * bounds.height) / bd.height,
];
export const translate = (el, pos) => {
    el.style.transform = `translate(${pos[0]}px,${pos[1]}px)`;
};
export const translateAndScale = (el, pos, scale = 1) => {
    el.style.transform = `translate(${pos[0]}px,${pos[1]}px) scale(${scale})`;
};
export const setVisible = (el, v) => {
    el.style.visibility = v ? 'visible' : 'hidden';
};
export const eventPosition = (e) => {
    var _a;
    if (e.clientX || e.clientX === 0)
        return [e.clientX, e.clientY];
    if ((_a = e.targetTouches) === null || _a === void 0 ? void 0 : _a[0])
        return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
    return; // touchend has no position!
};
export const isRightButton = (e) => e.buttons === 2 || e.button === 2;
export const createEl = (tagName, className) => {
    const el = document.createElement(tagName);
    if (className)
        el.className = className;
    return el;
};
export const isMiniBoard = (el) => {
    return Array.from(el.classList).includes('mini');
};
export function computeSquareCenter(key, asWhite, bounds, bd) {
    const pos = key2pos(key);
    if (!asWhite) {
        pos[0] = bd.width - 1 - pos[0];
        pos[1] = bd.height - 1 - pos[1];
    }
    return [
        bounds.left + (bounds.width * (pos[0] + 0.5)) / bd.width,
        bounds.top + (bounds.height * (bd.height - pos[1] - 0.5)) / bd.height,
    ];
}
//# sourceMappingURL=util.js.map