import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright';
import { parseGameFiles, buildDataset } from '../tools/doppelmaia/data.js';
import { startServer } from './maia-elo/serve.mjs';

const source = new URL('../tools/doppelmaia/export-matches.html', import.meta.url);
const makePgn = (id, moves = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5') =>
    `[Event "Public game"]\n[Site "https://lichess.org/${id}"]\n[White "Example"]\n[Black "Opponent"]\n[Result "1-0"]\n\n${moves} 1-0`;
const pgnA = makePgn('game0001');
const pgnB = makePgn('game0002', '1. d4 d5 2. c4 e6 3. Nc3 Nf6');
const lichessGame = (id, pgn) => ({ id, variant: 'standard', status: 'resign', pgn });
const chessGame = (id, pgn, date) => ({ url: `https://www.chess.com/game/live/${id}`, rules: 'chess', pgn,
    end_time: Date.parse(date) / 1000 });

async function localPage(run, headed = false) {
    const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER, headless: !headed });
    const context = await browser.newContext({ acceptDownloads: true });
    try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await run(page, context);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
}

async function start(page, site = 'lichess', maximum = 2) {
    await page.goto(source.href);
    await page.locator('#site').selectOption(site);
    await page.locator('#username').fill('Example');
    await page.locator('#maximum').fill(String(maximum));
    await page.locator('#collect').click();
}

async function savedText(page) {
    assert.equal(await page.locator('#save').evaluate(element => element.classList.contains('install-button')), true);
    assert.equal(await page.locator('#collect').evaluate(element => element.classList.contains('install-button')), false);
    const pending = page.waitForEvent('download');
    await page.locator('#save').click();
    const download = await pending;
    return { name: download.suggestedFilename(), text: await readFile(await download.path(), 'utf8') };
}

