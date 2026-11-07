/* BoardChangeParser.js
 - Version: 1.5
 - License: GPL-3.0
 - Description: A.C.A.S board snapshot diff and heuristic two-ply reconstruction.
*/

class BoardChangeParser {
    constructor({ getBoardChangesObjTemplate, getFenPieceColor }) {
        function fenToBoard(basicFen) {
            const board = [];

            for(const row of basicFen.split(' ')[0].replace(/\[[^\]]*\]$/, '').split('/')) {
                const boardRow = [];

                for(const token of row.match(/\d+|\+?[a-zA-Z]~?|\*/g) || []) {
                    if(!/^\d+$/.test(token)) {
                        boardRow.push(token);
                    } else {
                        boardRow.push(...Array(Number(token)).fill(''));
                    }
                }

                board.push(boardRow);
            }

            return board;
        }

        function boardToFen(board) {
            return board.map(row => {
                let fenRow = '';
                let emptyCount = 0;

                for(const piece of row) {
                    if(piece === '') {
                        emptyCount++;
                        continue;
                    }

                    if(emptyCount) {
                        fenRow += emptyCount;
                        emptyCount = 0;
                    }

                    fenRow += piece;
                }

                if(emptyCount) {
                    fenRow += emptyCount;
                }

                return fenRow;
            }).join('/');
        }

        function getBoardDiff(lastBoard, newBoard) {
            const changes = getBoardChangesObjTemplate();

            const rows = newBoard.length;
            const cols = newBoard[0]?.length ?? 0;

            for(let i = 0; i < rows; i++) {
                for(let j = 0; j < cols; j++) {
                    const before = lastBoard[i]?.[j] ?? '';
                    const after = newBoard[i]?.[j] ?? '';

                    if(before === after) continue;

                    changes.changedSquaresAmount++;

                    const square =
                        `${String.fromCharCode(97 + j)}${rows - i}`;

                    if(before !== '') {
                        changes.movedPieces.push(before);

                        changes.removed.push({
                            square,
                            piece: before,
                            row: i,
                            col: j
                        });
                    }

                    if(after !== '') {
                        changes.added.push({
                            square,
                            piece: after,
                            row: i,
                            col: j
                        });
                    }
                }
            }

            changes.pieceAmountChange =
                changes.added.length - changes.removed.length;

            /*
                Castling:
                two pieces disappear and two pieces appear.
            */
            if(
                changes.removed.length === 2 &&
                changes.added.length === 2
            ) {
                const kingFrom = changes.removed.find(({ piece }) =>
                    piece.toLowerCase() === 'k'
                );

                const kingTo = changes.added.find(({ piece }) =>
                    piece.toLowerCase() === 'k'
                );

                if(kingFrom && kingTo) {
                    changes.from = kingFrom.square;
                    changes.to = kingTo.square;
                    changes.movedPiece = kingFrom.piece;
                }
            }

            /*
                Normal move, capture, en passant, or promotion:
                exactly one piece appears.
            */
            if(!changes.to && changes.added.length === 1) {
                const destination = changes.added[0];

                changes.to = destination.square;
                if(changes.removed.length === 0) {
                    changes.from = `${destination.piece.replace(/[+~]/g, '').toUpperCase()}@`;
                    changes.movedPiece = destination.piece;
                }

                const source = changes.removed.find(({ piece, square }) =>
                    piece.replace(/[+~]/g, '') === destination.piece.replace(/[+~]/g, '') &&
                    square !== changes.to
                );

                if(source) {
                    changes.from = source.square;
                    changes.movedPiece = source.piece;
                }

                /*
                    Promotion:
                    a pawn disappears and a non-pawn appears.
                */
                if(
                    !changes.from &&
                    destination.piece.toLowerCase() !== 'p'
                ) {
                    const pawnSource = changes.removed.find(({ piece }) =>
                        piece.toLowerCase() === 'p'
                    );

                    if(pawnSource) {
                        changes.from = pawnSource.square;
                        changes.movedPiece = pawnSource.piece;
                        changes.isPromotion = true;
                        changes.promotionPiece = destination.piece;
                    }
                }
            }

            /*
                Normal capture:
                captured piece disappears from the destination square.
            */
            if(changes.to) {
                const capture = changes.removed.find(({ square }) =>
                    square === changes.to
                );

                if(capture && (!changes.movedPiece ||
                    getFenPieceColor(capture.piece) !== getFenPieceColor(changes.movedPiece))) {
                    changes.capturedPiece = capture.piece;
                    changes.capturedSquare = capture.square;
                }
            }

            /*
                En passant.
            */
            if (
                changes.movedPiece?.toLowerCase() === 'p' &&
                changes.removed.length === 2 &&
                changes.added.length === 1 &&
                !changes.capturedPiece
            ) {
                const capturedPawn = changes.removed.find(({ piece, square }) =>
                    piece.toLowerCase() === 'p' &&
                    square !== changes.from
                );

                if (capturedPawn) {
                    changes.capturedPiece = capturedPawn.piece;
                    changes.capturedSquare = capturedPawn.square;
                    changes.isEnPassant = true;
                }
            }

            if(changes.movedPiece) {
                changes.movedPieceColor = getFenPieceColor(changes.movedPiece);
            }

            return changes;
        }

