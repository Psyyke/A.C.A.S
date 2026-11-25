import { coachingInputV4 } from './coaching-input-v4.js';

const types = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' };
const pieces = text => text.replace(/\b(White|Black) (pawn|knight|bishop|rook|queen|king) on ([a-h][1-8])\b/g,
    (_, color, type, square) => `${color === 'White' ? 'w' : 'b'}${types[type]}@${square}`);
export const coachingSystem = 'You are Pena, a chess coach. Use supplied evidence with exact actors and board frames. Cite only defined IDs. State when evidence is insufficient.';

/** Lossless for reference payloads: remove repeated wording, never select by a target. */
export function compactV4Messages(messages) {
    const last = messages.at(-1);
    if(last?.role !== 'user' || !last.content.startsWith('Verified evidence:\nV4 relation dictionary:'))
        throw new Error('Compact packing requires the exact v4 evidence envelope.');
    const start = 'SAVED V1 REFERENCE COMPATIBILITY:';
    let legacy = false;
    const content = last.content.split('\n').map(line => {
        if(line.startsWith('V4 relation dictionary:')) return line
            + ' CURRENT C.square columns are piece|incoming enemy attackers|friendly defenders|outgoing enemy targets. '
            + 'Relation cells are squares resolved by the complete CURRENT ledger, not moves. All three relation lists are COMPLETE. '
            + '+attack/+defend/+control are gained geometry; -attack is lost geometry, not a legal capture or safe win.';
        if(line.startsWith(start)) {
            legacy = true;
            return 'Saved v1 definitions below retain their original Stockfish/context provenance, not fresh LC0. Legacy IDs mean these definitions. An annotation is not a forced-outcome proof. Semantic/visual compatibility remains separately audited.';
        }
        if(line.startsWith('[S.')) legacy = false;
        if(legacy) return line;
        if(/^\[C\.[a-h][1-8]\] CURRENT /.test(line)) {
            const compact = pieces(line).replace('CURRENT ', '').replace('; attacked by ', '|').replace('; defended by ', '|').replace('; attacks ', '|')
                .replace(/\bnone\b/g, 'NONE');
            const [actor, ...relations] = compact.split('|');
            return [actor, ...relations.map(value => value.replace(/\b[wb][PNBRQK]@([a-h][1-8])\b/g, '$1'))].join('|');
        }
        if(/^\[[LA]\d+\.p\d+\]/.test(line)) return pieces(line)
            .replace(/CONDITIONAL ([LA]\d+), ply (\d+): /, 'if $1 ply $2: ')
            .replace(/\b(White|Black) (pawn|knight|bishop|rook|queen|king) ([a-h][1-8]) to ([a-h][1-8]) \(([^)]+)\)/g,
                (_, color, type, from, to, san) => `${color === 'White' ? 'w' : 'b'}${types[type]}:${from}>${to}(${san})`)
            .replace(/ newly attacks /g, ' +attack ').replace(/ newly defends /g, ' +defend ')
            .replace(/ newly controls /g, ' +control ').replace(/ no longer attacks /g, ' -attack ');
        return line;
    }).join('\n');
    return Object.freeze(messages.map((message, index) => Object.freeze(index === 0
        ? { ...message, content: coachingSystem } : index === messages.length - 1 ? { ...message, content } : { ...message })));
}

export function compactCoachingInput(args) {
    const input = coachingInputV4(args);
    return Object.freeze({ ...input, packing: 'pena-v2-compact/1', messages: compactV4Messages(input.messages) });
}
