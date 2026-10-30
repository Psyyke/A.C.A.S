export async function captureBoardLayers(instanceId, outputSize, boardElement = null, profile = null) {
    const boards = [...document.querySelectorAll('.chessground-x')];
    const cgElem = boardElement || (instanceId
        ? boards.find(elem => elem.parentElement?.parentElement?.dataset?.instanceId === String(instanceId))
        : boards[0]);

    if(!cgElem) return { boardCanvas: null, overlayCanvas: null };

    const rect = cgElem.getBoundingClientRect();
    const instance = window.AcasInstances?.find(entry => String(entry.id) === String(instanceId))?.instance;
    if(!boardElement) instance?.chessground?.redrawAll();

    const captureOptions = { fast: true };
    if(outputSize && rect.width > 0) {
        captureOptions.scale = outputSize / rect.width;
        captureOptions.dpr = 1;
    }

    const boardCanvas = await snapdom.toCanvas(cgElem, captureOptions);
    if(boardElement) return { boardCanvas, overlayCanvas: null };

    const boardDrawerSvg = document.querySelector(
        `#board-drawings svg${instanceId ? `[data-instance-id="${instanceId}"]` : ''}`
    );
    if(!boardDrawerSvg) return { boardCanvas, overlayCanvas: null };

    const svg = boardDrawerSvg.cloneNode(true);
    svg.style.position = 'unset';

    if(profile !== null) {
        svg.querySelectorAll('[data-profile-id]').forEach(shape => {
            if(shape.dataset.profileId !== profile) shape.remove();
        });

        // A live profile may be hidden on the GUI's historical learning board.
        // Draw its own cached hints without changing the GUI or other profiles.
        if(instance?.learningMode && !instance.isLearningProfile(profile) && instance.BoardDrawer) {
            const drawer = Object.create(instance.BoardDrawer);
            for(const shape of instance.pV[profile]?.pipMoveShapes || []) {
                if(shape.isOpponent && !shape.pipAlwaysVisible) continue;
                const positions = shape.shapeSquare;
                const config = shape.shapeConfig;
                const element = shape.shapeType === 'text' ? drawer.createTextOnSquare(positions, config)
                    : shape.shapeType === 'rectangle' ? drawer.createRectOnSquare(positions, config)
                        : drawer.createArrowBetweenPositions(...positions, config);
                if(!element) continue;
                svg.appendChild(element);
                if(shape.shapeType === 'text') drawer.setTextPosition(positions, element, config);
            }
        }
    }

    const container = document.createElement('div');
    container.appendChild(svg);
    container.style.cssText = `position:absolute; left:-9999px; top:0; width:${rect.width}px; height:${rect.height}px;`;
    document.body.appendChild(container);

    try {
        const overlayCanvas = await snapdom.toCanvas(container, captureOptions);
        return { boardCanvas, overlayCanvas };
    } finally {
        container.remove();
    }
}

export async function captureBoardImage(instanceId) {
    const { boardCanvas, overlayCanvas } = await captureBoardLayers(instanceId);
    if(!boardCanvas) return null;

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = boardCanvas.width;
    outputCanvas.height = boardCanvas.height;
    const context = outputCanvas.getContext('2d');
    context.drawImage(boardCanvas, 0, 0);
    if(overlayCanvas) context.drawImage(overlayCanvas, 0, 0);
    return outputCanvas.toDataURL('image/png');
}