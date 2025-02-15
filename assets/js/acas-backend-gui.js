const acasInstanceContainer = document.querySelector('#acas-instance-container');
const noInstancesContainer = document.querySelector('#no-instances-container');

const settingsContainerElem = document.querySelector('#acas-settings-container');
const settingsHeaderElem = document.querySelector('#settings-header');
const settingsNavbarContainerElem = document.querySelector('#settings-navbar-container');
const settingsNavbarElem = document.querySelector('#settings-navbar');
const settingsPanelsElem = document.querySelector('#settings-panels');

const settingsNavbarSubtitleElem = document.querySelector('#settings-navbar-subtitle');

const settingsNavbarGlobalElem = document.querySelector('#settings-navbar-global');
const settingsInstanceDropdownElem = document.querySelector('#settings-navbar-instance');
const settingsInstanceDropdownContentElem = document.querySelector('#settings-navbar-instance .dropdown-content');

const installNotificationElem = document.querySelector('#install-notification');

const tosContainerElem = document.querySelector('#tos-container');
const tosCheckboxElem = document.querySelector('#tos-checkbox');
const tosContinueBtnElem = document.querySelector('#tos-continue-button');

const importSettingsBtn = document.querySelector('#import-settings-btn');
const exportSettingsBtn = document.querySelector('#export-settings-btn');
const resetSettingsBtn = document.querySelector('#reset-settings-btn');

const bodyBlurOverlayElem = document.querySelector('#blur-overlay');

const themeColorInput = document.querySelector('input[data-key="themeColorHex"]');
const boardColorInput = document.querySelector('input[data-key="boardColorHex"]');

const noInstancesSitesElem = document.querySelector('#no-instances-sites');
const seeSupportedSitesBtn = document.querySelector('#see-supported-sites-btn');

const ttsNameDropdownElem = document.querySelector('#tts-name-dropdown');
const ttsSpeedRangeElem = document.querySelector('#tts-speed-range');

const userscriptInfoElem = document.querySelector('#userscript-info-small');

const updateYourUserscriptElem = document.querySelector('#update-your-userscript-notification');

const instanceSizeChangeContainerElem = document.querySelector('#instance-size-change-container');
const decreaseInstanceSizeBtn = document.querySelector('#decrease-instance-size-btn');
const increaseInstanceSizeBtn = document.querySelector('#increase-instance-size-btn');

const chessVariantDropdown = document.querySelector('#chess-variant-dropdown');
const engineEloInput = document.querySelector('#engine-elo-input');
const lc0WeightDropdown = document.querySelector('#lc0-weight-dropdown');
const engineNodesInput = document.querySelector('#engine-nodes-input');

const addNewProfileBtn = document.querySelector('#add-new-profile-button');
const profileDropdown = document.querySelector('#chess-engine-profile-dropdown');
const deleteProfileBtn = document.querySelector('#delete-profile-button');

let lastProfileID = null;

if(userscriptInfoElem && typeof USERSCRIPT === 'object' && USERSCRIPT?.GM_info) {
    const GM_info = USERSCRIPT?.GM_info;
    const platform = GM_info?.platform || GM_info?.userAgentData || { 'platform': 'Unknown' };

    const platformData = objectToString(platform);
    const userscriptManagerData = [GM_info?.scriptHandler, GM_info?.version]?.join(' ');
    const userscriptData = [GM_info?.script?.author, GM_info?.script?.version]?.join(' ');

    document.title = `A.C.A.S (Using ${userscriptData})`;

    if(GM_info?.script?.version && isBelowVersion(GM_info?.script?.version, '2.2.2')) {
        updateYourUserscriptElem.classList.remove('hidden');
    }
    
    userscriptInfoElem.innerText = ['System Information', platformData, userscriptManagerData, userscriptData, Date.now()].join(' | ');
} else {
    userscriptInfoElem?.remove();
}

const boardSizeModifierKey = 'boardSizeModifier';
const instanceSizeKey = 'instanceSize';
const defaultInstanceSize = 500;

if(!localStorage.getItem(boardSizeModifierKey)) {
    localStorage.setItem(boardSizeModifierKey, 1);
}

if(!localStorage.getItem(instanceSizeKey)) {
    localStorage.setItem(instanceSizeKey, defaultInstanceSize);
}

function changeBoardSizeModifier(change) {
    const instanceSize = Number(localStorage.getItem(instanceSizeKey));
    const boardSizeModifier = Number(localStorage.getItem(boardSizeModifierKey));
    const newBoardSizeModifier = boardSizeModifier + change;

    localStorage.setItem(boardSizeModifierKey, newBoardSizeModifier);

    const instanceElems = [...document.querySelectorAll('.acas-instance')];

    instanceElems.forEach(elem => elem.style.width = `${instanceSize * newBoardSizeModifier}px`);
}

