import { isActivityLoggingEnabled, logActivity } from '../misc/activityLog.js';
import { updatePipData } from '../gui/pip.js';
import { onDynamicOptionsReady, resetDynamicOptionsReady } from '../gui/dynamicEngineOptionState.js';
import { finishPendingSettingChanges } from '../misc/settingActivity.js';
import { clearFeedback, prepareFeedbackPosition } from './renderFeedback.js';
import { applyFairyVariantSettings, refreshFairyBoard, isBuiltInFairyEngine, isFairyVariantSetting } from './fairyVariant.js';

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

    await onDynamicOptionsReady(profile, 5000, this.instanceID)
        .catch(err => toast.warning(`Engine options timed out: "${err.message}"`, 5000));

    if(!isCurrentStart()) return;

    const advancedEloDepth = await this.getConfigValue(this.configKeys.advancedEloDepth, profile);
    const engineNodes = await this.getConfigValue(this.configKeys.engineNodes, profile);
    const snapshot = this.applyingSettings?.get(profile) ?? profileVariables.startupConfig;
    const allSavedOptions = snapshot
        ? Object.fromEntries(Object.entries(snapshot).filter(([key]) => key.startsWith('DYNAMIC_')))
        : await GET_GM_VALUES_STARTS_WITH('DYNAMIC_', this.instanceID, profile);
    const isExternal = await this.getConfigValue(this.configKeys.useExternalChessEngine, profile);
    const shouldWarnAboutMaiaNodes = engineName === 'lc0' && !isExternal
        && profileVariables.lc0WeightName?.includes('maia') && engineNodes > 1;
    const managesFairyVariant = isBuiltInFairyEngine(profileVariables);

    if(!isCurrentStart()) return;

    if(shouldWarnAboutMaiaNodes) {
        const msg = TRANS_OBJ?.maiaNodeWarning ?? 'Maia weights work best with no search, please only use one (1) search node!';

        toast.warning(msg, 5000);
    }

    profileVariables.searchDepth = advancedEloDepth;
    profileVariables.engineNodes = engineNodes;

    if(engineNodes > 0) {
        updatePipData({ 'goalDepth': null });
    }

    for(const [key, value] of Object.entries(allSavedOptions ?? {})) {
        if(!isCurrentStart()) return;
        if(managesFairyVariant && isFairyVariantSetting(key)) continue;

        await this.applyDynamicOption(key, value, profile);
    }
}

async function sendStartupCommands(commands, profile, isCurrentStart, optionsInitialized = false) {
    for(const [index, command] of commands.entries()) {
        const completesInitialization = optionsInitialized && index === commands.length - 1;

        if(!isCurrentStart()) return false;

        const sent = await this.sendMsgToEngine(command, profile, false, isCurrentStart, completesInitialization);

        if(sent === false || !isCurrentStart()) return false;
    }

    return true;
}

