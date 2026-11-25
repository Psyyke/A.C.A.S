import { createWorkerTree } from '../lc0/worker-tree.js';
import { collectSearch } from './lc0-stats.js';
import { PositionGraph, boardAt, playUci, canonicalUci } from './positions.js';

export function canonicalSearch(result, fen) {
    return { ...result, bestMove: result.bestMove ? canonicalUci(fen, result.bestMove) : null,
        candidates: result.candidates.map(candidate => ({ ...candidate, engineMove: candidate.move, move: canonicalUci(fen, candidate.move) })),
        lines: result.lines.map(line => {
            const board = boardAt(fen);
            const pv = line.pv.map(move => {
                const canonical = canonicalUci(board.fen(), move);
                playUci(board, canonical);
                return canonical;
            });
            return { ...line, pv };
        }) };
}

// Sites sometimes report an en passant square no pawn can use, and Lc0 refuses the whole FEN for it.
export function uciFen(fen) {
    const parts = String(fen).trim().split(/\s+/);
    const square = parts[3];
    if(!square || square === '-') return parts.join(' ');
    const rows = parts[0].split('/').map(row => row.replace(/\d/g, n => '.'.repeat(Number(n))));
    const at = (file, rank) => rows[8 - rank]?.[file] || '';
    const white = parts[1] === 'w';
    const file = square.charCodeAt(0) - 97, rank = Number(square[1]);
    const pawn = white ? 'P' : 'p', pushed = white ? 'p' : 'P';
    const from = white ? 5 : 4;
    const usable = file >= 0 && file < 8 && rank === (white ? 6 : 3) && at(file, from) === pushed
        && at(file, rank) === '.' && [file - 1, file + 1].some(side => at(side, from) === pawn);
    if(!usable) parts[3] = '-';
    return parts.join(' ');
}

export class Lc0Analysis {
    constructor(worker, { timeoutMs = 60000 } = {}) {
        this.worker = worker;
        this.timeoutMs = timeoutMs;
        this.pending = null;
        this.busy = false;
        this.closed = false;
        this.ready = false;
        this.sequence = 0;
        worker.onmessage = ({ data }) => {
            if(data?.type === 'ready') this.inferenceDevice = data.inference || null;
            if(data?.type === 'error') return this.fail(new Error(data.message));
            if(data?.type === 'uci' && /^error\b/i.test(data.line)) return this.fail(new Error(data.line));
            const pending = this.pending;
            if(!pending) return;
            if(data?.type === 'uci') pending.lines.push(...data.line.split(/\r?\n/).filter(Boolean));
            if(pending.end(data)) pending.resolve(pending.lines);
        };
        worker.onerror = event => this.fail(new Error(event.message || 'Lc0 worker failed.'));
        worker.onmessageerror = () => this.fail(new Error('Lc0 worker message could not be decoded.'));
    }

    fail(error) {
        this.closed = true;
        this.worker.terminate();
        this.pending?.reject(error);
    }

