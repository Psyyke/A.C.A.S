import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeOverlay, overlayBounds } from '../appServer/backend/screenOverlayProtocol.js';
import { ScreenOverlayManager } from '../appServer/backend/screenOverlayManager.js';
import { parseClientMessage } from '../appServer/backend/uciCommand.js';

const shape = (id = 1) => ({ id, type: 'arrow', positions: ['a1', 'h8'],
    config: { lineWidth: 15, style: 'fill:limegreen;stroke:rgb(0 0 0 / 50%);stroke-width:0.5%;' },
    display: '', animations: [] });
const snapshot = () => ({ instanceId: 'board-1', visible: true,
    geometry: { screenX: 100, screenY: 50, outerWidth: 1000, outerHeight: 800, innerWidth: 980,
        innerHeight: 700, dpr: 1.5, browser: 'chromium', rect: { left: 20, top: 30, width: 400, height: 400 } },
    orientation: 'w', dimensions: [8, 8], shapes: [shape()] });
const screen = {
    screenToDipPoint: ({ x, y }) => ({ x: Math.round(x / 1.5), y: Math.round(y / 1.5) }),
    getDisplayNearestPoint: () => ({ scaleFactor: 1.5 }),
    getAllDisplays: () => [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]
};

test('validation bounds shapes and preserves safe current drawing values', () => {
    const data = snapshot();
    data.shapes[0].config = { style: 'fill:limegreen; stroke-width:0.5%; font-size:12px; opacity:0.5; filter:brightness(1.5); font-family:Arial,sans-serif; font-weight:900; paint-order:stroke; stroke-width:0.06em;',
        text: '♞<script>' };
    data.shapes[0].animations = [{ start: 1000, keyframes: [
        { opacity: 0, strokeOpacity: 1 },
        { opacity: 1, offset: 1 }
    ], options: { duration: 1000, fill: 'forwards' } }];
    const safe = normalizeOverlay(data).shapes[0];
    assert.equal(safe.config.style, 'fill:limegreen;stroke-width:0.5%;font-size:12px;opacity:0.5;filter:brightness(1.5);font-family:Arial,sans-serif;font-weight:900;paint-order:stroke;stroke-width:0.06em;');
    assert.equal(safe.config.text, '♞<script>');
    assert.equal(safe.config.existingElem, undefined);
    assert.deepEqual(safe.animations[0].keyframes[0], { opacity: 0, strokeOpacity: 1 });
    assert.deepEqual(safe.animations[0].options, { duration: 1000, fill: 'forwards' });
    data.shapes.push(shape());
    assert.throws(() => normalizeOverlay(data), /Invalid shape/);
    data.shapes = [shape()];
    data.geometry.rect.left = -1;
    assert.throws(() => normalizeOverlay(data), /outside/);
    data.geometry.rect.left = 0;
    data.shapes[0].positions = ['a1', 'z99'];
    assert.throws(() => normalizeOverlay(data), /positions/);
    data.shapes = Array.from({ length: 1024 }, (_, i) => shape(i));
    assert.equal(normalizeOverlay(data).shapes.length, 1024);
    data.shapes = Array.from({ length: 8193 }, (_, i) => shape(i));
    assert.throws(() => normalizeOverlay(data), /8192 shapes/);
    data.dimensions = [69, 69];
    data.shapes = [shape()];
    data.shapes[0].positions = ['a1', String.fromCharCode(165) + '69'];
    assert.doesNotThrow(() => normalizeOverlay(data));
    data.dimensions = [70, 69];
    assert.throws(() => normalizeOverlay(data), /board/);
    assert.equal(parseClientMessage(JSON.stringify({ type: 'screenOverlay', msg: 'x'.repeat(5000) })).type, 'screenOverlay');
    assert.equal(parseClientMessage(JSON.stringify({ type: 'screenOverlay', msg: 'x'.repeat(300000) })).type, 'screenOverlay');
    assert.throws(() => parseClientMessage(JSON.stringify({ type: 'screenOverlay', msg: 'x'.repeat(524289) })), /too long/);
});

