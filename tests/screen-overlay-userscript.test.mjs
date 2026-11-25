import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const source = readFileSync(new URL('../acas.user.js', import.meta.url), 'utf8');
const drawerSource = readFileSync(new URL('../userscript-components/UniversalBoardDrawer.js', import.meta.url), 'utf8');
const classStart = source.indexOf('class ScreenBoardDrawer {');
const renderStart = source.indexOf('function renderStuffToBoard(', classStart);
const clearEnd = source.indexOf('\nfunction displayImportantNotification', renderStart);
const demandStart = source.indexOf('function coordinatesFromMoves(');
const demandEnd = source.indexOf('\nfunction getRandomOwnPieceDomCoord', demandStart);
assert.ok(classStart >= 0 && renderStart > classStart && clearEnd > renderStart);
assert.ok(demandStart >= 0 && demandEnd > demandStart);

function harness() {
    const listeners = new Map();
    const add = (name, fn) => {
        if(!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
    };
    const remove = (name, fn) => listeners.get(name)?.delete(fn);
    const document = {
        hidden: false, hasFocus: () => true,
        addEventListener: add, removeEventListener: remove,
        createElementNS: () => { throw new Error('Screen drawing must not create page DOM nodes'); }
    };
    const window = {
        screenX: 100, screenY: 200, outerWidth: 1000, outerHeight: 800,
        innerWidth: 984, innerHeight: 700, devicePixelRatio: 1.25,
        location: { pathname: '/game' }, addEventListener: add, removeEventListener: remove
    };
    window.top = window;
    const board = {
        isConnected: true,
        getBoundingClientRect: () => ({ left: 50, top: 60, right: 450, bottom: 460, width: 400, height: 400 })
    };
    const packets = [], errors = [], moves = [], logs = [], transport = { fail: false };
    const pageConsole = Object.fromEntries(['log', 'warn', 'error'].map(name =>
        [name, (...args) => logs.push({ name, args })]));
    const make = new Function('document', 'window', 'navigator', 'board', 'packets', 'errors', 'moves', 'transport', 'console', `
        const domain = 'chess.com', commLinkInstanceID = 'board-1';
        const CommLink = { commands: {
            screenOverlay: async data => {
                if(transport.fail) throw new Error('delivery failed');
                packets.push(structuredClone(data));
                if(transport.wait) await transport.wait;
                return true;
            },
            calculateSpecificMoves: data => moves.push(data)
        } };
        const recordDevTaskError = error => errors.push(error);
        const configKeys = { displayMovesOnExternalSite: 'displayMovesOnExternalSite' };
        const getConfigValue = () => true;
        const gameState = { fen: { full: '8/8/8/8/8/8/8/8 w - - 0 1' } };
        const getFen = () => '8/8/8/8/8/8/8/8';
        const maybeAnnounceMarkingsToPage = () => {};
        const feedbackVisualRevisions = new Map(), penaVisualRevisions = new Map();
        const lastBoardMatrix = Array.from({ length: 8 }, (_, y) =>
            Array.from({ length: 8 }, () => y === 6 ? 'P' : 1));
        const getPlayerColor = () => 'w';
        const indexToChessCoordinates = ([x, y]) => String.fromCharCode(97 + x) + (8 - y);
        const modLastEnteredSquare = { squareIndex: null, squareFen: null, pieceFen: null };
        const modListeners = [], modDrawerListeners = [];
        let isMovesOnDemandActive = true;
        let activeVisuals = [], BoardDrawer = null;
        ${drawerSource}
        ${source.slice(classStart, clearEnd)}
        ${source.slice(demandStart, demandEnd)}
        BoardDrawer = new ScreenBoardDrawer(board, [8, 8], 'w');
        return {
            drawer: BoardDrawer, render: renderStuffToBoard, clear: clearVisuals,
            installDemand: addMovesOnDemandListeners, setDemandActive: value => { isMovesOnDemandActive = value; },
            visuals: () => activeVisuals
        };
    `);
    const api = make(document, window, { userAgent: 'Chrome/100' }, board, packets, errors, moves, transport, pageConsole);
    return { ...api, document, window, board, packets, errors, moves, logs, transport,
        fire: (name, event = {}) => listeners.get(name)?.forEach(fn => fn(event)) };
}

test('universal drawer validates malformed shapes and detached text without page console or uncaught errors', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const logs = [], errors = [];
        page.on('console', event => logs.push(event.text()));
        page.on('pageerror', error => errors.push(error.message));
        await page.setContent('<div id="board" style="width:400px;height:400px"></div>');
        await page.addScriptTag({ content: drawerSource });
        const result = await page.evaluate(() => {
            const failures = [];
            const drawer = new UniversalBoardDrawer(document.querySelector('#board'), { debugMode: true,
                onError: error => failures.push(error.message) });
            const invalid = [
                drawer.createShape('arrow', null),
                drawer.createShape('arrow', ['a1', 'z9']),
                drawer.createShape('text', {}),
                drawer.createShape('unknown', 'a1')
            ];
            const text = drawer.createShape('text', 'e4', { text: 'Guard' });
            text.getBBox = () => { throw new DOMException('Cannot measure text.', 'InvalidStateError'); };
            const measured = drawer.setTextPosition('e4', text, {});
            text.remove();
            drawer.updateDimensions();
            const tracked = drawer.addedShapes.filter(shape => shape.type !== 'debugDot').length;
            drawer.terminate();
            const terminated = drawer.createShape('rectangle', 'e4');
            const missing = new UniversalBoardDrawer(null, { onError: error => failures.push(error.message) });
            missing.terminate();
            return { invalid, measured, tracked, terminated, failures, lastError: drawer.lastError?.message };
        });
        assert.ok(result.invalid.every(value => !value));
        assert.equal(result.measured, false);
        assert.equal(result.tracked, 0);
        assert.equal(result.terminated, false);
        assert.equal(result.failures.length, 7);
        assert.match(result.lastError, /terminated/);
        assert.deepEqual(logs, []);
        assert.deepEqual(errors, []);
        assert.doesNotMatch(source, /\bconsole\.(?:log|debug|info|warn|error)\s*\(/);
        assert.doesNotMatch(drawerSource, /\bconsole\.(?:log|debug|info|warn|error)\s*\(/);
    } finally { await browser.close(); }
});

test('screen drawer keeps the existing visual lifecycle and shape ordering', () => {
    const h = harness();
    h.render([
        { profileID: 'a', category: 'move', shapeType: 'arrow', shapeSquare: ['e2', 'e4'],
            shapeConfig: { style: 'fill:red;' }, bringToFront: true },
        { profileID: 'a', category: 'move', shapeType: 'rectangle', shapeSquare: 'e4',
            shapeConfig: { style: 'fill:blue;' } }
    ]);
    assert.deepEqual(h.drawer.snapshot().shapes.map(shape => shape.type), ['rectangle', 'arrow']);
    assert.equal(h.visuals().length, 2);
    h.render([{ profileID: 'b', category: 'metric', shapeType: 'text', shapeSquare: 'a1',
        shapeConfig: { text: '1' } }]);
    h.clear({ noMetricsRemoval: true });
    assert.deepEqual(h.drawer.snapshot().shapes.map(shape => shape.type), ['text']);
    assert.equal(h.drawer.addedShapes.length, 1);
    h.clear();
    h.drawer.terminate();
    assert.equal(h.errors.length, 0);
});

test('universal drawer keeps overlapping text above squares and arrows in both insertion modes', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent('<div id="board" style="width:400px;height:400px"></div>');
        await page.addScriptTag({ content: drawerSource });
        for(const prepend of [false, true]) {
            const order = await page.evaluate(prepend => {
                const drawer = new UniversalBoardDrawer(document.querySelector('#board'), { prepend });
                drawer.createShape('rectangle', 'e4');
                drawer.createShape('text', 'e4', { text: 'Guard' });
                drawer.createShape('arrow', ['f3', 'e4']);
                drawer.createShape('text', 'e4', { text: 'Plan', position: [0, 0.6] });
                drawer.createShape('rectangle', 'e4', { style: 'fill:gold;' });
                drawer.setOrientation('b');
                drawer.updateDimensions();
                const order = [...drawer.boardContainerElem.children].map(element => element.localName);
                drawer.terminate();
                return order;
            }, prepend);
            assert.deepEqual(order.slice(-2), ['text', 'text'], `Insertion mode prepend=${prepend}`);
            assert.deepEqual(order.slice(0, -2), ['rect', 'polygon', 'rect']);
        }
    } finally { await browser.close(); }
});

