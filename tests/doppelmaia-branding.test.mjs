import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const withoutScripts = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const styledHtml = (html, css) => withoutScripts(html).replace('</head>', `<style>${css}</style></head>`);
const appearance = element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundImage, fill: style.backgroundColor, border: style.borderColor, color: style.color };
};

test('DoppelMaia explains that training needs the tab to stay open', async () => {
    const html = await read('../tools/doppelmaia/index.html');
    assert.match(html, /<details id="training-tab-faq"><summary>It stops when I leave the tab<\/summary>/);
    assert.match(html, /Keep DoppelMaia open and stay on this tab for the entire training run/);
});

test('research notebook keeps its evidence and mobile layout readable', { timeout: 60000 }, async () => {
    const [html, home, tools, local, index] = await Promise.all([
        '../tools/doppelmaia/research.html', '../assets/css/home.css', '../tools/tools.css',
        '../tools/doppelmaia/personalized-maia.css', '../tools/doppelmaia/index.html'
    ].map(read));
    assert.match(index, /href="research\.html"/);
    assert.match(html, /rel="canonical" href="https:\/\/psyyke.github.io\/A\.C\.A\.S\/tools\/doppelmaia\/research\.html"/);
    assert.match(await read('../sitemap.xml'), /tools\/doppelmaia\/research\.html/);
    const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    try {
        const page = await browser.newPage({ javaScriptEnabled: false });
        await page.route('**/*', route => route.abort());
        await page.setContent(styledHtml(index, home + tools + local));
        const gold = await page.locator('#start').evaluate(appearance);
        await page.setContent(styledHtml(html, home + tools + local));
        assert.deepEqual(await page.locator('article .install-button').evaluate(appearance), gold);
        assert.equal(await page.locator('#research-phase-results tbody tr').count(), 5);
        assert.equal(await page.locator('#research-budget-results tbody tr').count(), 4);
        assert.equal(await page.locator('#research-timing-results tbody tr').count(), 2);
        assert.equal(await page.locator('#research-creative-screen tbody tr').count(), 10);
        assert.equal(await page.locator('#research-creative-followup tbody tr').count(), 6);
        const prose = await page.locator('article').evaluate(article => {
            const copy = article.cloneNode(true);
            for(const code of copy.querySelectorAll('pre, code')) code.remove();
            return copy.textContent;
        });
        assert.match(prose, /do not establish an unavoidable accuracy ceiling/);
        assert.match(prose, /not directly comparable with our 61\.55%/);
        assert.match(prose, /no packaged release or trained prototype weights/);
        assert.match(prose, /kept the ordinary browser trainer as the default/);
        for(const width of [360, 768, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false,
                `Research page overflows at ${width}px`);
            if(width >= 768)
                assert.equal(await page.locator('.maia-table-wrap').evaluateAll(tables =>
                    tables.some(table => table.scrollWidth > table.clientWidth)), false);
        }
    } finally { await browser.close(); }
});

test('DoppelMaia keeps its training steps visible and the app header compact', { timeout: 60000 }, async () => {
    const [html, home, tools, local] = await Promise.all([
        '../tools/doppelmaia/index.html', '../assets/css/home.css', '../tools/tools.css',
        '../tools/doppelmaia/personalized-maia.css'
    ].map(read));
    const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    try {
        const page = await browser.newPage({ javaScriptEnabled: false });
        await page.route('**/*', route => route.abort());
        await page.setContent(styledHtml(html, home + tools + local));
        assert.equal(await page.locator('#training-step').isVisible(), true);
        assert.equal(await page.locator('#base-network').isDisabled(), true);
        assert.equal(await page.locator('#training-controls').evaluate(element => element.inert), true);
        assert.equal(await page.locator('.maia-workbench > .maia-step').count(), 2);
        for(const width of [360, 768, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            const layout = await page.locator('.maia-workbench').evaluate(container => {
                const heading = container.querySelector('#dataset-heading'), step = container.querySelector('#dataset-step');
                const title = document.querySelector('.doppelmaia-title'), logo = title.querySelector('svg');
                return {
                    headingGap: heading.getBoundingClientRect().top - container.getBoundingClientRect().top,
                    stepMargin: getComputedStyle(step).marginTop,
                    stepPadding: getComputedStyle(step).paddingTop,
                    headingBorder: getComputedStyle(heading).borderBottomWidth,
                    logoWidth: logo.getBoundingClientRect().width, logoHeight: logo.getBoundingClientRect().height,
                    logoRight: logo.getBoundingClientRect().left > title.querySelector('strong').getBoundingClientRect().right,
                    overflow: document.documentElement.scrollWidth > innerWidth
                };
            });
            assert.ok(layout.headingGap <= 24, `${width}: ${JSON.stringify(layout)}`);
            assert.equal(layout.stepMargin, '0px');
            assert.equal(layout.stepPadding, '0px');
            assert.equal(layout.headingBorder, '0px');
            assert.equal(layout.logoWidth, width <= 600 ? 36 : 44);
            assert.equal(layout.logoHeight, layout.logoWidth);
            assert.equal(layout.logoRight, true);
            assert.equal(layout.overflow, false);
        }
    } finally { await browser.close(); }
});

test('download actions and the personality mark stay usable on mobile', async () => {
    const [html, home, tools, local] = await Promise.all([
        '../tools/doppelmaia/index.html', '../assets/css/home.css', '../tools/tools.css',
        '../tools/doppelmaia/personalized-maia.css'
    ].map(read));
    const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    try {
        const page = await browser.newPage({ javaScriptEnabled: false });
        await page.setContent(styledHtml(html, home + tools + local));
        const eyes = await page.locator('.doppelmaia-alien ellipse[fill="currentColor"]').evaluateAll(elements =>
            elements.map(element => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })));
        assert.equal(eyes.length, 2);
        assert.ok(eyes[0].right < eyes[1].left);
        await page.evaluate(() => {
            document.querySelectorAll('.elo-guide details').forEach(element => element.open = true);
            for(const element of document.querySelectorAll('.maia-actions > *')) {
                element.hidden = false;
                element.disabled = false;
                if(element.tagName === 'A') element.href = '#download';
            }
        });
        for(const width of [320, 360, 768, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            for(const id of ['download-data', 'download-weights', 'download-report']) {
                const button = page.locator(`#${id}`);
                if(!await button.count()) continue;
                assert.equal(await button.evaluate(element => getComputedStyle(element).color), 'rgb(33, 58, 67)');
                assert.equal(await button.evaluate(element => getComputedStyle(element).textDecorationLine), 'none');
            }
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false,
                `Page overflows at ${width}px`);
        }
    } finally { await browser.close(); }
});
