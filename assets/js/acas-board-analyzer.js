/* [A.C.A.S Board Analyzer]
 * - License: GPLv3
 * - Version: 0.1
 * - Notes: No en passant detection on v0.1.
 * */

class BoardAnalyzer {
    constructor(fen, config) {
        this.fen = fen;
        this.debug = config?.debug ? true : false;

        this.isPlayerBlack = (config?.orientation || (fen && fen.split(' ')[1]) || 'w').toLowerCase() === 'b';
        this.board = this.parseFEN();
        this.boardHeight = this.board.length;  // Number of rows in the board
        this.boardWidth = this.board[0].length;  // Number of columns in the board

        this.fenToValue = c => ({ P:1, N:2, B:2, R:3, Q:5, K:100 })[c.toUpperCase()] || 0;

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

    flipFen() {
        const firstSpace = this.fen.indexOf(' ');
        const board = this.fen.slice(0, firstSpace);

        const flippedBoard = board.split('/')
            .reverse()
            .map(rank => [...rank].reverse().join(''))
            .join('/');

        this.fen = flippedBoard + this.fen.slice(firstSpace);
    }

    parseFEN() {
        if(this.isPlayerBlack) this.flipFen();

        const rows = this.fen.split(' ')[0].split('/');
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

            // Ensure that the board has a consistent number of columns
            // Make sure we match the largest number of columns based on the rows
            if(this.boardWidth === undefined) {
                this.boardWidth = row.length;
            } else {
                if(row.length !== this.boardWidth) {
                    if(this.debug) throw new Error('Inconsistent row lengths in FEN');
                }
            }

            board.push(row);
        }

        return board;
    }

    // Extract all pieces from the board, categorized by player and with paths
    // Paths are the squares the piece protects or can move to.
    // (e.g. a rook behind another protects the same squares beyond it in the same direction.)
    getPiecesWithPaths() {
        const pieces = { player: [], enemy: [] };

        for(let y = 0; y < this.boardHeight; y++) {
            for(let x = 0; x < this.boardWidth; x++) {
                const pieceFen = this.board[y][x];
                const isPieceWhite = pieceFen >= 'A' && pieceFen <= 'Z';
                const isPlayerPiece = isPieceWhite === !this.isPlayerBlack;

                if(pieceFen) {
                    const pObj = { 'piece': pieceFen, 'position': [y, x], ranking: this.fenToValue(pieceFen) };

                    pObj['paths'] = this.getPiecePaths(pObj);

                    if(isPlayerPiece) {
                        pieces.player.push(pObj);
                    } else {
                        pieces.enemy.push(pObj);
                    }
                }
            }
        }

        return pieces;
    }

    // Moves are kind of like vectors, and the piecePos is a point.
    // Traverse the vectors from the piece's point to get the end point on the board.
    coordinatesFromMoves(piecePos, moves) { // piecePos [y, x], moves [[x, y], ...]
        const result = [];

        for(let i = 0; i < moves.length; i++) {
            const y = piecePos[0] + moves[i][1];
            const x = piecePos[1] + moves[i][0];
            const square = this.board?.[y]?.[x];

            if(square !== undefined) {
                result.push([y, x]);
            }
        }

        return result;
    }

