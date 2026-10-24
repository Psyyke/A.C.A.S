import { updatePipData, resetPipHints } from '../gui/pip.js';
import { setDynamicSettingsContext } from '../gui/dynamicSettings.js';
import { logActivity } from '../misc/activityLog.js';
import { evaluationForPlayer } from '../misc/evaluation.js';
import { prepareFeedbackPosition } from './renderFeedback.js';
import { annotateOpponentMove } from './annotate.js';
import { getHintSettings, filterHintMoves } from '../misc/learningHints.js';

function getHintSquareShape(square, color, opacity, isDestination = false) {
    const isBoardSquare = /^[a-z]\d+$/.test(square);
    if(!isBoardSquare) return null;
    const destinationStyle = isDestination ? 'filter:brightness(1.5); stroke-dasharray:4 4; ' : '';
    return { shapeType: 'rectangle', shapeSquare: square,
        shapeConfig: { style: `${destinationStyle}opacity:${opacity}; stroke-width:0.5%; stroke:black; rx:2; ry:2; fill:${color};` } };
}

function computeArrowScale(index, total) {
    const maxScale = 1, minScale = 0.5;
    return maxScale - minScale * (index / Math.max(total - 1, 2));
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

    getBookMoveVisualSettings(move, index, movesForProfile, color, opacity, detail = 'full') {
        if(!move?.from || !move?.to) return null;

        const isPartialHint = detail !== 'full';
        if(isPartialHint) return getHintSquareShape(detail === 'piece' ? move.from : move.to, color, opacity, detail === 'destination');

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

    buildBookMoveShape(move, index, movesForProfile, profileName, color, opacity, detail) {
        const visual = this.getBookMoveVisualSettings(move, index, movesForProfile, color, opacity, detail);

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
            opponentArrowColorHex, hintDetail = 'full', moveAsFilledSquares,
            showOpponentMoveGuess, showOpponentMoveGuessConstantly, markedSquares, hintSquares
        } = ctx;

        const [from, to] = mObj.player, [oppFrom, oppTo] = mObj.opponent;
        const fillType = idx === 0 ? 1 : 0;
        const fillColor = fillType ? primaryArrowColorHex : secondaryArrowColorHex;
        const detail = mObj.hintDetail ?? hintDetail;
        const shapes = [];
        const visual = this.getMoveVisualSettings(mObj, idx, totalRanks, { arrowOpacity, primaryArrowColorHex, secondaryArrowColorHex });

        if(!mObj.playerHidden && detail !== 'full') {
            const square = detail === 'destination' ? to : from;
            const alreadyMarked = hintSquares?.has(square);
            const playerShape = alreadyMarked ? null : getHintSquareShape(square, fillColor, arrowOpacity, detail === 'destination');
            if(playerShape) shapes.push(playerShape);
            hintSquares?.add(square);
        } else if(!mObj.playerHidden && moveAsFilledSquares) {
            const styleBase = `opacity:${arrowOpacity}; stroke-width:0.5%; stroke:black; rx:2; ry:2; fill:${fillColor};`;
            const fromStyle = styleBase + (markedSquares[fillType].includes(from) ? 'opacity:0;' : '');
            const toStyle = `filter:brightness(1.5); stroke-dasharray:4 4; ${styleBase}` + (markedSquares[fillType].includes(to) ? 'opacity:0;' : '');

            markedSquares[fillType].push(from, to);

            shapes.push(
                { shapeType: 'rectangle', shapeSquare: from, shapeConfig: { style: fromStyle } },
                { shapeType: 'rectangle', shapeSquare: to, shapeConfig: { style: toStyle } }
            );
        } else if(!mObj.playerHidden && visual) {
            shapes.push({ ...visual, bringToFront: idx === 0 });
        }

        if(oppFrom && oppTo && !mObj.opponentHidden && showOpponentMoveGuess) {
            const opponentDetail = mObj.opponentHintDetail ?? 'full';
            // Hidden/destination-only own moves must not be disclosed by hover.
            const hoverSquare = mObj.playerHidden || detail === 'destination' ? oppFrom : from;
            const opponentStyle = getArrowStyle('opponent', opponentArrowColorHex, arrowOpacity);
            const opponentShapes = [];
            if(opponentDetail !== 'full') {
                const shape = getHintSquareShape(opponentDetail === 'piece' ? oppFrom : oppTo, opponentArrowColorHex, arrowOpacity, opponentDetail === 'destination');
                if(shape) opponentShapes.push(shape);
            } else if(moveAsFilledSquares) {
                [oppFrom, oppTo].forEach(square => {
                    const shape = getHintSquareShape(square, opponentArrowColorHex, arrowOpacity);
                    if(shape) opponentShapes.push(shape);
                });
            } else if(visual) {
                opponentShapes.push({ shapeType: 'arrow', shapeSquare: [oppFrom, oppTo],
                    shapeConfig: { ...visual.shapeConfig, style: opponentStyle } });
            }
            opponentShapes.forEach(shape => {
                if(!showOpponentMoveGuessConstantly) shape.shapeConfig.style += ' display:none;';
                shapes.push({ ...shape, from: hoverSquare, isOpponent: true, forceHoverOnly: !showOpponentMoveGuessConstantly });
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
            const variables = this.AcasInstance.pV[profileName];
            if(!variables) continue;
            const fen = this.AcasInstance.currentFen;
            const revision = (variables.bookHintRevision || 0) + 1;
            variables.bookHintRevision = revision;
            const hints = await getHintSettings(this.AcasInstance, profileName);
            const candidates = (bookMoves || []).filter(move => move?.profile === profileName);
            const movesForProfile = filterHintMoves(candidates, hints, fen).filter((move, index, moves) => {
                const squareKey = move.hintDetail === 'piece' ? 'from' : 'to';
                return move.hintDetail === 'full' || moves.findIndex(other => other[squareKey] === move[squareKey]) === index;
            });
            const { configKeys } = this.AcasInstance;

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

            const isCurrent = this.AcasInstance.pV[profileName] === variables && !this.AcasInstance.instanceClosed
                && this.AcasInstance.currentFen === fen && variables.bookHintRevision === revision;
            if(!isCurrent) continue;
            this.removeBookMarkings(profileName);

            const bookMoveShapes = movesForProfile
                .map((move, index) => this.buildBookMoveShape(move, index, movesForProfile, profileName, color, opacity, move.hintDetail))
                .filter(Boolean);

            this.AcasInstance.pV[profileName].bookMoveMarkings = bookMoveShapes.map(x => x.elem).filter(Boolean);

            if(displayMovesExternally || variables.bookHintsExternal) {
                const entries = displayMovesExternally ? FORMAT_MOVE_OBJ_TO_EXTERNAL_SITE(bookMoveShapes) : [];
                this.AcasInstance.CommLink.commands.renderVisualsToSite(entries.length ? entries : [{ profileID: profileName, category: 'book' }]);
            }
            variables.bookHintsExternal = Boolean(displayMovesExternally);
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

    async markMoves(moveObjArr, profile, hints, isCurrent = () => true, silent = false) {
        const totalRanks = moveObjArr.filter(move => !move.isFuture).length;
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
            displayMovesExternally
        ] = await Promise.all([
            this.AcasInstance.getConfigValue(cfgKeys.arrowOpacity, profile).then(v => v/100),
            this.AcasInstance.getConfigValue(cfgKeys.showOpponentMoveGuess, profile),
            this.AcasInstance.getConfigValue(cfgKeys.showOpponentMoveGuessConstantly, profile),
            this.AcasInstance.getConfigValue(cfgKeys.primaryArrowColorHex, profile),
            this.AcasInstance.getConfigValue(cfgKeys.secondaryArrowColorHex, profile),
            this.AcasInstance.getConfigValue(cfgKeys.opponentArrowColorHex, profile),
            this.AcasInstance.getConfigValue(cfgKeys.moveAsFilledSquares, profile),
            this.AcasInstance.getConfigValue(cfgKeys.displayMovesOnExternalSite, profile)
        ]);

        hints ??= await getHintSettings(this.AcasInstance, profile);
        if(!isCurrent()) return;
        this.removeMarkings(profile, 'Make room for new move markings');

        const markedSquares = [[], []]; // [primary, secondary]

        const shapeCtx = {
            totalRanks, arrowOpacity, primaryArrowColorHex, secondaryArrowColorHex,
            opponentArrowColorHex, hintDetail: hints.detail, moveAsFilledSquares,
            showOpponentMoveGuess, showOpponentMoveGuessConstantly, markedSquares, hintSquares: new Set()
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
        let visibleMoveIndex = 0;

        moveObjArr.forEach((mObj, idx) => {
            const shouldHideFuture = (hints.detail !== 'full' || moveAsFilledSquares) && mObj.isFuture;
            if(shouldHideFuture) return;

            // Threat-only candidates must not demote the first visible own move.
            const shapeIndex = mObj.playerHidden ? idx : visibleMoveIndex++;
            const shapes = this.getMoveShapes(mObj, shapeIndex, shapeCtx);
            if(!shapes.length) return;

            const [from] = mObj.player;
            const elems = shapes
                .map(shape => BoardDrawer.createShape(shape.shapeType, shape.shapeSquare, shape.shapeConfig))
                .map((elem, i) => {
                    if(!elem) return elem;

                    const shape = shapes[i];
                    if(shape.isOpponent) {
                        if(shape.forceHoverOnly && !showOpponentMoveGuessConstantly) {
                            handleOpponentDisplay(shape.from ?? from, elem);
                        } else {
                            revealOpponent(shape.from ?? from, elem);
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
                const entries = this.buildMoveSiteEntries(mObj, shapes, profile);
                // A presentation-only redraw must not trigger the site's Auto Move again.
                if(silent) entries.forEach(entry => { entry.data.isFuture = true; });
                siteMoveShapes.push(...entries);
            }
        });

        const variables = this.AcasInstance.pV[profile];
        if(displayMovesExternally || variables.hintsExternal) {
            const entries = FORMAT_MOVE_OBJ_TO_EXTERNAL_SITE(siteMoveShapes);
            this.AcasInstance.CommLink.commands.renderVisualsToSite(entries.length ? entries : [{ profileID: profile, category: 'move', isFuture: true }]);
        }
        variables.hintsExternal = Boolean(displayMovesExternally);

        this.AcasInstance.pV[profile].activeSquareListeners = squareListeners;
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
        const request = (this.boardUpdateRequest || 0) + 1;
        this.boardUpdateRequest = request;
        const userscriptGameStateHistory = await GET_STATE_HISTORY(this.AcasInstance.instanceID);
        if(this.boardUpdateRequest !== request || this.AcasInstance.instanceClosed) return;
        const currentStateObj = userscriptGameStateHistory[0];
        const fen = currentStateObj?.fen?.full;
        const basicFen = currentStateObj?.fen?.basic;

        if(!fen) return;
        if(basicFen && basicFen === this.lastAcceptedBasicFen && fen === this.AcasInstance.currentFen
            && !calculateMovesConfig?.skipValidityChecks) return;

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
        resetPipHints(this.AcasInstance);

        const previousFen = this.AcasInstance.currentFen;
        if(fen) {
            this.AcasInstance.currentFen = fen;
            // Clear/cancel feedback before asynchronous settings application,
            // not seconds later when renderFeedback eventually gets called.
            prepareFeedbackPosition.call(this.AcasInstance, fen);
            setDynamicSettingsContext(this.AcasInstance.instanceID, fen, currentStateObj);
            await this.AcasInstance.syncDynamicSettings();
            if(this.boardUpdateRequest !== request || this.AcasInstance.currentFen !== fen || this.AcasInstance.instanceClosed) return;
            instanceFenElem.innerText = fen;

            if(this.AcasInstance.chessground) {
                this.AcasInstance.chessground.set({ fen });
                this.AcasInstance.chessground.redrawAll();
            }
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
            this.AcasInstance.pV[profileName].hintCandidates = null;
            this.AcasInstance.pV[profileName].pendingMoveDisplay = null;
            this.AcasInstance.pV[profileName].currentSpeeches.forEach(synthesis => synthesis.cancel());
            this.AcasInstance.pV[profileName].currentSpeeches = [];

            this.AcasInstance.pV[profileName].futureMoves = [];

            this.AcasInstance.getAndDisplayBookMoves(fen, profileName);
            this.AcasInstance.renderMetric(fen, profileName);
        });

        if(basicFen) this.lastAcceptedBasicFen = basicFen;
        annotateOpponentMove.call(this.AcasInstance, currentStateObj, previousFen).catch(error => console.warn('[Audio] Move annotation failed:', error));
        this.AcasInstance.renderFeedback(currentStateObj).catch(error => console.warn('[Feedback] Board refresh failed:', error));
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

    async updateEval(centipawnEval, mate, profile, analyzedColor) {
        if(!this.AcasInstance.instanceElem) return;
        const evalFill = this.AcasInstance.instanceElem.querySelector('.eval-fill');
        const playerColor = await this.AcasInstance.getPlayerColor();
        const evaluation = evaluationForPlayer(centipawnEval, mate,
            analyzedColor ?? this.AcasInstance.currentFen?.split(' ')[1], playerColor);
        if(!evalFill || !evaluation) return;
        updatePipData({ eval: evaluation.whiteAdvantage, playerColor, centipawnEval: evaluation.whiteEvaluation });
        evalFill.style.height = `${evaluation.whiteAdvantage * 100}%`;
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
        logActivity('site', str, { instanceID: this.AcasInstance.instanceID });

        console.log('%c' + message, 'color: dodgerblue');
    }
}