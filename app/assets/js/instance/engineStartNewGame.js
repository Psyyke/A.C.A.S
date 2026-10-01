import { logActivity } from '../misc/activityLog.js';
import { updatePipData } from '../gui/pip.js';
import { onDynamicOptionsReady, resetDynamicOptionsReady } from '../gui/dynamicEngineOptionState.js';
import { finishPendingSettingChanges } from '../misc/settingActivity.js';
import { clearFeedback, prepareFeedbackPosition } from './renderFeedback.js';

async function startWithBasicOptions(variant, engineName, profile, isCurrentStart) {
    const profileVariables = this.pV[profile];
    const elo = await this.getConfigValue(this.configKeys.engineElo, profile);
    const multiPV = await this.getConfigValue(this.configKeys.moveSuggestionAmount, profile);
    if(!isCurrentStart()) return;
    this.setEngineMultiPV(multiPV, profile);
    this.setEngineShowWDL(true, profile);

    if(engineName !== 'lc0') await this.setEngineVariant(variant, profile);
    if(!isCurrentStart()) return;
    this.set960Mode(profileVariables.useChess960, profile);
    await this.setEngineElo(elo, false, profile);
}

async function startWithDynamicOptions(variant, engineName, profile, isCurrentStart) {
    const profileVariables = this.pV[profile];
    // This rejects after a 5s timeout. With the catch commented out the rejection escaped
    // all the way past loadEngine's await, so calculateBestMoves was never reached and the
    // profile sat there with a loaded engine that analysed nothing.
    await onDynamicOptionsReady(profile, 5000, this.instanceID)
        .catch(err => toast.warning(`Engine options timed out: "${err.message}"`, 5000));
    if(!isCurrentStart()) return;

    const advancedEloDepth = await this.getConfigValue(this.configKeys.advancedEloDepth, profile);
    const engineNodes = await this.getConfigValue(this.configKeys.engineNodes, profile);
    const snapshot = this.applyingSettings?.get(profile) ?? profileVariables.startupConfig;
    const allSavedOptions = snapshot ? Object.fromEntries(Object.entries(snapshot).filter(([key]) => key.startsWith('DYNAMIC_')))
        : await GET_GM_VALUES_STARTS_WITH('DYNAMIC_', this.instanceID, profile);
    const isExternal = await this.getConfigValue(this.configKeys.useExternalChessEngine, profile);
    if(!isCurrentStart()) return;

    // lc0WeightName is null when no weight is picked yet, which threw before reaching the toast
    if(engineName === 'lc0' && !isExternal && this.pV[profile]?.lc0WeightName?.includes('maia') && engineNodes > 1) {
        const msg = TRANS_OBJ?.maiaNodeWarning ?? 'Maia weights work best with no search, please only use one (1) search node!';
        toast.warning(msg, 5000);
    }

    this.pV[profile].searchDepth = advancedEloDepth;
    this.pV[profile].engineNodes = engineNodes;
    if(engineNodes > 0) {
        updatePipData({ 'goalDepth': null });
    }

    // The applyDynamicOption has logic to filter out default values to not spam the engine
    for(let key in (allSavedOptions ?? {})) {
        if(!isCurrentStart()) return;
        await this.applyDynamicOption(key, allSavedOptions[key], profile);
    }
}

/* Activated on;
    1.) Start of totally new instances.
    2.) Board had a certain amount of squares which had changes (userscript determines this)
    3.) When the chess variant changes. */
