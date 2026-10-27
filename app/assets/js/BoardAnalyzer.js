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

    createPathLookup(pieces) {
        const lookup = {};

        for(let pObj of pieces) {
            const id = pObj.piece + pObj.position.join(',');

            lookup[id] = new Set(pObj.paths.map(path => path.join(',')));

            pObj.id = id;
        }

        return lookup;
    }

    analyze() {
        const { player, enemy } = this.pieces;

        const boardWidth = this.boardWidth;
        const boardHeight = this.boardHeight;

        // Preprocess paths for faster lookup (player and enemy)
        const playerPaths = this.createPathLookup(player);
        const enemyPaths = this.createPathLookup(enemy);

        // Analyze protection, attacks, and capture danger for a set of pieces
        const analyzePieces = (pieces, opponentPieces, piecePaths, opponentPaths) => {
            for(let pObj of pieces) {
                const pos = pObj.position;

                // Detect who defends the current piece
                pObj.defendedBy = pieces.filter(x => piecePaths[x.id]?.has(pos.join(',')));
                // Detect attacks on the current piece by opponent
                pObj.attackedBy = opponentPieces.filter(x => opponentPaths[x.id]?.has(pos.join(',')));

                // Preserve exact orthodox exchanges. Variants deliberately use a
                // rough geometric estimate instead of another engine/rules system.
                pObj.captureLoss = this.captureExchange?.captureLoss(this.indexToFen(pos)) ?? null;
                pObj.captureDanger = this.analyzeCaptures && (this.captureExchange?.valid
                    ? pObj.captureLoss > 0
                    : pObj.attackedBy.length > 0 && (pObj.defendedBy.length < pObj.attackedBy.length
                        || pObj.attackedBy.some(attacker => attacker.ranking > 0 && attacker.ranking < pObj.ranking)));
            }
        };

        analyzePieces(player, enemy, playerPaths, enemyPaths);
        analyzePieces(enemy, player, enemyPaths, playerPaths);

        const analyzeSquares = () => {
            const result = {
                safe: [],
                playerOnly: [],
                enemyOnly: [],
                contested: []
            };

            const playerSeenCounts = new Map();
            const enemySeenCounts = new Map();

            // Collect squares that the player's pieces see
            for(let piece in playerPaths) {
                let squares = playerPaths[piece];

                squares.forEach(square => {
                    playerSeenCounts.set(square, (playerSeenCounts.get(square) || 0) + 1);
                });
            }

            // Collect squares that the enemy's pieces see
            for(let piece in enemyPaths) {
                let squares = enemyPaths[piece];

                squares.forEach(square => {
                    enemySeenCounts.set(square, (enemySeenCounts.get(square) || 0) + 1);
                });
            }

            // Loop through all possible squares on the board
            for(let row = 0; row < boardHeight; row++) {
                for(let col = 0; col < boardWidth; col++) {
                    const square = `${row},${col}`;
                    if(this.board[row][col] === '*') continue;

                    const playerCount = playerSeenCounts.get(square) || 0;
                    const enemyCount = enemySeenCounts.get(square) || 0;

                    if(playerCount === 0 && enemyCount === 0) {
                        result.safe.push([row, col]); // Safe squares

                    } else if(playerCount > 0 && enemyCount === 0) {
                        result.playerOnly.push([row, col]); // Seen only by player

                    } else if(enemyCount > 0 && playerCount === 0) {
                        result.enemyOnly.push([row, col]); // Seen only by enemy

                    } else if(playerCount > 0 && enemyCount > 0) {
                        result.contested.push({ square: [row, col], counts: {playerCount, enemyCount} });
                    }
                }
            }

            return result;
        };

        const squares = analyzeSquares();

        return { player, enemy, squares };
    }
}