test('unsupported or unsafe drawing fields produce explicit status errors, even while hidden', () => {
    const changes = [
        [s => { s.type = 'futureShape'; }, /Unsupported overlay shape type/],
        [s => { s.unsupported = 'style.transform'; }, /Unsupported shape field: unsupported/],
        [s => { s.config.existingElem = {}; }, /Unsupported shape config field: existingElem/],
        [s => { s.config.style = 'background-image:url(https://evil);'; }, /Unsupported shape style: background-image/],
        [s => { s.config.style = 'fill:url(https://evil);'; }, /shape style value: fill/],
        [s => { s.config.style = 'fill'; }, /Invalid shape style declaration/],
        [s => { s.animations = [{ start: 0, keyframes: [{ opacity: 1, unknown: 0 }], options: {} }]; }, /keyframe field: unknown/],
        [s => { s.animations = [{ start: 0, keyframes: [{ opacity: 2 }], options: {} }]; }, /keyframe value: opacity/],
        [s => { s.animations = [{ start: 0, keyframes: [{ opacity: 1 }], options: { composite: 'replace' } }]; }, /animation option field: composite/],
        [s => { s.animations = [{ start: 0, keyframes: [{ opacity: 1 }], options: { duration: 60001 } }]; }, /option value: duration/],
        [s => { s.animations = [{ start: 0, keyframes: [{ opacity: 1, offset: 1 }, { opacity: 0, offset: 0 }], options: {} }]; }, /nondecreasing/],
        [s => { s.animations = [{ start: 0, extra: true, keyframes: [{ opacity: 1 }], options: {} }]; }, /Unsupported animation field: extra/]
    ];
    for(const [change, expected] of changes) {
        const data = snapshot();
        change(data.shapes[0]);
        assert.throws(() => normalizeOverlay(data), expected);
        let status;
        const manager = new ScreenOverlayManager({ screen, createWindow: () => assert.fail(),
            report: (_client, message) => { status = message; } });
        data.visible = false;
        data.geometry.rect.left = -20;
        manager.receive({}, data);
        assert.match(status.error, expected);
        assert.equal(status.message, status.error);
    }
});

test('shape descriptors are bounded strings and never markup', () => {
    const data = snapshot();
    Object.assign(data.shapes[0], { ariaLabel: '♞ <script>', title: '<img src=x onerror=alert(1)>' });
    assert.equal(normalizeOverlay(data).shapes[0].title, data.shapes[0].title);
    data.shapes[0].title = 'x'.repeat(1025);
    assert.throws(() => normalizeOverlay(data), /descriptor: title/);
    data.shapes[0].title = {};
    assert.throws(() => normalizeOverlay(data), /descriptor: title/);
});

test('converts Chromium and Firefox geometry with scaling and rejects off-screen boards', () => {
    const g = snapshot().geometry;
    assert.deepEqual(overlayBounds(g, screen, 'win32'), { x: 130, y: 170, width: 400, height: 400 });
    assert.deepEqual(overlayBounds(g, screen, 'win32', { x: 15, y: -30 }),
        { x: 140, y: 150, width: 400, height: 400 });
    const zoomed = { ...g, innerWidth: 784, innerHeight: 560, dpr: 1.875 };
    assert.deepEqual(overlayBounds(zoomed, screen, 'win32'), { x: 135, y: 178, width: 500, height: 500 });
    assert.doesNotThrow(() => normalizeOverlay({ ...snapshot(), geometry: {
        ...g, innerWidth: 1225, innerHeight: 875, dpr: 1.2
    } }));
    Object.assign(g, { browser: 'firefox', mozInnerScreenX: 120, mozInnerScreenY: 200 });
    assert.deepEqual(overlayBounds(g, screen, 'win32'), { x: 140, y: 230, width: 400, height: 400 });
    assert.deepEqual(overlayBounds(g, screen, 'win32', { x: -15, y: 30 }),
        { x: 130, y: 250, width: 400, height: 400 });
    g.mozInnerScreenX = 5000;
    assert.equal(overlayBounds(g, screen, 'win32'), null);
});

