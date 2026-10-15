import { toast } from './util.js';
import { mainWindow } from './main.js';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import Store from 'electron-store';
import CommandQueue from './commandQueue.js';

import { findAliveEngineObj, updateAliveEngineObjFen, killAllBy,
    sendToProcess, startEngine, savedEngines, markEngineOptionsInitialized } from './engine.js';

const DEFAULT_PORT = 2800;
const PORT_STORAGE_KEY = 'serverPort';
const store = new Store();
const ALLOWED_ORIGIN = [
    'http://localhost',
    'https://psyyke.github.io'
];

const clients = new Set();
let wssRef = null;
let warnedAboutMultipleClients = false;

export function getServerPort() {
    const port = store.get(PORT_STORAGE_KEY, DEFAULT_PORT);
    if(!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error(`Invalid configured server port: ${port}`);
    return port;
}

export async function setServerPort(port) {
    if(!Number.isInteger(port) || port < 1 || port > 65535)
        return 'Port must be a whole number between 1 and 65535.';

    if(port === getServerPort()) return false;

    // Do not save a busy port and restart into an unusable configuration.
    const portError = await new Promise(resolve => {
        const probe = http.createServer();
        probe.once('error', error => resolve(error?.code === 'EADDRINUSE'
            ? `Port ${port} is already in use. Choose a different port.`
            : `Cannot use port ${port}: ${error?.message ?? error}`));
        probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(null)));
    });
    if(portError) return portError;

    store.set(PORT_STORAGE_KEY, port);
    return true;
}

function broadcastToClients(payloadObj) {
    const data = JSON.stringify(payloadObj);

    if(clients.size > 1 && !warnedAboutMultipleClients) {
        warnedAboutMultipleClients = true;
        toast('error', `Multiple GUI tabs connected! Please only use one at a time.`, 60000);
    }

    for(const ws of clients) {
        if(ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(data);
            } catch (e) {
                console.error('Failed to send to a client:', e?.message);
            }
        }
    }
}

function getIdentifierKey(identifierObj) {
    // Straight concatenation collides: {profileName:'a', instanceId:'b1'} and
    // {profileName:'ab', instanceId:'1'} produced the same key, which made two
    // instances share an engine start lock and a console view.
    return JSON.stringify([identifierObj.engineId, identifierObj.profileName, identifierObj.instanceId]);
}

function reportCommandFailure(command, error) {
    console.error('[server] Command rejected:', error?.message ?? error);
    toast('error', `Engine command failed: ${error?.message ?? error}`, 5000);
}

async function handleClientUciCommand(cmdObj) {
    const {
        engineId, profileName, instanceId, command, launchParams,
        clientManagesOptions, resumeEngineOptions, optionsInitialized
    } = cmdObj;

    if(typeof engineId !== 'string')
        throw new Error('Invalid engine ID! Must be a string.');
    // Older clients can send startup/stop commands before selecting an engine.
    if(!engineId.trim()) return;
    if(typeof instanceId !== 'string')
        throw new Error('Instance ID must be a string');
    if(typeof profileName !== 'string' || !profileName.trim())
        throw new Error('Profile name must be a nonempty string');
    if(typeof command !== 'string')
        throw new Error('Command must be a string');
    if(/[\n\r&;|]/.test(command))
        throw new Error('Command contains forbidden control characters');
    if(command.length > 512)
        throw new Error('Command too long');

    // savedEngineObj = e.g. { "title": "custom", "name": "lc0.exe", "path": "...", "engineId": "<sha256 hex>" }
    // Different from aliveEngineObj!
    const savedEngineObj = savedEngines.find(e => e.engineId === engineId);

    if(!savedEngineObj) {
        console.warn(`[server] Unknown engineId received from client: "${engineId}"`);
        toast('warning', `Web command ignored, such engine does not exist!\n(EngineID: "${engineId}")`, 1000);
        return;
    }

    const identifierObj = {
        engineId, profileName, instanceId, launchParams,
        identifierKey: getIdentifierKey({ engineId, profileName, instanceId }),
        savedOptionsIdentifierKey: `${profileName}_${engineId}`,
        clientManagesOptions: clientManagesOptions === true,
        resumeEngineOptions: resumeEngineOptions === true
    };
    const engineProcess = findAliveEngineObj(identifierObj)?.engineProcess;
    const canSendToEngine = engineProcess?.stdin?.writable && !engineProcess.acasTerminated;
    const isInitializationCommand = command.trim() === 'd' || command.trim() === 'position startpos';
    const completesInitialization = clientManagesOptions === true
        && optionsInitialized === true && isInitializationCommand;

    if(!canSendToEngine) {
        // A stop for an engine which isn't running must not launch a new process.
        if(command.trim() === 'stop' || completesInitialization) return;

        const process = await startEngine(savedEngineObj.path, identifierObj); // includes logic to avoid spamming

        if(!process) {
            toast('error', `Something went wrong while starting the engine ID ${engineId}!`, 10000);
            return;
        }
    }

    if(command.startsWith('position fen')) {
        updateAliveEngineObjFen(command.slice(13), identifierObj);
    }

    const sent = sendToProcess(command, identifierObj);

    if(sent && completesInitialization)
        markEngineOptionsInitialized(identifierObj);
}

