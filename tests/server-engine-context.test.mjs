import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { EventEmitter } from 'node:events';
import { chromium } from 'playwright';
import { validateUciCommand } from '../appServer/backend/uciCommand.js';
import { startServer } from './maia-elo/serve.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const consoleSource = read('../appServer/ui/js/console.js');
const i18nSource = read('../appServer/ui/js/i18n.js');
const uiSource = read('../appServer/ui/index.js');
const engineSource = read('../appServer/backend/engine.js');
const serverSource = read('../appServer/backend/server.js');
const identifier = { engineId: 'engine-hash', profileName: 'Aggressive', instanceId: 'instance-hash',
    identifierKey: 'process-key', siteDomain: 'lichess.org' };
const savedEngines = [{ engineId: identifier.engineId, title: 'AggroChess', name: 'aggro.exe' }];

test('Pena and engine sockets from one GUI do not announce duplicate connections or multiple tabs', () => {
    const notices = [], warnings = [], clients = new Set(), guiClients = new Set();
    class SocketServer extends EventEmitter {}
    const httpServer = new EventEmitter();
    httpServer.listen = () => {};
    const functions = serverSource.slice(serverSource.indexOf('function broadcastToClients('),
        serverSource.indexOf('function getIdentifierKey('));
    const start = serverSource.slice(serverSource.indexOf('export function startLocalWSS('),
        serverSource.indexOf('export function stopLocalWSS(')).replace('export function', 'function');
    const { wss, broadcast } = runInNewContext(`${functions}\n${start}\n({ wss: startLocalWSS(), broadcast: broadcastToClients });`, {
        clients, guiClients, warnedAboutMultipleClients: false, wssRef: null, overlaySweepTimer: null,
        app: { getVersion: () => '1.2.1' },
        WebSocketServer: SocketServer, WebSocket: { OPEN: 1 }, http: { createServer: () => httpServer },
        getServerPort: () => 2800, mainWindow: null, ALLOWED_ORIGIN: [],
        setInterval: () => ({ unref() {} }), screenOverlays: { disconnect() {}, sweep() {} },
        attachAIClient: () => async () => {}, localAIHost: {}, localAISetup: {},
        CommandQueue: class {}, parseClientMessage: JSON.parse,
        onCommandReceived: async () => {}, reportCommandFailure: error => { throw error; },
        toast: (_type, text) => warnings.push(text), console
    });
    wss.onClientChange = connected => notices.push(connected);
    const connect = () => {
        const socket = new EventEmitter();
        socket.readyState = 1;
        socket.messages = [];
        socket.send = message => socket.messages.push(JSON.parse(message));
        wss.emit('connection', socket, { headers: { origin: 'http://localhost' } });
        return socket;
    };
    const engine = connect();
    assert.deepEqual(JSON.parse(JSON.stringify(engine.messages[0])), { type: 'serverInfo', version: '1.2.1' });
    engine.emit('message', JSON.stringify({ type: 'getEngines' }));
    const ai = connect();
    assert.equal(ai.messages[0].version, '1.2.1', 'Pena-only connections receive the version too');
    ai.emit('message', JSON.stringify({ type: 'ai', action: 'status' }));
    assert.deepEqual(notices, [true], 'Only the first socket announces a connection');
    assert.equal(guiClients.size, 1, 'Pena is not a second GUI tab');
    broadcast({});
    assert.equal(warnings.length, 0);
    ai.emit('close');
    assert.deepEqual(notices, [true], 'Closing Pena does not mark the remaining GUI disconnected');
    const otherGui = connect();
    otherGui.emit('message', JSON.stringify({ type: 'getEngines' }));
    broadcast({});
    assert.equal(warnings.length, 1, 'Two real GUI clients still warn');
    broadcast({});
    assert.equal(warnings.length, 1, 'The warning is not repeated on every broadcast');
    otherGui.emit('close');
    engine.emit('close');
    engine.emit('close');
    assert.deepEqual(notices, [true, false], 'Only the final disconnect is announced, once');
});

