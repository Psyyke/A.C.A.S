import { Chess } from '../libraries/chessjs/chess.js';
import { enginePosition } from '../../js/instance/enginePosition.js';

const positionKey = fen => fen.split(' ').slice(0, 4).join(' ');

export function readPenaPosition(command, expectedFen) {
    const match = command.match(/^position (startpos|fen (.+?))(?: moves (.+))?$/);
    if(!match) throw new Error('Pena received an invalid position command.');
    const board = new Chess();
    if(match[1] !== 'startpos' && !board.load(match[2])) throw new Error('Pena received an invalid FEN.');
    const history = [];
    for(const move of match[3]?.split(/\s+/) || []) {
        history.push(board.fen());
        if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)
            || !board.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }))
            throw new Error('Pena move history could not be legally replayed.');
    }
    if(expectedFen && positionKey(board.fen()) !== positionKey(expectedFen))
        throw new Error('Pena history does not reach the observed position or has the wrong turn.');
    return { fen: board.fen(), history };
}

export function penaPosition(fen, history) {
    readPenaPosition(`position fen ${fen}`);
    try { return { command: enginePosition(fen, history), warning: '' }; }
    catch(error) {
        console.warn('[Pena] Unreliable history, using observed position only:', error);
        return { command: `position fen ${fen}`, warning: `History unavailable: ${error.message}. Using the observed position only. Its turn cannot be independently confirmed.` };
    }
}
