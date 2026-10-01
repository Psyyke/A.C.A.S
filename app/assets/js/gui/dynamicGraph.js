// Normalized coordinates keep zoom/pan consistent when switching between settings.
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createViewport() {
    return { x: { start: 0, span: 1 }, y: { start: 0, span: 1 } };
}

export function fittedViewport(boolean = false) {
    // Keep endpoint handles inside the plot. Boolean levels occupy half its height.
    const paddingY = boolean ? 0.5 : 0.1;
    return { x: { start: -0.06, span: 1.12 }, y: { start: -paddingY, span: 1 + 2 * paddingY } };
}

export function fittedCurveViewport(points, xBounds, yBounds, boolean = false) {
    const bounds = { x: { min: Infinity, max: -Infinity }, y: { min: Infinity, max: -Infinity } };
    points.forEach(point => {
        if(!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
        ['x', 'y'].forEach(axis => {
            bounds[axis].min = Math.min(bounds[axis].min, point[axis]);
            bounds[axis].max = Math.max(bounds[axis].max, point[axis]);
        });
    });
    if(!Number.isFinite(bounds.x.min)) return fittedViewport(boolean);

    const viewport = {};
    Object.entries({ x: xBounds, y: yBounds }).forEach(([axis, domain]) => {
        const { min, max } = bounds[axis];
        // Flat lines and single points still need a nonzero, useful visible range.
        const extent = max - min || 1;
        const margin = extent * 0.08;
        const lower = (min + max - extent) / 2 - margin;
        const range = domain.max - domain.min || 1;
        viewport[axis] = { start: (lower - domain.min) / range, span: (extent + 2 * margin) / range };
    });
    return viewport;
}

export function filterGraphLines(lines, variable, key, enabledOnly = false) {
    // One setting per graph, across all profiles. Disabled lines stay in the legend.
    if(!key || key === 'all') return [];
    return lines.filter(line => line.curve.variable === variable && line.key === key
        && (!enabledOnly || line.curve.enabled));
}

export function shouldCollapseVariableTabs(mobile, tabsWidth, availableWidth) {
    return mobile && availableWidth > 0 && tabsWidth > availableWidth + 1;
}

export function setInterpolationLockVisibility(icon, locked) {
    // An SVG .hidden property is not a reliable way to set its hidden attribute.
    icon.toggleAttribute('hidden', !locked);
}

export function zoomAxis(axis, factor, anchor, minimumSpan = 1 / 64) {
    const span = clamp(axis.span / factor, minimumSpan, Math.max(16, axis.span));
    return { start: axis.start + anchor * (axis.span - span), span };
}

export function panAxis(axis, delta) {
    return { ...axis, start: axis.start - delta * axis.span };
}

export function axisDomain(axis, min, max) {
    const range = max - min || 1;
    return { min: min + axis.start * range, max: min + (axis.start + axis.span) * range };
}

export function tickValues(min, max, count = 6, integerOnly = false) {
    const rough = (max - min) / count;
    if(!Number.isFinite(rough) || rough <= 0) return [];
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const fraction = rough / magnitude;
    const rawStep = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
    const step = integerOnly ? Math.max(1, Math.ceil(rawStep)) : rawStep;
    const ticks = [];
    for(let index = Math.ceil(min / step); index * step <= max + step * 1e-8; index++) {
        ticks.push(Number((index * step).toPrecision(12)));
        if(ticks.length > 100) break;
    }
    return ticks;
}

export function formatTick(value) {
    if(Math.abs(value) >= 1e7 || (value !== 0 && Math.abs(value) < 0.001)) return value.toExponential(2);
    return String(Number(value.toPrecision(10)));
}

export function formatSettingValue(value) {
    return String(typeof value === 'boolean' ? Number(value) : value);
}

export function graphProfileStyle(index = 0) {
    // Patterns distinguish profiles without adding hues to a custom theme.
    const patterns = ['', '10 5', '2 5', '10 4 2 4', '16 5', '6 4', '2 3 2 7', '14 4 2 4 2 4'];
    const profileIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
    return { color: 'rgb(255 255 255 / 85%)', dashArray: patterns[profileIndex % patterns.length] };
}

export function moveCurvePoint(points, index, x, y, minX, maxX) {
    if(!points[index] || !Number.isFinite(x) || !Number.isFinite(y)) return index;
    // Keep the selected object intact across sorting, and never merge neighboring points.
    const point = points[index];
    const lower = Math.ceil(index > 0 ? Math.max(minX, points[index - 1].x + 1) : minX);
    const upper = Math.floor(index < points.length - 1 ? Math.min(maxX, points[index + 1].x - 1) : maxX);
    if(lower <= upper) point.x = clamp(Math.round(x), lower, upper);
    point.y = Math.round(y);
    points.sort((a, b) => a.x - b.x);
    return points.indexOf(point);
}

export function insertionX(points, min, max) {
    const lower = Math.ceil(min), upper = Math.floor(max);
    if(lower > upper) return null;
    const occupied = [...new Set(points.map(point => point.x).filter(x => x >= lower && x <= upper))].sort((a, b) => a - b);
    let previous = lower - 1, largestGap = 0, candidate = null;
    [...occupied, upper + 1].forEach(x => {
        const left = previous + 1, right = x - 1;
        const gap = right - left + 1;
        if(gap > largestGap) {
            largestGap = gap;
            candidate = Math.round((left + right) / 2);
        }
        previous = x;
    });
    return candidate;
}

export function modifierAxes(event = {}) {
    const vertical = event.ctrlKey || event.metaKey;
    if(event.shiftKey && !vertical) return ['x'];
    if(vertical && !event.shiftKey) return ['y'];
    return ['x', 'y'];
}

export function settingDisplayName(key, title = '') {
    const cleaned = title.replace(/\s*\([\d\s.,–−-]+\)\s*$/, '').trim();
    if(cleaned && !/^(enable[ds]?|depth|opacity|size|speed|value|type|mode|delay|color|limit|minimum|maximum)$/i.test(cleaned)) return cleaned;
    return String(key).replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[._/\-]+/g, ' ')
        .split(/\s+/).filter(Boolean).map(word => word.toLowerCase() === 'tts' ? 'TTS' : word[0].toUpperCase() + word.slice(1)).join(' ');
}