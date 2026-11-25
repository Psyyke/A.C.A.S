import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { realProducerSnapshot } from './screen-overlay-fixture.mjs';

test('unpacked packaged binary loads shared drawer and clears WebSocket overlays', async t => {
    const directory = process.env.ACAS_SCREEN_OVERLAY_PACKAGED_DIR;
    if(!directory || process.platform !== 'win32') return t.skip('Set ACAS_SCREEN_OVERLAY_PACKAGED_DIR on Windows');
    const exe = path.resolve(directory, 'ACAS.exe');
    assert.ok(existsSync(exe));
    assert.deepEqual(readFileSync(path.resolve(directory, 'resources', 'userscript-components', 'UniversalBoardDrawer.js')),
        readFileSync(path.resolve('userscript-components', 'UniversalBoardDrawer.js')));
    const profile = path.resolve('tests', `screen-overlay-packaged-profile-${process.pid}`);
    assert.equal(existsSync(profile), false);
    const probe = createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const debugPort = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const wait = async (predicate, label, timeout = 10000) => {
        const end = Date.now() + timeout;
        while(Date.now() < end) {
            try { const value = await predicate(); if(value) return value; } catch {}
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error(`Timed out: ${label}`);
    };
    const child = spawn(exe, [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`],
        { stdio: 'ignore' });
    let browser, client;
    const h = realProducerSnapshot();
    try {
        await wait(async () => (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok, 'packaged CDP');
        const { chromium } = await import('../app/assets/engines/lc0/node_modules/playwright/index.mjs');
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
        const main = await wait(() => browser.contexts()[0].pages().find(page => /\/ui\/index.html$/.test(page.url())), 'main renderer');
        const serverPort = await main.evaluate(() => window.serverAPI.getPort());
        const { WebSocket } = await import('../appServer/node_modules/ws/wrapper.mjs');
        client = new WebSocket(`ws://127.0.0.1:${serverPort}`, { origin: 'http://localhost' });
        await new Promise((resolve, reject) => { client.once('open', resolve); client.once('error', reject); });
        client.send(JSON.stringify({ type: 'screenOverlay', msg: h.snapshot }));
        const overlay = await wait(() => browser.contexts()[0].pages().find(page => /\/ui\/screenOverlay.html$/.test(page.url())),
            'packaged overlay');
        await wait(() => overlay.locator('svg > *').count().then(count => count === h.snapshot.shapes.length), 'packaged SVG shapes');
        assert.equal(await overlay.evaluate(() => typeof UniversalBoardDrawer), 'function');
        assert.ok(await overlay.locator('svg text').allTextContents().then(texts => texts.includes('×')));
        client.close();
        await wait(() => overlay.isClosed(), 'packaged disconnect cleanup');
    } finally {
        client?.terminate();
        if(browser) await browser.close();
        if(child.exitCode === null) child.kill();
        await new Promise(resolve => {
            if(child.exitCode !== null) resolve();
            else child.once('exit', resolve);
        });
        h.clear();
        h.drawer.terminate();
        rmSync(profile, { recursive: true, force: true });
    }
});
