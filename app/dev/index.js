/* Tests page loader + split-resizer. Dynamically loads tests (module or PGN string) */
import { createLifecycle } from './test-modules/lifecycle.js';
import { startHeapMonitor } from './heapMonitor.js';

startHeapMonitor();

const DEFAULT_FULL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const LEFT_MIN_PERCENT = 15;
const RIGHT_MIN_PERCENT = 15;
const STORAGE_KEY = 'acas-tests-split';

const leftPanel = document.getElementById('left-panel');
const rightPanel = document.getElementById('right-panel');
const leftContent = document.getElementById('left-content');
const splitter = document.getElementById('splitter');
const testListEl = document.getElementById('test-list');

let tests = [];
let current = null; // { destroy: fn }
let activeIndex = -1;
let loadController = null;
let batchController = null;
const runButton = document.getElementById('run-short-tests');
const stopButton = document.getElementById('stop-short-tests');
const scoreEl = document.getElementById('short-test-score');

function setSplit(percent) {
    percent = Math.max(LEFT_MIN_PERCENT, Math.min(100 - RIGHT_MIN_PERCENT, percent));
    leftPanel.style.flexBasis = percent + '%';
    rightPanel.style.flexBasis = (100 - percent) + '%';
    localStorage.setItem(STORAGE_KEY, String(percent));
}