test('screen metrics retain unchanged shapes and preserve stacking when the position changes', () => {
    const h = harness();
    const metric = (square, color) => ({ profileID: 'a', category: 'metric', shapeType: 'rectangle',
        shapeSquare: square, shapeConfig: { style: `fill:${color};` } });
    h.render([metric('a1', 'red'), metric('b2', 'blue')]);
    const first = h.drawer.snapshot().shapes;
    for(let i = 0; i < 1000; i++) h.render([metric('a1', 'red'), metric('b2', 'blue')]);
    assert.deepEqual(h.drawer.snapshot().shapes.map(shape => shape.id), first.map(shape => shape.id));
    assert.equal(h.drawer.addedShapes.length, 2);
    h.render([metric('a1', 'red'), metric('c3', 'green')]);
    const changed = h.drawer.snapshot().shapes;
    assert.deepEqual(changed.map(shape => shape.positions), ['c3', 'a1']);
    assert.equal(changed[1].id, first[1].id);
    assert.equal(h.drawer.addedShapes.length, 2);
    h.render([metric('c3', 'green'), metric('a1', 'red')]);
    assert.deepEqual(h.drawer.snapshot().shapes.map(shape => shape.positions), ['a1', 'c3']);
    const reorderedIds = h.drawer.snapshot().shapes.map(shape => shape.id);
    h.render([metric('c3', 'green'), metric('a1', 'red')]);
    assert.deepEqual(h.drawer.snapshot().shapes.map(shape => shape.id), reorderedIds);
    h.render([{ profileID: 'a', category: 'metric' }]);
    assert.equal(h.drawer.addedShapes.length, 0);
    h.drawer.terminate();
});