async function applyStartupCurves(variant, engineName, profile, isAdvancedElo, isDynamicChange, isCurrentStart) {
    const profileVariables = this.pV[profile];
    const snapshot = this.applyingSettings?.get(profile) ?? profileVariables.startupConfig;
    const resolvedProfile = snapshot ? { config: snapshot } : await GET_PROFILE_FOR_INSTANCE(profile, this.instanceID);
    const curves = resolvedProfile?.config?.dynamicSettings ?? {};
    const managesFairyVariant = isAdvancedElo && isBuiltInFairyEngine(profileVariables);
    const uciCurves = Object.entries(curves)
        .filter(([key, curve]) => key.startsWith('DYNAMIC_') && curve.enabled
            && !(managesFairyVariant && isFairyVariantSetting(key)));
    const shouldSetVariant = !managesFairyVariant && engineName !== 'lc0'
        && (isDynamicChange || curves.chessVariant?.enabled);
    const shouldSet960Mode = !managesFairyVariant
        && (isDynamicChange || curves.useChess960?.enabled || curves.chessVariant?.enabled);

    if(!isCurrentStart()) return;

    if(isAdvancedElo) {
        if(curves.moveSuggestionAmount?.enabled)
            this.setEngineMultiPV(resolvedProfile.config.moveSuggestionAmount, profile, true);
        if(shouldSetVariant)
            await this.setEngineVariant(variant, profile, true);
        if(!isCurrentStart()) return;
        if(shouldSet960Mode)
            this.set960Mode(profileVariables.useChess960, profile, true);
    }

    if(!uciCurves.length) return;

    await onDynamicOptionsReady(profile, 5000, this.instanceID).catch(console.error);

    for(const [key] of uciCurves) {
        if(!isCurrentStart()) return;

        await this.applyDynamicOption(key, resolvedProfile.config[key], profile, true);
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
        const profileVariables = this.pV[profileName];

        if(!profileVariables) return;

        const generation = profileVariables.externalCommandGeneration;
        const isCurrentStart = () => !this.instanceClosed && this.pV[profileName] === profileVariables
            && profileVariables.externalCommandGeneration === generation
            && !profileVariables.externalRecoveryCancelled && !profileVariables.externalCrashPending;
        const isExternalRecovery = profileVariables.useExternalChessEngine && profileVariables.recoveringSearch;

        profileVariables.engineSettingsReady = false;
        profileVariables.externalEngineOptionsRestored = false;

        const engineName = await this.getEngineName(profileName);
        const isAdvancedElo = await this.getConfigValue(this.configKeys.enableAdvancedElo, profileName);
        const profileVariant = chessVariant ?? profileVariables.chessVariant ?? 'chess';
        const initializesFairyBoard = isBuiltInFairyEngine(profileVariables);
        const managesFairyVariant = isAdvancedElo && initializesFairyBoard;
        const usesNodeLimit = isAdvancedElo || engineName === 'lc0';
        const positionCommands = engineName === 'lc0'
            ? ['position startpos'] : ['position startpos', 'd'];

        if(!isCurrentStart()) return;

        this.clearHistoryVariables(profileName);

        if(this.isEngineCalculating(profileName))
            this.engineStopCalculating(profileName, 'Engine was calculating while a new game was started!');

        const handshakeSent = await sendStartupCommands.call(this,
            ['isready', 'uci', 'ucinewgame'], profileName, isCurrentStart);

        if(!handshakeSent) return;

        if(profileVariables.useExternalChessEngine || initializesFairyBoard) {
            await onDynamicOptionsReady(profileName, 5000, this.instanceID);

            if(!isCurrentStart()) return;
        }

        if(isExternalRecovery) {
            // appServer restores this instance's last-sent options before forwarding
            // uciok. Do not overwrite that snapshot with freshly resolved GUI values.
            if(profileVariables.externalEngineOptionsRestored) {
                const positionSent = await sendStartupCommands.call(this,
                    positionCommands, profileName, isCurrentStart, true);

                if(!positionSent) return;

                profileVariables.engineSettingsReady = true;

                return;
            }

            // Missing or incomplete snapshots fall back to normal initialization.
        }

        if(isAdvancedElo) {
            await startWithDynamicOptions.call(this, profileVariant, engineName, profileName, isCurrentStart);
        } else {
            await startWithBasicOptions.call(this, profileVariant, engineName, profileName, isCurrentStart);
        }

        if(!isCurrentStart()) return;

        await applyStartupCurves.call(this,
            profileVariant, engineName, profileName, isAdvancedElo, isDynamicChange, isCurrentStart);

        if(!isCurrentStart()) return;

        if(managesFairyVariant) {
            const variantApplied = await applyFairyVariantSettings.call(this, profileVariant, profileName, isCurrentStart);

            if(!variantApplied) return;
        }

        // Basic Stockfish ELO derives depth; nodes take precedence in advanced mode/Lc0.
        profileVariables.engineNodes = usesNodeLimit
            ? await this.getConfigValue(this.configKeys.engineNodes, profileName) : 0;

        if(!isCurrentStart()) return;

        const applied = profileVariables.appliedSettings ??= {};

        Object.assign(applied, {
            chessVariant: profileVariables.chessVariant,
            useChess960: profileVariables.useChess960,
            moveSuggestionAmount: profileVariables.multiPV,
            engineNodes: profileVariables.engineNodes
        });

        if(isAdvancedElo) applied.advancedEloDepth = profileVariables.searchDepth;
        if(engineName === 'lc0') applied.lc0Weight = profileVariables.lc0WeightName;

        if(initializesFairyBoard) delete profileVariables.variantStartposFen;

        const positionSent = await sendStartupCommands.call(this,
            positionCommands, profileName, isCurrentStart, true);

        if(!positionSent) return;

        if(initializesFairyBoard) {
            const boardReady = await refreshFairyBoard.call(this, profileName, isCurrentStart);

            if(!boardReady) return;
        }

        profileVariables.engineSettingsReady = true;
        delete profileVariables.startupConfig;
        finishPendingSettingChanges(this, profileName);

        if(isActivityLoggingEnabled()) {
            const engineContext = this.getEngineActivityContext(profileName);

            logActivity('engine', `${engineContext.engine} ready for a new game.`, {
                instanceID: this.instanceID, profile: profileName, ...engineContext
            });
        }
    };

    // When no profile is given (e.g. on a new match) start a new game for every profile.
    if(!profile) {
        await Promise.all(Object.keys(this.pV).map(startForProfile));
    } else {
        await startForProfile(profile);
    }
}