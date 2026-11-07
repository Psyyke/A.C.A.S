'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'acas.user.js'), 'utf8');
function declaration(name) {
    const start = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(source)?.index;
    assert.notEqual(start, undefined, `Missing ${name}`);
    const end = source.indexOf('\n}', start);
    assert.ok(end > start);
    return source.slice(start, end + 2);
}
const names = [
    'chessCoordinatesToIndex', 'chessCoordinatesToMatrixIndex', 'chessCoordinatesToDomIndex',
    'indexToChessCoordinates', 'getElemCoordinatesFromTransform',
    'getElemCoordinatesFromLeftBottomPercentages', 'getElemCoordinatesFromLeftTopPixels',
    'getChessgroundCoordsFromPiece', 'getBoardDimensions', 'getBoardMatrix', 'getBoardPiece',
    'getBasicFen', 'fenCoordArrToDomCoord', 'isPawnPromotion', 'coordinatesFromMoves',
    'getPiecePaths', 'getRandomOwnPieceDomCoord', 'makeMove'
];
const modelStart = source.indexOf('const BoardCoordinates = Object.freeze({');
assert.ok(modelStart >= 0);
const model = source.slice(modelStart, source.indexOf('\n});', modelStart) + 4);
const adapterStart = source.indexOf("addSupportedChessSite('chess.com', {");
const adapterEnd = source.indexOf('\n/*ZONE CHANGE', adapterStart);
assert.ok(adapterStart >= 0 && adapterEnd > adapterStart);
const harnessBody = `
        let lastBoardRanks = state.dimensions[0], lastBoardFiles = state.dimensions[1];
        let lastBoardOrientation = state.orientation, lastBoardSize, lastPieceSize, lastBoardMatrix;
        const debugModeActivated = state.debug;
        const console = { warn: (...args) => state.warnings.push(args), error: (...args) => state.warnings.push(args) };
        class NodeList {}
        let chessBoardElem = state.useDOM ? document.querySelector('#board') : {
            clientWidth: state.dimensions[0] * 50, clientHeight: state.dimensions[1] * 40,
            size: { width: state.dimensions[0] * 50, height: state.dimensions[1] * 40 },
            getBoundingClientRect: () => ({ x: 17, y: 29 })
        };
        const getSiteData = key => key === 'boardDimensions' ? state.dimensions : null;
        const getBoardOrientation = () => state.orientation;
        const getPieceElem = all => all ? state.pieces : state.useDOM ? document.querySelector('#piece') : state.piece;
        const getPieceElemFen = piece => piece.fen;
        const getPieceElemCoords = piece => piece.coords;
        const extractElemTransformData = state.useDOM ? ${declaration('extractElemTransformData')} : elem => elem?.transform || [NaN, NaN];
        const getElementSize = state.useDOM ? ${declaration('getElementSize')} : elem => elem?.size || { width: 0, height: 0 };
        const squeezeEmptySquares = fen => fen.replace(/1+/g, run => run.length);
        const getChessgroundPocket = () => null;
        const getPieceAmount = () => state.pieces.length;
        const getConfigValue = () => null, configKeys = {};
        const lastMoveRequestTime = 0, domain = 'test';
        class AutomaticMove { constructor(config) { state.moves.push(config); } }
        const backendConfig = null, supportedSites = {};
        function addSupportedChessSite(domains, adapter) {
            for(const domain of Array.isArray(domains) ? domains : [domains]) supportedSites[domain] = adapter;
        }
        ${model}
        ${names.map(declaration).join('\n')}
        ${source.slice(adapterStart, adapterEnd)}
        return { ${names.join(',')},
            BoardCoordinates, supportedSites,
            state, setOrientation(value) { state.orientation = lastBoardOrientation = value; },
            setBoard(value) { chessBoardElem = value; }
        };
    `;
function harness(dimensions = [8, 8], orientation = 'w') {
    return new Function('state', harnessBody)({
        dimensions, orientation, pieces: [], piece: { size: { width: 50, height: 40 } },
        moves: [], warnings: [], debug: false
    });
}

