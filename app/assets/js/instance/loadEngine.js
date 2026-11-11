import { setProfileBubbleStatus } from '../gui/profiles.js';
import { isActivityLoggingEnabled, logActivity } from '../misc/activityLog.js';
import loadEngineWorker, { getEngineWorkerConfig } from './engineWorker.js';
import { isUpstreamLc0 } from './lc0Engines.js';
import { getLc0Weights } from '../../engines/lc0/weight-storage.js';
import { confirmLc0WeightLoaded, cancelLc0WeightUpload } from '../gui/lc0WeightNotifications.js';
import { initialEngineTextFiles } from './engineTextFiles.js';

export default async function loadEngine(profileName, engineName, attempt = 0) {
    const profileVariables = this.pV[profileName];
    const profileObj = await GET_PROFILE_FOR_INSTANCE(profileName, this.instanceID);
    const isCurrentLoad = () => !this.instanceClosed && this.pV[profileName] === profileVariables;

    if(!profileObj || !isCurrentLoad()) return;

    const profileChessEngine = engineName || profileVariables.startupConfig?.chessEngine || profileObj.config.chessEngine;
    const textFiles = initialEngineTextFiles(profileChessEngine, profileVariables.startupConfig ?? profileObj.config);
    profileVariables.variantText = textFiles.VariantPath ?? '';

    if(isActivityLoggingEnabled()) {
        const engineContext = this.getEngineActivityContext(profileName);

        logActivity('engine', `Loading ${engineContext.engine}${attempt ? ` (attempt ${attempt})` : ''}`, {
            instanceID: this.instanceID, profile: profileName, ...engineContext
        });
    }

    const isReload = attempt > 0;
    let alreadyRestarted = false;
    let loadedWorker;

    if(isReload) {
        setProfileBubbleStatus('error', profileName, 'Engine crashed and engine is trying to reload...');

        console.warn('RELOAD ATTEMPT', attempt, '-> Loading engine', engineName, profileName);
    }

    if(engineName && attempt > 10) {
        toast.warning(`Restarting the engine ${engineName} failed despite many attempts :(\n\nRefresh A.C.A.S!`);
        
        setProfileBubbleStatus('error', profileName, 'Engine crashed, could not restart it.');

        return;
    }

    const processEngineMessage = msg => {
        if(!isCurrentLoad()) return;
        if(!alreadyRestarted && isUpstreamLc0(profileChessEngine)
            && /^info\s/.test(msg) && /\bnodes\s+[1-9]\d*\b/.test(msg) && /\bpv\s+[a-h][1-8][a-h][1-8]/.test(msg))
            confirmLc0WeightLoaded(profileVariables.modernLc0Weight);

        this.engineMessageProcessor(msg, profileName).catch(e => {
            console.error('Engine', this.instanceID, profileName, 'error:', e);
        });
    };

    const restartEngine = error => {
        if(!isCurrentLoad() || alreadyRestarted) return;

        alreadyRestarted = true;
        if(isUpstreamLc0(profileChessEngine) || profileChessEngine === 'rodent-v' || profileChessEngine === 'fairy-stockfish-nnue-wasm'
            || (profileChessEngine === 'maia3' && profileVariables.maia3Model)) {
            const engineLabel = profileChessEngine === 'maia3' ? 'Personalized Maia 3'
                : profileChessEngine === 'rodent-v' ? 'Rodent V'
                : profileChessEngine === 'fairy-stockfish-nnue-wasm' ? 'Fairy-Stockfish' : 'Lc0';
            if(isUpstreamLc0(profileChessEngine)) cancelLc0WeightUpload(profileVariables.modernLc0Weight);
            const message = error?.message || 'Unknown worker error.';
            profileVariables.engineSettingsReady = false;
            profileVariables.externalCommandGeneration = (profileVariables.externalCommandGeneration ?? 0) + 1;
            clearTimeout(profileVariables.currentMovetimeTimeout);
            clearTimeout(profileVariables.currentStopTimeout);
            delete profileVariables.pendingCalculationRequest;
            for(const calculation of profileVariables.pendingCalculations ?? []) {
                if(calculation.finished) continue;
                calculation.finished = true;
                this.CommLink.analysisFailed?.(profileName, calculation, message);
                this.suggestionMix?.failed(profileName, calculation).catch(console.error);
            }
            const index = this.engines.findIndex(engine => engine.worker === loadedWorker);
            if(index !== -1) this.engines.splice(index, 1);
            setProfileBubbleStatus('error', profileName, `${engineLabel} failed: ${message}`);
            toast.warning(`${engineLabel} failed: ${message}`, 10000);
            console.error(`${engineLabel} failed for profile "${profileName}":`, error);
            return;
        }
        setProfileBubbleStatus('warning', profileName, `Restarting the instance due to the error: ${error?.message}`);
        console.error(`Restarting the instance "${profileChessEngine}" due to the error:`, error);
        this.close();
    };

    async function startGame(variant = profileVariables.chessVariant ?? 'chess') {
        if(!isCurrentLoad()) return;

        await this.engineStartNewGame(variant, profileName);
        await WAIT_UNTIL_VAR(() => this.instanceReady);

        if(!isCurrentLoad()) return;

        await this.Interface.updateBoardFen({ 'skipValidityChecks': true, 'specificProfileName': profileName });
    }
    
    if(profileVariables.useExternalChessEngine) {
        if(typeof profileVariables.externalChessEngine !== 'string' || !profileVariables.externalChessEngine.trim()) {
            setProfileBubbleStatus('warning', profileName, 'Select an external engine before starting analysis.');
            return;
        }

        // External engines have their own UCI handshake; don't load an unrelated web worker.
        startGame.bind(this)().catch(console.error);
        return;
    }

    this.pendingEngineLoads ??= new Set();

    loadedWorker = loadEngineWorker(getEngineWorkerConfig(profileChessEngine), {
        type: profileChessEngine,
        profileName,
        pendingLoads: this.pendingEngineLoads,
        modelId: profileVariables.maia3Model,
        modelProvider: profileVariables.maia3Provider,
        textFiles,
        isCurrent: isCurrentLoad,
        loadWeights: async signal => {
            const file = await getLc0Weights(profileVariables.modernLc0Weight, signal);
            if(signal.aborted) throw new DOMException('Lc0 weights loading cancelled.', 'AbortError');
            const weights = await file.arrayBuffer();
            if(signal.aborted) throw new DOMException('Lc0 weights loading cancelled.', 'AbortError');
            profileVariables.lc0WeightName = file.name;
            return weights;
        },
        onMessage: processEngineMessage,
        onError: restartEngine,
        onReady: async engine => {
            this.engines.push(engine);

            if(profileChessEngine === 'lc0') {
                try {
                    await this.setEngineWeight(profileVariables.lc0WeightName, profileName);
                } finally {
                    if(!isCurrentLoad()) {
                        engine.worker.terminate();
                        // Remove this worker only; the profile may already have a replacement.
                        const index = this.engines.indexOf(engine);
                        if(index !== -1) this.engines.splice(index, 1);
                    }
                }

                if(!isCurrentLoad()) return;
            }

            if(profileChessEngine === 'fairy-stockfish-nnue-wasm') {
                await startGame.call(this, FORMAT_VARIANT(profileVariables.chessVariant));
            } else {
                await startGame.call(this);
            }
        }
    });
}
