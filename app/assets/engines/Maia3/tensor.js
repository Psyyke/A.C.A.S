import { Chess } from '../libraries/chessjs/chess.js';

const allPossibleMovesMaia3 = await fetch(new URL('./data/all_moves_maia3.json', import.meta.url)).then(r => r.json());
const allPossibleMovesMaia3Reversed = await fetch(new URL('./data/all_moves_maia3_reversed.json', import.meta.url)).then(r => r.json());

function mirrorMove(moveUci) {
	const isPromotion = moveUci.length > 4;

	const startSquare = moveUci.substring(0, 2);
	const endSquare = moveUci.substring(2, 4);
	const promotionPiece = isPromotion ? moveUci.substring(4) : '';

	const mirroredStart = mirrorSquare(startSquare);
	const mirroredEnd = mirrorSquare(endSquare);

	return mirroredStart + mirroredEnd + promotionPiece;
}

function mirrorSquare(square) {
	const file = square.charAt(0);
	const rank = (9 - parseInt(square.charAt(1))).toString();
	return file + rank;
}

function swapColorsInRank(rank) {
	let swappedRank = '';

	for(const char of rank) {
		if(/[A-Z]/.test(char)) swappedRank += char.toLowerCase();
		else if(/[a-z]/.test(char)) swappedRank += char.toUpperCase();
		else swappedRank += char;
	}

	return swappedRank;
}

function swapCastlingRights(castling) {
	if(castling === '-') return '-';

	const rights = new Set(castling.split(''));
	const swapped = new Set();

	if(rights.has('K')) swapped.add('k');
	if(rights.has('Q')) swapped.add('q');
	if(rights.has('k')) swapped.add('K');
	if(rights.has('q')) swapped.add('Q');

	let output = '';
	if(swapped.has('K')) output += 'K';
	if(swapped.has('Q')) output += 'Q';
	if(swapped.has('k')) output += 'k';
	if(swapped.has('q')) output += 'q';

	return output === '' ? '-' : output;
}

function mirrorFEN(fen) {
	const [position, activeColor, castling, enPassant, halfmove, fullmove] = fen.split(' ');

	const ranks = position.split('/');
	const mirroredRanks = ranks.slice().reverse().map(rank => swapColorsInRank(rank));

	const mirroredPosition = mirroredRanks.join('/');
	const mirroredActiveColor = activeColor === 'w' ? 'b' : 'w';
	const mirroredCastling = swapCastlingRights(castling);
	const mirroredEnPassant = enPassant !== '-' ? mirrorSquare(enPassant) : '-';

	return `${mirroredPosition} ${mirroredActiveColor} ${mirroredCastling} ${mirroredEnPassant} ${halfmove} ${fullmove}`;
}

function boardToMaia3Tokens(fen) {
	const tokens = fen.split(' ');
	const piecePlacement = tokens[0];

	const pieceTypes = [
		'P','N','B','R','Q','K',
		'p','n','b','r','q','k'
	];

	const tensor = new Float32Array(64 * 12);
	const rows = piecePlacement.split('/');

	for(let rank = 0; rank < 8; rank++) {
		const row = 7 - rank;
		let file = 0;

		for(const char of rows[rank]) {
			if(isNaN(parseInt(char))) {
				const pieceIdx = pieceTypes.indexOf(char);
				if(pieceIdx >= 0) {
					const square = row * 8 + file;
					tensor[square * 12 + pieceIdx] = 1.0;
				}
				file += 1;
			}else{
				file += parseInt(char);
			}
		}
	}

	return tensor;
}

function canonicalBoard(fen) {
	const board = new Chess();
	if(typeof fen !== 'string' || !board.load(fen)) throw new Error('Invalid Maia 3 FEN.');

	return board.turn() === 'b' ? new Chess(mirrorFEN(board.fen())) : board;
}

function preprocessMaia3(fen, history) {
	const board = canonicalBoard(fen);
	let boardTokens = boardToMaia3Tokens(board.fen());
	if(history !== undefined) {
		if(!Array.isArray(history) || history.length < 1 || history.length > 8 || history[0] !== fen)
			throw new Error('Maia 3 history needs one to eight positions with the analyzed board first.');
		const frames = history.map((position, index) => index ? boardToMaia3Tokens(canonicalBoard(position).fen()) : boardTokens);
		boardTokens = new Float32Array(64 * 96);
		for(let frame = 0; frame < 8; frame++) {
			// Each past board uses its own side to move, not the current player's orientation.
			const tokens = frames[Math.min(7 - frame, frames.length - 1)];
			for(let square = 0; square < 64; square++)
				boardTokens.set(tokens.subarray(square * 12, square * 12 + 12), square * 96 + frame * 12);
		}
	}

	const legalMoves = new Float32Array(Object.keys(allPossibleMovesMaia3).length);

	for(const move of board.moves({ verbose: true })) {
		const promotion = move.promotion ? move.promotion : '';
		const moveIndex = allPossibleMovesMaia3[move.from + move.to + promotion];

		if(moveIndex !== undefined) legalMoves[moveIndex] = 1.0;
	}

	return { boardTokens, legalMoves };
}

export {
	preprocessMaia3,
	mirrorMove,
	allPossibleMovesMaia3Reversed
};