for (const [width, height] of [[8, 8], [10, 8], [8, 10], [5, 9], [12, 10]]) {
    for (const orientation of ['w', 'b', null]) {
        test(`${width}x${height}, ${orientation}: every square preserves logical, matrix, DOM and click coordinates`, () => {
            const api = harness([width, height], orientation);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const square = `${String.fromCharCode(97 + x)}${y + 1}`;
                    const matrix = [x, height - 1 - y];
                    const dom = orientation === 'w' ? matrix : [width - 1 - x, y];
                    assert.deepEqual(api.chessCoordinatesToIndex(square), [x, y]);
                    assert.deepEqual(api.chessCoordinatesToMatrixIndex(square), matrix);
                    assert.equal(api.indexToChessCoordinates(matrix), square);
                    assert.deepEqual(api.chessCoordinatesToDomIndex(square), dom);
                    assert.deepEqual(api.fenCoordArrToDomCoord([square]), [[17 + dom[0] * 50 + 25, 29 + dom[1] * 40 + 20]]);
                    assert.deepEqual(api.getElemCoordinatesFromTransform({ transform: [dom[0] * 50, dom[1] * 40] }), [x, y]);
                    assert.deepEqual(api.getElemCoordinatesFromLeftTopPixels({
                        style: { left: `${dom[0] * 50}px`, top: `${dom[1] * 40}px` },
                        size: { width: 50, height: 40 }
                    }), [x, y]);
                    const bottom = height - 1 - dom[1];
                    assert.deepEqual(api.getElemCoordinatesFromLeftBottomPercentages({
                        style: { left: `${dom[0] * 100 / width}%`, bottom: `${bottom * 100 / height}%` }
                    }), [x, y]);
                    assert.deepEqual(api.getChessgroundCoordsFromPiece({ cgKey: square }), [x, y]);
                    if (orientation) {
                        assert.deepEqual(api.getChessgroundCoordsFromPiece({ transform: [dom[0] * 50, dom[1] * 40] }), [x, y]);
                    }
                }
            }
        });
    }
}

test('World Chess transforms stay white-relative even on a black-oriented board', () => {
    const api = harness([10, 8], 'b');
    assert.deepEqual(api.getElemCoordinatesFromTransform({ transform: [100, 40] }, { onlyFlipY: true }), [2, 6]);
    // onlyFlipX historically has no effect; do not turn it into a new behavior.
    assert.deepEqual(api.getElemCoordinatesFromTransform({ transform: [100, 40] }, { onlyFlipX: true }), [7, 1]);
});

test('Chessground rejects missing, offboard and in-flight transforms but tolerates subpixel rounding', () => {
    const api = harness();
    for (const piece of [null, {}, { transform: [-50, 0] }, { transform: [400, 0] }, { transform: [0, 320] }, { transform: [25, 0] }]) {
        assert.equal(api.getChessgroundCoordsFromPiece(piece), undefined);
    }
    assert.deepEqual(api.getChessgroundCoordsFromPiece({ transform: [50.5, 80.5] }), [1, 5]);
    api.setOrientation(null);
    assert.equal(api.getChessgroundCoordsFromPiece({ transform: [0, 0] }), undefined);
    assert.deepEqual(api.getChessgroundCoordsFromPiece({ cgKey: 'a1' }), [0, 0]);
});

test('rank-ten colon alias and multi-digit ranks retain their meaning', () => {
    const api = harness([10, 10]);
    assert.deepEqual(api.chessCoordinatesToIndex('j:'), [9, 9]);
    assert.deepEqual(api.chessCoordinatesToMatrixIndex('j:'), [9, 0]);
    assert.equal(api.indexToChessCoordinates([9, 0]), 'j10');
});

