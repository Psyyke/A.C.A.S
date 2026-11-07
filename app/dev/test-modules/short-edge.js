import { createLifecycle } from './lifecycle.js';

export async function init(container, { test, signal, onComplete }) {
    const { Chess } = await import('../../assets/engines/libraries/chessjs/chess.js');
    if (signal?.aborted) return;
    const lifecycle = createLifecycle(signal);
    const info = document.createElement('div');
    info.className = 'test-info';
    info.textContent = test.title;
    container.appendChild(info);
    let game = new Chess(test.startFen === 'start' ? undefined : test.startFen);
    let holder;
    let cg;
    let orientation = test.playerColor || 'white';
    function createBoard() {
        holder = document.createElement('div');
        container.appendChild(holder);
        cg = window.ChessgroundX(holder, {
            fen: game.fen(), orientation,
            animation: { enabled: false }, movable: { free: false }
        });
    }
    createBoard();
    async function run() {
        for (const [index, action] of test.actions.entries()) {
            if (lifecycle.cancelled) return;
            if (action.reset) {
                cg.destroy();
                cg = null;
                holder.remove();
                if (!await lifecycle.wait(100)) return;
                game = new Chess();
                orientation = action.orientation || orientation;
                createBoard();
            }
            if (action.undo) {
                for (let i = 0; i < action.undo; i++) {
                    if (!game.undo()) throw new Error('No move to take back');
                }
            }
            if (action.flip) {
                orientation = orientation === 'white' ? 'black' : 'white';
                cg.set({ orientation, fen: game.fen() });
            }
            for (const san of action.moves || []) {
                if (!game.move(san)) throw new Error(`Illegal scenario move: ${san}`);
            }
            if (action.vanish) {
                const before = new Chess(game.fen());
                const move = game.move(action.vanish);
                if (!move) throw new Error(`Illegal vanishing move: ${action.vanish}`);
                before.remove(move.from);
                cg.set({ fen: before.fen() });
                if (!await lifecycle.wait(action.delayMs ?? 100)) return;
            }
            if (index === test.actions.length - 1) onComplete?.({ fen: game.fen(), cg });
            cg.set({ fen: game.fen() });
            if (index !== test.actions.length - 1 && !await lifecycle.wait(100)) return;
        }
        info.textContent = test.title + ' - Finished';
    }
    run().catch(error => {
        console.error('Short edge scenario failed:', error);
        info.textContent = error.message;
        onComplete?.({ error: error.message });
    });
    return {
        destroy() {
            lifecycle.cancel();
            cg?.destroy();
            holder.remove();
            info.remove();
        }
    };
}
