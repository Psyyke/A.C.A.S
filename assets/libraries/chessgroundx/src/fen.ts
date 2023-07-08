import { pos2key, invRanks, roleOf, letterOf, changeNumber } from './util.js';
import * as cg from './types.js';

export const initial: cg.FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

export function read(fen: cg.FEN, bd: cg.BoardDimensions): cg.BoardState {
  const piecesPart = fen.split(' ')[0];
  const bracketIdx = piecesPart.indexOf('[');

  let boardPart: string;
  let pocketPart: string | undefined;
  if (bracketIdx > -1) {
    boardPart = piecesPart.slice(0, bracketIdx);
    pocketPart = piecesPart.slice(bracketIdx + 1, piecesPart.indexOf(']'));
  } else {
    const ranks = piecesPart.split('/');
    boardPart = ranks.slice(0, bd.height).join('/');
    // Handle "pocket after an extra slash" format
    pocketPart = ranks.length > bd.height ? ranks[bd.height] : undefined;
  }

  return {
    pieces: readBoard(boardPart),
    pockets: readPockets(pocketPart),
  };
}

function readBoard(fen: cg.FEN): cg.Pieces {
  if (fen === 'start') fen = initial;

  const pieces: cg.Pieces = new Map();
  let row = fen.split('/').length - 1;
  let col = 0;
  let promoted = false;
  let num = 0;

  for (const c of fen) {
    switch (c) {
      case ' ':
      case '[':
        return pieces;
      case '/':
        --row;
        if (row < 0) return pieces;
        col = 0;
        num = 0;
        break;
      case '+':
        promoted = true;
        break;
      case '~': {
        const piece = pieces.get(pos2key([col - 1, row]));
        if (piece) piece.promoted = true;
        break;
      }
      default: {
        const nb = c.charCodeAt(0);
        if (48 <= nb && nb < 58) {
          num = 10 * num + nb - 48;
        } else {
          col += num;
          num = 0;
          const letter = c.toLowerCase() as cg.Letter;
          const piece = {
            role: roleOf(letter),
            color: (c === letter ? 'black' : 'white') as cg.Color,
          } as cg.Piece;
          if (promoted) {
            piece.role = ('p' + piece.role) as cg.Role;
            piece.promoted = true;
            promoted = false;
          }
          pieces.set(pos2key([col, row]), piece);
          ++col;
        }
      }
    }
  }
  return pieces;
}

function readPockets(pocketStr: string | undefined): cg.Pockets | undefined {
  if (pocketStr !== undefined) {
    const whitePocket = new Map();
    const blackPocket = new Map();

    for (const p of pocketStr) {
      const role = roleOf(p as cg.Letter);
      if (/[A-Z]/.test(p)) changeNumber(whitePocket, role, 1);
      else if (/[a-z]/.test(p)) changeNumber(blackPocket, role, 1);
    }

    return {
      white: whitePocket,
      black: blackPocket,
    };
  } else {
    return undefined;
  }
}

export function write(boardState: cg.BoardState, bd: cg.BoardDimensions): cg.FEN {
  return writeBoard(boardState.pieces, bd) + writePockets(boardState.pockets);
}

export function writeBoard(pieces: cg.Pieces, bd: cg.BoardDimensions): cg.FEN {
  return invRanks
    .slice(-bd.height)
    .map(y =>
      cg.files
        .slice(0, bd.width)
        .map(x => {
          const piece = pieces.get((x + y) as cg.Key);
          if (piece) {
            let p = letterOf(piece.role, piece.color === 'white');
            if (piece.promoted && p.charAt(0) !== '+') p += '~';
            return p;
          } else return '1';
        })
        .join('')
    )
    .join('/')
    .replace(/1{2,}/g, s => s.length.toString());
}

function writePockets(pockets: cg.Pockets | undefined): string {
  if (pockets) return '[' + writePocket(pockets.white, true) + writePocket(pockets.black, false) + ']';
  else return '';
}

function writePocket(pocket: cg.Pocket, asWhite: boolean): string {
  const letters: string[] = [];
  for (const [r, n] of pocket.entries()) letters.push(letterOf(r, asWhite).repeat(n));
  return letters.join('');
}
