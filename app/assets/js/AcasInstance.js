import loadEngine from './instance/loadEngine.js';
import engineMessageProcessor from './instance/engineMessageProcessor.js';
import renderMetric from './instance/renderMetric.js';
import renderFeedback, { clearFeedback } from './instance/renderFeedback.js';
import Interface from './instance/Interface.js';
import updateSettings from './instance/updateSettings.js';
import calculateBestMoves from './instance/calculateBestMoves.js';
import setupEnvironment from './instance/setupEnvironment.js';
import engineStartNewGame from './instance/engineStartNewGame.js';
import syncDynamicSettings from './instance/syncDynamicSettings.js';
import applyDynamicOption from './instance/applyDynamicOption.js';
import { setDynamicSettingsContext, removeDynamicSettingsContext } from './gui/dynamicSettings.js';
import { sendUciToExternalEngine, closeAllExternalEnginesWithId } from './AcasWebSocketClient.js';
import { removeInstance } from './instanceManager.js';
import { updatePipData } from './gui/pip.js';
import { pipSanInput } from './gui/elementDeclarations.js';
import { formatMoveNotationAsync, getMoveSpeechConfig } from './misc/moveNotation.js';
import { isActivityLoggingEnabled, logActivity } from './misc/activityLog.js';

const logEngineMessages = false,
      debugLogsEnabled = false;

