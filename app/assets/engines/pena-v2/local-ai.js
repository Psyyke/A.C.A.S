export class LocalAI {
    constructor({ port = 2800, onStatus = () => {}, onVersion = () => {}, WebSocketClass = WebSocket } = {}) {
        if(!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local server port.');
        this.url = `ws://localhost:${port}`;
        this.WebSocketClass = WebSocketClass;
        this.onStatus = onStatus;
        this.onVersion = onVersion;
        this.pending = new Map();
        this.closed = false;
    }

    connect() {
        if(this.closed || this.socket && this.socket.readyState < 2) return;
        const socket = this.socket = new this.WebSocketClass(this.url);
        let versionReported = false;
        socket.onopen = () => {
            if(this.socket !== socket) return;
            this.poll();
        };
        socket.onmessage = ({ data }) => {
            if(this.socket !== socket) return;
            let message;
            try { message = JSON.parse(data); }
            catch { this.failPending(new Error('Invalid local server response.')); return; }
            if(message.type === 'serverInfo') {
                versionReported = true;
                this.onVersion(message.version);
                return;
            }
            if(message.type !== 'ai') return;
            if(!versionReported) {
                versionReported = true;
                this.onVersion(null);
            }
            if(message.phase === 'status') {
                const status = message.status && typeof message.status === 'object' ? message.status : message;
                this.onStatus({ ...status, connected: true });
            }
            const pending = this.pending.get(message.requestId);
            if(!pending) return;
            if(message.phase === 'chunk') pending.onData?.(message.chunk);
            else if(message.phase === 'error') pending.finish(new Error(message.message || 'Local AI request failed.'));
            else if(['complete', 'status', 'promptInfo'].includes(message.phase)) pending.finish(null, message);
        };
        socket.onclose = () => {
            if(this.socket !== socket) return;
            clearTimeout(this.pollTimer);
            this.failPending(new Error('The local server disconnected.'));
            this.onStatus({ state: 'offline', connected: false });
            if(!this.closed) this.reconnectTimer = setTimeout(() => this.connect(), 3000);
        };
        socket.onerror = () => this.onStatus({ state: 'offline', connected: false });
    }

    poll() {
        if(this.closed) return;
        this.request('status').catch(error => {
            this.onStatus({ state: 'offline', connected: this.socket?.readyState === 1, error: error.message });
        }).finally(() => {
            if(!this.closed && this.socket?.readyState === 1) this.pollTimer = setTimeout(() => this.poll(), 3000);
        });
    }

    request(action, fields = {}, { signal, onData, timeout = 30000 } = {}) {
        signal?.throwIfAborted();
        if(this.socket?.readyState !== 1) return Promise.reject(new Error('Start the A.C.A.S local server first.'));
        const requestId = crypto.randomUUID();
        return new Promise((resolve, reject) => {
            const finish = (error, value) => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                this.pending.delete(requestId);
                if(error) reject(error);
                else resolve(value);
            };
            const abort = () => {
                if(this.socket?.readyState === 1) this.socket.send(JSON.stringify({ type: 'ai', action: 'cancel', requestId }));
                finish(signal.reason || new DOMException('Cancelled.', 'AbortError'));
            };
            const timer = setTimeout(() => {
                if(this.socket?.readyState === 1) this.socket.send(JSON.stringify({ type: 'ai', action: 'cancel', requestId }));
                finish(new Error('The local AI request timed out.'));
            }, timeout);
            this.pending.set(requestId, { finish, onData });
            signal?.addEventListener('abort', abort, { once: true });
            try { this.socket.send(JSON.stringify({ type: 'ai', action, requestId, ...fields })); }
            catch(error) { finish(error); }
        });
    }

    async createChatCompletion(options) {
        const { abortSignal, onData, ...request } = options;
        return this.request('generate', { options: request }, { signal: abortSignal, onData, timeout: 180000 });
    }

    async promptInfo(messages, chat_template_kwargs, signal, reasoning_effort = 'none', { includePrompt = false } = {}) {
        return this.request('promptInfo', { options: { messages, chat_template_kwargs, reasoning_effort }, ...(includePrompt ? { includePrompt: true } : {}) }, { signal });
    }

    // Raw prompt continuation for live thought evidence. Older servers answer "Unknown AI action".
    async createCompletion(options) {
        const { signal, onData, ...request } = options;
        return this.request('complete', { options: request }, { signal, onData, timeout: 180000 });
    }

    failPending(error) {
        for(const pending of [...this.pending.values()]) pending.finish(error);
    }

    close() {
        this.closed = true;
        clearTimeout(this.pollTimer);
        clearTimeout(this.reconnectTimer);
        this.failPending(new DOMException('Local AI connection closed.', 'AbortError'));
        this.socket?.close();
    }
}
