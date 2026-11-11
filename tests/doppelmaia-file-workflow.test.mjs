import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

test('game and weight file workflows validate inputs and export a real converter result', { timeout: 180000 }, async () => {
    const { server, url } = await startServer({ outFile: 'NUL' });
    const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    try {
        const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 360, height: 900 } });
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => !document.querySelector('#games').disabled);
        const games = page.getByLabel('Import games to learn from', { exact: true });
        assert.equal(await games.getAttribute('multiple'), '');
        assert.equal(await games.getAttribute('aria-describedby'), 'games-file-name import-help');
        await games.focus();
        assert.equal(await games.evaluate(element => document.activeElement === element), true);
        const chooser = page.waitForEvent('filechooser');
        await games.press('Enter');
        await (await chooser).setFiles([
            { name: 'my games.pgn', mimeType: 'text/plain', buffer: Buffer.from('') },
            { name: `${'long-name-'.repeat(12)}.pgn`, mimeType: 'text/plain', buffer: Buffer.from('') }
        ]);
        assert.match(await page.locator('#games-file-name').textContent(), /^my games\.pgn, long-name-/);
        await page.locator('#prep-status[data-error="true"]').waitFor();
        await games.setInputFiles([]);
        assert.equal(await page.locator('#games-file-name').textContent(), 'No files selected');
        await games.evaluate(element => element.reportValidity());
        assert.equal(await games.evaluate(element => element.validity.valueMissing), true);
        assert.equal(await page.locator('#training-controls').evaluate(element => element.disabled && element.inert), true);

        await page.goto(`${url}/tools/leela2onnx/`);
        await page.waitForFunction(() => document.querySelector('#status').textContent === 'Ready.');
        const weightsChooser = page.waitForEvent('filechooser');
        await page.getByRole('button', { name: 'Choose weights' }).focus();
        await page.keyboard.press('Enter');
        await (await weightsChooser).setFiles(fileURLToPath(new URL('../app/assets/lc0-nets/maia-1500.pb', import.meta.url)));
        assert.equal(await page.locator('#weights-name').textContent(), 'maia-1500.pb');
        await page.locator('#convert').click();
        await page.locator('#download').waitFor({ state: 'visible', timeout: 120000 });
        const download = page.waitForEvent('download');
        await page.locator('#download').click();
        const result = await download;
        assert.match(result.suggestedFilename(), /\.onnx$/);
        const stream = await result.createReadStream();
        let bytes = 0;
        for await(const chunk of stream) bytes += chunk.length;
        assert.ok(bytes > 100000, 'Converter should export a real ONNX model');
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