    // The move arrays such as [1, -1] are [x, y], not board array index.
    // Returns in board array index format [y, x].
    getPiecePaths(pObj) {
        if(!pObj) {
            throw new Error('Failed to process pObj on getPiecePaths()!');

            return [0, 0];
        }

        const pieceFen = pObj.piece;
        const piecePos = pObj.position; // [y, x]

        const isPieceWhite = pieceFen >= 'A' && pieceFen <= 'Z';
        const pieceType = pieceFen.toUpperCase();
        const [piecePosY, piecePosX] = piecePos;

        const isLinearMovingPiece = pieceType === 'R' || pieceType === 'Q';
        const isDiagonalMovingPiece = pieceType === 'B' || pieceType === 'Q';

        const longerBoardSide = Math.max(this.boardWidth, this.boardHeight);
        const shorterBoardSide = Math.min(this.boardWidth, this.boardHeight);

        const board = this.board;

        function cast(directions, length) {
            const moves = [];

            for(let direction of directions)
                for(let i = 1; i < length; i++) {
                    const y = piecePosY + direction[1] * i;
                    const x = piecePosX + direction[0] * i;
                    const square = board?.[y]?.[x];

                    if(square !== undefined) {
                        moves.push([y, x]);

                        const isMoveDiagonal = direction[0] !== 0 && direction[1] !== 0;

                        const isTargetSameLinearPiece = isPieceWhite ? (square === 'R' || square === 'Q') : (square === 'r' || square === 'q');
                        const isTargetSameDiagonalPiece = isPieceWhite ? (square === 'B' || square === 'Q') : (square === 'b' || square === 'q');

                        const isMultiLinearAttack = !isMoveDiagonal && isLinearMovingPiece && isTargetSameLinearPiece;
                        const isMultiDiagonalAttack = isMoveDiagonal && isDiagonalMovingPiece && isTargetSameDiagonalPiece;

                        if(square !== null)
                            // This case covers multiple rooks, -queens, -bishops, or any variation of them, for example,
                            // (Rook is behind another rook linearly, allow it to see through the other rook.)
                            if(!(isMultiLinearAttack || isMultiDiagonalAttack))
                                break;

                    } else break;
                }

            return moves;
        }

        function castDiagonal() {
            return cast([
                [1, -1], [-1, -1], // top right, top left
                [1, 1], [-1, 1] // bottom right, bottom left
            ], shorterBoardSide);
        }

        function castStraight() {
              return cast([
                  [0, -1], [0, 1], // top, bottom
                  [-1, 0], [1, 0] // left, right
            ], longerBoardSide);
        }

        if(pieceType === 'P') {
            const direction = this.isPlayerBlack === isPieceWhite ? [[-1, 1], [1, 1]] : [[-1, -1], [1, -1]];

            return this.coordinatesFromMoves(piecePos, direction);
        }

        if(pieceType == 'N') {
            return this.coordinatesFromMoves(piecePos, [
                [-2, -1], [-2, 1], [2, -1], [2, 1],
                [-1, -2], [-1, 2], [1, -2], [1, 2]]);
        }

        if(pieceType == 'K') {
            return this.coordinatesFromMoves(piecePos, [
                [-1, 0], [1, 0], [0, -1], [0, 1],
                [-1, -1], [1, 1], [-1, 1], [1, -1]]);
        }

        if(pieceType == 'B') {
            return castDiagonal();
        }

        if(pieceType == 'R') {
            return castStraight();
        }

        if(pieceType == 'Q') {
            return [
                ...castDiagonal(),
                ...castStraight()
            ];
        }

        return [0, 0];
    }

    createPathLookup(pieces) {
        const lookup = {};

        for(let pObj of pieces) {
            const id = pObj.piece + pObj.position.join('');

            lookup[id] = new Set(pObj.paths.map(path => path.join('')));

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
        function analyzePieces(pieces, opponentPieces, piecePaths, opponentPaths)  {
            for(let pObj of pieces) {
                const pos = pObj.position;

                // Detect who defends the current piece
                pObj.defendedBy = pieces.filter(x => piecePaths[x.id]?.has(pos.join('')));
                // Detect attacks on the current piece by opponent
                pObj.attackedBy = opponentPieces.filter(x => opponentPaths[x.id]?.has(pos.join('')));

                const isAttackerLowerRanking = pObj.attackedBy.find(x => x.ranking < pObj.ranking) ? true : false;
                // Detect bad trades or just straight up losses via undefended
                pObj.captureDanger = isAttackerLowerRanking || (pObj.attackedBy.length > pObj.defendedBy.length);
            }
        };

        analyzePieces(player, enemy, playerPaths, enemyPaths);
        analyzePieces(enemy, player, enemyPaths, playerPaths);

        function analyzeSquares() {
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
                    const square = `${row}${col}`;

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
        }

        const squares = analyzeSquares();

        return { player, enemy, squares };
    }
}