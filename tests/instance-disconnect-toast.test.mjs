import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

test('disconnected instances close and their warning disappears after about 1.5 seconds', async () => {
    const manager = readFileSync(new URL('../app/assets/js/instanceManager.js', import.meta.url), 'utf8');
    const toast = readFileSync(new URL('../app/assets/js/misc/toastMessage.js', import.meta.url), 'utf8');
    const start = manager.lastIndexOf('setInterval(() => {');
    assert.ok(start >= 0);
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent('<!doctype html><body></body>');
        const elapsed = await page.evaluate(async ({ manager, toast }) => {
            new Function(`${toast}; window.toast = toast;`)();
            window.TRANS_OBJ = {};
            window.closedInstance = false;
            window.AcasInstances = [{ domain: 'example.test', date: Date.now() - 11000, instance: {
                close: () => { window.closedInstance = true; }
            } }];
            let check;
            const original = window.setInterval;
            window.setInterval = callback => { check = callback; };
            new Function(manager)();
            window.setInterval = original;
            const started = performance.now();
            check();
            if(!window.closedInstance) throw new Error('Instance was not closed');
            if(!document.querySelector('.acas-toast')) throw new Error('Warning was not shown');
            await new Promise((resolve, reject) => {
                const timer = original(() => {
                    if(!document.querySelector('.acas-toast')) {
                        clearInterval(timer);
                        resolve();
                    } else if(performance.now() - started > 3000) {
                        clearInterval(timer);
                        reject(new Error('Warning did not disappear'));
                    }
                }, 20);
            });
            return performance.now() - started;
        }, { manager: manager.slice(start), toast });
        assert.ok(elapsed >= 1400 && elapsed < 2200, `toast lasted ${elapsed}ms`);
    } finally {
        await browser.close();
    }
});
