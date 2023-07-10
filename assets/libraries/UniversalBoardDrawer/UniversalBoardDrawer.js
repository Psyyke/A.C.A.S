/* UniversalBoardDrawer.js
 - Version: 1.3.2
 - Author: Haka
 - Description: A userscript library for seamlessly adding chess move arrows to game boards on popular platforms like Chess.com and Lichess.org
 - GitHub: https://github.com/Hakorr/UniversalBoardDrawer
*/

class UniversalBoardDrawer {
    constructor(boardElem, config) {
        this.boardElem = boardElem;

        this.window = config?.window || window;
        this.document = this.window?.document;
        this.parentElem = config?.parentElem || this.document.body;

        this.boardDimensions = {
            'width': config?.boardDimensions?.[0] || 8,
            'height': config?.boardDimensions?.[1] || 8
        };

        this.adjustSizeByDimensions = config?.adjustSizeByDimensions || false;
        this.adjustSizeConfig = config?.adjustSizeConfig;
        this.orientation = config?.orientation || 'w';
        this.zIndex = config?.zIndex || 1000; // container z-index
        this.usePrepend = config?.prepend || false;
        this.debugMode = config?.debugMode || false;

        this.boardContainerElem = null;
        this.singleSquareSize = null;
        this.lastInputPositionStr = null;
        this.lastInputPosition = null;

        this.addedShapes = [];
        this.squareSvgCoordinates = [];
        this.observers = [];
        this.customActivityListeners = [];

        this.defaultFillColor = 'mediumseagreen';
        this.defaultOpacity = 0.8;

        this.updateInterval = 100;

        this.isInputDown = false;
        this.terminated = false;

        if(!this.document) {
            if(this.debugMode) console.error(`Inputted document element doesn't exist!`);

            return;
        }

        if(!this.boardElem) {
            if(this.debugMode) console.error(`Inputted board element doesn't exist!`);

            return;
        }

        if(typeof this.boardDimensions != 'object') {
            if(this.debugMode) console.error(`Invalid board dimensions value, please use array! (e.g. [8, 8])`);

            return;
        }

        this.createOverlaySVG();

        const handleMouseMove = e => {
            if (this.terminated) {
                this.document.removeEventListener('mousemove', handleMouseMove);
                return;
            }
            this.handleMouseEvent.bind(this)(e);
        };

        const handleTouchStart = e => {
            if (this.terminated) {
                this.document.removeEventListener('touchstart', handleTouchStart);
                return;
            }
            this.handleMouseEvent.bind(this)(e);
        };

        const handleMouseDown = () => {
            if (this.terminated) {
                this.document.removeEventListener('mousedown', handleMouseDown);
                return;
            }
            this.isInputDown = true;
        };

        const handleMouseUp = () => {
            if (this.terminated) {
                this.document.removeEventListener('mouseup', handleMouseUp);
                return;
            }

            this.isInputDown = false;
        };

        this.document.addEventListener('mousemove', handleMouseMove);
        this.document.addEventListener('touchstart', handleTouchStart);
        this.document.addEventListener('mousedown', handleMouseDown);
        this.document.addEventListener('mouseup', handleMouseUp);
    }

    setOrientation(orientation) {
        this.orientation = orientation;

        this.updateDimensions();
    }

    setBoardDimensions(dimensionArr) {
        const [width, height] = dimensionArr || [8, 8];

        this.boardDimensions = { width, height };

        this.updateDimensions();
    }

    setAdjustSizeByDimensions(boolean) {
        this.adjustSizeByDimensions = boolean;

        this.updateDimensions();
    }

