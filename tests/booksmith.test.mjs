import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

runInThisContext(readFileSync(new URL('../app/assets/js/misc/PolyglotBook.js', import.meta.url), 'utf8'));
const {
    addGames, addLine, addOpeningsFrom, bookMove, finishBook, gamePlayers, guessPlayer, indexOpenings, layerShares, mergeBooks, mergePosition,
    positionKey, readBin, readEpd, readGames, readPgn, startFen, writeBin
} = await import('../tools/booksmith/book.js');
const { bookPresets, buildPreset } = await import('../tools/booksmith/presets.js');
const { readWorkspace, writeWorkspace } = await import('../tools/booksmith/workspace.js');

const castleFen = 'r3k2r/pppqbppp/2np1n2/4p3/2B1P1b1/2NP1N2/PPPQBPPP/R3K2R w KQkq - 0 1';
const promoteFen = '8/P6k/8/8/8/8/6K1/8 w - - 0 1';
const startKey = positionKey(startFen);

test('position keys match the Polyglot standard', () => {
    assert.equal(startKey, '463b96181691fc9c');
    assert.equal(positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'), '823c9b50fd114196');
});

test('written books read back in the app with castling, promotion and weights', () => {
    const book = new Map();
    addLine(book, ['e4'], { weight: 80 });
    addLine(book, ['d4'], { weight: 20 });
    addLine(book, ['O-O-O'], { fen: castleFen });
    addLine(book, ['a8=N'], { fen: promoteFen });
    const bytes = writeBin(book);
    const reader = new POLYGLOT_BOOK(bytes);
    const start = reader.getMoves(startFen);
    assert.deepEqual(start.map(move => move.from + move.to), ['e2e4', 'd2d4']);
    assert.equal(start[0].weight, 65535);
    assert.ok(Math.abs(start[1].weight / start[0].weight - 0.25) < 0.001);
    assert.deepEqual(reader.getMoves(castleFen).map(move => move.from + move.to), ['e1a1']);
    assert.equal(reader.getMoves(promoteFen)[0].promotion, 'N');
    const again = readBin(bytes);
    assert.deepEqual([...again.get(startKey)].map(([code, weight]) => [code, Math.round(weight)]), [['e2e4', 100], ['d2d4', 25]]);
    assert.deepEqual(writeBin(again), bytes);
    const fine = new Map([[startKey, new Map([['e2e4', 65535], ['d2d4', 7], ['g1f3', 0]])]]);
    const view = new DataView(writeBin(readBin(writeBin(fine))).buffer);
    assert.deepEqual([view.getUint16(10), view.getUint16(26), view.getUint16(42)], [65535, 7, 0]);
});

test('stacked books merge by priority, blend or equal share', () => {
    const top = { book: new Map() };
    const bottom = { book: new Map() };
    addLine(top.book, ['e4', 'c5']);
    addLine(bottom.book, ['d4']);
    addLine(bottom.book, ['e4', 'e5']);
    const after = positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    const layers = [top, bottom];
    const shares = mode => Object.fromEntries(mergePosition(layers, startKey, mode).map(move => [move.code, +move.share.toFixed(3)]));
    assert.deepEqual(shares('priority'), { e2e4: 1 });
    assert.deepEqual(shares('blend'), { e2e4: 0.833, d2d4: 0.167 });
    assert.deepEqual(shares('equal'), { e2e4: 0.75, d2d4: 0.25 });
    assert.deepEqual([...mergeBooks(layers, 'priority').get(after).keys()], ['c7c5']);
    assert.deepEqual(mergeBooks(layers, 'priority').get(positionKey('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1')), undefined);
    assert.deepEqual([...mergeBooks(layers, 'equal').get(startKey)].map(([code, weight]) => [code, Math.round(weight)]), [['e2e4', 100], ['d2d4', 33]]);
    assert.deepEqual(layerShares(layers, 'blend').map(share => +share.toFixed(3)), [0.667, 0.333]);
});

test('games and named lines become weighted books', async () => {
    const book = readPgn('[Event "a"]\n\n1. e4 e5 2. Nf3 *\n\n[Event "b"]\n\n1. e4 (1. d4) c5 *\n\n[Event "c"]\n\n1. d4 d5 *');
    assert.deepEqual([...book.get(startKey)], [['e2e4', 100], ['d2d4', 50]]);
    const exported = readPgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. 0-0 Be7 5. d4 exd4 6. e5 d5 7. exd6 e.p. Bxd6 *');
    assert.equal([...exported.values()].reduce((sum, moves) => sum + moves.size, 0), 14);
    const { names, lines } = indexOpenings([
        { name: 'Sicilian Defense', pgn: '1. e4 c5' },
        { name: 'Sicilian Defense: Najdorf', pgn: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6' },
        { name: 'French Defense', pgn: '1. e4 e6' }
    ]);
    const afterE4 = positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    assert.equal(names.get(positionKey('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2')), 'Sicilian Defense');
    const grown = new Map();
    assert.equal(addOpeningsFrom(grown, lines, afterE4), 10);
    assert.deepEqual([...grown.get(afterE4)], [['c7c5', 100], ['e7e6', 50]]);
    assert.equal(grown.has(startKey), false);
    const epd = await readEpd('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - bm e4 Nf3;');
    assert.deepEqual([...epd.get(startKey).keys()], ['e2e4', 'g1f3']);
});

test('player games become a personal book of only their moves', () => {
    const pgn = [
        ['Hero', 'Ann', '1. e4 e5 2. Nf3 Nc6 3. Bb5'],
        ['Hero', 'Bob', '1. e4 c5 2. Nf3'],
        ['Cat', 'hero', '1. d4 Nf6 2. c4 e6'],
        ['Dan', 'Hero', '1. e4 c5 2. Nf3 d6']
    ].map(([white, black, moves], index) =>
        `[Site "https://lichess.org/g${index}"]\n[White "${white}"]\n[Black "${black}"]\n\n${moves} { [%clk 0:03:00] } *`).join('\n\n');
    const games = readGames(pgn + '\n\n[Site "https://lichess.org/g0"]\n[White "Hero"]\n[Black "Ann"]\n\n1. e4 e5 *');
    assert.equal(games.length, 4);
    const players = gamePlayers(games);
    assert.deepEqual(players[0], { name: 'Hero', games: 4 });
    assert.equal(guessPlayer('lichess-hero-blitz-partial.pgn', players, games.length), 'Hero');
    assert.equal(guessPlayer('lichess-cat.pgn', players, games.length), 'Cat');
    assert.equal(guessPlayer('games.pgn', players, games.length), 'Hero');
    assert.equal(guessPlayer('games.pgn', [{ name: 'A', games: 1 }, { name: 'B', games: 1 }], 2), '');

    const book = new Map();
    assert.equal(addGames(book, games, { player: 'hero', plies: 4 }), 4);
    finishBook(book);
    const afterE4 = positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    const afterD4 = positionKey('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1');
    assert.deepEqual([...book.get(startKey)], [['e2e4', 100]]);
    assert.deepEqual([...book.get(afterE4)], [['c7c5', 100]]);
    assert.deepEqual([...book.get(afterD4)], [['g8f6', 100]]);
    assert.equal([...book.values()].reduce((sum, moves) => sum + moves.size, 0), 7);

    const white = new Map();
    addGames(white, games, { player: 'Hero', side: 'w', plies: 30 });
    finishBook(white, 2);
    assert.deepEqual([...white], [[startKey, new Map([['e2e4', 100]])]]);
});

test('game imports report invalid moves and starting positions without warning about the depth limit', () => {
    const games = readGames('[White "A"]\n[Black "B"]\n\n1. e4 e5 2. NotAMove Nc6 *\n\n'
        + '[White "A"]\n[Black "B"]\n[FEN "invalid"]\n\n1. e4 *\n\n'
        + '[White "A"]\n[Black "B"]\n\n1. d4 d5 *');
    const issues = [];
    const book = new Map();
    assert.equal(addGames(book, games, { onIssue: issue => issues.push(issue) }), 2);
    assert.equal(issues.length, 2);
    assert.equal(issues[0].token, 'NotAMove');
    assert.equal(issues[0].parsed, 2);
    assert.match(issues[1].reason, /starting position/);
    assert.deepEqual([...book.get(startKey)], [['e2e4', 1], ['d2d4', 1]]);
    const limitedIssues = [];
    addGames(new Map(), [games[0]], { plies: 2, onIssue: issue => limitedIssues.push(issue) });
    assert.deepEqual(limitedIssues, []);
});

test('workspace backups preserve separate books, fractional and zero weights and stack settings', () => {
    const stack = {
        mode: 'blend', orientation: 'black', active: 'b',
        layers: [
            { id: 'a', name: 'Main book', color: '#527783', enabled: true,
                book: new Map([[startKey, new Map([['e2e4', 100], ['d2d4', 0.125], ['g1f3', 0]])]]) },
            { id: 'b', name: 'Hidden empty book', color: '#c9822b', enabled: false, book: new Map() }
        ]
    };
    const text = writeWorkspace(stack);
    assert.deepEqual(readWorkspace(text), stack);
    const mutate = change => {
        const data = JSON.parse(text);
        change(data);
        return JSON.stringify(data);
    };
    assert.throws(() => readWorkspace(mutate(data => { data.version = 2; })), /supported/);
    assert.throws(() => readWorkspace(mutate(data => { data.layers[1].id = 'a'; })), /book/);
    assert.throws(() => readWorkspace(mutate(data => { data.layers[0].id = 'invalid"]'; })), /book/);
    assert.throws(() => readWorkspace(mutate(data => { data.active = 'missing'; })), /selected/);
    assert.throws(() => readWorkspace(mutate(data => { data.layers[0].positions[0][1][0][1] = -1; })), /weight/);
    assert.throws(() => readWorkspace(mutate(data => { data.layers[0].positions.push(data.layers[0].positions[0]); })), /repeated/);
    assert.throws(() => readWorkspace(mutate(data => { data.layers[0].positions[0][1].push(['e2e4', 1]); })), /repeated/);
});

test('presets create short legal starters and personality-weighted repertoires', async () => {
    const lines = indexOpenings(JSON.parse(readFileSync(new URL('../app/assets/openings/pgn.json', import.meta.url), 'utf8'))).lines;
    const beginner = await buildPreset('beginner', lines);
    const { Chess } = await import('../app/assets/engines/libraries/chessjs/chess.js');
    const queue = [{ fen: startFen, plies: 0 }], seen = new Set();
    while(queue.length) {
        const { fen, plies } = queue.shift();
        const key = positionKey(fen);
        if(seen.has(key) || !beginner.has(key)) continue;
        seen.add(key);
        assert.ok(plies < 8, 'starter must stop after four full moves');
        const chess = new Chess(fen);
        const legal = new Map(chess.moves({ verbose: true }).map(move => [bookMove(move), move]));
        for(const code of beginner.get(key).keys()) {
            assert.ok(legal.has(code), `illegal starter move ${code}`);
            chess.move(legal.get(code));
            queue.push({ fen: chess.fen(), plies: plies + 1 });
            chess.undo();
        }
    }
    assert.equal(seen.size, beginner.size, 'all starter positions must be reachable');
    assert.ok(beginner.size > 30 && beginner.size < 100);
    assert.deepEqual([...beginner.get(startKey).keys()].sort(), ['c2c4', 'd2d4', 'e2e4', 'g1f3']);
    assert.equal(readBin(writeBin(beginner)).size, beginner.size);

    const sicilian = await buildPreset('sicilian', lines);
    assert.deepEqual([...sicilian.get(startKey).keys()], ['e2e4']);
    const e4 = positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    assert.deepEqual([...sicilian.get(e4).keys()], ['c7c5']);
    const common = await buildPreset('common', lines);
    const knight = await buildPreset('style-knight-fan', lines);
    const ratio = book => book.get(startKey).get('g1f3') / book.get(startKey).get('e2e4');
    assert.ok(ratio(knight) > ratio(common) * 2, 'knight style must actually change move odds');
    for(const weights of knight.values()) {
        assert.ok([...weights.values()].every(weight => Number.isFinite(weight) && weight > 0 && weight <= 100));
    }
    await assert.rejects(buildPreset('not-a-preset', lines), /Unknown/);
});

test('imported player games build a new book layer', { timeout: 60000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error));
        await page.goto(`${url}/tools/booksmith/`);
        await page.waitForSelector('#board cg-board');
        const pgn = ['Hero-Ann-1. e4 e5 2. Nf3', 'Bob-Hero-1. d4 d5', 'Hero-Cat-1. e4 c5'].map((game, index) => {
            const [white, black, moves] = game.split('-');
            return `[Site "https://lichess.org/g${index}"]\n[White "${white}"]\n[Black "${black}"]\n\n${moves} *\n\n`;
        }).join('');
        const file = { name: 'lichess-hero-blitz.pgn', mimeType: 'application/x-chess-pgn', buffer: Buffer.from(pgn) };
        await page.setInputFiles('#import', file);
        await page.locator('#games').waitFor();
        assert.equal(await page.locator('#games-count').textContent(), '3 games');
        assert.equal(await page.inputValue('#games-player'), 'Hero');
        const help = page.getByRole('button', { name: 'Help for Min. games', exact: true });
        await help.focus();
        const tip = page.locator('#games-min-help');
        assert.equal(await tip.evaluate(element => getComputedStyle(element).visibility), 'visible');
        assert.match(await tip.textContent(), /same position/);
        await page.keyboard.press('Escape');
        assert.equal(await tip.evaluate(element => getComputedStyle(element).visibility), 'hidden');
        assert.ok(await page.getByRole('button', { name: 'Help for Merge', exact: true }).isVisible());
        await page.click('#games-cancel');
        await page.locator('#games').waitFor({ state: 'hidden' });
        assert.equal(await page.locator('.book-layer').count(), 1);

        await page.setInputFiles('#import', file);
        await page.locator('#games').waitFor();
        await page.selectOption('#games-side', 'b');
        await page.fill('#games-min', '5');
        const busy = await page.evaluate(async () => {
            document.querySelector('#games').requestSubmit();
            await Promise.resolve();
            const button = document.querySelector('#games-build');
            return { disabled: button.disabled, text: button.textContent.trim() };
        });
        assert.ok(busy.disabled);
        assert.match(busy.text, /%/);
        await page.locator('#games-note').filter({ hasText: /./ }).waitFor();
        assert.ok(await page.locator('#games').isVisible());
        assert.equal(await page.inputValue('#games-side'), 'b');
        await page.selectOption('#games-side', '');
        await page.fill('#games-min', '1');
        await page.click('#games-build');
        await page.locator('#games').waitFor({ state: 'hidden' });
        assert.deepEqual(await page.locator('.book-layer-name').evaluateAll(items => items.map(item => item.value)), ['Hero']);
        assert.equal(await page.textContent('#status'), 'Built from 3 games');
        assert.deepEqual(await page.locator('#moves .book-move-san').allTextContents(), ['e4']);
        await page.waitForFunction(() => !document.querySelector('#preset').disabled);
        await page.selectOption('#preset', 'beginner');
        await page.click('#preset-add');
        await page.waitForFunction(() => document.querySelector('.book-layer-active .book-layer-name')?.value === 'Beginner essentials');
        assert.equal(await page.locator('.book-layer').count(), 2);
        assert.match(await page.locator('#preset-help').textContent(), /Four moves deep/);
        await page.keyboard.press('Control+z');
        assert.deepEqual(await page.locator('.book-layer-name').evaluateAll(items => items.map(item => item.value)), ['Hero']);
        await page.keyboard.press('Control+y');
        assert.equal(await page.locator('.book-layer').count(), 2);
        await page.waitForFunction(() => document.querySelector('#saved-status').textContent === 'Saved in this browser');
        await page.reload();
        await page.waitForFunction(() => document.querySelector('.book-layer-active .book-layer-name')?.value === 'Beginner essentials');
        assert.equal(await page.locator('.book-layer').count(), 2);
        assert.equal(await page.locator('#preset option').count(), bookPresets.length + 1);
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('storage failures are visible and cannot overwrite unread saved work', { timeout: 60000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        for(const failure of ['read', 'open', 'write']) {
            const context = await browser.newContext();
            await context.addInitScript(() => {
                const open = IDBFactory.prototype.open;
                IDBFactory.prototype.open = function(name, ...args) {
                    if(name === 'A.C.A.S-BookSmith' && sessionStorage.getItem('storage-failure') === 'open')
                        throw new DOMException('Storage unavailable', 'SecurityError');
                    return open.call(this, name, ...args);
                };
                const get = IDBObjectStore.prototype.get;
                IDBObjectStore.prototype.get = function(key) {
                    if(this.name === 'state' && key === 'stack' && sessionStorage.getItem('storage-failure') === 'read') {
                        const request = { error: new DOMException('Read failed', 'UnknownError') };
                        setTimeout(() => request.onerror?.(), 0);
                        return request;
                    }
                    return get.call(this, key);
                };
                const put = IDBObjectStore.prototype.put;
                IDBObjectStore.prototype.put = function(...args) {
                    if(this.name === 'state' && sessionStorage.getItem('storage-failure') === 'write')
                        throw new DOMException('Storage full', 'QuotaExceededError');
                    return put.apply(this, args);
                };
            });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(`${url}/tools/booksmith/`);
            await page.locator('#clear-all:not([disabled])').waitFor();
            await page.setInputFiles('#import', { name: 'saved.bin', mimeType: 'application/octet-stream',
                buffer: Buffer.from(writeBin(new Map([[startKey, new Map([['e2e4', 100], ['g1f3', 10]])]]))) });
            await page.locator('.book-move').first().waitFor();
            await page.locator('.book-layer-name').fill('Existing saved work');
            await page.waitForFunction(() => document.querySelector('#saved-status').textContent === 'Saved in this browser');
            await page.evaluate(value => sessionStorage.setItem('storage-failure', value), failure);
            if(failure === 'write') {
                await page.locator('.book-layer-name').fill('Unsaved edit');
                await page.locator('#storage-warning').waitFor();
                assert.match(await page.locator('#storage-warning').textContent(), /Could not save/);
            } else {
                await page.reload();
                await page.locator('#storage-warning').waitFor();
                assert.match(await page.locator('#storage-warning').textContent(), failure === 'read' ? /Saving is paused/ : /unavailable/);
                await page.locator('.book-layer-name').fill('New volatile workspace');
                await page.waitForTimeout(600);
                assert.equal(await page.locator('#saved-status').textContent(), 'Not saved in this browser');
            }
            await page.evaluate(() => sessionStorage.removeItem('storage-failure'));
            await page.reload();
            await page.locator('#clear-all:not([disabled])').waitFor();
            assert.equal(await page.locator('.book-layer-name').inputValue(), 'Existing saved work');
            assert.deepEqual(await page.locator('.book-move-san').allTextContents(), ['e4', 'Nf3']);
            assert.equal(await page.locator('#storage-warning').isVisible(), false);
            assert.deepEqual(errors, []);
            await context.close();
        }
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('workspace backup and restore preserve the stack, support undo and reject invalid or cancelled restores', { timeout: 60000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(`${url}/tools/booksmith/`);
        await page.locator('#clear-all:not([disabled])').waitFor();
        const file = (name, moves) => ({ name, mimeType: 'application/octet-stream',
            buffer: Buffer.from(writeBin(new Map([[startKey, new Map(moves)]]))) });
        await page.setInputFiles('#import', [
            file('top.bin', [['e2e4', 100], ['d2d4', 0.125], ['g1f3', 0]]),
            file('bottom.bin', [['c2c4', 100]])
        ]);
        await page.waitForFunction(() => document.querySelectorAll('.book-layer').length === 2);
        await page.locator('.book-layer-name').first().fill('Main book');
        await page.locator('.book-layer-toggle').last().click();
        await page.locator('.book-mode label').filter({ hasText: 'Blend' }).click();
        await page.click('#nav-flip');
        const backup = async () => {
            const pending = page.waitForEvent('download');
            await page.click('#backup-workspace');
            const download = await pending;
            assert.equal(download.suggestedFilename(), 'booksmith-workspace.json');
            return readFileSync(await download.path(), 'utf8');
        };
        const original = await backup();
        const originalStack = readWorkspace(original);
        assert.equal(originalStack.orientation, 'black');
        assert.equal(originalStack.layers[1].enabled, false);
        page.once('dialog', dialog => dialog.accept());
        await page.click('#clear-all');
        await page.locator('.book-layer-name').fill('Before restore');
        await page.locator('.book-mode label').filter({ hasText: 'Priority' }).click();
        await page.click('#nav-flip');
        const before = await backup();
        const restoreFile = text => ({ name: 'workspace.json', mimeType: 'application/json', buffer: Buffer.from(text) });
        await page.setInputFiles('#restore-workspace', restoreFile('{"format":"acas-booksmith","version":99}'));
        await page.locator('#status').filter({ hasText: 'Could not restore workspace' }).waitFor();
        assert.equal(await backup(), before);
        page.once('dialog', dialog => dialog.dismiss());
        await page.setInputFiles('#restore-workspace', restoreFile(original));
        await page.locator('#restore-workspace:not([disabled])').waitFor();
        assert.equal(await backup(), before);
        page.once('dialog', dialog => dialog.accept());
        await page.setInputFiles('#restore-workspace', restoreFile(original));
        await page.locator('#status').filter({ hasText: 'Workspace restored' }).waitFor();
        assert.equal(await backup(), original);
        await page.keyboard.press('Control+z');
        assert.equal(await backup(), before);
        await page.keyboard.press('Control+y');
        assert.equal(await backup(), original);
        await page.waitForFunction(() => document.querySelector('#saved-status').textContent === 'Saved in this browser');
        await page.reload();
        await page.locator('#clear-all:not([disabled])').waitFor();
        assert.equal(await backup(), original);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('incomplete PGN warnings persist for player and headerless imports but not chosen depth limits', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(`${url}/tools/booksmith/`);
        const pgn = { name: 'partial.pgn', mimeType: 'application/x-chess-pgn',
            buffer: Buffer.from('[White "Example"]\n[Black "Other"]\n\n1. e4 e5 2. NotAMove Nc6 *') };
        await page.setInputFiles('#import', pgn);
        await page.locator('#games').waitFor();
        await page.selectOption('#games-player', '');
        await page.click('#games-build');
        await page.locator('#games').waitFor({ state: 'hidden' });
        const warning = page.locator('#import-warning');
        assert.match(await warning.textContent(), /1 game was incomplete.*NotAMove/);
        assert.ok(await warning.isVisible());
        const layers = await page.locator('.book-layer').count();
        await page.setInputFiles('#import', pgn);
        await page.locator('#games').waitFor();
        await page.fill('#games-min', '100');
        await page.click('#games-build');
        await page.locator('#games-note').filter({ hasText: 'No move was played that often' }).waitFor();
        await page.click('#games-cancel');
        await page.locator('#games').waitFor({ state: 'hidden' });
        assert.equal(await warning.isVisible(), false);
        assert.equal(await page.locator('.book-layer').count(), layers);
        await page.setInputFiles('#import', pgn);
        await page.locator('#games').waitFor();
        await page.fill('#games-min', '1');
        await page.fill('#games-depth', '1');
        await page.click('#games-build');
        await page.locator('#games').waitFor({ state: 'hidden' });
        assert.equal(await warning.isVisible(), false);
        await page.setInputFiles('#import', { name: 'partial.txt', mimeType: 'text/plain',
            buffer: Buffer.from('1. d4 d5 2. NotAMove Nc6 *') });
        await warning.waitFor();
        assert.match(await warning.textContent(), /partial.txt: 1 game was incomplete.*NotAMove/);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('deleting moves preserves list scroll, while following a move starts at the top', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 400, height: 900 } });
        const book = new Map();
        const pawnMoves = ranks => [...'abcdefgh'].flatMap(file => ranks.map(rank => `${file}${rank}`));
        for(const move of [...pawnMoves([3, 4]), 'Na3', 'Nc3', 'Nf3', 'Nh3']) addLine(book, [move]);
        for(const move of [...pawnMoves([6, 5]), 'Na6', 'Nc6', 'Nf6', 'Nh6']) addLine(book, ['a3', move]);
        await page.goto(`${url}/tools/booksmith/`);
        await page.locator('#clear-all:not([disabled])').waitFor();
        await page.setInputFiles('#import', {
            name: 'scroll.bin', mimeType: 'application/octet-stream', buffer: Buffer.from(writeBin(book))
        });
        await page.waitForFunction(() => document.querySelectorAll('#moves .book-move').length === 20);
        await page.evaluate(() => document.fonts.ready);
        const list = page.locator('#moves');
        await list.evaluate(element => element.scrollIntoView({ block: 'center' }));
        await list.evaluate(element => { element.scrollTop = 200; });
        const before = await list.evaluate(element => element.scrollTop);
        assert.ok(before > 0);
        await list.locator('.book-move-remove').nth(7).click();
        assert.equal(await list.locator('.book-move').count(), 19);
        assert.equal(await list.evaluate(element => element.scrollTop), before);

        await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
        const bottom = await list.evaluate(element => element.scrollTop);
        await list.locator('.book-move-remove').last().click();
        const after = await list.evaluate(element => ({
            scroll: element.scrollTop, max: element.scrollHeight - element.clientHeight
        }));
        assert.equal(after.scroll, Math.min(bottom, after.max));
        assert.ok(after.scroll > 0);

        await list.locator('[data-code="a2a3"] .book-move-san').click();
        assert.equal(await list.locator('.book-move').count(), 20);
        assert.equal(await list.evaluate(element => element.scrollTop), 0);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('move percentages distinguish near-certainty from true 100% and zero weights', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(`${url}/tools/booksmith/`);
        const book = new Map([[startKey, new Map([['e2e4', 100], ['d2d4', 0.1], ['g1f3', 0]])]]);
        await page.setInputFiles('#import', {
            name: 'rare-moves.bin', mimeType: 'application/octet-stream', buffer: Buffer.from(writeBin(book))
        });
        const e4 = page.locator('.book-move').filter({ hasText: 'e4' });
        const d4 = page.locator('.book-move').filter({ hasText: 'd4' });
        const nf3 = page.locator('.book-move').filter({ hasText: 'Nf3' });
        await e4.waitFor();
        assert.equal(await e4.locator('.book-move-share').textContent(), '>99%');
        assert.equal(await d4.locator('.book-move-share').textContent(), '<1%');
        assert.equal(await nf3.locator('.book-move-share').textContent(), '0%');
        assert.equal(await page.locator('.book-arrows polygon').count(), 2);
        await d4.locator('.book-move-remove').click();
        assert.equal(await e4.locator('.book-move-share').textContent(), '100%');
        assert.equal(await nf3.locator('.book-move-share').textContent(), '0%');
        assert.equal(await page.locator('.book-arrows polygon').count(), 1);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('Priority identifies the controlling book and only enables effective weight edits', async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.goto(`${url}/tools/booksmith/`);
        await page.locator('#clear-all:not([disabled])').waitFor();
        const lower = new Map();
        addLine(lower, ['Nf3', 'Nf6']);
        addLine(lower, ['Nf3', 'Nc6']);
        addLine(lower, ['e4']);
        await page.setInputFiles('#import', [
            { name: 'Top.bin', mimeType: 'application/octet-stream',
                buffer: Buffer.from(writeBin(new Map([[startKey, new Map([['e2e4', 100], ['d2d4', 100]])]]))) },
            { name: 'Lower.bin', mimeType: 'application/octet-stream', buffer: Buffer.from(writeBin(lower)) }
        ]);
        await page.locator('.book-layer').nth(1).waitFor();
        await page.locator('.book-layer-body').nth(1).click();
        const note = page.locator('#priority-note');
        const e4 = page.locator('#moves [data-code="e2e4"]');
        const slider = e4.locator('input');
        assert.ok(await note.isVisible());
        assert.match(await note.textContent(), /Priority uses Top here, not "Lower"/);
        assert.equal(await e4.locator('.book-move-share').textContent(), '50%');
        assert.equal(await slider.isDisabled(), true);
        const colors = await e4.evaluate(row => {
            const probe = document.createElement('span');
            probe.style.color = row.querySelector('input').style.getPropertyValue('--tone');
            return [probe.style.color, getComputedStyle(row.querySelector('.book-move-bar span')).backgroundColor];
        });
        assert.equal(colors[0], colors[1]);
        await page.click('#priority-edit');
        assert.equal(await note.isVisible(), false);
        assert.equal(await page.locator('.book-layer-active .book-layer-name').inputValue(), 'Top');
        assert.equal(await slider.isEnabled(), true);
        await slider.fill('50');
        await slider.dispatchEvent('change');
        assert.equal(await e4.locator('.book-move-share').textContent(), '33%');

        await page.locator('.book-layer-body').nth(1).click();
        for(const mode of ['blend', 'equal']) {
            await page.locator(`.book-mode label:has(input[value="${mode}"])`).click();
            assert.equal(await note.isVisible(), false);
            assert.equal(await slider.isEnabled(), true);
            const before = await e4.locator('.book-move-share').textContent();
            await slider.fill(mode === 'blend' ? '20' : '80');
            await slider.dispatchEvent('change');
            assert.notEqual(await e4.locator('.book-move-share').textContent(), before);
        }
        await page.locator('.book-mode label:has(input[value="priority"])').click();
        assert.equal(await slider.isDisabled(), true);
        await page.locator('#moves [data-code="g1f3"] .book-move-san').click();
        assert.equal(await note.isVisible(), false);
        const reply = page.locator('#moves [data-code="g8f6"] input');
        assert.equal(await reply.isEnabled(), true);
        await reply.fill('25');
        await reply.dispatchEvent('change');
        assert.equal(await page.locator('#moves [data-code="g8f6"] .book-move-share').textContent(), '20%');
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});

test('board promotions and weighted arrows work in both orientations', { timeout: 60000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error));
        await page.goto(`${url}/tools/booksmith/`);
        await page.waitForSelector('#board cg-board');
        await page.locator('#clear-all:not([disabled])').waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.locator('#board').scrollIntoViewIfNeeded();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const center = async (square, white = true) => {
            const box = await page.locator('#board').boundingBox();
            const file = square.charCodeAt(0) - 97, rank = Number(square[1]);
            const column = white ? file : 7 - file, row = white ? 8 - rank : rank - 1;
            return { x: box.x + (column + 0.5) * box.width / 8, y: box.y + (row + 0.5) * box.height / 8 };
        };
        const move = async (from, to, white = true) => {
            for(const square of [from, to]) {
                const { x, y } = await center(square, white);
                await page.mouse.click(x, y);
            }
        };
        const last = () => page.locator('#path button').last().textContent();
        for(const [index, step] of ['e2e4', 'd7d5', 'e4d5', 'c7c6', 'd5c6', 'g8f6', 'c6b7', 'b8d7'].entries()) {
            await move(step.slice(0, 2), step.slice(2));
            await page.locator('#path button').nth(index).waitFor();
            await page.waitForTimeout(200);
        }
        assert.equal(await last(), 'Nbd7');

        for(const white of [true, false]) {
            if(!white) {
                await page.click('#nav-flip');
                await page.waitForTimeout(200);
            }
            await move('b7', 'a8', white);
            const pieces = page.locator('#promotion button');
            await pieces.first().waitFor();
            assert.deepEqual(await pieces.evaluateAll(items => items.map(item => item.getAttribute('aria-label'))),
                ['Queen', 'Knight', 'Rook', 'Bishop']);
            const queen = await pieces.first().boundingBox();
            const target = await center('a8', white);
            assert.ok(Math.abs(queen.x + queen.width / 2 - target.x) < 2 && Math.abs(queen.y + queen.height / 2 - target.y) < 2);
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#promotion').count(), 0);
            assert.equal(await last(), 'Nbd7');
        }

        await move('b7', 'a8', false);
        await page.locator('#promotion button[aria-label="Knight"]').click();
        assert.equal(await page.locator('#promotion').count(), 0);
        assert.equal(await last(), 'bxa8=N');
        await page.click('#nav-back');
        assert.ok((await page.locator('#moves').textContent()).includes('bxa8=N'));
        await page.click('#nav-start');
        const arrow = page.locator('.book-arrows polygon');
        assert.equal(await arrow.count(), 1);
        const tip = () => arrow.evaluate(element => {
            const point = element.points.getItem(3);
            return [point.x, point.y];
        });
        assert.deepEqual(await tip(), [350, 350]);
        await page.click('#nav-flip');
        assert.deepEqual(await tip(), [450, 450]);
        const weight = page.locator('.book-move-weight');
        await weight.fill('0');
        assert.equal(await arrow.count(), 0);
        await weight.fill('100');
        assert.equal(await arrow.count(), 1);
        await move('e2', 'e4');
        assert.equal(await last(), 'e4');
        await page.click('#nav-back');
        await move('d2', 'd4');
        await page.click('#nav-back');
        await page.locator('#moves [data-code="d2d4"] input').fill('25');
        assert.equal(await arrow.count(), 2);
        const widths = await arrow.evaluateAll(elements => elements.map(element => element.getBBox().width));
        assert.ok(widths[0] > widths[1]);
        const fit = await page.evaluate(() => [document.querySelector('.book-arrows'), document.querySelector('cg-container')]
            .map(element => Object.values(element.getBoundingClientRect().toJSON()).map(Math.round).join()));
        assert.equal(fit[0], fit[1]);

        const value = code => page.locator(`#moves [data-code="${code}"] input`).inputValue();
        await page.keyboard.press('Control+z');
        assert.equal(await value('d2d4'), '100');
        await page.keyboard.press('Control+z');
        assert.equal(await page.locator('#moves [data-code="d2d4"]').count(), 0);
        await page.keyboard.press('Control+y');
        await page.keyboard.press('Control+y');
        assert.equal(await value('d2d4'), '25');
        await page.locator('#moves [data-code="e2e4"] input').fill('40');
        await page.locator('#moves [data-code="d2d4"] .book-move-remove').click();
        assert.equal(await value('e2e4'), '100');
        await page.keyboard.press('Control+z');
        assert.equal(await value('e2e4'), '40');
        assert.equal(await value('d2d4'), '25');

        const toggle = page.locator('.book-layer-active .book-layer-toggle');
        await toggle.click();
        assert.equal(await page.locator('#moves .book-move').count(), 0);
        assert.equal(await arrow.count(), 0);
        assert.ok(await page.locator('#moves-empty').isVisible());
        await toggle.click();
        assert.equal(await value('e2e4'), '40');
        assert.equal(await value('d2d4'), '25');
        assert.ok(await page.locator('#moves input').first().isEnabled());

        await page.click('#new-book');
        const d4 = page.locator('#moves [data-code="d2d4"]');
        assert.equal(await d4.locator('input').inputValue(), '25');
        await d4.locator('.book-move-remove').click();
        assert.equal(await d4.count(), 0);
        await page.keyboard.press('Control+z');
        assert.equal(await d4.count(), 1);
        const other = new Map();
        addLine(other, ['e4']);
        await page.setInputFiles('#import', {
            name: 'other.bin', mimeType: 'application/octet-stream', buffer: Buffer.from(writeBin(other))
        });
        await page.locator('.book-layer').nth(2).waitFor();
        await page.locator('.book-layer-body').nth(1).click();
        await page.locator('.book-layer-active .book-layer-toggle').click();
        assert.equal(await value('e2e4'), '100');
        assert.equal(await d4.count(), 0);
        assert.equal(await page.locator('#moves [data-code="e2e4"] .book-move-share').textContent(), '100%');
        await page.locator('.book-layer-active .book-layer-toggle').click();
        assert.equal(await value('e2e4'), '40');
        assert.equal(await value('d2d4'), '25');
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
