// board-utils.js
// Board parsing, FEN utilities, and board-related helpers for A.C.A.S.
// Part of the modular ES6 codebase in assets/js/modules/.
// Used by board display, analysis, and engine modules.

// Board utility functions for A.C.A.S

/**
 * Flip a FEN string for board orientation.
 * @param {string} fen
 * @returns {string}
 */
export function flipFen(fen) {
    const firstSpace = fen.indexOf(' ');
    const board = fen.slice(0, firstSpace);
    const flippedBoard = board.split('/')
        .reverse()
        .map(rank => [...rank].reverse().join(''))
        .join('/');
    return flippedBoard + fen.slice(firstSpace);
}

/**
 * Get the value of a chess piece from its FEN character.
 * @param {string} c
 * @returns {number}
 */
export function fenToValue(c) {
    return ({ P:1, N:3, B:3, R:5, Q:9, K:100 })[c.toUpperCase()] || 0;
}

/**
 * Parse a FEN string into a 2D board array.
 * @param {string} fen
 * @param {boolean} isPlayerBlack
 * @param {boolean} debug
 * @returns {Array}
 */
export function parseFEN(fen, isPlayerBlack, debug) {
    let boardWidth;
    if(isPlayerBlack) fen = flipFen(fen);
    const rows = fen.split(' ')[0].split('/');
    const board = [];
    for(let i = 0; i < rows.length; i++) {
        const row = [];
        const rowString = rows[i];
        for(let char of rowString) {
            if(parseInt(char))
                row.push(...Array(parseInt(char)).fill(null));
            else
                row.push(char);
        }
        if(boardWidth === undefined) {
            boardWidth = row.length;
        } else {
            if(row.length !== boardWidth && debug) throw new Error('Inconsistent row lengths in FEN');
        }
        board.push(row);
    }
    return board;
}
