// Vanish Move demo
// Shows a move where the piece first disappears from its source square, then appears on the destination square
export async function init(container, { test } = {}) {
    let Chess;
    try {
        const mod = await import('../../assets/engines/libraries/chessjs/chess.js');
        Chess = mod.Chess || mod.default;
    } catch (e) {
        container.textContent = 'Failed to load chess.js';
        throw e;
    }

    const info = document.createElement('div');
    info.className = 'test-info';
    container.appendChild(info);

    const boardHolder = document.createElement('div');
    container.appendChild(boardHolder);

    const cg = window.ChessgroundX(boardHolder, {
        fen: (test && test.startFen) ? (test.startFen.indexOf(' ') === -1 ? test.startFen + ' w - - 0 1' : test.startFen) : 'start',
        orientation: (test && test.playerColor && (String(test.playerColor).toLowerCase() === 'black' || String(test.playerColor).toLowerCase() === 'b')) ? 'black' : 'white',
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

    function applySanWithFallback(replay, san) {
        let r = replay.move(san);
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
        console.warn('Vanish demo: failed to apply SAN:', san);
        return null;
    }

    function setSquareInFen(fen, square, pieceCharOrNull) {
        // pieceCharOrNull: null to clear, or a single char like 'P' or 'n'
        const parts = fen.split(' ');
        const placement = parts[0];
        const rows = placement.split('/');
        const file = square[0];
        const rank = parseInt(square[1], 10);
        const rankIndex = 8 - rank; // rows[0] == rank 8
        const fileIndex = file.charCodeAt(0) - 'a'.charCodeAt(0);

        // expand row into 8 cells
        const row = [];
        for (const ch of rows[rankIndex]) {
            if (/[1-8]/.test(ch)) {
                const cnt = parseInt(ch, 10);
                for (let i = 0; i < cnt; i++) row.push(null);
            } else {
                row.push(ch);
            }
        }
        // set square
        row[fileIndex] = pieceCharOrNull;
        // compress back
        let newRow = '';
        let empties = 0;
        for (let i = 0; i < 8; i++) {
            const c = row[i];
            if (!c) {
                empties++;
            } else {
                if (empties) { newRow += String(empties); empties = 0; }
                newRow += c;
            }
        }
        if (empties) newRow += String(empties);
        const newRows = rows.slice(0);
        newRows[rankIndex] = newRow;
        const newPlacement = newRows.join('/');
        parts[0] = newPlacement;
        return parts.join(' ');
    }

    async function run() {
        try {
            const sd = test && test.stepDelay != null ? test.stepDelay : 700;
            const vanishDelay = test && test.vanishDelay != null ? test.vanishDelay : 350;
            const startFen = (test && test.startFen) ? (test.startFen.indexOf(' ') === -1 ? test.startFen + ' w - - 0 1' : test.startFen) : undefined;
            const replay = startFen ? new Chess(startFen) : new Chess();

            // show some moves before
            info.textContent = 'Before move: Nf3, d5';
            if (applySanWithFallback(replay, 'Nf3')) cg.set({ fen: replay.fen() });
            await wait(sd);
            if (applySanWithFallback(replay, 'd5')) cg.set({ fen: replay.fen() });
            await wait(sd);

            // the vanish-appear move: default 'e4' unless provided
            const san = (test && test.move) ? test.move : 'e4';
            const preFen = replay.fen();
            const moveObj = applySanWithFallback(replay, san);
            if (!moveObj) {
                info.textContent = `Failed to apply move ${san}`;
                return;
            }
            const postFen = replay.fen();

            // show vanish frame: remove piece from moveObj.from
            const vanishFen = setSquareInFen(preFen, moveObj.from, null);
            cg.set({ fen: vanishFen });
            info.textContent = `Vanish: ${moveObj.san} (piece disappears)`;
            await wait(vanishDelay);

            // now show the real post-move position
            cg.set({ fen: postFen });
            info.textContent = `Arrive: ${moveObj.san} (piece reappears)`;
            await wait(sd);

            // show one move after
            if (applySanWithFallback(replay, 'e5')) cg.set({ fen: replay.fen() });
            await wait(sd);
            // Knight capture: vanish knight first, then show capture
            {
                const preCaptureFen = replay.fen();
                const moveObj = applySanWithFallback(replay, 'Nxe5');
                if (moveObj) {
                    const postCaptureFen = replay.fen();
                    if (moveObj.piece === 'n' && ((moveObj.flags && moveObj.flags.indexOf('c') !== -1) || moveObj.captured)) {
                        // show vanish where knight disappears from its origin
                        const vanishFen = setSquareInFen(preCaptureFen, moveObj.from, null);
                        cg.set({ fen: vanishFen });
                        info.textContent = `Vanish capture: ${moveObj.san} (knight disappears before capturing)`;
                        await wait(test && test.vanishDelay != null ? test.vanishDelay : 350);
                    }
                    cg.set({ fen: postCaptureFen });
                }
            }
            await wait(sd);

            info.textContent = 'Vanish demo finished';
        } catch (e) {
            console.error('Vanish demo error', e);
            info.textContent = 'Error in vanish demo';
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
