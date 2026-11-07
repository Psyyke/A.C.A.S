const CHANNEL_NAME = 'acas-dev-heap-v1';
const RESPONSE_TIMEOUT_MS = 5000;

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
    if (typeof BroadcastChannel !== 'function') return () => {};
    const tabId = crypto.randomUUID();
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = event => {
        const message = event.data;
        if (message?.type !== 'request' || typeof message.requestId !== 'string') return;
        channel.postMessage({
            type: 'gui-heap', requestId: message.requestId, tabId, ...readHeap()
        });
    };
    channel.onmessageerror = error => console.error('GUI heap request could not be read:', error);
    return () => channel.close();
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
