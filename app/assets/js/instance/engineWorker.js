import { getFusionIdentitySeed } from '../misc/fusionIdentity.js';

const stockfishEngines = new Set([
    'stockfish-19', 'stockfish-19-lite-single', 'stockfish-18-single',
    'stockfish-18-lite-single', 'stockfish-17-single', 'stockfish-17-lite-single',
    'stockfish-11', 'stockfish-8'
]);

const wrappedEngines = {
    'stockfish-16-1-wasm': { path: 'lila-stockfish/16-0-worker', commandMethod: 'uci' },
    'fairy-stockfish-nnue-wasm': { path: 'fairy-stockfish-nnue.wasm/stockfishWorker', commandMethod: 'postMessage', module: false },
    'lc0': { path: 'zerofish/zerofishWorker', commandMethod: 'zero' },
    'acas-fusion': { path: 'Fusion/fusionWorker', commandMethod: 'uci' },
    'maia3': { path: 'Maia3/acasWorker', commandMethod: 'uci', poll: false },
    'maia2': { path: 'Maia2/worker', commandMethod: 'uci' }
};

export function getEngineWorkerConfig(engineName) {
    if(stockfishEngines.has(engineName)) {
        return { path: `${engineName}/${engineName}`, readiness: 'message' };
    }
    if(engineName === 'lozza-5' || engineName === 'lozza-9') {
        return { path: `Lozza/${engineName}`, readiness: 'immediate' };
    }
    const wrapped = Object.hasOwn(wrappedEngines, engineName) ? wrappedEngines[engineName] : wrappedEngines.maia3;
    return { readiness: 'flag', module: true, poll: true, ...wrapped };
}

// Keep worker transport and loading bookkeeping independent of the instance UI.
export default function loadEngineWorker(config, {
    type, profileName, pendingLoads, isCurrent, onReady, onMessage, onError
}) {
    const identity = type === 'acas-fusion' ? `?identitySeed=${getFusionIdentitySeed()}` : '';
    const url = `../app/assets/engines/${config.path}.js${identity}`;
    const worker = config.module ? new Worker(url, { type: 'module' }) : new Worker(url);
    const entry = { worker, intervalId: null, profileName };
    let ready = false;
    let failed = false;

    pendingLoads.add(entry);

    const finishLoad = () => {
        clearInterval(entry.intervalId);
        pendingLoads.delete(entry);
    };
    const abandonLoad = () => {
        finishLoad();
        worker.terminate();
    };
    const fail = error => {
        if(failed) return;
        failed = true;
        abandonLoad();
        if(isCurrent()) onError(error);
    };
    const registerEngine = () => {
        if(ready) return;
        ready = true;
        finishLoad();
        const engine = {
            type, worker, profileName,
            engine: config.commandMethod
                ? (method, args) => worker.postMessage({ method, args: [...args] })
                : (method, args) => worker[method](...args),
            sendMsg: config.commandMethod
                ? msg => worker.postMessage({ method: config.commandMethod, args: [msg] })
                : msg => worker.postMessage(msg)
        };
        try {
            Promise.resolve(onReady(engine)).catch(fail);
        } catch(error) {
            fail(error);
        }
    };

    worker.onmessage = event => {
        if(failed) return;
        if(!isCurrent()) { abandonLoad(); return; }
        if(config.readiness === 'flag') {
            if(event.data === true) registerEngine();
            else if(event.data) onMessage(event.data);
        } else {
            registerEngine();
            onMessage(event.data);
        }
    };
    worker.onerror = fail;

    if(config.poll) {
        entry.intervalId = setInterval(() => {
            if(!isCurrent()) { abandonLoad(); return; }
            worker.postMessage({ method: 'acas_check_loaded' });
        }, 100);
    }
    if(config.readiness === 'immediate') registerEngine();

    return worker;
}
