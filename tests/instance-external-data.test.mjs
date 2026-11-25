import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

test('external instance metadata remains text and selectors handle special characters', async () => {
    const setup = readFileSync(new URL('../app/assets/js/instance/setupEnvironment.js', import.meta.url), 'utf8');
    const start = setup.indexOf('        const escapedInstanceID =');
    const endMarker = '        acasInstanceElem.style.width = instanceWidth;';
    const end = setup.indexOf(endMarker, start) + endMarker.length;
    assert.ok(start >= 0 && end > start);
    const instances = readFileSync(new URL('../app/assets/js/gui/instances.js', import.meta.url), 'utf8');
    const first = instances.indexOf('export function addInstanceToSettingsDropdown(');
    const last = instances.indexOf('\nexport function removeInstanceFromSettingsDropdown', first);
    assert.ok(first >= 0 && last > first);
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.setContent('<div id="instances"></div><div id="dropdown"></div>');
        const result = await page.evaluate(({ setupSource, dropdownSource }) => {
            const id = 'x"]</style><img src=x onerror="window.injected=true">';
            const run = new Function('TRANS_OBJ', 'GET_PIECE_STYLE_DIMENSIONS', 'GET_BACKGROUND_STYLE_DIMENSION',
                'localStorage', 'INSTANCE_SIZE_KEY', 'BOARD_SIZE_MODIFIER_KEY', 'IS_INSTANCE_SETTING_BTN_DISABLED',
                'isConcealAssistanceActive', 'fen', 'boardDimensions',
                `${setupSource}\nreturn acasInstanceElem;`);
            const element = run.call({ instanceID: id }, {}, () => ({ width: 12.5, height: 12.5 }),
                () => 100, { getItem: () => '1' }, 'size', 'modifier', false, false, 'fen', { width: 8, height: 8 });
            document.querySelector('#instances').append(element);
            const dropdown = document.querySelector('#dropdown');
            const add = new Function('settingsInstanceDropdownContentElem',
                `${dropdownSource.replace('export ', '')}\nreturn addInstanceToSettingsDropdown;`)(dropdown);
            add(id, '<img src=x>', '<svg onload=alert(1)>', element);
            const title = dropdown.querySelector('.dropdown-item-title');
            const subtitle = dropdown.querySelector('.dropdown-item-subtitle');
            return {
                id,
                selected: document.querySelector(`.acas-instance[data-instance-id="${CSS.escape(id)}"]`) === element,
                styleText: element.querySelector('style').textContent,
                styleRules: element.querySelector('style').sheet.cssRules.length,
                title: title.textContent,
                subtitle: subtitle.textContent,
                injectedElements: document.querySelectorAll('img, svg').length,
                injected: window.injected === true
            };
        }, { setupSource: setup.slice(start, end), dropdownSource: instances.slice(first, last) });
        assert.equal(result.selected, true);
        assert.ok(result.styleText.includes('cg-board'));
        assert.equal(result.styleRules, 3);
        assert.equal(result.title, '<svg onload=alert(1)> (<img src=x>)');
        assert.equal(result.subtitle, result.id);
        assert.equal(result.injectedElements, 0);
        assert.equal(result.injected, false);
    } finally { await browser.close(); }
});
