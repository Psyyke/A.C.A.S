import { createInstance } from './instanceManager.js';
import { installNotificationElem, autoMoveCheckbox, hiddenSettingPanel, tosCheckboxElem,
    tosContinueBtnElem, tosContainerElem, settingsControlPanelElem, seeSupportedSitesBtn } from './gui/elementDeclarations.js';
import { highlightSettingElem, initGUI } from './gui.js';
import { initializeActivityLogging } from './misc/activityLog.js';
import { startEloEyeSessions } from './eloeyeSessions.js';
import { loopThroughAndUpdateSettingsValues } from './gui/settings.js';
import { isUpstreamLc0 } from './instance/lc0Engines.js';

initializeActivityLogging();

let started = false;

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
            USERSCRIPT.setValue(TOS_ACCEPTED_DB_KEY, true);
            
            setTimeout(() => location.search = '?t=' + Date.now(), 250);
        }
    }

    tosContainerElem.classList.remove('hidden');
}

async function initDbValue(name, value) {
    const dbValue = await USERSCRIPT.getValue(name);

    if(dbValue === undefined) {
        USERSCRIPT.setValue(name, value);
    }

    return true;
}

async function initializeDatabase() {
    const gmConfigKey = USERSCRIPT_SHARED_VARS.gmConfigKey;
    const tempValueIndicator = USERSCRIPT_SHARED_VARS.tempValueIndicator;

    // add AcasConfig value if it doesn't exist already
    await initDbValue(gmConfigKey, { 'global': { 'chessEngineProfile': 'default' } });

    await MIGRATE_OUTDATED_PROFILE_KEYS(); // migrates old profile keys to new format if necessary

    // Older userscripts stored the board state as temp values, it now travels inside CommLink packets
    const legacyTempValueKeys = (await USERSCRIPT.listValues() || []).filter(key => key.includes(tempValueIndicator));

    legacyTempValueKeys.forEach(key => USERSCRIPT.deleteValue(key));
}

const instanceLastSeen = new Map();
const guiStartTime = Date.now();

// Per instance setting overrides (config.instance) are kept while the instance's tab lives.
// Background tabs can be throttled for minutes, so an instance only counts as gone after 10 minutes without keep-alives.
async function removeStaleInstanceConfigs() {
    const gmConfigKey = USERSCRIPT_SHARED_VARS.gmConfigKey;
    const config = await USERSCRIPT.getValue(gmConfigKey);
    const maxIdleMs = 10 * 6e4;

    const staleIDs = Object.keys(config?.instance || {})
        .filter(id => Date.now() - (instanceLastSeen.get(id) ?? guiStartTime) > maxIdleMs);

    if(!staleIDs.length) return;

    staleIDs.forEach(id => delete config.instance[id]);

    USERSCRIPT.setValue(gmConfigKey, config);
}

async function processUrlParams() {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    const highlight = urlParams.get('hl');
    const settingToHighlight = urlParams.get('shl');

    if(highlight) {
        switch(highlight) {
            case 'controlPanel':
                highlightSettingElem(settingsControlPanelElem,
                    REMOVE_PARAM_FROM_URL('hl'));
                break;
            case 'supportedSites':
                highlightSettingElem(seeSupportedSitesBtn,
                    REMOVE_PARAM_FROM_URL('hl'));
                break;
        }
    } else if(settingToHighlight) {
        try {
            await WAIT_UNTIL_VAR(() => SETTING_FILTER_OBJ.profileID, 10000);
            await loopThroughAndUpdateSettingsValues();
        } catch(error) {
            console.error('Could not load settings for the setting link:', error);
            toast.error(TRANS_OBJ?.weightsLinkError ?? 'Could not open this setting. Reload and try again.', 8000);
            return;
        }

        const foundSettingElem = [...document.querySelectorAll('input[data-key], textarea[data-key]')]
            .find(elem => elem.dataset.key === settingToHighlight);

        const settingContainer = foundSettingElem?.closest('.custom-input');

        if(foundSettingElem && settingContainer) {
            const engine = document.querySelector('input[data-key="chessEngine"]')?.value;
            const external = document.querySelector('input[data-key="useExternalChessEngine"]')?.checked;
            const maia3Inactive = settingToHighlight === 'maia3Model' && (engine !== 'maia3' || external);
            const lc0Inactive = settingToHighlight === 'modernLc0Weight' && (!isUpstreamLc0(engine) || external);

            if(maia3Inactive) {
                toast.message(TRANS_OBJ?.weightsEnableMaia3 ?? 'Select Maia 3, then open the link again.', 8000);
            } else if(lc0Inactive) {
                toast.message(TRANS_OBJ?.weightsEnableLc0 ?? 'Select Lc0, not Legacy Lc0, then open the link again.', 8000);
            } else {
                try {
                    await WAIT_UNTIL_VAR(() => !settingContainer.closest('.hidden'), 10000);
                    highlightSettingElem(settingContainer, () => REMOVE_PARAM_FROM_URL('shl'));
                } catch(error) {
                    console.error('Linked setting did not become visible:', settingToHighlight, error);
                    toast.error(TRANS_OBJ?.weightsLinkError ?? 'Could not open this setting. Reload and try again.', 8000);
                }
            }
        }
    }

    if(urlParams.get('hidden') === 'true')
        hiddenSettingPanel.classList.remove('hidden');
    else if(autoMoveCheckbox?.checked)
        autoMoveCheckbox.click();
}

