import { incrementUserUsageStat } from './gui/stats.js';
import { variantConfig, parseVariantMove, positionKey, parseVariantFen } from './misc/variantPosition.js';
import { formatMoveNotation, getMoveSan, cacheMoveSan, createVariantSan } from './misc/moveNotation.js';

// One serial UCI queue per worker. Feedback and piece contributions share this
// implementation, including cancellation/draining and variant-aware legality.
export default class FairyAnalysis {
    constructor() {
        this.engineName = 'Fairy Stockfish 14';
        this.queue = [];
        this.inFlight = new Map();
        this.cache = new Map();
        this.options = new Map();
        this.activeJob = null;
        this.activeSearch = null;
        this.terminated = false;
        this.rebootAttempts = 0;
        this.loadStockfish();
    }

    uci(message) {
        this.engine?.postMessage({ method: 'uci', args: [message] });
    }

    loadStockfish() {
        if(this.terminated) return;
        this.readyok = false;
        this.context = null;
        this.options.clear();
        this.readyPromise = new Promise((resolve, reject) => {
            this.resolveReady = resolve;
            this.rejectReady = reject;
        });
        this.readyPromise.catch(() => {});
        if(typeof SharedArrayBuffer === 'undefined') {
            this.rejectReady(new Error('Fairy Stockfish 14 requires SharedArrayBuffer'));
            return;
        }
        this.readyTimeout = setTimeout(() => this.rebootEngine(new Error('Fairy engine initialization timed out')), 30000);
        try {
            const worker = new Worker(new URL('../engines/lila-stockfish/f14-worker.js', import.meta.url), { type: 'module' });
            this.engine = worker;
            let loaded = false;
            worker.onmessage = event => {
                if(this.engine !== worker || this.terminated) return;
                try {
                    if(event.data === true) {
                        if(loaded) return;
                        loaded = true;
                        clearInterval(this.loadInterval);
                        this.uci('uci');
                    } else if(typeof event.data === 'string') {
                        event.data.split(/\r?\n/).forEach(line => this.processMessage(line.trim()));
                    }
                } catch(error) { this.rebootEngine(error); }
            };
            worker.onerror = error => {
                if(this.engine === worker && !this.terminated) this.rebootEngine(error);
            };
            this.loadInterval = setInterval(() => {
                if(this.engine !== worker || this.terminated) return;
                try { worker.postMessage({ method: 'acas_check_loaded', args: [] }); }
                catch(error) { this.rebootEngine(error); }
            }, 100);
            worker.postMessage({ method: 'acas_check_loaded', args: [] });
        } catch(error) { this.rebootEngine(error); }
    }

    setOption(name, value) {
        if(this.options.has(name)) this.uci(`setoption name ${name} value ${value}`);
    }

    processMessage(message) {
        if(message.startsWith('option name ')) {
            const name = message.match(/^option name (.*?) type /)?.[1];
            if(name) this.options.set(name, message);
        }
        if(message === 'uciok') {
            this.setOption('Threads', 1);
            this.setOption('Hash', 32);
            // Use the bundled classical evaluator, not a missing variant NNUE file.
            this.setOption('Use NNUE', false);
            this.setOption('UCI_ShowWDL', true);
            this.setOption('UCI_LimitStrength', false);
            this.setOption('Skill Level', 20);
            this.uci('isready');
        }
        if(message === 'readyok') {
            clearTimeout(this.readyTimeout);
            this.readyok = true;
            this.resolveReady?.();
        }
        const search = this.activeSearch;
        if(!search) return;
        if(search.type === 'query') {
            search.lines.push(message);
            if(search.end(message)) this.finishSearch(null, search.lines);
            return;
        }
        if(message.startsWith('bestmove ')) {
            if(search.cancelled) this.finishSearch(new Error('Analysis cancelled'));
            else if(!search.completed.size) this.finishSearch(new Error('No exact engine evaluation'));
            else this.finishSearch(null, { iterations: search.completed });
            return;
        }
        if(!message.startsWith('info ') || /\b(?:lowerbound|upperbound)\b/.test(message)) return;
        const match = message.match(/\bscore (cp|mate) (-?\d+)\b/);
        const depth = Number(message.match(/\bdepth (\d+)\b/)?.[1]);
        const ranking = Number(message.match(/\bmultipv (\d+)\b/)?.[1] || 1);
        const pv = message.match(/\bpv (.+)$/)?.[1]?.trim().split(/\s+/);
        if(!match || !depth || !pv?.length || search.moves && !search.moves.includes(pv[0])) return;
        const wdl = message.match(/\bwdl (\d+) (\d+) (\d+)\b/);
        const score = { cp: match[1] === 'cp' ? Number(match[2]) : null,
            mate: match[1] === 'mate' ? Number(match[2]) : null,
            wdl: wdl ? wdl.slice(1).map(Number) : null, move: pv[0], pv, depth };
        if(!search.iterations.has(depth)) search.iterations.set(depth, new Map());
        search.iterations.get(depth).set(ranking, score);
        const lines = Array.from({ length: search.multiPV }, (_, index) => search.iterations.get(depth).get(index + 1));
        if(lines.every(Boolean) && new Set(lines.map(line => line.move)).size === lines.length) search.completed.set(depth, lines);
    }

