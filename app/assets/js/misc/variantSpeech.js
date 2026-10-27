import { variantConfig } from './variantPosition.js';

// Semantic names avoid collisions between the same letter in different games.
// Locale files translate these names, not notation letters such as H or E.
export const englishVariantSpeech = {
    names: {
        pawn: 'Pawn', lance: 'Lance', silver: 'Silver general', gold: 'Gold general',
        cannon: 'Cannon', horse: 'Horse', elephant: 'Elephant', advisor: 'Advisor',
        general: 'General', chariot: 'Chariot', soldier: 'Soldier',
        dragonHorse: 'Dragon horse', dragonKing: 'Dragon king',
        archbishop: 'Archbishop', chancellor: 'Chancellor', amazon: 'Amazon', hawk: 'Hawk',
        ferz: 'Ferz', wazir: 'Wazir', centaur: 'Centaur', commoner: 'Commoner', banner: 'Banner',
        drunkElephant: 'Drunk elephant', crownPrince: 'Crown prince', dragon: 'Dragon',
        met: 'Met', khon: 'Khon', aiwok: 'Ai wok'
    },
    drop: 'Drop {piece} on {square}',
    shoot: 'then shoot an arrow to {square}',
    promoted: 'Promoted {piece}',
    promotionOnly: 'promotes',
    unknownPiece: 'Piece {symbol}'
};

export const shogiSpeechVariants = new Set(['shogi', 'checkshogi', 'shoshogi', 'minishogi',
    'mini', 'gorogoro', 'gorogoroplus', 'judkins', 'kyotoshogi', 'micro', 'euroshogi']);

const easternPieces = { K: 'general', R: 'chariot', N: 'horse', H: 'horse',
    B: 'elephant', E: 'elephant', A: 'advisor', C: 'cannon', P: 'soldier', M: 'banner' };
const shogiPieces = { L: 'lance', S: 'silver', G: 'gold', H: 'dragonHorse', D: 'dragonKing',
    E: 'drunkElephant', '+B': 'dragonHorse', '+R': 'dragonKing', '+E': 'crownPrince' };
const fairyPieces = { A: 'archbishop', C: 'chancellor', E: 'chancellor', H: 'archbishop',
    F: 'ferz', W: 'wazir', M: 'commoner', L: 'lance', S: 'silver', G: 'gold' };
const variantPieces = {
    seirawan: { H: 'hawk', E: 'elephant' }, shouse: { H: 'hawk', E: 'elephant' },
    shako: { E: 'elephant', C: 'cannon' },
    synochess: { A: 'commoner', C: 'cannon', S: 'soldier', H: 'horse', E: 'elephant' },
    amazon: { A: 'amazon' }, amazons: { Q: 'amazon' },
    georgian: { A: 'amazon' }, gustav3: { A: 'amazon' },
    centaur: { C: 'centaur' }, modern: { M: 'archbishop' },
    perfect: { M: 'archbishop', G: 'amazon' }, janus: { J: 'archbishop' },
    dragon: { D: 'dragon' },
    makruk: { M: 'met', S: 'khon', F: 'met' }, makpong: { M: 'met', S: 'khon', F: 'met' },
    cambodian: { M: 'met', S: 'khon', F: 'met' }, karouk: { M: 'met', S: 'khon', F: 'met' },
    aiwok: { A: 'aiwok', S: 'khon' }, asean: { B: 'khon', Q: 'met' },
    sittuyin: { F: 'general', S: 'elephant' },
    knightmate: { M: 'commoner' }, shatranj: { B: 'elephant', Q: 'ferz' },
    chaturanga: { B: 'elephant', Q: 'ferz' },
    shogun: { C: 'commoner', G: 'centaur', A: 'archbishop', M: 'chancellor',
        '+P': 'commoner', '+N': 'centaur', '+B': 'archbishop', '+R': 'chancellor', '+F': 'Q' }
};

export function getVariantSpeech(translated = {}) {
    return { ...englishVariantSpeech, ...translated,
        names: { ...englishVariantSpeech.names, ...translated.names } };
}

export function speechPieceName(piece, config, speech) {
    const symbol = String(piece || '').replace(/~/g, '').toUpperCase();
    const variant = variantConfig(config).variant;
    const words = speech.variantSpeech || englishVariantSpeech;
    let key;
    if(['xiangqi', 'manchu', 'supply', 'minixiangqi'].includes(variant) || variant.startsWith('janggi')) {
        key = easternPieces[symbol];
    } else if(shogiSpeechVariants.has(variant)) {
        const overrides = variant === 'kyotoshogi' ? { '+P': 'R', '+S': 'B', '+L': 'gold', '+N': 'gold' }
            : variant === 'micro' ? { '+P': 'N', '+L': 'silver', '+B': 'gold', '+R': 'gold' } : null;
        // Kyoto/Micro promotions differ from ordinary Shogi, including in
        // Japanese: a promoted Kyoto pawn is a rook, not a tokin.
        if(!overrides?.[symbol] && words.shogi?.[symbol]) return words.shogi[symbol];
        key = overrides?.[symbol] || shogiPieces[symbol];
        if(overrides?.[symbol] && /^[A-Z]$/.test(key)) return speechPieceName(key, config, speech);
    } else {
        key = variantPieces[variant]?.[symbol] || fairyPieces[symbol];
    }
    if(key) return words.names[key] || speech.pieces[key] || words.unknownPiece.replace('{symbol}', symbol);
    if(symbol.startsWith('+')) return words.promoted.replace('{piece}', speechPieceName(symbol.slice(1), config, speech));
    if(symbol === 'P') return words.names.pawn;
    if(speech.pieces[symbol]) return speech.pieces[symbol];
    return words.unknownPiece.replace('{symbol}', symbol);
}