function initSplit() {
    const stored = parseFloat(localStorage.getItem(STORAGE_KEY));
    setSplit(Number.isFinite(stored) ? stored : 50);

    let dragging = false;

    function onMove(e) {
        if (!dragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const rect = document.getElementById('tests-root').getBoundingClientRect();
        const percent = (clientX - rect.left) / rect.width * 100;
        setSplit(percent);
    }
    function onUp() {
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
    }

    splitter.addEventListener('mousedown', (e) => {
        e.preventDefault();
        dragging = true;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
    splitter.addEventListener('touchstart', (e) => {
        e.preventDefault();
        dragging = true;
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
    });

    // keyboard support
    splitter.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') setSplit(getPercent() - 3);
        if (e.key === 'ArrowRight') setSplit(getPercent() + 3);
    });
}

function getPercent() {
    const val = parseFloat(leftPanel.style.flexBasis || '50%');
    return isNaN(val) ? 50 : val;
}

async function loadTestsJson() {
    const res = await fetch('./tests.json');
    if (!res.ok) throw new Error('Failed to load tests.json');
    tests = await res.json();
}

function clearLeft() {
    loadController?.abort();
    loadController = null;
    // call destroy if present
    if (current && typeof current.destroy === 'function') {
        try { current.destroy(); } catch (e) { console.error('Error destroying test:', e); }
    }
    current = null;
    leftContent.innerHTML = '';
}

async function ensureChessgroundReady(timeoutMs=10000) {
    const start = Date.now();
    while (typeof window.ChessgroundX !== 'function') {
        if (Date.now() - start > timeoutMs) throw new Error('ChessgroundX did not load');
        await new Promise(r => setTimeout(r, 50));
    }
}

function showPlaceholder(text) {
    leftContent.innerHTML = '';
    const p = document.createElement('div');
    p.className = 'empty-placeholder';
    p.textContent = text;
    leftContent.appendChild(p);
}

async function loadTest(index, onComplete = null, scenario = null) {
    if (!tests || !tests[index]) return;
    clearLeft();
    activeIndex = index;
    renderList();
    const controller = new AbortController();
    loadController = controller;
    const { signal } = controller;
    const test = onComplete ? { ...tests[index], ...scenario, loop: false } : tests[index];
    const container = document.createElement('div');
    container.className = 'test-root';
    leftContent.appendChild(container);

    // If script provided dynamically import module
    if (test.script) {
        try {
            const mod = await import('./' + test.script);
            if (signal.aborted) return;
            const initFn = mod.init || mod.default || null;
            if (typeof initFn === 'function') {
                const instance = await initFn(container, { test, signal, onComplete });
                if (signal.aborted) {
                    instance?.destroy?.();
                    return;
                }
                current = instance || { destroy: () => { container.remove(); } };
                return;
            } else {
                showPlaceholder('Test script loaded but no init() export found');
                return;
            }
        } catch (e) {
            if (signal.aborted) return;
            console.error('Failed to load test script:', e);
            showPlaceholder('Failed to load test: ' + (e && e.message ? e.message : String(e)));
            return;
        }
    }

    // Fallback runner for simple move lists (supports FEN-based moves or PGN strings)
    try {
        await ensureChessgroundReady();
    } catch (e) {
        if (signal.aborted) return;
        showPlaceholder('Chessground not available');
        return;
    }
    if (signal.aborted) return;

    // Ensure local chess.js is available and return its constructor
    async function ensureChessLib() {
        if (typeof window.Chess === 'function') return window.Chess;
        const mod = await import('../assets/engines/libraries/chessjs/chess.js');
        const Chess = mod.Chess || mod.default;
        if (typeof Chess !== 'function') throw new Error('Invalid chess.js export');
        window.Chess = Chess;
        return Chess;
    }

    function parsePgnMoves(pgn) {
        const moves = [];
        const regex = /(\{[^}]*\})|([^\s]+)/g;
        let lastComment = '';
        let m;
        while ((m = regex.exec(pgn)) !== null) {
            if (m[1]) { lastComment = m[1].slice(1, -1).trim(); continue; }
            const token = m[2];
            if (/^\d+\.+$/.test(token)) continue;
            if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)) {
                if (lastComment && moves.length) {
                    moves[moves.length - 1].annotation = (moves[moves.length - 1].annotation ? moves[moves.length - 1].annotation + ' ' : '') + lastComment;
                }
                lastComment = '';
                continue;
            }
            moves.push({ san: token, annotation: lastComment || '' });
            lastComment = '';
        }
        return moves;
    }

    function normalizeFen(fen) {
        if (!fen) return DEFAULT_FULL_FEN;
        // If it's piece-only (no spaces), assume starting color and full default fields
        if (fen.indexOf(' ') === -1) return fen + ' w - - 0 1';
        // If it has space(s) but fewer than 6 space-separated fields, pad missing parts
        const parts = fen.trim().split(/\s+/);
        if (parts.length >= 6) return fen;
        const defaultParts = DEFAULT_FULL_FEN.split(' ');
        const padded = parts.concat(defaultParts.slice(parts.length));
        return padded.join(' ');
    }

    const info = document.createElement('div');
    info.style.cssText = 'position:relative;margin-bottom:8px;font-family:sans-serif;font-size:13px;color:var(--muted);';

    container.appendChild(info);
    const boardHolder = document.createElement('div');
    container.appendChild(boardHolder);

    const params = new URLSearchParams(window.location.search);
    // `test.playerColor` can override URL params and force the board orientation per-test
    let orientation;
    if (test && test.playerColor) {
        const oc = String(test.playerColor).toLowerCase();
        orientation = (oc === 'b' || oc === 'black') ? 'black' : 'white';
    } else {
        const orientationParam = (params.get('orientation') || params.get('o') || 'w').toLowerCase();
        orientation = orientationParam === 'b' || orientationParam === 'black' ? 'black' : 'white';
    }

    const DEFAULT_FULL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const startFen = normalizeFen(test.startFen || DEFAULT_FULL_FEN);

    if (typeof test.moves !== 'string') {
        showPlaceholder('Test moves must be a PGN string');
        console.error('Invalid test.moves type; expected string (PGN)');
        return;
    }

    let Chess;
    try {
        Chess = await ensureChessLib();
    } catch (e) {
        if (signal.aborted) return;
        console.error(e);
        showPlaceholder('Failed to load PGN parser');
        return;
    }
    if (signal.aborted) return;

    const cg = window.ChessgroundX(boardHolder, {
        fen: startFen,
        orientation,
        animation: { enabled: true, duration: 200 },
        movable: { free: true }
    });

    const parsed = parsePgnMoves(test.moves);
    const replay = new Chess(startFen); // initialize chess.js with the test start FEN

    // helper to set one square's piece in a FEN string
    function setPieceAtSquare(fen, square, pieceChar) {
        const [board, ...rest] = fen.split(' ');
        const rows = board.split('/');
        const file = square.charCodeAt(0) - 97; // a->0
        const rank = 8 - Number(square[1]); // '8'->0
        const row = rows[rank];
        const expanded = [];
        for (const ch of row) {
            if (/[1-8]/.test(ch)) {
                for (let i = 0; i < Number(ch); i++) expanded.push('.');
            } else expanded.push(ch);
        }
        expanded[file] = pieceChar;
        // compress back
        let out = '';
        let empty = 0;
        for (const c of expanded) {
            if (c === '.') empty++;
            else {
                if (empty) { out += String(empty); empty = 0; }
                out += c;
            }
        }
        if (empty) out += String(empty);
        rows[rank] = out;
        return [rows.join('/'), ...rest].join(' ');
    }

    const moves = [];
    for (const p of parsed) {
        const beforeFen = replay.fen();
        const applied = replay.move(p.san, { sloppy: true });
        if (!applied) {
            console.warn('Failed to apply SAN move while parsing PGN:', p.san);
            continue;
        }
        const afterFen = replay.fen();

        // If this move is a promotion and the test requests a promo delay, split into two frames
        if (applied.promotion) {
            // color: 'w' or 'b'
            const pieceChar = applied.color === 'w' ? 'P' : 'p';
            const intermediateFen = setPieceAtSquare(afterFen, applied.to, pieceChar);

            // determine promotion delay (test.promoDelay may be number or [min,max])
            let promoDelay = undefined;
            if (typeof test.promoDelay === 'number') promoDelay = Number(test.promoDelay) || 0;
            else if (Array.isArray(test.promoDelay) && test.promoDelay.length === 2) {
                const a = Number(test.promoDelay[0]) || 0;
                const b = Number(test.promoDelay[1]) || 0;
                const lo = Math.min(a, b), hi = Math.max(a, b);
                promoDelay = Math.floor(Math.random() * (hi - lo + 1)) + lo;
            }

            // intermediate frame: pawn at promotion square, holds for promoDelay (if set) or default
            moves.push({ fen: intermediateFen, annotation: p.annotation || '', delay: (promoDelay != null ? promoDelay : undefined) });
            // final frame: the promoted piece (afterFen)
            moves.push({ fen: afterFen, annotation: (p.annotation ? (p.annotation + ' (promoted)') : 'promoted'), delay: undefined });
        } else {
            moves.push({ fen: afterFen, annotation: p.annotation || '', delay: undefined });
        }
    }

    if (!moves.length) {
        cg.destroy();
        showPlaceholder('No valid moves found in PGN');
        return;
    }

    info.innerHTML = '<strong>' + (test.title || 'Untitled Test') + '</strong>' + (test.description ? (' - ' + test.description) : '');

    const lifecycle = createLifecycle(signal);
    const myIndex = index;
    (async () => {
        while (!lifecycle.cancelled) {
            cg.set({ fen: startFen });
            for (let j = 0; j < moves.length && !lifecycle.cancelled; j++) {
                const m = moves[j] || {};
                const fen = m.fen ? normalizeFen(m.fen) : '';
                if (onComplete && j === moves.length - 1) onComplete({ fen: replay.fen(), cg });
                if (fen) cg.set({ fen });
                if (m.annotation) info.innerHTML = '<strong>' + (test.title || 'Untitled Test') + '</strong> - ' + (m.annotation || '');
                if (onComplete && j === moves.length - 1) break;

                // delay: m.delay overrides, otherwise random from test.delayRange [min,max], default 800
                const DEFAULT_DELAY = 800;
                let delay = DEFAULT_DELAY;
                if (m.delay != null) delay = Number(m.delay) || 0;
                else if (Array.isArray(test.delayRange) && test.delayRange.length === 2) {
                    const a = Number(test.delayRange[0]) || 0;
                    const b = Number(test.delayRange[1]) || 0;
                    const lo = Math.min(a, b);
                    const hi = Math.max(a, b);
                    delay = Math.floor(Math.random() * (hi - lo + 1)) + lo;
                }

                if (onComplete && m.delay == null) delay = Math.min(delay, 100);
                if (!await lifecycle.wait(delay)) return;
            }
            if (lifecycle.cancelled) break;
            if (!test.loop) {
                info.innerHTML = '<strong>Finished:</strong> ' + (test.title || 'Untitled Test');
                break;
            } else {
                info.innerHTML = '<strong>Looping:</strong> ' + (test.title || 'Untitled Test');

                // optional loopDelay: number (ms) or [min,max]
                let loopDelay = 0;
                if (typeof test.loopDelay === 'number') loopDelay = Number(test.loopDelay) || 0;
                else if (Array.isArray(test.loopDelay) && test.loopDelay.length === 2) {
                    const a = Number(test.loopDelay[0]) || 0;
                    const b = Number(test.loopDelay[1]) || 0;
                    const lo = Math.min(a, b), hi = Math.max(a, b);
                    loopDelay = Math.floor(Math.random() * (hi - lo + 1)) + lo;
                }

                cg.set({ fen: startFen });
                if (!await lifecycle.wait(loopDelay)) return;
            }
        }
        if (!lifecycle.cancelled) {
            // test finished naturally; clear active highlight
            activeIndex = -1;
            renderList();
        }
    })().catch(error => {
        console.error('PGN replay failed:', error);
        info.textContent = 'PGN replay failed: ' + error.message;
    });

    current = {
        destroy() {
            lifecycle.cancel();
            try { if (cg && typeof cg.destroy === 'function') cg.destroy(); } catch (e) { console.error(e); }
            boardHolder.remove();
            info.remove();
            if (activeIndex === myIndex) {
                activeIndex = -1;
                renderList();
            }
        }
    };
}

