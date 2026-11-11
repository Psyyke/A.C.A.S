const createMessage = 'lc0-create-worker';

function transfers(data, result = new Set(), seen = new Set()) {
    if(!data || typeof data !== 'object' || seen.has(data)) return [...result];
    seen.add(data);
    if(data instanceof ArrayBuffer || data instanceof MessagePort) result.add(data);
    else if(ArrayBuffer.isView(data)) transfers(data.buffer, result, seen);
    else for(const value of Object.values(data)) transfers(value, result, seen);
    return [...result];
}

function ownedUrl(url, base) {
    const result = new URL(url, base);
    if(/\/(?:worker|converter-worker)\.js$/.test(result.pathname))
        result.searchParams.set('workerTree', '1');
    return result;
}

// Own every native worker on the page, so Chromium never has a nested worker tree to retain.
export function createWorkerTree(url, options) {
    const NativeWorker = globalThis.Worker;
    function create(url, options, port) {
        const worker = new NativeWorker(url, options);
        const children = new Set();
        const terminate = worker.terminate.bind(worker);
        let closed = false;
        const reportError = error => port.postMessage({ type: 'error',
            message: error instanceof Error ? error.message : String(error) });
        const stop = () => {
            if(closed) return;
            closed = true;
            for(const child of children) child.stop();
            children.clear();
            port?.close();
            worker.onmessage = null;
            worker.onerror = null;
            worker.onmessageerror = null;
            terminate();
        };
        worker.addEventListener('message', event => {
            if(event.data?.type !== createMessage) return;
            event.stopImmediatePropagation();
            const { url, options, port: childPort } = event.data;
            if(closed) { childPort.close(); return; }
            try {
                const child = create(url, options, childPort);
                children.add(child);
                child.remove = () => children.delete(child);
            } catch(error) {
                childPort.postMessage({ type: 'error', message: error.message });
                childPort.close();
            }
        });
        const record = { stop, worker };
        if(port) {
            port.onmessage = ({ data }) => {
                if(closed) return;
                if(data.type === 'terminate') {
                    stop();
                    record.remove?.();
                } else {
                    try {
                        worker.postMessage(data.message, data.transfer);
                    } catch(error) {
                        reportError(error);
                    }
                }
            };
            worker.onmessage = event => {
                if(closed) return;
                try {
                    port.postMessage({ type: 'message', message: event.data }, transfers(event.data));
                } catch(error) {
                    reportError(error);
                }
            };
            worker.onerror = event => {
                event.preventDefault();
                port.postMessage({ type: 'error', message: event.message, filename: event.filename,
                    lineno: event.lineno, colno: event.colno });
            };
            worker.onmessageerror = () => port.postMessage({ type: 'messageerror' });
            port.onmessageerror = () => port.postMessage({ type: 'messageerror' });
        } else {
            worker.terminate = stop;
        }
        return record;
    }
    return create(ownedUrl(url, document.baseURI).href, options).worker;
}

export function installWorkerProxy() {
    if(new URL(self.location.href).searchParams.get('workerTree') !== '1') return;
    globalThis.Worker = class extends EventTarget {
        onmessage = null;
        onerror = null;
        onmessageerror = null;
        closed = false;
        constructor(url, options) {
            super();
            const channel = new MessageChannel();
            this.port = channel.port1;
            this.port.onmessage = ({ data }) => {
                const event = data.type === 'message'
                    ? new MessageEvent('message', { data: data.message })
                    : data.type === 'error'
                    ? new ErrorEvent('error', data)
                    : new MessageEvent('messageerror');
                this[`on${event.type}`]?.(event);
                this.dispatchEvent(event);
            };
            self.postMessage({ type: createMessage, url: ownedUrl(url, self.location.href).href,
                options, port: channel.port2 }, [channel.port2]);
        }
        postMessage(message, transfer = []) {
            if(this.closed) return;
            const list = Array.isArray(transfer) ? transfer : transfer.transfer ?? [];
            this.port.postMessage({ type: 'message', message, transfer: list }, list);
        }
        terminate() {
            if(this.closed) return;
            this.closed = true;
            this.port.postMessage({ type: 'terminate' });
            this.port.close();
            this.onmessage = null;
            this.onerror = null;
            this.onmessageerror = null;
        }
    };
}
