/* [A.C.A.S MoveEvaluator]
 * - License: GPLv3
 * - Version: 0.2
 * - Notes: Currently doesn't support chess variations
 * - External variables: toast, parseUCIResponse (acas-globals.js)
 * */

class MoveEvaluator {
    constructor(fen, playerColor) {
        this.defaultFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        this.currentFen = fen || this.defaultFen;
        this.engine = null;
        this.playerColor = playerColor || 'w';
        this.searchDepth = 15;
        this.readyok = false;
        this.rebootAttempts = 0;
        this.engineName = 'stockfish-17-lite-single';
        this.uci = (msg) => null;

        this.cpHistory = { 'w': [], 'b': [] };
        this.cpRelativeHistory = { 'w': [], 'b': [] };

        this.resultLabels = ['Neutral', 'Inaccuracy', 'Mistake', 'Blunder', 'Catastrophic', 'Good Move', 'Excellent', 'Brilliancy'];

        this.loadStockfish(this.engineName);
    }

    loadStockfish(folderName, fileName = folderName) {
        const stockfish = new Worker(`../app/assets/engines/${folderName}/${fileName}.js`);
        let stockfish_loaded = false;
    
        this.pendingCallback = null; // Store the callback for the current UCI command
    
        stockfish.onmessage = async e => {
            const msg = e.data;
    
            if(!stockfish_loaded) {
                stockfish_loaded = true;
    
                this.engine = stockfish;
    
                this.engineReady();
            }
    
            if(this.pendingCallback) {
                this.pendingCallback(msg);
            }
        };
    
        this.uci = (msg, callback) => {
            this.pendingCallback = callback;
            stockfish.postMessage(msg);
        };
    
        stockfish.onerror = e => {
            console.error('[MoveEvaluator] Crashed with message:', e);

            this.rebootEngine();
        };
    }

    rebootEngine() {
        if(this.rebootAttempts < 3) {
            this.rebootAttempts++;

            this.engine?.terminate();
            this.engine = null;

            console.warn('[MoveEvaluator] Hold on, rebooting! Attempt:', this.rebootAttempts);

            setTimeout(this.loadStockfish(this.engineName), 100);
        }
    }

    setPosition(fen = this.currentFen) {
        this.currentFen = fen;

        this.uci('position fen ' + fen);
    }

    startNewGame(playerColor) {
        this.playerColor = playerColor;
        this.cpHistory = { 'w': [], 'b': [] };
        this.cpRelativeHistory = { 'w': [], 'b': [] };
    }

    engineReady() {
        this.readyok = true;
        this.rebootAttempts = 0;

        this.uci('setoption name UCI_AnalyseMode value true');
        this.uci('setoption name UCI_ShowWDL value true');

        this.setPosition(this.currentFen);
    }

    categorize(relativeCp) {
        if(relativeCp >= 250) return 7;   // Brilliancy
        if(relativeCp >= 100) return 6;   // Excellent
        if(relativeCp >= 25) return 5;   // Good Move
        if(relativeCp > -15 && relativeCp < 15) return 0; // Neutral
        if(relativeCp <= -250) return 4;  // Catastrophic
        if(relativeCp <= -100) return 3;  // Blunder
        if(relativeCp <= -25) return 2;  // Mistake

        return 1; // Inaccuracy
    }

    eval(moveObj, configObj, callback) {
        this.currentFen = configObj?.fen || this.currentFen;
        this.searchDepth = configObj?.depth || this.searchDepth;

        const [from, to] = moveObj; // e.g. ['a1', 'a2']
        const playerColor = this.currentFen.split(' ')[1];
        const enemyColor = playerColor === 'w' ? 'b' : 'w';

        let isMate = 0;

        const sendAndProcess = () => {
            if(this.currentFen)
                this.setPosition(this.currentFen);

            // Once ready, send the UCI command
            this.uci(`go depth ${this.searchDepth} searchmoves ${from + to}`, msg => {
                const result = parseUCIResponse(msg);

                if(result?.cp !== undefined && result.cp !== 0)
                    this.cpHistory[playerColor].push(Number(result.cp));
                if(result?.mate) {
                    const history       = this.cpHistory[playerColor];
                    const lastPlayerCp  = history.slice(-1 - this.searchDepth)[0] || 1;
                    const newCp         = (1 + 1 / this.searchDepth) * lastPlayerCp;
                    
                    this.cpHistory[playerColor].push(newCp);
                }

                if(result?.bestmove) {
                    const ownMate = typeof isMate === 'number' && isMate > 0 && isMate < 6;

                    const history           = this.cpHistory[playerColor];
                    const enemyHistory      = this.cpHistory[enemyColor];
                    const currentPlayerCp   = history.slice(-1)[0] || 0;
                    const lastPlayerCp      = history.slice(-1 - this.searchDepth)[0] || 1;
                    const lastEnemyCp       = enemyHistory.slice(-1)[0] || currentPlayerCp;

                    const magnitude = (Math.abs(lastPlayerCp) + Math.abs(lastEnemyCp));
                    const divisor = magnitude > 1000 ? 10 : 1;
                    const previousCpAverage = magnitude / 2 * Math.sign(lastPlayerCp);
                    const previousCp = previousCpAverage || currentPlayerCp;
                    const relativeCp = (currentPlayerCp === 0 || ownMate)
                        ? 250
                        : (currentPlayerCp - previousCp) / divisor;

                    callback({
                        'category': this.categorize(relativeCp),
                        'cp': relativeCp
                    });

                    // console.log(geoGebraDotCommands(this.cpHistory));
                    // this.cpRelativeHistory[playerColor].push(relativeCp);
                }

                isMate = Number(result?.mate || 0);
            });
        }

        const waitForReady = () => {
            if(this.readyok)
                sendAndProcess();
            else if(this.rebootAttempts < 3)
                setTimeout(waitForReady, 50);
        }
        
        waitForReady();
    }

    terminate() {
        this.engine?.terminate();
        this.engine = null;
        this.pendingCallback = null;
    }
}