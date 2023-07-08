import { HeadlessState } from './state.js';
import { setVisible, createEl, isMiniBoard } from './util.js';
import { colors, letters, Elements, Notation } from './types.js';
import { createElement as createSVG, setAttributes } from './svg.js';

type CoordFormat = {
  coords: readonly string[];
  position: 'top' | 'bottom' | 'side';
  direction: 'forward' | 'backward'; // "Forward" means bottom to top / left to right
  noBlackReverse?: boolean; // Don't reverse the direction for black orientation
};

// Need to support up to 16 ranks or files
// Since some countries never had variants that big, some letters and numbers here are theoretical
const LETTER_ENGLISH = letters;
const LETTER_THAI = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ญ', 'ต', 'ถ', 'ท', 'น', 'ป', 'ผ', 'พ', 'ม'] as const;
const NUMBER_ARABIC = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16'] as const;
const NUMBER_JANGGI = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '1', '2', '3', '4', '5', '6'] as const;
const NUMBER_HANZI = [
  '一',
  '二',
  '三',
  '四',
  '五',
  '六',
  '七',
  '八',
  '九',
  '十',
  '十一',
  '十二',
  '十三',
  '十四',
  '十五',
  '十六',
] as const;
const NUMBER_THAI = ['๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙', '๑๐', '๑๑', '๑๒', '๑๓', '๑๔', '๑๕', '๑๖'] as const;

const coordFormat: Record<Notation, CoordFormat[]> = {
  [Notation.ALGEBRAIC]: [
    {
      coords: LETTER_ENGLISH,
      position: 'bottom',
      direction: 'forward',
    },
    {
      coords: NUMBER_ARABIC,
      position: 'side',
      direction: 'forward',
    },
  ],

  [Notation.SHOGI_ENGLET]: [
    {
      coords: NUMBER_ARABIC,
      position: 'top',
      direction: 'backward',
    },
    {
      coords: LETTER_ENGLISH,
      position: 'side',
      direction: 'backward',
    },
  ],

  [Notation.SHOGI_ARBNUM]: [
    {
      coords: NUMBER_ARABIC,
      position: 'top',
      direction: 'backward',
    },
    {
      coords: NUMBER_ARABIC,
      position: 'side',
      direction: 'backward',
    },
  ],

  [Notation.SHOGI_HANNUM]: [
    {
      coords: NUMBER_ARABIC,
      position: 'top',
      direction: 'backward',
    },
    {
      coords: NUMBER_HANZI,
      position: 'side',
      direction: 'backward',
    },
  ],

  [Notation.JANGGI]: [
    {
      coords: NUMBER_ARABIC,
      position: 'bottom',
      direction: 'forward',
    },
    {
      coords: NUMBER_JANGGI,
      position: 'side',
      direction: 'backward',
    },
  ],

  [Notation.XIANGQI_ARBNUM]: [
    {
      coords: NUMBER_ARABIC,
      position: 'top',
      direction: 'forward',
      noBlackReverse: true,
    },
    {
      coords: NUMBER_ARABIC,
      position: 'bottom',
      direction: 'backward',
      noBlackReverse: true,
    },
  ],

  [Notation.XIANGQI_HANNUM]: [
    {
      coords: NUMBER_ARABIC,
      position: 'top',
      direction: 'forward',
      noBlackReverse: true,
    },
    {
      coords: NUMBER_HANZI,
      position: 'bottom',
      direction: 'backward',
      noBlackReverse: true,
    },
  ],

  [Notation.THAI_ALGEBRAIC]: [
    {
      coords: LETTER_THAI,
      position: 'bottom',
      direction: 'forward',
    },
    {
      coords: NUMBER_THAI,
      position: 'side',
      direction: 'forward',
    },
  ],
};

export function renderWrap(element: HTMLElement, s: HeadlessState): Elements {
  // .cg-wrap (element passed to Chessground)
  //   cg-container
  //     cg-board
  //     svg.cg-shapes
  //       defs
  //       g
  //     svg.cg-custom-svgs
  //       g
  //     cg-auto-pieces
  //     coords.ranks
  //     coords.files
  //     piece.ghost

  element.innerHTML = '';

  // ensure the cg-wrap class is set
  // so bounds calculation can use the CSS width/height values
  // add that class yourself to the element before calling chessground
  // for a slight performance improvement! (avoids recomputing style)
  element.classList.add('cg-wrap');

  for (const c of colors) element.classList.toggle('orientation-' + c, s.orientation === c);
  element.classList.toggle('manipulable', !s.viewOnly);

  const container = createEl('cg-container');
  element.appendChild(container);

  const extension = createEl('extension');
  container.appendChild(extension);
  const board = createEl('cg-board');
  container.appendChild(board);

  let pocketBottom, pocketTop;
  if (isMiniBoard(element)) {
    if (s.boardState.pockets) {
      pocketBottom = createEl('pocketBottom');
      pocketTop = createEl('pocketTop');
      container.insertBefore(s.orientation === 'white' ? pocketTop : pocketBottom, board);
      container.insertBefore(s.orientation === 'white' ? pocketBottom : pocketTop, board.nextSibling);
    }
  }

  let svg: SVGElement | undefined;
  let customSvg: SVGElement | undefined;
  let autoPieces: HTMLElement | undefined;

  if (s.drawable.visible) {
    const width = s.dimensions.width;
    const height = s.dimensions.height;
    svg = setAttributes(createSVG('svg'), {
      class: 'cg-shapes',
      viewBox: `${-width / 2} ${-height / 2} ${width} ${height}`,
      preserveAspectRatio: 'xMidYMid slice',
    });
    svg.appendChild(createSVG('defs'));
    svg.appendChild(createSVG('g'));

    customSvg = setAttributes(createSVG('svg'), {
      class: 'cg-custom-svgs',
      viewBox: `${-(width - 1) / 2} ${-(height - 1) / 2} ${width} ${height}`,
      preserveAspectRatio: 'xMidYMid slice',
    });
    customSvg.appendChild(createSVG('g'));

    autoPieces = createEl('cg-auto-pieces');

    container.appendChild(svg);
    container.appendChild(customSvg);
    container.appendChild(autoPieces);
  }

  if (s.coordinates) {
    coordFormat[s.notation].forEach(f => {
      const max = f.position === 'side' ? s.dimensions.height : s.dimensions.width;
      const pos = f.position; // TODO pos = f.position === 'side' ? s.ranksPosition : f.position;
      const coords = f.coords.slice(0, max);
      container.appendChild(
        renderCoords(coords, `${pos} ${f.direction}${f.noBlackReverse ? '' : ' ' + s.orientation}`)
      );
    });
  }

  let ghost: HTMLElement | undefined;
  if (s.draggable.enabled && s.draggable.showGhost) {
    ghost = createEl('piece', 'ghost');
    setVisible(ghost, false);
    container.appendChild(ghost);
  }

  return {
    pocketTop,
    pocketBottom,
    board,
    container,
    wrap: element,
    ghost,
    svg,
    customSvg,
    autoPieces,
  };
}

function renderCoords(elems: readonly string[], className: string): HTMLElement {
  const el = createEl('coords', className);
  let f: HTMLElement;
  for (const elem of elems) {
    f = createEl('coord');
    f.textContent = elem;
    el.appendChild(f);
  }
  return el;
}