test('updating one metric profile keeps the other profile and front markings', () => {
    const h = harness();
    const metric = (profileID, square, bringToFront = false) => ({ profileID, category: 'metric',
        shapeType: 'rectangle', shapeSquare: square, shapeConfig: { style: 'fill:red;' }, bringToFront });
    h.render([metric('a', 'a1'), metric('a', 'b2', true)]);
    h.render([metric('b', 'c3')]);
    h.render([metric('a', 'd4'), metric('a', 'b2', true)]);
    assert.deepEqual(h.drawer.snapshot().shapes.map(shape => shape.positions), ['d4', 'c3', 'b2']);
    h.render([{ profileID: 'a', category: 'metric' }]);
    assert.deepEqual(h.drawer.snapshot().shapes.map(shape => shape.positions), ['c3']);
    h.drawer.terminate();
});

test('hover-only shapes follow board input and overlay visibility follows focus and concealment', () => {
    const h = harness();
    h.render([{ profileID: 'a', category: 'move', shapeType: 'arrow', shapeSquare: ['e7', 'e5'],
        shapeConfig: { style: 'fill:red; display:none;' }, forceHoverOnly: true, from: 'e2' }]);
    assert.equal(h.drawer.snapshot().shapes[0].display, 'none');
    h.fire('mousemove', { clientX: 275, clientY: 385 });
    assert.equal(h.drawer.snapshot().shapes[0].display, 'inherit');
    h.fire('mousemove', { clientX: 0, clientY: 0 });
    assert.equal(h.drawer.snapshot().shapes[0].display, 'none');
    h.drawer.boardContainerElem.style.display = 'none';
    assert.equal(h.drawer.snapshot().visible, false);
    h.drawer.boardContainerElem.style.display = 'block';
    assert.equal(h.drawer.snapshot().visible, true);
    h.document.hidden = true;
    assert.equal(h.drawer.snapshot().visible, false);
    h.document.hidden = false;
    h.window.visualViewport = { scale: 1.5, offsetLeft: 0, offsetTop: 0 };
    assert.equal(h.drawer.snapshot().visible, false);
    h.clear();
    h.drawer.terminate();
});

test('geometry, orientation and teaching animations are forwarded without page SVGs', () => {
    const h = harness();
    h.drawer.setOrientation('b');
    h.drawer.setBoardDimensions([10, 8]);
    const shape = h.drawer.createShape('rectangle', 'j8', { style: 'fill:red;' });
    const animation = shape.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1000 });
    const snapshot = h.drawer.snapshot();
    assert.deepEqual(snapshot.dimensions, [10, 8]);
    assert.equal(snapshot.orientation, 'b');
    assert.deepEqual(snapshot.geometry.rect, { left: 50, top: 60, width: 400, height: 400 });
    assert.equal(snapshot.shapes[0].animations[0].options.duration, 1000);
    animation.cancel();
    assert.deepEqual(h.drawer.snapshot().shapes[0].animations, []);
    assert.equal(h.drawer.createShape('rectangle', 'k8', {}), null);
    shape.remove();
    h.drawer.terminate();
});

