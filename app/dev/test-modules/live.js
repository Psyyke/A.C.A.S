import { subscribeHeapSamples } from '../heapMonitor.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const STORAGE_KEY = 'acas-dev-live-stockfish18-v1';
const ENGINE_NAME = 'Stockfish 18 single lite';
const DEFAULT_MOVE_TIME_MS = 500;
const MAX_MOVE_TIME_MS = 60000;
const ACAS_TIMEOUT_MS = 120000;
export const liveStatistics = { version: 1, games: [], active: null, runs: [] };
let resumedTest = null;

export function resumeLiveRun() {
    const url = new URL(location.href);
    const token = url.searchParams.get('liveResume');
    if (!token) return false;
    url.searchParams.delete('liveResume');
    history.replaceState(null, '', url);
    const key = `acas-dev-live-resume-${token}`;
    const raw = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    if (!raw) throw new Error('Live run checkpoint is missing');
    const checkpoint = JSON.parse(raw);
    if (checkpoint.stats?.version !== 1 || !Array.isArray(checkpoint.stats.games)
        || !Array.isArray(checkpoint.stats.runs) || !checkpoint.test)
        throw new Error('Invalid live run checkpoint');
    Object.assign(liveStatistics, checkpoint.stats);
    resumedTest = checkpoint.test;
    return true;
}

