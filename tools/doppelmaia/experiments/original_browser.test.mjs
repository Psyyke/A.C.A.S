import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { encodePlanes } from '../encoding.js';
import { readFile } from 'node:fs/promises';

test('original encoder preserves actual repetition and black-oriented history planes', () => {
    const history = [
        'rnbqkb1r/pppppppp/5n2/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 6 4',
        'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 5 3'
    ];
    const encoded = encodePlanes(history, [true, false]);
    assert.ok(encoded.slice(12 * 64, 13 * 64).every(value => value === 1));
    assert.ok(encoded.slice(25 * 64, 26 * 64).every(value => value === 0));
    assert.ok(encoded.slice(109 * 64, 110 * 64).every(value => value === 6));
    const black = encodePlanes(history.slice(1), [true]);
    assert.equal(black[1 * 64 + 1], 1); // Current player's knight on b8, black orientation.
    assert.ok(black.slice(108 * 64, 109 * 64).every(value => value === 1));
});

test('standalone original reviewer works fully offline for every model', { timeout: 30000 }, async () => {
    const browser = await chromium.launch({ executablePath: process.env.LC0_TEST_BROWSER });
    try {
        const page = await browser.newPage();
        const directory = resolve(process.env.ORIGINAL_REVIEW_DIR || 'temp\\doppelmaia-original-comparison');
        const report = JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8'));
        const remote = [], errors = [];
        page.on('request', request => { if(/^https?:/.test(request.url())) remote.push(request.url()); });
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(pathToFileURL(resolve(directory, 'review.html')).href);
        assert.equal(await page.locator('#model option').count(), report.models.length);
        for(const name of await page.locator('#model option').allTextContents()) {
            await page.selectOption('#model', name);
            assert.equal(await page.locator('#predictions tr').count(), report.splitPositions.test);
        }
        assert.deepEqual(remote, []);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
});