test('expiring teaching marks never publish a visible frame after their fade is cancelled', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
    const h = harness();
    const mark = (teachingID, shapeType, expiresAt) => ({
        profileID: 'teacher', category: 'pena-teaching', positionFen: '8/8/8/8/8/8/8/8 w - - 0 1',
        teachingRevision: 1, teachingID, teachingPulse: 0, shapeType, shapeSquare: 'e4',
        shapeConfig: shapeType === 'text' ? { text: 'Guard' } : { style: 'fill:gold;' },
        fadeAt: expiresAt - 20, expiresAt
    });
    try {
        h.render([mark(1, 'rectangle', 1100), mark(2, 'text', 1600)]);
        await new Promise(resolve => setImmediate(resolve));
        h.drawer.publish();
        await new Promise(resolve => setImmediate(resolve));
        const id = h.drawer.snapshot().shapes.find(shape => shape.type === 'rectangle').id;
        const first = h.packets.length;
        t.mock.timers.tick(100);
        await new Promise(resolve => setImmediate(resolve));
        assert.ok(h.packets.length > first);
        assert.ok(h.packets.slice(first).every(packet => !packet.shapes.some(shape => shape.id === id)),
            'Expiry must remove the shape before cancellation can publish its fully visible base style');
        assert.equal(h.visuals().length, 1);
        assert.equal(h.drawer.snapshot().shapes[0].animations.length, 1);
    } finally { h.clear(); h.drawer.terminate(); }
});

test('teaching fades keep their opacity on late delivery and early dismissal while labels stay on top', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
    const h = harness();
    const mark = (teachingID, shapeType, teachingRevision, fadeAt = 1800) => ({
        profileID: 'teacher', category: 'pena-teaching', positionFen: '8/8/8/8/8/8/8/8 w - - 0 1',
        teachingRevision, teachingID, teachingPulse: 0, shapeType,
        shapeSquare: shapeType === 'arrow' ? ['a1', 'e4'] : 'e4',
        shapeConfig: shapeType === 'text' ? { text: 'Guard' } : { style: 'fill:gold;' },
        fadeAt, expiresAt: 2000
    });
    try {
        h.render([mark(1, 'text', 1), mark(2, 'rectangle', 1)]);
        await new Promise(resolve => setImmediate(resolve));
        t.mock.timers.tick(900);
        h.render([mark(1, 'text', 2, 1900), mark(2, 'rectangle', 2, 1900)]);
        for(const shape of h.drawer.snapshot().shapes) {
            assert.equal(shape.animations.length, 1);
            assert.equal(shape.animations[0].keyframes[0].opacity, 0.5,
                'Dismissing an already fading mark must not restore full opacity');
            assert.equal(shape.animations[0].keyframes[1].offset, 0);
        }
        h.render([mark(1, 'text', 3, 1900), mark(2, 'rectangle', 3, 1900), mark(3, 'arrow', 3)]);
        const snapshot = h.drawer.snapshot();
        assert.equal(snapshot.shapes.find(shape => shape.type === 'arrow').animations[0].keyframes[0].opacity, 0.5,
            'A late packet must resume the original fade instead of restarting it');
        assert.equal(snapshot.shapes.at(-1).type, 'text',
            'Even a later move marking must remain below the existing label');
        await new Promise(resolve => setImmediate(resolve));
    } finally { h.clear(); h.drawer.terminate(); }
});

test('feedback labels and titles are sent with the same shape', () => {
    const h = harness();
    h.render([{ profileID: 'a', category: 'feedback', shapeType: 'rectangle', shapeSquare: 'a1',
        shapeConfig: { style: 'fill:red;' }, feedbackDescription: 'Missed a tactic' }]);
    const [shape] = h.drawer.snapshot().shapes;
    assert.equal(shape.ariaLabel, 'Missed a tactic');
    assert.equal(shape.title, 'Missed a tactic');
    h.clear();
    h.drawer.terminate();
});

