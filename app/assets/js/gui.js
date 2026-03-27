import { acasInstanceContainer, settingsNavbarGlobalElem, importSettingsBtn, exportSettingsBtn, resetSettingsBtn,
    noInstancesSitesElem, seeSupportedSitesBtn, ttsNameDropdownElem, userscriptInfoElem, updateYourUserscriptElem,
    decreaseInstanceSizeBtn, increaseInstanceSizeBtn, addNewProfileBtn, floatyButtons, beggingFloaty } from './gui/elementDeclarations.js';
import { importSettings, exportSettings, resetSettings } from './gui/settings.js';
import { initializeDropdowns, addDropdownItem } from './gui/domDropdown.js';
import { monitorInstances, monitorInstanceTabs, toggleSelectedNavbarItem } from './gui/instances.js';
import { initializeInputElems } from './gui/domInputs.js';
import { incrementUserUsageStat, updateUserUsageStats } from './gui/stats.js';
import { fillProfileTabs, createNewProfile } from './gui/profiles.js';
import { pipData, startPictureInPicture } from './gui/pip.js';

export const guiBroadcastChannel = new BroadcastChannel(GUI_BROADCAST_NAME);
let initialized = false;

export function setThemeColorHex(value) {
    document.body.style['background-color'] = value || null;
    document.querySelectorAll('dialog').forEach(diag => {
        diag.style['background-color'] = value || null;
    });
    acasInstanceContainer.style['background-color'] = value || null;
    pipData[THEME_COLOR_STORAGE_KEY] = value;
    localStorage.setItem(THEME_COLOR_STORAGE_KEY, value);
}

export function highlightSettingElem(targetElem, cb) {
    if(!targetElem) return;

    const subtleElems = ['#settings-header', '#settings-panels', '#setting-container']
        .map(x => document.querySelector(x))
        .filter(x => x);

    const targetInput = targetElem.querySelector('input');

    if(targetInput?.dataset?.renderSetting) {
        const renderDialog = document.querySelector('.floaty-wrapper > #rendering-floaty');

        if(renderDialog) renderDialog.showModal();
    }

    if(targetInput?.dataset?.engineSetting) {
        const engineDialog = document.querySelector('.floaty-wrapper > #engine-floaty');

        if(engineDialog) engineDialog.showModal();
    }

    targetElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    targetElem.classList.add('setting-highlight');
    subtleElems.forEach(elem => elem.classList.add('setting-panel-highlight'));

    setTimeout(() => {
        targetElem.classList.remove('setting-highlight');
        subtleElems.forEach(elem => elem.classList.remove('setting-panel-highlight'));

        if(cb) cb();
    }, 5000);
}

function changeBoardSizeModifier(change) {
    const instanceSize = Number(localStorage.getItem(INSTANCE_SIZE_KEY));
    const boardSizeModifier = Number(localStorage.getItem(BOARD_SIZE_MODIFIER_KEY));
    const newBoardSizeModifier = boardSizeModifier + change;

    localStorage.setItem(BOARD_SIZE_MODIFIER_KEY, newBoardSizeModifier);

    const instanceElems = [...document.querySelectorAll('.acas-instance')];

    instanceElems.forEach(elem => elem.style.width = `${instanceSize * newBoardSizeModifier}px`);
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

function fillTextToSpeechVoices() {
    const waitForTTSVoices = setInterval(() => {
        const ttsVoices = GET_TTS_VOICES();
        if(ttsVoices?.length === 0) return;

        ttsVoices.forEach(x => addDropdownItem(ttsNameDropdownElem, x));

        clearInterval(waitForTTSVoices);
    }, 100);
}

function initializeFloatyButtons() {
    [...floatyButtons].forEach(btn => {
        const floatyDialog = btn?.parentElement?.querySelector('dialog');

        if(floatyDialog) {
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
                const selection = window.getSelection().toString();
                
                if(!selection) {
                    if (e.target === floatyDialog) close();
                }
            };

            const observer = new MutationObserver(() => {
                if(!floatyDialog.open) document.body.style.overflow = '';
            });
        
            observer.observe(floatyDialog, { attributes: true, attributeFilter: ['open'] });
        } else {
            console.error('No floaty dialog found for floaty button!');
        }
    });
}

async function updateUserscriptInfoText() {
    const GM_info = typeof USERSCRIPT?.getInfo === 'function'
        ? await USERSCRIPT?.getInfo()
        : USERSCRIPT?.GM_info;

    if(userscriptInfoElem && typeof USERSCRIPT === 'object' && GM_info) {
        const platform = GM_info?.platform || GM_info?.userAgentData || { 'platform': 'Unknown' };
    
        const platformData = OBJECT_TO_STRING(platform);
        const userscriptManagerData = [GM_info?.scriptHandler, GM_info?.version]?.join(' ');
        const userscriptData = [GM_info?.script?.author, GM_info?.script?.version]?.join(' ');
    
        document.title = `A.C.A.S (Using ${userscriptData})`;
    
        if(GM_info?.script?.version && IS_BELOW_VERSION(GM_info?.script?.version, '2.4.1')) {
            updateYourUserscriptElem.classList.remove('hidden');
        }
        
        userscriptInfoElem.innerText = ['System Information', platformData, userscriptManagerData, userscriptData, Date.now()].join(' | ');
    } else {
        userscriptInfoElem?.remove();
    }
}

function updateSabRequiringElems() {
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
    }
}

export async function initGUI() {
    if(initialized) return;

    const storedThemeColor = localStorage.getItem(THEME_COLOR_STORAGE_KEY);
    const defaultInstanceSize = 500;

    if(storedThemeColor) setThemeColorHex(storedThemeColor);
    if(!localStorage.getItem(BOARD_SIZE_MODIFIER_KEY)) localStorage.setItem(BOARD_SIZE_MODIFIER_KEY, 1);
    if(!localStorage.getItem(INSTANCE_SIZE_KEY)) localStorage.setItem(INSTANCE_SIZE_KEY, defaultInstanceSize);

    setInterval(() => incrementUserUsageStat(MINUTES_USED_STORAGE_KEY, 1), 60000);

    importSettingsBtn.onclick = importSettings;
    exportSettingsBtn.onclick = exportSettings;
    resetSettingsBtn.onclick = resetSettings;

    settingsNavbarGlobalElem.onclick = () => toggleSelectedNavbarItem(settingsNavbarGlobalElem);
    decreaseInstanceSizeBtn.onclick = () => { changeBoardSizeModifier(-0.1); }
    increaseInstanceSizeBtn.onclick = () => { changeBoardSizeModifier(0.1); }
    seeSupportedSitesBtn.onclick = () => { noInstancesSitesElem.classList.toggle('hidden'); }
    addNewProfileBtn.onclick = () => { createNewProfile(); }
    beggingFloaty.onclick = e => {
        if(e.target === beggingFloaty) beggingFloaty.close();
    };

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

    initializeFloatyButtons();
    initializeInputElems();
    initializeDropdowns();

    monitorInstances();
    monitorInstanceTabs();

    fillProfileTabs();
    fillTextToSpeechVoices();

    updateSabRequiringElems();
    updateUserUsageStats();
    updateUserscriptInfoText();

    CREATE_INPUT_LISTENER(
        await GET_GM_CFG_VALUE('instanceRestartTriggerCode'),
        FORCE_CLOSE_ALL_INSTANCES
    );

    initialized = true;
}