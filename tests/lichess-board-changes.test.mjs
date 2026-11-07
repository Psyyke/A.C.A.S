import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';
import { wireComponents } from '../userscript-components/dev/wire-components.mjs';

const source = readFileSync(new URL('../acas.user.js', import.meta.url), 'utf8');
const component = readFileSync(new URL('../userscript-components/BoardChangeParser.js', import.meta.url), 'utf8');
function declaration(name) {
    const start = new RegExp(`^function ${name}\\(`, 'm').exec(source)?.index;
    assert.notEqual(start, undefined, name);
    const end = source.indexOf('\n}', start);
    assert.ok(end > start);
    return source.slice(start, end + 2);
}
const modelStart = source.indexOf('const BoardCoordinates = Object.freeze({');
assert.ok(modelStart >= 0);
const model = source.slice(modelStart, source.indexOf('\n});', modelStart) + 4);
const staged = wireComponents(source, {
    boardUrl: 'https://update.greasyfork.org/scripts/2/BoardChangeParser.js'
});
const adapterStart = staged.indexOf("addSupportedChessSite('lichess.org', {");
const adapterEnd = staged.indexOf("\naddSupportedChessSite('playstrategy.org'", adapterStart);
assert.ok(adapterStart >= 0 && adapterEnd > adapterStart);
const harness = `
    const domain = 'lichess.org', supportedSites = {};
    const pieceNameToFen = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
    const debugModeActivated = false;
    let lastBoardRanks = 8, lastBoardFiles = 8, lastBoardOrientation = 'w', lastBoardMatrix;
    ${model}
    ${['getSiteData', 'addSupportedChessSite', 'getBoardElem', 'getBoardOrientation',
        'getPieceElem', 'getPieceElemFen', 'getPieceElemCoords', 'getBoardDimensions',
        'getBoardMatrix', 'getBasicFen', 'getChessgroundPocket', 'getChessgroundCoordsFromPiece',
        'extractElemTransformData', 'chessCoordinatesToIndex', 'squeezeEmptySquares',
        'getBoardChangesObjTemplate', 'getFenPieceColor'].map(declaration).join('\n')}
    ${staged.slice(adapterStart, adapterEnd)}
    ${component}
    const chessBoardElem = getBoardElem();
    const parser = new BoardChangeParser({ getBoardChangesObjTemplate, getFenPieceColor });
    window.checkSnapshots = async (games, orientation, useKeys) => {
        lastBoardOrientation = orientation;
        chessBoardElem.closest('.cg-wrap').className = 'cg-wrap orientation-' + (orientation === 'w' ? 'white' : 'black');
        const roleNames = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
        let lastFen = null, turn = 'w', observed = null, count = 0, hintChecks = 0;
        const observer = new MutationObserver(() => {
            const fen = getBasicFen();
            const hint = getSiteData('lastMoveSquares');
            observed = { fen, hint, diff: parser.getBoardChanges(lastFen, fen, turn, { lastMoveSquares: hint }) };
        });
        observer.observe(chessBoardElem, { childList: true, subtree: true, attributes: true });
        try {
            for(const game of games) {
                lastFen = null;
                for(const snapshot of game) {
                    turn = snapshot.move?.color || 'w';
                    observed = null;
                    chessBoardElem.replaceChildren();
                    for(const piece of snapshot.pieces) {
                        const element = document.createElement('piece');
                        element.className = (piece.color === 'w' ? 'white' : 'black') + ' ' + roleNames[piece.type];
                        if(useKeys) element.cgKey = piece.square;
                        const file = piece.square.charCodeAt(0) - 97, rank = Number(piece.square[1]) - 1;
                        const col = orientation === 'w' ? file : 7 - file;
                        const row = orientation === 'w' ? 7 - rank : rank;
                        element.style.transform = 'translate(' + (col * 50) + 'px, ' + (row * 50) + 'px)';
                        chessBoardElem.append(element);
                    }
                    for(const square of snapshot.move ? [snapshot.move.to, snapshot.move.from] : []) {
                        const element = document.createElement('square');
                        element.className = 'last-move';
                        const file = square.charCodeAt(0) - 97, rank = Number(square[1]) - 1;
                        if(useKeys) element.cgKey = square;
                        const col = orientation === 'w' ? file : 7 - file;
                        const row = orientation === 'w' ? 7 - rank : rank;
                        element.style.transform = 'translate(' + (col * 50) + 'px, ' + (row * 50) + 'px)';
                        chessBoardElem.append(element);
                    }
                    const ghost = document.createElement('piece');
                    ghost.className = 'ghost white queen';
                    ghost.cgKey = 'd4';
                    ghost.style.transform = 'translate(150px, 200px)';
                    chessBoardElem.append(ghost);
                    await new Promise(resolve => queueMicrotask(resolve));
                    if(!observed || observed.fen !== snapshot.fen)
                        throw new Error('DOM FEN mismatch: ' + JSON.stringify({ observed, snapshot }));
                    if(snapshot.move) {
                        const diff = observed.diff;
                        if(diff.from !== snapshot.move.from || diff.to !== snapshot.move.to || diff.missedFen)
                            throw new Error('DOM move mismatch: ' + JSON.stringify({ diff, snapshot }));
                        if(!observed.hint || !observed.hint.includes(snapshot.move.from) || !observed.hint.includes(snapshot.move.to))
                            throw new Error('DOM last-move hint mismatch: ' + JSON.stringify({ observed, snapshot }));
                        hintChecks++;
                    }
                    lastFen = observed.fen;
                    count++;
                }
            }
        } finally { observer.disconnect(); }
        return { count, hintChecks, exported: Object.hasOwn(window, 'BoardChangeParser') };
    };
`;

