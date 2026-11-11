import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from '../app/assets/engines/libraries/chessjs/chess.js';
import { enginePosition } from '../app/assets/js/instance/enginePosition.js';
import { searchCommand } from '../app/assets/js/instance/searchCommand.js';
import { isLc0Engine } from '../app/assets/js/instance/lc0Engines.js';
import { parseClientMessage, validateUciCommand } from '../appServer/backend/uciCommand.js';

test('advanced search modes do not combine incompatible UCI limits', () => {
    const config = { advanced: true, depth: 12, nodes: 100, movetime: 5000, specificMoves: ' searchmoves e2e4' };
    assert.equal(searchCommand({ ...config, mode: 'standard' }).command, 'go nodes 100 searchmoves e2e4');
    assert.equal(searchCommand({ ...config, nodes: 0 }).command, 'go depth 12 searchmoves e2e4');
    assert.equal(searchCommand({ ...config, mode: 'movetime' }).command, 'go movetime 5000 searchmoves e2e4');
    assert.equal(searchCommand({ ...config, mode: 'infinite' }).command, 'go infinite searchmoves e2e4');
    assert.equal(searchCommand({ ...config, advanced: false, mode: 'movetime' }).command, 'go nodes 100 searchmoves e2e4');
    assert.equal(searchCommand({ advanced: false }).command, 'go depth 100');
    for(const movetime of [0, -1, 1.5, 100001, NaN, '5000'])
        assert.throws(() => searchCommand({ ...config, mode: 'movetime', movetime }), /Engine movetime/);
    assert.throws(() => searchCommand({ ...config, mode: 'invalid' }), /Unknown search mode/);
});

test('Calculation Server accepts bounded history without relaxing other command validation', () => {
    const history = 'position fen ' + 'x'.repeat(500) + ' moves' + ' e2e4'.repeat(2000);
    assert.ok(history.length > 8192);
    assert.doesNotThrow(() => validateUciCommand(history));
    const packet = JSON.stringify({ type: 'uci', msg: { command: history, profileName: 'default' } });
    assert.equal(parseClientMessage(packet).msg.command, history);
    const atLimit = 'position fen ' + 'x'.repeat(262144 - 'position fen '.length);
    assert.doesNotThrow(() => validateUciCommand(atLimit));
    assert.equal(parseClientMessage(JSON.stringify({ type: 'uci', msg: { command: atLimit } })).msg.command, atLimit);
    assert.throws(() => validateUciCommand(atLimit + 'x'), /too long/);
    assert.throws(() => parseClientMessage(JSON.stringify({ type: 'uci', msg: { command: atLimit + 'x' } })), /too long/);
    assert.throws(() => parseClientMessage(JSON.stringify({ type: 'uci', msg: { command: 'go ' + 'x'.repeat(4096) } })), /too long/);
    assert.throws(() => parseClientMessage(JSON.stringify({ type: 'other', msg: history })), /too long/);
    assert.throws(() => parseClientMessage(JSON.stringify({ type: 'uci', msg: { command: history, profileName: 'x'.repeat(4096) } })), /too long/);
    assert.throws(() => validateUciCommand('setoption ' + 'x'.repeat(512)), /too long/);
    assert.throws(() => validateUciCommand(history + '\nstop'), /forbidden/);
});

const source = readFileSync(new URL('../app/assets/js/instance/calculateBestMoves.js', import.meta.url), 'utf8');
const calculate = new Function('Chess', 'enginePosition', 'searchCommand', 'isLc0Engine',
    'setProfileBubbleStatus', 'updatePipData', 'updatePipHints', 'incrementUserUsageStat', 'setDynamicSettingsContext',
    `${source.replace(/^import .*;\r?\n/gm, '').replace('export default async function calculateBestMoves', 'async function calculateBestMoves')}
    return calculateBestMoves;`);