    finishSearch(error, result) {
        const search = this.activeSearch;
        if(!search) return;
        clearTimeout(search.timeout);
        clearTimeout(search.stopTimeout);
        this.activeSearch = null;
        if(error) search.reject(error);
        else search.resolve(result);
    }

    rebootEngine(error = new Error('Fairy engine restarted')) {
        clearTimeout(this.readyTimeout);
        clearInterval(this.loadInterval);
        this.readyok = false;
        this.engine?.terminate();
        this.engine = null;
        this.rejectReady?.(error);
        this.finishSearch(error);
        if(!this.terminated && this.rebootAttempts++ < 3) this.loadStockfish();
    }

    cancelJob(job) {
        job.cancelled = true;
        job.resolve(null);
        if(this.inFlight.get(job.key) === job) this.inFlight.delete(job.key);
        const search = this.activeSearch;
        if(this.activeJob === job && search && !search.cancelled) {
            search.cancelled = true;
            try {
                if(search.type !== 'query') this.uci('stop');
            } catch(error) {
                this.rebootEngine(error);
                return;
            }
            // Queries still drain their own terminator; never reuse a live search.
            search.stopTimeout = setTimeout(() => this.rebootEngine(new Error('Fairy engine did not stop')), 3000);
        }
    }

    cancelPending() {
        this.queue.splice(0).forEach(job => this.cancelJob(job));
        if(this.activeJob) this.cancelJob(this.activeJob);
    }

    cancelStaleRequests() {
        const stale = job => job.consumers.every(isCurrent => !isCurrent());
        this.queue = this.queue.filter(job => {
            if(!stale(job)) return true;
            this.cancelJob(job);
            return false;
        });
        if(this.activeJob && stale(this.activeJob)) this.cancelJob(this.activeJob);
    }

    enqueue(key, config, execute) {
        const isCurrent = config.isCurrent || (() => true);
        if(this.terminated || !isCurrent()) return Promise.resolve(null);
        if(this.cache.has(key)) return Promise.resolve().then(() => isCurrent() ? this.cache.get(key) : null);
        let job = this.inFlight.get(key);
        if(job) job.consumers.push(isCurrent);
        else {
            job = { ...config, ...variantConfig(config), key, execute, consumers: [isCurrent], cancelled: false };
            job.promise = new Promise(resolve => { job.resolve = resolve; });
            this.inFlight.set(key, job);
            this.queue.push(job);
            this.processQueue();
        }
        return job.promise.then(result => isCurrent() ? result : null);
    }