test('offsets are optional bounded whole physical pixels', () => {
    const data = snapshot();
    assert.deepEqual(normalizeOverlay(data).offset, { x: 0, y: 0 });
    data.offset = { x: -1000, y: 1000 };
    assert.deepEqual(normalizeOverlay(data).offset, data.offset);
    for(const offset of [{ x: 1001, y: 0 }, { x: 1.5, y: 0 }, { x: 0 }, { x: 0, y: 0, extra: true }]) {
        data.offset = offset;
        assert.throws(() => normalizeOverlay(data), /offset/);
    }
});

class FakeWindow extends EventEmitter {
    constructor() {
        super();
        this.webContents = new EventEmitter();
        this.messages = [];
        this.webContents.send = (...args) => this.messages.push(args);
        this.visible = false;
        this.destroyed = false;
    }
    isDestroyed() { return this.destroyed; }
    hide() { this.visible = false; }
    showInactive() { this.visible = true; }
    setBounds(bounds) { this.bounds = bounds; }
    destroy() { this.destroyed = true; this.emit('closed'); }
}

test('per-client lifecycle hides, retains shapes, expires and clears independently', () => {
    let now = 0;
    const windows = [], reports = [];
    const manager = new ScreenOverlayManager({ screen, platform: 'win32', now: () => now,
        createWindow: () => { const win = new FakeWindow(); windows.push(win); return win; },
        report: (client, status) => reports.push([client, status]) });
    const a = {}, b = {};
    manager.receive(a, snapshot());
    manager.receive(b, snapshot());
    assert.equal(windows[0].visible, false);
    windows.forEach(win => win.webContents.emit('did-finish-load'));
    assert.equal(windows[0].visible, true);
    const hidden = snapshot();
    hidden.visible = false;
    hidden.shapes = [];
    manager.receive(a, hidden);
    assert.equal(windows[0].visible, false);
    assert.equal(windows[0].messages.at(-1)[1].shapes.length, 1);
    hidden.geometry.rect.left = -10;
    const reportCount = reports.length;
    manager.receive(a, hidden);
    assert.equal(reports.length, reportCount);
    now = 1000;
    manager.receive(a, snapshot());
    assert.equal(windows[0].visible, true);
    now = 2000;
    manager.sweep();
    assert.equal(windows[1].destroyed, true);
    assert.equal(windows[0].destroyed, false);
    manager.disconnect(a);
    assert.equal(windows[0].destroyed, true);
    assert.equal(manager.clients.size, 0);
    const unsupported = new ScreenOverlayManager({ createWindow: () => assert.fail(), screen, unsupported: 'Wayland',
        report: (_client, status) => reports.push(status) });
    unsupported.receive(a, snapshot());
    assert.equal(reports.at(-1).supported, false);
    const excessive = snapshot();
    excessive.shapes = Array.from({ length: 8193 }, (_, i) => shape(i));
    manager.receive(a, excessive);
    assert.match(reports.at(-1)[1].error, /8192 shapes/);
    assert.match(reports.at(-1)[1].message, /8192 shapes/);
});

test('hiding before initial renderer load does not show the window', () => {
    const win = new FakeWindow();
    const manager = new ScreenOverlayManager({ screen, platform: 'win32', createWindow: () => win });
    const client = {};
    manager.receive(client, snapshot());
    const hidden = snapshot();
    hidden.visible = false;
    manager.receive(client, hidden);
    win.webContents.emit('did-finish-load');
    assert.equal(win.visible, false);
    manager.close();
});