    createArrowBetweenPositions(from, to, config) {
        const fromCoordinateObj = this.squareSvgCoordinates.find(x => this.coordinateToFen(x.coordinates) == from);
        const toCoordinateObj = this.squareSvgCoordinates.find(x => this.coordinateToFen(x.coordinates) == to);

        if(!fromCoordinateObj || !toCoordinateObj) {
            if(this.debugMode) console.error('Coordinates', from, to, 'do not exist. Possibly out of bounds?');

            return;
        }

        const [fromX, fromY] = fromCoordinateObj?.positions;
        const [toX, toY] = toCoordinateObj?.positions;

        const distance = Math.sqrt(Math.pow(fromX - toX, 2) + Math.pow(fromY - toY, 2));
        const angle = Math.atan2(fromY - toY, fromX - toX);

        const scale = this.singleSquareSize / 100;

        const lineWidth = (config?.lineWidth || 15) * scale;
        const arrowheadWidth = (config?.arrowheadWidth || 55) * scale;
        const arrowheadHeight = (config?.arrowheadHeight || 45) * scale;
        const startOffset = (config?.startOffset || 20) * scale;

        const arrowElem = this.document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            arrowElem.setAttribute('transform', `rotate(${angle * (180 / Math.PI) - 90} ${fromX} ${fromY})`);

        const arrowPoints = [
            { x: fromX - lineWidth / 2, y: fromY - startOffset },
            { x: fromX - lineWidth / 2, y: fromY - distance + arrowheadHeight },
            { x: fromX - arrowheadWidth / 2, y: fromY - distance + arrowheadHeight },
            { x: fromX, y: fromY - distance },
            { x: fromX + arrowheadWidth / 2, y: fromY - distance + arrowheadHeight },
            { x: fromX + lineWidth / 2, y: fromY - distance + arrowheadHeight },
            { x: fromX + lineWidth / 2, y: fromY - startOffset }
        ];

        const pointsString = arrowPoints.map(point => `${point.x},${point.y}`).join(' ');
            arrowElem.setAttribute('points', pointsString);
            arrowElem.style.fill = this.defaultFillColor;
            arrowElem.style.opacity = this.defaultOpacity;

        const style = config?.style;

        if(style) arrowElem.setAttribute('style', style);

        return arrowElem;
    }

    createDotOnSVG(x, y) {
        const dot = this.document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', x);
            dot.setAttribute('cy', y);
            dot.setAttribute('r', '1');
            dot.setAttribute('fill', 'black');

        this.addedShapes.push({ type: 'debugDot', 'element': dot });

        this.boardContainerElem.appendChild(dot);
    }

    removeAllExistingShapes() {
        this.addedShapes
            .forEach(shapeObj => {
                shapeObj.element?.remove();
            });
    }

    removeAllDebugDots() {
        this.addedShapes
            .filter(shapeObj => shapeObj.type == 'debugDot')
            .forEach(debugDotObj => {
                debugDotObj.element?.remove();
            });
    }

    updateShapes() {
        if(this.debugMode) {
            this.removeAllDebugDots();

            this.squareSvgCoordinates.forEach(x => this.createDotOnSVG(...x.positions));
        }

        this.addedShapes
            .filter(shapeObj => shapeObj.type != 'debugDot')
            .forEach(shapeObj => {
                const newShapeElem = this.createArrowBetweenPositions(...shapeObj.positions, shapeObj.config);

                this.transferAttributes(newShapeElem, shapeObj.element);
            });
    }

    coordinateToFen(coordinates) {
        let [x, y] = coordinates;

        x = this.orientation == 'w' ? x : this.boardDimensions.width - x + 1;
        y = this.orientation == 'b' ? y : this.boardDimensions.height - y + 1;

        const getCharacter = num => String.fromCharCode(96 + num);

        const file = getCharacter(x);
        const rank = y;

        return file + rank;
    }

    updateCoords() {
        this.squareSvgCoordinates = []; // reset coordinate array

        // calculate every square center point coordinates relative to the svg
        for(let y = 0; this.boardDimensions.height > y; y++) {
            for(let x = 0; this.boardDimensions.width > x; x++) {
                this.squareSvgCoordinates.push({
                    coordinates: [x + 1, y + 1],
                    positions: [this.squareWidth / 2 + (this.squareWidth * x),
                                this.squareHeight / 2 + (this.squareHeight * y)]
                });
            }
        }
    }

    transferAttributes(fromElem, toElem) {
        if(fromElem && fromElem?.attributes && toElem) {
            [...fromElem.attributes].forEach(attr =>
                toElem.setAttribute(attr.name, attr.value));
        }
    }

    createShape(type, positions, config) {
        if(this.terminated) {
            if(this.debugMode) console.warn('Failed to create shape! Tried to create shape after termination!');

            return false;
        }

        if(!this.boardContainerElem) {
            if(this.debugMode) console.warn(`Failed to create shape! Board SVG doesn't exist yet! (createOverlaySVG() failed?)`);

            return false;
        }

        switch(type) {
            case 'arrow':
                const element = this.createArrowBetweenPositions(...positions, config);

                if(element) {
                    this.addedShapes.push({ type, positions, config, element });

                    if(this.usePrepend) {
                        this.boardContainerElem.prepend(element);
                    } else {
                        this.boardContainerElem.appendChild(element);
                    }

                    return element;
                }

                break;
        }

        return null;
    }

