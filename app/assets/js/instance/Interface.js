import { updatePipData } from '../gui/pip.js';

function getArrowStyle(type, fill, opacity) {
    const getBaseStyleModification = (f, o) => [
        'stroke: rgb(0 0 0 / 50%);',
        'stroke-width: 0.5%;',
        'stroke-linejoin: round;',
        `fill: ${fill || f};`,
        `opacity: ${opacity || o};`
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

    async displayBookMoves(bookMoves, profile) {
        const profileNames = profile
            ? [profile]
            : [...new Set(bookMoves?.map(move => move?.profile).filter(Boolean) || [])];

        if(!profileNames.length) return;

        for(const profileName of profileNames) {
            this.removeBookMarkings(profileName);

            const movesForProfile = bookMoves.filter(move => move?.profile === profileName);
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

            const arrowStyle = getArrowStyle('book', color, opacity);

            const arrows = movesForProfile
                .map((move, index) => {
                    if(!move.from || !move.to) return null;

                    const scale =
                        index === 0
                            ? 1
                            : movesForProfile.length === 2
                                ? 0.75
                                : 1 - 0.5 * (index / (movesForProfile.length - 1));

                    return BoardDrawer.createShape('arrow', [move.from, move.to], {
                        style: arrowStyle,
                        lineWidth: 30 * scale,
                        arrowheadWidth: 80 * scale,
                        arrowheadHeight: 60 * scale,
                        startOffset: 30
                    });
                })
                .filter(Boolean);

            this.AcasInstance.pV[profileName].bookMoveMarkings = arrows;
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

        const maxScale = 1, minScale = 0.5, totalRanks = moveObjArr.length;
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
            movesOnDemand
        ] = await Promise.all([
            this.AcasInstance.getConfigValue(cfgKeys.arrowOpacity, profile).then(v => v/100),
            this.AcasInstance.getConfigValue(cfgKeys.showOpponentMoveGuess, profile),
            this.AcasInstance.getConfigValue(cfgKeys.showOpponentMoveGuessConstantly, profile),
            this.AcasInstance.getConfigValue(cfgKeys.primaryArrowColorHex, profile),
            this.AcasInstance.getConfigValue(cfgKeys.secondaryArrowColorHex, profile),
            this.AcasInstance.getConfigValue(cfgKeys.opponentArrowColorHex, profile),
            this.AcasInstance.getConfigValue(cfgKeys.moveAsFilledSquares, profile),
            this.AcasInstance.getConfigValue(cfgKeys.onlySuggestPieces, profile),
            this.AcasInstance.getConfigValue(cfgKeys.movesOnDemand, profile)
        ]);
    
        const markedSquares = [[], []]; // [primary, secondary]
    
        const fillSquare = (square, style) => BoardDrawer.createShape('rectangle', square, {style});
    
        // Collected so removeMarkingFromProfile can drop them. They used to be registered
        // once per marking and never removed, and UniversalBoardDrawer walks that array on
        // every pointer move over a square, so a long game left hundreds of stale callbacks
        // writing to detached nodes.
        const squareListeners = [];

        const handleOpponentDisplay = (square, elem) => {
            // createShape returns false when the drawer is terminated or the square is
            // invalid. The old guard was missing a return, so it fell through to false.style.
            if(!elem) return;

            const listener = BoardDrawer.addSquareListener(square, type => {
                elem.style.display = type === 'enter' ? 'inherit' : 'none';
            });

            squareListeners.push(listener);
        };
    
        moveObjArr.forEach((mObj, idx) => {
            if((onlySuggestPieces || moveAsFilledSquares) && mObj.isFuture) return;

            const [from, to] = mObj.player, [oppFrom, oppTo] = mObj.opponent;
            const oppMovesExist = oppFrom && oppTo, rank = idx + 1, cp = mObj.cp;

            if(onlySuggestPieces && !movesOnDemand) {
                const fillType = idx === 0 ? 1 : 0, fillColor = fillType ? primaryArrowColorHex : secondaryArrowColorHex;
                const fromSquare = fillSquare(from, `opacity: ${arrowOpacity}; stroke-width:5; stroke:black; rx:2; ry:2; fill:${fillColor};`);
                const elems = [fromSquare];

                if(oppFrom) {
                    const oppElem = fillSquare(oppFrom, `opacity:${arrowOpacity}; stroke-width:5; stroke:black; rx:2; ry:2; display:none; fill:${opponentArrowColorHex};`);
                    handleOpponentDisplay(from, oppElem);
                    elems.push(oppElem);
                }

                this.AcasInstance.pV[profile].activeGuiMoveMarkings.push({otherElems: elems});
            }
            else if(moveAsFilledSquares) {
                const fillType = idx === 0 ? 1 : 0, fillColor = fillType ? primaryArrowColorHex : secondaryArrowColorHex;
                const styleBase = `opacity:${arrowOpacity}; stroke-width:5; stroke:black; rx:2; ry:2; fill:${fillColor};`;
                const fromStyle = styleBase + (markedSquares[fillType].includes(from) ? 'opacity:0;' : '');
                const toStyle = `filter:brightness(1.5); stroke-dasharray:4 4; ${styleBase}` + (markedSquares[fillType].includes(to) ? 'opacity:0;' : '');
                const elems = [fillSquare(from, fromStyle), fillSquare(to, toStyle)];

                if(oppMovesExist && showOpponentMoveGuess) {
                    const oppFromElem = fillSquare(oppFrom, fromStyle + ` fill:${opponentArrowColorHex};`);
                    const oppToElem = fillSquare(oppTo, toStyle + ` fill:${opponentArrowColorHex};`);
                    elems.push(oppFromElem, oppToElem);

                    if(showOpponentMoveGuessConstantly) {
                        oppFromElem.style.display = oppToElem.style.display = 'block';
                    } else {
                        oppFromElem.style.display = oppToElem.style.display = 'none';
                        handleOpponentDisplay(from, oppFromElem);
                        handleOpponentDisplay(from, oppToElem);
                    }
                }

                markedSquares[fillType].push(from, to);
                this.AcasInstance.pV[profile].activeGuiMoveMarkings.push({otherElems: elems});
            }
            else {
                let arrowStyle = mObj.isFuture
                    ? getArrowStyle('future', null, arrowOpacity)
                    : getArrowStyle('best', primaryArrowColorHex, arrowOpacity);

                let [lineWidth, arrowheadWidth, arrowheadHeight, startOffset] = [30, 80, 60, 30];

                if(idx !== 0) {
                    if(!mObj.isFuture) {
                        arrowStyle = getArrowStyle('secondary', secondaryArrowColorHex, arrowOpacity);
                    }

                    const scale = totalRanks === 2
                        ? 0.75
                        : maxScale - (maxScale - minScale) * ((rank - 1) / (totalRanks - 1));

                    lineWidth *= scale;
                    arrowheadWidth *= scale;
                    arrowheadHeight *= scale;
                }

                const playerArrowElem = BoardDrawer.createShape('arrow', [from, to], {
                    style: arrowStyle,
                    lineWidth,
                    arrowheadWidth,
                    arrowheadHeight,
                    startOffset
                });

                let oppArrowElem = null;

                if(oppMovesExist && showOpponentMoveGuess) {
                    oppArrowElem = BoardDrawer.createShape('arrow', [oppFrom, oppTo], {
                        style: getArrowStyle('opponent', opponentArrowColorHex, arrowOpacity),
                        lineWidth,
                        arrowheadWidth,
                        arrowheadHeight,
                        startOffset
                    });

                    if(showOpponentMoveGuessConstantly) {
                        oppArrowElem.style.display = 'block';
                    } else {
                        oppArrowElem.style.display = 'none';
                        handleOpponentDisplay(from, oppArrowElem);
                    }
                }

                if(idx === 0 && playerArrowElem) {
                    const p = playerArrowElem.parentElement;
                    p.appendChild(playerArrowElem);
                    if(oppArrowElem) p.appendChild(oppArrowElem);
                }

                this.AcasInstance.pV[profile].activeGuiMoveMarkings.push({
                    ...mObj,
                    playerArrowElem,
                    oppArrowElem
                });
            }
        });
    
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