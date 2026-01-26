// userscript-bridge.js
// Communication bridge between the A.C.A.S GUI and the userscript.
// Part of the modular ES6 codebase in assets/js/modules/.
// Used for cross-tab messaging and instance variable management.

// Userscript bridge utilities for A.C.A.S

/**
 * Send a message to the userscript and await a response.
 * @param {string} type
 * @param {Array} [args=[]]
 * @returns {Promise<any>}
 */
export function messageUserscript(type, args = []) {
    return new Promise((resolve, reject) => {
        const messageId = getUniqueID();
        let timeoutId;
        const listener = (event) => {
            if(event.data.messageId === messageId && event.data.sender !== 'GUI') {
                clearTimeout(timeoutId);
                window.removeEventListener('message', listener);
                resolve(event.data.value);
            }
        };
        window.addEventListener('message', listener);
        timeoutId = setTimeout(() => {
            window.removeEventListener('message', listener);
            console.error(type, args);
            reject(new Error('Response timed out after 500ms'));
        }, 500);
        window.postMessage({
            sender: 'GUI',
            type,
            messageId,
            args
        }, '*');
    });
}

/**
 * Create a getter/setter for an instance variable via userscript messaging.
 * @param {string} key
 * @returns {Object}
 */
export function createInstanceVar(key) {
    const iVarsMessageType = 'USERSCRIPT_instanceVars';
    return {
        set: (instanceId, newValue) => {
            return messageUserscript(iVarsMessageType, [instanceId, key, newValue]);
        },
        get: async (instanceId) => {
            return messageUserscript(iVarsMessageType, [instanceId, key]);
        }
    };
}
