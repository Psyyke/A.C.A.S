import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/assets/js/AcasInstance.js', import.meta.url), 'utf8');
const start = source.indexOf('    async speak(');
const end = source.indexOf('    isPawnOnPromotionSquare(', start);

function fixture() {
    const spoken = [];
    let succeeds = true;
    const speak = new Function('getMoveSpeechConfig', 'formatMoveNotationAsync', 'SPEAK_TEXT',
        'CONCEAL_ASSISTANCE_ACTIVE', `return ({${source.slice(start, end)}}).speak;`)(
        () => ({ lang: 'en' }), async move => move.text,
        text => { if(!succeeds) return null; spoken.push(text); return {}; }, false);
    const instance = {
        pV: { default: { currentSpeeches: [] }, secondary: { currentSpeeches: [] } },
        currentFen: 'position-A', isLearningProfile: () => false,
        configKeys: { ttsVoiceEnabled: 'enabled', ttsVoiceName: 'voice', ttsVoiceSpeed: 'speed',
            ttsTranslateAudio: 'translate', pipSan: 'san' },
        getConfigValue: async key => ({ enabled: true, voice: 'default', speed: 10, translate: false, san: true })[key],
        speak
    };
    const say = (text, index = 0, profile = 'default', options = {}) =>
        instance.speak({ text }, profile, 'ttsVoiceEnabled', { suggestionIndex: index, ...options });
    return { instance, spoken, say, fail: () => succeeds = false, recover: () => succeeds = true };
}

test('continuous analysis speaks only changed suggestions, including A to B to A', async () => {
    const { spoken, say } = fixture();
    await Promise.all([say('e4'), say('e4')]);
    await say('e4');
    await say('d4');
    await say('d4');
    await say('e4');
    assert.deepEqual(spoken, ['e4', 'd4', 'e4']);
});

test('multiple suggestions and profiles retain independent speech state', async () => {
    const { spoken, say } = fixture();
    for(let depth = 0; depth < 3; depth++)
        await Promise.all([say('e4', 0), say('d4', 1)]);
    await say('e4', 0, 'secondary');
    assert.deepEqual(spoken, ['e4', 'd4', 'e4']);
});

test('board changes allow the same suggestion again', async () => {
    const { instance, spoken, say } = fixture();
    await say('e4');
    instance.currentFen = 'position-B';
    await say('e4');
    instance.currentFen = 'position-A';
    await say('e4');
    assert.deepEqual(spoken, ['e4', 'e4', 'e4']);
});

test('failed or stale speech does not suppress a later valid announcement', async () => {
    const { spoken, say, fail, recover } = fixture();
    fail();
    await say('e4');
    recover();
    await say('e4', 0, 'default', { isCurrent: () => false });
    await say('e4');
    await say('e4');
    assert.deepEqual(spoken, ['e4']);
});
