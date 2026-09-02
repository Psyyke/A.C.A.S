import { updatePipData } from '../gui/pip.js';

function computeArrowScale(index, total) {
    if(total === 2) return 0.75;

    const maxScale = 1, minScale = 0.5;
    return maxScale - minScale * (index / ((total - 1) || 1));
}

function getArrowStyle(type, fill, opacity) {
    const getBaseStyleModification = (f, o) => [
        'stroke: rgb(0 0 0 / 50%);',
        'stroke-width: 0.5%;',
        'stroke-linejoin: round;',
        `fill: ${fill ?? f};`,
        `opacity: ${opacity ?? o};`
    ].join('\n');

    switch(type) {
        case 'best':
            return getBaseStyleModification('limegreen', 0.9);
        case 'secondary':
            return getBaseStyleModification('dodgerblue', 0.7);
        case 'opponent':
            return getBaseStyleModification('crimson', 0.3);
        case 'book':
            return getBaseStyleModification('#00d4ff', 0.75);
        case 'future':
            return [
                'stroke: rgb(0 0 0 / 40%);',
                'stroke-width: 0.3%;',
                'stroke-linejoin: round;',
                'stroke-dasharray: 2;',
                'fill: rgb(255 255 255 / 20%);',
                `opacity: ${opacity};`
            ].join('\n');
    }
}

export default class Interface {
    constructor(instance) {
        this.AcasInstance = instance;
    }

    getBookMoveVisualSettings(move, index, movesForProfile, color, opacity) {
        if(!move?.from || !move?.to) return null;

        const scale = computeArrowScale(index, movesForProfile.length);

        return {
            shapeType: 'arrow',
            shapeSquare: [move.from, move.to],
            shapeConfig: {
                style: getArrowStyle('book', color, opacity),
                lineWidth: 30 * scale,
                arrowheadWidth: 80 * scale,
                arrowheadHeight: 60 * scale,
                startOffset: 30
            }
        };
    }

    buildBookMoveShape(move, index, movesForProfile, profileName, color, opacity) {
        const visual = this.getBookMoveVisualSettings(move, index, movesForProfile, color, opacity);

        if(!visual) return null;

        const { shapeType, shapeSquare, shapeConfig } = visual;
        const elem = this.AcasInstance.BoardDrawer.createShape(shapeType, shapeSquare, shapeConfig);

        return CREATE_BOARD_DRAWER_MOVE_OBJ(elem, {
            ...move,
            shapeType,
            shapeSquare,
            shapeConfig
        }, profileName, 'book');
    }

    getMoveVisualSettings(move, index, totalRanks, options = {}) {
        if(!move?.player?.[0] || !move?.player?.[1]) return null;

        const { arrowOpacity, primaryArrowColorHex, secondaryArrowColorHex } = options;

        const isFuture = !!move.isFuture;
        const fillColor = index === 0 ? primaryArrowColorHex : secondaryArrowColorHex;
        const scale = isFuture ? 1 : computeArrowScale(index, totalRanks);

        return {
            shapeType: 'arrow',
            shapeSquare: [move.player[0], move.player[1]],
            shapeConfig: {
                style: getArrowStyle(isFuture ? 'future' : 'best', fillColor, arrowOpacity),
                lineWidth: 30 * scale,
                arrowheadWidth: 80 * scale,
                arrowheadHeight: 60 * scale,
                startOffset: 30
            }
        };
    }

