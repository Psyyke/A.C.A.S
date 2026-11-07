import { Chess } from '../../engines/libraries/chessjs/chess.js';
import { maiaEloGrid, minMaiaMoves, isRatingPosition, ratingPositionKey, posteriorElo } from '../../engines/Maia3/likelihood.js';

// Maximum-likelihood Elo: the rating at which Maia 3 finds the played moves most likely.
// A 200-Elo step is as accurate as 100 (tests/maia-elo) and halves the inference cost.
export { maiaEloGrid, minMaiaMoves, eloPrior, posteriorElo } from '../../engines/Maia3/likelihood.js';

const logProbCache = new Map();
const moveCache = new Map();
const queue = [];
const waiting = new Map();
let worker = null;
let inFlight = null;
let nextId = 0;
let unavailable = false;
let workerReady = false;

function startWorker() {
    if(worker || unavailable) return;
    try {
        worker = new Worker(new URL('../../engines/Maia3/ratingWorker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
            if(data.ready) {
                workerReady = true;
                pump();
            } else {
                if(data.error) console.warn('Maia live rating unavailable:', data.error);
                settle(data.id, data.logProbs ? Float32Array.from(data.logProbs) : null);
            }
        };
        worker.onerror = error => {
            console.warn('Maia live rating worker failed:', error);
            unavailable = true;
            worker?.terminate();
            worker = null;
            settle(inFlight?.id, null);
        };
    } catch(error) {
        console.warn('Could not start Maia live rating worker:', error);
        unavailable = true;
    }
}

function settle(id, logProbs) {
    const job = inFlight?.id === id ? inFlight : null;
    if(!job) return;
    inFlight = null;
    logProbCache.set(job.key, logProbs);
    const listenerKeys = waiting.get(job.key);
    waiting.delete(job.key);
    if(listenerKeys) notifyListeners(listenerKeys);
    pump();
}

function pump() {
    if(inFlight || !queue.length) return;
    startWorker();
    if(!worker) {
        queue.splice(0).forEach(job => {
            logProbCache.set(job.key, null);
            waiting.delete(job.key);
        });
        return;
    }
    if(!workerReady) return;
    inFlight = queue.shift();
    worker.postMessage({ id: inFlight.id, fen: inFlight.fen, move: inFlight.move, elos: maiaEloGrid });
}

// Recovers the UCI move between two consecutive positions of a standard game.
export function findMove(fenBefore, fenAfter) {
    const key = `${fenBefore}|${fenAfter}`;
    if(moveCache.has(key)) return moveCache.get(key);
    let found = null;
    try {
        const board = new Chess(fenBefore);
        const target = fenAfter.split(' ')[0];
        for(const move of board.moves({ verbose: true })) {
            board.move(move);
            const matches = board.fen().split(' ')[0] === target;
            board.undo();
            if(matches) {
                found = `${move.from}${move.to}${move.promotion || ''}`;
                break;
            }
        }
    } catch(error) {
        found = null;
    }
    moveCache.set(key, found);
    return found;
}

// Listeners are keyed so repeated renders replace rather than stack callbacks.
// Stacked closures used to fan out on every result and grow without bound.
const listeners = new Map();
const dirtyListeners = new Set();
let flushTimer = null;

function notifyListeners(listenerKeys) {
    listenerKeys.forEach(listenerKey => dirtyListeners.add(listenerKey));
    if(flushTimer !== null) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        const keys = [...dirtyListeners];
        dirtyListeners.clear();
        keys.forEach(listenerKey => {
            const callback = listeners.get(listenerKey);
            listeners.delete(listenerKey);
            callback?.();
        });
    }, 250);
}

// Queues unseen moves; onUpdate runs once (coalesced) as results arrive.
function requestLogProbs(entries, onUpdate, listenerKey = onUpdate) {
    let pending = false;
    for(const { fen, move } of entries) {
        const key = `${ratingPositionKey(fen)}|${move}`;
        if(logProbCache.has(key)) continue;
        pending = true;
        if(waiting.has(key)) { waiting.get(key).add(listenerKey); continue; }
        waiting.set(key, new Set([listenerKey]));
        queue.push({ id: ++nextId, key, fen, move });
    }
    if(pending && onUpdate) listeners.set(listenerKey, onUpdate);
    pump();
}

export function estimateMaiaElo(allEntries, onUpdate, listenerKey) {
    const entries = allEntries.filter(({ fen }) => isRatingPosition(fen));
    if(entries.length < minMaiaMoves) return null;
    requestLogProbs(entries, onUpdate, listenerKey ?? onUpdate);

    const totals = new Float64Array(maiaEloGrid.length);
    let counted = 0;
    for(const { fen, move } of entries) {
        const logProbs = logProbCache.get(`${ratingPositionKey(fen)}|${move}`);
        if(!logProbs) continue;
        counted++;
        logProbs.forEach((value, index) => { totals[index] += value; });
    }
    if(counted < minMaiaMoves) return null;
    return posteriorElo(totals);
}

// Highest-likelihood grid Elo, refined with the parabola through the peak.
export function peakElo(totals, grid = maiaEloGrid) {
    let best = 0;
    totals.forEach((value, index) => { if(value > totals[best]) best = index; });
    let elo = grid[best];
    if(best > 0 && best < totals.length - 1) {
        const left = totals[best - 1], right = totals[best + 1], middle = totals[best];
        const curvature = left - 2 * middle + right;
        if(curvature < 0) elo += (grid[best + 1] - grid[best]) * (0.5 * (left - right) / curvature);
    }
    return Math.round(Math.max(grid[0], Math.min(grid.at(-1), elo)) / 10) * 10;
}
