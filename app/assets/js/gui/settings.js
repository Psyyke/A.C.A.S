import { getInputValue, setInputValue, activateInputDefaultValue } from './domInputs.js';
import { runSettingChangeObserver } from './settingChangeObserver.js';
import { settingsNavbarGlobalElem } from './elementDeclarations.js';
import { toggleSelectedNavbarItem } from './instances.js';
import { guiBroadcastChannel } from '../gui.js';
import { logActivity, formatLogValue } from '../misc/activityLog.js';

let dynamicOptionThrottleSettingUpdate = null;
let settingsUpdateVersion = 0;

function getSettingFilter(settingElem) {
    return {
        ...SETTING_FILTER_OBJ,
        profileID: settingElem.closest('.dynamic-setting-profile-container')?.dataset.profileId
            ?? SETTING_FILTER_OBJ.profileID
    };
}

export function importSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = e => {
        const file = e.target.files[0];
    
        if (file.type === 'application/json') {
            const reader = new FileReader();

            reader.onload = event => {
                try {
                const jsonString = event.target.result;
                const jsonData = JSON.parse(jsonString);

                if(!('instance' in jsonData)) {
                    jsonData['instance'] = {};
                }

                if ('global' in jsonData) {
                    USERSCRIPT.setValue(USERSCRIPT_SHARED_VARS.gmConfigKey, jsonData);

                    console.log(jsonData);

                    loopThroughAndUpdateSettingsValues(true);

                    console.log('Successfully imported settings from a config file!');

                    location.reload();
                } else {
                    const msg = TRANS_OBJ?.configInvalidError ?? 'Invalid config file, missing "global" or "instance" keys!';
                    toast.error(msg, 15000);
                }
                } catch (error) {
                    const msg = TRANS_OBJ?.configUnknownError ?? `Error while loading config!`;
                    toast.error(`${msg}\n\n${error}`, 30000);
                }
            };

            reader.readAsText(file);
        } 
        
        else {
            const msg = TRANS_OBJ?.configInvalidFiletype ?? `Wrong file type loaded, the config needs to be a .json file!`;
            toast.error(msg, 30000);
        }
    };
    
    input.click();
}

export async function exportSettings() {
    const config = await USERSCRIPT.getValue(USERSCRIPT_SHARED_VARS.gmConfigKey);

    delete config.instance;

    const configFile = new Blob([JSON.stringify(config)], {
        type: 'application/json'
    });
    
    saveAs(configFile, 'config.json');
}

export async function resetSettings() {
    const warningText = TRANS_OBJ?.settingsResetWarning ?? 'Are you sure you want to reset settings?\n\nDANGER: This action is irreversable and will reset your whole config!';

    if(confirm(warningText)) {
        const gmConfigKey = USERSCRIPT_SHARED_VARS.gmConfigKey;

        USERSCRIPT.setValue(gmConfigKey, { 'global': { 'chessEngineProfile': 'default' } });

        try {
            if('indexedDB' in window) {
                const db = await POLYGLOT_BOOK.openDatabase();

                await new Promise((resolve, reject) => {
                    const transaction = db.transaction(POLYGLOT_BOOK.STORE_NAME, 'readwrite');
                    const store = transaction.objectStore(POLYGLOT_BOOK.STORE_NAME);
                    const request = store.clear();

                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                    transaction.onerror = () => reject(transaction.error);
                });
            }
        } catch (error) {
            console.error('Failed to clear Polyglot opening books from storage:', error);
        }

        localStorage.removeItem('polyglotBookName');

        for(let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);

            if(!key.startsWith('usageStat_') && key !== 'selectedLanguage') localStorage.removeItem(key);
        }
        
        location.reload();
    }
}

