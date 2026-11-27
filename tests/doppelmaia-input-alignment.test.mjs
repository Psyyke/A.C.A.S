import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

test('import controls align when labels and file names wrap', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => !document.querySelector('#games').disabled);
        for(const width of [360, 600, 640, 760, 900, 1200]) {
            await page.setViewportSize({ width, height: 900 });
            for(const filename of ['No files selected', 'a-long-game-export-filename-that-wraps-on-smaller-screens.pgn']) {
                await page.locator('#games-file-name').evaluate((element, value) => element.textContent = value, filename);
                const layout = await page.evaluate(() => {
                    const select = document.querySelector('#training-source').getBoundingClientRect();
                    const file = document.querySelector('#data-form .tool-file-picker').getBoundingClientRect();
                    return { selectTop: select.top, selectBottom: select.bottom, fileTop: file.top,
                        overflow: document.documentElement.scrollWidth > innerWidth };
                });

                if(width > 600)
                    assert(Math.abs(layout.selectTop - layout.fileTop) < 1, `${width}: ${JSON.stringify(layout)}`);
                else assert(layout.fileTop >= layout.selectBottom, `${width}: stacked`);
                assert.equal(layout.overflow, false, `${width}: overflow`);
            }
        }
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('tool buttons and file controls press down without moving their bottom edge', { timeout: 60000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
        await page.route('**/*', route => {
            const request = new URL(route.request().url());
            return request.protocol === 'file:' || request.origin === new URL(url).origin ? route.continue() : route.abort();
        });
        const checkPress = async (target, visible = target) => {
            const hit = page.locator(target);
            const shown = page.locator(visible);
            await hit.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
            const snapshot = () => shown.evaluate(element => ({
                top: element.getBoundingClientRect().top,
                bottom: element.getBoundingClientRect().bottom,
                border: parseFloat(getComputedStyle(element).borderBottomWidth)
            }));
            const before = await snapshot();
            const box = await hit.boundingBox();
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            const pressed = await snapshot();
            const delta = before.border - pressed.border;
            const point = await page.evaluate(({ x, y }) => {
                const element = document.elementFromPoint(x, y);
                return `${element?.tagName}#${element?.id}.${element?.className}`;
            }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
            const message = `${page.url()} ${target}: ${JSON.stringify({ before, pressed, point })}`;
            assert.ok(delta > 0, message);
            assert.ok(Math.abs(pressed.top - before.top - delta) < 1, message);
            assert.ok(Math.abs(pressed.bottom - before.bottom) < 1, message);
            await page.mouse.move(0, 0);
            await page.mouse.up();
        };
        for(const width of [1200, 375]) {
            await page.setViewportSize({ width, height: 900 });
            await page.goto(`${url}/tools/doppelmaia/`);
            await page.waitForFunction(() => !document.querySelector('#games').disabled);
            await page.evaluate(() => {
                document.querySelector('#reset-settings').disabled = false;
                document.querySelector('#clear-data').disabled = false;
            });
            await checkPress('#reset-settings');
            await checkPress('#clear-data');
            await checkPress('#games', '#games + .tool-button');
            await page.locator('.maia-import-help > button').hover();
            await checkPress('#data-form a.tool-button');
            await page.evaluate(() => {
                document.querySelector('#training-step').hidden = false;
                const controls = document.querySelector('#training-controls');
                controls.disabled = false;
                controls.inert = false;
                document.querySelector('#custom-weights-field').hidden = false;
                document.querySelector('#start').disabled = false;
            });
            await checkPress('#base-weights', '#base-weights + .tool-button');
            await checkPress('#start');

            await page.goto(`${url}/tools/eloeye/`);
            await checkPress('#start');
            await page.locator('#checkpoint').evaluate(element => { element.hidden = false; });
            await checkPress('#discard-checkpoint');
            await page.goto(`${url}/tools/leela2onnx/`);
            await page.locator('#choose-weights:not([disabled])').waitFor();
            await checkPress('#choose-weights');
            await page.locator('#convert').evaluate(element => { element.disabled = false; });
            await checkPress('#convert');
            await page.goto(`${url}/tools/game-exporter/`);
            await checkPress('#download-collector');
            await page.goto(`${url}/tools/doppelmaia/research.html`);
            await checkPress('.maia-research .install-button');
            await page.goto(new URL('../tools/doppelmaia/export-matches.html', import.meta.url).href);
            await page.locator('#username').fill('Example');
            await checkPress('#collect');
        }
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
