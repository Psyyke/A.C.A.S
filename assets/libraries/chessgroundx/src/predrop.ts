import * as util from './util.js';
import * as cg from './types.js';

type DropMobility = (x: number, y: number) => boolean;

const wholeBoard = () => true;

/**
 *
 * @param from	0-based index from given color's PoV, inclusive
 * @param to	0-based index from given color's PoV, exclusive
 * @param color The piece's color
 * @param bd    The board's dimensions
 *
 * Returns a function that checks if a position's rank is inside the from-to range, where from and to are indices of rank when counting from
 * current "color"'s point of view (i.e. if from=to=1 and color=black the function will return true only if the position's rank is 8 in case of 8x8 board)
 * from and to can be zero or negative to denote that many ranks counting from the last
 *
 * */
function rankRange(from: number, to: number, color: cg.Color, bd: cg.BoardDimensions): DropMobility {
  if (from < 0) from += bd.height;
  if (to < 0) to += bd.height;
  return (_x, y) => {
    if (color === 'black') y = bd.height - 1 - y;
    return from <= y && y < to;
  };
}

export function predrop(variant: string, bd: cg.BoardDimensions): cg.Predrop {
  const mobility = builtinMobility(variant, bd);
  return (boardState, piece) =>
    util
      .allPos(bd)
      .filter(pos => boardState.pieces.get(util.pos2key(pos))?.color !== piece.color && mobility(piece)(pos[0], pos[1]))
      .map(util.pos2key);
}

function builtinMobility(variant: string, bd: cg.BoardDimensions): (piece: cg.Piece) => DropMobility {
  switch (variant) {
    case 'crazyhouse':
    case 'shouse':
    case 'capahouse':
    case 'gothhouse':
      // pawns can't be dropped on the first or last rank
      return piece => (piece.role === 'p-piece' ? rankRange(1, -1, piece.color, bd) : wholeBoard);

    case 'placement':
      // the "drop" is the placement phase where pieces can only be placed on the first rank
      return piece => rankRange(0, 1, piece.color, bd);

    case 'sittuyin':
      // the "drop" is the placement phase where pieces can only be placed on the player's half
      // rooks can only be dropped on the first rank
      return piece => (piece.role === 'r-piece' ? rankRange(0, 1, piece.color, bd) : rankRange(0, 3, piece.color, bd));

    case 'shogi':
    case 'minishogi':
    case 'gorogoro':
    case 'gorogoroplus':
      return piece => {
        switch (piece.role) {
          case 'p-piece': // pawns and lances can't be dropped on the last rank
          case 'l-piece':
            return rankRange(0, -1, piece.color, bd);
          case 'n-piece': // knights can't be dropped on the last two ranks
            return rankRange(0, -2, piece.color, bd);
          default:
            return wholeBoard;
        }
      };

    case 'torishogi':
      // swallows can't be dropped on the last rank
      return piece => (piece.role === 's-piece' ? rankRange(0, -1, piece.color, bd) : wholeBoard);

    case 'grandhouse':
      // pawns can't be dropped on the 1st, or 8th to 10th ranks
      return piece => (piece.role === 'p-piece' ? rankRange(1, 7, piece.color, bd) : wholeBoard);

    case 'shogun':
      // shogun only permits drops on ranks 1-5 for all pieces
      return piece => rankRange(0, 5, piece.color, bd);

    case 'synochess':
      // Only black can drop, and the only droppable rank is the literal rank five.
      return () => (_x, y) => y === 4;

    case 'shinobi':
      // Only white can drop, and only on their own half of the board
      return () => (_x, y) => y <= 3;

    // These cases are unnecessary but is here anyway to be explicit
    case 'kyotoshogi':
    case 'dobutsu':
    case 'chennis':
    default:
      return () => wholeBoard;
  }
}
