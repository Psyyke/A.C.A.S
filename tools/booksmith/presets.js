import { Chess } from '../../app/assets/engines/libraries/chessjs/chess.js';
import { personalityCandidates, personalityFeatures, personalityScores, personalityTargets } from '../doppelmaia/personality.js';
import { bookMove, indexOpenings, lineMoves, playMove, rescale } from './book.js';

const families = [
    ['italian', 'Italian Game', /^Italian Game/],
    ['ruy-lopez', 'Ruy Lopez', /^Ruy Lopez/],
    ['scotch', 'Scotch Game', /^Scotch Game/],
    ['london', 'London System', /London System/],
    ['queens-gambit', "Queen's Gambit", /^Queen's Gambit|^Slav Defense|^Semi-Slav Defense/],
    ['sicilian', 'Sicilian Defense', /^Sicilian Defense/],
    ['caro-kann', 'Caro-Kann Defense', /^Caro-Kann Defense/],
    ['french', 'French Defense', /^French Defense/],
    ['english', 'English Opening', /^English Opening/],
    ['kings-indian', "King's Indian Defense", /^King's Indian Defense/],
    ['nimzo-indian', 'Nimzo-Indian Defense', /^Nimzo-Indian Defense/],
    ['pirc', 'Pirc Defense', /^Pirc Defense/],
    ['kings-gambit', "King's Gambit", /^King's Gambit/],
    ['dutch', 'Dutch Defense', /^Dutch Defense/]
];

const common = families.slice(0, 12).map(([id]) => id);
const starters = [
    ['Italian', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6'],
    ['Four Knights', '1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Bc4 Bc5'],
    ['Scotch', '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Nf6'],
    ['Sicilian', '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6'],
    ['French', '1. e4 e6 2. d4 d5 3. Nc3 Nf6 4. e5 Nfd7'],
    ['Caro-Kann', '1. e4 c6 2. d4 d5 3. exd5 cxd5 4. Bd3 Nc6'],
    ['Scandinavian', '1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. d4 Nf6'],
    ['London', '1. d4 d5 2. Bf4 Nf6 3. e3 e6 4. Nf3 c5'],
    ["Queen's Gambit", '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 Be7'],
    ["King's Indian", '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6'],
    ['English', '1. c4 e5 2. Nc3 Nf6 3. Nf3 Nc6 4. g3 Bb4'],
    ['Reti', '1. Nf3 d5 2. d4 Nf6 3. c4 e6 4. Nc3 Be7'],
    ['Ruy Lopez', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6']
].map(([name, pgn]) => ({ name, pgn }));

export const bookPresets = [
    { id: 'beginner', name: 'Beginner essentials', group: 'Starters', seeds: starters,
        description: 'Short, straightforward lines covering common openings for both colors. Four moves deep, without a forest of variations.' },
    { id: 'open-starter', name: 'Open games starter', group: 'Starters', seeds: [...starters.slice(0, 3), starters.at(-1)],
        description: 'Simple Italian, Four Knights, Scotch and Ruy Lopez lines after 1.e4 e5. Four moves deep.' },
    { id: 'solid-starter', name: 'Solid starter', group: 'Starters', seeds: [starters[5], starters[7], starters[8]],
        description: "Short London, Caro-Kann and Queen's Gambit lines. Four moves deep." },
    { id: 'common', name: 'Common openings', group: 'Repertoires', families: common, plies: 24,
        description: 'A broad mix of familiar openings for both colors, up to 12 moves deep. Opening families get equal starting influence, not measured game popularity.' },
    ...families.slice(0, 12).map(([id, name]) => ({
        id, name, group: 'Repertoires', families: [id], plies: 24,
        description: `${name} catalogue lines, up to 12 moves deep. Weights follow how many catalogue lines use each move.`
    })),
    ...[
        ['attacker', 'The attacker', [...common, 'kings-gambit', 'dutch'], 'Favors captures, checks and forward play.'],
        ['quiet-planner', 'The quiet planner', common, 'Favors quiet development and central squares.'],
        ['centralist', 'The centralist', common, 'Favors moves toward the center.'],
        ['fianchetto', 'Fianchetto architect', common, 'Favors fianchetto bishops and king shelter.'],
        ['knight-fan', 'Knight fan', common, 'Favors knight moves over bishop moves.'],
        ['fast-developer', 'Fast developer', common, 'Favors early minor-piece development and delays queen moves.']
    ].map(([personality, name, selected, description]) => ({
        id: `style-${personality}`, name, group: 'Personalities', families: selected, personality, plies: 16,
        description: `${description} Uses DoppelMaia's move traits within known openings, up to eight moves deep. An opening style, not a trained engine.`
    }))
];

const pause = () => new Promise(resolve => setTimeout(resolve));

export async function buildPreset(id, lines, onProgress = () => {}) {
    const preset = bookPresets.find(item => item.id === id);
    if(!preset) throw new Error('Unknown book preset');
    const groups = preset.seeds ? [indexOpenings(preset.seeds).lines] : preset.families.map(id => {
        const family = families.find(item => item[0] === id);
        const selected = lines.filter(line => family[2].test(line.name));
        if(!selected.length) throw new Error(`No catalogue lines for ${family[1]}`);
        return selected;
    });
    const book = new Map(), positions = new Map();
    const total = groups.reduce((sum, group) => sum + group.length, 0);
    let processed = 0;
    for(const group of groups) {
        const counts = new Map();
        for(const line of group) {
            const length = Math.min(line.codes.length, preset.plies ?? 8);
            const chess = preset.personality ? new Chess() : null;
            const tokens = chess ? lineMoves(line.pgn) : [];
            for(let i = 0; i < length; i++) {
                const key = line.keys[i], code = line.codes[i];
                if(chess) {
                    if(!positions.has(key)) positions.set(key, chess.fen());
                    if(!playMove(chess, tokens[i])) throw new Error(`Invalid opening line: ${line.name}`);
                }
                let moves = counts.get(key);
                if(!moves) counts.set(key, moves = new Map());
                moves.set(code, (moves.get(code) || 0) + 1);
            }
            if(++processed % 100 === 0) {
                onProgress(Math.floor(70 * processed / total));
                await pause();
            }
        }
        // Normalize each family separately so a larger catalogue section does not swamp the others.
        for(const [key, moves] of counts) {
            const total = [...moves.values()].reduce((a, b) => a + b, 0);
            let merged = book.get(key);
            if(!merged) book.set(key, merged = new Map());
            for(const [code, count] of moves) merged.set(code, (merged.get(code) || 0) + count / total);
        }
    }
    if(preset.personality) {
        const profile = personalityCandidates.find(item => item.id === preset.personality);
        let processed = 0;
        for(const [key, moves] of book) {
            if(moves.size > 1) {
                const fen = positions.get(key);
                const chess = new Chess(fen);
                const legal = new Map(chess.moves({ verbose: true }).map(move => [bookMove(move), move]));
                const legalMoves = [...moves.keys()].map(code => {
                    const move = legal.get(code);
                    if(!move) throw new Error(`Illegal preset move: ${code}`);
                    return move.from + move.to + (move.promotion || '');
                });
                const scores = personalityScores(personalityFeatures({ fen, legalMoves }), profile);
                const weights = personalityTargets([...moves.values()].map(Math.log), scores);
                [...moves.keys()].forEach((code, i) => moves.set(code, weights[i]));
            }
            if(++processed % 100 === 0) {
                onProgress(70 + Math.floor(30 * processed / book.size));
                await pause();
            }
        }
    }
    if(!book.size) throw new Error('No moves in this preset');
    onProgress(100);
    return rescale(book);
}
