importScripts('/A.C.A.S/app/assets/engines/fairy-stockfish-nnue.wasm/stockfish.js');

let engine = null;
let listening = false;

(async () => {
    engine = await Stockfish();
})();

onmessage = e => {
    const { method, args } = e.data;

    if(!engine) {
        postMessage(false);
        return;
    }

    if(engine && method === 'acas_check_loaded') {
        postMessage(true);

        if(!listening) {
            engine.addMessageListener(postMessage);
            listening = true;
        }

        return;
    }

    if(engine[method] && typeof engine[method] === 'function') {
        engine[method](...args);
    }
};