function renderList() {
    testListEl.innerHTML = '';
    tests.forEach((t, i) => {
        const li = document.createElement('li');
        li.className = 'test-list-row';
        const btn = document.createElement('button');
        btn.className = 'test-btn acas-fancy-button';
        btn.setAttribute('aria-pressed', String(i === activeIndex));
        btn.addEventListener('click', () => {
            batchController?.abort();
            loadTest(i);
        });

        const left = document.createElement('div');
        const title = document.createElement('div'); title.className = 'test-title'; title.textContent = t.title || 'Untitled';
        if (t.type === 'live') {
            const badge = document.createElement('span'); badge.className = 'live-badge'; badge.textContent = 'LIVE';
            title.appendChild(badge);
        }
        const desc = document.createElement('div'); desc.className = 'test-desc'; desc.textContent = t.description || '';
        left.appendChild(title); left.appendChild(desc);

        const actions = document.createElement('div'); actions.className = 'test-actions';

        if(!t.hideLoopBtn && !t.script) {
            const loopBtn = document.createElement('button'); loopBtn.className = 'small acas-fancy-button loop-toggle'; loopBtn.textContent = 'Loop';
            loopBtn.setAttribute('aria-pressed', t.loop ? 'true' : 'false');
            loopBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                t.loop = !t.loop;
                loopBtn.setAttribute('aria-pressed', t.loop ? 'true' : 'false');
            });
            actions.appendChild(loopBtn);
        }

        btn.appendChild(left);
        li.appendChild(btn);
        if (actions.childElementCount) li.appendChild(actions);
        testListEl.appendChild(li);
    });
}

