import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright';

test('clock toast supports a custom delayed subtitle without changing engine defaults', async () => {
    const source = await readFile(new URL('../app/assets/js/misc/toastMessage.js', import.meta.url), 'utf8');
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.setContent('<body></body>');
        const notes = await page.evaluate(source => {
            const ticks = [];
            window.setInterval = callback => { ticks.push(callback); return ticks.length; };
            window.TRANS_OBJ = { dependingOnNetworkSpeed: 'Engine network subtitle' };
            const toast = new Function(`${source}; return toast;`)();
            toast.instance('Engine');
            toast.instance('Weights', undefined, 'Local weights subtitle');
            for(let i = 0; i < 40; i++) ticks.forEach(tick => tick());
            return [...document.querySelectorAll('.acas-toast-content')].map(element => element.innerText);
        }, source);
        assert.ok(notes.some(note => note.includes('Engine network subtitle')));
        const weights = notes.find(note => note.startsWith('Weights'));
        assert.ok(weights.includes('Local weights subtitle'));
        assert.ok(!weights.includes('Engine network subtitle'));
    } finally { await browser.close(); }
});
