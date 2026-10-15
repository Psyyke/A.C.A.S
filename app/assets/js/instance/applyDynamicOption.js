import { getDynamicEngineDbKeyPrefix, getDynamicOption } from '../gui/dynamicEngineOptionState.js';

export default async function applyDynamicOption(userscriptDbKey, optionValue, profileName, isApplyCausedByHuman) {
    const profileVariables = this.pV[profileName];

    if(!profileVariables) return false;

    const currentEngineId = profileVariables.useExternalChessEngine
        ? profileVariables.externalChessEngine : await this.getEngineName(profileName);
    const dbPrefix = getDynamicEngineDbKeyPrefix(currentEngineId);
    const { name, defaultValue, type, min, max, vars } = getDynamicOption(userscriptDbKey, profileName, this.instanceID) ?? {};

    if(type === 'string' && optionValue === '<empty>') optionValue = '';

    const isCurrentProfile = this.pV[profileName] === profileVariables && !this.instanceClosed;
    const isKnownOption = name !== undefined && defaultValue !== undefined && userscriptDbKey.startsWith(dbPrefix);
    const isInvalidText = typeof optionValue === 'string'
        && (/[<>\r\n\u0000]/.test(optionValue) || optionValue === 'value');

    if(!isCurrentProfile || !isKnownOption || optionValue == null || isInvalidText) return false;

    // Use loaded-engine bounds, even when an older saved curve has a wider range.
    if(type === 'spin') {
        if(typeof optionValue === 'boolean' || String(optionValue).trim() === '') return false;

        const numeric = Number(optionValue);
        const minimum = min != null && Number.isFinite(Number(min)) ? Number(min) : -Infinity;
        const maximum = max != null && Number.isFinite(Number(max)) ? Number(max) : Infinity;

        if(!Number.isFinite(numeric)) return false;

        optionValue = Math.max(minimum, Math.min(maximum, Math.round(numeric)));
    }

    if(type === 'string') {
        // Old clients stored blank strings as true. Do not send those corrupted
        // overrides back as paths, backend options or Lc0's numeric Contempt.
        if(typeof optionValue === 'boolean') return false;

        optionValue = String(optionValue);
    }

    if(type === 'check') {
        if(!/^(true|false)$/i.test(String(optionValue))) return false;

        optionValue = String(optionValue).toLowerCase() === 'true';
    }

    if(type === 'button') return false;
    if(type === 'combo' && Array.isArray(vars) && !vars.includes(optionValue)) return false;

    const updateCache = () => {
        switch(name) {
            case 'MultiPV':
                profileVariables.multiPV = optionValue;
                break;
            case 'UCI_Chess960':
                profileVariables.useChess960 = optionValue;
                break;
            case 'UCI_Variant':
                profileVariables.chessVariant = FORMAT_VARIANT(optionValue);
                break;
        }
    };

    // A saved default still updates the cache, but startup need not resend it.
    const numericStringDefault = type === 'string' && String(defaultValue).trim() !== ''
        && Number.isFinite(Number(defaultValue));
    const isTextOption = type === 'string' || type === 'combo';
    const matchesNumericDefault = numericStringDefault && optionValue.trim() !== ''
        && Number(optionValue) === Number(defaultValue);
    const isDefaultValue = isTextOption
        ? String(optionValue) === String(defaultValue)
            || matchesNumericDefault
        : VAR_TO_CORRECT_TYPE(optionValue) === VAR_TO_CORRECT_TYPE(defaultValue);

    if(isDefaultValue && !isApplyCausedByHuman) {
        updateCache();
        return false;
    }

    const sent = await this.setEngineOption(name, optionValue, true, profileName);

    if(sent === false) return false;
    if(this.pV[profileName] !== profileVariables || this.instanceClosed) return false;

    updateCache();
    (profileVariables.appliedSettings ??= {})[userscriptDbKey] = optionValue;

    return true;
}