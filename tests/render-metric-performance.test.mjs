import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import BoardAnalyzer from '../app/assets/js/BoardAnalyzer.js';
import { removeMetricShapes, reconcileMetricShapes } from '../app/assets/js/instance/metricShapes.js';

const metricSource = readFileSync(new URL('../app/assets/js/instance/renderMetric.js', import.meta.url), 'utf8');
const renderMetric = new Function('BoardAnalyzer', 'PieceEvaluator', 'removeMetricShapes', 'reconcileMetricShapes',
    metricSource.replace(/^import .*;\r?\n/gm, '').replace('export default async function renderMetric',
        'async function renderMetric') + '\nreturn renderMetric;')(
    BoardAnalyzer, class {}, removeMetricShapes, reconcileMetricShapes);

const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const keys = ['renderSquarePlayer', 'renderSquareEnemy', 'renderSquareContested', 'renderSquareSafe',
    'renderSquareAsDots', 'renderPiecePlayerCapture', 'renderPieceEnemyCapture', 'renderPieceLongRange',
    'renderPieceLongRangeStraight', 'renderKnightVision', 'renderVisionSide', 'renderOnExternalSite',
    'enableEveryPieceEvals'];

globalThis.CREATE_BOARD_DRAWER_MOVE_OBJ = (elem, shape, profileID, category) =>
    ({ elem, data: { ...shape, profileID, category } });
globalThis.FORMAT_MOVE_OBJ_TO_EXTERNAL_SITE = markings => markings.map(marking => marking.data);

function harness(initial = {}) {
    const config = { ...initial };
    const sent = [], created = [];
    const drawer = {
        addedShapes: [], usePrepend: true, singleSquareSize: 100,
        boardContainerElem: { prepend() {} },
        createShape(type, positions, shapeConfig) {
            const element = { dataset: {}, removed: false, remove() { this.removed = true; } };
            this.addedShapes.push({ type, positions, config: shapeConfig, element });
            created.push(element);
            return element;
        }
    };
    const instance = {
        pV: { main: { activeMetrics: [], activePieceEvalDisplays: [], chessVariant: 'chess' } },
        currentFen: fen, BoardDrawer: drawer, configKeys: Object.fromEntries(keys.map(key => [key, key])),
        getConfigValues: async () => ({ ...config }), getPlayerColor: async () => 'w',
        CommLink: { commands: { renderVisualsToSite: entries => sent.push(entries) } }
    };
    return { instance, config, sent, created, drawer };
}

test('attack and defender lookups match independent path scans on standard and variant boards', () => {
    const positions = [
        [fen, 'chess'],
        ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'chess'],
        ['rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR w - - 0 1', 'xiangqi'],
        ['rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w - - 0 1', 'capablanca'],
        ['4k/1+p3/2*2/3N1/4K w - - 0 1', 'shogi']
    ];
    for(const [position, chessVariant] of positions) for(const orientation of ['w', 'b']) {
        const board = new BoardAnalyzer(position, { chessVariant, orientation, analyzeCaptures: true });
        const result = board.analyze();
        const sees = (piece, row, col) => piece.paths.some(path => path[0] === row && path[1] === col);
        for(const [own, enemy] of [[result.player, result.enemy], [result.enemy, result.player]]) {
            for(const piece of own) {
                assert.deepEqual(piece.defendedBy, own.filter(other => sees(other, ...piece.position)));
                assert.deepEqual(piece.attackedBy, enemy.filter(other => sees(other, ...piece.position)));
            }
        }
        for(let row = 0; row < board.boardHeight; row++) for(let col = 0; col < board.boardWidth; col++) {
            if(board.board[row][col] === '*') continue;
            const own = result.player.filter(piece => sees(piece, row, col)).length;
            const enemy = result.enemy.filter(piece => sees(piece, row, col)).length;
            const category = own && enemy ? 'contested' : own ? 'playerOnly' : enemy ? 'enemyOnly' : 'safe';
            const entry = result.squares[category].find(value =>
                (value.square || value)[0] === row && (value.square || value)[1] === col);
            assert.ok(entry, `${chessVariant} ${orientation} ${row},${col}`);
            if(category === 'contested') assert.deepEqual(entry.counts, { playerCount: own, enemyCount: enemy });
        }
    }
});

test('unchanged metrics reuse shapes and changed settings retire them', async () => {
    const { instance, config, created, drawer } = harness({ renderSquarePlayer: true });
    await renderMetric.call(instance, fen, 'main');
    const count = created.length;
    assert.ok(count > 0);
    for(let i = 0; i < 1000; i++) await renderMetric.call(instance, fen, 'main');
    assert.equal(created.length, count);
    assert.equal(drawer.addedShapes.length, count);
    assert.ok(created.every(element => !element.removed));
    config.renderSquarePlayer = false;
    await renderMetric.call(instance, fen, 'main');
    assert.equal(drawer.addedShapes.length, 0);
    assert.ok(created.every(element => element.removed));
});

