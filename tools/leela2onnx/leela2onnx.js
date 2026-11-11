const form = document.querySelector('#converter-form');
const weights = document.querySelector('#weights');
const chooseWeights = document.querySelector('#choose-weights');
const weightsName = document.querySelector('#weights-name');
const precision = document.querySelector('#precision');
const convert = document.querySelector('#convert');
const cancel = document.querySelector('#cancel');
const download = document.querySelector('#download');
const status = document.querySelector('#status');
const log = document.querySelector('#log');
const diagnostics = document.querySelector('#diagnostics');
let worker;
let workerErrorTimer;
let outputUrl;
let ready = false;
let generation = 0;

function setStatus(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
    if(error) diagnostics.open = true;
}

function finish() {
    clearTimeout(workerErrorTimer);
    workerErrorTimer = undefined;
    if(worker) worker.terminate();
    worker = undefined;
    convert.disabled = !ready;
    weights.disabled = false;
    chooseWeights.disabled = false;
    precision.disabled = false;
    cancel.hidden = true;
}

function clearDownload() {
    if(outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = undefined;
    download.hidden = true;
    download.removeAttribute('href');
}

async function prepare() {
    convert.disabled = true;
    if(!window.isSecureContext) throw new Error('A secure HTTPS connection or localhost is required.');
    if(!navigator.serviceWorker) throw new Error('This browser does not support the service worker needed by the converter.');
    const registration = await navigator.serviceWorker.register('./coi-serviceworker.js');
    const scriptUrl = new URL('./coi-serviceworker.js', location.href).href;
    const reloadKey = `lc0-isolation-reload:${scriptUrl}`;
    const isControlled = () => navigator.serviceWorker.controller?.scriptURL === scriptUrl;
    if(!isControlled()) {
        if(!registration.active) {
            await new Promise((resolve, reject) => {
                const installing = registration.installing || registration.waiting;
                if(!installing) {
                    reject(new Error('The isolation service worker has no active or installing version.'));
                    return;
                }
                const timer = setTimeout(() => {
                    installing.removeEventListener('statechange', onChange);
                    reject(new Error('The isolation service worker did not activate. Reload the page and check browser settings.'));
                }, 15000);
                const onChange = () => {
                    if(installing.state !== 'activated' && installing.state !== 'redundant') return;
                    clearTimeout(timer);
                    installing.removeEventListener('statechange', onChange);
                    if(installing.state === 'redundant') reject(new Error('The isolation service worker failed to install.'));
                    else resolve();
                };
                installing.addEventListener('statechange', onChange);
                onChange();
            });
        }
        if(sessionStorage.getItem(reloadKey))
            throw new Error('The isolation service worker is active but cannot control this page. Check browser service worker settings.');
        sessionStorage.setItem(reloadKey, '1');
        location.reload();
        return;
    }
    sessionStorage.removeItem(reloadKey);
    if(!crossOriginIsolated) throw new Error('The page is not cross-origin isolated. Check your server isolation headers or service worker.');
    if(typeof SharedArrayBuffer === 'undefined') throw new Error('SharedArrayBuffer is unavailable in this browser.');
    ready = true;
    convert.disabled = false;
    setStatus('Ready.');
}

prepare().catch(error => setStatus(`Could not start: ${error.message}`, true));

form.addEventListener('submit', async event => {
    event.preventDefault();
    if(!ready || worker) return;
    const file = weights.files[0];
    if(!file || !file.size) {
        setStatus('Choose a nonempty Lc0 weights file.', true);
        return;
    }
    const run = ++generation;
    clearDownload();
    log.textContent = '';
    diagnostics.open = false;
    convert.disabled = true;
    weights.disabled = true;
    chooseWeights.disabled = true;
    precision.disabled = true;
    cancel.hidden = false;
    setStatus('Reading weights...');
    try {
        const bytes = await file.arrayBuffer();
        if(run !== generation) return;
        worker = new Worker(new URL('./runtime/converter-worker.js', import.meta.url), { type: 'module' });
        worker.onerror = event => {
            if(run !== generation) return;
            const message = event.message || 'Could not load or run the worker.';
            log.textContent += `Worker error: ${message}\n`;
            clearTimeout(workerErrorTimer);
            workerErrorTimer = setTimeout(() => {
                if(run !== generation) return;
                setStatus(`Conversion failed: worker error: ${message}`, true);
                finish();
            }, 100);
        };
        worker.onmessageerror = () => {
            if(run !== generation) return;
            setStatus('Converter worker returned an unreadable message.', true);
            finish();
        };
        worker.onmessage = ({ data }) => {
            if(run !== generation) return;
            if(data.type === 'log') {
                log.textContent += `${data.line}\n`;
            } else if(data.type === 'error') {
                setStatus(`Conversion failed: ${data.message}`, true);
                finish();
            } else if(data.type === 'converted') {
                if(!(data.output instanceof ArrayBuffer) || !data.output.byteLength) {
                    setStatus('Conversion failed: the converter returned an empty or invalid file.', true);
                } else {
                    try {
                        outputUrl = URL.createObjectURL(new Blob([data.output], { type: 'application/octet-stream' }));
                        download.href = outputUrl;
                        download.download = `${file.name.replace(/(?:\.pb)?\.gz$|\.pb$/i, '') || 'network'}.onnx`;
                        download.hidden = false;
                        setStatus('Conversion complete.');
                    } catch(error) {
                        setStatus(`Could not prepare download: ${error instanceof Error ? error.message : String(error)}`, true);
                    }
                }
                finish();
            }
        };
        setStatus('Converting. Large networks can take a while.');
        worker.postMessage({ type: 'convert', weights: bytes, dataType: precision.value }, [bytes]);
    } catch(error) {
        if(run !== generation) return;
        setStatus(`Conversion failed: ${error instanceof Error ? error.message : String(error)}`, true);
        finish();
    }
});

function resetResult() {
    clearDownload();
    if(ready) setStatus('Ready.');
}
chooseWeights.addEventListener('click', () => weights.click());
weights.addEventListener('change', () => {
    weightsName.textContent = weights.files[0]?.name || 'No file selected';
    resetResult();
});
precision.addEventListener('change', resetResult);

cancel.addEventListener('click', () => {
    generation++;
    finish();
    setStatus('Conversion cancelled.');
});

window.addEventListener('pagehide', () => {
    generation++;
    if(worker) worker.terminate();
    clearDownload();
});
