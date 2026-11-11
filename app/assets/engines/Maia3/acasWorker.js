import MaiaEngine from './maiaEngine.js';

let engine = null;

(async () => {
    const params = new URL(import.meta.url).searchParams;
    engine = new MaiaEngine({
        modelId: params.get('modelId'),
        provider: params.get('provider') || 'wasm',
        onError: message => postMessage({ type: 'error', message }),
        onMessage: msg => postMessage(msg)
    });

    postMessage(true);
})();

onmessage = e => {
    const { method, args } = e.data;

    if(!engine) {
        postMessage(false);
        return;
    }

    if(engine[method] && typeof engine[method] === 'function') {
        Promise.resolve(engine[method](...args)).catch(error => postMessage({ type: 'error', message: error.message }));
    }
};