for (const orientation of ['w', 'b']) {
    test(`matrix, FEN, lookup, promotion and move paths stay white-relative when viewed as ${orientation}`, () => {
        const api = harness([10, 8], orientation);
        api.state.pieces = [
            { fen: 'k', coords: [9, 7] }, { fen: 'P', coords: [2, 6] },
            { fen: 'p', coords: [8, 1] }, { fen: 'K', coords: [0, 0] },
            { fen: 'q', coords: [-1, 0] }, { fen: 'q', coords: [10, 0] },
            { fen: 'q', coords: [0, 8] }, { fen: 'q', coords: [0.5, 0] },
            { fen: 'q', coords: [NaN, 0] }, { fen: null, coords: [1, 1] },
            { fen: 'q', coords: null }
        ];
        const board = api.getBoardMatrix();
        assert.equal(board.length, 8);
        assert.ok(board.every(row => row.length === 10));
        assert.equal(api.getBasicFen(board), '9k/2P7/10/10/10/10/8p1/K9');
        assert.equal(api.getBoardPiece('j8', board), 'k');
        assert.equal(api.getBoardPiece('c7', board), 'P');
        assert.equal(api.getBoardPiece('a1', board), 'K');
        assert.equal(api.getBoardPiece('e4', board), 1);
        assert.equal(api.isPawnPromotion(['c7', 'c8']), true);
        assert.equal(api.isPawnPromotion(['c7', 'c6']), false);
        assert.equal(api.isPawnPromotion(['i2', 'i1']), true);
        assert.equal(api.isPawnPromotion(['a1', 'a2']), false);
        assert.deepEqual(api.getPiecePaths(board, [2, 1], 'P', true), [[1, 0], [3, 0], [2, 0]]);
        assert.deepEqual(api.coordinatesFromMoves(board, [0, 7], [[-1, 0], [0, 1], [1, 0]], true), [[1, 7]]);
        assert.deepEqual(api.getRandomOwnPieceDomCoord('a1', board), api.fenCoordArrToDomCoord(['a1'])[0]);
        assert.equal(api.getRandomOwnPieceDomCoord('e4', board), null);
    });
}

test('dimension validation retains the existing fallback and updates cached dimensions', () => {
    const api = harness();
    for (const dimensions of [null, [], [0, 8], [8, NaN], [8.5, 8], [70, 8]]) {
        api.state.dimensions = dimensions;
        assert.deepEqual(api.getBoardDimensions(), [8, 8]);
    }
    api.state.dimensions = [69, 69];
    assert.deepEqual(api.getBoardDimensions(), [69, 69]);
    api.state.dimensions = [5, 9];
    assert.deepEqual(api.chessCoordinatesToMatrixIndex('e9'), [4, 0]);
});

test('shared model is immutable and all conversions round-trip, including maximum board dimensions', () => {
    const { BoardCoordinates: model } = harness();
    assert.ok(Object.isFrozen(model));
    for (const dimensions of [[1, 1], [8, 8], [5, 9], [10, 8], [8, 10], [69, 69]]) {
        for (let y = 0; y < dimensions[1]; y++) {
            for (let x = 0; x < dimensions[0]; x++) {
                const index = [x, y];
                assert.deepEqual(model.fromChess(model.toChess(index)), index);
                assert.deepEqual(model.fromMatrix(model.toMatrix(index, dimensions), dimensions), index);
                for (const orientation of ['w', 'b']) {
                    assert.deepEqual(model.fromDom(model.toDom(index, dimensions, orientation), dimensions, orientation), index);
                }
            }
        }
    }
});

