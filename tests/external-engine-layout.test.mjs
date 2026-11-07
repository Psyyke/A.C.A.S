import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

test('external engine launch parameters do not reserve empty title space', async () => {
    const styles = ['../assets/css/custom-inputs.css', '../app/gui.css']
        .map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent(`<style>${styles}</style><dialog open><div class="dropdown-input">
            <div class="direct-engine-settings-container">
                <div class="textfield-input custom-input dynamic-param-input">
                    <div><div class="input-title">Launch parameters</div></div>
                    <input type="text" placeholder="--name=value">
                </div>
            </div></div></dialog>`);
        const measure = () => page.locator('.dynamic-param-input').evaluate(container => {
            const title = container.firstElementChild.getBoundingClientRect();
            const input = container.querySelector('input').getBoundingClientRect();
            const bounds = container.getBoundingClientRect();
            return { titleHeight: title.height, gap: input.top - title.bottom, bottom: bounds.bottom - input.bottom };
        });
        for(const width of [800, 360]) {
            await page.setViewportSize({ width, height: 600 });
            for(const withShortcut of [false, true]) {
                await page.locator('.dynamic-param-input > div').evaluate((copy, enabled) => {
                    copy.classList.toggle('dynamic-setting-copy', enabled);
                    copy.innerHTML = enabled
                        ? '<div class="dynamic-setting-title-row"><div class="input-title">Launch parameters</div><button class="dynamic-setting-shortcut"></button></div>'
                        : '<div class="input-title">Launch parameters</div>';
                }, withShortcut);
                const result = await measure();
                assert.ok(result.titleHeight <= (withShortcut ? 36 : 24), JSON.stringify(result));
                assert.ok(result.gap >= 0 && result.gap <= 12, JSON.stringify(result));
                assert.ok(result.bottom <= 13, JSON.stringify(result));
            }
        }
    } finally {
        await browser.close();
    }
});
