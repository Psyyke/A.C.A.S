import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVariantMove } from '../app/assets/js/misc/variantPosition.js';

const globals = readFileSync(new URL('../app/assets/js/globals.js', import.meta.url), 'utf8');
const processorSource = readFileSync(new URL('../app/assets/js/instance/engineMessageProcessor.js', import.meta.url), 'utf8');
const section = (start, end) => globals.slice(globals.indexOf(start), globals.indexOf(end, globals.indexOf(start)));
const factory = new Function('parseVariantMove', `
    ${section('function GET_LATEST_RANKED_MOVES(', 'const CREATE_MOVE_OBJ')}
    ${section('const CREATE_MOVE_OBJ', 'function ',).replace(/\s*$/, '')}
    ${section('function PARSE_UCI_RESPONSE(', 'function EXTRACT_VARIANT_NAMES(')}
    const setProfileBubbleStatus = () => {}, fillDynamicEngineOptionContainer = () => {},
        setDynamicOptionsReady = () => {}, updatePipData = () => {}, updatePipHints = () => {},
        setDynamicSettingsContext = () => {}, isActivityLoggingEnabled = () => false,
        logActivity = () => {}, evaluationForPlayer = () => null, annotateEvaluation = async () => {},
        isBuiltInFairyEngine = () => false, recordEngineAnalysis = () => {};
    ${processorSource.replace(/^import .*;\r?\n/gm, '').replace('export default async function engineMessageProcessor', 'async function engineMessageProcessor')}
    return { engineMessageProcessor, GET_UNIQUE_MOVES, CREATE_MOVE_OBJ };
`);
const { engineMessageProcessor, GET_UNIQUE_MOVES, CREATE_MOVE_OBJ } = factory(parseVariantMove);

function harness({ amount = 2, onlyTop = false, mix = false } = {}) {
    const fen = '8/8/8/8/8/8/8/8 w - - 0 1';
    const calculation = { fen, startedAt: Date.now(), finished: false, annotationEligible: false };
    const profile = { pendingCalculations: [calculation], pastMoveObjects: [], futureMoves: [],
        activeGuiMoveMarkings: [], multiPV: amount, searchDepth: 10, engineNodes: 0, useExternalChessEngine: true };
    const displays = [];
    const config = { maxMovetime: 0, onlyShowTopMoves: onlyTop, movesOnDemand: false, moveDisplayDelay: 0 };
    const instance = {
        currentFen: fen, pV: { main: profile }, configKeys: Object.fromEntries(Object.keys(config).map(key => [key, key])),
        CommLink: { commands: { updateDynamicContext: async () => {} }, ...(mix ? { analysisFinished() {} } : {}) },
        getConfigValue: async key => config[key], getPlayerColor: async () => 'w',
        getEngineName: async () => 'external', isLearningProfile: () => false,
        Interface: { updateMoveProgress() {} },
        displayMoves: async (moves, name, bypass, silent) => {
            displays.push({ moves: structuredClone(moves), silent });
            profile.activeGuiMoveMarkings = moves.map(() => ({}));
            profile.hintCandidates = { fen, moves };
            if(!silent) profile.pastMoveObjects = [];
        },
        syncDynamicSettings: async () => {}
    };
    globalThis.TRANS_OBJ = {};
    globalThis.SEND_WEBHOOK = async () => {};
    return { instance, profile, displays };
}

test('root moves are unique irrespective of predicted replies, retaining the newest line', () => {
    const create = (root, reply, rank = 1) => CREATE_MOVE_OBJ({
        playerMove: parseVariantMove(root), opponentMove: parseVariantMove(reply), profile: 'main', ranking: rank
    });
    const [moves, removed] = GET_UNIQUE_MOVES([create('f3h3', null), create('f3h3', 'f8c5')]);
    assert.equal(removed, 1);
    assert.equal(moves.length, 1);
    assert.equal(moves[0].opponentUci, 'f8c5');
    assert.equal(GET_UNIQUE_MOVES([create('a7a8q', null), create('a7a8n', null)])[0].length, 2);
    assert.equal(GET_UNIQUE_MOVES([create('f3h3', null, 1), create('f3h3', 'f8c5', 2)])[0][0].ranking, 1);
});

