import { logActivity, formatLogValue } from './activityLog.js';

export function logAppliedSetting(instance, profile, key, previous, current, appliedValue = current[key]) {
    const dynamic = Boolean(current.dynamicSettings?.[key] || previous?.dynamicSettings?.[key]);
    const previousApplied = instance.appliedSettingValues?.get(profile);
    const before = previousApplied && Object.hasOwn(previousApplied, key) ? previousApplied[key] : previous?.[key];
    if((previous && Object.is(previous[key], current[key]) && Object.is(before, appliedValue))
        || (!previous && !current.dynamicSettings?.[key]?.enabled)) return;
    const requested = Object.is(appliedValue, current[key]) ? '' : ` (requested ${formatLogValue(current[key])})`;
    const message = `${key}: ${previous ? `${formatLogValue(before)} → ` : ''}${formatLogValue(appliedValue)}${requested}`;
    logActivity(dynamic ? 'dynamic-change' : 'setting-change', message, { instanceID: instance.instanceID, profile });
}

export function finishPendingSettingChanges(instance, profile) {
    const pending = instance.pendingDynamicSettingChanges?.get(profile);
    if(!pending || !instance.pV[profile]?.engineSettingsReady) return;
    const variables = instance.pV[profile];
    const applied = variables.appliedSettings ?? {};
    const keys = new Set([...pending.keys, ...Object.keys(pending.current.dynamicSettings ?? {})]);
    for(const key of keys) {
        if(key.startsWith('DYNAMIC_') && !Object.hasOwn(applied, key)) continue;
        if(['engineElo', 'engineEnemyElo'].includes(key) && variables.usingAdvancedMode) continue;
        if(key === 'engineEnemyElo' && !Object.hasOwn(applied, key)) continue;
        if(key === 'advancedEloDepth' && !variables.usingAdvancedMode) continue;
        if(key === 'lc0Weight' && !Object.hasOwn(applied, key)) continue;
        logAppliedSetting(instance, profile, key, pending.previous, pending.current,
            Object.hasOwn(applied, key) ? applied[key] : pending.current[key]);
    }
    instance.appliedSettingValues ??= new Map();
    instance.appliedSettingValues.set(profile, { ...pending.current, ...applied });
    instance.pendingDynamicSettingChanges.delete(profile);
}