decreaseInstanceSizeBtn.onclick = () => {
    changeBoardSizeModifier(-0.1);
}

increaseInstanceSizeBtn.onclick = () => {
    changeBoardSizeModifier(0.1);
}

seeSupportedSitesBtn.onclick = () => {
    noInstancesSitesElem.classList.toggle('hidden');
}

addNewProfileBtn.onclick = () => {
    createNewProfile();
}

deleteProfileBtn.onclick = () => {
    deleteProfile();
}

const options = [settingsNavbarGlobalElem, settingsInstanceDropdownElem];

const settingFilterObj = { 'type': 'global', 'instanceID': null, 'profileID': null };

const guiBroadcastChannel = new BroadcastChannel('gui');

guiBroadcastChannel.onmessage = e => {
    const msg = e.data;

    const type = msg.type;
    const data = msg.data;

    switch(type) {
        case 'updateChessVariants':
            fillChessVariantDropdowns(data);
            break;
    }
};

function displayNoUserscriptNotification(isEnable) {
    if(isEnable)
        installNotificationElem.classList.add('hidden');
    else
        installNotificationElem.classList.remove('hidden');
}

function displayTOS() {
    tosCheckboxElem.onchange = function() {
        if(tosCheckboxElem.checked) {
            tosContinueBtnElem.classList.add('active');
            tosContinueBtnElem.removeAttribute('disabled');
        } else {
            tosContinueBtnElem.classList.remove('active');
            tosContinueBtnElem.setAttribute('disabled', 'disabled');
        }
    }

    tosContinueBtnElem.onclick = function() {
        if(tosCheckboxElem.checked) {
            USERSCRIPT.GM_setValue('isTosAccepted', true);
            
            setTimeout(() => window.location.reload(), 250);
        }
    }

    tosContainerElem.classList.remove('hidden');
}

function addInstanceToSettingsDropdown(instanceID, domain, chessVariant, instanceElem) {
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

function removeInstanceFromSettingsDropdown(instanceID) {
    const elem = [...settingsInstanceDropdownContentElem.children].find(elem => elem.dataset.instanceId == instanceID);

    elem?.remove();
}

function fillChessVariantDropdowns(arr) {
    const chessVariantsArr = arr.sort((a, b) => a.localeCompare(b));

    const chessVariantDropdownElems = [...document.querySelectorAll('#chess-variant-dropdown')];

    chessVariantDropdownElems
        .filter(elem => !elem.getAttribute('filled-successfully'))
        .forEach(elem => {
            chessVariantsArr.forEach(str => addDropdownItem(elem, str));

            elem.setAttribute('filled-successfully', true);
        });
}

function fillTTSVoiceNameDropdown() {
    const ttsVoices = getAvailableTTSVoices();

    if(ttsVoices?.length === 0) {
        return false;
    }

    ttsVoices.forEach(x => addDropdownItem(ttsNameDropdownElem, x));

    return true;
}

function createNewProfile() {
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

            setTimeout(() => {
                itemElem.click();
            }, 100);

            break;
        }
    }
    
    updateSettingsValues();
}

function fillProfileDropdown() {
    const profileNames = getProfileNames();

    if(!profileNames) return false;

    profileNames.forEach(profileName => {
        const nameExists = [...profileDropdown.querySelectorAll('.dropdown-item')].find(elem => elem.dataset.value === formatProfileName(profileName));

        if(!nameExists) {
            const itemElem = addDropdownItem(profileDropdown, formatProfileName(profileName));
            const currentActiveProfileName = getGmConfigValue(USERSCRIPT.dbValues.chessEngineProfile, settingFilterObj.instanceID, false);

            if(profileName === currentActiveProfileName) {
                setTimeout(() => {
                    itemElem.click();
                }, 100);
            }
        }
    });
}

function deleteProfile() {
    const warningText = transObj?.profileRemovalWarning ?? 'Are you sure you want to remove this profile?\n\nThis action cannot be reversed.';

    if(confirm(warningText)) {
        const profileName = document.querySelector('input[data-key="chessEngineProfile"]').value;

        removeDropdownItem(profileDropdown, profileName);

        const configDatabaseKey = USERSCRIPT.dbValues.AcasConfig;
        const config = USERSCRIPT.GM_getValue(configDatabaseKey);

        if(settingFilterObj.instanceID) {
            delete config?.[settingFilterObj.type]?.[settingFilterObj.instanceID]?.['profiles']?.[profileName];
        } else {
            delete config?.[settingFilterObj.type]?.['profiles']?.[profileName];
        }

        USERSCRIPT.GM_setValue(configDatabaseKey, config);
    }
}

