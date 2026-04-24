import { setProfileBubbleStatus } from '../gui/profiles.js';

export default async function loadEngine(profileName, engineName, attempt = 0) {
    const profileObj = await GET_PROFILE(profileName);
    const profileChessEngine = engineName || profileObj.config.chessEngine;
    const isReload = attempt > 0;
    let alreadyRestarted = false;

    if(isReload) {
        setProfileBubbleStatus('error', profileName, 'Engine crashed and engine is trying to reload...');

        console.warn('RELOAD ATTEMPT', attempt, '-> Loading engine', engineName, profileName);
    }

    if(engineName && attempt > 10) {
        toast.warning(`Restarting the engine ${engineName} failed despite many attempts :(\n\nRefresh A.C.A.S!`);
        
        setProfileBubbleStatus('error', profileName, 'Engine crashed, could not restart it.');

        return;
    }

    const processEngineMessage = msg => {
        try {
            this.engineMessageProcessor(msg, profileName);
        } catch(e) {
            console.error('Engine', this.instanceID, profileName, 'error:', e);
        }
    };

    function restartEngine(name, e) {
        if(alreadyRestarted) return;

        setProfileBubbleStatus('warning', profileName, `Restarting the instance due to the error: ${e?.message}`);
        console.error(`Restarting the instance "${name}" due to the error:`, e);

        this.close(); // closing whole instance!
    }

    async function startGame(variant = 'chess') {
        const currentFen = await USERSCRIPT.instanceVars.fen.get(this.instanceID);
        const fen = currentFen || this.variantStartPosFen;

        await this.engineStartNewGame(variant, profileName);
        await WAIT_UNTIL_VAR(() => this.instanceReady);

        this.calculateBestMoves(fen, { 'skipValidityChecks': true, 'specificProfileName': profileName });
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

    function loadFairyStockfish() {
        const stockfish = new Worker(`../app/assets/engines/fairy-stockfish-nnue.wasm/stockfishWorker.js`);
        let stockfish_loaded = false;

        stockfish.onmessage = async e => {
            if(e.data === true) {
                stockfish_loaded = true;

                this.engines.push({
                    'type': profileChessEngine,
                    'engine': (method, a) => stockfish.postMessage({ method: method, args: [...a] }),
                    'sendMsg': msg => stockfish.postMessage({ method: 'postMessage', args: [msg] }),
                    'worker': stockfish,
                    profileName
                });

                startGame.bind(this)(FORMAT_VARIANT(this.pV[profileName].chessVariant));
            } else if(e.data) {
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

        stockfish.onerror = e => {
            restartEngine.bind(this)('fairy-stockfish-nnue-wasm', e);
        };
    }

    function loadLilaStockfish(workerName, engineName) {
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

                startGame.bind(this)('chess');
            } else if(e.data) {
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

        stockfish.onerror = e => {
            restartEngine.bind(this)(engineName, e);
        };
    }

    function loadLc0() {
        const lc0 = new Worker('../app/assets/engines/zerofish/zerofishWorker.js', { type: 'module' });
        let lc0_loaded = false;

        lc0.onmessage = async e => {
            if(e.data === true && !lc0_loaded) {
                lc0_loaded = true;

                this.engines.push({
                    'type': profileChessEngine,
                    'engine': (method, a) => lc0.postMessage({ method: method, args: [...a] }),
                    'sendMsg': msg => lc0.postMessage({ method: 'zero', args: [msg] }),
                    'worker': lc0,
                    profileName
                });

                await this.setEngineWeight(this.pV[profileName].lc0WeightName, profileName);
    
                startGame.bind(this)();
            } else if(e.data) {
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
    
                startGame.bind(this)();
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

    function loadLozza(version) {
        const lozza = new Worker(`../app/assets/engines/Lozza/lozza-${version}.js`);

        lozza.onmessage = e => processEngineMessage(e.data);
        lozza.onerror = e => restartEngine('lozza-' + version, e);

        this.engines.push({
            'type': profileChessEngine,
            'engine': (method, a) => lozza[method](...a),
            'sendMsg': msg => lozza.postMessage(msg),
            'worker': lozza,
            profileName
        });

        startGame.bind(this)();
    }

    function loadMaia3() {
        const maia = new Worker('../app/assets/engines/Maia3/acasWorker.js', { type: 'module' });
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
    
                startGame.bind(this)();
            } else if (e.data) {
                processEngineMessage(e.data);
            }
        };

        maia.onerror = e => {
            restartEngine.bind(this)('maia3', e);
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
    
                startGame.bind(this)();
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
    // "Maia 2" is the default
    switch(profileChessEngine) {
        case 'stockfish-18-lite-single':
            loadStockfish.bind(this)('stockfish-18-lite-single');
            break;

        case 'stockfish-17-single':
            loadStockfish.bind(this)('stockfish-17-single');
            break;

        case 'stockfish-17-lite-single':
            loadStockfish.bind(this)('stockfish-17-lite-single');
            break;

        case 'stockfish-16-1-wasm':
            loadLilaStockfish.bind(this)('16-0-worker', 'stockfish-16-1-wasm');
            break;

        case 'stockfish-11':
            loadStockfish.bind(this)('stockfish-11');
            break;

        case 'stockfish-8':
            loadStockfish.bind(this)('stockfish-8');
            break;

        case 'fairy-stockfish-nnue-wasm':
            loadFairyStockfish.bind(this)();
            break;

        case 'lozza-5':
            loadLozza.bind(this)(5);
            break;

        case 'lozza-9':
            loadLozza.bind(this)(9);
            break;

        case 'lc0':
            loadLc0.bind(this)();
            break;

        case 'acas-fusion':
            loadFusion.bind(this)();
            break;

        case 'maia3':
            loadMaia3.bind(this)();
            break;

        default:
            loadMaia2.bind(this)();
            break;
    }
}