import { updateEnginesList } from './gui/externalEngine.js';

const SERVER_PORT_STORAGE_KEY = 'acasExternalEngineServerPort';
const DEFAULT_SERVER_PORT = 2800;

class AcasWebSocketClient {
    constructor(onEvent = null) {
        const configuredPort = Number(localStorage.getItem(SERVER_PORT_STORAGE_KEY));
        this.port = Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65535
            ? configuredPort : DEFAULT_SERVER_PORT;
        this.url = `ws://localhost:${this.port}`;
        this.socket = null;
        this.onEvent = onEvent;
        this.reconnectionAttempts = 0;
        this.reconnectTimer = null;
    }

    setPort(port, reconnect = false) {
        if(!Number.isInteger(port) || port < 1 || port > 65535) return false;
        if(this.port === port) {
            if(reconnect) this.connect();
            return true;
        }

        this.disconnect();
        this.port = port;
        this.url = `ws://localhost:${port}`;
        this.reconnectionAttempts = 0;
        if(reconnect) this.connect();
        return true;
    }

    _emit(type, data = null) {
        if(typeof this.onEvent === 'function') {
            this.onEvent(type, data);
        }
    }

    askEngines() {
        this.send({ "type": "getEngines" });
    }

    connect() {
        if(this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN))
            return;

        clearTimeout(this.reconnectTimer);
        const socket = this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
            if(this.socket !== socket) return;
            this.reconnectionAttempts = 0;

            this._emit('open', { status: 'Connected', url: this.url });

            window.wsConnectionOpen = true;

