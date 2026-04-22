import MaiaEngine from './maiaEngine.js';

let engine = null;

(async () => {
    engine = new MaiaEngine({ onMessage: msg => postMessage(msg) });

    postMessage(true);
})();

onmessage = e => {
    const { method, args } = e.data;

    if(!engine) {
        postMessage(false);
        return;
    }

    if(engine[method] && typeof engine[method] === 'function') {
        engine[method](...args);
    }
};