test('invalid inputs never throw or turn into a real square; diagnostics respect silent mode', () => {
    const api = harness();
    const model = api.BoardCoordinates;
    const invalid = result => assert.ok(Array.isArray(result) && result.length === 2 && result.every(Number.isNaN));
    for (const value of [undefined, null, '', 'a', 'a0', 'a-1', 'A1', 'a1.5', 'a70', 'a1junk', 'a 1', {}, [], Symbol('square')]) {
        invalid(api.chessCoordinatesToIndex(value));
        invalid(api.chessCoordinatesToMatrixIndex(value));
        invalid(api.chessCoordinatesToDomIndex(value));
        assert.equal(api.getBoardPiece(value, []), undefined);
        assert.equal(api.getRandomOwnPieceDomCoord(value, []), null);
    }
    for (const value of [undefined, null, [], Array(2), [0], [-1, 0], [8, 0], [0, 8], [1.5, 0], [NaN, 0], ['1', 0]]) {
        invalid(model.toMatrix(value, [8, 8]));
        invalid(model.fromMatrix(value, [8, 8]));
        invalid(model.toDom(value, [8, 8], 'b'));
        invalid(model.fromDom(value, [8, 8], 'w'));
        assert.equal(api.indexToChessCoordinates(value), null);
    }
    for (const dimensions of [undefined, null, [], Array(2), [0, 8], [8, 70], [Infinity, 8]]) {
        invalid(model.toMatrix([0, 0], dimensions));
        invalid(model.toDom([0, 0], dimensions, 'b'));
    }
    for (const elem of [undefined, null, {}, { style: {} }]) {
        invalid(api.getElemCoordinatesFromTransform(elem));
        invalid(api.getElemCoordinatesFromLeftTopPixels(elem));
        invalid(api.getElemCoordinatesFromLeftBottomPercentages(elem));
    }
    assert.equal(api.getRandomOwnPieceDomCoord('a1', null), null);
    assert.equal(api.state.warnings.length, 0);
    const debugApi = new Function('state', harnessBody)({
        dimensions: [8, 8], orientation: 'w', warnings: [], debug: true
    });
    invalid(debugApi.chessCoordinatesToIndex(null));
    assert.equal(debugApi.state.warnings.length, 1);
});

test('board flips and dimension changes do not leave stale conversions', () => {
    const api = harness([10, 8], 'w');
    assert.deepEqual(api.chessCoordinatesToDomIndex('c7'), [2, 1]);
    api.setOrientation('b');
    assert.deepEqual(api.chessCoordinatesToDomIndex('c7'), [7, 6]);
    assert.deepEqual(api.chessCoordinatesToMatrixIndex('c7'), [2, 1]);
    api.state.dimensions = [5, 9];
    assert.deepEqual(api.chessCoordinatesToDomIndex('c7'), [2, 6]);
    assert.deepEqual(api.chessCoordinatesToMatrixIndex('c7'), [2, 2]);
});

test('automatic moves require two valid finite click positions, including during board teardown', async () => {
    const api = harness();
    await api.makeMove('test', ['e2', 'e4'], false);
    assert.equal(api.state.moves.length, 1);
    assert.deepEqual(api.state.moves[0].moveDomCoords, [[242, 289], [242, 209]]);
    for (const move of [null, [], ['e2'], ['e2', 'i4'], ['e2', 'e9'], ['e2', 'P@e4']]) {
        await api.makeMove('test', move, false);
    }
    api.state.piece = null;
    assert.deepEqual(api.fenCoordArrToDomCoord(['e2', 'e4']), []);
    await api.makeMove('test', ['e2', 'e4'], false);
    api.state.piece = { size: { width: 0, height: 40 } };
    await api.makeMove('test', ['e2', 'e4'], false);
    api.state.piece = { size: { width: 50, height: 40 } };
    api.setBoard(null);
    await api.makeMove('test', ['e2', 'e4'], false);
    assert.deepEqual(api.fenCoordArrToDomCoord(null), []);
    assert.equal(api.state.moves.length, 1);
});

