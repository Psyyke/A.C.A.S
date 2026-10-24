import { parseVariantFen } from './variantPosition.js';

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
    const validDetail = ['full', 'piece', 'destination'].includes(savedDetail) ? savedDetail : 'full';

    return { ...settings, playerColor, detail: settings.movesOnDemand ? 'full' : validDetail };
}

// Classify the moving piece at the analyzed root, not the destination/promotion.
export function filterHintMoves(moves, settings, fallbackFen, includeOpponent = false) {
    const positions = new Map();
    const describePiece = (from, fen, isReply = false) => {
        if(!positions.has(fen)) positions.set(fen, parseVariantFen(fen));
        const { rows, fields } = positions.get(fen);
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

    return moves.flatMap(move => {
        const fen = move.fen || fallbackFen;
        const player = describePiece(move.player?.[0] ?? move.from, fen);
        if(!includeOpponent) return player.enabled ? [{ ...move, hintDetail: player.isEnemy ? 'full' : settings.detail ?? 'full' }] : [];

        const [oppFrom, oppTo] = move.opponent ?? [];
        const opponent = oppFrom && oppTo ? describePiece(oppFrom, fen, true) : null;
        const opponentEnabled = Boolean(opponent?.enabled && settings.showOpponentMoveGuess);
        if(!player.enabled && !opponentEnabled) return [];

        return [{ ...move, playerHidden: !player.enabled, opponentHidden: !opponentEnabled,
            hintDetail: player.isEnemy ? 'full' : settings.detail ?? 'full',
            opponentHintDetail: opponent?.isEnemy ? 'full' : settings.detail ?? 'full' }];
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