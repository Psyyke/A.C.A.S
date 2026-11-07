// Scripted takeback test
// Exports: async function init(container, { test }) -> returns { destroy() }
import { createLifecycle } from './lifecycle.js';

export async function init(container, { test, signal } = {}) {
    // Ensure chess.js is available
    let Chess;
    try {
        const mod = await import('../../assets/engines/libraries/chessjs/chess.js');
        Chess = mod.Chess || mod.default;
    } catch (e) {
        container.textContent = 'Failed to load chess.js';
        throw e;
    }
    if (signal?.aborted) return;

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

    const lifecycle = createLifecycle(signal);

    const delay = test?.stepDelay ?? 1000;

    async function run() {
        info.textContent = 'Starting takeback demo';

        const actions = [
            { type: 'move', san: 'e4', text: 'White: e4' },
            { type: 'move', san: 'e5', text: 'Black: e5' },
            { type: 'undo', text: 'Takeback: black move undone' },
            { type: 'move', san: 'c5', text: 'Black: c5 (different reply)' },
            { type: 'move', san: 'Nf3', text: 'White: Nf3' },
            { type: 'undo', text: 'Takeback: white move undone' },
            { type: 'move', san: 'Nf3', text: 'White: Nf3 #2' },
            
            { type: 'move', san: 'd6', text: 'Black: d6' },
            { type: 'move', san: 'd4', text: 'White: d4' },
            { type: 'undo', count: 2, text: 'Takeback: 2 moves undone instantly' },
            { type: 'move', san: 'Nc6', text: 'Black: Nc6 (alternative move)' }
        ];

        for (const a of actions) {
            if (lifecycle.cancelled) return;

            if (a.type === 'move') {
                const applied = replay.move(a.san, { sloppy: true });
                if (!applied) {
                    console.warn('Failed to apply move:', a.san);
                }
            } else if (a.type === 'undo') {
                const repeat = a.count || 1;
                for (let i = 0; i < repeat; i++) {
                    replay.undo();
                }
            }

            cg.set({ fen: replay.fen() });
            info.textContent = a.text || '';

            console.log('Action:', a.text || a.type, 'FEN:', replay.fen());

            if (!await lifecycle.wait(a.delay ?? (a.type === 'undo' ? test?.takebackHold ?? delay : delay))) return;
        }
    }

    run().catch(error => {
        console.error('Takeback demo error:', error);
        info.textContent = 'Error in takeback demo';
    });

    return {
        destroy() {
            lifecycle.cancel();
            cg.destroy();
            boardHolder.remove();
            info.remove();
        }
    };
}