function snapshot(chess, move) {
    const pieces = [];
    for(const [row, cells] of chess.board().entries()) {
        for(const [col, piece] of cells.entries()) {
            if(piece) pieces.push({ ...piece, square: String.fromCharCode(97 + col) + (8 - row) });
        }
    }
    return { fen: chess.fen().split(' ')[0], pieces, move };
}

test('real Chromium mutations: production Lichess DOM-to-FEN-to-diff in both orientations and coordinate modes', async t => {
    const games = [];
    for(let seed = 1; seed <= 12; seed++) {
        const chess = new Chess(), game = [snapshot(chess)];
        let random = seed;
        for(let ply = 0; ply < 40; ply++) {
            const legal = chess.moves();
            if(!legal.length) break;
            random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
            const move = chess.move(legal[Math.floor(random / 0x100000000 * legal.length)]);
            assert.ok(move);
            game.push(snapshot(chess, move));
        }
        games.push(game);
    }
    for(const [fen, moves] of [
        ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['O-O', 'O-O-O']],
        ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', ['exd6', 'Kd7']],
        ['1r5k/P7/8/8/8/8/8/7K w - - 0 1', ['axb8=N', 'Kg7']]
    ]) {
        const chess = new Chess(fen), game = [snapshot(chess)];
        for(const san of moves) {
            const move = chess.move(san);
            assert.ok(move, san);
            game.push(snapshot(chess, move));
        }
        games.push(game);
    }
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    try {
        const page = await browser.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => errors.push(message.text()));
        await page.setContent(`<style>cg-board { display:block; position:relative; width:400px; height:400px }
            piece { position:absolute; width:50px; height:50px }</style>
            <div class="cg-wrap orientation-black"><cg-board><piece class="white king"></piece></cg-board></div>
            <main class="round"><div class="round__app"><div class="main-board">
            <div class="cg-wrap orientation-white"><cg-board></cg-board></div></div></div></main>`);
        await page.addScriptTag({ content: harness });
        let checked = 0;
        for(const orientation of ['w', 'b']) {
            for(const useKeys of [false, true]) {
                const result = await page.evaluate(({ games, orientation, useKeys }) =>
                    window.checkSnapshots(games, orientation, useKeys), { games, orientation, useKeys });
                assert.equal(result.count, games.reduce((sum, game) => sum + game.length, 0));
                assert.equal(result.hintChecks, result.count - games.length);
                assert.equal(result.exported, false);
                checked += result.count;
            }
        }
        assert.deepEqual(errors, []);
        t.diagnostic(`${checked} DOM snapshots checked without page errors or console output`);
    } finally { await browser.close(); }
});
