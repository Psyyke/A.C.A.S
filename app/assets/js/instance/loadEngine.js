export default async function loadEngine(profileName, engineName, attempt = 0) {
    const profileObj = await getProfile(profileName);
    const profileChessEngine = engineName || profileObj.config.chessEngine;
    const isReload = attempt > 0;
    let alreadyRestarted = false;

    if(isReload) console.warn('RELOAD ATTEMPT', attempt, '-> Loading engine', engineName, profileName);

    if(engineName && attempt > 300) {
        toast.warning(`Restarting the engine ${engineName} failed despite many attempts :(\n\nRefresh A.C.A.S!`);
        
        return;
    }

    const processEngineMessage = msg => {
        try {
            this.engineMessageProcessor(msg, profileName);
        } catch(e) {
            console.error('Engine', this.instanceID, profileName, 'error:', e);
        }
    };

    if(await isEngineIncompatible(profileChessEngine, profileName)) {
        toast.warning(`The engine "${profileChessEngine}" you have selected on profile "${profileName}" is incompatible with the mode A.C.A.S was launched in.` 
            + '\n\nPlease change the engine on the settings.', 3e4);
        return;
    }

    function restartEngine(name, e) {
        if(alreadyRestarted) return;

        if(!e?.message?.includes('memory access')) {
            if(!e?.message?.includes('[object ErrorEvent]')) {
                if(attempt % 10 === 0) {
                    toast.error(`Engine "${name}" crashed due to "${e?.message}"!`, 5e3);
                }
            } else return;
        }

        console.error(`Restarting the engine "${name}" due to the error:`, e);

        alreadyRestarted = true;

        const engineObjectIdx = this.engines.findIndex(x => x.type === name);

        // Ask engine to quit if it can still listen
        this.sendMsgToEngine('quit', name); 
        // Try to terminate the engine worker
        this.engines?.[engineObjectIdx]?.worker?.terminate();
        // Delete previous engine object
        delete this.engines?.[engineObjectIdx]; 
        
        // Filter out empty from the array
        this.engines = this.engines.filter(x => x);

        console.error('RESTARTING engine', name, profileName);
        this.loadEngine(profileName, name, attempt + 1);
    }

    async function startGame(variant = 'chess') {
        const currentFen = await USERSCRIPT.instanceVars.fen.get(this.instanceID);
        const fen = currentFen || this.variantStartPosFen;

        await this.engineStartNewGame(variant, profileName);

        this.calculateBestMoves(fen, true);
    }
    
    function loadStockfish(folderName, fileName = folderName) {
        const stockfish = new Worker(`../app/assets/engines/${folderName}/${fileName}.js`);
        let stockfish_loaded = false;

        stockfish.onmessage = async e => {
            if(!stockfish_loaded) {
                stockfish_loaded = true;

                this.engines.push({
                    'type': profileChessEngine,
                    'engine': (method, a) => stockfish[method](...a),
                    'sendMsg': msg => stockfish.postMessage(msg),
                    'worker': stockfish,
                    profileName
                });
    
                startGame.bind(this)();
            }

            processEngineMessage(e.data);
        };

        stockfish.onerror = e => {
            restartEngine.bind(this)(folderName, e);
        };
    }

    function loadLilaStockfish(workerName) {
        const stockfish = new Worker(`../app/assets/engines/lila-stockfish/${workerName}.js`, { type: 'module' });
        let stockfish_loaded = false;

        stockfish.onmessage = async e => {
            if(e.data === true) {
                stockfish_loaded = true;

                this.engines.push({
                    'type': profileChessEngine,
                    'engine': (method, a) => stockfish.postMessage({ method: method, args: [...a] }),
                    'sendMsg': msg => stockfish.postMessage({ method: 'uci', args: [msg] }),
                    'worker': stockfish,
                    profileName
                });

                startGame.bind(this)(workerName === 'f14-worker' 
                    ? formatVariant(this.pV[profileName].chessVariant)
                    : 'chess');
            } else if (e.data) {
                processEngineMessage(e.data);
            }
        };

        const waitStockfish = setInterval(() => {
            if(stockfish_loaded) {
                clearInterval(waitStockfish);
                return;
            }

            stockfish.postMessage({ method: 'acas_check_loaded' });
        }, 100);
    }

    function loadLc0() {
        const lc0 = new Worker('../app/assets/engines/zerofish/zerofishWorker.js', { type: 'module' });
        let lc0_loaded = false;

        lc0.onmessage = async e => {
            if(e.data === true) {
                lc0_loaded = true;

                this.engines.push({
                    'type': profileChessEngine,
                    'engine': (method, a) => lc0.postMessage({ method: method, args: [...a] }),
                    'sendMsg': msg => lc0.postMessage({ method: 'zero', args: [msg] }),
                    'worker': lc0,
                    profileName
                });

                await this.setEngineWeight(this.pV[profileName].lc0WeightName, profileName);
    
                this.engineStartNewGame('chess', profileName);
            } else if (e.data) {
                processEngineMessage(e.data);
            }
        };

        const waitLc0 = setInterval(() => {
            if(lc0_loaded) {
                clearInterval(waitLc0);
                return;
            }

            lc0.postMessage({ method: 'acas_check_loaded' });
        }, 100);

        lc0.onerror = e => {
            restartEngine.bind(this)('lc0', e);
        };
    }

    function loadFusion() {
        const Fusion = new Worker('../app/assets/engines/Fusion/fusionWorker.js', { type: 'module' });
        let fusion_loaded = false;

        Fusion.onmessage = async e => {
            if(e.data === true) {
                fusion_loaded = true;

                this.engines.push({
                    'type': profileChessEngine,
                    'engine': (method, a) => Fusion.postMessage({ method: method, args: [...a] }),
                    'sendMsg': msg => Fusion.postMessage({ method: 'uci', args: [msg] }),
                    'worker': Fusion,
                    profileName
                });
    
                this.engineStartNewGame('chess', profileName);
            } else if (e.data) {
                processEngineMessage(e.data);
            }
        };

        const waitFusion = setInterval(() => {
            if(fusion_loaded) {
                clearInterval(waitFusion);
                return;
            }

            Fusion.postMessage({ method: 'acas_check_loaded' });
        }, 100);

        Fusion.onerror = e => {
            restartEngine.bind(this)('acas-fusion', e);
        };
    }

    function loadLozza() {
        const lozza = new Worker('../app/assets/engines/Lozza/lozza-5-acas.js');
        let lozza_loaded = false;

        lozza.onmessage = async e => {
            if(!lozza_loaded) {
                lozza_loaded = true;

                this.engines.push({
                    'type': profileChessEngine,
                    'engine': (method, a) => lozza[method](...a),
                    'sendMsg': msg => lozza.postMessage(msg),
                    'worker': lozza,
                    profileName
                });

                startGame.bind(this)();
            } else if (e.data) {
                processEngineMessage(e.data);
            }
        };

        lozza.onerror = e => {
            restartEngine.bind(this)('lozza-5', e);
        };
    }

    function loadMaia2() {
        const maia = new Worker('../app/assets/engines/Maia2/worker.js', { type: 'module' });
        let maia_loaded = false;

        maia.onmessage = async e => {
            if(e.data === true) {
                maia_loaded = true;

                this.engines.push({
                    'type': profileChessEngine,
                    'engine': (method, a) => maia.postMessage({ method: method, args: [...a] }),
                    'sendMsg': msg => maia.postMessage({ method: 'uci', args: [msg] }),
                    'worker': maia,
                    profileName
                });
    
                this.engineStartNewGame('chess', profileName);
            } else if (e.data) {
                processEngineMessage(e.data);
            }
        };

        const waitMaia = setInterval(() => {
            if(maia_loaded) {
                clearInterval(waitMaia);
                return;
            }

            maia.postMessage({ method: 'acas_check_loaded' });
        }, 100);

        maia.onerror = e => {
            restartEngine.bind(this)('maia2', e);
        };
    }
    
    // When using loadStockfish(folderName, fileName), make sure the folder name
    // is exactly the same as the switch case string, since otherwise reloading wont work
    // Stockfish 17 singlethreaded lite is the default
    switch(profileChessEngine) {
        case 'stockfish-18-lite-single':
            loadStockfish.bind(this)('stockfish-18-lite-single');
            break;

        case 'stockfish-17-wasm':
            loadLilaStockfish.bind(this)('17-1-worker');
            break;

        case 'stockfish-17-single':
            loadStockfish.bind(this)('stockfish-17-single');
            break;

        case 'stockfish-16-1-wasm':
            loadLilaStockfish.bind(this)('16-0-worker');
            break;

        case 'stockfish-11':
            loadStockfish.bind(this)('stockfish-11');
            break;

        case 'stockfish-8':
            loadStockfish.bind(this)('stockfish-8');
            break;

        case 'fairy-stockfish-nnue-wasm': 
            loadLilaStockfish.bind(this)('f14-worker');
            break;

        case 'lozza-5':
            loadLozza.bind(this)();
            break;

        case 'lc0':
            loadLc0.bind(this)();
            break;

        case 'acas-fusion':
            loadFusion.bind(this)();
            break;

        case 'maia2':
            loadMaia2.bind(this)();
            break;

        default:
            loadStockfish.bind(this)('stockfish-17-lite-single');
            break;
    }
}