test('a late settings read cannot restore drawings disabled on the same position', async () => {
    const { instance, config, drawer } = harness({ renderSquarePlayer: true });
    let release;
    instance.getConfigValues = () => new Promise(resolve => { release = () => resolve({ renderSquarePlayer: true }); });
    const old = renderMetric.call(instance, fen, 'main');
    instance.getConfigValues = async () => ({ ...config, renderSquarePlayer: false });
    await renderMetric.call(instance, fen, 'main');
    release();
    await old;
    assert.equal(drawer.addedShapes.length, 0);
});

test('a stale position request cannot cancel a valid in-flight render', async () => {
    const { instance, drawer } = harness({ renderSquarePlayer: true });
    let release;
    instance.getConfigValues = () => new Promise(resolve => {
        release = () => resolve({ renderSquarePlayer: true });
    });
    const current = renderMetric.call(instance, fen, 'main');
    await renderMetric.call(instance, '8/8/8/8/8/8/8/8 w - - 0 1', 'main');
    release();
    await current;
    assert.ok(drawer.addedShapes.length > 0);
});

test('vision publishes before contributions and late contributions cannot overwrite a newer setting', async () => {
    const { instance, config, sent, drawer } = harness({
        renderSquarePlayer: true, renderOnExternalSite: true, enableEveryPieceEvals: true
    });
    let complete;
    instance.BoardPiecesEval = {
        cancelStaleRequests() {},
        eval(callback) { return new Promise(resolve => { complete = value => { callback(value); resolve(value); }; }); }
    };
    const pending = renderMetric.call(instance, fen, 'main');
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(sent[0].some(marking => marking.shapeType === 'rectangle'));
    assert.ok(complete);
    config.renderSquarePlayer = false;
    config.enableEveryPieceEvals = false;
    await renderMetric.call(instance, fen, 'main');
    complete({ a1: { eval: 1 } });
    await pending;
    assert.deepEqual(sent.at(-1), [{ profileID: 'main', category: 'metric' }]);
    assert.equal(drawer.addedShapes.length, 0);
});

test('contribution work for another profile is not cancelled by a metric refresh', async () => {
    const { instance } = harness({ renderSquarePlayer: true, enableEveryPieceEvals: true });
    instance.pV.other = { activeMetrics: [], activePieceEvalDisplays: [], chessVariant: 'chess' };
    const jobs = [];
    instance.BoardPiecesEval = {
        cancel() { assert.fail('refresh must not cancel unrelated contribution jobs'); },
        cancelStaleRequests() {},
        eval(callback, config) {
            return new Promise(resolve => jobs.push({ callback, config, resolve }));
        }
    };
    const first = renderMetric.call(instance, fen, 'main');
    const second = renderMetric.call(instance, fen, 'other');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(jobs.length, 2);
    for(const job of jobs) {
        assert.equal(job.config.isCurrent(), true);
        job.callback({ a1: { eval: 1 } });
        job.resolve();
    }
    await Promise.all([first, second]);
    assert.equal(instance.pV.main.activePieceEvalDisplays.length, 1);
    assert.equal(instance.pV.other.activePieceEvalDisplays.length, 1);
});

test('batched settings preserve profile precedence and dynamic curves', async () => {
    const source = readFileSync(new URL('../app/assets/js/globals.js', import.meta.url), 'utf8');
    const start = source.indexOf('function RESOLVE_GM_CFG_VALUE(');
    const end = source.indexOf('async function GET_GM_CFG_BASE_VALUE(', start);
    let reads = 0;
    const config = { global: { a: 1, b: 2, profiles: { profile: { a: 3, dynamicSettings: { a: { enabled: true } } } } },
        instance: { board: { a: 4, profiles: { profile: { b: 5 } } } } };
    const values = runInNewContext(`${source.slice(start, end)}\nGET_GM_CFG_VALUES`, {
        USERSCRIPT_SHARED_VARS: { gmConfigKey: 'cfg' },
        USERSCRIPT: { getValue: async () => { reads++; return config; } },
        GET_PROFILE_STORAGE_KEY: name => name, DYNAMIC_SETTINGS_STORAGE_KEY: 'dynamicSettings',
        DynamicSettingsCore: { getContext: () => ({}), resolveValue: value => value + 10 }
    });
    const result = await values(['a', 'b', 'c'], 'board', 'profile');
    assert.equal(result.a, 13);
    assert.equal(result.b, 5);
    assert.equal(result.c, null);
    assert.equal(reads, 1);
});
