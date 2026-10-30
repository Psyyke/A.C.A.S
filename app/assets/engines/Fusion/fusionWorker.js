import FusionEngine from './fusionEngine.js';

const engine = new FusionEngine(
    message => postMessage(message),
    error => { setTimeout(() => { throw error; }); },
    Number(new URL(import.meta.url).searchParams.get('identitySeed'))
);
let loaded = false;

Promise.all([engine.stockfish.ready, engine.neural]).then(() => {
    loaded = true;
    postMessage(true);
}).catch(() => {});

self.onmessage = event => {
    if(typeof event.data === 'string') {
        engine.command(event.data);
        return;
    }

    const { method, args = [] } = event.data || {};
    if(method === 'acas_check_loaded') postMessage(loaded);
    else if(method === 'uci') engine.command(args[0]);
};