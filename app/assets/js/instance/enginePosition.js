import { Chess } from '../../engines/libraries/chessjs/chess.js';

const positionKey = fen => fen.split(' ').slice(0, 4).join(' ');

export function enginePosition(fen, history = [], maxLength = Infinity) {
    if(history.some(state => state?.historyIncomplete)) throw new Error('Move history contains an unresolved observation gap');
    if(history.length < 2) return `position fen ${fen}`;

    const initialFen = history[0]?.fen?.full;
    const chess = new Chess();
    if(!initialFen || !chess.load(initialFen)) throw new Error('Invalid initial history position');
    const moves = [];
    const positions = [initialFen];

    for(const state of history.slice(1)) {
        const nextFen = state?.fen?.full;
        if(!nextFen) throw new Error('Missing history position');
        if(positionKey(nextFen) === positionKey(chess.fen())) continue;

        const change = state.boardChanges;
        const move = change?.from && change?.to ? chess.move({
            from: change.from, to: change.to,
            ...(change.promotionPiece ? { promotion: change.promotionPiece.toLowerCase() } : {})
        }) : null;
        if(!move || positionKey(chess.fen()) !== positionKey(nextFen)) {
            throw new Error('Move history cannot be legally replayed');
        }
        moves.push(move.from + move.to + (move.promotion || ''));
        positions.push(chess.fen());
    }

    if(positionKey(chess.fen()) !== positionKey(fen)) throw new Error('Move history does not reach the analyzed position');
    if(!moves.length) return `position fen ${fen}`;
    let start = 0;
    let moveLength = moves.reduce((length, move) => length + move.length + 1, 0);
    while(start < moves.length && 13 + positions[start].length + 6 + moveLength > maxLength) {
        moveLength -= moves[start].length + 1;
        start++;
    }
    const command = start === moves.length ? `position fen ${fen}`
        : `position fen ${positions[start]} moves ${moves.slice(start).join(' ')}`;
    if(command.length > maxLength) throw new Error('Position command exceeds the engine command limit');
    if(start) console.warn('[Engine] Move history truncated to fit the Calculation Server command limit.');
    return command;
}
