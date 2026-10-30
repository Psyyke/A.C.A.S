import { Chess } from '../libraries/chessjs/chess.js';

export function readPosition(command) {
    const tokens = command.trim().split(/\s+/);
    const movesIndex = tokens.indexOf('moves');
    const board = new Chess();

    if(tokens[1] === 'fen') {
        const fen = tokens.slice(2, movesIndex < 0 ? undefined : movesIndex).join(' ');
        if(!board.load(fen)) throw new Error('Invalid FEN');
    } else if(tokens[1] !== 'startpos') {
        throw new Error('Expected position startpos or position fen');
    }

    if(movesIndex >= 0) {
        for(const move of tokens.slice(movesIndex + 1)) {
            if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)
                || !board.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] })) {
                throw new Error(`Illegal position move: ${move}`);
            }
        }
    }

    const placement = board.fen().split(' ')[0];
    if(placement.match(/K/g)?.length !== 1 || placement.match(/k/g)?.length !== 1) {
        throw new Error('Standard chess requires exactly one king of each color');
    }

    return board;
}

const goNumbers = new Set(['depth', 'nodes', 'movetime', 'mate', 'wtime', 'btime', 'winc', 'binc', 'movestogo']);
const goFlags = new Set(['infinite', 'ponder']);

export function readGo(command, board) {
    const tokens = command.trim().split(/\s+/);
    const limits = [];
    const requested = [];
    let movetime = null;
    let clockLimited = false;
    let restricted = false;

    for(let index = 1; index < tokens.length; index++) {
        const token = tokens[index];
        if(goNumbers.has(token)) {
            const value = Number(tokens[++index]);
            if(Number.isSafeInteger(value) && value >= 0) {
                limits.push(token, String(value));
                if(token === 'movetime') movetime = value;
                if(token === 'wtime' || token === 'btime') clockLimited = true;
            }
        } else if(goFlags.has(token)) {
            limits.push(token);
        } else if(token === 'searchmoves') {
            restricted = true;
            while(index + 1 < tokens.length && /^[a-h][1-8][a-h][1-8][qrbn]?(?:,|$)/.test(tokens[index + 1])) {
                requested.push(...tokens[++index].split(',').filter(Boolean));
            }
        }
    }

    const legal = new Map(board.moves({ verbose: true }).map(move =>
        [move.from + move.to + (move.promotion || ''), move]));
    if(restricted) {
        const allowed = new Set(requested);
        // Moves on demand can specify a promotion destination without its suffix.
        for(const move of legal.keys()) {
            if(!allowed.has(move) && !(move.length === 5 && allowed.has(move.slice(0, 4)))) legal.delete(move);
        }
    }

    if(!limits.length) limits.push('depth', '12');
    const searchmoves = restricted ? ` searchmoves ${[...legal.keys()].join(' ')}` : '';

    return { legal, command: `go ${limits.join(' ')}${searchmoves}`,
        ponder: limits.includes('ponder'), movetime, clockLimited };
}

export function readInfo(line) {
    if(!line.startsWith('info ') || line.startsWith('info string ')) return null;
    const pv = /\bpv\s+(.+)$/.exec(line)?.[1].trim().split(/\s+/);
    const score = /\bscore\s+(cp|mate)\s+(-?\d+)/.exec(line);
    if(!pv?.length || !score || /\b(?:lowerbound|upperbound)\b/.test(line)) return null;

    const info = { move: pv[0], pv, [score[1]]: Number(score[2]) };
    for(const key of ['depth', 'seldepth', 'multipv', 'nodes', 'nps', 'time', 'hashfull', 'tbhits']) {
        const value = new RegExp(`\\b${key}\\s+(\\d+)`).exec(line);
        if(value) info[key] = Number(value[1]);
    }
    const wdl = /\bwdl\s+(\d+\s+\d+\s+\d+)/.exec(line);
    if(wdl) info.wdl = wdl[1];
    return info;
}