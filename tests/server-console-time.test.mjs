import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { startServer } from './maia-elo/serve.mjs';

const script = readFileSync(new URL('../appServer/ui/js/console.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../appServer/ui/css/main.css', import.meta.url), 'utf8');
const key = 'acas-server-log-compact-time';

test('console timestamp modes cycle, synchronize, filter and persist', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(url);
        await page.setContent(`<style>${css}\n.timeBtn { transition: none !important; }</style><div id="consoles-container"></div>`);
        await page.evaluate(() => localStorage.clear());
        await page.addScriptTag({ content: `const consolesContainer = document.getElementById('consoles-container');
            const savedEngines = [{ engineId: 'e', title: 'Engine' }]; ${script}` });
        await page.evaluate(async () => {
            const a = { engineId: 'e', profileName: 'a', instanceId: '1', identifierKey: 'a' };
            const b = { engineId: 'e', profileName: 'b', instanceId: '2', identifierKey: 'b' };
            addConsoleView(a); addConsoleView(b);
            await log('info depth 20 pv e2e4', 'engine', a);
            await log('bestmove e2e4', 'engine', b);
        });
        const sections = page.locator('.console-section');
        const button = sections.first().locator('.timeBtn');
        const colors = new Set(), widths = [];
        for(const mode of ['full', 'compact', 'seconds', 'none']) {
            const result = await sections.evaluateAll((elements, mode) => elements.map(section => {
                const button = section.querySelector('.timeBtn'), time = section.querySelector('.timestamp');
                return { mode: button.dataset.timeMode, title: button.title, aria: button.getAttribute('aria-label'),
                    value: time.textContent, full: time.title, width: time.getBoundingClientRect().width,
                    color: getComputedStyle(button).color, border: getComputedStyle(button).borderColor,
                    display: getComputedStyle(time).display };
            }), mode);
            for(const item of result) {
                assert.equal(item.mode, mode);
                assert.ok(item.title && item.aria === item.title);
                assert.ok(item.full);
                if(mode === 'full') assert.ok(item.value.length > 6);
                if(mode === 'compact') assert.match(item.value, /^\d{2}\.\d{3}$/);
                if(mode === 'seconds') assert.match(item.value, /^\d{2}$/);
                if(mode === 'none') assert.equal(item.display, 'none');
            }
            colors.add(`${result[0].color}|${result[0].border}`);
            widths.push(result[0].width);
            assert.equal(await page.evaluate(key => localStorage.getItem(key), key), mode === 'full' ? null : mode);
            await button.click();
        }
        assert.equal(colors.size, 4);
        assert.ok(widths[0] > widths[1] && widths[1] > widths[2] && widths[2] > widths[3], widths);
        assert.equal(await button.getAttribute('data-time-mode'), 'full');
        await button.click();
        await button.click();
        await button.click();
        const filter = sections.first().locator('.logFilter');
        await filter.fill('bestmove');
        assert.equal(await sections.first().locator('.log-entry').evaluate(entry => getComputedStyle(entry).display), 'flex');
        await filter.fill('not-present');
        assert.equal(await sections.first().locator('.log-entry').evaluate(entry => getComputedStyle(entry).display), 'none');
        await page.evaluate(() => {
            addConsoleView({ engineId: 'e', profileName: 'c', instanceId: '3', identifierKey: 'c' });
        });
        assert.equal(await sections.first().locator('.timeBtn').getAttribute('data-time-mode'), 'none');
        await page.evaluate(() => log('new info', 'engine',
            { engineId: 'e', profileName: 'c', instanceId: '3', identifierKey: 'c' }));
        assert.equal(await sections.first().locator('.timestamp').textContent(), '');
        assert.equal(await sections.first().locator('.timestamp').evaluate(time => getComputedStyle(time).display), 'none');
        await page.reload();
        await page.setContent(`<style>${css}</style><div id="consoles-container"></div>`);
        await page.addScriptTag({ content: `const consolesContainer = document.getElementById('consoles-container');
            const savedEngines = []; ${script}` });
        await page.evaluate(() => addConsoleView({ engineId: 'e', profileName: 'a', instanceId: '1', identifierKey: 'a' }));
        assert.equal(await page.locator('.timeBtn').getAttribute('data-time-mode'), 'none');
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('legacy compact timestamp preferences restore their original modes', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ headless: true });
    try {
        for(const [stored, expected] of [['true', 'compact'], ['false', 'full']]) {
            const page = await browser.newPage();
            await page.goto(url);
            await page.evaluate(([key, stored]) => localStorage.setItem(key, stored), [key, stored]);
            await page.setContent('<div id="consoles-container"></div>');
            await page.addScriptTag({ content: `const consolesContainer = document.getElementById('consoles-container');
                const savedEngines = []; ${script}` });
            await page.evaluate(() => addConsoleView({ engineId: 'e', profileName: 'a', instanceId: '1', identifierKey: 'a' }));
            assert.equal(await page.locator('.timeBtn').getAttribute('data-time-mode'), expected);
            await page.close();
        }
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
