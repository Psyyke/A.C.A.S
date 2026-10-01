import { createViewport, fittedViewport, zoomAxis, panAxis, axisDomain, tickValues, formatTick, formatSettingValue, graphProfileStyle, moveCurvePoint, insertionX, modifierAxes, settingDisplayName, filterGraphLines, shouldCollapseVariableTabs, setInterpolationLockVisibility } from '../assets/js/gui/dynamicGraph.js';
import { getOwnedSettingInput, describeDynamicSetting, createDynamicSettingShortcut, updateDynamicSettingShortcut, restoreDynamicSettingShortcutFocus } from '../assets/js/gui/dynamicSettingShortcuts.js';
import { describeSettingInput, categoricalCurveDefinition, alignCategoricalCurves } from '../assets/js/gui/dynamicSettingDefinitions.js';
import syncDynamicSettings, { changedSettingKeys } from '../assets/js/instance/syncDynamicSettings.js';
import updateSettings from '../assets/js/instance/updateSettings.js';
import applyDynamicOption from '../assets/js/instance/applyDynamicOption.js';
import engineStartNewGame from '../assets/js/instance/engineStartNewGame.js';
import { setDynamicOption, getDynamicOption, resetDynamicOptionsReady, setDynamicOptionsReady, onDynamicOptionsReady } from '../assets/js/gui/dynamicEngineOptionState.js';
import { createActivityLog, activityLog, logActivity, formatLogValue } from '../assets/js/misc/activityLog.js';
import { createLogRow, initializeActivityLog, filterLogEntries } from '../assets/js/gui/activityLog.js';
import { otherVariableLines, createVariableLinks, confirmLineRemoval } from '../assets/js/gui/dynamicSettingActions.js';
import { evaluationForPlayer } from '../assets/js/misc/evaluation.js';
import { finishPendingSettingChanges } from '../assets/js/misc/settingActivity.js';

const results = [];
const assert = (condition, message) => { if(!condition) throw new Error(message); };
const close = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const test = (name, check) => {
    try {
        check();
        results.push({ name, passed: true });
    } catch(error) {
        results.push({ name, passed: false, error: error.message });
    }
};
const testAsync = async (name, check) => {
    try { await check(); results.push({ name, passed: true }); }
    catch(error) { results.push({ name, passed: false, error: error.message }); }
};

test('Activity log keeps bounded, ordered, immutable entries with instance/profile context', () => {
    const log = createActivityLog(2);
    const first = log.add('engine-input', 'uci', { instanceID: 'A', profile: 'default' });
    const second = log.add('engine-output', 'uciok', { instanceID: 'A', profile: 'default' });
    const third = log.add('dynamic-change', 'engineElo: 1500 → 1900', { instanceID: 'B', profile: 'other' });
    const entries = log.getEntries();
    assert(entries.length === 2 && entries[0] === second && entries[1] === third, 'Retention order or bound is wrong');
    assert(first.id < second.id && second.id < third.id && Number.isFinite(first.timestamp), 'Ordering/timestamps missing');
    assert(third.instanceID === 'B' && third.profile === 'other', 'Instance/profile context lost');
    assert(Object.isFrozen(third), 'Entry can be mutated');
    entries.pop();
    assert(log.getEntries().length === 2, 'Snapshot mutation altered the log');
    log.clear();
    assert(log.getEntries().length === 0 && log.add('app', 'after clear').id > third.id, 'Clear breaks future entries');
});

test('Logging handles errors, circular objects, bigint and failing subscribers safely', () => {
    const circular = { count: 1n };
    circular.self = circular;
    assert(formatLogValue(circular).includes('[Circular]') && formatLogValue(circular).includes('"1"'), 'Complex value breaks logging');
    assert(formatLogValue(new Error('test error')).includes('test error'), 'Error details lost');
    assert(formatLogValue(false) === 'false' && formatLogValue(0) === '0', 'False/zero are missing');
    const log = createActivityLog(2);
    let notifications = 0;
    log.subscribe(() => { throw new Error('bad viewer'); });
    const unsubscribe = log.subscribe(() => notifications++);
    log.add('error', circular);
    assert(notifications === 1, 'Failing viewer interrupted logging');
    unsubscribe();
    log.clear();
    assert(notifications === 1, 'Unsubscribed viewer was notified');
});

test('Log rows display messages as text, not executable markup', () => {
    const entry = createActivityLog().add('engine-output', '<img src=x onerror="alert(1)">', { instanceID: 'A', profile: 'default' });
    const row = createLogRow(entry);
    assert(!row.querySelector('img') && row.querySelector('pre').textContent === entry.message, 'Engine text became HTML');
    assert(row.dataset.type === 'engine-output' && row.querySelector('time').dateTime, 'Category or timestamp missing');
    assert(row.textContent.includes('Instance A') && row.querySelector('.activity-log-context').textContent.endsWith('default'), 'Context is not visible');
    assert(!row.textContent.includes('Profile default'), 'Redundant profile title remains');
});

test('Existing variable links navigate once and do not duplicate profile destinations', () => {
    const lines = [
        { profile: 'default', key: 'engineElo', curve: { variable: 'pieceCount' } },
        { profile: 'other', key: 'engineElo', curve: { variable: 'moveNumber' } },
        { profile: 'default', key: 'engineNodes', curve: { variable: 'moveNumber' } }
    ];
    const existing = otherVariableLines(lines, 'engineElo', 'moveNumber');
    assert(existing.length === 1 && existing[0] === lines[0], 'Links include another setting or the current variable');
    let destination = '';
    const links = createVariableLinks([...existing, ...existing], DynamicSettingsCore.variables, key => { destination = key; });
    assert(links.length === 1 && links[0].textContent.includes('Piece Count'), 'Variable links are missing or duplicated');
    links[0].click();
    assert(destination === 'pieceCount', 'Variable link did not navigate');
});

test('Type filters preserve order and isolate input, output, dynamic changes and errors', () => {
    const log = createActivityLog();
    ['engine-input', 'engine-output', 'dynamic-change', 'error', 'engine-output'].forEach(type => log.add(type, type));
    const entries = log.getEntries();
    assert(filterLogEntries(entries).length === 5, 'All filter drops entries');
    ['engine-input', 'dynamic-change', 'error'].forEach(type => {
        assert(filterLogEntries(entries, type).length === 1 && filterLogEntries(entries, type)[0].type === type, `Wrong ${type} filter`);
    });
    const output = filterLogEntries(entries, 'engine-output');
    assert(output.length === 2 && output[0].id < output[1].id, 'Output order is incorrect');
    assert(filterLogEntries(entries, 'warning').length === 0 && log.getEntries().length === 5, 'Filtering mutates history');
});

test('Evaluation matches the bar for both player colors and either analyzed side', () => {
    for(const player of ['w', 'b']) {
        for(const analyzed of ['w', 'b']) {
            for(const score of [-200, 0, 200]) {
                const result = evaluationForPlayer(score, false, analyzed, player);
                close(result.playerEvaluation, player === analyzed ? score : -score);
                const playerAdvantage = player === 'w' ? result.whiteAdvantage : 1 - result.whiteAdvantage;
                assert(Math.sign(playerAdvantage - 0.5) === Math.sign(result.playerEvaluation), 'Bar disagrees with player advantage');
            }
        }
    }
    close(evaluationForPlayer(3, true, 'b', 'b').playerEvaluation, 1000);
    close(evaluationForPlayer(-3, true, 'w', 'w').playerEvaluation, -1000);
    close(evaluationForPlayer(0, true, 'b', 'w').playerEvaluation, 1000);
    assert(evaluationForPlayer(NaN, false, 'w', 'w') === null, 'Invalid score accepted');
    assert(DynamicSettingsCore.formatVariableValue('evaluation', 0) === 'Equal (0 cp)', 'Equal score label missing');
    assert(DynamicSettingsCore.formatVariableValue('evaluation', 100).startsWith('Winning'), 'Winning label missing');
    assert(DynamicSettingsCore.formatVariableValue('evaluation', -100).startsWith('Losing'), 'Losing label missing');
});

test('Piece Count is bounded at 32 in shared resolution and legacy curve normalization', () => {
    close(DynamicSettingsCore.variables.pieceCount.max, 32);
    close(DynamicSettingsCore.getVariableValue('pieceCount', { pieceCount: 64 }), 32);
    close(DynamicSettingsCore.getVariableValue('pieceCount', { pieceCount: -1 }), 0);
    const curve = DynamicSettingsCore.normalizeCurve({ variable: 'pieceCount', points: [{ x: -1, y: 1 }, { x: 64, y: 2 }] });
    assert(curve.points[0].x === 0 && curve.points[1].x === 32, 'Legacy points remain outside the domain');
});

await testAsync('Profile snapshots use the same inherited defaults and dynamic values as config getters', async () => {
    const original = window.USERSCRIPT;
    const instanceID = 'profile-inheritance-test';
    const config = { global: { engineElo: 1500, chessEngine: 'maia3', profiles: { default: {
        engineEnabled: true, dynamicSettings: { engineElo: { enabled: true, variable: 'pieceCount',
            points: [{ x: 10, y: 1900 }] } } } } },
        instance: { [instanceID]: { engineElo: 1600, profiles: { default: { moveSuggestionAmount: 3 } } } } };
    window.USERSCRIPT = { getValue: async () => config };
    DynamicSettingsCore.setContext(instanceID, { pieceCount: 10 });
    try {
        const profile = await GET_PROFILE_FOR_INSTANCE('default', instanceID);
        assert(profile.config.engineElo === await GET_GM_CFG_VALUE('engineElo', instanceID, 'default'), 'Snapshot diverges from dynamic getter');
        assert(profile.config.chessEngine === 'maia3' && profile.config.engineElo === 1900, 'Inherited default was not resolved');
        assert(profile.config.moveSuggestionAmount === 3 && !Object.hasOwn(profile.config, 'profiles'), 'Instance override or profile snapshot shape is wrong');
        assert(config.instance[instanceID].engineElo === 1600, 'Resolution changed stored defaults');
    } finally {
        DynamicSettingsCore.removeContext(instanceID);
        if(original === undefined) delete window.USERSCRIPT;
        else window.USERSCRIPT = original;
    }
});

test('Line removal honors cancellation and names the setting/profile before deletion', () => {
    const line = { label: 'Engine ELO', profile: 'default', curve: { points: [{ x: 1, y: 1500 }] } };
    const before = JSON.stringify(line);
    let prompt = '';
    assert(!confirmLineRemoval(line, message => { prompt = message; return false; }), 'Cancel permits deletion');
    assert(prompt.includes('Engine ELO') && prompt.includes('default') && prompt.includes('saved default'), 'Confirmation is unclear');
    assert(JSON.stringify(line) === before, 'Confirmation mutated the curve');
    assert(confirmLineRemoval(line, () => true), 'Confirmed deletion is rejected');
    assert(!confirmLineRemoval(null, () => { throw new Error('No line should not prompt'); }), 'Missing line permits deletion');
});

