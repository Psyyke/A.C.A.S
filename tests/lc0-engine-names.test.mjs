import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { normalizeLc0Engine, isUpstreamLc0 } from '../app/assets/js/instance/lc0Engines.js';

test('versioned backend IDs preserve earlier Lc0 selections', () => {
    for(const [old, current] of [
        ['modern-lc0', 'lc0-v0.32.1-wasm'], ['lc0-v0.32.1', 'lc0-v0.32.1-wasm'],
        ['modern-lc0-webgpu', 'lc0-v0.32.1-webgpu']
    ]) {
        assert.equal(normalizeLc0Engine(old), current);
        assert.equal(isUpstreamLc0(old), true);
        assert.equal(isUpstreamLc0(current), true);
    }
    assert.equal(normalizeLc0Engine('lc0'), 'lc0');
});

test('saved old engine IDs select the versioned dropdown entries', async () => {
    const source = (await readFile(new URL('../app/assets/js/gui/domInputs.js', import.meta.url), 'utf8'))
        .replace(/^import .*;\r?\n/gm, '').replaceAll('export function', 'function');
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.setContent(await readFile(new URL('../app/index.html', import.meta.url), 'utf8'));
        const result = await page.evaluate(source => {
            const normalize = value => ({ 'modern-lc0': 'lc0-v0.32.1-wasm',
                'modern-lc0-webgpu': 'lc0-v0.32.1-webgpu' })[value] ?? value;
            const set = new Function('normalizeLc0Engine', 'VAR_TO_CORRECT_TYPE',
                `${source}; return setInputValue;`)(normalize, value => value);
            const input = document.querySelector('input[data-key="chessEngine"]');
            return ['modern-lc0', 'modern-lc0-webgpu'].map(value => {
                set(input, value);
                return { value: input.value,
                    selected: input.parentElement.querySelector('.selected-list-item')?.dataset.value };
            });
        }, source);
        assert.deepEqual(result, [
            { value: 'lc0-v0.32.1-wasm', selected: 'lc0-v0.32.1-wasm' },
            { value: 'lc0-v0.32.1-webgpu', selected: 'lc0-v0.32.1-webgpu' }
        ]);
    } finally { await browser.close(); }
});
