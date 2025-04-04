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

const floatyButtons = document.querySelectorAll('.open-floaty-btn');

const userComputerStatsText = document.querySelector('#user-computer-stats');

if (userComputerStatsText) {
    const deviceMemory = (navigator.deviceMemory * 1024) || '❔';
    const hardwareConcurrency = navigator.hardwareConcurrency || '❔';

    userComputerStatsText.innerText = `You might have max ${deviceMemory} MB of memory & ${hardwareConcurrency} threads (cores).`;
}

[...floatyButtons].forEach(btn => {
    const floatyDialog = btn?.parentElement?.querySelector('dialog');

    if (floatyDialog) {
        const closeBtn = floatyDialog.querySelector('.floaty-close-btn');
    
        function open() {
            floatyDialog.showModal();
            document.body.style.overflow = 'hidden'; // stop background scrolling
        }
    
        function close() {
            floatyDialog.close();
            document.body.style.overflow = ''; // restore scrolling
        }
    
        btn.onclick = () => (floatyDialog.open ? close() : open());
        closeBtn.onclick = () => close();
    
        floatyDialog.onclick = (e) => {
            if (e.target === floatyDialog) close();
        };
    
        // Automatically detect when dialog closes
        const observer = new MutationObserver(() => {
            if (!floatyDialog.open) {
                document.body.style.overflow = '';
            }
        });
    
        observer.observe(floatyDialog, { attributes: true, attributeFilter: ['open'] });
    } else {
        console.error('No floaty dialog found for floaty button!');
    }
});

if(window?.SharedArrayBuffer) {
    [...document.querySelectorAll('.requires-sab')].forEach(x => x.classList.remove('requires-sab'));
} else {
    if('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            registrations.forEach((registration) => {
                registration.unregister();
            });
        });
    }

    ['advancedEloThreads', 'advancedEloHash']
        .forEach(x => {
            const input = document.querySelector(`input[data-key="${x}"]`);
            const parent = input?.parentElement;

            if(parent) parent.style.display = 'none';
        });
}

const pipData = {};

let pipCanvas = null;
let lastProfileID = null;

