import { updatePipData, resetPipHints, updatePipFeedback, updatePipOpening, updatePipEvaluation } from '../gui/pip.js';
import { setDynamicSettingsContext } from '../gui/dynamicSettings.js';
import { logActivity } from '../misc/activityLog.js';
import { evaluationForPlayer } from '../misc/evaluation.js';
import { prepareFeedbackPosition, renderLearningFeedback } from './renderFeedback.js';
import { annotateOpponentMove } from './annotate.js';
import { getHintSettings, filterHintMoves } from '../misc/learningHints.js';
import { getVariantPgn } from '../misc/moveNotation.js';
import { variantConfig, getAmazonsShot } from '../misc/variantPosition.js';

function getHintSquareShape(square, color, opacity, isDestination = false) {
    const isBoardSquare = /^[a-z]\d+$/.test(square);
    if(!isBoardSquare) return null;
    const destinationStyle = isDestination ? 'filter:brightness(1.5); stroke-dasharray:4 4; ' : '';
    return { shapeType: 'rectangle', shapeSquare: square,
        shapeConfig: { style: `${destinationStyle}opacity:${opacity}; stroke-width:0.5%; stroke:black; rx:2; ry:2; fill:${color};` } };
}

function getDropShape(from, to, color, opacity) {
    if(!/^[a-zA-Z]@$/.test(from) || !/^[a-z]\d+$/.test(to)) return null;
    return { shapeType: 'text', shapeSquare: to,
        shapeConfig: { text: `${from[0].toUpperCase()}@`, size: 1.3, position: [0, 0],
            style: `fill:${color}; opacity:${opacity}; font-family:Arial,sans-serif; font-weight:900; stroke:black; stroke-width:0.06em; paint-order:stroke;` } };
}

