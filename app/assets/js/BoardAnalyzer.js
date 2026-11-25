/* [A.C.A.S Board Analyzer]
 * - License: GPLv3
 * - Version: 0.3
 * - Standard chess uses legal exchanges; variant overlays use approximate attacks.
 * */

import CaptureExchange, { getPieceValue } from './misc/captureExchange.js';
import { parseVariantFen, variantConfig } from './misc/variantPosition.js';
import { getVariantPiecePaths } from './misc/variantAttacks.js';

export default class BoardAnalyzer {
    constructor(fen, config) {
        this.fen = fen;
        this.debug = config?.debug ? true : false;
        this.variant = variantConfig(config).variant;
        this.analyzeCaptures = config?.analyzeCaptures !== false;

        // The exchange calculator only knows orthodox rules. Chess960 has the same
        // capture geometry; other variants use an inexpensive attack/defense estimate.
        this.captureExchange = this.analyzeCaptures && this.variant === 'chess' ? new CaptureExchange(fen) : null;

        this.isPlayerBlack = (config?.orientation || (fen && fen.split(' ')[1]) || 'w').toLowerCase() === 'b';
        this.board = this.parseFEN();
        this.boardHeight = this.board.length;  // Number of rows in the board
        this.boardWidth = this.board[0]?.length ?? 0;  // Number of columns in the board

        this.fenToValue = getPieceValue;

        this.pieces = this.getPiecesWithPaths();

        if(this.debug) {
            console.log('[BoardAnalyzer Loaded]', {
                fen, 'board': this.board, 'isPlayerBlack': this.isPlayerBlack, 'pieces': this.pieces,
                'boardWidth': this.boardWidth, 'boardHeight': this.boardHeight
            });
        }
    }

    indexToFen(index) {
        const [y, x] = index;
        let file, rank;
    
        if (this.isPlayerBlack) {
            file = String.fromCharCode('a'.charCodeAt(0) + (this.boardWidth - 1 - x));
            rank = y + 1;
        } else {
            file = String.fromCharCode('a'.charCodeAt(0) + x);
            rank = this.boardHeight - y;
        }
    
        return `${file}${rank}`;
    }

    parseFEN() {
        if(!this.fen || typeof this.fen !== 'string') return [];

        const { rows } = parseVariantFen(this.fen);

        if(this.debug && rows.some(row => row.length !== rows[0].length))
            throw new Error('Inconsistent row lengths in FEN');

        // Rotate expanded squares, not FEN text ("10", "+P", and pockets are tokens).
        return this.isPlayerBlack ? rows.reverse().map(row => row.reverse()) : rows;
    }

    // Extract all pieces from the board, categorized by player and with paths
    // Paths are controlled squares, including friendly pieces that are defended.
    // Sliders stop at the first blocker; cannons require a screen first.
    getPiecesWithPaths() {
        const pieces = { player: [], enemy: [] };

        for(let y = 0; y < this.boardHeight; y++) {
            for(let x = 0; x < this.boardWidth; x++) {
                const pieceFen = this.board[y][x];
                const isPieceWhite = pieceFen && pieceFen === pieceFen.toUpperCase();
                const isPlayerPiece = isPieceWhite === !this.isPlayerBlack;

                if(!pieceFen || pieceFen === '*') continue;

                const pObj = { 'piece': pieceFen, 'position': [y, x], ranking: this.fenToValue(pieceFen.replace(/[+~]/g, '')) };

                pObj['paths'] = this.getPiecePaths(pObj);

                if(isPlayerPiece) {
                    pieces.player.push(pObj);
                } else {
                    pieces.enemy.push(pObj);
                }
            }
        }

        return pieces;
    }

    getPiecePaths(pObj) {
        if(!pObj) throw new Error('Failed to process pObj on getPiecePaths()!');

        return getVariantPiecePaths(this.board, pObj.piece, pObj.position, this.variant, this.isPlayerBlack);
    }

    analyze() {
        const { player, enemy } = this.pieces;
        const width = this.boardWidth, height = this.boardHeight;
        const index = ([row, col]) => row * width + col;
        const collectAttackers = pieces => {
            const lookup = Array.from({ length: width * height }, () => []);
            for(const piece of pieces) {
                piece.id = piece.piece + piece.position.join(',');
                for(const path of piece.paths) lookup[index(path)].push(piece);
            }
            return lookup;
        };
        const playerPaths = collectAttackers(player);
        const enemyPaths = collectAttackers(enemy);
        const analyzePieces = (pieces, ownPaths, opposingPaths) => {
            for(const piece of pieces) {
                const square = index(piece.position);
                piece.defendedBy = ownPaths[square];
                piece.attackedBy = opposingPaths[square];
                piece.captureLoss = this.captureExchange?.captureLoss(this.indexToFen(piece.position)) ?? null;
                piece.captureDanger = this.analyzeCaptures && (this.captureExchange?.valid
                    ? piece.captureLoss > 0
                    : piece.attackedBy.length > 0 && (piece.defendedBy.length < piece.attackedBy.length
                        || piece.attackedBy.some(attacker => attacker.ranking > 0 && attacker.ranking < piece.ranking)));
            }
        };
        analyzePieces(player, playerPaths, enemyPaths);
        analyzePieces(enemy, enemyPaths, playerPaths);
        const squares = { safe: [], playerOnly: [], enemyOnly: [], contested: [] };
        for(let row = 0; row < height; row++) {
            for(let col = 0; col < width; col++) {
                if(this.board[row][col] === '*') continue;
                const square = [row, col], squareIndex = row * width + col;
                const playerCount = playerPaths[squareIndex].length, enemyCount = enemyPaths[squareIndex].length;
                if(!playerCount && !enemyCount) squares.safe.push(square);
                else if(!enemyCount) squares.playerOnly.push(square);
                else if(!playerCount) squares.enemyOnly.push(square);
                else squares.contested.push({ square, counts: { playerCount, enemyCount } });
            }
        }
        return { player, enemy, squares };
    }
}