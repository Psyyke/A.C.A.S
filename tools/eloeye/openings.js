import { Chess } from '../../app/assets/engines/libraries/chessjs/chess.js';

export const openingCount = 500;

function openingPosition(record, plies) {
    const moves = record.pgn.replace(/\d+\.(?:\.\.)?/g, '').trim().split(/\s+/).slice(0, plies);
    if(moves.length !== plies) return null;
    const chess = new Chess();
    for(const san of moves) {
        const move = chess.move(san);
        if(!move) throw new Error(`Invalid opening move in ${record.name}: ${san}`);
        if(move.captured || move.piece === 'k' || move.piece === 'r') return null;
    }
    if(chess.in_check() || chess.game_over()
        || chess.moves({ verbose: true }).some(move => move.flags.includes('e'))) return null;
    return { fen: chess.fen(), moves, name: record.name };
}

export function buildOpenings(records) {
    const groups = new Map(['e4', 'd4', 'c4', 'Nf3'].map(move => [move, []]));
    const seen = new Set();
    for(const plies of [6, 8, 10, 12]) {
        for(const record of records) {
            const opening = openingPosition(record, plies);
            if(!opening || !groups.has(opening.moves[0])) continue;
            const key = opening.fen.split(' ').slice(0, 4).join(' ');
            if(seen.has(key)) continue;
            seen.add(key);
            groups.get(opening.moves[0]).push(opening);
        }
        if(seen.size >= openingCount) break;
    }
    const openings = [];
    for(let index = 0; openings.length < openingCount; index++) {
        let added = false;
        for(const group of groups.values()) {
            if(group[index] && openings.length < openingCount) {
                openings.push(group[index]);
                added = true;
            }
        }
        if(!added) throw new Error('Not enough distinct EloEye opening positions');
    }
    return openings;
}

let loaded;
export function loadOpenings() {
    loaded ??= fetch(new URL('../../app/assets/openings/pgn.json', import.meta.url)).then(async response => {
        if(!response.ok) throw new Error(`Could not load EloEye openings (${response.status})`);
        return buildOpenings(await response.json());
    });
    return loaded;
}
