import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { readFile } from 'node:fs/promises';

let server, url, browser;
before(async () => {
    ({ server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' }));
    browser = await chromium.launch();
});
after(async () => {
    await browser?.close();
    if(server) await new Promise(resolve => server.close(resolve));
});

async function openApp(t, { existing = false, accepted = true, mobile = false, userscript = true, language } = {}) {
    const context = await browser.newContext(mobile ? devices['iPhone 13'] : { viewport: { width: 1280, height: 900 } });
    t.after(() => context.close());
    await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
    if(userscript) await context.addInitScript(({ existing, accepted, language }) => {
        if(language && !localStorage.getItem('selectedLanguage')) localStorage.setItem('selectedLanguage', language);
        const prefix = 'ghost-welcome-test:';
        const getValue = key => {
            const value = localStorage.getItem(prefix + key);
            return value === null ? undefined : JSON.parse(value);
        };
        const setValue = (key, value) => {
            if(window.failWelcomeDismissal && key === 'acasGhostWelcomePending' && value === false)
                throw new Error('Storage unavailable');
            localStorage.setItem(prefix + key, JSON.stringify(value));
        };
        if(!localStorage.getItem(prefix + 'seeded')) {
            setValue('seeded', true);
            if(accepted) setValue('isTosAccepted', true);
            if(existing) setValue('AcasConfig', { global: {
                chessEngineProfile: 'default', isUserscriptGhost: false, profiles: { default: {} }
            } });
        }
        window.USERSCRIPT = {
            getValue, setValue,
            deleteValue: key => localStorage.removeItem(prefix + key),
            listValues: () => Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length)),
            getInfo: () => ({ scriptHandler: 'Tampermonkey', script: { version: '2.6.0' } })
        };
    }, { existing, accepted, language });
    const page = await context.newPage();
    await page.goto(`${url}/app/`);
    return page;
}

test('every supported language has complete welcome text and one link placeholder', async () => {
    const meta = JSON.parse(await readFile(new URL('../assets/i18n/meta.json', import.meta.url), 'utf8'));
    for(const [code] of meta.availableLanguages) {
        const locale = JSON.parse(await readFile(new URL(`../assets/i18n/${code}.json`, import.meta.url), 'utf8'));
        const welcome = locale.translations.ghostWelcome;
        for(const key of ['label', 'intro', 'explanation', 'server', 'link', 'settings', 'dismiss', 'saveError'])
            assert.ok(typeof welcome?.[key] === 'string' && welcome[key].trim(), `${code}: missing ${key}`);
        assert.equal(welcome.server.split('{link}').length, 2, `${code}: expected one link placeholder`);
    }
});

test('translations follow the selected language and fit a narrow screen', { timeout: 120000 }, async t => {
    const meta = JSON.parse(await readFile(new URL('../assets/i18n/meta.json', import.meta.url), 'utf8'));
    const page = await openApp(t, { mobile: true, language: 'il' });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.locator('#ghost-welcome[open]').waitFor();
    await page.locator('#acas-loading-screen').waitFor({ state: 'hidden' });
    const dialog = page.locator('#ghost-welcome');
    assert.equal(await dialog.getAttribute('lang'), 'he');
    assert.equal(await dialog.getAttribute('dir'), 'rtl');

    for(const [code, name] of meta.availableLanguages) {
        const locale = JSON.parse(await readFile(new URL(`../assets/i18n/${code}.json`, import.meta.url), 'utf8'));
        const text = locale.translations.ghostWelcome;
        await page.locator(`.dropdown-item[title="${name} (${code})"]`).first().evaluate(element => element.click());
        await page.waitForFunction(expected => TRANS_OBJ?.ghostWelcome?.intro === expected, text.intro);
        assert.equal(await dialog.locator('[data-ghost-welcome-intro]').textContent(), text.intro, code);
        assert.equal(await dialog.locator('[data-ghost-welcome-explanation]').textContent(), text.explanation, code);
        assert.equal(await dialog.locator('[data-ghost-welcome-server]').textContent(),
            text.server.replace('{link}', text.link), code);
        assert.equal(await dialog.locator('a').getAttribute('href'), 'https://github.com/Psyyke/A.C.A.S/releases');
        assert.equal(await dialog.locator('[data-ghost-welcome-settings]').textContent(), text.settings, code);
        assert.equal(await dialog.locator('[data-ghost-welcome-dismiss]').textContent(), text.dismiss, code);
        assert.equal(await dialog.getAttribute('aria-label'), text.label, code);
        if(['arab', 'ir', 'il'].includes(code)) assert.equal(await dialog.getAttribute('dir'), 'rtl', code);
        for(const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
            await page.setViewportSize(viewport);
            const layout = await dialog.evaluate(element => {
                const rect = element.getBoundingClientRect();
                const content = element.querySelector('.ghost-welcome-content');
                const buttons = [...element.querySelectorAll('button')].map(button => {
                    const box = button.getBoundingClientRect();
                    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
                });
                return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                    width: innerWidth, height: innerHeight, scrollWidth: content.scrollWidth,
                    clientWidth: content.clientWidth, buttons };
            });
            assert.ok(layout.left >= 0 && layout.right <= layout.width && layout.top >= 0
                && layout.bottom <= layout.height && layout.scrollWidth <= layout.clientWidth
                && layout.buttons.every(button => button.top >= 0 && button.bottom <= layout.height
                    && button.left >= 0 && button.right <= layout.width), `${code}: ${JSON.stringify(layout)}`);
        }
    }

    await page.locator('.dropdown-item[title="Français (fr)"]').first().evaluate(element => element.click());
    const french = JSON.parse(await readFile(new URL('../assets/i18n/fr.json', import.meta.url), 'utf8')).translations.ghostWelcome;
    await page.waitForFunction(expected => TRANS_OBJ?.ghostWelcome?.intro === expected, french.intro);
    await page.evaluate(() => { window.failWelcomeDismissal = true; });
    await page.locator('[data-ghost-welcome-dismiss]').click();
    await page.getByText(french.saveError, { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => USERSCRIPT.getValue('acasGhostWelcomePending')), true);
});

