import { getDynamicEngineDbKeyPrefix, getDynamicOption } from '../gui/dynamicEngineOptionState.js';

export default async function applyDynamicOption(userscriptDbKey, optionValue, profileName, isApplyCausedByHuman) {
    const profileVariables = this.pV[profileName];
    if(!profileVariables) return false;
    const currentEngineId = profileVariables.useExternalChessEngine
        ? profileVariables.externalChessEngine : await this.getEngineName(profileName);
    const dbPrefix = getDynamicEngineDbKeyPrefix(currentEngineId);
    const { name, defaultValue, type, min, max, vars } = getDynamicOption(userscriptDbKey, profileName, this.instanceID) ?? {};

    // Reject before touching cached search/rendering values. Old engine options can
    // remain in storage after a dropdown switches to another engine mid-game.
    if(this.pV[profileName] !== profileVariables || this.instanceClosed
        || name === undefined || defaultValue === undefined
        || !userscriptDbKey.startsWith(dbPrefix) || optionValue == null
        || (typeof optionValue === 'string' && (/[<>\r\n\u0000]/.test(optionValue) || optionValue === 'value')))
        return false;

    // Use loaded-engine bounds, even when an older saved curve has a wider range.
    if(type === 'spin') {
        const numeric = Number(optionValue);
        if(!Number.isFinite(numeric)) return false;
        optionValue = Math.max(min != null && Number.isFinite(Number(min)) ? Number(min) : -Infinity,
            Math.min(max != null && Number.isFinite(Number(max)) ? Number(max) : Infinity, Math.round(numeric)));
    }
    if(type === 'combo' && Array.isArray(vars) && !vars.includes(optionValue)) return false;

    const updateCache = () => {
        switch(name) {
            case 'MultiPV': profileVariables.multiPV = optionValue; break;
            case 'UCI_Chess960': profileVariables.useChess960 = optionValue; break;
            case 'UCI_Variant': profileVariables.chessVariant = FORMAT_VARIANT(optionValue); break;
        }
    };

    // A saved default still updates the cache, but startup need not resend it.
    const isDefaultValue = VAR_TO_CORRECT_TYPE(optionValue) === VAR_TO_CORRECT_TYPE(defaultValue);
    if(isDefaultValue && !isApplyCausedByHuman) { updateCache(); return false; }

    const sent = await this.setEngineOption(name, optionValue, true, profileName);
    if(sent === false) return false;
    if(this.pV[profileName] !== profileVariables || this.instanceClosed) return false;
    updateCache();
    (profileVariables.appliedSettings ??= {})[userscriptDbKey] = optionValue;
    return true;
}