test('server update floaty checks the exact minimum, translates all languages and stays dismissible', async t => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 320, height: 700 } });
    await page.goto(`${url}/app/index.html`);
    const versions = ['1.1.99', '1.2.0', '1.2.1-rc.1', '1.2.1', 'v1.2.1+build.2', '1.2.2-rc.1',
        '1.2.10', '1.10.0', '2.0.0', null, 'invalid'];
    const results = await page.evaluate(async versions => {
        const api = await import('./assets/js/gui/serverVersion.js');
        api.reportServerVersion('1.2.1');
        return { checks: versions.map(api.serverNeedsUpdate), open: document.getElementById('server-update-floaty').open };
    }, versions);
    assert.deepEqual(results, { checks: [true, true, true, false, false, false, false, false, false, true, true], open: false });
    await page.evaluate(async () => (await import('./assets/js/gui/serverVersion.js')).reportServerVersion('1.2.0'));
    const dialog = page.locator('#server-update-floaty');
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await dialog.locator('.floaty-header, h1').count(), 0);
    const root = new URL('../assets/i18n/', import.meta.url);
    const { availableLanguages } = JSON.parse(readFileSync(new URL('meta.json', root), 'utf8'));
    for(const [language] of availableLanguages) {
        const data = JSON.parse(readFileSync(new URL(`${language}.json`, root), 'utf8'));
        const strings = data.translations.serverUpdate;
        assert.deepEqual(Object.keys(strings).sort(), ['close', 'download', 'message', 'title'], language);
        assert.deepEqual([...strings.message.matchAll(/\{\w+\}/g)].map(match => match[0]), ['{version}'], language);
        await page.evaluate(data => {
            TRANS_OBJ = data.translations;
            FULL_TRANS_OBJ = data;
            document.dispatchEvent(new Event('acas-translations-updated'));
        }, data);
        for(const key of ['message', 'download', 'close'])
            assert.equal(await dialog.locator(`[data-server-update="${key}"]`).textContent(),
                strings[key].replace('{version}', '1.2.1'), `${language}: ${key}`);
        const layout = await dialog.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            const close = element.querySelector('[data-server-update="close"]').getBoundingClientRect();
            const download = element.querySelector('[data-server-update="download"]').getBoundingClientRect();
            const message = element.querySelector('[data-server-update="message"]').getBoundingClientRect();
            return { left: bounds.left, right: bounds.right, width: innerWidth,
                overflow: element.scrollWidth > element.clientWidth,
                splitRow: close.right < download.left && Math.abs(close.top - download.top) < 1
                    && Math.abs(close.width - download.width) < 1 && close.top > message.bottom };
        });
        assert.ok(layout.left >= 0 && layout.right <= layout.width && !layout.overflow, `${language}: ${JSON.stringify(layout)}`);
        assert.equal(layout.splitRow, true, `${language}: buttons share an equally split bottom row, dismiss on the left`);
        assert.equal(await dialog.getAttribute('dir'), data.textDirection ?? 'auto');
    }
    assert.equal(await dialog.locator('a').getAttribute('href'), 'https://github.com/Psyyke/A.C.A.S/releases/latest');
    const close = dialog.locator('[data-server-update="close"]');
    const beforePress = await close.boundingBox();
    const containerBeforePress = await dialog.boundingBox();
    await page.mouse.move(beforePress.x + 2, beforePress.y + 2);
    await page.mouse.down();
    assert.deepEqual(await dialog.boundingBox(), containerBeforePress, 'The press animation must not resize the floaty');
    await page.mouse.up();
    assert.equal(await dialog.isVisible(), false, 'An edge click dismisses the warning reliably');
    await page.evaluate(async () => (await import('./assets/js/gui/serverVersion.js')).reportServerVersion(null));
    assert.equal(await dialog.isVisible(), false, 'Legacy reconnections do not reopen a dismissed warning');
    await page.reload();
    await page.evaluate(async () => (await import('./assets/js/gui/serverVersion.js')).reportServerVersion(null));
    assert.equal(await dialog.isVisible(), true, 'Legacy servers without a version warn');
    await page.evaluate(async () => (await import('./assets/js/gui/serverVersion.js')).reportServerVersion('1.2.1'));
    assert.equal(await dialog.isVisible(), false, 'Connecting an updated server closes the warning');
});

