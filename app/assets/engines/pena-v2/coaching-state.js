import { moveMechanism } from './spatial.js';

const freeze = value => {
    if(value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
};

/** Complete occupied-piece relations; geometry never asserts capture safety. */
export function pieceAfterState(frame, pieceId) {
    const spatial = frame?.spatial;
    const piece = spatial?.pieces.find(item => item.id === pieceId);
    if(!piece || spatial.frameId !== frame.id) throw new Error('After-state requires an exact spatial frame and present piece.');
    const targets = spatial.pieces.filter(target => target.color !== piece.color && piece.controls.includes(target.square));
    const legal = piece.legalMoves === null ? null : spatial.legalMoves.filter(move => move.pieceId === pieceId);
    return freeze({ frameId: frame.id, pieceId, color: piece.color, type: piece.type, square: piece.square,
        completeness: 'complete-occupied-relations', enemyTargets: targets.map(target => target.id),
        attackers: [...piece.attackers], defenders: [...piece.defenders],
        legalApplicability: legal === null ? 'not-side-to-move' : 'actual-side-to-move',
        legalMoves: legal === null ? null : legal.map(move => move.uci),
        legalCaptures: legal === null ? null : legal.filter(move => move.capturedId).map(move => ({ uci: move.uci,
            capturedId: move.capturedId, capturedSquare: move.capturedSquare })),
        sideToMove: spatial.turn, sideToMoveInCheck: spatial.check, checkmate: spatial.checkmate, stalemate: spatial.stalemate });
}

export function firstMoveStates(input) {
    if(!Array.isArray(input?.frames) || !Array.isArray(input.lines)) throw new Error('Expected a framed coaching input.');
    const root = input.frames.find(frame => frame.id === 'root');
    if(!root?.spatial) throw new Error('Coaching input has no exact current spatial frame.');
    return freeze(input.lines.map(line => {
        const frame = input.frames.find(frame => frame.id === line.frameIds[0]);
        if(!frame?.move || frame.parentId !== root.id) throw new Error('Expected a legal first move from the current board.');
        const mechanism = moveMechanism(root, frame);
        return { lineId: line.id, frameId: frame.id, beforeFrameId: root.id, scope: 'conditional-not-played',
            move: { ...frame.move }, moved: mechanism.moved.map(item => pieceAfterState(frame, item.pieceId)),
            captured: mechanism.captured, materialDeltaWhite: mechanism.materialDeltaWhite,
            removedPins: mechanism.removedPins, createdPins: mechanism.createdPins };
    }));
}

export function afterStateText(state, frame) {
    if(state.frameId !== frame?.id) throw new Error('Cannot render an after-state against another frame.');
    const label = id => {
        const piece = frame.pieces.find(item => item.id === id);
        if(!piece) throw new Error('After-state relation refers to an absent piece.');
        return `${piece.color}${piece.type.toUpperCase()}@${piece.square}`;
    };
    const list = ids => ids.map(label).join(',') || 'NONE';
    return `${label(state.pieceId)} enemyTargets=${list(state.enemyTargets)};attackers=${list(state.attackers)};defenders=${list(state.defenders)};`
        + `next=${state.sideToMove};check=${state.sideToMoveInCheck};mate=${state.checkmate};stalemate=${state.stalemate};`
        + `legalMoves=${state.legalMoves === null ? 'N/A(other-side-to-move)' : state.legalMoves.join(',') || 'NONE'};`
        + `legalCaptures=${state.legalCaptures === null ? 'N/A(other-side-to-move)' : state.legalCaptures.map(move => `${move.uci}:${label(move.capturedId)}`).join(',') || 'NONE'}`;
}