function fixture(settings = {}) {
    const chess = new Chess();
    const history = [{ fen: { full: chess.fen() } }];
    const move = chess.move('e4');
    history.push({ fen: { full: chess.fen() }, boardChanges: { from: move.from, to: move.to } });
    const commands = [], statuses = [], pip = [];
    const calculateBestMoves = calculate(Chess, enginePosition, searchCommand, isLc0Engine,
        (...args) => statuses.push(args), data => pip.push(data), () => {}, () => {}, () => {});
    const config = { engineEnabled: true, reverseSide: false, onlyCalculateOwnTurn: false, alwaysMyTurn: false,
        maxMovetime: 0, advancedSearchMode: 'movetime', advancedSearchMovetime: 5000, ...settings };
    const vars = { chessVariants: ['chess'], chessVariant: 'chess', useChess960: false,
        usingAdvancedMode: true, useExternalChessEngine: true, engineSettingsReady: true,
        searchDepth: 12, engineNodes: 100, pendingCalculations: [] };
    const instance = {
        instanceID: 'test', currentFen: chess.fen(), gameStateHistory: history,
        configKeys: Object.fromEntries(Object.keys(config).map(key => [key, key])), pV: { default: vars },
        getPlayerColor: async () => 'w', syncDynamicSettings: async () => {},
        getConfigValue: async key => config[key], isPlayerTurn: async () => true,
        isPawnOnPromotionSquare: () => false, isEngineCalculating: () => vars.pendingCalculations.some(x => !x.finished),
        getEngineName: async () => 'external', sendMsgToEngine: async cmd => { commands.push(cmd); },
        engineStopCalculating: () => { commands.push('stop'); vars.pendingCalculations[0].stopRequested = true; },
        CommLink: {}, Interface: { removeMarkings() {} }, calculateBestMoves
    };
    globalThis.GET_PROFILES = async () => [{ name: 'default', config }];
    globalThis.FORMAT_VARIANT = value => value;
    globalThis.GET_BOARD_DIMENSIONS_FROM_FEN = () => [8, 8];
    globalThis.IS_PLAYER_ATTACKING_KING = () => false;
    return { instance, vars, config, commands, statuses, pip };
}

test('external calculation sends recorded history and engine time without depth or nodes', async () => {
    const { instance, vars, commands, pip } = fixture();
    await instance.calculateBestMoves(instance.currentFen);
    assert.match(commands[0], /^position fen .* moves e2e4$/);
    assert.equal(commands[1], 'go movetime 5000');
    assert.equal(vars.pendingCalculations[0].engineMovetime, 5000);
    assert.equal(pip.at(-1).movetime, 5000);
    assert.equal(vars.currentMovetimeTimeout, undefined);
});

test('external calculation sends the full long history within the server packet limit', async () => {
    const { instance, commands } = fixture();
    const chess = new Chess();
    instance.gameStateHistory = [{ fen: { full: chess.fen() } }];
    for(let i = 0; i < 1800; i++) {
        const move = chess.move(['Nf3', 'Nf6', 'Ng1', 'Ng8'][i % 4]);
        instance.gameStateHistory.push({ fen: { full: chess.fen() }, boardChanges: { from: move.from, to: move.to } });
    }
    instance.currentFen = chess.fen();
    await instance.calculateBestMoves(instance.currentFen);
    const position = commands[0];
    assert.ok(position.length > 8192);
    assert.equal(position.split(' moves ')[1].split(' ').length, 1800);
    const received = parseClientMessage(JSON.stringify({ type: 'uci', msg: {
        command: position, engineId: 'engine', instanceId: 'instance', profileName: 'default'
    } }));
    assert.equal(received.msg.command, position);
    assert.doesNotThrow(() => validateUciCommand(received.msg.command));
    assert.equal(commands[1], 'go movetime 5000');
});

test('missing budget defaults to 5000; invalid budget reports a warning and sends nothing', async () => {
    const defaults = fixture({ advancedSearchMovetime: null });
    await defaults.instance.calculateBestMoves(defaults.instance.currentFen);
    assert.equal(defaults.commands[1], 'go movetime 5000');
    const invalid = fixture({ advancedSearchMovetime: 0 });
    await invalid.instance.calculateBestMoves(invalid.instance.currentFen);
    assert.deepEqual(invalid.commands, []);
    assert.match(invalid.statuses[0][2], /Engine movetime/);
});

test('engine movetime ignores the external timer and incomplete history falls back to current FEN', async () => {
    const { instance, commands, vars, pip } = fixture({ maxMovetime: 10, advancedSearchMovetime: 5000 });
    instance.gameStateHistory[1].historyIncomplete = true;
    await instance.calculateBestMoves(instance.currentFen);
    assert.equal(commands[0], `position fen ${instance.currentFen}`);
    assert.equal(commands[1], 'go movetime 5000');
    assert.equal(pip.at(-1).movetime, 5000);
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(commands[2], undefined);
    clearTimeout(vars.currentMovetimeTimeout);
});

