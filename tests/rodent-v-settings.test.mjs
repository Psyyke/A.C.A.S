import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import applyDynamicOption from '../app/assets/js/instance/applyDynamicOption.js';
import { setDynamicOption } from '../app/assets/js/gui/dynamicEngineOptionState.js';

const source = readFileSync(new URL('../app/assets/js/AcasInstance.js', import.meta.url), 'utf8');
const eloMethod = source.slice(source.indexOf('    async setEngineElo('), source.indexOf('    async setEngineWeight('));
const setEngineElo = new Function('updatePipData', `return ({ ${eloMethod} }).setEngineElo;`)(() => {});

for(const [requested, expected, limited, warnings] of [
    [600, 800, true, 1], [800, 800, true, 0], [1500, 1500, true, 0],
    [2500, 2500, true, 0], [3000, 3000, true, 0], [3100, 3000, true, 1], [3200, 3200, false, 0]
]) {
    test(`basic Rodent Elo ${requested} uses its own limiter without Stockfish depth or skill`, async t => {
        const notices = [], commands = [];
        const previous = globalThis.toast;
        globalThis.toast = { warning: text => notices.push(text), message() {} };
        t.after(() => { if(previous === undefined) delete globalThis.toast; else globalThis.toast = previous; });
        const instance = {
            pV: { default: { searchDepth: 8 } },
            configKeys: { useExternalChessEngine: 'external', engineEnemyElo: 'opponent' },
            getConfigValue: async key => key === 'external' ? false : 1500,
            getEngineName: async () => 'rodent-v',
            sendMsgToEngine: async line => { commands.push(line); return true; }
        };
        assert.deepEqual(await setEngineElo.call(instance, requested, false, 'default'), { appliedValue: expected });
        assert.deepEqual(commands, [`setoption name UCI_Elo value ${limited ? expected : 3000}`,
            `setoption name UCI_LimitStrength value ${limited}`]);
        assert.equal(instance.pV.default.searchDepth, null);
        assert.equal(notices.length, warnings);
        assert.equal(instance.pV.default.appliedSettings.engineElo, expected);
    });
}

test('a saved default-valued Rodent style override is sent, while other engines retain default skipping', async t => {
    const previous = globalThis.VAR_TO_CORRECT_TYPE;
    globalThis.VAR_TO_CORRECT_TYPE = value => value === 'false' ? false : value === 'true' ? true : Number(value);
    t.after(() => {
        if(previous === undefined) delete globalThis.VAR_TO_CORRECT_TYPE;
        else globalThis.VAR_TO_CORRECT_TYPE = previous;
    });
    for(const engine of ['rodent-v', 'stockfish-19']) {
        const key = `DYNAMIC_${engine}_hceWeight`;
        setDynamicOption(key, { name: 'hceWeight', type: 'spin', defaultValue: 0, min: 0, max: 256 }, 'default', 'rodent-test');
        const commands = [];
        const instance = {
            instanceID: 'rodent-test', pV: { default: {} }, getEngineName: async () => engine,
            setEngineOption: async (...args) => { commands.push(args); return true; }
        };
        const result = await applyDynamicOption.call(instance, key, 0, 'default', false);
        assert.equal(result, engine === 'rodent-v');
        assert.equal(commands.length, engine === 'rodent-v' ? 1 : 0);
    }
});
