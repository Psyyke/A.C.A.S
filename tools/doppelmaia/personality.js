import { Chess } from '../../app/assets/engines/libraries/chessjs/chess.js';

export const personalityTraits = [
    ['pawn', 'Pawn moves'], ['knight', 'Knight moves'], ['bishop', 'Bishop moves'],
    ['rook', 'Rook moves'], ['queen', 'Queen moves'], ['king', 'King moves'],
    ['capture', 'Captures'], ['check', 'Checks'], ['castle', 'Castling'],
    ['advance', 'Forward moves'], ['retreat', 'Retreats'], ['center', 'Central squares'],
    ['edge', 'Edge squares'], ['develop', 'Minor piece development'],
    ['fianchetto', 'Fianchetto squares'], ['shelter', 'Pawn shelter'],
    ['contact', 'Close to their king'], ['pawnStorm', 'Advanced pawns'],
    ['quiet', 'Quiet moves'], ['trade', 'Valuable captures']
].map(([id, label]) => ({ id, label, min: -4, max: 4, step: 0.1 }));

const profile = (id, name, elo, weights, strength = 1) => ({
    id, name, elo, strength, weights: Object.fromEntries(personalityTraits.map(({ id }) => [id, weights[id] || 0]))
});

export const personalityCandidates = [
    profile('attacker', 'The attacker', 1800, { check: 2, capture: 1.5, contact: 2, advance: 1 }),
    profile('quiet-planner', 'The quiet planner', 1800, { quiet: 2, develop: 1.5, center: 1, check: -1 }),
    profile('bunker', 'The bunker', 2200, { shelter: 4, castle: 2, king: -2, quiet: 2, pawnStorm: -2 }),
    profile('knight-fan', 'Knight fan', 1500, { knight: 4, bishop: -1 }),
    profile('bishop-pair', 'Bishop devotee', 1800, { bishop: 4, knight: -1, fianchetto: 1 }),
    profile('pawn-march', 'The pawn march', 1500, { pawn: 3, pawnStorm: 3, advance: 2 }),
    profile('queen-show', 'The queen show', 1400, { queen: 4, contact: 1.5, develop: -1 }),
    profile('rook-pilot', 'Rook pilot', 1800, { rook: 4, edge: 1, pawn: -1 }),
    profile('wandering-king', 'The wandering king', 1200, { king: 4, advance: 2, castle: -4, shelter: -2 }),
    profile('check-chaser', 'Check chaser', 1600, { check: 4, contact: 1 }),
    profile('collector', 'The collector', 1800, { capture: 3, trade: 4, quiet: -1 }),
    profile('pacifist', 'The pacifist', 1700, { capture: -4, trade: -2, quiet: 2 }),
    profile('centralist', 'The centralist', 1900, { center: 4, develop: 1, edge: -2 }),
    profile('edgewalker', 'The edgewalker', 1300, { edge: 4, center: -2 }),
    profile('fianchetto', 'Fianchetto architect', 2000, { fianchetto: 4, bishop: 2, shelter: 2 }),
    profile('fast-developer', 'Fast developer', 1900, { develop: 4, queen: -2, center: 1 }),
    profile('castle-early', 'Home before dark', 2000, { castle: 4, shelter: 2, king: -2 }),
    profile('no-castling', 'No castling club', 1500, { castle: -4, king: 1, center: 1 }),
    profile('retreat-master', 'The retreat master', 1600, { retreat: 4, advance: -2, quiet: 1 }),
    profile('always-forward', 'Always forward', 1500, { advance: 4, retreat: -3, contact: 1 }),
    profile('knight-raider', 'Knight raider', 1700, { knight: 4, contact: 3, check: 1.5 }),
    profile('bishop-sniper', 'Bishop sniper', 2000, { bishop: 3, fianchetto: 4, capture: 1 }),
    profile('rook-storm', 'Rook storm', 1700, { rook: 4, advance: 2, contact: 2 }),
    profile('queen-hunter', 'Queen hunter', 1600, { queen: 3, capture: 2, check: 3 }),
    profile('king-of-center', 'King of the center', 1000, { king: 4, center: 4, castle: -4 }),
    profile('pawn-bunker', 'Pawn bunker', 2200, { shelter: 4, pawnStorm: -3, advance: -1, quiet: 2 }),
    profile('cautious-knight', 'Cautious knight', 2100, { knight: 3, retreat: 2, shelter: 2, capture: -1 }),
    profile('quiet-bishop', 'The quiet bishop', 2100, { bishop: 3, quiet: 3, check: -2 }),
    profile('flank-storm', 'Flank storm', 1700, { pawn: 2, edge: 3, pawnStorm: 3, advance: 2 }),
    profile('center-storm', 'Center storm', 1800, { pawn: 2, center: 4, pawnStorm: 2 }),
    profile('patient-castle', 'The patient castle', 2200, { castle: 4, quiet: 3, develop: 2, capture: -2 }),
    profile('contact-chess', 'Personal space invader', 1400, { contact: 4, advance: 2, check: 2 }),
    profile('distant-orbit', 'Distant orbit', 1600, { contact: -4, edge: 2, retreat: 2 }),
    profile('minor-party', 'Minor piece party', 1800, { knight: 3, bishop: 3, queen: -2, rook: -1 }),
    profile('heavy-metal', 'Heavy metal', 1600, { queen: 3, rook: 3, knight: -2, bishop: -2 }),
    profile('pawn-holiday', 'Pawns on holiday', 1500, { pawn: -4, knight: 2, bishop: 2 }),
    profile('royal-patience', 'Royal patience', 2200, { queen: -3, king: -3, develop: 3, quiet: 2 }),
    profile('capture-knight', 'The hungry knight', 1500, { knight: 4, capture: 3, quiet: -1 }),
    profile('peaceful-knight', 'The gentle knight', 1700, { knight: 4, capture: -3, quiet: 2 }),
    profile('checking-bishop', 'The ringing bishop', 1800, { bishop: 4, check: 4 }),
    profile('checking-rook', 'Rook alarm', 1700, { rook: 4, check: 4 }),
    profile('royal-hideout', 'Royal hideout', 2200, { shelter: 4, king: -4, contact: -2, castle: 3 }),
    profile('early-queen', 'Queen before breakfast', 1200, { queen: 4, develop: -3, advance: 2 }),
    profile('backwards-bishop', 'Backwards bishop', 1400, { bishop: 4, retreat: 4 }),
    profile('corner-knight', 'Corner knight', 1100, { knight: 4, edge: 4, center: -3 }),
    profile('central-knight', 'Central knight', 1900, { knight: 4, center: 4, edge: -2 }),
    profile('fianchetto-bunker', 'Fianchetto fortress', 2200, { fianchetto: 4, shelter: 4, quiet: 2, king: -2 }),
    profile('pawn-magnet', 'Pawn magnet', 1300, { pawn: 4, capture: 3, center: 2 }),
    profile('chaos', 'Friendly chaos', 1200, { king: 3, queen: 3, check: 4, castle: -4, develop: -2 }),
    profile('alien', 'Alien chess', 1000, { edge: 4, retreat: 3, king: 3, knight: 2, center: -3 }, 1.5)
];