    wait(send, end, signal) {
        if(this.closed || this.pending) return Promise.reject(new Error('Lc0 is closed or already waiting.'));
        signal?.throwIfAborted();
        return new Promise((resolve, reject) => {
            const finish = (fn, value) => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                this.pending = null;
                fn(value);
            };
            const abort = () => this.fail(signal.reason || new DOMException('Lc0 cancelled.', 'AbortError'));
            const timer = setTimeout(() => this.fail(new Error('Lc0 request timed out; create a new analysis worker.')), this.timeoutMs);
            this.pending = { lines: [], end, resolve: value => finish(resolve, value), reject: error => finish(reject, error) };
            signal?.addEventListener('abort', abort, { once: true });
            try { send(); } catch(error) { this.fail(error); }
        });
    }

    send(line) { this.worker.postMessage({ type: 'uci', line }); }

    async initialize(weights, { provider = null, threads = 1, minibatchSize = 1, maxPrefetch = 0, signal } = {}) {
        if(this.ready || this.busy || this.initialized) throw new Error('Lc0 can only be initialized once.');
        this.initialized = true;
        this.busy = true;
        try {
            if(!(weights instanceof ArrayBuffer) || !weights.byteLength) throw new Error('Lc0 weights are required.');
            if(provider !== null && !['webgpu', 'wasm'].includes(provider)) throw new Error('Invalid Lc0 inference provider.');
            if(!Number.isSafeInteger(threads) || threads < 1 || threads > 32
                || !Number.isSafeInteger(minibatchSize) || minibatchSize < 1 || minibatchSize > 256
                || !Number.isSafeInteger(maxPrefetch) || maxPrefetch < 0 || maxPrefetch > 256)
                throw new Error('Lc0 requires threads 1..32, minibatchSize 1..256 and maxPrefetch 0..256.');
            const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', weights))].map(byte => byte.toString(16).padStart(2, '0')).join('');
            await this.wait(() => this.worker.postMessage({ type: 'initialize', weights, ...(provider ? { provider } : {}) }, [weights]),
                data => data.type === 'ready', signal);
            const lines = await this.wait(() => this.send('uci'), data => data.type === 'uci' && data.line.trim() === 'uciok', signal);
            const options = new Set(lines.map(line => line.match(/^option name (.*?) type /)?.[1]).filter(Boolean));
            const settings = { Threads: threads, NNCacheSize: 20000, MinibatchSize: minibatchSize, MaxPrefetch: maxPrefetch,
                MultiPV: 3, VerboseMoveStats: true, SmartPruningFactor: 0 };
            for(const [name, value] of Object.entries(settings)) {
                if(!options.has(name)) throw new Error(`Lc0 does not expose required option ${name}.`);
                this.send(`setoption name ${name} value ${value}`);
            }
            for(const name of ['Contempt', 'WDLRescaleDiff']) if(options.has(name)) {
                settings[name] = 0;
                this.send(`setoption name ${name} value 0`);
            }
            await this.wait(() => this.send('isready'), data => data.type === 'uci' && data.line.trim() === 'readyok', signal);
            const response = await fetch(new URL('../lc0/dist/build-info.json', import.meta.url), { signal });
            if(!response.ok) throw new Error(`Lc0 build metadata request failed (${response.status}).`);
            this.identity = { engine: lines.find(line => line.startsWith('id name '))?.slice(8),
                build: await response.json(), networkSha256: hash, backend: provider || 'eigen', precision: 'f32', settings,
                worker: 'lc0/worker.js', ...(this.inferenceDevice ? { device: this.inferenceDevice } : {}) };
            this.ready = true;
            return this;
        } catch(error) {
            this.fail(error);
            throw error;
        } finally { this.busy = false; }
    }

    async search(fen, { history = [], nodes = 128, moves = [], signal } = {}) {
        if(!this.ready || this.closed || this.busy) throw new Error('Lc0 is not ready or another search is running.');
        if(!Number.isSafeInteger(nodes) || nodes < 1 || nodes > 100000) throw new Error('Lc0 nodes must be between 1 and 100000.');
        if(!Array.isArray(moves) || new Set(moves).size !== moves.length) throw new Error('Invalid candidate move filter.');
        const graph = new PositionGraph(fen, history);
        for(const move of moves) playUci(boardAt(fen), move);
        signal?.throwIfAborted();
        this.busy = true;
        const started = performance.now();
        try {
            await this.wait(() => { this.send('ucinewgame'); this.send('isready'); },
                data => data.type === 'uci' && data.line.trim() === 'readyok', signal);
            const transcript = await this.wait(() => {
                this.send(graph.command().replace(graph.initialFen, uciFen(graph.initialFen)));
                this.send(`go nodes ${nodes}${moves.length ? ` searchmoves ${moves.join(' ')}` : ''}`);
            }, data => data.type === 'uci' && /^bestmove /.test(data.line), signal);
            const result = canonicalSearch(collectSearch(transcript), fen);
            if(result.bestMove) playUci(boardAt(fen), result.bestMove);
            for(const candidate of result.candidates) playUci(boardAt(fen), candidate.move);
            for(const [index, line] of result.lines.entries()) graph.branch(`checked-${index}`, line.pv.slice(0, 12));
            if(moves.length && result.bestMove && !moves.includes(result.bestMove)) throw new Error('Lc0 ignored the candidate move restriction.');
            return { schema: 'pena-v2-search/1', searchId: `search-${++this.sequence}`, fen: graph.root.fen, history: [...history],
                engine: this.identity, budget: { nodes, moves: [...moves] }, milliseconds: performance.now() - started,
                perspective: 'root-side-to-move', valueSemantics: 'Lc0 search values can include draw utility/rescaling; UCI scores are not Stockfish centipawns.',
                ...result, transcript };
        } catch(error) {
            this.fail(error);
            throw error;
        } finally { this.busy = false; }
    }

    dispose() { this.fail(new DOMException('Lc0 analysis disposed.', 'AbortError')); }
}

export async function createLc0Analysis(weights, options = {}) {
    const worker = createWorkerTree(new URL('../lc0/worker.js', import.meta.url), { type: 'module' });
    const engine = new Lc0Analysis(worker, options);
    return engine.initialize(weights, options);
}