    getMoveShapes(mObj, idx, ctx) {
        const {
            totalRanks, arrowOpacity, primaryArrowColorHex, secondaryArrowColorHex,
            opponentArrowColorHex, onlySuggestPieces, movesOnDemand, moveAsFilledSquares,
            showOpponentMoveGuess, showOpponentMoveGuessConstantly, markedSquares
        } = ctx;

        const [from, to] = mObj.player, [oppFrom, oppTo] = mObj.opponent;
        const oppMovesExist = oppFrom && oppTo;
        const fillType = idx === 0 ? 1 : 0;
        const fillColor = fillType ? primaryArrowColorHex : secondaryArrowColorHex;

        if(onlySuggestPieces && !movesOnDemand) {
            const shapes = [{
                shapeType: 'rectangle',
                shapeSquare: from,
                shapeConfig: { style: `opacity: ${arrowOpacity}; stroke-width:0.5%; stroke:black; rx:2; ry:2; fill:${fillColor};` }
            }];

            if(oppFrom) {
                const hoverIfNeeded = !showOpponentMoveGuessConstantly ? ' display:none;' : '';

                shapes.push({
                    shapeType: 'rectangle',
                    shapeSquare: oppFrom,
                    shapeConfig: { style: `opacity:${arrowOpacity}; stroke-width:0.5%; stroke:black; rx:2; ry:2;${hoverIfNeeded} fill:${opponentArrowColorHex};` },
                    isOpponent: true,
                    forceHoverOnly: !showOpponentMoveGuessConstantly
                });
            }

            return shapes;
        }

        if(moveAsFilledSquares) {
            const styleBase = `opacity:${arrowOpacity}; stroke-width:0.5%; stroke:black; rx:2; ry:2; fill:${fillColor};`;
            const fromStyle = styleBase + (markedSquares[fillType].includes(from) ? 'opacity:0;' : '');
            const toStyle = `filter:brightness(1.5); stroke-dasharray:4 4; ${styleBase}` + (markedSquares[fillType].includes(to) ? 'opacity:0;' : '');

            markedSquares[fillType].push(from, to);

            const shapes = [
                { shapeType: 'rectangle', shapeSquare: from, shapeConfig: { style: fromStyle } },
                { shapeType: 'rectangle', shapeSquare: to, shapeConfig: { style: toStyle } }
            ];

            if(oppMovesExist && showOpponentMoveGuess) {
                const hoverIfNeeded = !showOpponentMoveGuessConstantly ? ' display:none;' : '';
                shapes.push(
                    { shapeType: 'rectangle', shapeSquare: oppFrom, isOpponent: true, shapeConfig: { style: fromStyle + ` fill:${opponentArrowColorHex};${hoverIfNeeded}` }, forceHoverOnly: !showOpponentMoveGuessConstantly },
                    { shapeType: 'rectangle', shapeSquare: oppTo, isOpponent: true, shapeConfig: { style: toStyle + ` fill:${opponentArrowColorHex};${hoverIfNeeded}` }, forceHoverOnly: !showOpponentMoveGuessConstantly }
                );
            }

            return shapes;
        }

        // Arrow mode (the default)
        const visual = this.getMoveVisualSettings(mObj, idx, totalRanks, { arrowOpacity, primaryArrowColorHex, secondaryArrowColorHex });

        if(!visual) return [];

        const shapes = [{ ...visual, bringToFront: idx === 0 }];

        if(oppMovesExist && showOpponentMoveGuess) {
            const opponentStyle = getArrowStyle('opponent', opponentArrowColorHex, arrowOpacity);
            const defaultStyle = showOpponentMoveGuessConstantly ? opponentStyle : `${opponentStyle}; display:none;`;

            shapes.push({
                shapeType: 'arrow',
                shapeSquare: [oppFrom, oppTo],
                shapeConfig: { ...visual.shapeConfig, style: defaultStyle },
                isOpponent: true,
                forceHoverOnly: !showOpponentMoveGuessConstantly
            });
        }

        return shapes;
    }

    buildMoveSiteEntries(move, shapes, profileName) {
        return shapes.map((shape) =>
            CREATE_BOARD_DRAWER_MOVE_OBJ(null, { ...move, ...shape }, profileName, 'move')
        );
    }

    async displayBookMoves(bookMoves, profile) {
        const profileNames = profile
            ? [profile]
            : [...new Set(bookMoves?.map(move => move?.profile).filter(Boolean) || [])];

        if(!profileNames.length) return;

        for(const profileName of profileNames) {
            this.removeBookMarkings(profileName);

            const movesForProfile = (bookMoves || []).filter(move => move?.profile === profileName);
            const { BoardDrawer, configKeys } = this.AcasInstance;

            const color = await this.AcasInstance.getConfigValue(
                configKeys.bookMoveColorHex,
                profileName
            );

            const opacity = (
                await this.AcasInstance.getConfigValue(
                    configKeys.bookMoveOpacity,
                    profileName
                )
            ) / 100;

            const displayMovesExternally = await this.AcasInstance.getConfigValue(
                configKeys.displayMovesOnExternalSite,
                profileName
            );

            const bookMoveShapes = movesForProfile
                .map((move, index) => this.buildBookMoveShape(move, index, movesForProfile, profileName, color, opacity))
                .filter(Boolean);

            this.AcasInstance.pV[profileName].bookMoveMarkings = bookMoveShapes.map(x => x.elem).filter(Boolean);

            if(displayMovesExternally) {
                this.AcasInstance.CommLink.commands.renderVisualsToSite(FORMAT_MOVE_OBJ_TO_EXTERNAL_SITE(bookMoveShapes));
            }
        }
    }

