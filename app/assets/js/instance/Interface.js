import { updatePipData } from '../gui/pip.js';

function getArrowStyle(type, fill, opacity) {
    const getBaseStyleModification = (f, o) => [
        'stroke: rgb(0 0 0 / 50%);',
        'stroke-width: 2px;',
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
    }
}

export default class Interface {
    constructor(instance) {
        this.AcasInstance = instance;
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
    
        const handleOpponentDisplay = (square, elem) => {
            const listener = BoardDrawer.addSquareListener(square, type => {
                if(!elem) listener.remove();
                elem.style.display = type === 'enter' ? 'inherit' : 'none';
            });
        };
    
        moveObjArr.forEach((mObj, idx) => {
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
                let arrowStyle = getArrowStyle('best', primaryArrowColorHex, arrowOpacity);
                let [lineWidth, arrowheadWidth, arrowheadHeight, startOffset] = [30, 80, 60, 30];
    
                if(idx !== 0) {
                    arrowStyle = getArrowStyle('secondary', secondaryArrowColorHex, arrowOpacity);
                    const scale = totalRanks === 2 ? 0.75 : maxScale - (maxScale - minScale) * ((rank-1)/(totalRanks-1));
                    lineWidth *= scale; arrowheadWidth *= scale; arrowheadHeight *= scale;
                }
    
                const playerArrowElem = BoardDrawer.createShape('arrow', [from, to], {style: arrowStyle, lineWidth, arrowheadWidth, arrowheadHeight, startOffset});
                let oppArrowElem = null;
    
                if(oppMovesExist && showOpponentMoveGuess) {
                    oppArrowElem = BoardDrawer.createShape('arrow', [oppFrom, oppTo], {style: getArrowStyle('opponent', opponentArrowColorHex, arrowOpacity), lineWidth, arrowheadWidth, arrowheadHeight, startOffset});
                    if(showOpponentMoveGuessConstantly) oppArrowElem.style.display = 'block';
                    else {
                        oppArrowElem.style.display = 'none';
                        handleOpponentDisplay(from, oppArrowElem);
                    }
                }
    
                if(idx === 0 && playerArrowElem) {
                    const p = playerArrowElem.parentElement;
                    p.appendChild(playerArrowElem);
                    if(oppArrowElem) p.appendChild(oppArrowElem);
                }
    
                this.AcasInstance.pV[profile].activeGuiMoveMarkings.push({...mObj, playerArrowElem, oppArrowElem});
            }
        });
    
        this.AcasInstance.pV[profile].pastMoveObjects = [];
    }
    
    removeMarkingFromProfile(p) {
        this.AcasInstance.pV[p].activeGuiMoveMarkings.forEach(markingObj => {
            markingObj.oppArrowElem?.remove();
            markingObj.playerArrowElem?.remove();
            markingObj?.otherElems?.forEach(x => x?.remove());
        });

        this.AcasInstance.pV[p].activeGuiMoveMarkings = [];
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
    
    async updateBoardFen(fen) {
        // Most up to date userscript versions handle this itself, so commenting out for now.
        //if(this.AcasInstance.currentFen === fen) return;
    
        const moveObj = EXTRACT_MOVE_FROM_FEN(this.AcasInstance.currentFen, fen);
        const movedPieceLowered = moveObj?.movedPiece?.toLowerCase();
        const instanceFenElem = this?.AcasInstance?.instanceElem?.querySelector('.instance-fen');

        if(!instanceFenElem) return;

        if(this.AcasInstance.debugLogsEnabled) {
            const origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
            const fens = [this.AcasInstance.currentFen, fen];
            const fensString = fens.map(x => x.split(' ')[0]).join(',');
    
            console.warn('%c[ NEW FEN RECEIVED! ]', 'color: neon; font-weight: bold; font-size: 50px;');
            console.warn('[Logical Change Detection] New board FEN received:', `${origin}/A.C.A.S/board/?fens=${fensString}&o=${this.AcasInstance.lastOrientation}`, { fen, moveObj });
        }
    
        if(movedPieceLowered === 'k') {
            const kingColor = moveObj?.movedPiece === movedPieceLowered
                ? 'b' : 'w';
    
            if(!this.AcasInstance.kingMoved.includes(kingColor))
                this.AcasInstance.kingMoved += kingColor;
        }

        if(!moveObj?.color) {
            const playerColor = await this.AcasInstance.getPlayerColor();
            moveObj.color = playerColor.toLowerCase() === 'w' ? 'b' : 'w';
        }
    
        fen = MODIFY_FEN_CASTLE_RIGHTS(fen, this.AcasInstance.kingMoved);
    
        this.AcasInstance.currentFen = fen;
    
        USERSCRIPT.instanceVars.fen.set(this.AcasInstance.instanceID, fen);
    
        if(instanceFenElem) instanceFenElem.innerText = fen;
        if(this.AcasInstance.chessground) this.AcasInstance.chessground.set({ fen });

        this.AcasInstance.engineStopCalculating(false, 'New board FEN, any running calculations are now useless!');

        this.removeMarkings(null, 'New board FEN');
    
        // For each profile config
        Object.keys(this.AcasInstance.pV).forEach(profileName => {
            this.AcasInstance.pV[profileName].currentSpeeches.forEach(synthesis => synthesis.cancel());
            this.AcasInstance.pV[profileName].currentSpeeches = [];
    
            this.AcasInstance.renderMetric(fen, profileName);
        });
    
        updatePipData({ 'moveObjects': null });
    
        this.AcasInstance.renderFeedback(fen);
        this.AcasInstance.calculateBestMoves(fen, { moveObj });
    
        this.AcasInstance.moveHistory.push({
            'fen': fen,
            'move': moveObj
        });
    }
    
    updateBoardOrientation(orientation) {
        if(orientation === this.AcasInstance.lastOrientation) return;
        
        this.AcasInstance.lastOrientation = orientation;
    
        Object.keys(this.AcasInstance.pV).forEach(profileName => {
            this.AcasInstance.pV[profileName].lastCalculatedFen = null;
        });
    
        const orientationWord = orientation == 'b' ? 'black' : 'white';
    
        const evalBarElem = this.AcasInstance.instanceElem.querySelector('.eval-bar');
    
        if(orientation == 'b')
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

        if(playerColor == 'b') {
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