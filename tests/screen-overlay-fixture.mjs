import { readFileSync } from 'node:fs';
import { moveArrowConfig } from '../app/assets/js/misc/arrowStyle.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const userscript = read('../acas.user.js');
const interfaceSource = read('../app/assets/js/instance/Interface.js');
const metricSource = read('../app/assets/js/instance/renderMetric.js');
const fen = '8/8/8/8/8/8/8/8 w - - 0 1';

export function frontendDrawer(browser = 'chromium', positionFen = fen) {
    const document = { hidden: false, hasFocus: () => true,
        addEventListener() {}, removeEventListener() {},
        createElementNS: (_namespace, localName) => ({ localName, textContent: '' }) };
    const window = { screenX: 0, screenY: 0, outerWidth: 800, outerHeight: 700,
        innerWidth: 780, innerHeight: 600, devicePixelRatio: 1,
        mozInnerScreenX: 10, mozInnerScreenY: 90, location: { pathname: '/game' },
        addEventListener() {}, removeEventListener() {} };
    window.top = window;
    const board = { isConnected: true, getBoundingClientRect: () => ({ left: 20, top: 20, width: 200, height: 200 }) };
    const classStart = userscript.indexOf('class ScreenBoardDrawer {');
    const end = userscript.indexOf('\nfunction displayImportantNotification', classStart);
    const make = new Function('document', 'window', 'navigator', 'board', `
        const domain = 'chess.com', commLinkInstanceID = 'smoke';
        const CommLink = { commands: { screenOverlay: async () => true } };
        const recordDevTaskError = error => { throw error; };
        const configKeys = { displayMovesOnExternalSite: 'display' };
        const getConfigValue = () => true;
        const gameState = { fen: { full: '${positionFen}' } };
        const getFen = () => '${positionFen.split(' ')[0]}';
        const maybeAnnounceMarkingsToPage = () => {};
        const feedbackVisualRevisions = new Map(), penaVisualRevisions = new Map();
        const setInterval = () => 0, clearInterval = () => {};
        const setTimeout = () => 0, clearTimeout = () => {};
        let activeVisuals = [], BoardDrawer;
        ${read('../userscript-components/UniversalBoardDrawer.js')}
        ${userscript.slice(classStart, end)}
        BoardDrawer = new ScreenBoardDrawer(board, [8, 8], 'w');
        return { drawer: BoardDrawer, render: renderStuffToBoard, clear: clearVisuals };
    `);
    return { ...make(document, window, { userAgent: browser === 'firefox' ? 'Firefox/140' : 'Chrome/140' }, board),
        document, window, board };
}

export function realProducerSnapshot(browser = 'chromium') {
    const h = frontendDrawer(browser);
    const helpers = new Function(interfaceSource.slice(interfaceSource.indexOf('function getHintSquareShape('),
        interfaceSource.indexOf('function computeArrowScale('))
        + '\nreturn { getHintSquareShape, getDropShape, getShotShapes };')();
    const shapes = [
        helpers.getHintSquareShape('e4', 'limegreen', 0.75, true),
        helpers.getDropShape('q@', 'c3', '#00d4ff', 0.8),
        ...helpers.getShotShapes({ from: 'e4', to: 'h7' }, 'crimson', 0.6, 1),
        { shapeType: 'arrow', shapeSquare: ['e2', 'e4'], shapeConfig: moveArrowConfig('best'),
            forceHoverOnly: true, from: 'e2', bringToFront: true }
    ];
    h.render(shapes.map(shape => ({ ...shape, profileID: 'moves', category: 'move' })));
    const metrics = new Function('BoardDrawer', 'renderSquareAsDots', `
        const BoardAnal = { indexToFen: pos => pos };
        const externalOnly = false, addedMetrics = [], profile = 'metrics';
        const CREATE_BOARD_DRAWER_MOVE_OBJ = (_element, shape) => shape;
        ${metricSource.slice(metricSource.indexOf('    function fillSquare('),
        metricSource.indexOf('    function renderDanger('))}
        fillSquare('a1', 'fill:orange;');
        addTextWithBorder('b2', 1.5, '⚠', 'opacity:1;', [0.3,0.1]);
        for(const shape of addedMetrics) BoardDrawer.createShape(shape.shapeType, shape.shapeSquare, shape.shapeConfig);
    `);
    metrics(h.drawer, true);
    h.render([{ ...helpers.getHintSquareShape('d4', 'gold', 1), profileID: 'teacher', category: 'pena-teaching',
        teachingID: 1, teachingRevision: 1, teachingPulse: 1, positionFen: fen, expiresAt: Date.now() + 5000,
        feedbackDescription: '♞ Teaching <idea>' }]);
    return { ...h, snapshot: h.drawer.snapshot() };
}
