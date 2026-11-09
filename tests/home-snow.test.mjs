import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

test('snow failures are contained and leave home-page navigation working', { timeout: 30000 }, async () => {
    const source = await readFile(new URL('../assets/js/home-snow.js', import.meta.url), 'utf8');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        for(const fault of ['invalid-date', 'date-throws', 'missing-media', 'creation', 'update']) {
            const page = await browser.newPage({ reducedMotion: 'no-preference' });
            page.setDefaultTimeout(5000);
            await page.route('**/*', route => new URL(route.request().url()).host === new URL(url).host
                ? route.continue() : route.abort());
            await page.clock.setFixedTime(new Date(2026, 10, 15));
            await page.goto(`${url}/`, { waitUntil: 'load' });
            const warnings = await page.evaluate(({ source, fault }) => {
                const warnings = [];
                const warn = console.warn;
                console.warn = message => warnings.push(message);
                try {
                    const FakeDate = class {
                        constructor() {
                            if(fault === 'date-throws') throw new Error('Date unavailable');
                        }
                        getMonth() { return fault === 'invalid-date' ? NaN : 11; }
                    };
                    const snowDocument = new Proxy(document, {
                        get(target, key) {
                            if(key === 'createElement' && fault === 'creation')
                                return () => { throw new Error('Creation failed'); };
                            const value = Reflect.get(target, key, target);
                            return typeof value === 'function' ? value.bind(target) : value;
                        }
                    });
                    new Function('Date', 'matchMedia', 'document', source)(
                        FakeDate, fault === 'missing-media' ? undefined : matchMedia.bind(window), snowDocument);
                    if(fault === 'update') {
                        document.querySelector('.home-snow').classList.toggle = () => { throw new Error('Update failed'); };
                        document.dispatchEvent(new Event('visibilitychange'));
                        document.dispatchEvent(new Event('visibilitychange'));
                    }
                } finally {
                    console.warn = warn;
                }
                return warnings;
            }, { source, fault });
            assert.deepEqual(warnings, ['[A.C.A.S] Snowfall disabled after an error:'], fault);
            assert.equal(await page.locator('.home-snow').count(), 0, fault);
            await page.locator('header a[href="usage/"]').click();
            await page.waitForURL(`${url}/usage/`);
            await page.close();
        }
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('settings control panel links to EloEye in a separate tab', async () => {
    const html = await readFile(new URL('../app/index.html', import.meta.url), 'utf8');
    assert.match(html, /id="settings-control-panel">\s*<a target="_eloeye" href="\.\.\/tools\/eloeye\/" class="control-panel-btn no-select acas-fancy-button" title="Open EloEye" aria-label="Open EloEye">📐<\/a>/);
});

test('home snowfall is seasonal, previewable, decorative and respects reduced motion', { timeout: 30000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        for(const [month, preview, visible] of [
            [10, false, false], [11, false, true], [0, false, true],
            [1, false, true], [2, false, false], [6, true, true]
        ]) {
            const page = await browser.newPage({ reducedMotion: 'no-preference' });
            await page.route('**/*', route => new URL(route.request().url()).host === new URL(url).host
                ? route.continue() : route.abort());
            await page.clock.setFixedTime(new Date(2026, month, 15, 12));
            await page.goto(`${url}/${preview ? '?snow' : ''}`, { waitUntil: 'load' });
            assert.equal(await page.locator('.home-snow').count(), Number(visible), `month ${month}, preview ${preview}`);
            if(visible) {
                assert.equal(await page.locator('.home-snow span').count(), 60);
                assert.equal(await page.locator('.home-snow .snow-crystal').count(), 12);
                for(const depth of [0, 1, 2])
                    assert.equal(await page.locator(`.home-snow .snow-depth-${depth}`).count(), 20);
                assert.equal(await page.locator('.home-snow i').first().evaluate(element => getComputedStyle(element).animationName), 'home-snow-swirl');
                assert.equal(await page.locator('.home-snow').getAttribute('aria-hidden'), 'true');
                assert.equal(await page.locator('.home-snow').evaluate(element => getComputedStyle(element).pointerEvents), 'none');
                const snowBounds = await page.locator('.home-snow').boundingBox();
                assert.equal(snowBounds.width, 1280);
                assert.equal(snowBounds.height, 720);
                const before = await page.locator('.home-snow span').first().evaluate(element => getComputedStyle(element).transform);
                await page.waitForFunction(previous => {
                    const flake = document.querySelector('.home-snow span');
                    return getComputedStyle(flake).transform !== previous;
                }, before);
                const after = await page.locator('.home-snow span').first().evaluate(element => getComputedStyle(element).transform);
                assert.notEqual(before, after);
                await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
                assert.equal((await page.locator('.home-snow').boundingBox()).y, 0);
                await page.emulateMedia({ reducedMotion: 'reduce' });
                await page.waitForFunction(() => !document.querySelector('.home-snow'));
                await page.emulateMedia({ reducedMotion: 'no-preference' });
                await page.waitForSelector('.home-snow');
                if(preview) {
                    await page.setViewportSize({ width: 390, height: 844 });
                    assert.equal((await page.locator('.home-snow').boundingBox()).width, 390);
                    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
                    await page.evaluate(() => {
                        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
                        document.dispatchEvent(new Event('visibilitychange'));
                    });
                    assert.equal(await page.locator('.home-snow span').first().evaluate(element => getComputedStyle(element).animationPlayState), 'paused');
                    assert.equal(await page.locator('.home-snow i').first().evaluate(element => getComputedStyle(element).animationPlayState), 'paused');
                    await page.evaluate(() => {
                        delete document.hidden;
                        document.dispatchEvent(new Event('visibilitychange'));
                    });
                    assert.equal(await page.locator('.home-snow span').first().evaluate(element => getComputedStyle(element).animationPlayState), 'running');
                    await page.locator('.nav-burger').click();
                    await page.locator('#mobile-nav a[href="usage/"]').click();
                    await page.waitForURL(`${url}/usage/`);
                    assert.equal(await page.locator('.home-snow').count(), 0);
                }
            }
            await page.close();
        }
        const page = await browser.newPage({ reducedMotion: 'reduce' });
        await page.route('**/*', route => new URL(route.request().url()).host === new URL(url).host
            ? route.continue() : route.abort());
        await page.goto(`${url}/?snow`, { waitUntil: 'load' });
        assert.equal(await page.locator('.home-snow').count(), 0);
        await page.goto(`${url}/tools/eloeye/?snow`, { waitUntil: 'load' });
        assert.equal(await page.locator('.home-snow').count(), 0);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
