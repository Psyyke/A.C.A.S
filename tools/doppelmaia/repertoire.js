import { moveCount } from './maia3-model.js';

const pieces = 'PNBRQKpnbrqk';

// Four base-13 squares per integer stay exact in Float32, with no board collisions.
export function positionSignature(fen) {
    const [placement, turn = 'w'] = fen.split(' ');
    const ranks = placement.split('/');
    if(ranks.length !== 8 || !['w', 'b'].includes(turn)) throw new Error('Invalid repertoire position.');
    const signature = new Float32Array(16);
    for(let rank = 0; rank < 8; rank++) {
        let file = 0;
        for(const piece of ranks[rank]) {
            if(/[1-8]/.test(piece)) { file += Number(piece); continue; }
            const index = pieces.indexOf(turn === 'b' ? piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase() : piece);
            if(index < 0 || file > 7) throw new Error('Invalid repertoire piece placement.');
            const square = (turn === 'b' ? rank : 7 - rank) * 8 + file++;
            signature[Math.floor(square / 4)] += (index + 1) * 13 ** (square % 4);
        }
        if(file !== 8) throw new Error('Invalid repertoire rank.');
    }
    return signature;
}

export const signatureKey = signature => Array.from(signature).join(',');

export function repertoireProjection() {
    const matrix = new Float32Array(64 * 12 * 16);
    for(let square = 0; square < 64; square++) for(let piece = 0; piece < 12; piece++)
        matrix[(square * 12 + piece) * 16 + Math.floor(square / 4)] = (piece + 1) * 13 ** (square % 4);
    return matrix;
}

export function buildRepertoire(samples, policy, forward, anchor = 0) {
    const groups = new Map();
    for(const sample of samples) {
        if(!Number.isInteger(sample.ply) || sample.ply < 0 || sample.ply >= 24) continue;
        const signature = positionSignature(sample.fen), key = signatureKey(signature);
        if(!groups.has(key)) groups.set(key, { signature, samples: [] });
        groups.get(key).samples.push(sample);
    }
    return [...groups.entries()].filter(([, group]) => group.samples.length >= 2)
        .sort(([a, x], [b, y]) => y.samples.length - x.samples.length || (a < b ? -1 : a > b ? 1 : 0))
        .slice(0, 128).map(([, group]) => {
            const sample = group.samples[0], result = forward(policy, sample);
            const counts = new Map();
            for(const row of group.samples) {
                const index = row.legal[row.target];
                counts.set(index, (counts.get(index) || 0) + 1);
            }
            const delta = new Float32Array(moveCount);
            sample.legal.forEach((index, j) => {
                const p = result.probabilities[j];
                const posterior = ((counts.get(index) || 0) + 4 * p) / (group.samples.length + 4);
                delta[index] = (1 - anchor) * Math.max(-4, Math.min(4, Math.log(Math.max(posterior, 1e-30)) - Math.log(Math.max(p, 1e-30))));
            });
            return { signature: group.signature, delta, observations: group.samples.length };
        });
}

export function withRepertoire(samples, repertoire, strength) {
    const entries = new Map(repertoire.map(entry => [signatureKey(entry.signature), entry.delta]));
    return samples.map(sample => {
        const delta = entries.get(signatureKey(positionSignature(sample.fen)));
        return delta && strength ? { ...sample, base: sample.base.map((value, j) => value + strength * delta[sample.legal[j]]) } : sample;
    });
}
