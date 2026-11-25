(() => {
    const STORAGE_KEY = 'acas-server-panel-shrink';
    const MIN_GRID_HEIGHT = 56;
    const KEY_STEP = 24;
    const resizer = document.getElementById('panelResizer');
    const grid = document.getElementById('engineGrid');
    const heading = document.getElementById('engine-library-heading');
    const brand = document.getElementById('acas-header');
    const body = document.body;
    let shrink = 0;

    try { shrink = Math.max(0, Number(localStorage.getItem(STORAGE_KEY)) || 0); } catch { /* Storage is optional. */ }

    // Sizes are read with every resize state removed so they always describe the full layout.
    function measure() {
        const classes = ['library-sized', 'library-hidden', 'brand-hidden'].filter(name => body.classList.contains(name));
        body.classList.remove(...classes);
        const sizes = { grid: grid.offsetHeight, heading: heading.offsetHeight, brand: brand.offsetHeight, minGrid: MIN_GRID_HEIGHT };
        const card = grid.querySelector('.engine-card');
        if(card?.firstElementChild) {
            const px = (style, ...names) => names.reduce((sum, name) => sum + (parseFloat(style[name]) || 0), 0);
            const cardStyle = getComputedStyle(card);
            // Smallest size that still shows each card's full title row.
            sizes.minGrid = Math.ceil(card.firstElementChild.offsetHeight
                + px(cardStyle, 'paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth')
                + px(getComputedStyle(grid), 'paddingTop', 'paddingBottom'));
        }
        body.classList.add(...classes);
        return { ...sizes, library: sizes.grid + sizes.heading, max: sizes.grid + sizes.heading + sizes.brand };
    }

    function apply(save = false) {
        const sizes = measure();
        shrink = Math.min(Math.max(0, shrink), sizes.max);
        const gridLimit = Math.max(0, sizes.grid - sizes.minGrid);
        const libraryHidden = shrink > gridLimit && shrink >= (gridLimit + sizes.library) / 2;
        body.classList.toggle('library-hidden', libraryHidden);
        body.classList.toggle('library-sized', !libraryHidden && shrink > 0);
        body.style.setProperty('--library-height', `${sizes.grid - Math.min(shrink, gridLimit)}px`);
        body.classList.toggle('brand-hidden', shrink >= sizes.library + sizes.brand / 2);
        resizer.setAttribute('aria-valuemin', '0');
        resizer.setAttribute('aria-valuemax', '100');
        resizer.setAttribute('aria-valuenow', String(Math.round(sizes.max ? shrink / sizes.max * 100 : 0)));
        if(save) try { localStorage.setItem(STORAGE_KEY, String(Math.round(shrink))); } catch { /* Storage is optional. */ }
    }

    function setShrink(value) {
        shrink = value;
        apply(true);
    }

    resizer.addEventListener('pointerdown', event => {
        if(event.button !== 0) return;
        event.preventDefault();
        const startY = event.clientY;
        const startShrink = Math.min(shrink, measure().max);
        resizer.setPointerCapture(event.pointerId);
        body.classList.add('panel-resizing');
        const move = moveEvent => {
            shrink = startShrink + startY - moveEvent.clientY;
            apply();
        };
        const end = () => {
            body.classList.remove('panel-resizing');
            resizer.removeEventListener('pointermove', move);
            resizer.removeEventListener('pointerup', end);
            resizer.removeEventListener('pointercancel', end);
            apply(true);
        };
        resizer.addEventListener('pointermove', move);
        resizer.addEventListener('pointerup', end);
        resizer.addEventListener('pointercancel', end);
    });

    resizer.addEventListener('dblclick', () => setShrink(0));

    resizer.addEventListener('keydown', event => {
        const actions = {
            ArrowUp: () => setShrink(shrink + KEY_STEP),
            ArrowDown: () => setShrink(shrink - KEY_STEP),
            Home: () => setShrink(Infinity),
            End: () => setShrink(0)
        };
        if(!actions[event.key]) return;
        event.preventDefault();
        actions[event.key]();
    });

    window.addEventListener('resize', () => apply());
    new MutationObserver(() => apply()).observe(grid, { childList: true });
    new MutationObserver(() => apply()).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'lang', 'dir'] });
    apply();
})();
