import { validMoveEvidence } from './moveEvidence.js';
import { validateSelectionWeights } from './hintSelection.js';
import { openingCount } from './openings.js';
import { maxBoards } from './eloPolicy.js?v=10boards';

export const storageKey = 'acasEloResult';
export const settingsStorageKey = 'acasEloSettings';
export const checkpointStorageKey = 'acasEloCheckpoint';
export const measurementProtocol = 'maia-top-policy-paired-openings-pooled-personality-v6';

export function parseCheckpoint(raw) {
    if(raw === null) return null;
    const data = JSON.parse(raw);
    if(data?.selectionWeights !== undefined) validateSelectionWeights(data.selectionWeights);
    if(data?.protocol !== measurementProtocol) {
        throw new Error('This saved run uses an older opponent or scoring protocol, or a different session transport. Discard it and start a new run.');
    }
    const validGame = (game, unfinished = false) => game && Number.isInteger(game.opponent)
        && game.opponent >= 600 && game.opponent <= 2600
        && Number.isInteger(game.opening) && game.opening >= 0 && game.opening < openingCount
        && ([0, 0.5, 1].includes(game.score) || (unfinished && game.score === undefined))
        && (game.moveEvidence === undefined || (game.score !== undefined && validMoveEvidence(game.moveEvidence)))
        && (game.suggestionFallback === undefined || typeof game.suggestionFallback === 'boolean')
        && (game.materialAdjudication === undefined || (game.materialAdjudication === true && [0, 1].includes(game.score)))
        && typeof game.acasIsWhite === 'boolean';
    const savedGame = ({ opponent, score, acasIsWhite, opening, moveEvidence, suggestionFallback, materialAdjudication }) => ({
        opponent, acasIsWhite, opening,
        ...(suggestionFallback ? { suggestionFallback: true } : {}),
        ...(materialAdjudication ? { materialAdjudication: true } : {}),
        ...(score === undefined ? {} : { score }),
        ...(moveEvidence === undefined ? {} : { moveEvidence: { ...moveEvidence, totals: [...moveEvidence.totals] } })
    });
    if(!data || ![1, 2].includes(data.version) || !['auto', 'manual'].includes(data.mode)
        || !Number.isInteger(data.total) || data.total < 1 || data.total > openingCount * 2
        || !Number.isInteger(data.boards) || data.boards < 1 || data.boards > 100
        || !Array.isArray(data.games) || data.games.length > data.total
        || !data.games.every(game => validGame(game))
        || (data.version === 2 && (!Array.isArray(data.batch) || data.batch.length > maxBoards
            || data.games.length + data.batch.length > data.total
            || !data.batch.every(game => validGame(game, true))))) {
        throw new Error('Invalid or incompatible EloEye checkpoint');
    }
    return {
        version: data.version, protocol: data.protocol, mode: data.mode, total: data.total, boards: data.boards,
        games: data.games.map(savedGame),
        ...(data.selectionWeights === undefined ? {} : { selectionWeights: validateSelectionWeights(data.selectionWeights) }),
        ...(data.version === 2 ? { batch: data.batch.map(savedGame) } : {})
    };
}
