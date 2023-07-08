if(typeof USERSCRIPT == 'undefined') {
    displayNoUserscriptNotification();

} else if(!USERSCRIPT.GM_getValue('isTosAccepted')) {
    displayTOS();

    remindUserToReadTOS();

    //`Press ${(navigator.userAgent.toLowerCase().indexOf('mac') !== -1 ? 'Cmd' : 'Ctrl')}+D to bookmark this page.`,
} else {
    log.info('Userscript ready! Listening to instance calls...');

    initializeDatabase();
    initGUI();

    const MainCommLink = new USERSCRIPT.CommLinkHandler('mum', {
        'singlePacketResponseWaitTime': 1500,
        'maxSendAttempts': 3,
        'statusCheckInterval': 1
    });

    MainCommLink.registerListener('mum', packet => {
        try {
            switch(packet.command) {
                case 'ping':
                    return `pong (took ${Date.now() - packet.date}ms)`;
                case 'createInstance':
                    log.info('Received request to create another engine instance!');
    
                    const data = packet.data;

                    console.log(data);
    
                    createInstance(data.domain, data.instanceID, data.chessVariant);
    
                    return true;
            }
        } catch(e) {
            console.error(e);
            return null;
        }
    });
}

function remindUserToReadTOS() {
    let didUserReadTOS = false;
    let userTriedToProceedWithoutReading = false;

    const tosCheckbox = document.querySelector('#tos-checkbox');
        tosCheckbox.oninput = () => {
            if(!didUserReadTOS && tosCheckbox.checked) {
                userTriedToProceedWithoutReading = true;

                toast.create('warning', '🤨', 'Are you sure you read the TOS?', 2500);
                
                setTimeout(() => {
                    toast.create('warning', '🙄', `Say goodbye to all your belongings and life savings I guess...`, 6000);
                },2750);
            }
        };
    const tosLink = document.querySelector('.tos-link');
        tosLink.onclick = () => {
            didUserReadTOS = true;

            if(userTriedToProceedWithoutReading) {
                toast.create('success', '😎', `Just kidding of course, well done and a warm welcome!`, 1e7);
            }
        };
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