test('downloaded exporter is self contained and matches the responsive tool design', async () => {
    const html = await readFile(source, 'utf8');
    const index = await readFile(new URL('../tools/doppelmaia/index.html', import.meta.url), 'utf8');
    assert.match(index, /href="\.\.\/game-exporter\/">Export Matches/);
    assert.doesNotMatch(html, /<script[^>]+src=/i);
    const icon = html.match(/<link rel="icon" type="image\/x-icon" href="data:image\/x-icon;base64,([A-Za-z0-9+/=]+)">/);
    assert.ok(icon);
    assert.deepEqual(Buffer.from(icon[1], 'base64'), await readFile(new URL('../favicon.ico', import.meta.url)));
    assert.doesNotMatch(html.replace(icon[0], ''), /<link[^>]+href=/i);
    const styles = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    assert.doesNotMatch(styles, /@import|@font-face|url\(/i);
    assert.ok(Buffer.byteLength(html.replace(icon[0], '')) < 40 * 1024, 'Keep the standalone utility below 40 KiB excluding its embedded favicon');
    await localPage(async page => {
        const requests = [];
        page.on('request', request => { if(/^https?:/.test(request.url())) requests.push(request.url()); });
        await page.goto(source.href);
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.evaluate(() => document.fonts.size), 0);
        assert.deepEqual(await page.locator('#status').evaluate(element => {
            const properties = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color'];
            const status = getComputedStyle(element);
            const label = getComputedStyle(document.querySelector('.tool-field'));
            return properties.map(property => status[property] === label[property]);
        }), [true, true, true, true, true]);
        for(const selector of ['body', '#collect', '#username', '#site', '#maximum', '#since', '#until']) {
            assert.equal(await page.locator(selector).evaluate(element => getComputedStyle(element).fontFamily), 'monospace');
        }
        assert.equal(await page.locator('#site option[value="lichess"]').textContent(), 'Lichess.org');
        assert.deepEqual(await page.locator('body').evaluate(element => {
            const style = getComputedStyle(element);
            return [style.backgroundColor, style.backgroundSize, style.backgroundPosition];
        }), ['rgb(32, 32, 32)', '160px 160px, 160px 160px', '0px 0px, 80px 80px']);
        assert.equal(await page.locator('#collect').isEnabled(), true);
        assert.equal(await page.locator('h1, .intro').count(), 0);
        for(const width of [320, 360, 768, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            assert.deepEqual(await page.locator('main').evaluate(element => {
                const style = getComputedStyle(element);
                return [style.borderBottomColor, style.borderBottomWidth];
            }), ['rgba(0, 0, 0, 0)', '15px']);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            const centered = await page.locator('main').evaluate(element => {
                const rect = element.getBoundingClientRect();
                return Math.abs(rect.x + rect.width / 2 - innerWidth / 2) < 1 &&
                    (rect.height > innerHeight - 32 ? Math.abs(rect.y - 16) < 1 :
                        Math.abs(rect.y + rect.height / 2 - innerHeight / 2) < 1);
            });
            assert.equal(centered, true);
            assert.equal(await page.locator('header, footer, nav, .nav-burger').count(), 0);
        }
        assert.equal(await page.locator('article, section, h2').count(), 0);
        assert.equal(await page.locator('main.tool-panel').count(), 1);
        await page.setViewportSize({ width: 320, height: 300 });
        assert.equal(await page.locator('details').count(), 0);
        assert.equal(await page.locator('#maximum').isVisible(), true);
        assert.equal(await page.locator('.more-options').evaluate(element => getComputedStyle(element).borderTopWidth), '1px');
        assert.ok((await page.locator('main').boundingBox()).y >= 16);
        await page.locator('#export-help').scrollIntoViewIfNeeded();
        assert.equal(await page.locator('#export-help').isVisible(), true);
        assert.equal(await page.locator('#export-help').isVisible(), true);
        assert.equal(await page.locator('p#status').count(), 1);
        assert.equal(await page.locator('#diagnostics').count(), 0);
        assert.equal(await page.locator('#log').count(), 0);
        assert.equal(await page.locator('#export-help a').first().getAttribute('href'),
            'https://psyyke.github.io/A.C.A.S/tools/doppelmaia/');
        assert.match(await page.locator('#export-help').textContent(), /100 MiB import limit/);
        assert.match(await page.locator('#collect').evaluate(element => getComputedStyle(element).backgroundImage), /rgb\(227, 184, 68\)/);
        assert.deepEqual(requests, []);
    });
});

test('local Lichess export uses no cookies or referrer and produces importable games', async () => {
    await localPage(async (page, context) => {
        await context.addCookies([{ name: 'login', value: 'test-cookie', domain: 'lichess.org', path: '/', secure: true }]);
        const requests = [];
        await page.route('https://lichess.org/api/games/user/**', async route => {
            const request = route.request(), headers = await request.allHeaders();
            requests.push({ url: new URL(request.url()), headers });
            await route.fulfill({ contentType: 'application/x-ndjson', headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify(lichessGame('game0001', pgnA)) + '\n' + JSON.stringify(lichessGame('game0002', pgnB)) });
        });
        await start(page);
        await page.waitForFunction(() => document.querySelector('#save').hidden === false, null, { polling: 50 });
        assert.equal(requests.length, 1);
        assert.equal(requests[0].url.searchParams.get('pgnInJson'), 'true');
        assert.equal(requests[0].url.searchParams.get('ongoing'), 'false');
        assert.equal(requests[0].headers.cookie, undefined);
        assert.equal(requests[0].headers.referer, undefined);
        assert.ok(!requests[0].headers.origin || requests[0].headers.origin === 'null');
        const saved = await savedText(page);
        assert.equal(saved.name, 'lichess-Example.pgn');
        const parsed = parseGameFiles([{ name: saved.name, text: saved.text }]);
        assert.equal(parsed.games.length, 2);
        const dataset = buildDataset(parsed.games, 'example', { maxPositions: 20 });
        assert.ok(dataset.train.samples.length > 0);
        assert.ok(dataset.validation.samples.length > 0);
    });
});

test('the exact UTF-8 output boundary fits the tool import budget without truncating games', async () => {
    const preparation = await readFile(new URL('../tools/doppelmaia/preparation.js', import.meta.url), 'utf8');
    const limit = preparation.match(/files\.reduce[^\n]+>\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
    assert.ok(limit, 'The importer must retain an explicit byte budget');
    const importLimit = Number(limit[1]) * 1024 * 1024;
    await localPage(async page => {
        await page.goto(source.href);
        const result = await page.evaluate(({ first, second }) => {
            const pgn = first + ' {caf\u00e9}';
            const bytes = new TextEncoder().encode(pgn.trim() + '\n\n').byteLength;
            const run = { bytes: outputLimit - bytes, games: [], seen: new Set(), maximum: 2, skipped: 0 };
            addGame(run, 'first', pgn);
            let error;
            try { addGame(run, 'second', second); }
            catch(failure) { error = failure.message; }
            return { limit: outputLimit, bytes: run.bytes, games: run.games.length,
                rejectedIdAdded: run.seen.has('second'), error, content: run.games[0] };
        }, { first: pgnA, second: pgnB });
        assert.equal(result.limit, importLimit);
        assert.equal(result.limit, 100 * 1024 * 1024);
        assert.equal(result.bytes, importLimit);
        assert.equal(result.games, 1);
        assert.equal(result.rejectedIdAdded, false);
        assert.match(result.error, /exceed the 100 MiB import limit/);
        assert.equal(parseGameFiles([{ name: 'boundary.pgn', text: result.content }]).games.length, 1);
    });
});

test('Chess.com archives are read serially with exact UTC dates and newest games first', async () => {
    await localPage(async page => {
        const requests = [];
        await page.route('https://api.chess.com/**', async route => {
            const path = new URL(route.request().url()).pathname;
            requests.push(path);
            const data = path.endsWith('/archives') ? { archives: [
                'https://api.chess.com/pub/player/example/games/2026/09',
                'https://api.chess.com/pub/player/example/games/2026/10',
                'https://api.chess.com/pub/player/example/games/2026/11'
            ] } : { games: [
                chessGame('1', pgnA, '2026-10-10T00:00:00Z'),
                chessGame('2', pgnB, '2026-10-10T23:59:59Z'),
                chessGame('3', pgnA, '2026-10-11T00:00:00Z'),
                chessGame('4', pgnA, '2026-10-09T23:59:59Z')
            ] };
            await route.fulfill({ json: data, headers: { 'Access-Control-Allow-Origin': '*' } });
        });
        await page.goto(source.href);
        await page.locator('#site').selectOption('chesscom');
        await page.locator('#username').fill('Example');
        await page.locator('#maximum').fill('10');
        await page.locator('#since').fill('2026-10-10');
        await page.locator('#until').fill('2026-10-10');
        await page.locator('#collect').click();
        await page.waitForFunction(() => !document.querySelector('#save').hidden, null, { polling: 50 });
        assert.deepEqual(requests, ['/pub/player/example/games/archives', '/pub/player/example/games/2026/10']);
        const saved = await savedText(page);
        assert.equal(saved.name, 'chesscom-Example.pgn');
        assert.ok(saved.text.indexOf('game0002') < saved.text.indexOf('game0001'));
        assert.equal(parseGameFiles([{ name: saved.name, text: saved.text }]).games.length, 2);
    });
});

test('midstream errors preserve clearly labeled partial games rather than reporting success', async () => {
    await localPage(async page => {
        await page.route('https://lichess.org/api/games/user/**', route => route.fulfill({
            contentType: 'application/x-ndjson', headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(lichessGame('game0001', pgnA)) + '\n{broken}\n'
        }));
        await start(page, 'lichess', 20);
        await page.waitForFunction(() => document.querySelector('#status').dataset.error === 'true', null, { polling: 50 });
        assert.match(await page.locator('#status').textContent(), /invalid JSON/);
        assert.match(await page.locator('#save').textContent(), /collected so far/);
        const saved = await savedText(page);
        assert.equal(saved.name, 'lichess-Example-partial.pgn');
        assert.equal(parseGameFiles([{ name: saved.name, text: saved.text }]).games.length, 1);
    });
});

test('rate limit waits can be canceled and unknown players fail explicitly', async () => {
    await localPage(async page => {
        let count = 0;
        await page.route('https://lichess.org/api/games/user/**', route => {
            count++;
            return route.fulfill({ status: count === 1 ? 429 : 404, headers: { 'Access-Control-Allow-Origin': '*', 'Retry-After': '60' } });
        });
        await start(page);
        await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Waiting'), null, { polling: 50 });
        await page.locator('#cancel').click();
        await page.waitForFunction(() => !document.querySelector('#collect').disabled, null, { polling: 50 });
        assert.equal(count, 1);
        assert.match(await page.locator('#status').textContent(), /Collection stopped/);
        assert.equal(await page.locator('#save').isVisible(), false);
        await page.locator('#collect').click();
        await page.waitForFunction(() => document.querySelector('#status').dataset.error === 'true', null, { polling: 50 });
        assert.match(await page.locator('#status').textContent(), /not found/);
        assert.equal(await page.locator('#save').isVisible(), false);
    });
});

test('a rate limit retry waits before continuing the same request', async () => {
    await localPage(async page => {
        await page.clock.install();
        let count = 0;
        await page.route('https://lichess.org/api/games/user/**', route => {
            count++;
            return count === 1
                ? route.fulfill({ status: 429, headers: { 'Access-Control-Allow-Origin': '*', 'Retry-After': '60' } })
                : route.fulfill({ contentType: 'application/x-ndjson', headers: { 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify(lichessGame('game0001', pgnA)) + '\n' });
        });
        await start(page);
        await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Waiting'), null, { polling: 50 });
        assert.equal(count, 1);
        await page.clock.fastForward(59000);
        assert.equal(count, 1);
        await page.clock.fastForward(1000);
        await page.waitForFunction(() => !document.querySelector('#save').hidden, null, { polling: 50 });
        assert.equal(count, 2);
        assert.equal((await savedText(page)).name, 'lichess-Example.pgn');
    });
});

test('duplicate games, nonstandard games and empty collections are handled explicitly', async () => {
    await localPage(async page => {
        let empty = false;
        await page.route('https://lichess.org/api/games/user/**', route => route.fulfill({
            contentType: 'application/x-ndjson', headers: { 'Access-Control-Allow-Origin': '*' },
            body: empty ? '' : [
                lichessGame('game0001', pgnA), lichessGame('game0001', pgnA),
                { ...lichessGame('variant', pgnB), variant: 'chess960' },
                lichessGame('empty', '[Event "Empty"]\n[Result "*"]\n\n*')
            ].map(game => JSON.stringify(game)).join('\r\n')
        }));
        await start(page, 'lichess', 20);
        await page.waitForFunction(() => !document.querySelector('#save').hidden, null, { polling: 50 });
        const saved = await savedText(page);
        assert.equal(parseGameFiles([{ name: saved.name, text: saved.text }]).games.length, 1);
        assert.match(await page.locator('#status').textContent(), /2 skipped/);
        empty = true;
        await page.locator('#collect').click();
        await page.waitForFunction(() => !document.querySelector('#collect').disabled, null, { polling: 50 });
        assert.match(await page.locator('#status').textContent(), /No completed standard games/);
        assert.equal(await page.locator('#save').isVisible(), false);
    });
});

test('unexpected archive hosts are rejected before any foreign request', async () => {
    await localPage(async page => {
        const requests = [];
        page.on('request', request => requests.push(request.url()));
        await page.route('https://api.chess.com/**', route => route.fulfill({
            json: { archives: ['https://unrelated.invalid/archive'] }, headers: { 'Access-Control-Allow-Origin': '*' }
        }));
        await start(page, 'chesscom');
        await page.waitForFunction(() => document.querySelector('#status').dataset.error === 'true', null, { polling: 50 });
        assert.match(await page.locator('#status').textContent(), /unexpected archive address/);
        assert.ok(requests.every(url => !url.includes('unrelated.invalid')));
    });
});

test('hosted exporter cannot contact APIs and offers only local use', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    try {
        await localPage(async page => {
            const requests = [];
            page.on('request', request => requests.push(request.url()));
            await page.goto(`${url}/tools/doppelmaia/export-matches.html`);
            assert.equal(await page.locator('#collect').isDisabled(), true);
            assert.equal(await page.locator('#local-notice').isVisible(), true);
            await page.locator('#username').fill('Example');
            await page.locator('#export-form').dispatchEvent('submit');
            assert.match(await page.locator('#status').textContent(), /open it locally/);
            assert.ok(requests.every(address => address.startsWith(url)));
        });

    } finally { await new Promise(resolve => server.close(resolve)); }
});

test('Export Matches tool page matches site controls and keeps API collection local', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    try {
        const tools = await readFile(new URL('../tools/index.html', import.meta.url), 'utf8');
        const sitemap = await readFile(new URL('../sitemap.xml', import.meta.url), 'utf8');
        assert.match(tools, /class="tool-card" href="game-exporter\/"/);
        assert.match(sitemap, /<loc>https:\/\/psyyke\.github\.io\/A\.C\.A\.S\/tools\/game-exporter\/<\/loc>/);
        await localPage(async page => {
            const requests = [], failures = [];
            await page.route('https://**', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
            page.on('request', request => requests.push(request.url()));
            page.on('response', response => { if(response.status() >= 400) failures.push(response.url()); });
            await page.goto(`${url}/tools/game-exporter/`);
            await page.evaluate(() => document.fonts.ready);
            assert.equal(await page.locator('h1').textContent(), 'Export Matches');
            assert.equal(await page.title(), 'Export Matches / A.C.A.S');
            assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),
                'https://psyyke.github.io/A.C.A.S/tools/game-exporter/');
            assert.ok(await page.locator('meta[name="description"]').getAttribute('content'));
            const schema = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
            assert.equal(schema['@graph'][1]['@type'], 'SoftwareApplication');
            assert.equal(await page.locator('meta[name="referrer"]').getAttribute('content'), 'no-referrer');
            assert.equal(await page.locator('script[src*="adsbygoogle.js"]').count(), 1);
            const download = page.locator('#download-collector');
            assert.equal(await download.getAttribute('download'), 'export-matches.html');
            for(const width of [360, 768, 1280]) {
                await page.setViewportSize({ width, height: 900 });
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
                assert.match(await download.evaluate(element => getComputedStyle(element).backgroundImage), /rgb\(227, 184, 68\)/);
                const heights = await page.locator('.exporter-actions a').evaluateAll(elements =>
                    elements.map(element => element.getBoundingClientRect().height));
                assert.equal(heights.length, 1);
                assert.ok(heights[0] >= 54);
            }
            await page.setViewportSize({ width: 360, height: 900 });
            await page.locator('.nav-burger').click();
            assert.equal(await page.locator('.nav-burger').getAttribute('aria-expanded'), 'true');
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('.nav-burger').getAttribute('aria-expanded'), 'false');
            const pending = page.waitForEvent('download');
            await download.click();
            const saved = await pending;
            assert.equal(saved.suggestedFilename(), 'export-matches.html');
            assert.equal(await readFile(await saved.path(), 'utf8'), await readFile(source, 'utf8'));
            assert.ok(requests.every(address => !['lichess.org', 'api.chess.com'].includes(new URL(address).hostname)));
            assert.deepEqual(failures, []);
        });
    } finally { await new Promise(resolve => server.close(resolve)); }
});

