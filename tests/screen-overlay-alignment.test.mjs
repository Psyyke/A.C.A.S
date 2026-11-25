import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { existsSync, rmSync } from 'node:fs';

test('headful isolated Chromium and Electron alignment at real browser zoom', async t => {
    if(process.env.ACAS_SCREEN_OVERLAY_ALIGNMENT !== '1' || process.platform !== 'win32')
        return t.skip('Opt in with ACAS_SCREEN_OVERLAY_ALIGNMENT=1 on Windows');
    const { chromium } = await import('../app/assets/engines/lc0/node_modules/playwright/index.mjs');
    const { WebSocket } = await import('../appServer/node_modules/ws/wrapper.mjs');
    const profile = path.resolve('tests', `screen-overlay-alignment-chrome-${process.pid}`);
    const electronProfile = path.resolve('tests', `screen-overlay-alignment-electron-${process.pid}`);
    assert.equal(existsSync(profile), false);
    assert.equal(existsSync(electronProfile), false);
    const freePort = async () => {
        const probe = createServer();
        await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
        const port = probe.address().port;
        await new Promise(resolve => probe.close(resolve));
        return port;
    };
    const controlPort = await freePort(), wsPort = await freePort();
    const boardServer = createServer((_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><title>ACAS isolated overlay alignment</title><style>body{margin:0}#board{position:absolute;left:40px;top:50px;width:400px;height:400px;border:0;padding:0;background:green}</style><button id="board" aria-label="ACAS overlay alignment test board"></button>');
    });
    await new Promise(resolve => boardServer.listen(0, '127.0.0.1', resolve));
    const boardUrl = `http://127.0.0.1:${boardServer.address().port}/`;
    const extension = path.resolve('tests', 'fixtures', 'screen-overlay-zoom');
    let context, client, child;
    const wait = async (fn, label) => {
        const end = Date.now() + 15000;
        while(Date.now() < end) {
            try { const value = await fn(); if(value) return value; } catch {}
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error(`Timed out: ${label}`);
    };
    try {
        context = await chromium.launchPersistentContext(profile, { headless: false, viewport: null,
            args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
                '--force-renderer-accessibility', '--window-position=50,50', '--window-size=900,800'] });
        const page = await context.newPage();
        await page.goto(boardUrl);
        const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        child = spawn(path.resolve('appServer', 'node_modules', 'electron', 'dist', 'electron.exe'),
            [path.resolve('tests', 'screen-overlay-alignment-electron.mjs'), electronProfile, String(controlPort), String(wsPort)],
            { stdio: 'ignore' });
        const status = async () => (await fetch(`http://127.0.0.1:${controlPort}/`)).json();
        await wait(async () => (await status()).ready, 'Electron WebSocket server');
        client = new WebSocket(`ws://127.0.0.1:${wsPort}`, { origin: 'http://localhost' });
        await new Promise((resolve, reject) => { client.once('open', resolve); client.once('error', reject); });
        for(const { zoom, offset } of [
            { zoom: 1, offset: { x: 0, y: 0 } },
            { zoom: 1.25, offset: { x: 0, y: 0 } },
            { zoom: 0.8, offset: { x: 0, y: 0 } },
            { zoom: 1, offset: { x: 15, y: -11 } }
        ]) {
            await worker.evaluate(async ({ url, zoom }) => {
                const tabs = await chrome.tabs.query({});
                const tab = tabs.find(tab => tab.url === url);
                if(!tab) throw new Error('Own test tab not found');
                await chrome.tabs.setZoom(tab.id, zoom);
            }, { url: boardUrl, zoom });
            await new Promise(resolve => setTimeout(resolve, 300));
            const snapshot = await page.evaluate(() => {
                const { left, top, width, height } = document.getElementById('board').getBoundingClientRect();
                return { instanceId: 'alignment', visible: true, geometry: {
                    screenX, screenY, outerWidth, outerHeight, innerWidth, innerHeight, dpr: devicePixelRatio,
                    browser: 'chromium', rect: { left, top, width, height }
                }, orientation: 'w', dimensions: [8, 8], shapes: [{ id: 1, type: 'rectangle', positions: 'a1',
                    config: { style: 'fill:red;' }, display: '', animations: [] }] };
            });
            snapshot.offset = offset;
            client.send(JSON.stringify({ type: 'screenOverlay', msg: snapshot }));
            const g = snapshot.geometry;
            const border = Math.max(0, (g.outerWidth - g.innerWidth * zoom) / 2);
            const expectedX = Math.round(g.screenX + border + g.rect.left * zoom) + offset.x;
            const expectedY = Math.round(g.screenY + g.outerHeight - g.innerHeight * zoom - border + g.rect.top * zoom) + offset.y;
            const overlay = await wait(async () => (await status()).windows.find(win => win.visible
                && win.bounds.x === expectedX && win.bounds.y === expectedY), 'positioned overlay');
            const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-File',
                path.resolve('tests', 'screen-overlay-native-bounds.ps1'), '-ProfilePath', profile,
                '-OverlayHandle', overlay.handle], { timeout: 15000 });
            const native = JSON.parse(stdout.trim());
            const error = Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, native.overlay[key] - native.board[key]]));
            console.log(JSON.stringify({ zoom, geometry: snapshot.geometry, electronDipBounds: overlay.bounds, native, error }));
            assert.ok(native.board.width > 0 && native.overlay.width > 0);
            assert.ok(Math.abs(error.x - offset.x) <= 2 && Math.abs(error.y - offset.y) <= 2
                && Math.abs(error.width) <= 2 && Math.abs(error.height) <= 2,
            `Native alignment error: ${JSON.stringify(error)}, requested offset: ${JSON.stringify(offset)}`);
        }
    } finally {
        client?.terminate();
        if(child) {
            try { await fetch(`http://127.0.0.1:${controlPort}/quit`); } catch {}
            await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
            if(child.exitCode === null) child.kill();
        }
        if(context) await context.close();
        await new Promise(resolve => boardServer.close(resolve));
        rmSync(profile, { recursive: true, force: true });
        rmSync(electronProfile, { recursive: true, force: true });
    }
});
