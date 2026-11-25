import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { startServer } from './maia-elo/serve.mjs';

const script = readFileSync(new URL('../appServer/ui/js/console.js', import.meta.url), 'utf8');
const i18n = readFileSync(new URL('../appServer/ui/js/i18n.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../appServer/ui/css/main.css', import.meta.url), 'utf8');
const key = 'acas-server-log-compact-time';

test('one console shares its header with the toolbar without hiding controls', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
        await page.goto(url);
        await page.setContent(`<style>${css}</style><select id="server-language" hidden></select><div style="height: 40px; flex-shrink: 0"></div>
            <div id="console-toolbar"><div id="panelResizer" tabindex="0"></div>
                <button id="logOnlyToggle">L</button><button id="alwaysOnTopToggle">P</button><button id="panelsToggle">C</button>
            </div><div id="consoles-container"></div>`);
        await page.addScriptTag({ content: i18n });
        await page.addScriptTag({ content: `const consolesContainer = document.getElementById('consoles-container');
            const savedEngines = [{ engineId: 'e', title: 'Engine' }]; ${script}` });
        const first = { engineId: 'e', profileName: 'default', instanceId: '1', identifierKey: 'a' };
        const second = { engineId: 'e', profileName: 'default', instanceId: '2', identifierKey: 'b' };
        const toolbarHeight = () => page.locator('#console-toolbar').evaluate(el => el.getBoundingClientRect().height);
        assert.ok(await toolbarHeight() > 0, 'No console keeps the normal toolbar');
        await page.evaluate(item => addConsoleView(item), first);
        assert.equal(await toolbarHeight(), 0, 'One console merges the rows');
        const backgrounds = await page.locator('.log, .input-area, .cmdInput').evaluateAll(elements =>
            elements.map(el => {
                const style = getComputedStyle(el);
                return [style.backgroundColor, style.backgroundImage, style.backgroundSize];
            }));
        assert.deepEqual(backgrounds[1], backgrounds[0], 'The command row matches the log background');
        assert.deepEqual(backgrounds[2], backgrounds[0], 'The command input matches the log background');
        for(const width of [700, 900]) {
            await page.setViewportSize({ width, height: 650 });
            for(const scale of [0.8, 1, 1.5]) {
                for(const direction of ['ltr', 'rtl']) {
                    await page.evaluate(({ dir, scale }) => {
                        document.documentElement.dir = dir;
                        document.documentElement.style.setProperty('--server-font-scale', scale);
                    }, { dir: direction, scale });
                    for(const selector of ['#logOnlyToggle', '#alwaysOnTopToggle', '#panelsToggle', '.logFilter', '.clearBtn', '.pauseBtn', '.timeBtn', '.wrapBtn', '.kill-engine-btn']) {
                        const result = await page.locator(selector).evaluate(el => {
                            const rect = el.getBoundingClientRect(), header = document.querySelector('.console-header').getBoundingClientRect();
                            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
                            return { width: rect.width, y: rect.y, bottom: rect.bottom, headerY: header.y, headerBottom: header.bottom,
                                reachable: el === hit || el.contains(hit) };
                        });
                        assert.ok(result.width > 0 && result.y >= result.headerY - 1 && result.bottom <= result.headerBottom, `${width} ${scale} ${direction} ${selector}`);
                        assert.equal(result.reachable, true, `${width} ${scale} ${direction} ${selector} remains clickable`);
                    }
                }
            }
        }
        await page.locator('#panelResizer').focus();
        assert.equal(await page.evaluate(() => document.activeElement.id), 'panelResizer');
        assert.equal(await page.locator('#panelResizer').evaluate(el => {
            const rect = el.getBoundingClientRect();
            return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === el;
        }), true, 'The resize handle remains usable');
        await page.evaluate(() => {
            window.toolbarClicks = 0;
            document.querySelector('#logOnlyToggle').addEventListener('click', () => window.toolbarClicks++);
        });
        await page.locator('#logOnlyToggle').click();
        assert.equal(await page.evaluate(() => window.toolbarClicks), 1);
        await page.locator('.pauseBtn').click();
        assert.equal(await page.locator('.pauseBtn').getAttribute('aria-pressed'), 'true');
        await page.evaluate(item => addConsoleView(item), second);
        assert.ok(await toolbarHeight() > 0, 'Multiple consoles retain the separate toolbar');
        await page.evaluate(item => removeConsoleView(item), second);
        assert.equal(await toolbarHeight(), 0, 'Returning to one console merges the rows again');
        await page.evaluate(() => document.body.classList.add('logs-only'));
        assert.ok(await toolbarHeight() > 0, 'Logs-only mode keeps its toolbar');
        await page.evaluate(() => { document.body.classList.remove('logs-only'); document.body.classList.add('panels-collapsed'); });
        assert.equal(await page.locator('#console-toolbar').evaluate(el => getComputedStyle(el).position), 'fixed');
        await page.evaluate(() => document.body.classList.remove('panels-collapsed'));
        await page.setViewportSize({ width: 500, height: 650 });
        assert.ok(await toolbarHeight() > 0, 'Narrow windows keep separate rows');
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('console timestamp modes cycle, synchronize, filter and persist', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(url);
        await page.setContent(`<style>${css}\n.timeBtn { transition: none !important; }</style><select id="server-language"></select><div id="consoles-container"></div>`);
        await page.evaluate(() => localStorage.clear());
        await page.addScriptTag({ content: i18n });
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
        await page.setContent(`<style>${css}</style><select id="server-language"></select><div id="consoles-container"></div>`);
        await page.addScriptTag({ content: i18n });
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
            await page.setContent('<select id="server-language"></select><div id="consoles-container"></div>');
            await page.addScriptTag({ content: i18n });
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
