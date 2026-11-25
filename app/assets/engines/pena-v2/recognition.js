let worker;
const requests = new Map();

export function recognitionRequest(data, { signal, onProgress = () => {}, onWord = () => {} } = {}) {
    signal?.throwIfAborted();
    if(!worker) {
        worker = new Worker(new URL('./vendor/recognition-worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
            const request = requests.get(data.id);
            if(!request) return;
            if(data.type === 'progress') request.onProgress(data.progress);
            else if(data.type === 'word') request.onWord(data.word);
            else {
                request.cleanup();
                requests.delete(data.id);
                if(data.type === 'error') {
                    const error = new DOMException(data.message, data.name || 'Error');
                    request.reject(error);
                    releaseRecognitionModel(error);
                } else request.resolve(data.result);
            }
        };
        worker.onerror = event => {
            for(const request of requests.values()) {
                request.cleanup();
                request.reject(new Error(`Pena microphone worker failed: ${event.message}`));
            }
            requests.clear();
            worker.terminate();
            worker = null;
        };
    }
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
        const abort = () => {
            worker?.postMessage({ type: 'cancel', id });
            requests.delete(id);
            reject(signal.reason);
        };
        requests.set(id, { resolve, reject, onProgress, onWord, cleanup: () => signal?.removeEventListener('abort', abort) });
        signal?.addEventListener('abort', abort, { once: true });
        worker.postMessage({ ...data, id });
    });
}

export function releaseRecognitionModel(error = new DOMException('Pena microphone model unloaded.', 'AbortError')) {
    for(const request of requests.values()) {
        request.cleanup();
        request.reject(error);
    }
    requests.clear();
    worker?.terminate();
    worker = null;
}