await testAsync('Log viewer preserves closed-dialog history, clears cleanly and does not duplicate reopened entries', async () => {
    const fixture = document.createElement('div');
    fixture.innerHTML = '<dialog id="log-floaty"><span id="activity-log-status"></span><select id="activity-log-filter"><option value="all">All</option><option value="engine-output">Output</option><option value="error">Errors</option></select><button id="activity-log-clear">Clear</button><div id="activity-log-entries"></div></dialog>';
    document.body.appendChild(fixture);
    const dialog = fixture.querySelector('dialog');
    const list = fixture.querySelector('#activity-log-entries');
    const waitForRender = () => new Promise(resolve => setTimeout(resolve, 160));
    try {
        activityLog.clear();
        initializeActivityLog();
        logActivity('engine-input', 'uci');
        assert(list.childElementCount === 0, 'Closed viewer performed DOM work');
        dialog.showModal();
        await waitForRender();
        assert(list.childElementCount === 1 && list.textContent.includes('uci'), 'Closed-dialog history missing on open');
        logActivity('engine-output', 'uciok');
        await waitForRender();
        assert(list.childElementCount === 2, 'Live output missing');
        dialog.close();
        logActivity('dynamic-change', 'engineElo: 1500 → 1900');
        await waitForRender();
        assert(list.childElementCount === 2, 'Closed viewer kept rendering');
        dialog.showModal();
        await waitForRender();
        assert(list.childElementCount === 3, 'Reopen lost or duplicated entries');
        const filter = fixture.querySelector('select');
        filter.value = 'engine-output';
        filter.dispatchEvent(new Event('change'));
        assert(list.childElementCount === 1 && list.firstElementChild.dataset.type === 'engine-output', 'Live filter shows another type');
        logActivity('engine-input', 'isready');
        logActivity('engine-output', 'readyok');
        await waitForRender();
        assert(list.childElementCount === 2 && list.textContent.includes('readyok'), 'Filtered live output is missing');
        filter.value = 'error';
        filter.dispatchEvent(new Event('change'));
        assert(list.childElementCount === 0, 'Empty type filter leaves stale entries');
        filter.value = 'all';
        filter.dispatchEvent(new Event('change'));
        assert(list.childElementCount === 5, 'Restoring All loses or duplicates history');
        fixture.querySelector('button').click();
        assert(list.childElementCount === 0 && activityLog.getEntries().length === 0, 'Clear left stale entries');
        logActivity('app', 'after clear');
        await waitForRender();
        assert(list.childElementCount === 1 && list.textContent.includes('after clear'), 'Clear prevents future rendering');
    } finally {
        dialog.close();
        activityLog.clear();
        fixture.remove();
    }
});

test('UCI dropdown parsing preserves multi-word, numeric and boolean-looking choices', () => {
    const option = PARSE_UCI_OPTION('option name Playing Style type combo default Very Aggressive var Normal var Very Aggressive var 001 var true');
    assert(option.name === 'Playing Style' && option.def === 'Very Aggressive', 'UCI default was truncated');
    assert(JSON.stringify(option.vars) === JSON.stringify(['Normal', 'Very Aggressive', '001', 'true']), 'UCI choices were truncated or coerced');
    const numeric = PARSE_UCI_OPTION('option name Style type combo default 001 var 001 var 002');
    assert(numeric.def === '001', 'Numeric dropdown default lost its string identity');
    const spin = PARSE_UCI_OPTION('option name Threads type spin default 2 min 1 max 8');
    assert(spin.def === 2 && spin.min === 1 && spin.max === 8, 'Numeric UCI bounds stopped working');
    assert(PARSE_UCI_OPTION('option name Ponder type check default false').def === false, 'Boolean UCI defaults stopped working');
    assert(PARSE_UCI_OPTION('option name MissingType') === null, 'Malformed UCI line was accepted');
});

test('Dropdown curves resolve exact named values and never interpolate their indices', () => {
    const curve = { enabled: true, variable: 'moveNumber', values: [null, 'maia3', 'lozza-9'],
        interpolation: 'smooth', points: [{ x: 2, y: 1 }, { x: 10, y: 2 }, { x: 20, y: 0 }] };
    assert(DynamicSettingsCore.normalizeCurve(curve).interpolation === 'step', 'Dropdown interpolation is not locked');
    assert(DynamicSettingsCore.resolveValue('stockfish-19', curve, { moveNumber: 9 }) === 'maia3', 'Dropdown interpolated between engines');
    assert(DynamicSettingsCore.resolveValue('stockfish-19', curve, { moveNumber: 10 }) === 'lozza-9', 'Engine did not change at exact transition');
    assert(DynamicSettingsCore.resolveValue('stockfish-19', curve, { moveNumber: 20 }) === 'stockfish-19', 'Saved default choice does not restore the base engine');
});

test('Dropdown curves preserve empty-string choices and fall back for invalid choices', () => {
    const curve = { enabled: true, variable: 'pieceCount', values: [null, '', 'Some value'], points: [{ x: 1, y: 1 }] };
    assert(DynamicSettingsCore.resolveValue('default', curve, { pieceCount: 1 }) === '', 'Empty categorical value was treated as missing');
    assert(DynamicSettingsCore.resolveValue('default', { ...curve, values: [] }, { pieceCount: 1 }) === 'default', 'Empty choices did not fall back');
});

test('Engine curves reset at game start, outside their drawn range, and without a line', () => {
    const curve = { enabled: true, resetAtStart: true, outsideRange: 'default', variable: 'moveNumber',
        values: [null, 'lozza-9'], points: [{ x: 1, y: 1 }, { x: 20, y: 1 }] };
    const resolve = context => DynamicSettingsCore.resolveValue('maia3', curve, context);
    assert(resolve({ moveNumber: 1 }) === 'maia3', 'Initial position did not use default engine');
    assert(resolve({ moveNumber: 10, gameStart: 1 }) === 'maia3', 'Explicit new match did not reset engine');
    assert(resolve({ moveNumber: 10 }) === 'lozza-9', 'Mid-game engine override failed');
    assert(resolve({ moveNumber: 21 }) === 'maia3', 'Engine persisted after its range ended');
    assert(DynamicSettingsCore.resolveValue('maia3', { ...curve, points: [] }, { moveNumber: 10 }) === 'maia3', 'Empty line did not restore engine');
    assert(DynamicSettingsCore.resolveValue('maia3', null, { moveNumber: 10 }) === 'maia3', 'Removed line did not restore engine');
});

test('Finite numeric ranges restore ELO before and after the curve, including takebacks', () => {
    const curve = { enabled: true, variable: 'pieceCount', outsideRange: 'default', interpolation: 'linear',
        minY: 600, maxY: 3200, points: [{ x: 10, y: 1000 }, { x: 20, y: 2000 }] };
    [9, 21, 32].forEach(pieceCount => close(DynamicSettingsCore.resolveValue(1500, curve, { pieceCount }), 1500));
    close(DynamicSettingsCore.resolveValue(1500, curve, { pieceCount: 10 }), 1000);
    close(DynamicSettingsCore.resolveValue(1500, curve, { pieceCount: 20 }), 2000);
});

test('Multiple instance contexts remain isolated and closed-instance markers are removable', () => {
    DynamicSettingsCore.setContext('test-A', { pieceCount: 32, moveNumber: 1 });
    DynamicSettingsCore.setContext('test-B', { pieceCount: 12, moveNumber: 30, evaluation: 0 });
    const curve = { enabled: true, variable: 'pieceCount', points: [{ x: 12, y: 1000 }, { x: 32, y: 2000 }] };
    close(DynamicSettingsCore.resolveValue(1500, curve, DynamicSettingsCore.getContext('test-A')), 2000);
    close(DynamicSettingsCore.resolveValue(1500, curve, DynamicSettingsCore.getContext('test-B')), 1000);
    const entries = DynamicSettingsCore.getContexts();
    assert(entries.some(item => item.instanceID === 'test-A') && entries.some(item => item.instanceID === 'test-B'), 'One instance marker replaced another');
    entries.find(item => item.instanceID === 'test-A').context.pieceCount = 0;
    close(DynamicSettingsCore.getContext('test-A').pieceCount, 32);
    DynamicSettingsCore.removeContext('test-A');
    DynamicSettingsCore.removeContext('test-B');
    assert(!DynamicSettingsCore.getContexts().some(item => item.instanceID.startsWith('test-')), 'Closed instance retains a marker');
});

test('Dropdown definitions have human-readable labels and a distinct saved-default choice', () => {
    const container = document.createElement('div');
    container.className = 'dropdown-input';
    container.innerHTML = '<input additional-type="dropdown" data-key="chessEngine"><div class="dropdown-item" data-value="maia3">Maia 3 <span>WASM</span></div><div class="dropdown-item" data-value="lozza-9">Lozza 9</div><div class="dropdown-item force-hidden" data-value="broken">Broken</div><div class="dropdown-item requires-sab" data-value="unavailable">Unavailable</div>';
    const definition = describeSettingInput(container.querySelector('input'), () => null);
    assert(definition.categorical && definition.values.join('|') === '|maia3|lozza-9', 'Hidden/unsupported choices leaked into graph');
    assert(definition.labels.join('|') === 'Saved default|Maia 3|Lozza 9', 'Labels contain metadata or lost default');
    container.querySelector('input').dataset.noProfile = 'true';
    assert(describeSettingInput(container.querySelector('input'), () => null) === null, 'Non-profile dropdown is offered');
});

test('Reordering dropdown items and comparing profiles cannot change the meaning of saved points', () => {
    const definition = { categorical: true, values: [null, 'new', 'old'], labels: ['Saved default', 'New', 'Old'] };
    const old = { values: [null, 'old'], points: [{ x: 10, y: 1 }] };
    const extended = categoricalCurveDefinition(definition, old);
    assert(extended.values[1] === 'old' && extended.labels[1] === 'Old', 'Persisted dropdown indices changed');
    const lines = [{ curve: structuredClone(old) }, { curve: { values: [null, 'new', 'old'], points: [{ x: 10, y: 2 }] } }];
    alignCategoricalCurves(lines, definition);
    assert(lines.every(line => line.curve.values[line.curve.points[0].y] === 'old'), 'Profiles use different Y meanings');
});

test('Effective setting diffs include defaults restored by graph deletion and preserve false/zero', () => {
    const keys = ['chessEngine', 'engineElo', 'engineEnabled', 'engineNodes'];
    const previous = { chessEngine: 'lozza-9', engineElo: 2000, engineEnabled: true, engineNodes: 100 };
    const current = { chessEngine: 'maia3', engineElo: 1500, engineEnabled: false, engineNodes: 0 };
    assert(changedSettingKeys(previous, current, keys).length === 4, 'Restored defaults or false/zero were skipped');
    assert(changedSettingKeys(current, current, keys).length === 0, 'Unchanged settings are repeatedly applied');
    assert(changedSettingKeys(current, current, keys, ['engineElo'])[0] === 'engineElo', 'Forced graph edit is ignored');
});

test('Default dropdown levels are described as defaults rather than active overrides', () => {
    const curve = { enabled: true, variable: 'moveNumber', values: [null, 'lozza-9'], points: [{ x: 2, y: 0 }] };
    const state = describeDynamicSetting(DynamicSettingsCore, 'maia3', curve, { moveNumber: 10 }, 'Chess Engine');
    assert(state.enabled && !state.overridden && state.effectiveValue === 'maia3', 'Saved default is shown as an override');
    assert(state.description.includes('saved default here'), 'Default choice explanation missing');
});

