import loadEngine from './instance/loadEngine.js';
import engineMessageProcessor from './instance/engineMessageProcessor.js';
import renderMetric from './instance/renderMetric.js';
import renderFeedback from './instance/renderFeedback.js';
import Interface from './instance/Interface.js';
import updateSettings from './instance/updateSettings.js';
import calculateBestMoves from './instance/calculateBestMoves.js';
import setupEnvironment from './instance/setupEnvironment.js';
import engineStartNewGame from './instance/engineStartNewGame.js';
import { removeInstance } from './instanceManager.js';

const logEngineMessages = false,
      debugLogsEnabled = false;

const configKeys = Object.freeze(
[
    'engineElo', 'moveSuggestionAmount', 'arrowOpacity',
    'displayMovesOnExternalSite', 'showMoveGhost', 'showOpponentMoveGuess',
    'showOpponentMoveGuessConstantly', 'onlyShowTopMoves', 'maxMovetime',
    'chessVariant', 'chessEngine', 'lc0Weight',
    'engineNodes', 'chessFont', 'useChess960',
    'onlyCalculateOwnTurn', 'ttsVoiceEnabled', 'ttsVoiceName',
    'ttsVoiceSpeed', 'chessEngineProfile', 'primaryArrowColorHex',
    'secondaryArrowColorHex', 'opponentArrowColorHex', 'reverseSide',
    'engineEnabled', 'autoMove', 'autoMoveLegit',
    'autoMoveRandom', 'autoMoveAfterUser', 'legitModeType',
    'moveDisplayDelay', 'renderSquarePlayer', 'renderSquareEnemy',
    'renderSquareContested', 'renderSquareSafe', 'renderPiecePlayerCapture',
    'renderPieceEnemyCapture', 'renderOnExternalSite', 'feedbackOnExternalSite',
    'enableMoveRatings', 'enableEnemyFeedback', 'feedbackEngineDepth',
    'enableAdvancedElo', 'advancedElo', 'advancedEloDepth',
    'advancedEloSkill', 'advancedEloMaxError', 'advancedEloProbability',
    'advancedEloHash', 'advancedEloThreads', 'moveAsFilledSquares',
    'movesOnDemand', 'onlySuggestPieces'
].reduce((o, k) => (o[k] = k, o), {}));