async function init() {
    initSplit();
    try {
        await loadTestsJson();
        renderList();
        if (new URL(location.href).searchParams.has('liveResume')) {
            const { resumeLiveRun } = await import('./test-modules/live.js');
            if (resumeLiveRun()) {
                const liveIndex = tests.findIndex(test => test.type === 'live');
                if (liveIndex === -1) throw new Error('Live test is unavailable');
                await loadTest(liveIndex);
                return;
            }
        }
        // do not auto-start first test; user must click to start
        if (tests.length) showPlaceholder('Select a test to run');
        else showPlaceholder('No tests');
    } catch (e) {
        console.error(e);
        showPlaceholder('Failed to load tests');
    }
}

window.addEventListener('pagehide', () => {
    batchController?.abort();
    clearLeft();
});

init();

stopButton.addEventListener('click', () => {
    batchController?.abort();
    clearLeft();
});

runButton.addEventListener('click', async () => {
    const controller = new AbortController();
    batchController = controller;
    const { signal } = controller;
    runButton.disabled = true;
    stopButton.disabled = false;
    scoreEl.classList.add('is-running');
    const results = [];
    const selected = tests.flatMap((test, index) => test.automatic
        ? (test.scenarios || [{}]).map((scenario, variant) => ({
            test: { ...test, title: `${test.title} ${variant + 1}` }, index, scenario
        })) : []);
    try {
        for (const { test, index, scenario } of selected) {
            if (signal.aborted) break;
            scoreEl.textContent = `${results.length + 1}/${selected.length} - ${test.title}`;
            const final = await new Promise((resolve, reject) => {
                const finish = value => {
                    clearTimeout(timer);
                    signal.removeEventListener('abort', cancel);
                    resolve(value);
                };
                const cancel = () => finish(null);
                const timer = setTimeout(() => finish(null), 30000);
                signal.addEventListener('abort', cancel, { once: true });
                loadTest(index, finish, scenario).catch(error => {
                    clearTimeout(timer);
                    signal.removeEventListener('abort', cancel);
                    reject(error);
                });
            });
            if (signal.aborted) break;
            let outcome = 'Test timed out';
            let responseMs = null;
            if (final?.error) {
                outcome = 'Scenario error';
            } else if (final) {
                const game = new window.Chess(final.fen);
                if (game.in_check() || game.game_over()) {
                    outcome = 'Skipped';
                } else {
                    const legal = game.moves({ verbose: true });
                    const started = performance.now();
                    outcome = await new Promise(resolve => {
                        const finish = value => {
                            clearTimeout(timer);
                            clearInterval(countdown);
                            window.removeEventListener('message', onMessage);
                            signal.removeEventListener('abort', cancel);
                            resolve(value);
                        };
                        const cancel = () => finish('Cancelled');
                        const onMessage = event => {
                            if (event.source !== window || event.data?.name !== 'bestMoveArr') return;
                            const squares = event.data.value;
                            if (Array.isArray(squares) && squares.length === 2
                                && legal.some(move => move.from === squares[0] && move.to === squares[1])) {
                                responseMs = performance.now() - started;
                                finish('Pass');
                            }
                        };
                        const showWaiting = () => {
                            const remaining = Math.max(0, Math.ceil((3000 - (performance.now() - started)) / 1000));
                            scoreEl.textContent = `${results.length + 1}/${selected.length} - ${test.title} - Waiting ${remaining}s`;
                        };
                        const timer = setTimeout(() => finish('No reply'), 3000);
                        const countdown = setInterval(showWaiting, 250);
                        showWaiting();
                        window.addEventListener('message', onMessage);
                        signal.addEventListener('abort', cancel, { once: true });
                        final.cg.set({ orientation: game.turn() === 'w' ? 'white' : 'black' });
                    });
                }
            }
            if (signal.aborted) break;
            results.push({ title: test.title, outcome, responseMs });
            scoreEl.replaceChildren();
            const eligible = results.filter(result => !result.outcome.startsWith('Skipped'));
            const summary = document.createElement('p');
            summary.textContent = `Score: ${eligible.filter(result => result.outcome === 'Pass').length}/${eligible.length}`;
            scoreEl.appendChild(summary);
            for (const result of results) {
                const row = document.createElement('div');
                row.className = 'test-desc';
                row.textContent = `${result.title}: ${result.outcome}${result.responseMs !== null ? ` (${Math.round(result.responseMs)} ms)` : ''}`;
                scoreEl.appendChild(row);
            }
        }
        if (signal.aborted) scoreEl.append(' - Stopped');
    } catch (error) {
        console.error('Short stress run failed:', error);
        scoreEl.textContent = 'Short stress run failed: ' + error.message;
    } finally {
        if (batchController === controller) batchController = null;
        runButton.disabled = false;
        stopButton.disabled = true;
        scoreEl.classList.remove('is-running');
    }
});