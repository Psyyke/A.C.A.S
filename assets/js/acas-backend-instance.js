class BackendInstance {
    constructor(domain, instanceID, chessVariant, onLoadCallbackFunction) {
        this.configKeys = {
            'engineElo': 'engineElo',
            'moveSuggestionAmount': 'moveSuggestionAmount',
            'arrowOpacity': 'arrowOpacity',
            'displayMovesOnExternalSite': 'displayMovesOnExternalSite',
            'showMoveGhost': 'showMoveGhost',
            'showOpponentMoveGuess': 'showOpponentMoveGuess',
            'showOpponentMoveGuessConstantly': 'showOpponentMoveGuessConstantly',
            'onlyShowTopMoves': 'onlyShowTopMoves',
            'maxMovetime': 'maxMovetime',
            'chessVariant': 'chessVariant',
            'chessEngine': 'chessEngine',
            'lc0Weight': 'lc0Weight',
            'engineNodes': 'engineNodes',
            'chessFont': 'chessFont',
            'useChess960': 'useChess960',
            'onlyCalculateOwnTurn': 'onlyCalculateOwnTurn',
            'ttsVoiceEnabled': 'ttsVoiceEnabled',
            'ttsVoiceName': 'ttsVoiceName',
            'ttsVoiceSpeed': 'ttsVoiceSpeed'
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

        this.chessVariants = ['chess'];

        this.onLoadCallbackFunction = onLoadCallbackFunction;

        this.engines = [];
        this.chessEngineType = this.getConfigValue(this.configKeys.chessEngine);
        this.lc0WeightName = this.getConfigValue(this.configKeys.lc0Weight);
        this.chessground = null;
        this.instanceElem = null;
        this.BoardDrawer = null;

        this.variantStartPosFen = null;

        this.searchDepth = null;
        this.engineNodes = 1;
 
        this.currentMovetimeTimeout = null;

        this.pastMoveObjects = [];
        this.bestMoveMarkingElem = null;
        this.activeGuiMoveMarkings = [];
        this.inactiveGuiMoveMarkings = [];
        this.unprocessedPackets = [];

        this.lastCalculatedFen = null;
        this.pendingCalculations = [];

        this.lastFen = null;
        this.lastOrientation = null;
        this.currentFen = null;

        this.currentSpeeches = [];

        this.defaultStartpos = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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
        this.CommLink.registerSendCommand('removeSiteMoveMarkings');
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
                    this.updateSettings(msg);
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
            markMoves: moveObjArr => {
                this.Interface.boardUtils.removeMarkings();

                const maxScale = 1;
                const minScale = 0.5;
                const totalRanks = moveObjArr.length;
                const showOpponentMoveGuess = this.getConfigValue(this.configKeys.showOpponentMoveGuess);
                const showOpponentMoveGuessConstantly = this.getConfigValue(this.configKeys.showOpponentMoveGuessConstantly);

                moveObjArr.forEach((markingObj, idx) => {
                    const [from, to] = markingObj.player;
                    const [oppFrom, oppTo] = markingObj.opponent;
                    const oppMovesExist = oppFrom && oppTo;
                    const rank = idx + 1;
                    
                    let playerArrowElem = null;
                    let oppArrowElem = null;
                    let arrowStyle = this.arrowStyles.best;
                    let lineWidth = 30;
                    let arrowheadWidth = 80;
                    let arrowheadHeight = 60;
                    let startOffset = 30;
        
                    if(idx !== 0) {
                        arrowStyle = this.arrowStyles.secondary;
        
                        const arrowScale = totalRanks === 2
                            ? 0.75
                            : maxScale - (maxScale - minScale) * ((rank - 1) / (totalRanks - 1));
        
                        lineWidth = lineWidth * arrowScale;
                        arrowheadWidth = arrowheadWidth * arrowScale;
                        arrowheadHeight = arrowheadHeight * arrowScale;
                        startOffset = startOffset;
                    }
                    
                    playerArrowElem = this.BoardDrawer.createShape('arrow', [from, to],
                        {
                            style: arrowStyle,
                            lineWidth, arrowheadWidth, arrowheadHeight, startOffset
                        }
                    );
        
                    if(oppMovesExist && showOpponentMoveGuess) {
                        oppArrowElem = this.BoardDrawer.createShape('arrow', [oppFrom, oppTo],
                            {
                                style: this.arrowStyles.opponent,
                                lineWidth, arrowheadWidth, arrowheadHeight, startOffset
                            }
                        );

                        if(showOpponentMoveGuessConstantly) {
                            oppArrowElem.style.display = 'block';
                        } else {
                            const squareListener = this.BoardDrawer.addSquareListener(from, type => {
                                if(!oppArrowElem) {
                                    squareListener.remove();
                                }
            
                                switch(type) {
                                    case 'enter':
                                        oppArrowElem.style.display = 'inherit';
                                        break;
                                    case 'leave':
                                        oppArrowElem.style.display = 'none';
                                        break;
                                }
                            });
                        }
                    }
        
                    if(idx === 0 && playerArrowElem) {
                        const parentElem = playerArrowElem.parentElement;
        
                        // move best arrow element on top (multiple same moves can hide the best move)
                        parentElem.appendChild(playerArrowElem);
        
                        if(oppArrowElem) {
                            parentElem.appendChild(oppArrowElem);
                        }
                    }

                    this.activeGuiMoveMarkings.push({ ...markingObj, playerArrowElem, oppArrowElem });
                });

                this.pastMoveObjects = [];
            },
            removeMarkings: () => {
                this.activeGuiMoveMarkings.forEach(markingObj => {
                    markingObj.oppArrowElem?.remove();
                    markingObj.playerArrowElem?.remove();
                });

                this.activeGuiMoveMarkings = [];
            },
            updateBoardFen: fen => {
                if(this.currentFen !== fen) {
                    this.currentFen = fen;

                    USERSCRIPT.instanceVars.fen.set(this.instanceID, fen);

                    this.chessground.set({ fen });
    
                    this.instanceElem.querySelector('.instance-fen').innerText = fen;
                    
                    this.engineStopCalculating();
                    this.Interface.boardUtils.removeMarkings();
            
                    this.currentSpeeches.forEach(synthesis => synthesis.cancel());
                    this.currentSpeeches = [];

                    this.calculateBestMoves(fen);
                }
            },
            updateBoardOrientation: orientation => {
                if(orientation != this.lastOrientation) {
                    this.lastOrientation = orientation;
                    this.lastCalculatedFen = null;

                    const orientationWord = orientation == 'b' ? 'black' : 'white';

                    const evalBarElem = this.instanceElem.querySelector('.eval-bar');
    
                    if(orientation == 'b')
                        evalBarElem.classList.add('reversed');
                    else
                        evalBarElem.classList.remove('reversed');
    
                    this.chessground.toggleOrientation();
                    this.chessground.redrawAll();
                    this.chessground.set({ 'orientation': orientationWord });
    
                    this.BoardDrawer.setOrientation(orientation);
                }
            }
        },
        updateMoveProgress: (text, status) => {
            const infoTextElem = this.instanceElem.querySelector('.instance-info-text');
    
            infoTextElem.innerText = text;

            const statusArr = ['info-text-winning', 'info-text-losing'];

            if(typeof status === 'number' && status !== 0) {
                infoTextElem.classList.add(statusArr[status === 1 ? 0 : 1]);
                infoTextElem.classList.remove(statusArr[status === 1 ? 1 : 0]);
            } else {
                infoTextElem.classList.remove(statusArr[0]);
                infoTextElem.classList.remove(statusArr[1]);
            }

            infoTextElem.classList.remove('hidden');
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

    setEngineElo(elo, didUserUpdateSetting) {
        if(typeof elo == 'number') {
            const limitStrength = 0 < elo && elo <= 2600;

            this.sendMsgToEngine(`setoption name UCI_Elo value ${elo}`);

            if(limitStrength) {
                this.setEngineLimitStrength(true);
    
                const skillLevel = getSkillLevelFromElo(elo);
                this.setEngineSkillLevel(skillLevel);
    
                const depth = getDepthFromElo(elo);
                this.searchDepth = depth;

                if(didUserUpdateSetting)
                    toast.message(`Engine skill level ${skillLevel}, search depth ${depth}`, 8000);
            } else {
                this.setEngineLimitStrength(false);

                this.setEngineSkillLevel(20);

                if(elo !== 3200) {
                    const depth = getDepthFromElo(elo);
                    this.searchDepth = depth;

                    if(didUserUpdateSetting)
                        toast.message(`Engine not limited in strength, search depth ${depth}`, 8000);
                } else {
                    this.searchDepth = null;

                    if(didUserUpdateSetting)
                        toast.message(`Engine has no strength limitations, running infinite depth!`, 8000);
                }
            }
        }
    }

    setEngineNodes(nodeAmount) {
        if(this.lc0WeightName.includes('maia') && nodeAmount !== 1) {
            toast.warning('Maia weights work best with no search, please only use one (1) search node!', 30000);
        }

        this.engineNodes = nodeAmount;
    }

    async setEngineWeight(weightName) {
        // legacy support, convert 1100 -> maia-1100.pb etc.
        if(/^\d{4}(,\d{3})*$/.test(weightName)) {
            weightName = `maia-${weightName}.pb`;
        }

        this.lc0WeightName = weightName;

        this.getEngine().setZeroWeights(await loadFileAsUint8Array(`/A.C.A.S/assets/lc0-weights/${weightName}`));
    }

    disableEngineElo() {
        this.sendMsgToEngine(`setoption name UCI_LimitStrength value false`);
    }

    setEngineMultiPV(amount) {
        if(typeof amount == 'number') {
            this.sendMsgToEngine(`setoption name MultiPV value ${amount}`);
        }
    }

    setEngineSkillLevel(amount) {
        if(typeof amount == 'number' && -20 <= amount && amount <= 20) {
            this.sendMsgToEngine(`setoption name UCI_LimitStrength value ${amount}`);
        }
    }

    setEngineLimitStrength(bool) {
        if(typeof bool == 'boolean') {
            this.sendMsgToEngine(`setoption name UCI_LimitStrength value ${bool}`);
        }
    }

    set960Mode(val) {
        const bool = val ? true : false;

        this.sendMsgToEngine(`setoption name UCI_Chess960 value ${bool}`);

        this.useChess960 = bool;
    }

    setEngineVariant(variant) {
        if(typeof variant == 'string') {
            this.sendMsgToEngine(`setoption name UCI_Variant value ${variant}`);

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

        if(!this.isEngineNotCalculating()) {
            this.engineStopCalculating();
        }

        this.sendMsgToEngine('ucinewgame'); // very important to be before setting variant and so forth
        this.sendMsgToEngine('uci'); // to display variants

        this.setEngineMultiPV(this.getConfigValue(this.configKeys.moveSuggestionAmount));

        switch(this.chessEngineType) {
            case 'lc0':
                this.setEngineNodes(this.getConfigValue(this.configKeys.engineNodes));
                this.sendMsgToEngine('position startpos');

                break;
            default:
                this.setEngineVariant(chessVariant);
                this.setEngineElo(this.getConfigValue(this.configKeys.engineElo));    

                this.sendMsgToEngine('position startpos');
                this.sendMsgToEngine('d');
                break;
        }
    }

    engineStopCalculating() {
        if(!this.isEngineNotCalculating()) {
            clearTimeout(this.currentMovetimeTimeout);
        }

        console.error('STOP!');

        this.sendMsgToEngine('stop');
    }

    isPlayerTurn(lastFen, currentFen) {
        const playerColor = USERSCRIPT.instanceVars.playerColor.get(this.instanceID);
        const turn = this.getTurnFromFenChange(lastFen, currentFen);

        console.error('Turn: ', turn);

        return !playerColor || turn == playerColor;
    }

    speak(spokenText, speechConfig) {
        const isTTSEnabled = this.getConfigValue(this.configKeys.ttsVoiceEnabled);

        if(isTTSEnabled) {
            const ttsVoiceName = this.getConfigValue(this.configKeys.ttsVoiceName);
            const ttsVoiceSpeed = this.getConfigValue(this.configKeys.ttsVoiceSpeed);

            const speechConfig = {
                rate: ttsVoiceSpeed / 10,
                pitch: 1,
                volume: 1
            };

            if(ttsVoiceName?.toLowerCase() != 'default') {
                speechConfig.voiceName = ttsVoiceName;
            }

            console.log(`Speaking: ${spokenText} (Instance "${this.instanceID}")`);

            this.currentSpeeches.push(speakText(spokenText, speechConfig));
        }
    }

    updateSettings(updateObj) {
        function findSettingKeyFromData(key) {
            return Object.values(updateObj?.data)?.includes(key);
        }
        
        const didUpdateVariant = findSettingKeyFromData(this.configKeys.chessVariant);
        const didUpdateElo = findSettingKeyFromData(this.configKeys.engineElo);
        const didUpdateLc0Weight = findSettingKeyFromData(this.configKeys.lc0Weight);
        const didUpdateChessFont = findSettingKeyFromData(this.configKeys.chessFont);
        const didUpdateMultiPV = findSettingKeyFromData(this.configKeys.moveSuggestionAmount);
        const didUpdate960Mode = findSettingKeyFromData(this.configKeys.useChess960);
        const didUpdateChessEngine = findSettingKeyFromData(this.configKeys.chessEngine);
        const didUpdateNodes = findSettingKeyFromData(this.configKeys.engineNodes);

        const chessVariant = formatVariant(this.getConfigValue(this.configKeys.chessVariant));
        const useChess960 = this.getConfigValue(this.configKeys.useChess960);

        if(didUpdateVariant || didUpdate960Mode) {
            this.set960Mode(useChess960);

            this.engineStartNewGame(didUpdateVariant ? chessVariant : this.chessVariant);
        } else {
            if(didUpdateChessFont)
                this.setChessFont(this.getConfigValue(this.configKeys.chessFont));

            if(didUpdateChessEngine) {
                this.chessEngineType = updateObj.data.value;

                this.loadEngine();
            }

            if(didUpdateElo)
                this.setEngineElo(this.getConfigValue(this.configKeys.engineElo), true);

            if(didUpdateNodes)
                this.setEngineNodes(this.getConfigValue(this.configKeys.engineNodes));

            if(didUpdateLc0Weight)
                this.setEngineWeight(this.getConfigValue(this.configKeys.lc0Weight), true);

            if(didUpdateMultiPV)
                this.setEngineMultiPV(this.getConfigValue(this.configKeys.moveSuggestionAmount));

            if(didUpdate960Mode)
                this.set960Mode(useChess960);
        }
    }

    isAbnormalPieceChange(lastFen, newFen) {
        if(!lastFen) return false;
    
        const lastPieceCount = countTotalPieces(lastFen);
        const newPieceCount = countTotalPieces(newFen);

        // (need to implement fix for variants which may add pieces legally)
        const countChange = newPieceCount - lastPieceCount;

        /* Possible "countChange" value explanations,
            (countChange < -1) -> multiple pieces have disappeared (atomic chess variant or a faulty newFen?)
            (countChange = -1) -> piece has been eaten
            (countChange = 0)  -> piece moved
            (countChange = 1)  -> piece has spawned
            (countChange > 1)  -> multiple pieces have spawned (possibly a new game?)
        */
    
        // Large abnormal piece changes are allowed, as they usually mean something significant has happened
        // Smaller abnormal piece changes are most likely caused by a faulty newFen provided by the A.C.A.S on the site
        return (-3 < countChange && countChange < -1) || (0 < countChange && countChange < 2);
    }

    // Kind of similar to isAbnormalPieceChange function, however it focuses on titles rather than pieces
    // It checks for how many titles had changes happen in them
    isCorrectAmountOfBoardChanges(lastFen, newFen) {
        if(!lastFen) return true;
    
        let board1 = lastFen.split(" ")[0].replace(/\d/g, d => ' '.repeat(d)).split('/').join('');
        let board2 = newFen.split(" ")[0].replace(/\d/g, d => ' '.repeat(d)).split('/').join('');
        
        let diff = 0;

        for (let i = 0; i < board1.length; i++) {
            if (board1[i] !== board2[i]) {
                diff += 1;
            }
        }
        
        /* Possible "diff" value explanations,
            (diff = 0) -> no changes, same board layout
            (diff = 1) -> only one title abruptly changed, shouldn't be possible
            (diff = 2) -> a piece moved, maybe it ate another piece
            (diff = 3) -> three titles had changes, shouldn't be possible
            (diff > 3) -> a lot of titles had changes, maybe a new game started, the change is significant so allowing it
        */

        return diff === 2 || diff > 3;
    }

    getTurnFromFenChange(lastFen, newFen) {
        const currentPlayerColor = USERSCRIPT.instanceVars.playerColor.get(this.instanceID);
        const onlyCalculateOwnTurn = this.getConfigValue(this.configKeys.onlyCalculateOwnTurn);

        if(!lastFen || !onlyCalculateOwnTurn) return currentPlayerColor;

        const lastBoard = lastFen.split(' ')[0];
        const newBoard = newFen.split(' ')[0];
    
        const lastBoardArray = fenToArray(lastBoard);
        const newBoardArray = fenToArray(newBoard);

        const isNewFenDefaultPos = newFen.split(' ')[0] == this.defaultStartpos.split(' ')[0];
    
        const dimensions = getBoardDimensionsFromFenStr(newFen);
        const boardDimensions = { 'width': dimensions[0], 'height': dimensions[1] };

        let movedPiece = '';
        let amountOfMovedPieces = 0;
    
        for (let i = 0; i < boardDimensions.width; i++) {
            for (let j = 0; j < boardDimensions.height; j++) {
                if (lastBoardArray[i][j] !== newBoardArray[i][j]) {
                    if(newBoardArray[i][j] === '') {
                        movedPiece = lastBoardArray[i][j];

                        amountOfMovedPieces++;
                    }
                }
            }
        }

        // When a lot of pieces are moved, it's most likely a new game
        if(amountOfMovedPieces > 3 || isNewFenDefaultPos) {
            // Clear the pendingCalculations arr of old calculations
            this.pendingCalculations = this.pendingCalculations.filter(x => !x?.finished);
            
            return currentPlayerColor;
        }

        const turn = movedPiece.toUpperCase() === movedPiece ? 'b' : 'w';
    
        return turn;
    }

    async calculateBestMoves(currentFen) {
        const onlyCalculateOwnTurn = this.getConfigValue(this.configKeys.onlyCalculateOwnTurn);

        const correctAmountOfChanges = this.isCorrectAmountOfBoardChanges(this.lastFen, currentFen);
        const isAbnormalPieceChange = this.isAbnormalPieceChange(this.lastFen, currentFen);

        let isPlayerTurn = false;
        
        if(correctAmountOfChanges && !isAbnormalPieceChange) {
            isPlayerTurn = this.isPlayerTurn(this.lastFen, currentFen);

            this.lastFen = currentFen;
        }

        const isFenChanged = this.lastCalculatedFen !== currentFen
        const isFenChangeAllowed = !onlyCalculateOwnTurn || (correctAmountOfChanges && !isAbnormalPieceChange && isPlayerTurn)

        if(isFenChanged && isFenChangeAllowed) {
            this.lastCalculatedFen = currentFen;
        } else {
            this.CommLink.commands.removeSiteMoveMarkings();

            return;
        }

        this.pendingCalculations.push({ 'fen': currentFen, 'finished': false });

        this.Interface.boardUtils.removeMarkings();

        console.error('CALCULATING!', this.pendingCalculations, currentFen);

        log.info(`Fen: "${currentFen}"`);
        log.info(`Updating board Fen`);

        this.Interface.boardUtils.updateBoardFen(currentFen);
    
        log.info('Sending best move request to the engine!');
    
        this.sendMsgToEngine(`position fen ${currentFen}`);

        let searchCommandStr = 'go infinite';

        switch(this.chessEngineType) {
            case 'lc0':
                searchCommandStr = `go nodes ${this.engineNodes}`;
            break;

            default: // Fairy Stockfish NNUE WASM
                if(this.searchDepth) {
                    searchCommandStr = `go depth ${this.searchDepth}`;
                }
            break;
        }

        this.sendMsgToEngine(searchCommandStr);

        const movetime = this.getConfigValue(this.configKeys.maxMovetime);

        if(typeof movetime == 'number') {
            const startFen = this.currentFen;

            this.currentMovetimeTimeout = setTimeout(() => {
                if(startFen == this.currentFen && movetime != 0 && !this.isEngineNotCalculating()) {
                    this.engineStopCalculating();
                }
            }, movetime + 5);
        }
    }

    getEngineAcasObj(i) {
        return this.engines[i ? i : this.engines.length - 1];
    }

    getEngine(i) {
        return this.getEngineAcasObj(i)['engine'];
    }

    sendMsgToEngine(msg, i) {
        this.getEngineAcasObj(i).sendMsg(msg);
    }

    isEngineNotCalculating() {
        return this.pendingCalculations.find(x => !x.finished) ? false : true;
    }

    engineMessageHandler(msg) {
        const data = parseUCIResponse(msg);
        const oldestUnfinishedCalcRequestObj = this.pendingCalculations.find(x => !x.finished);
        const isMessageForCurrentFen = oldestUnfinishedCalcRequestObj?.fen === this.currentFen;

        if(!data?.currmovenumber) console.warn(msg, `(FOR FEN: ${oldestUnfinishedCalcRequestObj?.fen})`);

        if(msg.includes('option name UCI_Variant type combo')) {
            const chessVariants = extractVariantNames(msg);

            this.chessVariants = chessVariants;

            this.guiBroadcastChannel.postMessage({ 'type': 'updateChessVariants', 'data' : chessVariants });
        }

        if(msg.includes('info')) {
            if(data?.multipv === '1') {
                if(data?.depth) {
                    if(data?.mate) {
                        const isWinning = data.mate > 0;
                        const mateText = `${isWinning ? 'Win' : 'Lose'} in ${Math.abs(data.mate)}`;

                        this.Interface.updateMoveProgress(`${mateText} | Depth ${data.depth}`, isWinning ? 1 : 2);
                    } else {
                        this.Interface.updateMoveProgress(`Depth ${data.depth}`, 0);
                    }
                }
    
                if(data?.cp)
                    this.Interface.updateEval(data.cp);
    
                if(data?.mate) 
                    this.Interface.updateEval(data.mate, true);
            }
        }

        if(data?.pv && isMessageForCurrentFen) {
            const moveRegex = /[a-zA-Z]\d+/g;
            const ranking = convertToCorrectType(data?.multipv) || 1;
            let moves = data.pv.split(' ').map(move => move.match(moveRegex));

            if(moves?.length === 1) // if no opponent move guesses yet
                moves = [...moves, [null, null]];

            const [[from, to], [opponentFrom, opponentTo]] = moves;

            const moveObj = { 'player': [from, to], 'opponent': [opponentFrom, opponentTo], ranking };

            this.pastMoveObjects.push(moveObj);

            const isMovetimeLimited = this.getConfigValue(this.configKeys.maxMovetime) ? true : false;
            const onlyShowTopMoves = this.getConfigValue(this.configKeys.onlyShowTopMoves);
            const displayMovesExternally = this.getConfigValue(this.configKeys.displayMovesOnExternalSite);
            
            let isSearchInfinite = this.searchDepth ? false : true;

            if(this.chessEngineType === 'lc0') {
                isSearchInfinite = this.engineNodes > 9e6 ? true : false;
            }

            const markingLimit = this.getConfigValue(this.configKeys.moveSuggestionAmount);
            const topMoveObjects = this.pastMoveObjects?.slice(markingLimit * -1);

            if(topMoveObjects.length === markingLimit) {
                this.Interface.boardUtils.markMoves(topMoveObjects);

                topMoveObjects.forEach(moveObj => {
                    const spokenText = moveObj.player?.map(x =>
                        x.split('').map(x =>`"${x}"`).join(' ') // e.g a1 -> "a" "1"
                    ).join(', ');

                    this.speak(spokenText);
                });

                if(displayMovesExternally) {
                    this.CommLink.commands.markMoveToSite(topMoveObjects);
                }
            }
        }

        if(data?.bestmove) {
            oldestUnfinishedCalcRequestObj.finished = true;

            if(isMessageForCurrentFen && this.activeGuiMoveMarkings.length === 0) {
                const markingLimit = this.getConfigValue(this.configKeys.moveSuggestionAmount);
                const displayMovesExternally = this.getConfigValue(this.configKeys.displayMovesOnExternalSite);

                let topMoveObjects = this.pastMoveObjects?.slice(markingLimit * -1);

                if(topMoveObjects?.length === 0) {
                    topMoveObjects = [];
                    topMoveObjects.push({ 'player': [data.bestmove.slice(0,2), data.bestmove.slice(2, data.bestmove.length)], 'opponent': [null, null], 'ranking': 1  });
                }

                this.Interface.boardUtils.markMoves(topMoveObjects);

                if(displayMovesExternally) {
                    this.CommLink.commands.markMoveToSite(topMoveObjects);
                }

                topMoveObjects.forEach(moveObj => {
                    const spokenText = moveObj.player?.map(x =>
                        x.split('').map(x =>`"${x}"`).join(' ') // e.g a1 -> "a" "1"
                    ).join(', ');

                    this.speak(spokenText);
                });
            }
        }

        const variantStartposFen = data['Fen:'];

        if(variantStartposFen) {
            const dimensions = getBoardDimensionsFromFenStr(variantStartposFen);

            this.setupEnvironment(variantStartposFen, dimensions);
        }
        
        if(msg === 'uciok' && this.chessEngineType === 'lc0') {
            this.setupEnvironment(this.defaultStartpos, [8, 8]);
        }
    }

    async loadEngine() {
        if(!window?.SharedArrayBuffer) // COI failed to enable SharedArrayBuffer, loading basic web worker engine
        {
            toast.error(`FATAL ERROR: COI failed to enable SharedArrayBuffer, report issue to GitHub!`, 1e9);
        } else {
            this.killExtraEngines();

            const msgHandler = msg => {
                try {
                    this.engineMessageHandler(msg);
                } catch(e) {
                    console.error('Engine', this.instanceID, 'error:', e);
                }
            }
            
            switch(this.chessEngineType) {
                case 'lc0':
                    const waitForZeroFish = setInterval(async () => {
                        if(typeof zerofish !== 'undefined') {
                            clearInterval(waitForZeroFish);

                            this.engines.push({
                                'type': this.chessEngineType,
                                'engine': await zerofish(),
                                'sendMsg': msg => this.getEngine().zero(msg)
                            });
        
                            const ZeroFish = this.getEngine();
                            
                            ZeroFish.listenZero = msgHandler;
        
                            await this.setEngineWeight(this.lc0WeightName);
        
                            this.engineStartNewGame('chess');
                        }
                    }, 100);
                break;

                default: // Fairy Stockfish NNUE WASM
                    this.engines.push({
                        'type': this.chessEngineType,
                        'engine': await Stockfish(),
                        'sendMsg': msg => this.getEngine().postMessage(msg)
                    });

                    const FairyStockfish = this.getEngine();

                    FairyStockfish.addMessageListener(msgHandler);

                    this.engineStartNewGame(formatVariant(this.chessVariant));
                break;
            }
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
                variantText += ` (${this.chessVariant} not supported)`;
            }

            const onlyCalculateOwnTurn = this.getConfigValue(this.configKeys.onlyCalculateOwnTurn);

            if(variant != 'chess' && onlyCalculateOwnTurn) {
                toast.warning(`"Only Own Turn" setting might not work for variants! (todo)`, 5000);
            }

            const chessFont = formatChessFont(this.getConfigValue(this.configKeys.chessFont));

            this.variantStartPosFen = startpos;

            const currentFen = USERSCRIPT.instanceVars.fen.get(this.instanceID);
            const fen = currentFen || this.variantStartPosFen;

            const orientation = USERSCRIPT.instanceVars.playerColor.get(this.instanceID) || 'w';

            const boardDimensions = { 'width': dimensions[0], 'height': dimensions[1] };
            const instanceIdQuery = `[data-instance-id="${this.instanceID}"]`;

            this.currentFen = fen;

            this.pendingCalculations = [];

            log.info(`Variant: "${variantText}"\n\nFen: "${fen}"\n\nDimension: "${boardDimensions.width}x${boardDimensions.height}"`);

            const boardPieceDimensions = getPieceStyleDimensions(boardDimensions);
            const backgroundSize = getBackgroundStyleDimension(boardDimensions);

            const oldInstanceElem = this.instanceElem ? this.instanceElem : null;

            // To avoid XSS do not put data from external sites directly inside the innerHTML string using templates!
            // InstanceIdQuery, boardPieceDimensions and such are safe since they don't contain external data.
            const acasInstanceElem = document.createElement('div');
                acasInstanceElem.classList.add('acas-instance');
                acasInstanceElem.dataset.instanceId = this.instanceID;
                acasInstanceElem.innerHTML = `
                <div class="highlight-indicator hidden"></div>
                <div class="connection-warning hidden">
                    <div class="connection-warning-title">Losing connection</div>
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
                        <div class="instance-variant" title="Instance Chess Variant"></div>
                        <div class="instance-domain" title="Instance Domain"></div>
                        <div class="instance-fen-container">
                            <div class="instance-fen-btn acas-fancy-button">Show Fen</div>
                            <div class="instance-fen hidden" title="Instance Fen"></div>
                        </div>
                    </div>
                    <div class="instance-misc">
                        <div class="instance-settings-btn acas-fancy-button" title="Open Instance Settings">⚙️</div>
                        <div class="instance-info-text"></div>
                    </div>
                </div>
                <div class="chessboard-components">
                    <div class="eval-bar">
                        <div class="eval-fill"></div>
                    </div>
                    <div class="chessground-x"></div>
                </div>
                `;

            acasInstanceElem.style.width = `${Number(localStorage.getItem('instanceSize')) * Number(localStorage.getItem('boardSizeModifier'))}px`;

            const instanceChessVariantElem = acasInstanceElem.querySelector('.instance-variant');
            const instanceDomainElem = acasInstanceElem.querySelector('.instance-domain');
            const instanceFenElem = acasInstanceElem.querySelector('.instance-fen');
            const showFenBtn = acasInstanceElem.querySelector('.instance-fen-btn');
            const chessboardComponentsElem = acasInstanceElem.querySelector('.chessboard-components');

            showFenBtn.onclick = function() {
                instanceFenElem.classList.toggle('hidden');

                const didHide = showFenBtn.innerText.includes('Show');

                if(didHide) {
                    showFenBtn.innerText = showFenBtn.innerText.replace('Show', 'Hide');
                } else {
                    showFenBtn.innerText = showFenBtn.innerText.replace('Hide', 'Show');
                }
            }

            instanceChessVariantElem.innerText = variantText;
            instanceDomainElem.innerText = this.domain;
            instanceFenElem.innerText = fen;

            chessboardComponentsElem.classList.add(chessFont);

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
                    'engine': this.getEngine(),
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

    killEngine(i) {
        const engine = this.engines[i].engine;

        this.sendMsgToEngine('quit', i);

        const freeFunction = engine?.['_free'];
        
        if(freeFunction)
            engine?._free();

        this.engines = this.engines.slice(1);
    }

    killExtraEngines() {
        for(let i = 0; i < this.engines.length; i++) {
            if(this.engines.length - 1 !== i) {
                this.killEngine(i);
            }
        }
    }

    killEngines() {
        for(let i = 0; i < this.engines.length; i++) {
            this.killEngine(i);
        }
    }

    close() {
        this.instanceClosed = true;

        this?.killEngines();

        this?.CommLink?.kill();

        this?.BoardDrawer?.terminate();
        this?.instanceElem?.remove();

        removeInstance(this);
    }
}