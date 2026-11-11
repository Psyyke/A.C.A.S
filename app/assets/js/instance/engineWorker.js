import { getFusionIdentitySeed } from '../misc/fusionIdentity.js';
import { createWorkerTree } from '../../engines/lc0/worker-tree.js';

const stockfishEngines = new Set([
    'stockfish-19', 'stockfish-19-lite-single', 'stockfish-18-single',
    'stockfish-18-lite-single', 'stockfish-17-single', 'stockfish-17-lite-single',
    'stockfish-11', 'stockfish-8'
]);

const wrappedEngines = {
    'stockfish-16-1-wasm': { path: 'lila-stockfish/16-0-worker', commandMethod: 'uci' },
    'fairy-stockfish-nnue-wasm': { path: 'fairy-stockfish-nnue.wasm/stockfishWorker', commandMethod: 'postMessage', module: false, initializeFiles: true },
    'lc0': { path: 'zerofish/zerofishWorker', commandMethod: 'zero' },
    'modern-lc0': { path: 'lc0/worker', readiness: 'lc0', poll: false },
    'modern-lc0-webgpu': { path: 'lc0/worker', readiness: 'lc0', poll: false, provider: 'webgpu' },
    'lc0-v0.32.1': { path: 'lc0/worker', readiness: 'lc0', poll: false },
    'lc0-v0.32.1-wasm': { path: 'lc0/worker', readiness: 'lc0', poll: false },
    'lc0-v0.32.1-webgpu': { path: 'lc0/worker', readiness: 'lc0', poll: false, provider: 'webgpu' },
    'rodent-v': { path: 'rodent-v/worker', module: false, poll: false, initializeFiles: true },
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
    type, profileName, pendingLoads, isCurrent, onReady, onMessage, onError, loadWeights, modelId, modelProvider, textFiles = {}
}) {
    const identity = type === 'acas-fusion' ? `?identitySeed=${getFusionIdentitySeed()}`
        : type === 'maia3' && modelId ? `?modelId=${encodeURIComponent(modelId)}&provider=${encodeURIComponent(modelProvider || 'wasm')}` : '';
    const url = `../app/assets/engines/${config.path}.js${identity}`;
    const worker = config.readiness === 'lc0' ? createWorkerTree(url, { type: 'module' })
        : config.module ? new Worker(url, { type: 'module' }) : new Worker(url);
    const entry = { worker, intervalId: null, profileName, abort: new AbortController() };
    let ready = false;
    let failed = false;

    pendingLoads.add(entry);

    const finishLoad = () => {
        clearInterval(entry.intervalId);
        pendingLoads.delete(entry);
    };
    if(config.readiness === 'lc0') {
        const terminate = worker.terminate.bind(worker);
        worker.terminate = () => {
            entry.abort.abort();
            finishLoad();
            terminate();
        };
    }
    const abandonLoad = () => {
        entry.abort.abort();
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
            type, worker, profileName, textFiles,
            engine: config.commandMethod
                ? (method, args) => worker.postMessage({ method, args: [...args] })
                : (method, args) => worker[method](...args),
            sendMsg: config.readiness === 'lc0'
                ? line => worker.postMessage({ type: 'uci', line })
                : config.commandMethod
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
        if(failed || entry.abort.signal.aborted) return;
        if(!isCurrent()) { abandonLoad(); return; }
        if(config.readiness === 'lc0') {
            const data = event.data;
            if(data?.type === 'ready') registerEngine();
            else if(data?.type === 'error') fail(new Error(data.message || 'Lc0 worker failed.'));
            else if(data?.type === 'uci' && data.line?.startsWith('error '))
                fail(new Error(data.line));
            else if(data?.type === 'uci') onMessage(data.line);
            else if(data?.type === 'log') console.info('[Lc0]', data.line);
        } else if(config.readiness === 'flag') {
            if(event.data === true) registerEngine();
            else if(event.data?.type === 'error') fail(new Error(event.data.message || 'Engine worker failed.'));
            else if(event.data) onMessage(event.data);
        } else {
            registerEngine();
            onMessage(event.data);
        }
    };
    worker.onerror = fail;
    worker.onmessageerror = () => fail(new Error('Engine worker returned an unreadable message.'));

    if(config.readiness === 'lc0') {
        Promise.resolve().then(() => loadWeights(entry.abort.signal)).then(weights => {
            if(failed || !isCurrent() || entry.abort.signal.aborted) {
                abandonLoad();
                return;
            }
            if(!(weights instanceof ArrayBuffer) || !weights.byteLength)
                throw new Error('Lc0 weights file is empty or invalid.');
            const message = { type: 'initialize', weights };
            if(config.provider) message.provider = config.provider;
            if(textFiles.ConfigFile) message.configText = textFiles.ConfigFile;
            worker.postMessage(message, [weights]);
        }).catch(error => {
            if(!entry.abort.signal.aborted) fail(error);
        });
    }

    if(config.initializeFiles) worker.postMessage({ type: 'initialize-files', files: textFiles });

    if(config.poll) {
        entry.intervalId = setInterval(() => {
            if(!isCurrent()) { abandonLoad(); return; }
            worker.postMessage({ method: 'acas_check_loaded' });
        }, 100);
    }
    if(config.readiness === 'immediate') registerEngine();

    return worker;
}
