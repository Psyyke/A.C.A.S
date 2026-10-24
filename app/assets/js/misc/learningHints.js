import { parseVariantFen, variantConfig } from './variantPosition.js';

const hintDetails = Object.freeze({
    full: { detail: 'full' }, piece: { detail: 'piece' }, destination: { detail: 'destination' },
    captures: { detail: 'full', captures: true }, movement: { detail: 'full', captures: false },
    'captures-destination': { detail: 'destination', captures: true },
    'movement-destination': { detail: 'destination', captures: false },
    'captures-piece': { detail: 'piece', captures: true },
    'movement-piece': { detail: 'piece', captures: false }
});

export const hintPieceKeys = Object.freeze({
    p: 'suggestPawn', n: 'suggestKnight', b: 'suggestBishop',
    r: 'suggestRook', q: 'suggestQueen', k: 'suggestKing', other: 'suggestOtherPieces'
});

export const enemyHintPieceKeys = Object.freeze(Object.fromEntries(
    Object.entries(hintPieceKeys).map(([piece, key]) => [piece, key.replace('suggest', 'suggestEnemy')])
));

export const hintSettingKeys = Object.freeze([
    'hintDetail', 'onlySuggestPieces', ...Object.values(hintPieceKeys), ...Object.values(enemyHintPieceKeys)
]);

export async function getHintSettings(instance, profile) {
    const keys = [...hintSettingKeys, 'movesOnDemand', 'showOpponentMoveGuess'];
    const [values, playerColor] = await Promise.all([
        Promise.all(keys.map(key => instance.getConfigValue(key, profile))),
        instance.getPlayerColor?.() ?? 'w'
    ]);
    const settings = Object.fromEntries(keys.map((key, index) => [key, values[index]]));
    const savedDetail = settings.hintDetail ?? (settings.onlySuggestPieces ? 'piece' : 'full');
    const validDetail = Object.hasOwn(hintDetails, savedDetail) ? savedDetail : 'full';

    return { ...settings, playerColor, detail: settings.movesOnDemand ? 'full' : validDetail };
}

// Classify the moving piece at the analyzed root, not the destination/promotion.
export function filterHintMoves(moves, settings, fallbackFen, includeOpponent = false) {
    const positions = new Map();
    const selectedDetail = Object.hasOwn(hintDetails, settings.detail) ? hintDetails[settings.detail] : hintDetails.full;
    const positionAt = fen => {
        if(!positions.has(fen)) positions.set(fen, parseVariantFen(fen));
        return positions.get(fen);
    };
    const pieceAt = (position, square) => position.rows[position.rows.length - Number(square?.slice(1))]?.[square?.charCodeAt(0) - 97];
    const pieceType = piece => String(piece || '').replace(/[+~]/g, '');
    const sameColor = (piece, other) => piece && other
        && (piece === piece.toUpperCase()) === (other === other.toUpperCase());
    const isCapture = (from, to, fen, parentMove = null) => {
        if(/^[a-zA-Z]@$/.test(from)) return false;
        const position = positionAt(fen);
        let enPassant = position.fields[3];
        const changedSquares = new Map();
        const at = square => changedSquares.has(square) ? changedSquares.get(square) : pieceAt(position, square);

        // Own replies are evaluated after the enemy's candidate, not on the root board.
        if(parentMove) {
            const [parentFrom, parentTo] = parentMove.player ?? [];
            const droppedPiece = /^[a-zA-Z]@$/.test(parentFrom) ? parentFrom[0] : null;
            const piece = droppedPiece ? (position.fields[1] === 'b' ? droppedPiece.toLowerCase() : droppedPiece.toUpperCase()) : at(parentFrom);
            const type = pieceType(piece).toLowerCase();
            const target = at(parentTo);
            const isCastle = variantConfig(parentMove).variant === 'chess' && type === 'k'
                && parentFrom?.slice(1) === parentTo?.slice(1)
                && (sameColor(piece, target) && pieceType(target).toLowerCase() === 'r'
                    || Math.abs(parentFrom.charCodeAt(0) - parentTo.charCodeAt(0)) > 1);
            changedSquares.set(parentFrom, null);
            if(isCastle) {
                const rank = parentFrom.slice(1);
                const kingside = parentTo.charCodeAt(0) > parentFrom.charCodeAt(0);
                const rookFrom = sameColor(piece, target) ? parentTo : `${kingside ? 'h' : 'a'}${rank}`;
                const rook = at(rookFrom);
                changedSquares.set(rookFrom, null);
                changedSquares.set(`${kingside ? 'g' : 'c'}${rank}`, piece);
                changedSquares.set(`${kingside ? 'f' : 'd'}${rank}`, rook);
            } else {
                if(type === 'p' && !target && parentFrom[0] !== parentTo[0] && enPassant === parentTo)
                    changedSquares.set(`${parentTo[0]}${parentFrom.slice(1)}`, null);
                const promotion = parentMove.playerPromotion;
                const promotedPiece = promotion && /^[a-zA-Z]$/.test(promotion)
                    ? (piece === piece?.toUpperCase() ? promotion.toUpperCase() : promotion.toLowerCase()) : piece;
                changedSquares.set(parentTo, promotedPiece);
            }
            enPassant = type === 'p' && parentFrom[0] === parentTo[0]
                && Math.abs(Number(parentFrom.slice(1)) - Number(parentTo.slice(1))) === 2
                ? `${parentFrom[0]}${(Number(parentFrom.slice(1)) + Number(parentTo.slice(1))) / 2}` : '-';
        }

        const piece = at(from), target = at(to);
        // Friendly rook destinations in Chess960 castling are not captures.
        return Boolean(piece && target && target !== '*' && !sameColor(piece, target))
            || pieceType(piece).toLowerCase() === 'p' && !target && from?.[0] !== to?.[0] && enPassant === to;
    };
    const describePiece = (from, fen, isReply = false) => {
        const { rows, fields } = positionAt(fen);
        const isDrop = /^[a-zA-Z]@$/.test(from);
        const piece = isDrop ? from[0] : rows[rows.length - Number(from?.slice(1))]?.[from?.charCodeAt(0) - 97];
        const type = String(piece || '').replace(/[+~]/g, '');
        const turn = fields[1] === 'b' ? 'b' : 'w';
        const color = isDrop || !type ? (isReply ? (turn === 'w' ? 'b' : 'w') : turn)
            : type === type.toUpperCase() ? 'w' : 'b';
        const isEnemy = color !== (settings.playerColor ?? 'w');
        const keys = isEnemy ? enemyHintPieceKeys : hintPieceKeys;
        // Missing defaults in older profiles mean enabled, never disabled.
        return { enabled: settings[keys[type.toLowerCase()] ?? keys.other] !== false, isEnemy };
    };
    const describeMove = (from, to, fen, isReply = false, parentMove = null) => {
        const piece = describePiece(from, fen, isReply);
        const matches = piece.isEnemy || selectedDetail.captures === undefined
            || isCapture(from, to, fen, parentMove) === selectedDetail.captures;
        return { enabled: piece.enabled && matches, detail: piece.isEnemy ? 'full' : selectedDetail.detail };
    };

    return moves.flatMap(move => {
        const fen = move.fen || fallbackFen;
        const player = describeMove(move.player?.[0] ?? move.from, move.player?.[1] ?? move.to, fen);
        if(!includeOpponent) return player.enabled ? [{ ...move, hintDetail: player.detail }] : [];

        const [oppFrom, oppTo] = move.opponent ?? [];
        const opponent = oppFrom && oppTo ? describeMove(oppFrom, oppTo, fen, true, move) : null;
        const opponentEnabled = Boolean(opponent?.enabled && settings.showOpponentMoveGuess);
        if(!player.enabled && !opponentEnabled) return [];

        return [{ ...move, playerHidden: !player.enabled, opponentHidden: !opponentEnabled,
            hintDetail: player.detail, opponentHintDetail: opponent?.detail ?? 'full' }];
    });
}

