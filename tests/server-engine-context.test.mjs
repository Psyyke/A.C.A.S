import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { EventEmitter } from 'node:events';
import { chromium } from 'playwright';
import { validateUciCommand } from '../appServer/backend/uciCommand.js';

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
        socket.send = () => {};
        wss.emit('connection', socket, { headers: { origin: 'http://localhost' } });
        return socket;
    };
    const engine = connect();
    engine.emit('message', JSON.stringify({ type: 'getEngines' }));
    const ai = connect();
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
