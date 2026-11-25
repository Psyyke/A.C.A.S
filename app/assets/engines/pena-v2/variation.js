import { penaText, translatePenaUI } from './i18n.js';

export function penaVisualsChanged(instance) {
    if(typeof document !== 'undefined')
        document.dispatchEvent(new CustomEvent('acas-pena-visuals', { detail: { instance } }));
}

export class PenaVariation {
    constructor(instance, enabled = () => true, lifetime = () => 6000) {
        this.instance = instance;
        this.enabled = enabled;
        this.lifetime = lifetime;
        const container = this.container = document.createElement('div');
        container.className = 'pena-variation';
        container.hidden = true;
        container.innerHTML = '<div class="pena-variation-board chessground-x"></div>';
        const actions = this.actions = document.createElement('div');
        actions.className = 'pena-actions pena-variation-actions';
        actions.setAttribute('role', 'group');
        actions.dataset.penaLabel = 'preview';
        actions.innerHTML = `<span class="pena-variation-label" data-pena-text="preview"></span>
            <button type="button" class="acas-fancy-button" data-step="-1" data-pena-label="previousMove"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg></button>
            <span class="pena-variation-caption"></span>
            <button type="button" class="acas-fancy-button" data-step="1" data-pena-label="nextMove"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
            <button type="button" class="acas-fancy-button" data-close data-pena-label="closePreview"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>`;
        this.element = container.querySelector('.pena-variation-board');
        this.caption = actions.querySelector('.pena-variation-caption');
        actions.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
            this.index = Math.max(0, Math.min(this.frames.length - 1, this.index + Number(button.dataset.step)));
            this.before = false;
            this.render();
        }));
        actions.querySelector('[data-close]').addEventListener('click', () => this.clear());
        for(const element of [container, actions]) {
            element.addEventListener('pointerdown', event => event.stopPropagation());
            element.addEventListener('click', event => event.stopPropagation());
            element.addEventListener('keydown', event => {
                if(event.key === 'Escape') {
                    event.stopPropagation();
                    this.clear();
                }
            });
        }
    }

    // With no frames it shows the live position itself, for when the GUI board is busy with a learning review.
    show(frames, rootFen, index = frames.length - 1, before = false) {
        if(!this.enabled() || this.instance.currentFen !== rootFen || CONCEAL_ASSISTANCE_ACTIVE) {
            this.clear();
            return null;
        }
        const host = this.instance.instanceElem?.querySelector('.chessboard-components > .chessground-x');
        if(!host) throw new Error('Pena cannot preview a position before the game board is ready.');
        this.rootFen = rootFen;
        this.frames = frames.length ? frames : [{ fen: rootFen, san: 'Current position', root: true }];
        this.index = Math.max(0, Math.min(this.frames.length - 1, index));
        this.before = before;
        host.appendChild(this.container);
        host.parentElement.appendChild(this.actions);
        const liveOverlay = this.instance.BoardDrawer?.boardContainerElem;
        if(liveOverlay && !this.liveOverlay) {
            this.liveOverlay = liveOverlay;
            this.liveOverlayVisibility = liveOverlay.style.visibility;
            liveOverlay.style.visibility = 'hidden';
        }
        this.container.hidden = false;
        translatePenaUI(this.container);
        this.actions.setAttribute('aria-label', penaText('preview'));
        translatePenaUI(this.actions);
        if(!this.board) {
            this.board = window.ChessgroundX(this.element, {
                fen: this.rootFen, dimensions: { width: 8, height: 8 },
                selectable: { enabled: false }, draggable: { enabled: false },
                drawable: { enabled: false }, animation: { enabled: false }, viewOnly: true
            });
            this.drawer = new UniversalBoardDrawer(this.element, { boardDimensions: [8, 8],
                parentElem: document.querySelector('#board-drawings') || document.body, zIndex: 501, prepend: true });
        }
        this.render();
        return this.drawer;
    }

    render() {
        if(!this.enabled() || this.instance.currentFen !== this.rootFen || CONCEAL_ASSISTANCE_ACTIVE) { this.clear(); return; }
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => this.clear(), this.lifetime());
        const frame = this.frames[this.index];
        // Before a move is played, the board waits on the position it starts from and the arrow shows it.
        const before = this.before && !frame.root;
        const orientation = this.instance.BoardDrawer?.orientation || 'w';
        const fen = before ? frame.beforeFen : frame.fen;
        if(this.element.dataset.fen !== fen || this.drawer.orientation !== orientation) {
            this.drawer.addedShapes.forEach(shape => shape.element.remove());
            this.drawer.addedShapes = [];
        }
        this.element.dataset.fen = fen;
        this.board.set({ fen, orientation: orientation === 'b' ? 'black' : 'white',
            lastMove: frame.from && !before ? [frame.from, frame.to] : undefined });
        this.drawer.setOrientation(orientation);
        this.caption.textContent = frame.root ? frame.san
            : `${frame.branch ? `Branch ${frame.branch}, ` : ''}${this.index + 1}/${this.frames.length}: ${before ? 'next ' : ''}${frame.san}`
                + (this.frames.incomplete ? ' (legal prefix only)' : '');
        this.actions.querySelector('[data-step="-1"]').disabled = this.index === 0;
        this.actions.querySelector('[data-step="1"]').disabled = this.index === this.frames.length - 1;
        // PiP mirrors this board while a line is being played through. The plain live position stays out of PiP.
        const preview = frame.root ? null : { element: this.element, overlay: this.drawer.boardContainerElem };
        if(preview || this.instance.penaPreview?.element === this.element) this.instance.penaPreview = preview;
        penaVisualsChanged(this.instance);
    }

    clear() {
        clearTimeout(this.timeout);
        this.drawer?.terminate();
        this.drawer = null;
        this.board?.destroy();
        this.board = null;
        this.container.hidden = true;
        this.container.remove();
        this.actions.remove();
        if(this.liveOverlay) {
            this.liveOverlay.style.visibility = this.liveOverlayVisibility;
            this.liveOverlay = null;
        }
        this.frames = [];
        if(this.instance.penaPreview?.element === this.element) {
            this.instance.penaPreview = null;
            penaVisualsChanged(this.instance);
        }
    }
}

