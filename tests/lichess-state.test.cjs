'use strict';
// Dependency: npm install --no-save playwright
// Run: CHROMIUM_PATH=/usr/bin/chromium node --test tests/lichess-state.test.cjs
const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(process.env.ACAS_SOURCE || path.join(__dirname, '..', 'acas.user.js'), 'utf8');
function declaration(name) {
    const match = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(source);
    if (!match) return '';
    const end = source.indexOf('\n}', match.index);
    assert.ok(end > match.index, `Missing end of ${name}`);
    return source.slice(match.index, end + 2);
}
const adapterStart = source.indexOf("addSupportedChessSite('lichess.org', {");
const adapterEnd = source.indexOf("\naddSupportedChessSite('playstrategy.org'", adapterStart);
assert.ok(adapterStart >= 0 && adapterEnd > adapterStart);
// Run actual production declarations, with only storage, transport and unrelated UI mocked.
const declarations = ['getSiteData', 'addSupportedChessSite', 'getBoardElem', 'getBoardOrientation',
    'getPlayerColor', 'getPieceElem', 'getPieceElemFen', 'getFen', 'getGameStateObjTemplate',
    'getBoardChangesObjTemplate', 'updateGameState', 'forceUpdateGameState', 'resetStoredMatchVariables',
    'processBoardPosition', 'checkBoardOrientationChange', 'determineBoardPositionValidity', 'start',
    'inferCastlingRightsFromFen', 'seedLostCastlingRights'].map(declaration).join('\n');
