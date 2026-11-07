// Board Reset & Flip Demo
// Shows an endgame, performs some moves, removes the board, recreates a fresh board with the default start FEN flipped and plays the first move
import { createLifecycle } from './lifecycle.js';

export async function init(container, { test, signal } = {}) {
    let Chess;
    try {
        const mod = await import('../../assets/engines/libraries/chessjs/chess.js');
        Chess = mod.Chess || mod.default;
    } catch (e) {
        container.textContent = 'Failed to load chess.js';
        throw e;
    }
    if (signal?.aborted) return;

    const info = document.createElement('div');
    info.className = 'test-info';
    container.appendChild(info);

    let boardHolder = document.createElement('div');
    container.appendChild(boardHolder);

    let cg = window.ChessgroundX(boardHolder, {
        fen: (test && test.startFen) ? test.startFen : '8/8/1k6/8/8/8/1P2K3/8 w - - 0 1',
        orientation: (test && test.playerColor && String(test.playerColor).toLowerCase() === 'black') ? 'black' : 'white',
        animation: { enabled: true, duration: 250 },
        movable: { free: false }
    });

    const lifecycle = createLifecycle(signal);
    let boardDestroyed = false;

    function applySanWithFallback(replay, san) {
        const r = replay.move(san);
        if (r) return r;
        const legal = replay.moves({ verbose: true });
        for (const m of legal) if (m.san === san) return replay.move({ from: m.from, to: m.to, promotion: m.promotion });
        const destMatch = san.match(/([a-h][1-8])$/);
        if (destMatch) {
            const to = destMatch[1];
            const candidates = legal.filter(m => m.to === to);
            if (candidates.length === 1) return replay.move({ from: candidates[0].from, to: candidates[0].to, promotion: candidates[0].promotion });
            if (candidates.length > 1) {
                const cap = candidates.find(m => m.flags.indexOf('c') !== -1);
                if (cap) return replay.move({ from: cap.from, to: cap.to, promotion: cap.promotion });
                return replay.move({ from: candidates[0].from, to: candidates[0].to, promotion: candidates[0].promotion });
            }
        }
        console.warn('Board Reset demo: failed to apply SAN:', san);
        return null;
    }

    async function run() {
        try {
            const sd = test && test.stepDelay != null ? test.stepDelay : 800;
            const resetDelay = test && test.resetDelay != null ? test.resetDelay : 1000;
            const newBoardDelay = test && test.newBoardDelay != null ? test.newBoardDelay : 700;
            const flipOrientation = !!(test && test.flipOrientation);
            const firstMove = (test && test.firstMove) ? test.firstMove : 'e4';

            // Phase 1: endgame short play
            let initialFen = test?.startFen || '8/8/1k6/8/8/8/1P2K3/8 w - - 0 1';
            // Chess.js expects a full FEN (with side to move and other fields). If we only have a placement
            // (Chessground returns placement-only), append sensible defaults so the engine can apply SAN moves.
            if (initialFen && initialFen.indexOf(' ') === -1) {
                initialFen = initialFen + ' w - - 0 1';
            }
            const replay = new Chess(initialFen);
            info.textContent = 'Endgame: playing a few moves';
            // a small sequence to simulate endgame stage
            const seq = (test && test.moves && Array.isArray(test.moves)) ? test.moves : ['Kd3', 'Kc5', 'b4+', 'Kxb4'];
            for (const san of seq) {
                if (lifecycle.cancelled) return;
                applySanWithFallback(replay, san);
                cg.set({ fen: replay.fen() });
                info.textContent = `Endgame: ${san}`;
                if (!await lifecycle.wait(sd)) return;
            }

            // Remove the board
            if (lifecycle.cancelled) return;
            info.textContent = 'Removing board...';
            cg.destroy();
            boardDestroyed = true;
            boardHolder.remove();

            if (!await lifecycle.wait(resetDelay)) return;

            // Create a new board (default start) optionally flipped
            if (lifecycle.cancelled) return;
            info.textContent = 'Creating new board (start position)';
            boardHolder = document.createElement('div');
            container.appendChild(boardHolder);
            cg = window.ChessgroundX(boardHolder, {
                fen: 'start',
                orientation: flipOrientation ? 'black' : 'white',
                animation: { enabled: true, duration: 250 },
                movable: { free: false }
            });
            boardDestroyed = false;

            if (!await lifecycle.wait(newBoardDelay)) return;

            // Make the first move on the new board
            if (lifecycle.cancelled) return;
            const newReplay = new Chess();
            const mv = applySanWithFallback(newReplay, firstMove);
            if (mv) {
                cg.set({ fen: newReplay.fen() });
                info.textContent = `New board: ${firstMove}`;
            } else {
                info.textContent = `Failed to play first move: ${firstMove}`;
            }

            if (!await lifecycle.wait(sd)) return;
            info.textContent = 'Board Reset & Flip Demo finished';

        } catch (e) {
            console.error('Board Reset & Flip Demo error', e);
            info.textContent = 'Error in Board Reset & Flip Demo';
        }
    }

    run();

    return {
        destroy() {
            lifecycle.cancel();
            if (!boardDestroyed) {
                cg.destroy();
                boardDestroyed = true;
            }
            boardHolder.remove();
            info.remove();
        }
    };
}