export async function saveSetting(settingElem, isDirectlyCausedByUser = false) {
    // Capture the owner before storage awaits, so switching tabs cannot redirect a save.
    const settingFilter = getSettingFilter(settingElem);
    const elemValue = getInputValue(settingElem);

    const settingObj = { 'key': settingElem.dataset.key, 'value': VAR_TO_CORRECT_TYPE(elemValue) };

    const gmConfigKey = USERSCRIPT_SHARED_VARS.gmConfigKey;
    const config = await USERSCRIPT.getValue(gmConfigKey);

    const noProfile = settingElem.dataset.noProfile;

    if(!noProfile && !settingFilter.profileID) return;

    const profileKey = GET_PROFILE_STORAGE_KEY(settingFilter.profileID);

    if(settingFilter.instanceID) {
        // Initialize the type object first
        INIT_NESTED_OBJECT(config, [settingFilter.type]);
        let base = config[settingFilter.type];
        
        // Initialize the instanceID object
        INIT_NESTED_OBJECT(base, [settingFilter.instanceID]);
    
        if (noProfile) {
            const valueToSave = settingObj.key === 'chessEngineProfile'
                ? GET_PROFILE_STORAGE_KEY(settingObj.value)
                : settingObj.value;

            config[settingFilter.type][settingFilter.instanceID][settingObj.key] = valueToSave;
        } else {
            // Initialize profiles and profileID objects
            INIT_NESTED_OBJECT(base[settingFilter.instanceID], ['profiles', profileKey]);
    
            config[settingFilter.type][settingFilter.instanceID]['profiles'][profileKey][settingObj.key] = settingObj.value;
        }
    } else {
        // Initialize the type object first so `base` is always defined
        INIT_NESTED_OBJECT(config, [settingFilter.type]);
        let base = config[settingFilter.type];

        if (noProfile) {
            const valueToSave = settingObj.key === 'chessEngineProfile'
                ? GET_PROFILE_STORAGE_KEY(settingObj.value)
                : settingObj.value;

            config[settingFilter.type][settingObj.key] = valueToSave;
        } else {
            // Initialize profiles and profileID objects
            INIT_NESTED_OBJECT(base, ['profiles', profileKey]);

            config[settingFilter.type]['profiles'][profileKey][settingObj.key] = settingObj.value;
        }
    }

    await USERSCRIPT.setValue(gmConfigKey, config);

    if(isDirectlyCausedByUser) logActivity('setting-change', `Saved ${settingObj.key}: ${formatLogValue(settingObj.value)}`, {
        instanceID: settingFilter.instanceID,
        profile: noProfile ? null : GET_HUMAN_READABLE_PROFILE_NAME(settingFilter.profileID)
    });

    const profile = await GET_PROFILE_FOR_INSTANCE(GET_HUMAN_READABLE_PROFILE_NAME(settingFilter.profileID), settingFilter.instanceID);
    if(profile?.config?.dynamicSettings) {
        // Keep the saved/default value in the setting broadcast. Dynamic values
        // are resolved when read for engine/runtime use, not written back here.
        profile.config[settingObj.key] = settingObj.value;
    }

    guiBroadcastChannel.postMessage({
        'type': 'settingSave',
        'data' : {
            'key': settingObj.key,
            'value': settingObj.value,
            instanceID: settingFilter.instanceID,
            noProfile: Boolean(noProfile),
            isDirectlyCausedByUser,
            profile,
        }
    });
    
    console.log(`[Setting Handler] Added config key ${settingObj.key} with value ${settingObj.value}\n-> Instance ${settingFilter.instanceID ? settingFilter.instanceID : '(No instance)'}, Profile ${noProfile ? '(No profile)' : settingFilter.profileID}`);
}

export async function removeSetting(settingElem) {
    const settingFilter = getSettingFilter(settingElem);
    const elemValue  = getInputValue(settingElem);

    const settingObj = { 'key': settingElem.dataset.key, 'value': VAR_TO_CORRECT_TYPE(elemValue) };

    const gmConfigKey = USERSCRIPT_SHARED_VARS.gmConfigKey;
    const config = await USERSCRIPT.getValue(gmConfigKey);

    const noProfile = settingElem.dataset.noProfile;

    const profileKey = GET_PROFILE_STORAGE_KEY(settingFilter.profileID);

    if(settingFilter.instanceID) {
        if(noProfile) {
            delete config?.[settingFilter.type]?.[settingFilter.instanceID]?.[settingObj.key];
        } else {
            delete config?.[settingFilter.type]?.[settingFilter.instanceID]?.['profiles']?.[profileKey]?.[settingObj.key];
        }
    } else {
        if(noProfile) {
            delete config?.[settingFilter.type]?.[settingObj.key];
        } else {
            delete config?.[settingFilter.type]?.['profiles']?.[profileKey]?.[settingObj.key];
        }
    }

    USERSCRIPT.setValue(gmConfigKey, config);

    runSettingChangeObserver(settingElem);

    console.log(`[Setting Handler] Removed config key "${settingObj.key}" with value "${settingObj.value}"`);
}

export async function loopThroughAndUpdateSettingsValues(isDirectlyCausedByUser) {
    const version = ++settingsUpdateVersion;
    const settingFilter = { ...SETTING_FILTER_OBJ };
    const profileKey = GET_PROFILE_STORAGE_KEY(settingFilter.profileID);
    const inputElements = [...document.querySelectorAll('input[data-key], textarea[data-key]')];

    for(const inputElem of inputElements) {
        const dynamicContainer = inputElem.closest('.dynamic-setting-profile-container');
        // Hidden profiles have their own inputs, not shared controls for the selected profile.
        if(dynamicContainer && dynamicContainer.dataset.profileId !== profileKey) continue;

        const key = inputElem.dataset.key;
        const noProfile = inputElem.dataset.noProfile;

        const value = noProfile
            ? await GET_GM_CFG_BASE_VALUE(key, settingFilter.instanceID, false)
            : await GET_GM_CFG_BASE_VALUE(key, settingFilter.instanceID, settingFilter.profileID);

        if(version !== settingsUpdateVersion || Object.keys(settingFilter).some(key => settingFilter[key] !== SETTING_FILTER_OBJ[key])) return;

        if(typeof value === 'boolean' || value || value === 0) {
            setInputValue(inputElem, value);
            runSettingChangeObserver(inputElem, 50, true);
        } else {
            activateInputDefaultValue(inputElem);
            await saveSetting(inputElem, isDirectlyCausedByUser);
            if(version !== settingsUpdateVersion || Object.keys(settingFilter).some(key => settingFilter[key] !== SETTING_FILTER_OBJ[key])) return;
            runSettingChangeObserver(inputElem, 5, true);
        }
    }

    document.dispatchEvent(new Event('acas-settings-updated'));
}

export function scheduleSettingsUpdate(waitTime = 50) {
    clearTimeout(dynamicOptionThrottleSettingUpdate);
    
    dynamicOptionThrottleSettingUpdate = setTimeout(() => {
        loopThroughAndUpdateSettingsValues();
    }, waitTime);
}