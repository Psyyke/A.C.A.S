// Approximate capture geometry for rendering, not a variant legality engine.
// Move-only Betza atoms do not control squares. Unknown pieces have no paths.
const orthogonal = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const diagonal = [[1, -1], [-1, -1], [1, 1], [-1, 1]];
const knight = [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]];
const atoms = {
    W: orthogonal, F: diagonal, N: knight,
    A: diagonal.map(([x, y]) => [x * 2, y * 2]),
    Z: knight.map(([x, y]) => [Math.sign(x) * (Math.abs(x) + 1), Math.sign(y) * (Math.abs(y) + 1)]),
    R: orthogonal, B: diagonal, Q: [...orthogonal, ...diagonal], K: [...orthogonal, ...diagonal]
};
const defaultPieces = {
    p: 'fmWfceF', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K',
    a: 'BN', c: 'RN', e: 'RN', h: 'BN', f: 'F', s: 'FfW',
    g: 'WfF', w: 'W', m: 'K', l: 'fR'
};
const shogiVariants = ['shogi', 'checkshogi', 'shoshogi', 'minishogi', 'mini', 'gorogoro',
    'gorogoroplus', 'judkins', 'kyotoshogi', 'micro'];

function pieceBetza(type, variant) {
    if(shogiVariants.includes(variant)) {
        const promoted = variant === 'kyotoshogi' ? { '+p': 'R', '+s': 'B' }
            : variant === 'micro' ? { '+p': 'fN', '+l': 'FfW', '+b': 'WfF', '+r': 'WfF' }
            : variant === 'shoshogi' ? { e: 'FfsW', '+e': 'K' } : {};
        return promoted[type] ?? {
            p: 'fW', n: 'fN', l: 'fR', s: 'FfW', g: 'WfF', h: 'BW', d: 'RF',
            '+p': 'WfF', '+n': 'WfF', '+l': 'WfF', '+s': 'WfF', '+b': 'BW', '+r': 'RF'
        }[type] ?? defaultPieces[type] ?? '';
    }
    let overrides;
    switch(variant) {
        case 'makruk': case 'makpong': case 'cambodian': case 'karouk': case 'sittuyin':
            overrides = { m: 'F', s: 'FfW', f: 'F' }; break;
        case 'asean': overrides = { b: 'FfW', q: 'F' }; break;
        case 'aiwok': overrides = { a: 'RNF', m: 'F', s: 'FfW' }; break;
        case 'shatranj': case 'chaturanga': overrides = { b: 'A', q: 'F' }; break;
        case 'shako': overrides = { e: 'FA', c: 'mRcpR' }; break;
        case 'amazon': case 'georgian': case 'gustav3': overrides = { a: 'QN' }; break;
        case 'centaur': overrides = { c: 'KN' }; break;
        case 'modern': overrides = { m: 'BN' }; break;
        case 'perfect': overrides = { m: 'BN', g: 'QN' }; break;
        case 'dragon': overrides = { d: 'BN' }; break;
        case 'knightmate': overrides = { k: 'N', m: 'K' }; break;
        case 'janus': overrides = { j: 'BN' }; break;
        case 'shatar': overrides = { j: 'RF', q: 'RF' }; break;
        case 'hoppelpoppel': overrides = { n: 'mNcB', b: 'mBcN' }; break;
        case 'newzealand': overrides = { n: 'mNcR', r: 'mRcN' }; break;
        case 'berolina': overrides = { p: 'mfFcfW' }; break;
        case 'clobber': case 'clobber10': overrides = { p: 'cW' }; break;
        case 'breakthrough': overrides = { p: 'fmWfF' }; break;
        case 'shogun': overrides = { '+p': 'K', '+n': 'KN', '+b': 'BN', '+r': 'RN', '+f': 'Q' }; break;
        case 'ataxx': case 'flipersi': case 'flipello': case 'flipello10':
            overrides = { p: '' }; break;
        case 'amazons': overrides = { q: '' }; break;
    }
    return overrides?.[type] ?? defaultPieces[type] ?? '';
}