        function getBoardChanges(lastBasicFen, newBasicFen, turn, context = {}) {
            if(!lastBasicFen || !newBasicFen || lastBasicFen === newBasicFen) {
                return getBoardChangesObjTemplate();
            }

            const lastBoard = fenToBoard(lastBasicFen);
            const newBoard = fenToBoard(newBasicFen);
            const changes = getBoardDiff(lastBoard, newBoard);

            // Reconstruction is orthodox-only; diffing also supports variant boards.
            const orthodoxVariant = context.variant == null ||
                ['chess', 'standard', 'from position'].includes(context.variant);
            if(orthodoxVariant && (turn === 'w' || turn === 'b') &&
                !lastBasicFen.includes('[') && !newBasicFen.includes('[') &&
                [lastBoard, newBoard].every(board => board.length === 8 &&
                    board.every(row => row.length === 8 &&
                        row.every(piece => !piece || /^[prnbqkPRNBQK]$/.test(piece))))) {
                if(context.conservative) {
                    const currentTurn = context.currentTurn;
                    const knownTurn = currentTurn === 'w' || currentTurn === 'b';
                    // A legal single-move diff takes precedence over delayed
                    // clock/highlight turn metadata.
                    const single = isOpponentMove(lastBoard, newBoard, turn) &&
                        (!changes.isEnPassant || typeof context.enPassantTarget !== 'string' ||
                            changes.to === context.enPassantTarget) &&
                        !(changes.added.length === 2 && typeof context.castlingRights === 'string' &&
                            !context.castlingRights.includes(turn === 'w'
                                ? changes.to[0] === 'g' ? 'K' : 'Q'
                                : changes.to[0] === 'g' ? 'k' : 'q'));
                    if(single) {
                        changes.recovery = { status: 'single', searchedPlies: 1 };
                    } else {
                        const candidates = new Set();
                        if(!knownTurn || currentTurn === turn) {
                            getMissedFen(lastBoard, newBoard, changes, turn, { ...context, candidates });
                        }
                        changes.recovery = {
                            status: candidates.size > 1 ? 'ambiguous'
                                : candidates.size === 1 ? 'unique-within-two-plies' : 'unresolved',
                            searchedPlies: 2,
                            candidates: candidates.size
                        };
                        if(candidates.size === 1) changes.missedFen = candidates.values().next().value;
                    }
                } else {
                    changes.missedFen = getMissedFen(lastBoard, newBoard, changes, turn, context);
                }
            }

            return changes;
        }

