/* LegacyGM.js
 - Version: 1.0.3
 - Author: Haka
 - Description: A userscript library for adding support back to GM_ non async functions
 - GitHub: https://github.com/Psyyke/A.C.A.S/
*/

async function LOAD_LEGACY_GM_SUPPORT() {
    if(typeof GM !== 'object') return;

    const noLegacyInfo =      typeof GM_info === 'undefined'              && typeof GM?.info !== 'undefined',
          onlyModernSet =     typeof GM?.setValue === 'function'          && typeof GM_setValue === 'undefined',
          onlyModernGet =     typeof GM?.getValue === 'function'          && typeof GM_getValue === 'undefined',
          onlyModernList =    typeof GM?.listValues === 'function'        && typeof GM_listValues === 'undefined',
          deleteValueExists = typeof GM?.deleteValue === 'function',
          openInTabExists =   typeof GM?.openInTab === 'function';

    if(noLegacyInfo) globalThis.GM_info = GM.info;
    if(!onlyModernList && !onlyModernGet && !onlyModernSet) return;

    const gmCache = {};
    const gmFunctions = {
        GM_setValue: (key, value) => {
            GM.setValue(key, value);
            gmCache[key] = value;
        },
        GM_getValue: (key, defaultValue) => {
            return key in gmCache ? gmCache[key] : defaultValue;
        },
        GM_deleteValue: (key) => {
            GM.deleteValue(key);
            delete gmCache[key];
        },
        GM_listValues: () => {
            return Object.keys(gmCache);
        },
        GM_openInTab: (url, options = false) => {
            if(openInTabExists)
                return GM.openInTab(url, options);

            return window.open(url, '_blank');
        },
    };

    setInterval(async () => {
        const keys = await GM.listValues();

        // Load existing
        for(const key of keys) {
            gmCache[key] = await GM.getValue(key);
        }

        // Remove old
        for(const key in gmCache) {
            if(!keys.includes(key)) {
                delete gmCache[key];
            }
        }
    }, 1);


    // Define legacy functions
    for(const [name, func] of Object.entries(gmFunctions)) {
        if(typeof globalThis[name] === 'undefined') {
            Object.defineProperty(globalThis, name, {
                value: func,
                writable: false,
                configurable: false,
                enumerable: false,
            });
        }
    }
}