export function getVariantPiecePaths(board, piece, position, variant, isPlayerBlack) {
    const height = board.length, width = board[0]?.length ?? 0;
    const [row, col] = position;
    const type = piece.replace(/~/g, '').toLowerCase();
    const forward = (piece === piece.toUpperCase()) === !isPlayerBlack ? -1 : 1;
    const homeRank = y => forward === -1 ? height - 1 - y : y;
    const middle = Math.floor(width / 2);
    const inOwnPalace = (y, x) => homeRank(y) < 3 && Math.abs(x - middle) <= 1;
    const janggi = variant.startsWith('janggi');
    const xiangqi = ['xiangqi', 'manchu', 'supply', 'minixiangqi'].includes(variant);
    const palaceLine = (y, x) => {
        const top = y < 3 ? 0 : y >= height - 3 ? height - 3 : -1;
        return top >= 0 && Math.abs(x - middle) === Math.abs(y - top - 1);
    };
    let betza = pieceBetza(type, variant);
    if(xiangqi || janggi) {
        betza = {
            p: janggi || variant === 'minixiangqi' || homeRank(row) >= height / 2 ? 'fsW' : 'fW',
            n: 'nN', h: 'nN', b: janggi ? 'nZ' : 'nA', e: janggi ? 'nZ' : 'nA',
            a: janggi ? 'W' : 'F', k: 'W', c: janggi ? 'pR' : 'mRcpR', m: 'RcpRnN'
        }[type] ?? betza;
        if(janggi) betza += ({ p: 'fF', r: 'B2', c: 'pB2', k: 'F', a: 'F' }[type] || '');
    }

    const paths = new Map();
    const add = (y, x) => paths.set(`${y},${x}`, [y, x]);
    const allowed = (y, x, dx, dy) => {
        if((xiangqi || janggi) && ['k', 'a'].includes(type) && !inOwnPalace(y, x)) return false;
        if(xiangqi && ['b', 'e'].includes(type) && homeRank(y) >= height / 2) return false;
        if(janggi && dx && dy && ['p', 'r', 'c', 'k', 'a'].includes(type)) {
            return palaceLine(row, col) && palaceLine(y, x) && Math.abs(y - row) <= 2
                && (row < 3) === (y < 3);
        }
        return true;
    };

    for(const [, modifiers, atom, distance] of betza.matchAll(/([a-z]*)([A-Z])(\d+)?/g)) {
        if(modifiers.includes('m') && !modifiers.includes('c')) continue;
        const slider = 'RBQ'.includes(atom);
        const hopper = modifiers.includes('p');
        const length = slider ? Number(distance) || Math.max(width, height) : 1;
        for(const [dx, dy] of atoms[atom] || []) {
            if(/[fsb]/.test(modifiers)) {
                const ahead = modifiers.includes('f') && dy * forward > 0
                    && (atom !== 'N' || Math.abs(dy) > Math.abs(dx));
                const behind = modifiers.includes('b') && dy * forward < 0;
                const sideways = modifiers.includes('s') && dy === 0;
                if(!ahead && !behind && !sideways) continue;
            }
            if(modifiers.includes('n')) {
                const sx = Math.sign(dx), sy = Math.sign(dy);
                const blocks = atom === 'A' ? [[sx, sy]]
                    : Math.abs(dx) > Math.abs(dy) ? [[sx, 0]] : [[0, sy]];
                if(atom === 'Z') blocks.push(Math.abs(dx) > Math.abs(dy) ? [2 * sx, sy] : [sx, 2 * sy]);
                if(blocks.some(([x, y]) => board[row + y]?.[col + x] !== null)) continue;
            }
            let screened = false;
            for(let step = 1; step <= length; step++) {
                const y = row + dy * step, x = col + dx * step;
                const target = board[y]?.[x];
                if(target === undefined || target === '*' || !allowed(y, x, dx, dy)) break;
                if(hopper && !screened) {
                    if(target !== null) {
                        if(janggi && target.toLowerCase() === 'c') break;
                        screened = true;
                    }
                    continue;
                }
                if(!(janggi && hopper && target?.toLowerCase() === 'c')) add(y, x);
                if(target !== null) break;
            }
        }
    }

    // Flying generals threaten each other, not every empty square between them.
    if(xiangqi && type === 'k') {
        for(let y = row + forward; y >= 0 && y < height; y += forward) {
            const target = board[y]?.[col];
            if(!target) continue;
            if(target.toLowerCase() === 'k' && (target === target.toUpperCase()) !== (piece === piece.toUpperCase())) add(y, col);
            break;
        }
    }
    return [...paths.values()];
}