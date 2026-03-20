import { acasInstanceContainer, noInstancesContainer, settingsNavbarContainerElem, settingsNavbarElem,
  settingsNavbarSubtitleElem, settingsNavbarGlobalElem, settingsInstanceDropdownElem, settingsInstanceDropdownContentElem,
  instanceSizeChangeContainerElem } from './elementDeclarations.js';
import { loopThroughAndUpdateSettingsValues } from './settings.js';

const options = [settingsNavbarGlobalElem, settingsInstanceDropdownElem];

export function toggleSelectedNavbarItem(selectedElem, instanceID) {
    SETTING_FILTER_OBJ.type = selectedElem.dataset.type;
    SETTING_FILTER_OBJ.instanceID = null;

    switch(SETTING_FILTER_OBJ.type) {
        case 'global':
            settingsNavbarSubtitleElem.innerText = 'Settings affect every instance';

            break;
        case 'instance':
            SETTING_FILTER_OBJ.instanceID = instanceID;
            settingsNavbarSubtitleElem.innerText = `Settings only affect instance "${SETTING_FILTER_OBJ.instanceID}"`;
            
            break;
    }
    
    options.forEach(elem => {
        if(elem == selectedElem) 
            elem.classList.add('selected');
        else 
            elem.classList.remove('selected');
    });

    loopThroughAndUpdateSettingsValues();
}

export function setInstanceSelectionStatus(doHide) {
    const instanceSettingsBtns = [...document.querySelectorAll('.instance-settings-btn')];

    if(doHide) {
        settingsNavbarElem.classList.add('disabled');
        instanceSettingsBtns.forEach(x => x.classList.add('disabled'));
        IS_INSTANCE_SETTING_BTN_DISABLED = true;
    } else {
        settingsNavbarElem.classList.remove('disabled');
        instanceSettingsBtns.forEach(x => x.classList.remove('disabled'));
        IS_INSTANCE_SETTING_BTN_DISABLED = false;
    }
}

export function addInstanceToSettingsDropdown(instanceID, domain, chessVariant, instanceElem) {
    const dropmenuItem = document.createElement('div');
        dropmenuItem.classList.add('dropdown-item');
        dropmenuItem.dataset.instanceId = instanceID;
        dropmenuItem.dataset.domain = domain;
        dropmenuItem.innerHTML = `
        <div class="dropdown-item-title">${chessVariant} (${domain})</div>
        <div class="dropdown-item-subtitle">${instanceID}</div>
        `;

    const highlightedElem = instanceElem.querySelector('.highlight-indicator');

    dropmenuItem.ontouchstart = () => highlightedElem.classList.remove('hidden');
    dropmenuItem.ontouchend = () => highlightedElem.classList.add('hidden');

    dropmenuItem.onmouseenter = () => highlightedElem.classList.remove('hidden');
    dropmenuItem.onmouseleave = () => highlightedElem.classList.add('hidden');

    settingsInstanceDropdownContentElem.append(dropmenuItem);
}

export function removeInstanceFromSettingsDropdown(instanceID) {
    const elem = [...settingsInstanceDropdownContentElem.children].find(elem => elem.dataset.instanceId == instanceID);

    elem?.remove();
}

export function monitorInstanceTabs() {
    new MutationObserver(() => {
        const navbarInstanceContentElems = [...settingsInstanceDropdownElem.querySelector('.dropdown-content').children];
        
        navbarInstanceContentElems.forEach(elem => {
            if(!elem.dataset?.activated) {
                elem.onclick = () => toggleSelectedNavbarItem(settingsInstanceDropdownElem, elem.dataset.instanceId);
    
                elem.dataset.activated = true;
            }
        });
    }).observe(settingsNavbarElem, { childList: true, subtree: true });
}

export function monitorInstances() {
    new MutationObserver(() => {
        if([...acasInstanceContainer.querySelectorAll('.acas-instance')]?.length > 0) {
            noInstancesContainer.classList.add('hidden');

            instanceSizeChangeContainerElem.classList.remove('hidden');
            settingsNavbarContainerElem.classList.remove('hidden');
        } else {
            noInstancesContainer.classList.remove('hidden');

            instanceSizeChangeContainerElem.classList.add('hidden');
            settingsNavbarContainerElem.classList.add('hidden');
        }

        const isUserOnNotExistingInstanceTab = SETTING_FILTER_OBJ?.instanceID
            && !document.querySelector(`.acas-instance[data-instance-id="${SETTING_FILTER_OBJ?.instanceID}"]`);
        
        if(isUserOnNotExistingInstanceTab) {
            toggleSelectedNavbarItem(settingsNavbarGlobalElem);
        }
    }).observe(acasInstanceContainer, { childList: true, subtree: true });
}