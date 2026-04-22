import { Chess } from '../libraries/chessjs/chess.js';

const allPossibleMoves = await fetch('./data/all_moves.json').then(r => r.json());
const allPossibleMovesReversed = await fetch('./data/all_moves_reversed.json').then(r => r.json());
const allPossibleMovesMaia3 = await fetch('./data/all_moves_maia3.json').then(r => r.json());
const allPossibleMovesMaia3Reversed = await fetch('./data/all_moves_maia3_reversed.json').then(r => r.json());

const eloDict = createEloDict();

function boardToTensor(fen) {
	const tokens = fen.split(' ');
	const piecePlacement = tokens[0];
	const activeColor = tokens[1];
	const castlingAvailability = tokens[2];
	const enPassantTarget = tokens[3];

	const pieceTypes = [
		'P','N','B','R','Q','K',
		'p','n','b','r','q','k'
	];

	const tensor = new Float32Array((12 + 6) * 8 * 8);
	const rows = piecePlacement.split('/');

	for(let rank = 0; rank < 8; rank++) {
		const row = 7 - rank;
		let file = 0;

		for(const char of rows[rank]) {
			if(isNaN(parseInt(char))) {
				const index = pieceTypes.indexOf(char);
				const tensorIndex = index * 64 + row * 8 + file;
				tensor[tensorIndex] = 1.0;
				file += 1;
			}else{
				file += parseInt(char);
			}
		}
	}

	const turnChannelStart = 12 * 64;
	const turnChannelEnd = turnChannelStart + 64;
	const turnValue = activeColor === 'w' ? 1.0 : 0.0;
	tensor.fill(turnValue, turnChannelStart, turnChannelEnd);

	const castlingRights = [
		castlingAvailability.includes('K'),
		castlingAvailability.includes('Q'),
		castlingAvailability.includes('k'),
		castlingAvailability.includes('q')
	];

	for(let i = 0; i < 4; i++) {
		if(castlingRights[i]) {
			const channelStart = (13 + i) * 64;
			const channelEnd = channelStart + 64;
			tensor.fill(1.0, channelStart, channelEnd);
		}
	}

	const epChannel = 17 * 64;
	if(enPassantTarget !== '-') {
		const file = enPassantTarget.charCodeAt(0) - 'a'.charCodeAt(0);
		const rank = parseInt(enPassantTarget[1], 10) - 1;
		const index = epChannel + rank * 8 + file;
		tensor[index] = 1.0;
	}

	return tensor;
}

function preprocess(fen, eloSelf, eloOppo) {
	let board = new Chess(fen);

	if(fen.split(' ')[1] === 'b') {
		board = new Chess(mirrorFEN(board.fen()));
	}else if(fen.split(' ')[1] !== 'w') {
		throw new Error(`Invalid FEN: ${fen}`);
	}

	const boardInput = boardToTensor(board.fen());

	const eloSelfCategory = mapToCategory(eloSelf, eloDict);
	const eloOppoCategory = mapToCategory(eloOppo, eloDict);

	const legalMoves = new Float32Array(Object.keys(allPossibleMoves).length);

	for(const move of board.moves({ verbose: true })) {
		const promotion = move.promotion ? move.promotion : '';
		const moveIndex = allPossibleMoves[move.from + move.to + promotion];

		if(moveIndex !== undefined) legalMoves[moveIndex] = 1.0;
	}

	return {
		boardInput,
		eloSelfCategory,
		eloOppoCategory,
		legalMoves
	};
}

function mapToCategory(elo, eloDict) {
	const interval = 100;
	const start = 1100;
	const end = 2000;

	if(elo < start) return eloDict[`<${start}`];
	if(elo >= end) return eloDict[`>=${end}`];

	for(let lowerBound = start; lowerBound < end; lowerBound += interval) {
		const upperBound = lowerBound + interval;
		if(elo >= lowerBound && elo < upperBound)
			return eloDict[`${lowerBound}-${upperBound - 1}`];
	}

	throw new Error('Elo value is out of range.');
}

function createEloDict() {
	const interval = 100;
	const start = 1100;
	const end = 2000;

	const eloDict = { [`<${start}`]: 0 };
	let rangeIndex = 1;

	for(let lowerBound = start; lowerBound < end; lowerBound += interval) {
		const upperBound = lowerBound + interval;
		eloDict[`${lowerBound}-${upperBound - 1}`] = rangeIndex;
		rangeIndex += 1;
	}

	eloDict[`>=${end}`] = rangeIndex;

	return eloDict;
}

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

function preprocessMaia3(fen) {
	let board = new Chess(fen);

	if(fen.split(' ')[1] === 'b') {
		board = new Chess(mirrorFEN(board.fen()));
	}else if(fen.split(' ')[1] !== 'w') {
		throw new Error(`Invalid FEN: ${fen}`);
	}

	const boardTokens = boardToMaia3Tokens(board.fen());

	const legalMoves = new Float32Array(Object.keys(allPossibleMovesMaia3).length);

	for(const move of board.moves({ verbose: true })) {
		const promotion = move.promotion ? move.promotion : '';
		const moveIndex = allPossibleMovesMaia3[move.from + move.to + promotion];

		if(moveIndex !== undefined) legalMoves[moveIndex] = 1.0;
	}

	return { boardTokens, legalMoves };
}

export {
	preprocess,
	preprocessMaia3,
	mirrorMove,
	allPossibleMovesReversed,
	allPossibleMovesMaia3Reversed
};