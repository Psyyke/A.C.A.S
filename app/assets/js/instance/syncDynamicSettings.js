import { logAppliedSetting, finishPendingSettingChanges } from '../misc/settingActivity.js';
import { fairyVariantKey, fairyChess960Key, isBuiltInFairyEngine, isFairyVariantSetting } from './fairyVariant.js';
import { hintSettingKeys } from '../misc/learningHints.js';

// Every instance owns its effective-value cache and queue. Never consult the GUI filter.
export function changedSettingKeys(previous, current, keys, forcedKeys = []) {
    return [...new Set([...keys, ...forcedKeys])].filter(key =>
        current[key] !== undefined && (forcedKeys.includes(key) || !Object.is(previous?.[key], current[key])));
}

export default function syncDynamicSettings(forcedProfile, forcedKeys = []) {
    this.dynamicSettingsQueue ??= Promise.resolve();
    const synchronize = async () => {
        if(this.instanceClosed) return;
        this.effectiveSettings ??= new Map();
        this.applyingSettings ??= new Map();
        this.pendingDynamicSettingChanges ??= new Map();
        this.appliedSettingValues ??= new Map();
        const profiles = (await GET_PROFILES(this.instanceID)).filter(Boolean);
        for(const profile of profiles) {
            if(this.instanceClosed) return;
            const name = profile.name;
            const previous = this.effectiveSettings.get(name);
            const current = structuredClone(profile.config);
            const keys = [...new Set([
                ...Object.keys(this.configKeys),
                ...Object.keys(current.dynamicSettings ?? {}),
                ...Object.keys(previous?.dynamicSettings ?? {}),
                ...Object.keys(current).filter(key => key.startsWith('DYNAMIC_'))
            ])];
            // Apply curves once after startup, even when their input (e.g. 32 pieces) hasn't changed.
            const startupKeys = this.pV[name]?.engineSettingsReady && !this.pV[name].dynamicSettingsApplied
                ? Object.keys(current.dynamicSettings ?? {}).filter(key => current.dynamicSettings[key]?.enabled
                    && !['chessEngine', 'useExternalChessEngine', 'externalChessEngine', 'enableAdvancedElo', 'engineEnabled'].includes(key)) : [];
            const changed = changedSettingKeys(previous, current, keys, [...startupKeys, ...(name === forcedProfile ? forcedKeys : [])]);
            const appliedAtStart = this.appliedSettingValues.get(name);
            if(previous && !appliedAtStart && this.pV[name]?.appliedSettings) {
                this.appliedSettingValues.set(name, { ...previous, ...this.pV[name].appliedSettings });
            }
            // Every setter in this operation must read the same resolved snapshot that is logged.
            this.applyingSettings.set(name, current);
            try {
                if(current.engineEnabled === false) {
                    this.killEngine(name);
                    logAppliedSetting(this, name, 'engineEnabled', previous, current);
                    const applied = this.appliedSettingValues.get(name) ?? {};
                    applied.engineEnabled = false;
                    this.appliedSettingValues.set(name, applied);
                    this.effectiveSettings.set(name, current);
                    this.pendingDynamicSettingChanges.delete(name);
                    continue;
                }

                const identityKeys = ['chessEngine', 'useExternalChessEngine', 'externalChessEngine', 'enableAdvancedElo'];
                const loadedEngine = this.getEngineAcasObj?.(name);
                const profileVariables = this.pV[name];
                const managesFairyVariant = current.enableAdvancedElo && isBuiltInFairyEngine(profileVariables);
                const variantKeys = ['chessVariant', 'useChess960', fairyVariantKey, fairyChess960Key];
                const variantCurveToggled = Boolean(previous?.dynamicSettings?.chessVariant?.enabled)
                    !== Boolean(current.dynamicSettings?.chessVariant?.enabled);
                const fairyVariantChanged = managesFairyVariant && previous
                    && (variantCurveToggled || variantKeys.some(key => !Object.is(previous[key], current[key])));
                const identityChanged = previous && identityKeys.some(key => !Object.is(previous[key], current[key]));
                const loadedEngineMismatch = !current.useExternalChessEngine && loadedEngine
                    && loadedEngine.type !== current.chessEngine;
                const requestedEngineMismatch = profileVariables?.requestedEngine
                    && profileVariables.requestedEngine !== current.chessEngine;
                const externalModeMismatch = profileVariables
                    && Boolean(profileVariables.useExternalChessEngine) !== Boolean(current.useExternalChessEngine);
                const externalEngineMismatch = profileVariables
                    && (profileVariables.externalChessEngine ?? null) !== (current.externalChessEngine ?? null);
                const advancedModeMismatch = profileVariables
                    && Boolean(profileVariables.usingAdvancedMode) !== Boolean(current.enableAdvancedElo);
                const needsReload = identityChanged || loadedEngineMismatch || requestedEngineMismatch
                    || externalModeMismatch || externalEngineMismatch || advancedModeMismatch || fairyVariantChanged;

                if(current.engineEnabled && (!profileVariables || needsReload)) {
                    this.pendingDynamicSettingChanges.set(name, { previous, current, keys: changed });
                    // The worker may request synchronization during startup; don't reload it twice.
                    this.effectiveSettings.set(name, current);
                    await this.createAndLoadSpecificEngine(name, current);
                    finishPendingSettingChanges(this, name);
                    continue;
                }

                if(!this.pV[name]?.engineSettingsReady) continue;

                for(const key of changed) {
                    const isManagedVariant = managesFairyVariant
                        && (key === 'chessVariant' || key === 'useChess960' || isFairyVariantSetting(key));

                    if(identityKeys.includes(key) || key === 'engineEnabled') continue;
                    if(isManagedVariant) continue;

                    const result = await this.updateSettings({ type: 'settingSave', data: {
                        key, value: current[key], profile: { ...profile, config: current },
                        isDirectlyCausedByUser: false, isDynamicChange: true
                    } });
                    if(result === false) {
                        const curve = current.dynamicSettings?.[key];
                        if(curve?.enabled && key.startsWith('DYNAMIC_')) {
                            // Option registration may still be in progress; retry at the next synchronization.
                            current[key] = previous?.[key];
                        }
                        continue;
                    }
                    const appliedValue = result && Object.hasOwn(result, 'appliedValue') ? result.appliedValue : current[key];
                    logAppliedSetting(this, name, key, previous, current, appliedValue);
                    const applied = this.appliedSettingValues.get(name) ?? {};
                    applied[key] = appliedValue;
                    this.appliedSettingValues.set(name, applied);
                }
                this.effectiveSettings.set(name, current);
                this.pV[name].dynamicSettingsApplied = true;
                const hintRenderKeys = [...hintSettingKeys, 'movesOnDemand', 'moveAsFilledSquares',
                    'arrowOpacity', 'primaryArrowColorHex', 'secondaryArrowColorHex', 'opponentArrowColorHex',
                    'showOpponentMoveGuess', 'showOpponentMoveGuessConstantly', 'displayMovesOnExternalSite',
                    'bookMoveOpacity', 'bookMoveColorHex', 'moveSuggestionAmount'];
                const didChangeHints = changed.some(key => hintRenderKeys.includes(key));
                if(didChangeHints && this.currentFen && this.refreshHints)
                    await this.refreshHints(name);
            } catch(error) {
                this.effectiveSettings.delete(name);
                this.pendingDynamicSettingChanges.delete(name);
                throw error;
            } finally {
                this.applyingSettings.delete(name);
            }
        }
        const names = new Set(profiles.map(profile => profile.name));
        for(const name of this.effectiveSettings.keys()) {
            if(!names.has(name)) {
                this.killEngine(name);
                this.effectiveSettings.delete(name);
                this.appliedSettingValues.delete(name);
                this.pendingDynamicSettingChanges.delete(name);
            }
        }
    };
    const operation = this.dynamicSettingsQueue.then(synchronize);
    this.dynamicSettingsQueue = operation.catch(error => {
        console.error('Could not apply dynamic settings:', this.instanceID, error);
        toast.error('Could not apply dynamic settings. Check the engine status.', 5000);
    });
    return operation;
}