    updateDimensions() {
        const boardRect = this.boardElem.getBoundingClientRect(),
              bodyRect = this.document.body.getBoundingClientRect(); // https://stackoverflow.com/a/62106310

        let boardWidth = boardRect.width,
            boardHeight = boardRect.height;

        let boardPositionTop = boardRect.top - bodyRect.top,
            boardPositionLeft = boardRect.left - bodyRect.left;

        if(this.adjustSizeByDimensions) {

            if(this.boardDimensions.width > this.boardDimensions.height) {
                const multiplier = this.boardDimensions.height / this.boardDimensions.width,
                      newHeight = boardWidth * multiplier;

                if(boardHeight !== newHeight) {
                    if(!this.adjustSizeConfig?.noTopAdjustment)
                        boardPositionTop += (boardHeight - newHeight) / 2;

                    boardHeight = newHeight;
                }
            }
            else {
                const multiplier = this.boardDimensions.width / this.boardDimensions.height,
                      newWidth = boardWidth * multiplier;

                if(boardWidth !== newWidth) {
                    if(!this.adjustSizeConfig?.noLeftAdjustment)
                        boardPositionLeft += (boardWidth - newWidth) / 2;

                    boardWidth = newWidth;
                }
            }

        }

        this.boardContainerElem.style.width = boardWidth + 'px';
        this.boardContainerElem.style.height = boardHeight + 'px';
        this.boardContainerElem.style.left = boardPositionLeft + 'px';
        this.boardContainerElem.style.top = boardPositionTop + 'px';

        const squareWidth = boardWidth / this.boardDimensions.width;
        const squareHeight = boardHeight / this.boardDimensions.height;

        this.singleSquareSize = squareWidth;
        this.squareWidth = squareWidth;
        this.squareHeight = squareHeight;

        this.updateCoords();
        this.updateShapes();
    }

    createOverlaySVG() {
        const svg = this.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.style.position = 'absolute';
            svg.style.pointerEvents = 'none';
            svg.style['z-index'] = this.zIndex;

        this.boardContainerElem = svg;

        this.updateDimensions();

        this.parentElem.appendChild(this.boardContainerElem);

        const rObs = new ResizeObserver(this.updateDimensions.bind(this));
            rObs.observe(this.boardElem);
            rObs.observe(this.document.body);

        this.observers.push(rObs);

        let oldBoardRect = JSON.stringify(this.boardElem.getBoundingClientRect());

        const additionalCheckLoop = setInterval(() => {
            if(this.terminated) {
                clearInterval(additionalCheckLoop);

                return;
            }

            const boardRect = JSON.stringify(this.boardElem.getBoundingClientRect());

            if(boardRect !== oldBoardRect) {
                oldBoardRect = boardRect;

                this.updateDimensions();
            }
        }, this.updateInterval);
    }

    getCoordinatesFromInputPosition(e) {
        const boardRect = this.boardElem.getBoundingClientRect();

        const { clientX, clientY } = e.touches ? e.touches[0] : e;
        const isOutOfBounds = clientX < boardRect.left || clientX > boardRect.right || clientY < boardRect.top || clientY > boardRect.bottom;

        const relativeX = clientX - boardRect.left;
        const relativeY = clientY - boardRect.top;

        return isOutOfBounds
            ? [null, null]
            : [Math.floor(relativeX / this.squareWidth) + 1, Math.floor(relativeY / this.squareHeight) + 1];
    }

    handleMouseEvent(e) {
        if(this.isInputDown) return;

        const position = this.getCoordinatesFromInputPosition(e),
                positionStr = position?.toString();

        if(positionStr != this.lastInputPositionStr) {
            const enteredSquareListeners = this.customActivityListeners.filter(obj => obj.square == this.coordinateToFen(position));

            enteredSquareListeners.forEach(obj => obj.cb('enter'));

            if(this.lastInputPosition && this.lastInputPosition[0] != null) {
                const leftSquareListeners = this.customActivityListeners.filter(obj => obj.square == this.coordinateToFen(this.lastInputPosition));

                leftSquareListeners.forEach(obj => obj.cb('leave'));
            }

            this.lastInputPositionStr = positionStr;
            this.lastInputPosition = position;
        }
    }

    addSquareListener(square, cb) {
        this.customActivityListeners.push({ square, cb });

        return { remove: () => {
            this.customActivityListeners = this.customActivityListeners.filter(obj => obj.square != square && obj.cb != cb);
        }};
    }

    terminate() {
        this.terminated = true;

        this.observers.forEach(observer => observer.disconnect());

        this.boardContainerElem.remove();
    }
}