    async processQueue() {
        if(this.activeJob || this.terminated) return;
        const job = this.queue.shift();
        if(!job) return;
        this.activeJob = job;
        try {
            let result;
            for(let attempt = 0; attempt < 2; attempt++) {
                const worker = this.engine;
                try {
                    await this.readyPromise;
                    if(job.cancelled || this.terminated || !this.engine) return;
                    await this.configure(job);
                    if(job.cancelled || this.terminated) return;
                    result = await job.execute(job);
                    break;
                } catch(error) {
                    // Retry a recovered worker once, not an unsupported variant,
                    // invalid position, or search that the caller has cancelled.
                    if(attempt || job.cancelled || this.terminated || !this.engine || worker === this.engine) throw error;
                }
            }
            if(result && !job.cancelled) {
                this.rebootAttempts = 0;
                this.cache.set(job.key, result);
                if(this.cache.size > 64) this.cache.delete(this.cache.keys().next().value);
                job.resolve(result);
            } else job.resolve(null);
        } catch(error) {
            if(!job.cancelled) console.warn('[FairyAnalysis] Analysis unavailable:', error);
            job.resolve(null);
        } finally {
            job.resolve(null);
            if(this.inFlight.get(job.key) === job) this.inFlight.delete(job.key);
            this.activeJob = null;
            this.processQueue();
        }
    }

    query(commands, end = message => message === 'readyok') {
        if(this.terminated || !this.engine) return Promise.reject(new Error('Fairy engine unavailable'));
        return new Promise((resolve, reject) => {
            const search = { type: 'query', resolve, reject, lines: [], end };
            this.activeSearch = search;
            search.timeout = setTimeout(() => this.rebootEngine(new Error('Fairy query timed out')), 15000);
            try {
                commands.forEach(command => this.uci(command));
            } catch(error) {
                this.rebootEngine(error);
            }
        });
    }

    async configure(job) {
        const option = this.options.get('UCI_Variant');
        const variants = option ? [...option.matchAll(/\bvar (\S+)/g)].map(match => match[1]) : ['chess'];
        const engineVariant = variants.find(name => variantConfig({ variant: name }).variant === job.variant);
        if(!engineVariant) throw new Error(`Unsupported Fairy variant: ${job.variant}`);
        const context = `${job.variant}|${job.useChess960}`;
        if(this.context === context) return;
        this.setOption('UCI_Variant', engineVariant);
        this.setOption('UCI_Chess960', job.useChess960);
        this.uci('ucinewgame');
        await this.query(['isready']);
        this.context = context;
    }

    search(job, depth = 15, moves = null, multiPV = 1) {
        if(job.cancelled || this.terminated) return Promise.reject(new Error('Analysis cancelled'));
        return new Promise((resolve, reject) => {
            const search = { resolve, reject, moves, multiPV, iterations: new Map(), completed: new Map() };
            this.activeSearch = search;
            // Depth is the target, not a hidden 3-second cap. A generous watchdog
            // handles hung workers; new positions cancel stale analysis immediately.
            search.timeout = setTimeout(() => this.rebootEngine(new Error('Fairy search timed out')), 120000);
            try {
                this.setOption('MultiPV', multiPV);
                this.uci('position fen ' + job.fen);
                try { incrementUserUsageStat('engineCalculations'); } catch(error) {}
                this.uci(`go depth ${depth}${moves?.length ? ` searchmoves ${moves.join(' ')}` : ''}`);
            } catch(error) {
                this.rebootEngine(error);
            }
        });
    }

    async legalMoves(job) {
        if(job.cancelled || this.terminated) return [];
        const lines = await this.query(['position fen ' + job.fen, 'go perft 1'], line => /Nodes searched\s*:/i.test(line));
        return lines.map(line => line.match(/^(\S+):\s*\d+\s*$/)?.[1]).filter(move => move && parseVariantMove(move));
    }

    async moveFen(job, move) {
        return (await this.moveState(job, move)).fen;
    }

    async moveState(job, move) {
        const lines = await this.query([`position fen ${job.fen}${move ? ` moves ${move}` : ''}`, 'd', 'isready']);
        const fen = lines.map(line => line.match(/^Fen:\s*(.+)$/i)?.[1]).find(Boolean);
        const checkers = lines.map(line => line.match(/^Checkers:\s*(.*)$/i)?.[1]).find(value => value !== undefined);
        return { fen, checked: Boolean(checkers?.trim()) };
    }