const waitForTTSVoices = setInterval(() => {
    const res = fillTTSVoiceNameDropdown();

    if(res) {
        clearInterval(waitForTTSVoices);
    }
}, 100);

function getInputValue(elem) {
    let value = elem.value;

    if(elem.type == 'checkbox') {
        value = elem.checked;
    } else if(elem.getAttribute('additional-type') == 'dropdown') {
        value = doesDropdownItemExist(elem, elem.value) ? elem.value : elem.dataset.defaultValue;
    }

    return (value !== undefined && value !== null) ? value : elem.dataset.defaultValue;
}

function setInputValue(elem, val) {
    const isCheckbox = elem.type == 'checkbox';

    if(isCheckbox) {
        elem.checked = convertToCorrectType(val);
    } else {
        elem.value = convertToCorrectType(val);
    }
}

function activateInputDefaultValue(elem) {
    setInputValue(elem, elem.dataset.defaultValue);
}

function makeSettingChanges(inputElem) {
    const value = getInputValue(inputElem);
    const valueExists = typeof value === 'boolean' || value;

    switch(inputElem.dataset.key) {
        case 'themeColorHex':
            document.body.style['background-color'] = value || null;
            acasInstanceContainer.style['background-color'] = value || null;

            console.log('[Setting Handler] Set theme color to', value || 'nothing');

            break;
        case 'boardColorHex':
            addStyles(`cg-board {
                background-color: ${value} !important;
            }`, 'boardColorHexCss');

            console.log('[Setting Handler] Set board bg color to', value || 'nothing');

            break;
        case 'backgroundTextureClass':
            acasInstanceContainer.className = value;

            console.log('[Setting Handler] Set background texture to', value || 'nothing');

            break;
        case 'ttsVoiceEnabled':
            if(valueExists) {
                ttsNameDropdownElem.classList.remove('disabled-input');
                ttsSpeedRangeElem.classList.remove('disabled-input');
            } else {
                ttsNameDropdownElem.classList.add('disabled-input');
                ttsSpeedRangeElem.classList.add('disabled-input');
            }
            break;
        case 'chessEngine':
            if(value === 'lc0') {
                chessVariantDropdown.classList.add('hidden');
                engineEloInput.classList.add('hidden');
                
                engineNodesInput.classList.remove('hidden');
                lc0WeightDropdown.classList.remove('hidden');
            } else {
                chessVariantDropdown.classList.remove('hidden');
                engineEloInput.classList.remove('hidden');

                engineNodesInput.classList.add('hidden');
                lc0WeightDropdown.classList.add('hidden');
            }
            break;
        case 'chessEngineProfile':
            settingFilterObj.profileID = value;

            if(value !== 'default') {
                deleteProfileBtn.style.visibility = 'revert';
            } else {
                deleteProfileBtn.style.visibility = 'hidden';
            }

            if(lastProfileID !== value) {
                lastProfileID = value;

                updateSettingsValues();
            }

            break;
    }
}

function updateSettingsValues() {
    [...document.querySelectorAll('input[data-key]')].forEach(inputElem => {
        const key = inputElem.dataset.key;
        const noProfile = inputElem.dataset.noProfile;

        const value = getGmConfigValue(key, settingFilterObj.instanceID, noProfile ? false : settingFilterObj.profileID);

        if(typeof value === 'boolean' || value) {
            setInputValue(inputElem, value);

            makeSettingChanges(inputElem);
        } else {
            activateInputDefaultValue(inputElem);

            saveSetting(inputElem);
        }
    });
}

