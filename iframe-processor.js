// Current status: Not working, in development

(function() {
    'use strict';

    console.log("[Iframe Interceptor] Running...");

    function startObserver() {
        // Create a MutationObserver to watch for new iframes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.tagName === "IFRAME" && node.src) {
                        interceptIframe(node);
                    }
                });
            });
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function interceptIframe(iframe) {
        console.log("[Iframe Interceptor] Detected iframe:", iframe.src);

        // Store the original source and prevent it from loading automatically
        const iframeSrc = iframe.src;
        iframe.src = "about:blank";

        fetch(iframeSrc, { mode: 'no-cors' })
            .then(response => {
                console.error(response.text());
                return response.text();
            })
            .then(html => {
                console.log("[Iframe Interceptor] Injecting intercepted content");
                iframe.srcdoc = html;
            })
            .catch(error => {
                console.error("[Iframe Interceptor] Error fetching iframe content:", error);
            });
    }

    // Detect when document.body is available
    if (document.body) {
        startObserver();
    } else {
        const observer = new MutationObserver(() => {
            if (document.body) {
                observer.disconnect(); // Stop observing once body is found
                startObserver();
            }
        });

        observer.observe(document.documentElement, { childList: true });
    }
})();