    removeBookMarkings(profile) {
        const profileNames = profile
            ? [profile]
            : Object.keys(this.AcasInstance.pV || {});

        profileNames.forEach(profileName => {
            const profileMarks = this.AcasInstance.pV?.[profileName]?.bookMoveMarkings || [];

            profileMarks.forEach(mark => mark?.remove());

            if(this.AcasInstance.pV?.[profileName]) {
                this.AcasInstance.pV[profileName].bookMoveMarkings = [];
            }
        });
    }

    async markMoves(moveObjArr, profile) {
        this.removeMarkings(profile, 'Make room for new move markings');

        const totalRanks = moveObjArr.length;
        const BoardDrawer = this.AcasInstance.BoardDrawer;
        const cfgKeys = this.AcasInstance.configKeys;

        const [
            arrowOpacity,
            showOpponentMoveGuess,
            showOpponentMoveGuessConstantly,
            primaryArrowColorHex,
            secondaryArrowColorHex,
            opponentArrowColorHex,
            moveAsFilledSquares,
            onlySuggestPieces,
            movesOnDemand,
            displayMovesExternally
        ] = await Promise.all([
            this.AcasInstance.getConfigValue(cfgKeys.arrowOpacity, profile).then(v => v/100),
            this.AcasInstance.getConfigValue(cfgKeys.showOpponentMoveGuess, profile),
            this.AcasInstance.getConfigValue(cfgKeys.showOpponentMoveGuessConstantly, profile),
            this.AcasInstance.getConfigValue(cfgKeys.primaryArrowColorHex, profile),
            this.AcasInstance.getConfigValue(cfgKeys.secondaryArrowColorHex, profile),
            this.AcasInstance.getConfigValue(cfgKeys.opponentArrowColorHex, profile),
            this.AcasInstance.getConfigValue(cfgKeys.moveAsFilledSquares, profile),
            this.AcasInstance.getConfigValue(cfgKeys.onlySuggestPieces, profile),
            this.AcasInstance.getConfigValue(cfgKeys.movesOnDemand, profile),
            this.AcasInstance.getConfigValue(cfgKeys.displayMovesOnExternalSite, profile)
        ]);

        const markedSquares = [[], []]; // [primary, secondary]

        const shapeCtx = {
            totalRanks, arrowOpacity, primaryArrowColorHex, secondaryArrowColorHex,
            opponentArrowColorHex, onlySuggestPieces, movesOnDemand, moveAsFilledSquares,
            showOpponentMoveGuess, showOpponentMoveGuessConstantly, markedSquares
        };

        const squareListeners = [];

        const handleOpponentDisplay = (square, elem) => {
            if(!elem) return;

            const listener = BoardDrawer.addSquareListener(square, type => {
                elem.style.display = type === 'enter' ? 'inherit' : 'none';
            });

            squareListeners.push(listener);
        };

        const revealOpponent = (fromSquare, elem) => {
            if(showOpponentMoveGuessConstantly) {
                elem.style.display = 'block';
            } else {
                elem.style.display = 'none';
                handleOpponentDisplay(fromSquare, elem);
            }
        };

        const siteMoveShapes = [];

        moveObjArr.forEach((mObj, idx) => {
            if((onlySuggestPieces || moveAsFilledSquares) && mObj.isFuture) return;

            const shapes = this.getMoveShapes(mObj, idx, shapeCtx);
            if(!shapes.length) return;

            const [from] = mObj.player;
            const elems = shapes
                .map(shape => BoardDrawer.createShape(shape.shapeType, shape.shapeSquare, shape.shapeConfig))
                .map((elem, i) => {
                    if(!elem) return elem;

                    const shape = shapes[i];
                    if(shape.isOpponent) {
                        if(shape.forceHoverOnly && !showOpponentMoveGuessConstantly) {
                            handleOpponentDisplay(from, elem);
                        } else {
                            revealOpponent(from, elem);
                        }
                    }

                    return elem;
                })
                .filter(Boolean);

            // Arrow mode's primary pick gets re-appended so it renders above
            // any others drawn before it.
            if(shapes[0].bringToFront && elems.length) {
                const parent = elems[0].parentElement;
                elems.forEach(elem => parent.appendChild(elem));
            }

            this.AcasInstance.pV[profile].activeGuiMoveMarkings.push({ otherElems: elems });

            if(displayMovesExternally) {
                siteMoveShapes.push(...this.buildMoveSiteEntries(mObj, shapes, profile));
            }
        });

        if(displayMovesExternally) {
            this.AcasInstance.CommLink.commands.renderVisualsToSite(FORMAT_MOVE_OBJ_TO_EXTERNAL_SITE(siteMoveShapes));
        }

        this.AcasInstance.pV[profile].activeSquareListeners = squareListeners;
        this.AcasInstance.pV[profile].pastMoveObjects = [];
    }

