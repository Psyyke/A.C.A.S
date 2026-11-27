import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { penaStrings } from '../app/assets/engines/pena-v2/i18n.js';
import { startServer } from './maia-elo/serve.mjs';

const locale = async code => JSON.parse(await readFile(new URL(`../assets/i18n/${code}.json`, import.meta.url), 'utf8'));

test('every supported Pena locale has all strings and preserves placeholders', async () => {
    const meta = JSON.parse(await readFile(new URL('../assets/i18n/meta.json', import.meta.url), 'utf8'));
    for(const [code] of meta.availableLanguages) {
        if(code === 'us') continue;
        const translations = (await locale(code)).translations.pena;
        for(const [key, source] of Object.entries(penaStrings)) {
            if(key === 'settingsTitle') continue;
            const translated = translations[key];
            assert.ok(typeof translated === 'string' && translated.trim(), `${code}: missing ${key}`);
            const placeholders = text => [...text.matchAll(/\{\w+\}/g)].map(match => match[0]).sort();
            assert.deepEqual(placeholders(translated), placeholders(source), `${code}: ${key}`);
        }
    }
});

let server, url, browser;
before(async () => {
    ({ server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' }));
    browser = await chromium.launch();
});
after(async () => {
    await browser?.close();
    if(server) await new Promise(resolve => server.close(resolve));
});

test('Pena settings, opening-book links and progress messages update in every supported language', { timeout: 120000 }, async t => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    t.after(() => context.close());
    await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
    await context.addInitScript(() => {
        localStorage.setItem('selectedLanguage', 'cn');
        const values = { isTosAccepted: true, AcasConfig: { global: {
            chessEngineProfile: 'default', profiles: { default: {} }
        } }, acasGhostWelcomePending: false };
        window.USERSCRIPT = {
            getValue: key => values[key], setValue: (key, value) => { values[key] = value; },
            deleteValue: key => { delete values[key]; }, listValues: () => Object.keys(values),
            getInfo: () => ({ scriptHandler: 'Tampermonkey', script: { version: '2.6.0' } })
        };
    });
    const page = await context.newPage();
    await page.goto(`${url}/app/`);
    await page.locator('#acas-loading-screen').waitFor({ state: 'hidden' });
    const root = page.locator('#pena-floaty');
    await root.locator('[data-pena-text="visualDuration"]').waitFor({ state: 'attached' });
    await page.evaluate(async () => {
        const { setPenaText } = await import('./assets/engines/pena-v2/i18n.js');
        const status = document.createElement('div');
        status.id = 'test-pena-status';
        document.querySelector('#pena-floaty').appendChild(status);
        setPenaText(status, 'readingBoardProgress', { percent: 42 });
    });
    const check = async code => {
        const catalog = await locale(code);
        const text = code === 'us' ? penaStrings : catalog.translations.pena;
        const mismatches = await root.evaluate((element, expected) => {
            const mismatches = [];
            for(const key of ['thinking', 'prompt', 'evidence', 'visualDuration', 'voicePause', 'importZonosVoice',
                'customZonosHint', 'evidenceLines', 'evidenceReplies', 'evidenceCompare', 'evidenceWhatIf',
                'evidenceHistory', 'evidenceAmount', 'effort', 'systemPrompt']) {
                if(element.querySelector(`[data-pena-text="${key}"]`)?.textContent !== expected[key])
                    mismatches.push(key);
            }
            if(element.querySelector('[data-pena-label="importZonosVoice"]')?.getAttribute('aria-label') !== expected.importZonosVoice)
                mismatches.push('importZonosVoice aria-label');
            if(element.querySelector('#test-pena-status')?.textContent !== expected.readingBoardProgress.replace('{percent}', '42'))
                mismatches.push('readingBoardProgress');
            return mismatches;
        }, text);
        assert.deepEqual(mismatches, [], `${code}: untranslated live UI`);
        const book = {
            subtitle: catalog.configTranslations.openingBookName[1],
            link: catalog.domTranslations['#polyglot-book-input .input-subtitle-link']
        };
        assert.ok(book.link, `${code}: missing opening-book tool link`);
        assert.ok(book.subtitle.includes('(.bin)') && book.subtitle.includes('(.epd)'), `${code}: missing book format`);
        await page.waitForFunction(expected => {
            const subtitle = document.querySelector('#polyglot-book-input .input-subtitle');
            return subtitle.firstChild.textContent.trim() === expected.subtitle
                && subtitle.querySelector('a')?.textContent === expected.link;
        }, book);
        assert.equal(await page.locator('#polyglot-book-input .input-subtitle-link').getAttribute('href'), '../tools/booksmith/');
    };
    await check('cn');
    const meta = JSON.parse(await readFile(new URL('../assets/i18n/meta.json', import.meta.url), 'utf8'));
    for(const [code] of meta.availableLanguages) {
        await page.evaluate(() => {
            window.penaTranslationUpdated = new Promise(resolve =>
                document.addEventListener('acas-translations-updated', resolve, { once: true }));
        });
        await page.locator(`.dropdown-item[title$=" (${code})"]`).first().evaluate(element => element.click());
        await page.evaluate(() => window.penaTranslationUpdated);
        await check(code);
    }
});
