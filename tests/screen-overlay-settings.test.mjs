import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app/assets/js/gui/settings.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '');

test('Ghost screen controls and statuses have translations for every available language', () => {
    const meta = JSON.parse(readFileSync(new URL('../assets/i18n/meta.json', import.meta.url), 'utf8'));
    const keys = ['tagline', 'inactive', 'connecting', 'available', 'unavailable', 'update', 'paused', 'invalidOffset'];
    for(const [code] of meta.availableLanguages) {
        const locale = JSON.parse(readFileSync(new URL(`../assets/i18n/${code}.json`, import.meta.url), 'utf8'));
        assert.ok(locale.configTranslations.isUserscriptGhost?.every(Boolean), code);
        assert.ok(locale.configTranslations.ghostScreenOverlay?.every(Boolean), code);
        assert.ok(locale.configTranslations.ghostScreenOffsetX?.[0], code);
        assert.ok(locale.configTranslations.ghostScreenOffsetY?.[0], code);
        for(const key of keys) assert.ok(locale.translations.ghostScreen?.[key], `${code}: ${key}`);
    }
    const english = JSON.parse(readFileSync(new URL('../assets/i18n/us.json', import.meta.url), 'utf8'));
    assert.equal(english.configTranslations.ghostScreenOverlay[1], 'Use the local server to draw outside the chess page');
    assert.equal(english.configTranslations.isUserscriptGhost[1], 'Hide drawings on the chess page');
});

test('Ghost offset saves do not update engine settings', async () => {
    const instanceSource = readFileSync(new URL('../app/assets/js/AcasInstance.js', import.meta.url), 'utf8');
    const start = instanceSource.indexOf('this.guiBroadcastChannel.onmessage = async e => {');
    const end = instanceSource.indexOf('\n        };', start);
    assert.ok(start >= 0 && end > start);
    const setup = new Function(`${instanceSource.slice(start, end + '\n        };'.length)}\nreturn this.guiBroadcastChannel.onmessage;`);
    const updates = [];
    const instance = {
        instanceReady: true, instanceClosed: false, instanceID: 'board', guiBroadcastChannel: {},
        updateSettings: async msg => updates.push(msg.data.key)
    };
    const handler = setup.call(instance);
    for(const key of ['ghostScreenOffsetX', 'ghostScreenOffsetY', 'isUserscriptGhost', 'ghostScreenOverlay', 'engineNodes'])
        await handler({ data: { type: 'settingSave', data: { key, noProfile: true } } });
    assert.deepEqual(updates, ['engineNodes']);
});

test('global-only Ghost settings stay global when an instance and profile are selected', async () => {
    const config = { global: { ghostScreenOverlay: true }, instance: { board: { ghostScreenOverlay: false } } };
    const input = {
        dataset: { key: 'ghostScreenOverlay', noProfile: 'true', globalOnly: 'true', defaultValue: 'false' },
        checked: false, closest: () => null
    };
    const reads = [], broadcasts = [], profileReads = [];
    const context = {
        SETTING_FILTER_OBJ: { type: 'instance', instanceID: 'board', profileID: 'default' },
        getInputValue: element => element.type === 'number' ? element.value : element.checked,
        setInputValue: (element, value) => {
            if(element.type === 'number') element.value = value;
            else element.checked = value;
        },
        activateInputDefaultValue: element => { element.checked = false; },
        VAR_TO_CORRECT_TYPE: value => value,
        USERSCRIPT_SHARED_VARS: { gmConfigKey: 'config' },
        USERSCRIPT: { getValue: async () => config, setValue: async () => {} },
        GET_PROFILE_STORAGE_KEY: value => value,
        GET_HUMAN_READABLE_PROFILE_NAME: value => value,
        GET_PROFILE_FOR_INSTANCE: async (name, instanceID) => {
            profileReads.push([name, instanceID]);
            return false;
        },
        INIT_NESTED_OBJECT: (object, keys) => keys.forEach(key => { object[key] ??= {}; }),
        GET_GM_CFG_BASE_VALUE: async (key, instanceID) => {
            reads.push(instanceID);
            return config.instance?.[instanceID]?.[key] ?? config.global[key];
        },
        guiBroadcastChannel: { postMessage: value => broadcasts.push(value) },
        pipSettingKeys: [], window: {}, logActivity() {}, formatLogValue: String,
        runSettingChangeObserver() {}, document: {
            querySelectorAll: () => [input], dispatchEvent() {}
        },
        Event: class {}, console: { log() {} }
    };
    vm.runInNewContext(`${source}\nglobalThis.api = { saveSetting, loopThroughAndUpdateSettingsValues };`, context);
    await context.api.loopThroughAndUpdateSettingsValues();
    assert.deepEqual(reads, [null]);
    assert.equal(input.checked, true);
    input.checked = false;
    await context.api.saveSetting(input, true);
    assert.equal(config.global.ghostScreenOverlay, false);
    assert.equal(config.instance.board.ghostScreenOverlay, false);
    assert.equal(broadcasts[0].data.instanceID, null);
    assert.deepEqual(profileReads, [['default', null]]);
    input.type = 'number';
    input.dataset.key = 'ghostScreenOffsetX';
    input.value = -14;
    await context.api.saveSetting(input, true);
    assert.equal(config.global.ghostScreenOffsetX, -14);
    input.value = 0;
    await context.api.loopThroughAndUpdateSettingsValues();
    assert.equal(input.value, -14);
});

test('a saved mobile screen overlay is turned off in shared settings', async () => {
    const config = { global: { ghostScreenOverlay: true } };
    const input = {
        dataset: { key: 'ghostScreenOverlay', noProfile: 'true', globalOnly: 'true', defaultValue: 'false' },
        checked: false, disabled: true, closest: () => null
    };
    const broadcasts = [];
    const context = {
        SETTING_FILTER_OBJ: { type: 'global', instanceID: null, profileID: 'default' },
        getInputValue: element => element.checked,
        setInputValue: (element, value) => { element.checked = element.disabled ? false : value; },
        activateInputDefaultValue: element => { element.checked = false; },
        VAR_TO_CORRECT_TYPE: value => value,
        USERSCRIPT_SHARED_VARS: { gmConfigKey: 'config' },
        USERSCRIPT: { getValue: async () => config, setValue: async () => {} },
        GET_PROFILE_STORAGE_KEY: value => value,
        GET_HUMAN_READABLE_PROFILE_NAME: value => value,
        GET_PROFILE_FOR_INSTANCE: async () => false,
        INIT_NESTED_OBJECT: (object, keys) => keys.forEach(key => { object[key] ??= {}; }),
        GET_GM_CFG_BASE_VALUE: async key => config.global[key],
        guiBroadcastChannel: { postMessage: value => broadcasts.push(value) },
        pipSettingKeys: [], window: {}, logActivity() {}, formatLogValue: String,
        runSettingChangeObserver() {}, document: {
            querySelectorAll: () => [input], dispatchEvent() {}
        },
        Event: class {}, console: { log() {} }
    };
    vm.runInNewContext(`${source}\nglobalThis.api = { loopThroughAndUpdateSettingsValues };`, context);
    await context.api.loopThroughAndUpdateSettingsValues();
    assert.equal(config.global.ghostScreenOverlay, false);
    assert.equal(broadcasts[0].data.value, false);
});