export async function init(container, { test, signal }) {
    if (resumedTest) {
        test = { ...test, ...resumedTest };
        resumedTest = null;
    }
    const mod = typeof window.Chess === 'function' ? null
        : await import('../../assets/engines/libraries/chessjs/chess.js');
    const Chess = window.Chess || mod.Chess || mod.default;
    const start = performance.now();
    while (typeof window.ChessgroundX !== 'function') {
        if (signal?.aborted) return;
        if (performance.now() - start > 5000) throw new Error('ChessgroundX not available');
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (signal?.aborted) return;

    container.classList.add('live-test-root');
    container.innerHTML = `
        <div class="live-layout">
            <div class="cg-wrap live-board"></div>
            <section class="live-panel">
                <div class="live-status">
                    <div class="live-turn" role="status" aria-label="Turn">
                        <span data-side="acas">A.C.A.S</span>
                        <span data-side="stockfish">Stockfish</span>
                    </div>
                    <div class="live-controls">
                        <button class="small acas-fancy-button live-pause">Pause</button>
                        <button class="small acas-fancy-button live-new">New game</button>
                        <button class="small acas-fancy-button live-export">Export JSON</button>
                    </div>
                    <div class="live-status-message" role="status">Playing</div>
                </div>
                <div class="live-storage-error" role="alert"></div>
                <div class="live-controls">
                    <div class="checkbox-container live-checkbox">
                        <input class="live-auto" type="checkbox" aria-labelledby="live-auto-label">
                        <div class="checkbox-fill" aria-hidden="true">&#10003;</div>
                    </div>
                    <span id="live-auto-label">Restart completed games</span>
                </div>
                <div class="live-speed">
                    <span id="live-speed-label">Stockfish move time (ms)</span>
                    <input class="live-move-time" type="number" min="1" max="${MAX_MOVE_TIME_MS}" step="1" value="${DEFAULT_MOVE_TIME_MS}" aria-labelledby="live-speed-label" aria-describedby="live-speed-help live-speed-error">
                </div>
                <p id="live-speed-help">Applies to the next search. Higher values give Stockfish more thinking time.</p>
                <div id="live-speed-error" class="live-settings-error" role="alert"></div>
                <div class="live-stats"></div>
                <h4>Recent games</h4>
                <div class="live-history"></div>
            </section>
        </div>`;
    const status = container.querySelector('.live-status-message');
    const turnIndicator = container.querySelector('.live-turn');
    const storageError = container.querySelector('.live-storage-error');
    const statsEl = container.querySelector('.live-stats');
    const historyEl = container.querySelector('.live-history');
    const pauseButton = container.querySelector('.live-pause');
    const autoInput = container.querySelector('.live-auto');
    const moveTimeInput = container.querySelector('.live-move-time');
    const settingsError = container.querySelector('.live-settings-error');
    autoInput.checked = Boolean(test.autoRestartOnEnd);

    const saved = liveStatistics;
    let moveTimeMs = DEFAULT_MOVE_TIME_MS;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            const preference = parsed.settings?.moveTimeMs ?? DEFAULT_MOVE_TIME_MS;
            if (!Number.isInteger(preference)
                || preference < 1 || preference > MAX_MOVE_TIME_MS)
                throw new Error('Invalid saved Stockfish speed');
            moveTimeMs = preference;
            if (parsed.games || parsed.runs || parsed.active) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: { moveTimeMs } }));
            }
        }
    } catch (error) {
        console.error('Unable to load Stockfish speed:', error);
        storageError.textContent = 'Saved speed could not be loaded. Using 500 ms. Statistics reset on refresh.';
    }
    saved.settings = { moveTimeMs };
    moveTimeInput.value = moveTimeMs;
    if (saved.active) {
        saved.active.status = 'interrupted';
        saved.active.endedAt = new Date().toISOString();
        saved.games.push(saved.active);
        saved.active = null;
    }

    let game = new Chess(test.startFen && test.startFen !== 'start' ? test.startFen : START_FEN);
    let playerColor = test.randomizeStartingPlayer
        ? (Math.random() < 0.5 ? 'white' : 'black')
        : (test.playerColor === 'black' ? 'black' : 'white');
    let destroyed = false;
    let paused = Boolean(test.paused);
    pauseButton.textContent = paused ? 'Resume' : 'Pause';
    let finished = false;
    let failed = false;
    let worker = null;
    let ready = false;
    let pending = null;
    let engineTimer = null;
    let restartTimer = null;
    let turnStarted = performance.now();
    let turnElapsed = 0;
    let generation = 0;
    let acasTimer = null;
    let failureStreak = test.failureStreak || 0;
    const runStarted = performance.now();
    const run = { startedAt: new Date().toISOString(), acasTimeoutMs: ACAS_TIMEOUT_MS, samples: [] };
    saved.runs ??= [];
    saved.runs.push(run);
    let unsubscribeHeap = null;
    let currentHeapSample = null;
    function sampleDiagnostics(sample) {
        if (sample !== currentHeapSample) {
            currentHeapSample = sample;
            run.samples.push({ ...sample, elapsedMs: performance.now() - runStarted });
        } else {
            run.samples.at(-1).gui = sample.gui;
        }
        renderStats();
    }

    function renderStats() {
        const records = [...saved.games, ...(saved.active ? [saved.active] : [])];
        const completed = saved.games.filter(record => record.status === 'completed');
        const moves = records.flatMap(record => record.moves);
        const average = list => list.length
            ? (list.reduce((total, move) => total + move.timeMs, 0) / list.length / 1000).toFixed(3) + ' s'
            : '-';
        const rows = [
            ['Games started', records.length],
            ['Games completed', completed.length],
            ['A.C.A.S wins', completed.filter(record => record.winner === 'acas').length],
            ['Stockfish wins', completed.filter(record => record.winner === 'stockfish').length],
            ['White wins', completed.filter(record => record.result === '1-0').length],
            ['Black wins', completed.filter(record => record.result === '0-1').length],
            ['Draws', completed.filter(record => record.result === '1/2-1/2').length],
            ['Failed games', saved.games.filter(record => record.status === 'failed').length],
            ['A.C.A.S stalls', saved.games.filter(record => record.failure?.side === 'acas').length],
            ['Opponent failures', saved.games.filter(record => record.failure?.side === 'stockfish').length],
            ['Interrupted / abandoned', saved.games.filter(record => ['interrupted', 'abandoned'].includes(record.status)).length],
            ['Current run', ((performance.now() - runStarted
                + saved.runs.filter(previous => previous !== run).reduce((total, previous) => total + (previous.elapsedMs || 0), 0)) / 60000).toFixed(1) + ' min'],
            ['Moves (plies)', moves.length],
            ['Average move time', average(moves)],
            ['A.C.A.S average', average(moves.filter(move => move.side === 'acas'))],
            ['Stockfish average', average(moves.filter(move => move.side === 'stockfish'))],
            ['Average completed game', completed.length
                ? (completed.reduce((total, record) => total + record.durationMs, 0) / completed.length / 1000).toFixed(1) + ' s'
                : '-']
        ];
        statsEl.replaceChildren();
        for (const [label, value] of rows) {
            const row = document.createElement('div');
            row.className = 'live-stats-row';
            const name = document.createElement('span');
            name.textContent = label;
            const count = document.createElement('strong');
            count.textContent = value;
            row.append(name, count);
            statsEl.appendChild(row);
        }
        historyEl.replaceChildren();
        for (const record of saved.games.slice(-20).reverse()) {
            const row = document.createElement('div');
            row.textContent = `${record.result || '*'} / ${record.winner === 'acas' ? 'A.C.A.S' : record.winner === 'stockfish' ? 'Stockfish' : record.status === 'completed' ? 'Draw' : record.status} / ${record.reason || record.status} / A.C.A.S ${record.playerColor} / ${record.moves.length} plies`;
            historyEl.appendChild(row);
        }
    }

    function isEngineTurn() {
        return game.turn() !== (playerColor === 'white' ? 'w' : 'b');
    }

    function syncBoard() {
        const activeSide = paused || finished || failed ? '' : isEngineTurn() ? 'stockfish' : 'acas';
        if (turnIndicator.dataset.turn !== activeSide) {
            turnIndicator.dataset.turn = activeSide;
            turnIndicator.setAttribute('aria-label', activeSide
                ? `${activeSide === 'acas' ? 'A.C.A.S' : 'Stockfish'} to move` : 'No active turn');
        }
        const dests = new Map();
        if (!paused && !finished && !failed && !isEngineTurn()) {
            for (const move of game.moves({ verbose: true })) {
                if (!dests.has(move.from)) dests.set(move.from, []);
                dests.get(move.from).push(move.to);
            }
        }
        cg.set({
            fen: game.fen(),
            turnColor: game.turn() === 'w' ? 'white' : 'black',
            orientation: playerColor,
            movable: { color: playerColor, dests },
            lastMove: saved.active?.moves.length
                ? [saved.active.moves.at(-1).from, saved.active.moves.at(-1).to] : undefined
        });
    }

    const cg = window.ChessgroundX(container.querySelector('.live-board'), {
        fen: game.fen(),
        orientation: playerColor,
        animation: { enabled: true, duration: 220 },
        movable: { free: false, color: playerColor, dests: new Map() },
        premovable: { enabled: false },
        events: {
            move(from, to) {
                applyMove(from + to, 'acas');
                syncBoard();
            }
        }
    });

    function stopWorker() {
        clearTimeout(engineTimer);
        engineTimer = null;
        pending = null;
        ready = false;
        if (worker) {
            worker.onmessage = null;
            worker.onerror = null;
            worker.terminate();
        }
        worker = null;
    }

    function fail(message, error, side = 'stockfish') {
        if (destroyed || failed || finished) return;
        console.error(message, error || '');
        failed = true;
        failureStreak++;
        clearTimeout(acasTimer);
        acasTimer = null;
        clearTimeout(restartTimer);
        restartTimer = null;
        if (saved.active) {
            saved.active.failure = {
                side, message, waitedMs: turnElapsed + performance.now() - turnStarted,
                fen: game.fen(), at: new Date().toISOString()
            };
        }
        stopWorker();
        closeRecord('failed', message);
        status.textContent = message;
        syncBoard();
        scheduleRestart();
    }

    function sendEngine(message) {
        try {
            worker.postMessage(message);
            return true;
        } catch (error) {
            fail('Stockfish command transport failed.', error);
            return false;
        }
    }

    function watchAcasTurn() {
        if (acasTimer !== null || destroyed || paused || failed || finished || isEngineTurn()) return;
        const remaining = Math.max(0, ACAS_TIMEOUT_MS - turnElapsed - (performance.now() - turnStarted));
        acasTimer = setTimeout(() => {
            acasTimer = null;
            if (!destroyed && !paused && !failed && !finished && !isEngineTurn()) {
                fail('A.C.A.S stalled: no accepted move for 2 minutes.', null, 'acas');
            }
        }, remaining);
    }

    function armEngineTimeout(message, delay) {
        clearTimeout(engineTimer);
        engineTimer = setTimeout(() => fail(message), delay);
    }

    function prepareEngine() {
        ready = false;
        if (!sendEngine('ucinewgame') || !sendEngine('isready')) return;
        armEngineTimeout('Stockfish readiness timed out.', 30000);
    }

    function loadEngine() {
        stopWorker();
        try {
            const instance = new Worker(new URL('../../assets/engines/stockfish-18-lite-single/stockfish-18-lite-single.js', import.meta.url));
            let initialized = false;
            worker = instance;
            instance.onerror = error => {
                if (worker === instance) fail('Stockfish worker failed.', error);
            };
            instance.onmessage = event => {
                if (destroyed || worker !== instance || typeof event.data !== 'string') return;
                for (const line of event.data.split(/\r?\n/)) {
                    if (line.trim() === 'uciok' && !initialized) {
                        initialized = true;
                        if (!sendEngine('setoption name Hash value 16')
                            || !sendEngine('setoption name Threads value 1')) return;
                        prepareEngine();
                    } else if (line.trim() === 'readyok' && !ready) {
                        clearTimeout(engineTimer);
                        ready = true;
                        advance();
                    } else if (line.startsWith('bestmove ') && pending) {
                        const search = pending;
                        pending = null;
                        clearTimeout(engineTimer);
                        if (search.generation !== generation || search.fen !== game.fen()
                            || paused || finished || !isEngineTurn()) continue;
                        const move = line.trim().split(/\s+/)[1];
                        if (!applyMove(move, 'stockfish', search.moveTimeMs)) fail(`Stockfish returned an illegal move: ${move}`);
                    }
                }
            };
            if (!sendEngine('uci')) return;
            armEngineTimeout('Stockfish startup timed out.', 30000);
        } catch (error) {
            fail('Stockfish could not start.', error);
        }
    }

    function beginRecord() {
        const now = new Date().toISOString();
        saved.active = {
            startedAt: now, playerColor, engine: ENGINE_NAME, moveTimeMs,
            startFen: game.fen(), status: 'playing', moves: [], pgn: game.pgn(),
            durationMs: 0, acasTimeoutMs: ACAS_TIMEOUT_MS
        };
        turnStarted = performance.now();
        turnElapsed = 0;
        renderStats();
    }

    function closeRecord(recordStatus, reason, result = '*', winner = null) {
        if (!saved.active) return;
        Object.assign(saved.active, {
            status: recordStatus, reason, result, winner,
            endedAt: new Date().toISOString(), finalFen: game.fen(), pgn: game.pgn()
        });
        saved.games.push(saved.active);
        saved.active = null;
        renderStats();
    }

    function scheduleRestart() {
        if (destroyed || paused || (!failed && (!finished || !autoInput.checked)) || restartTimer !== null) return;
        const delay = failed ? Math.min(30000, 5000 * 2 ** Math.min(failureStreak - 1, 3)) : 1500;
        if (failed) status.textContent += ` Restarting in ${delay / 1000} s.`;
        restartTimer = setTimeout(() => {
            restartTimer = null;
            if (!destroyed && !paused && (failed || (finished && autoInput.checked))) newGame();
        }, delay);
    }

    function advance() {
        if (destroyed || paused || failed || finished) return;
        if (game.game_over()) {
            finished = true;
            clearTimeout(acasTimer);
            acasTimer = null;
            const mate = game.in_checkmate();
            const winner = mate ? (isEngineTurn() ? 'acas' : 'stockfish') : null;
            const result = mate ? (game.turn() === 'w' ? '0-1' : '1-0') : '1/2-1/2';
            const reason = mate ? 'Checkmate' : game.in_stalemate() ? 'Stalemate'
                : game.in_threefold_repetition() ? 'Threefold repetition'
                : game.insufficient_material() ? 'Insufficient material' : 'Fifty-move rule';
            game.header('Result', result);
            closeRecord('completed', reason, result, winner);
            status.textContent = `${result} / ${reason}${winner ? ' / ' + (winner === 'acas' ? 'A.C.A.S' : 'Stockfish') + ' wins' : ''}`;
            syncBoard();
            scheduleRestart();
            return;
        }
        syncBoard();
        if (!isEngineTurn()) {
            status.textContent = 'Playing';
            watchAcasTurn();
            return;
        }
        status.textContent = 'Playing';
        if (!ready || pending) return;
        pending = { generation, fen: game.fen(), moveTimeMs };
        // History is needed for repetition handling, not just the current FEN.
        const moves = game.history({ verbose: true }).map(move => move.from + move.to + (move.promotion || ''));
        if (!sendEngine(`position fen ${saved.active.startFen}${moves.length ? ' moves ' + moves.join(' ') : ''}`)
            || !sendEngine(`go movetime ${pending.moveTimeMs}`)) return;
        armEngineTimeout('Stockfish did not return a move.', Math.max(15000, pending.moveTimeMs + 10000));
    }

    function applyMove(uci, side, searchMoveTimeMs = null) {
        if (destroyed || paused || failed || finished || (side === 'stockfish') !== isEngineTurn()) return false;
        if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
            console.warn('Invalid live move format:', uci);
            return false;
        }
        const from = uci.slice(0, 2), to = uci.slice(2, 4);
        const legal = game.moves({ verbose: true }).find(move =>
            move.from === from && move.to === to
            && (!move.promotion || move.promotion === (uci[4] || 'q')));
        if (!legal) {
            console.warn('Ignoring illegal or stale live move:', uci, game.fen());
            return false;
        }
        const now = performance.now();
        clearTimeout(acasTimer);
        acasTimer = null;
        failureStreak = 0;
        const timeMs = turnElapsed + now - turnStarted;
        const move = game.move(legal);
        saved.active.moves.push({
            side, color: move.color, from, to, promotion: move.promotion || null,
            san: move.san, uci: from + to + (move.promotion || ''), timeMs,
            searchMoveTimeMs,
            playedAt: new Date().toISOString(), fen: game.fen()
        });
        saved.active.durationMs += timeMs;
        saved.active.pgn = game.pgn();
        turnStarted = now;
        turnElapsed = 0;
        renderStats();
        advance();
        return true;
    }

    function onSuggestion(event) {
        if (event.source !== window || event.data?.name !== 'bestMoveArr') return;
        const value = event.data.value;
        if (!Array.isArray(value) || value.length !== 2 || !value.every(square => typeof square === 'string')) {
            if (value != null) console.warn('Invalid A.C.A.S live suggestion:', value);
            return;
        }
        applyMove(value.join(''), 'acas');
    }

    function newGame() {
        if (destroyed) return;
        clearTimeout(restartTimer);
        restartTimer = null;
        clearTimeout(acasTimer);
        acasTimer = null;
        const reload = Boolean(pending) || failed || !worker || !ready;
        closeRecord('abandoned', 'New game requested');
        if (test.reloadEachMatch !== false) {
            const token = crypto.randomUUID();
            const key = `acas-dev-live-resume-${token}`;
            try {
                run.endedAt = new Date().toISOString();
                run.elapsedMs = performance.now() - runStarted;
                sessionStorage.setItem(key, JSON.stringify({
                    stats: saved,
                    test: {
                        ...test, playerColor: playerColor === 'white' ? 'black' : 'white',
                        randomizeStartingPlayer: false, autoRestartOnEnd: autoInput.checked,
                        failureStreak, paused
                    }
                }));
            } catch (error) {
                console.error('Live run checkpoint could not be saved:', error);
                failed = true;
                stopWorker();
                status.textContent = 'Cannot save run checkpoint. Refresh to start a new run.';
                syncBoard();
                return;
            }
            const url = new URL(location.href);
            url.searchParams.set('liveResume', token);
            destroy();
            location.replace(url.href);
            return;
        }
        generation++;
        game = new Chess(test.startFen && test.startFen !== 'start' ? test.startFen : START_FEN);
        playerColor = playerColor === 'white' ? 'black' : 'white';
        finished = false;
        failed = false;
        beginRecord();
        syncBoard();
        if (!paused) {
            if (reload) loadEngine();
            else prepareEngine();
        }
        if (paused) status.textContent = 'Paused';
        else advance();
    }

    pauseButton.addEventListener('click', () => {
        if (destroyed) return;
        paused = !paused;
        pauseButton.textContent = paused ? 'Resume' : 'Pause';
        if (paused) {
            if (!failed && !finished) turnElapsed += performance.now() - turnStarted;
            clearTimeout(acasTimer);
            acasTimer = null;
            clearTimeout(restartTimer);
            restartTimer = null;
            stopWorker();
            status.textContent = 'Paused';
            syncBoard();
        } else {
            turnStarted = performance.now();
            if (finished || failed) {
                status.textContent = failed ? 'Failed game.' : 'Game finished';
                scheduleRestart();
            } else {
                loadEngine();
                advance();
            }
        }
    });
    autoInput.addEventListener('change', () => {
        if (autoInput.checked) scheduleRestart();
        else if (!failed) {
            clearTimeout(restartTimer);
            restartTimer = null;
        }
    });
    moveTimeInput.addEventListener('change', () => {
        const value = moveTimeInput.valueAsNumber;
        if (!Number.isInteger(value) || value < 1 || value > MAX_MOVE_TIME_MS) {
            const message = `Enter a whole number from 1 to ${MAX_MOVE_TIME_MS} ms.`;
            moveTimeInput.setCustomValidity(message);
            settingsError.textContent = message;
            console.warn('Invalid Stockfish move time:', moveTimeInput.value);
            return;
        }
        moveTimeInput.setCustomValidity('');
        settingsError.textContent = '';
        moveTimeMs = value;
        saved.settings = { moveTimeMs };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: saved.settings }));
            storageError.textContent = '';
        } catch (error) {
            console.error('Unable to save Stockfish speed:', error);
            storageError.textContent = 'Speed could not be saved. It still applies until refresh.';
        }
    });
    container.querySelector('.live-new').addEventListener('click', newGame);
    container.querySelector('.live-export').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify({
            ...saved, run: { ...run, elapsedMs: performance.now() - runStarted },
            exportedAt: new Date().toISOString(),
            memoryScope: 'Optional Chromium JS heap samples from the dev page and responding same-origin A.C.A.S GUI tabs. Not total browser or worker memory, and not a leak diagnosis.',
            timing: 'Turn-to-move wall time, excluding pauses. A.C.A.S includes bridge and manual input delay. Game duration sums played move times.'
        }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'acas-live-stockfish18-stats.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    });

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        clearTimeout(restartTimer);
        clearTimeout(acasTimer);
        unsubscribeHeap?.();
        run.endedAt = new Date().toISOString();
        run.elapsedMs = performance.now() - runStarted;
        stopWorker();
        window.removeEventListener('message', onSuggestion);
        signal?.removeEventListener('abort', destroy);
        closeRecord('interrupted', 'Live test closed');
        cg.destroy();
        container.remove();
    }

    signal?.addEventListener('abort', destroy, { once: true });
    window.addEventListener('message', onSuggestion);
    beginRecord();
    unsubscribeHeap = subscribeHeapSamples(sampleDiagnostics);
    if (!paused) loadEngine();
    else {
        status.textContent = 'Paused';
        syncBoard();
    }
    advance();
    return { destroy };
}
