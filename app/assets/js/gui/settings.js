import { getInputValue, setInputValue, activateInputDefaultValue } from './domInputs.js';
import { runSettingChangeObserver } from './settingChangeObserver.js';
import { settingsNavbarGlobalElem } from './elementDeclarations.js';
import { toggleSelectedNavbarItem } from './instances.js';
import { guiBroadcastChannel } from '../gui.js';

let dynamicOptionThrottleSettingUpdate = null;

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

                if(!'instance' in jsonData) {
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

        for(let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);

            if(!key.startsWith('usageStat_') && key !== 'selectedLanguage') localStorage.removeItem(key);
        }
        
        location.reload();
    }
}

export async function saveSetting(settingElem, isDirectlyCausedByUser = false) {
    const elemValue = getInputValue(settingElem);

    const settingObj = { 'key': settingElem.dataset.key, 'value': VAR_TO_CORRECT_TYPE(elemValue) };

    const gmConfigKey = USERSCRIPT_SHARED_VARS.gmConfigKey;
    const config = await USERSCRIPT.getValue(gmConfigKey);

    const noProfile = settingElem.dataset.noProfile;

    const profileKey = GET_PROFILE_STORAGE_KEY(SETTING_FILTER_OBJ.profileID);

    if(SETTING_FILTER_OBJ.instanceID) {
        // Initialize the type object first
        INIT_NESTED_OBJECT(config, [SETTING_FILTER_OBJ.type]);
        let base = config[SETTING_FILTER_OBJ.type];
        
        // Initialize the instanceID object
        INIT_NESTED_OBJECT(base, [SETTING_FILTER_OBJ.instanceID]);
    
        if (noProfile) {
            const valueToSave = settingObj.key === 'chessEngineProfile'
                ? GET_PROFILE_STORAGE_KEY(settingObj.value)
                : settingObj.value;

            config[SETTING_FILTER_OBJ.type][SETTING_FILTER_OBJ.instanceID][settingObj.key] = valueToSave;
        } else {
            // Initialize profiles and profileID objects
            INIT_NESTED_OBJECT(base[SETTING_FILTER_OBJ.instanceID], ['profiles', profileKey]);
    
            config[SETTING_FILTER_OBJ.type][SETTING_FILTER_OBJ.instanceID]['profiles'][profileKey][settingObj.key] = settingObj.value;
        }
    } else {
        let base = config[SETTING_FILTER_OBJ.type];
        
        if (noProfile) {
            // Initialize the type object
            INIT_NESTED_OBJECT(config, [SETTING_FILTER_OBJ.type]);
    
            const valueToSave = settingObj.key === 'chessEngineProfile'
                ? GET_PROFILE_STORAGE_KEY(settingObj.value)
                : settingObj.value;

            config[SETTING_FILTER_OBJ.type][settingObj.key] = valueToSave;
        } else {
            // Initialize profiles and profileID objects
            INIT_NESTED_OBJECT(base, ['profiles', profileKey]);
    
            config[SETTING_FILTER_OBJ.type]['profiles'][profileKey][settingObj.key] = settingObj.value;
        }
    }

    USERSCRIPT.setValue(gmConfigKey, config);

    const profile = await GET_PROFILE(SETTING_FILTER_OBJ.profileID);

    guiBroadcastChannel.postMessage({
        'type': 'settingSave',
        'data' : {
            'key': settingObj.key,
            'value': settingObj.value,
            isDirectlyCausedByUser,
            profile,
        }
    });
    
    console.log(`[Setting Handler] Added config key ${settingObj.key} with value ${settingObj.value}\n-> Instance ${SETTING_FILTER_OBJ.instanceID ? SETTING_FILTER_OBJ.instanceID : '(No instance)'}, Profile ${noProfile ? '(No profile)' : SETTING_FILTER_OBJ.profileID}`);
}

export async function removeSetting(settingElem) {
    const elemValue  = getInputValue(settingElem);

    const settingObj = { 'key': settingElem.dataset.key, 'value': VAR_TO_CORRECT_TYPE(elemValue) };

    const gmConfigKey = USERSCRIPT_SHARED_VARS.gmConfigKey;
    const config = await USERSCRIPT.getValue(gmConfigKey);

    const noProfile = settingElem.dataset.noProfile;

    const profileKey = GET_PROFILE_STORAGE_KEY(SETTING_FILTER_OBJ.profileID);

    if(SETTING_FILTER_OBJ.instanceID) {
        if(noProfile) {
            delete config?.[SETTING_FILTER_OBJ.type]?.[SETTING_FILTER_OBJ.instanceID]?.[settingObj.key];
        } else {
            delete config?.[SETTING_FILTER_OBJ.type]?.[SETTING_FILTER_OBJ.instanceID]?.['profiles']?.[profileKey]?.[settingObj.key];
        }
    } else {
        if(noProfile) {
            delete config?.[SETTING_FILTER_OBJ.type]?.[settingObj.key];
        } else {
            delete config?.[SETTING_FILTER_OBJ.type]?.['profiles']?.[profileKey]?.[settingObj.key];
        }
    }

    USERSCRIPT.setValue(gmConfigKey, config);

    runSettingChangeObserver(settingElem);

    console.log(`[Setting Handler] Removed config key "${settingObj.key}" with value "${settingObj.value}"`);
}

export async function loopThroughAndUpdateSettingsValues(isDirectlyCausedByUser) {
    const inputElements = [...document.querySelectorAll('input[data-key]')];

    for(const inputElem of inputElements) {
        const key = inputElem.dataset.key;
        const noProfile = inputElem.dataset.noProfile;

        const value = await GET_GM_CFG_VALUE(key, SETTING_FILTER_OBJ.instanceID, noProfile ? false : SETTING_FILTER_OBJ.profileID);

        if(typeof value === 'boolean' || value || value === 0) {
            setInputValue(inputElem, value);
            runSettingChangeObserver(inputElem, 50, true);
        } else {
            activateInputDefaultValue(inputElem);
            saveSetting(inputElem, isDirectlyCausedByUser);
            runSettingChangeObserver(inputElem, 5, true);
        }
    }
}

export function scheduleSettingsUpdate(waitTime = 50) {
    clearTimeout(dynamicOptionThrottleSettingUpdate);
    
    dynamicOptionThrottleSettingUpdate = setTimeout(() => {
        loopThroughAndUpdateSettingsValues();
    }, waitTime);
}