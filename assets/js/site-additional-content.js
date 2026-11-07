// Resolved from the script's own location so it works from any page depth.
const lottieJsonUrl = document.currentScript?.src
    ? new URL('../json/lottie.json', document.currentScript.src).href
    : '../assets/json/lottie.json';

function insertGas(elem) {
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

function initMobileNav() {
    const button = document.querySelector(".nav-burger");
    const panel = document.querySelector("#mobile-nav");

    if (!button || !panel) return;

    const setOpen = open => {
        button.setAttribute("aria-expanded", String(open));
        panel.classList.toggle("is-open", open);
    };

    button.addEventListener("click", () => setOpen(!panel.classList.contains("is-open")));
    panel.addEventListener("click", e => { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && panel.classList.contains("is-open")) {
            setOpen(false);
            button.focus();
        }
    });
}

initMobileNav();

function initStickyHeader() {
    const header = document.querySelector("main > header");
    if (!header) return;

    let ticking = false;
    const update = () => {
        ticking = false;
        const scrolled = (window.scrollY || document.documentElement.scrollTop) > 0;
        header.classList.toggle("is-stuck", scrolled && header.getBoundingClientRect().top <= 0);
    };

    window.addEventListener("scroll", () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(update);
        }
    }, { passive: true });
    update();
}

initStickyHeader();

function initLottieAndGas() {
    const lottieElement = document.querySelector("#lottie-animation");

    if (lottieElement && !lottieElement.dataset.lottieLoaded) {
        lottie.loadAnimation({
            container: lottieElement,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: lottieJsonUrl
        });
        lottieElement.dataset.lottieLoaded = "true"; // Prevent duplicate loading
    }

    [...document.querySelectorAll('.gas')]
        .filter(x => !x.dataset.processed)
        .forEach(insertGas);
}

initLottieAndGas();

const observer = new MutationObserver((mutations, obs) => {
    initLottieAndGas();
});

observer.observe(document.body, { childList: true, subtree: true });

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