await testAsync('Runtime synchronization applies per-instance values, reloads engines, and restores defaults', async () => {
    const original = window.GET_PROFILES;
    let profiles = [{ name: 'default', config: { engineEnabled: true, chessEngine: 'maia3', engineElo: 1500 } }];
    const reads = [], applied = [], reloads = [];
    window.GET_PROFILES = async id => { reads.push(id); return structuredClone(profiles); };
    const instance = {
        instanceID: 'test-runtime', configKeys: { engineElo: 'engineElo', chessEngine: 'chessEngine' },
        pV: { default: { engineSettingsReady: true } }, effectiveSettings: new Map([['default', structuredClone(profiles[0].config)]]),
        updateSettings: async message => { applied.push(message.data); },
        killEngine: name => { delete instance.pV[name]; },
        createAndLoadSpecificEngine: async name => { reloads.push(name); instance.pV[name] = { engineSettingsReady: true }; }
    };
    try {
        profiles[0].config.engineElo = 1900;
        await syncDynamicSettings.call(instance);
        assert(applied.length === 1 && applied[0].key === 'engineElo' && applied[0].value === 1900, 'ELO was not applied');
        profiles[0].config.chessEngine = 'lozza-9';
        await syncDynamicSettings.call(instance);
        assert(reloads.length === 1, 'Engine dropdown did not reload the worker');
        profiles[0].config.chessEngine = 'maia3';
        profiles[0].config.engineElo = 1500;
        await syncDynamicSettings.call(instance);
        assert(reloads.length === 2, 'Deleting engine curve did not restore worker');
        await syncDynamicSettings.call(instance);
        assert(reloads.length === 2, 'Unchanged engine repeatedly reloads');
        profiles[0].config.engineEnabled = false;
        await syncDynamicSettings.call(instance);
        assert(!instance.pV.default, 'Disabled engine was not stopped');
        profiles[0].config.engineEnabled = true;
        await syncDynamicSettings.call(instance);
        assert(instance.pV.default && reloads.length === 3, 'Engine was not re-enabled');
        assert(reads.every(id => id === 'test-runtime'), 'Runtime consulted GUI instance filter');
    } finally { window.GET_PROFILES = original; }
});

await testAsync('Concurrent instances have independent synchronization queues and ELO applications', async () => {
    const original = window.GET_PROFILES;
    const applied = [];
    window.GET_PROFILES = async id => [{ name: 'default', config: { engineEnabled: true, chessEngine: 'maia3', engineElo: id === 'A' ? 1000 : 2000 } }];
    const make = instanceID => ({ instanceID, configKeys: { engineElo: 'engineElo' },
        pV: { default: { engineSettingsReady: true } },
        effectiveSettings: new Map([['default', { engineEnabled: true, chessEngine: 'maia3', engineElo: 1500 }]]),
        updateSettings: async message => { applied.push([instanceID, message.data.value]); }, killEngine: () => {} });
    try {
        await Promise.all([syncDynamicSettings.call(make('A')), syncDynamicSettings.call(make('B'))]);
        assert(applied.some(([id, value]) => id === 'A' && value === 1000), 'Instance A lost its own ELO');
        assert(applied.some(([id, value]) => id === 'B' && value === 2000), 'Instance B lost its own ELO');
    } finally { window.GET_PROFILES = original; }
});

await testAsync('Runtime logs dynamic effective-value changes once with the owning instance/profile', async () => {
    const original = window.GET_PROFILES;
    const previous = { engineEnabled: true, chessEngine: 'maia3', engineElo: 1500,
        dynamicSettings: { engineElo: { enabled: true, variable: 'pieceCount', points: [{ x: 10, y: 1900 }] } } };
    const current = { ...previous, engineElo: 1900 };
    window.GET_PROFILES = async () => [{ name: 'default', config: current }];
    const instance = {
        instanceID: 'test-log-runtime', configKeys: { engineElo: 'engineElo' },
        pV: { default: { engineSettingsReady: true } },
        effectiveSettings: new Map([['default', structuredClone(previous)]]),
        updateSettings: async () => {}, killEngine: () => {}
    };
    try {
        const before = activityLog.getEntries().at(-1)?.id ?? 0;
        await syncDynamicSettings.call(instance);
        await syncDynamicSettings.call(instance);
        const changes = activityLog.getEntries().filter(entry => entry.id > before && entry.instanceID === instance.instanceID);
        assert(changes.length === 1 && changes[0].type === 'dynamic-change', 'Unchanged synchronization repeats logs');
        assert(changes[0].profile === 'default' && changes[0].message === 'engineElo: 1500 → 1900', 'Runtime context/values are wrong');
    } finally { window.GET_PROFILES = original; }
});

await testAsync('The setting application path calls the ELO, depth, nodes, MultiPV, and UCI handlers', async () => {
    const original = window.GET_PROFILES;
    const originalFormatVariant = window.FORMAT_VARIANT;
    window.FORMAT_VARIANT = value => value || 'chess';
    const config = { engineEnabled: true, chessEngine: 'maia3', chessVariant: 'chess', engineElo: 1900,
        advancedEloDepth: 35, engineNodes: 0, moveSuggestionAmount: 4 };
    window.GET_PROFILES = async () => [{ name: 'default', config }];
    const calls = [];
    const instance = { instanceID: 'application-test', pV: { default: { usingAdvancedMode: false, searchDepth: 12, engineNodes: 100 } },
        configKeys: Object.fromEntries(Object.keys(config).concat('engineEnemyElo', 'useChess960', 'lc0Weight', 'chessFont', 'chessEngineProfile', 'enableAdvancedElo').map(key => [key, key])),
        getConfigValue: async key => config[key], getEngineName: async () => 'maia3', killEngine: () => {},
        setEngineElo: async (...args) => calls.push(['elo', ...args]),
        setEngineMultiPV: (...args) => calls.push(['multiPV', ...args]),
        applyDynamicOption: async (...args) => calls.push(['uci', ...args]) };
    const apply = key => updateSettings.call(instance, { data: { key, value: config[key], profile: { name: 'default' }, isDynamicChange: true, isDirectlyCausedByUser: false } });
    try {
        await apply('engineElo');
        assert(calls.some(call => call[0] === 'elo' && call[1] === 1900 && call[3] === 'default'), 'ELO setter was not invoked');
        await apply('moveSuggestionAmount');
        assert(calls.some(call => call[0] === 'multiPV' && call[1] === 4 && call[3] === true), 'MultiPV setter was not invoked');
        instance.pV.default.usingAdvancedMode = true;
        await apply('advancedEloDepth');
        await apply('engineNodes');
        close(instance.pV.default.searchDepth, 35);
        close(instance.pV.default.engineNodes, 0);
        await updateSettings.call(instance, { data: { key: 'DYNAMIC_maia3_UCI-Elo', value: 1800, profile: { name: 'default' }, isDynamicChange: true } });
        assert(calls.some(call => call[0] === 'uci' && call[2] === 1800 && call[4] === true), 'Graph UCI option was ignored because it was not a manual input change');
    } finally { window.GET_PROFILES = original; window.FORMAT_VARIANT = originalFormatVariant; }
});

await testAsync('Applied-value logging waits for the setter and records clamping instead of the requested value', async () => {
    const original = window.GET_PROFILES;
    const current = { engineEnabled: true, engineElo: 3000, dynamicSettings: { engineElo: { enabled: true } } };
    const instance = { instanceID: 'applied-log-test', configKeys: { engineElo: 'engineElo' },
        pV: { default: { engineSettingsReady: true } },
        effectiveSettings: new Map([['default', { ...current, engineElo: 1500 }]]), killEngine: () => {},
        updateSettings: async message => {
            assert(instance.applyingSettings.get('default').engineElo === message.data.value, 'Setter reads another snapshot');
            assert(!activityLog.getEntries().some(entry => entry.instanceID === instance.instanceID), 'Change logged before application');
            return { appliedValue: 2600 };
        } };
    window.GET_PROFILES = async () => [{ name: 'default', config: current }];
    try {
        await syncDynamicSettings.call(instance);
        const entries = activityLog.getEntries().filter(entry => entry.instanceID === instance.instanceID);
        assert(entries.length === 1 && entries[0].message === 'engineElo: 1500 → 2600 (requested 3000)', 'Log does not reflect the applied value');
        assert(instance.appliedSettingValues.get('default').engineElo === 2600, 'Applied cache kept the requested value');
        assert(instance.applyingSettings.size === 0, 'Snapshot remains pinned after application');
    } finally { window.GET_PROFILES = original; }
});

await testAsync('Rejected setting applications never produce a successful dynamic-change entry', async () => {
    const original = window.GET_PROFILES;
    const current = { engineEnabled: true, engineElo: 1900, dynamicSettings: { engineElo: { enabled: true } } };
    const instance = { instanceID: 'rejected-log-test', configKeys: { engineElo: 'engineElo' },
        pV: { default: { engineSettingsReady: true } },
        effectiveSettings: new Map([['default', { ...current, engineElo: 1500 }]]),
        updateSettings: async () => false, killEngine: () => {} };
    window.GET_PROFILES = async () => [{ name: 'default', config: current }];
    try {
        await syncDynamicSettings.call(instance);
        assert(!activityLog.getEntries().some(entry => entry.instanceID === instance.instanceID), 'Rejected change logged as applied');
    } finally { window.GET_PROFILES = original; }
});

test('Worker reload logs are deferred until readiness and include engine identity and actual startup values', () => {
    const previous = { chessEngine: 'maia3', engineElo: 1500 };
    const current = { chessEngine: 'lozza-9', engineElo: 3000,
        dynamicSettings: { chessEngine: { enabled: true }, engineElo: { enabled: true } } };
    const instance = { instanceID: 'startup-log-test', pV: { default: { engineSettingsReady: false } },
        pendingDynamicSettingChanges: new Map([['default', { previous, current, keys: ['chessEngine', 'engineElo'] }]]) };
    finishPendingSettingChanges(instance, 'default');
    assert(!activityLog.getEntries().some(entry => entry.instanceID === instance.instanceID), 'Worker was logged before ready');
    instance.pV.default.engineSettingsReady = true;
    instance.pV.default.appliedSettings = { engineElo: 2600 };
    finishPendingSettingChanges(instance, 'default');
    finishPendingSettingChanges(instance, 'default');
    const entries = activityLog.getEntries().filter(entry => entry.instanceID === instance.instanceID);
    assert(entries.length === 2 && entries.some(entry => entry.message === 'chessEngine: maia3 → lozza-9'), 'Engine identity missing or duplicated');
    assert(entries.some(entry => entry.message === 'engineElo: 1500 → 2600 (requested 3000)'), 'Startup clamping missing');
    assert(instance.pendingDynamicSettingChanges.size === 0, 'Completed logs remain pending');
});

await testAsync('Dropdown engine and variant updates are accepted as dynamic rather than only manual changes', async () => {
    const original = window.GET_PROFILES;
    const config = { engineEnabled: true, chessEngine: 'lozza-9', chessVariant: 'atomic', useChess960: false };
    const variables = { chessVariant: 'chess', useChess960: false };
    const calls = [];
    const instance = { instanceID: 'dropdown-update-test', pV: { default: variables },
        configKeys: Object.fromEntries(Object.keys(config).map(key => [key, key])), getConfigValue: async key => config[key],
        createAndLoadSpecificEngine: async profile => calls.push(['reload', profile]),
        set960Mode: (value, profile, dynamic) => calls.push(['960', value, profile, dynamic]),
        engineStartNewGame: async (variant, profile, dynamic) => { variables.chessVariant = variant; calls.push(['variant', variant, profile, dynamic]); },
        killEngine: () => {} };
    window.GET_PROFILES = async () => [{ name: 'default', config }];
    const update = key => updateSettings.call(instance, { data: { key, value: config[key], profile: { name: 'default' }, isDynamicChange: true } });
    try {
        await update('chessEngine');
        const variant = await update('chessVariant');
        assert(calls.some(call => call[0] === 'reload' && call[1] === 'default'), 'Dynamic engine dropdown cannot reload');
        assert(calls.some(call => call[0] === 'variant' && call[1] === 'atomic' && call[3] === true), 'Dynamic variant cannot update');
        assert(variant.appliedValue === 'atomic', 'Variant result does not report its actual value');
    } finally { window.GET_PROFILES = original; }
});

