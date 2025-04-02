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

        this.loadStockfish('stockfish-17-single');
    }

    loadStockfish(folderName, fileName = folderName) {
        const stockfish = new Worker(`/A.C.A.S/app/assets/engines/${folderName}/${fileName}.js`);
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
            toast.warning('MoveEvaluator crashed with message:', e?.message);
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

    categorize(cp) {
        if (cp >= 200) return 7;
        if (cp >= 100) return 6;
        if (cp >= 60) return 5;
        if (cp <= -500) return 4;
        if (cp <= -300) return 3;
        if (cp <= -100) return 2;
        if (cp <= -50) return 1;
        
        return 0;
    }

    eval(moveObj, configObj, callback) {
        const [from, to] = moveObj; // e.g. ['a1', 'a2']
    
        this.currentFen = configObj?.fen || this.currentFen;
        this.searchDepth = configObj?.depth || this.searchDepth;

        const playerColor = this.currentFen.split(' ')[1];

        const ready = () => {
            if(this.currentFen)
                this.setPosition(this.currentFen);

            // Once ready, send the UCI command
            this.uci(`go depth ${this.searchDepth} searchmoves ${from + to}`, msg => {
                const result = parseUCIResponse(msg);
                
                if(result?.mate) {
                    const mateIn = Number(result.mate);
                    const mateValue = 800 - Math.abs(mateIn);
                    const cp = mateIn > 0 ? mateValue : -mateValue;

                    this.currentCp[playerColor] = cp;
                } else if (result?.cp && result?.cp !== 0)
                    this.currentCp[playerColor] = Number(result.cp);
                
                if(result?.bestmove) {
                    const currentCp = this.currentCp[playerColor];
                    //const averageCp = (this.lastCp[playerColor] + this.currentCp[playerColor]) / 2;
                    //console.log(this.lastCp[playerColor], this.currentCp[playerColor], averageCp, playerColor);
                    //this.lastCp[playerColor] = this.currentCp[playerColor];

                    callback({
                        'category': this.categorize(currentCp),
                        'cp': currentCp
                    });
                }

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