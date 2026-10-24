import { acasInstanceContainer, settingsNavbarGlobalElem, importSettingsBtn, exportSettingsBtn, resetSettingsBtn,
    noInstancesSitesElem, seeSupportedSitesBtn, ttsNameDropdownElem, userscriptInfoElem, updateYourUserscriptElem,
    decreaseInstanceSizeBtn, increaseInstanceSizeBtn, addNewProfileBtn, beggingFloaty, profileListContainerElem } from './gui/elementDeclarations.js';
import { importSettings, exportSettings, resetSettings } from './gui/settings.js';
import { initializeDropdowns, addDropdownItem } from './gui/domDropdown.js';
import { monitorInstances, monitorInstanceTabs, toggleSelectedNavbarItem } from './gui/instances.js';
import { initializeInputElems, setInputValue, getInputValue } from './gui/domInputs.js';
import { incrementUserUsageStat, updateUserUsageStats } from './gui/stats.js';
import { fillProfileTabs, createNewProfile } from './gui/profiles.js';
import { pipData, startPictureInPicture } from './gui/pip.js';
import { initializeDynamicSettings } from './gui/dynamicSettings.js';
import { initializeActivityLog } from './gui/activityLog.js';
import { initializeCustomBackground, setCustomBackgroundBlur, updateCustomBackgroundControls } from './gui/customBackground.js';
import { waitForBackgroundImages } from './gui/backgroundReady.js';
import { initializeBackgroundGrain } from './gui/backgroundGrain.js';
import { initializeStarfield } from './gui/starfield.js';
import { initializeAppearanceTranslations } from './gui/appearanceTranslations.js';
import { initializePolyglotBookLoader } from './gui/openingBook.js';
import { migrateHintSettings } from './misc/learningHints.js';
import { initializeHintPieceFilters } from './gui/hintPieceFilters.js';

export const guiBroadcastChannel = new BroadcastChannel(GUI_BROADCAST_NAME);
let initialized = false;

function setupSettingsContainerHoverRecovery() {
    const settingsContainer = document.querySelector('#acas-settings-container');
    if(!settingsContainer) return;

    const setActive = (active) => settingsContainer.classList.toggle('is-active', active);

    settingsContainer.addEventListener('pointerenter', () => setActive(true));
    settingsContainer.addEventListener('pointerleave', () => setActive(false));
    settingsContainer.addEventListener('pointerdown', () => setActive(true));

    document.addEventListener('pointerdown', event => {
        if(!settingsContainer.contains(event.target)) setActive(false);
    });
}

function setupSettingsHeaderBackground() {
    const settingsHeader = document.querySelector('#settings-header');
    if(!settingsHeader) return;

    const updateHeight = () => document.body.style.setProperty(
        '--settings-header-height', `${settingsHeader.offsetHeight}px`
    );

    updateHeight();
    new ResizeObserver(updateHeight).observe(settingsHeader);
}

function initializeWebhookTemplateEditor() {
    const textarea = document.querySelector('.webhook-message-template');
    const highlight = document.querySelector('.webhook-template-highlight');
    if(!textarea || !highlight) return;

    const translatePlaceholder = () => {
        textarea.placeholder = TRANS_OBJ?.activityLog?.discordMessagePlaceholder ?? 'Write your Discord message here...';
    };
    document.addEventListener('acas-translations-updated', translatePlaceholder);
    translatePlaceholder();

    const escapeHtml = value => value.replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));

    const updateHighlight = () => {
        const escaped = escapeHtml(textarea.value);
        highlight.innerHTML = escaped.replace(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g,
            variable => `<span class="webhook-variable">${variable}</span>`
        ) + '\n';
        highlight.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
    };

    textarea.addEventListener('input', updateHighlight);
    textarea.addEventListener('scroll', updateHighlight);
    textarea.addEventListener('acas-value-set', updateHighlight);
    updateHighlight();
}

export function setThemeColorHex(value) {
    document.body.style['background-color'] = value || null;
    document.body.style.setProperty('--background-texture-base', value || '#5f8895');
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
    
    const MIN_MODIFIER = 0.3;

    const newBoardSizeModifier = Math.max(
        MIN_MODIFIER,
        boardSizeModifier + change
    );

    localStorage.setItem(BOARD_SIZE_MODIFIER_KEY, newBoardSizeModifier);

    const instanceElems = [...document.querySelectorAll('.acas-instance')];

    instanceElems.forEach(elem => {
        elem.style.width = `${instanceSize * newBoardSizeModifier}px`;
    });
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
        if(!ttsVoices?.length) return;

        ttsVoices.forEach(x => addDropdownItem(ttsNameDropdownElem, x));

        clearInterval(waitForTTSVoices);
    }, 100);
}