const curated = new Set([
    'pawn-march', 'queen-show', 'pacifist', 'centralist', 'edgewalker', 'knight-raider',
    'quiet-bishop', 'flank-storm', 'center-storm', 'distant-orbit', 'heavy-metal', 'pawn-holiday',
    'peaceful-knight', 'corner-knight', 'central-knight', 'pawn-magnet', 'chaos', 'alien'
]);
export const personalityPresets = personalityCandidates.filter(({ id }) => curated.has(id));

export function validatePersonalityEvidence(value) {
    if(value?.version !== 2 || !Array.isArray(value.profiles) || !value.curation?.confirmed
        || !Array.isArray(value.curation.selected)
        || personalityPresets.some(preset => !value.curation.selected.includes(preset.id)))
        throw new Error('Unsupported or incomplete curated evidence.');
    return value;
}

export function validatePersonality(value) {
    if(!value || !Number.isFinite(value.strength) || value.strength < 0 || value.strength > 3
        || !value.weights || Object.keys(value.weights).some(key => !personalityTraits.some(trait => trait.id === key))
        || personalityTraits.some(({ id, min, max }) => !Number.isFinite(value.weights[id]) || value.weights[id] < min || value.weights[id] > max))
        throw new Error('Choose personality weights from -4 to 4 and strength from 0 to 3.');
    return { strength: value.strength, weights: { ...value.weights } };
}

const rank = square => Number(square[1]) - 1;
const file = square => square.charCodeAt(0) - 97;
const central = square => (3.5 - Math.max(Math.abs(file(square) - 3.5), Math.abs(rank(square) - 3.5))) / 3;
const distance = (a, b) => Math.max(Math.abs(file(a) - file(b)), Math.abs(rank(a) - rank(b)));
const uci = move => move.from + move.to + (move.promotion || '');

