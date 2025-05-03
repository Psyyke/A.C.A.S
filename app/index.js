let started = false;

async function attemptStarting() {
    if(started)
        return;

    const isUserscriptActive = window.isUserscriptActive;
    const isTosAccepted = isUserscriptActive
        ? await USERSCRIPT.getValue('isTosAccepted')
        : false;

    if(isUserscriptActive) {
        started = true;

        displayNoUserscriptNotification(true);
    }
        
    if(!isUserscriptActive) {
        displayNoUserscriptNotification();

    } else if(!isTosAccepted) {
        displayNoUserscriptNotification(true); // failsafe
        started = true; // failsafe

        displayTOS();

    } else {
        displayNoUserscriptNotification(true); // failsafe
        started = true; // failsafe

        initializeDatabase();
        initGUI();

        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);
        const highlight = urlParams.get('hl');
        const settingToHighlight = urlParams.get('shl');

        if(highlight) {
            switch(highlight) {
                case 'controlPanel':
                    highlightSetting(document.querySelector('#settings-control-panel'), 
                        removeParamFromUrl('hl'));
                    break;
                case 'supportedSites':
                    highlightSetting(document.querySelector('#see-supported-sites-btn'), 
                        removeParamFromUrl('hl'));
                    break;
            }
            
        } else if(settingToHighlight) {
            const foundSettingElem = [...document.querySelectorAll('input[data-key]')]
                .find(elem => elem.dataset.key === settingToHighlight);

            const settingContainer = foundSettingElem?.closest('.custom-input');

            if(foundSettingElem && settingContainer) {
                highlightSetting(settingContainer, removeParamFromUrl('shl'));
            }
        }

        log.info('Userscript ready! Listening to instance calls...');

        const autoMoveCheckbox = document.querySelector('input[data-key="autoMove"]');
        const hiddenSettingPanel = document.querySelector('#hidden-setting-panel');

        if(urlParams.get('hidden') === 'true')
            hiddenSettingPanel.classList.remove('hidden');

        else if(autoMoveCheckbox?.checked)
            autoMoveCheckbox.click();

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
            }
        });
    
        MainCommLink.registerListener('mum', packet => {
            try {
                switch(packet.command) {
                    case 'ping':
                        return `pong (took ${Date.now() - packet.date}ms)`;
                    case 'createInstance':
                        log.info('Received request to create another engine instance!');
    
                        const data = packet.data;
    
                        createInstance(data.domain, data.instanceID, data.chessVariant);
        
                        return true;
                }
            } catch(e) {
                console.error(e);
                return null;
            }
        });
    }

    async function initDbValue(name, value) {
        const dbValue = await USERSCRIPT.getValue(name);

        if(dbValue == undefined) {
            USERSCRIPT.setValue(name, value);
        }

        return true;
    }

    async function initializeDatabase() {
        const gmConfigKey = GLOBAL_VARIABLES.gmConfigKey;
        const tempValueIndicator = GLOBAL_VARIABLES.tempValueIndicator;

        // add AcasConfig value if it doesn't exist already
        await initDbValue(gmConfigKey, { 'global': {} });

        const gmStorageKeys = await USERSCRIPT.listValues();
        const tempValueKeys = gmStorageKeys.filter(key => key.includes(tempValueIndicator));
        const config = await USERSCRIPT.getValue(gmConfigKey);
        
        const configInstances = config?.instance;
        
        // removes instance config values from instance IDs that aren't active anymore
        if(configInstances) {
            const configInstanceKeys = Object.keys(configInstances);

            configInstanceKeys.forEach(instanceIdKey => {
                const isConfigInstanceRelevant = tempValueKeys.find(key => key.includes(instanceIdKey))
                    ? true : false;

                if(!isConfigInstanceRelevant) {
                    delete config.instance[instanceIdKey];

                    USERSCRIPT.setValue(gmConfigKey, config);
                }
            });
        }
        
        const expiredKeys = await Promise.all(
            tempValueKeys.map(async key => {
                const configValue = await USERSCRIPT.getValue(key);
                const isExpired = Date.now() - configValue.date > 6e4 * 60;
                return isExpired ? key : null;
            })
        );
        
        // removes temp values with no usage for over 60 minutes
        expiredKeys
            .filter(key => key !== null)
            .forEach(key => USERSCRIPT.deleteValue(key));
    }
}

(async () => {
    await attemptStarting();

    const userscriptSearchInterval = setIntervalAsync(async () => {
        if(!started)
            await attemptStarting();
        else
            userscriptSearchInterval.stop();
    }, 1);
})();