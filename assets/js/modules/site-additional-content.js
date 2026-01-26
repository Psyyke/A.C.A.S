// site-additional-content.js
// Handles Lottie animations, ad insertion, and dynamic content for A.C.A.S.
// Part of the modular ES6 codebase in assets/js/modules/.
// Used by the GUI for enhanced visuals and monetization.

// Site additional content utilities for A.C.A.S

/**
 * Insert a Google AdSense ad into the given element.
 * @param {HTMLElement} elem
 */
export function insertGas(elem) {
    const text = elem?.dataset?.t;
    const rect = elem?.dataset?.r;
    elem.dataset.processed = true;
    const pubId = "ca-pub-7248123202489335";
    if(text) {
        elem.innerHTML = `<ins class="adsbygoogle"
        style="display:block"
        data-ad-format="fluid"
        data-ad-layout-key="-gw-3+1f-3d+2z"
        data-ad-client="${pubId}"
        data-ad-slot="1668980906"></ins>`;
    } else if(rect) {
        elem.innerHTML = `<ins class="adsbygoogle"
        style="display:inline-block;width:320px;height:100px"
        data-ad-client="${pubId}"
        data-ad-slot="9586999372"></ins>`;
    } else {
        elem.innerHTML = `<ins class="adsbygoogle"
        style="display:block; text-align:center;"
        data-ad-layout="in-article"
        data-ad-format="fluid"
        data-ad-client="${pubId}"
        data-ad-slot="4819810311"></ins>`;
    }
    (adsbygoogle = window.adsbygoogle || []).push({});
}

/**
 * Initialize Lottie animation and Google Ads on the page.
 */
export function initLottieAndGas() {
    const lottieElement = document.querySelector("#lottie-animation");
    if (lottieElement && !lottieElement.dataset.lottieLoaded) {
        lottie.loadAnimation({
            container: lottieElement,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: '../assets/json/lottie.json'
        });
        lottieElement.dataset.lottieLoaded = "true";
    }
    [...document.querySelectorAll('.gas')]
        .filter(x => !x.dataset.processed)
        .forEach(insertGas);
}

/**
 * Observe changes in the document and initialize additional content when needed.
 */
export function observeAdditionalContent() {
    const observer = new MutationObserver((mutations, obs) => {
        initLottieAndGas();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
