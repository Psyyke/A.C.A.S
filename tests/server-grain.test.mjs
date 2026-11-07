import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

test('server surfaces use the main app grain and the library has a darker background', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto(url);
        await page.setContent(`<link rel="stylesheet" href="${url}/appServer/ui/css/main.css">
            <div id="acas-header"></div><header id="server-controls"></header>
            <div class="engine-library-heading"></div><div class="engine-grid">
                <div class="engine-card" id="idle"></div><div class="engine-card active" id="active"></div>
            </div><div id="console-toolbar"></div><div id="consoles-container"></div>
            <div class="console-section"><div class="log"></div></div>`);
        await page.addStyleTag({ content: '.engine-card { transition: none; }' });
        for(const selector of ['body', '#acas-header', '#server-controls', '.engine-library-heading', '.engine-grid', '#idle', '#active', '.console-section']) {
            const image = await page.locator(selector).evaluate(element => getComputedStyle(element).backgroundImage);
            assert.match(image, /background-grain\.png/, selector);
        }
        for(const selector of ['.engine-library-heading', '.engine-grid', '#console-toolbar']) {
            assert.equal(await page.locator(selector).evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(0, 0, 0)');
        }
        const toolbar = await page.locator('#console-toolbar').evaluate(element => {
            const style = getComputedStyle(element);
            return { width: style.borderTopWidth, color: style.borderTopColor };
        });
        assert.deepEqual(toolbar, { width: '1px', color: 'rgb(28, 28, 28)' });
        const emptyConsole = await page.locator('#consoles-container').evaluate(element => {
            const style = getComputedStyle(element);
            const floor = getComputedStyle(element, '::before');
            return { background: style.backgroundColor, image: floor.backgroundImage, size: floor.backgroundSize,
                transform: floor.transform, inset: floor.inset,
                fade: getComputedStyle(element, '::after').backgroundImage, pointerEvents: floor.pointerEvents };
        });
        assert.equal(emptyConsole.background, 'rgb(0, 0, 0)');
        assert.match(emptyConsole.image, /checkerboard-floor\.svg/);
        assert.equal(emptyConsole.size, 'cover');
        assert.equal(emptyConsole.transform, 'none');
        assert.equal(emptyConsole.inset, '0px');
        assert.match(emptyConsole.fade, /linear-gradient/);
        assert.match(emptyConsole.fade, /background-grain\.png/);
        assert.equal(await page.locator('#consoles-container').evaluate(element =>
            getComputedStyle(element, '::after').backgroundSize), '160px 160px, 100% 100%');
        assert.equal(emptyConsole.pointerEvents, 'none');
        await page.locator('#consoles-container').evaluate(element => {
            const consoleSection = document.querySelector('.console-section');
            element.appendChild(consoleSection);
        });
        assert.equal(await page.locator('.console-section').evaluate(element =>
            getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0.85)');
        assert.equal(await page.locator('.log').evaluate(element =>
            getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)');
        assert.match(await page.locator('#consoles-container').evaluate(element =>
            getComputedStyle(element, '::before').backgroundImage), /checkerboard-floor/);
        await page.evaluate(() => document.body.classList.add('panels-collapsed'));
        const collapsedToolbar = await page.locator('#console-toolbar').evaluate(element => {
            const style = getComputedStyle(element);
            return [style.backgroundImage, style.backgroundColor, style.borderTopWidth];
        });
        assert.deepEqual(collapsedToolbar, ['none', 'rgba(0, 0, 0, 0)', '0px']);
        await page.evaluate(() => document.body.classList.remove('panels-collapsed'));
        const floorSize = await page.evaluate(async () => {
            const image = new Image();
            image.src = '/appServer/ui/images/checkerboard-floor.svg';
            await image.decode();
            return [image.naturalWidth, image.naturalHeight];
        });
        assert.deepEqual(floorSize, [1000, 600]);
        for(const selector of ['#idle', '#active']) {
            await page.locator(selector).hover();
            assert.match(await page.locator(selector).evaluate(element => getComputedStyle(element).backgroundImage), /background-grain\.png/);
        }

        const source = readFileSync(new URL('../app/assets/js/gui/backgroundGrain.js', import.meta.url), 'utf8')
            .replaceAll('export function ', 'function ');
        await page.addScriptTag({ content: source });
        const matches = await page.evaluate(async () => {
            const img = new Image();
            img.src = '/appServer/ui/images/background-grain.png';
            await img.decode();
            const expected = getBackgroundGrainTile();
            const actual = document.createElement('canvas');
            actual.width = img.width;
            actual.height = img.height;
            const context = actual.getContext('2d');
            context.drawImage(img, 0, 0);
            const expectedPixels = expected.getContext('2d').getImageData(0, 0, expected.width, expected.height).data;
            return img.width === expected.width && img.height === expected.height &&
                context.getImageData(0, 0, img.width, img.height).data.every((value, index) => value === expectedPixels[index]);
        });
        assert.equal(matches, true);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
