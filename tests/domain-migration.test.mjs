import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { buildUserscript } from './elo-tool/userscriptHarness.mjs';

const redirectSource = await readFile(new URL('../assets/js/domain-redirect.js', import.meta.url), 'utf8');
const collectorSource = await readFile(new URL('../tools/doppelmaia/export-matches.html', import.meta.url), 'utf8');
const inlineRedirect = collectorSource.match(/<script data-domain-redirect>([\s\S]*?)<\/script>/)[1];

function redirect(source, address) {
    const location = new URL(address);
    let destination;
    location.replace = value => {
        assert.equal(destination, undefined, 'Redirect only once');
        destination = value;
    };
    runInNewContext(source, { location, URL });
    return destination;
}

test('legacy redirects preserve paths, queries and anchors while fixing the destination origin', () => {
    for(const source of [redirectSource, inlineRedirect]) {
        for(const [path, expected] of [
            ['/A.C.A.S', '/'],
            ['/A.C.A.S/', '/'],
            ['/A.C.A.S/app/?fen=a%2Fb&mode=fast#settings', '/app/?fen=a%2Fb&mode=fast#settings'],
            ['/A.C.A.S/tools/doppelmaia/research.html?x=%23#section', '/tools/doppelmaia/research.html?x=%23#section'],
            ['/A.C.A.S/missing/%E2%99%9F%20file.html#%23', '/missing/%E2%99%9F%20file.html#%23'],
            ['/A.C.A.S//evil.example/path?next=https://evil.example/#anchor', '//evil.example/path?next=https://evil.example/#anchor']
        ]) {
            for(const protocol of ['http:', 'https:']) {
                const address = `${protocol}//psyyke.github.io${path}`;
                const destination = redirect(source, address);
                assert.equal(destination, `https://acaschess.com${expected}`, address);
                assert.equal(new URL(destination).origin, 'https://acaschess.com');
                assert.equal(redirect(source, destination), undefined, 'No redirect loop on the new site');
            }
        }
    }
});

test('legacy redirects leave unrelated hosts, projects, localhost and offline files alone', () => {
    for(const source of [redirectSource, inlineRedirect]) {
        for(const address of [
            'https://psyyke.github.io/',
            'https://psyyke.github.io/another-project/app/',
            'https://psyyke.github.io/A.C.A.S-other/app/',
            'https://psyyke.github.io/a.c.a.s/app/',
            'https://psyyke.github.io/A.C.A.S.html',
            'https://psyyke.github.io.evil.example/A.C.A.S/app/',
            'https://psyyke.github.io@evil.example/A.C.A.S/app/',
            'https://acaschess.com/A.C.A.S/app/',
            'http://localhost/A.C.A.S/app/',
            'file:///C:/download/export-matches.html'
        ]) assert.equal(redirect(source, address), undefined, address);
    }
});

test('legacy public pages and deep 404 links redirect in a browser without breaking offline collection', { timeout: 90000 }, async () => {
    const files = [
        'index.html', 'blog/index.html', 'board/index.html', 'contributing/index.html',
        'development/index.html', 'faq/index.html', 'install/index.html', 'privacy/index.html',
        'tos/index.html', 'troubleshoot/index.html', 'usage/index.html', 'app/index.html',
        'app/dev/index.html', 'app/dev/dynamic-graph-tests.html', 'tools/index.html',
        'tools/doppelmaia/index.html', 'tools/doppelmaia/research.html',
        'tools/doppelmaia/export-matches.html', 'tools/eloeye/index.html',
        'tools/game-exporter/index.html', 'tools/leela2onnx/index.html'
    ];
    const contents = await Promise.all(files.map(file => readFile(new URL(`../${file}`, import.meta.url), 'utf8')));
    const pages = new Map(files.map((file, index) => [`/${file.replace(/index\.html$/, '')}`, contents[index]]));
    const notFound = await readFile(new URL('../404.html', import.meta.url), 'utf8');
    const browser = await chromium.launch();
    try {
        const context = await browser.newContext({ serviceWorkers: 'block' });
        await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
        await context.route('**/*', async route => {
            const request = route.request();
            const address = new URL(request.url());
            if(address.protocol === 'file:') return route.continue();
            if(address.pathname === '/A.C.A.S/assets/js/domain-redirect.js'
                || address.pathname === '/assets/js/domain-redirect.js')
                return route.fulfill({ contentType: 'application/javascript', body: redirectSource });
            if(request.isNavigationRequest()) {
                if(address.hostname === 'psyyke.github.io') {
                    const body = pages.get(address.pathname.slice('/A.C.A.S'.length));
                    return route.fulfill({ status: body ? 200 : 404, contentType: 'text/html', body: body || notFound });
                }
                if(address.origin === 'https://acaschess.com' && address.pathname === '/faq/')
                    return route.fulfill({ contentType: 'text/html', body: pages.get('/faq/') });
                return route.fulfill({ contentType: 'text/html', body: '<title>New site</title>' });
            }
            return route.fulfill({ contentType: 'application/javascript', body: '' });
        });
        const page = await context.newPage();
        const suffix = '?utm_source=legacy&value=%2F%23#kept';
        for(const path of [...pages.keys(), '/missing/deep/page.html', '']) {
            const expectedPath = path === '/faq/' ? '/troubleshoot/' : path || '/';
            await page.goto(`https://psyyke.github.io/A.C.A.S${path}${suffix}`, { waitUntil: 'domcontentloaded' });
            await page.waitForURL(`https://acaschess.com${expectedPath}${suffix}`);
            assert.equal(page.url(), `https://acaschess.com${expectedPath}${suffix}`, path);
        }
        await page.goto('https://acaschess.com/before/');
        await page.goto('https://psyyke.github.io/A.C.A.S/app/');
        await page.waitForURL('https://acaschess.com/app/');
        await page.goBack();
        assert.equal(page.url(), 'https://acaschess.com/before/', 'Back must not revisit the old redirect');

        const offline = await context.newPage();
        const requests = [];
        offline.on('request', request => {
            if(/^https?:/.test(request.url())) requests.push(request.url());
        });
        const file = new URL('../tools/doppelmaia/export-matches.html', import.meta.url).href;
        await offline.goto(file);
        assert.equal(offline.url(), file);
        assert.equal(await offline.locator('#collect').isEnabled(), true);
        assert.deepEqual(requests, [], 'Downloaded collector must not load the shared script or contact the website');
        assert.doesNotMatch(collectorSource, /<script[^>]+src=/i);
        assert.ok(Buffer.byteLength(collectorSource.replace(/<link rel="icon"[^>]*>/, '')) < 40 * 1024,
            'Inline redirect must preserve the 40 KiB download budget, excluding the embedded favicon');
    } finally {
        await browser.close();
    }
});

