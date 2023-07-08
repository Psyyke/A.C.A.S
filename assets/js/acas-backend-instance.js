class BackendInstance {
    constructor(domain, instanceID, chessVariant, onLoadCallbackFunction) {
        this.configKeys = {
            'engineElo': 'engineElo',
            'moveSuggestionAmount': 'moveSuggestionAmount',
            'arrowOpacity': 'arrowOpacity',
            'displayMovesOnExternalSite': 'displayMovesOnExternalSite',
            'showMoveGhost': 'showMoveGhost',
            'showOpponentMoveGuess': 'showOpponentMoveGuess',
            'maxMovetime': 'maxMovetime',
            'chessVariant': 'chessVariant',
            'chessFont': 'chessFont',
            'useChess960': 'useChess960'
        };

        this.config = {};

        Object.values(this.configKeys).forEach(key => {
            this.config[key] = {
                get:  () => getGmConfigValue(key, this.instanceID),
                set: null
            };
        });

        this.getConfigValue = (key) => {
            return this.config[key]?.get();
        }
    
        this.setConfigValue = (key, val) => {
            return this.config[key]?.set(val);
        }

        this.instanceReady = false;
        this.instanceClosed = false;

        this.domain = domain;
        this.instanceID = instanceID;

        this.chessVariant = isVariant960(chessVariant) ? formatVariant('chess') : formatVariant(chessVariant || this.getConfigValue(this.configKeys.chessVariant) || 'chess');
        this.useChess960 =  isVariant960(chessVariant) ? true : this.getConfigValue(this.configKeys.useChess960);

        this.chessVariants = [];

        this.onLoadCallbackFunction = onLoadCallbackFunction;

        this.engine = null;
        this.chessground = null;
        this.instanceElem = null;
        this.BoardDrawer = null;

        this.variantStartPosFen = null;

        this.searchDepth = null;
        
        this.engineFinishedCalculation = false;

        this.bestMoveMarkingElem = null;
        this.activeGuiMoveMarkings = [];
        this.inactiveGuiMoveMarkings = [];
        this.unprocessedPackets = [];

        this.arrowStyles = {
            'best': `
                fill: limegreen;
                stroke: rgb(0 0 0 / 50%);
                stroke-width: 2px;
                stroke-linejoin: round;
                opacity: 0.9;
            `,
            'secondary': `
                fill: dodgerblue;
                stroke: rgb(0 0 0 / 50%);
                stroke-width: 2px;
                stroke-linejoin: round;
                opacity: 0.9;
            `,
            'opponent': `
                fill: crimson;
                stroke: rgb(0 0 0 / 25%);
                stroke-width: 2px;
                stroke-linejoin: round;
                display: none;
                opacity: 0.3;
            `
        };

        this.CommLink = new USERSCRIPT.CommLinkHandler(`backend_${this.instanceID}`, {
            'singlePacketResponseWaitTime': 1500,
            'maxSendAttempts': 3,
            'statusCheckInterval': 1
        });

        this.CommLink.registerSendCommand('ping');
        this.CommLink.registerSendCommand('getFen');
        this.CommLink.registerSendCommand('removeSiteMoveMarking');
        this.CommLink.registerSendCommand('markMoveToSite');

        this.CommLinkReceiver = this.CommLink.registerListener(`frontend_${this.instanceID}`, packet => {
            try {
                if(this.instanceReady)
                    return this.processPacket(packet);

                this.unprocessedPackets.push(packet);

                return true;
            } catch(e) {
                console.error('Instance:', this.domain, this.instanceID, e);
                return null;
            }
        });

        this.guiBroadcastChannel = new BroadcastChannel('gui');

        this.guiBroadcastChannel.onmessage = e => {
            if(!this.instanceReady || this.instanceClosed) return;
            
            const msg = e.data;

            switch(msg.type) {
                case 'settingSave':
                    this.updateSettings();
                    break;
            }
        };

        this.loadEngine();
    }

    processPacket(packet) {
        switch(packet.command) {
            case 'ping':
                return `pong (took ${Date.now() - packet.date}ms)`;
            case 'log':
                this.Interface.frontLog(packet.data);
                return true;
            case 'updateBoardOrientation':
                this.Interface.boardUtils.updateBoardOrientation(packet.data);
                return true;
            case 'reloadChessEngine':
                reloadChessEngine();
                return true;
            case 'updateBoardFen':
                this.Interface.boardUtils.updateBoardFen(packet.data);
                return true;
            case 'calculateBestMoves':
                this.calculateBestMoves(packet.data);
                return true;
        }
    }

    Interface = {
        boardUtils: {
            markMove: moveObj => {
                const [from, to] = moveObj.player;
                const [opponentFrom, opponentTo] = moveObj.opponent;
                const ranking = moveObj.ranking;

                const existingExactSameMoveObj = this.activeGuiMoveMarkings.find(obj => {
                    const [activeFrom, activeTo] = obj.player;
                    const [activeOpponentFrom, activeOpponentTo] = obj.opponent;

                    return from == activeFrom
                        && to == activeTo
                        && opponentFrom == activeOpponentFrom
                        && opponentTo == activeOpponentTo;
                });

                this.activeGuiMoveMarkings.map(obj => {
                    const [activeFrom, activeTo] = obj.player;

                    const existingSameMoveObj = from == activeFrom && to == activeTo;

                    if(existingSameMoveObj) {
                        obj.promotedRanking = 1;
                    }

                    return obj;
                });

                const exactSameMoveDoesNotExist = typeof existingExactSameMoveObj !== 'object';


                if(exactSameMoveDoesNotExist) {
                    const showOpponentMoveGuess = this.getConfigValue(this.configKeys.showOpponentMoveGuess);
                    const opponentMoveGuessExists = typeof opponentFrom == 'string';
                    
                    const arrowStyle = ranking == 1 ? this.arrowStyles.best : this.arrowStyles.secondary;
    
                    let opponentArrowElem = null;
    
                    // Create player move arrow element
                    const arrowElem = this.BoardDrawer.createShape('arrow', [from, to],
                        { style: arrowStyle }
                    );
    
                    // Create opponent move arrow element
                    if(opponentMoveGuessExists && showOpponentMoveGuess) {
                        opponentArrowElem = this.BoardDrawer.createShape('arrow', [opponentFrom, opponentTo], 
                            { style: this.arrowStyles.opponent }
                        );
    
                        const squareListener = this.BoardDrawer.addSquareListener(from, type => {
                            if(!opponentArrowElem) {
                                squareListener.remove();
                            }
    
                            switch(type) {
                                case 'enter':
                                    opponentArrowElem.style.display = 'inherit';
                                    break;
                                case 'leave':
                                    opponentArrowElem.style.display = 'none';
                                    break;
                            }
                        });
                    }
    
                    this.activeGuiMoveMarkings.push({
                        ...moveObj,
                        'opponentArrowElem': opponentArrowElem,
                        'playerArrowElem': arrowElem
                    });
                }

                this.Interface.boardUtils.removeOldMarkings();
                this.Interface.boardUtils.paintMarkings();
            },
            removeOldMarkings: () => {
                const markingLimit = this.getConfigValue(this.configKeys.moveSuggestionAmount);
                const showGhost = this.getConfigValue(this.configKeys.showMoveGhost);
                
                const exceededMarkingLimit = this.activeGuiMoveMarkings.length > markingLimit;

                if(exceededMarkingLimit) {
                    const amountToRemove = this.activeGuiMoveMarkings.length - markingLimit;

                    for(let i = 0; i < amountToRemove; i++) {
                        const oldestMarkingObj = this.activeGuiMoveMarkings[0];

                        this.activeGuiMoveMarkings = this.activeGuiMoveMarkings.slice(1);

                        if(oldestMarkingObj?.playerArrowElem?.style) {
                            oldestMarkingObj.playerArrowElem.style.fill = 'grey';
                            oldestMarkingObj.playerArrowElem.style.opacity = '0';
                            oldestMarkingObj.playerArrowElem.style.transition = 'opacity 2.5s ease-in-out';
                        }

                        if(oldestMarkingObj?.opponentArrowElem?.style) {
                            oldestMarkingObj.opponentArrowElem.style.fill = 'grey';
                            oldestMarkingObj.opponentArrowElem.style.opacity = '0';
                            oldestMarkingObj.opponentArrowElem.style.transition = 'opacity 2.5s ease-in-out';
                        }

                        if(showGhost) {
                            this.inactiveGuiMoveMarkings.push(oldestMarkingObj);
                        } else {
                            oldestMarkingObj.playerArrowElem?.remove();
                            oldestMarkingObj.opponentArrowElem?.remove();
                        }
                    }
                }

                if(showGhost) {
                    this.inactiveGuiMoveMarkings.forEach(markingObj => {
                        const activeDuplicateArrow = this.activeGuiMoveMarkings.find(x => {
                            const samePlayerArrow = x.player?.toString() == markingObj.player?.toString();
                            const sameOpponentArrow = x.opponent?.toString() == markingObj.opponent?.toString();
    
                            return samePlayerArrow && sameOpponentArrow;
                        });
    
                        const duplicateExists = activeDuplicateArrow ? true : false;
    
                        const removeArrows = () => {
                            this.inactiveGuiMoveMarkings = this.inactiveGuiMoveMarkings.filter(x => x.playerArrowElem != markingObj.playerArrowElem);
    
                            markingObj.playerArrowElem?.remove();
                            markingObj.opponentArrowElem?.remove();
                        }
    
                        if(duplicateExists) {
                            removeArrows();
                        } else {
                            setTimeout(removeArrows, 2500);
                        }
                    });
                }
            },
            paintMarkings: () => {
                console.log('PAINT MARKINGS!');

                /* Account for none, or multiple 1 rank (multipv 1) markings. This is the priority order,
                    1. Mark the last added rank 1 marking as the best (unless promoted marking is newer)
                    2. (no rank 1 markings) Mark the lats added promoted rank 1 marking as the best
                    3. (no promoted rank 1 markings) Mark the last added marking as the best 
                    
                    Every other marking than the best gets marked as secondary.
                */

                const newestBestMarkingIndex = this.activeGuiMoveMarkings.findLastIndex(obj => obj.ranking == 1);
                const newestPromotedBestMarkingIndex = this.activeGuiMoveMarkings.findLastIndex(obj => obj?.promotedRanking == 1);
                const lastMarkingIndex = this.activeGuiMoveMarkings.length - 1;

                const isLastMarkingBest = newestBestMarkingIndex == -1 && newestPromotedBestMarkingIndex == -1;
                const bestIndex = isLastMarkingBest ? lastMarkingIndex : Math.max(...[newestBestMarkingIndex, newestPromotedBestMarkingIndex]);

                console.log(newestBestMarkingIndex, newestPromotedBestMarkingIndex, lastMarkingIndex, `Is last marking the best: ${isLastMarkingBest}, Selected best index: ${bestIndex}`);

                let bestMoveMarked = false;

                this.activeGuiMoveMarkings.forEach((markingObj, idx) => {
                    const isBestMarking = idx == bestIndex;

                    console.log(bestIndex, isBestMarking, markingObj);

                    if(isBestMarking) {
                        console.log('Best move', markingObj);

                        markingObj.playerArrowElem.style.cssText = this.arrowStyles.best;

                        const playerArrowElem = markingObj.playerArrowElem
                        const opponentArrowElem = markingObj.opponentArrowElem;

                        // move best arrow element on top (multiple same moves can hide the best move)
                        const parentElem = markingObj.playerArrowElem.parentElement;

                        parentElem.appendChild(playerArrowElem);

                        if(opponentArrowElem) {
                            parentElem.appendChild(opponentArrowElem);
                        }

                        bestMoveMarked = true;
                    } else {
                        console.log('Seconday move', markingObj);

                        markingObj.playerArrowElem.style.cssText = this.arrowStyles.secondary;
                    }
                });
            },
            removeBestMarkings: () => {
                this.activeGuiMoveMarkings.forEach(markingObj => {
                    markingObj.opponentArrowElem?.remove();
                    markingObj.playerArrowElem?.remove();
                });

                this.activeGuiMoveMarkings = [];
            },
            updateBoardFen: fen => {
                this.chessground.set({ fen });
                this.instanceElem.querySelector('.instance-fen').innerText = fen;

                this.onNewMove(fen);
            },
            updateBoardOrientation: orientation => {
                const orientationWord = orientation == 'b' ? 'black' : 'white';

                const evalBarElem = this.instanceElem.querySelector('.eval-bar');

                if(orientation == 'b')
                    evalBarElem.classList.add('reversed');
                else
                    evalBarElem.classList.remove('reversed');

                this.chessground.set({ 'orientation': orientationWord });
                this.BoardDrawer.setOrientation(orientation);
            }
        },
        updateMoveProgress: text => {
            const progressBarElem = this.instanceElem.querySelector('.instance-info-text');
    
            progressBarElem.innerText = text;
    
            progressBarElem.classList.remove('hidden');
        },
        updateEval: (centipawnEval, mate) => {
            const evalFill = this.instanceElem.querySelector('.eval-fill');
            const gradualness = 8;

            if(USERSCRIPT.instanceVars.playerColor.get(this.instanceID) == 'b') {
                centipawnEval = -centipawnEval;
            }

            const advantage = 1 / (1 + 10**(-centipawnEval / 100 / gradualness)); // [-1, 1]
            let percent = advantage * 100;

            if(mate)
                percent = centipawnEval > 0 ? 100 : 0;

            evalFill.style.height = `${percent}%`;
        },
        displayConnectionIssueWarning: () => {
            const connectionWarningElem = this.instanceElem?.querySelector('.connection-warning');

            if(connectionWarningElem) {
                connectionWarningElem.classList.remove('hidden');
            }
        },
        removeConnectionIssueWarning: () => {
            const connectionWarningElem = this.instanceElem?.querySelector('.connection-warning');

            if(connectionWarningElem) {
                connectionWarningElem.classList.add('hidden');
            }
        },
        frontLog: str => {
            const message = `[FRONTEND] ${str}`;
    
            console.log('%c' + message, 'color: dodgerblue');
        },
    };

    setEngineElo(elo) {
        if(typeof elo == 'number') {
            const limitStrength = 0 < elo && elo <= 2850;

            this.engine.postMessage(`setoption name UCI_Elo value ${elo}`);

            if(limitStrength) {
                this.setEngineLimitStrength(true);
    
                const skillLevel = getSkillLevelFromElo(elo);
                this.setEngineSkillLevel(skillLevel);
    
                const depth = getDepthFromElo(elo);
                this.searchDepth = depth;

                console.log(`Engine skill limited (UCI_Elo: ${elo} | Skill Level: ${skillLevel} | Search Depth: ${depth})`);
            } else {
                this.setEngineLimitStrength(false);

                this.setEngineSkillLevel(20);

                this.searchDepth = null;

                console.log(`Engine has no skill limitation!`);
            }
        }
    }

    disableEngineElo() {
        this.engine.postMessage(`setoption name UCI_LimitStrength value false`);
    }

    setEngineMultiPV(amount) {
        if(typeof amount == 'number') {
            this.engine.postMessage(`setoption name MultiPV value ${amount}`);
        }
    }

    setEngineSkillLevel(amount) {
        if(typeof amount == 'number' && -20 <= amount && amount <= 20) {
            this.engine.postMessage(`setoption name UCI_LimitStrength value ${amount}`);
        }
    }

    setEngineLimitStrength(bool) {
        if(typeof bool == 'boolean') {
            this.engine.postMessage(`setoption name UCI_LimitStrength value ${bool}`);
        }
    }

    set960Mode(val) {
        const bool = val ? true : false;

        this.engine.postMessage(`setoption name UCI_Chess960 value ${bool}`);

        this.useChess960 = bool;
    }

    setEngineVariant(variant) {
        if(typeof variant == 'string') {
            this.engine.postMessage(`setoption name UCI_Variant value ${variant}`);

            this.chessVariant = formatVariant(variant);
            this.useChess960 = isVariant960(variant) ? true : this.getConfigValue(this.configKeys.useChess960);
        }
    }

    setChessFont(chessFontStr) {
        chessFontStr = formatChessFont(chessFontStr);

        const chessboardComponentsElem = this.instanceElem.querySelector('.chessboard-components');
        const chessFonts = ['merida', 'cburnett'];

        chessFonts.forEach(str => {
            if(str == chessFontStr) {
                chessboardComponentsElem.classList.add(str);
            } else {
                chessboardComponentsElem.classList.remove(str);
            }
        });
    }

    engineStartNewGame(variant) {
        const chessVariant = formatVariant(variant);

        this.engineStopCalculating();

        this.engine.postMessage('ucinewgame'); // very important to be before setting variant and so forth
        this.engine.postMessage('uci'); // to display variants

        this.setEngineVariant(chessVariant);
        this.setEngineElo(this.getConfigValue(this.configKeys.engineElo));
        this.setEngineMultiPV(this.getConfigValue(this.configKeys.moveSuggestionAmount));

        this.engine.postMessage('position startpos');
        this.engine.postMessage('d');
    }

    engineStopCalculating() {
        this.engine.postMessage('stop');
    }

    isPlayerTurn() {
        const playerColor = USERSCRIPT.instanceVars.playerColor.get(this.instanceID);
        const turn = USERSCRIPT.instanceVars.turn.get(this.instanceID);

        return !playerColor || turn == playerColor;
    }

    onNewMove(fen) {
        this.Interface.boardUtils.removeBestMarkings();

        this.engineStopCalculating();

        const isStartPos = getBasicFenLowerCased(this.variantStartPosFen) == getBasicFenLowerCased(fen);

        if(isStartPos) {
            this.engine.postMessage('ucinewgame');
        }
    }

    updateSettings() {
        const chessVariant = formatVariant(this.getConfigValue(this.configKeys.chessVariant));
        const useChess960 = this.getConfigValue(this.configKeys.useChess960);

        if(chessVariant != this.chessVariant || useChess960 != this.useChess960) {
            this.set960Mode(useChess960);

            this.engineStartNewGame(chessVariant);
        } else {
            this.setChessFont(this.getConfigValue(this.configKeys.chessFont));
            this.setEngineElo(this.getConfigValue(this.configKeys.engineElo));
            this.setEngineMultiPV(this.getConfigValue(this.configKeys.moveSuggestionAmount));
            this.set960Mode(useChess960);
        }
    }

    async calculateBestMoves(currentFen) {
        this.engineFinishedCalculation = false;

        log.info(`Fen: "${currentFen}"`);
        log.info(`Updating board Fen`);

        this.Interface.boardUtils.updateBoardFen(currentFen);
    
        log.info('Sending best move request to the engine!');
    
        this.engine.postMessage(`position fen ${currentFen}`);

        let searchCommandStr = 'go infinite';

        if(this.searchDepth) {
            searchCommandStr = `go depth ${this.searchDepth}`;
        }

        //if(this.isPlayerTurn()) {
            const movetime = this.getConfigValue(this.configKeys.maxMovetime);

            if(typeof movetime == 'number') {
                setTimeout(() => {
                    if(movetime != 0 && !this.engineFinishedCalculation) {
                        console.log('Stopped');

                        this.engineStopCalculating();
                    }
                }, movetime + 5);
            }

            this.engine.postMessage(searchCommandStr);
        //}
    }

    engineMessageHandler(msg) {
        const data = parseUCIResponse(msg);

        if(!data?.currmovenumber) console.warn(msg);

        if(msg.includes('option name UCI_Variant type combo')) {
            const chessVariants = extractVariantNames(msg);

            this.chessVariants = chessVariants;

            this.guiBroadcastChannel.postMessage({ 'type': 'updateChessVariants', 'data' : chessVariants });
        }

        if(msg.includes('info')) {
            if(data?.multipv == 1) {
                if(data?.depth) {
                    if(data?.mate)
                        this.Interface.updateMoveProgress(`${data.mate > 0 ? 'Win' : 'Lose'} in ${Math.abs(data.mate)} | Depth ${data.depth}`);
                    else
                        this.Interface.updateMoveProgress(`Depth ${data.depth}`);
                }
    
                if(data?.cp)
                    this.Interface.updateEval(data.cp);
    
                if(data?.mate) 
                    this.Interface.updateEval(data.mate, true);
            }
        }

        if(data?.pv) {
            const moveRegex = /[a-zA-Z]\d+/g;
            const ranking = convertToCorrectType(data?.multipv);
            let moves = data.pv.split(' ').map(move => move.match(moveRegex));

            if(moves?.length == 1) // if no opponent move guesses yet
                moves = [...moves, [null, null]];

            const [[from, to], [opponentFrom, opponentTo]] = moves;

            const moveObj = { 'player': [from, to], 'opponent': [opponentFrom, opponentTo], ranking };

            //if(this.isPlayerTurn()) {
                this.Interface.boardUtils.markMove(moveObj);

                if(this.getConfigValue(this.configKeys.displayMovesOnExternalSite)) {
                    this.CommLink.commands.markMoveToSite(moveObj);
                }
            //}
        }

        if(data?.bestmove) {
            this.engineFinishedCalculation = true;
        }

        const variantStartposFen = data['Fen:'];

        if(variantStartposFen) {
            const dimensions = getBoardDimensionsFromFenStr(variantStartposFen);

            this.setupEnvironment(variantStartposFen, dimensions);
        }
    }

    async loadEngine() {
        if(!window?.SharedArrayBuffer) // COI failed to enable SharedArrayBuffer, loading basic web worker engine
        {
            toast.error(`FATAL ERROR: COI failed to enable SharedArrayBuffer, report issue to GitHub!`, 1e9);
        } else {
            this.engine = await Stockfish(); // Fairy-Stockfish WASM

            this.engineStartNewGame(formatVariant(this.chessVariant));
        
            this.engine.addMessageListener(msg => {
                try {
                    this.engineMessageHandler(msg);
                } catch(e) {
                    console.error('Engine', this.instanceID, 'error:', e);
                }
            });
        }
    }

    setupEnvironment(startpos, dimensions) {
        try {
            const instanceContainerElem = document.querySelector('#acas-instance-container');

            const variantExists = this.chessVariants.includes(formatVariant(this.chessVariant));

            const variant = variantExists ? this.chessVariant : (this.getConfigValue(this.configKeys.chessVariant) || 'chess');

            let variantText = variant;

            if(this.useChess960) {
                variantText += ' (Fischer Random)';
            }

            if(!variantExists && this.chessVariant != 'chess960') {
                variantText += ` <span class="variant-not-supported-text">(${this.chessVariant} not supported)</span>`;
            }

            const chessFont = formatChessFont(this.getConfigValue(this.configKeys.chessFont));

            this.variantStartPosFen = startpos;

            const currentFen = USERSCRIPT.instanceVars.fen.get(this.instanceID);
            const fen = currentFen || this.variantStartPosFen;

            const orientation = USERSCRIPT.instanceVars.playerColor.get(this.instanceID) || 'w';

            const boardDimensions = { 'width': dimensions[0], 'height': dimensions[1] };
            const instanceIdQuery = `[data-instance-id="${this.instanceID}"]`;

            log.info(`Variant: "${variantText}"\n\nFen: "${fen}"\n\nDimension: "${boardDimensions.width}x${boardDimensions.height}"`);

            const boardPieceDimensions = getPieceStyleDimensions(boardDimensions);
            const backgroundSize = getBackgroundStyleDimension(boardDimensions);

            const oldInstanceElem = this.instanceElem ? this.instanceElem : null;

            const acasInstanceElem = document.createElement('div');
                acasInstanceElem.classList.add('acas-instance');
                acasInstanceElem.dataset.instanceId = this.instanceID;
                acasInstanceElem.innerHTML = `
                <div class="highlight-indicator hidden"></div>
                <div class="connection-warning hidden">
                    <div class="connection-warning-title">Losing connection...</div>
                    <div class="connection-warning-subtitle">No messages from this instance for a while</div>
                </div>
                <div class="instance-header">
                    <style class="instance-styling">
                    ${instanceIdQuery} .cg-wrap piece {
                        width: ${boardPieceDimensions.width}%;
                        height: ${boardPieceDimensions.height}%;
                    }
                    ${instanceIdQuery} cg-board square {
                        width: ${boardPieceDimensions.width}%;
                        height: ${boardPieceDimensions.height}%;
                    }
                    ${instanceIdQuery} cg-board {
                        background-size: ${backgroundSize}%;
                    }
                    </style>
                    <div class="instance-basic-info">
                        <div class="instance-variant title="Instance Chess Variant">${variantText}</div>
                        <div class="instance-domain" title="Instance Domain">${this.domain}</div>
                        <div class="instance-fen" title="Instance Fen">${fen}</div>
                    </div>
                    <div class="instance-misc">
                        <div class="instance-settings-btn no-select" title="Open Instance Settings">⚙️</div>
                        <div class="instance-info-text"></div>
                    </div>
                </div>
                <div class="chessboard-components ${chessFont}">
                    <div class="eval-bar">
                        <div class="eval-fill"></div>
                    </div>
                    <div class="chessground-x"></div>
                </div>
                `;

            this.instanceElem = acasInstanceElem;

            const settingsContainerElem = document.querySelector('#acas-settings-container');

            const settingsBtnElem = this.instanceElem.querySelector('.instance-settings-btn');

            settingsBtnElem.onclick = () => {
                document.querySelector(`.dropdown-item[data-instance-id="${this.instanceID}"]`)?.click();
                
                const highlightIndicator = settingsContainerElem.querySelector('.highlight-indicator');

                highlightIndicator.classList.remove('hidden');

                setTimeout(() => highlightIndicator.classList.add('hidden'), 500);
            };

            const chessgroundElem = this.instanceElem.querySelector('.chessground-x');

            new ResizeObserver(entries => {
                const width = entries[0].target.getBoundingClientRect().width;

                chessgroundElem.style.height = `${getBoardHeightFromWidth(width, boardDimensions)}px`;
            }).observe(chessgroundElem);

            this.chessground = window.ChessgroundX(chessgroundElem, { 
                disableContextMenu: true,
                selectable: { enabled: false }, 
                draggable: { enabled: false }, 
                drawable: { enabled: false, eraseOnClick: false }, 
                dimensions: boardDimensions, 
                orientation,
                fen, 
                variant
            });

            if(this.BoardDrawer) {
                this?.BoardDrawer?.terminate();
            }

            this.BoardDrawer = new UniversalBoardDrawer(chessgroundElem, {
                'boardDimensions': [boardDimensions.width, boardDimensions.height],
                'zIndex': 500,
                'prepend': true,
                'debugMode': false,
                orientation
            });

            this.Interface.boardUtils.updateBoardOrientation(orientation);

            if(oldInstanceElem) {
                instanceContainerElem.replaceChild(this.instanceElem, oldInstanceElem);

                log.success(`Engine and GUI for variant "${variant}" updated!`);
            } else {
                instanceContainerElem.appendChild(this.instanceElem);
    
                log.success(`Engine and GUI for variant "${variant}" loaded!`);
    
                this.onLoadCallbackFunction({ 
                    'domain': this.domain, 
                    'id': this.instanceID,
                    'variant': this.chessVariant,
                    'engine': this.engine,
                    'chessground': this.chessground,
                    'element': this.instanceElem,
                    'dimensions': boardDimensions
                });
            }

            const earlyBestMoveRequest = this.unprocessedPackets.find(packet => packet.command === 'calculateBestMoves');

            this.processEarlyPackets();

            if(!earlyBestMoveRequest)
                this.calculateBestMoves(fen);

            this.instanceReady = true;
        } catch(e) { 
            console.error(e);
        }
    }

    async processEarlyPackets() {
        for(let packet of this.unprocessedPackets) {
            await this.processPacket(packet);

            this.unprocessedPackets = this.unprocessedPackets.filter(p => p != packet);
        }
    }

    killEngine() {
        this?.engine?.postMessage('quit');
    }

    close() {
        this.instanceClosed = true;

        this?.killEngine();

        this?.CommLink?.kill();

        this?.BoardDrawer?.terminate();
        this?.instanceElem?.remove();

        removeInstance(this);
    }
}