await testAsync('UCI option readiness and metadata are isolated for instances sharing a profile', async () => {
    const profile = 'readiness-test';
    const key = 'DYNAMIC_maia3_MultiPV';
    resetDynamicOptionsReady(profile, 'A');
    resetDynamicOptionsReady(profile, 'B');
    setDynamicOption(key, { name: 'MultiPV', defaultValue: 1 }, profile, 'A');
    setDynamicOption(key, { name: 'MultiPV', defaultValue: 3 }, profile, 'B');
    const readyA = onDynamicOptionsReady(profile, 1000, 'A');
    let resolvedB = false;
    const readyB = onDynamicOptionsReady(profile, 1000, 'B').then(() => { resolvedB = true; });
    try {
        setDynamicOptionsReady(profile, 'A');
        await readyA;
        assert(!resolvedB, 'Instance A released instance B startup');
        assert(getDynamicOption(key, profile, 'A').defaultValue === 1, 'A metadata was replaced by B');
        assert(getDynamicOption(key, profile, 'B').defaultValue === 3, 'B metadata was replaced by A');
    } finally {
        setDynamicOptionsReady(profile, 'B');
        await readyB;
        resetDynamicOptionsReady(profile, 'A');
        resetDynamicOptionsReady(profile, 'B');
    }
});

await testAsync('Rejected UCI options cannot change the active engine cache', async () => {
    const profile = 'uci-application-test';
    const instanceID = 'uci-instance';
    const calls = [];
    const variables = { useExternalChessEngine: false, multiPV: 2, useChess960: false };
    const instance = { instanceID, pV: { [profile]: variables }, getEngineName: async () => 'maia3',
        setEngineOption: (...args) => calls.push(args) };
    const register = (engine, name, defaultValue) => {
        const key = `DYNAMIC_${engine}_${name.replaceAll(' ', '-')}`;
        setDynamicOption(key, { name, defaultValue }, profile, instanceID);
        return key;
    };
    const oldMultiPV = register('lozza-9', 'MultiPV', 1);
    const old960 = register('lozza-9', 'UCI_Chess960', false);
    assert(!await applyDynamicOption.call(instance, oldMultiPV, 9, profile, true), 'Old engine option was sent');
    assert(!await applyDynamicOption.call(instance, old960, true, profile, true), 'Old engine Chess960 was sent');
    assert(variables.multiPV === 2 && variables.useChess960 === false, 'Rejected option corrupted the active cache');
    const multiPV = register('maia3', 'MultiPV', 1);
    assert(!await applyDynamicOption.call(instance, multiPV, null, profile, true), 'Missing dropdown choice was sent');
    assert(variables.multiPV === 2, 'Missing choice corrupted the cache');
    assert(await applyDynamicOption.call(instance, multiPV, 4, profile, true), 'Current engine option was not sent');
    assert(variables.multiPV === 4 && calls.at(-1)[1] === 4, 'MultiPV did not reach cache and setter');
    assert(await applyDynamicOption.call(instance, multiPV, 1, profile, true), 'Restoring UCI default was skipped');
    assert(variables.multiPV === 1, 'Restoring UCI default left stale cache');
    const combo = register('maia3', 'Style', 'Normal');
    await applyDynamicOption.call(instance, combo, 'Very Aggressive', profile, true);
    assert(calls.at(-1)[1] === 'Very Aggressive', 'Dropdown spaces were altered');
    const chess960 = register('maia3', 'UCI_Chess960', false);
    await applyDynamicOption.call(instance, chess960, true, profile, true);
    await applyDynamicOption.call(instance, chess960, false, profile, true);
    assert(variables.useChess960 === false && calls.at(-1)[1] === false, 'False default was not restored');
    const variant = register('maia3', 'UCI_Variant', 'chess');
    await applyDynamicOption.call(instance, variant, 'Atomic', profile, true);
    assert(variables.chessVariant === 'atomic' && calls.at(-1)[1] === 'Atomic', 'UCI variant did not update the search cache');
    await applyDynamicOption.call(instance, variant, 'chess', profile, true);
    assert(variables.chessVariant === 'chess', 'UCI variant default did not restore the cache');
    setDynamicOption(multiPV, { name: 'MultiPV', defaultValue: 1, type: 'spin', min: 1, max: 5 }, profile, instanceID);
    await applyDynamicOption.call(instance, multiPV, 100, profile, true);
    assert(calls.at(-1)[1] === 5 && variables.multiPV === 5 && variables.appliedSettings[multiPV] === 5, 'Loaded option bounds ignored');
    await applyDynamicOption.call(instance, multiPV, 1, profile, true);
    setDynamicOption(combo, { name: 'Style', defaultValue: 'Normal', type: 'combo', vars: ['Normal', 'Very Aggressive'] }, profile, instanceID);
    const beforeInvalidCombo = calls.length;
    assert(!await applyDynamicOption.call(instance, combo, 'Missing', profile, true) && calls.length === beforeInvalidCombo, 'Unavailable combo sent to engine');
    instance.getEngineName = async () => { instance.pV[profile] = {}; return 'maia3'; };
    const sent = calls.length;
    assert(!await applyDynamicOption.call(instance, multiPV, 8, profile, true), 'Stale profile option was accepted');
    assert(calls.length === sent && variables.multiPV === 1, 'Replaced profile was modified');
});

await testAsync('Advanced startup applies graphed settings, then engine-specific UCI overrides', async () => {
    const originalProfile = window.GET_PROFILE_FOR_INSTANCE;
    const originalSavedOptions = window.GET_GM_VALUES_STARTS_WITH;
    const originalFormatVariant = window.FORMAT_VARIANT;
    const profile = 'advanced-startup-test', instanceID = 'advanced-startup-instance';
    const config = { enableAdvancedElo: true, advancedEloDepth: 24, engineNodes: 0, useExternalChessEngine: false,
        moveSuggestionAmount: 5, chessVariant: 'atomic', useChess960: true,
        DYNAMIC_maia3_MultiPV: 7,
        dynamicSettings: { moveSuggestionAmount: { enabled: true }, chessVariant: { enabled: true },
            useChess960: { enabled: true }, DYNAMIC_maia3_MultiPV: { enabled: true } } };
    const calls = [];
    const variables = { chessVariant: 'atomic', useChess960: true };
    const instance = { instanceID, pV: { [profile]: variables },
        configKeys: Object.fromEntries(Object.keys(config).map(key => [key, key])),
        getConfigValue: async key => config[key], getEngineName: async () => 'maia3',
        Interface: { clearOpeningText: () => {} }, clearHistoryVariables: () => {}, isEngineCalculating: () => false,
        sendMsgToEngine: message => { if(message === 'uci') setDynamicOptionsReady(profile, instanceID); },
        setEngineMultiPV: (...args) => calls.push(['multiPV', ...args]),
        setEngineVariant: async (variant, name, dynamic) => { variables.chessVariant = variant; calls.push(['variant', variant, name, dynamic]); },
        set960Mode: (...args) => calls.push(['960', ...args]),
        applyDynamicOption: async (...args) => calls.push(['uci', ...args]) };
    window.GET_PROFILE_FOR_INSTANCE = async () => ({ name: profile, config });
    window.GET_GM_VALUES_STARTS_WITH = async () => ({});
    window.FORMAT_VARIANT = value => value;
    try {
        await engineStartNewGame.call(instance, 'atomic', profile);
        assert(calls.some(call => call[0] === 'multiPV' && call[1] === 5 && call[3] === true), 'Advanced startup suppressed graph MultiPV');
        assert(calls.some(call => call[0] === 'variant' && call[1] === 'atomic' && call[3] === true), 'Advanced startup suppressed graph variant');
        assert(calls.some(call => call[0] === '960' && call[1] === true && call[3] === true), 'Advanced startup suppressed graph Chess960');
        assert(calls.at(-1)[0] === 'uci' && calls.at(-1)[2] === 7, 'Engine-specific UCI curve did not have final precedence');
        assert(variables.engineSettingsReady && variables.searchDepth === 24 && variables.engineNodes === 0, 'Advanced search cache was not initialized');
        calls.length = 0;
        config.dynamicSettings = {};
        config.chessVariant = 'chess';
        variables.useChess960 = false;
        await engineStartNewGame.call(instance, 'chess', profile, true);
        assert(calls.some(call => call[0] === 'variant' && call[1] === 'chess' && call[3] === true), 'Deleting variant curve did not restore its default');
        assert(calls.some(call => call[0] === '960' && call[1] === false && call[3] === true), 'Deleting Chess960 curve did not restore false');
    } finally {
        window.GET_PROFILE_FOR_INSTANCE = originalProfile;
        window.GET_GM_VALUES_STARTS_WITH = originalSavedOptions;
        window.FORMAT_VARIANT = originalFormatVariant;
        resetDynamicOptionsReady(profile, instanceID);
    }
});

test('Cursor-centered zoom preserves the value underneath every cursor position', () => {
    [0, 0.1, 0.5, 0.85, 1].forEach(anchor => {
        const axis = { start: 0.2, span: 0.6 };
        const zoomed = zoomAxis(axis, 1.8, anchor);
        close(axis.start + anchor * axis.span, zoomed.start + anchor * zoomed.span);
    });
});

test('Zooming beyond the full setting range still preserves the cursor anchor', () => {
    const axis = { start: 0.4, span: 0.2 };
    const zoomed = zoomAxis(axis, 0.1, 0.8);
    close(zoomed.span, 2);
    close(axis.start + 0.8 * axis.span, zoomed.start + 0.8 * zoomed.span);
});

test('Zoom limits permit 16× zoom-out and 64× zoom-in', () => {
    close(zoomAxis({ start: 0, span: 1 }, 1e6, 0.5).span, 1 / 64);
    close(zoomAxis({ start: 0, span: 0.5 }, 1e-6, 0.5).span, 16);
});

test('The cursor value stays fixed when zoom-out reaches its extended limit', () => {
    [0, 0.2, 0.5, 1].forEach(anchor => {
        const original = { start: -3, span: 12 };
        const zoomed = zoomAxis(original, 0.01, anchor);
        close(zoomed.span, 16);
        close(original.start + anchor * original.span, zoomed.start + anchor * zoomed.span);
    });
});

test('Panning X does not change Y and works without zooming first', () => {
    const view = createViewport();
    view.x = panAxis(view.x, 0.25);
    close(view.x.start, -0.25);
    close(view.y.start, 0);
    close(view.y.span, 1);
});

test('Panning Y is independent of X and retains fractional movement', () => {
    const view = createViewport();
    view.y = panAxis(zoomAxis(view.y, 4, 0.5), -0.2);
    close(view.y.start, 0.425);
    close(view.x.start, 0);
    close(view.x.span, 1);
});

test('Pinch zoom plus centroid movement keeps content under the fingers on both axes', () => {
    ['x', 'y'].forEach((axis, index) => {
        const original = createViewport()[axis];
        const before = index === 0 ? 0.3 : 0.8;
        const after = index === 0 ? 0.45 : 0.65;
        const zoomed = zoomAxis(original, 2, before);
        const panned = panAxis(zoomed, after - before);
        close(original.start + before * original.span, panned.start + after * panned.span);
    });
});

