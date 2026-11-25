import { updateEnginesList } from './gui/externalEngine.js';
import { externalEngineServerPortInput as serverPortInput } from './gui/elementDeclarations.js';

const SERVER_PORT_STORAGE_KEY = 'acasExternalEngineServerPort';
const DEFAULT_SERVER_PORT = 2800;
const screenOverlaySnapshots = new Map();
const ghostInput = document.querySelector('input[data-key="isUserscriptGhost"]');
const screenOverlayInput = document.querySelector('input[data-key="ghostScreenOverlay"]');
const screenOffsetXInput = document.querySelector('input[data-key="ghostScreenOffsetX"]');
const screenOffsetYInput = document.querySelector('input[data-key="ghostScreenOffsetY"]');
const screenOverlayStatus = document.querySelector('#ghost-screen-overlay-status');
const mobileDevice = navigator.userAgentData?.mobile === true
    || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let screenOverlaySupported = null;
let screenOverlayOffsetsSupported = false;
let screenOverlayStatusMessage = '';
let screenOverlayStatusTimer = null;
let screenOverlayCapabilitiesRequested = false;
let screenOverlayStatusText = { key: 'inactive', fallback: 'Turn on Ghost Script and the local server.' };
const screenOverlayDeliveryErrors = new Set();

function isScreenOverlayEnabled() {
    return Boolean(ghostInput?.checked && screenOverlayInput?.checked);
}

function getScreenOverlayOffset() {
    const read = input => {
        if(!input) return 0;
        if(input.value.trim() === '') return null;
        const value = Number(input.value);
        return Number.isInteger(value) && value >= -1000 && value <= 1000 ? value : null;
    };
    const x = read(screenOffsetXInput), y = read(screenOffsetYInput);
    return x === null || y === null ? null : { x, y };
}

function renderScreenOverlayTranslations() {
    const translations = typeof TRANS_OBJ === 'undefined' ? null : TRANS_OBJ?.ghostScreen;
    const configTranslations = typeof FULL_TRANS_OBJ === 'undefined' ? null : FULL_TRANS_OBJ?.configTranslations;
    const title = document.querySelector('#ghost-floaty-title');
    const subtitle = document.querySelector('#ghost-floaty-subtitle');
    const direction = typeof FULL_TRANS_OBJ === 'undefined' ? 'auto' : FULL_TRANS_OBJ?.textDirection ?? 'auto';
    if(title) {
        title.dir = direction;
        const text = configTranslations?.isUserscriptGhost?.[0] ?? 'Ghost Script';
        if(title.textContent !== text) title.textContent = text;
    }
    if(subtitle) {
        subtitle.dir = direction;
        const text = translations?.tagline ?? 'Finetune your ghostly experience';
        if(subtitle.textContent !== text) subtitle.textContent = text;
    }
    if(screenOverlayStatus) {
        const { key, fallback, detail } = screenOverlayStatusText;
        const text = translations?.[key] ?? fallback;
        screenOverlayStatus.dir = direction;
        const displayText = detail ? `${text} ${detail}` : text;
        if(screenOverlayStatus.textContent !== displayText) screenOverlayStatus.textContent = displayText;
    }
}

function setScreenOverlayStatus(key, fallback, detail = '') {
    screenOverlayStatusText = { key, fallback, detail };
    renderScreenOverlayTranslations();
}

document.addEventListener('acas-translations-updated', renderScreenOverlayTranslations);

function externalServerNeeded() {
    return isScreenOverlayEnabled() || Object.values(IS_EXTERNAL_ENGINE_SETTING_ACTIVE).some(Boolean);
}

function isOverlayOnlyConnection() {
    return isScreenOverlayEnabled() && !Object.values(IS_EXTERNAL_ENGINE_SETTING_ACTIVE).some(Boolean);
}

