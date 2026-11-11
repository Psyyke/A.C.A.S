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