test('Setting domains display actual depth values, not normalized percentages', () => {
    const fitted = axisDomain(createViewport().y, 1, 500);
    close(fitted.min, 1);
    close(fitted.max, 500);
    const zoomed = axisDomain(zoomAxis(createViewport().y, 2, 0.5), 1, 500);
    close(zoomed.min, 125.75);
    close(zoomed.max, 375.25);
});

test('Ticks cover depth, negative evaluations, decimals and boolean ranges', () => {
    assert(tickValues(1, 500, 5).join(',') === '100,200,300,400,500', 'Wrong depth ticks');
    assert(tickValues(-1000, 1000).includes(0), 'Missing evaluation zero');
    assert(tickValues(0.1, 0.5).every(Number.isFinite), 'Invalid decimal ticks');
    assert(tickValues(0, 1).includes(1), 'Missing boolean maximum');
    assert(tickValues(3, 3).length === 0, 'Degenerate range must be empty');
});

test('Numeric labels remain readable and do not introduce floating-point noise', () => {
    assert(formatTick(0.30000000000000004) === '0.3', 'Noisy decimal tick');
    assert(formatTick(500) === '500', 'Wrong depth label');
    assert(formatTick(99999999).length < 10, 'Large tick label is too wide');
});

test('Moving a point retains its selection and cannot merge or cross neighbors', () => {
    const points = [{ x: 0, y: 1 }, { x: 20, y: 2 }, { x: 40, y: 3 }];
    const selected = points[1];
    const index = moveCurvePoint(points, 1, 40, 10, 0, 64);
    assert(points[index] === selected, 'Selected point identity changed');
    assert(points[1].x < points[2].x, 'Points merged or crossed');
    close(points[1].x, 39);
    assert(DynamicSettingsCore.normalizePoints(points).length === 3, 'Normalization lost a point');
    close(points[1].y, 10);
});

test('First-point X and Y changes survive cloning and normalization', () => {
    const points = [{ x: 0, y: 1 }, { x: 64, y: 500 }];
    moveCurvePoint(points, 0, 10, 25, 0, 64);
    const reopened = DynamicSettingsCore.normalizePoints(structuredClone(points));
    close(reopened[0].x, 10);
    close(reopened[0].y, 25);
});

test('Invalid point coordinates do not corrupt an existing point', () => {
    const points = [{ x: 10, y: 25 }];
    moveCurvePoint(points, 0, NaN, 50, 0, 64);
    moveCurvePoint(points, 0, 20, Infinity, 0, 64);
    close(points[0].x, 10);
    close(points[0].y, 25);
});

test('Time remaining is unavailable and legacy curves safely fall back to the base setting', () => {
    assert(!('timeRemaining' in DynamicSettingsCore.variables), 'Unsupported variable is still exposed');
    const curve = { enabled: true, variable: 'timeRemaining', points: [{ x: 0, y: 500 }] };
    close(DynamicSettingsCore.resolveValue(25, curve, { timeRemaining: 100 }), 25);
});

test('Numeric and boolean curves still resolve through the shared settings core', () => {
    const curve = { enabled: true, variable: 'pieceCount', interpolation: 'linear', minY: 1, maxY: 500,
        points: [{ x: 0, y: 1 }, { x: 32, y: 499 }] };
    close(DynamicSettingsCore.resolveValue(1, curve, { pieceCount: 16 }), 250);
    const booleanCurve = { ...curve, minY: 0, maxY: 1, points: [{ x: 0, y: 0 }, { x: 32, y: 1 }] };
    assert(DynamicSettingsCore.resolveValue(false, booleanCurve, { pieceCount: 32 }) === true, 'Boolean curve did not resolve');
});

test('Dragging and coordinate edits snap both axes to the nearest integer', () => {
    const points = [{ x: 0, y: 1 }, { x: 20, y: 10 }, { x: 64, y: 500 }];
    moveCurvePoint(points, 1, 24.6, 19.7, 0, 64);
    close(points[1].x, 25);
    close(points[1].y, 20);
    moveCurvePoint(points, 1, 24.2, 19.2, 0, 64);
    close(points[1].x, 24);
    close(points[1].y, 19);
});

test('Adjacent integer points cannot be merged by dragging or rounded input', () => {
    const points = [{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }];
    moveCurvePoint(points, 1, 1.7, 8.6, 0, 64);
    close(points[1].x, 1);
    close(points[1].y, 9);
    assert(points.every(point => Number.isInteger(point.x) && Number.isInteger(point.y)), 'Decimal coordinate introduced');
    assert(DynamicSettingsCore.normalizePoints(points).length === 3, 'A neighboring point disappeared');
});

test('Legacy decimal coordinates round and deduplicate deterministically', () => {
    const points = DynamicSettingsCore.normalizePoints([{ x: 1.2, y: 10.6 }, { x: 1.4, y: 20.2 }, { x: -2.8, y: -3.8 }]);
    assert(points.length === 2, 'Rounded X duplicates were not merged');
    close(points[0].x, -3);
    close(points[0].y, -4);
    close(points[1].x, 1);
    close(points[1].y, 20);
});

test('Point insertion finds an unoccupied integer, including the last available slot', () => {
    close(insertionX([{ x: 0 }, { x: 64 }], 0, 64), 32);
    close(insertionX([{ x: 0 }, { x: 1 }, { x: 3 }], 0, 3), 2);
    close(insertionX([{ x: 0 }, { x: 2 }], 0.4, 1.8), 1);
    assert(insertionX([{ x: 0 }, { x: 1 }], 0, 1) === null, 'Saturated range must not insert a duplicate');
    assert(insertionX([], 0.2, 0.8) === null, 'Range without integers must not insert decimals');
});

test('Smooth graph previews remain fractional while runtime values round', () => {
    const curve = { enabled: true, variable: 'pieceCount', interpolation: 'smooth', minY: 0, maxY: 100,
        points: [{ x: 0, y: 0 }, { x: 10, y: 9 }] };
    close(DynamicSettingsCore.evaluateCurve(curve, 5), 4.5);
    close(DynamicSettingsCore.resolveValue(0.2, curve, { pieceCount: 5 }), 5);
    assert(Number.isInteger(DynamicSettingsCore.resolveValue(0.2, curve, { pieceCount: 4 })), 'Runtime value is fractional');
});

test('Graph fallbacks round but ordinary non-graph decimal settings are unchanged', () => {
    close(DynamicSettingsCore.resolveValue(3.7, { enabled: false }, {}), 4);
    close(DynamicSettingsCore.resolveValue(3.7, { enabled: true, variable: 'pieceCount', points: [] }, {}), 4);
    close(DynamicSettingsCore.resolveValue(3.7, undefined, {}), 3.7);
});

test('Boolean curves are forced to Step with values limited to 0 and 1', () => {
    const curve = { enabled: true, boolean: true, variable: 'pieceCount', interpolation: 'smooth', minY: -50, maxY: 50,
        points: [{ x: 0, y: -5 }, { x: 10, y: 3 }, { x: 20, y: 0.4 }] };
    const normalized = DynamicSettingsCore.normalizeCurve(curve);
    assert(normalized.interpolation === 'step', 'Boolean interpolation is not locked');
    close(normalized.minY, 0);
    close(normalized.maxY, 1);
    assert(normalized.points.every(point => point.y === 0 || point.y === 1), 'Boolean coordinate outside 0/1');
    close(DynamicSettingsCore.evaluateCurve(curve, 9.9), 0);
    close(DynamicSettingsCore.evaluateCurve(curve, 10), 1);
    close(DynamicSettingsCore.evaluateCurve(curve, 20), 0);
});

test('Legacy boolean curves resolve as steps even without stored boolean metadata', () => {
    const curve = { enabled: true, variable: 'pieceCount', interpolation: 'linear', points: [{ x: 0, y: 0 }, { x: 10, y: 1 }, { x: 20, y: 0 }] };
    assert(DynamicSettingsCore.resolveValue(false, curve, { pieceCount: 9 }) === false, 'Boolean line interpolated before its transition');
    assert(DynamicSettingsCore.resolveValue(false, curve, { pieceCount: 10 }) === true, 'Boolean step did not change at its exact X');
    assert(DynamicSettingsCore.resolveValue(false, curve, { pieceCount: 19 }) === true, 'Boolean line interpolated before its next transition');
});

test('Step interpolation uses the exact value at an interior point', () => {
    const curve = { enabled: true, interpolation: 'step', points: [{ x: 0, y: 5 }, { x: 10, y: 25 }, { x: 20, y: 1 }] };
    close(DynamicSettingsCore.evaluateCurve(curve, 9.9), 5);
    close(DynamicSettingsCore.evaluateCurve(curve, 10), 25);
    close(DynamicSettingsCore.evaluateCurve(curve, 19.9), 25);
});

test('Axis modifiers use Shift for X and Ctrl / Command for Y, with both axes otherwise', () => {
    assert(modifierAxes({ shiftKey: true }).join(',') === 'x', 'Shift should zoom/pan X');
    assert(modifierAxes({ ctrlKey: true }).join(',') === 'y', 'Ctrl should zoom/pan Y');
    assert(modifierAxes({ metaKey: true }).join(',') === 'y', 'Command should zoom/pan Y');
    assert(modifierAxes({}).join(',') === 'x,y', 'Unmodified input should transform both axes');
    assert(modifierAxes({ shiftKey: true, ctrlKey: true }).join(',') === 'x,y', 'Combined modifiers should transform both axes');
});

test('Integer-only graph ticks do not imply fractional boolean or point coordinates', () => {
    assert(tickValues(0, 1, 5, true).join(',') === '0,1', 'Boolean ticks must be 0/1');
    assert(tickValues(-4.4, 6.6, 6, true).every(Number.isInteger), 'Decimal axis tick introduced');
    assert(tickValues(0.1, 0.9, 5, true).length === 0, 'Subinteger viewport must not show decimal ticks');
});

test('Fit keeps both endpoint handles inside the plot on both axes', () => {
    [false, true].forEach(boolean => {
        const view = fittedViewport(boolean);
        ['x', 'y'].forEach(axis => {
            const first = (0 - view[axis].start) / view[axis].span;
            const last = (1 - view[axis].start) / view[axis].span;
            assert(first > 0 && last < 1, 'Endpoint is clipped at a plot edge');
            close(first, 1 - last);
        });
    });
});

test('Boolean Fit places 0 and 1 at one-quarter and three-quarters of the height', () => {
    const view = fittedViewport(true);
    const domain = axisDomain(view.y, 0, 1);
    close(domain.min, -0.5);
    close(domain.max, 1.5);
    close((0 - domain.min) / (domain.max - domain.min), 0.25);
    close((1 - domain.min) / (domain.max - domain.min), 0.75);
});

test('Zoom-out makes boolean levels closer while preserving the pinch anchor', () => {
    const original = fittedViewport(true).y;
    const zoomed = zoomAxis(original, 0.5, 0.35);
    assert(zoomed.span > original.span, 'Boolean zoom-out is still capped');
    close(original.start + 0.35 * original.span, zoomed.start + 0.35 * zoomed.span);
    close(1 / zoomed.span, 0.25);
});

test('Padded Fit domains leave room around piece count, depth and evaluation limits', () => {
    const view = fittedViewport();
    [[view.x, 0, 32], [view.x, -1000, 1000], [view.y, 1, 500]].forEach(([axis, min, max]) => {
        const domain = axisDomain(axis, min, max);
        assert(domain.min < min && domain.max > max, 'Fit has no breathing room');
    });
});