function saveSetting(settingElem) {
    const elemValue = getInputValue(settingElem);

    const settingObj = { 'key': settingElem.dataset.key, 'value': convertToCorrectType(elemValue) };

    const configDatabaseKey = USERSCRIPT.dbValues.AcasConfig;
    const config = USERSCRIPT.GM_getValue(configDatabaseKey);

    const noProfile = settingElem.dataset.noProfile;

    if (settingFilterObj.instanceID) {
        let base = config[settingFilterObj.type];
        
        // Initialize the instanceID object
        initNestedObject(base, [settingFilterObj.instanceID]);
    
        if (noProfile) {
            config[settingFilterObj.type][settingFilterObj.instanceID][settingObj.key] = settingObj.value;
        } else {
            // Initialize profiles and profileID objects
            initNestedObject(base[settingFilterObj.instanceID], ['profiles', settingFilterObj.profileID]);
    
            config[settingFilterObj.type][settingFilterObj.instanceID]['profiles'][settingFilterObj.profileID][settingObj.key] = settingObj.value;
        }
    } else {
        let base = config[settingFilterObj.type];
        
        if (noProfile) {
            // Initialize the type object
            initNestedObject(config, [settingFilterObj.type]);
    
            config[settingFilterObj.type][settingObj.key] = settingObj.value;
        } else {
            // Initialize profiles and profileID objects
            initNestedObject(base, ['profiles', settingFilterObj.profileID]);
    
            config[settingFilterObj.type]['profiles'][settingFilterObj.profileID][settingObj.key] = settingObj.value;
        }
    }

    USERSCRIPT.GM_setValue(configDatabaseKey, config);
    
    makeSettingChanges(settingElem);

    guiBroadcastChannel.postMessage({ 'type': 'settingSave', 'data' : { 'key': settingObj.key, 'value': settingObj.value, 'profile': getProfile(settingFilterObj.profileID) }});
    
    console.log(`[Setting Handler] Added config key ${settingObj.key} with value ${settingObj.value}\n-> Instance ${settingFilterObj.instanceID ? settingFilterObj.instanceID : '(No instance)'}, Profile ${noProfile ? '(No profile)' : settingFilterObj.profileID}`);
}

function removeSetting(settingElem) {
    const elemValue  = getInputValue(settingElem);

    const settingObj = { 'key': settingElem.dataset.key, 'value': convertToCorrectType(elemValue) };

    const configDatabaseKey = USERSCRIPT.dbValues.AcasConfig;
    const config = USERSCRIPT.GM_getValue(configDatabaseKey);

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

    USERSCRIPT.GM_setValue(configDatabaseKey, config);

    makeSettingChanges(settingElem);

    console.log(`[Setting Handler] Removed config key "${settingObj.key}" with value "${settingObj.value}"`);
}

function importSettings() {
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
                    USERSCRIPT.GM_setValue(USERSCRIPT.dbValues.AcasConfig, jsonData);

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
        
        else {
            const msg = transObj?.configInvalidFiletype ?? `Wrong file type loaded, the config needs to be a .json file!`;
            toast.error(msg, 30000);
        }
    };
    
    input.click();
}

function exportSettings() {
    const config = USERSCRIPT.GM_getValue(USERSCRIPT.dbValues.AcasConfig);

    delete config.instance;

    const configFile = new Blob([JSON.stringify(config)], {
        type: 'application/json'
    });
    
    saveAs(configFile, 'config.json');
}

async function resetSettings() {
    const warningText = transObj?.settingsResetWarning ?? 'Are you sure you want to reset settings?\n\nDANGER: This action is irreversable and will reset your whole config!';

    if(confirm(warningText)) {
        const config = USERSCRIPT.GM_getValue(USERSCRIPT.dbValues.AcasConfig);

        config.global = {};
        config.instance = {};

        USERSCRIPT.GM_setValue(USERSCRIPT.dbValues.AcasConfig, config);

        toggleSelected(settingsNavbarGlobalElem);

        location.reload();
    }
}

function toggleSelected(selectedElem, instanceID) {
    settingFilterObj.type = selectedElem.dataset.type;
    settingFilterObj.instanceID = null;

    switch(settingFilterObj.type) {
        case 'global':
            settingsNavbarSubtitleElem.innerText = 'Settings affect every instance';
            break;
        case 'instance':
            settingFilterObj.instanceID = instanceID;
            settingsNavbarSubtitleElem.innerText = `Settings only affect instance "${settingFilterObj.instanceID}"`;
            
            break;
    }

    options.forEach(elem => {
        if(elem == selectedElem) 
            elem.classList.add('selected');
        else 
            elem.classList.remove('selected');
    });

    updateSettingsValues();
}

function doesDropdownItemExist(dropdownInputElem, itemValue) {
    return dropdownInputElem.parentElement.querySelector(`*[data-value="${itemValue}"`) ? true : false;
}

function addDropdownItem(dropdownElem, itemValue, itemText) {
    const listContainerElem = dropdownElem.querySelector('.dropdown-list-container');

    const itemElem = document.createElement('div');
        itemElem.classList.add('dropdown-item');
        itemElem.dataset.value = itemValue;
        itemElem.innerText = itemText ? itemText : itemValue;

    listContainerElem.appendChild(itemElem);

    return itemElem;
}

