const { app, BrowserWindow } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const http = require('http');
const assert = require('assert/strict');

app.setPath('userData', process.argv[2]);
app.disableHardwareAcceleration();
const mouseIgnored = new WeakMap();
const originalIgnoreMouseEvents = BrowserWindow.prototype.setIgnoreMouseEvents;
BrowserWindow.prototype.setIgnoreMouseEvents = function(ignore, ...args) {
    mouseIgnored.set(this, ignore);
    return originalIgnoreMouseEvents.call(this, ignore, ...args);
};
const waitUntil = async (predicate, label, timeout = 10000) => {
    const deadline = Date.now() + timeout;
    while(Date.now() < deadline) {
        if(await predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out: ${label}`);
};
app.whenReady().then(async () => {
    const probe = http.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const { default: Store } = await import(pathToFileURL(path.resolve('appServer', 'node_modules', 'electron-store', 'index.js')));
    new Store().set('serverPort', port);
    const main = await import(pathToFileURL(path.resolve('appServer', 'backend', 'main.js')));
    const server = await import(pathToFileURL(path.resolve('appServer', 'backend', 'server.js')));
    await waitUntil(() => main.mainWindow && !main.mainWindow.webContents.isLoading(), 'main window load');
    const wss = server.startLocalWSS();
    await waitUntil(() => wss.httpServer.listening, 'WebSocket listener');
    main.mainWindow.hide();
    const { screenOverlays } = await import(pathToFileURL(path.resolve('appServer', 'backend', 'screenOverlay.js')));
    const { WebSocket } = await import(pathToFileURL(path.resolve('appServer', 'node_modules', 'ws', 'wrapper.mjs')));
    const connect = async () => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'http://localhost' });
        ws.packets = [];
        ws.on('message', raw => ws.packets.push(JSON.parse(String(raw))));
        await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
        return ws;
    };
    let client = await connect();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(client.packets.length, 0, 'Legacy connections must receive no unsolicited overlay status');
    client.send(JSON.stringify({ type: 'getEngines' }));
    await waitUntil(() => client.packets.length > 0, 'legacy engine list');
    assert.equal(client.packets[0].type, 'enginesList');
    client.send(JSON.stringify({ type: 'screenOverlayCapabilities' }));
    await waitUntil(() => client.packets.some(packet => packet.type === 'screenOverlayStatus'), 'requested capability reply');
    assert.equal(client.packets.find(packet => packet.type === 'screenOverlayStatus').msg.supported, true);
    assert.equal(client.packets.find(packet => packet.type === 'screenOverlayStatus').msg.offsets, true);
    const { realProducerSnapshot } = await import(pathToFileURL(path.resolve('tests', 'screen-overlay-fixture.mjs')));
    const frontend = realProducerSnapshot();
    const data = frontend.snapshot;
    const submit = () => client.send(JSON.stringify({ type: 'screenOverlay', msg: data }));
    const currentEntry = () => [...screenOverlays.clients.values()][0]?.get('smoke');
    submit();
    await waitUntil(() => currentEntry()?.ready, 'overlay renderer load');
    const entry = currentEntry();
    const win = entry.window;
    await waitUntil(() => win.webContents.executeJavaScript("[...document.querySelectorAll('svg text')].some(node => node.textContent === '×')"),
        'UniversalBoardDrawer SVG');
    const result = await win.webContents.executeJavaScript(`({
        text: [...document.querySelectorAll('svg text')].some(node => node.textContent === '×'),
        drawer: typeof UniversalBoardDrawer,
        bridge: typeof window.screenOverlay?.onSnapshot
    })`);
    if(!result.text || result.drawer !== 'function' || result.bridge !== 'function'
        || win.isFocusable() || !win.isAlwaysOnTop() || !win.isVisible()) throw new Error(JSON.stringify(result));
    assert.equal(await win.webContents.executeJavaScript(
        `(async () => (await document.fonts.load('16px Rubik')).length > 0)()`), true);
    const image = await win.webContents.capturePage();
    assert.equal(image.toBitmap()[3], 0, 'Overlay background pixel must be transparent');
    assert.equal(mouseIgnored.get(win), true);
    data.visible = false;
    submit();
    await waitUntil(() => !win.isVisible(), 'hidden snapshot');
    assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('svg > *').length"), data.shapes.length);
    data.visible = true;
    submit();
    await waitUntil(() => win.isVisible(), 'visible snapshot');
    client.close();
    await waitUntil(() => win.isDestroyed() && screenOverlays.clients.size === 0, 'disconnect cleanup');
    client = await connect();
    let rejection;
    client.on('message', raw => {
        const packet = JSON.parse(String(raw));
        if(packet.type === 'screenOverlayStatus' && packet.msg.error) rejection = packet.msg.error;
    });
    submit();
    await waitUntil(() => currentEntry()?.ready, 'second overlay renderer');
    const rejectedWindow = currentEntry().window;
    client.send(JSON.stringify({ type: 'screenOverlay', msg: {
        ...data, shapes: [{ ...data.shapes[0], config: { ...data.shapes[0].config, futureConfig: true } }]
    } }));
    await waitUntil(() => rejection && rejectedWindow.isDestroyed(), 'explicit schema rejection and cleanup');
    assert.match(rejection, /Unsupported shape config field: futureConfig/);
    submit();
    await waitUntil(() => currentEntry()?.ready, 'replacement overlay renderer');
    const staleWindow = currentEntry().window;
    await waitUntil(() => staleWindow.isDestroyed() && screenOverlays.clients.size === 0, 'stale snapshot cleanup', 4000);
    client.close();
    server.stopLocalWSS();
    frontend.clear();
    frontend.drawer.terminate();
    console.log('electron overlay smoke passed: WebSocket, transparent/click-through configuration, SVG, hide, disconnect, stale cleanup');
    app.quit();
}).catch(error => {
    console.error(error);
    app.exit(1);
});