function initializeFloatyButtons() {
    const activityLogDialog = document.getElementById('log-floaty');
    if(activityLogDialog && activityLogDialog.parentElement !== document.body) {
        document.body.appendChild(activityLogDialog);
    }
    const floatyDialogs = [...document.querySelectorAll('.floaty-wrapper > dialog')];
    if(activityLogDialog) floatyDialogs.push(activityLogDialog);
    floatyDialogs.forEach(floatyDialog => {
        // Explicit dialog links keep working when launchers move out of the wrapper.
        const btn = document.querySelector(`.open-floaty-btn[aria-controls~="${CSS.escape(floatyDialog.id)}"]`)
            || (floatyDialog.id === 'log-floaty'
            ? document.querySelector('.activity-log-launcher .open-floaty-btn')
            : floatyDialog.parentElement.querySelector('.open-floaty-btn'));
        const closeBtn = floatyDialog.querySelector('.floaty-close-btn');
        const activityLogOpenKey = 'acas.activity-log.open';
        const isDesktopActivityLog = dialog => dialog.id === 'log-floaty'
            && window.matchMedia('(min-width: 768px) and (any-pointer: fine)').matches;

        function rememberActivityLogOpenState(isOpen) {
            if(floatyDialog.id !== 'log-floaty') return;
            try {
                localStorage.setItem(activityLogOpenKey, String(isOpen));
            } catch(error) {
                console.error('Activity log open state could not be saved.', error);
            }
        }

        function updatePageScrollLock() {
            const hasModalDialog = [...document.querySelectorAll('dialog[open]')]
                .some(dialog => !isDesktopActivityLog(dialog));
            document.body.style.overflow = hasModalDialog ? 'hidden' : '';
        }

        function open() {
            if(isDesktopActivityLog(floatyDialog)) {
                rememberActivityLogOpenState(true);
                floatyDialog.show();
                return;
            }
            floatyDialog.showModal();
            document.body.style.overflow = 'hidden';
        }

        function close() {
            floatyDialog.close();
            if(floatyDialog.id === 'log-floaty') rememberActivityLogOpenState(false);
            updatePageScrollLock();
        }

        // The graph editor now opens through setting shortcuts, without a launcher.
        if(btn) btn.onclick = () => (floatyDialog.open ? close() : open());
        if(closeBtn) closeBtn.onclick = () => close();
        if(floatyDialog.id === 'log-floaty') {
            floatyDialog.addEventListener('close', () => rememberActivityLogOpenState(false));
        }

        floatyDialog.onclick = (e) => {
            const selection = window.getSelection().toString();
            if(floatyDialog.id === 'log-floaty') {
                return;
            }
            if(!selection && e.target === floatyDialog) close();
        };

        const observer = new MutationObserver(() => {
            if(!floatyDialog.open || isDesktopActivityLog(floatyDialog)) {
                // A setting shortcut can stack the graph above another modal.
                updatePageScrollLock();
            }
        });
        observer.observe(floatyDialog, { attributes: true, attributeFilter: ['open'] });

        if(isDesktopActivityLog(floatyDialog)) {
            try {
                if(localStorage.getItem(activityLogOpenKey) === 'true') open();
            } catch(error) {
                console.error('Activity log open state could not be restored.', error);
            }
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
    
        if(GM_info?.script?.version && IS_BELOW_VERSION(GM_info?.script?.version, USERSCRIPT_MIN_VERSION)) {
            updateYourUserscriptElem.classList.remove('hidden');
            toast.warning(TRANS_OBJ?.oldUserscriptWarning ?? 'You are using an outdated or incompatible version of A.C.A.S. Please update the userscript.', 10000);
        }
        
        userscriptInfoElem.innerText = ['System Information', platformData, userscriptManagerData, userscriptData, Date.now()].join(' | ');
    } else {
        userscriptInfoElem?.remove();
    }
}

async function initializeBackgroundAppearance() {
    // Restore these before revealing the page, not in the later profile/settings loop.
    const keys = ['themeColorHex', 'backgroundTextureClass', 'customBackgroundBlur'];
    const inputs = keys.map(key => document.querySelector(`input[data-key="${key}"]`));
    const values = await Promise.all(keys.map(key => GET_GM_CFG_BASE_VALUE(key, false, false)));

    inputs.forEach((input, index) => {
        if(input) setInputValue(input, values[index] ?? input.dataset.defaultValue);
    });

    if(inputs[0]) setThemeColorHex(getInputValue(inputs[0]));
    if(inputs[1]) {
        const texture = getInputValue(inputs[1]);
        acasInstanceContainer.className = texture;
        updateCustomBackgroundControls(texture);
    }
    if(inputs[2]) setCustomBackgroundBlur(getInputValue(inputs[2]));
}

function updateSabRequiringElems() {
    if(window?.SharedArrayBuffer)
        [...document.querySelectorAll('.requires-sab')].forEach(x => x.classList.remove('requires-sab'));
}

export async function initGUI() {
    if(initialized) return;

    const config = await USERSCRIPT.getValue(USERSCRIPT_SHARED_VARS.gmConfigKey);
    if(migrateHintSettings(config)) await USERSCRIPT.setValue(USERSCRIPT_SHARED_VARS.gmConfigKey, config);

    initializeBackgroundGrain();
    initializeStarfield();
    setupSettingsContainerHoverRecovery();
    setupSettingsHeaderBackground();

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
    profileListContainerElem.addEventListener('wheel', (e) => {
        if(Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.preventDefault();
            profileListContainerElem.scrollLeft += e.deltaY;
        }
    });

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
    initializeHintPieceFilters();
    initializeActivityLog();
    initializeDynamicSettings();
    initializeInputElems();
    initializeAppearanceTranslations();
    const customBackgroundReady = initializeCustomBackground();
    await initializeBackgroundAppearance();
    initializeWebhookTemplateEditor();
    initializePolyglotBookLoader();
    initializeDropdowns();

    monitorInstances();
    monitorInstanceTabs();

    fillProfileTabs();
    fillTextToSpeechVoices();

    updateSabRequiringElems();
    updateUserUsageStats();
    updateUserscriptInfoText();

    CREATE_INPUT_LISTENER(
        'instanceRestart',
        await GET_GM_CFG_VALUE('instanceRestartTriggerCode'),
        FORCE_CLOSE_ALL_INSTANCES
    );

    CREATE_INPUT_LISTENER(
        'concealAssistance',
        await GET_GM_CFG_VALUE('concealAssistanceTriggerCode'),
        TOGGLE_CONCEAL_ASSISTANCE
    );

    if(acasInstanceContainer.classList.contains('custom-image-texture')) await customBackgroundReady;
    await waitForBackgroundImages(acasInstanceContainer, document.querySelector('#setting-container'));

    initialized = true;
}