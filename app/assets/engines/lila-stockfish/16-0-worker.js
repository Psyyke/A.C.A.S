import Sf167Web from '/A.C.A.S/app/assets/engines/lila-stockfish/sf16-7.js';

let engine = null;

(async () => {
    engine = await Sf167Web();
})();

onmessage = e => {
    const { method, args } = e.data;

    if (!engine) {
        postMessage(false);
        return;
    }

    if(engine && method === 'acas_check_loaded') {
        postMessage(true);

        engine.listen = msg => postMessage(msg);
        
        return;
    }

    if(engine[method] && typeof engine[method] === 'function') {
        engine[method](...args);
    }
};