// Plays the user's own A.C.A.S setup against Maia 3 and reports each game's score.
// Explicit same-origin GUI sessions avoid creating userscript contexts for games.
// Nothing here trusts incoming hints: they can arrive late or suggest illegal moves, and
// every such game is voided and replayed instead of being scored.
import MaiaEngine from '../../app/assets/engines/Maia3/maiaEngine.js';
import { Chess } from '../../app/assets/engines/libraries/chessjs/chess.js';
import { automaticRun, automaticStatus, planBatch, batchSizeForBoards, maxBoards } from './eloPolicy.js?v=10boards';
import { BoardSession, TimeoutError, placementOf } from './boardSession.js';
import { loadOpenings, openingCount } from './openings.js';
import { selectHintMove, defaultSelectionWeights, validateSelectionWeights } from './hintSelection.js';
import { maiaEloGrid, maiaTemperatures, moveLogLikelihoods } from '../../app/assets/engines/Maia3/likelihood.js';
import { MoveSampler, estimateMoveEvidence } from './moveEvidence.js';
import { materialWinner, materialStabilityPlies } from './materialAdjudication.js';

const maiaTimeoutMs = 20000;
// collectMs: profiles can report separately, so wait briefly to see all their moves.
// No presentation delay: position/hint messages provide the synchronization.
export const defaultTimings = {
    moveTimeoutMs: 60000, openingTimeoutMs: 45000, collectMs: 20, paceMs: 0, partialGraceMs: 4000, probeBoardMs: 10000, probeHintsMs: 25000, connectTimeoutMs: 20000,
    retryDelayMs: 2000
};
let timings = { ...defaultTimings };
const maxConsecutiveVoids = 3;

export class SetupError extends Error {
    // code: 'no-gui' | 'no-profile' | 'no-board' | 'unsafe-moves'
    constructor(code) {
        super(code);
        this.name = 'SetupError';
        this.code = code;
    }
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
    const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException('Stopped', 'AbortError'));
    };
    const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
    }, ms);
    if(signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
});

