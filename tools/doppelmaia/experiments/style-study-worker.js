import { prepareMaia3 } from '../maia3-model.js';
import { knightChoices } from './style-data.mjs';

let busy = false;
self.onmessage = async ({ data }) => {
    if(busy || data?.type !== 'evaluate') return;
    busy = true;
    let session;
    try {
        const { preprocessMaia3, mirrorMove, allPossibleMovesMaia3Reversed } =
            await import('../../../app/assets/engines/Maia3/tensor.js');
        const indices = new Map(Object.entries(allPossibleMovesMaia3Reversed).map(([index, move]) => [move, Number(index)]));
        const ort = await import('../runtime/dist/ort.webgpu.bundle.min.mjs');
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = new URL('../runtime/dist/', import.meta.url).href;
        let bytes = data.weights;
        if(!bytes) {
            const response = await fetch(new URL('../../../app/assets/engines/Maia3/model/maia3_simplified.onnx', import.meta.url));
            if(!response.ok) throw new Error(`Could not load base Maia 3: HTTP ${response.status}`);
            bytes = prepareMaia3(new Uint8Array(await response.arrayBuffer()));
        }
        session = await ort.InferenceSession.create(bytes, { executionProviders: [data.provider] });
        const name = data.weights ? 'logits_move' : 'acas_base_logits', rows = [];
        for(let start = 0; start < data.samples.length; start += 8) {
            const batch = data.samples.slice(start, start + 8);
            const tokens = new Float32Array(batch.length * 64 * 12);
            batch.forEach((sample, row) => tokens.set(preprocessMaia3(sample.fen).boardTokens, row * 64 * 12));
            const feeds = {
                tokens: new ort.Tensor('float32', tokens, [batch.length, 64, 12]),
                elo_self: new ort.Tensor('float32', new Float32Array(batch.length).fill(1500), [batch.length]),
                elo_oppo: new ort.Tensor('float32', new Float32Array(batch.length).fill(1500), [batch.length])
            };
            let result;
            try {
                result = await session.run(feeds);
                for(let row = 0; row < batch.length; row++) {
                    const sample = batch[row], black = sample.fen.split(' ')[1] === 'b';
                    const logits = sample.legalMoves.map(move => {
                        const index = indices.get(black ? mirrorMove(move) : move);
                        if(!Number.isInteger(index)) throw new Error(`Unmapped Maia 3 move: ${move}`);
                        return result[name].data[row * 4352 + index];
                    });
                    if(logits.some(value => !Number.isFinite(value))) throw new Error('Non-finite test logits.');
                    const max = Math.max(...logits), exp = logits.map(value => Math.exp(value - max));
                    const total = exp.reduce((sum, value) => sum + value, 0), best = logits.indexOf(max);
                    const choices = knightChoices(sample), target = sample.legalMoves.indexOf(sample.move);
                    if(target < 0) throw new Error('Invalid test target move.');
                    rows.push({
                        knightProbability: exp.reduce((sum, value, i) => sum + (choices[i] ? value / total : 0), 0),
                        knightTop1: choices[best], moveMatch: best === target,
                        crossEntropy: max + Math.log(total) - logits[target],
                        chosenMove: sample.legalMoves[best]
                    });
                }
            } finally {
                Object.values(feeds).forEach(tensor => tensor.dispose());
                if(result) Object.values(result).forEach(tensor => tensor.dispose());
            }
            postMessage({ type: 'progress', processed: rows.length, total: data.samples.length });
        }
        postMessage({ type: 'complete', rows });
    } catch(error) { postMessage({ type: 'error', message: error.message, stack: error.stack }); }
    finally { if(session) await session.release(); busy = false; }
};
