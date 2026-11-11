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

const contributionShare = document.querySelector('.contribution-share');
contributionShare?.addEventListener('click', async () => {
    const status = document.querySelector('#share-status');
    const url = 'https://psyyke.github.io/A.C.A.S/';
    status.hidden = true;
    try {
        if (navigator.share) {
            await navigator.share({ title: 'A.C.A.S', url });
        } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            status.textContent = 'Link copied!';
            status.hidden = false;
        } else {
            status.textContent = `Copy this link to share: ${url}`;
            status.hidden = false;
        }
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Could not share A.C.A.S:', error);
        status.textContent = `Could not share: ${error.message}. Copy this link instead: ${url}`;
        status.hidden = false;
    }
});

function initPageHeadings() {
    const headings = [...document.querySelectorAll('#main h1')].filter(heading =>
        heading.lastElementChild?.matches('svg, i, .page-heading-icon')
    );
    for (const heading of headings) {
        heading.classList.add('page-heading');
        const icon = heading.lastElementChild;
        for (const node of [...heading.childNodes]) {
            if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) node.remove();
        }
        if (heading.childNodes.length !== 2 || heading.firstChild.nodeType === Node.TEXT_NODE) {
            const label = document.createElement('span');
            while (heading.firstChild !== icon) label.append(heading.firstChild);
            heading.prepend(label);
        }
        const label = heading.firstElementChild;
        const update = () => {
            label.style.whiteSpace = 'nowrap';
            const textWidth = label.scrollWidth;
            label.style.removeProperty('white-space');
            const style = getComputedStyle(heading);
            const available = heading.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            heading.classList.toggle('icon-first', textWidth + icon.getBoundingClientRect().width + parseFloat(style.columnGap) > available);
        };
        new ResizeObserver(update).observe(heading);
        document.fonts.ready.then(update);
        update();
    }
}

initPageHeadings();

async function initIntroTagline() {
    const tagline = document.querySelector('.large-intro-tagline');
    if (!tagline) return;
    try {
        const fonts = await document.fonts.load('48px "Whisper"', tagline.textContent);
        if (!fonts.length) throw new Error('Whisper font is unavailable');
        tagline.classList.add('font-ready');
    } catch (error) {
        console.error('Intro tagline font failed to load:', error);
    }
}

initIntroTagline();

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