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

        (async () => {
            initializeDatabase();
            initGUI();

            function ready() {
                log.info('Userscript ready! Listening to instance calls...');

                const autoMoveCheckbox = document.querySelector('input[data-key="autoMove"]');
            
                if(autoMoveCheckbox) {
                    if(autoMoveCheckbox?.checked) {
                        autoMoveCheckbox.click();
                    }
                }
            
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
            
            let response = await fetch('https://raw.githubusercontent.com/Psyyke/psyyke/refs/heads/main/json/safeword.json?' + new Date().getTime());
            let data = await response.json();
            let safeword = data?.word ?? 'banana';
        
            if(!document.cookie.includes(`${safeword}=true`) || Math.random() < 0.02) {
                const offerContainer = await waitForElement('.offer-container', 2500);
                const startTime = Date.now();
        
                if(offerContainer) {
                    offerContainer.style.display = 'flex';

                    function close() {
                        clearInterval(btnClickEventInitializerInterval);

                        document.cookie = `${safeword}=true; Max-Age=604800; path=/`;

                        location.href = location.href + '?=' + new Date().getTime();
                    }

                    function onClick() {
                        let lastVisibleTime = 0;

                        document.addEventListener("visibilitychange", () => {
                            if (document.hidden) {
                                lastVisibleTime = Date.now();
                            } else {
                                if (Date.now() - lastVisibleTime >= 3000) {
                                    close();
                                }
                            }
                        });

                        setTimeout(() => close(), 10000);
                    }

                    const btnClickEventInitializerInterval = setInterval(() => {
                        [...offerContainer.querySelectorAll('.action-btn'), ...offerContainer.querySelectorAll('.get-deal-btn')]
                            .filter(x => !x?.dataset?.onclickready)
                            .forEach(x => {
                                x.dataset.onclickready = true;
                                x.onclick = onClick;
                            });
                    }, 500);

                    const closeBtn = offerContainer.querySelector('.close-btn');

                    if(closeBtn) {
                        closeBtn.onclick = function() {
                            if(Date.now() - startTime > 6e4) {
                                offerContainer.style.display = 'none';

                                ready();
                            }
                        };

                        setInterval(() => {
                            if(Date.now() - startTime > 6e4) {
                                closeBtn.style.display = 'flex';
                            }
                        });
                    }
                }
        
                return;
            }

            ready();
        })();
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
}, 100);

(() => {
    fetch('https://raw.githubusercontent.com/Psyyke/psyyke/refs/heads/main/json/products.json?' + new Date().getTime())
        .then(response => response.json())
        .then(async data => {
            const productArr = data;
            const productContainer = await waitForElement('.product-container');

            if(productArr.length > 0) {
                const randomProduct = productArr[Math.floor(Math.random() * productArr.length)];
            
                const productItem = document.createElement('div');
                productItem.innerHTML = `
                    <div class="product">
                        <div class="title"><div class="name"></div><div>(<span class="price"></span> <span class="originalPrice"></span>)</div><div class="discount"></div></div>
                        <div class="container">
                            <div class="right">
                                <div class="description"></div>
                                <a href="" target="_blank" class="action-btn"><span data-translation-visit-product-btn>Visit</span></a>
                            </div>
                        </div>
                    </div>
                `;
            
                const titleElem = productItem.querySelector('.title .name');
                const originalPriceElem = productItem.querySelector('.title .originalPrice');
                const priceElem = productItem.querySelector('.title .price');
                const discountElem = productItem.querySelector('.title .discount');
                const actionBtn = productItem.querySelector('.action-btn');
                const descriptionElem = productItem.querySelector('.description');
            
                titleElem.innerText = randomProduct?.title; 
                originalPriceElem.innerText = `$${randomProduct?.originalPrice}`;
                priceElem.innerText = `$${randomProduct?.price}`;

                if(randomProduct?.discount > 5)
                    discountElem.innerText = `${randomProduct?.discount}% off`;

                actionBtn.href = randomProduct?.link;
                descriptionElem.innerText = `"${randomProduct?.description ?? `We didn't write a description for this product. It didn't need one, the product is amazing.`}"`;
            
                productContainer.appendChild(productItem);

                productContainer.style.display = 'block';
            }
        })
        .catch(error => console.log(error));
})();

(async () => {
    const backupLink = 'https://s.click.aliexpress.com/e/_oEaswTy?bz=300*250';

    try {
        const response = await fetch('https://raw.githubusercontent.com/Psyyke/psyyke/refs/heads/main/json/link.json?' + new Date().getTime());
        const data = await response.json();
        const dealLink = data.link;

        const dealLinkElem = await waitForElement('.get-deal-btn');
        dealLinkElem.href = dealLink ?? backupLink;
    } catch (error) {
        const dealLinkElem = await waitForElement('.get-deal-btn');
        dealLinkElem.href = backupLink;
    }
})();