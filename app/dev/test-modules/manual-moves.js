// Free Board Demo
// Loads a given FEN (or start position) and presents a board where the user
// can move any piece freely (both colors, no automation).
export async function init(container, { test, signal } = {}) {
    const info = document.createElement('div');
    info.className = 'test-info';
    container.appendChild(info);

    const boardHolder = document.createElement('div');
    container.appendChild(boardHolder);

    async function ensureChessLib() {
        if (typeof window.Chess === 'function') return window.Chess;
        const mod = await import('../../assets/engines/libraries/chessjs/chess.js');
        const Chess = mod.Chess || mod.default;
        window.Chess = Chess;
        return Chess;
    }

    await ensureChessLib();
    if (signal?.aborted) return;

    const startFen = (test && test.startFen) ? test.startFen : 'start';
    const orientation = (test && String(test.playerColor).toLowerCase() === 'black') ? 'black' : 'white';

    const cg = window.ChessgroundX(boardHolder, {
        fen: startFen,
        orientation,
        animation: { enabled: true, duration: 220 },
        movable: { free: true, color: 'both' }
    });

    info.textContent = `Free board loaded: ${startFen}`;

    return {
        destroy() {
            cg.destroy();
            boardHolder.remove();
            info.remove();
        }
    };
}