test('infinite mode and disabled advanced settings choose the correct search', async () => {
    const infinite = fixture({ advancedSearchMode: 'infinite', movesOnDemand: true });
    await infinite.instance.calculateBestMoves(infinite.instance.currentFen, { specificMovesObj: { moves: ['e7e5'] } });
    assert.equal(infinite.commands[1], 'go infinite searchmoves e7e5');
    assert.equal(infinite.vars.pendingCalculations[0].isSearchInfinite, true);
    const basic = fixture();
    basic.vars.usingAdvancedMode = false;
    await basic.instance.calculateBestMoves(basic.instance.currentFen);
    assert.equal(basic.commands[1], 'go nodes 100');
    assert.equal(basic.vars.pendingCalculations[0].isSearchInfinite, false);
    const rodent = fixture();
    rodent.vars.usingAdvancedMode = false;
    rodent.vars.searchDepth = null;
    rodent.vars.engineNodes = 0;
    rodent.vars.useExternalChessEngine = false;
    rodent.vars.appliedSettings = { engineElo: 1000 };
    rodent.instance.getEngineName = async () => 'rodent-v';
    await rodent.instance.calculateBestMoves(rodent.instance.currentFen);
    assert.equal(rodent.commands[1], 'go depth 100');
    // Rodent's runtime announces its effective node limit before its PV lines.
    assert.equal(rodent.vars.pendingCalculations[0].isSearchInfinite, true);
});

test('3200 keeps unrestricted streaming for Stockfish, external engines and Rodent', async () => {
    for(const [engine, external] of [['stockfish-18-single', false], ['external', true], ['rodent-v', false]]) {
        const { instance, vars, commands } = fixture();
        Object.assign(vars, {
            usingAdvancedMode: false, useExternalChessEngine: external,
            searchDepth: null, engineNodes: 0, appliedSettings: { engineElo: 3200 }
        });
        instance.getEngineName = async () => engine;
        await instance.calculateBestMoves(instance.currentFen);
        assert.equal(commands[1], 'go depth 100', engine);
        assert.equal(vars.pendingCalculations[0].isSearchInfinite, true, engine);
    }
});

test('Max Movetime still stops standard and infinite searches', async () => {
    for(const mode of ['standard', 'infinite']) {
        const { instance, commands, vars } = fixture({ advancedSearchMode: mode, maxMovetime: 10 });
        await instance.calculateBestMoves(instance.currentFen);
        await new Promise(resolve => setTimeout(resolve, 40));
        assert.equal(commands.at(-1), 'stop');
        clearTimeout(vars.currentMovetimeTimeout);
    }
});

test('a board change still sends stop to an external movetime search', async () => {
    const source = readFileSync(new URL('../app/assets/js/AcasInstance.js', import.meta.url), 'utf8');
    const start = source.indexOf('    engineStopCalculating(profile, reason) {');
    const end = source.indexOf('    async recoverExternalEngineSearch(', start);
    assert.ok(start >= 0 && end > start);
    const stop = new Function(`return ({ ${source.slice(start, end)} }).engineStopCalculating;`)();
    const { instance, vars, commands } = fixture();
    instance.engineStopCalculating = stop;
    await instance.calculateBestMoves(instance.currentFen);
    instance.currentFen = 'a newer position';
    instance.engineStopCalculating(false, 'Board changed');
    assert.equal(commands.at(-1), 'stop');
    assert.equal(vars.pendingCalculations[0].stopRequested, true);
    clearTimeout(vars.currentStopTimeout);
});

test('own-turn filtering uses the requested FEN, not a newer packet turn during async settings reads', async () => {
    const { instance, commands } = fixture({ onlyCalculateOwnTurn: true, maxMovetime: 20 });
    const chess = new Chess();
    instance.currentFen = chess.fen();
    instance.gameStateHistory = [{ fen: { full: chess.fen() } }];
    instance.isPlayerTurn = async () => false;
    await instance.calculateBestMoves(instance.currentFen);
    assert.equal(commands[1], 'go movetime 5000');
    clearTimeout(instance.pV.default.currentMovetimeTimeout);
});
