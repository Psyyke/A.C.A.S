import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

test('workflow connectors overlap preceding borders and mobile result actions fill their row', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ deviceScaleFactor: 2 });
        await page.goto(`${url}/tools/doppelmaia/`);
        await page.waitForFunction(() => !document.querySelector('#games').disabled);
        await page.evaluate(async () => {
            document.querySelector('#training-import-details').dataset.ready = 'true';
            document.querySelector('#stop').hidden = false;
            document.querySelector('#start').textContent = 'Start training "enpassant1976"';
            for(const id of ['training-step', 'diagnostics', 'training-result', 'use-in-app', 'download-weights', 'download-report'])
                document.getElementById(id).hidden = false;
            const { drawLearningChart } = await import('./charts.js');
            drawLearningChart(document.querySelector('#loss-chart'), [
                { epoch: 0, trainLoss: 1, validationLoss: 1 },
                { epoch: 1, trainLoss: 0.8, validationLoss: 0.9 }
            ]);
            document.querySelector('#result-summary').innerHTML = '<dl class="maia-result-metrics"><dt>New positions</dt></dl>';
        });
        const source = readFileSync(new URL('../tools/doppelmaia/personalized-maia.js', import.meta.url), 'utf8');
        const renderPersonality = source.slice(source.indexOf('function showPersonalityMetrics('),
            source.indexOf("window.addEventListener('beforeunload'"));
        await page.evaluate(render => {
            new Function('$', `${render}; showPersonalityMetrics({
                baselineScore: 0.12345, learnedScore: 0.23456, targetScore: 0.34567,
                baselineKL: 0.45678, learnedKL: 0.12345
            });`)(selector => document.querySelector(selector));
        }, renderPersonality);
        assert.equal(await page.locator('#personality-metrics > div').count(), 2);
        assert.equal(await page.locator('#personality-report dt').filter({ hasText: 'Distillation status' }).count(), 0);
        assert.equal(await page.locator('#personality-report .personality-status').isVisible(), true);
        assert.equal(await page.locator('#personality-report > p:not(.personality-status)').count(), 0);
        assert.equal(await page.locator('#personality-report + #result-engine + .maia-actions').count(), 1);
        assert.equal(await page.locator('#personality-report').evaluate(element =>
            getComputedStyle(element).paddingBottom), '0px');
        assert.deepEqual(await page.locator('#personality-metrics dt').allTextContents(), ['Target score', 'KL to target']);
        assert.equal(await page.locator('#personality-metrics > div > dd').first().textContent(), '0.12345 → 0.23456 (requested 0.34567)');
        assert.equal(await page.locator('#personality-metrics > div > dd').last().textContent(), '0.45678 → 0.12345 (requested 0.00000)');
        assert.equal(await page.locator('#personality-report').evaluate(element =>
            getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)');
        assert.equal(await page.locator('#personality-metrics > div > dd').first().evaluate(element =>
            getComputedStyle(element).fontSize), '24px');
        assert.equal(await page.locator('#personality-report .personality-status').evaluate(element =>
            getComputedStyle(element).fontSize), '14px');
        for(const selector of ['.maia-legend', '.maia-counters dt', '.tool-file-picker > [role="status"]',
            '.maia-chart-grid small', '.maia-chart-grid svg text', '.maia-result-metrics dt', '#status']) {
            const weights = await page.locator(selector).evaluateAll(elements => elements.map(element => getComputedStyle(element).fontWeight));
            assert(weights.length > 0, selector);
            assert(weights.every(weight => weight === '500'), `${selector}: ${weights}`);
        }
        assert.equal(await page.locator('#status').evaluate(element => getComputedStyle(element).textAlign), 'center');
        for(const width of [360, 390, 600, 1200]) {
            await page.setViewportSize({ width, height: 900 });
            const result = await page.evaluate(() => {
                const steps = [...document.querySelectorAll('.maia-flow-step')];
                const overlap = steps.map(step => {
                    let previous = step.previousElementSibling;
                    while(previous.hidden) previous = previous.previousElementSibling;
                    const style = getComputedStyle(step), connector = getComputedStyle(step, '::before');
                    const rect = step.getBoundingClientRect();
                    const top = rect.bottom - parseFloat(style.borderBottomWidth)
                        - parseFloat(connector.bottom) - parseFloat(connector.height);
                    return previous.getBoundingClientRect().bottom - top;
                });
                const actions = document.querySelector('#training-result > .maia-actions');
                const start = document.querySelector('#start').getBoundingClientRect();
                const stop = document.querySelector('#stop').getBoundingClientRect();
                const details = document.querySelector('#training-import-details');
                const detailsStyle = getComputedStyle(details), arrow = getComputedStyle(details, '::after');
                const borderWidth = parseFloat(detailsStyle.borderBottomWidth);
                const arrowStart = parseFloat(arrow.marginTop) - 1.5;
                return {
                    connectorWidths: [...steps.map(step => getComputedStyle(step, '::before').width),
                        getComputedStyle(details, '::before').width, arrow.width],
                    connectorHeights: steps.map(step => getComputedStyle(step, '::before').height),
                    startWidth: start.width, stopWidth: stop.width,
                    startTop: start.top, stopTop: stop.top,
                    borderWidth, arrowStart,
                    overlap,
                    widths: [...actions.children].map(element => element.getBoundingClientRect().width),
                    available: actions.getBoundingClientRect().width,
                    overflow: document.documentElement.scrollWidth > innerWidth
                };
            });
            assert(result.overlap.every(value => value >= 1), `${width}: ${result.overlap}`);
            assert(result.connectorWidths.every(value => value === '40px'), `${width}: wider drop connectors`);
            assert(result.connectorHeights.every(value => value === '68px'), `${width}: taller flow arrows`);
            assert.equal(result.borderWidth, 5);
            if(width <= 600) {
                assert(Math.abs(result.startWidth - result.stopWidth) < 1, `${width}: equal training button widths`);
                assert(result.stopTop > result.startTop, `${width}: stacked training buttons`);
            } else {
                assert(result.stopWidth < result.startWidth, `${width}: compact Stop button`);
                assert.equal(result.stopTop, result.startTop, `${width}: inline training buttons`);
            }
            assert(result.arrowStart >= 0 && result.arrowStart < result.borderWidth,
                `${width}: connector starts inside the bottom border`);
            if(width <= 600)
                assert(result.widths.every(value => Math.abs(value - result.available) < 1));
            assert.equal(result.overflow, false);
        }
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
