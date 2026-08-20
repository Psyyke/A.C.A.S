export default class PieceEvaluator {
    constructor(fen, config = {}) {
        this.fen = fen;

        this.engineName = config?.engineName || 'stockfish-18-lite-single';
        this.moveTimeLimit = config?.moveTimeLimit ?? 5;
        this.workerCount = config?.workerCount ?? 4;

        this.engines = [];
        this.readyok = false;
        this.initializing = null;
        this._cancelToken = 0;

        this.loadStockfish(this.engineName);
    }

    cancel() {
        this._cancelToken++;

        for(const worker of this.engines) {
            try {
                worker.postMessage('stop');
            } catch (e) {}
        }
    }

    async loadStockfish(folderName, fileName = folderName) {
        if(this.initializing) {
            return this.initializing;
        }

        this.initializing = new Promise(async (resolve) => {
            try {
                this.terminateEngines();

                const workers = [];

                for(let i = 0; i < this.workerCount; i++) {
                    const worker = new Worker(
                        `../app/assets/engines/${folderName}/${fileName}.js`
                    );

                    worker._ready = false;
                    worker._index = i;

                    workers.push(worker);
                }

                this.engines = workers;

                await Promise.all(
                    workers.map(worker => this.initializeWorker(worker))
                );

                this.readyok = true;

                resolve();
            } catch (err) {
                this.readyok = false;
                this.terminateEngines();

                resolve();
            } finally {
                this.initializing = null;
            }
        });

        return this.initializing;
    }

    handleWorkerCrash(worker) {
        try {
            worker.terminate();
        } catch (e) {}

        this.engines = this.engines.filter(
            w => w !== worker
        );

        this.readyok = false;
    }

    initializeWorker(worker) {
        return new Promise((resolve, reject) => {
            let finished = false;

            const timeout = setTimeout(() => {
                if(finished) return;

                finished = true;
                reject(
                    new Error(
                        `Stockfish worker ${worker._index} initialization timeout`
                    )
                );
            }, 3000);

            worker.onmessage = (e) => {
                const msg = e.data;

                if(msg === 'uciok') {
                    worker._uciok = true;
                }

                if(msg === 'readyok') {
                    worker._ready = true;

                    if(!finished) {
                        finished = true;
                        clearTimeout(timeout);
                        resolve();
                    }
                }
            };

            worker.onerror = (e) => {
                if(finished) return;

                finished = true;
                clearTimeout(timeout);

                reject(
                    new Error(
                        `Stockfish worker ${worker._index} crashed`
                    )
                );
            };

            worker.postMessage('uci');
            worker.postMessage('setoption name UCI_AnalyseMode value true');
            worker.postMessage('setoption name Hash value 32');
            worker.postMessage('isready');
        });
    }

    async waitForEngine() {
        if(this.readyok && this.engines.length > 0) {
            return;
        }

        await this.loadStockfish(this.engineName);

        if(!this.readyok || this.engines.length === 0) {
            throw new Error('Stockfish engine is not ready.');
        }
    }

    terminateEngines() {
        for(const worker of this.engines) {
            try {
                worker.terminate();
            } catch (e) {}
        }

        this.engines = [];
        this.readyok = false;
    }

    parseFen(fen) {
        if(typeof fen !== 'string') {
            throw new Error(
                `FEN must be a string, got ${typeof fen}`
            );
        }

        const parts = fen.trim().split(/\s+/);
        const rows = parts[0].split('/');

        if(rows.length !== 8) {
            throw new Error(
                `Invalid FEN: expected 8 rows, got ${rows.length}. FEN: ${fen}`
            );
        }

        return {
            rows,
            remainder: parts.slice(1).join(' ') || 'w - - 0 1'
        };
    }

    removePieceFromFen(fen, square) {
        const fileIdx = square.charCodeAt(0) - 97;
        const rankIdx = 8 - parseInt(square.slice(1), 10);

        const { rows, remainder } = this.parseFen(fen);
        const row = rows[rankIdx];

        if(typeof row !== 'string') {
            throw new Error(
                `Invalid FEN row for ${square}: rankIdx=${rankIdx}`
            );
        }

        const squares = [];

        for(const char of row) {
            if(/[1-8]/.test(char)) {
                for(let i = 0; i < Number(char); i++) {
                    squares.push('1');
                }
            } else {
                squares.push(char);
            }
        }

        if(squares.length !== 8) {
            throw new Error(
                `Invalid FEN row: expanded to ${squares.length} squares`
            );
        }

        const removedPiece = squares[fileIdx];

        if(removedPiece === '1') {
            throw new Error(`Square ${square} is empty`);
        }

        squares[fileIdx] = '1';

        let newRow = '';
        let emptyCount = 0;

        for(const space of squares) {
            if(space === '1') {
                emptyCount++;
            } else {
                if(emptyCount > 0) {
                    newRow += emptyCount;
                    emptyCount = 0;
                }

                newRow += space;
            }
        }

        if(emptyCount > 0) {
            newRow += emptyCount;
        }

        rows[rankIdx] = newRow;

        return {
            newFen: `${rows.join('/')} ${remainder}`,
            piece: removedPiece
        };
    }

    getActiveSquares(rows) {
        const activeSquares = [];

        for(let r = 0; r < 8; r++) {
            const row = rows[r];

            if(typeof row !== 'string') {
                throw new Error(`Missing FEN row ${r}`);
            }

            let file = 0;

            for(const char of row) {
                if(/[1-8]/.test(char)) {
                    file += Number(char);
                    continue;
                }

                const square =
                    String.fromCharCode(97 + file) +
                    (8 - r);

                if(char.toLowerCase() !== 'k') {
                    activeSquares.push({
                        square,
                        symbol: char
                    });
                }

                file++;
            }
        }

        return activeSquares;
    }

    evaluateWithWorker(worker, fen) {
        return new Promise((resolve) => {
            let lines = [];
            let finished = false;

            const timeoutMs =
                Math.max(
                    250,
                    this.moveTimeLimit * 50
                );

            const finish = () => {
                if(finished) return;

                finished = true;

                clearTimeout(timeout);

                worker.onmessage = null;
                worker.onerror = null;

                resolve(lines);
            };

            const timeout = setTimeout(() => {
                try {
                    worker.postMessage('stop');
                } catch (e) {}

                finish();
            }, timeoutMs);

            worker.onmessage = (e) => {
                const msg = e.data;

                lines.push(msg);

                if(
                    typeof msg === 'string' &&
                    msg.startsWith('bestmove')
                ) {
                    finish();
                }
            };

            worker.onerror = () => {
                this.handleWorkerCrash(worker);
                finish();
            };

            try {
                worker.postMessage(`position fen ${fen}`);
                worker.postMessage(`go depth 5`);
            } catch (err) {
                this.handleWorkerCrash(worker);
                finish();
            }
        });
    }

    parseScoreFromInfo(lines, sideToMove = 'w') {
        let score = 0;
        const perspective = sideToMove === 'b' ? -1 : 1;

        for(let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];

            if(
                typeof line !== 'string' ||
                !line.startsWith('info') ||
                !line.includes('score')
            ) {
                continue;
            }

            const parts = line.split(/\s+/);
            const scoreIdx = parts.indexOf('score');

            if(scoreIdx === -1) {
                continue;
            }

            const type = parts[scoreIdx + 1];
            const value = parseInt(
                parts[scoreIdx + 2],
                10
            );

            if(!Number.isFinite(value)) {
                continue;
            }

            if(type === 'cp') {
                score = (value / 100) * perspective;
                break;
            }

            if(type === 'mate') {
                score = (value > 0 ? 100 : -100) * perspective;
                break;
            }
        }

        return score;
    }

    async evaluatePosition(worker, fen, sideToMove = 'w') {
        const lines =
            await this.evaluateWithWorker(
                worker,
                fen
            );

        return this.parseScoreFromInfo(lines, sideToMove);
    }

    async getDynamicEval() {
        const myToken = this._cancelToken;

        await this.waitForEngine();

        if(myToken !== this._cancelToken) {
            return {};
        }

        const results = {};

        let parsed;

        try {
            parsed = this.parseFen(this.fen);
        } catch (err) {
            return results;
        }

        const { rows, remainder } = parsed;

        const sideToMove = remainder.split(/\s+/)[0] === 'b' ? 'b' : 'w';
        const normalizedFen = `${rows.join('/')} ${remainder}`;

        const activeSquares =
            this.getActiveSquares(rows);

        if(activeSquares.length === 0) {
            return results;
        }

        const baseScore =
            await this.evaluatePosition(
                this.engines[0],
                normalizedFen,
                sideToMove
            );

        if(myToken !== this._cancelToken) {
            return results;
        }

        let nextIndex = 0;

        const workerLoop = async (worker) => {
            while(true) {
                if(myToken !== this._cancelToken) {
                    return;
                }

                const index = nextIndex++;

                if(index >= activeSquares.length) {
                    return;
                }

                const target =
                    activeSquares[index];

                try {
                    const {
                        newFen,
                        piece
                    } = this.removePieceFromFen(
                        normalizedFen,
                        target.square
                    );

                    const scoreWithoutPiece =
                        await this.evaluatePosition(
                            worker,
                            newFen,
                            sideToMove
                        );

                    if(myToken !== this._cancelToken) {
                        return;
                    }

                    const isWhitePiece =
                        piece === piece.toUpperCase();

                    let dynamicValue;

                    if(isWhitePiece) {
                        dynamicValue =
                            baseScore -
                            scoreWithoutPiece;
                    } else {
                        dynamicValue =
                            scoreWithoutPiece -
                            baseScore;
                    }

                    if(
                        !Number.isFinite(
                            dynamicValue
                        ) ||
                        dynamicValue < 0
                    ) {
                        dynamicValue = 0;
                    }

                    results[target.square] = {
                        piece,
                        eval: Number(
                            dynamicValue.toFixed(2)
                        ),
                        cp: Math.round(
                            dynamicValue * 100
                        )
                    };
                } catch (err) {}
            }
        };

        await Promise.all(
            this.engines.map(worker =>
                workerLoop(worker)
            )
        );

        return results;
    }

    eval(callback) {
        this.getDynamicEval()
            .then(result => {
                if(typeof callback === 'function') {
                    callback(result);
                }
            })
            .catch(err => {
                if(typeof callback === 'function') {
                    console.error(err);
                    callback({});
                }
            });
    }

    terminate() {
        this.terminateEngines();
    }
}