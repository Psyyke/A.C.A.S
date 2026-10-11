import { setProfileBubbleStatus } from '../gui/profiles.js';
import { isActivityLoggingEnabled, logActivity } from '../misc/activityLog.js';
import loadEngineWorker, { getEngineWorkerConfig } from './engineWorker.js';

export default async function loadEngine(profileName, engineName, attempt = 0) {
    const profileVariables = this.pV[profileName];
    const profileObj = await GET_PROFILE_FOR_INSTANCE(profileName, this.instanceID);
    const isCurrentLoad = () => !this.instanceClosed && this.pV[profileName] === profileVariables;
    if(!profileObj || !isCurrentLoad()) return;
    const profileChessEngine = engineName || profileVariables.startupConfig?.chessEngine || profileObj.config.chessEngine;
    if(isActivityLoggingEnabled()) {
        const engineContext = this.getEngineActivityContext(profileName);
        logActivity('engine', `Loading ${engineContext.engine}${attempt ? ` (attempt ${attempt})` : ''}`, {
            instanceID: this.instanceID, profile: profileName, ...engineContext
        });
    }
    const isReload = attempt > 0;
    let alreadyRestarted = false;

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
        this.engineMessageProcessor(msg, profileName).catch(e => {
            console.error('Engine', this.instanceID, profileName, 'error:', e);
        });
    };

    const restartEngine = error => {
        if(!isCurrentLoad() || alreadyRestarted) return;
        alreadyRestarted = true;
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
    loadEngineWorker(getEngineWorkerConfig(profileChessEngine), {
        type: profileChessEngine,
        profileName,
        pendingLoads: this.pendingEngineLoads,
        isCurrent: isCurrentLoad,
        onMessage: processEngineMessage,
        onError: restartEngine,
        onReady: async engine => {
            this.engines.push(engine);
            if(profileChessEngine === 'lc0') {
                await this.setEngineWeight(profileVariables.lc0WeightName, profileName);
                if(!isCurrentLoad()) return;
            }
            await startGame.call(this);
        }
    });
}
