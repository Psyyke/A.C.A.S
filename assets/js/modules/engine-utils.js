// engine-utils.js
// Chess engine helpers and evaluation logic for A.C.A.S.
// Part of the modular ES6 codebase in assets/js/modules/.
// Used for engine communication, evaluation, and history tracking.

// Engine utility functions for A.C.A.S

/**
 * Get the default starting FEN string for chess.
 * @returns {string}
 */
export function getDefaultFen() {
    return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
}

/**
 * Get result labels for move evaluation.
 * @returns {Array<string>}
 */
export function getResultLabels() {
    return ['Neutral', 'Inaccuracy', 'Mistake', 'Blunder', 'Catastrophic', 'Good Move', 'Excellent', 'Brilliancy'];
}

/**
 * Create a new centipawn history object.
 * @returns {Object}
 */
export function createCpHistory() {
    return { 'w': [], 'b': [] };
}

/**
 * Create a new engine worker for a given engine.
 * @param {string} folderName
 * @param {string} [fileName]
 * @param {Function} onMessage
 * @param {Function} onError
 * @returns {Worker}
 */
export function createEngineWorker(folderName, fileName = folderName, onMessage, onError) {
    const stockfish = new Worker(`../app/assets/engines/${folderName}/${fileName}.js`);
    stockfish.onmessage = onMessage;
    stockfish.onerror = onError;
    return stockfish;
}