if(userscriptInfoElem && typeof USERSCRIPT === 'object' && USERSCRIPT?.GM_info) {
    const GM_info = USERSCRIPT?.GM_info;
    const platform = GM_info?.platform || GM_info?.userAgentData || { 'platform': 'Unknown' };

    const platformData = objectToString(platform);
    const userscriptManagerData = [GM_info?.scriptHandler, GM_info?.version]?.join(' ');
    const userscriptData = [GM_info?.script?.author, GM_info?.script?.version]?.join(' ');

    document.title = `A.C.A.S (Using ${userscriptData})`;

    if(GM_info?.script?.version && isBelowVersion(GM_info?.script?.version, '2.2.8')) {
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

let lastPipEval = null;
let firstTimeOpeningPip = true;

function updatePiP(data) {
    const isForceUpdate = data === 1;

    if(!data && !isForceUpdate)
        return;

    for (const key in data) {
        if(data.hasOwnProperty(key)) {
            const isValueNew = pipData[key] !== data[key];

            if(isValueNew || isForceUpdate)
                pipData[key] = data[key];
            else
                return;
        }
    }

    if(!pipCanvas)
        return;

    const ctx = pipCanvas.getContext('2d');
    const headerHeight = 133;
    const evalBarWidth = 100;
    const statusBarHeight = 5;
    const headerWidth = pipCanvas.width - evalBarWidth;

    const noInstancesText = fullTransObj?.domTranslations?.['#no-instances-title'];

    let progress = 0;

    if(pipData.goalDepth) {
        progress = pipData.depth / pipData.goalDepth;
    } else if(pipData?.goalNodes) {
        progress = pipData?.nodes / pipData?.goalNodes;
    } else {
        progress = calculateTimeProgress(pipData.startTime, pipData.movetime);
    }

    const playerColor = pipData.playerColor,
          bestMove = pipData?.moveObjects?.[0],
          from = bestMove?.player?.[0],
          to = bestMove?.player?.[1],
          winChance = pipData?.winChance,
          drawChance = pipData?.drawChance,
          lossChance = pipData?.lossChance;

    let eval = pipData.eval;

    if(!eval && lastPipEval === null) 
        eval = 0.5;
    else if(eval)
        lastPipEval = eval;

    // Clear the canvas
    ctx.clearRect(0, 0, pipCanvas.width, pipCanvas.height);

    // Add background color
    ctx.fillStyle = pipData.themeColorHex;
    ctx.fillRect(0, 0, headerWidth, pipCanvas.height);

    // Add header background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, headerWidth, headerHeight - statusBarHeight);

    // Add header main title
    ctx.fillStyle = 'white';
    ctx.font = '800 70px Mona Sans';
    ctx.fillText('A.C.A.S', 30, 90);

    // Set regular text style
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '500 70px IBM Plex Sans';

    if(pipData.moveProgressText) {
        ctx.fillText(pipData.moveProgressText, 40, headerHeight + 90);
    } else if(noInstancesText) {
        ctx.fillText(noInstancesText, 40, headerHeight + 100);
    }

    if(pipData.calculationTimeElapsed) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '500 50px Mona Sans';
        ctx.fillText(`(${pipData.calculationTimeElapsed}ms, ${(progress * 100).toFixed(0)}%)`, 320, 80);
    }

    if(from && to) {
        ctx.fillStyle = 'white';
        ctx.font = '500 160px IBM Plex Sans';
        ctx.fillText(`${from.toUpperCase()} ➔ ${to.toUpperCase()}`, 40, headerHeight + 250);
    }

    if (winChance && drawChance && lossChance) {
        const chances = [
            { label: 'Win', percentage: Math.round(winChance / 10) },
            { label: 'Draw', percentage: Math.round(drawChance / 10) },
            { label: 'Loss', percentage: Math.round(lossChance / 10) }
        ];

        const highestChance = chances.reduce((max, chance) => chance.percentage > max.percentage ? chance : max);
    
        const pX = 40;
        const pY = headerHeight + 320;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.font = '400 50px IBM Plex Sans';

        ctx.fillText(`${highestChance.label} ${highestChance.percentage}%`, pX, pY);
    }    

    // Progress bar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(
        0,
        headerHeight,
        (pipCanvas.width - evalBarWidth) * progress,
        pipCanvas.height - headerHeight
    );

    if(playerColor == 'b') {
        // Eval bar #1
        ctx.fillStyle = 'rgba(50, 50, 50, 1)';
        ctx.fillRect(
            pipCanvas.width - evalBarWidth,
            0,
            evalBarWidth,
            pipCanvas.height
        );

        // Eval bar #2
        ctx.fillStyle = 'rgba(200, 200, 200, 1)';
        ctx.fillRect(
            pipCanvas.width - evalBarWidth,
            0,
            evalBarWidth,
            pipCanvas.height * eval
        );
    } else {
        // Eval bar #1
        ctx.fillStyle = 'rgba(200, 200, 200, 1)';
        ctx.fillRect(
            pipCanvas.width - evalBarWidth,
            0,
            evalBarWidth,
            pipCanvas.height
        );

        // Eval bar #2
        ctx.fillStyle = 'rgba(50, 50, 50, 1)';
        ctx.fillRect(
            pipCanvas.width - evalBarWidth,
            0,
            evalBarWidth,
            pipCanvas.height * (1 - eval)
        );
    }

    const centipawnEval = pipData?.centipawnEval / 100;

    if(!pipData?.mate && centipawnEval) {
        let yPosition;

        if(playerColor === 'w') {
            yPosition = centipawnEval < 0 ? 60 : pipCanvas.height - 30;
        } else {
            yPosition = centipawnEval > 0 ? 60 : pipCanvas.height - 30;
        }

        const evalText = Math.abs(centipawnEval).toFixed(1);
        
        // Eval bar text
        ctx.fillStyle = 'rgba(125, 125, 125, 1)';
        ctx.font = '500 45px IBM Plex Sans';
        ctx.fillText(evalText, headerWidth + [34, 27, 15, 2, 0, 0][evalText.length - 1], yPosition);
    }

    // Status bar
    ctx.fillStyle = ['rgba(40, 40, 40, 0.9)', 'rgba(0, 255, 0, 1)', 'rgba(255, 0, 0, 1)'][pipData.isWinning ?? 0];
    ctx.fillRect(0, headerHeight - statusBarHeight, headerWidth, statusBarHeight);
}

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
            
            setTimeout(() => location.search = '?t=' + Date.now(), 250);
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

            elem.querySelector('input').removeAttribute('disabled');
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
        const key = elem?.dataset?.key;
        const parentElem = elem?.parentElement;
        const isDropdown = key && parentElem && parentElem.classList.contains('dropdown-input-container');

        if(isDropdown) { // highlight dropdown selected item
            const selectedItemKey = 'selected-list-item';
            const dropdownElems = [...parentElem?.querySelectorAll('.dropdown-item')];

            dropdownElems.forEach(elem => {
                if(elem?.dataset?.value === val)
                    elem.classList.add(selectedItemKey);
                else
                    elem.classList.remove(selectedItemKey);
            });
        }

        elem.value = convertToCorrectType(val);
    }
}

