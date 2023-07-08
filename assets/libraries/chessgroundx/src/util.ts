import * as cg from './types.js';

export const invRanks: readonly cg.Rank[] = [...cg.ranks].reverse();

function files(n: number) {
  return cg.files.slice(0, n);
}

function ranks(n: number) {
  return cg.ranks.slice(0, n);
}

export function allKeys(bd: cg.BoardDimensions): cg.Key[] {
  return Array.prototype.concat(...files(bd.width).map(c => ranks(bd.height).map(r => c + r)));
}

export function allPos(bd: cg.BoardDimensions): cg.Pos[] {
  return allKeys(bd).map(key2pos);
}

export const pos2key = (pos: cg.Pos): cg.Key => (cg.files[pos[0]] + cg.ranks[pos[1]]) as cg.Key;
export const key2pos = (k: cg.Key): cg.Pos => [k.charCodeAt(0) - 97, k.charCodeAt(1) - 49];

export function roleOf(letter: cg.Letter | cg.DropOrig): cg.Role {
  return (letter.replace('+', 'p').replace('*', '_').replace('@', '').toLowerCase() + '-piece') as cg.Role;
}

export function letterOf(role: cg.Role, uppercase = false): cg.Letter {
  const letterPart = role.slice(0, role.indexOf('-'));
  const letter = (letterPart.length > 1 ? letterPart.replace('p', '+') : letterPart).replace('_', '*');
  return (uppercase ? letter.toUpperCase() : letter) as cg.Letter;
}

export function dropOrigOf(role: cg.Role): cg.DropOrig {
  return (letterOf(role, true) + '@') as cg.DropOrig;
}

export function isDropOrig(orig: cg.Orig): orig is cg.DropOrig {
  return orig[0] === orig[0].toUpperCase();
}

export function isKey(selectable: cg.Selectable | cg.Orig): selectable is cg.Key {
  return typeof selectable === 'string' && selectable[0] === selectable[0].toLowerCase();
}

export function isPiece(selectable: cg.Selectable): selectable is cg.Piece {
  return typeof selectable !== 'string';
}

export function isSame(lhs: cg.Selectable, rhs: cg.Selectable): boolean {
  if (isPiece(lhs) && isPiece(rhs)) return samePiece(lhs, rhs);
  else return lhs === rhs;
}

export function changeNumber<T>(map: Map<T, number>, key: T, num: number): void {
  map.set(key, (map.get(key) ?? 0) + num);
}

// TODO cover two-digit numbers
// This function isn't used anywhere inside chessground btw, it's probably used in Lichess
// Pychess has this in chess.ts
export const uciToMove = (uci: string | undefined): cg.Key[] | undefined => {
  if (!uci) return undefined;
  if (uci[1] === '@') return [uci.slice(2, 4) as cg.Key];
  return [uci.slice(0, 2), uci.slice(2, 4)] as cg.Key[];
};

export function memo<A>(f: () => A): cg.Memo<A> {
  let v: A | undefined;
  const ret = (): A => {
    if (v === undefined) v = f();
    return v;
  };
  ret.clear = () => {
    v = undefined;
  };
  return ret;
}

export const timer = (): cg.Timer => {
  let startAt: number | undefined;
  return {
    start() {
      startAt = performance.now();
    },
    cancel() {
      startAt = undefined;
    },
    stop() {
      if (!startAt) return 0;
      const time = performance.now() - startAt;
      startAt = undefined;
      return time;
    },
  };
};

export const opposite = (c: cg.Color): cg.Color => (c === 'white' ? 'black' : 'white');

export const samePiece = (p1: cg.Piece, p2: cg.Piece): boolean =>
  p1.role === p2.role && p1.color === p2.color && !!p1.promoted === !!p2.promoted;

export const pieceSide = (p: cg.Piece, o: cg.Color): cg.Side => (p.color === o ? 'ally' : 'enemy');

export const pieceClasses = (p: cg.Piece, o: cg.Color): string =>
  `${p.color} ${pieceSide(p, o)} ${p.promoted ? 'promoted ' : ''}${p.role}`;

export const distanceSq = (pos1: cg.Pos, pos2: cg.Pos): number => {
  const dx = pos1[0] - pos2[0],
    dy = pos1[1] - pos2[1];
  return dx * dx + dy * dy;
};

export const posToTranslate =
  (bounds: ClientRect, bd: cg.BoardDimensions): ((pos: cg.Pos, asWhite: boolean) => cg.NumberPair) =>
  (pos, asWhite) =>
    [
      ((asWhite ? pos[0] : bd.width - 1 - pos[0]) * bounds.width) / bd.width,
      ((asWhite ? bd.height - 1 - pos[1] : pos[1]) * bounds.height) / bd.height,
    ];

export const translate = (el: HTMLElement, pos: cg.NumberPair): void => {
  el.style.transform = `translate(${pos[0]}px,${pos[1]}px)`;
};

export const translateAndScale = (el: HTMLElement, pos: cg.NumberPair, scale = 1): void => {
  el.style.transform = `translate(${pos[0]}px,${pos[1]}px) scale(${scale})`;
};

export const setVisible = (el: HTMLElement, v: boolean): void => {
  el.style.visibility = v ? 'visible' : 'hidden';
};

export const eventPosition = (e: cg.MouchEvent): cg.NumberPair | undefined => {
  if (e.clientX || e.clientX === 0) return [e.clientX, e.clientY!];
  if (e.targetTouches?.[0]) return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
  return; // touchend has no position!
};

export const isRightButton = (e: cg.MouchEvent): boolean => e.buttons === 2 || e.button === 2;

export const createEl = (tagName: string, className?: string): HTMLElement => {
  const el = document.createElement(tagName);
  if (className) el.className = className;
  return el;
};

export const isMiniBoard = (el: HTMLElement): boolean => {
  return Array.from(el.classList).includes('mini');
};

export function computeSquareCenter(
  key: cg.Key,
  asWhite: boolean,
  bounds: ClientRect,
  bd: cg.BoardDimensions
): cg.NumberPair {
  const pos = key2pos(key);
  if (!asWhite) {
    pos[0] = bd.width - 1 - pos[0];
    pos[1] = bd.height - 1 - pos[1];
  }
  return [
    bounds.left + (bounds.width * (pos[0] + 0.5)) / bd.width,
    bounds.top + (bounds.height * (bd.height - pos[1] - 0.5)) / bd.height,
  ];
}