test('on-demand clicks work without prior motion and survive hover-shape cleanup', () => {
    const h = harness();
    h.installDemand();
    const e2 = { clientX: 275, clientY: 385 };
    const d2 = { clientX: 225, clientY: 385 };
    h.fire('mousedown', e2);
    h.fire('mouseup');
    assert.ok(h.moves[0].moves.includes('e2e4'));

    h.render([{ profileID: 'a', category: 'move', shapeType: 'arrow', shapeSquare: ['e2', 'e4'],
        shapeConfig: { style: 'display:none;' }, forceHoverOnly: true, from: 'e2' }]);
    h.clear();
    assert.equal(h.drawer.customActivityListeners.length, 64);
    h.fire('mousedown', d2);
    h.fire('mouseup');
    h.fire('mousedown', e2);
    h.fire('mouseup');
    assert.ok(h.moves[1].moves.includes('d2d4'));
    assert.ok(h.moves[2].moves.includes('e2e4'));

    h.fire('mousedown', { clientX: 0, clientY: 0 });
    h.fire('mouseup');
    assert.equal(h.moves.length, 3);
    h.drawer.terminate();
});

test('on-demand touch and black orientation select the actual piece', () => {
    const h = harness();
    h.installDemand();
    h.drawer.setOrientation('b');
    h.fire('touchstart', { touches: [{ clientX: 225, clientY: 135 }] });
    assert.ok(h.moves[0].moves.includes('e2e4'));
    h.drawer.terminate();
});

test('on-demand click refreshes listeners installed under a stationary pointer', () => {
    const h = harness();
    const e2 = { clientX: 275, clientY: 385 };
    h.fire('mousemove', e2);
    h.installDemand();
    h.fire('mousedown', e2);
    h.fire('mouseup');
    assert.ok(h.moves[0].moves.includes('e2e4'));
    h.drawer.terminate();
});

test('disabling on-demand stops requests and re-enabling refreshes the selected square', () => {
    const h = harness();
    h.installDemand();
    h.fire('mousedown', { clientX: 275, clientY: 385 });
    h.fire('mouseup');
    h.setDemandActive(false);
    h.fire('mousedown', { clientX: 225, clientY: 385 });
    h.fire('mouseup');
    assert.equal(h.moves.length, 1);
    h.setDemandActive(true);
    h.fire('mousedown', { clientX: 225, clientY: 385 });
    h.fire('mouseup');
    assert.ok(h.moves[1].moves.includes('d2d4'));
    h.drawer.terminate();
});

test('screen drawing reports unsupported operations without page console output', async () => {
    const h = harness();
    const shape = h.drawer.createShape('rectangle', 'e2', { style: 'fill:red;' });
    shape.style.stroke = 'red';
    assert.equal(h.drawer.snapshot().shapes[0].unsupported, 'style.stroke');
    h.transport.fail = true;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.errors.length, 1);
    assert.deepEqual(h.logs, []);
    h.drawer.terminate();
});

test('termination sends a hidden snapshot even when an update is in flight', async () => {
    const h = harness();
    let release;
    h.transport.wait = new Promise(resolve => { release = resolve; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.packets[0].visible, true);
    h.drawer.terminate();
    release();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.packets.at(-1).visible, false);
});