const configKeys = Object.freeze([
    'engineElo', 'engineEnemyElo', 'moveSuggestionAmount', 'arrowOpacity',
    'displayMovesOnExternalSite', 'showMoveGhost', 'showOpponentMoveGuess',
    'showOpponentMoveGuessConstantly', 'onlyShowTopMoves', 'maxMovetime',
    'chessVariant', 'chessEngine', 'useExternalChessEngine', 'lc0Weight',
    'engineNodes', 'chessFont', 'useChess960', 'alwaysMyTurn', 'openingBookName',
    'onlyCalculateOwnTurn', 'ttsVoiceEnabled', 'ttsVoiceName',
    'ttsVoiceSpeed', 'ttsTranslateAudio', 'ttsAnnounceEnemyMoves', 'ttsAnnounceEvaluation', 'chessEngineProfile', 'primaryArrowColorHex',
    'secondaryArrowColorHex', 'opponentArrowColorHex', 'bookMoveColorHex',
    'bookMoveOpacity', 'reverseSide', 'engineEnabled', 'autoMove', 'autoMoveLegit',
    'autoMoveRandom', 'autoMoveAfterUser', 'legitModeType', 'enableEveryPieceEvals',
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
        this.syncDynamicSettings = syncDynamicSettings;
        this.applyDynamicOption = applyDynamicOption;
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
            const name = typeof profile === 'object' ? profile?.name : profile;
            const snapshot = this.applyingSettings?.get(name)
                ?? (!this.pV?.[name]?.engineSettingsReady ? this.pV?.[name]?.startupConfig : null);
            if(snapshot && Object.hasOwn(snapshot, key)) return snapshot[key];
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
        logActivity('instance', `Instance created for ${domain}.`, { instanceID, site: domain });

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
        this.lastAcceptedBasicFen = null;

        this.engines = [];
        this.activeEnginesAmount = 0;
        this.variantNotSupportedByEngineAmount = 0;
        this.freezeEngineKilling = {};
        this.MoveEval = null;
        this.BoardPiecesEval = null;

        this.pV = {}; // profile variables

        this.unprocessedPackets = [];
        this.interfacePollingActive = false;

        this.moveDiffHistory = [];
        this.gameStateHistory = [];
        
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
                this.currentStopTimeout = null;
        
                this.pastMoveObjects = [];
                this.bestMoveMarkingElem = null;
                this.activeGuiMoveMarkings = [];
                this.bookMoveMarkings = [];
                this.activeMetrics = [];
                this.activeFeedbackDisplays = [];
                this.pendingMoveDisplay = null;
        
                this.lastCalculatedFen = null;
                this.pendingCalculations = [];
        
                this.lastFen = null;
                this.lastFeedbackFen = null;

                this.activePieceEvalDisplays = [];

                this.usingAdvancedMode = null;

                this.futureMoves = [];
                this.activeFutureMoveMarkings = [];
        
                this.currentSpeeches = [];
            }
        
            static async create(t, profileName, resolvedConfig) {
                const instance = new this();
        
                const variantFromConfig = await t.getConfigValue(t.configKeys.chessVariant, profileName);
                const use960FromConfig = await t.getConfigValue(t.configKeys.useChess960, profileName);

                const detectedVariant = resolvedConfig?.dynamicSettings?.chessVariant?.enabled
                    ? variantFromConfig : chessVariant || variantFromConfig;

                instance.chessVariant = IS_VARIANT_960(detectedVariant)
                    ? FORMAT_VARIANT('chess')
                    : FORMAT_VARIANT(detectedVariant || 'chess');
                instance.useChess960 = IS_VARIANT_960(detectedVariant) ? true : use960FromConfig;
                instance.lc0WeightName = await t.getConfigValue(t.configKeys.lc0Weight, profileName);
                instance.useExternalChessEngine = await t.getConfigValue(t.configKeys.useExternalChessEngine, profileName);
                instance.requestedEngine = await t.getConfigValue(t.configKeys.chessEngine, profileName);
                instance.externalChessEngine = await t.getConfigValue(t.configKeys.externalChessEngine, profileName);
        
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
        this.CommLink.registerSendCommand('renderVisualsToSite');
        this.CommLink.registerSendCommand('updateDynamicContext');
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
            const { statusType, reason, fen, engineId, profileName, instanceId, recoverable } = event.data;

            if(this.instanceID !== instanceId) return;
            const profileVariables = this.pV[profileName];
            if(this.instanceClosed || !profileVariables?.useExternalChessEngine
                || String(profileVariables.externalChessEngine) !== String(engineId)) return;

            switch(statusType) {
                case 'engineDeathCertificate':
                    if(recoverable || reason === 'Engine process closed') {
                        this.recoverExternalEngineSearch(profileName, null, reason).catch(console.error);
                    } else if(!profileVariables.recoveringSearch || (reason !== 'Relaunch'
                        && reason !== `All engines with identifierKey "${JSON.stringify([profileVariables.externalChessEngine, profileName, this.instanceID])}" were closed by client`)) {
                        this.notifyAcasAboutEngineClosing(profileName);
                    }

                    break;
            }
        };

        this.externalEngineUciChannel = new BroadcastChannel(EXTERNAL_UCI_BROADCAST_NAME);
        this.externalEngineUciChannel.onmessage = (event) => {
            const { line, profileName, engineId, instanceId } = event.data;

            if(this.instanceID !== instanceId) return;
            if(this.instanceClosed || !this.pV[profileName]?.useExternalChessEngine
                || String(this.pV[profileName].externalChessEngine) !== String(engineId)) return;

            //console.warn('Received UCI line', event?.data?.line);

            this.engineMessageProcessor(line, profileName).catch(console.error);
        };

        this.guiBroadcastChannel = new BroadcastChannel(GUI_BROADCAST_NAME);
        this.guiBroadcastChannel.onmessage = async e => {
            if(this.instanceClosed) return;
            const msg = e.data;
            // A profile waiting for its first external engine cannot become ready until this save.
            if(!this.instanceReady && !(msg.type === 'settingSave' && msg.data?.key === 'externalChessEngine')) return;

            switch(msg.type) {
                case 'settingSave': {
                    const isFirstTime = msg?.data?.isFirstTime;
                    if(msg.data?.instanceID != null && String(msg.data.instanceID) !== String(this.instanceID)) break;
                    if(!isFirstTime && !msg.data?.noProfile && msg.data?.profile?.name)
                        await this.syncDynamicSettings(msg.data.profile.name, [msg.data.key]);
                    else if(!isFirstTime) await this.updateSettings(msg);
                    break;
                }
                case 'dynamicSettingsChange': {
                    const data = msg.data;
                    if(data?.instanceID != null && String(data.instanceID) !== String(this.instanceID)) break;
                    if(!data?.profile || !data?.key) break;
                    this.engineStopCalculating(data.profile, 'Dynamic graph changed');
                    await this.syncDynamicSettings(data.profile, [data.key]);
                    if(this.currentFen && this.pV[data.profile]?.engineSettingsReady) {
                        this.engineStopCalculating(data.profile, 'Dynamic graph changed');
                        await this.renderMetric(this.currentFen, data.profile).catch(console.error);
                        this.pV[data.profile]?.pendingCalculations?.forEach(calculation => { calculation.fen = null; });
                        this.calculateBestMoves(this.currentFen, { specificProfileName: data.profile, skipValidityChecks: true });
                    }
                    break;
                }
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
                toast.error(TRANS_OBJ?.dynamicButtonPressParseError ?? 'Failed to activate the button press, parsing the option failed.', 1000);
        };

        this.loadOpeningBook();
        this.loadEngines();
    }

    async updateAdvancedModeStatus(profileName, value) {
        this.pV[profileName].usingAdvancedMode = value
            ? value
            : await this.getConfigValue(this.configKeys.enableAdvancedElo, profileName);
    }

    async createAndLoadSpecificEngine(profileName, resolvedConfig) {
        this.currentFen = await USERSCRIPT.instanceVars.fen.get(this.instanceID);
        if(this.instanceClosed) return;
        if(this.currentFen && DynamicSettingsCore.getVariableValue('pieceCount', DynamicSettingsCore.getContext(this.instanceID)) === null)
            setDynamicSettingsContext(this.instanceID, this.currentFen);
        this.killEngine(profileName);

        this.pV[profileName] = await this.profileVariables.create(this, profileName, resolvedConfig);
        this.pV[profileName].startupConfig = resolvedConfig;
        if(this.instanceClosed) { delete this.pV[profileName]; return; }
        this.effectiveSettings ??= new Map();
        const profile = resolvedConfig ? { config: resolvedConfig } : await GET_PROFILE_FOR_INSTANCE(profileName, this.instanceID);
        if(profile) this.effectiveSettings.set(profileName, structuredClone(profile.config));
        if(profile && !this.pendingDynamicSettingChanges?.has(profileName)) {
            this.pendingDynamicSettingChanges ??= new Map();
            this.pendingDynamicSettingChanges.set(profileName, { previous: null, current: profile.config,
                keys: Object.keys(profile.config.dynamicSettings ?? {}) });
        }

        await this.updateAdvancedModeStatus(profileName);

        await this.loadEngine(profileName);
    }

    notifyAcasAboutEngineClosing(profileName) {
        const variables = this.pV[profileName];
        clearTimeout(variables?.currentMovetimeTimeout);
        clearTimeout(variables?.currentStopTimeout);
        variables?.pendingCalculations?.forEach(x => x.finished = true);
        if(variables) {
            variables.engineSettingsReady = false;
            variables.externalCommandGeneration = (variables.externalCommandGeneration ?? 0) + 1;
            if(variables.recoveringSearch) variables.externalRecoveryCancelled = true;
            delete variables.externalCrashPending;
            delete variables.pendingCalculationRequest;
        }
        this.engineMessageProcessor('error Engine closed!', profileName).catch(console.error);
    }

    async getSelectedExternalEngineId(profileName) {
        const externalChessEngine = await this.getConfigValue(this.configKeys.externalChessEngine, profileName);

        return externalChessEngine;
    }

    async loadEngines() {
        const profiles = await GET_PROFILES(this.instanceID);
        const activeProfiles = profiles.filter(p => p.config.engineEnabled);

        for(const profileObj of activeProfiles) {
            await this.createAndLoadSpecificEngine(profileObj.name);
        }
    }

    async processPacket(packet) {
        switch(packet.command) {
            case 'ping':
                return `pong (took ${Date.now() - packet.date}ms)`;
            case 'log':
                this.Interface.frontLog(packet.data);
                return true;
            case 'updateBoardOrientation':
                this.Interface.updateBoardOrientation(packet.data);
                return true;
            case 'updateBoardFen':
                this.Interface.updateBoardFen();
                return true;
            case 'newMatchStarted':
                this.startNewMatch().catch(console.error);
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

    startNewMatch() {
        if(this.newMatchPromise) return this.newMatchPromise;
        logActivity('game', 'New game started; resetting dynamic settings and engines.', { instanceID: this.instanceID });
        this.newMatchPromise = (async () => {
            this.dynamicEvaluationFen = null;
            DynamicSettingsCore.setContext(this.instanceID, { gameStart: 1, evaluation: null });
            await this.syncDynamicSettings();
            await this.engineStartNewGame();
            this.Interface.lastAcceptedBasicFen = null;
            await this.Interface.updateBoardFen({ skipValidityChecks: true });
        })().finally(() => { this.newMatchPromise = null; });
        return this.newMatchPromise;
    }

    async setEngineElo(elo, didUserUpdateSetting, profile) {
        if(typeof elo === 'number') {
            const profileVariables = this.pV[profile];
            if(!profileVariables) return false;
            const limitStrength = 0 < elo && elo <= 2300;
            const engineType = await this.getEngineName(profile);
            const isExternal = await this.getConfigValue(this.configKeys.useExternalChessEngine, profile);

            const isMaiaEngine = engineType.includes('maia');
            const engineEnemyElo = await this.getConfigValue(this.configKeys.engineEnemyElo, profile);
            if(this.pV[profile] !== profileVariables || this.instanceClosed) return false;
            const appliedSettings = profileVariables.appliedSettings ??= {};
            const maiaEloRanges = {
                maia2: [1100, 2000],
                maia3: [600, 2600]
            };

            if(isMaiaEngine && !isExternal) {
                const [min, max] = maiaEloRanges[engineType];

                const clampedEngineElo = Math.max(min, Math.min(max, elo));
                const clampedEnemyElo = Math.max(min, Math.min(max, engineEnemyElo));

                if(didUserUpdateSetting && (clampedEngineElo !== elo || clampedEnemyElo !== engineEnemyElo)) {
                    toast.warning(`"Maia ${engineType === 'maia3' ? 3 : 2}" ELO: ${min}–${max}`, 30000);
                }

                if(await this.sendMsgToEngine(`setoption name Enemy_Elo value ${clampedEnemyElo}`, profile) === false
                    || this.pV[profile] !== profileVariables || this.instanceClosed) return false;
                if(await this.sendMsgToEngine(`setoption name UCI_Elo value ${clampedEngineElo}`, profile) === false
                    || this.pV[profile] !== profileVariables || this.instanceClosed) return false;
                appliedSettings.engineElo = clampedEngineElo;
                appliedSettings.engineEnemyElo = clampedEnemyElo;

                if(didUserUpdateSetting) {
                    toast.message(`Maia ELO: ${clampedEngineElo} (${clampedEnemyElo})`, 3000);
                }
            } else {
                if(await this.sendMsgToEngine(`setoption name UCI_Elo value ${elo}`, profile) === false
                    || this.pV[profile] !== profileVariables || this.instanceClosed) return false;
                appliedSettings.engineElo = elo;
            }

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
            return { appliedValue: appliedSettings.engineElo };
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

        return this.sendMsgToEngine(`setoption name ${name}${value === null ? '' : ' value ' + value}`, profile, isDynamicOption);
    }

    disableEngineElo(profile) {
        this.sendMsgToEngine(`setoption name UCI_LimitStrength value false`, profile);
    }

    setEngineMultiPV(amount, profile, isDynamicOption = false) {
        if(typeof amount === 'number') {
            this.pV[profile].multiPV = amount;
            this.sendMsgToEngine(`setoption name MultiPV value ${Math.max(1, amount)}`, profile, isDynamicOption);
        }
    }

    setEngineThreads(amount, profile) {
        if(typeof amount === 'number') {
            this.sendMsgToEngine(`setoption name Threads value ${amount}`, profile);
        }
    }

    setEngineNodesTime(amount, profile) {
        if(typeof amount === 'number') {
            this.sendMsgToEngine(`setoption name nodestime value ${amount}`, profile);
        }
    }

    setEngineMaxError(amount, profile) {
        if(typeof amount === 'number') {
            this.sendMsgToEngine(`setoption name Skill Level Maximum Error value ${amount}`, profile);
        }
    }

    setEngineProbability(amount, profile) {
        if(typeof amount === 'number') {
            this.sendMsgToEngine(`setoption name Skill Level Probability value ${amount}`, profile);
        }
    }
    
    setEngineHashSize(amount, profile) {
        if(typeof amount === 'number') {
            this.sendMsgToEngine(`setoption name Hash value ${amount}`, profile);
        }
    }

    setEngineSkillLevel(amount, profile) {
        if(typeof amount === 'number' && -20 <= amount && amount <= 20) {
            this.sendMsgToEngine(`setoption name Skill Level value ${amount}`, profile);
        }
    }

    setEngineLimitStrength(bool, profile) {
        if(typeof bool === 'boolean') {
            this.sendMsgToEngine(`setoption name UCI_LimitStrength value ${bool}`, profile);
        }
    }

    setEngineShowWDL(bool, profile) {
        if(typeof bool === 'boolean') {
            this.sendMsgToEngine(`setoption name UCI_ShowWDL value ${bool}`, profile);
        }
    }

    set960Mode(val, profile, isDynamicOption = false) {
        const bool = val ? true : false;

        this.sendMsgToEngine(`setoption name UCI_Chess960 value ${bool}`, profile, isDynamicOption);

        this.pV[profile].useChess960 = bool;
    }

    async setEngineVariant(variant, profile, isDynamicOption = false) {
        if(typeof variant === 'string') {
            this.sendMsgToEngine(`setoption name UCI_Variant value ${variant}`, profile, isDynamicOption);

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
            if(str === chessFontStr) {
                chessboardElems.forEach(x => x?.classList?.add(str));
            } else {
                chessboardElems.forEach(x => x?.classList?.remove(str));
            }
        });
    }

    async getEngineName(profile) {
        return this.getEngineAcasObj(profile)?.type ?? await this.getConfigValue(this.configKeys.chessEngine, profile);
    }

    getEngineActivityContext(profile) {
        const profileVariables = this.pV[profile];
        if(!profileVariables) return { site: this.domain };
        if(profileVariables.useExternalChessEngine) {
            const engineId = profileVariables.externalChessEngine;
            const engineItem = [...document.querySelectorAll('#external-engine-dropdown .dropdown-item')]
                .find(item => item.dataset.value === engineId);
            const engine = engineItem?.querySelector('.engine-type-tag.list-tag')?.textContent?.trim()
                || 'External engine';
            return { engine, engineId, site: this.domain };
        }
        return {
            engine: this.getEngineAcasObj(profile)?.type ?? profileVariables.requestedEngine,
            site: this.domain
        };
    }

    clearHistoryVariables(profileName) {
        this.pV[profileName].lastFen = null;
        delete this.pV[profileName].spokenAdvantage;
        delete this.pV[profileName].spokenEvaluationFen;
    }

    engineStopCalculating(profile, reason) {
        const profileStopCalculating = p => {
            const profileVariables = this.pV[p];
            const calculation = profileVariables?.pendingCalculations.find(x => !x.finished);
            if(!calculation || calculation.stopRequested || profileVariables.recoveringSearch) return;

            calculation.stopRequested = true;
            clearTimeout(profileVariables.currentMovetimeTimeout);
            // A search still sending its position/go will either cancel or stop after go is sent.
            if(profileVariables.useExternalChessEngine && calculation.goSent === false) return;
            this.sendMsgToEngine('stop', p).catch(console.error);

            if(profileVariables.useExternalChessEngine) {
                // UCI requires bestmove after stop, but some external engines never send it.
                // Restart only this engine/profile/instance; don't attribute late output to a new search.
                profileVariables.currentStopTimeout = setTimeout(() => {
                    if(this.instanceClosed || this.pV[p] !== profileVariables || calculation.finished) return;
                    this.recoverExternalEngineSearch(p, calculation).catch(console.error);
                }, 5000);
            }
                
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

    async recoverExternalEngineSearch(profile, calculation, crashReason) {
        const variables = this.pV[profile];
        if(this.instanceClosed || !variables?.useExternalChessEngine || variables.externalRecoveryCancelled
            || (!crashReason && calculation?.finished)) return;
        const isCurrentRecovery = () => !this.instanceClosed && this.pV[profile] === variables
            && !variables.externalRecoveryCancelled;
        if(variables.recoveringSearch) {
            // A replacement can crash during startup. Retain it for the recovery owner, not a parallel restart.
            if(crashReason) {
                variables.externalCrashPending = crashReason;
                variables.engineSettingsReady = false;
                variables.externalCommandGeneration = (variables.externalCommandGeneration ?? 0) + 1;
                variables.pendingCalculations.forEach(x => x.finished = true);
            }
            return;
        }
        variables.recoveringSearch = true;
        variables.externalCommandGeneration = (variables.externalCommandGeneration ?? 0) + 1;
        variables.engineSettingsReady = false;
        clearTimeout(variables.currentMovetimeTimeout);
        clearTimeout(variables.currentStopTimeout);
        variables.pendingCalculations.forEach(x => x.finished = true);
        logActivity('warning', crashReason ? `${crashReason}; attempting automatic recovery.`
            : 'External engine did not finish after stop; restarting its search.', {
            instanceID: this.instanceID, profile
        });

        try {
            const identifierKey = JSON.stringify([variables.externalChessEngine, profile, this.instanceID]);
            if(await closeAllExternalEnginesWithId(identifierKey, 'identifierKey') === false) return;
            if(!isCurrentRecovery()) return;
            if(crashReason) {
                const now = Date.now();
                if(now - (variables.externalLastCrashAt ?? 0) > 60000) variables.externalCrashRecoveryAttempts = 0;
                variables.externalLastCrashAt = now;
                if((variables.externalCrashRecoveryAttempts ?? 0) >= 3) {
                    delete variables.pendingCalculationRequest;
                    delete variables.externalCrashPending;
                    logActivity('error', 'External engine keeps crashing; automatic recovery paused after three retries. Reload the engine to retry.', {
                        instanceID: this.instanceID, profile
                    });
                    return;
                }
                variables.externalCrashRecoveryAttempts = (variables.externalCrashRecoveryAttempts ?? 0) + 1;
                await new Promise(resolve => setTimeout(resolve, 200 * 2 ** (variables.externalCrashRecoveryAttempts - 1)));
                if(!isCurrentRecovery()) return;
            } else if((variables.externalSearchRecoveryAttempts ?? 0) >= 2) {
                delete variables.pendingCalculationRequest;
                logActivity('error', 'External engine repeatedly failed to stop; automatic recovery paused. Reload the engine to retry.', {
                    instanceID: this.instanceID, profile
                });
                return;
            } else {
                variables.externalSearchRecoveryAttempts = (variables.externalSearchRecoveryAttempts ?? 0) + 1;
            }
            await this.engineStartNewGame(variables.chessVariant, profile);
        } catch(error) {
            variables.engineSettingsReady = false;
            logActivity('error', `External engine recovery failed: ${error?.message ?? error}`, {
                instanceID: this.instanceID, profile
            });
        } finally {
            variables.recoveringSearch = false;
        }

        if(!isCurrentRecovery()) return;
        if(variables.externalCrashPending) {
            const reason = variables.externalCrashPending;
            delete variables.externalCrashPending;
            variables.engineSettingsReady = false;
            return this.recoverExternalEngineSearch(profile, null, reason);
        }
        if(this.instanceClosed || this.pV[profile] !== variables || !variables.engineSettingsReady) return;
        const request = variables.pendingCalculationRequest;
        delete variables.pendingCalculationRequest;
        await this.calculateBestMoves(this.currentFen, request?.fen === this.currentFen
            ? request.config : { specificProfileName: profile });
    }

    async isPlayerTurn(profile) {
        const playerColor = await this.getPlayerColor(profile);
        const turn = await this.getCurrentTurn();

        this.lastTurn = turn;

        return turn === playerColor;
    }

    async speak(moveObj, profile, settingKey = 'ttsVoiceEnabled', options = {}) {
        const variables = this.pV[profile];
        const speechFen = this.currentFen;
        if(!variables || this.instanceClosed || CONCEAL_ASSISTANCE_ACTIVE) return;
        const isTTSEnabled = await this.getConfigValue(this.configKeys[settingKey], profile);

        if(isTTSEnabled) {
            const [ttsVoiceName, ttsVoiceSpeed, translateAudio] = await Promise.all([
                this.getConfigValue(this.configKeys.ttsVoiceName, profile),
                this.getConfigValue(this.configKeys.ttsVoiceSpeed, profile),
                this.getConfigValue(this.configKeys.ttsTranslateAudio, profile)
            ]);
            if(this.pV[profile] !== variables || this.instanceClosed || CONCEAL_ASSISTANCE_ACTIVE
                || options.isCurrent && !options.isCurrent()) return;
            if(!await this.getConfigValue(this.configKeys[settingKey], profile)) return;
            if(this.pV[profile] !== variables || this.instanceClosed || CONCEAL_ASSISTANCE_ACTIVE
                || options.isCurrent && !options.isCurrent()) return;
            const speech = getMoveSpeechConfig(translateAudio);
            const useSan = Boolean(options.useSan ?? pipSanInput?.checked);
            const isCurrent = () => this.pV[profile] === variables && !this.instanceClosed && !CONCEAL_ASSISTANCE_ACTIVE
                && (!options.isCurrent || options.isCurrent())
                // Opponent annotations use the preceding FEN; turn overrides
                // also differ from the displayed board. Track the live board,
                // not the notation root, while conversion is asynchronous.
                && this.currentFen === speechFen
                && Boolean(options.useSan ?? pipSanInput?.checked) === useSan;
            let spokenText = moveObj.advantageBand !== undefined ? speech.advantage[moveObj.advantageBand]
                : await formatMoveNotationAsync(moveObj, useSan, true, speech, isCurrent);
            if(!isCurrent() || !await this.getConfigValue(this.configKeys[settingKey], profile) || !isCurrent()) return;
            if(options.opponent) spokenText = speech.opponent.replace('{move}', spokenText);
            if(!spokenText) return;

            const speechConfig = {
                rate: ttsVoiceSpeed / 10,
                pitch: 1,
                volume: 1,
                lang: speech.lang,
                preferLanguage: Boolean(translateAudio)
            };

            if(ttsVoiceName?.toLowerCase() !== 'default') {
                speechConfig.voiceName = ttsVoiceName;
            }

            if(options.announcementKey) {
                this.audioAnnouncementKeys ??= new Set();
                if(this.audioAnnouncementKeys.has(options.announcementKey)) return;
                this.audioAnnouncementKeys.add(options.announcementKey);
                if(this.audioAnnouncementKeys.size > 64) this.audioAnnouncementKeys.delete(this.audioAnnouncementKeys.values().next().value);
            }
            const synthesis = SPEAK_TEXT(spokenText, speechConfig);
            if(!synthesis && options.announcementKey) this.audioAnnouncementKeys.delete(options.announcementKey);
            if(synthesis) variables.currentSpeeches.push(synthesis);
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
        if(typeof i === 'object') {
            return this.engines.find(obj => obj.profileName === i.name);
        }

        else if(typeof i === 'string') {
            return this.engines.find(obj => obj.profileName === i);
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

    async sendMsgToEngine(msg, i, isDynamicOption, isCurrent = () => true) {
        if(this.instanceClosed || !isCurrent()) return false;
        const isProfile = typeof i === 'string' && this.pV[i];
        const engineExists = this.getEngineAcasObj(i)?.sendMsg;
        const isBannedOptionSet = msg.startsWith('setoption name')
            && (isProfile && this.pV[i].usingAdvancedMode && !isDynamicOption);

        if(isBannedOptionSet) return false;
        const profile = this.getEngineAcasObj(i)?.profileName ?? this.getProfileName(i);
        const context = { instanceID: this.instanceID, profile };
        const logEngineInput = () => {
            if(!isActivityLoggingEnabled()) return;
            logActivity('engine-input', msg, {
                ...context,
                ...this.getEngineActivityContext(profile)
            });
        };
        
        if(isProfile && this.pV[i].useExternalChessEngine) {
            const profileName = this.getProfileName(i);
            const engineId = this.pV[i].externalChessEngine;
            const generation = isProfile.externalCommandGeneration;

            const sent = await sendUciToExternalEngine(msg, engineId, profileName, this.instanceID,
                () => !this.instanceClosed && this.pV[i] === isProfile
                    && isProfile.externalCommandGeneration === generation && isCurrent()
                    && !isProfile.externalRecoveryCancelled
                    && !(isProfile.recoveringSearch && isProfile.externalCrashPending));
            if(sent === false) return false;
            logEngineInput();
            return true;

        } else if(!engineExists && isProfile) {
            let elapsed = 0;
            return new Promise(resolve => {
                const waitForEngineToLoad = setInterval(() => {
                    if(this.instanceClosed || this.pV[i] !== isProfile) {
                        clearInterval(waitForEngineToLoad);
                        resolve(false);
                        return;
                    }

                    if(this.getEngineAcasObj(i)?.sendMsg) {
                        clearInterval(waitForEngineToLoad);
                        try {
                            this.getEngineAcasObj(i).sendMsg(msg);
                            logEngineInput();
                            resolve(true);
                        } catch(error) {
                            console.error('Could not send engine input:', context, msg, error);
                            resolve(false);
                        }
                    } else {
                        // Wait max 10 seconds
                        if(elapsed++ > 100) {
                            logActivity('error', `Engine input timed out while waiting for the engine: ${msg}`, context);
                            if(this.debugLogsEnabled) console.warn('Attempted to send message to non existing engine?', `(${i})`);
                            clearInterval(waitForEngineToLoad);
                            resolve(false);
                        }
                    }
                }, 100);
            });
        } else if(engineExists) {
            this.getEngineAcasObj(i).sendMsg(msg);
            logEngineInput();
            return true;
        } else {
            logActivity('warning', `Cannot send input to a missing engine: ${msg}`, context);
            if(this.debugLogsEnabled) console.warn('Attempted to send message to non existing engine?', `(${i})`);
            return false;
        }
    }

    isEngineCalculating(profile) {
        const profileObj = this.pV[profile];

        if(!profileObj) return false;

        return this.pV[profile].pendingCalculations.find(x => !x.finished) ? true : false;
    }

    async getAndDisplayBookMoves(fen = this.currentFen, profile) {
        const book = this.openingBooks?.get(profile);

        if(!book) {
            this.Interface.removeBookMarkings();
            return;
        }

        const alwaysMyTurn = await this.getConfigValue(this.configKeys.alwaysMyTurn, profile);
        const playerColor = await this.getPlayerColor();
        const moveSuggestionAmount = this.pV[profile].multiPV;

        if(alwaysMyTurn && fen.split(' ')[1] !== playerColor) fen = REVERSE_FEN_TURN(fen);

        const bookMoves = book.getMoves(fen)
            .slice(0, moveSuggestionAmount)
            .map(move => ({ ...move, profile }));

        await this.Interface.displayBookMoves(bookMoves, profile);
    }

    async loadOpeningBook() {
        this.openingBooks ??= new Map();
        const profiles = await GET_PROFILES(this.instanceID);

        for(const profileObj of profiles) {
            const profileName = profileObj.name;
            const savedFileName = await this.getConfigValue(this.configKeys.openingBookName, profileName);

            if(!savedFileName || typeof savedFileName !== 'string' || !savedFileName.trim()) {
                this.openingBooks.set(profileName, null);
                continue;
            }

            const book = await POLYGLOT_BOOK.loadFromStorage(savedFileName);

            if(!book) {
                const openingBookMissingText = (TRANS_OBJ?.openingBookMissingProfile ?? 'Opening book missing for profile "{profile}". Please re-import it.')
                    .replace('{profile}', profileName);

                toast.error(openingBookMissingText, 8000);
                this.openingBooks.set(profileName, null);
                continue;
            }

            this.openingBooks.set(profileName, book);
        }
    }

    async displayMoves(moveObjects, profile, bypassConcealmentCheck) {
        if(CONCEAL_ASSISTANCE_ACTIVE && !bypassConcealmentCheck) {
            this.pV[profile].pendingMoveDisplay = [moveObjects, profile, true];
            return;
        }

        this.pV[profile].pendingMoveDisplay = null;

        const normalMoveOpacity = await this.getConfigValue(this.configKeys.arrowOpacity, profile);
        const onlySuggestPieces = await this.getConfigValue(this.configKeys.onlySuggestPieces, profile);
        const movesOnDemand = await this.getConfigValue(this.configKeys.movesOnDemand, profile);

        const normalMoves = moveObjects.filter(move => !move.isFuture);

        const validFutureMoves = this.pV[profile].futureMoves
            // Filter out future moves that don't start from same square as parent move ends
            .filter(futureMove => {
                const parent = futureMove.parentMove;
                const futureStart = futureMove.player?.[0];

                if(!parent || !futureStart) return false;

                return normalMoves.some(normalMove =>
                    normalMove.player?.[0] === parent.from &&
                    normalMove.player?.[1] === parent.to &&
                    normalMove.player?.[1] === futureStart
                );
            })
            // Filter out duplicates
            .filter((move, index, moves) =>
                index === moves.findIndex(m =>
                    m.player?.[0] === move.player?.[0] &&
                    m.player?.[1] === move.player?.[1]
                )
            );

        // Remove normal moves completely when opacity is <= 1 (1 - 100)
        // Only remove moves belonging to the current profile.
        if (normalMoveOpacity <= 1) {
            moveObjects = [
                ...moveObjects.filter(move => move?.profile !== profile),
                ...validFutureMoves
            ];
        } else {
            moveObjects = [...moveObjects, ...validFutureMoves];
        }

        if(moveObjects?.length === 0) return;
    
        await this.Interface.markMoves(moveObjects, profile);

        if(onlySuggestPieces && !movesOnDemand) {
            moveObjects.forEach(moveObj => {
                moveObj.player = [moveObj.player[0], '??'];
            });
        }

        updatePipData({
            moveObjects: moveObjects.filter(m => !m.isFuture)
        });

        moveObjects
            .forEach(moveObj => {
                if(moveObj?.isFuture) return;

                this.speak(moveObj, profile);
            });
    }

    startInterfacePolling() {
        if(this.interfacePollingActive) return;

        const g = setInterval(() => {
            if(this.instanceClosed) {
                clearInterval(g);

                this.interfacePollingActive = false;
                return;
            }

            const additionalInfoElem = this.instanceElem?.querySelector('.instance-additional-info');
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

                if(correctedActiveAmount === this.activeEnginesAmount) {
                    newInfoStr += ` (${this.activeEnginesAmount} ${this.activeEnginesAmount > 1 ? enginesWord : engineWord})`;
                }
                else if(correctedActiveAmount > 0) {
                    newInfoStr += ` (${correctedActiveAmount}/${this.activeEnginesAmount} ${correctedActiveAmount > 1 ? enginesWord : engineWord})`;
                } else {
                    newInfoStr += ` (${variantNotSupportedMsg})`;
                }
            }

            if(newInfoStr.length > 0) {
                if(additionalInfoElem) additionalInfoElem.innerText = newInfoStr;

                updatePipData({ 'engineText': newInfoStr });
            }
        }, 500);

        this.interfacePollingActive = true;
    }

    async processEarlyPackets() {
        for(let packet of this.unprocessedPackets) {
            await this.processPacket(packet);

            this.unprocessedPackets = this.unprocessedPackets.filter(p => p !== packet);
        }
    }

    killEngine(i) {
        if(this.debugLogsEnabled) console.warn('Killing engine', i);

        if(typeof i === 'string') {
            if(this.freezeEngineKilling?.[i]) return;
            if(this.pV[i] || this.engines.some(engine => engine.profileName === i))
                logActivity('engine', 'Stopping engine.', { instanceID: this.instanceID, profile: i });
            this.pendingEngineLoads?.forEach(entry => {
                if(entry.profileName !== i) return;
                clearInterval(entry.intervalId);
                entry.worker?.terminate?.();
                this.pendingEngineLoads.delete(entry);
            });
            clearTimeout(this.pV[i]?.currentMovetimeTimeout);
            clearTimeout(this.pV[i]?.currentStopTimeout);
            const variables = this.pV[i];
            if(variables) {
                variables.feedbackRequest = (variables.feedbackRequest || 0) + 1;
                clearFeedback.call(this, i);
                ['activeMetrics', 'activeFeedbackDisplays', 'activePieceEvalDisplays'].forEach(key =>
                    variables[key]?.forEach(marking => (marking.elem ?? marking)?.remove?.()));
                variables.currentSpeeches?.forEach(speech => speech.cancel());
                this.Interface.removeBookMarkings(i);
                this.Interface.removeMarkings(i, 'Killing engine');
            }

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
            delete this.pV[i];
        } else if(typeof i === 'number') {
            if(i >= 0 && i < this.engines.length) {
                // Engine objects are built with profileName, not profile. This was always
                // undefined, so pV[undefined] was falsy and closing an instance left its
                // markings on the board and the whole pV map in memory.
                const profileName = this.engines[i].profileName;
                clearFeedback.call(this, profileName);
                clearTimeout(this.pV[profileName]?.currentMovetimeTimeout);
                clearTimeout(this.pV[profileName]?.currentStopTimeout);
                logActivity('engine', 'Stopping engine.', { instanceID: this.instanceID, profile: profileName });

                this.engines[i].worker?.terminate();
                delete this.engines[i].worker;

                this.engines.splice(i, 1);

                if(this.pV[profileName]) {
                    this.Interface.removeMarkings(profileName, 'Killing engine');
                }

                delete this.pV[profileName];
            }
        }
        this.MoveEval?.cancelStaleRequests();
        this.BoardPiecesEval?.cancelStaleRequests();
    }

    async killEngines() {
        for(let i = this.engines.length - 1; i >= 0; i--) {
            this.killEngine(i);
        }
    }

    close() {
        if(!this.instanceClosed) logActivity('instance', 'Instance closed.', { instanceID: this.instanceID });
        this.instanceClosed = true;
        removeDynamicSettingsContext(this.instanceID);

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
        // External profiles have no worker in this.engines.
        Object.keys(this.pV).forEach(profile => this.killEngine(profile));

        // Engines still in their load handshake are not in this.engines yet, so killEngines
        // can't reach them and both the worker and its poller would outlive the instance
        this.pendingEngineLoads?.forEach(entry => {
            clearInterval(entry.intervalId);
            entry.worker?.terminate?.();
        });
        this.pendingEngineLoads?.clear();

        this.boardResizeObserver?.disconnect();
        this.boardResizeObserver = null;

        // Chessground binds scroll/resize listeners on document and window; without
        // destroy() every opened and closed instance leaks them plus the whole board state
        this.chessground?.destroy?.();
        this.chessground = null;

        this?.CommLink?.kill();

        if(this.MoveEval) {
            this.MoveEval.terminate();
            this.MoveEval = null;
        }

        if(this.BoardPiecesEval) {
            this.BoardPiecesEval.terminate();
            this.BoardPiecesEval = null;
        }

        this?.BoardDrawer?.terminate();
        this?.instanceElem?.remove();

        closeAllExternalEnginesWithId(this.instanceID, 'instanceId');

        removeInstance(this);
    }
}