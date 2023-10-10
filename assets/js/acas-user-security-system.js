// DETECT EXCESSIVE TAB SWITCHING
(() => {
    const tabSwitchThreshold = 4;
    const tabSwitchTimeout = 10000;

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

                    toast.warning("Warning: Excessive tab switching detected. Continued switching may result in a ban."
                    + "\n\nTo avoid needing to switch between tabs, do one of the following,\n- Make two separate windows side by side\n- Display moves on the page (this is easily detectable)", 25000);
                }

                lastSwitchTime = currentTime;
            }
        }

        document.addEventListener("visibilitychange", handleVisibilityChange, false);
    }
})();

// DETECT CONSISTANT AND TOO FAST MOVE TIMES
(() => {

});