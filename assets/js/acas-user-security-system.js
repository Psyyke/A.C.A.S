// DETECT EXCESSIVE TAB SWITCHING
(() => {
    let tabSwitchCount = 0;
    const tabSwitchThreshold = 5;
    const tabSwitchTimeout = 10000;

    let lastSwitchTime = Date.now();

    if (typeof document.hidden !== "undefined") {
          const handleVisibilityChange = function () {
              if (document.hidden) {
                  const currentTime = Date.now();

                  const timeElapsed = currentTime - lastSwitchTime;

                  if (timeElapsed >= tabSwitchTimeout) {
                      tabSwitchCount = 0;
                  }

                  tabSwitchCount++;

                  if (tabSwitchCount >= tabSwitchThreshold) {
                      toast.warning("Warning: Excessive tab switching detected.\n\nSwitching tabs constantly flags you as suspicious. Continued switching may and will result in a ban."
                      + "\n\nPlease make two separate windows and set them up side by side, OR display moves on the page (however it is detectable).", 15000);
                  }

                  lastSwitchTime = currentTime;
              }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange, false);
    }
})();

// DETECT CONSISTANT AND TOO FAST MOVE TIMES
(() => {

});