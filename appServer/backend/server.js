import { toast } from './util.js';
import { mainWindow } from './main.js';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

import { findAliveEngineObj, updateAliveEngineObjFen, killAllBy,
    saveEngineOptions, sendToProcess, startEngine, savedEngines } from './engine.js';

const PORT = 2800;
const ALLOWED_ORIGIN = [
    'http://localhost',
    'https://psyyke.github.io'
];

const clients = new Set();
let wssRef = null;
let warnedAboutMultipleClients = false;

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
    return identifierObj.engineId + identifierObj.profileName + identifierObj.instanceId;
}

async function handleClientUciCommand(cmdObj) {
    const { engineId, profileName, instanceId, command, launchParams } = cmdObj;

    if(typeof engineId !== 'string')
        throw new Error('Invalid engine ID! Must be a string.');
    if(typeof instanceId !== 'string')
        throw new Error('Instance ID must be a string');
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

    const identifierObj = { engineId, profileName, instanceId };
          identifierObj.identifierKey = getIdentifierKey(identifierObj);
          identifierObj.savedOptionsIdentifierKey = `${identifierObj.profileName}_${engineId}`;
          identifierObj.launchParams = launchParams;

    const engineProcess = findAliveEngineObj(identifierObj)?.engineProcess;

    saveEngineOptions(command, identifierObj);

    // Update engineObj currentFen
    if(command.startsWith('position fen')) {
        const fen = command.slice(13);
        updateAliveEngineObjFen(fen, identifierObj);
    }

    if(!engineProcess?.stdin?.writable) {
        const process = await startEngine(savedEngineObj.path, identifierObj); // includes logic to avoid spamming

        if(!process) {
            toast('error', `Something went wrong while starting the engine ID ${engineId}!`, 10000);
            return;
        }
    }

    sendToProcess(command, identifierObj);
}

// Expects e.g. { "type": "uci", "msg": { "engineId": 12345, "profileName": "default", "command": "position startpos" } }
function onCommandReceived(remoteCommand) {
    if(typeof remoteCommand !== 'string' || remoteCommand.length > 4096) {
        toast('error', 'Rejected oversized or non-string payload', 10000);
        return;
    }

    try {
        const parsed = JSON.parse(remoteCommand);
        const { type, msg } = parsed;

        if(!type) throw new Error('Missing type field');

        switch (type) {
            case 'uci':
                handleClientUciCommand(msg);
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
        toast('error', `Failed to process remote command;\n\n${remoteCommand?.slice(0, 500)}\n\nReason: ${e?.message}`, 20000);
    }
}

export function startLocalWSS() {
    const server = http.createServer((req, res) => {
        req.socket.destroy();
    });

    const wss = new WebSocketServer({ noServer: true });
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

        ws.on('message', (msg) => {
            onCommandReceived(msg.toString());
        });

        ws.on('close', () => {
            clients.delete(ws);

            if(wss.onClientChange) wss.onClientChange(false);
        });
    });

    wss.httpServer.on('listening', () => {
        if(!mainWindow || mainWindow.isDestroyed()) return;

        const addressObj = wss.httpServer.address();

        mainWindow.webContents.send('serverListening', {
            address: addressObj.address,
            family: addressObj.family,
            port: addressObj.port
        });
    });

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

    server.listen(PORT, '127.0.0.1');

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
export function sendUciLineToClient(line, engineId, profileName, instanceId) {
    if(!profileName) {
        console.error('No profileName given to send UCI line function, cannot send!'); return; }
    if(!engineId) {
        console.error('No engineId given to send UCI line function, cannot send!'); return; }
    if(!instanceId) {
        console.error('No instanceId given to send UCI line function, cannot send!'); return; }

    // Expects e.g. { "type": "uci", "msg": { "line": "info depth 12...", "engineId": 12345, "profileName": "default", "instanceId": "100" } }
    broadcastToClients({
        type: 'uci', msg: { line, engineId, profileName, instanceId }
    });
}

// Called from engine.js
// Expected death certificate includes reason, fen, profileName, engineId and instanceId
export function sendEngineDeathCertificateToClient(reason = 'not given', fen, engineId, profileName, instanceId) {
    if(!profileName) {
        console.error('No profileName given to sendEngineDeathCertificate function, cannot send!'); return; }
    if(!instanceId){
        console.error('No instanceId given to sendEngineDeathCertificate function, cannot send!'); return; }

    broadcastToClients({
        'type': 'engineStatusUpdate',
        'msg': {
            'statusType': 'engineDeathCertificate',
            reason, fen, engineId, profileName, instanceId
        }
    });
}