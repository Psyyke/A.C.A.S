import MaiaEngine from '../../Maia3/maiaEngine.js';

const MAX_ATTEMPTS = 3;
const LOAD_TIMEOUT = 45000;
const INFERENCE_TIMEOUT = 10000;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

// Maia is mandatory. At most three worker generations are created per Fusion
// instance, including startup and recovery, so a broken backend cannot spin.
export default class Neural {
    constructor(report = () => {}) {
        this.report = report;
        this.cache = new Map();
        this.queue = Promise.resolve();
        this.generations = 0;
        this.closed = false;
        this.ready = this.initialize();
        this.ready.catch(() => {});
    }

    initialize() {
        if(this.closed) return Promise.reject(new Error('Fusion closed'));
        if(this.unavailable) return Promise.reject(this.unavailable);
        if(this.engine?.ready && !this.sessionError) return Promise.resolve();
        if(this.initializing) return this.initializing;

        this.initializing = (async () => {
            for(let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
                if(this.closed) throw new Error('Fusion closed');
                if(this.generations >= MAX_ATTEMPTS) {
                    this.unavailable = this.sessionError || new Error('Maia recovery budget exhausted');
                    throw this.unavailable;
                }
                try {
                    await this.openSession();
                    return;
                } catch(error) {
                    this.destroySession(error);
                    if(this.closed) throw error;
                    if(this.generations >= MAX_ATTEMPTS) {
                        this.unavailable = error;
                        throw error;
                    }
                    this.report(`Maia load retry (${MAX_ATTEMPTS - this.generations} attempts remaining): ${error.message}`);
                    await pause(250 * (attempt + 1));
                }
            }
        })().finally(() => this.initializing = null);
        return this.initializing;
    }

    openSession() {
        if(this.closed) return Promise.reject(new Error('Fusion closed'));
        this.sessionError = null;
        this.generations++;

        return new Promise((resolve, reject) => {
            this.rejectLoad = reject;
            const timer = setTimeout(() => reject(new Error('Maia 3 loading timed out')), LOAD_TIMEOUT);
            this.loadTimer = timer;
            this.engine = new MaiaEngine({
                onMessage: () => {},
                onStatus: status => {
                    if(this.closed) return;
                    if(status === 'ready') {
                        clearTimeout(timer);
                        this.rejectLoad = null;
                        resolve();
                    }
                    if(status === 'no-cache') this.engine.download().catch(reject);
                },
                onProgress: progress => this.report(`Maia 3 loading ${progress}%`),
                onError: message => this.destroySession(new Error(message))
            });
        });
    }

    evaluate(fen, eloSelf, eloOpponent, isCurrent = () => true) {
        const evaluation = this.queue.then(async () => {
            const own = Math.max(600, Math.min(3200, eloSelf));
            const opponent = Math.max(600, Math.min(3200, eloOpponent));
            const key = `${fen}|${own}|${opponent}`;

            if(!isCurrent() || this.closed) return null;
            if(this.cache.has(key)) return this.cache.get(key);

            for(let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
                let timer;
                try {
                    await this.initialize();
                    if(!isCurrent() || this.closed) return null;

                    timer = setTimeout(() => this.destroySession(new Error('Maia 3 inference timed out')), INFERENCE_TIMEOUT);
                    const result = await this.engine.evaluate(fen, own, opponent);
                    this.validatePolicy(result);

                    if(this.cache.size >= 64) this.cache.delete(this.cache.keys().next().value);
                    this.cache.set(key, result);
                    return result;
                } catch(error) {
                    this.destroySession(error);
                    if(this.closed || !isCurrent()) return null;
                    if(this.unavailable || this.generations >= MAX_ATTEMPTS || attempt === MAX_ATTEMPTS - 1) {
                        this.unavailable = error;
                        throw error;
                    }
                    this.report(`Maia inference retry ${attempt + 1}/${MAX_ATTEMPTS - 1}: ${error.message}`);
                    await pause(250 * (attempt + 1));
                } finally {
                    clearTimeout(timer);
                }
            }
        });
        this.queue = evaluation.catch(() => {});
        return evaluation;
    }

    validatePolicy(result) {
        const probabilities = Object.values(result?.policy || {});
        if(!probabilities.length || probabilities.some(value => !Number.isFinite(value) || value < 0)
            || probabilities.reduce((sum, value) => sum + value, 0) <= 0) {
            throw new Error('Maia returned an invalid move policy');
        }
    }

    clear() {
        this.cache.clear();
    }

    destroySession(error) {
        this.sessionError = error;
        clearTimeout(this.loadTimer);
        this.rejectLoad?.(error);
        this.rejectLoad = null;

        const runtime = this.engine?.maia;
        this.engine = null;
        if(!runtime) return;

        runtime.worker.onmessage = null;
        runtime.worker.onerror = null;
        runtime.worker.terminate();
        runtime.pendingDownload?.reject(error);
        runtime.pendingDownload = null;
        for(const pending of runtime.pendingInferences.values()) pending.reject(error);
        runtime.pendingInferences.clear();
    }

    dispose() {
        this.closed = true;
        this.destroySession(new Error('Fusion closed'));
        this.cache.clear();
    }
}