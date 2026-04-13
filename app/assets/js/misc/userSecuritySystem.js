// DETECT EXCESSIVE TAB SWITCHING
(() => {
    const tabSwitchThreshold = 2;
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

                    const msg = TRANS_OBJ?.excessiveTabChangeWarning;
                    toast.warning(msg, 25000);
                }

                lastSwitchTime = currentTime;
            }
        }

        document.addEventListener("visibilitychange", handleVisibilityChange, false);
    }
})();

// SECURE LINKS
(() => {
    function secureLink(a) {
        if(!a || a.tagName !== 'A') return;

        a.setAttribute('rel', 'noopener noreferrer');
        a.setAttribute('referrerpolicy', 'no-referrer');
    }

    function secureAllLinks(root = document) {
        const links = root.querySelectorAll('a[href]');
        links.forEach(secureLink);
    }

    secureAllLinks();

    const observer = new MutationObserver((mutations) => {
        for(const mutation of mutations) {
            mutation.addedNodes.forEach((node) => {
                if(node.nodeType !== 1) return;
                if(node.tagName === 'A') secureLink(node);
                if(node.querySelectorAll) secureAllLinks(node);
            });
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();