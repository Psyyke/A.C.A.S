import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { mockUserscript } from './elo-tool/mockUserscript.js';
import { measurementProtocol } from '../tools/eloeye/storage.js';

test('range chart waits for a complete group, survives reload and resets', { timeout: 30000 }, async () => {
    const previousIsolate = process.env.ISOLATE;
    process.env.ISOLATE = '0';
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
        await page.route('**/*', route => new URL(route.request().url()).host === new URL(url).host ? route.continue() : route.abort());
        await page.route('**/eloPlayer.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
            export class SetupError extends Error {}
            export async function runMatch({ onCheckpoint }) {
                const batch = [
                    { opponent: 1500, opening: 0, acasIsWhite: true },
                    { opponent: 1500, opening: 0, acasIsWhite: false }
                ];
                onCheckpoint({ mode: 'auto', games: [], batch });
                batch[0].score = 1;
                onCheckpoint({ mode: 'auto', games: [], batch });
                await new Promise(resolve => { window.completeChartGroup = resolve; });
                batch[1].score = 0;
                onCheckpoint({ mode: 'auto', games: [], batch });
                onCheckpoint({ mode: 'auto', games: batch, batch: [] });
                const next = [
                    { opponent: 1500, opening: 1, acasIsWhite: true, score: 0.5 },
                    { opponent: 1500, opening: 1, acasIsWhite: false }
                ];
                onCheckpoint({ mode: 'auto', games: batch, batch: next });
                await new Promise(resolve => { window.completeSecondChartGroup = resolve; });
                next[1].score = 0.5;
                const games = [...batch, ...next];
                onCheckpoint({ mode: 'auto', games, batch: [] });
                return { mode: 'auto', games };
            }
        ` }));
        await page.addInitScript(mockUserscript, { behaviour: 'moves' });
        await page.goto(`${url}/tools/eloeye/index.html?fast`);
        await page.evaluate(protocol => localStorage.setItem('acasEloCheckpoint', JSON.stringify({
            version: 2, protocol, mode: 'auto', total: 4, boards: 2, games: [], batch: []
        })), measurementProtocol);
        await page.reload();
        await page.click('#start');
        await page.waitForFunction(() => window.completeChartGroup);
        assert.equal(await page.locator('#range-chart').isHidden(), true);
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('acasEloCheckpoint')).rangeHistory), []);
        await page.evaluate(() => window.completeChartGroup());
        await page.waitForFunction(() => window.completeSecondChartGroup);
        await page.waitForSelector('#range-chart:not([hidden])');
        assert.equal(await page.locator('#range-chart-svg .elo-chart-point').count(), 1);
        assert.equal(await page.locator('#range-chart-svg .elo-chart-point').getAttribute('cx'), '44');
        assert.equal(await page.locator('#range-chart-svg .elo-chart-projection').count(), 1);
        assert.equal(await page.locator('#range-chart-svg .elo-chart-projection').getAttribute('x2'), '424');
        assert.deepEqual(await page.locator('.elo-chart-projection').evaluate(element => ({
            effect: getComputedStyle(element).vectorEffect,
            width: getComputedStyle(element).strokeWidth
        })), { effect: 'non-scaling-stroke', width: '3px' });
        assert.equal(await page.locator('#range-chart-projection-key').isVisible(), true);
        assert.match(await page.locator('#range-chart-svg').getAttribute('aria-label'), /not a prediction/i);
        assert.ok(await page.locator('#range-chart-svg').evaluate(element => {
            const rect = element.getBoundingClientRect();
            return Math.abs(rect.height - innerHeight * 0.8) < 1
                && Math.abs(element.viewBox.baseVal.height / 440 - rect.height / rect.width) < 0.01;
        }));
        const currentLabel = page.locator('#range-chart-svg .elo-chart-current-label');
        assert.equal(await currentLabel.count(), 1);
        assert.deepEqual(await currentLabel.evaluate(element => ({
            weight: getComputedStyle(element).fontWeight,
            fill: getComputedStyle(element).fill
        })), { weight: '900', fill: 'rgb(33, 58, 67)' });
        assert.equal(await currentLabel.getAttribute('y'), await page.locator('#range-chart-svg .elo-chart-projection').getAttribute('y1'));
        const firstPoint = await page.evaluate(() => JSON.parse(localStorage.getItem('acasEloCheckpoint')).rangeHistory[0]);
        assert.equal(await currentLabel.textContent(), String(Math.round(firstPoint.rating)));
        assert.match(await page.locator('#range-chart-svg').getAttribute('aria-label'), /After 2 matches.*estimated range/i);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('acasEloCheckpoint')).rangeHistory.length), 1);
        await page.locator('#range-chart-svg').hover();
        assert.match(await page.locator('#range-chart-readout').textContent(), /^2 matches: \d+ Elo/);
        await page.mouse.move(0, 0);
        assert.equal(await page.locator('#range-chart-readout').isHidden(), true);
        assert.ok(await page.locator('#range-chart').evaluate(element => element.getBoundingClientRect().right <= innerWidth));
        assert.equal(await page.locator('.elo-live-summary > #range-chart').count(), 1);
        assert.equal(await page.locator('#live-estimate #range-chart').count(), 0);
        assert.ok(await page.locator('#range-chart').evaluate(element => {
            const chart = element.getBoundingClientRect();
            const card = document.getElementById('live-estimate').getBoundingClientRect();
            return chart.top >= card.bottom && Math.abs(chart.width - element.parentElement.getBoundingClientRect().width) < 1;
        }));
        assert.equal(await page.locator('#live-range > #match-status').count(), 1);
        assert.equal(await page.locator('#range-chart-title, .elo-range-chart-note').count(), 0);
        assert.ok(Number(await page.locator('#range-chart-svg').evaluate(element => getComputedStyle(element).fontWeight)) >= 600);
        const fontSizes = () => page.locator('#range-chart-svg').evaluate(element => ({
            axis: parseFloat(getComputedStyle(element.querySelector('text')).fontSize) * element.getScreenCTM().a,
            legend: parseFloat(getComputedStyle(document.querySelector('.elo-range-chart-legend')).fontSize)
        }));
        await page.waitForFunction(() => document.getElementById('range-chart-svg').style.fontSize);
        const mobileFonts = await fontSizes();
        assert.ok(mobileFonts.axis >= 9 && mobileFonts.axis <= 14);
        assert.equal(mobileFonts.legend, 14);
        await page.evaluate(() => window.completeSecondChartGroup());
        await page.waitForFunction(() => document.getElementById('estimate-label').textContent === 'Estimated range');
        assert.equal(await page.locator('#range-chart-svg polygon').count(), 1);
        assert.equal(await page.locator('#range-chart-svg polyline').count(), 1);
        assert.deepEqual(await page.locator('.elo-chart-estimate').evaluate(element => ({
            effect: getComputedStyle(element).vectorEffect,
            width: getComputedStyle(element).strokeWidth
        })), { effect: 'non-scaling-stroke', width: '3px' });
        assert.equal(await page.locator('#range-chart-svg .elo-chart-projection').count(), 0);
        assert.equal(await page.locator('#range-chart-projection-key').isHidden(), true);
        const labels = await page.locator('#range-chart-svg text').allTextContents();
        assert.equal(await page.locator('#range-chart-svg > text').count(), 0);
        const axis = labels.map(Number);
        assert.ok(axis.every((value, index) => !index || value < axis[index - 1]));
        assert.equal(await currentLabel.getAttribute('y'), await page.locator('#range-chart-svg .elo-chart-point').getAttribute('cy'));
        const plotted = await page.locator('#range-chart-svg polyline').getAttribute('points');
        assert.match(plotted, /^44\.00,.* 424\.00,/);
        const history = await page.evaluate(() => JSON.parse(localStorage.getItem('acasEloCheckpoint')).rangeHistory);
        assert.equal(history.length, 2);
        const readout = point => `${point.matches} matches: ${Math.round(point.rating)} Elo (${Math.floor(point.low)}–${Math.ceil(point.high)})`;
        const svg = page.locator('#range-chart-svg');
        await svg.scrollIntoViewIfNeeded();
        const box = await svg.boundingBox();
        const position = x => ({ x: box.x + box.width * x / 440, y: box.y + box.height / 2 });
        const first = position(50), last = position(418);
        await page.mouse.move(first.x, first.y);
        assert.equal(await page.locator('#range-chart-readout').textContent(), readout(history[0]));
        assert.equal(await page.locator('.elo-chart-selection').getAttribute('x1'), '44');
        await page.mouse.click(last.x, last.y);
        assert.equal(await svg.evaluate(element => getComputedStyle(element).outlineStyle), 'none');
        await page.mouse.move(0, 0);
        assert.equal(await page.locator('#range-chart-readout').textContent(), readout(history[1]));
        assert.equal(await page.locator('#range-chart-readout').isVisible(), true);
        await page.touchscreen.tap(first.x, first.y);
        assert.equal(await page.locator('#range-chart-readout').textContent(), readout(history[0]));
        assert.ok(await page.locator('#range-chart-readout').evaluate(element => {
            const rect = element.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth;
        }));
        const touchSession = await page.context().newCDPSession(page);
        const swipe = async (dx, dy) => {
            const rect = await svg.boundingBox();
            const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
            await touchSession.send('Input.dispatchTouchEvent', {
                type: 'touchStart', touchPoints: [{ x, y }]
            });
            assert.equal(await page.locator('#range-chart-readout').isHidden(), true);
            for(let step = 1; step <= 5; step++) {
                await touchSession.send('Input.dispatchTouchEvent', {
                    type: 'touchMove', touchPoints: [{ x: x + dx * step / 5, y: y + dy * step / 5 }]
                });
            }
            await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        };
        await swipe(100, 2);
        assert.equal(await page.locator('#range-chart-readout').textContent(), readout(history[1]));
        assert.equal(await page.locator('#range-chart-readout').isVisible(), true);
        await swipe(-100, 2);
        assert.equal(await page.locator('#range-chart-readout').textContent(), readout(history[0]));
        const scrollBefore = await page.evaluate(() => scrollY);
        await swipe(2, -100);
        assert.equal(await page.locator('#range-chart-readout').isHidden(), true);
        await page.waitForFunction(before => scrollY > before, scrollBefore);
        await svg.scrollIntoViewIfNeeded();
        await swipe(2, 100);
        assert.equal(await page.locator('#range-chart-readout').isHidden(), true);
        await touchSession.detach();
        await svg.focus();
        await page.keyboard.press('End');
        assert.equal(await page.locator('#range-chart-readout').textContent(), readout(history[1]));
        await page.keyboard.press('ArrowLeft');
        assert.equal(await page.locator('#range-chart-readout').textContent(), readout(history[0]));
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#range-chart-readout').isHidden(), true);
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        assert.equal(await svg.evaluate(element => document.activeElement === element), true);
        assert.equal(await svg.evaluate(element => getComputedStyle(element).outlineStyle), 'none');
        assert.equal(await page.locator('#range-chart-keyboard').isVisible(), true);
        await page.keyboard.press('MediaPlayPause');
        assert.equal(await svg.evaluate(element => getComputedStyle(element).outlineStyle), 'none');
        await page.reload();
        await page.waitForSelector('#range-chart:not([hidden])');
        assert.match(await page.locator('#range-chart-svg').getAttribute('aria-label'), /After 4 matches/);
        assert.equal(await page.locator('#range-chart-svg polyline').count(), 1);
        await page.locator('#range-chart-svg').focus();
        await page.keyboard.press('Home');
        assert.equal(await page.locator('#range-chart-readout').textContent(), readout(history[0]));
        await page.setViewportSize({ width: 390, height: 700 });
        await page.waitForFunction(() => Math.abs(document.getElementById('range-chart-svg').getBoundingClientRect().height - innerHeight * 0.8) < 1);
        assert.equal(await page.locator('#range-chart-readout').textContent(), readout(history[0]));
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForFunction(() => {
            const svg = document.getElementById('range-chart-svg');
            return Math.abs(parseFloat(svg.style.fontSize) * svg.getScreenCTM().a - 13) < 0.1;
        });
        const desktopFonts = await fontSizes();
        assert.ok(desktopFonts.axis >= 12.9 && desktopFonts.axis <= 13.1);
        assert.equal(desktopFonts.legend, 14);
        assert.deepEqual(await page.evaluate(() => {
            const style = getComputedStyle(document.querySelector('.elo-chart-estimate'));
            return { effect: style.vectorEffect, width: style.strokeWidth };
        }), { effect: 'none', width: '2px' });
        assert.equal(await svg.getAttribute('viewBox'), '0 0 440 340');
        assert.equal(await currentLabel.getAttribute('y'), await page.locator('#range-chart-svg .elo-chart-point').getAttribute('cy'));
        assert.equal(await page.locator('#range-chart-readout').textContent(), readout(history[0]));
        assert.ok(await svg.evaluate(element => {
            const rect = element.getBoundingClientRect();
            const grid = element.querySelector('.elo-chart-grid').getBoundingClientRect();
            const labels = [...element.querySelectorAll('g text')].map(label => label.getBoundingClientRect());
            return grid.left - rect.left <= 45 && rect.right - grid.right <= 17
                && labels.every(label => label.left >= rect.left && label.right < grid.left);
        }));
        assert.ok(await page.locator('#live-estimate').evaluate(element =>
            element.getBoundingClientRect().width <= 340 && element.getBoundingClientRect().width < document.getElementById('run').getBoundingClientRect().width));
        assert.ok(await page.locator('#range-chart').evaluate(element =>
            Math.abs(element.getBoundingClientRect().width - document.getElementById('run').getBoundingClientRect().width) < 1));
        await page.click('#start');
        assert.equal(await page.locator('#range-chart').isHidden(), true);
        assert.equal(await page.locator('#range-chart-readout').isHidden(), true);
        assert.equal(await page.evaluate(() => localStorage.getItem('acasEloCheckpoint')), null);
    } finally {
        await browser.close();
        server.close();
        if(previousIsolate === undefined) delete process.env.ISOLATE;
        else process.env.ISOLATE = previousIsolate;
    }
});
