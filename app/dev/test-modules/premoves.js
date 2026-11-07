// Premove demo
// White queues several premoves, Black queues several premoves,
// then both execute so the board updates show multiple pieces moved at once.
import { createLifecycle } from './lifecycle.js';

export async function init(container, { test, signal } = {}) {
    // load chess.js
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
        animation: { enabled: true, duration: 220 },
        movable: { free: false }
    });

    const replay = new Chess(startFen);

    const lifecycle = createLifecycle(signal);

    const delay = test && test.initialDelay != null ? test.initialDelay : 900;

    async function run() {
        info.textContent = 'Queuing premoves...';

        // Example premove lists; tests may override via `test.whitePremoves` / `test.blackPremoves`
        const whiteQueue = Array.isArray(test && test.whitePremoves) ? [...test.whitePremoves] : ['e4', 'Nf3'];
        const blackQueue = Array.isArray(test && test.blackPremoves) ? [...test.blackPremoves] : ['e5', 'c5'];

        // Phase 1: queue white premoves (no board update)
        for (let i = 0; i < whiteQueue.length; i++) {
            if (lifecycle.cancelled) return;
            info.textContent = `White queued: ${whiteQueue.slice(0, i+1).join(', ')}`;
            if (!await lifecycle.wait(300)) return;
        }

        // Phase 2: queue black premoves (no board update)
        for (let i = 0; i < blackQueue.length; i++) {
            if (lifecycle.cancelled) return;
            info.textContent = `Black queued: ${blackQueue.slice(0, i+1).join(', ')}`;
            if (!await lifecycle.wait(300)) return;
        }

        // Phase 3: execute premoves in batches so multiple pieces appear to move together.
        info.textContent = 'Executing premoves...';

        // While either queue has moves, apply one white (if it's white's turn and available)
        // and one black (if it's black's turn and available), then update the board once.
        while ((whiteQueue.length || blackQueue.length) && !lifecycle.cancelled) {
            let appliedAny = false;

            // attempt to apply a white move if it's white's turn
            if (replay.turn() === 'w' && whiteQueue.length) {
                const san = whiteQueue.shift();
                const applied = replay.move(san, { sloppy: true });
                if (!applied) throw new Error(`Illegal white premove: ${san}`);
                appliedAny = true;
            }

            // attempt to apply a black move if it's black's turn
            if (replay.turn() === 'b' && blackQueue.length) {
                const san = blackQueue.shift();
                const applied = replay.move(san, { sloppy: true });
                if (!applied) throw new Error(`Illegal black premove: ${san}`);
                appliedAny = true;
            }

            if (!appliedAny) {
                throw new Error('Premove queue has no move for the side to play');
            }

            // single board update after applying available moves in this batch
            cg.set({ fen: replay.fen() });
            info.textContent = `Board updated. Remaining - White: ${whiteQueue.length}, Black: ${blackQueue.length}`;

            if (!await lifecycle.wait(delay)) return;
        }

        info.textContent = 'Premove sequence finished.';
    }

    run().catch(error => {
        console.error('Premove demo error:', error);
        info.textContent = error.message;
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
