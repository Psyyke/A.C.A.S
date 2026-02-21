export async function init(container, { test }) {
    if(test.randomizeStartingPlayer)
        test.playerColor = Math.random() < 0.5 ? 'white' : 'black';

    window.addEventListener('message', (event) => {
        if(event.source !== window) return;
        const value = event?.data?.value;

        switch(event?.data?.name) {
            case 'bestMoveArr':
                applySuggestedMove(value);
                break;
        }
    });

    // Styles & layout
    container.classList.add('live-test-root');
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.gap = '16px';
    wrapper.style.alignItems = 'flex-start';

    const boardHolder = document.createElement('div');
    boardHolder.style.width = '360px';
    boardHolder.style.height = '360px';
    boardHolder.className = 'cg-wrap';

    const panel = document.createElement('div');
    panel.className = 'live-panel';
    panel.style.flex = '1';

    // Header
    const title = document.createElement('div');
    title.innerHTML =
        '<strong>' + (test.title || 'Live') + '</strong>' +
        (test.description ? (' — ' + test.description) : '');
    title.style.marginBottom = '8px';
    panel.appendChild(title);

    // Persistent move counter (persists across games)
    const stats = document.createElement('div');
    stats.className = 'live-stats';
    stats.style.marginBottom = '8px';

    const moveCounterLabel = document.createElement('div');
    moveCounterLabel.style.fontSize = '13px';
    moveCounterLabel.style.marginBottom = '6px';
    moveCounterLabel.textContent = 'Moves made: 0';

    stats.appendChild(moveCounterLabel);
    panel.appendChild(stats);

    wrapper.appendChild(boardHolder);
    wrapper.appendChild(panel);
    container.appendChild(wrapper);

    // Load chess.js
    async function ensureChessLib() {
        if (typeof window.Chess === 'function') return window.Chess;
        const mod = await import('../../assets/engines/libraries/chessjs/chess.js');
        const Chess = mod.Chess || mod.default;
        window.Chess = Chess;
        return Chess;
    }

    async function ensureChessground() {
        const start = Date.now();
        while (typeof window.ChessgroundX !== 'function') {
            if (Date.now() - start > 5000) throw new Error('ChessgroundX not available');
            await new Promise(r => setTimeout(r, 50));
        }
        return window.ChessgroundX;
    }

    const Chess = await ensureChessLib();
    const ChessgroundX = await ensureChessground();
    const ENGINE_NAME = 'Maia2';

    // Game state
    let game = new Chess(
        test.startFen ||
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    );

    function computeDests() {
        const dests = new Map();
        game.moves({ verbose: true }).forEach(m => {
            if (!dests.has(m.from)) dests.set(m.from, []);
            dests.get(m.from).push(m.to);
        });
        return dests;
    }

    const cg = ChessgroundX(boardHolder, {
        fen: game.fen(),
        orientation: test.playerColor === 'black' ? 'black' : 'white',
        animation: { enabled: true, duration: 220 },
        movable: {
            color: test.playerColor === 'black' ? 'black' : 'white',
            dests: computeDests()
        },
        events: {
            move(from, to) {
                const move = game.move({ from, to, promotion: 'q' });
                if(!move) return;

                cg.set({
                    fen: game.fen(),
                    movable: { dests: computeDests() }
                });

                const humanColor = test.playerColor === 'black' ? 'Black' : 'White';
                const nextColor = game.turn() === 'w' ? 'White' : 'Black';

                // Increment persistent move counter
                incrementMoveCounter();

                console.log(`[PLAYER MOVE] ${humanColor} played ${from} → ${to}. Next: ${nextColor} to move.`);

                checkGameEndAndMaybeRestart();
            }
        }
    });

    // Persistent move counter (persist across games)
    let movesMade = 0; // not reset on restart
    function incrementMoveCounter() {
        movesMade += 1;
        moveCounterLabel.textContent = 'Moves made: ' + movesMade;
    }

    // Engine worker
    let worker = null;
    let workerLoaded = false;

    function loadMaia2() {
        worker = new Worker('../assets/engines/Maia2/worker.js', { type: 'module' });

        worker.onmessage = e => {
            const msg = e.data;

            if(msg === true) {
                workerLoaded = true;

                worker.postMessage({ method: 'uci', args: ['uci'] });
                worker.postMessage({ method: 'uci', args: ['setoption name UCI_Elo value 2200'] });
                worker.postMessage({ method: 'uci', args: ['isready'] });
            } else if(msg) {
                onEngineSuggestion(msg);
            }
        };

        worker.onerror = err => {
            console.error('Engine worker error:', err);
            polling = false;
            engineThinking = false;
        };
    }

    function waitForWorkerReady() {
        return new Promise(resolve => {
            const tick = setInterval(() => {
                if (!worker) return;
                if (workerLoaded) {
                    clearInterval(tick);
                    resolve();
                } else {
                    try {
                        worker.postMessage({ method: 'acas_check_loaded' });
                    } catch {}
                }
            }, 200);
        });
    }

    function requestEngineSuggestion() {
        if (!workerLoaded || engineThinking) {
            console.log(`[ENGINE REQUEST] ${ENGINE_NAME} request skipped: ${engineThinking ? 'engine thinking' : 'worker not loaded'}`);
            return;
        }

        engineThinking = true;

        const colorToMove = game.turn() === 'w' ? 'White' : 'Black';
        const humanColor = test.playerColor === 'black' ? 'Black' : 'White';
        const owner = isEngineTurn() ? `ENGINE (${ENGINE_NAME})` : `PLAYER (${humanColor})`;

        console.log(`[ENGINE REQUEST] Asking ${ENGINE_NAME} for ${colorToMove} move. Owner: ${owner}. FEN: ${game.fen()}`);

        // engine timing removed; we only count moves now

        worker.postMessage({
            method: 'uci',
            args: [`position fen ${game.fen()}`]
        });

        worker.postMessage({
            method: 'uci',
            args: ['go depth 1']
        });
    }

    function applySuggestedMove(moveArr) {
        if (!Array.isArray(moveArr) || moveArr.length !== 2) return;
        const [from, to] = moveArr;

        console.log(moveArr);

        // Try to make the move in the game
        const move = game.move({ from, to, promotion: 'q' });

        console.log(move, game.fen());

        if (!move) {
            console.warn('Invalid move suggested:', moveArr);
            return;
        }

        // Update the board
        cg.set({
            fen: game.fen(),
            movable: { dests: computeDests() }
        });
        console.log(`Applied suggested move: ${from} → ${to}`);

        // Increment persistent move counter
        incrementMoveCounter();
        checkGameEndAndMaybeRestart();
    }

    function onEngineSuggestion(uciString) {
        const data = parseUCIResponse(uciString);

        if(!data || !data.bestmove) {
            console.warn(`[${ENGINE_NAME}] No bestmove in engine response:`, uciString);
            return;
        }
        if(!engineThinking) {
            console.warn(`[${ENGINE_NAME}] Suggestion received while not thinking.`);
            return;
        }

        engineThinking = false;

        const moveUci = data.bestmove;

        const found = game.moves({ verbose: true })
            .find(m => m.from + m.to + (m.promotion || '') === moveUci);

        if(!found) {
            console.warn(`[${ENGINE_NAME}] Invalid move suggested:`, moveUci);
            return;
        }

        console.log(`[${ENGINE_NAME}] Suggests ${moveUci} — applying move.`);

        // Increment persistent move counter
        incrementMoveCounter();

        game.move(found);

        cg.set({
            fen: game.fen(),
            movable: { dests: computeDests() }
        });

        checkGameEndAndMaybeRestart();
    }

    function isEngineTurn() {
        const enginePlaysWhite = test.playerColor === 'black';
    
        return (enginePlaysWhite && game.turn() === 'w') ||
               (!enginePlaysWhite && game.turn() === 'b');
    }

    let polling = true;
    let engineThinking = false;

    function gameLoop() {
        if(!polling)
            return;

        if(isEngineTurn()) {
            console.log('[ENGINE TURN] Engine to move.');
            requestEngineSuggestion();
        } else {
            const humanColor = test.playerColor === 'black' ? 'Black' : 'White';
            const colorToMove = game.turn() === 'w' ? 'White' : 'Black';
            if(colorToMove === humanColor) {
                console.log(`[PLAYER REQUEST] Waiting for script (${humanColor}) to play. Please make your move on the board.`);
            } else {
                // It's the other side (not engine), log who is to move for clarity
                console.log(`[PLAYER TURN] ${colorToMove} to move (script side: ${humanColor}).`);
            
            }
        }

        setTimeout(requestAnimationFrame(gameLoop), 1000);
    }

    function checkGameEndAndMaybeRestart() {
        console.log('Checking if game is over...', !game.game_over() ? 'Not over' : 'Game over', game);

        if(!game.game_over()) {
            console.log('Game continues');
            return;
        }

        let finished = false;
        let reason = '';

        if(game.in_threefold_repetition()) {
            finished = true;
            reason = 'Threefold repetition';
        } else if(game.in_checkmate()) {
            finished = true;
            reason = 'Checkmate';
        } else if(game.in_stalemate()) {
            finished = true;
            reason = 'Stalemate';
        } else if(game.insufficient_material()) {
            finished = true;
            reason = 'Insufficient material';
        } else if(game.in_draw()) {
            finished = true;
            reason = 'Draw';
        }

        console.log('Is game over?', finished, reason);

        if(!finished) return;

        title.innerHTML = `<strong>Finished:</strong> ${reason}`;
        if(test.autoRestartOnEnd) {
            setTimeout(restartGame, 1500);
        }
    }

    function restartGame() {
        game = new Chess(test.startFen);

        console.log('Restarting game. New FEN:', game.fen());

        // Toggle orientation based on current board state
        const newOrientation = cg.state.orientation === 'white' ? 'black' : 'white';

        console.log('New orientation:', newOrientation);
        
        test.playerColor = newOrientation;
        engineThinking = false;

        cg.set({
            fen: game.fen(),
            movable: { dests: computeDests() },
            orientation: newOrientation
        });

        // reset any transient engine state

        if(newOrientation === 'black') requestEngineSuggestion();
    }

    // Auto-restart UI removed

    // Start
    loadMaia2();
    await waitForWorkerReady();

    console.log('runner: worker ready');
    gameLoop();

    if(test.playerColor === 'black') requestEngineSuggestion();

    return {
        destroy() {
            polling = false;
            if (worker) worker.terminate();
            if (cg.destroy) cg.destroy();
            container.remove();
        }
    };
}