test('Short setting names disambiguate generic Enable and Depth labels', () => {
    assert(settingDisplayName('enableAdvancedElo', 'Enable') === 'Enable Advanced Elo', 'Enable name lacks setting context');
    assert(settingDisplayName('engineEnabled', 'Enabled') === 'Engine Enabled', 'Enabled name lacks engine context');
    assert(settingDisplayName('advancedEloDepth', 'Depth (1 - 500)') === 'Advanced Elo Depth', 'Depth name lacks context');
    assert(settingDisplayName('ttsVoiceSpeed', 'Speed') === 'TTS Voice Speed', 'Acronym is unreadable');
});

test('Distinct setting titles stay short without raw keys or inline type annotations', () => {
    assert(settingDisplayName('engineNodes', 'Search Nodes') === 'Search Nodes', 'Distinct title was expanded unnecessarily');
    assert(settingDisplayName('engineElo', 'Engine ELO') === 'Engine ELO', 'Existing distinct title was lost');
    assert(!settingDisplayName('enableAdvancedElo', 'Enable').includes('['), 'Type annotation leaked into the name');
});

test('Background variable values round to the nearest integer too', () => {
    close(DynamicSettingsCore.getVariableValue('evaluation', { evaluation: 24.6 }), 25);
    close(DynamicSettingsCore.getVariableValue('pieceCount', { pieceCount: 3.2 }), 3);
    close(DynamicSettingsCore.getVariableValue('evaluation', { evaluation: -24.8 }), -25);
});

test('Disabled lines stay selectable in the legend but are removed from the plot', () => {
    const lines = [
        { profile: 'default', key: 'advancedEloDepth', curve: { variable: 'pieceCount', enabled: false } },
        { profile: 'second', key: 'advancedEloDepth', curve: { variable: 'pieceCount', enabled: true } }
    ];
    assert(filterGraphLines(lines, 'pieceCount', 'advancedEloDepth').length === 2, 'Disabled line disappeared from the legend');
    const plotted = filterGraphLines(lines, 'pieceCount', 'advancedEloDepth', true);
    assert(plotted.length === 1 && plotted[0] === lines[1], 'Disabled line remains visible');
    assert(lines[0].curve.enabled === false, 'Listing a disabled line implicitly enabled it');
});

test('Enable/disable controls both plotted visibility and the resolved setting value', () => {
    const line = { profile: 'default', key: 'advancedEloDepth', curve: { enabled: true, variable: 'pieceCount',
        interpolation: 'linear', minY: 1, maxY: 500, points: [{ x: 0, y: 10 }, { x: 10, y: 100 }] } };
    close(DynamicSettingsCore.resolveValue(10, line.curve, { pieceCount: 10 }), 100);
    line.curve.enabled = false;
    const saved = DynamicSettingsCore.normalizeCurve(structuredClone(line.curve));
    assert(saved.enabled === false, 'The disabled flag did not survive saving');
    assert(filterGraphLines([line], 'pieceCount', 'advancedEloDepth', true).length === 0, 'Disabled curve is drawn');
    close(DynamicSettingsCore.resolveValue(10, saved, { pieceCount: 10 }), 10);
    assert(saved.points.length === 2, 'Disabling a line discarded its points');
    line.curve.enabled = true;
    assert(filterGraphLines([line], 'pieceCount', 'advancedEloDepth', true)[0] === line, 'Re-enabled curve is not drawn');
    close(DynamicSettingsCore.resolveValue(10, line.curve, { pieceCount: 10 }), 100);
});

test('Resolving a dynamic override leaves the setting and curve defaults intact', () => {
    const settingValue = 37;
    const curve = { enabled: true, variable: 'pieceCount', interpolation: 'linear', minY: 1, maxY: 500,
        points: [{ x: 0, y: 10 }, { x: 10, y: 100 }] };
    const overriddenValue = DynamicSettingsCore.resolveValue(settingValue, curve, { pieceCount: 10 });

    close(overriddenValue, 100);
    close(settingValue, 37);
    close(curve.points[0].y, 10);
    close(curve.points[1].y, 100);
});

test('A setting view compares all profiles without changing enable flags or variables', () => {
    const lines = [
        { profile: 'default', key: 'engineEnabled', curve: { variable: 'pieceCount', enabled: true } },
        { profile: 'second', key: 'engineEnabled', curve: { variable: 'pieceCount', enabled: false } },
        { profile: 'default', key: 'advancedEloDepth', curve: { variable: 'evaluation', enabled: true } }
    ];
    const profiles = filterGraphLines(lines, 'pieceCount', 'engineEnabled');
    assert(profiles.length === 2 && profiles[0] === lines[0] && profiles[1] === lines[1], 'Cannot compare both profiles of the same setting');
    assert(filterGraphLines(lines, 'pieceCount', 'engineEnabled', true).length === 1, 'Disabled profile line is plotted');
    assert(filterGraphLines(lines, 'evaluation', 'advancedEloDepth')[0] === lines[2], 'Variable filter crossed tabs');
    assert(lines.map(line => line.curve.enabled).join(',') === 'true,false,true', 'Filtering changed the enable state');
});

test('Disabling a boolean curve uses the regular default, not the graph level', () => {
    const curve = { enabled: true, boolean: true, variable: 'pieceCount', interpolation: 'step',
        points: [{ x: 0, y: 0 }, { x: 10, y: 1 }] };
    assert(DynamicSettingsCore.resolveValue(false, curve, { pieceCount: 10 }) === true, 'Enabled step did not apply');
    curve.enabled = false;
    assert(DynamicSettingsCore.resolveValue(false, curve, { pieceCount: 10 }) === false, 'Disabled step still applies');
    assert(DynamicSettingsCore.normalizeCurve(curve).enabled === false, 'Boolean normalization enabled a disabled line');
});

test('Variable tabs collapse only on mobile when their intrinsic width will not fit', () => {
    assert(shouldCollapseVariableTabs(true, 420, 320), 'Overflowing mobile tabs did not collapse');
    assert(!shouldCollapseVariableTabs(true, 300, 320), 'Fitting mobile tabs unnecessarily collapsed');
    assert(!shouldCollapseVariableTabs(false, 420, 320), 'Desktop tabs unexpectedly collapsed');
    assert(!shouldCollapseVariableTabs(true, 300, 0), 'Closed dialog produced a false collapse decision');
    assert(!shouldCollapseVariableTabs(true, 320.5, 320), 'Subpixel measurement caused tab flickering');
});

test('Different settings never share the same plot or legend', () => {
    const lines = [
        { profile: 'default', key: 'engineEnabled', curve: { variable: 'pieceCount', enabled: true } },
        { profile: 'second', key: 'engineEnabled', curve: { variable: 'pieceCount', enabled: true } },
        { profile: 'default', key: 'advancedEloDepth', curve: { variable: 'pieceCount', enabled: true } },
        { profile: 'second', key: 'advancedEloDepth', curve: { variable: 'pieceCount', enabled: false } }
    ];
    ['engineEnabled', 'advancedEloDepth'].forEach(key => {
        const legend = filterGraphLines(lines, 'pieceCount', key);
        assert(legend.length === 2 && legend.every(line => line.key === key), 'Legend mixed different settings');
        assert(filterGraphLines(lines, 'pieceCount', key, true).every(line => line.key === key && line.curve.enabled), 'Plot mixed different settings');
    });
});

test('An empty setting or legacy all-settings selection cannot draw a mixed graph', () => {
    const lines = [{ profile: 'default', key: 'engineEnabled', curve: { variable: 'pieceCount', enabled: true } }];
    ['', undefined, 'all', 'unknownSetting'].forEach(key => {
        assert(filterGraphLines(lines, 'pieceCount', key).length === 0, 'Missing setting fell back to all settings');
    });
});

test('Profiles using a different game variable never appear against the wrong X axis', () => {
    const lines = [
        { profile: 'default', key: 'advancedEloDepth', curve: { variable: 'pieceCount', enabled: true } },
        { profile: 'second', key: 'advancedEloDepth', curve: { variable: 'evaluation', enabled: true } }
    ];
    assert(filterGraphLines(lines, 'pieceCount', 'advancedEloDepth')[0] === lines[0], 'Wrong piece-count profile');
    assert(filterGraphLines(lines, 'evaluation', 'advancedEloDepth')[0] === lines[1], 'Wrong evaluation profile');
    assert(filterGraphLines(lines, 'moveNumber', 'advancedEloDepth').length === 0, 'Curves were reassigned to another variable');
    assert(lines[0].curve.variable === 'pieceCount' && lines[1].curve.variable === 'evaluation', 'Viewing a tab changed saved curve variables');
});

test('The SVG interpolation lock disappears when moving from a boolean to a numeric line', () => {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    setInterpolationLockVisibility(icon, true);
    assert(!icon.hasAttribute('hidden'), 'Boolean lock was hidden');
    setInterpolationLockVisibility(icon, false);
    assert(icon.hasAttribute('hidden'), 'Numeric line retained the SVG lock');
    setInterpolationLockVisibility(icon, true);
    assert(!icon.hasAttribute('hidden'), 'Boolean lock did not return');
    setInterpolationLockVisibility(icon, false);
    assert(icon.hasAttribute('hidden'), 'Repeated selection left the lock visible');
});

test('Shortcut status separates enabled, waiting, disabled and missing curves', () => {
    const curve = { enabled: true, variable: 'pieceCount', points: [{ x: 0, y: 100 }] };
    const active = describeDynamicSetting(DynamicSettingsCore, 37, curve, { pieceCount: 10 }, 'Depth');
    assert(active.enabled && active.overridden, 'Applicable curve is not marked active');
    close(active.effectiveValue, 100);
    assert(active.description.includes('Saved value: 37'), 'Saved fallback is missing');
    const waiting = describeDynamicSetting(DynamicSettingsCore, 37, curve, {}, 'Depth');
    assert(waiting.enabled && !waiting.overridden, 'Waiting curve looks disabled or active');
    assert(waiting.description.includes('waiting for piece count'), 'Missing-context explanation is absent');
    close(waiting.effectiveValue, 37);
    const disabled = describeDynamicSetting(DynamicSettingsCore, 37, { ...curve, enabled: false }, { pieceCount: 10 }, 'Depth');
    assert(!disabled.enabled && !disabled.overridden, 'Disabled curve has an active indicator');
    assert(disabled.description.includes('curve disabled'), 'Disabled curve is not explained');
    const absent = describeDynamicSetting(DynamicSettingsCore, 37, null, { pieceCount: 10 }, 'Depth');
    assert(!absent.enabled && !absent.overridden, 'Missing curve has an active indicator');
});

test('Shortcut status treats equal values, zero and false as real overrides', () => {
    const curve = { enabled: true, variable: 'evaluation', points: [{ x: 0, y: 0 }] };
    const zero = describeDynamicSetting(DynamicSettingsCore, 0, curve, { evaluation: 0 }, 'Delay');
    assert(zero.overridden && zero.effectiveValue === 0, 'Equal zero was mistaken for no override');
    const off = describeDynamicSetting(DynamicSettingsCore, true, { ...curve, boolean: true }, { evaluation: 0 }, 'Enabled');
    assert(off.overridden && off.effectiveValue === false, 'False was mistaken for no override');
    assert(off.description.includes('active: 0') && off.description.includes('Saved value: 1'), 'Boolean values are not numeric');
});