    removeMarkingFromProfile(p) {
        this.AcasInstance.pV[p].activeGuiMoveMarkings
            .forEach(markingObj => {
                markingObj.oppArrowElem?.remove();
                markingObj.playerArrowElem?.remove();
                markingObj?.otherElems?.forEach(x => x?.remove());
            });

        this.AcasInstance.pV[p].activeFutureMoveMarkings
            .forEach(markingObj => {
                markingObj.oppArrowElem?.remove();
                markingObj.playerArrowElem?.remove();
                markingObj?.otherElems?.forEach(x => x?.remove());
            });

        this.AcasInstance.pV[p].activeSquareListeners?.forEach(listener => listener?.remove?.());
        this.AcasInstance.pV[p].activeSquareListeners = [];
        this.AcasInstance.pV[p].activeGuiMoveMarkings = [];
        this.AcasInstance.pV[p].activeFutureMoveMarkings = [];
    }

    removeMarkings(profile, reason) {
        if(this.AcasInstance.debugLogsEnabled) console.warn('[Remove markings] FOR:', reason);

        if(!profile) {
            Object.keys(this.AcasInstance.pV).forEach(profileName => {
                this.removeMarkingFromProfile(profileName);
            });
        } else {
            this.removeMarkingFromProfile(profile);
        }
    }

    async updateBoardFen(calculateMovesConfig) {
        const userscriptGameStateHistory = await GET_STATE_HISTORY(this.AcasInstance.instanceID);
        const currentStateObj = userscriptGameStateHistory[0];
        const fen = currentStateObj?.fen?.full;
        const basicFen = currentStateObj?.fen?.basic;

        if(basicFen && basicFen === this.lastAcceptedBasicFen) return;
        if(basicFen) this.lastAcceptedBasicFen = basicFen

        // The userscript keeps gameStateHistory as [newest, ..., initial], newest index 0.
        // The GUI has it reversed, so [initial, ..., newest], oldest index 0.
        // We update the entire history so that reloading GUI doesn't clear history.
        this.AcasInstance.gameStateHistory = userscriptGameStateHistory
            .slice()
            .reverse();

        const instanceElem = this?.AcasInstance?.instanceElem;
        const instanceFenElem = instanceElem?.querySelector('.instance-fen');
        const instancePgnElem = instanceElem?.querySelector('.instance-pgn');
        const instanceOpeningElem = instanceElem?.querySelector('.instance-opening-container span');

        if(!instanceFenElem || !instancePgnElem || !instanceOpeningElem) {
            console.error('Cannot update fen, could not find the correct elements from the instance document.');
            return;
        }

        this.AcasInstance.engineStopCalculating(false, 'New board FEN, any running calculations are now useless!');
        this.removeMarkings(null, 'New board FEN');
        this.removeBookMarkings();
        updatePipData({ 'moveObjects': null });

        if(fen) {
            this.AcasInstance.currentFen = fen;
            instanceFenElem.innerText = fen;

            if(this.AcasInstance.chessground)
                this.AcasInstance.chessground.set({ fen });
        }

        if(this.AcasInstance.activeVariant === 'chess') {
            const PGN = GET_PGN_FROM_STATE_HISTORY(this.AcasInstance.gameStateHistory);

            if(PGN) {
                const opening = FIND_OPENING_BY_PGN(PGN);

                instancePgnElem.innerText = PGN?.length > 0 ? PGN : '1. (...)';
                if(opening) instanceOpeningElem.innerText = `${opening?.name} (${opening?.eco})` || '';
            }
        } else {
            instancePgnElem.innerText = 'Not the default chess variant, cannot create PGN.';
            instanceOpeningElem.innerText = '';
        }

        // For each profile config
        Object.keys(this.AcasInstance.pV).forEach(profileName => {
            this.AcasInstance.pV[profileName].currentSpeeches.forEach(synthesis => synthesis.cancel());
            this.AcasInstance.pV[profileName].currentSpeeches = [];

            this.AcasInstance.pV[profileName].futureMoves = [];

            this.AcasInstance.getAndDisplayBookMoves(fen, profileName);
            this.AcasInstance.renderMetric(fen, profileName);
        });

        this.AcasInstance.renderFeedback(currentStateObj);
        this.AcasInstance.calculateBestMoves(fen, calculateMovesConfig);

        if(this.AcasInstance.debugLogsEnabled) {
            const origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
            const fens = [this.AcasInstance.currentFen, fen];
            const fensString = fens.map(x => x.split(' ')[0]).join(',');

            console.warn(
                '%c[ NEW FEN RECEIVED! ]', 'color: neon; font-weight: bold; font-size: 50px;'
            );
            console.warn(
                '[Logical Change Detection] New board FEN received:', `${origin}/A.C.A.S/board/?fens=${fensString}&o=${this.AcasInstance.lastOrientation}`,
                { fen, currentStateObj }
            );
        }
    }

