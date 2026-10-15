function collectBackgroundUrls(element, urls, pseudo = null) {
    if(!element) return;

    const style = getComputedStyle(element, pseudo);
    if(style.display === 'none' || (pseudo && (style.content === 'none' || style.content === 'normal'))) return;

    // Computed styles resolve CSS variables and stylesheet-relative image paths.
    const pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g;
    for(const match of style.backgroundImage.matchAll(pattern)) {
        const url = (match[1] ?? match[2] ?? match[3]).trim();
        if(url) urls.add(url);
    }
}

function loadBackgroundImage(url) {
    return new Promise(resolve => {
        const image = new Image();
        image.onload = async () => {
            try {
                if(typeof image.decode === 'function') await image.decode();
            } catch(error) {
                // A loaded image may still be usable if explicit decoding fails.
                console.warn('Could not decode background image:', url, error);
            }
            resolve();
        };
        image.onerror = () => {
            // A missing/corrupt background must not keep the loading screen open.
            console.warn('Could not load background image:', url);
            resolve();
        };
        image.src = url;
    });
}

export async function waitForBackgroundImages(container, settingsContainer) {
    const urls = new Set();
    const elements = [container, settingsContainer];
    if(container?.classList.contains('custom-image-texture')) {
        elements.push(container.querySelector('.custom-background-layer'));
    }

    for(const element of elements) {
        collectBackgroundUrls(element, urls);
        collectBackgroundUrls(element, urls, '::before');
        collectBackgroundUrls(element, urls, '::after');
    }

    await Promise.all([...urls].map(loadBackgroundImage));

    // Let the real CSS layers paint behind the veil before starting its fade.
    // Background tabs have no visible frame to prepare and may pause animation frames.
    if(document.visibilityState === 'visible') {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
}