function activateInputDefaultValue(elem) {
    setInputValue(elem, elem.dataset.defaultValue);
}

async function startPictureInPicture() {
    if(!document.pictureInPictureEnabled) {
        toast.error('Picture-in-Picture is not supported on your browser! Please use Chrome.');

        const pipSettingCheckbox = document.querySelector('input[data-key="pip"]');
        if(pipSettingCheckbox) pipSettingCheckbox?.click();

        return null;
    }

    const video = document.createElement('video');
          video.width = 100;
          video.height = 50;

    pipCanvas = document.createElement('canvas');
    pipCanvas.width = 1000;
    pipCanvas.height = 500;

    const stream = pipCanvas.captureStream();
    video.srcObject = stream;

    const attemptPlay = async () => {
        try {
            updatePiP(1);

            await video.play();
            await video.requestPictureInPicture();

            setInterval(() => {
                updatePiP(1);
            }, 1000);
        } catch (err) {
            if(err.name === 'NotAllowedError') {
                const handleUserInteraction = async () => {
                    document.removeEventListener('click', handleUserInteraction);
                    document.removeEventListener('keydown', handleUserInteraction);

                    await attemptPlay();
                };

                document.addEventListener('click', handleUserInteraction);
                document.addEventListener('keydown', handleUserInteraction);
            } else {
                console.error(err);
            }
        }
    };

    await attemptPlay();
}

const processedElems = [];

async function makeSettingChanges(inputElem) {
    const value = getInputValue(inputElem);
    const valueExists = typeof value === 'boolean' || value;
    const alreadyProcessed = processedElems.find(arr => {
        const elem = arr[0],
              val = arr[1];
            
        return elem === inputElem && val === value;
    });

    if(alreadyProcessed && inputElem.dataset.key === 'pip')
        return;

    switch(inputElem.dataset.key) {
        case 'themeColorHex':
            document.body.style['background-color'] = value || null;
            document.querySelectorAll('dialog').forEach(diag => {
                diag.style['background-color'] = value || null;
            });
            acasInstanceContainer.style['background-color'] = value || null;
            pipData['themeColorHex'] = value;

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
        case 'pip':
            if(value)
                startPictureInPicture();

            else if(document.pictureInPictureElement)
                await document.exitPictureInPicture();

            break;
        case 'enableAdvancedElo':
            const normalEloInput = document.querySelector('input[data-key="engineElo"]');

            if(!normalEloInput) return;

            if(value)
                normalEloInput.setAttribute('disabled', 'true');
            else
                normalEloInput.removeAttribute('disabled');

            break;
    }

    processedElems.push([inputElem, value]);
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

        const optionsArr = listItems.map(elem => elem.dataset.value?.toLowerCase() || "");
        
        // Not pretty code and could be simpler
        const filterStr = inputElem.value.toLowerCase().trim();
        const words = filterStr.split(/\s+/);
        const filteredOptions = optionsArr.filter(option => 
            words.every(word => {
                const lowerCaseWord = word.toLowerCase();
                return option.includes(lowerCaseWord); 
            })
        );
            
        const options = showAll ? optionsArr : filteredOptions;

        listItems.forEach(elem => {
            if(options.includes(elem.dataset.value?.toLowerCase()) 
            || options.includes(elem.dataset.value)) {
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

                    const selectedClass ='selected-list-item';
                    listItems.forEach(x => x.classList.remove(selectedClass));
                    elem.classList.add(selectedClass);

                    setTimeout(() => {
                        inputElem.dispatchEvent(new Event('change'));

                        updateDropdown(true);
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

                elem.style.width = `${(String(max).length + 0.45) * 10}px`;
            }

            elem.oninput = e => makeSettingChanges(e.target);

            elem.onchange = e => {
                if(isRange) {
                    e.target.value = Math.max(min, Math.min(max, e.target.value)) || min;
                }

                if(e.target.value || e.target.checked) {
                    saveSetting(elem);

                    if(
                        e?.target?.dataset?.key === 'displayMovesOnExternalSite' ||
                        e?.target?.dataset?.key === 'renderOnExternalSite'
                    ) {
                        const msg = transObj?.refreshSiteNotification ?? 'Refresh the external site to see changes!';
                        toast.create('message', '👁‍🗨', msg);
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