test('userscript version warning appears below 2.6.0 but not at or above it', async () => {
    const [globals, gui] = await Promise.all([
        readFile(new URL('../app/assets/js/globals.js', import.meta.url), 'utf8'),
        readFile(new URL('../app/assets/js/gui.js', import.meta.url), 'utf8')
    ]);
    const minimum = globals.match(/^const USERSCRIPT_MIN_VERSION = .*;$/m);
    const compare = globals.match(/function IS_BELOW_VERSION\([\s\S]*?\n}/);
    const start = gui.indexOf('        if(GM_info?.script?.version && IS_BELOW_VERSION(');
    const end = gui.indexOf('\n        const managerName', start);
    assert.ok(minimum && compare && start >= 0 && end > start);
    const warn = new Function('GM_info', 'updateYourUserscriptElem', 'toast',
        `${minimum[0]}\n${compare[0]}\nconst TRANS_OBJ = null;\n${gui.slice(start, end)}`);
    for(const [version, expected] of [['2.5.9', true], ['2.6.0', false], ['2.6.1', false]]) {
        let shown = false, notified = false;
        warn({ script: { version } }, {
            textContent: '', classList: { remove: name => { shown = name === 'hidden'; } }
        }, { warning: () => { notified = true; } });
        assert.equal(shown, expected, `${version}: inline warning`);
        assert.equal(notified, expected, `${version}: toast warning`);
    }
});

for(const filename of ['acas.user.js', 'acas.user.test.js']) {
    const source = await readFile(new URL(`../${filename}`, import.meta.url), 'utf8');
    const start = source.indexOf('const backendConfig = ');
    const end = source.indexOf('\nconst dbValues = ', start);
    assert.ok(start >= 0 && end > start);
    const initialize = new Function('window', 'GM_getValue', 'GM_setValue', `
        return (async () => {
            ${source.slice(start, end)}
            return { runningOnBackend, runningOnDevPage, constructBackendURL, getCurrentBackendURL };
        })();
    `);
    async function backend(page, saved) {
        const values = new Map([['currentBackendURL', saved]]);
        const api = await initialize({ location: new URL(page) },
            key => values.get(key), (key, value) => values.set(key, value));
        return { ...api, saved: values.get('currentBackendURL') };
    }

    test(`${filename}: backend migration uses HTTPS production and preserves localhost selections`, async () => {
        for(const saved of [undefined, 'https://psyyke.github.io/A.C.A.S/',
            'http://psyyke.github.io/A.C.A.S/', 'https://acaschess.com/A.C.A.S/',
            'https://acaschess.com.evil.example/', 'https://evil.example/?next=https://acaschess.com/',
            'https://acaschess.com@evil.example/']) {
            const result = await backend('http://chess.net/game', saved);
            assert.equal(result.getCurrentBackendURL(), 'https://acaschess.com/', `Saved URL: ${saved}`);
            assert.equal(result.saved, 'https://acaschess.com/');
        }
        for(const saved of ['https://acaschess.com/', 'http://localhost/A.C.A.S/']) {
            const result = await backend('https://lichess.org/game', saved);
            assert.equal(result.getCurrentBackendURL(), saved);
            assert.equal(result.saved, saved);
        }
    });

    test(`${filename}: only the canonical production origin and localhost project expose the backend`, async () => {
        for(const [page, allowed, target] of [
            ['https://acaschess.com/app/', true, 'https://acaschess.com/'],
            ['https://acaschess.com/tools/eloeye/', true, 'https://acaschess.com/'],
            ['http://localhost/A.C.A.S/app/', true, 'http://localhost/A.C.A.S/'],
            ['http://localhost/A.C.A.S/app/dev/', true, 'http://localhost/A.C.A.S/'],
            ['http://localhost/app/', false],
            ['http://localhost/not/A.C.A.S/app/', false],
            ['https://localhost/A.C.A.S/app/', false],
            ['https://acaschess.com:444/app/', false],
            ['http://acaschess.com/app/', false],
            ['https://acaschess.com.evil.example/app/', false],
            ['https://psyyke.github.io/A.C.A.S/app/', false]
        ]) {
            const result = await backend(page);
            assert.equal(result.runningOnBackend, allowed, page);
            if(allowed) {
                assert.equal(result.saved, target, `First visit must select ${target}`);
                assert.equal(result.runningOnDevPage, page.endsWith('/dev/'));
            }
        }
    });
}

