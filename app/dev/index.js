/* Tests page loader + split-resizer. Dynamically loads tests (module or PGN string) */

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

async function loadTest(index) {
    if (!tests || !tests[index]) return;
    activeIndex = index;
    renderList();

    clearLeft();
    const test = tests[index];
    const container = document.createElement('div');
    container.className = 'test-root';
    leftContent.appendChild(container);

    // If script provided dynamically import module
    if (test.script) {
        try {
            const mod = await import('./' + test.script);
            const initFn = mod.init || mod.default || null;
            if (typeof initFn === 'function') {
                const instance = await initFn(container, { test });
                current = instance || { destroy: () => { container.remove(); } };
                return;
            } else {
                showPlaceholder('Test script loaded but no init() export found');
                return;
            }
        } catch (e) {
            console.error('Failed to load test script:', e);
            showPlaceholder('Failed to load test: ' + (e && e.message ? e.message : String(e)));
            return;
        }
    }

    // Fallback runner for simple move lists (supports FEN-based moves or PGN strings)
    try {
        await ensureChessgroundReady();
    } catch (e) {
        showPlaceholder('Chessground not available');
        return;
    }

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

    const cg = window.ChessgroundX(boardHolder, {
        fen: startFen,
        orientation,
        animation: { enabled: true, duration: 200 },
        movable: { free: true }
    });
    
    if (typeof test.moves !== 'string') {
        showPlaceholder('Test moves must be a PGN string');
        console.error('Invalid test.moves type; expected string (PGN)');
        return;
    }

    let Chess;
    try {
        Chess = await ensureChessLib();
    } catch (e) {
        console.error(e);
        showPlaceholder('Failed to load PGN parser');
        return;
    }

    const parsed = parsePgnMoves(test.moves);
    const replay = new Chess(startFen); // initialize chess.js with the test start FEN

    // helper to set one square's piece in a FEN string
    function setPieceAtSquare(fen, square, pieceChar) {
        const [board, rest] = fen.split(' ', 2);
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
        return rows.join('/') + (rest ? (' ' + rest) : '');
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
        showPlaceholder('No valid moves found in PGN');
        return;
    }

    info.innerHTML = '<strong>' + (test.title || 'Untitled Test') + '</strong>' + (test.description ? (' — ' + test.description) : '');

    let cancelled = false;
    const myIndex = index;
    (async () => {
        while (!cancelled) {
            for (let j = 0; j < moves.length && !cancelled; j++) {
                const m = moves[j] || {};
                const fen = m.fen ? normalizeFen(m.fen) : '';
                if (fen) cg.set({ fen });
                if (m.annotation) info.innerHTML = '<strong>' + (test.title || 'Untitled Test') + '</strong> — ' + (m.annotation || '');

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

                await new Promise(r => setTimeout(r, delay));
            }
            if (cancelled) break;
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

                if (loopDelay) await new Promise(r => setTimeout(r, loopDelay));
            }
        }
        if (!cancelled) {
            // test finished naturally; clear active highlight
            activeIndex = -1;
            renderList();
        }
    })();

    current = {
        destroy() {
            cancelled = true;
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
        const btn = document.createElement('button');
        btn.className = 'test-btn';
        if (i === activeIndex) btn.style.outline = '1px solid #888';
        btn.addEventListener('click', () => loadTest(i));

        const left = document.createElement('div');
        const title = document.createElement('div'); title.className = 'test-title'; title.textContent = t.title || 'Untitled';
        if (t.type === 'live') {
            const badge = document.createElement('span'); badge.className = 'live-badge'; badge.textContent = 'LIVE';
            title.appendChild(badge);
        }
        const desc = document.createElement('div'); desc.className = 'test-desc'; desc.textContent = t.description || '';
        left.appendChild(title); left.appendChild(desc);

        const actions = document.createElement('div'); actions.className = 'test-actions';

        if(!t.hideLoopBtn) {
            const loopBtn = document.createElement('button'); loopBtn.className = 'small loop-toggle'; loopBtn.textContent = 'Loop';
            if (t.loop) loopBtn.style.outline = '2px solid lime';
            loopBtn.setAttribute('aria-pressed', t.loop ? 'true' : 'false');
            loopBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                t.loop = !t.loop;
                loopBtn.setAttribute('aria-pressed', t.loop ? 'true' : 'false');
                loopBtn.style.outline = t.loop ? '2px solid lime' : '';
            });
            actions.appendChild(loopBtn);
        }

        btn.appendChild(left);
        btn.appendChild(actions);
        li.appendChild(btn);
        testListEl.appendChild(li);
    });
}

async function init() {
    initSplit();
    try {
        await loadTestsJson();
        renderList();
        // do not auto-start first test; user must click to start
        if (tests.length) showPlaceholder('Select a test to run');
        else showPlaceholder('No tests');
    } catch (e) {
        console.error(e);
        showPlaceholder('Failed to load tests');
    }
}

init();