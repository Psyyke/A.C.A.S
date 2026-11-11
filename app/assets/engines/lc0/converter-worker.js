import createLc0 from './dist/lc0.js';
import { installWorkerProxy } from './worker-tree.js';

installWorkerProxy();

let state = 'new';
let moduleInstance;
let lastDiagnostic = '';
const plainText = line => line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');

function fail(message) {
    if(state === 'finished') return;
    state = 'finished';
    const detail = typeof message === 'string' ? message : message?.message;
    self.postMessage({ type: 'error', message: String(detail || lastDiagnostic || 'Lc0 conversion failed. See conversion details.') });
}

self.onmessage = async ({ data }) => {
    if(state !== 'new') {
        self.postMessage({ type: 'error', message: 'A converter worker can only be used once.' });
        return;
    }
    if(!data || data.type !== 'convert' || !(data.weights instanceof ArrayBuffer) || !data.weights.byteLength) {
        self.postMessage({ type: 'error', message: 'A nonempty Lc0 weights file is required.' });
        return;
    }
    if(!self.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
        self.postMessage({ type: 'error', message: 'Lc0 requires cross-origin isolation and SharedArrayBuffer.' });
        return;
    }
    if(data.dataType != null && !['f32', 'f16', 'f16-mixed'].includes(data.dataType)) {
        self.postMessage({ type: 'error', message: 'Expected the f32, f16 or f16-mixed ONNX data type.' });
        return;
    }
    state = 'converting';
    try {
        await createLc0({
            arguments: ['leela2onnx', '--input=/input.pb', '--output=/output.onnx',
                `--onnx-data-type=${data.dataType === 'f16-mixed' ? 'f32' : data.dataType || 'f32'}`,
                ...(data.dataType === 'f16-mixed' ? ['--onnx-fp16-weights'] : [])],
            preRun: module => {
                moduleInstance = module;
                module.FS.writeFile('/input.pb', new Uint8Array(data.weights), { canOwn: true });
            },
            print: line => self.postMessage({ type: 'log', line: plainText(line) }),
            printErr: line => {
                lastDiagnostic = plainText(line);
                self.postMessage({ type: 'log', line: lastDiagnostic });
            },
            onAbort: message => fail(message || lastDiagnostic || 'Lc0 conversion aborted.'),
            onExit: code => {
                if(state === 'finished') return;
                if(code !== 0) {
                    fail(`Lc0 conversion failed with exit code ${code}.${lastDiagnostic ? ` ${lastDiagnostic}` : ''}`);
                    return;
                }
                try {
                    const output = moduleInstance.FS.readFile('/output.onnx');
                    if(!output.byteLength) throw new Error('Lc0 produced an empty ONNX file.');
                    moduleInstance.FS.unlink('/input.pb');
                    if(data.returnWeights === true) {
                        self.postMessage({ type: 'converted', output: output.buffer, weights: data.weights },
                            [output.buffer, data.weights]);
                    } else {
                        self.postMessage({ type: 'converted', output: output.buffer }, [output.buffer]);
                    }
                    state = 'finished';
                } catch(error) {
                    fail(error);
                }
            }
        });
    } catch(error) {
        fail(error instanceof Error ? error.message : error);
    }
};