test('Empty, malformed and unsupported curves do not advertise a usable override', () => {
    [
        { enabled: true, variable: 'pieceCount', points: [] },
        { enabled: true, variable: 'pieceCount', points: [{ x: 'invalid', y: 10 }] },
        { enabled: true, variable: 'timeRemaining', points: [{ x: 0, y: 10 }] }
    ].forEach(curve => {
        const state = describeDynamicSetting(DynamicSettingsCore, 37, curve, { pieceCount: 10 }, 'Depth');
        assert(!state.enabled && !state.overridden, 'Unusable curve is advertised as enabled');
        close(state.effectiveValue, 37);
    });
});

test('Nested controls and dialogs cannot steal another setting input or shortcut', () => {
    const container = document.createElement('div');
    container.className = 'custom-input';
    container.innerHTML = '<div><div class="input-title">Move TTS</div><div class="input-subtitle">Hear moves</div></div><div class="custom-input"><input data-key="voice"></div><input type="checkbox" data-key="ttsVoiceEnabled">';
    const input = getOwnedSettingInput(container);
    assert(input.dataset.key === 'ttsVoiceEnabled', 'Nested input stole the shortcut');
    const title = container.querySelector('.input-title');
    const button = createDynamicSettingShortcut(container, input, () => {});
    assert(button?.dataset.key === 'ttsVoiceEnabled', 'Owned input did not get a shortcut');
    assert(container.querySelector('.input-title') === title, 'Original title/translation target was replaced');
    assert(createDynamicSettingShortcut(container, input, () => {}) === null, 'Repeated initialization created a duplicate');
    const launcher = document.createElement('div');
    launcher.className = 'custom-input';
    launcher.innerHTML = '<div class="input-title">Engine settings</div><dialog><div class="custom-input"><input data-key="engineEnabled"></div></dialog>';
    assert(getOwnedSettingInput(launcher) === null, 'Modal launcher claimed an inner setting');
});

test('Updating shortcut indicators never edits the numeric fallback or saved curve', () => {
    const container = document.createElement('div');
    container.className = 'custom-input';
    container.innerHTML = '<div class="input-title">Depth</div><input data-key="depth" data-default-value="1" aria-describedby="existing-help">';
    const input = getOwnedSettingInput(container);
    input.value = '37';
    const curve = { enabled: true, variable: 'pieceCount', points: [{ x: 0, y: 100 }] };
    const snapshot = JSON.stringify(curve);
    const button = createDynamicSettingShortcut(container, input, () => {});
    const state = describeDynamicSetting(DynamicSettingsCore, 37, curve, { pieceCount: 10 }, 'Depth');
    updateDynamicSettingShortcut(button, state, 'Depth');
    assert(input.value === '37' && input.dataset.defaultValue === '1', 'Displayed or markup default was overwritten');
    assert(JSON.stringify(curve) === snapshot, 'Describing the curve modified storage data');
    assert(button.classList.contains('is-dynamic') && button.classList.contains('is-overridden'), 'Active indicators are missing');
    assert(!container.querySelector('.dynamic-setting-description'), 'Shortcut added explanatory tooltip text');
    assert(!button.hasAttribute('title'), 'Shortcut still creates a native tooltip');
    assert(input.getAttribute('aria-describedby') === 'existing-help', 'Existing accessible help was changed');
    assert(button.getAttribute('aria-description').includes('active: 100'), 'Accessible override status is missing');
    const liveValue = container.querySelector('.dynamic-setting-live-value');
    assert(liveValue.getAttribute('role') === 'tooltip', 'Value bubble is not marked as a tooltip');
    assert(!liveValue.hidden && liveValue.textContent === '100', 'Current override value is not shown as a bare number');
    assert(button.nextElementSibling === liveValue, 'Value is not an adjacent sibling for button-only hover');
    assert(liveValue.getAttribute('aria-hidden') === 'true', 'Live value duplicates the accessible button description');
    updateDynamicSettingShortcut(button, describeDynamicSetting(DynamicSettingsCore, 37, null, {}, 'Depth'), 'Depth');
    assert(!button.classList.contains('is-dynamic') && !container.classList.contains('has-dynamic-override'), 'Deleted curve left a stale indicator');
    assert(liveValue.hidden && liveValue.textContent === '', 'Deleted curve left a stale live value');
    assert(input.value === '37', 'Removing the indicator changed the fallback');
});

test('Boolean shortcuts preserve the checkbox and open the exact setting without bubbling', () => {
    const container = document.createElement('div');
    container.className = 'custom-input';
    container.innerHTML = '<div class="input-title">Enabled</div><input type="checkbox" data-key="engineEnabled" data-default-value="false">';
    const input = getOwnedSettingInput(container);
    input.checked = false;
    let openedKey = '', opener = null, bubbled = false;
    container.addEventListener('click', () => { bubbled = true; });
    const button = createDynamicSettingShortcut(container, input, (key, source) => { openedKey = key; opener = source; });
    const curve = { enabled: true, variable: 'pieceCount', boolean: true, points: [{ x: 0, y: 1 }] };
    updateDynamicSettingShortcut(button, describeDynamicSetting(DynamicSettingsCore, false, curve, { pieceCount: 10 }, 'Enabled'), 'Enabled');
    assert(input.checked === false && input.dataset.defaultValue === 'false', 'Boolean default was overwritten');
    assert(container.querySelector('.dynamic-setting-live-value').textContent === '1', 'Boolean live value is not numeric');
    button.click();
    assert(openedKey === 'engineEnabled' && opener === button, 'Shortcut did not target its setting');
    assert(!bubbled, 'Shortcut click also activated the parent setting');
    assert(button.type === 'button' && button.getAttribute('aria-haspopup') === 'dialog', 'Shortcut is not an accessible non-submit button');
});

test('Inline live values follow the rounded runtime value without editing the saved input', () => {
    const container = document.createElement('div');
    container.className = 'custom-input';
    container.innerHTML = '<div class="input-title">Depth</div><input data-key="depth" data-default-value="1">';
    const input = getOwnedSettingInput(container);
    input.value = '37';
    const button = createDynamicSettingShortcut(container, input, () => {});
    const liveValue = container.querySelector('.dynamic-setting-live-value');
    assert(liveValue.hidden && liveValue.textContent === '', 'New shortcut displays an uninitialized live value');
    const curve = { enabled: true, variable: 'pieceCount', interpolation: 'linear', minY: 0, maxY: 500,
        points: [{ x: 0, y: 0 }, { x: 10, y: 101 }] };
    [
        { pieceCount: 0, text: '0' },
        { pieceCount: 5, text: '51' },
        { pieceCount: 10, text: '101' }
    ].forEach(({ pieceCount, text }) => {
        const state = describeDynamicSetting(DynamicSettingsCore, 37, curve, { pieceCount }, 'Depth');
        updateDynamicSettingShortcut(button, state, 'Depth');
        assert(!liveValue.hidden && liveValue.textContent === text, 'Live value is stale or differs from runtime rounding');
        assert(input.value === '37' && input.dataset.defaultValue === '1', 'Live value changed the saved input or its default');
    });
    assert(container.querySelectorAll('.dynamic-setting-live-value').length === 1, 'Updating live values created duplicate labels');
});

test('Inline live values hide for waiting or disabled curves and display booleans as 0 or 1', () => {
    const container = document.createElement('div');
    container.className = 'custom-input';
    container.innerHTML = '<div class="input-title">Enabled</div><input type="checkbox" data-key="engineEnabled">';
    const input = getOwnedSettingInput(container);
    input.checked = true;
    const button = createDynamicSettingShortcut(container, input, () => {});
    const liveValue = container.querySelector('.dynamic-setting-live-value');
    const curve = { enabled: true, boolean: true, variable: 'pieceCount', interpolation: 'step',
        points: [{ x: 0, y: 0 }, { x: 10, y: 1 }] };
    updateDynamicSettingShortcut(button, describeDynamicSetting(DynamicSettingsCore, true, curve, { pieceCount: 0 }, 'Enabled'), 'Enabled');
    assert(!liveValue.hidden && liveValue.textContent === '0', 'False override was hidden or not displayed as 0');
    updateDynamicSettingShortcut(button, describeDynamicSetting(DynamicSettingsCore, true, curve, {}, 'Enabled'), 'Enabled');
    assert(liveValue.hidden && liveValue.textContent === '', 'Waiting curve shows a stale override value');
    updateDynamicSettingShortcut(button, describeDynamicSetting(DynamicSettingsCore, true, curve, { pieceCount: 10 }, 'Enabled'), 'Enabled');
    assert(!liveValue.hidden && liveValue.textContent === '1', 'Resolved curve did not restore the numeric true value');
    updateDynamicSettingShortcut(button, describeDynamicSetting(DynamicSettingsCore, true, { ...curve, enabled: false }, { pieceCount: 10 }, 'Enabled'), 'Enabled');
    assert(liveValue.hidden && liveValue.textContent === '', 'Disabled curve shows a live override value');
    assert(input.checked === true, 'Displaying boolean live values changed the saved checkbox');
});

test('Graph and shortcut value formatting uses only values, including 0 and 1 for booleans', () => {
    [[true, '1'], [false, '0'], [0, '0'], [51, '51'], [-12, '-12'], [99999999, '99999999']]
        .forEach(([value, expected]) => {
            assert(formatSettingValue(value) === expected, 'Graph/shortcut formatter added text or changed the value');
            assert(describeDynamicSetting(DynamicSettingsCore, value, null, {}, 'Setting').displayValue === expected, 'Shortcut uses a different formatter from the graph');
        });
});

test('Graph profiles use neutral colors and distinct patterns rather than themed hues', () => {
    const styles = Array.from({ length: 8 }, (_, index) => graphProfileStyle(index));
    assert(styles.every(style => style.color === 'rgb(255 255 255 / 85%)'), 'Graph uses a non-neutral profile color');
    assert(new Set(styles.map(style => style.dashArray)).size === styles.length, 'Profiles lost their distinct line patterns');
    assert(styles[0].dashArray === '', 'First profile should have a solid line');
    assert(graphProfileStyle(8).dashArray === styles[0].dashArray, 'Pattern cycling is inconsistent');
    assert(graphProfileStyle(-1).dashArray === styles[0].dashArray, 'Unknown profile has no usable style');
});

test('Shortcut activation distinguishes pointer clicks from keyboard clicks', () => {
    const container = document.createElement('div');
    container.className = 'custom-input';
    container.innerHTML = '<div class="input-title">Depth</div><input data-key="depth">';
    const activations = [];
    const button = createDynamicSettingShortcut(container, getOwnedSettingInput(container), (key, source, keyboardActivated) => {
        activations.push({ key, source, keyboardActivated });
    });
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
    assert(activations.length === 2 && activations.every(item => item.key === 'depth' && item.source === button), 'Activation lost its setting or opener');
    assert(!activations[0].keyboardActivated && activations[1].keyboardActivated, 'Pointer and keyboard focus restoration are not distinguished');
});

