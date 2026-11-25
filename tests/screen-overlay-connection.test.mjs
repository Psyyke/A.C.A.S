import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app/assets/js/AcasWebSocketClient.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '');

function harness(external = {}, timers = { setTimeout, clearTimeout }, navigator = {}) {
    function input() {
        const listeners = new Map();
        const setting = {
            inert: false, attributes: {},
            setAttribute(name, value) { this.attributes[name] = value; }
        };
        return {
            checked: false, value: '0', disabled: false, setting,
            closest() { return setting; },
            addEventListener(name, callback) { listeners.set(name, callback); },
            emit(name) { listeners.get(name)?.(); }
        };
    }
    const ghost = input(), overlay = input(), offsetX = input(), offsetY = input(),
        status = { textContent: '' }, title = { textContent: '' },
        subtitle = { textContent: '' }, sockets = [], logs = [], documentListeners = new Map();
    class Socket {
        static CONNECTING = 0;
        static OPEN = 1;
        constructor() { this.readyState = 0; this.bufferedAmount = 0; this.messages = []; sockets.push(this); }
        open() { this.readyState = 1; this.onopen(); }
        status(supported, message = 'Screen overlay available.', error, offsets = true) {
            this.onmessage({ data: JSON.stringify({ type: 'screenOverlayStatus', msg: { supported, message, error, offsets } }) });
        }
        send(message) { this.messages.push(JSON.parse(message)); }
        close() { this.readyState = 3; }
    }
    const context = {
        document: { querySelector(selector) {
            if(selector.includes('isUserscriptGhost')) return ghost;
            if(selector.includes('ghostScreenOverlay')) return overlay;
            if(selector.includes('ghostScreenOffsetX')) return offsetX;
            if(selector.includes('ghostScreenOffsetY')) return offsetY;
            if(selector.includes('ghost-screen-overlay-status')) return status;
            if(selector.includes('ghost-floaty-title')) return title;
            if(selector.includes('ghost-floaty-subtitle')) return subtitle;
            return null;
        }, addEventListener(name, callback) { documentListeners.set(name, callback); } },
        serverPortInput: null, WebSocket: Socket, navigator: { userAgent: '', ...navigator },
        localStorage: { getItem: () => null, setItem() {} },
        window: {}, IS_EXTERNAL_ENGINE_SETTING_ACTIVE: external,
        BroadcastChannel: class { postMessage() {} },
        EXTERNAL_UCI_BROADCAST_NAME: 'uci', EXTERNAL_STATUS_BROADCAST_NAME: 'status',
        TRANS_OBJ: null, FULL_TRANS_OBJ: null, toast: { success() {}, message() {} },
        console: { warn: (...args) => logs.push(args), error: (...args) => logs.push(args) }, TextEncoder,
        setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, queueMicrotask
    };
    vm.runInNewContext(`${source}\nglobalThis.api = { sendScreenOverlay, clearScreenOverlay, connectAcasToServer, disconnectAcasFromServer };`, context);
    return { ghost, overlay, offsetX, offsetY, status, title, subtitle, sockets, logs, api: context.api,
        translate(translations, configTranslations) {
            context.TRANS_OBJ = translations;
            context.FULL_TRANS_OBJ = { configTranslations };
            documentListeners.get('acas-translations-updated')();
        } };
}

test('desktop offsets track Draw on screen, including restored values', () => {
    const h = harness();
    assert.equal(h.overlay.disabled, false);
    for(const input of [h.offsetX, h.offsetY]) {
        assert.equal(input.disabled, true);
        assert.equal(input.setting.inert, true);
        assert.equal(input.setting.attributes['aria-disabled'], 'true');
    }
    h.overlay.checked = true;
    h.overlay.emit('acas-value-set');
    assert.equal(h.offsetX.disabled, false);
    assert.equal(h.offsetY.disabled, false);
    h.overlay.checked = false;
    h.overlay.emit('change');
    assert.equal(h.offsetX.disabled, true);
    assert.equal(h.offsetY.disabled, true);
});

test('mobile devices force Draw on screen off even when a saved value is restored', () => {
    for(const navigator of [
        { userAgentData: { mobile: true } },
        { userAgent: 'Mozilla/5.0 (Linux; Android 14; Tablet)' },
        { userAgent: 'Mozilla/5.0 (iPhone)' },
        { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }
    ]) {
        const h = harness({}, { setTimeout, clearTimeout }, navigator);
        h.ghost.checked = true;
        h.overlay.checked = true;
        h.overlay.emit('acas-value-set');
        assert.equal(h.overlay.checked, false);
        assert.equal(h.overlay.disabled, true);
        assert.equal(h.overlay.setting.inert, true);
        assert.equal(h.overlay.setting.attributes['aria-disabled'], 'true');
        assert.equal(h.offsetX.disabled, true);
        assert.equal(h.offsetY.disabled, true);
        assert.equal(h.sockets.length, 0);
    }
});

