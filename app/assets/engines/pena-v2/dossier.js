import { findPlayedMove } from './questions.js';

const names = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const color = side => side === 'w' ? 'White' : 'Black';

export function renderDossier(packed) {
    const data = typeof packed === 'string' ? JSON.parse(packed) : packed;
    const frames = new Map(data.frames.map(frame => [frame.id, frame]));
    const root = frames.get('root');
    if(!root) throw new Error('Evidence dossier needs its current board.');
    const spatial = data.frames.some(frame => frame.board);
    const boundSubjects = data.presentation === 'spatial-v2';
    const piece = (frameId, id) => {
        const found = frames.get(frameId)?.pieces.find(piece => piece.id === id);
        if(!found) throw new Error(`Dossier reference ${id} is absent from ${frameId}.`);
        return `${color(found.color)} ${names[found.type]} on ${found.square}`;
    };
    const labelCache = new Map([['root', 'the current board']]);
    const path = id => {
        if(labelCache.has(id)) return labelCache.get(id);
        const frame = frames.get(id), parent = frames.get(frame?.parentId);
        if(frame?.assumption && frame.parentId === null) return `the explicitly hypothetical ${color(frame.board.turn)}-to-move board, not the current position`;
        if(!frame || !parent) throw new Error(`Dossier is missing the parent of ${id}.`);
        const move = findPlayedMove(parent.fen, frame.fen);
        if(!move) throw new Error(`Dossier frame ${id} is not a legal transition.`);
        const before = frame.parentId === 'root' ? '' : path(frame.parentId) + ', then ';
        const label = `${before}${color(move.color)} ${move.san}`;
        labelCache.set(id, label);
        return label;
    };
    const out = [
        `CURRENT BOARD: ${color(data.fen.split(' ')[1])} to move. You play ${data.playerColor ? color(data.playerColor) : 'an unspecified side'}.`,
        root.pieces.map(item => `${color(item.color)} ${names[item.type]} ${item.square}`).join('; ') + '.',
        ...(data.subjects || []).map(subject => `QUESTION SUBJECT (${subject.status}): ${subject.pieceIds.map(id => piece('root', id)).join('; ') || 'no uniquely supported subject'}. `
            + (subject.status === 'ambiguous' ? 'Discuss these candidates separately; do not substitute an unrelated piece.' : '')),
        'Only the CURRENT BOARD is happening now. Every branch below is a separate conditional illustration, not a forced prediction.',
        'Geometric controls, attacks and defenses are not proof of a legal capture or a win. Move effects do not establish why an engine prefers a move.',
        ...(spatial ? ['Only the named side to move can make the listed legal moves. An absolute pin restricts moves exposing the king; a relative pin does not make a move illegal.'] : []),
        ...data.branches.map(branch => {
            const first = [...frames.values()].find(frame => frame.branch === branch.id && frame.parentId === 'root');
            const action = branch.action ? `${color(branch.action.actor.color)} ${names[branch.action.actor.type]} from ${branch.action.from} to ${branch.action.to} (${branch.action.san})`
                : first ? path(first.id) : branch.firstMove;
            const searched = branch.search;
            if(branch.hypothetical) return `HYPOTHESIS ${branch.id}: ${action}. ${branch.assumption} NO search evaluation for this idea.`;
            return `BRANCH ${branch.id}: ${action}; ${branch.recommended ? 'engine preferred at this search budget' : 'alternative'}; `
                + `${branch.comparison ? 'this candidate was searched independently' : 'root-search candidate'}.`
                + (spatial && searched ? ` Root-side Lc0 Q=${searched.q}, draw=${searched.draw}; visits=${branch.visits}; policy prior=${branch.policyPrior}. These are search estimates, not certified win chances.` : '')
                + (branch.human ? ` Maia-3 human-choice estimate ${(branch.human.probability * 100).toFixed(1)}% at self/opponent Elo ${branch.human.eloSelf}/${branch.human.eloOpponent}; not move quality.` : '');
        }),
    ];
    for(const frame of frames.values()) {
        if(!frame.board) continue;
        if(frame.id !== 'root') out.push(`CONDITIONAL BOARD ${frame.id}, ONLY ${frame.assumption ? 'under this assumption: ' + frame.assumption : 'after ' + path(frame.id)}: `
            + frame.pieces.map(item => `${color(item.color)} ${names[item.type]} ${item.square}`).join('; ') + '.');
        const { material, legalMoves, turn, check, checkmate, stalemate } = frame.board;
        out.push(`${frame.id}: ${color(turn)} to move${checkmate ? ', checkmate' : check ? ', in check' : stalemate ? ', stalemate' : ', not in check'}. `
            + `Material White ${material.w.points}, Black ${material.b.points}, White-minus-Black ${material.whiteMinusBlack} (P=1 N=B=3 R=5 Q=9; not evaluation). `
            + `Legal moves for ${color(turn)} ONLY: ${legalMoves.map(move => move.san).join(', ') || 'none'}.`);
        for(const move of legalMoves.filter(move => move.capturedId)) out.push(`LEGAL CAPTURE in ${frame.id}: ${piece(frame.id, move.pieceId)} `
            + `can play ${move.san}, capturing ${piece(frame.id, move.capturedId)}${move.capturedSquare !== move.to ? ' en passant' : ''}.`);
        if(frame.board.kingGeometry) {
            const kings = frame.board.kingGeometry;
            out.push(`${frame.id} KING GEOMETRY: White king ${kings.whiteKing}, Black king ${kings.blackKing}; `
                + `file separation ${kings.fileDistance}, rank separation ${kings.rankDistance}. `
                + (kings.interveningSquares ? `Straight-line squares BETWEEN the kings: ${kings.interveningSquares.join(', ') || 'none (adjacent or not aligned)'}; `
                    + `occupants on those squares: ${kings.interveningOccupants.map(id => piece(frame.id, id)).join(', ') || 'none'}. ` : '')
                + (kings.directOppositionShape ? `They face each other across the empty ${kings.betweenSquare} square (direct-opposition shape).`
                    : 'No direct-opposition shape (same file/rank, one empty square between).')
                + ' Geometry alone does not establish zugzwang or a winning king plan.');
        }
    }
    out.push('BOARD-VERIFIED OBSERVATIONS:');
    for(const claim of data.claims) {
        const tag = `[${claim.id}] `;
        if(claim.kind === 'board-state') {
            out.push(`${tag}CURRENT BOARD: ${color(claim.turn)} to move, in check=${claim.check}, checkmate=${claim.checkmate}, stalemate=${claim.stalemate}.`);
        } else if(claim.kind === 'file-state') {
            const occupied = claim.occupants.map(item => piece(claim.frameId, item.pieceId)).join('; ');
            const rays = claim.rookRays.map(ray => `${piece(claim.frameId, ray.pieceId)}, toward rank ${ray.direction > 0 ? '8' : '1'}: `
                + `empty squares ${ray.emptySquares.join(', ') || 'none'}; first blocker ${ray.firstBlocker ? piece(claim.frameId, ray.firstBlocker.pieceId) : 'none'}`).join('. ');
            out.push(`${tag}CURRENT ${claim.file}-file: ${occupied}. Pawn count ${claim.pawnCount}. ${rays}.`);
        } else if(claim.kind === 'piece-state') {
            out.push(`${tag}CURRENT ${piece(claim.frameId, claim.pieceId)}: geometric defenders ${claim.defenders.map(id => piece(claim.frameId, id)).join(', ') || 'none'}; `
                + `geometric attackers ${claim.attackers.map(id => piece(claim.frameId, id)).join(', ') || 'none'}.`
                + (claim.legalMoves === undefined ? '' : claim.legalMoves === null ? ' Not this piece\'s turn; no actual legal moves for it are asserted.'
                    : ` Actual legal moves for THIS piece ONLY: ${claim.legalMoves.map(uci => frames.get(claim.frameId).board.legalMoves.find(move => move.uci === uci).san).join(', ') || 'NONE'}.`));
        } else if(claim.kind === 'move') {
            out.push(`${tag}In ${claim.branchId}, the legal move sequence reaches: ${path(claim.frameId)}.`);
            if(claim.mechanism) {
                const beforeId = frames.get(claim.frameId).parentId;
                out.push(`${tag}Immediate changes: ` + claim.mechanism.moved.map(move => `${piece(beforeId, move.pieceId)} moves to ${move.to}`
                    + (move.beforeType !== move.afterType ? ` and promotes to ${names[move.afterType]}` : '')).join('; ')
                    + `; captured ${claim.mechanism.captured ? piece(beforeId, claim.mechanism.captured.id) : 'nothing'}; `
                    + `material change White-minus-Black ${claim.mechanism.materialDeltaWhite}; check=${claim.mechanism.check}, mate=${claim.mechanism.checkmate}.`);
                for(const pin of claim.mechanism.removedPins) out.push(`${tag}The previous ${pin.pinType || ''} ${pin.kind} of `
                    + `${piece(beforeId, pin.frontId)} to ${piece(beforeId, pin.backId)} by ${piece(beforeId, pin.sliderId)} no longer exists after this move.`);
                for(const pin of claim.mechanism.createdPins) out.push(`${tag}This move creates a ${pin.pinType || ''} ${pin.kind}: `
                    + `${piece(claim.frameId, pin.sliderId)} through ${piece(claim.frameId, pin.frontId)} to ${piece(claim.frameId, pin.backId)}.`);
            }
        } else if(claim.kind === 'capture') {
            out.push(`${tag}In this conditional sequence (${path(claim.causedBy)}), ${piece(claim.frameId, claim.capturedId)} is captured.`);
        } else if(claim.kind === 'geometric-relation-change') {
            const relation = claim.relation;
            const target = relation.targetId ? piece(claim.frameId, relation.targetId) : `square ${relation.to}`;
            out.push(`${tag}In ${frames.get(claim.causedBy).branch}, after ${path(claim.causedBy)}, this geometric relation is ${claim.change}: `
                + `${piece(claim.frameId, relation.pieceId)} ${relation.kind === 'control' ? 'controls' : relation.kind === 'defend' ? 'defends' : 'attacks'} ${target}.`);
        } else if(claim.kind === 'ray-state') {
            const diagonalStep = claim.emptySquares[0] || claim.firstBlocker?.square;
            const direction = claim.dx === 0 ? `along the ${claim.from[0]}-file toward ${claim.from[0]}${claim.dy > 0 ? '8' : '1'}`
                : claim.dy === 0 ? `along rank ${claim.from[1]} toward ${claim.dx > 0 ? 'h' : 'a'}${claim.from[1]}`
                    : diagonalStep ? `along the diagonal through ${diagonalStep}` : 'toward the board edge (no diagonal squares)';
            out.push(`${tag}On ${claim.frameId === 'root' ? 'the CURRENT BOARD' : 'the CONDITIONAL BOARD after ' + path(claim.frameId)}, `
                + `${piece(claim.frameId, claim.pieceId)}, ${boundSubjects ? direction : `ray (file step ${claim.dx}, rank step ${claim.dy})`}: empty squares ${claim.emptySquares.join(', ') || 'none'}; `
                + `first blocker ${claim.firstBlocker ? piece(claim.frameId, claim.firstBlocker.pieceId) : 'none before board edge'}.`);
        } else if(claim.kind === 'pin-state') {
            out.push(`${tag}On ${claim.frameId === 'root' ? 'the CURRENT BOARD' : 'the CONDITIONAL BOARD after ' + path(claim.frameId)}, `
                + `${claim.pinType || ''} ${claim.relationKind}: ${piece(claim.frameId, claim.sliderId)} through ${piece(claim.frameId, claim.frontId)} `
                + `to ${piece(claim.frameId, claim.backId)}. `
                + (claim.frontLegalMoves === null ? 'It is not the front piece\'s turn; no current legal-move claim is made.'
                    : `${boundSubjects ? `The front piece ${claim.frontLegalMoves.length ? 'IS legally mobile' : 'has NO legal move on this board'}. Its actual legal moves: ` : "The front piece's actual legal moves: "}${claim.frontLegalMoves.map(uci => {
                        const move = frames.get(claim.frameId).board?.legalMoves.find(move => move.uci === uci);
                        return move ? `${move.san} (${move.from} to ${move.to})` : uci;
                    }).join(', ') || 'none'}.`));
        } else if(claim.kind === 'pawn-state') {
            out.push(`${tag}On ${claim.frameId === 'root' ? 'the CURRENT BOARD' : 'the CONDITIONAL BOARD after ' + path(claim.frameId)}, `
                + `${piece(claim.frameId, claim.pieceId)}: passed=${claim.passed}, isolated=${claim.isolated}, doubled=${claim.doubled}. Structural properties, not a claim that the pawn wins.`);
        } else throw new Error(`Unsupported dossier claim kind: ${claim.kind}`);
    }
    out.push(`Other observations omitted for context budget: ${data.omittedClaims}. Their absence does not make an unlisted move illegal.`);
    return out.join('\n');
}
