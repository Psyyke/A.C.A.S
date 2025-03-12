let started = false;

function attemptStarting() {
    if(started)
        return;

    if(typeof USERSCRIPT === 'object') {
        started = true;

        displayNoUserscriptNotification(true);
    }
        
    if(typeof USERSCRIPT === 'undefined') {
        displayNoUserscriptNotification();

    } else if(!USERSCRIPT.GM_getValue('isTosAccepted')) {
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

            log.info('Userscript ready! Listening to instance calls...');

            const autoMoveCheckbox = document.querySelector('input[data-key="autoMove"]');
            const hiddenSettingPanel = document.querySelector('#hidden-setting-panel');

            if(urlParams.get('hidden') === 'true')
                hiddenSettingPanel.classList.remove('hidden');

            else if(autoMoveCheckbox?.checked)
                autoMoveCheckbox.click();

            const MainCommLink = new USERSCRIPT.CommLinkHandler('mum', {
                'singlePacketResponseWaitTime': 1500,
                'maxSendAttempts': 3,
                'statusCheckInterval': 1,
                'silentMode': true
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

    function initDbValue(name, value) {
        if(USERSCRIPT.GM_getValue(name) == undefined) {
            USERSCRIPT.GM_setValue(name, value);
        }
    }

    function initializeDatabase() {
        // add AcasConfig value if it doesn't exist already
        initDbValue(USERSCRIPT.dbValues.AcasConfig, { 'global': {} });

        const tempValueKeys = USERSCRIPT.GM_listValues().filter(key => key.includes(USERSCRIPT.tempValueIndicator));
        const configInstances = USERSCRIPT.GM_getValue(USERSCRIPT.dbValues.AcasConfig)?.instance;
        
        // removes instance config values from instance IDs that aren't active anymore
        if(configInstances) {
            const configInstanceKeys = Object.keys(configInstances);

            configInstanceKeys.forEach(instanceIdKey => {
                const isConfigInstanceRelevant = tempValueKeys.find(key => key.includes(instanceIdKey))
                    ? true : false;

                if(!isConfigInstanceRelevant) {
                    const config = USERSCRIPT.GM_getValue(USERSCRIPT.dbValues.AcasConfig);

                    delete config.instance[instanceIdKey];

                    USERSCRIPT.GM_setValue(USERSCRIPT.dbValues.AcasConfig, config);
                }
            });
        }
        
        // removes temp values with no usage for over 60 minutes
        tempValueKeys
            .filter(key => Date.now() - USERSCRIPT.GM_getValue(key).date > 6e4 * 60)
            .forEach(key => USERSCRIPT.GM_deleteValue(key));
    }
}

attemptStarting();

const userscriptSearchInterval = setInterval(() => {
    if(!started)
        attemptStarting();
    else
        clearInterval(userscriptSearchInterval);
}, 1);