test('production-root GUI connects to the userscript and resolves engine workers, its guide and 404 assets', { timeout: 90000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    let browser;
    try {
        const userscript = await buildUserscript();
        browser = await chromium.launch();
        const context = await browser.newContext({ serviceWorkers: 'block' });
        const origin = 'https://acaschess.com';
        await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
        await context.route('**/*', async route => {
            const address = new URL(route.request().url());
            if(address.origin !== origin)
                return route.fulfill({ contentType: 'application/javascript', body: '' });
            const response = await route.fetch({ url: `${url}${address.pathname}${address.search}` });
            await route.fulfill({ response });
        });
        await context.addInitScript(() => localStorage.setItem('gm:isTosAccepted', 'true'));
        await context.addInitScript(userscript);
        const page = await context.newPage();
        await page.goto(`${origin}/app/`);
        await page.waitForFunction(() => window.isUserscriptActive
            && typeof SETTING_FILTER_OBJ !== 'undefined' && SETTING_FILTER_OBJ.profileID);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('gm:currentBackendURL'))), `${origin}/`);
        assert.equal(await page.locator('#install-acas-server-text a').getAttribute('href'), '../usage/#external');
        assert.equal(await page.locator('#install-acas-server-text a').evaluate(link => link.href),
            `${origin}/usage/#external`);
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), `${origin}/app/`);
        assert.equal(await page.evaluate(() => crossOriginIsolated), true);
        const workerPage = await browser.newPage();
        await workerPage.route('https://**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
        await workerPage.goto(`${url}/404.html`);
        await workerPage.evaluate(async () => {
            const { default: loadEngineWorker, getEngineWorkerConfig } = await import('/app/assets/js/instance/engineWorker.js');
            for(const [name, override] of [
                ['stockfish-16-1-wasm'],
                ['stockfish-17', { ...getEngineWorkerConfig('stockfish-16-1-wasm'), path: 'lila-stockfish/17-0-worker' }],
                ['fairy-stockfish-nnue-wasm'],
                ['lc0']
            ]) {
                const pendingLoads = new Set();
                let worker, timer;
                try {
                    await new Promise((resolve, reject) => {
                        timer = setTimeout(() => reject(new Error(`${name}: timed out waiting for uciok`)), 15000);
                        worker = loadEngineWorker(override || getEngineWorkerConfig(name), {
                            type: name, profileName: 'domain-test', pendingLoads, isCurrent: () => true,
                            onReady: engine => engine.sendMsg('uci'),
                            onMessage: line => {
                                if(typeof line === 'string' && line.split('\n').some(value => value.trim() === 'uciok'))
                                    resolve();
                            },
                            onError: error => reject(new Error(`${name}: ${error.message}`))
                        });
                    });
                } finally {
                    clearTimeout(timer);
                    for(const entry of pendingLoads) clearInterval(entry.intervalId);
                    worker?.terminate();
                }
            }
        });
        await workerPage.close();
        await page.goto(`${origin}/404.html`);
        assert.equal(await page.locator('#wrapper a').evaluate(link => link.href), `${origin}/`);
        const stylesheet = page.locator('link[rel="stylesheet"]');
        assert.equal(await stylesheet.evaluate(link => link.href), `${origin}/assets/css/404.css`);
        assert.equal(await stylesheet.evaluate(link => Boolean(link.sheet)), true);
    } finally {
        if(browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