test('Closing a pointer-opened editor clears restored shortcut focus without stealing other focus', () => {
    const container = document.createElement('div');
    container.className = 'custom-input';
    container.innerHTML = '<div class="input-title">Depth</div><input data-key="depth">';
    const input = getOwnedSettingInput(container);
    const button = createDynamicSettingShortcut(container, input, () => {});
    const previousFocus = document.activeElement;
    document.body.appendChild(container);
    try {
        button.focus();
        assert(document.activeElement === button, 'Fixture could not focus the shortcut');
        restoreDynamicSettingShortcutFocus(button, false);
        assert(document.activeElement !== button, 'Pointer shortcut stayed focused after closing');
        assert(!container.matches(':focus-within'), 'Pointer shortcut left the setting reveal active');
        input.focus();
        restoreDynamicSettingShortcutFocus(button, false);
        assert(document.activeElement === input, 'Pointer cleanup stole focus from another control');
    } finally {
        container.remove();
        previousFocus?.focus({ preventScroll: true });
    }
});

test('Closing a keyboard-opened editor returns focus to its shortcut', () => {
    const container = document.createElement('div');
    container.className = 'custom-input';
    container.innerHTML = '<div class="input-title">Depth</div><input data-key="depth">';
    const input = getOwnedSettingInput(container);
    const button = createDynamicSettingShortcut(container, input, () => {});
    const previousFocus = document.activeElement;
    document.body.appendChild(container);
    try {
        input.focus();
        restoreDynamicSettingShortcutFocus(button, true);
        assert(document.activeElement === button, 'Keyboard focus was not returned to the shortcut');
    } finally {
        container.remove();
        previousFocus?.focus({ preventScroll: true });
    }
});

// Inspect the real markup/styles too, rather than duplicating the toolbar in a fixture.
try {
    const [markup, graphStyles, inputStyles] = await Promise.all([
        '../index.html', '../gui.css', '../../assets/css/custom-inputs.css'
    ].map(async path => {
        const response = await fetch(path);
        if(!response.ok) throw new Error(`Cannot read regression source ${path}: ${response.status}`);
        return response.text();
    }));
    const appDocument = new DOMParser().parseFromString(markup, 'text/html');
    const coveredKeys = new Set();
    appDocument.querySelectorAll('input[data-key],textarea[data-key],select[data-key]').forEach(input => {
        const definition = describeSettingInput(input, PARSE_MINMAX_FROM_STR);
        const key = input.dataset.key;
        if(!definition || coveredKeys.has(key)) return;
        coveredKeys.add(key);
        test(`Setting ${key} resolves graph values and restores its saved default`, () => {
            const base = definition.boolean ? input.dataset.defaultValue === 'true'
                : definition.categorical ? input.dataset.defaultValue ?? '' : Number(input.dataset.defaultValue);
            const curve = { enabled: true, variable: 'pieceCount', outsideRange: 'default',
                minY: definition.min, maxY: definition.max, boolean: Boolean(definition.boolean),
                ...(definition.categorical ? { values: definition.values } : {}),
                points: [{ x: 10, y: definition.min }, { x: 20, y: definition.max }] };
            const actual = DynamicSettingsCore.resolveValue(base, curve, { pieceCount: 20, moveNumber: 10 });
            const expected = definition.boolean ? true : definition.categorical ? definition.values.at(-1) : definition.max;
            assert(Object.is(actual, expected), `${key}: expected ${expected}, got ${actual}`);
            assert(Object.is(DynamicSettingsCore.resolveValue(base, curve, { pieceCount: 32 }), base), `${key}: saved default was not restored`);
            assert(Object.is(DynamicSettingsCore.resolveValue(base, { ...curve, enabled: false }, { pieceCount: 20 }), base), `${key}: disabled curve still applies`);
        });
    });

    test('Graph controls share one top toolbar and nothing follows the graph', () => {
        const panel = appDocument.getElementById('dynamic-graph-panel');
        const toolbar = panel.querySelector('.dynamic-graph-toolbar');
        assert(panel.querySelectorAll('.dynamic-settings-toolbar').length === 1, 'Graph controls are still split across toolbars');
        assert(panel.firstElementChild === toolbar, 'Merged toolbar is not at the top');
        [
            'dynamic-add-setting', 'dynamic-add-line', 'dynamic-add-point', 'dynamic-delete-point',
            'dynamic-interpolation', 'dynamic-delete-line', 'dynamic-zoom-out', 'dynamic-zoom-in',
            'dynamic-fit-graph', 'dynamic-fullscreen-toggle', 'dynamic-point-x', 'dynamic-point-y', 'dynamic-point-choice'
        ].forEach(id => {
            assert(appDocument.querySelectorAll(`[id="${id}"]`).length === 1, `Control ${id} is duplicated or missing`);
            assert(toolbar.contains(appDocument.getElementById(id)), `Control ${id} is outside the top toolbar`);
        });
        assert(panel.lastElementChild.classList.contains('dynamic-graph-wrap'), 'Controls or text remain below the graph');
        assert(!panel.querySelector('.dynamic-graph-help, .dynamic-point-actions'), 'Obsolete help or bottom toolbar remains');
        const graph = appDocument.getElementById('dynamic-settings-graph');
        assert(!graph.hasAttribute('aria-describedby'), 'Graph still references removed help text');
        assert(graph.getAttribute('aria-description'), 'Accessible graph guidance was removed');
    });

    test('Fullscreen keeps the merged toolbar and its setting/profile controls available at the top', () => {
        assert(!/#dynamic-settings-floaty\.is-graph-fullscreen\s+(?:\.dynamic-setting-picker|#dynamic-add-line|\.dynamic-graph-toolbar)[^{]*\{[^}]*display:\s*none/.test(graphStyles), 'Fullscreen hides graph toolbar controls');
        const toolbarRule = graphStyles.match(/#dynamic-settings-floaty \.dynamic-graph-toolbar\s*\{([^}]*)\}/)?.[1] ?? '';
        assert(/position:\s*sticky/.test(toolbarRule) && /top:\s*0/.test(toolbarRule), 'Toolbar does not stay at the top');
        assert(!graphStyles.includes('.dynamic-point-actions') && !graphStyles.includes('.dynamic-graph-help'), 'Bottom toolbar/help styles remain');
        assert(!/\.dynamic-point-inspector\s*\{[^}]*bottom:\s*0/.test(graphStyles), 'Point coordinates are still pinned to the bottom');
    });

    test('Line/point pairs stay adjacent but separate, without a conflict status element', () => {
        assert(appDocument.getElementById('dynamic-add-line').nextElementSibling.id === 'dynamic-delete-line', 'Line actions are separated');
        assert(appDocument.getElementById('dynamic-add-point').nextElementSibling.id === 'dynamic-delete-point', 'Point actions are separated');
        const separator = appDocument.getElementById('dynamic-delete-line').nextElementSibling;
        assert(separator.classList.contains('dynamic-toolbar-separator') && separator.nextElementSibling.id === 'dynamic-add-point', 'Line and point actions lack separation');
        const separatorRule = graphStyles.match(/\.dynamic-toolbar-separator\s*\{([^}]*)\}/)?.[1] ?? '';
        assert(/margin-inline:\s*12px/.test(separatorRule), 'Action groups lack extra spacing');
        assert(!appDocument.getElementById('dynamic-conflict-status'), 'Removed conflict status remains');
        assert(!graphStyles.includes('.dynamic-conflict-status'), 'Removed conflict styling remains');
        const selection = graphStyles.match(/\.dynamic-line-row\.is-selected\s*\{([^}]*)\}/)?.[1] ?? '';
        assert(!selection.includes('2px var(--line-color)') && selection.includes('/ 26%'), 'Selected border still has full intensity');
    });

    test('The top-level graph launcher is replaced with an app-styled log floaty', () => {
        const launcher = appDocument.querySelector('#settings-control-panel .activity-log-launcher .open-floaty-btn');
        assert(launcher?.textContent === '📜' && launcher.classList.contains('acas-fancy-button'), 'Log button is missing or loses app styling');
        assert(launcher.getAttribute('aria-controls') === 'log-floaty' && launcher.parentElement.querySelector('#log-floaty'), 'Log button does not own its dialog');
        assert(!appDocument.querySelector('.dynamic-settings-launcher') && !appDocument.querySelector('.dynamic-settings-editor .open-floaty-btn'), 'Old graph launcher remains');
        assert(appDocument.getElementById('dynamic-settings-floaty')?.querySelector('.floaty-close-btn'), 'Shortcut-opened graph editor was removed');
        assert(appDocument.getElementById('activity-log-entries')?.getAttribute('role') === 'log', 'Log entries lack accessible semantics');
        const filter = appDocument.getElementById('activity-log-filter');
        ['all', 'engine-input', 'engine-output', 'dynamic-change', 'error'].forEach(type => {
            assert([...filter.options].some(option => option.value === type), `Missing ${type} filter`);
        });
        assert(!appDocument.querySelector('#log-floaty input[type="search"]'), 'Unrequested search box added');
    });

    test('Add line is wider and emphasized when enabled without a taller control', () => {
        const rule = graphStyles.match(/\.dynamic-graph-toolbar #dynamic-add-line\s*\{([^}]*)\}/)?.[1] ?? '';
        assert(/padding-inline:\s*18px/.test(rule), 'Add line is not wider');
        assert(!/(?:min-)?height:/.test(rule), 'Add line has a different desktop height');
        assert(graphStyles.includes('#dynamic-add-line:not(:disabled)'), 'Add line lacks enabled-state emphasis');
    });

    test('Dynamic floaty subtitle inherits the standard floaty paragraph font size', () => {
        const rule = graphStyles.match(/#dynamic-settings-floaty \.floaty-header \.title p\s*\{([^}]*)\}/)?.[1] ?? '';
        assert(!/font-size:/.test(rule), 'Graph subtitle has a smaller custom font size');
    });

    test('The actual engine dropdown has a usable categorical definition', () => {
        const definition = describeSettingInput(appDocument.querySelector('#chess-engine-dropdown input'), () => null);
        assert(definition?.categorical && definition.values.includes('maia3') && definition.values.includes('lozza-9'), 'Engine dropdown is not graphable');
        assert(definition.values[0] === null, 'Engine lacks a saved-default choice');
    });

    test('Value tooltip is centered above the shortcut and appears only on button hover', () => {
        const tooltipRule = inputStyles.match(/\.dynamic-setting-live-value\s*\{([^}]*)\}/)?.[1] ?? '';
        assert(/position:\s*absolute/.test(tooltipRule), 'Value tooltip still takes up inline layout space');
        assert(/right:\s*calc\(var\(--dynamic-setting-shortcut-size\) \/ 2\)/.test(tooltipRule), 'Value tooltip is not centered on the button');
        assert(/bottom:\s*calc\(50% \+ var\(--dynamic-setting-shortcut-size\) \/ 2 \+ 6px\)/.test(tooltipRule), 'Value tooltip is not above the button');
        assert(inputStyles.includes('.dynamic-setting-shortcut:hover + .dynamic-setting-live-value'), 'Value tooltip lacks button-only hover behavior');
        assert(!/\.custom-input[^{}]*\.dynamic-setting-live-value\s*\{/.test(inputStyles), 'Setting-row hover reveals the value tooltip');
    });
} catch(error) {
    test('Regression markup and styles can be loaded', () => { throw error; });
}

const list = document.getElementById('results');
results.forEach(result => {
    const item = document.createElement('li');
    item.className = result.passed ? 'pass' : 'fail';
    item.textContent = `${result.passed ? 'PASS' : 'FAIL'} · ${result.name}${result.error ? `: ${result.error}` : ''}`;
    list.appendChild(item);
});
const failures = results.filter(result => !result.passed);
document.getElementById('summary').textContent = `${results.length - failures.length}/${results.length} checks passed`;
window.dynamicGraphTestResults = results;
if(failures.length) throw new Error(`${failures.length} dynamic graph regression checks failed`);