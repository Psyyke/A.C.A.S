import { updateEnginesList } from './gui/externalEngine.js';

class AcasWebSocketClient {
    constructor(onEvent = null) {
        this.url = 'ws://localhost:2800';
        this.socket = null;
        this.onEvent = onEvent;
        this.reconnectionAttempts = 0;
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

        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
            this.reconnectionAttempts = 0;

            this._emit('open', { status: 'Connected', url: this.url });

            window.wsConnectionOpen = true;

            this.askEngines();
        };

        this.socket.onmessage = (event) => {
            let payload;
            try {
                payload = JSON.parse(event.data);
            } catch (e) {
                payload = event.data;
            }
            this._emit('message', payload);
        };

        this.socket.onclose = (event) => {
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

            window.wsConnectionOpen = false;

            if(this.reconnectionAttempts < 9999)
                this.connect();
        };

        this.socket.onerror = (error) => {
            console.warn('err', error);
            this._emit('error', error);
        };
    }

    async send(data) {
        if(!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.warn("Connection missing. Attempting quick reconnect...");
            this.connect();

            try {
                await this._waitForOpen(2000);
            } catch (err) {
                console.error("Reconnection failed. Message dropped.");
                return;
            }
        }

        const message = typeof data === 'object' ? JSON.stringify(data) : data;
        this.socket.send(message);
        this._emit('sent', data);
    }

    _waitForOpen(timeoutMs) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject('Timeout'), timeoutMs);
            
            const check = () => {
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    clearTimeout(timeout);
                    resolve();
                } else if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
                    setTimeout(check, 50);
                } else {
                    clearTimeout(timeout);
                    reject('Failed');
                }
            };
            check();
        });
    }

    disconnect() {
        if(this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
}

const uciChannel = new BroadcastChannel(EXTERNAL_UCI_BROADCAST_NAME);
const statusChannel = new BroadcastChannel(EXTERNAL_STATUS_BROADCAST_NAME);

const ws = new AcasWebSocketClient((type, data) => {
    const openText = TRANS_OBJ?.serverOpen ?? 'Connected to the server!';
    const closeText = TRANS_OBJ?.serverClose ?? `Couldn't connect to the external engine server!\n\nPlease install/start the server, trying to reconnect...`;
    const websocketErrorText = TRANS_OBJ?.websocketError ?? 'WebSocket error:';
    const unknownWebsocketErrorText = TRANS_OBJ?.unknownWebsocketError ?? 'Unknown error, maybe connection lost?';

    switch(type) {
        case 'open':
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
                    updateEnginesList(msg);
                    break;
                case 'uci':
                    uciChannel.postMessage(msg);
                    break;
                case 'engineStatusUpdate':
                    statusChannel.postMessage(msg);
                    break;
            }

            break;
        case 'sent':
            //console.log('Sent message to A.C.A.S server:', data);

            break;
    }
});

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

export async function sendUciToExternalEngine(command, engineId, profileName, instanceId) {
    // With proper userscript manager this await basically doesn't add latency at all.
    // Should probably still refactor later on but right now this is fine as it is..!
    const launchParams = await GET_GM_CFG_VALUE(GET_EXTERNAL_PARAM_DB_KEY(engineId), SETTING_FILTER_OBJ.instanceID, profileName);
    
    const data = {
        'type': 'uci',
        'msg': { command, engineId, profileName, instanceId, launchParams }
    };

    ws.send(data);
}

export function closeAllExternalEnginesWithId(identifier, type) {
    const data = {
        'type': 'closeEnginesByIdentifier',
        'msg': { identifier, type }
    };

    ws.send(data);
}