const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const scalar = (value, min, max) => number(value, min, max) ? value : null;

const styleRules = {
    fill: 'color', stroke: 'color', opacity: 'opacity', 'fill-opacity': 'opacity', 'stroke-opacity': 'opacity',
    'stroke-width': 'length', 'stroke-dasharray': 'dash', 'stroke-linecap': 'linecap',
    'stroke-linejoin': 'linejoin', 'font-family': 'font', 'font-weight': 'weight', 'font-size': 'length',
    'paint-order': 'paint', rx: 'length', ry: 'length', filter: 'filter', 'pointer-events': 'pointer', display: 'display'
};

function rejectUnsupportedFields(value, fields, context) {
    for(const key of Object.keys(value))
        if(!fields.includes(key)) throw new Error(`Unsupported ${context} field: ${key.slice(0, 64)}`);
}

function safeStyleValue(kind, value) {
    if(typeof value !== 'string' || value.length > 128 || /[\\<>{}"'`;]/.test(value)) return false;
    value = value.trim();
    const length = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|em|%|)?$/i;
    switch(kind) {
        case 'color': return /^(?:#[\da-f]{3,8}|[a-z]{1,24}|rgba?\([\d.,% /+-]+\)|hsla?\([\d.,% /+-]+\))$/i.test(value);
        case 'opacity': return /^(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+)$/.test(value);
        case 'length': return length.test(value) && Math.abs(parseFloat(value)) <= 1000;
        case 'dash': return /^[\d.,% ]{1,40}$/.test(value);
        case 'linecap': return /^(butt|round|square)$/i.test(value);
        case 'linejoin': return /^(miter|round|bevel)$/i.test(value);
        case 'font': return /^(?:Arial|sans-serif|serif|monospace|Arial,\s*sans-serif)$/i.test(value);
        case 'weight': return /^(normal|bold|[1-9]00)$/i.test(value);
        case 'paint': return /^(normal|stroke|fill|stroke fill|fill stroke)$/i.test(value);
        case 'filter': return /^(?:none|(?:(?:sepia|brightness|contrast|saturate|grayscale)\(\d+(?:\.\d+)?%?\)\s*){1,4})$/i.test(value);
        case 'pointer': return value === 'none';
        case 'display': return ['none', 'block', 'inherit', 'inline'].includes(value);
    }
    return false;
}

function sanitizeStyle(style) {
    if(style === undefined) return '';
    if(typeof style !== 'string' || style.length > 2048) throw new Error('Invalid shape style');
    return style.split(';').map(part => {
        if(!part.trim()) return '';
        const index = part.indexOf(':');
        if(index < 0) throw new Error('Invalid shape style declaration');
        const key = part.slice(0, index).trim().toLowerCase();
        const value = part.slice(index + 1).trim();
        if(!Object.hasOwn(styleRules, key)) throw new Error(`Unsupported shape style: ${key.slice(0, 64)}`);
        if(!safeStyleValue(styleRules[key], value)) throw new Error(`Unsafe or unsupported shape style value: ${key.slice(0, 64)}`);
        return `${key}:${value};`;
    }).join('');
}

function normalizeAnimation(animation) {
    if(!object(animation) || !Array.isArray(animation.keyframes) || animation.keyframes.length < 1
        || animation.keyframes.length > 16 || !object(animation.options)
        || !number(animation.start, 0, 9e15)) throw new Error('Invalid animation');
    rejectUnsupportedFields(animation, ['keyframes', 'options', 'start'], 'animation');
    let lastOffset = 0;
    const keyframes = animation.keyframes.map(frame => {
        if(!object(frame)) throw new Error('Invalid animation frame');
        const safe = {};
        for(const [key, value] of Object.entries(frame)) {
            if(key === 'offset') {
                if(!number(value, 0, 1)) throw new Error('Invalid frame offset');
                if(value < lastOffset) throw new Error('Animation frame offsets must be nondecreasing');
                lastOffset = value;
                safe.offset = value;
            } else {
                const css = key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
                if(!Object.hasOwn(styleRules, css)) throw new Error(`Unsupported animation keyframe field: ${key.slice(0, 64)}`);
                if(!['string', 'number'].includes(typeof value) || !safeStyleValue(styleRules[css], String(value)))
                    throw new Error(`Unsafe or unsupported animation keyframe value: ${key.slice(0, 64)}`);
                safe[key] = value;
            }
        }
        return safe;
    });
    const options = {};
    rejectUnsupportedFields(animation.options,
        ['duration', 'delay', 'endDelay', 'iterations', 'iterationStart', 'fill', 'direction', 'easing'], 'animation option');
    for(const [key, value] of Object.entries(animation.options)) {
        if(key === 'duration' && number(value, 0, 60000)) options.duration = value;
        else if(key === 'delay' && number(value, -60000, 60000)) options.delay = value;
        else if(key === 'endDelay' && number(value, -60000, 60000)) options.endDelay = value;
        else if(key === 'iterations' && number(value, 0, 1000)) options.iterations = value;
        else if(key === 'iterationStart' && number(value, 0, 1000)) options.iterationStart = value;
        else if(key === 'fill' && ['none', 'forwards', 'backwards', 'both', 'auto'].includes(value)) options.fill = value;
        else if(key === 'direction' && ['normal', 'reverse', 'alternate', 'alternate-reverse'].includes(value)) options.direction = value;
        else if(key === 'easing' && typeof value === 'string' && /^(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end)$/.test(value)) options.easing = value;
        else throw new Error(`Unsafe or unsupported animation option value: ${key}`);
    }
    return { keyframes, options, start: animation.start };
}

export function normalizeOverlay(input) {
    if(!object(input) || typeof input.instanceId !== 'string' || !input.instanceId.length || input.instanceId.length > 128
        || typeof input.visible !== 'boolean') throw new Error('Invalid overlay identity or visibility');
    if(!['w', 'b'].includes(input.orientation) || !Array.isArray(input.dimensions) || input.dimensions.length !== 2
        || !input.dimensions.every(n => Number.isInteger(n) && n >= 1 && n <= 69)
        || !Array.isArray(input.shapes)) throw new Error('Invalid board or shapes');
    if(input.shapes.length > 8192) throw new Error('Overlay shape limit exceeded (8192 shapes per snapshot)');
    const offset = input.offset === undefined ? { x: 0, y: 0 } : input.offset;
    if(!object(offset) || !['x', 'y'].every(key => Number.isInteger(offset[key]) && number(offset[key], -1000, 1000)))
        throw new Error('Invalid screen overlay offset');
    rejectUnsupportedFields(offset, ['x', 'y'], 'offset');
    const ids = new Set();
    const square = value => {
        if(typeof value !== 'string' || !/^[\s\S][1-9]\d?$/.test(value)) return false;
        const file = value.charCodeAt(0) - 96;
        return file >= 1 && file <= input.dimensions[0] && Number(value.slice(1)) <= input.dimensions[1];
    };
    const shapes = input.shapes.map(shape => {
        if(object(shape) && !['arrow', 'rectangle', 'text'].includes(shape.type))
            throw new Error(`Unsupported overlay shape type: ${String(shape.type).slice(0, 64)}`);
        if(!object(shape) || !Number.isSafeInteger(shape.id) || shape.id < 0 || ids.has(shape.id)
            || !['arrow', 'rectangle', 'text'].includes(shape.type) || !object(shape.config)
            || !['', 'none', 'block', 'inherit', 'inline'].includes(shape.display)
            || !Array.isArray(shape.animations) || shape.animations.length > 8) throw new Error('Invalid shape');
        rejectUnsupportedFields(shape, ['id', 'type', 'positions', 'config', 'display', 'animations', 'ariaLabel', 'title'], 'shape');
        rejectUnsupportedFields(shape.config,
            ['style', 'lineWidth', 'arrowheadWidth', 'arrowheadHeight', 'startOffset', 'size', 'text', 'position'], 'shape config');
        ids.add(shape.id);
        if(shape.type === 'arrow' ? !Array.isArray(shape.positions) || shape.positions.length !== 2 || !shape.positions.every(square)
            : !square(shape.positions)) throw new Error('Invalid shape positions');
        const config = { style: sanitizeStyle(shape.config.style) };
        for(const key of ['lineWidth', 'arrowheadWidth', 'arrowheadHeight', 'startOffset', 'size']) {
            if(shape.config[key] !== undefined) {
                const value = scalar(shape.config[key], 0, 1000);
                if(value === null) throw new Error('Invalid shape size');
                config[key] = value;
            }
        }
        if(shape.config.text !== undefined) {
            if(typeof shape.config.text !== 'string' || shape.config.text.length > 128) throw new Error('Invalid shape text');
            config.text = shape.config.text;
        }
        if(shape.config.position !== undefined) {
            if(!Array.isArray(shape.config.position) || shape.config.position.length !== 2
                || !shape.config.position.every(n => number(n, -10, 10))) throw new Error('Invalid text position');
            config.position = shape.config.position.slice();
        }
        const descriptors = {};
        for(const key of ['ariaLabel', 'title']) {
            if(shape[key] !== undefined) {
                if(typeof shape[key] !== 'string' || shape[key].length > 1024)
                    throw new Error(`Invalid shape descriptor: ${key} (maximum 1024 characters)`);
                descriptors[key] = shape[key];
            }
        }
        return { id: shape.id, type: shape.type, positions: shape.positions, config,
            display: shape.display, animations: shape.animations.map(normalizeAnimation), ...descriptors };
    });
    const geometryError = message => Object.assign(new Error(message), { overlayGeometry: true });
    const g = input.geometry;
    if(!object(g) || !object(g.rect) || !['chromium', 'firefox'].includes(g.browser)
        || !number(g.screenX, -100000, 100000) || !number(g.screenY, -100000, 100000)
        || !number(g.dpr, 0.25, 8)) throw geometryError('Invalid overlay geometry');
    for(const key of ['outerWidth', 'outerHeight', 'innerWidth', 'innerHeight'])
        if(!number(g[key], 1, 20000)) throw geometryError('Invalid window size');
    const r = g.rect;
    if(!number(r.left, 0, 20000) || !number(r.top, 0, 20000)
        || !number(r.width, 1, 20000) || !number(r.height, 1, 20000)
        || r.left + r.width > g.innerWidth + 1 || r.top + r.height > g.innerHeight + 1)
        throw geometryError('Board is outside the viewport');
    if(g.browser === 'firefox' && (!number(g.mozInnerScreenX, -100000, 100000)
        || !number(g.mozInnerScreenY, -100000, 100000))) throw geometryError('Missing Firefox inner screen coordinates');
    return { instanceId: input.instanceId, visible: input.visible, geometry: {
        screenX: g.screenX, screenY: g.screenY, outerWidth: g.outerWidth, outerHeight: g.outerHeight,
        innerWidth: g.innerWidth, innerHeight: g.innerHeight, dpr: g.dpr, browser: g.browser,
        mozInnerScreenX: g.mozInnerScreenX, mozInnerScreenY: g.mozInnerScreenY,
        rect: { left: r.left, top: r.top, width: r.width, height: r.height }
    }, offset: { x: offset.x, y: offset.y }, orientation: input.orientation, dimensions: input.dimensions.slice(), shapes };
}

export function overlayBounds(g, screen, platform = process.platform, offset = { x: 0, y: 0 }) {
    let point, display;
    if(g.browser === 'chromium') {
        display = screen.getDisplayNearestPoint({ x: Math.round(g.screenX), y: Math.round(g.screenY) });
        const zoom = g.dpr / display.scaleFactor;
        // Chromium's outer/screen coordinates are unzoomed DIPs; viewport and
        // DOM rect coordinates are CSS pixels at the current page zoom.
        const border = Math.max(0, (g.outerWidth - g.innerWidth * zoom) / 2);
        point = { x: Math.round(g.screenX + border + g.rect.left * zoom),
            y: Math.round(g.screenY + g.outerHeight - g.innerHeight * zoom - border + g.rect.top * zoom) };
    } else {
        const physical = { x: Math.round((g.mozInnerScreenX + g.rect.left) * g.dpr),
            y: Math.round((g.mozInnerScreenY + g.rect.top) * g.dpr) };
        point = platform !== 'darwin' && screen.screenToDipPoint
            ? screen.screenToDipPoint(physical) : { ...physical };
        display = screen.getDisplayNearestPoint(point);
        if(platform === 'darwin') {
            point.x = Math.round(physical.x / display.scaleFactor);
            point.y = Math.round(physical.y / display.scaleFactor);
        }
    }
    const scale = g.dpr / display.scaleFactor;
    const bounds = { x: Math.round(point.x + offset.x / display.scaleFactor),
        y: Math.round(point.y + offset.y / display.scaleFactor),
        width: Math.round(g.rect.width * scale), height: Math.round(g.rect.height * scale) };
    const displays = screen.getAllDisplays();
    if(bounds.width < 1 || bounds.height < 1 || !displays.some(({ bounds: d }) =>
        bounds.x < d.x + d.width && bounds.x + bounds.width > d.x
        && bounds.y < d.y + d.height && bounds.y + bounds.height > d.y)) return null;
    return bounds;
}
