/* [A.C.A.S MoveEvaluator]
 * - License: GPLv3
 * - Version: 0.1
 * - Notes: Currently doesn't support chess variations
 * - External variables: toast, parseUCIResponse (acas-globals.js)
 * */

class MoveEvaluator {
    constructor(fen, playerColor) {
        this.defaultFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        this.currentFen = fen || this.defaultFen;
        this.engine = null;
        this.playerColor = playerColor || 'w';
        this.currentCp = { 'w': 0, 'b': 0 };
        this.lastCp = { 'w': 0, 'b': 0 };
        this.searchDepth = 5;
        this.readyok = false;
        this.isEngineCrashed = false;
        this.uci = (msg) => null;

        this.resultLabels = ['Neutral', 'Inaccuracy', 'Mistake', 'Blunder', 'Catastrophic', 'Good Move', 'Excellent', 'Brilliancy'];

        this.loadStockfish('stockfish-17-lite-single');
    }

    loadStockfish(folderName, fileName = folderName) {
        const stockfish = new Worker(`../app/assets/engines/${folderName}/${fileName}.js`);
        let stockfish_loaded = false;

        stockfish.onmessage = async e => {
            if(!stockfish_loaded) {
                stockfish_loaded = true;

                this.engine = stockfish;

                this.uci = (msg, callback) => {
                    stockfish.postMessage(msg);
                    stockfish.onmessage = async e => {
                        if(callback) {
                            callback(e.data);
                        }
                    };
                };
    
                this.engineReady();
            }
        };

        stockfish.onerror = e => {
            this.isEngineCrashed = true;

            console.error('MoveEvaluator crashed with message:', e);
        };
    }

    setPosition(fen = this.currentFen) {
        const isStartPosition = this.defaultFen.split(' ')[0] === this.currentFen.split(' ')[0];

        if(isStartPosition) {
            this.lastCp['w'] = 0;
            this.lastCp['b'] = 0;
        }

        this.currentFen = fen;

        this.uci('position fen ' + fen);
    }

    engineReady() {
        this.readyok = true;

        this.setPosition(this.currentFen);
    }

    categorize(relativeCp) {
        if(relativeCp >= 90) return 7;   // Brilliancy
        if(relativeCp >= 50) return 6;   // Excellent
        if(relativeCp >= 15) return 5;   // Good Move
        if(relativeCp > -15 && relativeCp < 15) return 0; // Neutral
        if(relativeCp <= -90) return 4;  // Catastrophic
        if(relativeCp <= -50) return 3;  // Blunder
        if(relativeCp <= -15) return 2;  // Mistake

        return 1; // Inaccuracy
    }

    eval(moveObj, configObj, callback) {
        const [from, to] = moveObj; // e.g. ['a1', 'a2']
    
        this.currentFen = configObj?.fen || this.currentFen;
        this.searchDepth = configObj?.depth || this.searchDepth;

        const playerColor = this.currentFen.split(' ')[1];
        const enemyColor = playerColor === 'w' ? 'b' : 'w';

        let isMate = 0;

        const ready = () => {
            if(this.currentFen)
                this.setPosition(this.currentFen);

            // Once ready, send the UCI command
            this.uci(`go depth ${this.searchDepth} searchmoves ${from + to}`, msg => {
                const result = parseUCIResponse(msg);

                if(result?.cp !== undefined && result.cp !== 0) {
                    this.lastCp[playerColor] = this.currentCp[playerColor];
                    this.currentCp[playerColor] = Number(result.cp);
                }

                if(result?.bestmove) {
                    const currentPlayerCp = this.currentCp[playerColor];
                    const lastPlayerCp = this.lastCp[playerColor];
                    const lastEnemyCp = this.lastCp[enemyColor];

                    const magnitude = (Math.abs(lastPlayerCp) + Math.abs(lastEnemyCp));
                    const divisor = magnitude > 1000 ? 10 : 1;

                    const previousCpAverage = magnitude / 2 * Math.sign(lastPlayerCp);
                    const previousCp = previousCpAverage || currentPlayerCp;

                    const ownMate = typeof isMate === 'number' && isMate > 0;

                    const relativeCp = (currentPlayerCp === 0 || ownMate)
                        ? 50 + (55 - isMate * 10)
                        : (currentPlayerCp - previousCp) / divisor;

                    callback({
                        'category': this.categorize(relativeCp),
                        'cp': relativeCp
                    });
                }

                isMate = Number(result?.mate || 0);
                
                console.warn('[Feedback Engine]', msg);
            });
        }

        const waitForReady = () => {
            if(this.readyok) {
                ready();
            } else if(!this.isEngineCrashed) {
                setTimeout(waitForReady, 50);
            }
        };
    
        waitForReady();
    }

    terminate() {
        this.engine?.terminate();
    }
}