export default class AcasInstance {
    constructor(domain, instanceID, chessVariant, onLoadCallbackFunction) {
        this.configKeys = configKeys;
        this.loadEngine = loadEngine;
        this.engineMessageProcessor = engineMessageProcessor;
        this.renderMetric = renderMetric;
        this.renderFeedback = renderFeedback;
        this.updateSettings = updateSettings;
        this.calculateBestMoves = calculateBestMoves;
        this.setupEnvironment = setupEnvironment;
        this.engineStartNewGame = engineStartNewGame;
        this.logEngineMessages = logEngineMessages;
        this.debugLogsEnabled = debugLogsEnabled;
        this.Interface = new Interface(this);
        this.config = {};

        Object.values(this.configKeys).forEach(key => { // setup config getters/setters
            this.config[key] = {
                get: profile => getGmConfigValue(key, this.instanceID, profile),
                set: null
            };
        });

        this.getConfigValue = async (key, profile) => {
            return await this.config[key]?.get(profile);
        }
    
        this.setConfigValue = (key, val, profile) => { // not used currently
            return this.config[key]?.set(val, profile);
        }

        this.instanceReady = false;
        this.instanceClosed = false;
        this.environmentSetupRun = false;

        this.domain = domain;
        this.instanceID = instanceID;

        this.onLoadCallbackFunction = onLoadCallbackFunction;

        this.chessground = null;
        this.instanceElem = null;
        this.BoardDrawer = null;
        this.boardDimensions = { 'width': 8, 'height': 8 };

        this.currentFen = null;
        this.defaultStartpos = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        this.activeVariant = '';
        this.variantStartPosFen = null;
        this.lastOrientation = null;
        this.lastTurn = null;
        this.kingMoved = '';

        this.engines = [];
        this.activeEnginesAmount = 0;
        this.variantNotSupportedByEngineAmount = 0;
        this.freezeEngineKilling = {};
        this.MoveEval = null;

        this.pV = {}; // profile variables

        this.unprocessedPackets = [];
        this.interfacePollingActive = false;

        this.moveHistory = [];
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

        this.CommLink = new CommLinkHandler(`backend_${this.instanceID}`, {
            'singlePacketResponseWaitTime': 1500,
            'maxSendAttempts': 3,
            'statusCheckInterval': 1,
            'silentMode': true,
            'functions': {
                'getValue': USERSCRIPT.getValue,
                'setValue': USERSCRIPT.setValue,
                'deleteValue': USERSCRIPT.deleteValue,
                'listValues': USERSCRIPT.listValues,
            }
        });

        this.CommLink.registerSendCommand('ping');
        this.CommLink.registerSendCommand('getFen');
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

        for(const profileObj of activeProfiles) {
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
                this.Interface.updateBoardOrientation(packet.data);
                return true;
            case 'reloadChessEngine':
                reloadChessEngine();
                return true;
            case 'updateBoardFen':
                this.Interface.updateBoardFen(packet.data);
                return true;
            case 'calculateBestMoves':
                this.calculateBestMoves(packet.data);
                return true;
            case 'calculateSpecificMoves':
                this.calculateBestMoves(this.currentFen, false, packet.data);
                return true;
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
        }
        
        else if(typeof elo == 'number') {
            const limitStrength = 0 < elo && elo <= 2600;
            const engineType = await this.getEngineType(profile);

            if(engineType === 'maia2' && !(1100 <= elo && elo <= 2000)) {
                toast.warning('"Maia 2" engine only supports 1100-2000 ELO! Your ELO was converted to the closest supported ELO, but please change the setting.', 30000);
            }

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
                    updatePipData({ 'goalDepth': null });

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

        this.contactEngine('setZeroWeights', [await loadFileAsUint8Array(`assets/lc0-nets/${weightName}`)], profile);
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

        const chessboardElems = [
            this.instanceElem.querySelector('.chessboard-components'),
            this.instanceElem.querySelector('.pseudoground-x')?.parentElement
        ];

        const chessFonts = ['merida', 'cburnett', 'staunty', 'letters'];

        chessFonts.forEach(str => {
            if(str == chessFontStr) {
                chessboardElems.forEach(x => x?.classList?.add(str));
            } else {
                chessboardElems.forEach(x => x?.classList?.remove(str));
            }
        });
    }

    async getEngineType(profile) {
        return await this.getConfigValue(this.configKeys.chessEngine, profile);
    }

    clearHistoryVariables(profileName) {
        // Clear previous calculations
        this.pV[profileName].pendingCalculations = [];
        this.pV[profileName].lastFen = null;

        this.moveHistory = [];
    }

    engineStopCalculating(profile, reason) {
        const profileStopCalculating = p => {
            if(!this.isEngineNotCalculating(p)) clearTimeout(this.pV[p].currentMovetimeTimeout);
                
            if(this.debugLogsEnabled) console.error('STOP CALCULATION ORDERED!', 'Reason:', reason, 'Profile:', profile);
    
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

    async isPlayerTurn(profile) {
        const playerColor = await this.getPlayerColor(profile);
        const turn = await this.getCurrentTurn();

        this.lastTurn = turn;

        return turn === playerColor;
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

            this.pV[profile].currentSpeeches.push(speakText(spokenText, speechConfig));
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
        if(!lastFen || !newFen) return false;
    
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

        if(this.debugLogsEnabled) console.warn('[Logical Change Detection] Changed pieces:', countChange);
    
        // Large abnormal piece changes are allowed, as they usually mean something significant has happened
        // Smaller abnormal piece changes are most likely caused by a faulty newFen provided by the A.C.A.S on the site
        return (-3 < countChange && countChange < -1) || (0 < countChange && countChange < 2);
    }

    // Kind of similar to isAbnormalPieceChange function, however it focuses on titles rather than pieces
    // It checks for how many titles had changes happen in them
    isCorrectAmountOfBoardChanges(lastFen, newFen) {
        if(!lastFen || !newFen) return true;
    
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
            (diff = 1) -> only one tile abruptly changed, shouldn't be possible
            (diff = 2) -> a piece moved, maybe it ate another piece
            (diff = 3) -> three tiles had changes, shouldn't be possible (NOTE: it's possible if the fen has skipped one turn...)
            (diff > 3) -> a lot of tiles had changes, maybe a new game started, the change is significant so allowing it
            (diff = 4) -> takeback or castling
        */

        this.moveDiffHistory.unshift(diff);
        this.moveDiffHistory = this.moveDiffHistory.slice(0, 3);

        if(this.debugLogsEnabled) console.warn('[Logical Change Detection] Changed squares:', diff, 'History:', JSON.stringify(this.moveDiffHistory));

        const isHistoryIndicatingPromotion = JSON.stringify(this.moveDiffHistory) === JSON.stringify([3, 1, 2]);
        
        if(diff > 5)
            this.engineStartNewGame();
        
        return diff === 2 || diff > 3 || isHistoryIndicatingPromotion;
    }

    isFenChangeLogical(lastFen, newFen) {
        if(this.activeVariant === 'atomic') return true;

        const correctAmountOfChanges = this.isCorrectAmountOfBoardChanges(lastFen, newFen);
        const isAbnormalPieceChange = this.isAbnormalPieceChange(lastFen, newFen);

        if(this.debugLogsEnabled) console.warn('[Logical Change Detection] Is FEN change logical:', { correctAmountOfChanges, isAbnormalPieceChange });

        return correctAmountOfChanges && !isAbnormalPieceChange;
    }

    async getPlayerColor(profile) {
        const playerColor = await USERSCRIPT.instanceVars.playerColor.get(this.instanceID);

        if(!playerColor) console.log('No playerColor value found for instance ID:', this.instanceID);

        if(profile && playerColor) {
            const reverseSide = await this.getConfigValue(this.configKeys.reverseSide, profile);

            if(reverseSide) {
                return playerColor.toLowerCase() === 'w' ? 'b' : 'w'; 
            }
        }

        return playerColor || 'w';
    }

    async getCurrentTurn() {
        const turn = await USERSCRIPT.instanceVars.turn.get(this.instanceID);

        if(!turn) console.log('No turn value found for instance ID:', this.instanceID);

        return turn || 'w';
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
                        if(this.debugLogsEnabled) console.warn('Attempted to send message to non existing engine?', `(${i})`);
                        clearInterval(waitForEngineToLoad);
                    }
                }

            }, 100);
        } else if(engineExists) {
            this.getEngineAcasObj(i).sendMsg(msg);
        } else {
            if(this.debugLogsEnabled) console.warn('Attempted to send message to non existing engine?', `(${i})`);
        }
    }

    isEngineNotCalculating(profile) {
        const profileObj = this.pV[profile];

        if(!profileObj) return true;

        return this.pV[profile].pendingCalculations.find(x => !x.finished) ? false : true;
    }

    async displayMoves(moveObjects, profile) {
        const displayMovesExternally = await this.getConfigValue(this.configKeys.displayMovesOnExternalSite, profile);
        const onlySuggestPieces = await this.getConfigValue(this.configKeys.onlySuggestPieces, profile);
        const movesOnDemand = await this.getConfigValue(this.configKeys.movesOnDemand, profile);

        this.Interface.markMoves(moveObjects, profile);

        if(displayMovesExternally) {
            this.CommLink.commands.markMoveToSite(moveObjects);
        }

        if(onlySuggestPieces && !movesOnDemand) {
            moveObjects.forEach(moveObj => {
                moveObj.player = [moveObj.player[0], '??'];
            });
        }

        updatePipData({ moveObjects });

        moveObjects.forEach(moveObj => {
            const spokenText = moveObj.player?.map(x =>
                x.split('').map(x =>`"${x}"`).join(' ') // e.g a1 -> "a" "1"
            ).join(', ');

            this.speak(spokenText, profile);
        });
    }

    startInterfacePolling() {
        if(this.interfacePollingActive) return;

        const g = setInterval(() => {
            if(this.instanceClosed) {
                clearInterval(g);

                this.interfacePollingActive = false;
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

                updatePipData({ 'engineText': newInfoStr });
            }
        }, 500);

        this.interfacePollingActive = true;
    }

    async processEarlyPackets() {
        for(let packet of this.unprocessedPackets) {
            await this.processPacket(packet);

            this.unprocessedPackets = this.unprocessedPackets.filter(p => p != packet);
        }
    }

    killEngine(i) {
        if(this.debugLogsEnabled) console.warn('Killing engine', i);

        let worker = null;

        if(typeof i === 'string') {
            if(this.freezeEngineKilling?.[i]) return;

            const engineIndex = this.engines.findIndex(obj => obj.profileName === i);
            
            if(engineIndex !== -1) {
                worker = this.engines[engineIndex].worker;

                this.engines.splice(engineIndex, 1);

                if(this.pV[i]) {
                    this.Interface.removeMarkings(i, 'Killing engine');
                }

                delete this.pV[i];
            }
        } else if(typeof i === 'number') {
            if(i >= 0 && i < this.engines.length) {
                const profileName = this.engines[i].profile;

                worker = this.engines[i].worker;

                this.engines.splice(i, 1);

                if(this.pV[profileName]) {
                    this.Interface.removeMarkings(profileName, 'Killing engine');
                }

                delete this.pV[profileName];
            }
        }

        this.sendMsgToEngine('quit', i);

        setTimeout(() => {
            if(worker) worker.terminate();
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

        if(this.MoveEval) {
            this.MoveEval.terminate();
            this.MoveEval = null;
        }

        this?.BoardDrawer?.terminate();
        this?.instanceElem?.remove();

        removeInstance(this);
    }
}