        function isPieceMove(board, from, to, promotion = false) {
            const dr = to.row - from.row, dc = to.col - from.col;
            if(!dr && !dc) return false;
            const color = getFenPieceColor(from.piece);
            const target = board[to.row][to.col];
            if(target && getFenPieceColor(target) === color) return false;
            const role = from.piece.toLowerCase();
            if(role === 'p') {
                const direction = color === 'w' ? -1 : 1;
                if(promotion !== (to.row === 0 || to.row === 7)) return false;
                if(dc) return Math.abs(dc) === 1 && dr === direction && Boolean(target);
                return !target && (dr === direction ||
                    (from.row === (color === 'w' ? 6 : 1) && dr === direction * 2 &&
                        !board[from.row + direction][from.col]));
            }
            if(promotion) return false;
            if(role === 'n') return Math.abs(dr) * Math.abs(dc) === 2;
            if(role === 'k') return Math.max(Math.abs(dr), Math.abs(dc)) === 1;
            if(role === 'b' && Math.abs(dr) !== Math.abs(dc)) return false;
            if(role === 'r' && dr && dc) return false;
            if(role === 'q' && dr && dc && Math.abs(dr) !== Math.abs(dc)) return false;
            const stepRow = Math.sign(dr), stepCol = Math.sign(dc);
            for(let row = from.row + stepRow, col = from.col + stepCol;
                row !== to.row || col !== to.col; row += stepRow, col += stepCol) {
                if(board[row][col]) return false;
            }
            return true;
        }

        function isOpponentMove(board, newBoard, opponent) {
            // Compare the entire candidate, including squares hidden by recaptures.
            if(!isKingSafe(board, opponent === 'w' ? 'b' : 'w') ||
                !isKingSafe(newBoard, opponent)) return false;
            const diff = getBoardDiff(board, newBoard);
            if(diff.movedPieceColor !== opponent || !diff.from || !diff.to) return false;
            const from = diff.removed.find(change => change.square === diff.from);
            const to = diff.added.find(change => change.square === diff.to);
            if(!from || !to) return false;
            if(diff.removed.some(change => change.piece.toLowerCase() === 'k' &&
                getFenPieceColor(change.piece) !== opponent)) return false;

            if(diff.isEnPassant) {
                const captured = diff.removed.find(change => change.square === diff.capturedSquare);
                return diff.changedSquaresAmount === 3 && Math.abs(to.col - from.col) === 1 &&
                    to.row - from.row === (opponent === 'w' ? -1 : 1) &&
                    from.row === (opponent === 'w' ? 3 : 4) &&
                    captured.row === from.row && captured.col === to.col &&
                    getFenPieceColor(captured.piece) !== opponent;
            }
            if(diff.removed.length === 2 && diff.added.length === 2) {
                const rookFrom = diff.removed.find(change => change.piece === (opponent === 'w' ? 'R' : 'r'));
                const rookTo = diff.added.find(change => change.piece === rookFrom?.piece);
                return Boolean(rookFrom && rookTo) &&
                    rookFrom.row === from.row && rookTo.row === from.row &&
                    rookFrom.col === (to.col === 6 ? 7 : 0) &&
                    rookTo.col === (to.col === 6 ? 5 : 3) && isCastlingMove(board, from, to);
            }
            return diff.added.length === 1 &&
                diff.removed.length === (diff.capturedPiece ? 2 : 1) &&
                isPieceMove(board, from, to, diff.isPromotion);
        }

        function isKingSafe(board, color) {
            const king = color === 'w' ? 'K' : 'k';
            let kingSquare;
            for(let row = 0; row < 8; row++) {
                for(let col = 0; col < 8; col++) {
                    if(board[row][col] === king) kingSquare = { row, col };
                }
            }
            if(!kingSquare) return true;
            for(let row = 0; row < 8; row++) {
                for(let col = 0; col < 8; col++) {
                    const piece = board[row][col];
                    if(!piece || getFenPieceColor(piece) === color) continue;
                    const promotion = piece.toLowerCase() === 'p' &&
                        (kingSquare.row === 0 || kingSquare.row === 7);
                    if(isPieceMove(board, { row, col, piece }, kingSquare, promotion)) return false;
                }
            }
            return true;
        }

