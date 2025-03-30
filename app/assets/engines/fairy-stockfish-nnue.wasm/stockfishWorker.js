importScripts('/A.C.A.S/app/assets/engines/fairy-stockfish-nnue.wasm/stockfish.js');

let engine = null;

(async () => {
    engine = await Stockfish();
})();

onmessage = e => {
    const { method, args } = e.data;

    if (!engine) {
        postMessage(false);
        return;
    }

    if(engine && method === 'acas_check_loaded') {
        postMessage(true);

        engine.addMessageListener(postMessage);

        return;
    }

    if (engine[method] && typeof engine[method] === 'function') {
        engine[method](...args);
    }
};