// Expects e.g. { "type": "uci", "msg": { "engineId": 12345, "profileName": "default", "command": "position startpos" } }
async function onCommandReceived(remoteCommand) {
    try {
        const { type, msg } = remoteCommand;

        if(!type) throw new Error('Missing type field');

        switch (type) {
            case 'uci':
                await handleClientUciCommand(msg);
                break;

            case 'getEngines':
                sendEnginesList();
                break;

            case 'closeEnginesByIdentifier': {
                const { identifier, type: field } = msg;
                killAllBy(field, identifier, `All engines with ${field} "${identifier}" were closed by client`);
                break;
            }

            default:
                throw new Error(`Unknown type: ${type}`);
        }

    } catch (e) {
        reportCommandFailure(remoteCommand, e);
    }
}

function emitListeningState(wss) {
    if(!mainWindow || mainWindow.isDestroyed()) return;

    const addressObj = wss.httpServer?.address();

    if(!addressObj) return;

    mainWindow.webContents.send('serverListening', {
        address: addressObj.address,
        family: addressObj.family,
        port: addressObj.port
    });
}

export function startLocalWSS() {
    // A recreated window (macOS activate) missed the one-shot 'listening' event and
    // would sit on OFFLINE forever, so just re-announce instead of binding twice
    if(wssRef) {
        emitListeningState(wssRef);

        return wssRef;
    }

    const server = http.createServer((req, res) => {
        req.socket.destroy();
    });
    const port = getServerPort();

    const wss = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false });
    wss.httpServer = server;

    server.on('upgrade', (request, socket, head) => {
        const origin = request.headers.origin || 'unknown';

        if(ALLOWED_ORIGIN?.length > 0 && !ALLOWED_ORIGIN.includes(origin)) {
            if(wss.onUnauthorized) wss.onUnauthorized(origin);

            socket.destroy();

            return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });

    wss.on('connection', (ws, request) => {
        clients.add(ws);

        if(wss.onClientChange) wss.onClientChange(true, request.headers.origin);

        const commandQueue = new CommandQueue();
        ws.on('message', (msg) => {
            const command = msg.toString();
            try {
                if(command.length > 4096) throw new Error('Command payload too long');
                const parsed = JSON.parse(command);
                if(parsed?.type === 'uci') {
                    const key = getIdentifierKey(parsed.msg);
                    commandQueue.run(key, () => onCommandReceived(parsed))
                        .catch(error => reportCommandFailure(command, error));
                } else if(parsed?.type === 'closeEnginesByIdentifier') {
                    commandQueue.barrier(() => onCommandReceived(parsed))
                        .catch(error => reportCommandFailure(command, error));
                } else {
                    onCommandReceived(parsed).catch(error => reportCommandFailure(command, error));
                }
            } catch(error) {
                reportCommandFailure(command, error);
            }
        });

        ws.on('close', () => {
            clients.delete(ws);

            if(wss.onClientChange) wss.onClientChange(false);
        });

        // ws requires this, without it a client resetting mid-frame throws
        ws.on('error', err => {
            console.error('[server] client socket error:', err?.message);
            clients.delete(ws);
        });
    });

    wss.httpServer.on('listening', () => emitListeningState(wss));

    wss.onClientChange = (isConnected, origin) => {
        if(!mainWindow || mainWindow.isDestroyed()) return;

        mainWindow.webContents.send('serverClientChange', {
            isConnected,
            origin
        });
    };

    wss.onUnauthorized = (origin) => {
        if(!mainWindow || mainWindow.isDestroyed()) return;

        mainWindow.webContents.send('serverUnauthorized', {
            origin
        });
    };

    // Emitted asynchronously, so with no listener EADDRINUSE takes the process down
    // and the window is left showing OFFLINE forever
    server.on('error', err => {
        const reason = err?.code === 'EADDRINUSE'
            ? `Port ${port} is already in use, is another copy of ACAS running?`
            : `Server error: ${err?.message}`;

        console.error('[server]', reason);
        toast('error', reason, 20000);
    });

    server.listen(port, '127.0.0.1');

    wssRef = wss;

    return wss;
}

export function stopLocalWSS() {
    if(!wssRef) return;

    for(const ws of clients) {
        try { ws.close(); } catch (e) {}
    }

    clients.clear();

    wssRef.close();
    wssRef.httpServer?.close();
    wssRef = null;
}

// This doesnt use instanceId, so it will be sent to every A.C.A.S instance
// might cause issues later on but right now doesn't seem to be a big deal!
export function sendEnginesList() {
    broadcastToClients({ type: 'enginesList', msg: savedEngines });
}

// Called from engine.js
export function sendUciLineToClient(line, engineId, profileName, instanceId, details = {}) {
    if(!profileName) {
        console.error('No profileName given to send UCI line function, cannot send!'); return; }
    if(!engineId) {
        console.error('No engineId given to send UCI line function, cannot send!'); return; }
    if(!instanceId) {
        console.error('No instanceId given to send UCI line function, cannot send!'); return; }

    // Expects e.g. { "type": "uci", "msg": { "line": "info depth 12...", "engineId": 12345, "profileName": "default", "instanceId": "100" } }
    broadcastToClients({
        type: 'uci', msg: { line, engineId, profileName, instanceId, ...details }
    });
}

// Called from engine.js
// Expected death certificate includes reason, fen, profileName, engineId and instanceId
export function sendEngineDeathCertificateToClient(reason = 'not given', fen, engineId, profileName, instanceId, details = {}) {
    if(!profileName) {
        console.error('No profileName given to sendEngineDeathCertificate function, cannot send!'); return; }
    if(!instanceId){
        console.error('No instanceId given to sendEngineDeathCertificate function, cannot send!'); return; }

    broadcastToClients({
        'type': 'engineStatusUpdate',
        'msg': {
            'statusType': 'engineDeathCertificate',
            reason, fen, engineId, profileName, instanceId, ...details
        }
    });
}