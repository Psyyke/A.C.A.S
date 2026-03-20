import { toast } from './util.js';
import { mainWindow } from './main.js';
import { WebSocketServer } from 'ws';
import http from 'http';

import { findAliveEngineObj, updateAliveEngineObjFen, killAllEngineIds, killAllEngineInstanceIds,
    killAllEngineProfileNames, saveEngineOptions, sendToProcess, startEngine, savedEngines } from './engine.js';

const PORT = 2800;
const ALLOWED_ORIGIN = [
    'http://localhost',
    'https://psyyke.github.io'
];

let sendToClient = null;

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

    // savedEngineObj = e.g. { "title": "custom", "name": "lc0.exe", "path": "C:\\Users\\Acas\\Downloads\\lc0\\lc0.exe", "engineId": 1659824228 }
    // Different from aliveEngineObj!
    const savedEngineObj = savedEngines.find(e => e.engineId === engineId);

    if(!savedEngineObj) {
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

            case 'closeEnginesByIdentifier':
                const identifier = msg.identifier;
                const identifierType = msg.type;

                switch(identifierType) {
                    case 'engineId':
                        killAllEngineIds(identifier, `All engines with engineId "${identifier}" were closed by client`);
                        break;
                    case 'profileName':
                        killAllEngineProfileNames(identifier, `All engines with profileName "${identifier}" were closed by client`);
                        break;
                    case 'instanceId':
                        killAllEngineInstanceIds(identifier, `All engines with instanceId "${identifier}" were closed by client`);
                        break;
                }
                
                break;

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
        if(wss.onClientChange) wss.onClientChange(true, request.headers.origin);

        ws.on('message', (msg) => {
            onCommandReceived(msg.toString());
        });

        ws.on('close', () => {
            if(wss.onClientChange) wss.onClientChange(false);
        });

        sendToClient = ws.send.bind(ws);
    });

    wss.httpServer.on('listening', () => {
        const addressObj = wss.httpServer.address();

        mainWindow.webContents.send('serverListening', {
            address: addressObj.address,
            family: addressObj.family,
            port: addressObj.port
        });
    });

    wss.onClientChange = (isConnected, origin) => {
        mainWindow.webContents.send('serverClientChange', {
            isConnected,
            origin
        });
    };

    wss.onUnauthorized = (origin) => {
        mainWindow.webContents.send('serverUnauthorized', {
            origin
        });
    };

    server.listen(PORT, '127.0.0.1');

    return wss;
}

// This doesnt use instanceId, so it will be sent to every A.C.A.S instance
// might cause issues later on but right now doesn't seem to be a big deal!
export function sendEnginesList() {
    if(!sendToClient) return;

    const engines = savedEngines;

    sendToClient(JSON.stringify({ type: 'enginesList', msg: engines }));
}

// Called from engine.js
export function sendUciLineToClient(line, engineId, profileName, instanceId) {
    if(!sendToClient) {
        console.error('No sendToClient function found while trying to send UCI line!'); return; }
    if(!profileName) {
        console.error('No profileName given to send UCI line function, cannot send!'); return; }
    if(!engineId) {
        console.error('No engineId given to send UCI line function, cannot send!'); return; }
    if(!instanceId) {
        console.error('No instanceId given to send UCI line function, cannot send!'); return; }

    // Expects e.g. { "type": "uci", "msg": { "line": "info depth 12...", "engineId": 12345, "profileName": "default", "instanceId": "100" } }
    sendToClient(JSON.stringify({
        type: 'uci', msg: { line, engineId, profileName, instanceId }
    }));
}

// Called from engine.js
// Expected death certificate includes reason, fen, profileName, engineId and instanceId
export function sendEngineDeathCertificateToClient(reason = 'not given', fen, engineId, profileName, instanceId) {
    if(!sendToClient) {
        console.error('No sendToClient function found while trying to send engine death certificate!'); return; }
    if(!profileName) {
        console.error('No profileName given to sendEngineDeathCertificate function, cannot send!'); return; }
    if(!instanceId){
        console.error('No instanceId given to sendEngineDeathCertificate function, cannot send!'); return; }

    sendToClient(JSON.stringify({
        'type': 'engineStatusUpdate',
        'msg': {
            'statusType': 'engineDeathCertificate',
            reason, fen, engineId, profileName, instanceId
        }
    }));
}