function startCommLink() {
    const MainCommLink = new CommLinkHandler('mum', {
        'singlePacketResponseWaitTime': 1500,
        'maxSendAttempts': 3,
        'statusCheckInterval': 1,
        'silentMode': true,
        'functions': {
            'getValue': USERSCRIPT.getValue,
            'setValue': USERSCRIPT.setValue,
            'deleteValue': USERSCRIPT.deleteValue,
            'listValues': USERSCRIPT.listValues,
            'addValueChangeListener': USERSCRIPT.addValueChangeListener,
        }
    });

    setInterval(() => removeStaleInstanceConfigs().catch(() => {}), 6e4);

    MainCommLink.registerListener('mum', packet => {
        try {
            switch(packet.command) {
                case 'ping':
                    return `pong (took ${Date.now() - packet.date}ms)`;
                case 'createInstance':
                    const data = packet.data;

                    // The userscript stamps each keep-alive; the delay until it arrives is the connection latency.
                    const latencyMs = Date.now() - packet.date;
                    const knownInstance = window.AcasInstances.find(x => x.id === data.instanceID);
                    if(knownInstance && Number.isFinite(latencyMs)) knownInstance.instance.latencyMs = Math.max(0, latencyMs);
                    // Identity can be detected later without a board change, keep-alives carry it
                    if(knownInstance && data.playerColor) knownInstance.instance.boardState.playerColor = data.playerColor;
                    instanceLastSeen.set(String(data.instanceID), Date.now());

                    createInstance(data.domain, data.instanceID, data.chessVariant);
    
                    return true;
            }
        } catch(e) {
            console.error(e);
            return null;
        }
    });
}

async function attemptStarting() {
    if(started)
        return;

    window.ACAS_LOADING?.setStage(20);
    const isUserscriptActive = window.isUserscriptActive;
    const isTosAccepted = isUserscriptActive
        ? await USERSCRIPT.getValue(TOS_ACCEPTED_DB_KEY)
        : false;

    if(isUserscriptActive) {
        started = true;

        displayNoUserscriptNotification(true);
    }
        
    if(!isUserscriptActive) {
        displayNoUserscriptNotification();
        window.ACAS_LOADING?.setStage(70);
        window.ACAS_LOADING?.markReady('startup');

    } else if(!isTosAccepted) {
        displayNoUserscriptNotification(true); // failsafe
        started = true; // failsafe

        displayTOS();
        window.ACAS_LOADING?.setStage(70);
        window.ACAS_LOADING?.markReady('startup');

    } else {
        displayNoUserscriptNotification(true); // failsafe
        started = true; // failsafe

        try {
            window.ACAS_LOADING?.setStage(45);
            await initializeDatabase();
        } catch(e) {
            // If migration fails, don't leave the app half-initialized: clear the
            // started flag so the polling loop retries instead of giving up.
            console.error('Database initialization failed, will retry:', e);
            started = false;

            return;
        }

        window.ACAS_LOADING?.setStage(75);
        await initGUI();
        processUrlParams();
        startCommLink();
        startEloEyeSessions();

        window.ACAS_LOADING?.setStage(95);
        window.ACAS_LOADING?.markReady('startup');
        console.log('Userscript ready! Listening to instance calls...');
    }
}

await attemptStarting();

const userscriptSearchInterval = SET_INTERVAL_ASYNC(async () => {
    if(!started) await attemptStarting();
    else userscriptSearchInterval.stop();
}, 250);