            this.askEngines();
        };

        this.socket.onmessage = (event) => {
            if(this.socket !== socket) return;
            let payload;
            try {
                payload = JSON.parse(event.data);
            } catch (e) {
                payload = event.data;
            }
            this._emit('message', payload);
        };

        this.socket.onclose = (event) => {
            if(this.socket !== socket) return;
            window.wsConnectionOpen = false;

            const isAnyProfileUsingExternal = Object.values(IS_EXTERNAL_ENGINE_SETTING_ACTIVE)
                .find(v => v) ? true : false;
            const shouldReconnect = isAnyProfileUsingExternal
                && ws === this // global var set at the bottom of this file
                && this.socket && this.socket.readyState !== WebSocket.OPEN; // is still not connected

            if(this.reconnectionAttempts === 0 && shouldReconnect)
                this._emit('close', { status: 'Disconnected' });

            if(!shouldReconnect)
                return;

            this.reconnectionAttempts += 1;

            if(this.reconnectionAttempts < 9999) {
                // Back off between attempts so a refused connection doesn't busy-spin.
                const delay = Math.min(5000, this.reconnectionAttempts * 250);

                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            }
        };

        this.socket.onerror = (error) => {
            if(this.socket !== socket) return;
            console.warn('err', error);
            this._emit('error', error);
        };
    }

    async send(data, isCurrent = () => true) {
        if(!isCurrent()) return false;
        if(!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.warn("Connection missing. Attempting quick reconnect...");
            this.connect();

            try {
                await this._waitForOpen(2000);
            } catch (err) {
                console.error("Reconnection failed. Message dropped.");
                return false;
            }
        }

        if(!isCurrent()) return false;
        const message = typeof data === 'object' ? JSON.stringify(data) : data;
        this.socket.send(message);
        this._emit('sent', data);
        return true;
    }

    _waitForOpen(timeoutMs) {
        const socket = this.socket;
        if(socket?.readyState === WebSocket.OPEN) return Promise.resolve();
        if(socket?.readyState !== WebSocket.CONNECTING) return Promise.reject(new Error('Connection closed'));
        return new Promise((resolve, reject) => {
            const finish = error => {
                clearTimeout(timeout);
                socket.removeEventListener('open', onOpen);
                socket.removeEventListener('close', onClose);
                socket.removeEventListener('error', onClose);
                if(error) reject(error);
                else resolve();
            };
            const onOpen = () => finish(this.socket === socket ? null : new Error('Connection replaced'));
            const onClose = () => finish(new Error('Connection closed'));
            const timeout = setTimeout(() => finish(new Error('Connection timed out')), timeoutMs);
            socket.addEventListener('open', onOpen);
            socket.addEventListener('close', onClose);
            socket.addEventListener('error', onClose);
        });
    }

    disconnect() {
        clearTimeout(this.reconnectTimer);
        externalLaunchParams.clear();
        window.wsConnectionOpen = false;
        if(this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
}

const uciChannel = new BroadcastChannel(EXTERNAL_UCI_BROADCAST_NAME);
const statusChannel = new BroadcastChannel(EXTERNAL_STATUS_BROADCAST_NAME);
const externalCommandQueues = new Map();
const externalLaunchParams = new Map();

const ws = new AcasWebSocketClient((type, data) => {
    const openText = TRANS_OBJ?.serverOpen ?? 'Connected to the server!';
    const closeText = TRANS_OBJ?.serverClose ?? `Couldn't connect to the external engine server!\n\nPlease install/start the server, trying to reconnect...`;
    const websocketErrorText = TRANS_OBJ?.websocketError ?? 'WebSocket error:';
    const unknownWebsocketErrorText = TRANS_OBJ?.unknownWebsocketError ?? 'Unknown error, maybe connection lost?';

    switch(type) {
        case 'open':
            externalLaunchParams.clear();
            toast.success(`${openText}\n\n(${data.url})`, 2000);
            break;
        case 'close':
            toast.message(closeText, 10000);
            break;
        case 'error':
            console.error(websocketErrorText + ' ' + (data.message || unknownWebsocketErrorText));
            break;
        case 'message':
            const { type, msg } = data;

            switch(type) {
                case 'enginesList':
                    updateEnginesList(msg).catch(console.error);
                    break;
                case 'uci':
                    uciChannel.postMessage(msg);
                    break;
                case 'engineStatusUpdate':
                    externalLaunchParams.delete(JSON.stringify([msg.engineId, msg.profileName, msg.instanceId]));
                    statusChannel.postMessage(msg);
                    break;
            }

            break;
        case 'sent':
            //console.log('Sent message to A.C.A.S server:', data);

            break;
    }
});

const serverPortInput = document.querySelector('#external-engine-server-port');
if(serverPortInput) {
    serverPortInput.value = String(ws.port);
    serverPortInput.addEventListener('change', () => {
        const port = Number(serverPortInput.value);
        if(!serverPortInput.reportValidity() || !Number.isInteger(port) || port < 1 || port > 65535) {
            serverPortInput.value = String(ws.port);
            return;
        }

        const isAnyProfileUsingExternal = Object.values(IS_EXTERNAL_ENGINE_SETTING_ACTIVE).some(Boolean);
        localStorage.setItem(SERVER_PORT_STORAGE_KEY, String(port));
        ws.setPort(port, isAnyProfileUsingExternal);
    });
}

export function connectAcasToServer() {
    if(ws.socket && ws.socket.readyState === WebSocket.OPEN) {
        //console.warn("Already connected to A.C.A.S server.");
        return;
    }

    ws.connect();
}

export function disconnectAcasFromServer() {
    ws.disconnect();
}

export function sendUciToExternalEngine(command, engineId, profileName, instanceId, isCurrent = () => true,
    { resumeEngineOptions = false, optionsInitialized = false } = {}) {
    if(typeof engineId !== 'string' || !engineId.trim()) return Promise.resolve(false);

    const key = JSON.stringify([engineId, profileName, instanceId]);

    // Storage lookups/reconnection must not reorder position, go and stop.
    const operation = (externalCommandQueues.get(key) ?? Promise.resolve()).then(async () => {
        const shouldLoadLaunchParams = !externalLaunchParams.has(key) || command.trim() === 'uci';

        if(!isCurrent()) return false;

        // Launch parameters are only used when spawning, not for each position/go/stop.
        if(shouldLoadLaunchParams) {
            const params = await GET_GM_CFG_VALUE(GET_EXTERNAL_PARAM_DB_KEY(engineId), instanceId, profileName);

            if(!isCurrent()) return false;

            externalLaunchParams.set(key, params);
        }

        const launchParams = externalLaunchParams.get(key);

        if(!isCurrent()) return false;

        return await ws.send({
            'type': 'uci',
            // Fresh starts use the GUI profile; replacements restore only the
            // options actually sent to this engine/profile/instance in this session.
            'msg': {
                command, engineId, profileName, instanceId, launchParams,
                clientManagesOptions: true, resumeEngineOptions, optionsInitialized
            }
        }, isCurrent);
    }).catch(error => {
        console.error('Could not send external engine input:', error);
        return false;
    });

    externalCommandQueues.set(key, operation);
    operation.then(() => {
        if(externalCommandQueues.get(key) === operation) externalCommandQueues.delete(key);
    });
    return operation;
}

export async function closeAllExternalEnginesWithId(identifier, type) {
    // Let already-sent work drain before close; invalidated queued commands will be skipped.
    const fields = ['engineId', 'profileName', 'instanceId'];
    const pending = [...externalCommandQueues.entries()].filter(([key]) =>
        type === 'identifierKey' ? key === identifier : JSON.parse(key)[fields.indexOf(type)] === identifier);
    const data = {
        'type': 'closeEnginesByIdentifier',
        'msg': { identifier, type }
    };

    await Promise.all(pending.map(([, operation]) => operation));

    for(const key of externalLaunchParams.keys()) {
        const matchesIdentifier = type === 'identifierKey'
            ? key === identifier : JSON.parse(key)[fields.indexOf(type)] === identifier;

        if(matchesIdentifier) externalLaunchParams.delete(key);
    }

    return ws.send(data);
}