import { DEFAULT_VOICE } from './assets.js';
import { DEFAULT_ZONOS_VOICE, normalizeZonosVoice } from './zonos-voices.js';

// Pena is one global helper, so its settings live outside profiles.
export const penaDefaults = Object.freeze({
    penaEnabled: false,
    penaModel: '',
    penaCoaching: true,
    penaSpeech: 'neural',
    penaZonosVoice: DEFAULT_ZONOS_VOICE,
    penaBrowserVoice: 'auto',
    penaVoice: DEFAULT_VOICE,
    penaSpeaker: 0,
    penaSpeechRate: 1,
    penaTeacher: true,
    penaVisualDuration: 5,
    penaVoicePause: 2.5,
    penaFollowLine: true,
    penaHideMoves: true,
    penaOnlyWhenAsked: false,
    penaChattiness: 'normal',
    penaPreset: '12',
    penaEffort: 'auto',
    penaThinkingTokens: 1536,
    penaTemperature: 0.3,
    penaLora: 'off',
    penaLoraScale: 1,
    penaLoraFile: '',
    penaSystemPrompt: ''
});

// Stockfish checks every move Pena suggests at this depth while coaching is on.
export const PENA_CHECK_DEPTH = 12;

// Changing these needs the model loaded again.
export const penaModelKeys = Object.freeze(['penaPreset', 'penaLora', 'penaLoraScale', 'penaLoraFile']);
export const penaEfforts = Object.freeze(['auto', 'none', 'low', 'medium', 'high']);
export const penaLoraModes = Object.freeze(['pena', 'off', 'custom']);
export const penaChattinessModes = Object.freeze(['quiet', 'normal', 'chatty']);

export const penaPreferenceKeys = Object.keys(penaDefaults);

export async function getPenaPreferences(instanceID) {
    const values = await Promise.all(penaPreferenceKeys.map(key =>
        GET_GM_CFG_BASE_VALUE(key, key === 'penaZonosVoice' || key === 'penaBrowserVoice' ? null : instanceID, false)));
    const result = Object.fromEntries(penaPreferenceKeys.map((key, index) =>
        [key, values[index] ?? penaDefaults[key]]));
    result.penaZonosVoice = normalizeZonosVoice(result.penaZonosVoice);
    for(const [key, min, max] of [['penaVisualDuration', 0.5, 30], ['penaVoicePause', 0.8, 8]]) {
        result[key] = Number(result[key]);
        if(!Number.isFinite(result[key]) || result[key] < min || result[key] > max)
            throw new Error(`Pena ${key === 'penaVisualDuration' ? 'visual duration' : 'voice pause'} must be from ${min} to ${max} seconds.`);
    }
    result.languageCode = 'en';
    result.languageName = 'English';
    if(!result.penaVoice) result.penaVoice = DEFAULT_VOICE;
    return normalizeModelPreferences(result);
}

/** Out-of-range model settings fall back to their defaults instead of blocking Pena. */
export function normalizeModelPreferences(result) {
    const number = (key, min, max, integer = false) => {
        const value = Number(result[key]);
        result[key] = Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)) ? value : penaDefaults[key];
    };
    result.penaPreset = String(result.penaPreset) === '16' ? '16' : '12';
    if(!penaEfforts.includes(result.penaEffort)) result.penaEffort = penaDefaults.penaEffort;
    if(!penaLoraModes.includes(result.penaLora)) result.penaLora = penaDefaults.penaLora;
    if(!penaChattinessModes.includes(result.penaChattiness)) result.penaChattiness = penaDefaults.penaChattiness;
    result.penaCoaching = result.penaCoaching !== false && result.penaCoaching !== 'false';
    number('penaThinkingTokens', 64, 4096, true);
    number('penaTemperature', 0, 1.5);
    number('penaLoraScale', 0, 2);
    for(const key of ['penaLoraFile', 'penaSystemPrompt'])
        result[key] = typeof result[key] === 'string' ? result[key] : '';
    return result;
}

export { explanationBody, explanationExcerpt } from './commentary.js';