const harness = `
let domain = 'lichess.org';
const supportedSites = {};
const commLinkInstanceID = 'test';
const pieceNameToFen = { pawn:'p', knight:'n', bishop:'b', rook:'r', queen:'q', king:'k' };
let lastBoardOrientation = null, lastBoardRanks = 8, lastBoardFiles = 8, lastBoardMatrix = null;
let lastAllowedFen = '', lastRejectedFen = '', lastMoveRequestTime = 0, matchFirstSuggestionGiven = false;
let chesscomVariantPlayerColorsTable = null, chessBoardElem = null;
let modListeners = [true], modLastEnteredSquare = {};
let resets = 0, createSnapshots = [], orientationPackets = [];
let testFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const defaultPosBasicFens = [testFen];
const values = {}, instanceVars = {};
for (const key of ['playerColor','boardOrientation','fen','turn']) {
    instanceVars[key] = { get: () => values[key], set: (_, value) => { values[key] = value; } };
}
let history = [];
const gameStateHistory = { get: () => history, set: value => { history = value || []; } };
const BoardDrawer = { orientation: null, setOrientation(value) { this.orientation = value; }, setBoardDimensions() {} };
const CommLink = { commands: {
    updateBoardOrientation: async value => { orientationPackets.push(value); },
    newMatchStarted: () => { resets++; }, updateBoardFen() {},
    createInstance: async () => { createSnapshots.push(structuredClone(values)); }
}, setIntervalAsync() {} };
function getBoardMatrix() { return []; }
function getBasicFen() { return testFen; }
function getBoardDimensions() { return [8,8]; }
function getPieceAmount() { return 32; }
function isPawnOnPromotionSquareFen() { return false; }
function getBoardChanges() { return getBoardChangesObjTemplate(); }
function removeTakeback(value) { return value; }
function clearVisuals() {}
function updateUserscriptDynamicContext() {}
function addMovesOnDemandListeners() {}
function isBoardDrawerNeeded() { return false; }
function refreshSettings() {}
function observeNewMoves() {}
function createInputListener() {}
async function getGmConfigValue() { return null; }
function toggleConcealAssistance() {}
${declarations}
${source.slice(adapterStart, adapterEnd)}
let gameState = getGameStateObjTemplate();
supportedSites['other.example'] = { boardOrientation: () => 'b' };
window.run = async code => eval(code);
`;
let browser, page;
before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined }); });
after(async () => { await browser?.close(); });
beforeEach(async () => { page = await browser.newPage(); });
afterEach(async () => { await page?.close(); });
function board(color, coords = '') {
    return `<div class="main-board"><div class="cg-wrap orientation-${color}"><cg-container><cg-board><piece class="white king"></piece><piece class="black king"></piece></cg-board>${coords}</cg-container></div></div>`;
}
async function setup({ color='black', username='tester', white='opponent', black='tester', extra='', outside='', coords='', round=true } = {}) {
    const players = `<aside class="round__side"><div class="game__meta__players"><div class="player white"><a href="/@/${white}">White</a></div><div class="player black"><a href="/@/${black}">Black</a></div></div></aside>`;
    await page.setContent(`<body ${username ? `data-user="${username}"` : ''}>${outside}<main class="${round ? 'round' : 'analyse'}">${players}<div class="${round ? 'round__app' : 'analyse__board'}">${board(color, coords)}${extra}</div></main></body>`);
    await page.addScriptTag({ content: harness });
}
const run = code => page.evaluate(code => window.run(code), code);
for (const color of ['white', 'black']) {
    for (const coords of ['', `<coords class="files ${color === 'black' ? 'black' : ''}"></coords>`, '<coords class="squares"></coords>']) {
        test(`${color} orientation with coordinate mode ${coords || 'hidden'}`, async () => {
            await setup({ color, coords });
            assert.equal(await run('getBoardOrientation()'), color[0]);
        });
    }
    test(`preview cannot override ${color} main board`, async () => {
        const other = color === 'white' ? 'black' : 'white';
        await setup({ color, outside: `<div class="cg-wrap orientation-${other}"><cg-container><cg-board></cg-board><coords class="files ${other}"></coords></cg-container></div>` });
        assert.equal(await run('getBoardOrientation()'), color[0]);
        assert.equal(await run('getBoardElem().closest(".main-board") !== null'), true);
    });
}
test('Black player stays Black on a White-oriented board', async () => {
    await setup({ color: 'white' }); await run('checkBoardOrientationChange()');
    assert.deepEqual(await run('[values.playerColor, BoardDrawer.orientation]'), ['b','w']);
});
test('White player stays White on a Black-oriented board', async () => {
    await setup({ white: 'tester', black: 'opponent' }); await run('checkBoardOrientationChange()');
    assert.deepEqual(await run('[values.playerColor, BoardDrawer.orientation]'), ['w','b']);
});
test('identity comparison is case-insensitive', async () => {
    await setup({ color: 'white', black: 'TeStEr', username: 'TESTER' }); await run('checkBoardOrientationChange()');
    assert.equal(await run('values.playerColor'), 'b');
});
test('late identity metadata refreshes color without a board flip', async () => {
    await setup({ color: 'white', username: null }); await run('checkBoardOrientationChange()');
    await page.evaluate(() => { document.body.dataset.user = 'tester'; });
    await run('checkBoardOrientationChange()'); assert.equal(await run('values.playerColor'), 'b');
});
test('unrelated spectator retains orientation fallback', async () => {
    await setup({ username: 'viewer' }); await run('checkBoardOrientationChange()');
    assert.equal(await run('values.playerColor'), 'b');
});
test('analysis does not inherit account color from metadata', async () => {
    await setup({ color: 'white', round: false }); await run('checkBoardOrientationChange()');
    assert.equal(await run('values.playerColor'), 'w');
});
test('anonymous player retains orientation fallback', async () => {
    await setup({ username: null }); await run('checkBoardOrientationChange()');
    assert.equal(await run('values.playerColor'), 'b');
});
for (const turn of ['white', 'black']) {
    test(`reload detects ${turn} to move, independent of player side`, async () => {
        await setup({ color: turn === 'black' ? 'white' : 'black', extra: `<div class="rclock rclock-${turn} running"></div>` });
        assert.equal(await run('getFen().split(" ")[1]'), turn[0]);
        await run('forceUpdateGameState()'); assert.equal(await run('gameState.turn'), turn[0]);
    });
}
test('active White move takes precedence over delayed running clock', async () => {
    await setup({ extra: '<app><qzm>14</qzm><z7yx class="a1t">Nf3</z7yx><z7yx>Nf6</z7yx></app><div class="rclock rclock-white running"></div>' });
    await run('forceUpdateGameState()'); assert.equal(await run('gameState.turn'), 'b');
});
test('active Black move means White to move', async () => {
    await setup({ extra: '<app><qzm>14</qzm><z7yx>Nf3</z7yx><z7yx class="a1t">Nf6</z7yx></app>' });
    await run('forceUpdateGameState()'); assert.equal(await run('gameState.turn'), 'w');
});
test('preview clock does not determine main game turn', async () => {
    await setup({ outside: '<div class="rclock rclock-black running"></div>' });
    assert.equal(await run('getFen().split(" ")[1]'), 'w');
});
test('known moved piece overrides delayed clock DOM', async () => {
    await setup({ extra: '<div class="rclock rclock-white running"></div>' });
    await run('updateGameState(testFen, { ...getBoardChangesObjTemplate(), movedPieceColor: "w" })');
    assert.equal(await run('gameState.turn'), 'b');
});
test('forced intermediate turn overrides page state', async () => {
    await setup({ extra: '<div class="rclock rclock-black running"></div>' });
    await run('updateGameState(testFen, getBoardChangesObjTemplate(), true, "w")');
    assert.equal(await run('gameState.turn'), 'w');
});
test('unknown turn preserves an already known turn', async () => {
    await setup(); await run('updateGameState(testFen, getBoardChangesObjTemplate(), true, "b"); forceUpdateGameState()');
    assert.equal(await run('gameState.turn'), 'b');
});
test('startup publishes Black player and White initial turn before backend creation', async () => {
    await setup(); await run('start()');
    const first = (await run('createSnapshots'))[0];
    assert.equal(first.playerColor, 'b'); assert.equal(first.turn, 'w');
    assert.equal(first.boardOrientation, 'b'); assert.equal(first.fen.split(' ')[1], 'w');
});
test('startup Black-to-move position does not begin with a White FEN', async () => {
    await setup({ extra: '<div class="rclock rclock-black running"></div>' }); await run('start()');
    assert.equal(await run('createSnapshots[0].fen.split(" ")[1]'), 'b');
});
test('board flip is not a new match and does not change player identity', async () => {
    await setup(); await run('checkBoardOrientationChange(); updateGameState(testFen, getBoardChangesObjTemplate(), true, "w"); lastAllowedFen = testFen');
    await page.evaluate(() => { document.querySelector('.cg-wrap').className = 'cg-wrap orientation-white'; });
    await run('processBoardPosition()');
    assert.deepEqual(await run('[resets, values.playerColor, gameState.turn, BoardDrawer.orientation]'), [0,'b','w','w']);
});
test('unchanged piece placement still refreshes a flipped board', async () => {
    await setup(); await run('checkBoardOrientationChange(); forceUpdateGameState(); lastAllowedFen = testFen');
    await page.evaluate(() => { document.querySelector('.cg-wrap').className = 'cg-wrap orientation-white'; });
    await run('determineBoardPositionValidity()');
    assert.deepEqual(await run('[BoardDrawer.orientation, values.playerColor]'), ['w','b']);
});
test('new match publishes matching state, history, stored turn and FEN', async () => {
    await setup(); await run('checkBoardOrientationChange(); updateGameState(testFen, { ...getBoardChangesObjTemplate(), changedSquaresAmount: 8 }); processBoardPosition()');
    assert.deepEqual(await run('[gameState.turn, history[0].turn, values.turn, values.fen.split(" ")[1]]'), ['w','w','w','w']);
});
test('non-Lichess adapter keeps its orientation-based player fallback', async () => {
    await setup(); await run('domain = "other.example"; checkBoardOrientationChange()');
    assert.equal(await run('values.playerColor'), 'b');
});

