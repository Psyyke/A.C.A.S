// user-security.js
// Security and anti-abuse logic for A.C.A.S.
// Part of the modular ES6 codebase in assets/js/modules/.
// Used to detect tab switching and suspicious behavior.

// User security utilities for A.C.A.S

/**
 * Set up detection for excessive tab switching and trigger a warning callback.
 * @param {Object} options
 * @param {number} [options.tabSwitchThreshold=2]
 * @param {number} [options.tabSwitchTimeout=10000]
 * @param {Function} options.warningCallback
 */
export function setupTabSwitchDetection({ tabSwitchThreshold = 2, tabSwitchTimeout = 10000, warningCallback }) {
    let tabSwitchCount = 0;
    let lastSwitchTime = Date.now();
    if(typeof document.hidden !== "undefined") {
        function handleVisibilityChange() {
            if(document.hidden) {
                const currentTime = Date.now();
                const timeElapsed = currentTime - lastSwitchTime;
                if (timeElapsed >= tabSwitchTimeout) {
                    tabSwitchCount = 0;
                }
                tabSwitchCount++;
                if (tabSwitchCount >= tabSwitchThreshold) {
                    tabSwitchCount = 0;
                    if (typeof warningCallback === 'function') warningCallback();
                }
                lastSwitchTime = currentTime;
            }
        }
        document.addEventListener("visibilitychange", handleVisibilityChange, false);
    }
}
