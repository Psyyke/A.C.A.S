let allPossibleMoves = null;
let allPossibleMovesReversed = null;

async function loadMoves() {
	const movesRes = await fetch('Neural/data/all_moves.json');
	allPossibleMoves = await movesRes.json();

	const movesRevRes = await fetch('Neural/data/all_moves_reversed.json');
	allPossibleMovesReversed = await movesRevRes.json();

	return { allPossibleMoves, allPossibleMovesReversed };
}

function parseSetOption(line) {
    const tokens = line.trim().split(/\s+/);
    const idxName  = tokens.indexOf('name');
    const idxValue = tokens.indexOf('value');

    if(idxName === -1 || idxValue === -1) return null;

    const name  = tokens.slice(idxName + 1, idxValue).join(' ');
    const value = tokens.slice(idxValue + 1).join(' ');

    return { name, value };
}

function parseGo(line) {
    const tokens = line.trim().split(/\s+/);

    const nodes = parseInt(tokens[tokens.indexOf('nodes') + 1]);
    
    let history = tokens[tokens.indexOf('history') + 1];
    history = history === '-' ? 'none' : history.replaceAll('#', ' ').split(',');

    let searchMoves = null;
    const smIdx = tokens.indexOf('searchmoves');
    if(smIdx !== -1) searchMoves = tokens[smIdx + 1].split(',');

    return { nodes, history, searchMoves };
}

function parsePosition(line) {
    const tokens = line.trim().split(/\s+/);
    let fen = 'startpos';
    let moves = [];

    if(tokens[1] === 'startpos') {
        const idx = tokens.indexOf('moves');
        if(idx !== -1) moves = tokens.slice(idx + 1);
    } else if(tokens[1] === 'fen') {
        let parts = tokens.slice(2);
        const idx = parts.indexOf('moves');
        if(idx !== -1) {
            moves = parts.slice(idx + 1);
            parts = parts.slice(0, idx);
        }
        fen = parts.join(' ');
    }
    return { fen, moves };
}

function mirrorSquare(square) {
	return square[0] + (9 - parseInt(square[1]));
}

function mirrorMove(move) {
	if(move.length<=4) return mirrorSquare(move.slice(0,2)) + mirrorSquare(move.slice(2,4));
	return mirrorSquare(move.slice(0,2)) + mirrorSquare(move.slice(2,4)) + move[4];
}

function mirrorFenIfNecessary(fen) {
    const parts = fen.split(' ');
    if(parts[1] === 'w') return fen;

    let rows = parts[0].split('/');

    rows = rows.reverse();

    rows = rows.map(row => {
        let newRow = '';
        for (let i = row.length - 1; i >= 0; i--) {
            const c = row[i];
            if (c >= '1' && c <= '8') {
                newRow = c + newRow;
            } else {
                newRow = c + newRow;
            }
        }
        return newRow;
    });

    parts[0] = rows.join('/');

    return parts.join(' ');
}

function fillFullPlane(tensor, planeIndex, flag) {
    const start = planeIndex * 64;
    const end = start + 64;
    for(let i = start; i < end; i++){
        tensor[i] = flag;
    }
}

function logTensorLayers(tensor, planes = 112, size = 8) {
    const planeSize = size * size;

    for (let layer = 0; layer < planes; layer++) {
        const start = layer * planeSize;
        const end = start + planeSize;
        const flatLayer = tensor.slice(start, end);

        const layer2D = [];
        for (let row = 0; row < size; row++) {
            const rowStart = row * size;
            const rowEnd = rowStart + size;
            layer2D.push(Array.from(flatLayer.slice(rowStart, rowEnd)));
        }

        console.log(`Layer ${layer}:`);
        console.table(layer2D);
    }
}

function encodeBoardPieces(fen) {
    const pieceTypes = 'PNBRQKpnbrqk'.split('');
    const tensor = new Float32Array(13 * 64);
    const [placement] = fen.split(' ');

    const rows = placement.split('/');

    for (let r = 0; r < 8; r++) {
        let file = 0;
        for (const char of rows[r]) {
            if (!isNaN(parseInt(char))) {
                file += parseInt(char);
                continue;
            }
            const idx = pieceTypes.indexOf(char);

            tensor[idx*64 + r*8+file] = 1;

            file++;
        }
    }

    return tensor;
}

function boardToTensor(currentFen, history = []) {
    const tensor = new Float32Array(112 * 64);
    const currentFenParts = currentFen.split(' ');
    const castling = currentFenParts[2];
    const maxBoardPositions = 8; // current board + 7 history boards
    const planesPerPosition = 13;

    const allFens = history.length >= (maxBoardPositions - 1) 
    ? [currentFen, ...history.slice(0, (maxBoardPositions - 1))] 
    : [currentFen];

    console.log({ allFens });

    for (let i = 0; i < maxBoardPositions; i++) {
        // Use FEN[i] if it exists, otherwise repeat the last FEN
        const fen = i < allFens.length ? allFens[i] : allFens[allFens.length - 1];
        const boardPlanes = encodeBoardPieces(fen);

        const offset = i * planesPerPosition * 64;
        tensor.set(boardPlanes, offset);
    }

    if(castling.includes('K')) fillFullPlane(tensor, 104, 1);
    if(castling.includes('Q')) fillFullPlane(tensor, 105, 1);
    if(castling.includes('k')) fillFullPlane(tensor, 104, 1);
    if(castling.includes('q')) fillFullPlane(tensor, 107, 1);

    // do some of these even work?
    
    fillFullPlane(tensor, 108, 0); // 0 if white to move, 1 if black to move
    fillFullPlane(tensor, 109, 0); // 0 if white to move, 1 if black to move
    fillFullPlane(tensor, 110, 0);
    fillFullPlane(tensor, 111, 1);

    return tensor;
}

function preprocess(fen, history, ChessLib) {
	if(allPossibleMoves === null || allPossibleMovesReversed === null)
		throw new Error('Move data not loaded. Call loadMoves() first.');

	let board = new ChessLib(fen);

    //const calculatingBlack = fen.split(' ')[1]==='w';
	//if(calculatingBlack) board = new ChessLib(mirrorFen(board.fen()));
    //const fixedHistory = history.map(x => calculatingBlack ? mirrorFen(x) : x);

	const boardInput = boardToTensor(fen, history);

	const legalMoves = new Float32Array(Object.keys(allPossibleMoves).length);
	board.moves({verbose:true}).forEach(m => {
		const promotion = m.promotion || '';
		const idx = allPossibleMoves[m.from + m.to + promotion];
		if(idx !== undefined) legalMoves[idx] = 1;
	});

	return { boardInput, legalMoves };
}

export {  loadMoves, preprocess, mirrorMove, mirrorFenIfNecessary, allPossibleMovesReversed, parseSetOption, parseGo, parsePosition };