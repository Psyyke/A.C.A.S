import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

const scriptURL = 'https://example.test/tools/doppelmaia/coi-serviceworker.js';
const source = (await readFile(new URL('../tools/doppelmaia/isolation.js', import.meta.url), 'utf8'))
    .replace('export async function', 'async function')
    .replaceAll('import.meta.url', JSON.stringify('https://example.test/tools/doppelmaia/isolation.js'));
function environment({ isolated = false, controller, active = true, denied = false } = {}) {
    const storage = new Map(), serviceWorker = new EventTarget();
    let reloads = 0, registrations = 0;
    const installing = new EventTarget();
    installing.scriptURL = scriptURL;
    installing.state = active ? 'activated' : 'installing';
    const registration = active ? { active: installing } : { installing };
    serviceWorker.controller = controller ? { scriptURL: controller } : null;
    serviceWorker.register = async () => {
        registrations++;
        if(denied) throw new Error('SecurityError');
        return registration;
    };
    const context = {
        URL, Date, setTimeout, clearTimeout, isSecureContext: true,
        crossOriginIsolated: isolated, SharedArrayBuffer: isolated ? SharedArrayBuffer : undefined,
        navigator: { serviceWorker },
        sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        location: { reload: () => { reloads++; } }
    };
    return { context, storage, serviceWorker, installing, run: () => runInNewContext(`${source}\nprepareIsolation()`, context),
        reloads: () => reloads, registrations: () => registrations };
}

test('existing worker ownership and isolation are sufficient without registering again', async () => {
    const env = environment({ isolated: true, controller: scriptURL, denied: true });
    assert.equal(await env.run(), true);
    assert.equal(env.registrations(), 0);
});

test('fresh install waits for activation and delayed controller claim before reloading headers', async () => {
    const env = environment({ active: false });
    const pending = env.run();
    setTimeout(() => {
        env.installing.state = 'activated';
        env.installing.dispatchEvent(new Event('statechange'));
        setTimeout(() => {
            env.serviceWorker.controller = { scriptURL };
            env.serviceWorker.dispatchEvent(new Event('controllerchange'));
        }, 20);
    }, 10);
    assert.equal(await pending, false);
    assert.equal(env.reloads(), 1);
    await assert.rejects(env.run(), /isolation headers are missing/);
    assert.equal(env.reloads(), 1);
    env.context.crossOriginIsolated = true;
    env.context.SharedArrayBuffer = SharedArrayBuffer;
    assert.equal(await env.run(), true);
    assert.equal(env.storage.size, 0);
});

test('existing different ownership gets one reload and never reports a false ready state', async () => {
    const env = environment({ controller: 'https://example.test/other-worker.js' });
    assert.equal(await env.run(), false);
    assert.equal(env.reloads(), 1);
    await assert.rejects(env.run(), /could not take control/);
    assert.equal(env.reloads(), 1);
});

test('denied workers and redundant installs fail without reloading', async () => {
    const denied = environment({ denied: true });
    await assert.rejects(denied.run(), /browser blocked/);
    assert.equal(denied.reloads(), 0);
    const isolatedButDenied = environment({ isolated: true, denied: true });
    await assert.rejects(isolatedButDenied.run(), /browser blocked/);
    const failed = environment({ active: false });
    failed.installing.state = 'redundant';
    await assert.rejects(failed.run(), /could not install/);
    assert.equal(failed.reloads(), 0);
});

test('worker headers make a clean browser ready and existing ownership survives reload', { timeout: 45000 }, async () => {
    const previous = process.env.ISOLATE;
    process.env.ISOLATE = '0';
    const { server, url } = await startServer({ outFile: 'NUL' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        let navigations = 0;
        page.on('framenavigated', frame => { if(frame === page.mainFrame()) navigations++; });
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Ready.'));
        assert.equal(await page.evaluate(() => crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined'), true);
        assert.ok(navigations <= 2);
        assert.match(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL), /doppelmaia\/coi-serviceworker.js$/);
        assert.equal(await page.evaluate(async () => (await fetch('./runtime/converter-worker.js')).status), 200);
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Ready.'));
        assert.equal(navigations, 3);
        const blocked = await browser.newPage();
        await blocked.addInitScript(() => {
            navigator.serviceWorker.register = async () => { throw new DOMException('Denied', 'SecurityError'); };
        });
        await blocked.goto(`${url}/tools/doppelmaia/`);
        await blocked.locator('#status[data-error="true"]').waitFor();
        assert.match(await blocked.locator('#status').textContent(), /browser blocked/);
        assert.equal(await blocked.locator('#games').isDisabled(), true);
    } finally {
        if(previous === undefined) delete process.env.ISOLATE; else process.env.ISOLATE = previous;
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