function updateScreenOverlayStatus() {
    clearTimeout(screenOverlayStatusTimer);
    if(!isScreenOverlayEnabled()) {
        setScreenOverlayStatus('inactive', 'Turn on Ghost Script and the local server.');
    } else if(ws.socket?.readyState !== WebSocket.OPEN) {
        setScreenOverlayStatus('connecting', 'Connecting to the local server...');
    } else if(!getScreenOverlayOffset()) {
        setScreenOverlayStatus('invalidOffset', 'Enter whole pixel offsets from -1000 to 1000.');
    } else if(screenOverlaySupported === null) {
        setScreenOverlayStatus('connecting', 'Connecting to the local server...');
        screenOverlayStatusTimer = setTimeout(() => {
            if(isScreenOverlayEnabled() && screenOverlaySupported === null)
                setScreenOverlayStatus('update', 'Update the local server and reconnect.');
        }, 4000);
    } else if(screenOverlayDeliveryErrors.size) {
        setScreenOverlayStatus('paused', 'Screen overlay paused. Too many drawings or server busy.');
    } else if(screenOverlaySupported && !screenOverlayOffsetsSupported
        && Object.values(getScreenOverlayOffset()).some(Boolean)) {
        setScreenOverlayStatus('update', 'Update the local server and reconnect.');
    } else if(screenOverlaySupported) {
        if(screenOverlayStatusMessage)
            setScreenOverlayStatus('unavailable', 'Screen overlay unavailable.', screenOverlayStatusMessage);
        else setScreenOverlayStatus('available', 'Screen overlay available.');
    } else {
        setScreenOverlayStatus('unavailable', 'Screen overlay unavailable.', screenOverlayStatusMessage);
    }
}

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
            if(isScreenOverlayEnabled()) requestScreenOverlayCapabilities();
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

            const shouldReconnect = externalServerNeeded()
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
            if(!isOverlayOnlyConnection()) console.warn('err', error);
            this._emit('error', error);
        };
    }

    async send(data, isCurrent = () => true) {
        if(!isCurrent()) return false;
        let socket = this.socket;
        if(!socket || socket.readyState !== WebSocket.OPEN) {
            console.warn("Connection missing. Attempting quick reconnect...");
            this.connect();
            socket = this.socket;

            try {
                await this._waitForOpen(2000);
            } catch (err) {
                console.error("Reconnection failed. Message dropped.");
                return false;
            }
        }

        if(!isCurrent()) return false;
        if(!socket || this.socket !== socket || socket.readyState !== WebSocket.OPEN) return false;
        const message = typeof data === 'object' ? JSON.stringify(data) : data;
        try {
            socket.send(message);
        } catch(error) {
            console.error("Could not send the message to the server:", error);
            return false;
        }
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
            screenOverlaySupported = null;
            screenOverlayOffsetsSupported = false;
            screenOverlayStatusMessage = '';
            screenOverlayCapabilitiesRequested = false;
            updateScreenOverlayStatus();
            toast.success(`${openText}\n\n(${data.url})`, 2000);
            break;
        case 'close':
            screenOverlaySupported = null;
            screenOverlayOffsetsSupported = false;
            screenOverlayCapabilitiesRequested = false;
            clearTimeout(screenOverlayStatusTimer);
            if(isScreenOverlayEnabled()) setScreenOverlayStatus('connecting', 'Connecting to the local server...');
            toast.message(closeText, 10000);
            break;
        case 'error':
            if(isOverlayOnlyConnection())
                setScreenOverlayStatus('unavailable', 'Screen overlay unavailable.');
            else console.error(websocketErrorText + ' ' + (data.message || unknownWebsocketErrorText));
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
                case 'screenOverlayStatus':
                    if(typeof msg?.supported === 'boolean') screenOverlaySupported = msg.supported;
                    if(typeof msg?.offsets === 'boolean') screenOverlayOffsetsSupported = msg.offsets;
                    screenOverlayStatusMessage = typeof msg?.error === 'string' ? msg.error
                        : msg?.supported === false && typeof msg?.message === 'string' ? msg.message : '';
                    updateScreenOverlayStatus();
                    break;
            }

            break;
        case 'sent':
            //console.log('Sent message to A.C.A.S server:', data);

            break;
    }
});

if(serverPortInput) {
    serverPortInput.value = String(ws.port);
    serverPortInput.addEventListener('change', () => {
        const port = Number(serverPortInput.value);

        if(!serverPortInput.reportValidity() || !Number.isInteger(port) || port < 1 || port > 65535) {
            serverPortInput.value = String(ws.port);
            return;
        }

        localStorage.setItem(SERVER_PORT_STORAGE_KEY, String(port));
        ws.setPort(port, externalServerNeeded());
        updateScreenOverlayStatus();
    });
}

function requestScreenOverlayCapabilities() {
    if(ws.socket?.readyState !== WebSocket.OPEN || screenOverlayCapabilitiesRequested || screenOverlaySupported !== null) return;
    screenOverlayCapabilitiesRequested = true;
    ws.socket.send(JSON.stringify({ type: 'screenOverlayCapabilities' }));
}