test('site metadata travels with UCI commands without changing engine identity', async () => {
    let packet, started;
    const clientSource = read('../app/assets/js/AcasWebSocketClient.js');
    const client = runInNewContext(
        clientSource.slice(clientSource.indexOf('export function sendUciToExternalEngine('),
            clientSource.indexOf('export async function closeAllExternalEnginesWithId('))
            .replace('export function', 'function') + '\nsendUciToExternalEngine;',
        { externalCommandQueues: new Map(), externalLaunchParams: new Map(),
            GET_GM_CFG_VALUE: async () => '', GET_EXTERNAL_PARAM_DB_KEY: id => id,
            ws: { send: async data => { packet = data; return true; } }, console });
    assert.equal(await client('uci', identifier.engineId, identifier.profileName, identifier.instanceId,
        () => true, { siteDomain: 'LICHESS.ORG' }), true);
    assert.equal(packet.msg.siteDomain, 'LICHESS.ORG');
    const handle = runInNewContext(
        serverSource.slice(serverSource.indexOf('async function handleClientUciCommand('),
            serverSource.indexOf('// Expects e.g.', serverSource.indexOf('async function handleClientUciCommand('))) +
            '\nhandleClientUciCommand;',
        { savedEngines, validateUciCommand, getIdentifierKey: value =>
            JSON.stringify([value.engineId, value.profileName, value.instanceId]),
            findAliveEngineObj: () => null, startEngine: async (path, value) => { started = value; return {}; },
            sendToProcess: () => true, console });
    await handle(packet.msg);
    assert.equal(started.siteDomain, 'lichess.org');
    const key = started.identifierKey;
    await handle({ ...packet.msg, siteDomain: undefined });
    assert.equal(started.identifierKey, key);
    assert.equal(started.siteDomain, undefined);
    await assert.rejects(() => handle({ ...packet.msg, siteDomain: 'bad\nhostname' }), /hostname/);
});

test('kill notifications identify engine, site and profile, not hashes', () => {
    let notification;
    const engine = { identifierObj: identifier, engineProcess: { kill: () => true } };
    const labelSource = engineSource.slice(engineSource.indexOf('function getEngineDisplayLabel('),
        engineSource.indexOf('function sendToRenderer('));
    const killSource = engineSource.slice(engineSource.indexOf('function killSpecificEngine('),
        engineSource.indexOf('const KILLABLE_FIELDS'));
    const kill = runInNewContext(`${labelSource}\n${killSource}\nkillSpecificEngine;`, {
        savedEngines, aliveEngineProcesses: [engine], findAliveEngineObj: () => engine,
        sendEngineDeathCertificateToClient() {}, removeAliveEngineObj() {}, refreshEngineCards() {},
        toast: (type, text) => notification = text, console
    });
    assert.equal(kill(identifier, 'Killed from server GUI'), true);
    assert.match(notification, /AggroChess.*lichess\.org.*Aggressive/);
    assert.doesNotMatch(notification, /instance-hash|engine-hash/);
});

test('console and library labels use domains but retain internal IDs for kill actions', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent('<select id="server-language"></select><span id="engineSummary"></span><div id="engineGrid"><div class="engine-card" data-engine-id="engine-hash"><span class="engine-card-title">AggroChess</span><span class="engine-status"></span><div class="engine-process-list"></div></div></div><div id="consoles-container"></div>');
        await page.addScriptTag({ content: i18nSource });
        const refresh = uiSource.slice(uiSource.indexOf('function refreshEngineCards('), uiSource.indexOf('async function renderEngineGrid('));
        await page.addScriptTag({ content: `
            const savedEngines = ${JSON.stringify(savedEngines)};
            const consolesContainer = document.getElementById('consoles-container');
            const engineSummary = document.getElementById('engineSummary');
            const engineUiGrid = document.getElementById('engineGrid');
            const t = window.serverI18n.text;
            let runningEngines = [];
            window.engineAPI = { killEngine: async value => { window.killed = value; return true; } };
            ${consoleSource}
            ${refresh}
            const identifier = ${JSON.stringify(identifier)};
            addConsoleView(identifier);
            refreshEngineCards([{ identifierObj: identifier }]);
        ` });
        assert.equal(await page.locator('.console-engine-name').textContent(), 'AggroChess');
        assert.equal(await page.locator('.console-engine-context').textContent(), 'lichess.org · Aggressive');
        assert.equal(await page.locator('.engine-process-context').textContent(), 'lichess.org · Aggressive');
        for(const button of await page.locator('.kill-engine-btn').all())
            assert.match(await button.getAttribute('aria-label'), /AggroChess.*lichess\.org.*Aggressive/);
        await page.locator('.console-section .kill-engine-btn').click();
        assert.deepEqual(await page.evaluate(() => window.killed), identifier);
        const fallback = await page.evaluate(() => getEngineDisplayContext({ engineId: 'engine-hash', profileName: 'Legacy', instanceId: 'hidden-hash' }));
        assert.equal(fallback.context, 'Unknown site · Legacy');
    } finally {
        await browser.close();
    }
});