function removeDropdownItem(dropdownElem, itemValue, newValue) {
    const dropdownItem = dropdownElem.querySelector(`*[data-value="${itemValue}"]`);
    const dropdownInput = dropdownElem.querySelector('input[data-default-value]');

    dropdownInput.value = newValue || dropdownInput.dataset.defaultValue;

    dropdownItem?.remove();

    dropdownInput.dispatchEvent(new Event('change'));
}

function initializeDropdown(dropdownElem) {
    const inputElem = dropdownElem.querySelector('input');
    const iconElem = dropdownElem.querySelector('.dropdown-icon');
    const listContainerElem = dropdownElem.querySelector('.dropdown-list-container');

    function updateDropdown(showAll) {
        const listItems = [...listContainerElem.querySelectorAll('.dropdown-item')]
            .filter(x => x?.dataset?.value);

        const optionsArr = listItems.map(elem => elem.dataset.value);

        const filterStr = inputElem.value.toLowerCase();
        const filteredOptions = optionsArr.filter(option => !option || option.toLowerCase().startsWith(filterStr));

        const options = showAll ? optionsArr : filteredOptions;

        listItems.forEach(elem => {
            if(options.includes(elem.dataset.value)) {
                elem.classList.remove('hidden');
            } else {
                elem.classList.add('hidden');
            }
        });

        listItems
            .filter(elem => !elem.getAttribute('onclick-set'))
            .forEach(elem => {
                elem.addEventListener('click', e => {
                    inputElem.value = e.target.dataset.value;

                    setTimeout(() => {
                        inputElem.dispatchEvent(new Event('change'));

                        updateDropdown();
                    }, 100);
                });

                elem.setAttribute('onclick-set', true);
            });
    }

    inputElem.addEventListener('input', () => updateDropdown(false));
    iconElem.addEventListener('click', () => updateDropdown(true));

    updateDropdown(true);

    new MutationObserver(() => updateDropdown(true))
        .observe(listContainerElem, { childList: true, subtree: true });
}

function initGUI() {
    importSettingsBtn.onclick = importSettings;
    exportSettingsBtn.onclick = exportSettings;
    resetSettingsBtn.onclick = resetSettings;

    [...document.querySelectorAll('input[data-key]')]
        .forEach(elem => {
            let [min, max] = [null, null];

            const defaultVal = convertToCorrectType(elem.dataset.defaultValue);
            const isRange = elem.dataset?.between;

            if(defaultVal) {
                activateInputDefaultValue(elem);
                
                if(!elem.placeholder)
                    elem.placeholder = elem.dataset.defaultValue;
            }

            if(isRange) {
                [min, max] = elem.dataset.between.split('-').map(x => convertToCorrectType(x));

                elem.onkeypress = event => allowOnlyNumbers(event);

                elem.style.width = `${(String(max).length + 0.3) * 10}px`;
            }

            elem.oninput = e => makeSettingChanges(e.target);

            elem.onchange = e => {
                if(isRange) {
                    e.target.value = Math.max(min, Math.min(max, e.target.value)) || min;
                }

                if(e.target.value || e.target.checked) {
                    saveSetting(elem);

                    if(e?.target?.dataset?.key === 'displayMovesOnExternalSite') {
                        const msg = transObj?.refreshSiteNotification ?? 'Refresh the external site to see changes!';
                        toast.create('message', '👁‍🗨', msg, 2000);
                    }
                } else {
                    removeSetting(elem);
                }
            }
        });

    settingsNavbarGlobalElem.onclick = () => toggleSelected(settingsNavbarGlobalElem);

    fillProfileDropdown();

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

        const isUserOnNotExistingInstanceTab = settingFilterObj?.instanceID && !document.querySelector(`.acas-instance[data-instance-id="${settingFilterObj?.instanceID}"]`);
        
        if(isUserOnNotExistingInstanceTab) {
            toggleSelected(settingsNavbarGlobalElem);
        }
    }).observe(acasInstanceContainer, { childList: true, subtree: true });
    
    new MutationObserver(() => {
        const navbarInstanceContentElems = [...settingsInstanceDropdownElem.querySelector('.dropdown-content').children];
        
        navbarInstanceContentElems.forEach(elem => {
            if(!elem.dataset?.activated) {
                elem.onclick = () => toggleSelected(settingsInstanceDropdownElem, elem.dataset.instanceId);
    
                elem.dataset.activated = true;
            }
        });
    }).observe(settingsNavbarElem, { childList: true, subtree: true });
    
    updateSettingsValues();

    const dropdownInputElems = [...document.querySelectorAll('.dropdown-input')];

    dropdownInputElems.forEach(elem => initializeDropdown(elem));
}