test('public APIs work from a downloaded file in an ordinary desktop browser', {
    skip: process.env.DOPPELMAIA_API_TEST !== '1', timeout: 240000
}, async () => {
    await localPage(async page => {
        const headers = [];
        page.on('request', request => {
            if(/^https?:/.test(request.url())) headers.push(request.allHeaders().then(values => ({ url: request.url(), values })));
        });
        for(const [site, username] of [['lichess', 'german11'], ['chesscom', 'erik']]) {
            await page.goto(source.href);
            await page.locator('#site').selectOption(site);
            await page.locator('#username').fill(username);
            await page.locator('#maximum').fill('2');
            await page.locator('#collect').click();
            await page.waitForFunction(() => !document.querySelector('#collect').disabled, null, { polling: 100, timeout: 210000 });
            assert.notEqual(await page.locator('#status').getAttribute('data-error'), 'true', await page.locator('#status').textContent());
            assert.equal(await page.locator('#save').isVisible(), true);
            const saved = await savedText(page);
            const parsed = parseGameFiles([{ name: saved.name, text: saved.text }]);
            assert.equal(parsed.games.length, 2, JSON.stringify(parsed.diagnostics));
        }
        for(const { url, values } of await Promise.all(headers)) {
            assert.ok(['api.chess.com', 'lichess.org'].includes(new URL(url).hostname));
            assert.equal(values.cookie, undefined);
            assert.equal(values.authorization, undefined);
            assert.equal(values.referer, undefined);
            assert.ok(!values.origin || values.origin === 'null');
        }
        console.log(`Verified ${headers.length} live public API requests from the local file, without cookies, authorization or a website referrer.`);
    }, true);
});
