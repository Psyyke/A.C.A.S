import { key2pos } from './util.js';
import { syncShapes } from './sync.js';
export function createElement(tagName) {
    return document.createElementNS('http://www.w3.org/2000/svg', tagName);
}
export function renderSvg(state, svg, customSvg) {
    const d = state.drawable, curD = d.current, cur = curD && curD.mouseSq ? curD : undefined, arrowDests = new Map(), bounds = state.dom.bounds(), nonPieceAutoShapes = d.autoShapes.filter(autoShape => !autoShape.piece);
    for (const s of d.shapes.concat(nonPieceAutoShapes).concat(cur ? [cur] : [])) {
        if (s.dest)
            arrowDests.set(s.dest, (arrowDests.get(s.dest) || 0) + 1);
    }
    const shapes = d.shapes.concat(nonPieceAutoShapes).map((s) => {
        return {
            shape: s,
            current: false,
            hash: shapeHash(s, arrowDests, false, bounds),
        };
    });
    if (cur)
        shapes.push({
            shape: cur,
            current: true,
            hash: shapeHash(cur, arrowDests, true, bounds),
        });
    const fullHash = shapes.map(sc => sc.hash).join(';');
    if (fullHash === state.drawable.prevSvgHash)
        return;
    state.drawable.prevSvgHash = fullHash;
    /*
      -- DOM hierarchy --
      <svg class="cg-shapes">      (<= svg)
        <defs>
          ...(for brushes)...
        </defs>
        <g>
          ...(for arrows and circles)...
        </g>
      </svg>
      <svg class="cg-custom-svgs"> (<= customSvg)
        <g>
          ...(for custom svgs)...
        </g>
      </svg>
    */
    const defsEl = svg.querySelector('defs');
    const shapesEl = svg.querySelector('g');
    const customSvgsEl = customSvg.querySelector('g');
    syncDefs(d, shapes, defsEl);
    syncShapes(shapes.filter(s => !s.shape.customSvg), shapesEl, shape => renderShape(state, shape, d.brushes, arrowDests, bounds));
    syncShapes(shapes.filter(s => s.shape.customSvg), customSvgsEl, shape => renderShape(state, shape, d.brushes, arrowDests, bounds));
}
// append only. Don't try to update/remove.
function syncDefs(d, shapes, defsEl) {
    const brushes = new Map();
    let brush;
    for (const s of shapes) {
        if (s.shape.dest) {
            brush = d.brushes[s.shape.brush];
            if (s.shape.modifiers)
                brush = makeCustomBrush(brush, s.shape.modifiers);
            brushes.set(brush.key, brush);
        }
    }
    const keysInDom = new Set();
    let el = defsEl.firstChild;
    while (el) {
        keysInDom.add(el.getAttribute('cgKey'));
        el = el.nextSibling;
    }
    for (const [key, brush] of brushes.entries()) {
        if (!keysInDom.has(key))
            defsEl.appendChild(renderMarker(brush));
    }
}
function shapeHash({ orig, dest, brush, piece, modifiers, customSvg }, arrowDests, current, bounds) {
    return [
        bounds.width,
        bounds.height,
        current,
        orig,
        dest,
        brush,
        dest && (arrowDests.get(dest) || 0) > 1,
        piece && pieceHash(piece),
        modifiers && modifiersHash(modifiers),
        customSvg && customSvgHash(customSvg),
    ]
        .filter(x => x)
        .join(',');
}
function pieceHash(piece) {
    return [piece.color, piece.role, piece.promoted, piece.scale].filter(x => x).join(',');
}
function modifiersHash(m) {
    return '' + (m.lineWidth || '');
}
function customSvgHash(s) {
    // Rolling hash with base 31 (cf. https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript)
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h + s.charCodeAt(i)) >>> 0;
    }
    return 'custom-' + h.toString();
}
function renderShape(state, { shape, current, hash }, brushes, arrowDests, bounds) {
    let el;
    const orig = orient(key2pos(shape.orig), state.orientation, state.dimensions);
    if (shape.customSvg) {
        el = renderCustomSvg(shape.customSvg, orig, bounds, state.dimensions);
    }
    else {
        if (shape.dest) {
            let brush = brushes[shape.brush];
            if (shape.modifiers)
                brush = makeCustomBrush(brush, shape.modifiers);
            el = renderArrow(brush, orig, orient(key2pos(shape.dest), state.orientation, state.dimensions), current, (arrowDests.get(shape.dest) || 0) > 1, bounds, state.dimensions);
        }
        else
            el = renderCircle(brushes[shape.brush], orig, current, bounds, state.dimensions);
    }
    el.setAttribute('cgHash', hash);
    return el;
}
function renderCustomSvg(customSvg, pos, bounds, bd) {
    const [x, y] = pos2user(pos, bounds, bd);
    // Translate to top-left of `orig` square
    const g = setAttributes(createElement('g'), { transform: `translate(${x},${y})` });
    // Give 100x100 coordinate system to the user for `orig` square
    const svg = setAttributes(createElement('svg'), { width: 1, height: 1, viewBox: '0 0 100 100' });
    g.appendChild(svg);
    svg.innerHTML = customSvg;
    return g;
}
function renderCircle(brush, pos, current, bounds, bd) {
    const o = pos2user(pos, bounds, bd), widths = circleWidth(), radius = (bounds.width + bounds.height) / (4 * Math.max(bounds.width, bounds.height));
    return setAttributes(createElement('circle'), {
        stroke: brush.color,
        'stroke-width': widths[current ? 0 : 1],
        fill: 'none',
        opacity: opacity(brush, current),
        cx: o[0],
        cy: o[1],
        r: radius - widths[1] / 2,
    });
}
function renderArrow(brush, orig, dest, current, shorten, bounds, bd) {
    const m = arrowMargin(shorten && !current), a = pos2user(orig, bounds, bd), b = pos2user(dest, bounds, bd), dx = b[0] - a[0], dy = b[1] - a[1], angle = Math.atan2(dy, dx), xo = Math.cos(angle) * m, yo = Math.sin(angle) * m;
    return setAttributes(createElement('line'), {
        stroke: brush.color,
        'stroke-width': lineWidth(brush, current),
        'stroke-linecap': 'round',
        'marker-end': 'url(#arrowhead-' + brush.key + ')',
        opacity: opacity(brush, current),
        x1: a[0],
        y1: a[1],
        x2: b[0] - xo,
        y2: b[1] - yo,
    });
}
function renderMarker(brush) {
    const marker = setAttributes(createElement('marker'), {
        id: 'arrowhead-' + brush.key,
        orient: 'auto',
        markerWidth: 4,
        markerHeight: 8,
        refX: 2.05,
        refY: 2.01,
    });
    marker.appendChild(setAttributes(createElement('path'), {
        d: 'M0,0 V4 L3,2 Z',
        fill: brush.color,
    }));
    marker.setAttribute('cgKey', brush.key);
    return marker;
}
export function setAttributes(el, attrs) {
    for (const key in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, key))
            el.setAttribute(key, attrs[key]);
    }
    return el;
}
function orient(pos, color, bd) {
    return color === 'white' ? pos : [bd.width - 1 - pos[0], bd.height - 1 - pos[1]];
}
function makeCustomBrush(base, modifiers) {
    return {
        color: base.color,
        opacity: Math.round(base.opacity * 10) / 10,
        lineWidth: Math.round(modifiers.lineWidth || base.lineWidth),
        key: [base.key, modifiers.lineWidth].filter(x => x).join(''),
    };
}
function circleWidth() {
    return [3 / 64, 4 / 64];
}
function lineWidth(brush, current) {
    return ((brush.lineWidth || 10) * (current ? 0.85 : 1)) / 64;
}
function opacity(brush, current) {
    return (brush.opacity || 1) * (current ? 0.9 : 1);
}
function arrowMargin(shorten) {
    return (shorten ? 20 : 10) / 64;
}
function pos2user(pos, bounds, bd) {
    const xScale = Math.min(1, bounds.width / bounds.height) * Math.max(1, bd.height / bd.width);
    const yScale = Math.min(1, bounds.height / bounds.width) * Math.max(1, bd.width / bd.height);
    return [(pos[0] - (bd.width - 1) / 2) * xScale, ((bd.height - 1) / 2 - pos[1]) * yScale];
}
//# sourceMappingURL=svg.js.map