test('a fresh install sees the tip after terms, and the guide highlights Ghost without changing it', { timeout: 60000 }, async t => {
    const page = await openApp(t, { accepted: false });
    await page.locator('#tos-container:not(.hidden)').waitFor();
    assert.equal(await page.locator('#ghost-welcome').isVisible(), false);
    await page.locator('#tos-checkbox').check();
    await page.locator('#tos-continue-button').click();
    await page.waitForURL(/\?t=/);
    await page.locator('#ghost-welcome[open]').waitFor();
    await page.locator('#acas-loading-screen').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('[data-key="isUserscriptGhost"]').isChecked(), true);
    assert.equal(await page.evaluate(() => document.querySelector('#ghost-welcome').matches(':modal')), true);
    const link = page.getByRole('link', { name: 'local server on GitHub' });
    assert.equal(await link.getAttribute('href'), 'https://github.com/Psyyke/A.C.A.S/releases');
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');

    await page.reload();
    await page.locator('#ghost-welcome[open]').waitFor();
    await page.locator('[data-ghost-welcome-settings]').click();
    await page.locator('#ghost-welcome').waitFor({ state: 'hidden' });
    const setting = page.locator('.custom-input.setting-highlight:has(> .checkbox-container > [data-key="isUserscriptGhost"])');
    await setting.waitFor();
    await page.waitForFunction(() => {
        const rect = document.querySelector('[data-key="isUserscriptGhost"]').closest('.custom-input').getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight;
    });
    assert.equal(await page.evaluate(() => document.activeElement.dataset.key), 'isUserscriptGhost');
    assert.equal(await page.locator('[data-key="isUserscriptGhost"]').isChecked(), true);
    await page.waitForFunction(() => USERSCRIPT.getValue('acasGhostWelcomePending') === false);
    await page.reload();
    await page.waitForFunction(() => SETTING_FILTER_OBJ.profileID);
    assert.equal(await page.locator('#ghost-welcome').isVisible(), false);
});

test('existing users are not prompted and their Ghost preference is preserved', { timeout: 30000 }, async t => {
    const page = await openApp(t, { existing: true });
    await page.waitForFunction(() => USERSCRIPT.getValue('acasGhostWelcomePending') === false && SETTING_FILTER_OBJ.profileID);
    assert.equal(await page.locator('#ghost-welcome').isVisible(), false);
    assert.equal(await page.evaluate(() => USERSCRIPT.getValue('AcasConfig').global.isUserscriptGhost), false);
});

test('the mobile tip fits narrow and short screens and dismissal persists', { timeout: 60000 }, async t => {
    const page = await openApp(t, { mobile: true });
    const dialog = page.locator('#ghost-welcome');
    await page.locator('#ghost-welcome[open]').waitFor();
    await page.locator('#acas-loading-screen').waitFor({ state: 'hidden' });
    for(const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        const layout = await dialog.evaluate(element => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                width: innerWidth, height: innerHeight, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
        });
        assert.ok(layout.left >= 0 && layout.right <= layout.width, JSON.stringify(layout));
        assert.ok(layout.top >= 0 && layout.bottom <= layout.height, JSON.stringify(layout));
        assert.ok(layout.scrollWidth <= layout.clientWidth, JSON.stringify(layout));
        const action = await page.locator('[data-ghost-welcome-settings]').boundingBox();
        assert.ok(action.y >= 0 && action.y + action.height <= layout.height,
            `The guide button must stay visible without scrolling: ${JSON.stringify(action)}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('[data-key="ghostScreenOverlay"]').isDisabled(), true);
    await dialog.getByRole('button', { name: 'Got it', exact: true }).click();
    await page.waitForFunction(() => USERSCRIPT.getValue('acasGhostWelcomePending') === false);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    await page.reload();
    await page.waitForFunction(() => SETTING_FILTER_OBJ.profileID);
    assert.equal(await dialog.isVisible(), false);
});

test('Escape dismisses the tip and storage failures are reported without losing the reminder', { timeout: 30000 }, async t => {
    const page = await openApp(t);
    await page.locator('#ghost-welcome[open]').waitFor();
    await page.evaluate(() => { window.failWelcomeDismissal = true; });
    await page.keyboard.press('Escape');
    await page.getByText('Could not save this tip. It may appear again next time.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => USERSCRIPT.getValue('acasGhostWelcomePending')), true);
    await page.reload();
    await page.locator('#ghost-welcome[open]').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => USERSCRIPT.getValue('acasGhostWelcomePending') === false);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
});

test('a visitor without the userscript does not see the welcome tip', { timeout: 30000 }, async t => {
    const page = await openApp(t, { userscript: false });
    await page.locator('#install-notification:not(.hidden)').waitFor();
    assert.equal(await page.locator('#ghost-welcome').isVisible(), false);
});