        function isCastlingMove(board, from, to) {
            const color = getFenPieceColor(from.piece);
            if(from.piece.toLowerCase() !== 'k' || from.col !== 4 ||
                from.row !== (color === 'w' ? 7 : 0) || to.row !== from.row ||
                ![2, 6].includes(to.col)) return false;
            const rookCol = to.col === 6 ? 7 : 0;
            if(board[from.row][rookCol] !== (color === 'w' ? 'R' : 'r')) return false;
            for(let col = Math.min(rookCol, 4) + 1; col < Math.max(rookCol, 4); col++) {
                if(board[from.row][col]) return false;
            }
            if(!isKingSafe(board, color)) return false;
            const middle = board.map(row => [...row]);
            middle[from.row][from.col] = '';
            middle[from.row][to.col === 6 ? 5 : 3] = from.piece;
            return isKingSafe(middle, color);
        }

        function getMissedFen(lastBoard, newBoard, changes, turn, context) {
            const opponent = turn === 'w' ? 'b' : 'w';
            const hint = context.lastMoveSquares;
            const hasHint = Array.isArray(hint) && hint.length === 2 &&
                hint[0] !== hint[1] && hint.every(square => typeof square === 'string' && /^[a-h][1-8]$/.test(square));
            let fallback = null;
            function acceptsCandidate(board) {
                if(!isOpponentMove(board, newBoard, opponent)) return false;
                const first = getBoardDiff(lastBoard, board);
                if(first.isEnPassant && typeof context.enPassantTarget === 'string' &&
                    first.to !== context.enPassantTarget) return false;
                const reply = getBoardDiff(board, newBoard);
                for(const diff of [first, reply]) {
                    if(diff.movedPiece?.toLowerCase() !== 'k' || diff.added.length !== 2) continue;
                    const right = diff.to[0] === 'g' ? 'k' : 'q';
                    const key = diff.movedPieceColor === 'w' ? right.toUpperCase() : right;
                    if(typeof context.castlingRights === 'string' && !context.castlingRights.includes(key)) return false;
                }
                if(reply.isEnPassant) {
                    const target = first.movedPiece?.toLowerCase() === 'p' &&
                        Math.abs(Number(first.from?.[1]) - Number(first.to?.[1])) === 2
                        ? first.from[0] + (Number(first.from[1]) + Number(first.to[1])) / 2 : '-';
                    if(reply.to !== target) return false;
                }
                if(context.candidates) {
                    context.candidates.add(boardToFen(board));
                    return false;
                }
                // Highlights can be stale during DOM settling; prefer matching
                // candidates, but never discard the heuristic fallback for them.
                if(hasHint && !(hint.includes(reply.from) && hint.includes(reply.to))) {
                    fallback ??= boardToFen(board);
                    return false;
                }
                return true;
            }

            const turnRemoved = changes.removed.filter(({ piece }) =>
                getFenPieceColor(piece) === turn
            );

            const turnAdded = changes.added.filter(({ piece }) =>
                getFenPieceColor(piece) === turn
            );

            const opponentChanged = [
                ...changes.removed,
                ...changes.added
            ].some(({ piece }) =>
                getFenPieceColor(piece) === opponent
            );

            if(!turnRemoved.length || !opponentChanged) {
                return null;
            }

            // The first mover may be captured before its addition is observed.
            if(
                turnRemoved.length === 1 &&
                turnAdded.length === 0
            ) {
                const opponentRemoved = changes.removed.filter(({ piece }) =>
                    getFenPieceColor(piece) === opponent
                );

                const opponentAdded = changes.added.filter(({ piece }) =>
                    getFenPieceColor(piece) === opponent
                );

                const destinations = [...opponentAdded];
                // Identical recapturing pieces can leave the destination unchanged.
                if(!opponentAdded.length && opponentRemoved.length === 1) {
                    for(let row = 0; row < 8; row++) {
                        for(let col = 0; col < 8; col++) {
                            const piece = newBoard[row][col];
                            const promotedReply = opponentRemoved[0].piece.toLowerCase() === 'p' &&
                                row === (opponent === 'w' ? 0 : 7) && /^[qrbn]$/i.test(piece) &&
                                getFenPieceColor(piece) === opponent;
                            if((piece === opponentRemoved[0].piece || promotedReply) &&
                                lastBoard[row][col] === piece) {
                                destinations.push({ row, col, piece: newBoard[row][col] });
                            }
                        }
                    }
                }
                const from = turnRemoved[0];
                for(const to of destinations) {
                    if(context.candidates && from.piece.toLowerCase() === 'p' &&
                        isPieceMove(lastBoard, from, to, true)) {
                        // A captured promotion leaves no observed role. Include
                        // every legal role when determining uniqueness.
                        for(const role of ['q', 'r', 'b', 'n']) {
                            const board = lastBoard.map(row => [...row]);
                            board[from.row][from.col] = '';
                            board[to.row][to.col] = turn === 'w' ? role.toUpperCase() : role;
                            acceptsCandidate(board);
                        }
                    }
                    // En passant followed by recapture hides the moving pawn,
                    // but the captured pawn still disappears off the destination.
                    if(from.piece.toLowerCase() === 'p' &&
                        from.row === (turn === 'w' ? 3 : 4) &&
                        to.row - from.row === (turn === 'w' ? -1 : 1) &&
                        Math.abs(to.col - from.col) === 1 && !lastBoard[to.row][to.col] &&
                        lastBoard[from.row][to.col] === (turn === 'w' ? 'p' : 'P')) {
                        const board = lastBoard.map(row => [...row]);
                        board[from.row][from.col] = '';
                        board[from.row][to.col] = '';
                        board[to.row][to.col] = from.piece;
                        if(acceptsCandidate(board)) return boardToFen(board);
                    }
                    if(!lastBoard[to.row][to.col]) continue;
                    if(!isPieceMove(lastBoard, from, to)) continue;
                    const board = lastBoard.map(row => [...row]);
                    board[from.row][from.col] = '';
                    board[to.row][to.col] = from.piece;
                    if(acceptsCandidate(board)) return boardToFen(board);
                }
            }

            /*
                ---------------------------------------------------------
                Normal move / capture
                ---------------------------------------------------------
            */
            for(const from of turnRemoved) {
                for(const to of turnAdded) {
                    if(from.piece !== to.piece) {
                        continue;
                    }

                    if(from.row === to.row && from.col === to.col) {
                        continue;
                    }

                    // A first-ply en passant removes a pawn off the destination.
                    if(from.piece.toLowerCase() === 'p' && Math.abs(from.col - to.col) === 1 &&
                        to.row - from.row === (turn === 'w' ? -1 : 1) &&
                        from.row === (turn === 'w' ? 3 : 4) && !lastBoard[to.row][to.col] &&
                        lastBoard[from.row][to.col] === (turn === 'w' ? 'p' : 'P')) {
                        const board = lastBoard.map(row => [...row]);
                        board[from.row][from.col] = '';
                        board[from.row][to.col] = '';
                        board[to.row][to.col] = from.piece;
                        if(acceptsCandidate(board)) return boardToFen(board);
                    }
                    if(!isPieceMove(lastBoard, from, to)) continue;
                    const board = lastBoard.map(row => [...row]);

                    board[from.row][from.col] = '';
                    board[to.row][to.col] = from.piece;

                    if(acceptsCandidate(board)) {
                        return boardToFen(board);
                    }
                }
            }

            /*
                ---------------------------------------------------------
                Promotion
                ---------------------------------------------------------
            */
            for(const from of turnRemoved) {
                if(from.piece.toLowerCase() !== 'p') {
                    continue;
                }

                for(const to of turnAdded) {
                    if(!/^[qrbn]$/i.test(to.piece) || !isPieceMove(lastBoard, from, to, true)) {
                        continue;
                    }

                    const board = lastBoard.map(row => [...row]);

                    board[from.row][from.col] = '';
                    board[to.row][to.col] = to.piece;

                    if(acceptsCandidate(board)) {
                        return boardToFen(board);
                    }
                }
            }

            /*
                ---------------------------------------------------------
                En passant
                ---------------------------------------------------------
            */
            if(
                turnRemoved.length === 1 &&
                turnAdded.length === 0 &&
                turnRemoved[0].piece.toLowerCase() === 'p'
            ) {
                const from = turnRemoved[0];

                const direction = turn === 'w' ? -1 : 1;
                const startRow = turn === 'w' ? 6 : 1;

                if(from.row === startRow) {
                    const toRow = from.row + direction * 2;
                    const middleRow = from.row + direction;

                    /*
                        The intermediate square must be empty in the
                        current position because the pawn was captured.
                    */
                    if(
                        lastBoard[middleRow][from.col] === '' &&
                        lastBoard[toRow][from.col] === '' &&
                        newBoard[toRow][from.col] === ''
                    ) {
                        const board = lastBoard.map(row => [...row]);

                        board[from.row][from.col] = '';
                        board[toRow][from.col] = from.piece;

                        if(acceptsCandidate(board)) {
                            return boardToFen(board);
                        }
                    }
                }
            }

            // Try a quiet first move captured on the reply after the historical
            // double-push/en-passant preference (both can explain one snapshot).
            if(turnRemoved.length === 1 && turnAdded.length === 0) {
                const from = turnRemoved[0];
                for(const to of changes.added.filter(change => getFenPieceColor(change.piece) === opponent)) {
                    if(lastBoard[to.row][to.col] || !isPieceMove(lastBoard, from, to)) continue;
                    const board = lastBoard.map(row => [...row]);
                    board[from.row][from.col] = '';
                    board[to.row][to.col] = from.piece;
                    if(acceptsCandidate(board)) return boardToFen(board);
                }
            }

            /*
                ---------------------------------------------------------
                Castling
                ---------------------------------------------------------
            */
            if(turnRemoved.length >= 2) {
                const kingFrom = turnRemoved.find(({ piece }) =>
                    piece.toLowerCase() === 'k'
                );

                const kingTo = turnAdded.find(({ piece }) =>
                    piece.toLowerCase() === 'k'
                );
                const rookFrom = kingFrom && kingTo && turnRemoved.find(({ piece, row, col }) =>
                    piece.toLowerCase() === 'r' && row === kingFrom.row &&
                    col === (kingTo.col === 6 ? 7 : 0)
                );

                if(
                    kingFrom &&
                    rookFrom &&
                    kingTo &&
                    rookFrom.row === kingFrom.row &&
                    rookFrom.col === (kingTo.col === 6 ? 7 : 0) &&
                    isCastlingMove(lastBoard, kingFrom, kingTo)
                ) {
                    const board = lastBoard.map(row => [...row]);

                    board[kingFrom.row][kingFrom.col] = '';
                    board[rookFrom.row][rookFrom.col] = '';

                    board[kingTo.row][kingTo.col] = kingFrom.piece;
                    board[kingTo.row][kingTo.col === 6 ? 5 : 3] = rookFrom.piece;

                    if(acceptsCandidate(board)) {
                        return boardToFen(board);
                    }
                }
            }

            return fallback;
        }

        this.getBoardChanges = getBoardChanges;

        // History is newest first. Only an independently observed absolute ply,
        // not an inferred counter or matching placement, can authorize removal.
        this.reconcileHistory = (history, observation = {}) => {
            const { basicFen, ply, turn } = observation;
            const latest = history[0];
            const unchanged = status => ({ history, status });
            if(!latest || typeof basicFen !== 'string' || !basicFen)
                return unchanged('unavailable');
            if(!Number.isSafeInteger(ply) || ply < 0 ||
                !Number.isSafeInteger(latest.observedPly) || latest.observedPly < 0)
                return unchanged('unverified');
            if(ply >= latest.observedPly) return unchanged('not-takeback');
            if(turn !== 'w' && turn !== 'b') return unchanged('unverified');
            const index = history.findIndex(state => state.observedPly === ply &&
                state.fen?.basic === basicFen && state.turn === turn);
            if(index < 1) return unchanged('conflicting');
            // Timing must be observed again after browsing/undoing moves.
            const restored = { ...history[index], observedAt: null,
                turnStartedByMove: false, opponentMoveTime: null };
            return { history: [restored, ...history.slice(index + 1)], status: 'takeback' };
        };
    }
}