const withTimeout = (promise, ms, what) => {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(what)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// Match A.C.A.S Maia's top-policy move, preserving policy order for ties.
function bestPolicyMove(policy) {
    const entries = Object.entries(policy);
    const total = entries.reduce((sum, [, probability]) => sum + probability, 0);
    if(!entries.length || !Number.isFinite(total) || total <= 0
        || entries.some(([, probability]) => !Number.isFinite(probability) || probability < 0)) {
        throw new Error('Maia returned an invalid move policy');
    }
    let best = entries[0];
    for(const [move, probability] of entries) {
        if(probability > best[1]) best = [move, probability];
    }
    return best[0];
}

export class Opponent {
    constructor(onProgress, maia = new MaiaEngine({ onProgress })) {
        this.maia = maia;
        this.queue = [];
        this.analysisQueue = [];
        this.active = [];
        this.timer = null;
        this.running = false;
    }

    init() {
        return withTimeout(this.maia.init(), 120000, 'Maia model load').catch(error => {
            this.stop(error);
            throw error;
        });
    }

    // Coalesce ready boards without waiting for boards still thinking. Only one
    // inference is active; new requests join the following batch.
    move(fen, rating) {
        return this.request(fen, rating);
    }

    async likelihood(fen, move) {
        const results = await Promise.all(maiaEloGrid.map(rating => this.request(fen, rating, true)));
        return moveLogLikelihoods(results, move, maiaTemperatures);
    }

    request(fen, rating, analysis = false) {
        if(this.error) return Promise.reject(this.error);

        return new Promise((resolve, reject) => {
            const queue = analysis ? this.analysisQueue : this.queue;
            queue.push({ fen, rating, analysis, resolve, reject });

            if(!this.running && this.timer === null) {
                this.timer = setTimeout(() => {
                    this.timer = null;
                    this.flush();
                }, 0);
            }
        });
    }

    async flush() {
        this.running = true;
        try {
            while((this.queue.length || this.analysisQueue.length) && !this.error) {
                const playing = this.queue.length > 0;
                const queue = playing ? this.queue : this.analysisQueue;
                // A full rating grid must not block a ready game for an entire
                // batch. Yield between individual background inferences.
                this.active = queue.splice(0, playing ? 6 : 1);
                const ratings = this.active.map(job => job.rating);
                // Equal-rating conditioning is a fixed reference definition,
                // not an assertion about the unknown A.C.A.S strength.
                const { result } = await withTimeout(this.maia.evaluateBatch(
                    this.active.map(job => job.fen), ratings, ratings
                ), maiaTimeoutMs, 'Maia');
                if(this.error) break;
                if(result?.length !== this.active.length) throw new Error('Maia returned an incomplete batch');
                const answers = result.map((item, index) => this.active[index].analysis ? item : bestPolicyMove(item.policy));
                this.active.forEach((job, index) => job.resolve(answers[index]));
                this.active = [];
            }
        } catch(error) {
            this.stop(error);
        } finally {
            this.running = false;
        }
    }

    stop(reason = new DOMException('Stopped', 'AbortError')) {
        if(this.error) return;
        this.error = reason;
        clearTimeout(this.timer);
        this.timer = null;
        [...this.active, ...this.queue, ...this.analysisQueue].forEach(job => job.reject(reason));
        this.active = [];
        this.queue = [];
        this.analysisQueue = [];
        this.maia.dispose(this.error);
    }
}

const destsOf = chess => {
    const dests = {};
    chess.moves({ verbose: true }).forEach(({ from, to }) => (dests[from] ??= []).push(to));
    return dests;
};

const legalMatch = (chess, from, to) => chess.moves({ verbose: true }).find(move => move.from === from && move.to === to);

// The full moves A.C.A.S currently shows for this exact position, or [] while it hasn't (or is stale).
function revealedMoves(frame, chess) {
    const hints = frame.hints;
    if(!hints || placementOf(hints.fen) !== placementOf(chess.fen())) return [];
    return hints.moves
        .map(([from, to, promotion]) => legalMatch(chess, from, to) && { from, to, promotion: promotion || 'q' })
        .filter(Boolean);
}

// Give the opening a shorter deadline so an unavailable GUI/profile is reported promptly.
async function acasMove(frame, chess, signal, selectionWeights = defaultSelectionWeights, onFallback = () => {}) {
    const timeout = chess.history().length <= 1 ? timings.openingTimeoutMs : timings.moveTimeoutMs;
    const deadline = Date.now() + timeout;
    let sawUnsafeMoves = false;
    const hasApprovedMove = () => {
        const options = revealedMoves(frame, chess);
        if(!frame.profilesReady) return false;
        if(!options.length) return false;
        // Profiles and replacement markings can arrive in separate messages.
        // Readiness must not consume the random draw used for the actual move.
        const selected = selectHintMove(options, frame.hints.candidates, () => 0, selectionWeights);
        if(!selected.move) sawUnsafeMoves = true;
        return Boolean(selected.move);
    };
    const waitForApprovedMove = () => frame.waitFor(hasApprovedMove, {
        timeout: Math.max(0, deadline - Date.now()), signal, what: 'A.C.A.S move'
    });
    try {
        await waitForApprovedMove();
        await sleep(timings.collectMs, signal);
        await waitForApprovedMove();
    } catch(error) {
        if(error instanceof TimeoutError && sawUnsafeMoves) throw new SetupError('unsafe-moves');
        throw error;
    }
    const options = revealedMoves(frame, chess);
    const selected = selectHintMove(options, frame.hints.candidates, Math.random, selectionWeights);
    if(!selected.move) throw new SetupError('unsafe-moves');
    if(selected.fallback) onFallback();
    return selected.move;
}

async function humanMove(frame, chess, signal) {
    for(;;) {
        const [from, to] = await frame.waitFor(() => frame.moves.shift(), { timeout: 30 * 60000, signal, what: 'your move' });
        const legal = legalMatch(chess, from, to);
        if(legal) return { from, to, promotion: 'q' };
        // Illegal drop: put the position back.
        frame.setPosition({ fen: chess.fen(), turn: chess.turn(), movable: true, dests: destsOf(chess) });
    }
}

// Score from A.C.A.S's point of view: 1 win, 0.5 draw, 0 loss.
export async function playGame({ opponentEngine, frame, opponent, acasIsWhite, manual, signal, openingFen, onMove, onFallback, onAdjudication = () => {},
    selectionWeights = defaultSelectionWeights, chess = new Chess(openingFen) }) {
    const acasColor = acasIsWhite ? 'w' : 'b';
    let lastMove = null;
    let materialSide = null, stablePositions = 0, adjudicatedWinner = null;
    const materialPositions = new Set();

    await frame.whenReady({ signal });
    frame.setPosition({ fen: chess.fen(), turn: chess.turn(),
        movable: manual && chess.turn() === acasColor,
        dests: manual && chess.turn() === acasColor ? destsOf(chess) : {} });
    await frame.waitFor(() => frame.statuses.has('connected'), { timeout: timings.connectTimeoutMs, signal, what: 'A.C.A.S connection' });

    while(!chess.game_over()) {
        signal.throwIfAborted();
        const winner = materialWinner(chess);
        const positionKey = chess.fen().split(' ').slice(0, 4).join(' ');
        stablePositions = !winner || materialPositions.has(positionKey) ? 0
            : winner === materialSide ? stablePositions + 1 : 1;
        if(winner) materialPositions.add(positionKey);
        materialSide = winner;
        if(stablePositions > materialStabilityPlies) {
            adjudicatedWinner = winner;
            onAdjudication(winner);
            break;
        }

        const acasToMove = chess.turn() === acasColor;
        frame.setPosition({
            fen: chess.fen(), turn: chess.turn(), lastMove,
            movable: manual && acasToMove, dests: manual && acasToMove ? destsOf(chess) : {}
        });

        let move;
        if(!acasToMove) {
            const uci = await opponentEngine.move(chess.fen(), opponent);
            move = { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
            if(timings.paceMs > 0) await sleep(timings.paceMs, signal);
        } else if(manual) move = await humanMove(frame, chess, signal);
        else {
            move = await acasMove(frame, chess, signal, selectionWeights, onFallback);
            if(timings.paceMs > 0) await sleep(timings.paceMs, signal);
        }

        const fen = chess.fen();
        const legalMoves = acasToMove && onMove ? chess.moves().length : 0;
        const played = chess.move(move);
        if(!played) throw new Error(`illegal move ${move.from}${move.to}`);

        if(acasToMove && onMove) {
            onMove({ fen, move: played.from + played.to + (played.promotion ?? ''), legalMoves });
        }

        lastMove = [move.from, move.to];
    }

    frame.setPosition({ fen: chess.fen(), turn: chess.turn(), lastMove });
    if(adjudicatedWinner) return adjudicatedWinner === acasColor ? 1 : 0;
    if(chess.in_checkmate()) return chess.turn() === acasColor ? 0 : 1;
    return 0.5;
}

// Works out whether A.C.A.S gives full moves ('auto') or only hints ('manual'), or why it gives neither.
export async function probeSetup({ mount, signal }) {
    const frame = new BoardSession(mount(0), { orientation: 'w' });
    try {
        await frame.whenReady({ signal });
        try {
            await frame.waitFor(() => frame.statuses.has('board'), { timeout: timings.probeBoardMs, signal });
        } catch(error) {
            throw error instanceof TimeoutError ? new SetupError('no-board') : error;
        }

        const start = new Chess();
        frame.setPosition({ fen: start.fen(), turn: 'w' });
        const answered = () => frame.profilesReady && frame.hints && placementOf(frame.hints.fen) === placementOf(start.fen());

        try {
            await frame.waitFor(answered, { timeout: timings.probeHintsMs, signal });
        } catch(error) {
            if(!(error instanceof TimeoutError)) throw error;
            throw new SetupError(frame.statuses.has('connected') ? 'no-profile' : 'no-gui');
        }

        if(revealedMoves(frame, start).length) return 'auto';
        try {
            await frame.waitFor(() => revealedMoves(frame, start).length > 0, { timeout: timings.partialGraceMs, signal });
            return 'auto';
        } catch(error) {
            if(!(error instanceof TimeoutError)) throw error;
        }
        if(frame.hints.partial) return 'manual';
        throw new SetupError('no-profile');
    } finally {
        await frame.destroy();
    }
}

// onProgress receives { phase: 'loading', percent }, { phase: 'probing' }, then
// { phase: 'playing', mode, done, total, voided, games }.
// mount(index) must return the element board `index` should be placed in; it is called for every game.
export async function runMatch({ mode = 'detect', total, boards = 2, multipleWorkers = false, initialGames = [], initialBatch = [], mount, onProgress = () => {}, onCheckpoint = () => {}, onFallback = () => {}, signal, timing = {}, selectionWeights = defaultSelectionWeights }) {
    selectionWeights = validateSelectionWeights(selectionWeights);
    const automatic = total === undefined;
    total ??= automaticRun.maxGames;
    if(!Number.isInteger(total) || total < 1 || total > openingCount * 2 || !Number.isInteger(boards) || boards < 1 || boards > 100
        || initialGames.length > total) throw new Error('Invalid EloEye run settings');
    timings = { ...defaultTimings, ...timing };
    const games = initialGames.map(game => ({ ...game }));
    if(games.length + initialBatch.length > total) throw new Error('Invalid EloEye saved batch');
    if(games.length === total || (automatic && !initialBatch.length && automaticStatus(games).done)) return { mode, games, automatic };
    signal?.throwIfAborted();
    const abort = new AbortController();
    const stopAll = () => abort.abort();
    const stopped = () => signal?.reason ?? new DOMException('Stopped', 'AbortError');

    const opponents = [new Opponent(percent => onProgress({ phase: 'loading', percent }))];
    signal?.addEventListener('abort', stopAll);
    const stopOpponent = () => opponents.forEach(opponent => opponent.stop(stopped()));
    abort.signal.addEventListener('abort', stopOpponent, { once: true });

    try {
        onProgress({ phase: 'loading', percent: 0 });
        const openings = await loadOpenings();
        await opponents[0].init();
        if(abort.signal.aborted) throw stopped();

        if(mode === 'detect') {
            onProgress({ phase: 'probing' });
            mode = await probeSetup({ mount, signal: abort.signal });
        }
        const manual = mode === 'manual';
        const lanes = Math.min(manual ? 1 : boards, maxBoards, total - games.length);
        if(multipleWorkers && lanes > 1) {
            // The first worker populates the model cache before the others load it.
            onProgress({ phase: 'loading', percent: 0 });
            for(let lane = 1; lane < lanes; lane++) opponents.push(new Opponent());
            await Promise.all(opponents.slice(1).map(opponent => opponent.init()));
            abort.signal.throwIfAborted();
        }
        const batchSize = batchSizeForBoards(lanes);
        const voidBudget = Math.max(6, Math.ceil(total * 0.25));

        let voided = 0;
        // Per board, so one hiccup that hits every board at once is not mistaken for a broken setup.
        const consecutiveVoids = new Array(lanes).fill(0);
        let fatal = null;
        const pending = new Map();
        const samplers = new Map();
        let batch = initialBatch.map(game => ({ ...game }));
        let precision = automatic ? automaticStatus(games) : null;
        const report = () => onProgress({ phase: 'playing', mode, done: games.length + batch.filter(game => game.score !== undefined).length,
            total, voided, games: [...games, ...batch.filter(game => game.score !== undefined)], automatic, precision,
            measuredGames: games.length,
            moveEstimate: estimateMoveEvidence([
                ...games, ...batch.filter(game => game.score !== undefined),
                ...Array.from(samplers.values(), sampler => ({ moveEvidence: sampler.evidence }))
            ]),
            pending: [...pending.entries()].map(([lane, game]) => ({ lane, ...game })) });
        const checkpoint = () => onCheckpoint({ mode, games, batch });
        const samplingFailed = error => {
            if(abort.signal.aborted) return;
            fatal = error;
            stopAll();
        };
        report();

        async function playJob(job, lane) {
            const opponentEngine = opponents[multipleWorkers ? lane : 0];
            while(job.score === undefined && !abort.signal.aborted) {
                pending.set(lane, job);
                const sampler = games.length < automaticRun.minGames
                    ? new MoveSampler(opponentEngine, () => { if(!abort.signal.aborted) report(); }, samplingFailed)
                    : null;
                if(sampler) samplers.set(lane, sampler);

                let frame;
                let completed = false;
                let retryDelay = 0;
                try {
                    frame = new BoardSession(mount(lane), { orientation: job.acasIsWhite ? 'w' : 'b' });
                    report();
                    const opening = openings[job.opening];
                    if(!opening) throw new Error('Invalid EloEye opening index');
                    const score = await playGame({
                        opponentEngine, frame, manual, signal: abort.signal, ...job, openingFen: opening.fen, selectionWeights,
                        onAdjudication: () => { job.materialAdjudication = true; },
                        onFallback: () => {
                            if(!job.suggestionFallback) {
                                job.suggestionFallback = true;
                                checkpoint();
                            }
                            onFallback();
                        },
                        onMove: sampler ? entry => sampler.observe(entry) : undefined
                    });
                    const moveEvidence = sampler ? await sampler.finish() : undefined;
                    abort.signal.throwIfAborted();
                    samplers.delete(lane);
                    if(moveEvidence) job.moveEvidence = moveEvidence;
                    job.score = score;
                    completed = true;
                    checkpoint();
                    consecutiveVoids[lane] = 0;
                } catch(error) {
                    if(abort.signal.aborted) return;
                    if(completed) {
                        fatal = error;
                        stopAll();
                        return;
                    }
                    console.warn('game voided:', error);
                    voided++;
                    // A stalled board is restarted without counting toward the consecutive-failure stop;
                    // the overall void budget still ends a setup that never answers.
                    if(error instanceof TimeoutError) consecutiveVoids[lane] = 0;
                    else {
                        consecutiveVoids[lane]++;
                        retryDelay = timings.retryDelayMs * consecutiveVoids[lane];
                    }
                    if(error instanceof SetupError || opponentEngine.error || consecutiveVoids[lane] >= maxConsecutiveVoids || voided > voidBudget) {
                        fatal = error;
                        stopAll();
                        return;
                    }
                } finally {
                    await sampler?.finish();
                    samplers.delete(lane);
                    pending.delete(lane);
                    await frame?.destroy();
                }
                report();
                // Let a briefly busy GUI settle before this board tries again.
                if(retryDelay) await sleep(retryDelay, abort.signal).catch(() => {});
            }
        }

        while(games.length < total && !abort.signal.aborted) {
            if(!batch.length) {
                batch = planBatch(games, Math.min(batchSize, total - games.length));
                checkpoint();
            }
            const remaining = batch.filter(game => game.score === undefined);
            let next = 0;
            await Promise.all(Array.from({ length: Math.min(lanes, remaining.length) }, async (_, lane) => {
                while(next < remaining.length && !abort.signal.aborted) await playJob(remaining[next++], lane);
            }));
            if(fatal) throw fatal;
            if(abort.signal.aborted) throw stopped();
            // Commit in planned order only after the entire group finishes. A quick
            // win must not steer selection or stopping ahead of a slow loss/draw.
            games.push(...batch);
            batch = [];
            checkpoint();
            precision = automatic ? automaticStatus(games) : null;
            report();
            if(precision?.done) break;
        }
        if(abort.signal.aborted) throw stopped();
        return { mode, games, automatic };
    } finally {
        signal?.removeEventListener('abort', stopAll);
        abort.signal.removeEventListener('abort', stopOpponent);
        opponents.forEach(opponent => opponent.stop());
    }
}
