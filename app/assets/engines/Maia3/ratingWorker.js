import MaiaEngine from './maiaEngine.js';
import { moveLogLikelihoods } from './likelihood.js';

// Scores one played move against Maia 3's move distribution at each requested Elo.
const engine = new MaiaEngine({});

onmessage = async ({ data: { id, fen, move, elos } }) => {
    try {
        await engine.init();
        const { result } = await engine.evaluateBatch(elos.map(() => fen), elos, elos);
        if(result.length !== elos.length) throw new Error('Maia returned an incomplete likelihood grid');
        postMessage({ id, logProbs: moveLogLikelihoods(result, move) });
    } catch(error) {
        postMessage({ id, error: String(error?.message || error) });
    }
};

postMessage({ ready: true });
