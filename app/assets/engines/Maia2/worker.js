import Maia from './maia.js';
import { loadMoves } from './utils.js';

import { Chess } from '../../../../assets/libraries/chess.js/chess.js';

let board = null;
let engine = null;

(async () => {
    await loadMoves();
    board = new Chess();

    const maia = new Maia('maia_rapid.onnx', Chess, board);

    while(!maia.ready) await new Promise(r => setTimeout(r, 50));

    engine = maia;
})();

onmessage = e => {
    const { method, args } = e.data;

    if(!engine) {
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