export default async function engineStartNewGame(variant, profile, isDynamicChange = false) {
    const chessVariant = FORMAT_VARIANT(variant);

    // Global resets run once, before any per-profile work, so looping over
    // profiles below does not wipe another profile's dynamic-options state.
    if(profile) resetDynamicOptionsReady(profile, this.instanceID);
    else Object.keys(this.pV).forEach(name => resetDynamicOptionsReady(name, this.instanceID));

    this.Interface.clearOpeningText();

    // Reloading one suggestion engine must not cancel another profile's rating.
    // Only an actual instance-wide new game resets the shared feedback engine.
    if(!profile) {
        this.annotationFen = null;
        this.audioAnnouncementKeys?.clear();
        prepareFeedbackPosition.call(this, null);
        if(this.MoveEval) this.MoveEval.startNewGame(await this.getPlayerColor());
    } else if(this.pV[profile]) {
        this.pV[profile].feedbackRequest = (this.pV[profile].feedbackRequest || 0) + 1;
        this.pV[profile].pieceEvalRequest = (this.pV[profile].pieceEvalRequest || 0) + 1;
        this.BoardPiecesEval?.cancelStaleRequests();
        this.pV[profile].activePieceEvalDisplays?.forEach(marking => marking.elem?.remove());
        this.pV[profile].activePieceEvalDisplays = [];
        this.MoveEval?.cancelStaleRequests();
        clearFeedback.call(this, profile);
    }

    const startForProfile = async profileName => {
        if(!this.pV[profileName]) return;
        const profileVariables = this.pV[profileName];
        const generation = profileVariables.externalCommandGeneration;
        const isCurrentStart = () => !this.instanceClosed && this.pV[profileName] === profileVariables
            && profileVariables.externalCommandGeneration === generation
            && !profileVariables.externalRecoveryCancelled && !profileVariables.externalCrashPending;
        profileVariables.engineSettingsReady = false;
        const engineName = await this.getEngineName(profileName);
        const isAdvancedElo = await this.getConfigValue(this.configKeys.enableAdvancedElo, profileName);
        const profileVariant = chessVariant ?? profileVariables.chessVariant ?? 'chess';
        if(!isCurrentStart()) return;

        this.clearHistoryVariables(profileName);

        if(this.isEngineCalculating(profileName))
            this.engineStopCalculating(profileName, 'Engine was calculating while a new game was started!');

        if(await this.sendMsgToEngine('isready', profileName, false, isCurrentStart) === false
            || !isCurrentStart()
            || await this.sendMsgToEngine('uci', profileName, false, isCurrentStart) === false
            || !isCurrentStart()
            || await this.sendMsgToEngine('ucinewgame', profileName, false, isCurrentStart) === false) return;
        if(!isCurrentStart()) return;

        if(isAdvancedElo) await startWithDynamicOptions.bind(this)(profileVariant, engineName, profileName, isCurrentStart);
        else await startWithBasicOptions.bind(this)(profileVariant, engineName, profileName, isCurrentStart);
        if(!isCurrentStart()) return;
        // Graphs for UCI options must also survive startup, including in basic mode.
        const snapshot = this.applyingSettings?.get(profileName) ?? profileVariables.startupConfig;
        const resolvedProfile = snapshot ? { config: snapshot } : await GET_PROFILE_FOR_INSTANCE(profileName, this.instanceID);
        if(!isCurrentStart()) return;
        const curves = resolvedProfile?.config?.dynamicSettings ?? {};
        if(isAdvancedElo) {
            // Ordinary setters are intentionally suppressed in advanced mode, but
            // explicit graphs must reach the engine as well as their cached values.
            if(curves.moveSuggestionAmount?.enabled)
                this.setEngineMultiPV(resolvedProfile.config.moveSuggestionAmount, profileName, true);
            if((isDynamicChange || curves.chessVariant?.enabled) && engineName !== 'lc0')
                await this.setEngineVariant(profileVariant, profileName, true);
            if(!isCurrentStart()) return;
            if(isDynamicChange || curves.useChess960?.enabled || curves.chessVariant?.enabled)
                this.set960Mode(profileVariables.useChess960, profileName, true);
        }
        const uciCurves = Object.entries(curves)
            .filter(([key, curve]) => key.startsWith('DYNAMIC_') && curve.enabled);
        if(uciCurves.length) {
            await onDynamicOptionsReady(profileName, 5000, this.instanceID).catch(console.error);
            if(!isCurrentStart()) return;
            for(const [key] of uciCurves) {
                if(!isCurrentStart()) return;
                await this.applyDynamicOption(key, resolvedProfile.config[key], profileName, true);
            }
        }
        if(!isCurrentStart()) return;
        // Basic Stockfish ELO derives depth; nodes take precedence in advanced mode/Lc0.
        profileVariables.engineNodes = isAdvancedElo || engineName === 'lc0'
            ? await this.getConfigValue(this.configKeys.engineNodes, profileName) : 0;
        if(!isCurrentStart()) return;
        const applied = profileVariables.appliedSettings ??= {};
        Object.assign(applied, { chessVariant: profileVariables.chessVariant, useChess960: profileVariables.useChess960,
            moveSuggestionAmount: profileVariables.multiPV, engineNodes: profileVariables.engineNodes });
        if(isAdvancedElo) applied.advancedEloDepth = profileVariables.searchDepth;
        if(engineName === 'lc0') applied.lc0Weight = profileVariables.lc0WeightName;
        profileVariables.engineSettingsReady = true;
        delete profileVariables.startupConfig;
        finishPendingSettingChanges(this, profileName);
        logActivity('engine', `${engineName} ready for a new game.`, { instanceID: this.instanceID, profile: profileName });

        this.sendMsgToEngine('position startpos', profileName, false, isCurrentStart);
        if(engineName !== 'lc0') this.sendMsgToEngine('d', profileName, false, isCurrentStart);
    };

    // When no profile is given (e.g. on a new match) start a new game for every profile.
    if(!profile) {
        await Promise.all(Object.keys(this.pV).map(startForProfile));
    } else {
        await startForProfile(profile);
    }
}