for(const options of [{}, { onlyTop: true }, { mix: true }]) {
    test(`single-PV iterations result in one primary arrow ${JSON.stringify(options)}`, async () => {
        const { instance, displays } = harness(options);
        for(const line of [
            'info string sacrifice appetite 750 (no sacrifice yet this game)',
            'info depth 1 seldepth 5 score cp 529 nodes 76 nps 76000 hashfull 0 time 1 pv f3h3',
            'info depth 2 seldepth 6 score cp 538 nodes 150 nps 150000 hashfull 0 time 1 pv f3h3 f8c5',
            'bestmove f3h3'
        ]) await engineMessageProcessor.call(instance, line, 'main');
        assert.ok(displays.length > 0);
        for(const display of displays) assert.deepEqual(display.moves.map(move => move.playerUci), ['f3h3']);
        assert.equal(displays.at(-1).moves[0].opponentUci, 'f8c5');
        assert.equal(displays.at(-1).moves[0].cp, 538);
    });
}

test('different MultiPV moves remain distinct and final bestmove is primary', async () => {
    const { instance, displays } = harness({ onlyTop: true });
    for(const line of [
        'info depth 1 multipv 1 score cp 50 pv e2e4 e7e5',
        'info depth 1 multipv 2 score cp 30 pv d2d4 d7d5',
        'info depth 2 multipv 1 score cp 60 pv e2e4 c7c5',
        'info depth 2 multipv 2 score cp 40 pv d2d4 g8f6',
        'bestmove e2e4'
    ]) await engineMessageProcessor.call(instance, line, 'main');
    assert.deepEqual(displays.at(-1).moves.map(move => move.playerUci), ['e2e4', 'd2d4']);
    assert.deepEqual(displays.at(-1).moves.map(move => move.opponentUci), ['c7c5', 'g8f6']);
});

test('successive different rank-one moves do not become secondary suggestions', async () => {
    const { instance, displays } = harness();
    await engineMessageProcessor.call(instance, 'info depth 1 score cp 50 pv e2e4 e7e5', 'main');
    await engineMessageProcessor.call(instance, 'info depth 2 score cp 60 pv d2d4 d7d5', 'main');
    assert.deepEqual(displays.at(-1).moves.map(move => move.playerUci), ['d2d4']);
    await engineMessageProcessor.call(instance, 'bestmove d2d4', 'main');
    assert.deepEqual(displays.at(-1).moves.map(move => move.playerUci), ['d2d4']);
    assert.equal(displays.at(-1).silent, true);
});

test('bestmove without a matching PV replaces the stale primary', async () => {
    const { instance, displays } = harness();
    await engineMessageProcessor.call(instance, 'info depth 1 score cp 50 pv e2e4 e7e5', 'main');
    await engineMessageProcessor.call(instance, 'bestmove d2d4', 'main');
    assert.deepEqual(displays.at(-1).moves.map(move => move.playerUci), ['d2d4']);
});

test('an info line suspended on settings cannot publish suggestions for a newer position', async () => {
    const { instance, profile, displays } = harness({ amount: 1 });
    const original = instance.getConfigValue;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    instance.getConfigValue = async key => {
        if(key === 'maxMovetime') await gate;
        return original(key);
    };
    const processing = engineMessageProcessor.call(instance, 'info depth 8 score cp 50 pv e2e4 e7e5 g1f3', 'main');
    await Promise.resolve();
    instance.currentFen = '8/8/8/8/8/8/8/8 b - - 0 1';
    profile.pastMoveObjects = [];
    release();
    await processing;
    assert.equal(displays.length, 0);
    assert.deepEqual(profile.futureMoves, []);
});

test('a short search with only bestmove still delivers one suggestion', async () => {
    const { instance, displays } = harness({ amount: 1, onlyTop: true });
    const original = instance.getConfigValue;
    instance.getConfigValue = async key => key === 'maxMovetime' ? 20 : original(key);
    await engineMessageProcessor.call(instance, 'bestmove e2e4', 'main');
    assert.equal(displays.length, 1);
    assert.equal(displays[0].moves[0].playerUci, 'e2e4');
});
