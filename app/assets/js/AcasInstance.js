import loadEngine from './instance/loadEngine.js';
import engineMessageProcessor from './instance/engineMessageProcessor.js';
import renderMetric from './instance/renderMetric.js';
import renderFeedback from './instance/renderFeedback.js';
import Interface from './instance/Interface.js';
import updateSettings from './instance/updateSettings.js';
import calculateBestMoves from './instance/calculateBestMoves.js';
import setupEnvironment from './instance/setupEnvironment.js';
import engineStartNewGame from './instance/engineStartNewGame.js';
import { sendUciToExternalEngine, closeAllExternalEnginesWithId } from './AcasWebSocketClient.js';
import { getDynamicEngineDbKeyPrefix } from './gui/dynamicEngineOptions.js';
import { getDynamicOption } from './gui/dynamicEngineOptions.js';
import { removeInstance } from './instanceManager.js';
import { updatePipData } from './gui/pip.js';

const logEngineMessages = false,
      debugLogsEnabled = false;

const configKeys = Object.freeze([
    'engineElo', 'engineEnemyElo', 'moveSuggestionAmount', 'arrowOpacity',
    'displayMovesOnExternalSite', 'showMoveGhost', 'showOpponentMoveGuess',
    'showOpponentMoveGuessConstantly', 'onlyShowTopMoves', 'maxMovetime',
    'chessVariant', 'chessEngine', 'useExternalChessEngine', 'lc0Weight',
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
    'enableAdvancedElo', 'advancedEloDepth', 'moveAsFilledSquares',
    'movesOnDemand', 'onlySuggestPieces', 'externalChessEngine'
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
                get: profile => GET_GM_CFG_VALUE(key, this.instanceID, profile),
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
                this.engineNodes = null;

                this.multiPV = 2;
        
                this.currentMovetimeTimeout = null;
        
                this.pastMoveObjects = [];
                this.bestMoveMarkingElem = null;
                this.activeGuiMoveMarkings = [];
                this.activeMetrics = [];
                this.activeFeedbackDisplays = [];
                this.pendingMoveDisplay = null;
        
                this.lastCalculatedFen = null;
                this.pendingCalculations = [];
        
                this.lastFen = null;
                this.lastFeedbackFen = null;

                this.usingAdvancedMode = null;
        
                this.currentSpeeches = [];
            }
        
            static async create(t, profileName) {
                const instance = new this();
        
                const variantFromConfig = await t.getConfigValue(t.configKeys.chessVariant, profileName);
                const use960FromConfig = await t.getConfigValue(t.configKeys.useChess960, profileName);

                instance.chessVariant = IS_VARIANT_960(chessVariant)
                    ? FORMAT_VARIANT('chess')
                    : FORMAT_VARIANT(chessVariant || variantFromConfig || 'chess');
                instance.useChess960 = IS_VARIANT_960(chessVariant) ? true : use960FromConfig;
                instance.lc0WeightName = await t.getConfigValue(t.configKeys.lc0Weight, profileName);
        
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
        this.CommLink.registerSendCommand('updateRestartListener');
        this.CommLink.registerSendCommand('updateConcealAssistanceListener');
        this.CommLink.registerSendCommand('applyAssistanceConcealment');

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

        this.externalEngineStatusChannel = new BroadcastChannel(EXTERNAL_STATUS_BROADCAST_NAME);
        this.externalEngineStatusChannel.onmessage = (event) => {
            const { statusType, reason, fen, engineId, profileName, instanceId } = event.data;

            if(this.instanceID !== instanceId) return;

            switch(statusType) {
                case 'engineDeathCertificate':
                    this.notifyAcasAboutEngineClosing(profileName);

                    break;
            }
        };

        this.externalEngineUciChannel = new BroadcastChannel(EXTERNAL_UCI_BROADCAST_NAME);
        this.externalEngineUciChannel.onmessage = (event) => {
            const { line, profileName, engineId, instanceId } = event.data;

            if(this.instanceID !== instanceId) return;

            //console.warn('Received UCI line', event?.data?.line);

            this.engineMessageProcessor(line, profileName);
        };

        this.guiBroadcastChannel = new BroadcastChannel(GUI_BROADCAST_NAME);
        this.guiBroadcastChannel.onmessage = async e => {
            if(!this.instanceReady || this.instanceClosed) return;
            
            const msg = e.data;

            switch(msg.type) {
                case 'settingSave':
                    const isFirstTime = msg?.data?.isFirstTime;
                    if(!isFirstTime) this.updateSettings(msg);

                    break;
                case 'newProfileMade':
                    const profileName = msg?.data?.profileName;
                    await this.createAndLoadSpecificEngine(profileName);

                    break;
            }
        };

        this.dynamicButtonPressChannel = new BroadcastChannel(DYNAMIC_BUTTONPRESS_BROADCAST_NAME);
        this.dynamicButtonPressChannel.onmessage = async e => {
            const { uciOptionName, profileName } = e.data;

            if(typeof uciOptionName === 'string' && typeof profileName === 'string')
                this.setEngineOption(uciOptionName, null, true, profileName);
            else
                toast.error('Failed to activate the button press, parsing the option failed.', 1000);
        };

        this.loadEngines();
    }

    async updateAdvancedModeStatus(profileName, value) {
        this.pV[profileName].usingAdvancedMode = value
            ? value
            : await this.getConfigValue(this.configKeys.enableAdvancedElo, profileName);
    }

    async createAndLoadSpecificEngine(profileName) {
        this.currentFen = await USERSCRIPT.instanceVars.fen.get(this.instanceID);

        const engineIndex = this.engines.findIndex(e => e.profileName === profileName);

        if(engineIndex !== -1) this.killEngine(profileName);

        this.pV[profileName] = await this.profileVariables.create(this, profileName);

        await this.updateAdvancedModeStatus(profileName);

        this.loadEngine(profileName);
    }

    notifyAcasAboutEngineClosing(profileName) {
        this.engineMessageProcessor('error Engine closed!', profileName);

        if(profileName) {
            setTimeout(() => {
                this.pV[profileName].pendingCalculations.forEach(x => x.finished = true);
            }, 25);
        }
    }

    async getSelectedExternalEngineId(profileName) {
        const externalChessEngine = await this.getConfigValue(this.configKeys.externalChessEngine, profileName);

        return externalChessEngine;
    }

    async loadEngines() {
        const profiles = await GET_PROFILES();
        const activeProfiles = profiles.filter(p => p.config.engineEnabled);

        for(const profileObj of activeProfiles) {
            await this.createAndLoadSpecificEngine(profileObj.name);
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
            case 'newMatchStarted':
                this.engineStartNewGame();
                return true;
            case 'calculateBestMoves':
                this.calculateBestMoves(packet.data);
                return true;
            case 'calculateSpecificMoves':
                this.calculateBestMoves(this.currentFen, { 'specificMovesObj': packet.data });
                return true;
            case 'forceInstanceRestart':
                FORCE_CLOSE_ALL_INSTANCES();
                return true;
            case 'toggleConcealAssistance':
                TOGGLE_CONCEAL_ASSISTANCE();
                return true;
        }
    }

    async applyDynamicOption(userscriptDbKey, optionValue, profileName, isApplyCausedByHuman) {
        const currentEngineId = await GET_ACTIVE_ENGINE_NAME(profileName);
        const dbPrefix = getDynamicEngineDbKeyPrefix(currentEngineId);
        //console.log(userscriptDbKey, profileName);
        const { name, defaultValue } = getDynamicOption(userscriptDbKey, profileName) ?? {};

        if(name === undefined || defaultValue === undefined) return false;

        const isNotForThisEngine = !userscriptDbKey.startsWith(dbPrefix);
        const isDefaultValue = VAR_TO_CORRECT_TYPE(optionValue) === VAR_TO_CORRECT_TYPE(defaultValue);
        const isWeirdValue = (typeof optionValue === 'string' && (/[<>]/.test(optionValue) || optionValue === 'value'));

        switch(name) { // name means the UCI option name
            case 'MultiPV':
                this.pV[profileName].multiPV = optionValue;
                break;
            case 'UCI_Chess960':
                this.pV[profileName].useChess960 = optionValue;
                break;
            case 'UCI_Variant':
                //this.pV[profileName].chessVariant = FORMAT_VARIANT(optionValue);
                break;
        }

        if(
            optionValue === null
            || isNotForThisEngine
            || (isDefaultValue && !isApplyCausedByHuman)
            || isWeirdValue
        ) return false;

        this.setEngineOption(name, optionValue, true, profileName);
    }

    async setEngineElo(elo, didUserUpdateSetting, profile) {
        if(typeof elo == 'number') {
            const limitStrength = 0 < elo && elo <= 2300;
            const engineType = await this.getEngineName(profile);
            const isExternal = IS_EXTERNAL_ENGINE_SETTING_ACTIVE[profile];

            const isMaiaEngine = engineType.includes('maia');
            const engineEnemyElo = await this.getConfigValue(this.configKeys.engineEnemyElo, profile);
            const maiaEloRanges = {
                maia2: [1100, 2000],
                maia3: [600, 2600]
            };

            if(isMaiaEngine && !isExternal) {
                const [min, max] = maiaEloRanges[engineType];

                const clampedEngineElo = Math.max(min, Math.min(max, elo));
                const clampedEnemyElo = Math.max(min, Math.min(max, engineEnemyElo));

                if(clampedEngineElo !== elo || clampedEnemyElo !== engineEnemyElo) {
                    toast.warning(`"Maia ${engineType === 'maia3' ? 3 : 2}" ELO: ${min}–${max}`, 30000);
                }

                this.sendMsgToEngine(`setoption name Enemy_Elo value ${clampedEnemyElo}`, profile);
                this.sendMsgToEngine(`setoption name UCI_Elo value ${clampedEngineElo}`, profile);

                if(didUserUpdateSetting) {
                    toast.message(`Maia ELO: ${clampedEngineElo} (${clampedEnemyElo})`, 3000);
                }
            } else this.sendMsgToEngine(`setoption name UCI_Elo value ${elo}`, profile);

            const skillLevelMsg = TRANS_OBJ?.engineSkillLevel ?? 'Engine skill level';
            const searchDepthMsg = TRANS_OBJ?.engineSearchDepth ?? 'Search depth';
            const engineNotLimitedSkillLevel = TRANS_OBJ?.engineNotLimitedSkillLevel ?? "Engine's skill level not limited";
            const engineNoLimitations = TRANS_OBJ?.engineNoLimitations ?? 'Engine has no strength limitations, running infinite depth!';
            
            if(limitStrength) {
                this.setEngineLimitStrength(true, profile);
    
                const skillLevel = GET_SKILL_FROM_ELO(elo);
                this.setEngineSkillLevel(skillLevel, profile);
    
                const depth = GET_DEPTH_FROM_ELO(elo);
                this.pV[profile].searchDepth = depth;

                if(didUserUpdateSetting && !isMaiaEngine)
                    toast.message(`${skillLevelMsg} ${skillLevel} | ${searchDepthMsg} ${depth}`, 8000);

            } else {
                this.setEngineLimitStrength(false, profile);
                this.setEngineSkillLevel(20, profile);

                if(elo !== 3200) {
                    const depth = GET_DEPTH_FROM_ELO(elo);
                    this.pV[profile].searchDepth = depth;

                    if(didUserUpdateSetting && !isMaiaEngine)
                        toast.message(`${engineNotLimitedSkillLevel} | ${searchDepthMsg} ${depth}`, 8000);
                } else {
                    this.pV[profile].searchDepth = null;
                    updatePipData({ 'goalDepth': null });

                    if(didUserUpdateSetting && !isMaiaEngine)
                        toast.message(engineNoLimitations, 8000);
                }
            }
        }
    }

    async setEngineWeight(weightName, profile) {
        // legacy support, convert 1100 -> maia-1100.pb etc.
        if(/^\d{4}(,\d{3})*$/.test(weightName)) {
            weightName = `maia-${weightName}.pb`;
        }

        this.pV[profile].lc0WeightName = weightName;

        this.contactEngine('setZeroWeights', [await LOAD_FILE_AS_UINT8_ARRAY(`assets/lc0-nets/${weightName}`)], profile);
    }

    setEngineOption(name, value = null, isDynamicOption, profile) {
        if(Number.isNaN(value) || value === undefined) return;

        this.sendMsgToEngine(`setoption name ${name}${value === null ? '' : ' value ' + value}`, profile, isDynamicOption);
    }

    disableEngineElo(profile) {
        this.sendMsgToEngine(`setoption name UCI_LimitStrength value false`, profile);
    }

    setEngineMultiPV(amount, profile) {
        if(typeof amount == 'number') {
            this.pV[profile].multiPV = amount;
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
            this.sendMsgToEngine(`setoption name Skill Level value ${amount}`, profile);
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

            this.pV[profile].chessVariant = FORMAT_VARIANT(variant);
            this.pV[profile].useChess960 = IS_VARIANT_960(variant) || await this.getConfigValue(this.configKeys.useChess960, profile);
        }
    }

    setChessFont(chessFontStr) {
        chessFontStr = FORMAT_CHESS_FONT(chessFontStr);

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

    async getEngineName(profile) {
        return await this.getConfigValue(this.configKeys.chessEngine, profile);
    }

    clearHistoryVariables(profileName) {
        this.pV[profileName].lastFen = null;

        this.moveHistory = [];
    }

    engineStopCalculating(profile, reason) {
        const profileStopCalculating = p => {
            if(this.isEngineCalculating(p)) clearTimeout(this.pV[p].currentMovetimeTimeout);

            this.sendMsgToEngine('stop', p);
                
            if(this.debugLogsEnabled) console.error('STOP CALCULATION ORDERED!', 'Reason:', reason, 'Profile:', profile);
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

            this.pV[profile].currentSpeeches.push(SPEAK_TEXT(spokenText, speechConfig));
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
    
        const lastPieceCount = COUNT_TOTAL_PIECES_FROM_FEN(lastFen);
        const newPieceCount = COUNT_TOTAL_PIECES_FROM_FEN(newFen);

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

    getProfileName(i) {
        if(typeof i === 'string') return i;

        const keys = Object.keys(this.engines);

        if(typeof i === 'object' && i !== null) {
            return keys.find(key => key === i.name) || i.name;
        }

        const index = (typeof i === 'number') ? i : keys.length - 1;
        return keys[index] || 'engine';
    }

    contactEngine(method, args, i) {
        return this.getEngineAcasObj(i)['engine'](method, args);
    }

    async sendMsgToEngine(msg, i, isDynamicOption) {
        const isProfile = typeof i === 'string' && this.pV[i];
        const engineExists = this.getEngineAcasObj(i)?.sendMsg;
        const isBannedOptionSet = msg.startsWith('setoption name')
            && (isProfile && this.pV[i].usingAdvancedMode && !isDynamicOption);

        if(isBannedOptionSet) return;
        
        if(IS_EXTERNAL_ENGINE_SETTING_ACTIVE?.[i] && isProfile) {
            const profileName = this.getProfileName(i);
            const engineId = await this.getSelectedExternalEngineId(profileName);

            sendUciToExternalEngine(msg, engineId, profileName, this.instanceID);

        } else if(!engineExists && isProfile) {
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

    isEngineCalculating(profile) {
        const profileObj = this.pV[profile];

        if(!profileObj) return false;

        return this.pV[profile].pendingCalculations.find(x => !x.finished) ? true : false;
    }

    async displayMoves(moveObjects, profile, bypassConcealmentCheck) {
        if(CONCEAL_ASSISTANCE_ACTIVE && !bypassConcealmentCheck) {
            this.pV[profile].pendingMoveDisplay = [moveObjects, profile, true];
            return;
        }

        this.pV[profile].pendingMoveDisplay = null;
        
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
            const spokenText = moveObj.player
                ?.map(x => {
                    const [letter, number] = x.toUpperCase().split('');
                    const spokenLetter = letter === 'A' ? 'AA' : letter;
                    return `"${spokenLetter}"\n"${number}"`;
                })
                .join('\n');

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
                const profileVariant = FORMAT_VARIANT(profileVars.chessVariant);
                const profileVariants = profileVars.chessVariants;

                const profileVariantExists = profileVariants.includes(profileVariant);

                if(!profileVariantExists) {
                    this.variantNotSupportedByEngineAmount++;
                }
            });

            if(this.activeEnginesAmount !== lastActiveEnginesAmount || this.variantNotSupportedByEngineAmount !== lastVariantNotSupportedByEngineAmount) {
                const correctedActiveAmount = this.activeEnginesAmount - this.variantNotSupportedByEngineAmount;

                const engineWord = TRANS_OBJ?.engineWord ?? 'engine';
                const enginesWord = TRANS_OBJ?.enginesWord ?? 'engines';
                const variantNotSupportedMsg = TRANS_OBJ?.variantNotSupported ?? 'Variant not supported';

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

        if(typeof i === 'string') {
            if(this.freezeEngineKilling?.[i]) return;

            const engineIndex = this.engines.findIndex(obj => obj.profileName === i);
            
            if(engineIndex !== -1) {
                this.engines[engineIndex].worker?.terminate();
                delete this.engines?.[engineIndex];

                this.engines.splice(engineIndex, 1);

                if(this.pV[i]) {
                    this.Interface.removeMarkings(i, 'Killing engine');
                }

                delete this.pV[i];
            }
        } else if(typeof i === 'number') {
            if(i >= 0 && i < this.engines.length) {
                const profileName = this.engines[i].profile;

                this.engines[i].worker?.terminate();
                delete this.engines[i].worker;

                this.engines.splice(i, 1);

                if(this.pV[profileName]) {
                    this.Interface.removeMarkings(profileName, 'Killing engine');
                }

                delete this.pV[profileName];
            }
        }
    }

    async killEngines() {
        for(let i = this.engines.length - 1; i >= 0; i--) {
            this.killEngine(i);
        }
    }

    close() {
        this.instanceClosed = true;

        if(this.externalEngineStatusChannel) {
            this.externalEngineStatusChannel.onmessage = null;
            this.externalEngineStatusChannel.close();
            this.externalEngineStatusChannel = null;
        }

        if(this.externalEngineUciChannel) {
            this.externalEngineUciChannel.onmessage = null;
            this.externalEngineUciChannel.close();
            this.externalEngineUciChannel = null;
        }

        if(this.guiBroadcastChannel) {
            this.guiBroadcastChannel.onmessage = null;
            this.guiBroadcastChannel.close();
            this.guiBroadcastChannel = null;
        }

        if(this.dynamicButtonPressChannel) {
            this.dynamicButtonPressChannel.onmessage = null;
            this.dynamicButtonPressChannel.close();
            this.dynamicButtonPressChannel = null;
        }

        this?.killEngines();

        this?.CommLink?.kill();

        if(this.MoveEval) {
            this.MoveEval.terminate();
            this.MoveEval = null;
        }

        this?.BoardDrawer?.terminate();
        this?.instanceElem?.remove();

        closeAllExternalEnginesWithId(this.instanceID, 'instanceId');

        removeInstance(this);
    }
}