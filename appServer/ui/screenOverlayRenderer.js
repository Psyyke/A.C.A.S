(() => {
    const board = document.getElementById('board');
    const drawer = new UniversalBoardDrawer(board, { prepend: true });
    const shapes = new Map();
    const updateShapes = drawer.updateShapes.bind(drawer);
    drawer.updateShapes = () => {
        updateShapes();
        for(const item of shapes.values()) {
            if(item.element.style.display !== item.display) item.element.style.display = item.display;
        }
    };
    let dimensions = '8,8';
    let orientation = 'w';

    window.screenOverlay.onSnapshot(snapshot => {
        const nextDimensions = snapshot.dimensions.join(',');
        if(dimensions !== nextDimensions) {
            // Existing positions may no longer be valid on the new board.
            for(const item of shapes.values()) item.element.remove();
            shapes.clear();
            drawer.addedShapes = [];
            dimensions = nextDimensions;
            drawer.setBoardDimensions(snapshot.dimensions);
        }
        if(orientation !== snapshot.orientation) {
            orientation = snapshot.orientation;
            drawer.setOrientation(orientation);
        }
        const ids = new Set(snapshot.shapes.map(shape => shape.id));
        for(const [id, item] of shapes) {
            if(!ids.has(id)) {
                item.element.remove();
                shapes.delete(id);
                drawer.addedShapes = drawer.addedShapes.filter(shape => shape.element !== item.element);
            }
        }
        const orderedElements = [];
        for(const shape of snapshot.shapes) {
            const geometry = JSON.stringify([shape.type, shape.positions, shape.config]);
            let item = shapes.get(shape.id);
            if(item && item.geometry !== geometry) {
                item.element.remove();
                drawer.addedShapes = drawer.addedShapes.filter(added => added.element !== item.element);
                shapes.delete(shape.id);
                item = null;
            }
            if(!item) {
                const element = drawer.createShape(shape.type, shape.positions, shape.config);
                if(!element) continue;
                item = { element, geometry, display: shape.display, animationKey: null, animations: [] };
                shapes.set(shape.id, item);
            }
            item.display = shape.display;
            if(item.element.style.display !== shape.display) item.element.style.display = shape.display;
            if(shape.ariaLabel !== undefined) {
                if(item.element.getAttribute('aria-label') !== shape.ariaLabel)
                    item.element.setAttribute('aria-label', shape.ariaLabel);
            } else if(item.element.hasAttribute('aria-label')) item.element.removeAttribute('aria-label');
            let title = item.element.querySelector('title');
            if(shape.title !== undefined) {
                if(!title) {
                    title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                    item.element.appendChild(title);
                }
                if(title.textContent !== shape.title) title.textContent = shape.title;
            } else title?.remove();
            orderedElements.push(item.element);
            const animationKey = JSON.stringify(shape.animations);
            if(item.animationKey !== animationKey) {
                item.animations.forEach(animation => animation.cancel());
                item.animations = shape.animations.map(({ keyframes, options, start }) => {
                    try {
                        const animation = item.element.animate(keyframes, options);
                        animation.currentTime = Date.now() - start;
                        return animation;
                    } catch { return null; }
                }).filter(Boolean);
                item.animationKey = animationKey;
            }
        }
        orderedElements.sort((a, b) => Number(a.localName === 'text') - Number(b.localName === 'text'));
        const children = drawer.boardContainerElem.children;
        if(children.length !== orderedElements.length || orderedElements.some((element, index) => children[index] !== element)) {
            for(const element of orderedElements) drawer.boardContainerElem.appendChild(element);
        }
    });
})();