export function personalityFeatures(sample) {
    const fen = sample.fen || sample.history?.[0], board = new Chess();
    if(typeof fen !== 'string' || !board.load(fen)) throw new Error('Invalid personality board position.');
    const color = board.turn(), sign = color === 'w' ? 1 : -1;
    const legal = new Map(board.moves({ verbose: true }).map(move => [uci(move), move]));
    const squares = Array.from({ length: 64 }, (_, i) => String.fromCharCode(97 + i % 8) + (Math.floor(i / 8) + 1));
    const enemyKing = squares.find(square => board.get(square)?.type === 'k' && board.get(square)?.color !== color);
    if(!enemyKing) throw new Error('Personality position has no opposing king.');
    return sample.legalMoves.map(text => {
        const move = legal.get(text);
        if(!move) throw new Error(`Illegal personality move ${text}.`);
        board.move(move);
        const ownKing = squares.find(square => board.get(square)?.type === 'k' && board.get(square)?.color === color);
        if(!ownKing) throw new Error('Personality position has no moving king.');
        const shelter = squares.filter(square => board.get(square)?.type === 'p' && board.get(square)?.color === color
            && distance(square, ownKing) <= 1).length / 3;
        const advancement = sign * (rank(move.to) - rank(move.from)) / 7;
        const relativeRank = color === 'w' ? rank(move.to) : 7 - rank(move.to);
        const values = {
            pawn: Number(move.piece === 'p'), knight: Number(move.piece === 'n'),
            bishop: Number(move.piece === 'b'), rook: Number(move.piece === 'r'),
            queen: Number(move.piece === 'q'), king: Number(move.piece === 'k'),
            capture: Number(Boolean(move.captured)), check: Number(board.in_check()),
            castle: Number(/[kq]/.test(move.flags)), advance: Math.max(0, advancement),
            retreat: Math.max(0, -advancement), center: central(move.to),
            edge: Number([0, 7].includes(file(move.to))),
            develop: Number(['n', 'b'].includes(move.piece) && rank(move.from) === (color === 'w' ? 0 : 7)),
            fianchetto: Number(move.piece === 'b' && relativeRank === 1 && [1, 6].includes(file(move.to))),
            shelter, contact: (7 - distance(move.to, enemyKing)) / 7,
            pawnStorm: move.piece === 'p' ? relativeRank / 6 : 0,
            quiet: Number(!move.captured && !board.in_check()),
            trade: ({ p: 1, n: 3, b: 3, r: 5, q: 9 }[move.captured] || 0) / 9
        };
        board.undo();
        return personalityTraits.map(({ id }) => values[id]);
    });
}

export function personalityScores(features, configuration) {
    const { weights, strength } = validatePersonality(configuration);
    return features.map(row => {
        if(row.length !== personalityTraits.length || row.some(value => !Number.isFinite(value)))
            throw new Error('Invalid personality move features.');
        return strength * personalityTraits.reduce((sum, { id }, i) => sum + weights[id] * row[i], 0);
    });
}

export function personalityTargets(base, scores) {
    if(base.length !== scores.length || !base.length || [...base, ...scores].some(value => !Number.isFinite(value)))
        throw new Error('Invalid personality target logits.');
    const values = base.map((value, i) => value + scores[i]), max = Math.max(...values);
    const exp = values.map(value => Math.exp(value - max)), total = exp.reduce((a, b) => a + b, 0);
    return exp.map(value => value / total);
}

export async function loadPersonalityDataset() {
    const [response, evidenceResponse] = await Promise.all([
        fetch(new URL('./personality-positions.json', import.meta.url)),
        fetch(new URL('./personality-evidence.json', import.meta.url))
    ]);
    if(!response.ok) throw new Error(`Could not load personality practice positions. HTTP ${response.status}.`);
    if(!evidenceResponse.ok) throw new Error(`Could not verify personality practice positions. HTTP ${evidenceResponse.status}.`);
    const [bytes, evidence] = await Promise.all([response.arrayBuffer(), evidenceResponse.json()]);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        byte => byte.toString(16).padStart(2, '0')).join('');
    validatePersonalityEvidence(evidence);
    if(hash !== evidence.browserDatasetSHA256)
        throw new Error('Personality practice positions do not match their tested version. Reload or update both tool assets.');
    // The exact published bytes already passed full legal-history validation.
    const dataset = JSON.parse(new TextDecoder().decode(bytes));
    if(dataset.version !== 1 || !dataset.train?.samples?.length || !dataset.validation?.samples?.length)
        throw new Error('Invalid published personality practice positions.');
    return dataset;
}
