import { Chess } from '../libraries/chessjs/chess.js';

// A small private Stockfish for Pena's thinking notes. Stockfish 19 lite answers a
// depth 12 search in roughly 10 to 80 ms, several times faster than Stockfish 8.
const ENGINE_URL = new URL('../stockfish-19-lite-single/stockfish-19-lite-single.js', import.meta.url);
const SEARCH_TIMEOUT_MS = 3000;

const defaultWorker = () => new Worker(ENGINE_URL);

// UCI moves to SAN, stopping at the first move that does not fit the board.
export function uciToSan(fen, uci) {
    const chess = new Chess(fen), out = [];
    for(const move of uci) {
        const made = chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] || undefined });
        if(!made) break;
        out.push(made.san);
    }
    return out;
}

// Turns the last full "info" line into a score from White's side in pawns. Mates become +-100 minus distance.
export function parseSearch(fen, info, bestmove) {
    const white = fen.split(' ')[1] === 'w';
    const mate = info?.match(/score mate (-?\d+)/), cp = info?.match(/score cp (-?\d+)/);
    const plies = Number(mate?.[1]);
    let score = mate ? (plies === 0 ? -100 : Math.sign(plies) * (100 - Math.abs(plies))) : Number(cp?.[1] || 0) / 100;
    if(!white) score = -score;
    const uci = (info?.match(/ pv (.*)$/)?.[1] || bestmove || '').trim().split(/\s+/).filter(Boolean);
    const pv = uciToSan(fen, uci);
    return { score, mate: mate ? plies * (white ? 1 : -1) : null, best: pv[0] || null, pv };
}

export function createVerdictEngine({ createWorker = defaultWorker, depth = 12 } = {}) {
    let worker = null, broken = false, listener = null, queue = Promise.resolve();
    const cache = new Map();
    const start = () => {
        if(worker || broken) return worker;
        try {
            worker = createWorker();
            worker.onmessage = ({ data }) => listener?.(String(data));
            worker.onerror = () => { broken = true; listener?.(null); };
            worker.postMessage('uci');
        } catch { broken = true; worker = null; }
        return worker;
    };
    // Resolves null when the engine is missing or slow, so a note simply goes without engine words.
    const search = (fen, searchDepth = depth) => {
        const key = `${fen}|${searchDepth}`;
        if(cache.has(key)) return cache.get(key);
        const job = queue.then(() => new Promise(resolve => {
            if(!start()) return resolve(null);
            let last = null, timer;
            const done = value => { clearTimeout(timer); listener = null; resolve(value); };
            // A late bestmove from a stopped search must not answer the next one, so wait for it before moving on.
            timer = setTimeout(() => {
                listener = line => { if(line === null || line.startsWith('bestmove')) done(null); };
                worker.postMessage('stop');
                timer = setTimeout(() => { broken = true; done(null); }, 1000);
            }, SEARCH_TIMEOUT_MS);
            listener = line => {
                if(line === null) return done(null);
                if(line.startsWith('info') && / score /.test(line) && / pv /.test(line) && !/ (upper|lower)bound/.test(line)) last = line;
                if(line.startsWith('bestmove')) done(parseSearch(fen, last, line.split(' ')[1]));
            };
            worker.postMessage('ucinewgame');
            worker.postMessage(`position fen ${fen}`);
            worker.postMessage(`go depth ${searchDepth}`);
        }));
        queue = job;
        cache.set(key, job);
        if(cache.size > 400) cache.delete(cache.keys().next().value);
        return job;
    };
    return {
        search,
        warm: fen => { void search(fen); },
        close() { try { worker?.postMessage('quit'); worker?.terminate(); } catch {} worker = null; listener = null; }
    };
}
