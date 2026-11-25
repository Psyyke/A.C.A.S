import { DEFAULT_ZONOS_VOICE, ZONOS_VOICES, isZonosClipVoice, readZonosVoice } from './zonos-voices.js';

export class ZonosSpeech {
    constructor(onProgress, onFatal) {
        this.onProgress = onProgress;
        this.onFatal = onFatal;
        this.pending = new Map();
        this.onMessage = event => {
            if(event.origin !== location.origin || event.source !== this.frame?.contentWindow) return;
            const data = event.data;
            if(data?.type === 'host-ready') {
                clearTimeout(this.loadTimer);
                this.resolveLoad?.();
                this.resolveLoad = this.rejectLoad = null;
                return;
            }
            if(data?.type === 'progress') { this.onProgress(data.progress); return; }
            if(data?.type === 'fatal') {
                const error = Object.assign(new Error(data.message), { gpuUnavailable: data.gpuUnavailable });
                this.onFatal(error);
                this.dispose(error);
                return;
            }
            const request = this.pending.get(data?.id);
            if(!request) return;
            this.pending.delete(data.id);
            if(data.error) request.reject(Object.assign(new Error(data.error), { gpuUnavailable: data.gpuUnavailable }));
            else request.resolve(data.audio ? { audio: new Float32Array(data.audio), sampleRate: data.sampleRate } : undefined);
        };
        window.addEventListener('message', this.onMessage);
    }

    prepare() {
        return this.request('prepare');
    }

    async speak(text, voiceId = DEFAULT_ZONOS_VOICE) {
        const custom = voiceId.startsWith('custom-');
        if(!custom && !ZONOS_VOICES.some(([id]) => id === voiceId)) throw new Error('The selected ZONOS voice is unavailable.');
        const clip = isZonosClipVoice(voiceId) ? await readZonosVoice(voiceId) : null;
        return this.request('speak', { text, voiceId, clip });
    }

    async request(type, payload = {}) {
        if(this.disposed) throw new DOMException('Speech cancelled.', 'AbortError');
        if(!this.frame) {
            const frame = this.frame = document.createElement('iframe');
            frame.hidden = true;
            frame.src = new URL('./vendor/zonos3/frame.html', import.meta.url).href;
            this.loaded = new Promise((resolve, reject) => {
                this.resolveLoad = resolve;
                frame.onerror = () => reject(new Error('Could not load the ZONOS voice runtime.'));
                this.rejectLoad = reject;
                this.loadTimer = setTimeout(() => reject(new Error('ZONOS voice runtime did not start.')), 30000);
            });
            document.body.appendChild(frame);
        }
        await this.loaded;
        if(!this.frame) throw new DOMException('Speech cancelled.', 'AbortError');
        return new Promise((resolve, reject) => {
            const id = crypto.randomUUID();
            this.pending.set(id, { resolve, reject });
            this.frame.contentWindow.postMessage({ type, id, ...payload }, location.origin);
        });
    }

    dispose(error = new DOMException('Speech cancelled.', 'AbortError')) {
        this.disposed = true;
        this.rejectLoad?.(error);
        clearTimeout(this.loadTimer);
        this.resolveLoad = null;
        this.rejectLoad = null;
        for(const request of this.pending.values()) request.reject(error);
        this.pending.clear();
        this.frame?.remove();
        this.frame = null;
        window.removeEventListener('message', this.onMessage);
    }
}
