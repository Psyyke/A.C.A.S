import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { buildUserscript } from './elo-tool/userscriptHarness.mjs';

test('advanced search mode and time budget persist in the selected profile', { timeout: 60000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    try {
        await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
        await context.route('http://localhost/A.C.A.S/**', async route => {
            const request = new URL(route.request().url());
            const response = await route.fetch({ url: `${url}${request.pathname.slice('/A.C.A.S'.length)}${request.search}` });
            await route.fulfill({ response });
        });
        await context.addInitScript(() => {
            if(localStorage.getItem('gm:isTosAccepted')) return;
            localStorage.setItem('gm:isTosAccepted', 'true');
            localStorage.setItem('gm:AcasConfig', JSON.stringify({ global: {
                chessEngineProfile: 'default', profiles: { default: { engineEnabled: true, enableAdvancedElo: true } }
            } }));
        });
        const page = await context.newPage();
        await page.addInitScript(await buildUserscript());
        await page.goto('http://localhost/A.C.A.S/app/');
        await page.waitForFunction(() => window.USERSCRIPT && document.querySelector('input[data-key="advancedSearchMode"]').value);
        await page.locator('#engine-elo-input .open-floaty-btn').click();
        const dialog = page.locator('#elo-floaty');
        const mode = dialog.locator('input[data-key="advancedSearchMode"]');
        const budget = dialog.locator('input[data-key="advancedSearchMovetime"]');
        const depth = dialog.locator('input[data-key="advancedEloDepth"]');
        const nodes = dialog.locator('input[data-key="engineNodes"]');
        const maxTime = page.locator('input[data-key="maxMovetime"]');
        assert.equal(await mode.inputValue(), 'standard');
        assert.equal(await budget.inputValue(), '5000');
        await page.waitForFunction(() => document.querySelector('input[data-key="advancedSearchMovetime"]').disabled);
        assert.equal(await depth.isEnabled(), true);
        assert.equal(await nodes.isEnabled(), true);
        assert.equal(await maxTime.isEnabled(), true);
        await mode.locator('..').locator('.dropdown-icon').click();
        await dialog.locator('.dropdown-item[data-value="movetime"]').click();
        await page.waitForFunction(() => document.querySelector('input[data-key="maxMovetime"]').disabled);
        assert.equal(await depth.isDisabled(), true);
        assert.equal(await nodes.isDisabled(), true);
        await budget.fill('7000');
        await budget.dispatchEvent('change');
        await page.waitForFunction(() => {
            const profile = JSON.parse(localStorage.getItem('gm:AcasConfig')).global.profiles.default;
            return profile.advancedSearchMode === 'movetime' && profile.advancedSearchMovetime === 7000;
        });
        await page.reload();
        await page.waitForFunction(() => document.querySelector('input[data-key="advancedSearchMode"]').value === 'movetime'
            && document.querySelector('input[data-key="advancedSearchMovetime"]').value === '7000');
        await page.waitForFunction(() => document.querySelector('input[data-key="maxMovetime"]').disabled);
        await page.locator('#engine-elo-input .open-floaty-btn').click();
        await mode.locator('..').locator('.dropdown-icon').click();
        await dialog.locator('.dropdown-item[data-value="infinite"]').click();
        await page.waitForFunction(() => !document.querySelector('input[data-key="maxMovetime"]').disabled);
        assert.equal(await depth.isDisabled(), true);
        assert.equal(await nodes.isDisabled(), true);
        assert.equal(await budget.isDisabled(), true);
        await mode.locator('..').locator('.dropdown-icon').click();
        await dialog.locator('.dropdown-item[data-value="standard"]').click();
        await page.waitForFunction(() => !document.querySelector('input[data-key="advancedEloDepth"]').disabled);
        assert.equal(await nodes.isEnabled(), true);
        await dialog.locator('.floaty-close-btn').click();

        const rendering = page.locator('#rendering-floaty');
        await page.locator('.floaty-wrapper').filter({ has: rendering }).locator('.open-floaty-btn').first().click();
        const visionDropdown = rendering.locator('#vision-side-dropdown .dropdown-input-container');
        await visionDropdown.scrollIntoViewIfNeeded();

        async function checkDropdownOverlay(floaty, dropdown) {
            const list = dropdown.locator('.dropdown-list-container');
            await page.mouse.move(0, 0);
            const closedHeight = await floaty.evaluate(element => element.scrollHeight);
            await dropdown.hover();
            await page.waitForFunction(element => element.matches(':popover-open'), await list.elementHandle());
            assert.equal(await floaty.evaluate(element => element.scrollHeight), closedHeight,
                'Opening the dropdown must not add dialog scroll space');
            assert.equal(await list.evaluate(element => {
                const bounds = element.getBoundingClientRect();
                return bounds.left >= 0 && bounds.right <= innerWidth
                    && bounds.top >= 0 && bounds.bottom <= innerHeight;
            }), true, 'The dropdown must stay within the viewport');
            await page.mouse.move(0, 0);
            await page.waitForFunction(element => !element.matches(':popover-open'), await list.elementHandle());
            assert.equal(await floaty.evaluate(element => element.scrollHeight), closedHeight,
                'Closing the dropdown must not leave extra scroll space');
        }

        await checkDropdownOverlay(rendering, visionDropdown);
        await visionDropdown.scrollIntoViewIfNeeded();
        await visionDropdown.hover();
        await rendering.locator('#vision-side-dropdown .dropdown-item[data-value="own"]').click();
        assert.equal(await rendering.locator('input[data-key="renderVisionSide"]').inputValue(), 'own');
        await rendering.locator('.floaty-close-btn').click();

        await page.evaluate(async () => {
            const { initializeDropdown } = await import('/A.C.A.S/app/assets/js/gui/domDropdown.js');
            const floaty = document.createElement('dialog');
            floaty.id = 'test-short-floaty';
            floaty.innerHTML = '<div class="floaty-container"><section class="floaty-body">'
                + '<div class="dropdown-input"><div class="dropdown-input-container">'
                + '<input data-default-value="one" value="one"><div class="dropdown-icon"></div>'
                + '<div class="dropdown-list-container"><div class="dropdown-item" data-value="one">One</div>'
                + '<div class="dropdown-item" data-value="two">Two</div></div></div></div></section></div>';
            initializeDropdown(floaty.querySelector('.dropdown-input'));
            document.body.appendChild(floaty);
            floaty.showModal();
        });
        const shortFloaty = page.locator('#test-short-floaty');
        const shortDropdown = shortFloaty.locator('.dropdown-input-container');
        await checkDropdownOverlay(shortFloaty, shortDropdown);
        await shortDropdown.hover();
        await page.waitForFunction(() =>
            document.querySelector('#test-short-floaty .dropdown-list-container').matches(':popover-open'));
        assert.equal(await shortFloaty.evaluate(element => element.querySelector('.dropdown-list-container')
            .getBoundingClientRect().bottom > element.getBoundingClientRect().bottom), true);
        await shortDropdown.locator('.dropdown-item[data-value="two"]').click();
        assert.equal(await shortDropdown.locator('input').inputValue(), 'two',
            'Dropdown options outside the dialog must remain clickable');
        await shortFloaty.evaluate(element => element.remove());
    } finally {
        await context.close();
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