export function presentHintMove(move, detail) {
    if(detail === 'full') return move;
    const isPieceOnly = detail === 'piece';
    return { ...move, hintDetail: detail,
        player: [isPieceOnly ? move.player[0] : '??', isPieceOnly ? '??' : move.player[1]],
        playerUci: null, playerPromotion: null, opponent: [null, null], opponentPromotion: null };
}

// Run before inputs/instances are initialized, also covering imported old configs.
export function migrateHintSettings(config) {
    let changed = false;
    const migrate = (scope, inherited = {}) => {
        if(!scope || typeof scope !== 'object') return;
        const hasDetail = scope.hintDetail !== undefined;
        const hasLegacyValue = typeof scope.onlySuggestPieces === 'boolean';
        const curve = scope.dynamicSettings?.onlySuggestPieces;
        const inheritedDetail = inherited.hintDetail ?? (inherited.onlySuggestPieces ? 'piece' : 'full');
        const needsValue = scope.hintDetail === undefined && (hasLegacyValue || curve);
        if(needsValue) {
            scope.hintDetail = hasLegacyValue ? (scope.onlySuggestPieces ? 'piece' : 'full') : inheritedDetail;
            changed = true;
        }
        const needsCurve = !hasDetail && curve && typeof curve === 'object' && !Array.isArray(curve)
            && scope.dynamicSettings.hintDetail === undefined;
        if(needsCurve) {
            scope.dynamicSettings.hintDetail = { ...curve, boolean: false, interpolation: 'step',
                values: ['full', 'piece'], minY: 0, maxY: 1 };
            changed = true;
        }
        if(curve && scope.dynamicSettings.hintDetail !== undefined) {
            delete scope.dynamicSettings.onlySuggestPieces;
            changed = true;
        }
    };
    const global = config?.global;
    migrate(global);
    Object.values(global?.profiles || {}).forEach(profile => migrate(profile, global));
    Object.values(config?.instance || {}).forEach(instance => {
        migrate(instance, global);
        Object.entries(instance?.profiles || {}).forEach(([key, profile]) =>
            migrate(profile, { ...global, ...instance, ...global?.profiles?.[key],
                dynamicSettings: { ...global?.profiles?.[key]?.dynamicSettings, ...instance.dynamicSettings } }));
    });
    return changed;
}