// Exercise the actual GUI initialization block as well, without loading engine binaries.
const setupSource = fs.readFileSync(process.env.ACAS_SETUP_SOURCE || path.join(__dirname, '..', 'app/assets/js/instance/setupEnvironment.js'), 'utf8');
const orientationStart = /        (?:const|let) orientation = await this.getPlayerColor\(\);/.exec(setupSource);
assert.ok(orientationStart);
const orientationEnd = setupSource.indexOf('        const boardDimensions', orientationStart.index);
assert.ok(orientationEnd > orientationStart.index);
const orientationCode = setupSource.slice(orientationStart.index, orientationEnd);
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
const initOrientation = new AsyncFunction('USERSCRIPT', orientationCode + '\nreturn orientation;');
for (const [player, orientation] of [['b','w'], ['w','b']]) {
    test(`GUI initializes visual ${orientation} independently of player ${player}`, async () => {
        const bridge = { instanceVars: { boardOrientation: { get: async () => orientation } } };
        assert.equal(await initOrientation.call({ getPlayerColor: async () => player }, bridge), orientation);
    });
}
for (const [name, boardOrientation] of [
    ['missing key', undefined],
    ['invalid response', { get: async () => ({ error: 'unknown key' }) }],
    ['rejected request', { get: async () => { throw new Error('old userscript'); } }]
]) {
    test(`GUI supports an old userscript with ${name}`, async () => {
        assert.equal(await initOrientation.call({ getPlayerColor: async () => 'b' }, { instanceVars: { boardOrientation } }), 'b');
    });
}

