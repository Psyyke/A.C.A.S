import { binpropMotifs } from './binprop-motifs.generated.js';
import { binPropPerspective } from './binprop-chess.js';

const codes = [
    ['2a78a7eca416712b', 'AC', 'advanced control with current pawn-file exclusions'],
    ['f815717572588e18', 'PS', 'relative pawn structure and passed pawn edge'],
    ['d7f4da2534e3d415', 'KZ', 'relative non-king king-zone pressure'],
    ['c0b4f5060c344764', 'PP', 'relative weak pawn pressure'],
    ['fb1bd91c8d7fde86', 'DD', 'opponent geometric defensive duties'],
    ['b4aed44d54bd1356', 'MAT', 'material edge for the perspective side'],
    ['185e6687b5b1488c', 'POS', 'favorable positional feature balance'],
    ['520988ca3d48ec54', 'SHEL', 'opponent king shelter deficit'],
    ['5b1c996b3bf8a1a9', 'INF', 'relative piece infiltration'],
    ['549bb6c3689a3be8', 'WEDGE', 'central pawn wedge'],
    ['6dbea227319dee69', 'FORCE', 'advantage in forcing resources'],
    ['96ab1a35fa92598b', 'CAMP', 'low enemy pressure in own camp'],
    ['283d1079a7c23a34', 'LAG', 'opponent mobilization and shelter lag'],
    ['4386a27a2d6a9b2f', 'MINOR', 'opponent minor piece disadvantage'],
    ['ae04a4517715be09', 'CAP', 'relative capture exchange gain'],
    ['a94a92537c8b9e72', 'PASS', 'relative advanced passed pawn strength'],
    ['368502c082090ef2', 'LOSS', 'opponent reply material exposure'],
    ['12b399bc862b1b0e', 'CHECK', 'relative checking initiative'],
    ['468ea5396c250013', 'OVER', 'opponent advanced pawn vulnerability'],
    ['40ed0908c00c8881', 'WEAK', 'opponent multiple weaknesses'],
    ['a3381112ae231593', 'IMB', 'favorable piece imbalance'],
    ['b04320e592505e05', 'COMPLEX', 'relative control of opponent weak color complex'],
    ['77ef4f0338177d9d', 'HIDDEN', 'hidden material edge heuristic'],
    ['b7a3c9dedb6e461b', 'QH', 'opponent queen harassment'],
    ['6e7a40df13c73364', 'FORK', 'relative double-attack threat'],
    ['c36ca2f12a0f34b7', 'POINT', 'opponent camp pressure points'],
    ['2653198247ccdde8', 'TRAP', 'opponent constrained and attacked pieces'],
    ['0d733ad48611524f', 'TEMPO', 'relative new threat creation'],
    ['bb96374b004162b4', 'KACT', 'relative king activity in simplified material'],
    ['4acc7166e36a0796', 'XRAY', 'relative pin and x-ray line pressure']
];

export const pcfBinPropMotifs = Object.freeze(codes.map(([id, code, name]) => {
    const motif = binpropMotifs.find(item => item.id === id);
    if(!motif) throw new Error(`Missing pinned BinProp predicate ${id}.`);
    return Object.freeze({ ...motif, code, name });
}));
if(pcfBinPropMotifs.length !== binpropMotifs.length || new Set(pcfBinPropMotifs.map(item => item.id)).size !== binpropMotifs.length)
    throw new Error('Incomplete or duplicate pinned BinProp predicate catalog.');

const cache = new Map();
export function binPropValues(fen, color) {
    const perspective = binPropPerspective(fen, color);
    if(cache.has(perspective)) return cache.get(perspective);
    const values = Object.freeze(pcfBinPropMotifs.map(motif => {
        const value = motif.evaluate(perspective);
        if(typeof value !== 'boolean') throw new Error(`BinProp predicate ${motif.id} returned a non-boolean value.`);
        return value;
    }));
    cache.set(perspective, values);
    if(cache.size > 256) cache.delete(cache.keys().next().value);
    return values;
}
