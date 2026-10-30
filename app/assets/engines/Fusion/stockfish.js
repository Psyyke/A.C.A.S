export default class Stockfish {
    constructor(onLine, onError) {
        this.waiters = [];
        this.onLine = onLine;
        this.onError = onError;
        this.worker = new Worker(new URL('../stockfish-18-lite-single/stockfish-18-lite-single.js', import.meta.url));
        this.ready = new Promise((resolve, reject) => {
            this.resolveReady = resolve;
            this.rejectReady = reject;
        });
        this.ready.catch(() => {});
        this.loadTimeout = setTimeout(() => this.fail(new Error('Stockfish 18 initialization timed out')), 30000);

        this.worker.onmessage = event => {
            if(this.failed || typeof event.data !== 'string') return;

            for(const text of event.data.split(/\r?\n/)) {
                const line = text.trim();
                if(line === 'uciok') {
                    // This build is deliberately single-threaded and always full-strength.
                    this.send('setoption name Threads value 1');
                    this.send('setoption name Skill Level value 20');
                    this.send('setoption name UCI_LimitStrength value false');
                    this.synchronize().then(() => {
                        clearTimeout(this.loadTimeout);
                        this.resolveReady();
                    }).catch(error => this.fail(error));
                } else if(line === 'readyok') {
                    const waiter = this.waiters.shift();
                    if(waiter) {
                        clearTimeout(waiter.timeout);
                        waiter.resolve();
                    }
                } else {
                    this.onLine(line);
                }
            }
        };
        this.worker.onerror = event => this.fail(new Error(event.message || 'Stockfish worker crashed'));
        this.send('uci');
    }

    send(command) {
        this.worker.postMessage(command);
    }

    synchronize() {
        if(this.failed) return Promise.reject(new Error('Stockfish is not available'));
        return new Promise((resolve, reject) => {
            const waiter = { resolve, reject };
            waiter.timeout = setTimeout(() => this.fail(new Error('Stockfish readiness timed out')), 30000);
            this.waiters.push(waiter);
            this.send('isready');
        });
    }

    fail(error) {
        if(this.failed) return;
        this.failed = true;
        clearTimeout(this.loadTimeout);
        this.rejectReady(error);
        for(const waiter of this.waiters.splice(0)) {
            clearTimeout(waiter.timeout);
            waiter.reject(error);
        }
        this.worker.terminate();
        this.onError(error);
    }

    dispose() {
        this.failed = true;
        this.rejectReady(new Error('Fusion closed'));
        clearTimeout(this.loadTimeout);
        this.worker.terminate();
        for(const waiter of this.waiters.splice(0)) {
            clearTimeout(waiter.timeout);
            waiter.reject(new Error('Fusion closed'));
        }
    }
}