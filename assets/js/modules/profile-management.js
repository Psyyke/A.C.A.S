// profile-management.js
// Handles creation, deletion, and management of user profiles in the A.C.A.S GUI.
// Part of the modular ES6 codebase in assets/js/modules/.
// Used by settings and config modules.

// Profile management module for A.C.A.S GUI
import { domElements } from './dom-elements.js';

/**
 * Prompt the user to create a new profile and update the dropdown.
 * @param {...any} args
 * @returns {Promise<void>}
 */
export async function createNewProfile(transObj, addDropdownItem, formatProfileName, updateSettingsValues, profileDropdown) {
    while(true) {
        const msg = transObj?.profileNamePrompt ?? 'Enter the profile name:';
        const profileName = prompt(`${msg} `);
        if(!profileName) break;
        const nameExists = [...profileDropdown.querySelectorAll('.dropdown-item')].find(elem => elem.dataset.value === formatProfileName(profileName));
        if(nameExists) {
            const msg = transObj?.profileNameExists ?? 'That name already exists!';
            alert(msg);
        }
        if(profileName.length > 0 && !nameExists) {
            const itemElem = addDropdownItem(profileDropdown, formatProfileName(profileName));
            setTimeout(() => { itemElem.click(); }, 100);
            break;
        }
    }
    updateSettingsValues();
}

/**
 * Fill the profile dropdown with available profiles.
 * @param {...any} args
 * @returns {Promise<boolean>}
 */
export async function fillProfileDropdown(getProfileNames, formatProfileName, addDropdownItem, getGmConfigValue, updateSettingsValues, profileDropdown, settingFilterObj) {
    const profileNames = await getProfileNames();
    if(!profileNames) return false;
    for(const profileName of profileNames) {
        const nameExists = [...profileDropdown.querySelectorAll('.dropdown-item')].find(
            elem => elem.dataset.value === formatProfileName(profileName)
        );
        if(!nameExists) {
            const itemElem = addDropdownItem(profileDropdown, formatProfileName(profileName));
            const currentActiveProfileName = await getGmConfigValue('chessEngineProfile', settingFilterObj.instanceID, false);
            if(profileName === currentActiveProfileName) {
                setTimeout(() => { itemElem.click(); }, 100);
            }
        }
    }
}

/**
 * Delete a profile and update the dropdown.
 * @param {...any} args
 * @returns {Promise<void>}
 */
export async function deleteProfile(transObj, GLOBAL_VARIABLES, removeDropdownItem, profileDropdown, USERSCRIPT, settingFilterObj) {
    const warningText = transObj?.profileRemovalWarning ?? 'Are you sure you want to remove this profile?\n\nThis action cannot be reversed.';
    if(confirm(warningText)) {
        const gmConfigKey = GLOBAL_VARIABLES.gmConfigKey;
        const profileName = document.querySelector('input[data-key="chessEngineProfile"]').value;
        removeDropdownItem(profileDropdown, profileName);
        const config = await USERSCRIPT.getValue(gmConfigKey);
        if(settingFilterObj.instanceID) {
            delete config?.[settingFilterObj.type]?.[settingFilterObj.instanceID]?.['profiles']?.[profileName];
        } else {
            delete config?.[settingFilterObj.type]?.['profiles']?.[profileName];
        }
        USERSCRIPT.setValue(gmConfigKey, config);
    }
}