test('all site adapters retain their logical-square contract', () => {
    for (const orientation of ['w', 'b']) {
        const api = harness([8, 8], orientation);
        const dom = orientation === 'w' ? [2, 1] : [5, 6];
        const transformPiece = { transform: [dom[0] * 50, dom[1] * 40] };
        for (const domain of ['chess.com', 'chess.org', 'immortal.game', 'worldchess.com']) {
            const piece = domain === 'worldchess.com' ? { transform: [100, 40] } :
                domain === 'immortal.game' ? { parentElement: transformPiece } : transformPiece;
            assert.deepEqual(api.supportedSites[domain].pieceElemCoords({ pieceElem: piece, pathname: '/variants/test' }), [2, 6], domain);
        }
        const chesscomPiece = { classList: { toString: () => 'piece wp square-37' } };
        assert.deepEqual(api.supportedSites['chess.com'].pieceElemCoords({ pieceElem: chesscomPiece, pathname: '/play' }), [2, 6]);
        for (const domain of ['lichess.org', 'playstrategy.org', 'pychess.org', 'chess.coolmathgames.com',
            'chess.net', 'freechess.club', 'psyyke.github.io', 'localhost']) {
            assert.deepEqual(api.supportedSites[domain].pieceElemCoords({ pieceElem: { cgKey: 'c7' } }), [2, 6], domain);
            assert.deepEqual(api.supportedSites[domain].pieceElemCoords({ pieceElem: transformPiece }), [2, 6], domain);
        }
        assert.deepEqual(api.supportedSites['papergames.io'].pieceElemCoords({ pieceElem: { dataset: { square: 'c7' } } }), [2, 6]);
        for (const domain of ['play.chessclub.com', 'app.edchess.io']) {
            assert.deepEqual(api.supportedSites[domain].pieceElemCoords({
                pieceElem: { parentElement: { parentElement: { dataset: { square: 'c7' } } } }
            }), [2, 6], domain);
        }
        assert.deepEqual(api.supportedSites['gameknot.com'].pieceElemCoords({
            pieceElem: { parentElement: {
                style: { left: `${dom[0] * 50}px`, top: `${dom[1] * 40}px` },
                size: { width: 50, height: 40 }
            } }
        }), [2, 6]);
    }
});

test('Chromium DOM: real CSS transforms, percentage/pixel positions and click centers', async () => {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
    try {
        const page = await browser.newPage();
        await page.setContent('<div id="board" style="position:absolute;left:17px;top:29px;width:500px;height:320px"><div id="piece" style="position:absolute;width:50px;height:40px"></div></div>');
        await page.evaluate(body => {
            window.api = new Function('state', body)({
                useDOM: true, dimensions: [10, 8], orientation: 'w', pieces: [], moves: [], warnings: []
            });
        }, harnessBody);
        for (const orientation of ['w', 'b']) {
            for (const square of ['a1', 'j8', 'c7', 'f4']) {
                const x = square.charCodeAt(0) - 97, y = Number(square.slice(1)) - 1;
                const dom = orientation === 'w' ? [x, 7 - y] : [9 - x, y];
                const result = await page.evaluate(({ orientation, square, dom }) => {
                    api.setOrientation(orientation);
                    const piece = document.querySelector('#piece');
                    piece.style.transform = `translate(${dom[0] * 50}px, ${dom[1] * 40}px)`;
                    const transformed = api.getElemCoordinatesFromTransform(piece);
                    const chessground = api.getChessgroundCoordsFromPiece(piece);
                    piece.style.transform = 'none';
                    piece.style.left = `${dom[0] * 50}px`;
                    piece.style.top = `${dom[1] * 40}px`;
                    const pixels = api.getElemCoordinatesFromLeftTopPixels(piece);
                    piece.style.left = `${dom[0] * 10}%`;
                    piece.style.bottom = `${(7 - dom[1]) * 12.5}%`;
                    const percentages = api.getElemCoordinatesFromLeftBottomPercentages(piece);
                    return { transformed, chessground, pixels, percentages, click: api.fenCoordArrToDomCoord([square])[0] };
                }, { orientation, square, dom });
                assert.deepEqual(result, {
                    transformed: [x, y], chessground: [x, y], pixels: [x, y], percentages: [x, y],
                    click: [17 + dom[0] * 50 + 25, 29 + dom[1] * 40 + 20]
                });
            }
        }
        await page.evaluate(() => document.querySelector('#piece').remove());
        assert.deepEqual(await page.evaluate(() => api.fenCoordArrToDomCoord(['a1', 'j8'])), []);
    } finally {
        await browser.close();
    }
});