test('real page stays unchanged while on-demand and feedback use screen drawing', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
        const logs = [], pageErrors = [];
        page.on('console', message => logs.push(message.text()));
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.setContent('<style>body{margin:0}#board{position:absolute;left:50px;top:60px;width:400px;height:400px}</style><div id="board"></div>');
        await page.evaluate(({ drawerSource, overlaySource, demandSource }) => {
            const mutations = [], createdNodes = [];
            const observer = new MutationObserver(records => mutations.push(...records));
            observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
            const createElementNS = document.createElementNS.bind(document);
            const createElement = document.createElement.bind(document);
            document.createElementNS = (...args) => { createdNodes.push(args); return createElementNS(...args); };
            document.createElement = (...args) => { createdNodes.push(args); return createElement(...args); };
            const setup = new Function(`
                const domain = 'chess.com', commLinkInstanceID = 'board';
                const requests = [], packets = [], errors = [];
                const CommLink = { commands: {
                    screenOverlay: async data => { packets.push(structuredClone(data)); return true; },
                    calculateSpecificMoves: data => requests.push(data)
                } };
                const recordDevTaskError = error => errors.push(error.message);
                const configKeys = { displayMovesOnExternalSite: 'display' };
                const getConfigValue = () => true;
                const gameState = { fen: { full: '8/8/8/8/8/8/8/8 w - - 0 1' } };
                const getFen = () => '8/8/8/8/8/8/8/8';
                const maybeAnnounceMarkingsToPage = () => {};
                const feedbackVisualRevisions = new Map(), penaVisualRevisions = new Map();
                const lastBoardMatrix = Array.from({ length: 8 }, (_, y) =>
                    Array.from({ length: 8 }, () => y === 6 ? 'P' : 1));
                const getPlayerColor = () => 'w';
                const indexToChessCoordinates = ([x, y]) => String.fromCharCode(97 + x) + (8 - y);
                const modLastEnteredSquare = { squareIndex: null, squareFen: null, pieceFen: null };
                const modListeners = [], modDrawerListeners = [];
                let isMovesOnDemandActive = true, activeVisuals = [], BoardDrawer;
                ${drawerSource}
                ${overlaySource}
                ${demandSource}
                BoardDrawer = new ScreenBoardDrawer(document.getElementById('board'), [8, 8], 'w');
                addMovesOnDemandListeners();
                return { drawer: BoardDrawer, render: renderStuffToBoard, clear: clearVisuals, requests, packets, errors };
            `);
            window.screenTest = { ...setup(), mutations, createdNodes, observer };
        }, { drawerSource, overlaySource: source.slice(classStart, clearEnd),
            demandSource: source.slice(demandStart, demandEnd) });
        await page.mouse.click(275, 385);
        const result = await page.evaluate(async () => {
            const h = window.screenTest;
            h.render([{ profileID: 'a', category: 'feedback', shapeType: 'rectangle', shapeSquare: 'e2',
                shapeConfig: { style: 'fill:red;' }, feedbackDescription: 'A helpful idea' }]);
            const feedback = h.drawer.snapshot().shapes[0];
            h.clear();
            h.drawer.boardContainerElem.style.display = 'none';
            h.drawer.boardContainerElem.style.display = 'block';
            h.drawer.terminate();
            await new Promise(resolve => setTimeout(resolve, 0));
            h.observer.disconnect();
            return { requests: h.requests, feedback, mutations: h.mutations.length,
                createdNodes: h.createdNodes.length, errors: h.errors };
        });
        assert.ok(result.requests[0].moves.includes('e2e4'));
        assert.equal(result.feedback.title, 'A helpful idea');
        assert.equal(result.mutations, 0);
        assert.equal(result.createdNodes, 0);
        assert.deepEqual(result.errors, []);
        assert.deepEqual(logs, []);
        assert.deepEqual(pageErrors, []);
    } finally {
        await browser.close();
    }
});

test('variant geometry matches BoardDrawer and clipped boards are hidden', () => {
    const h = harness();
    h.window.location.pathname = '/variants/game';
    h.drawer.setBoardDimensions([10, 8]);
    let snapshot = h.drawer.snapshot();
    assert.deepEqual(snapshot.geometry.rect, { left: 50, top: 100, width: 400, height: 320 });
    h.fire('mousemove', { clientX: 70, clientY: 120 });
    assert.deepEqual(h.drawer.lastInputPosition, [1, 1]);
    h.fire('mousemove', { clientX: 70, clientY: 80 });
    assert.deepEqual(h.drawer.lastInputPosition, [null, null]);
    h.board.getBoundingClientRect = () => ({ left: -20, top: 60, width: 400, height: 400 });
    snapshot = h.drawer.snapshot();
    assert.equal(snapshot.visible, false);
    h.drawer.terminate();
});

test('Ghost permits a drawer only when the global screen overlay is enabled', () => {
    const start = source.indexOf('function isBoardDrawerNeeded()');
    const end = source.indexOf('\nfunction squeezeEmptySquares', start);
    assert.ok(start >= 0 && end > start);
    const getNeeded = new Function('GM_getValue', `
        const dbValues = { AcasConfig: 'config' }, commLinkInstanceID = 'board';
        const configKeys = {
            isUserscriptGhost: 'isUserscriptGhost', ghostScreenOverlay: 'ghostScreenOverlay',
            displayMovesOnExternalSite: 'displayMovesOnExternalSite',
            renderOnExternalSite: 'renderOnExternalSite', feedbackOnExternalSite: 'feedbackOnExternalSite',
            movesOnDemand: 'movesOnDemand'
        };
        const withDynamicSettings = callback => callback();
        ${source.slice(start, end)}
        return isBoardDrawerNeeded;
    `);
    const config = { global: { isUserscriptGhost: true, ghostScreenOverlay: false,
        profiles: { first: {}, second: { displayMovesOnExternalSite: true } } } };
    const needed = getNeeded(() => config);
    assert.equal(needed(), false);
    config.global.ghostScreenOverlay = true;
    assert.equal(needed(), true);
    config.global.isUserscriptGhost = false;
    config.global.ghostScreenOverlay = false;
    assert.equal(needed(), true);
});
