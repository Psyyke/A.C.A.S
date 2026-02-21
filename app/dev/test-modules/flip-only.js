// Flip Only Demo
// Loads a given FEN (or start position), waits for a short delay then flips the board orientation
export async function init(container, { test } = {}) {
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

    let cancelled = false;
    const timers = new Set();
    function wait(ms) {
        return new Promise(resolve => {
            const t = setTimeout(() => { timers.delete(t); resolve(); }, ms);
            timers.add(t);
        });
    }

    async function run() {
        try {
            const flipDelay = (test && test.flipDelay != null) ? test.flipDelay : 200;
            info.textContent = `Loaded: ${startFen} — flipping in ${flipDelay}ms`;
            await wait(flipDelay);
            if (cancelled) return;
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
            cancelled = true;
            for (const t of Array.from(timers)) clearTimeout(t);
            try { if (cg && typeof cg.destroy === 'function') cg.destroy(); } catch (e) {}
            boardHolder.remove();
            info.remove();
        }
    };
}
