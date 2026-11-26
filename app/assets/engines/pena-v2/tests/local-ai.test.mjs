import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalAI } from '../local-ai.js';
import { isMobileDevice } from '../platform.js';
import { setupView } from '../setup-view.js';
import { penaStrings, penaText } from '../i18n.js';
import { readFile } from 'node:fs/promises';

class Socket {
    readyState = 0;
    sent = [];
    send(data) { this.sent.push(JSON.parse(data)); }
    reply(data) { this.onmessage({ data: JSON.stringify({ type: 'ai', ...data }) }); }
    close() { this.readyState = 3; this.onclose?.(); }
}

function fixture(t) {
    const ai = new LocalAI({ WebSocketClass: Socket });
    t.after(() => ai.close());
    ai.connect();
    ai.socket.readyState = 1;
    return ai;
}

test('local generation preserves reasoning and answer deltas without saving conversations', async t => {
    const ai = fixture(t), chunks = [];
    const result = ai.createChatCompletion({ messages: [{ role: 'user', content: 'Hello' }], onData: data => chunks.push(data) });
    const request = ai.socket.sent.at(-1);
    assert.equal(request.action, 'generate');
    ai.socket.reply({ requestId: request.requestId, phase: 'chunk', chunk: { choices: [{ delta: { reasoning_content: 'Thought' } }] } });
    ai.socket.reply({ requestId: request.requestId, phase: 'chunk', chunk: { choices: [{ delta: { content: 'Hi' } }] } });
    ai.socket.reply({ requestId: request.requestId, phase: 'complete' });
    await result;
    assert.equal(chunks[0].choices[0].delta.reasoning_content, 'Thought');
    assert.equal(chunks[1].choices[0].delta.content, 'Hi');
    assert.equal(ai.pending.size, 0);
});

test('a flat status with a string status field keeps the setup details', async t => {
    const statuses = [];
    const ai = new LocalAI({ WebSocketClass: Socket, onStatus: status => statuses.push(status) });
    t.after(() => ai.close());
    ai.connect();
    ai.socket.reply({ phase: 'status', requestId: null, state: 'offline', status: 'offline', setup: { installed: false } });
    assert.deepEqual([statuses.at(-1).state, statuses.at(-1).setup?.installed, statuses.at(-1).connected], ['offline', false, true]);
});

test('Pena-only connections report the server version or one legacy notice per connection', t => {
    const versions = [], statuses = [];
    const ai = new LocalAI({ WebSocketClass: Socket, onVersion: version => versions.push(version),
        onStatus: status => statuses.push(status) });
    t.after(() => ai.close());
    ai.connect();
    const first = ai.socket;
    first.onmessage({ data: JSON.stringify({ type: 'serverInfo', version: '1.2.1' }) });
    first.reply({ phase: 'status', requestId: null, state: 'offline' });
    assert.deepEqual(versions, ['1.2.1']);
    assert.equal(statuses.length, 1, 'Version reporting does not interrupt AI model state');
    first.readyState = 3;
    ai.connect();
    first.onmessage({ data: JSON.stringify({ type: 'serverInfo', version: '1.0.0' }) });
    ai.socket.reply({ phase: 'status', requestId: null, state: 'ready' });
    ai.socket.reply({ phase: 'status', requestId: null, state: 'ready' });
    assert.deepEqual(versions, ['1.2.1', null]);
});

test('local cancellation and disconnect reject pending requests', async t => {
    const ai = fixture(t), controller = new AbortController();
    const promise = ai.createChatCompletion({ messages: [], abortSignal: controller.signal });
    controller.abort();
    await assert.rejects(promise, { name: 'AbortError' });
    assert.equal(ai.socket.sent.at(-1).action, 'cancel');
    const pending = ai.promptInfo([], {});
    ai.socket.close();
    await assert.rejects(pending, /disconnected/);
    assert.equal(ai.pending.size, 0);
});

test('native tokenizer reports the actual selected model prompt size', async t => {
    const ai = fixture(t);
    const pending = ai.promptInfo([{ role: 'user', content: 'Hello' }], {});
    assert.deepEqual(ai.socket.sent.at(-1).options.messages, [{ role: 'user', content: 'Hello' }]);
    assert.equal(ai.socket.sent.at(-1).options.reasoning_effort, 'none');
    ai.socket.reply({ phase: 'promptInfo', requestId: ai.socket.sent.at(-1).requestId, tokens: 12, context: 8192 });
    assert.equal((await pending).tokens, 12);
});

test('phones and tablets are mobile, narrow desktop screens are not', () => {
    assert.equal(isMobileDevice({ userAgent: 'Mozilla Android', platform: 'Linux', maxTouchPoints: 5 }), true);
    assert.equal(isMobileDevice({ userAgent: 'Mozilla', platform: 'MacIntel', maxTouchPoints: 5 }), true);
    assert.equal(isMobileDevice({ userAgent: 'Mozilla Windows NT', platform: 'Win32', maxTouchPoints: 1 }), false);
    assert.equal(isMobileDevice({ userAgent: 'Mozilla', userAgentData: { mobile: true } }), true);
});

test('connection and setup guidance is translated for every supported language', async () => {
    const root = new URL('../../../../../assets/i18n/', import.meta.url);
    const { availableLanguages } = JSON.parse(await readFile(new URL('meta.json', root), 'utf8'));
    const disconnected = setupView({ connected: false });
    const outdated = setupView({ connected: true });
    const setup = setupView({ connected: true, setup: { installed: false, downloadBytes: 8700000000 } });
    const keys = [disconnected.text, disconnected.actionLabel, outdated.text,
        'connectingLocalServer', 'serverConnected', 'serverDisconnected',
        setup.actionLabel, 'startPena', 'resumeDownload',
        'chessCoaching', 'chessCoachingHint', 'chattingRaw', 'coachingUnchecked'];
    const previous = globalThis.TRANS_OBJ;
    try {
        for(const [language] of availableLanguages) {
            const data = JSON.parse(await readFile(new URL(`${language}.json`, root), 'utf8'));
            globalThis.TRANS_OBJ = data.translations;
            for(const key of keys) {
                assert.ok(data.translations.pena[key], `${language}: missing ${key}`);
                assert.equal(penaText(key), data.translations.pena[key]);
            }
            assert.ok(data.translations.pena[setup.text].includes('{size}'), `${language}: missing size placeholder`);
            assert.equal(penaText(setup.text, setup.values),
                data.translations.pena.setupPena.replace('{size}', '8.7 GB'));
        }
    } finally {
        if(previous === undefined) delete globalThis.TRANS_OBJ;
        else globalThis.TRANS_OBJ = previous;
    }
});

test('Finnish covers Pena settings and keeps interpolation placeholders', async () => {
    const data = JSON.parse(await readFile(new URL('../../../../../assets/i18n/fi.json', import.meta.url), 'utf8'));
    const translations = data.translations.pena;
    const placeholders = value => [...value.matchAll(/\{\w+\}/g)].map(match => match[0]).sort();
    for(const [key, english] of Object.entries(penaStrings)) {
        if(key === 'settingsTitle') continue;
        assert.ok(translations[key], `missing ${key}`);
        assert.deepEqual(placeholders(translations[key]), placeholders(english), key);
    }
    for(const key of ['chessCoaching', 'chessCoachingHint', 'chattingRaw', 'coachingUnchecked'])
        assert.notEqual(translations[key], penaStrings[key], key);
});
