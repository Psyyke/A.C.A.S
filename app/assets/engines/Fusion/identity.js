export const maximumSeed = 2147483647;

export function createSeed() {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % maximumSeed + 1;
}

export function isValidSeed(seed) {
    return Number.isInteger(seed) && seed > 0 && seed <= maximumSeed;
}

// Separate salts keep fixed style preferences independent of move sampling.
export function seededValue(seed, key) {
    let value = seed >>> 0;
    for(const char of key) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
}

export function individualStyle(seed, variation) {
    const preference = axis => (seededValue(seed, `style:${axis}`) * 2 - 1) * variation / 100;
    const defense = preference('defense');
    const initiative = preference('initiative');
    const strategy = preference('strategy');
    const simplicity = preference('simplicity');
    const caution = preference('caution');

    return {
        kingSafety: defense * 0.4,
        shelter: defense * 0.4,
        rescue: defense * 0.3,
        castle: defense * 0.2,
        check: initiative * 0.3,
        pawnStorm: initiative * 0.4,
        advance: initiative * 0.2 - caution * 0.2,
        development: strategy * 0.4,
        central: strategy * 0.3,
        earlyQueen: -strategy * 0.2,
        exchange: simplicity * 0.4,
        queenTrade: simplicity * 0.3,
        retreat: caution * 0.3
    };
}