    updateBoardOrientation(orientation) {
        if(orientation === this.AcasInstance.lastOrientation) return;

        this.AcasInstance.lastOrientation = orientation;

        Object.keys(this.AcasInstance.pV).forEach(profileName => {
            this.AcasInstance.pV[profileName].lastCalculatedFen = null;
        });

        const orientationWord = orientation === 'b' ? 'black' : 'white';

        const evalBarElem = this.AcasInstance.instanceElem.querySelector('.eval-bar');

        if(orientation === 'b')
            evalBarElem.classList.add('reversed');
        else
            evalBarElem.classList.remove('reversed');

        this.AcasInstance.chessground.toggleOrientation();
        this.AcasInstance.chessground.redrawAll();
        this.AcasInstance.chessground.set({ 'orientation': orientationWord });

        this.AcasInstance.BoardDrawer.setOrientation(orientation);
    }

    updateMoveProgress(text, status) {
        if(!this.AcasInstance.instanceElem) return;

        const infoTextElem = this.AcasInstance.instanceElem.querySelector('.instance-info-text');

        infoTextElem.innerText = text;

        updatePipData({ 'moveProgressText': text });
        updatePipData({ 'isWinning': status });

        const statusArr = ['info-text-winning', 'info-text-losing'];

        if(typeof status === 'number' && status !== 0) {
            infoTextElem.classList.add(statusArr[status === 1 ? 0 : 1]);
            infoTextElem.classList.remove(statusArr[status === 1 ? 1 : 0]);
        } else {
            infoTextElem.classList.remove(statusArr[0]);
            infoTextElem.classList.remove(statusArr[1]);
        }

        infoTextElem.classList.remove('hidden');
    }

    async updateEval(centipawnEval, mate, profile) {
        if(!this.AcasInstance.instanceElem) return;

        centipawnEval = Number(centipawnEval);

        const evalFill = this.AcasInstance.instanceElem.querySelector('.eval-fill');
        const gradualness = 8;
        const playerColor = await this.AcasInstance.getPlayerColor(profile);

        if(this.AcasInstance.lastTurn !== playerColor) return;

        if(playerColor === 'b') {
            centipawnEval = -centipawnEval;
        }

        let advantage = 1 / (1 + 10**(-centipawnEval / 100 / gradualness)); // [-1, 1]

        if(mate)
            advantage = centipawnEval > 0 ? 1 : 0;

        updatePipData({ 'eval': advantage, playerColor, centipawnEval });

        evalFill.style.height = `${advantage * 100}%`;
    }

    displayConnectionIssueWarning() {
        const connectionWarningElem = this.AcasInstance.instanceElem?.querySelector('.connection-warning');

        if(connectionWarningElem) {
            connectionWarningElem.classList.remove('hidden');
        }
    }

    clearOpeningText() {
        const instanceElem = this?.AcasInstance?.instanceElem;
        const instanceOpeningElem = instanceElem?.querySelector('.instance-opening-container span');

        if(instanceOpeningElem) instanceOpeningElem.innerText = '';
    }

    removeConnectionIssueWarning() {
        const connectionWarningElem = this.AcasInstance.instanceElem?.querySelector('.connection-warning');

        if(connectionWarningElem) {
            connectionWarningElem.classList.add('hidden');
        }
    }

    frontLog(str) {
        const message = `[FRONTEND] ${str}`;

        console.log('%c' + message, 'color: dodgerblue');
    }
}