function updateScreenOverlayControls() {
    if(screenOverlayInput && mobileDevice) screenOverlayInput.checked = false;
    for(const [input, disabled] of [
        [screenOverlayInput, mobileDevice],
        [screenOffsetXInput, !screenOverlayInput?.checked],
        [screenOffsetYInput, !screenOverlayInput?.checked]
    ]) {
        if(!input) continue;
        input.disabled = disabled;
        const setting = input.closest('.custom-input');
        if(!setting) continue;
        setting.inert = disabled;
        setting.setAttribute('aria-disabled', String(disabled));
    }
}

function updateScreenOverlayConnection() {
    updateScreenOverlayControls();
    if(isScreenOverlayEnabled()) {
        updateScreenOverlayStatus();
        if(ws.socket?.readyState === WebSocket.OPEN) requestScreenOverlayCapabilities();
        else ws.connect();
    } else {
        if(ws.socket?.readyState === WebSocket.OPEN) {
            for(const snapshot of screenOverlaySnapshots.values())
                ws.socket.send(JSON.stringify({ type: 'screenOverlay', msg: { ...snapshot, visible: false } }));
        }
        screenOverlaySnapshots.clear();
        screenOverlayDeliveryErrors.clear();
        screenOverlayCapabilitiesRequested = false;
        updateScreenOverlayStatus();
        if(!externalServerNeeded()) ws.disconnect();
    }
}

updateScreenOverlayControls();
for(const input of [ghostInput, screenOverlayInput]) {
    input?.addEventListener('change', updateScreenOverlayConnection);
    input?.addEventListener('acas-value-set', updateScreenOverlayConnection);
}

function updateScreenOverlayOffsets() {
    updateScreenOverlayStatus();
    for(const snapshot of [...screenOverlaySnapshots.values()]) sendScreenOverlay(snapshot);
}

for(const input of [screenOffsetXInput, screenOffsetYInput]) {
    input?.addEventListener('input', updateScreenOverlayOffsets);
    input?.addEventListener('change', () => queueMicrotask(updateScreenOverlayOffsets));
    input?.addEventListener('acas-value-set', updateScreenOverlayOffsets);
}

export function sendScreenOverlay(snapshot) {
    if(!isScreenOverlayEnabled() || screenOverlaySupported !== true || ws.socket?.readyState !== WebSocket.OPEN) return false;
    const offset = getScreenOverlayOffset();
    if(!offset || !screenOverlayOffsetsSupported && (offset.x || offset.y)) {
        if(screenOverlaySnapshots.has(snapshot.instanceId))
            ws.socket.send(JSON.stringify({ type: 'screenOverlay', msg: { ...snapshot, visible: false } }));
        updateScreenOverlayStatus();
        return false;
    }
    const message = JSON.stringify({ type: 'screenOverlay', msg: {
        ...snapshot, ...(screenOverlayOffsetsSupported ? { offset } : {})
    } });
    if(new TextEncoder().encode(message).byteLength > 512 * 1024 || ws.socket.bufferedAmount > 512 * 1024) {
        clearScreenOverlay(snapshot.instanceId);
        screenOverlayDeliveryErrors.add(snapshot.instanceId);
        updateScreenOverlayStatus();
        return false;
    }
    if(screenOverlayDeliveryErrors.delete(snapshot.instanceId)) updateScreenOverlayStatus();
    screenOverlaySnapshots.set(snapshot.instanceId, snapshot);
    ws.socket.send(message);
    return true;
}

export function clearScreenOverlay(instanceId) {
    const snapshot = screenOverlaySnapshots.get(instanceId);
    if(snapshot && ws.socket?.readyState === WebSocket.OPEN)
        ws.socket.send(JSON.stringify({ type: 'screenOverlay', msg: { ...snapshot, visible: false } }));
    screenOverlaySnapshots.delete(instanceId);
    if(screenOverlayDeliveryErrors.delete(instanceId)) updateScreenOverlayStatus();
}

export function connectAcasToServer() {
    if(ws.socket && ws.socket.readyState === WebSocket.OPEN) {
        //console.warn("Already connected to A.C.A.S server.");
        return;
    }

    ws.connect();
}

export function disconnectAcasFromServer() {
    if(!isScreenOverlayEnabled()) ws.disconnect();
}

export function sendUciToExternalEngine(command, engineId, profileName, instanceId, isCurrent = () => true,
    { resumeEngineOptions = false, optionsInitialized = false, siteDomain } = {}) {
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
                command, engineId, profileName, instanceId, launchParams, siteDomain,
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