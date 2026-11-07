// Flip Only Demo
// Loads a given FEN (or start position), waits for a short delay then flips the board orientation
import { createLifecycle } from './lifecycle.js';

export async function init(container, { test, signal } = {}) {
    if (signal?.aborted) return;
    const info = document.createElement('div');
    info.className = 'test-info';
    container.appendChild(info);

    const boardHolder = document.createElement('div');
    container.appendChild(boardHolder);

    const startFen = (test && test.startFen) ? test.startFen : 'start';
    const orientation = (test && test.playerColor && String(test.playerColor).toLowerCase() === 'black') ? 'black' : 'white';

    const cg = window.ChessgroundX(boardHolder, {
        fen: startFen,
        orientation,
        animation: { enabled: true, duration: 200 },
        movable: { free: false }
    });

    const lifecycle = createLifecycle(signal);

    async function run() {
        try {
            const flipDelay = (test && test.flipDelay != null) ? test.flipDelay : 200;
            info.textContent = `Loaded: ${startFen} - flipping in ${flipDelay}ms`;
            if (!await lifecycle.wait(flipDelay)) return;
            if (typeof cg.toggleOrientation === 'function') {
                cg.toggleOrientation();
            } else {
                // fallback: set opposite orientation
                cg.set({ orientation: orientation === 'white' ? 'black' : 'white' });
            }
            info.textContent = 'Board flipped';
        } catch (e) {
            console.error('Flip Only Demo error', e);
            info.textContent = 'Error in Flip Only Demo';
        }
    }

    run();

    return {
        destroy() {
            lifecycle.cancel();
            cg.destroy();
            boardHolder.remove();
            info.remove();
        }
    };
}
