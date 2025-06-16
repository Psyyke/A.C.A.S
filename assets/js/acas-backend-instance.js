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
            'ttsVoiceSpeed': 'ttsVoiceSpeed',
            'chessEngineProfile': 'chessEngineProfile',
            'primaryArrowColorHex': 'primaryArrowColorHex',
            'secondaryArrowColorHex': 'secondaryArrowColorHex',
            'opponentArrowColorHex': 'opponentArrowColorHex',
            'reverseSide': 'reverseSide',
            'engineEnabled': 'engineEnabled',
            'autoMove': 'autoMove',
            'autoMoveLegit': 'autoMoveLegit',
            'autoMoveRandom': 'autoMoveRandom',
            'autoMoveAfterUser': 'autoMoveAfterUser',
            'legitModeType': 'legitModeType',
            'moveDisplayDelay': 'moveDisplayDelay',
            'renderSquarePlayer': 'renderSquarePlayer',
            'renderSquareEnemy': 'renderSquareEnemy',
            'renderSquareContested': 'renderSquareContested',
            'renderSquareSafe': 'renderSquareSafe',
            'renderPiecePlayerCapture': 'renderPiecePlayerCapture',
            'renderPieceEnemyCapture': 'renderPieceEnemyCapture',
            'renderOnExternalSite': 'renderOnExternalSite',
            'feedbackOnExternalSite': 'feedbackOnExternalSite',
            'enableMoveRatings': 'enableMoveRatings',
            'enableEnemyFeedback': 'enableEnemyFeedback',
            'feedbackEngineDepth': 'feedbackEngineDepth',
            'enableAdvancedElo': 'enableAdvancedElo',
            'advancedElo': 'advancedElo',
            'advancedEloDepth': 'advancedEloDepth',
            'advancedEloSkill': 'advancedEloSkill',
            'advancedEloMaxError': 'advancedEloMaxError',
            'advancedEloProbability': 'advancedEloProbability',
            'advancedEloHash': 'advancedEloHash',
            'advancedEloThreads': 'advancedEloThreads'
        };

        this.config = {};

        Object.values(this.configKeys).forEach(key => {
            this.config[key] = {
                get: profile => getGmConfigValue(key, this.instanceID, profile),
                set: null
            };
        });

        this.getConfigValue = async (key, profile) => {
            return await this.config[key]?.get(profile);
        }
    
        // Not in use
        this.setConfigValue = (key, val, profile) => {
            return this.config[key]?.set(val, profile);
        }

        this.instanceReady = false;
        this.instanceClosed = false;

        this.domain = domain;
        this.instanceID = instanceID;

        this.onLoadCallbackFunction = onLoadCallbackFunction;

        this.chessground = null;
        this.instanceElem = null;
        this.BoardDrawer = null;

        this.engines = [];
        this.pV = {}; // profile variables

        this.unprocessedPackets = [];
        this.currentFen = null;

        this.variantStartPosFen = null;

        this.environmentSetupRun = false;

        this.lastOrientation = null;
        this.lastTurn = null;

        this.activeEnginesAmount = 0;
        this.guiUpdaterActive = false;
        this.variantNotSupportedByEngineAmount;

        this.MoveEval = new MoveEvaluator();

        this.moveDiffHistory = [];
        
        this.profileVariables = class {
            constructor() {
                this.chessVariants = ['chess'];
        
                this.chessVariant = null;
                this.useChess960 = null;
                this.lc0WeightName = null;
        
                this.searchDepth = null;
                this.engineNodes = 1;
        
                this.currentMovetimeTimeout = null;
        
                this.pastMoveObjects = [];
                this.bestMoveMarkingElem = null;
                this.activeGuiMoveMarkings = [];
                this.activeMetrics = [];
                this.activeFeedbackDisplays = [];
        
                this.lastCalculatedFen = null;
                this.pendingCalculations = [];
        
                this.lastFen = null;
                this.lastFeedbackFen = null;
        
                this.currentSpeeches = [];
            }
        
            static async create(t, profile) {
                const instance = new this();
        
                const variantFromConfig = await t.getConfigValue(t.configKeys.chessVariant, profile);
                const use960FromConfig = await t.getConfigValue(t.configKeys.useChess960, profile);

                instance.chessVariant = isVariant960(chessVariant)
                    ? formatVariant('chess')
                    : formatVariant(chessVariant || variantFromConfig || 'chess');
                instance.useChess960 = isVariant960(chessVariant) ? true : use960FromConfig;
                instance.lc0WeightName = await t.getConfigValue(t.configKeys.lc0Weight, profile);
        
                return instance;
            }
        };
        
        this.defaultStartpos = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

        this.CommLink = new CommLinkHandler(`backend_${this.instanceID}`, {
            'singlePacketResponseWaitTime': 1500,
            'maxSendAttempts': 3,
            'statusCheckInterval': 1,
            'functions': {
                'getValue': USERSCRIPT.getValue,
                'setValue': USERSCRIPT.setValue,
                'deleteValue': USERSCRIPT.deleteValue,
                'listValues': USERSCRIPT.listValues,
            }
        });

        this.CommLink.registerSendCommand('ping');
        this.CommLink.registerSendCommand('getFen');
        this.CommLink.registerSendCommand('removeSiteMoveMarkings');
        this.CommLink.registerSendCommand('markMoveToSite');
        this.CommLink.registerSendCommand('renderMetricsToSite');
        this.CommLink.registerSendCommand('feedbackToSite');

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

        this.loadEngines();
    }

    async loadEngines() {
        const profiles = await getProfiles();
        const activeProfiles = profiles.filter(p => p.config.engineEnabled);

        for (const profileObj of activeProfiles) {
            this.pV[profileObj.name] = await this.profileVariables.create(this, profileObj);
            this.loadEngine(profileObj.name);
        }        
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

    getArrowStyle(type, fill, opacity) {
        const baseStyleArr = [
            'stroke: rgb(0 0 0 / 50%);',
            'stroke-width: 2px;',
            'stroke-linejoin: round;'
        ];
    
        switch(type) {
            case 'best': 
                return [
                    `fill: ${fill || 'limegreen'};`,
                    `opacity: ${opacity || 0.9};`,
                    ...baseStyleArr
                ].join('\n');
            case 'secondary': 
                return [
                    ...baseStyleArr,
                    `fill: ${fill ? fill : 'dodgerblue'};`,
                    `opacity: ${opacity || 0.7};`,
                ].join('\n');
            case 'opponent':
                return [
                    ...baseStyleArr,
                    `fill: ${fill ? fill : 'crimson'};`,
                    `opacity: ${opacity || 0.3};`,
                ].join('\n');
        }
    };

    Interface = {
        boardUtils: {
            markMoves: async (moveObjArr, profile) => {
                this.Interface.boardUtils.removeMarkings(profile);

                const maxScale = 1;
                const minScale = 0.5;
                const totalRanks = moveObjArr.length;
                const arrowOpacity = await this.getConfigValue(this.configKeys.arrowOpacity, profile) / 100;
                const showOpponentMoveGuess = await this.getConfigValue(this.configKeys.showOpponentMoveGuess, profile);
                const showOpponentMoveGuessConstantly = await this.getConfigValue(this.configKeys.showOpponentMoveGuessConstantly, profile);
                const primaryArrowColorHex = await this.getConfigValue(this.configKeys.primaryArrowColorHex, profile);
                const secondaryArrowColorHex = await this.getConfigValue(this.configKeys.secondaryArrowColorHex, profile);
                const opponentArrowColorHex = await this.getConfigValue(this.configKeys.opponentArrowColorHex, profile);

                moveObjArr.forEach((markingObj, idx) => {
                    const [from, to] = markingObj.player;
                    const [oppFrom, oppTo] = markingObj.opponent;
                    const oppMovesExist = oppFrom && oppTo;
                    const rank = idx + 1;
                    
                    let playerArrowElem = null;
                    let oppArrowElem = null;
                    let arrowStyle = this.getArrowStyle('best', primaryArrowColorHex, arrowOpacity);
                    let lineWidth = 30;
                    let arrowheadWidth = 80;
                    let arrowheadHeight = 60;
                    let startOffset = 30;
        
                    if(idx !== 0) {
                        arrowStyle = this.getArrowStyle('secondary', secondaryArrowColorHex, arrowOpacity);
        
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
                                style: this.getArrowStyle('opponent', opponentArrowColorHex, arrowOpacity),
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

                    this.pV[profile].activeGuiMoveMarkings.push({ ...markingObj, playerArrowElem, oppArrowElem });
                });

                this.pV[profile].pastMoveObjects = [];
            },
            removeMarkings: profile => {
                function removeMarkingFromProfile(t, p) {
                    t.pV[p].activeGuiMoveMarkings.forEach(markingObj => {
                        markingObj.oppArrowElem?.remove();
                        markingObj.playerArrowElem?.remove();
                    });
    
                    t.pV[p].activeGuiMoveMarkings = [];
                }

                if(!profile) {
                    Object.keys(this.pV).forEach(profileName => {
                        removeMarkingFromProfile(this, profileName);
                    });
                } else {
                    removeMarkingFromProfile(this, profile);
                }
            },
            updateBoardFen: fen => {
                if(this.currentFen !== fen) {
                    const moveObj = extractMoveFromBoardFen(this.currentFen, fen);

                    if(!(moveObj?.from && moveObj?.to && moveObj?.color)) return;

                    this.currentFen = fen;

                    USERSCRIPT.instanceVars.fen.set(this.instanceID, fen);

                    this.chessground.set({ fen });
    
                    this.instanceElem.querySelector('.instance-fen').innerText = fen;

                    this.engineStopCalculating(false, 'New board FEN, any running calculations are now useless!');

                    this.Interface.boardUtils.removeMarkings();

                    // For each profile config
                    Object.keys(this.pV).forEach(profileName => {
                        this.pV[profileName].currentSpeeches.forEach(synthesis => synthesis.cancel());
                        this.pV[profileName].currentSpeeches = [];

                        this.renderMetric(fen, profileName);
                    });

                    this.calculateBestMoves(fen);
                    this.displayFeedback(fen);
                }
            },
            updateBoardOrientation: orientation => {
                if(orientation != this.lastOrientation) {
                    this.lastOrientation = orientation;

                    Object.keys(this.pV).forEach(profileName => {
                        this.pV[profileName].lastCalculatedFen = null;
                    });

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

            updatePiP({ 'moveProgressText': text });
            updatePiP({ 'isWinning': status });

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
        updateEval: async (centipawnEval, mate, profile) => {
            const evalFill = this.instanceElem.querySelector('.eval-fill');
            const gradualness = 8;
            const playerColor = await this.getPlayerColor(profile);

            if(playerColor == 'b') {
                centipawnEval = -centipawnEval;
            }

            let advantage = 1 / (1 + 10**(-centipawnEval / 100 / gradualness)); // [-1, 1]

            if(mate)
                advantage = centipawnEval > 0 ? 1 : 0;

            updatePiP({ 'eval': advantage, playerColor, centipawnEval });

            evalFill.style.height = `${advantage * 100}%`;
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

    async renderMetric(fen, profile) {
        // Remove all previous metrics
        const previousMetrics = this.pV[profile].activeMetrics;
        
        if(previousMetrics.length) {
            previousMetrics.forEach(x => {
                if(x.elem) x.elem.remove();
            });

            this.pV[profile].activeMetrics = [];
        }

        // Get config variables
        const renderSquarePlayer        = await this.getConfigValue(this.configKeys.renderSquarePlayer, profile);
        const renderSquareEnemy         = await this.getConfigValue(this.configKeys.renderSquareEnemy, profile);
        const renderSquareContested     = await this.getConfigValue(this.configKeys.renderSquareContested, profile);
        const renderSquareSafe          = await this.getConfigValue(this.configKeys.renderSquareSafe, profile);
        const renderPiecePlayerCapture  = await this.getConfigValue(this.configKeys.renderPiecePlayerCapture, profile);
        const renderPieceEnemyCapture   = await this.getConfigValue(this.configKeys.renderPieceEnemyCapture, profile);
        const renderOnExternalSite      = await this.getConfigValue(this.configKeys.renderOnExternalSite, profile);

        // If none exist, do not analyze
        if(!(renderSquarePlayer || renderSquareEnemy || renderSquareContested || renderSquareSafe || renderPieceEnemyCapture))
            return;

        const playerColor = await this.getPlayerColor(profile);
        const addedMetrics = [];

        // BoardAnalyzer exists on the global window object, file acas-board-analyzer.js
        const BoardAnal = new BoardAnalyzer(fen, { 'orientation': playerColor, 'debug': true });
        const BoardDrawer = this.BoardDrawer;

        function fillSquare(pos, style) {
            const shapeType = 'rectangle';
            const shapeSquare = BoardAnal.indexToFen(pos);
            const shapeConfig = { style };
    
            const rect = BoardDrawer.createShape(shapeType, shapeSquare, shapeConfig);

            addedMetrics.push({ 'elem': rect, 'data': { shapeType, shapeSquare, shapeConfig }});
        }
        
        function addText(squareFen, size, text, style, position) {
            const shapeType = 'text';
            const shapeSquare = squareFen;
            const shapeConfig = { size, text, style, position };

            const textElem = BoardDrawer.createShape(shapeType, shapeSquare, shapeConfig);

            addedMetrics.push({ 'elem': textElem, 'data': { shapeType, shapeSquare, shapeConfig }});
        }

        function addTextWithBorder(squareFen, size, text, style, position) {
            addText(squareFen, size, text, style, position);
            addText(squareFen, size + 0.35, text, `opacity: 0.75; filter: sepia(2) brightness(4);`, position);
        }

        function renderDanger(piece, emoji) {
            if(piece.captureDanger) {
                const squareFen = BoardAnal.indexToFen(piece.position);
    
                addTextWithBorder(squareFen, 1.5, emoji, `opacity: 1;`, [0.3, 0.1]);
            }
        }

        function renderSafe(pos) {
            fillSquare(pos, `opacity: 0.30; fill: cyan;`);
        }
    
        function renderPlayerOnly(pos) {
            fillSquare(pos, `opacity: 0.30; fill: green;`);
        }
    
        function renderEnemyOnly(pos) {
            fillSquare(pos, `opacity: 0.30; fill: red;`);
        }

        function renderContested(obj) {
            const pos = obj.square;
            const { playerCount, enemyCount } = obj.counts;
            const rating = Math.floor((playerCount + enemyCount) / 2);
            const opacity = Math.min(0.1 + rating / 12, 0.85);
            const squareFen = BoardAnal.indexToFen(pos);
            const countDifference = playerCount - enemyCount;

            if(countDifference !== 0) {
                addText(squareFen, 0.8, `${countDifference >= 0 ? '+' : ''}${countDifference}`, `opacity: 1; font-weight: 900;`, [-0.8, 0.8]);
            }

            for(let i = 0; i < rating; i++) {
                addTextWithBorder(squareFen, 1.5, '🔥', `opacity: 1;`, [-0.8, 0.8 - i/10]);
            }

            fillSquare(pos, `opacity: ${opacity}; fill: orange;`);
        }

        const analResult = BoardAnal.analyze();

        if(renderPiecePlayerCapture)
            analResult.player
                .forEach(piece => renderDanger(piece, '💧'));

        if(renderPieceEnemyCapture)
            analResult.enemy
                .forEach(piece => renderDanger(piece, '🩸'));

        if(renderSquarePlayer)
            analResult.squares.playerOnly
                .forEach(pos => renderPlayerOnly(pos));
    
        if(renderSquareEnemy)
            analResult.squares.enemyOnly
                .forEach(pos => renderEnemyOnly(pos));
    
        if(renderSquareContested)
            analResult.squares.contested
                .forEach(obj => renderContested(obj));
    
        if(renderSquareSafe)
            analResult.squares.safe
                .forEach(pos => renderSafe(pos));

        this.pV[profile].activeMetrics.push(...addedMetrics);

        // Send metrics to external addedMetrics
        if(renderOnExternalSite) {
            // Create a copy without modifying the original array
            const metricsWithoutElem = addedMetrics.map(x => ({ ...x, elem: null }));

            this.CommLink.commands.renderMetricsToSite(metricsWithoutElem);
        }
    }

    async setEngineElo(elo, didUserUpdateSetting, didUpdateAdvancedElo, profile) {
        const enableAdvancedElo = await this.getConfigValue(this.configKeys.enableAdvancedElo, profile);

        if(enableAdvancedElo) {
            const advancedElo            = await this.getConfigValue(this.configKeys.advancedElo, profile);
            const advancedEloDepth       = await this.getConfigValue(this.configKeys.advancedEloDepth, profile);
            const advancedEloSkill       = await this.getConfigValue(this.configKeys.advancedEloSkill, profile);
            const advancedEloMaxError    = await this.getConfigValue(this.configKeys.advancedEloMaxError, profile);
            const advancedEloProbability = await this.getConfigValue(this.configKeys.advancedEloProbability, profile);
            const advancedEloHash        = await this.getConfigValue(this.configKeys.advancedEloHash, profile);
            const advancedEloThreads     = await this.getConfigValue(this.configKeys.advancedEloThreads, profile);

            this.sendMsgToEngine(`setoption name UCI_Elo value ${advancedElo}`, profile);

            this.pV[profile].searchDepth = advancedEloDepth;

            const limitStrength = advancedEloSkill < 40;

            this.setEngineSkillLevel(advancedEloSkill - 20, profile); // Convert (0-40) to (-20-20)
            
            if(!limitStrength)
                this.setEngineLimitStrength(false, profile);

            if(advancedEloMaxError > 0)
                this.setEngineMaxError(advancedEloMaxError, profile);

            if(advancedEloProbability > 0)
                this.setEngineProbability(advancedEloProbability, profile);

            this.setEngineHashSize(advancedEloHash, profile);
            this.setEngineThreads(advancedEloThreads, profile);

            console.error(limitStrength, advancedEloDepth, advancedEloSkill, advancedEloMaxError, advancedEloProbability, advancedEloHash, advancedEloThreads);
        }
        
        else if(typeof elo == 'number') {
            const limitStrength = 0 < elo && elo <= 2600;

            this.sendMsgToEngine(`setoption name UCI_Elo value ${elo}`, profile);

            const skillLevelMsg = transObj?.engineSkillLevel ?? 'Engine skill level';
            const searchDepthMsg = transObj?.engineSearchDepth ?? 'Search depth';
            const engineNotLimitedSkillLevel = transObj?.engineNotLimitedSkillLevel ?? "Engine's skill level not limited";
            const engineNoLimitations = transObj?.engineNoLimitations ?? 'Engine has no strength limitations, running infinite depth!';
            
            if(limitStrength) {
                this.setEngineLimitStrength(true, profile);
    
                const skillLevel = getSkillLevelFromElo(elo);
                this.setEngineSkillLevel(skillLevel, profile);
    
                const depth = getDepthFromElo(elo);
                this.pV[profile].searchDepth = depth;

                if(didUserUpdateSetting && !didUpdateAdvancedElo) {
                    toast.message(`${skillLevelMsg} ${skillLevel} | ${searchDepthMsg} ${depth}`, 8000);
                }
            } else {
                this.setEngineLimitStrength(false, profile);

                this.setEngineSkillLevel(20, profile);

                if(elo !== 3200) {
                    const depth = getDepthFromElo(elo);
                    this.pV[profile].searchDepth = depth;

                    if(didUserUpdateSetting && !didUpdateAdvancedElo)
                        toast.message(`${engineNotLimitedSkillLevel} | ${searchDepthMsg} ${depth}`, 8000);
                } else {
                    this.pV[profile].searchDepth = null;
                    updatePiP({ 'goalDepth': null });

                    if(didUserUpdateSetting)
                        toast.message(engineNoLimitations, 8000);
                }
            }
        }
    }

    setEngineNodes(nodeAmount, profile) {
        if(this.pV[profile].lc0WeightName.includes('maia') && nodeAmount !== 1) {
            const msg = transObj?.maiaNodeWarning ?? 'Maia weights work best with no search, please only use one (1) search node!';
            toast.warning(msg, 30000);
        }

        this.pV[profile].engineNodes = nodeAmount;
    }

    async setEngineWeight(weightName, profile) {
        // legacy support, convert 1100 -> maia-1100.pb etc.
        if(/^\d{4}(,\d{3})*$/.test(weightName)) {
            weightName = `maia-${weightName}.pb`;
        }

        this.pV[profile].lc0WeightName = weightName;

        this.contactEngine('setZeroWeights', [await loadFileAsUint8Array(`../app/assets/lc0-weights/${weightName}`)], profile);
    }

    disableEngineElo(profile) {
        this.sendMsgToEngine(`setoption name UCI_LimitStrength value false`, profile);
    }

    setEngineMultiPV(amount, profile) {
        if(typeof amount == 'number') {
            this.sendMsgToEngine(`setoption name MultiPV value ${amount}`, profile);
        }
    }

    setEngineThreads(amount, profile) {
        if(typeof amount == 'number') {
            this.sendMsgToEngine(`setoption name Threads value ${amount}`, profile);
        }
    }

    setEngineNodesTime(amount, profile) {
        if(typeof amount == 'number') {
            this.sendMsgToEngine(`setoption name nodestime value ${amount}`, profile);
        }
    }

    setEngineMaxError(amount, profile) {
        if(typeof amount == 'number') {
            this.sendMsgToEngine(`setoption name Skill Level Maximum Error value ${amount}`, profile);
        }
    }

    setEngineProbability(amount, profile) {
        if(typeof amount == 'number') {
            this.sendMsgToEngine(`setoption name Skill Level Probability value ${amount}`, profile);
        }
    }
    
    setEngineHashSize(amount, profile) {
        if(typeof amount == 'number') {
            this.sendMsgToEngine(`setoption name Hash value ${amount}`, profile);
        }
    }

    setEngineSkillLevel(amount, profile) {
        if(typeof amount == 'number' && -20 <= amount && amount <= 20) {
            this.sendMsgToEngine(`setoption name UCI_LimitStrength value ${amount}`, profile);
        }
    }

    setEngineLimitStrength(bool, profile) {
        if(typeof bool == 'boolean') {
            this.sendMsgToEngine(`setoption name UCI_LimitStrength value ${bool}`, profile);
        }
    }

    setEngineShowWDL(bool, profile) {
        if(typeof bool == 'boolean') {
            this.sendMsgToEngine(`setoption name UCI_ShowWDL value ${bool}`, profile);
        }
    }

    set960Mode(val, profile) {
        const bool = val ? true : false;

        this.sendMsgToEngine(`setoption name UCI_Chess960 value ${bool}`, profile);

        this.pV[profile].useChess960 = bool;
    }

    async setEngineVariant(variant, profile) {
        if(typeof variant == 'string') {
            this.sendMsgToEngine(`setoption name UCI_Variant value ${variant}`, profile);

            this.pV[profile].chessVariant = formatVariant(variant);
            this.pV[profile].useChess960 = isVariant960(variant) || await this.getConfigValue(this.configKeys.useChess960, profile);
        }
    }

    setChessFont(chessFontStr) {
        chessFontStr = formatChessFont(chessFontStr);

        const chessboardComponentsElem = this.instanceElem.querySelector('.chessboard-components');
        const chessFonts = ['merida', 'cburnett', 'staunty', 'letters'];

        chessFonts.forEach(str => {
            if(str == chessFontStr) {
                chessboardComponentsElem.classList.add(str);
            } else {
                chessboardComponentsElem.classList.remove(str);
            }
        });
    }

    async getEngineType(profile) {
        return await this.getConfigValue(this.configKeys.chessEngine, profile);
    }

    async engineStartNewGame(variant, profile) {
        const chessVariant = formatVariant(variant);
        const engineName = await this.getEngineType(profile);

        if(!this.isEngineNotCalculating(profile)) {
            this.engineStopCalculating(profile, 'Engine was calculating while a new game was started!');
        }

        this.sendMsgToEngine('ucinewgame', profile); // very important to be before setting variant and so forth
        this.sendMsgToEngine('uci', profile); // to display variants

        this.setEngineMultiPV(await this.getConfigValue(this.configKeys.moveSuggestionAmount, profile), profile);
        this.setEngineShowWDL(true, profile);

        if(engineName !== 'lc0')
            this.sendMsgToEngine(`setoption name UCI_AnalyseMode value true`, profile); // required for threads, etc.
        
        switch(engineName) {
            case 'lc0':
                this.setEngineNodes(await this.getConfigValue(this.configKeys.engineNodes, profile), profile);
                this.sendMsgToEngine('position startpos', profile);

                break;
            default:
                this.setEngineVariant(chessVariant, profile);
                this.setEngineElo(await this.getConfigValue(this.configKeys.engineElo, profile), false, false, profile);

                this.sendMsgToEngine('position startpos', profile);
                this.sendMsgToEngine('d', profile);
                break;
        }
    }

    engineStopCalculating(profile, reason) {
        const profileStopCalculating = p => {
            if(!this.isEngineNotCalculating(p)) clearTimeout(this.pV[p].currentMovetimeTimeout);
                
            console.error('STOP CALCULATION ORDERED!', 'Reason:', reason, 'Profile:', profile);
    
            this.sendMsgToEngine('stop', p);
        }

        if(!profile) {
            Object.keys(this.pV).forEach(profileName => {
                profileStopCalculating(profileName);
            });
        } else {
            profileStopCalculating(profile);
        }
    }

    async isPlayerTurn(lastFen, currentFen, profile) {
        const playerColor = await this.getPlayerColor(profile);
        const turn = await this.getTurnFromFenChange(lastFen, currentFen, profile);

        if(this.lastTurn === turn && this.domain === 'chessarena.com') {
            console.error('For some reason the turn was the same two times in a row, forcing turn to player!');

            this.lastTurn = playerColor;

            return true;
        } else {
            console.warn('Turn: ', turn);

            this.lastTurn = turn;
        }

        return !playerColor || turn == playerColor;
    }

    async speak(spokenText, profile) {
        const isTTSEnabled = await this.getConfigValue(this.configKeys.ttsVoiceEnabled, profile);

        if(isTTSEnabled) {
            const ttsVoiceName = await this.getConfigValue(this.configKeys.ttsVoiceName, profile);
            const ttsVoiceSpeed = await this.getConfigValue(this.configKeys.ttsVoiceSpeed, profile);

            const speechConfig = {
                rate: ttsVoiceSpeed / 10,
                pitch: 1,
                volume: 1
            };

            if(ttsVoiceName?.toLowerCase() != 'default') {
                speechConfig.voiceName = ttsVoiceName;
            }

            console.log(`Speaking: ${spokenText} (Instance "${this.instanceID}")`);

            this.pV[profile].currentSpeeches.push(speakText(spokenText, speechConfig));
        }
    }

    async updateSettings(updateObj) {
        const profile = updateObj.data.profile.name;
        const profiles = await getProfiles();

        const profilesWithEnabledEngine = profiles.filter(p => p.config.engineEnabled);
        const profilesWithDisabledEngine = profiles.filter(p => !p.config.engineEnabled);
        const nonexistingProfilesWithEngine = Object.keys(this.pV).filter(profileName => !profiles.find(p => p.name === profileName));

        const isEngineEnabled = await this.getConfigValue(this.configKeys.engineEnabled, profile);

        // Handle profiles which engine is disabled
        for(const profileObj of profilesWithDisabledEngine) {
            const profileName = profileObj.name;
            const profileVariables = this.pV[profileName];

            if(profileVariables) {
                console.log('Kill engine', profileName, 'due to it being disabled');

                this.killEngine(profileName);
            }
        }
        
        // Handle profiles which do not exist anymore
        for(const profileName of nonexistingProfilesWithEngine) {
            console.log('Kill engine', profileName, 'due to the profile not existing anymore');

            this.killEngine(profileName);
        }

        function findSettingKeyFromData(key) {
            return Object.values(updateObj?.data)?.includes(key);
        }

        const advancedEloKeys = [
            this.configKeys.enableAdvancedElo,
            this.configKeys.advancedEloDepth,
            this.configKeys.advancedEloSkill,
            this.configKeys.advancedEloMaxError,
            this.configKeys.advancedEloProbability,
            this.configKeys.advancedEloHash,
            this.configKeys.advancedEloThreads
        ];

        const didUpdateVariant = findSettingKeyFromData(this.configKeys.chessVariant);
        const didUpdateElo = [this.configKeys.engineElo, ...advancedEloKeys]
            .find(key => findSettingKeyFromData(key));
        const didUpdateAdvancedElo = advancedEloKeys
            .find(key => findSettingKeyFromData(key));
        const didUpdateLc0Weight = findSettingKeyFromData(this.configKeys.lc0Weight);
        const didUpdateChessFont = findSettingKeyFromData(this.configKeys.chessFont);
        const didUpdateMultiPV = findSettingKeyFromData(this.configKeys.moveSuggestionAmount);
        const didUpdate960Mode = findSettingKeyFromData(this.configKeys.useChess960);
        const didUpdateChessEngine = findSettingKeyFromData(this.configKeys.chessEngine);
        const didUpdateEngineEnabled = findSettingKeyFromData(this.configKeys.engineEnabled);
        const didUpdateNodes = findSettingKeyFromData(this.configKeys.engineNodes);

        const chessVariant = formatVariant(await this.getConfigValue(this.configKeys.chessVariant, profile));
        const useChess960 = await this.getConfigValue(this.configKeys.useChess960, profile);

        if(didUpdateVariant || didUpdate960Mode) {
            this.set960Mode(useChess960, profile);

            this.engineStartNewGame(didUpdateVariant ? chessVariant : this.pV[profile].chessVariant, profile);
        } else {
            if(didUpdateChessFont)
                this.setChessFont(await this.getConfigValue(this.configKeys.chessFont));

            if(didUpdateChessEngine || (didUpdateEngineEnabled && isEngineEnabled)) {
                if(didUpdateChessEngine) 
                    console.log('Kill and load engine', profile, 'since the engine type was changed');
                else if(didUpdateEngineEnabled)
                    console.log('Kill and load engine', profile, 'since the engine was enabled');

                this.killEngine(profile);

                this.pV[profile] = await this.profileVariables.create(this, profile);
                this.loadEngine(profile);
            }

            if(didUpdateElo)
                this.setEngineElo(await this.getConfigValue(this.configKeys.engineElo, profile), true, didUpdateAdvancedElo, profile);

            if(didUpdateNodes)
                this.setEngineNodes(await this.getConfigValue(this.configKeys.engineNodes, profile), profile);

            if(didUpdateLc0Weight)
                this.setEngineWeight(await this.getConfigValue(this.configKeys.lc0Weight, profile), profile);

            if(didUpdateMultiPV)
                this.setEngineMultiPV(await this.getConfigValue(this.configKeys.moveSuggestionAmount, profile), profile);

            if(didUpdate960Mode)
                this.set960Mode(useChess960, profile);
        }
    }

    isPawnOnPromotionSquare(currentFen) {
        if(!currentFen) return false;
    
        currentFen = currentFen.split(' ')[0];
    
        const ranks = currentFen.split('/');
        const boardHeight = ranks.length;
    
        const topRank = ranks[0];
        const bottomRank = ranks[boardHeight - 1];

        const pawnOnPromotionSquare = topRank.includes('P') || bottomRank.includes('p');
        
        if(pawnOnPromotionSquare)
            return true;
    
        return false;
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

        console.warn('Piece amount change', countChange);
    
        // Large abnormal piece changes are allowed, as they usually mean something significant has happened
        // Smaller abnormal piece changes are most likely caused by a faulty newFen provided by the A.C.A.S on the site
        return (-3 < countChange && countChange < -1) || (0 < countChange && countChange < 2);
    }

    // Kind of similar to isAbnormalPieceChange function, however it focuses on titles rather than pieces
    // It checks for how many titles had changes happen in them
    isCorrectAmountOfBoardChanges(lastFen, newFen) {
        if(!lastFen) return true;
    
        let board1 = lastFen.split(' ')[0].replace(/\d/g, d => ' '.repeat(d)).split('/').join('');
        let board2 = newFen.split(' ')[0].replace(/\d/g, d => ' '.repeat(d)).split('/').join('');
        
        let changedFrom = [];
        let diff = 0;

        for(let i = 0; i < board1.length; i++) {
            if(board1[i] !== board2[i]) {
                if(board1[i]?.trim()?.length > 0) changedFrom.push(board1[i]?.toLowerCase());

                diff += 1;
            }
        }
        
        /* Possible "diff" value explanations,
            (diff = 0) -> no changes, same board layout
            (diff = 1) -> only one title abruptly changed, shouldn't be possible
            (diff = 2) -> a piece moved, maybe it ate another piece
            (diff = 3) -> three titles had changes, shouldn't be possible
            (diff > 3) -> a lot of titles had changes, maybe a new game started, the change is significant so allowing it
            (diff = 4) -> takeback or castling
        */

        this.moveDiffHistory.unshift(diff);
        this.moveDiffHistory = this.moveDiffHistory.slice(0, 3);

        console.warn('Board diff amount:', diff, 'History:', JSON.stringify(this.moveDiffHistory));

        const isHistoryIndicatingPromotion = JSON.stringify(this.moveDiffHistory) === JSON.stringify([3, 1, 2]);

        return diff === 2 || diff > 3 || isHistoryIndicatingPromotion;
    }

    isFenChangeLogical(lastFen, newFen) {
        const correctAmountOfChanges = this.isCorrectAmountOfBoardChanges(lastFen, newFen);
        const isAbnormalPieceChange = this.isAbnormalPieceChange(lastFen, newFen);

        return correctAmountOfChanges && !isAbnormalPieceChange;
    }

    async getTurnFromFenChange(lastFen, newFen, profile) {
        const currentPlayerColor = await this.getPlayerColor();
        const onlyCalculateOwnTurn = await this.getConfigValue(this.configKeys.onlyCalculateOwnTurn, profile);

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
            this.pV[profile].pendingCalculations = this.pV[profile].pendingCalculations.filter(x => !x?.finished);
            
            return currentPlayerColor;
        }

        const turn = movedPiece.toUpperCase() === movedPiece ? 'b' : 'w';
    
        return turn;
    }

    async getPlayerColor(profile) {
        const playerColor = await USERSCRIPT.instanceVars.playerColor.get(this.instanceID) || 'w';

        if(profile) {
            const reverseSide = await this.getConfigValue(this.configKeys.reverseSide, profile);

            if(reverseSide) {
                return playerColor.toLowerCase() === 'w' ? 'b' : 'w'; 
            }
        }

        return playerColor;
    }

    async displayFeedback(currentFen) {
        const profiles = await getProfiles();

        const clearFeedback = profileName => {
            if(!profileName) return;

            // Remove all previous metrics
            const previousFeedbacks = this.pV[profileName].activeFeedbackDisplays;

            if(previousFeedbacks.length) {
                previousFeedbacks.forEach(x => {
                    if(x.elem) x.elem.remove();
                });

                this.pV[profileName].activeFeedbackDisplays = [];
            }
        }

        // Remove any existing feedback
        profiles.filter(p => !p.config.enableMoveRatings).forEach(profileObj => {
            clearFeedback(profileObj?.name);
        });

        // Display new feedback
        for(const profileObj of profiles.filter(p => p.config.enableMoveRatings)) {
            const profileName = profileObj.name;
            const lastFen = this.pV[profileName].lastFeedbackFen;
            const feedbackOnExternalSite = await this.getConfigValue(this.configKeys.feedbackOnExternalSite, profileName);
            const feedbackEngineDepth = await this.getConfigValue(this.configKeys.feedbackEngineDepth, profileName);
            const enableEnemyFeedback = await this.getConfigValue(this.configKeys.enableEnemyFeedback, profileName);

            const isChangeLogical = this.isFenChangeLogical(lastFen, currentFen);

            if(!isChangeLogical) return;

            const playerColor = await this.getPlayerColor();

            if(isChangeLogical && lastFen && currentFen) {
                const moveObj = extractMoveFromBoardFen(lastFen, currentFen);
                const from = moveObj.from,
                      to = moveObj.to,
                      pieceColor = moveObj.color;

                let fromFen = lastFen;

                // Analyze for the enemy if enemy moved piee
                if(playerColor !== pieceColor)
                    if(!enableEnemyFeedback) { // do not show feedback for enemies
                        clearFeedback(profileName);
                        return;
                    } else { // show feedback for enemies
                        fromFen = reverseFenPlayer(fromFen);
                    }

                this.MoveEval.eval([from, to], { 'fen' : fromFen, 'depth': feedbackEngineDepth }, resultObj => {
                    const category = resultObj.category;
                    const cp = resultObj.cp;
                    const label = this.MoveEval.resultLabels[category];

                    display(from, to, cp, category, label);
                });
            }
    
            this.pV[profileName].lastFeedbackFen = currentFen;

            const display = (from, to, cp, category, label) => {
                clearFeedback(profileName);
        
                const addedFeedbacks = [];
                const BoardDrawer = this.BoardDrawer;

                function addText(squareFen, size, text, style, position) {
                    const shapeType = 'text';
                    const shapeSquare = squareFen;
                    const shapeConfig = { size, text, style, position };
        
                    const textElem = BoardDrawer.createShape(shapeType, shapeSquare, shapeConfig);
        
                    addedFeedbacks.push({ 'elem': textElem, 'data': { shapeType, shapeSquare, shapeConfig }});
                }

                if(category !== 0) {
                    // ['Neutral', 'Inaccuracy', 'Mistake', 'Blunder', 'Catastrophic', 'Good Move', 'Excellent', 'Brilliancy'];

                    const label = ['-', '?!', '?', '??', '???', '✪', '!', '!!']?.[category] || '⚪';
                    const emoji = ['⚪', '🟡', '🟠', '🔴', '🟤', '🟢', '🔵', '🟣'][category] || '⚪';

                    addText(to, 1.3, label, 'opacity: 1; font-weight: 700; fill: white;', [0.8, 0.8]);
                    addText(to, 1.7, emoji, `opacity: 1;`, [0.8, 0.8]);
                }
        
                this.pV[profileName].activeFeedbackDisplays.push(...addedFeedbacks);
        
                if(feedbackOnExternalSite) {
                    // Create a copy without modifying the original array
                    const feedbacksWithoutElem = addedFeedbacks.map(x => ({ ...x, elem: null }));

                    this.CommLink.commands.feedbackToSite(feedbacksWithoutElem);
                }
            }
        }
    }

    async calculateBestMoves(currentFen, skipValidityChecks) {
        const profiles = await getProfiles();

        profiles.filter(p => p.config.engineEnabled).forEach(async (profile) => {
            const profileName = profile.name;
            const currentEngineName = await this.getEngineType(profileName);

            if(this.isPawnOnPromotionSquare(currentFen) && currentEngineName === 'lc0') return;

            // Engine is still calculating, do not start any new calculation since,
            // that will not give us 'bestmove' which A.C.A.S' logic EXPECTS.
            // The best moves will be calculated after we get the 'bestmove'.
            if(!this.isEngineNotCalculating(profileName)) return;

            const isFenChangeLogical = this.isFenChangeLogical(this.pV[profileName].lastFen, currentFen);
            const reverseSide = await this.getConfigValue(this.configKeys.reverseSide, profileName);

            let reversedFen = null;

            if(reverseSide) {
                reversedFen = reverseFenPlayer(currentFen);
            }

            const onlyCalculateOwnTurn = await this.getConfigValue(this.configKeys.onlyCalculateOwnTurn, profileName);

            let isPlayerTurn = false;
            
            if(isFenChangeLogical) {
                isPlayerTurn = await this.isPlayerTurn(this.pV[profileName].lastFen, currentFen, profileName);
    
                this.pV[profileName].lastFen = currentFen;
            }
    
            const isFenChanged = this.pV[profileName].lastCalculatedFen !== currentFen;
            const isFenChangeAllowed = !onlyCalculateOwnTurn || (isFenChangeLogical && isPlayerTurn);

            if((isFenChanged && isFenChangeAllowed) || skipValidityChecks) {
                this.pV[profileName].lastCalculatedFen = currentFen;
            } else {
                this.CommLink.commands.removeSiteMoveMarkings();
    
                return;
            }

            this.pV[profileName].pendingCalculations.push({ 'fen': currentFen, 'startedAt': Date.now(), 'finished': false });

            this.Interface.boardUtils.removeMarkings(profileName);
    
            console.error('CALCULATING!', this.pV[profileName].pendingCalculations, reversedFen || currentFen);
    
            log.info(`Fen: "${currentFen}"`);
            log.info(`Updating board Fen`);
    
            this.renderMetric(currentFen, profileName);
            this.Interface.boardUtils.updateBoardFen(currentFen);
        
            log.info('Sending best move request to the engine!');
        
            this.sendMsgToEngine(`position fen ${reversedFen || currentFen}`, profileName);
    
            // Should not actually go infinite depth, read commenting below.
            // This is just a backup. It's not terrible to go infinite depth but problematic.
            let searchCommandStr = 'go infinite';
    
            switch(await this.getEngineType(profileName)) {
                case 'lc0':
                    const nodes = this.pV[profileName].engineNodes;

                    searchCommandStr = `go nodes ${nodes}`;

                    updatePiP({ 'goalNodes': nodes });
                break;
    
                default:
                    // The search is "infinite" if the searchDepth is null. The engine's max depth seems to be 245 on 'go infinite',
                    // but if it reaches that max depth on 'go infinite' it does not give 'bestmove'. A.C.A.S expects a bestmove, so that is no good.
                    // That is why we limit the infinite search depth ourselves.
                    const depth = this.pV[profileName].searchDepth || 100;

                    searchCommandStr = `go depth ${depth}`;

                    updatePiP({ 'goalDepth': depth });
                break;
            }
    
            this.sendMsgToEngine(searchCommandStr, profileName);
    
            const movetime = await this.getConfigValue(this.configKeys.maxMovetime, profileName);

            updatePiP({ 'startTime': Date.now(), movetime });
    
            if(typeof movetime == 'number') {
                const startFen = this.currentFen;
    
                this.pV[profileName].currentMovetimeTimeout = setTimeout(() => {
                    if(startFen == this.currentFen && movetime != 0 && !this.isEngineNotCalculating(profileName)) {
                        this.engineStopCalculating(profileName, 'Max movetime!');
                    }
                }, movetime + 5);
            }
        });
    }

    getEngineAcasObj(i) {
        if(typeof i == 'object') {
            return this.engines.find(obj => obj.profileName == i.name);
        } 
        
        else if(typeof i == 'string') {
            return this.engines.find(obj => obj.profileName == i);
        }

        return this.engines[i ? i : this.engines.length - 1];
    }

    contactEngine(method, args, i) {
        return this.getEngineAcasObj(i)['engine'](method, args);
    }

    sendMsgToEngine(msg, i) {
        const isProfile = typeof i == 'string' && this.pV[i];
        const engineExists = this.getEngineAcasObj(i)?.sendMsg;

        if(!engineExists && isProfile) {
            let elapsed = 0;

            const waitForEngineToLoad = setInterval(() => {

                if(this.getEngineAcasObj(i)?.sendMsg && isProfile) {
                    this.getEngineAcasObj(i).sendMsg(msg);
    
                    clearInterval(waitForEngineToLoad);
                } else {
                    // Wait max 10 seconds
                    if(elapsed++ > 100) {
                        console.warn('Attempted to send message to non existing engine?', `(${i})`);
                        clearInterval(waitForEngineToLoad);
                    }
                }

            }, 100);
        } else if(engineExists) {
            this.getEngineAcasObj(i).sendMsg(msg);
        } else {
            console.warn('Attempted to send message to non existing engine?', `(${i})`);
        }
    }

    isEngineNotCalculating(profile) {
        const profileObj = this.pV[profile];

        if(!profileObj) return true;

        return this.pV[profile].pendingCalculations.find(x => !x.finished) ? false : true;
    }

    async displayMoves(moveObjects, profile) {
        const displayMovesExternally = await this.getConfigValue(this.configKeys.displayMovesOnExternalSite, profile);

        this.Interface.boardUtils.markMoves(moveObjects, profile);

        updatePiP({ moveObjects });

        if(displayMovesExternally) {
            this.CommLink.commands.markMoveToSite(moveObjects);
        }

        moveObjects.forEach(moveObj => {
            const spokenText = moveObj.player?.map(x =>
                x.split('').map(x =>`"${x}"`).join(' ') // e.g a1 -> "a" "1"
            ).join(', ');

            this.speak(spokenText, profile);
        });
    }

    async engineMessageHandler(msg, profile) {
        const profileObj = this.pV[profile];

        if(!profileObj) {
            console.warn('Attempted to process an engine message from a nonexisting engine, uhh, ghosts?');

            return;
        }

        const data = parseUCIResponse(msg);
        const oldestUnfinishedCalcRequestObj = this.pV[profile].pendingCalculations.find(x => !x.finished);
        const isMessageForCurrentFen = oldestUnfinishedCalcRequestObj?.fen === this.currentFen;
        const isMsgNoSuchOption = msg.includes('No such option') && !msg.includes('Variant') && !msg.includes('UCI_');
        const isMsgFailure = msg.includes('Failed') && !msg.includes('MIME type');

        if(isMsgNoSuchOption) {
            const profile = await getProfile(profile);
            const profileChessEngine = profile.config.chessEngine;
            const missingOptionName =  msg.split('No such option:')?.[1]?.trim();

            toast.warning(`"${missingOptionName}" not supported on ${profileChessEngine} (Running on profile "${profile}")`, 4e4);
        }

        if(isMsgFailure) {
            const profile = await getProfile(profile);
            const profileChessEngine = profile.config.chessEngine;

            toast.warning(`"${msg}" ("${profileChessEngine}" running on profile "${profile}")`, 4e4);
        }

        if(!data?.currmovenumber) console.warn(`${profile} ->`, msg, `\n(Message is for FEN -> ${oldestUnfinishedCalcRequestObj?.fen})`);

        if(msg.includes('option name UCI_Variant type combo')) {
            const chessVariants = extractVariantNames(msg);

            this.pV[profile].chessVariants = chessVariants;

            this.guiBroadcastChannel.postMessage({ 'type': 'updateChessVariants', 'data' : chessVariants });
        }

        if(msg.includes('info')) {
            if(data?.multipv === '1' || await this.getEngineType(profile) === 'lozza-5') {
                if(data?.depth) {
                    const depthText = transObj?.calculationDepth ?? 'Depth';
                    const winningText = transObj?.winning ?? 'Winning';
                    const losingText = transObj?.losing ?? 'Losing';

                    if(data?.mate) {
                        const isWinning = data.mate > 0;
                        const mateText = `${isWinning ? winningText : losingText} ${Math.abs(data.mate)}`;

                        this.Interface.updateMoveProgress(`${mateText} | ${depthText} ${data.depth}`, isWinning ? 1 : 2);
                    } else {
                        this.Interface.updateMoveProgress(`${depthText} ${data.depth}`, 0);
                    }

                    updatePiP({ 'depth': data?.depth, 'mate': data?.mate });
                }
    
                if(data?.cp)
                    this.Interface.updateEval(data.cp, false, profile);
    
                if(data?.mate) 
                    this.Interface.updateEval(data.mate, true, profile);
            }
        }

        if(data?.wdl) {
            const [winChance, drawChance, lossChance] = data?.wdl?.split(' ');

            updatePiP({ winChance, drawChance, lossChance });
        }

        if(data?.pv && isMessageForCurrentFen) {
            const moveRegex = /[a-zA-Z]\d+/g;
            const ranking = convertToCorrectType(data?.multipv) || 1;
            let moves = data.pv.split(' ').map(move => move.match(moveRegex));

            if(moves?.length === 1) // if no opponent move guesses yet
                moves = [...moves, [null, null]];

            const [[from, to], [opponentFrom, opponentTo]] = moves;
            const moveObj = { 'player': [from, to], 'opponent': [opponentFrom, opponentTo], profile, ranking };

            this.pV[profile].pastMoveObjects.push(moveObj);

            const isMovetimeLimited = await this.getConfigValue(this.configKeys.maxMovetime, profile) ? true : false;
            const onlyShowTopMoves = await this.getConfigValue(this.configKeys.onlyShowTopMoves, profile);
            const markingLimit = await this.getConfigValue(this.configKeys.moveSuggestionAmount, profile);
            const moveDisplayDelay = await this.getConfigValue(this.configKeys.moveDisplayDelay, profile);
            const isDelayActive = moveDisplayDelay && moveDisplayDelay > 0;

            const topMoveObjects = this.pV[profile].pastMoveObjects?.slice(markingLimit * -1);
            const calculationStartedAt = oldestUnfinishedCalcRequestObj?.startedAt;
            const calculationTimeElapsed = Date.now() - calculationStartedAt;

            updatePiP({ calculationTimeElapsed, 'nodes': data?.nodes, topMoveObjects });
            
            let isSearchInfinite = this.pV[profile].searchDepth ? false : true;

            if(await this.getEngineType(profile) === 'lc0') {
                isSearchInfinite = this.pV[profile].engineNodes > 9e6 ? true : false;
            }

            if(
                topMoveObjects.length === markingLimit
                && (!onlyShowTopMoves || (isSearchInfinite && !isMovetimeLimited)) // handle infinite search, cannot only show top moves when search is infinite
                && (!isDelayActive || (calculationTimeElapsed > moveDisplayDelay)) // handle visual delay, do not show move if time elapsed is too low
            ) {
                this.displayMoves(topMoveObjects, profile);
            }
        }

        if(data?.bestmove) {
            oldestUnfinishedCalcRequestObj.finished = true;

            // Check if the board has changed while we were finishing up a move calculation.
            if(oldestUnfinishedCalcRequestObj?.fen !== this.currentFen) {
                // Let's start the new move calculation since we have now received the old 'bestmove'.
                // A.C.A.S expects 'bestmove' to appear to finish up the calculation which is why we do this.
                // (Starting a new best move calculation while the old one was running, there would be no 'bestmove')
                this.calculateBestMoves(this.currentFen);
            }

            if(isMessageForCurrentFen && this.pV[profile].activeGuiMoveMarkings.length === 0) {
                const markingLimit = await this.getConfigValue(this.configKeys.moveSuggestionAmount, profile);
                const moveDisplayDelay = await this.getConfigValue(this.configKeys.moveDisplayDelay, profile);
                const isDelayActive = moveDisplayDelay && moveDisplayDelay > 0;
                let topMoveObjects = this.pV[profile].pastMoveObjects?.slice(markingLimit * -1);

                if(topMoveObjects?.length === 0) {
                    topMoveObjects = [];
                    topMoveObjects.push({ 'player': [data.bestmove.slice(0,2), data.bestmove.slice(2, data.bestmove.length)], 'opponent': [null, null], 'ranking': 1  });
                }

                if(await this.getEngineType(profile) === 'lc0') {
                    updatePiP({ 'nodes': this.pV[profile].engineNodes, 'goalDepth': null });
                } else {
                    updatePiP({ 'depth': this.pV[profile].searchDepth, 'goalNodes': null });
                }

                if(isDelayActive) {
                    const startFen = this.currentFen;

                    setTimeout(() => {
                        if(startFen == this.currentFen && this.isEngineNotCalculating(profile)) {
                            this.displayMoves(topMoveObjects, profile);
                        }
                    }, moveDisplayDelay);
                } else {
                    this.displayMoves(topMoveObjects, profile);
                }
            }
        }

        const variantStartposFen = data['Fen:'];

        if(variantStartposFen) {
            const dimensions = getBoardDimensionsFromFenStr(variantStartposFen);

            this.setupEnvironment(variantStartposFen, dimensions);
        }

        if(msg === 'uciok' && (
               await this.getEngineType(profile) === 'lc0'
            || await this.getEngineType(profile) === 'lozza-5'
        )) {
            this.setupEnvironment(this.defaultStartpos, [8, 8]);
        }
    }

    async loadEngine(profileName, engineName, attempt = 0) {
        const profileObj = await getProfile(profileName);
        const profileChessEngine = engineName || profileObj.config.chessEngine;
        const isReload = attempt > 0;
        let alreadyRestarted = false;

        if(isReload) console.warn('RELOAD ATTEMPT', attempt, '-> Loading engine', engineName, profileName);

        if(engineName && attempt > 100) {
            toast.warning(`Restarting the engine ${engineName} failed despite many attempts :(\n\nRefresh A.C.A.S!`);
            
            return;
        }

        const msgHandler = msg => {
            try {
                this.engineMessageHandler(msg, profileName);
            } catch(e) {
                console.error('Engine', this.instanceID, profileName, 'error:', e);
            }
        };

        if(await isEngineIncompatible(engineName, profileName)) {
            toast.warning(`The engine "${profileChessEngine}" you have selected on profile "${profileName}" is incompatible with the mode A.C.A.S was launched in.` 
                + '\n\nPlease change the engine on the settings or launch A.C.A.S using ?sab=true.', 3e4);
            return;
        }

        function restartEngine(name, e) {
            if(alreadyRestarted) return;

            if(!e?.message?.includes('memory access')) {
                if(!e?.message?.includes('[object ErrorEvent]'))
                    toast.error(`Engine "${name}" crashed due to "${e?.message}"!`, 5e3);

                return;
            }

            console.error(`Restarting the engine "${name}" due to the error "${e?.message}"!`);

            const engineObjectIdx = this.engines.findIndex(x => x.type === name);

            // Ask engine to quit if it can still listen
            this.sendMsgToEngine('quit', name); 
            // Try to terminate the engine worker
            this.engines?.[engineObjectIdx]?.worker?.terminate();
            // Delete previous engine object
            delete this.engines?.[engineObjectIdx]; 
            
            // Filter out empty from the array
            this.engines = this.engines.filter(x => x);

            console.error('RESTARTING engine', name, profileName);
            this.loadEngine(profileName, name, attempt + 1);

            alreadyRestarted = true;
        }

        async function startGame(variant = 'chess') {
            if(isReload) {
                const currentFen = await USERSCRIPT.instanceVars.fen.get(this.instanceID);
                const fen = currentFen || this.variantStartPosFen;

                // Finish all previous calculations
                this.pV[profileName].pendingCalculations.map(x => x['finished'] = true);

                this.engineStartNewGame(variant, profileName);

                this.calculateBestMoves(fen, true);

                return;
            }

            const waitForChessgroundLoad = setInterval(() => {
                if(window?.ChessgroundX) {
                    clearInterval(waitForChessgroundLoad);
                    
                    this.engineStartNewGame(variant, profileName);
                }
            }, 500);
        }
        
        function loadStockfish(folderName, fileName = folderName) {
            const stockfish = new Worker(`../app/assets/engines/${folderName}/${fileName}.js`);
            let stockfish_loaded = false;

            stockfish.onmessage = async e => {
                if(!stockfish_loaded) {
                    stockfish_loaded = true;

                    this.engines.push({
                        'type': profileChessEngine,
                        'engine': (method, a) => stockfish[method](...a),
                        'sendMsg': msg => stockfish.postMessage(msg),
                        'worker': stockfish,
                        profileName
                    });
        
                    startGame.bind(this)();
                }

                msgHandler(e.data);
            };

            stockfish.onerror = e => {
                restartEngine.bind(this)(folderName, e);
            };
        }

        function loadLilaStockfish(workerName) {
            const stockfish = new Worker(`../app/assets/engines/lila-stockfish/${workerName}.js`, { type: 'module' });
            let stockfish_loaded = false;

            stockfish.onmessage = async e => {
                if(e.data === true) {
                    stockfish_loaded = true;

                    this.engines.push({
                        'type': profileChessEngine,
                        'engine': (method, a) => stockfish.postMessage({ method: method, args: [...a] }),
                        'sendMsg': msg => stockfish.postMessage({ method: 'uci', args: [msg] }),
                        'worker': stockfish,
                        profileName
                    });

                    startGame.bind(this)(workerName === 'f14-worker' 
                        ? formatVariant(this.pV[profileName].chessVariant)
                        : 'chess');
                } else if (e.data) {
                    msgHandler(e.data);
                }
            };

            const waitStockfish = setInterval(() => {
                if(stockfish_loaded) {
                    clearInterval(waitStockfish);
                    return;
                }

                stockfish.postMessage({ method: 'acas_check_loaded' });
            }, 100);
        }
        
        // When using loadStockfish(folderName, fileName), make sure the folder name
        // is exactly the same as the switch case string, since otherwise reloading wont work
        // Stockfish 17 singlethreaded lite is the default
        switch(profileChessEngine) {
            case 'stockfish-17-wasm':
                loadLilaStockfish.bind(this)('17-1-worker');
                break;

            case 'stockfish-17-single':
                loadStockfish.bind(this)('stockfish-17-single');
                break;

            case 'stockfish-16-1-wasm':
                loadLilaStockfish.bind(this)('16-0-worker');
                break;

            case 'stockfish-11':
                loadStockfish.bind(this)('stockfish-11');
                break;

            case 'stockfish-8':
                loadStockfish.bind(this)('stockfish-8');
                break;

            case 'fairy-stockfish-nnue-wasm': 
                loadLilaStockfish.bind(this)('f14-worker');
                break;

                case 'lozza-5':
                    const lozza = new Worker('../app/assets/engines/Lozza/lozza-5-acas.js');
                    let lozza_loaded = false;
    
                    lozza.onmessage = async e => {
                        if(!lozza_loaded) {
                            lozza_loaded = true;
    
                            this.engines.push({
                                'type': profileChessEngine,
                                'engine': (method, a) => lozza[method](...a),
                                'sendMsg': msg => lozza.postMessage(msg),
                                'worker': lozza,
                                profileName
                            });
    
                            startGame.bind(this)();
                        } else if (e.data) {
                            msgHandler(e.data);
                        }
                    };
    
                    lozza.onerror = e => {
                        restartEngine.bind(this)('lozza-5', e);
                    };
    
                    break;
    
                case 'lc0':
                    const lc0 = new Worker('../app/assets/engines/zerofish/zerofishWorker.js', { type: 'module' });
                    let lc0_loaded = false;
    
                    lc0.onmessage = async e => {
                        if(e.data === true) {
                            lc0_loaded = true;
    
                            this.engines.push({
                                'type': profileChessEngine,
                                'engine': (method, a) => lc0.postMessage({ method: method, args: [...a] }),
                                'sendMsg': msg => lc0.postMessage({ method: 'zero', args: [msg] }),
                                'worker': lc0,
                                profileName
                            });
    
                            await this.setEngineWeight(this.pV[profileName].lc0WeightName, profileName);
                
                            this.engineStartNewGame('chess', profileName);
                        } else if (e.data) {
                            msgHandler(e.data);
                        }
                    };
    
                    const waitLc0 = setInterval(() => {
                        if(lc0_loaded) {
                            clearInterval(waitLc0);
                            return;
                        }
    
                        lc0.postMessage({ method: 'acas_check_loaded' });
                    }, 100);

                    lc0.onerror = e => {
                        restartEngine.bind(this)('lc0', e);
                    };
    
                    break;

            default:
                loadStockfish.bind(this)('stockfish-17-lite-single');
                break;
        }
    }

    guiUpdater() {
        if(this.guiUpdaterActive) return;

        const g = setInterval(() => {
            if(this.instanceClosed) {
                clearInterval(g);

                this.guiUpdaterActive = false;
            }

            const additionalInfoElem = this.instanceElem.querySelector('.instance-additional-info');
            const lastActiveEnginesAmount = this.activeEnginesAmount;
            const lastVariantNotSupportedByEngineAmount = this.variantNotSupportedByEngineAmount;

            let newInfoStr = '';

            this.activeEnginesAmount = Object.keys(this.pV).length;
            this.variantNotSupportedByEngineAmount = 0;

            Object.keys(this.pV).forEach(profileName => {
                const profileVars = this.pV[profileName];
                const profileVariant = formatVariant(profileVars.chessVariant);
                const profileVariants = profileVars.chessVariants;

                const profileVariantExists = profileVariants.includes(profileVariant);

                if(!profileVariantExists) {
                    this.variantNotSupportedByEngineAmount++;
                }
            });

            if(this.activeEnginesAmount !== lastActiveEnginesAmount || this.variantNotSupportedByEngineAmount !== lastVariantNotSupportedByEngineAmount) {
                const correctedActiveAmount = this.activeEnginesAmount - this.variantNotSupportedByEngineAmount;

                const engineWord = transObj?.engineWord ?? 'engine';
                const enginesWord = transObj?.enginesWord ?? 'engines';
                const variantNotSupportedMsg = transObj?.variantNotSupported ?? 'Variant not supported';

                if(correctedActiveAmount == this.activeEnginesAmount) {
                    newInfoStr += ` (${this.activeEnginesAmount} ${this.activeEnginesAmount > 1 ? enginesWord : engineWord})`;
                }
                else if(correctedActiveAmount > 0) {
                    newInfoStr += ` (${correctedActiveAmount}/${this.activeEnginesAmount} ${correctedActiveAmount > 1 ? enginesWord : engineWord})`;
                } else {
                    newInfoStr += ` (${variantNotSupportedMsg})`;
                }
            }

            if(newInfoStr.length > 0) {
                additionalInfoElem.innerText = newInfoStr;

                updatePiP({ 'engineText': newInfoStr });
            }
        }, 500);

        this.guiUpdaterActive = true;
    }

    async setupEnvironment(startpos, dimensions) {
        if(this.environmentSetupRun)
            return;

        this.environmentSetupRun = true;

        try {
            const instanceContainerElem = document.querySelector('#acas-instance-container');

            let variant = 'chess';
            let warnedAboutOnlyOwnTurn = false;

            for(const profileName of Object.keys(this.pV)) {
                this.pV[profileName].pendingCalculations = [];

                const profileVariant = formatVariant(this.pV[profileName].chessVariant);

                if(profileVariant !== 'chess')
                    variant = profileVariant;

                const onlyCalculateOwnTurn = await this.getConfigValue(this.configKeys.onlyCalculateOwnTurn, profileName);

                if(!warnedAboutOnlyOwnTurn && variant != 'chess' && onlyCalculateOwnTurn) {
                    const msg = transObj?.ownTurnMightNotWorkVariants ?? "'Only Own Turn' setting might not work for variants!"
                    toast.warning(`${msg} (todo)`, 5000);

                    warnedAboutOnlyOwnTurn = true;
                }
            }

            let variantText = variant;
            let chessFont = formatChessFont(await this.getConfigValue(this.configKeys.chessFont));

            const formattedChessVariant = formatVariant(variant);
            const shouldSwitchFont = chessFont === 'staunty' && ![
                // Chess variants which don't have special pieces
                "chess", "crazyhouse", "chess960", 
                "kingofthehill", "threecheck", "3check", 
                "antichess", "atomic", "horde", 
                "racingkings", "bughouse", "doublechess", 
                "loserschess", "capablanca", "shatranj", 
                "kingscourt", "reversechess", "crazychess", 
                "normal", "fischerandom", "losers", 
                "shako", "knightmate", "perfect"
            ].includes(formattedChessVariant);

            if(shouldSwitchFont)
                chessFont = 'merida';

            this.variantStartPosFen = startpos;

            const currentFen = await USERSCRIPT.instanceVars.fen.get(this.instanceID);
            const fen = currentFen || this.variantStartPosFen;

            const orientation = await this.getPlayerColor();

            const boardDimensions = { 'width': dimensions[0], 'height': dimensions[1] };
            const instanceIdQuery = `[data-instance-id="${this.instanceID}"]`;

            this.currentFen = fen;

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
                    <div class="connection-warning-title">${transObj?.losingConnection ?? 'Losing connection'}</div>
                    <div class="connection-warning-subtitle">${transObj?.revisitReconnect ?? 'Revisit the page to reconnect'} 👁️</div>
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
                        <div class="instance-basic-info-title">
                            <div class="instance-variant" title="${transObj?.instanceVariant ?? 'Instance Chess Variant'}"></div>
                            <div class="instance-additional-info"></div>
                        </div>
                        <div class="instance-domain" title="${transObj?.instanceDomain ?? 'Instance Domain'}"></div>
                        <div class="instance-fen-container">
                            <div class="instance-fen-btn acas-fancy-button">${transObj?.showFenBtn ?? 'Show FEN'}</div>
                            <div class="instance-fen hidden" title="${transObj?.instanceFen ?? 'Instance Fen'}"></div>
                        </div>
                    </div>
                    <div class="instance-misc">
                        <div class="instance-settings-btn acas-fancy-button" title="${transObj?.openInstanceSettingsBtn ?? 'Open Instance Settings'}">⚙️</div>
                        <div class="instance-info-text"></div>
                    </div>
                </div>
                <div class="chessboard-components">
                    <div class="eval-bar">
                        <div class="eval-fill"></div>
                    </div>
                    <div class="chessground-x"></div>
                </div>
                <div class="gas-container">
                    <div class="gas" data-r></div>
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

                const didHide = [...instanceFenElem.classList].includes('hidden');

                if(didHide) {
                    showFenBtn.innerText = transObj?.showFenBtn ?? 'Show FEN';
                } else {
                    showFenBtn.innerText = transObj?.hideFenBtn ?? 'Hide FEN';
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
                    'variant': variant,
                    'engine': this.engines,
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

            if(fen.includes('8/8/8/8/8/8/8/8') && this.domain === 'chess.com') {
                const msg = transObj?.emptyBoardChesscomWarning ?? 'Oh, the board seems to be empty. This is most likely caused by the site displaying the board as an image which A.C.A.S cannot parse.\n\nPlease disable "Piece Animations: Arcade" on Chess.com settings! (Set to "None")';
                toast.error(msg);
            }

            this.guiUpdater();
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
        console.warn('Killing engine', i);

        let worker = null;

        if(typeof i === 'string') {
            const engineIndex = this.engines.findIndex(obj => obj.profileName === i);
            
            if(engineIndex !== -1) {
                worker = this.engines[engineIndex].worker;

                this.engines.splice(engineIndex, 1);

                if(this.pV[i]) {
                    this.Interface.boardUtils.removeMarkings(i);
                }

                delete this.pV[i];
            }
        } else if(typeof i === 'number') {
            if(i >= 0 && i < this.engines.length) {
                const profileName = this.engines[i].profile;

                worker = this.engines[i].worker;

                this.engines.splice(i, 1);

                if(this.pV[profileName]) {
                    this.Interface.boardUtils.removeMarkings(profileName);
                }

                delete this.pV[profileName];
            }
        }

        this.sendMsgToEngine('quit', i);

        setTimeout(() => {
            worker.terminate();
        }, 1000);
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