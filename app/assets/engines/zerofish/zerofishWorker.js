import zerofish from '/A.C.A.S/app/assets/engines/zerofish/zerofishEngine.js';

let engine = null;

(async () => {
    engine = await zerofish();
})();

onmessage = e => {
    const { method, args } = e.data;

    if (!engine) {
        postMessage(false);
        return;
    }

    if(engine && method === 'acas_check_loaded') {
        postMessage(true);

        engine.listenZero = msg => postMessage(msg);
        
        return;
    }

    if (engine[method] && typeof engine[method] === 'function') {
        engine[method](...args);
    }
};