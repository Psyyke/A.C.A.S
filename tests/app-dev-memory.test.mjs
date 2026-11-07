import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

test('dev board churn releases observers, listeners and detached boards after GC', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.route('**/*', route => new URL(route.request().url()).origin === url
            ? route.continue() : route.abort());
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
            window.listenerBalance = {};
            const add = EventTarget.prototype.addEventListener;
            const remove = EventTarget.prototype.removeEventListener;
            EventTarget.prototype.addEventListener = function(type, ...args) {
                window.listenerBalance[type] = (window.listenerBalance[type] || 0) + 1;
                return add.call(this, type, ...args);
            };
            EventTarget.prototype.removeEventListener = function(type, ...args) {
                window.listenerBalance[type] = (window.listenerBalance[type] || 0) - 1;
                return remove.call(this, type, ...args);
            };
            const Original = window.ResizeObserver;
            window.activeResizeObservers = 0;
            window.ResizeObserver = class extends Original {
                active = false;
                observe(...args) {
                    if (!this.active) {
                        this.active = true;
                        window.activeResizeObservers++;
                    }
                    return super.observe(...args);
                }
                disconnect() {
                    if (this.active) {
                        this.active = false;
                        window.activeResizeObservers--;
                    }
                    super.disconnect();
                }
            };
        });
        await page.goto(`${url}/app/dev/`);
        await page.waitForFunction(() => typeof window.ChessgroundX === 'function');
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Performance.enable');
        async function measure() {
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await cdp.send('HeapProfiler.collectGarbage');
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
            await cdp.send('HeapProfiler.collectGarbage');
            const dom = await cdp.send('Memory.getDOMCounters');
            const { metrics } = await cdp.send('Performance.getMetrics');
            return { ...dom, heapBytes: metrics.find(metric => metric.name === 'JSHeapUsedSize').value,
                listeners: await page.evaluate(() => window.listenerBalance) };
        }
        async function churn(count) {
            await page.evaluate(async count => {
                const { init } = await import('/app/dev/test-modules/short-edge.js');
                for (let i = 0; i < count; i++) {
                    const holder = document.createElement('div');
                    holder.className = 'cg-wrap';
                    holder.style.cssText = 'width:320px;height:320px';
                    document.querySelector('#left-content').appendChild(holder);
                    const cg = window.ChessgroundX(holder, {
                        fen: 'start', animation: { enabled: true, duration: 220 }
                    });
                    for (let flip = 0; flip < 5; flip++) cg.toggleOrientation();
                    cg.move('e2', 'e4');
                    const rect = cg.state.dom.elements.board.getBoundingClientRect();
                    const event = new MouseEvent('mousedown', {
                        clientX: rect.left + 20, clientY: rect.top + 20,
                        button: i % 2 ? 0 : 2, bubbles: true, cancelable: true
                    });
                    if (i % 2) cg.dragNewPiece({ role: 'p-piece', color: 'white' }, false, event);
                    else cg.state.dom.elements.board.dispatchEvent(event);
                    if (!cg.state.draggable.current && !cg.state.drawable.current)
                        throw new Error('Drag or drawing did not start');
                    cg.destroy();
                    cg.destroy();
                    if (cg.state.draggable.current || cg.state.drawable.current || cg.state.animation.current)
                        throw new Error('Board animation state survived destruction');
                    holder.remove();
                    if (window.activeResizeObservers !== 0) throw new Error('Board observer was retained');
                    const container = document.createElement('div');
                    document.querySelector('#left-content').appendChild(container);
                    const controller = new AbortController();
                    const scenario = await init(container, {
                        test: { title: 'Memory churn', actions: [{ flip: true, vanish: 'e4', delayMs: 1000 }, { reset: true }] },
                        signal: controller.signal
                    });
                    controller.abort();
                    scenario.destroy();
                    container.remove();
                    if (window.activeResizeObservers !== 0) throw new Error('Scenario observer was retained');
                }
            }, count);
        }
        await churn(200);
        const baseline = await measure();
        const samples = [];
        for (let batch = 0; batch < 5; batch++) {
            await churn(100);
            const sample = await measure();
            samples.push(sample);
            assert.equal(await page.evaluate(() => window.activeResizeObservers), 0);
            assert.equal(await page.locator('#left-content cg-board').count(), 0);
            assert.ok(sample.documents <= baseline.documents + 1, `Documents grew: ${JSON.stringify({ baseline, sample })}`);
            assert.ok(sample.nodes <= baseline.nodes + 100, `Detached DOM grew: ${JSON.stringify({ baseline, sample })}`);
            assert.deepEqual(sample.listeners, baseline.listeners);
            assert.ok(sample.jsEventListeners <= baseline.jsEventListeners + 20, `Listeners grew: ${JSON.stringify({ baseline, sample })}`);
            assert.ok(sample.heapBytes <= baseline.heapBytes + 1024 * 1024, `Post-GC heap grew over 1 MiB: ${JSON.stringify({ baseline, sample })}`);
        }
        assert.ok(samples.at(-1).heapBytes <= samples[2].heapBytes + 128 * 1024, 'Heap did not plateau in the last three batches');
        assert.deepEqual(errors, []);
        console.log('Post-GC board churn:', JSON.stringify([baseline, ...samples].map(({ listeners, ...metrics }) => metrics)));
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('live restart failures retain backoff without accumulating history entries or checkpoints', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.route('**/*', route => new URL(route.request().url()).origin === url
            ? route.continue() : route.abort());
        await page.addInitScript(() => {
            window.documentIdentity = crypto.randomUUID();
            window.Worker = class {
                constructor() { throw new Error('Deliberate opponent startup failure'); }
            };
        });
        await page.goto(`${url}/app/dev/`);
        await page.locator('.test-btn').first().click();
        await page.waitForSelector('.live-status');
        const historyLength = await page.evaluate(() => history.length);
        for (let index = 0; index < 12; index++) {
            const delay = Math.min(30, 5 * 2 ** Math.min(index, 3));
            assert.match(await page.locator('.live-status').textContent(), new RegExp(`Restarting in ${delay} s`));
            const identity = await page.evaluate(() => window.documentIdentity);
            await page.locator('.live-new').click();
            await page.waitForFunction(identity => window.documentIdentity !== identity, identity);
            await page.waitForSelector('.live-status');
            assert.equal(await page.evaluate(() => history.length), historyLength);
            assert.equal(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('acas-dev-live-resume-')).length), 0);
            assert.equal(await page.evaluate(async () => (await import('/app/dev/test-modules/live.js')).liveStatistics.games.length), index + 2);
        }
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
