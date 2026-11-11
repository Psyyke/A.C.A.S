import createLc0 from './dist/lc0.js';
import { installWorkerProxy } from './worker-tree.js';
import { lc0ConfigContents } from '../text-files.js';

installWorkerProxy();

let engine;
let state = 'new';
let lastDiagnostic = '';
const recentDiagnostics = [];
const plainText = line => line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');

self.onmessage = async ({ data }) => {
    let startedInitialization = false;
    try {
        if(!data || typeof data !== 'object') throw new Error('Expected an Lc0 worker message.');
        if(data.type === 'initialize') {
            if(state !== 'new') throw new Error('Lc0 cannot be initialized more than once.');
            if(!(data.weights instanceof ArrayBuffer) || !data.weights.byteLength)
                throw new Error('An Lc0 weights file is required.');
            if(!self.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined')
                throw new Error('Lc0 requires cross-origin isolation and SharedArrayBuffer.');
            if(data.provider != null && !['wasm', 'webgpu'].includes(data.provider))
                throw new Error('Expected the webgpu or wasm inference provider.');
            if(data.inferenceDataType != null && !['f32', 'f16', 'f16-mixed'].includes(data.inferenceDataType))
                throw new Error('Expected the f32, f16 or f16-mixed inference data type.');
            if(data.inferenceDataType === 'f16' && data.provider !== 'webgpu')
                throw new Error('Float16 inference requires the WebGPU provider.');
            if(data.inferenceDataType === 'f16-mixed' && !data.provider)
                throw new Error('Float16 weight storage requires the WebGPU or WASM ONNX provider.');
            const configText = lc0ConfigContents(data.configText ?? '');
            state = 'initializing';
            startedInitialization = true;
            const browserBackend = data.provider != null
                ? await (await import('./browser-inference.js')).createBrowserInference(data.weights, data.provider, message => {
                    state = 'failed';
                    self.postMessage({ type: 'error', message });
                }, data.inferenceDataType)
                : undefined;
            const weights = browserBackend ? browserBackend.weights : data.weights;
            engine = await createLc0({
                ...(configText.trim() ? {
                    arguments: ['--config=/acas-lc0.config'],
                    preRun: module => module.FS.writeFile('/acas-lc0.config', configText)
                } : {}),
                browserInference: browserBackend?.inference,
                print: line => self.postMessage({
                    type: 'uci',
                    line: plainText(line).replace(/^bestmove a1a1(?=\s|$)/, 'bestmove 0000')
                }),
                printErr: line => {
                    lastDiagnostic = plainText(line);
                    recentDiagnostics.push(lastDiagnostic);
                    if(recentDiagnostics.length > 10) recentDiagnostics.shift();
                    self.postMessage({ type: 'log', line: lastDiagnostic });
                },
                onExit: code => {
                    if(state === 'closed' || state === 'failed') return;
                    state = 'failed';
                    self.postMessage({ type: 'error', message: `Lc0 exited (${code}): ${recentDiagnostics.join('\n') || 'engine stopped unexpectedly.'}` });
                },
                onAbort: message => {
                    state = 'failed';
                    self.postMessage({ type: 'error', message: String(message || lastDiagnostic || 'Lc0 aborted.') });
                }
            });
            if(state === 'failed') throw new Error('Lc0 initialization aborted.');
            engine.FS.writeFile('/network.pb', new Uint8Array(weights), { canOwn: true });
            engine.ccall('lc0_send', null, ['string'], ['setoption name WeightsFile value /network.pb']);
            if(browserBackend)
                engine.ccall('lc0_send', null, ['string'], ['setoption name Backend value browser-onnx']);
            state = 'ready';
            self.postMessage({ type: 'ready' });
        } else if(data.type === 'uci') {
            if(state !== 'ready') throw new Error('Lc0 is not ready.');
            if(typeof data.line !== 'string' || /[\r\n\0]/.test(data.line))
                throw new Error('Expected one UCI command.');
            if(/^\s*setoption\s+name\s+(?:weightsfile|backend)(?:\s+value(?:\s|$)|\s*$)/i.test(data.line))
                throw new Error('Create a new Lc0 worker to change weights or backend.');
            engine.ccall('lc0_send', null, ['string'], [data.line]);
            if(data.line.trim() === 'quit') state = 'closed';
        } else {
            throw new Error(`Unknown Lc0 worker message: ${String(data.type)}`);
        }
    } catch(error) {
        if(startedInitialization) state = 'failed';
        const message = error instanceof Error ? error.message : String(error);
        self.postMessage({ type: 'error', message: message || lastDiagnostic || 'Lc0 worker failed.' });
    }
};