test('overlay-only connection failures appear in status without console output', () => {
    const h = harness();
    h.ghost.checked = true;
    h.overlay.checked = true;
    h.overlay.emit('change');
    h.sockets[0].onerror({ message: 'connection failed' });
    assert.match(h.status.textContent, /unavailable/);
    assert.deepEqual(h.logs, []);
    h.overlay.checked = false;
    h.overlay.emit('change');
});

test('external engine connection errors retain their console reporting', () => {
    const h = harness({ default: true });
    h.api.connectAcasToServer();
    h.sockets[0].onerror({ message: 'connection failed' });
    assert.equal(h.logs.length, 2);
    h.api.disconnectAcasFromServer();
});

test('screen overlay connects without an external engine and clears before disconnect', () => {
    const h = harness();
    h.ghost.checked = true;
    h.overlay.checked = true;
    h.overlay.emit('change');
    assert.equal(h.sockets.length, 1);
    h.sockets[0].open();
    assert.equal(h.sockets[0].messages.at(-1).type, 'screenOverlayCapabilities');
    assert.match(h.status.textContent, /Connecting/);
    assert.equal(h.api.sendScreenOverlay({ instanceId: 'one', visible: true }), false);
    h.sockets[0].status(true);
    assert.match(h.status.textContent, /available/);
    assert.equal(h.api.sendScreenOverlay({ instanceId: 'one', visible: true }), true);
    assert.equal(h.sockets[0].messages.at(-1).msg.visible, true);
    h.overlay.checked = false;
    h.overlay.emit('change');
    assert.equal(h.sockets[0].messages.at(-1).msg.visible, false);
    assert.equal(h.sockets[0].readyState, 3);
    assert.equal(h.api.sendScreenOverlay({ instanceId: 'one', visible: true }), false);
});

test('overlay disable clears its board without disconnecting an external engine', () => {
    const h = harness({ default: true });
    h.ghost.checked = true;
    h.overlay.checked = true;
    h.overlay.emit('change');
    h.sockets[0].open();
    h.sockets[0].status(true);
    h.api.sendScreenOverlay({ instanceId: 'one', visible: true });
    h.api.clearScreenOverlay('one');
    assert.equal(h.sockets[0].messages.at(-1).msg.visible, false);
    h.overlay.checked = false;
    h.overlay.emit('change');
    assert.equal(h.sockets[0].readyState, 1);
});

test('external engine shutdown leaves an enabled overlay connected', () => {
    const h = harness();
    h.ghost.checked = true;
    h.overlay.checked = true;
    h.overlay.emit('change');
    h.sockets[0].open();
    h.sockets[0].status(true);
    h.api.disconnectAcasFromServer();
    assert.equal(h.sockets[0].readyState, 1);
});

test('ordinary external engine connections do not request overlay capabilities', () => {
    const h = harness({ default: true });
    h.api.connectAcasToServer();
    h.sockets[0].open();
    assert.equal(h.sockets[0].messages.some(message => message.type === 'screenOverlayCapabilities'), false);
    h.ghost.checked = true;
    h.overlay.checked = true;
    h.overlay.emit('change');
    assert.equal(h.sockets[0].messages.at(-1).type, 'screenOverlayCapabilities');
    h.sockets[0].status(true);
    h.overlay.checked = false;
    h.overlay.emit('change');
});

test('unsupported servers do not receive drawing snapshots', () => {
    const h = harness();
    h.ghost.checked = true;
    h.overlay.checked = true;
    h.overlay.emit('change');
    h.sockets[0].open();
    h.sockets[0].status(false, 'Wayland is not supported');
    assert.match(h.status.textContent, /Wayland/);
    assert.equal(h.api.sendScreenOverlay({ instanceId: 'one', visible: true }), false);
    assert.equal(h.sockets[0].messages.some(message => message.type === 'screenOverlay'), false);
    h.overlay.checked = false;
    h.overlay.emit('change');
});

