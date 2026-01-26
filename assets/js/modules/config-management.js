// config-management.js
// Handles saving, removing, and updating configuration settings for the A.C.A.S GUI.
// Part of the modular ES6 codebase in assets/js/modules/.
// Import and use in settings-management.js and other modules as needed.

// Config management for A.C.A.S GUI

/**
 * Save a setting to the config storage and broadcast the change.
 * @param {Object} params - All dependencies and context for saving.
 * @returns {Promise<void>}
 */
export async function saveSetting({ settingElem, getInputValue, convertToCorrectType, GLOBAL_VARIABLES, USERSCRIPT, settingFilterObj, makeSettingChanges, getProfile, guiBroadcastChannel }) {
    const elemValue = getInputValue(settingElem);
    const settingObj = { 'key': settingElem.dataset.key, 'value': convertToCorrectType(elemValue) };
    const gmConfigKey = GLOBAL_VARIABLES.gmConfigKey;
    const config = await USERSCRIPT.getValue(gmConfigKey);
    const noProfile = settingElem.dataset.noProfile;
    if(settingFilterObj.instanceID) {
        if(noProfile) {
            config[settingFilterObj.type][settingFilterObj.instanceID][settingObj.key] = settingObj.value;
        } else {
            // Initialize profiles and profileID objects
            if (!config[settingFilterObj.type][settingFilterObj.instanceID]['profiles']) config[settingFilterObj.type][settingFilterObj.instanceID]['profiles'] = {};
            if (!config[settingFilterObj.type][settingFilterObj.instanceID]['profiles'][settingFilterObj.profileID]) config[settingFilterObj.type][settingFilterObj.instanceID]['profiles'][settingFilterObj.profileID] = {};
            config[settingFilterObj.type][settingFilterObj.instanceID]['profiles'][settingFilterObj.profileID][settingObj.key] = settingObj.value;
        }
    } else {
        if(noProfile) {
            config[settingFilterObj.type][settingObj.key] = settingObj.value;
        } else {
            if (!config[settingFilterObj.type]['profiles']) config[settingFilterObj.type]['profiles'] = {};
            if (!config[settingFilterObj.type]['profiles'][settingFilterObj.profileID]) config[settingFilterObj.type]['profiles'][settingFilterObj.profileID] = {};
            config[settingFilterObj.type]['profiles'][settingFilterObj.profileID][settingObj.key] = settingObj.value;
        }
    }
    USERSCRIPT.setValue(gmConfigKey, config);
    makeSettingChanges(settingElem);
    const profile = await getProfile(settingFilterObj.profileID);
    guiBroadcastChannel.postMessage({ 'type': 'settingSave', 'data' : { 'key': settingObj.key, 'value': settingObj.value, profile }});
    console.log(`[Setting Handler] Added config key ${settingObj.key} with value ${settingObj.value}\n-> Instance ${settingFilterObj.instanceID ? settingFilterObj.instanceID : '(No instance)'}, Profile ${noProfile ? '(No profile)' : settingFilterObj.profileID}`);
}

/**
 * Remove a setting from the config storage and broadcast the change.
 * @param {Object} params - All dependencies and context for removal.
 * @returns {Promise<void>}
 */
export async function removeSetting({ settingElem, getInputValue, convertToCorrectType, GLOBAL_VARIABLES, USERSCRIPT, settingFilterObj, makeSettingChanges }) {
    const elemValue  = getInputValue(settingElem);
    const settingObj = { 'key': settingElem.dataset.key, 'value': convertToCorrectType(elemValue) };
    const gmConfigKey = GLOBAL_VARIABLES.gmConfigKey;
    const config = await USERSCRIPT.getValue(gmConfigKey);
    const noProfile = settingElem.dataset.noProfile;
    if(settingFilterObj.instanceID) {
        if(noProfile) {
            delete config?.[settingFilterObj.type]?.[settingFilterObj.instanceID]?.[settingObj.key];
        } else {
            delete config?.[settingFilterObj.type]?.[settingFilterObj.instanceID]?.['profiles']?.[settingFilterObj.profileID]?.[settingObj.key];
        }
    } else {
        if(noProfile) {
            delete config?.[settingFilterObj.type]?.[settingObj.key];
        } else {
            delete config?.[settingFilterObj.type]?.['profiles']?.[settingFilterObj.profileID]?.[settingObj.key];
        }
    }
    USERSCRIPT.setValue(gmConfigKey, config);
    makeSettingChanges(settingElem);
    console.log(`[Setting Handler] Removed config key "${settingObj.key}" with value "${settingObj.value}"`);
}

export function importSettings({ USERSCRIPT, GLOBAL_VARIABLES, updateSettingsValues, transObj, toast }) {
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
                        USERSCRIPT.setValue(GLOBAL_VARIABLES.gmConfigKey, jsonData);
                        updateSettingsValues();
                        console.log('Successfully imported settings from a config file!');
                        const msg = transObj?.configImportSuccess ?? 'Successfully imported settings from a config file!';
                        toast.success(msg, 5000);
                    } else {
                        const msg = transObj?.configInvalidError ?? 'Invalid config file, missing "global" or "instance" keys!';
                        toast.error(msg, 15000);
                    }
                } catch (error) {
                    const msg = transObj?.configUnknownError ?? `Error while loading config!`;
                    toast.error(`${msg}\n\n${error}`, 30000);
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}
