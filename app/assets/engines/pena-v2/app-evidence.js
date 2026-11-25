import { createLc0Analysis } from './lc0.js';
import { engineCoachingEvidence } from './engine-coaching-input.js';
import MaiaEngine from '../Maia3/maiaEngine.js';

export class LiveCoachingEvidence {
    constructor() { this.closed = false; }

    async initialize(onProgress) {
        onProgress('loadingLc0Evidence');
        this.lc0 = await this.loadLc0();
        if(this.closed) { this.dispose(); throw new DOMException('Coaching stopped.', 'AbortError'); }
        try {
            onProgress('loadingMaiaEvidence');
            const response = await fetch(new URL('../Maia3/model/maia3_simplified.onnx', import.meta.url));
            if(!response.ok) throw new Error(`Maia model request failed (${response.status}).`);
            const bytes = await response.arrayBuffer();
            this.maiaHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
                .map(byte => byte.toString(16).padStart(2, '0')).join('');
            this.maiaUrl = URL.createObjectURL(new Blob([bytes]));
            this.maia = new MaiaEngine({ model: this.maiaUrl, provider: 'wasm' });
            await this.maia.init();
        } catch(error) {
            this.maia?.maia?.dispose();
            this.maia = null;
            this.maiaWarning = `Maia unavailable: ${error.message}`;
        }
        if(this.closed) { this.dispose(); throw new DOMException('Coaching stopped.', 'AbortError'); }
        return this;
    }

    async loadLc0() {
        const weights = await fetch(new URL('../../lc0-nets/goodgyal-7.pb', import.meta.url));
        if(!weights.ok) throw new Error(`LC0 network request failed (${weights.status}).`);
        return createLc0Analysis(await weights.arrayBuffer(), { provider: 'webgpu', timeoutMs: 120000,
            threads: 1, minibatchSize: 32, maxPrefetch: 0 });
    }

    collect(fen, history, signal) {
        this.queue = (this.queue || Promise.resolve()).catch(() => {}).then(() => {
            signal?.throwIfAborted();
            return this.collectCurrent(fen, history, signal);
        });
        return this.queue;
    }

    async collectCurrent(fen, history, signal) {
        signal?.throwIfAborted();
        if(this.closed) throw new Error('Grounded engine session is closed.');
        // A failed or cancelled search shuts its worker, so the next question gets a fresh one.
        if(this.lc0.closed) {
            this.lc0 = await this.loadLc0();
            if(this.closed) { this.lc0.dispose(); throw new DOMException('Coaching stopped.', 'AbortError'); }
        }
        signal?.throwIfAborted();
        const snapshot = await this.lc0.search(fen, { history: history.slice(-8), nodes: 128, signal });
        signal?.throwIfAborted();
        let maia = null;
        if(this.maia) {
            try {
                maia = { result: await this.maia.evaluate(fen, 1800, 1800, [fen, ...history.slice().reverse()].slice(0, 8)),
                    eloSelf: 1800, eloOpponent: 1800 };
            } catch(error) {
                signal?.throwIfAborted();
                this.maiaWarning = `Maia unavailable: ${error.message}`;
            }
        }
        signal?.throwIfAborted();
        return engineCoachingEvidence({ snapshot, maia, maiaModelSha256: maia ? this.maiaHash : null });
    }

    dispose() {
        this.closed = true;
        this.lc0?.dispose();
        this.maia?.maia?.dispose();
        if(this.maiaUrl) URL.revokeObjectURL(this.maiaUrl);
    }
}
