import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

test('server translation catalogs have matching keys and placeholders', () => {
    const source = readFileSync(new URL('../appServer/ui/js/i18n.js', import.meta.url), 'utf8')
        .replace('window.serverI18n = {', 'window.catalogs = catalogs; window.serverI18n = {');
    const select = { addEventListener() {} };
    const document = { documentElement: {}, getElementById: id => id === 'server-language' ? select : null,
        querySelectorAll: () => [], dispatchEvent() {} };
    const window = {};
    runInNewContext(source, { window, document, localStorage: { getItem() {}, setItem() {} }, Event: class {}, console });
    const { en, ...translations } = window.catalogs;
    const mainLanguages = JSON.parse(readFileSync(new URL('../assets/i18n/meta.json', import.meta.url), 'utf8'))
        .availableLanguages.map(([id]) => id === 'us' ? 'en' : id).sort();
    assert.deepEqual(Object.keys(window.catalogs).sort(), mainLanguages);
    const placeholders = value => [...value.matchAll(/\{\w+\}/g)].map(match => match[0]).sort();
    for(const [language, catalog] of Object.entries(translations)) {
        assert.deepEqual(Object.keys(catalog).sort(), Object.keys(en).sort(), language);
        for(const key of Object.keys(en)) {
            assert.ok(typeof catalog[key] === 'string' && catalog[key].trim(), `${language}: ${key} is empty`);
            assert.doesNotMatch(catalog[key], /\?{2,}|\p{L}\?\p{L}|\?$/u, `${language}: ${key} has mangled characters`);
            assert.deepEqual(placeholders(catalog[key]), placeholders(en[key]), `${language}: ${key}`);
        }
    }
});

