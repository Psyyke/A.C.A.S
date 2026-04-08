import { settingsPanelsElem, addNewProfileBtn, profileTabs } from './elementDeclarations.js';
import { setInstanceSelectionStatus } from './instances.js';
import { saveSetting, loopThroughAndUpdateSettingsValues } from './settings.js';
import { guiBroadcastChannel } from '../gui.js';
import { ensureOneDynamicEngineSettingVisible } from './dynamicEngineOptions.js';
import { closeAllExternalEnginesWithId } from '../AcasWebSocketClient.js';

function settingPanelTransitionAnimation(duration = 400) {
    if(!duration) return;
    if(!settingsPanelsElem) return;

    settingsPanelsElem.style.transition = 'none';
    settingsPanelsElem.style.filter = 'brightness(2)';
    settingsPanelsElem.style.opacity = '0.95';

    requestAnimationFrame(() => {
        settingsPanelsElem.style.transition = `filter ${duration}ms ease-out, opacity ${duration}ms ease-out`;
        settingsPanelsElem.style.filter = 'brightness(1)';
        settingsPanelsElem.style.opacity = '1';
    });

    setTimeout(() => {
        settingsPanelsElem.style.filter = '';
    }, duration);
}

async function deleteProfile(profileName) {
    const actualProfileName = GET_RAW_PROFILE_NAME(profileName);
    const warningText = `(${actualProfileName?.toUpperCase()}) `
        + (TRANS_OBJ?.profileRemovalWarning ?? 'Are you sure you want to remove this profile?\n\nThis action cannot be reversed.');

    if(confirm(warningText)) {
        const gmConfigKey = USERSCRIPT_SHARED_VARS.gmConfigKey;

        selectNearestProfileTab(profileTabs, actualProfileName);
        removeProfileTabItem(profileTabs, actualProfileName);

        const config = await USERSCRIPT.getValue(gmConfigKey);
        const profileKey = GET_PROFILE_STORAGE_KEY(actualProfileName);

        if(SETTING_FILTER_OBJ.instanceID) {
            delete config?.[SETTING_FILTER_OBJ.type]?.[SETTING_FILTER_OBJ.instanceID]?.['profiles']?.[profileKey];
        } else {
            delete config?.[SETTING_FILTER_OBJ.type]?.['profiles']?.[profileKey];
        }

        USERSCRIPT.setValue(gmConfigKey, config);

        closeAllExternalEnginesWithId(actualProfileName, 'profileName');
    }
}

function selectNearestProfileTab(tabsElem, profileName) {
    const listContainerElem = tabsElem.querySelector('.tabs-list-container');
    const listTabItems = [...listContainerElem.children].filter(x => x?.dataset?.value);
    const formattedName = GET_PROFILE_DOM_VALUE(profileName);
    const indexOfCurrentTab = listTabItems.findIndex(x => x.dataset.value === formattedName);

    if(indexOfCurrentTab && indexOfCurrentTab >= 1) {
        const nearestTabToLeft = listTabItems[indexOfCurrentTab - 1];

        console.log(nearestTabToLeft);

        setTimeout(() => {
            nearestTabToLeft?.click();
        }, 100);
    }
}

export function setProfileBubbleStatus(status, profileName, title = status) {
    if(!profileName) {
        console.error('Tried to set profile bubble status without proper profile name:', profileName);
        return;
    }

    const bubble = document.querySelector(`.profile-status-bubble[data-value="${GET_PROFILE_DOM_VALUE(profileName)}"]`);

    if(!bubble || typeof status !== 'string') return;

    [...bubble.classList].forEach(c => {
        if(c.includes('pbs-')) bubble.classList.remove(c);
    });

    bubble.classList.add(`pbs-${status}`);
    bubble.parentElement.title = 'Engine status: ' + title;
}