function getShotShapes(shot, color, opacity, scale, filledSquares = false) {
    if(!shot) return [];
    const style = `fill:${color}; opacity:${opacity}; stroke:black; stroke-width:0.5%;`;
    const path = filledSquares ? getHintSquareShape(shot.to, color, opacity, true) : {
        shapeType: 'arrow', shapeSquare: [shot.from, shot.to],
        shapeConfig: { style: `${style} stroke-dasharray:3 3;`, lineWidth: 12 * scale,
            arrowheadWidth: 40 * scale, arrowheadHeight: 35 * scale, startOffset: 20 }
    };
    return [path, {
        shapeType: 'text', shapeSquare: shot.to,
        shapeConfig: { text: '×', size: 1.1, position: [0, 0],
            style: `${style} font-family:Arial,sans-serif; font-weight:900; paint-order:stroke;` }
    }].filter(Boolean).map(shape => ({ ...shape, isFuture: true }));
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
        if(/^[a-zA-Z]@$/.test(move.from)) return getDropShape(move.from, move.to, color, opacity);

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
        if(/^[a-zA-Z]@$/.test(move.player[0]))
            return getDropShape(move.player[0], move.player[1], fillColor, arrowOpacity);
        if(!move.player.every(square => /^[a-z]\d+$/.test(square))) return null;

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
        } else if(!mObj.playerHidden && /^[a-zA-Z]@$/.test(from)) {
            if(visual) shapes.push({ ...visual, bringToFront: idx === 0 });
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

        if(!mObj.playerHidden && detail === 'full') {
            const shot = getAmazonsShot({ ...mObj, hintDetail: detail });
            shapes.push(...getShotShapes(shot, fillColor, arrowOpacity,
                mObj.isFuture ? 1 : computeArrowScale(idx, totalRanks), moveAsFilledSquares));
        }

        if(oppFrom && oppTo && !mObj.opponentHidden && showOpponentMoveGuess) {
            const opponentDetail = mObj.opponentHintDetail ?? 'full';
            // Hidden/destination-only own moves must not be disclosed by hover.
            const ownHover = mObj.playerHidden || detail === 'destination' ? oppFrom : from;
            const hoverSquare = /^[a-z]\d+$/.test(ownHover) ? ownHover
                : mObj.playerHidden || detail === 'piece'
                    ? (/^[a-z]\d+$/.test(oppFrom) ? oppFrom : oppTo) : to;
            const opponentStyle = getArrowStyle('opponent', opponentArrowColorHex, arrowOpacity);
            const opponentShapes = [];
            if(opponentDetail !== 'full') {
                const shape = getHintSquareShape(opponentDetail === 'piece' ? oppFrom : oppTo, opponentArrowColorHex, arrowOpacity, opponentDetail === 'destination');
                if(shape) opponentShapes.push(shape);
            } else if(/^[a-zA-Z]@$/.test(oppFrom)) {
                const shape = getDropShape(oppFrom, oppTo, opponentArrowColorHex, arrowOpacity);
                if(shape) opponentShapes.push(shape);
            } else if(moveAsFilledSquares) {
                [oppFrom, oppTo].forEach(square => {
                    const shape = getHintSquareShape(square, opponentArrowColorHex, arrowOpacity);
                    if(shape) opponentShapes.push(shape);
                });
            } else if(visual && /^[a-z]\d+$/.test(oppFrom) && /^[a-z]\d+$/.test(oppTo)) {
                const arrow = this.getMoveVisualSettings({ ...mObj, player: [oppFrom, oppTo] }, idx, totalRanks,
                    { arrowOpacity, primaryArrowColorHex, secondaryArrowColorHex });
                opponentShapes.push({ shapeType: 'arrow', shapeSquare: [oppFrom, oppTo],
                    shapeConfig: { ...arrow.shapeConfig, style: opponentStyle } });
            }
            if(opponentDetail === 'full') {
                opponentShapes.push(...getShotShapes(getAmazonsShot(mObj, true), opponentArrowColorHex,
                    arrowOpacity, computeArrowScale(idx, totalRanks), moveAsFilledSquares));
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
            const displayFen = this.AcasInstance.displayFen;
            const learning = this.AcasInstance.isLearningProfile(profileName);
            if(learning && (!this.AcasInstance.learningReviewFen
                || bookMoves.some(move => move.fen !== this.AcasInstance.displayFen))) continue;
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
                && this.AcasInstance.currentFen === fen && this.AcasInstance.displayFen === displayFen
                && this.AcasInstance.isLearningProfile(profileName) === learning && variables.bookHintRevision === revision;
            if(!isCurrent) continue;
            this.removeBookMarkings(profileName);

            const bookMoveShapes = movesForProfile
                .map((move, index) => {
                    if(!this.AcasInstance.learningMode || learning)
                        return this.buildBookMoveShape(move, index, movesForProfile, profileName, color, opacity, move.hintDetail);
                    const visual = this.getBookMoveVisualSettings(move, index, movesForProfile, color, opacity, move.hintDetail);
                    return visual ? CREATE_BOARD_DRAWER_MOVE_OBJ(null, { ...move, ...visual }, profileName, 'book') : null;
                })
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
                .map(shape => !this.AcasInstance.learningMode || this.AcasInstance.isLearningProfile(profile)
                    ? BoardDrawer.createShape(shape.shapeType, shape.shapeSquare, shape.shapeConfig) : null)
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

    async updateLearningBoard(specificProfile) {
        const instance = this.AcasInstance;
        const fen = instance.currentFen;
        const revision = this.learningViewRevision = (this.learningViewRevision || 0) + 1;
        const isCurrent = () => !instance.instanceClosed && instance.currentFen === fen && this.learningViewRevision === revision;
        const profiles = Object.entries(instance.pV);
        const previousModes = new Map(profiles.map(([profile, variables]) => [profile, variables.learningMode]));

        const [settings, ownColor] = await Promise.all([
            Promise.all(profiles.map(async ([profile, variables]) => ({ profile, variables,
                learningMode: Boolean(await instance.getConfigValue(instance.configKeys.learningMode, profile)),
                learningPvAnimation: Boolean(await instance.getConfigValue(instance.configKeys.learningPvAnimation, profile)),
                learningPvAnimationStopOnEnemyMove: await instance.getConfigValue(instance.configKeys.learningPvAnimationStopOnEnemyMove, profile) !== false,
                feedbackInPip: Boolean(await instance.getConfigValue(instance.configKeys.feedbackInPip, profile)),
                playerColor: await instance.getPlayerColor(profile)
            }))), instance.getPlayerColor()
        ]);

        if(!isCurrent()) return;

        for(const setting of settings) {
            if(instance.pV[setting.profile] !== setting.variables) continue;
            setting.variables.learningMode = setting.learningMode;
            setting.variables.learningPvAnimation = setting.learningPvAnimation;
            setting.variables.learningPvAnimationStopOnEnemyMove = setting.learningPvAnimationStopOnEnemyMove;
            setting.variables.feedbackInPip = setting.feedbackInPip;
            setting.variables.feedbackPlayerColor = setting.playerColor;
        }

        const enabled = Object.values(instance.pV).some(variables => variables.learningMode);
        const wasEnabled = instance.learningMode;
        const previousReview = instance.learningReviewPostFen;
        const learningProfiles = settings.filter(setting => setting.learningMode);
        const reviewProfile = learningProfiles.find(setting => setting.profile === specificProfile)
            || learningProfiles.find(setting => setting.profile === instance.learningReviewProfile)
            || learningProfiles[0];
        const playerColor = reviewProfile?.playerColor || ownColor;

        instance.learningReviewProfile = reviewProfile?.profile;
        instance.learningMode = enabled;
        instance.instanceElem?.classList.toggle('learning-mode', enabled);
        instance.instanceElem?.querySelectorAll('.instance-feedback').forEach(row => {
            row.classList.toggle('hidden', enabled && !instance.isLearningProfile(row.dataset.profileId));
        });

        const history = instance.gameStateHistory;
        const index = enabled ? history.findLastIndex((state, i) => i > 0
            && history[i - 1].fen?.full?.split(' ')[1] === playerColor
            && state.fen?.full?.split(' ')[1] !== playerColor
            && history[i - 1].fen.full.split(' ')[0] !== state.fen.full.split(' ')[0]) : -1;
        const reviewFen = index > 0 ? history[index - 1].fen.full : null;

        instance.learningReviewFen = reviewFen;
        instance.learningReviewPostFen = index > 0 ? history[index].fen.full : null;
        instance.displayFen = reviewFen || fen;
        instance.chessground?.set({ fen: instance.displayFen });
        instance.chessground?.redrawAll();
        
        // Keep the last valid evaluation while the next review is being scored.
        // Resetting to equal here makes every played move flash through 0.00.
        if(enabled || wasEnabled !== enabled) {
            for(const [profile, variables] of Object.entries(instance.pV)) {
                if(!isCurrent()) return;
                if(specificProfile && profile !== specificProfile && wasEnabled === enabled
                    && previousReview === instance.learningReviewPostFen) continue;
                const learning = instance.isLearningProfile(profile);
                this.removeMarkings(profile, 'Learning view changed');
                this.removeBookMarkings(profile);
                variables.hintDisplayRevision = (variables.hintDisplayRevision || 0) + 1;
                if(previousModes.get(profile) !== learning || learning && previousReview !== instance.learningReviewPostFen) {
                    variables.currentSpeeches.forEach(speech => speech.cancel());
                    variables.currentSpeeches = [];
                }
                if(learning) for(const category of ['move', 'book', 'feedback']) {
                    instance.CommLink.commands.renderVisualsToSite([{
                        profileID: profile, category, isFuture: true, feedbackFen: fen,
                        feedbackRevision: instance.feedbackVisualRevision = Math.max(Date.now() * 1000, (instance.feedbackVisualRevision || 0) + 1)
                    }]);
                }
                if(learning && reviewFen) {
                    const analysis = history[index - 1].analysis?.[profile];
                    if(analysis?.engine === variables.analysisKey)
                        await instance.displayMoves(analysis.moves || [], profile, false, true, true);
                    if(!isCurrent()) return;
                    await instance.getAndDisplayBookMoves(reviewFen, profile);
                } else if(!learning) {
                    const cached = variables.hintCandidates;
                    if(cached?.fen === fen) await instance.displayMoves(cached.moves, profile, false, true);
                    if(!isCurrent()) return;
                    await instance.getAndDisplayBookMoves(fen, profile);
                }
                if(enabled || wasEnabled) instance.renderMetric(instance.displayFen, profile).catch(console.error);
            }
        }
        if(!isCurrent()) return;
        if(enabled) await renderLearningFeedback.call(instance,
            previousReview === instance.learningReviewPostFen ? specificProfile : undefined);
        updatePipFeedback(instance);
    }

    getPgnConfig() {
        const instance = this.AcasInstance;
        const context = variantConfig({ chessVariant: instance.activeVariant });
        const profile = Object.values(instance.pV).find(variables =>
            variantConfig(variables).variant === context.variant);
        return { ...context, useChess960: context.useChess960 || Boolean(profile?.useChess960) };
    }

    async updatePgn() {
        const instance = this.AcasInstance;
        const element = instance.instanceElem?.querySelector('.instance-pgn');
        const opening = instance.instanceElem?.querySelector('.instance-opening-container span');
        if(!element || !opening || instance.instanceClosed) return;
        const request = this.pgnRequest = (this.pgnRequest || 0) + 1;
        const history = instance.gameStateHistory;
        const context = this.getPgnConfig();

        if(context.variant === 'chess' && !context.useChess960) {
            const pgn = GET_PGN_FROM_STATE_HISTORY(history);
            const book = pgn ? FIND_OPENING_BY_PGN(pgn) : null;
            element.innerText = pgn || '1. (...)';
            opening.innerText = book ? `${book.name} (${book.eco})` : '';
            updatePipOpening(instance);
            return;
        }

        opening.innerText = '';
        updatePipOpening(instance);
        if(element.classList.contains('hidden')) {
            element.innerText = 'Open PGN to generate variant move notation.';
            return;
        }

        const isCurrent = () => !instance.instanceClosed && this.pgnRequest === request
            && instance.gameStateHistory === history && !element.classList.contains('hidden')
            && instance.instanceElem?.querySelector('.instance-pgn') === element
            && JSON.stringify(this.getPgnConfig()) === JSON.stringify(context);
        element.innerText = 'Generating variant PGN...';
        try {
            this.pgnTransitions ??= new Map();
            const result = await getVariantPgn(history, { ...context, isCurrent }, this.pgnTransitions);
            if(isCurrent()) element.innerText = result?.pgn || result?.error
                || 'PGN unavailable: the variant engine could not reconstruct this game.';
        } catch(error) {
            if(isCurrent()) element.innerText = 'PGN unavailable: variant notation could not be generated.';
            console.warn('[PGN] Could not generate variant PGN:', error);
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

        const previousFen = this.AcasInstance.currentFen;
        const dimensions = GET_BOARD_DIMENSIONS_FROM_FEN(fen);
        if(this.AcasInstance.boardDimensions.width !== dimensions[0]
            || this.AcasInstance.boardDimensions.height !== dimensions[1]) {
            await this.AcasInstance.setupEnvironment(this.AcasInstance.variantStartPosFen || fen, dimensions);
            if(this.boardUpdateRequest !== request || this.AcasInstance.instanceClosed) return;
        }

        // The userscript keeps gameStateHistory as [newest, ..., initial], newest index 0.
        // The GUI has it reversed, so [initial, ..., newest], oldest index 0.
        // We update the entire history so that reloading GUI doesn't clear history.
        const recorded = new Map(this.AcasInstance.gameStateHistory.map(state => [state.fen?.full, state]));
        this.AcasInstance.gameStateHistory = userscriptGameStateHistory
            .slice()
            .reverse().map(state => ({ ...state, analysis: recorded.get(state.fen?.full)?.analysis,
                feedback: recorded.get(state.fen?.full)?.feedback }));

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

        if(fen) {
            this.AcasInstance.currentFen = fen;
            // Cancel stale calculations and board markings immediately.
            // Keep the latest feedback text visible while the next rating is calculated.
            prepareFeedbackPosition.call(this.AcasInstance, fen);
            setDynamicSettingsContext(this.AcasInstance.instanceID, fen, currentStateObj);
            await this.AcasInstance.syncDynamicSettings();
            if(this.boardUpdateRequest !== request || this.AcasInstance.currentFen !== fen || this.AcasInstance.instanceClosed) return;
            instanceFenElem.innerText = fen;

            await this.updateLearningBoard();
            if(this.boardUpdateRequest !== request || this.AcasInstance.currentFen !== fen) return;
        }

        // Variant reconstruction must not delay the next live engine calculation.
        this.updatePgn().catch(error => console.warn('[PGN] Could not update game record:', error));

        // For each profile config
        Object.keys(this.AcasInstance.pV).forEach(profileName => {
            this.AcasInstance.pV[profileName].hintCandidates = null;
            this.AcasInstance.pV[profileName].pendingMoveDisplay = null;
            if(!this.AcasInstance.isLearningProfile(profileName)) {
                this.AcasInstance.pV[profileName].currentSpeeches.forEach(synthesis => synthesis.cancel());
                this.AcasInstance.pV[profileName].currentSpeeches = [];
            }

            this.AcasInstance.pV[profileName].futureMoves = [];

            if(!this.AcasInstance.isLearningProfile(profileName)) {
                this.AcasInstance.getAndDisplayBookMoves(fen, profileName);
                this.AcasInstance.renderMetric(this.AcasInstance.displayFen, profileName);
            }
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
        updatePipEvaluation(this.AcasInstance);
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

    resetEval() {
        this.evalUpdateRevision = (this.evalUpdateRevision || 0) + 1;
        this.evaluationData = null;
        this.liveEvaluationProfile = null;
        const evalFill = this.AcasInstance.instanceElem?.querySelector('.eval-fill');
        if(evalFill) evalFill.style.height = '50%';
        updatePipEvaluation(this.AcasInstance);
    }

    async updateEval(centipawnEval, mate, profile, analyzedColor, review = false, context = {}) {
        const instance = this.AcasInstance;
        const variables = instance.pV[profile];
        const instanceElem = instance.instanceElem;
        const fen = context.fen ?? (review ? instance.learningReviewFen : instance.currentFen);
        const postFen = context.postFen ?? instance.learningReviewPostFen;
        const isCurrent = () => !instance.instanceClosed && instance.instanceElem === instanceElem
            && instance.pV[profile] === variables
            && (review ? instance.learningMode && instance.isLearningProfile(profile)
                && instance.learningReviewProfile === profile && instance.learningReviewFen === fen
                && instance.learningReviewPostFen === postFen
                : !instance.learningMode && !instance.isLearningProfile(profile) && instance.currentFen === fen)
            && (!context.isCurrent || context.isCurrent());
        if(!instanceElem || !variables || !fen || !isCurrent()) return;
        if(!review && analyzedColor !== fen.split(' ')[1]) return;
        // A single live profile owns the bar; concurrent engines must not fight
        // over it. Learning Mode explicitly selects its review profile instead.
        if(!review && this.liveEvaluationProfile && instance.pV[this.liveEvaluationProfile]
            && this.liveEvaluationProfile !== profile) return;

        const revision = this.evalUpdateRevision = (this.evalUpdateRevision || 0) + 1;
        // Follow the profile's selected side, including reverseSide. Visual
        // orientation stays independent; the bar still stores White's advantage.
        const playerColor = await instance.getPlayerColor(profile);
        if(revision !== this.evalUpdateRevision || !isCurrent()) return;
        // Leave the bar alone on the unselected side's turn.
        if(!review && fen.split(' ')[1] !== playerColor) return;
        const evaluation = evaluationForPlayer(centipawnEval, mate, analyzedColor, playerColor);
        const evalFill = instanceElem.querySelector('.eval-fill');
        if(!evalFill || !evaluation) return;
        const previous = this.evaluationData;
        const depth = Number(context.depth) || 0;
        if(previous?.fen === fen && previous.review === review && previous.variables === variables
            && previous.playerColor === playerColor
            && (!review || previous.postFen === postFen) && previous.depth > depth) return;

        if(!review) this.liveEvaluationProfile = profile;
        this.evaluationData = {
            eval: evaluation.whiteAdvantage, playerColor, centipawnEval: evaluation.whiteEvaluation,
            mate: mate ? Number(centipawnEval) * (analyzedColor === 'w' ? 1 : -1) : null,
            fen, postFen, profile, variables, review, depth
        };
        evalFill.style.height = `${evaluation.whiteAdvantage * 100}%`;
        updatePipEvaluation(instance);
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
        updatePipOpening(this.AcasInstance);
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