test('older servers without a capability reply prompt for an update', () => {
    let callback;
    const h = harness({}, {
        setTimeout: fn => { callback = fn; return 1; },
        clearTimeout: () => {}
    });
    h.ghost.checked = true;
    h.overlay.checked = true;
    h.overlay.emit('change');
    h.sockets[0].open();
    callback();
    assert.match(h.status.textContent, /Update the local server/);
    assert.equal(h.api.sendScreenOverlay({ instanceId: 'one', visible: true }), false);
    h.overlay.checked = false;
    h.overlay.emit('change');
});

test('oversized snapshots pause the overlay instead of disconnecting engines', () => {
    const h = harness({ default: true });
    h.ghost.checked = true;
    h.overlay.checked = true;
    h.overlay.emit('change');
    h.sockets[0].open();
    h.sockets[0].status(true);
    h.api.sendScreenOverlay({ instanceId: 'one', visible: true });
    assert.equal(h.api.sendScreenOverlay({ instanceId: 'one', data: 'x'.repeat(512 * 1024) }), false);
    assert.equal(h.sockets[0].messages.at(-1).msg.visible, false);
    assert.equal(h.sockets[0].readyState, 1);
    assert.match(h.status.textContent, /paused/);
    assert.equal(h.api.sendScreenOverlay({ instanceId: 'one', visible: true }), true);
    assert.match(h.status.textContent, /available/);
    h.overlay.checked = false;
    h.overlay.emit('change');
});

test('language changes update Ghost title, subtitle and current status without losing errors', () => {
    const h = harness();
    h.ghost.checked = true;
    h.overlay.checked = true;
    h.overlay.emit('change');
    h.sockets[0].open();
    h.sockets[0].status(false, 'Wayland is not supported');
    h.translate({ ghostScreen: { tagline: 'Haamuasetukset', unavailable: 'Ei käytettävissä.' } },
        { isUserscriptGhost: ['Suojamoodi', 'Kuvaus'] });
    assert.equal(h.title.textContent, 'Suojamoodi');
    assert.equal(h.subtitle.textContent, 'Haamuasetukset');
    assert.equal(h.status.textContent, 'Ei käytettävissä. Wayland is not supported');
    h.sockets[0].status(true);
    h.translate({ ghostScreen: { tagline: 'Ghost settings', available: 'Overlay ready.' } },
        { isUserscriptGhost: ['Ghost Script', 'Description'] });
    assert.equal(h.status.textContent, 'Overlay ready.');
    h.overlay.checked = false;
    h.overlay.emit('change');
});

test('pixel offsets update the active overlay without changing its source snapshot', () => {
    const h = harness();
    h.ghost.checked = true;
    h.overlay.checked = true;
    h.overlay.emit('change');
    h.sockets[0].open();
    h.sockets[0].status(true);
    const snapshot = { instanceId: 'one', visible: true };
    h.api.sendScreenOverlay(snapshot);
    h.offsetX.value = '15';
    h.offsetX.emit('input');
    h.offsetY.value = '-12';
    h.offsetY.emit('input');
    assert.deepEqual(h.sockets[0].messages.at(-1).msg.offset, { x: 15, y: -12 });
    assert.equal(snapshot.offset, undefined);
    h.offsetX.value = '2.5';
    h.offsetX.emit('input');
    assert.match(h.status.textContent, /whole pixel offsets/);
    assert.equal(h.sockets[0].messages.at(-1).msg.visible, false);
    h.offsetX.value = '0';
    h.offsetX.emit('input');
    assert.deepEqual(h.sockets[0].messages.at(-1).msg.offset, { x: 0, y: -12 });
    assert.equal(h.sockets[0].messages.at(-1).msg.visible, true);
    h.overlay.checked = false;
    h.overlay.emit('change');
});

test('older servers still draw at zero offset but require an update for offsets', () => {
    const h = harness();
    h.ghost.checked = true;
    h.overlay.checked = true;
    h.overlay.emit('change');
    h.sockets[0].open();
    h.sockets[0].status(true, 'Screen overlay available.', undefined, null);
    assert.equal(h.api.sendScreenOverlay({ instanceId: 'one', visible: true }), true);
    h.offsetX.value = '5';
    h.offsetX.emit('input');
    assert.match(h.status.textContent, /Update the local server/);
    assert.equal(h.sockets[0].messages.at(-1).msg.visible, false);
    h.offsetX.value = '0';
    h.offsetX.emit('input');
    assert.equal(h.sockets[0].messages.at(-1).msg.visible, true);
    h.overlay.checked = false;
    h.overlay.emit('change');
});
