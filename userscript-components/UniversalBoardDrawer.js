/* UniversalBoardDrawer.js
 - Version: 1.3.8
 - Author: Haka
 - Description: A userscript library for seamlessly adding chess move arrows to game boards on popular platforms like Chess.com and Lichess.org
 - GitHub: https://github.com/Hakorr/UniversalBoardDrawer
*/

class UniversalBoardDrawer {
    constructor(boardElem, config) {
        this.boardElem = boardElem;

        this.window = config?.window || window;
        this.document = this.window?.document;
        this.parentElem = config?.parentElem || this.document?.body;

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
        this.onError = config?.onError;
        this.lastError = null;
        this.ignoreBodyRectLeft = config?.ignoreBodyRectLeft || false;

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
            this.reportError('Board drawer document is unavailable.');

            return;
        }

        if(!this.boardElem) {
            this.reportError('Board drawer board element is unavailable.');

            return;
        }

        if(!Number.isInteger(this.boardDimensions.width) || !Number.isInteger(this.boardDimensions.height)
            || this.boardDimensions.width <= 0 || this.boardDimensions.height <= 0) {
            this.reportError('Board drawer dimensions are invalid.');

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

    reportError(message, cause) {
        this.lastError = new Error(message, cause ? { cause } : undefined);
        if(typeof this.onError === 'function') this.onError(this.lastError);
        return false;
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
            this.reportError('Board drawer arrow coordinates are unavailable.');

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

        const existingArrowElem = config?.existingElem;

        const arrowElem = typeof existingArrowElem === 'object'
          ? existingArrowElem
          : this.document.createElementNS('http://www.w3.org/2000/svg', 'polygon');

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

    createTextOnSquare(square, config) {
        const squareCoordinateObj = this.squareSvgCoordinates.find(x => this.coordinateToFen(x.coordinates) == square);

        if(!squareCoordinateObj) {
            this.reportError('Board drawer text coordinate is unavailable.');

            return;
        }

        const defaultFontSize = 20;
        const sizeMultiplier = config?.size || 1;
        const scale = this.singleSquareSize / 100;
        const fontSize = defaultFontSize * sizeMultiplier * scale;

        const textElem = this.document.createElementNS('http://www.w3.org/2000/svg', 'text');
              textElem.textContent = config?.text || '💧';

        textElem.style.fontSize = `${fontSize}px`;

        const style = config?.style;

        if(style) {
            const existingStyle = textElem.getAttribute('style') || '';

            textElem.setAttribute('style', `${existingStyle} ${style}`);
        }

        return textElem;
    }

    createRectOnSquare(square, config) {
        const squareCoordinateObj = this.squareSvgCoordinates.find(
            x => this.coordinateToFen(x.coordinates) == square
        );

        if (!squareCoordinateObj) {
            this.reportError('Board drawer rectangle coordinate is unavailable.');
            return;
        }

        const [squareCenterX, squareCenterY] = squareCoordinateObj?.positions;

        const rectElem = this.document.createElementNS('http://www.w3.org/2000/svg', 'rect');

        rectElem.setAttribute('x', squareCenterX - this.singleSquareSize / 2);
        rectElem.setAttribute('y', squareCenterY - this.singleSquareSize / 2);
        rectElem.setAttribute('width', this.singleSquareSize);
        rectElem.setAttribute('height', this.singleSquareSize);

        // Default styles
        rectElem.setAttribute('fill', 'black');
        rectElem.setAttribute('opacity', '0.5');

        // Apply custom styles if provided
        const style = config?.style;
        if (style) {
            const existingStyle = rectElem.getAttribute('style') || '';
            rectElem.setAttribute('style', `${existingStyle} ${style}`);
        }

        return rectElem;
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
        this.addedShapes = [];
    }

    removeAllDebugDots() {
        this.addedShapes
            .filter(shapeObj => shapeObj.type == 'debugDot')
            .forEach(debugDotObj => {
                debugDotObj.element?.remove();
            });
        this.addedShapes = this.addedShapes.filter(shapeObj => shapeObj.type !== 'debugDot');
    }

    setTextPosition(square, originalElement, config, newElement = originalElement) {
        const squareCoordinateObj = this.squareSvgCoordinates.find(x => this.coordinateToFen(x.coordinates) == square);
        if(!squareCoordinateObj || !originalElement || !newElement)
            return this.reportError('Board drawer cannot position unavailable text.');
        let textBounds;
        try { textBounds = originalElement.getBBox(); }
        catch(error) {
            return this.reportError('Board drawer cannot measure text.', error);
        }

        const squareCenterPos = squareCoordinateObj.positions;
        let [correctionX, correctionY] = config?.position || [0, 0];

        correctionX = this.singleSquareSize * correctionX / 2;
        correctionY = this.singleSquareSize * -correctionY / 2;

        const x = (squareCenterPos[0] - (textBounds?.width / 2) + correctionX);
        const y = (squareCenterPos[1] + (textBounds?.height / 4) + correctionY);

        newElement.setAttribute('x', x);
        newElement.setAttribute('y', y);
    }

    updateShapes() {
        this.addedShapes = this.addedShapes.filter(shape => shape.element?.parentNode === this.boardContainerElem);
        if(this.debugMode) {
            this.removeAllDebugDots();

            this.squareSvgCoordinates.forEach(x => this.createDotOnSVG(...x.positions));
        }

        this.addedShapes
            .filter(shapeObj => shapeObj.type != 'debugDot')
            .forEach(shapeObj => {
                switch(shapeObj.type) {
                    case 'text':
                        // shapeObj.positions is a string, just one square fen
                        const newTextElement = this.createTextOnSquare(shapeObj.positions, shapeObj.config);
                        const originalTextElement = shapeObj.element;

                        if(!newTextElement) break;
                        this.setTextPosition(shapeObj.positions, originalTextElement, shapeObj.config, newTextElement);

                        this.transferAttributes(newTextElement, shapeObj.element);

                        break;

                    case 'rectangle':
                        // shapeObj.positions is a string, just one square fen
                        const newRectElem = this.createRectOnSquare(shapeObj.positions, shapeObj.config);

                        this.transferAttributes(newRectElem, shapeObj.element);

                        break;

                    default:
                        const newArrowElem = this.createArrowBetweenPositions(...shapeObj.positions, shapeObj.config);

                        this.transferAttributes(newArrowElem, shapeObj.element);

                        break;
                }
            });
    }

    createShape(type, positions, config) {
        let square;

        if(this.terminated) {
            return this.reportError('Board drawer is terminated.');
        }

        if(!this.boardContainerElem) {
            return this.reportError('Board drawer overlay is unavailable.');
        }
        if(!['text', 'rectangle', 'arrow'].includes(type))
            return this.reportError('Board drawer shape type is unsupported.');
        if(type === 'arrow' && (!Array.isArray(positions) || positions.length !== 2 || positions.some(square => typeof square !== 'string')))
            return this.reportError('Board drawer arrow needs two squares.');
        if(type !== 'arrow' && typeof positions !== 'string')
            return this.reportError('Board drawer shape needs a square.');

        if(typeof positions === 'string') {
            square = positions;
        }

        switch(type) {
            case 'text':
                  const textElement = this.createTextOnSquare(square, config);

                  if(textElement) {
                      this.addedShapes.push({ type, positions, config, 'element': textElement });

                      this.boardContainerElem.appendChild(textElement);

                      this.setTextPosition(square, textElement, config);

                      return textElement;
                  }

                  break;

            case 'rectangle':
                  const rectElement = this.createRectOnSquare(square, config);

                  if(rectElement) {
                      this.addedShapes.push({ type, positions, config, 'element': rectElement });

                      if(this.usePrepend) {
                          this.boardContainerElem.prepend(rectElement);
                      } else {
                          this.boardContainerElem.insertBefore(rectElement, this.boardContainerElem.querySelector('text'));
                      }

                      return rectElement;
                  }

                  break;

            default:
                  const arrowElement = this.createArrowBetweenPositions(...positions, config);

                  if(arrowElement) {
                      this.addedShapes.push({ 'type': 'arrow', positions, config, 'element': arrowElement });

                      if(this.usePrepend) {
                          this.boardContainerElem.prepend(arrowElement);
                      } else {
                          this.boardContainerElem.insertBefore(arrowElement, this.boardContainerElem.querySelector('text'));
                      }

                      return arrowElement;
                  }

                  break;
        }

        return null;
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

    updateDimensions() {
        if(this.terminated || !this.boardContainerElem || !this.boardElem || !this.document?.body) return;
        const boardRect = this.boardElem.getBoundingClientRect(),
              bodyRect = this.document.body.getBoundingClientRect(); // https://stackoverflow.com/a/62106310

        let boardWidth = boardRect.width,
            boardHeight = boardRect.height;

        if(![boardRect.width, boardRect.height, boardRect.top, boardRect.left, bodyRect.left].every(Number.isFinite)
            || !Number.isFinite(this.boardDimensions.width) || !Number.isFinite(this.boardDimensions.height)
            || this.boardDimensions.width <= 0 || this.boardDimensions.height <= 0)
            return this.reportError('Board drawer geometry is invalid.');
        if(boardWidth <= 0 || boardHeight <= 0) return;
        let boardPositionTop = boardRect.top + (this.window?.scrollY || 0),
              boardPositionLeft = boardRect.left - (this.ignoreBodyRectLeft ? 0 : bodyRect.left);

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

        const Observer = this.window.ResizeObserver;
        if(Observer) {
            const rObs = new Observer(this.updateDimensions.bind(this));
            rObs.observe(this.boardElem);
            rObs.observe(this.document.body);
            this.observers.push(rObs);
        }

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

        this.boardContainerElem?.remove();
        this.addedShapes = [];
    }

    async demo() {
        const { width: boardWidth, height: boardHeight } = this.boardDimensions;
        const totalSteps = boardWidth + boardHeight;
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

        let createdElements = [];

        const createArrow = (x, y, opacity) => {
            const arrowStart = this.coordinateToFen([x - 1, y - 1]);
            const square = this.coordinateToFen([x, y]);
            return BoardDrawer.createShape('arrow', [arrowStart, square], {
                lineWidth: 10 + opacity * 25,
                arrowheadWidth: 30 + opacity * 45,
                arrowheadHeight: 30 + opacity * 15,
                startOffset: 25,
                style: `fill: pink; opacity: ${opacity};`
            });
        };

        const createText = (square, opacity, size, x, y) => {
            return [
                BoardDrawer.createShape('text', square, {
                    size,
                    text: '♥️',
                    style: `opacity: ${opacity};`,
                    position: [0, 0]
                }),
                BoardDrawer.createShape('text', square, {
                    size: size / 2,
                    text: `(${x},${y})`,
                    style: `opacity: ${opacity / 2};`,
                    position: [0, 0.8]
                })
            ];
        };

        for (let sum = 0; sum <= totalSteps; sum++) {
            const step = sum / totalSteps;
            const opacity = Math.min(step.toFixed(2), 1);
            const size = Math.max((5 - step * 4).toFixed(2), 1);

            for (let x = 0; x <= sum; x++) {
                const y = sum - x;
                if (x > boardWidth || y > boardHeight) continue;

                const square = this.coordinateToFen([x, y]);
                const rectStyle = `fill: white; opacity: ${opacity}; stroke-width: ${opacity * 2}; stroke: rgb(204,51,102,${opacity});`;

                createdElements.push(BoardDrawer.createShape('rectangle', square, { style: rectStyle }));

                if (x > 0 && y > 0) {
                    createdElements.push(createArrow(x, y, opacity));
                }

                createdElements.push(...createText(square, opacity, size, x, y));

                await delay(50);
            }
        }

        await delay(1000);

        createdElements = createdElements
            .filter(x => x)
            .reverse();

        for(let element of createdElements) {
            element?.remove();
            await delay(5);
        }

        this.removeAllExistingShapes();
    }
}