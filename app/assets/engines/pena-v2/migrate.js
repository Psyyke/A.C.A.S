import { penaPreferenceKeys } from './preferences.js';

// Pena used to be called Queen inside A.C.A.S, so these move saved settings and window state
// over to the new names once, so nothing resets. Newer values always win over old ones.
const legacyName = key => key.replace(/^pena/, 'queen');
const storageKeys = ['penaReadAloud', 'penaWindowPosition', 'penaWindowHeight'];
const legacyStorageKey = key => key.startsWith('acas.pena.') ? key.replace('acas.pena.', 'acas.queen.') : legacyName(key);

function moveKeys(target) {
    if(!target || typeof target !== 'object') return false;
    let moved = false;
    for(const key of penaPreferenceKeys) {
        const old = legacyName(key);
        if(!(old in target)) continue;
        if(target[key] === undefined) target[key] = target[old];
        delete target[old];
        moved = true;
    }
    return moved;
}

/** Renames queen* settings in the userscript config. Returns true when the config changed. */
export function migrateLegacyPenaSettings(config) {
    if(!config || typeof config !== 'object') return false;
    const scopes = [config.global, ...Object.values(config.global?.profiles || {}),
        ...Object.values(config.instance || {}).flatMap(instance => [instance, ...Object.values(instance?.profiles || {})])];
    return scopes.map(moveKeys).some(Boolean);
}

/** Moves Pena's window state, and read aloud choice to the new storage keys. */
export function migrateLegacyPenaStorage(storage = globalThis.localStorage) {
    if(!storage) return;
    for(const key of storageKeys) {
        const old = legacyStorageKey(key);
        const value = storage.getItem(old);
        if(value === null) continue;
        if(storage.getItem(key) === null) storage.setItem(key, value);
        storage.removeItem(old);
    }
}
