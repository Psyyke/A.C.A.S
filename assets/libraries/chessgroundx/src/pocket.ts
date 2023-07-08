import * as cg from './types.js';
import * as util from './util.js';
import * as board from './board.js';
import { clear as drawClear } from './draw.js';
import { dragNewPiece } from './drag.js';
import { HeadlessState, State } from './state.js';

export function renderPocketsInitial(
  state: HeadlessState,
  elements: cg.Elements,
  pocketTop?: HTMLElement,
  pocketBottom?: HTMLElement
): void {
  if (pocketTop) {
    pocketTop.innerHTML = '';
    elements.pocketTop = pocketTop;
    pocketView(state, elements.pocketTop, 'top');
  }
  if (pocketBottom) {
    pocketBottom.innerHTML = '';
    elements.pocketBottom = pocketBottom;
    pocketView(state, elements.pocketBottom, 'bottom');
  }
}

function pocketView(state: HeadlessState, pocketEl: HTMLElement, position: cg.PocketPosition): void {
  if (!state.pocketRoles) return;
  const color = position === 'top' ? util.opposite(state.orientation) : state.orientation;
  const roles = state.pocketRoles[color];
  const pl = String(roles.length);
  const files = String(state.dimensions.width);
  const ranks = String(state.dimensions.height);
  pocketEl.setAttribute('style', `--pocketLength: ${pl}; --files: ${files}; --ranks: ${ranks}`);
  pocketEl.classList.add('pocket', position);
  roles.forEach(role => {
    const pieceName = util.pieceClasses({ role: role, color: color }, state.orientation);
    const sq = util.createEl('square');
    const p = util.createEl('piece', pieceName);
    sq.appendChild(p);
    p.setAttribute('data-color', color);
    p.setAttribute('data-role', role);
    renderPiece(state, sq);
    pocketEl.appendChild(sq);
  });
}

/**
 * updates each piece element attributes based on state
 * */
export function renderPockets(state: State): void {
  renderPocket(state, state.dom.elements.pocketBottom);
  renderPocket(state, state.dom.elements.pocketTop);
}

function renderPocket(state: HeadlessState, pocketEl?: HTMLElement): void {
  if (pocketEl) {
    let sq = pocketEl.firstChild;
    if (sq && sq.firstChild) {
      const color = (sq.firstChild as HTMLElement).getAttribute('data-color');
      pocketEl.classList.toggle(
        'usable',
        !state.viewOnly &&
          (state.movable.free || state.movable.color === 'both' || (!!color && state.movable.color === color))
      );
      while (sq) {
        renderPiece(state, sq as HTMLElement);
        sq = sq.nextSibling;
      }
    }
  }
}

function renderPiece(state: HeadlessState, sq: HTMLElement): void {
  const p = sq.firstChild as cg.PieceNode;
  const role = p.getAttribute('data-role') as cg.Role;
  const color = p.getAttribute('data-color') as cg.Color;
  p.setAttribute('data-nb', '' + (state.boardState.pockets![color].get(role) ?? 0));
  const piece = { role, color };

  const selected = state.selectable.selected;
  sq.classList.toggle(
    'selected-square',
    !!selected && util.isPiece(selected) && state.selectable.fromPocket && util.samePiece(selected, piece)
  );

  const premoveOrig = state.premovable.current?.[0];
  sq.classList.toggle(
    'premove',
    !!premoveOrig && util.isDropOrig(premoveOrig) && util.roleOf(premoveOrig) === role && state.turnColor !== color
  );

  sq.classList.toggle(
    'last-move',
    state.highlight.lastMove && !!state.lastMove?.includes(util.dropOrigOf(role)) && state.turnColor !== color
  );
}

export function drag(s: State, e: cg.MouchEvent): void {
  if (!e.isTrusted || (e.button !== undefined && e.button !== 0)) return; // only touch or left click
  if (e.touches && e.touches.length > 1) return; // support one finger touch only
  const el = e.target as HTMLElement,
    role = el.getAttribute('data-role') as cg.Role,
    color = el.getAttribute('data-color') as cg.Color,
    n = Number(el.getAttribute('data-nb'));
  if (n === 0) return;
  const piece = { role, color };
  const previouslySelected = s.selectable.selected;
  if (!previouslySelected && s.drawable.enabled && (s.drawable.eraseOnClick || piece.color !== s.turnColor))
    drawClear(s);
  // Prevent touch scroll and create no corresponding mouse event
  if (e.cancelable !== false) e.preventDefault();
  const hadPremove = !!s.premovable.current;
  s.stats.ctrlKey = e.ctrlKey;
  board.select(s, piece);
  const selected = s.selectable.selected;
  const stillSelected = selected && util.isSame(selected, piece);
  if (stillSelected && board.isDraggable(s, piece, true)) {
    dragNewPiece(s, piece, true, e, previouslySelected);
  } else {
    if (hadPremove) board.unsetPremove(s);
  }
  s.dom.redraw();
}
