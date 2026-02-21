// Scripted takeback test
// Exports: async function init(container, { test }) -> returns { destroy() }
export async function init(container, { test } = {}) {
    // Ensure chess.js is available
    let Chess;
    try {
        const mod = await import('../../assets/engines/libraries/chessjs/chess.js');
        Chess = mod.Chess || mod.default;
    } catch (e) {
        container.textContent = 'Failed to load chess.js';
        throw e;
    }

    const startFen = (test && test.startFen) ? (test.startFen.indexOf(' ') === -1 ? test.startFen + ' w - - 0 1' : test.startFen) : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    const info = document.createElement('div');
    info.className = 'test-info';
    container.appendChild(info);

    const boardHolder = document.createElement('div');
    container.appendChild(boardHolder);

    const cg = window.ChessgroundX(boardHolder, {
        fen: startFen,
        orientation: (test && test.playerColor && (String(test.playerColor).toLowerCase() === 'black' || String(test.playerColor).toLowerCase() === 'b')) ? 'black' : 'white',
        animation: { enabled: true, duration: 200 },
        movable: { free: false }
    });

    const replay = new Chess(startFen);

    let cancelled = false;
    const timers = new Set();
    function wait(ms) {
        return new Promise(resolve => {
            const t = setTimeout(() => { timers.delete(t); resolve(); }, ms);
            timers.add(t);
        });
    }

    const delay = test && test.initialDelay != null ? test.initialDelay : 1000;

    async function run() {
        info.textContent = 'Starting takeback demo';

        const actions = [
            { type: 'move', san: 'e4', text: 'White: e4' },
            { type: 'move', san: 'e5', text: 'Black: e5' },
            { type: 'undo', text: 'Takeback: black move undone' },
            { type: 'move', san: 'c5', text: 'Black: c5 (different reply)' },
            { type: 'move', san: 'Nf3', text: 'White: Nf3' },
            { type: 'undo', text: 'Takeback: white move undone' },
            { type: 'move', san: 'Nf3', text: 'White: Nf3 #2' }
        ];

        for (const a of actions) {
            if (cancelled) return;

            if (a.type === 'move') {
                // apply SAN move; allow sloppy parsing for robustness
                const applied = replay.move(a.san, { sloppy: true });
                if (!applied) {
                    console.warn('Failed to apply move:', a.san);
                }
            } else if (a.type === 'undo') {
                replay.undo();
            }

            cg.set({ fen: replay.fen() });
            info.textContent = a.text || '';

            await wait(typeof a.delay === 'number' ? a.delay : delay);
        }
    }

    run();

    return {
        destroy() {
            cancelled = true;
            for (const t of Array.from(timers)) clearTimeout(t);
            try { if (cg && typeof cg.destroy === 'function') cg.destroy(); } catch (e) { /* ignore */ }
            boardHolder.remove();
            info.remove();
        }
    };
}
