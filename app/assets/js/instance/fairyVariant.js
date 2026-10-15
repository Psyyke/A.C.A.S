import { getDynamicEngineDbKeyPrefix, getDynamicOption } from '../gui/dynamicEngineOptionState.js';

const engineId = 'fairy-stockfish-nnue-wasm';
const optionPrefix = getDynamicEngineDbKeyPrefix(engineId);

export const fairyVariantKey = `${optionPrefix}UCI_Variant`;
export const fairyChess960Key = `${optionPrefix}UCI_Chess960`;

export function isBuiltInFairyEngine(variables) {
    return !variables?.useExternalChessEngine && variables?.requestedEngine === engineId;
}

export function isFairyVariantSetting(key) {
    return key === fairyVariantKey || key === fairyChess960Key;
}

export async function applyFairyVariantSettings(fallbackVariant, profile, isCurrentStart) {
    const variables = this.pV[profile];
    const snapshot = this.applyingSettings?.get(profile) ?? variables.startupConfig;
    const resolvedProfile = snapshot ? { config: snapshot } : await GET_PROFILE_FOR_INSTANCE(profile, this.instanceID);
    const config = resolvedProfile?.config ?? {};
    const variantOption = getDynamicOption(fairyVariantKey, profile, this.instanceID);
    const chess960Option = getDynamicOption(fairyChess960Key, profile, this.instanceID);
    const hasVariantCurve = config.dynamicSettings?.chessVariant?.enabled;
    const fallback = hasVariantCurve ? config.chessVariant
        : this.detectedChessVariant || fallbackVariant || config.chessVariant || 'chess';
    const savedVariant = config[fairyVariantKey];
    const supportedVariants = variantOption?.vars ?? [];
    const hasSavedVariant = supportedVariants.includes(savedVariant);
    const selectedVariant = hasSavedVariant ? savedVariant : fallback;
    const normalizedVariant = IS_VARIANT_960(selectedVariant) ? 'chess' : FORMAT_VARIANT(selectedVariant);
    const engineVariant = supportedVariants.find(value => FORMAT_VARIANT(value) === normalizedVariant);
    const savedChess960 = config[fairyChess960Key];
    const hasSavedChess960 = /^(true|false)$/i.test(String(savedChess960));
    const useChess960 = hasSavedChess960 ? String(savedChess960).toLowerCase() === 'true'
        : IS_VARIANT_960(selectedVariant) || Boolean(config.useChess960);

    if(!isCurrentStart()) return false;

    if(!variantOption || !chess960Option || !engineVariant)
        throw new Error(`Fairy-Stockfish does not support the selected variant: ${selectedVariant}`);

    const variantSent = await this.applyDynamicOption(fairyVariantKey, engineVariant, profile, true);

    if(variantSent === false || !isCurrentStart()) return false;

    const chess960Sent = await this.applyDynamicOption(fairyChess960Key, useChess960, profile, true);

    return chess960Sent !== false && isCurrentStart();
}

export async function refreshFairyBoard(profile, isCurrentStart) {
    const variables = this.pV[profile];
    const startedAt = Date.now();

    if(!isCurrentStart()) return false;

    const startPos = await new Promise((resolve, reject) => {
        const interval = setInterval(() => {
            const isReady = variables.variantStartposFen && window.ChessgroundX && !this.environmentSetupPending;
            const timedOut = Date.now() - startedAt >= 5000;

            if(!isCurrentStart()) {
                clearInterval(interval);
                resolve(null);
            } else if(isReady) {
                clearInterval(interval);
                resolve(variables.variantStartposFen);
            } else if(timedOut) {
                clearInterval(interval);
                reject(new Error('Fairy-Stockfish did not provide its variant start position.'));
            }
        }, 10);
    });

    if(!startPos || !isCurrentStart()) return false;

    await this.setupEnvironment(startPos, GET_BOARD_DIMENSIONS_FROM_FEN(startPos), profile);

    if(!isCurrentStart()) return false;

    delete variables.variantStartposFen;
    this.variantStartPosFen = startPos;

    return true;
}