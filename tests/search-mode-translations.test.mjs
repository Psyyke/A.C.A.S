import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const languages = JSON.parse(read('../assets/i18n/meta.json')).availableLanguages;
const html = read('../app/index.html');
const start = html.indexOf('<div id="basic-advanced-settings-panel"');
const end = html.indexOf('<div id="dynamic-setting-panel"', start);
const panel = html.slice(start, end);

test('all supported languages translate regular search settings and dropdown choices', { timeout: 60000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ headless: true });
    try {
        for(const [language] of languages) {
            const translations = JSON.parse(read(`../assets/i18n/${language}.json`));
            const page = await browser.newPage();
            await page.goto(url);
            await page.setContent(panel);
            await page.evaluate(language => {
                localStorage.setItem('selectedLanguage', language);
                window.WAIT_FOR_ELEMENT = async selector => document.querySelector(selector);
                window.FULL_TRANS_OBJ = null;
                window.TRANS_OBJ = null;
            }, language);
            await page.addScriptTag({ content: read('../app/assets/js/misc/translationProcessor.js') });
            await page.waitForFunction(() => document.querySelector('[data-key="advancedSearchMode"]')
                .closest('.custom-input').querySelector('.input-title').innerText === FULL_TRANS_OBJ?.configTranslations.advancedSearchMode[0]);
            for(const key of ['advancedSearchMode', 'advancedSearchMovetime', 'advancedEloDepth', 'engineNodes']) {
                const expected = translations.configTranslations[key];
                assert.equal(expected.length, 2, `${language}: ${key}`);
                const setting = page.locator(`input[data-key="${key}"]`).locator('..');
                const container = key === 'advancedSearchMode' ? setting.locator('..') : setting;
                assert.equal(await container.locator('.input-title').innerText(), expected[0], `${language}: ${key} title`);
                assert.equal(await container.locator('.input-subtitle').innerText(), expected[1], `${language}: ${key} subtitle`);
            }
            for(const mode of ['standard', 'movetime', 'infinite']) {
                const expected = translations.domTranslations[`[data-translation-search-${mode}]`];
                assert.ok(expected, `${language}: ${mode}`);
                assert.equal(await page.locator(`.dropdown-item[data-value="${mode}"]`).innerText(), expected);
                assert.equal(await page.locator(`.dropdown-item[data-value="${mode}"]`).getAttribute('data-value'), mode);
            }
            await page.close();
        }
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
