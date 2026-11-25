function shapeKey(marking) {
    const { shapeType, shapeSquare, shapeConfig } = marking.data;
    return JSON.stringify([shapeType, shapeSquare, shapeConfig]);
}

export function removeMetricShapes(drawer, markings = []) {
    const elements = new Set(markings.map(marking => marking.elem).filter(Boolean));
    for(const element of elements) element.remove();
    if(drawer?.addedShapes && elements.size)
        drawer.addedShapes = drawer.addedShapes.filter(shape => !elements.has(shape.element));
}

export function reconcileMetricShapes(drawer, previous, next) {
    const registered = new Set((drawer.addedShapes || []).map(shape => shape.element));
    const available = new Map();
    for(const marking of previous) {
        if(!marking.elem || !registered.has(marking.elem)) continue;
        const key = shapeKey(marking);
        if(!available.has(key)) available.set(key, []);
        available.get(key).push(marking);
    }

    let changed = previous.length !== next.length;
    for(let i = 0; i < next.length; i++) {
        const marking = next[i], key = shapeKey(marking);
        const reused = available.get(key)?.shift();
        if(reused) marking.elem = reused.elem;
        else {
            const { shapeType, shapeSquare, shapeConfig } = marking.data;
            marking.elem = drawer.createShape(shapeType, shapeSquare, shapeConfig);
            if(marking.elem) marking.elem.dataset.profileId = marking.data.profileID;
            changed = true;
        }
        if(marking.elem !== previous[i]?.elem) changed = true;
    }

    const removed = [...available.values()].flat();
    if(removed.length) {
        removeMetricShapes(drawer, removed);
        changed = true;
    }
    if(changed && drawer.usePrepend && drawer.boardContainerElem) {
        for(const marking of next) {
            if(marking.elem) drawer.boardContainerElem.prepend(marking.elem);
        }
    }
    return next;
}