test('renderer load rejection reports status and removes the window', () => {
    const win = new FakeWindow(), reports = [];
    const manager = new ScreenOverlayManager({ screen, platform: 'win32', createWindow: () => win,
        report: (_client, status) => reports.push(status) });
    const client = {};
    manager.receive(client, snapshot());
    win.emit('screen-overlay-load-error', new Error('test failure'));
    assert.match(reports.at(-1).message, /failed to load: test failure/);
    assert.equal(win.destroyed, true);
    assert.equal(manager.clients.size, 0);
});

test('real BoardDrawer renders, preserves animation and stacking across snapshots', async t => {
    const chrome = process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '';
    if(!chrome || !existsSync(chrome)) return t.skip('Chrome is not available');
    let chromium;
    try { ({ chromium } = await import('../app/assets/engines/lc0/node_modules/playwright/index.mjs')); }
    catch { return t.skip('Playwright is not available'); }
    const profile = path.resolve('tests', `screen-overlay-profile-${process.pid}`);
    assert.equal(existsSync(profile), false);
    let context;
    try {
        context = await chromium.launchPersistentContext(profile, { executablePath: chrome, headless: true,
            viewport: { width: 400, height: 400 } });
        await context.addInitScript(() => { window.screenOverlay = { onSnapshot: cb => { window.applyOverlay = cb; } }; });
        const page = await context.newPage();
        await page.goto(pathToFileURL(path.resolve('appServer', 'ui', 'screenOverlay.html')).href);
        assert.ok(await page.evaluate(async () => (await document.fonts.load('16px Rubik')).length > 0));
        const data = snapshot();
        data.shapes = [shape(1), { id: 2, type: 'text', positions: 'b2',
            config: { text: '♞', size: 2, style: 'fill:red;font-size:30px;' }, display: '',
            ariaLabel: '♞ <script>', title: '<img src=x onerror=alert(1)>',
            animations: [{ start: Date.now(), keyframes: [{ opacity: 0 }, { opacity: 1 }],
                options: { duration: 5000, fill: 'forwards' } }] }];
        await page.evaluate(value => window.applyOverlay(value), normalizeOverlay(data));
        assert.match(await page.locator('svg > text').first().evaluate(node => getComputedStyle(node).fontFamily), /Rubik/);
        assert.deepEqual(await page.locator('svg > *').evaluateAll(nodes => nodes.map(n => n.tagName)), ['polygon', 'text']);
        assert.equal(await page.locator('svg > text').evaluate(node => node.firstChild.textContent), '♞');
        assert.equal(await page.locator('svg > text').getAttribute('aria-label'), '♞ <script>');
        assert.equal(await page.locator('svg > text > title').textContent(), '<img src=x onerror=alert(1)>');
        assert.equal(await page.locator('img, script[src=x]').count(), 0);
        const mutations = await page.evaluate(value => {
            const svg = document.querySelector('svg');
            const observer = new MutationObserver(() => {});
            observer.observe(svg, { childList: true, attributes: true, characterData: true, subtree: true });
            window.applyOverlay(value);
            const records = observer.takeRecords();
            observer.disconnect();
            return records.length;
        }, normalizeOverlay(data));
        assert.equal(mutations, 0);
        const transform = await page.locator('svg > polygon').getAttribute('transform');
        await page.evaluate(() => { window.originalAnimation = document.querySelector('svg > text').getAnimations()[0]; });
        data.shapes.reverse();
        data.shapes[1].display = 'none';
        data.orientation = 'b';
        await page.evaluate(value => window.applyOverlay(value), normalizeOverlay(data));
        assert.deepEqual(await page.locator('svg > *').evaluateAll(nodes => nodes.map(n => n.tagName)), ['polygon', 'text']);
        assert.notEqual(await page.locator('svg > polygon').getAttribute('transform'), transform);
        assert.equal(await page.locator('svg > polygon').evaluate(node => node.style.display), 'none');
        assert.equal(await page.evaluate(() => window.originalAnimation === document.querySelector('svg > text').getAnimations()[0]), true);
        await page.setViewportSize({ width: 410, height: 410 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.locator('svg > polygon').evaluate(node => node.style.display), 'none');
        // A new board can reuse IDs with unrelated shape geometry/configuration.
        data.shapes = [{ id: 2, type: 'rectangle', positions: 'e4',
            config: { style: 'fill:gold;' }, display: '', animations: [] }];
        await page.evaluate(value => window.applyOverlay(value), normalizeOverlay(data));
        assert.equal(await page.locator('svg > text, svg > polygon').count(), 0);
        assert.equal(await page.locator('svg > rect').count(), 1);
        assert.equal(await page.locator('svg > rect').evaluate(node => node.style.fill), 'gold');
        assert.equal(await page.locator('svg > rect > title').count(), 0);
        assert.equal(await page.locator('svg > rect').getAttribute('aria-label'), null);
        const opacity = await page.evaluate(value => {
            const start = Date.now();
            const animations = [{ start, keyframes: [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }],
                options: { duration: 10000, fill: 'forwards' } }];
            const text = { id: 3, type: 'text', positions: 'e4', config: { text: 'Guard' }, display: '', animations };
            const rectangle = { id: 4, type: 'rectangle', positions: 'e4', config: { style: 'fill:gold;' }, display: '', animations };
            window.applyOverlay({ ...value, shapes: [text, rectangle] });
            const elements = [...document.querySelector('svg').children];
            const original = elements.map(element => element.getAnimations()[0]);
            original.forEach(animation => { animation.pause(); animation.currentTime = 9000; });
            const before = elements.map(element => Number(getComputedStyle(element).opacity));
            window.applyOverlay({ ...value, shapes: [text, rectangle, { id: 5, type: 'arrow',
                positions: ['f3', 'e4'], config: {}, display: '', animations: [] }] });
            const after = elements.map(element => Number(getComputedStyle(element).opacity));
            const retained = elements.every((element, index) => element.getAnimations()[0] === original[index]);
            window.applyOverlay({ ...value, shapes: [text] });
            return { before, after, retained, last: Number(getComputedStyle(elements[1]).opacity) };
        }, normalizeOverlay(data));
        assert.deepEqual(opacity.before, [0.5, 0.5]);
        assert.deepEqual(opacity.after, opacity.before, 'Adding a later arrow must not flash fading labels or squares');
        assert.equal(opacity.retained, true);
        assert.equal(opacity.last, 0.5, 'Removing other marks must not restart the remaining label fade');
        data.shapes = [];
        await page.evaluate(value => window.applyOverlay(value), normalizeOverlay(data));
        assert.equal(await page.locator('svg > *').count(), 0);
    } finally {
        if(context) await context.close();
        rmSync(profile, { recursive: true, force: true });
    }
});

test('Electron overlay window loads the real drawer and isolated preload', async t => {
    if(process.env.ACAS_SCREEN_OVERLAY_SMOKE !== '1' || process.platform !== 'win32')
        return t.skip('Opt in on a Windows desktop with ACAS_SCREEN_OVERLAY_SMOKE=1');
    const electron = path.resolve('appServer', 'node_modules', 'electron', 'dist', 'electron.exe');
    if(!existsSync(electron)) return t.skip('Electron is not installed');
    const profile = path.resolve('tests', `screen-overlay-electron-profile-${process.pid}`);
    assert.equal(existsSync(profile), false);
    try {
        const { stdout } = await promisify(execFile)(electron,
            [path.resolve('tests', 'screen-overlay-electron-smoke.cjs'), profile], { timeout: 30000 });
        assert.match(stdout, /electron overlay smoke passed/);
    } finally {
        rmSync(profile, { recursive: true, force: true });
    }
});