test('server language changes preserve live UI state and persist', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
        await page.addInitScript(() => {
            const callbacks = {};
            window.fixture = { callbacks, sends: 0, portUpdates: [], cacheClears: 0 };
            window.engineAPI = {
                getSavedEngines: async () => [{ engineId: 'e', name: 'engine.exe', title: 'Engine', path: 'C:\\engine.exe' }],
                onRefreshEngineCards: cb => callbacks.refresh = cb, onAddConsoleView: cb => callbacks.add = cb,
                onRemoveConsoleView: cb => callbacks.remove = cb, onRenderEngineGrid: cb => callbacks.grid = cb,
                onLog: cb => callbacks.log = cb, killEngine: async () => true,
                clearCache: async () => { window.fixture.cacheClears++; }
            };
            window.serverAPI = { sendEnginesList: async () => { window.fixture.sends++; },
                getPort: async () => 2800,
                setPort: async port => { window.fixture.portUpdates.push(port); return false; },
                onListening: cb => callbacks.listening = cb, onClientChange: cb => callbacks.client = cb,
                onUnauthorized: cb => callbacks.unauthorized = cb };
            window.electronAPI = { getAlwaysOnTop: async () => false, getVersion: async () => '1',
                setAlwaysOnTop: async enabled => { (window.fixture.pins ||= []).push(enabled); return enabled; } };
            window.fileAPI = { pickFile: async (...args) => { window.fixture.enginePicker = args; return null; } };
            window.toastAPI = { onMessage: cb => callbacks.toast = cb };
            window.aiAPI = {
                onStatus: cb => callbacks.ai = cb,
                pickFile: async (...args) => { window.fixture.aiPicker = args; return null; },
                getSettings: async () => ({ executablePath: '', modelPath: '', loraPath: '', backend: 'auto',
                    context: 8192, gpuLayers: 99, threads: 0, vramMode: 'auto' }),
                getStatus: async () => ({ state: 'offline', setup: { installed: false } })
            };
        });
        await page.goto(`${url}/appServer/ui/index.html`);
        await page.waitForSelector('.engine-card');
        const actionsOpacity = () => page.locator('.engine-card-actions').first().evaluate(element => Number(getComputedStyle(element).opacity));
        await page.mouse.move(990, 790);
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.engine-card-actions')).opacity === '0'
            && getComputedStyle(document.querySelector('.engine-path')).opacity === '0');
        const titleWidth = () => page.locator('.engine-card-title').first().evaluate(element => element.getBoundingClientRect().width);
        const hiddenTitleWidth = await titleWidth();
        await page.locator('.engine-card').first().hover();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.engine-card-actions')).opacity === '1'
            && getComputedStyle(document.querySelector('.engine-path')).opacity === '1');
        assert.equal(await actionsOpacity(), 1);
        assert.ok(hiddenTitleWidth > await titleWidth() + 40, 'hidden actions should give the title their space');
        await page.mouse.move(990, 790);
        await page.locator('.usage-guide-button').hover();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.usage-guide-button')).borderTopColor === 'rgb(255, 255, 255)');
        assert.equal(await page.locator('.usage-guide-button').evaluate(element => getComputedStyle(element).borderTopColor), 'rgb(255, 255, 255)');
        await page.locator('#open-local-ai').hover();
        assert.equal(await page.locator('#open-local-ai .bi-stars').evaluate(element => getComputedStyle(element).transform), 'none');
        assert.match(await page.locator('#open-local-ai .bi-stars').evaluate(element => getComputedStyle(element).filter), /drop-shadow/);
        assert.equal(await page.locator('#open-local-ai').evaluate(element => getComputedStyle(element).boxShadow), 'none');
        const controlHeights = await page.locator('#server-controls .acas-fancy-button, #console-toolbar .acas-fancy-button').evaluateAll(elements =>
            elements.map(element => element.offsetHeight));
        assert.equal(new Set(controlHeights).size, 1, `control buttons differ in height: ${controlHeights}`);
        const controlsHeight = () => page.locator('#server-controls').evaluate(element => element.getBoundingClientRect().height);
        const restingControlsHeight = await controlsHeight();
        await page.locator('#portSettingsBtn').hover();
        await page.mouse.down();
        assert.equal(await controlsHeight(), restingControlsHeight, 'pressing a control button should not resize its row');
        await page.mouse.move(990, 790);
        await page.mouse.up();
        const layout = () => page.evaluate(() => ({ grid: document.querySelector('#engineGrid').offsetHeight,
            brand: document.querySelector('#acas-header').offsetHeight, logs: document.querySelector('#consoles-container').offsetHeight }));
        const fullLayout = await layout();
        const resizer = await page.locator('#panelResizer').boundingBox();
        const resizerX = resizer.x + resizer.width / 2, resizerY = resizer.y + resizer.height / 2;
        await page.mouse.move(resizerX, resizerY);
        await page.mouse.down();
        await page.mouse.move(resizerX, resizerY - 30, { steps: 3 });
        const shrunkLayout = await layout();
        const edges = await page.evaluate(() => {
            const box = selector => document.querySelector(selector).getBoundingClientRect();
            return [box('#portSettingsBtn').right, box('#panelsToggle').right];
        });
        assert.ok(Math.abs(edges[0] - edges[1]) < 1, `toolbar edges misaligned: ${edges}`);
        assert.equal(shrunkLayout.grid, fullLayout.grid - 30, 'dragging up should shrink the engine library');
        assert.equal(shrunkLayout.logs, fullLayout.logs + 30, 'dragging up should grow the logs');
        await page.mouse.move(resizerX, resizerY - 1000, { steps: 5 });
        await page.mouse.up();
        assert.deepEqual(await layout(), { grid: 0, brand: 0, logs: (await layout()).logs });
        assert.equal(await page.evaluate(() => document.body.classList.contains('library-hidden')), true);
        await page.locator('#panelResizer').press('End');
        assert.deepEqual(await layout(), fullLayout, 'End should restore the full layout');
        await page.locator('#panelResizer').press('ArrowUp');
        assert.equal((await layout()).grid, fullLayout.grid - 24);
        await page.locator('#panelResizer').press('ArrowUp');
        await page.locator('#panelResizer').press('ArrowUp');
        await page.locator('#panelResizer').press('ArrowUp');
        assert.deepEqual(await page.locator('.engine-card').evaluate(card => [card.clientHeight >= card.firstElementChild.offsetHeight, getComputedStyle(card).overflow]),
            [true, 'hidden'], 'the smallest library should still show a clipped card title row');
        await page.locator('#panelResizer').dblclick();
        assert.deepEqual(await layout(), fullLayout, 'double click should restore the full layout');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await page.locator('#open-local-ai').evaluate(element => getComputedStyle(element, '::after').animationName), 'none');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        const openSettings = async () => {
            await page.locator('#portSettingsBtn').click();
            await page.waitForFunction(() => !document.querySelector('#serverPortInput').disabled);
        };
        const logoWidths = () => page.evaluate(() => {
            const context = document.createElement('canvas').getContext('2d');
            const width = node => {
                const style = getComputedStyle(node.nodeType === Node.TEXT_NODE ? node.parentElement : node);
                context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
                context.fontStretch = style.fontStretch === '200%' ? 'ultra-expanded' : 'normal';
                const metrics = context.measureText(node.textContent.trim());
                return metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
            };
            return [width(document.querySelector('#acas-logo-main').firstChild), width(document.querySelector('#acas-logo-secondary'))];
        });
        const checkSubtitleWidth = async label => {
            await page.evaluate(() => document.fonts.ready);
            const [main, subtitle] = await logoWidths();
            assert.ok(Math.abs(main - subtitle) < 1.5, `${label}: subtitle ${subtitle}px vs wordmark ${main}px`);
        };
        const checkPortCapacity = async () => {
            const portFits = await page.locator('#serverPortInput').evaluate(element => {
                const style = getComputedStyle(element);
                const canvas = document.createElement('canvas');
                canvas.getContext('2d').font = `${style.fontSize} ${style.fontFamily}`;
                return {
                    available: element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
                    required: canvas.getContext('2d').measureText('65535').width,
                    width: style.width
                };
            });
            assert.ok(portFits.available >= portFits.required, `five port digits fit: ${JSON.stringify(portFits)}`);
        };
        const closeSettings = async () => page.locator('#portSettingsCancel').click();
        const selectLanguage = async language => {
            await openSettings();
            await page.selectOption('#server-language', language);
            await closeSettings();
        };
        await page.evaluate(() => {
            window.fixture.getPort = window.serverAPI.getPort;
            window.serverAPI.getPort = async () => { throw new Error('test port load'); };
        });
        await page.locator('#portSettingsBtn').click();
        await page.waitForFunction(() => document.querySelector('#acas-toast-container').textContent.includes('Could not load the server port setting.'));
        assert.equal(await page.locator('#serverPortInput').isDisabled(), true);
        assert.equal(await page.locator('#server-language').isEnabled(), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#portSettingsDialog').evaluate(element => element.open), false);
        await page.evaluate(() => {
            window.serverAPI.getPort = () => new Promise(resolve => { window.fixture.resolvePort = resolve; });
        });
        await page.locator('#portSettingsBtn').click();
        await page.keyboard.press('Escape');
        await page.evaluate(() => {
            window.serverAPI.getPort = window.fixture.getPort;
        });
        await openSettings();
        await page.evaluate(() => window.fixture.resolvePort(9999));
        assert.equal(await page.locator('#serverPortInput').inputValue(), '2800');
        for(const selector of ['#server-language', '#server-text-size']) {
            await page.locator(selector).hover();
            assert.equal(await page.locator(selector).evaluate(element => getComputedStyle(element).cursor), 'pointer');
        }
        await page.locator('#serverPortInput').hover();
        assert.equal(await page.locator('#serverPortInput').evaluate(element => getComputedStyle(element).cursor), 'text');
        assert.notEqual(await page.locator('#server-language').evaluate(element => {
            element.disabled = true;
            const cursor = getComputedStyle(element).cursor;
            element.disabled = false;
            return cursor;
        }), 'pointer');
        assert.equal(await page.locator('#portSettingsDialog #clearBtn').count(), 1);
        assert.equal(await page.locator('#server-controls #clearBtn').count(), 0);
        await page.locator('#clearBtn').click();
        assert.equal(await page.evaluate(() => window.fixture.cacheClears), 1);
        assert.deepEqual(await page.evaluate(() => window.fixture.portUpdates), []);
        assert.equal(await page.locator('#portSettingsDialog').evaluate(element => element.open), true);
        assert.deepEqual(await page.locator('#server-text-size option').evaluateAll(options =>
            options.map(option => [option.value, option.textContent])),
        [['80', '80%'], ['90', '90%'], ['100', '100%'], ['110', '110%'],
            ['120', '120%'], ['130', '130%'], ['140', '140%'], ['150', '150%']]);
        const baseHeadingSize = await page.locator('h1').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
        await page.selectOption('#server-text-size', '80');
        assert.ok(Math.abs(await page.locator('h1').evaluate(element => parseFloat(getComputedStyle(element).fontSize)) - baseHeadingSize * 0.8) < 0.1);
        await checkPortCapacity();
        await page.locator('#server-text-size').focus();
        await page.locator('#server-text-size').press('ArrowDown');
        assert.equal(await page.locator('#server-text-size').inputValue(), '90');
        assert.equal(await page.evaluate(() => localStorage.getItem('acas-server-text-size')), '90');
        assert.ok(Math.abs(await page.locator('h1').evaluate(element => parseFloat(getComputedStyle(element).fontSize)) - baseHeadingSize * 0.9) < 0.1);
        await page.selectOption('#server-text-size', '100');
        assert.equal(await page.locator('.server-settings-row').first().evaluate(element => getComputedStyle(element).fontSize), '13px');
        assert.equal(await page.locator('#server-log-wrap').count(), 0);
        for(const selector of ['#server-language', '#serverPortInput']) {
            assert.equal(await page.locator(selector).evaluate(element => getComputedStyle(element).borderBottomWidth), '5px');
        }
        assert.deepEqual(await page.locator('#server-language option').first().evaluate(element => {
            const style = getComputedStyle(element);
            return [style.color, style.backgroundColor];
        }), ['rgb(238, 238, 238)', 'rgb(36, 36, 36)']);
        assert.ok(await page.locator('#server-language').evaluate(element => parseFloat(getComputedStyle(element).paddingInlineEnd)) >= 30);
        await page.evaluate(() => {
            window.fixture.controlClicks = 0;
            for(const id of ['server-language', 'server-text-size', 'serverPortInput'])
                document.getElementById(id).addEventListener('click', () => window.fixture.controlClicks++);
        });
        for(const row of await page.locator('.server-settings-row').all()) {
            const label = await row.locator('label').boundingBox();
            const control = await row.locator('select, input').boundingBox();
            assert.ok(control.x > label.x + label.width, 'empty space exists between the label and control');
            await page.mouse.click((label.x + label.width + control.x) / 2, label.y + label.height / 2);
        }
        assert.equal(await page.evaluate(() => window.fixture.controlClicks), 0);
        await checkPortCapacity();
        await page.locator('#serverPortInput').fill('65535');
        assert.equal(await page.locator('#serverPortInput').evaluate(element => element.validity.valid), true);
        await page.locator('#serverPortInput').fill('2800');
        await page.locator('#server-language').focus();
        await page.locator('#server-language').press('ArrowDown');
        assert.equal(await page.locator('#server-language').inputValue(), 'fi');
        await page.selectOption('#server-language', 'en');
        await page.evaluate(() => {
            window.fixture.setPort = window.serverAPI.setPort;
            window.serverAPI.setPort = () => new Promise(resolve => { window.fixture.resolveSave = resolve; });
        });
        await page.locator('#serverPortInput').fill('2801');
        await page.locator('#serverPortInput').press('Enter');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#portSettingsDialog').evaluate(element => element.open), true);
        assert.equal(await page.locator('#portSettingsCancel').isDisabled(), true);
        await page.evaluate(() => window.fixture.resolveSave('test port save error'));
        await page.waitForFunction(() => !document.querySelector('#portSettingsCancel').disabled);
        assert.equal(await page.locator('#portSettingsDialog').evaluate(element => element.open), true);
        await page.evaluate(() => { window.serverAPI.setPort = window.fixture.setPort; });
        await closeSettings();
        const options = await page.locator('#server-language option').evaluateAll(elements => elements.map(element => element.value).sort());
        const languages = JSON.parse(readFileSync(new URL('../assets/i18n/meta.json', import.meta.url), 'utf8'))
            .availableLanguages.map(([id]) => id === 'us' ? 'en' : id).sort();
        assert.deepEqual(options, languages);
        await page.evaluate(() => {
            const identifierObj = { engineId: 'e', identifierKey: 'one', profileName: 'Profile', siteDomain: 'lichess.org' };
            window.fixture.callbacks.listening({ port: 2800 });
            window.fixture.callbacks.refresh({ aliveEngineProcesses: [{ identifierObj }] });
            window.fixture.callbacks.add({ identifierObj });
            window.fixture.callbacks.log({ identifierObj, text: 'info depth 20', type: 'info' });
            window.fixture.callbacks.ai({ state: 'offline', setup: { busy: true, phase: 'downloading',
                item: 'model', progress: 0.5, received: 1e9, total: 2e9 } });
            document.querySelector('.pauseBtn').click();
            document.querySelector('.cmdInput').value = 'uci';
            window.fixture.killButton = document.querySelector('.engine-process-row .kill-engine-btn');
            window.fixture.killButton.disabled = true;
        });
        assert.match(await page.locator('#serverConnectionInfo').getAttribute('aria-label'), /Waiting for the web GUI to connect/);
        assert.equal(await page.locator('#statusDot').evaluate(element => element.classList.contains('server-connection-loading')), true);
        await page.evaluate(() => window.fixture.callbacks.client({ isConnected: true, origin: 'https://example.com' }));
        assert.match(await page.locator('#serverConnectionInfo').getAttribute('aria-label'), /Web GUI connected/);
        assert.equal(await page.locator('#statusDot').evaluate(element => element.classList.contains('bi-check-circle-fill')), true);
        await page.evaluate(() => window.fixture.callbacks.unauthorized({ origin: 'https://example.com' }));
        assert.match(await page.locator('#serverConnectionInfo').getAttribute('aria-label'), /Unauthorized connection blocked/);
        assert.equal(await page.locator('#statusDot').evaluate(element => element.classList.contains('bi-exclamation-triangle-fill')), true);
        await page.evaluate(() => window.fixture.callbacks.client({ isConnected: false, origin: 'https://example.com' }));
        assert.equal(await page.locator('#statusDot').evaluate(element => element.classList.contains('server-connection-loading')), true);
        const sends = await page.evaluate(() => window.fixture.sends);
        await selectLanguage('fi');
        assert.equal(await page.locator('h1').textContent(), 'Moottorikirjasto');
        assert.equal(await page.locator('#acas-logo-secondary').evaluate(element =>
            getComputedStyle(element).fontFamily.startsWith('Whisper')), true);
        assert.ok(await page.evaluate(async () => (await document.fonts.load('22px Whisper')).some(font => font.status === 'loaded')));
        await page.locator('#addEngineBtn').click();
        assert.deepEqual(await page.evaluate(() => window.fixture.enginePicker), ['Lisää moottori', 'tiedostot']);
        await page.locator('#open-local-ai').click();
        await page.evaluate(() => { document.querySelector('.ai-advanced').open = true; });
        for(const selector of ['#ai-backend', '#ai-vram-mode']) {
            await page.locator(selector).hover();
            assert.equal(await page.locator(selector).evaluate(element => getComputedStyle(element).cursor), 'pointer');
        }
        await page.locator('[data-ai-file="executablePath"]').click();
        assert.deepEqual(await page.evaluate(() => window.fixture.aiPicker), ['executablePath', 'Ohjelma']);
        await page.evaluate(() => document.querySelector('#local-ai').close());
        assert.equal(await page.locator('#portDisplay').textContent(), '2800');
        assert.match(await page.locator('#serverConnectionInfo').getAttribute('aria-label'), /Paikallisen palvelimen portti: 2800/);
        assert.equal(await page.locator('#portSettingsBtn').getAttribute('aria-label'), 'Asetukset');
        assert.equal(await page.locator('#serverConnectionInfo').evaluate(element => element.tagName), 'DIV');
        assert.equal(await page.locator('#serverConnectionInfo').evaluate(element => element.tabIndex), -1);
        await page.locator('#serverConnectionInfo').click();
        assert.equal(await page.locator('#portSettingsDialog').evaluate(element => element.open), false);
        assert.equal(await page.locator('.engine-status').textContent(), '1 käynnissä');
        assert.equal(await page.locator('.pauseBtn').getAttribute('aria-label'), 'Jatka');
        assert.equal(await page.locator('.pauseBtn i').evaluate(element => element.classList.contains('bi-play-fill')), true);
        assert.equal(await page.locator('.cmdInput').inputValue(), 'uci');
        assert.equal(await page.locator('.cmdInput').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(10, 10, 10)');
        const consoleHeader = () => page.locator('.console-header').evaluate(header => {
            const details = header.querySelector('.console-title-details');
            const rows = [...header.children].filter(child => child.offsetWidth).map(child => Math.round(child.getBoundingClientRect().top + child.offsetHeight / 2));
            return { fits: header.scrollWidth <= header.clientWidth, oneRow: Math.max(...rows) - Math.min(...rows) <= 2,
                hidden: ['hide-site', 'hide-context', 'hide-name'].filter(name => details.classList.contains(name)),
                before: getComputedStyle(details.querySelector('.console-engine-context'), '::before').content,
                iconOnly: [...header.querySelectorAll('button')].every(button => !button.innerText.trim() && button.getAttribute('aria-label')) };
        });
        assert.deepEqual(await consoleHeader(), { fits: true, oneRow: true, hidden: [], before: '"("', iconOnly: true });
        const squeezeSteps = [];
        for(const width of [560, 470, 420, 360]) {
            await page.locator('.console-section').evaluate((section, width) => { section.style.cssText = `flex: 0 0 ${width}px; min-width: ${width}px`; }, width);
            await page.waitForTimeout(50);
            const state = await consoleHeader();
            assert.ok(state.fits && state.oneRow, `console header should stay on one line at ${width}px`);
            squeezeSteps.push(state.hidden.length);
        }
        assert.deepEqual([...squeezeSteps].sort(), squeezeSteps, `console title should hide progressively: ${squeezeSteps}`);
        assert.ok(squeezeSteps.at(-1) > 0, 'a narrow console should start hiding title parts');
        await page.locator('.console-section').evaluate(section => { section.style.cssText = ''; });
        await page.waitForFunction(() => !document.querySelector('.console-title-details').className.includes('hide-'));
        assert.equal(await page.locator('.log-entry').count(), 1);
        assert.equal(await page.evaluate(() => window.fixture.killButton === document.querySelector('.engine-process-row .kill-engine-btn') && window.fixture.killButton.disabled), true);
        assert.equal(await page.locator('#ai-summary').textContent(), 'Ladataan 50 %');
        assert.match(await page.locator('#ai-status').textContent(), /malli.*1\.0 GB.*2\.0 GB/);
        assert.equal(await page.evaluate(() => window.fixture.sends), sends);
        await page.evaluate(() => { window.promptResult = AcasPrompt.prompt('Test', '', { showCancel: true }); });
        assert.equal(await page.locator('#acas-cancel').textContent(), 'Peruuta');
        await page.locator('#acas-cancel').click();
        assert.equal(await page.evaluate(() => window.promptResult), null);
        await page.setViewportSize({ width: 500, height: 800 });
        await openSettings();
        const bounds = await page.locator('#server-language').boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 500);
        const initialFont = await page.locator('h1').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
        const initialLogFont = await page.locator('.log').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
        const initialLogoFont = await page.locator('#acas-logo').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
        const initialSubtitleFont = await page.locator('#acas-logo-secondary').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
        const initialLogoImageWidth = (await page.locator('#acas-logo-img').boundingBox()).width;
        const initialButtonHeight = (await page.locator('#addEngineBtn').boundingBox()).height;
        await page.selectOption('#server-text-size', '140');
        assert.equal(await page.locator('#server-text-size option:checked').textContent(), '140%');
        assert.ok(Math.abs(await page.locator('h1').evaluate(element => parseFloat(getComputedStyle(element).fontSize)) - initialFont * 1.4) < 0.1);
        assert.ok(Math.abs(await page.locator('.log').evaluate(element => parseFloat(getComputedStyle(element).fontSize)) - initialLogFont * 1.4) < 0.1);
        await page.waitForFunction(base => parseFloat(getComputedStyle(document.querySelector('#acas-logo')).fontSize) > base * 1.1, initialLogoFont);
        const scaledLogoFont = await page.locator('#acas-logo').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
        assert.ok(scaledLogoFont > initialLogoFont * 1.1 && scaledLogoFont < initialLogoFont * 1.2);
        await checkSubtitleWidth('140%');
        assert.ok(await page.locator('.acas-toast-content').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize)) >= 21);
        const scaledSubtitleFont = await page.locator('#acas-logo-secondary').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
        assert.ok(scaledSubtitleFont > initialSubtitleFont * 1.1 && scaledSubtitleFont < initialSubtitleFont * 1.2);
        assert.ok((await page.locator('#acas-logo-img').boundingBox()).width > initialLogoImageWidth * 1.1);
        assert.ok((await page.locator('#addEngineBtn').boundingBox()).height > initialButtonHeight);
        assert.equal(await page.locator('#portDisplay').evaluate(element => getComputedStyle(element).fontSize),
            await page.locator('#addEngineBtn').evaluate(element => getComputedStyle(element).fontSize));
        assert.ok(await page.locator('#addEngineBtn').evaluate(element => Number(getComputedStyle(element).fontWeight)) >= 600);
        await page.locator('#serverPortInput').fill('2801');
        assert.match(await page.locator('#acas-toast-container').textContent(), /2801/);
        await page.locator('#serverPortInput').fill('2800');
        await page.waitForFunction(() => !document.querySelector('#acas-toast-container').textContent.includes('2801'));
        await closeSettings();
        await page.locator('.wrapBtn').click();
        assert.equal(await page.locator('.log').evaluate(element => element.classList.contains('no-wrap')), true);
        assert.deepEqual(await page.evaluate(() => window.fixture.portUpdates), []);
        await page.waitForFunction(() => !document.querySelector('#alwaysOnTopToggle').disabled);
        for(const id of ['#logOnlyToggle', '#alwaysOnTopToggle', '#panelsToggle']) await page.locator(id).click();
        await page.waitForFunction(() => document.querySelector('#alwaysOnTopToggle').getAttribute('aria-pressed') === 'true');
        await page.reload();
        await page.waitForSelector('.engine-card', { state: 'attached' });
        await page.waitForFunction(() => document.querySelector('#alwaysOnTopToggle').getAttribute('aria-pressed') === 'true');
        assert.deepEqual(await page.evaluate(() => [document.body.classList.contains('logs-only'), document.body.classList.contains('panels-collapsed'),
            document.querySelector('#logOnlyToggle').getAttribute('aria-pressed'), document.querySelector('#panelsToggle').getAttribute('aria-expanded'),
            window.fixture.pins]), [true, true, 'true', 'false', [true]], 'logs-only, pin and collapsed panels should survive a restart');
        await page.waitForFunction(() => !document.querySelector('#alwaysOnTopToggle').disabled);
        for(const id of ['#logOnlyToggle', '#alwaysOnTopToggle', '#panelsToggle']) await page.locator(id).click();
        await page.waitForFunction(() => document.querySelector('#alwaysOnTopToggle').getAttribute('aria-pressed') === 'false');
        assert.deepEqual(await page.evaluate(() => ['acas-server-logs-only', 'acas-server-always-on-top', 'acas-server-panels-collapsed']
            .map(key => localStorage.getItem(key))), ['0', '0', '0']);
        await page.reload();
        await page.waitForSelector('.engine-card');
        assert.equal(await page.evaluate(() => localStorage.getItem('acas-server-log-wrap-lines')), 'false');
        await page.evaluate(() => localStorage.removeItem('acas-server-log-wrap-lines'));
        await openSettings();
        assert.equal(await page.locator('#server-text-size').inputValue(), '140');
        assert.equal(await page.locator('#serverPortInput').inputValue(), '2800');
        await page.selectOption('#server-text-size', '100');
        await page.locator('#serverPortInput').fill('2802');
        const countdownToast = page.locator('.acas-toast', { hasText: '2802' });
        await countdownToast.locator('.acas-toast-close-btn').click();
        await page.waitForTimeout(5500);
        assert.deepEqual(await page.evaluate(() => window.fixture.portUpdates), []);
        await page.locator('#serverPortInput').fill('2801');
        const countdown = page.locator('.acas-toast', { hasText: '2801' }).locator('.acas-toast-content');
        assert.match(await countdown.textContent(), /2801, 5 s/);
        await page.waitForFunction(() => document.querySelector('#acas-toast-container').textContent.includes('2801, 4 s'));
        await page.locator('#serverPortInput').fill('2801');
        assert.match(await countdown.textContent(), /2801, 5 s/);
        assert.deepEqual(await page.evaluate(() => window.fixture.portUpdates), []);
        await page.waitForFunction(() => window.fixture.portUpdates.length === 1, null, { timeout: 7000 });
        assert.deepEqual(await page.evaluate(() => window.fixture.portUpdates), [2801]);
        await closeSettings();
        assert.equal(await page.locator('#server-language').inputValue(), 'fi');
        assert.equal(await page.locator('h1').textContent(), 'Moottorikirjasto');
        await openSettings();
        await page.selectOption('#server-text-size', '150');
        await checkPortCapacity();
        await closeSettings();
        await selectLanguage('en');
        assert.equal(await page.locator('h1').textContent(), 'Engine library');
        assert.equal(await page.locator('.engine-status').textContent(), 'Idle');
        for(const [language, heading, stopped] of [
            ['es', 'Biblioteca de motores', 'Inactivo'],
            ['fr', 'Bibliothèque de moteurs', 'Inactif'],
            ['de', 'Engine-Bibliothek', 'Inaktiv'],
            ['pt', 'Biblioteca de motores', 'Inativo'],
            ['it', 'Libreria motori', 'Inattivo'],
            ['nl', 'Enginebibliotheek', 'Inactief'],
            ['se', 'Motorbibliotek', 'Inaktiv'],
            ['id', 'Pustaka mesin', 'Tidak aktif'],
            ['cn', '引擎库', '未运行'],
            ['jp', 'エンジンライブラリ', '停止中'],
            ['ru', 'Библиотека движков', 'Не запущен'],
            ['kr', '엔진 라이브러리', '대기 중'],
            ['tr', 'Motor kütüphanesi', 'Çalışmıyor'],
            ['pl', 'Biblioteka silników', 'Nieaktywny'],
            ['ua', 'Бібліотека рушіїв', 'Не запущено'],
            ['vn', 'Thư viện engine', 'Chưa chạy'],
            ['ro', 'Biblioteca de motoare', 'Oprit'],
            ['cz', 'Knihovna enginů', 'Neběží'],
            ['arab', 'مكتبة المحركات', 'غير مشغل'],
            ['in', 'इंजन लाइब्रेरी', 'बंद'],
            ['hr', 'Biblioteka motora', 'Ne radi'],
            ['sk', 'Knižnica enginov', 'Nebeží'],
            ['ph', 'Library ng engine', 'Hindi tumatakbo'],
            ['bd', 'ইঞ্জিন লাইব্রেরি', 'চলছে না'],
            ['ir', 'کتابخانه موتورها', 'متوقف'],
            ['il', 'ספריית מנועים', 'לא פעיל'],
            ['rs', 'Библиотека мотора', 'Не ради'],
            ['bg', 'Библиотека с двигатели', 'Не работи'],
            ['gr', 'Βιβλιοθήκη μηχανών', 'Ανενεργή'],
            ['hu', 'Motorkönyvtár', 'Nem fut'],
            ['th', 'คลังเอนจิน', 'ไม่ได้ทำงาน'],
            ['ee', 'Mootorite kogu', 'Ei tööta'],
            ['uz', 'Dvigatellar kutubxonasi', 'Ishlamayapti'],
            ['az', 'Mühərrik kitabxanası', 'İşləmir'],
            ['kz', 'Қозғалтқыштар кітапханасы', 'Жұмыс істемейді'],
            ['mn', 'Хөдөлгүүрийн сан', 'Ажиллахгүй'],
            ['ta', 'இயந்திர நூலகம்', 'இயங்கவில்லை'],
            ['ge', 'ძრავების ბიბლიოთეკა', 'არ მუშაობს'],
            ['am', 'Շարժիչների գրադարան', 'Չի աշխատում'],
            ['lk', 'එන්ජින් පුස්තකාලය', 'ක්‍රියාත්මක නැත']
        ]) {
            await selectLanguage(language);
            assert.equal(await page.locator('h1').textContent(), heading);
            assert.equal(await page.locator('.engine-status').textContent(), stopped);
            assert.equal(await page.locator('html').getAttribute('lang'), { am: 'hy', arab: 'ar', bd: 'bn', cn: 'zh', cz: 'cs', ee: 'et', ge: 'ka', gr: 'el', il: 'he', in: 'hi', ir: 'fa', jp: 'ja', kr: 'ko', kz: 'kk', lk: 'si', ph: 'fil', rs: 'sr', se: 'sv', ua: 'uk', vn: 'vi' }[language] || language);
            assert.equal(await page.locator('html').getAttribute('dir'), ['arab', 'ir', 'il'].includes(language) ? 'rtl' : 'ltr');
            const subtitle = await page.locator('#acas-logo-secondary').evaluate(element => ({
                text: element.textContent, whisper: element.classList.contains('has-whisper-font'),
                font: getComputedStyle(element).fontFamily
            }));
            assert.equal(subtitle.whisper, /^[\p{Script_Extensions=Latin}\p{M}\p{N}\p{P}\p{Z}\s]*$/u.test(subtitle.text));
            if(subtitle.whisper) await checkSubtitleWidth(language);
            if(['cn', 'jp', 'arab'].includes(language)) assert.equal(subtitle.whisper, false, `${language}: non-Latin fallback`);
            assert.equal(subtitle.font.startsWith('Whisper'), subtitle.whisper, `${language}: subtitle font`);
            const headerOverflow = await page.locator('#acas-header, #server-controls, .header-buttons-container').evaluateAll(elements =>
                elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.id || element.className));
            assert.deepEqual(headerOverflow, [], `${language}: overflowing server header`);
            await openSettings();
            const settingsOverflow = await page.locator('.server-settings-header, .server-settings-row, .server-port-settings, .server-settings-actions').evaluateAll(elements =>
                elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className));
            assert.deepEqual(settingsOverflow, [], `${language}: overflowing settings`);
            const portRow = await page.locator('.server-port-row').boundingBox();
            const portInput = await page.locator('#serverPortInput').boundingBox();
            const expectedEdge = ['arab', 'ir', 'il'].includes(language) ? portRow.x : portRow.x + portRow.width;
            const actualEdge = ['arab', 'ir', 'il'].includes(language) ? portInput.x : portInput.x + portInput.width;
            assert.ok(Math.abs(expectedEdge - actualEdge) < 1, `${language}: port aligned with settings controls`);
            assert.equal(await page.locator('.server-settings-row').first().evaluate(element => getComputedStyle(element).fontSize), '19.5px');
            for(const selector of ['#server-language', '#server-text-size', '#serverPortInput', '#clearBtn']) {
                const control = await page.locator(selector).boundingBox();
                assert.ok(control && control.x >= 0 && control.x + control.width <= 500, `${language}: ${selector} outside viewport`);
            }
            await closeSettings();
            await page.evaluate(() => {
                document.querySelector('#local-ai').showModal();
                document.querySelector('.ai-advanced').open = true;
            });
            const overflow = await page.locator('.ai-file-row, .ai-file-row label, .ai-file-row button, .ai-actions, .ai-main, .ai-dialog-header').evaluateAll(elements =>
                elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className || element.textContent));
            assert.deepEqual(overflow, [], `${language}: overflowing Pena controls`);
            const penaHeights = await page.locator('.local-ai :is(input, select, .acas-fancy-button):not([hidden])').evaluateAll(elements => elements.map(element => element.offsetHeight));
            assert.equal(new Set(penaHeights).size, 1, `${language}: uneven Pena control heights ${penaHeights}`);
            const optionBottoms = await page.locator('.ai-options :is(input, select)').evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().bottom)));
            assert.equal(optionBottoms[2], optionBottoms[3], `${language}: Pena option fields not aligned`);
            await page.evaluate(() => document.querySelector('#local-ai').close());
            if(['arab', 'ir', 'il'].includes(language)) {
                await page.evaluate(() => {
                    window.fixture.callbacks.add({ identifierObj: { engineId: 'e', identifierKey: 'rtl' } });
                });
                await openSettings();
                const selectorBounds = await page.locator('#server-language').boundingBox();
                assert.ok(selectorBounds && selectorBounds.x >= 0 && selectorBounds.x + selectorBounds.width <= 500);
                assert.equal(await page.locator('#server-language').evaluate(element => getComputedStyle(element).backgroundPositionX), '13.65px');
                await closeSettings();
                assert.equal(await page.locator('.cmdInput').evaluate(element => getComputedStyle(element).direction), 'ltr');
                assert.equal(await page.locator('.log').evaluate(element => getComputedStyle(element).direction), 'ltr');
            }
            await page.reload();
            await page.waitForSelector('.engine-card');
            assert.equal(await page.locator('#server-language').inputValue(), language);
            assert.equal(await page.locator('h1').textContent(), heading);
        }
        await openSettings();
        await page.selectOption('#server-text-size', '100');
        await closeSettings();
        await selectLanguage('en');
        assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');
        await page.evaluate(() => {
            window.aiAPI.start = async () => { throw new Error('test diagnostic'); };
        });
        await page.locator('#open-local-ai').click();
        await page.locator('#ai-primary').click();
        await page.waitForFunction(() => document.querySelector('#ai-status').textContent.includes('test diagnostic'));
        assert.equal(await page.locator('#ai-status').textContent(), 'Pena hit a problem. test diagnostic');
        await page.evaluate(() => document.querySelector('#local-ai').close());
        await selectLanguage('fi');
        assert.equal(await page.locator('#ai-status').textContent(), 'Penassa ilmeni ongelma. test diagnostic');
        await page.locator('#open-local-ai').click();
        await page.evaluate(() => {
            document.querySelector('.ai-advanced').open = true;
            document.querySelector('#ai-executable').value = 'C:\\runtime.exe';
            document.querySelector('#ai-form').requestSubmit();
        });
        assert.match(await page.locator('#ai-status').textContent(), /^Valitse sekä ohjelma/);
        await page.evaluate(() => document.querySelector('#local-ai').close());
        await selectLanguage('en');
        assert.match(await page.locator('#ai-status').textContent(), /^Pick both a runtime/);
        await page.evaluate(() => window.fixture.callbacks.ai({
            state: 'offline', setup: { installed: false, error: 'download diagnostic' }
        }));
        assert.equal(await page.locator('#ai-status').textContent(), 'Pena hit a problem. download diagnostic');
        await selectLanguage('fi');
        assert.equal(await page.locator('#ai-status').textContent(), 'Penassa ilmeni ongelma. download diagnostic');
        await page.evaluate(() => window.fixture.callbacks.ai({
            state: 'offline', setup: { installed: true }
        }));
        assert.equal(await page.locator('#ai-status').textContent(), 'Pena on asennettu ja käynnistettävissä.');
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