    async resolveTransition(job, postFen, hint = []) {
        const moves = await this.legalMoves(job);
        if(job.cancelled) return null;
        const hinted = moves.filter(uci => {
            const move = parseVariantMove(uci);
            return move.from === hint[0] && move.to === hint[1]
                && (!hint[2] || move.promotion.toLowerCase() === String(hint[2]).toLowerCase());
        });
        if(!postFen) {
            if(hinted.length !== 1) return null;
            return { selected: await this.describeMoveWithSan(job, hinted[0], moves), moves };
        }
        // Verify the engine's resulting board, including pockets, explosions,
        // Chess960 castling and underpromotions. DOM hints are never authoritative.
        const normalizedTarget = await this.moveFen({ ...job, fen: postFen });
        if(job.cancelled || !normalizedTarget) return null;
        let selected = null;
        const candidates = hinted.length ? hinted : moves;
        for(const uci of candidates) {
            if(job.cancelled) return null;
            const fen = await this.moveFen(job, uci);
            if(fen && positionKey(fen) === positionKey(normalizedTarget)) {
                if(selected) return null;
                selected = uci;
            }
        }
        if(!selected && hinted.length) return this.resolveTransition(job, postFen, []);
        return selected ? { selected: await this.describeMoveWithSan(job, selected, moves), moves } : null;
    }

    describeMove(job, uci) {
        const move = parseVariantMove(uci);
        let to = move.to;
        if(job.useChess960 && !move.drop) {
            const position = parseVariantFen(job.fen);
            const at = square => position.rows[position.rows.length - Number(square.slice(1))]?.[square.charCodeAt(0) - 97];
            if(at(move.from)?.replace(/[+~]/g, '').toLowerCase() === 'k'
                && at(move.to)?.replace(/[+~]/g, '').toLowerCase() === 'r') {
                to = `${move.to.charCodeAt(0) > move.from.charCodeAt(0) ? 'g' : 'c'}${move.from.slice(1)}`;
            }
        }
        const notationMove = { fen: job.fen, chessVariant: job.variant, useChess960: job.useChess960,
            player: [move.from, to], playerPromotion: move.promotion, playerUci: uci };
        return { ...move, to, san: formatMoveNotation(notationMove, true), notationMove };
    }

    async describeMoveWithSan(job, uci, moves) {
        const described = this.describeMove(job, uci);
        if(getMoveSan(described.notationMove) || job.cancelled) return described;
        const root = await this.moveState(job);
        if(!root.fen || job.cancelled) return described;
        const result = await this.moveState(job, uci);
        if(!result.fen || job.cancelled) return described;
        if(result.checked) result.mate = !(await this.legalMoves({ ...job, fen: result.fen })).length;
        if(job.cancelled) return described;
        const san = createVariantSan(root.fen, uci, moves, result);
        cacheMoveSan(described.notationMove, san);
        if(san) described.san = san;
        return described;
    }

    notateMove(move, isCurrent = () => true) {
        const context = variantConfig(move);
        const uci = move.playerUci || move.player.join('') + String(move.playerPromotion || '').toLowerCase();
        const key = `notation|${context.variant}|${context.useChess960}|${move.fen}|${uci}`;
        return this.enqueue(key, { ...context, fen: move.fen, isCurrent }, async job => {
            const moves = await this.legalMoves(job);
            if(job.cancelled || !moves.includes(uci)) return null;
            const described = await this.describeMoveWithSan(job, uci, moves);
            const san = getMoveSan(described.notationMove);
            return san ? { san } : null;
        }).then(result => {
            if(result) cacheMoveSan(move, result.san);
            return result;
        });
    }

    resolveMove(fen, postFen, hint = [], config = {}) {
        const context = variantConfig(config);
        return this.enqueue(`move|${context.variant}|${context.useChess960}|${fen}|${postFen}|${hint.join('')}`,
            { ...config, fen }, job => this.resolveTransition(job, postFen, hint));
    }

    startNewGame() {
        this.cancelPending();
        this.cache.clear();
        this.context = null;
    }

    terminate() {
        this.terminated = true;
        this.cancelPending();
        clearInterval(this.loadInterval);
        clearTimeout(this.readyTimeout);
        this.finishSearch(new Error('Fairy engine terminated'));
        this.rejectReady?.(new Error('Fairy engine terminated'));
        this.engine?.terminate();
        this.engine = null;
        this.cache.clear();
    }
}