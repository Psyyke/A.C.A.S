function waitForActivation(registration, scriptURL) {
    if(registration.active?.state === 'activated' && registration.active.scriptURL === scriptURL) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const worker = registration.installing || registration.waiting || registration.active;
        if(!worker) { reject(new Error('The isolation worker could not start. Reload to try again.')); return; }
        const finish = error => {
            clearTimeout(timer);
            worker.removeEventListener('statechange', changed);
            error ? reject(error) : resolve();
        };
        const changed = () => {
            if(worker.state === 'activated') finish();
            else if(worker.state === 'redundant') finish(new Error('The isolation worker could not install. Reload to try again.'));
        };
        const timer = setTimeout(() => finish(new Error('The isolation worker took too long to activate. Allow service workers and reload.')), 15000);
        worker.addEventListener('statechange', changed);
        changed();
    });
}

function waitForControl(serviceWorker, scriptURL) {
    const ownsPage = () => serviceWorker.controller?.scriptURL === scriptURL;
    if(ownsPage()) return Promise.resolve(true);
    return new Promise(resolve => {
        const finish = () => {
            clearTimeout(timer);
            serviceWorker.removeEventListener('controllerchange', changed);
            resolve(ownsPage());
        };
        const changed = () => { if(ownsPage()) finish(); };
        const timer = setTimeout(finish, 2000);
        serviceWorker.addEventListener('controllerchange', changed);
        changed();
    });
}

export async function prepareIsolation() {
    const usable = () => globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer !== 'undefined';
    const url = new URL('./coi-serviceworker.js', import.meta.url);
    const key = `maia-isolation:${url.href}`;
    if(usable() && navigator.serviceWorker?.controller?.scriptURL === url.href) {
        try { sessionStorage.removeItem(key); } catch { /* No reload is needed. */ }
        return true;
    }
    if(!isSecureContext || !navigator.serviceWorker)
        throw new Error('Use HTTPS or localhost and allow service workers in your browser.');
    let registration;
    try { registration = await navigator.serviceWorker.register(url, { updateViaCache: 'none' }); }
    catch { throw new Error('The browser blocked the isolation worker. Allow service workers and site data, then reload.'); }
    await waitForActivation(registration, url.href);
    // Activation can finish before clients.claim assigns this tab a controller.
    const controlled = await waitForControl(navigator.serviceWorker, url.href);
    if(usable() && controlled) {
        try { sessionStorage.removeItem(key); } catch { /* No reload is needed. */ }
        return true;
    }
    let previous;
    try { previous = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { /* Ignore the old unbounded retry marker. */ }
    if(previous?.attempts >= 1 && Date.now() - previous.time < 60000) {
        throw new Error(controlled
            ? 'The page is controlled but isolation headers are missing. Close other tabs for this site and reload. Your host must allow browser isolation.'
            : 'The isolation worker could not take control. This sometimes happens. A simple refresh usually fixes it. If it persists, allow service workers and site data, then close this tab and reopen it.');
    }
    try { sessionStorage.setItem(key, JSON.stringify({ attempts: 1, time: Date.now() })); }
    catch { throw new Error('Allow session storage for this site, then reload to enable browser isolation.'); }
    // Even a claimed tab needs a new document response with isolation headers.
    location.reload();
    return false;
}
