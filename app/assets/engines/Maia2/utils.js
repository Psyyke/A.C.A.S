let allPossibleMoves = null;
let allPossibleMovesReversed = null;
let eloDict = null;

async function loadMoves() {
	const movesRes = await fetch('data/all_moves.json');
	allPossibleMoves = await movesRes.json();

	const movesRevRes = await fetch('data/all_moves_reversed.json');
	allPossibleMovesReversed = await movesRevRes.json();

	eloDict = createEloDict();
	return { allPossibleMoves, allPossibleMovesReversed };
}

function parseSetOption(line) {
    const tokens = line.trim().split(/\s+/);
    const idxName  = tokens.indexOf('name');
    const idxValue = tokens.indexOf('value');

    if (idxName === -1 || idxValue === -1) return null;

    const name  = tokens.slice(idxName + 1, idxValue).join(' ');
    const value = tokens.slice(idxValue + 1).join(' ');

    return { name, value };
}

function parsePosition(line) {
    const tokens = line.trim().split(/\s+/);
    let fen = 'startpos';
    let moves = [];

    if (tokens[1] === 'startpos') {
        const idx = tokens.indexOf('moves');
        if (idx !== -1) moves = tokens.slice(idx + 1);
    } else if (tokens[1] === 'fen') {
        let parts = tokens.slice(2);
        const idx = parts.indexOf('moves');
        if (idx !== -1) {
            moves = parts.slice(idx + 1);
            parts = parts.slice(0, idx);
        }
        fen = parts.join(' ');
    }
    return { fen, moves };
}

function createEloDict() {
	const interval = 100;
	const start = 1100;
	const end = 2000;
	const dict = { [`<${start}`]: 0 };
	let idx = 1;

	for(let lb=start; lb<end; lb+=interval) {
		const ub = lb + interval;
		dict[`${lb}-${ub-1}`] = idx++;
	}
	dict[`>=${end}`] = idx;

	return dict;
}

function mapToCategory(elo, dict) {
	const start = 1100, end = 2000, interval = 100;
	if(elo<start) return dict[`<${start}`];
	if(elo>=end) return dict[`>=${end}`];

	for(let lb=start; lb<end; lb+=interval) {
		if(elo>=lb && elo<lb+interval) return dict[`${lb}-${lb+interval-1}`];
	}

	throw new Error('Elo value out of range');
}

function mirrorSquare(square) {
	return square[0] + (9 - parseInt(square[1]));
}

function mirrorMove(move) {
	if(move.length<=4) return mirrorSquare(move.slice(0,2)) + mirrorSquare(move.slice(2,4));
	return mirrorSquare(move.slice(0,2)) + mirrorSquare(move.slice(2,4)) + move[4];
}

function swapColorsInRank(rank) {
	return rank.split('')
		.map(c => /[A-Z]/.test(c) ? c.toLowerCase() : /[a-z]/.test(c) ? c.toUpperCase() : c)
		.join('');
}

function mirrorFEN(fen) {
	const [pos, turn, castling, ep, hm, fm] = fen.split(' ');
	const mirroredPos = pos.split('/').reverse().map(swapColorsInRank).join('/');
	const mirroredTurn = turn==='w' ? 'b' : 'w';
	return `${mirroredPos} ${mirroredTurn} ${castling} ${ep} ${hm} ${fm}`;
}

function boardToTensor(fen) {
	const pieceTypes = 'PNBRQKpnbrqk'.split('');
	const tensor = new Float32Array(18*8*8);
	const [placement, turn, castling, enPassant] = fen.split(' ');

	const rows = placement.split('/');
	for(let r=0; r<8; r++) {
		let file = 0;
		for(const char of rows[r]) {
			if(!isNaN(parseInt(char))) {
				file += parseInt(char);
				continue;
			}
			const idx = pieceTypes.indexOf(char);
			tensor[idx*64 + (7-r)*8 + file] = 1;
			file++;
		}
	}

	const turnVal = turn==='w' ? 1 : 0;
	tensor.fill(turnVal, 12*64, 13*64);

	const castlingFlags = [castling.includes('K'), castling.includes('Q'), castling.includes('k'), castling.includes('q')];
	castlingFlags.forEach((f,i) => { if(f) tensor.fill(1, (13+i)*64, (14+i)*64); });

	if(enPassant!=='-') {
		const file = enPassant.charCodeAt(0)-97;
		const rank = 7-(parseInt(enPassant[1])-1);
		tensor[17*64 + rank*8 + file] = 1;
	}

	return tensor;
}

function preprocess(fen, eloSelf, eloOppo, ChessLib) {
	if(allPossibleMoves === null || allPossibleMovesReversed === null)
		throw new Error('Move data not loaded. Call loadMoves() first.');

	let board = new ChessLib(fen);
	if(fen.split(' ')[1]==='b') board = new ChessLib(mirrorFEN(board.fen()));

	const boardInput = boardToTensor(board.fen());
	const eloSelfCategory = mapToCategory(eloSelf, eloDict);
	const eloOppoCategory = mapToCategory(eloOppo, eloDict);

	const legalMoves = new Float32Array(Object.keys(allPossibleMoves).length);
	board.moves({verbose:true}).forEach(m => {
		const promotion = m.promotion || '';
		const idx = allPossibleMoves[m.from + m.to + promotion];
		if(idx!==undefined) legalMoves[idx] = 1;
	});

	return { boardInput, eloSelfCategory, eloOppoCategory, legalMoves };
}

function policyToUciLines(fen, policyObj, multipv = 1) {
    const policy = policyObj.policy;
    const winPercentage = policyObj.value;
    const cp = Math.round(-800 * Math.log10(1 / winPercentage - 1));
	const isPlayerBlack = fen.split(' ')[1]==='b';
	const squaresToIgnore = [];

	if(isPlayerBlack) {
		if(fen.includes('rnbqkbnr/pppppppp')) squaresToIgnore.push(['g8'], ['b8']);
	} else {
		if(fen.includes('PPPPPPPP/RNBQKBNR')) squaresToIgnore.push(['g1'], ['b1']);
	}

	let sortedMoves = Object.entries(policy).sort((a, b) => b[1] - a[1]);

	if(squaresToIgnore.length > 0) {
		sortedMoves = sortedMoves.filter(([move, value]) => {
			const startSquare = move.slice(0, 2);
			return !squaresToIgnore.flat().includes(startSquare);
		});
	}

    const lines = [];

    for(let i = 0; i < Math.min(multipv, sortedMoves.length); i++) {
        const [move, prob] = sortedMoves[i];

        lines.push(
            `info depth 1 seldepth 1 multipv ${i + 1} score cp ${cp} nodes 1 nps 1 time 0 pv ${move}`
        );
    }

    if(sortedMoves.length > 0) {
        lines.push(`bestmove ${sortedMoves[0][0]}`);
    }

    return lines;
}

export { loadMoves, preprocess, mirrorMove, allPossibleMovesReversed, parseSetOption, parsePosition, policyToUciLines };