const bridgeSource = fs.readFileSync(process.env.ACAS_BRIDGE_SOURCE || path.join(__dirname, '..', 'app/assets/js/misc/userscriptBridge.js'), 'utf8');
test('message bridge transports player side and visual orientation independently', async () => {
    await page.addScriptTag({ content: `
        let messageSequence = 0;
        window.GET_UNIQUE_ID = () => 'test-' + (++messageSequence);
        window.addEventListener('message', event => {
            if(event.data?.sender !== 'GUI') return;
            const key = event.data.args[1];
            window.postMessage({ messageId: event.data.messageId,
                value: key === 'boardOrientation' ? 'w' : 'b' }, '*');
        });
    ` });
    await page.addScriptTag({ content: bridgeSource });
    const result = await page.evaluate(async () => [
        await USERSCRIPT.instanceVars.playerColor.get('test'),
        await USERSCRIPT.instanceVars.boardOrientation?.get('test')
    ]);
    assert.deepEqual(result, ['b', 'w']);
});
test('bridge does not replace direct userscript access', async () => {
    await page.evaluate(() => { window.USERSCRIPT = { marker: 'direct', instanceVars: { boardOrientation: { get: () => 'w' } } }; });
    await page.addScriptTag({ content: bridgeSource });
    assert.deepEqual(await page.evaluate(() => [USERSCRIPT.marker, USERSCRIPT.instanceVars.boardOrientation.get()]), ['direct','w']);
});
test('new-match notification sees the already published reset state', async () => {
    await setup();
    const snapshot = await run(`(async () => {
        await checkBoardOrientationChange();
        values.turn = 'b'; values.fen = testFen + ' b KQkq - 0 1';
        let notified;
        CommLink.commands.newMatchStarted = () => { notified = structuredClone(values); };
        updateGameState(testFen, { ...getBoardChangesObjTemplate(), changedSquaresAmount: 8 });
        await processBoardPosition();
        return [notified.turn, notified.fen.split(' ')[1]];
    })()`);
    assert.deepEqual(snapshot, ['w', 'w']);
});