function addProfileTabItem(tabsElem, profileName, isDefault) {
    const actualProfileName = GET_RAW_PROFILE_NAME(profileName);
    const encodedProfileName = GET_PROFILE_DOM_VALUE(actualProfileName);
    const listContainerElem = tabsElem.querySelector('.tabs-list-container');
    const inputElem = tabsElem.querySelector('input');

    const statusBubble = document.createElement('div');
          statusBubble.classList.add('profile-status-bubble')
          statusBubble.dataset.value = encodedProfileName;

    const itemElem = document.createElement('div');
          itemElem.classList.add('tab-item');
          itemElem.classList.add('profile-tab');
          itemElem.classList.add('no-select');
          itemElem.dataset.value = encodedProfileName;
        
    const textElem = document.createElement('p');
          textElem.innerText = actualProfileName;

    itemElem.appendChild(statusBubble);
    itemElem.appendChild(textElem);

    if(!isDefault) {
        const removalButton = document.createElement('div');
              removalButton.innerText = '❌';
              removalButton.classList.add('profile-removal-button');
              removalButton.classList.add('no-select');
              removalButton.title = 'Remove profile';

        removalButton.onclick = () => {
            deleteProfile(actualProfileName);
        };

        itemElem.appendChild(removalButton);
    }

    itemElem.onclick = e => {
        inputElem.value = actualProfileName;

        const listItems = [...listContainerElem.querySelectorAll('.tab-item')]
            .filter(x => x?.dataset?.value);

        const selectedClass = 'selected-tab-item';

        listItems.forEach(x => x.classList.remove(selectedClass));
        itemElem.classList.add(selectedClass);

        const transitionTime = (e.isTrusted) ? 600 : null;
        settingPanelTransitionAnimation(transitionTime);

        const didClickOnRemovalBtn = e?.target?.classList?.contains('profile-removal-button');

        if(!didClickOnRemovalBtn) {
            SETTING_FILTER_OBJ.profileID = actualProfileName;

            saveSetting(inputElem, true); // save the profile setting
            loopThroughAndUpdateSettingsValues(e.isTrusted); // update values since profile changed

            setTimeout(async () => {
                const engineId = await GET_ACTIVE_ENGINE_NAME(actualProfileName);
                ensureOneDynamicEngineSettingVisible(engineId);
            }, 250);
        }
    }

    if(addNewProfileBtn) {
        addNewProfileBtn.before(itemElem);
    } else {
        listContainerElem.appendChild(itemElem);
    }

    return itemElem;
}

function removeProfileTabItem(tabsElem, itemValue, newValue) {
    const encodedName = GET_PROFILE_DOM_VALUE(itemValue);
    const dropdownItem = tabsElem.querySelector(`*[data-value="${encodedName}"]`);
    const dropdownInput = tabsElem.querySelector('input[data-default-value]');

    dropdownInput.value = GET_RAW_PROFILE_NAME(newValue || dropdownInput.dataset.defaultValue);

    dropdownItem?.remove();

    console.log(dropdownInput, dropdownInput.value);

    dropdownInput.dispatchEvent(new Event('change'));
}

export async function fillProfileTabs() {
    const defaultValue = profileTabs.querySelector('input').dataset.defaultValue || 'default';
    let profileNames = await GET_PROFILE_NAMES();

    if(typeof profileNames !== 'object')
        profileNames = [defaultValue];
    else if(!profileNames.includes(defaultValue))
        profileNames = [defaultValue, ...profileNames];

    setInstanceSelectionStatus(profileNames.length > 1);

    for(const profileName of profileNames) {
        const formattedName = GET_PROFILE_DOM_VALUE(profileName);

        const nameExists = [...profileTabs.querySelectorAll('.tab-item')].find(
            elem => elem.dataset.value === formattedName
        );

        if(!nameExists) {
            const isDefault = profileName?.toLowerCase() === defaultValue?.toLowerCase();
            const itemElem = addProfileTabItem(profileTabs, profileName, isDefault);
            const currentActiveProfileName = GET_RAW_PROFILE_NAME(await GET_GM_CFG_VALUE('chessEngineProfile', SETTING_FILTER_OBJ.instanceID, false));

            if(profileName === currentActiveProfileName) {
                setTimeout(() => {
                    itemElem.click();
                }, 100);
            }
        }
    }
}

export function createNewProfile() {
    while(true) {
        const msg = TRANS_OBJ?.profileNamePrompt ?? 'Enter the profile name:';
        const profileName = prompt(`${msg} `);

        if(!profileName) break;

        const formattedName = GET_PROFILE_DOM_VALUE(profileName);
        const nameExists = [...profileTabs.querySelectorAll('.tab-item')]
            .find(elem => elem.dataset.value === formattedName);

        if(nameExists) {
            const msg = TRANS_OBJ?.profileNameExists ?? 'That name already exists!';
            alert(msg);
        }

        if(profileName.length > 0 && !nameExists) {
            const itemElem = addProfileTabItem(profileTabs, profileName);

            setTimeout(() => {
                itemElem.click();
            }, 100);

            setTimeout(() => {
                guiBroadcastChannel.postMessage({
                    'type': 'newProfileMade',
                    'data' : { 'profileName': profileName }
                });
            }, 1000);

            break;
        }
    }
    
    loopThroughAndUpdateSettingsValues();
}