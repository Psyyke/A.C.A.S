const CHANNEL_NAME = 'acas-dev-heap-v1';
const RESPONSE_TIMEOUT_MS = 5000;
const recentErrors = [];
let errorCaptureStarted = false;

export function startDiagnosticsErrorCapture() {
    if(errorCaptureStarted) return;
    errorCaptureStarted = true;
    const record = (kind, error) => {
        recentErrors.push({ at: new Date().toISOString(), kind,
            message: String(error?.message || error),
            stack: typeof error?.stack === 'string' ? error.stack : null });
        if(recentErrors.length > 20) recentErrors.shift();
    };
    window.addEventListener('error', event => record('error', event.error || event.message));
    window.addEventListener('unhandledrejection', event => record('unhandledrejection', event.reason));
}

export function readHeap() {
    const memory = performance.memory;
    return {
        at: new Date().toISOString(),
        heapUsedBytes: Number.isFinite(memory?.usedJSHeapSize) ? memory.usedJSHeapSize : null,
        heapTotalBytes: Number.isFinite(memory?.totalJSHeapSize) ? memory.totalJSHeapSize : null,
        heapLimitBytes: Number.isFinite(memory?.jsHeapSizeLimit) ? memory.jsHeapSizeLimit : null
    };
}

export function startHeapReporter() {
    startDiagnosticsErrorCapture();
    if (typeof BroadcastChannel !== 'function') return () => {};
    const tabId = crypto.randomUUID();
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = event => {
        const message = event.data;
        if(message?.type === 'live-diagnostics-request' && typeof message.requestId === 'string') {
            channel.postMessage({
                type: 'live-diagnostics', requestId: message.requestId, tabId,
                runtimeErrors: [...recentErrors],
                instances: (window.AcasInstances || []).map(({ instance }) => ({
                    instanceID: instance.instanceID, currentFen: instance.currentFen,
                    turn: instance.boardState.turn, playerColor: instance.boardState.playerColor,
                    history: instance.boardState.history.slice(-4),
                    profiles: Object.fromEntries(Object.entries(instance.pV).map(([name, profile]) => [name, {
                        engineSettingsReady: profile.engineSettingsReady,
                        recoveringSearch: Boolean(profile.recoveringSearch),
                        pendingCalculations: profile.pendingCalculations.map(calculation => ({
                            fen: calculation.fen, analyzedFen: calculation.analyzedFen,
                            finished: calculation.finished, stopRequested: Boolean(calculation.stopRequested),
                            goSent: calculation.goSent, startedAt: calculation.startedAt,
                            rawLine: calculation.rawLine
                        })),
                        pendingCalculationRequest: profile.pendingCalculationRequest,
                        hintFen: profile.hintCandidates?.fen,
                        hints: profile.hintCandidates?.moves?.map(move => move.playerUci)
                    }]))
                }))
            });
            return;
        }
        if (message?.type !== 'request' || typeof message.requestId !== 'string') return;
        channel.postMessage({
            type: 'gui-heap', requestId: message.requestId, tabId, ...readHeap()
        });
    };
    channel.onmessageerror = error => console.error('GUI heap request could not be read:', error);
    return () => channel.close();
}

export function collectLiveDiagnostics() {
    return new Promise(resolve => {
        const requestId = crypto.randomUUID();
        const result = { at: new Date().toISOString(), userscript: null, gui: [], errors: [],
            runtimeErrors: [...recentErrors] };
        let channel = null;
        const onMessage = event => {
            if(event.source === window && event.data?.name === 'acas-dev-diagnostics'
                && event.data.value?.requestId === requestId) result.userscript = event.data.value;
        };
        window.addEventListener('message', onMessage);
        try {
            if(typeof BroadcastChannel === 'function') {
                channel = new BroadcastChannel(CHANNEL_NAME);
                channel.onmessage = event => {
                    if(event.data?.type === 'live-diagnostics' && event.data.requestId === requestId) {
                        result.gui.push(event.data);
                    }
                };
                channel.onmessageerror = error => {
                    console.error('Live GUI diagnostics could not be read:', error);
                    result.errors.push('GUI diagnostics message could not be read');
                };
                channel.postMessage({ type: 'live-diagnostics-request', requestId });
            } else result.errors.push('BroadcastChannel unavailable');
            window.postMessage({ type: 'acas-dev-diagnostics-request', requestId }, window.location.origin);
        } catch(error) {
            console.error('Live diagnostics request failed:', error);
            result.errors.push(error.message);
        }
        setTimeout(() => {
            window.removeEventListener('message', onMessage);
            channel?.close();
            result.userscriptStatus = result.userscript ? 'received' : 'no-reply';
            result.guiStatus = result.gui.length ? 'received' : 'no-reply';
            resolve(result);
        }, 1000);
    });
}

export function createHeapCollector(onError) {
    if (typeof BroadcastChannel !== 'function') {
        return { request: callback => callback({ status: 'unsupported', tabs: [] }), close() {} };
    }
    let channel;
    try {
        channel = new BroadcastChannel(CHANNEL_NAME);
    } catch (error) {
        onError(error);
        return { request: callback => callback({ status: 'error', tabs: [] }), close() {} };
    }
    let pending = null;
    let timer = null;
    channel.onmessage = event => {
        const data = event.data;
        if (!pending || data?.type !== 'gui-heap' || data.requestId !== pending.id) return;
        if (typeof data.tabId !== 'string' || typeof data.at !== 'string'
            || !['heapUsedBytes', 'heapTotalBytes', 'heapLimitBytes'].every(key =>
                data[key] === null || (Number.isFinite(data[key]) && data[key] >= 0))) {
            onError(new Error('Invalid GUI heap response'));
            return;
        }
        pending.tabs.set(data.tabId, {
            tabId: data.tabId, at: data.at,
            heapUsedBytes: data.heapUsedBytes,
            heapTotalBytes: data.heapTotalBytes,
            heapLimitBytes: data.heapLimitBytes
        });
        pending.callback({ status: 'received', tabs: [...pending.tabs.values()] });
    };
    channel.onmessageerror = onError;
    return {
        request(callback) {
            clearTimeout(timer);
            pending = { id: crypto.randomUUID(), callback, tabs: new Map() };
            callback({ status: 'waiting', tabs: [] });
            try {
                channel.postMessage({ type: 'request', requestId: pending.id });
            } catch (error) {
                pending = null;
                onError(error);
                callback({ status: 'error', tabs: [] });
                return;
            }
            timer = setTimeout(() => {
                const request = pending;
                pending = null;
                request.callback({
                    status: request.tabs.size ? 'received' : 'no-reply',
                    tabs: [...request.tabs.values()]
                });
            }, RESPONSE_TIMEOUT_MS);
        },
        close() {
            clearTimeout(timer);
            pending = null;
            channel.onmessage = null;
            channel.close();
        }
    };
}
