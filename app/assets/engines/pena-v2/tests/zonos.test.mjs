import test from 'node:test';
import assert from 'node:assert/strict';
import { PenaSpeech } from '../speech.js';
import { ZonosSpeech } from '../zonos.js';
import { normalizeZonosNumbers } from '../zonos-numbers.js';

test('ZONOS spells out numbers while leaving ambiguous formats intact', () => {
    assert.equal(normalizeZonosNumbers('135 hours, 27 hours and 1,350 games.'),
        'one hundred thirty five hours, twenty seven hours and one thousand three hundred fifty games.');
    assert.equal(normalizeZonosNumbers('0.5 points and 135th place.'),
        'zero point five points and one hundred thirty fifth place.');
    const ambiguous = '12:30, version 1.2.3, code 001, $135, 135%, 1234567890123456 and e4';
    assert.equal(normalizeZonosNumbers(ambiguous), ambiguous);
});

test('browser voice selection remains stable and supports explicitly selected Finnish voices', async () => {
    const original = { window: globalThis.window, SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance };
    const english = { voiceURI: 'english', lang: 'en-US' }, other = { voiceURI: 'other', lang: 'en-GB' };
    const finnish = { voiceURI: 'finnish', lang: 'fi-FI' };
    let voices = [english, other, finnish];
    const spoken = [], errors = [];
    globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    globalThis.window = { speechSynthesis: {
        getVoices: () => voices,
        speak: utterance => { spoken.push({ voice: utterance.voice.voiceURI, lang: utterance.lang }); utterance.onstart(); utterance.onend(); },
        cancel() {}
    } };
    const speech = new PenaSpeech(() => {}, error => errors.push(error.message));
    try {
        const settings = { penaSpeech: 'browser', penaBrowserVoice: 'auto', languageCode: 'en', penaSpeechRate: 1 };
        speech.say('First', settings);
        await speech.queue;
        voices = [finnish, other, english];
        speech.say('Second', settings);
        await speech.queue;
        speech.say('Third', { ...settings, penaBrowserVoice: 'finnish' });
        await speech.queue;
        assert.deepEqual(spoken, [{ voice: 'english', lang: 'en-US' }, { voice: 'english', lang: 'en-US' },
            { voice: 'finnish', lang: 'fi-FI' }]);
        speech.say('Missing', { ...settings, penaBrowserVoice: 'removed' });
        await speech.queue;
        assert.match(errors[0], /unavailable/i);
    } finally { speech.stop(); Object.assign(globalThis, original); }
});

test('ZONOS GPU failure falls back once and preserves spoken teaching marks', async () => {
    const original = { window: globalThis.window, SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance };
    const spoken = [], marks = [], progress = [], errors = [];
    globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    globalThis.window = { speechSynthesis: {
        getVoices: () => [{ lang: 'en-US' }],
        speak: utterance => { spoken.push(utterance.text); utterance.onstart(); utterance.onend(); },
        cancel() {}
    } };
    const speech = new PenaSpeech(() => {}, error => errors.push(error), update => progress.push(update));
    let attempts = 0;
    speech.request = async () => {
        attempts++;
        throw Object.assign(new Error('WebGPU out of memory'), { gpuUnavailable: true });
    };
    try {
        const settings = { penaSpeech: 'neural', languageCode: 'en', penaSpeechRate: 1 };
        speech.say('135 hours.', settings, () => {}, [{ at: 0, run: () => marks.push('first') }]);
        speech.say('Second.', settings, () => {}, [{ at: 0, run: () => marks.push('second') }]);
        await speech.queue;
        assert.deepEqual(spoken, ['135 hours.', 'Second.']);
        assert.deepEqual(marks, ['first', 'second']);
        assert.equal(attempts, 1);
        assert.equal(progress.filter(update => update.status === 'fallback').length, 1);
        assert.deepEqual(errors, []);
    } finally { speech.stop(); Object.assign(globalThis, original); }
});

test('ZONOS download failures are reported, not disguised as GPU fallback', async () => {
    const errors = [], progress = [];
    const speech = new PenaSpeech(() => {}, error => errors.push(error), update => progress.push(update));
    speech.request = async () => { throw new Error('Model download failed: HTTP 503'); };
    speech.say('First.', { penaSpeech: 'neural', penaSpeechRate: 1 });
    await speech.queue;
    assert.match(errors[0].message, /HTTP 503/);
    assert.equal(progress.some(update => update.status === 'fallback'), false);
    speech.stop();
});

test('GPU fallback waits for an already scheduled neural clip before speaking', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    const original = { window: globalThis.window, SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance };
    const spoken = [];
    globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    globalThis.window = { speechSynthesis: {
        getVoices: () => [{ lang: 'en-US' }],
        speak: utterance => { spoken.push(Date.now()); utterance.onstart(); utterance.onend(); },
        cancel() {}
    } };
    const speech = new PenaSpeech(() => {}, error => { throw error; });
    speech.context = { get currentTime() { return Date.now() / 1000; }, destination: {},
        createBuffer: (_, length, rate) => ({ duration: length / rate, copyToChannel() {} }),
        createBufferSource: () => ({ connect() {}, stop() {}, start() {} }) };
    speech.unlock = async () => {};
    let attempts = 0;
    speech.request = async () => {
        if(++attempts === 1) return { audio: new Float32Array(2000), sampleRate: 1000 };
        throw Object.assign(new Error('WebGPU out of memory'), { gpuUnavailable: true });
    };
    const settle = async () => { for(let i = 0; i < 24; i++) await Promise.resolve(); };
    try {
        const settings = { penaSpeech: 'neural', languageCode: 'en', penaSpeechRate: 1 };
        speech.say('First.', settings);
        speech.say('Second.', settings);
        await settle();
        t.mock.timers.tick(1020);
        await settle();
        t.mock.timers.tick(1299);
        await settle();
        assert.deepEqual(spoken, []);
        t.mock.timers.tick(1);
        await settle();
        assert.deepEqual(spoken, [2320]);
    } finally { speech.stop(); Object.assign(globalThis, original); }
});

test('ZONOS host rejects cancelled loads and ignores messages from other frames', async () => {
    const original = { window: globalThis.window, document: globalThis.document, location: globalThis.location };
    let listener, removed = 0;
    const messages = [];
    const child = { postMessage: message => messages.push(message) };
    globalThis.location = { origin: 'http://localhost' };
    globalThis.window = { addEventListener: (_, fn) => { listener = fn; }, removeEventListener() {} };
    globalThis.document = {
        createElement: () => ({ contentWindow: child, remove: () => { removed++; } }),
        body: { appendChild() {} }
    };
    try {
        const speech = new ZonosSpeech(() => {}, () => {});
        const cancelled = speech.speak('Cancelled', 'default_3765f0d1140c05c0');
        speech.dispose();
        await assert.rejects(cancelled, { name: 'AbortError' });
        assert.equal(removed, 1);
        const next = new ZonosSpeech(() => {}, () => {});
        const audio = next.speak('Keep the center.', 'default_3765f0d1140c05c0');
        listener({ origin: 'http://other', source: child, data: { type: 'host-ready' } });
        await Promise.resolve();
        assert.equal(messages.length, 0);
        listener({ origin: 'http://localhost', source: child, data: { type: 'host-ready' } });
        await Promise.resolve();
        assert.equal(messages.length, 1);
        listener({ origin: 'http://localhost', source: child, data: {
            id: messages[0].id, audio: new Float32Array([0.25, -0.5]).buffer, sampleRate: 44100
        } });
        assert.deepEqual([...((await audio).audio)], [0.25, -0.5]);
        next.dispose();
        assert.equal(removed, 2);
    } finally { Object.assign(globalThis, original); }
});

test('cancelling while a custom voice is read does not restart the host', async () => {
    const original = { window: globalThis.window, document: globalThis.document, caches: globalThis.caches };
    let finish, created = 0;
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    globalThis.document = { createElement: () => { created++; } };
    globalThis.caches = { open: async () => ({
        match: () => new Promise(resolve => { finish = () => resolve(new Response(new Blob(['voice']))); })
    }) };
    try {
        const voice = new ZonosSpeech(() => {}, () => {});
        const pending = voice.speak('Hello.', 'custom-test');
        await Promise.resolve();
        voice.dispose();
        finish();
        await assert.rejects(pending, { name: 'AbortError' });
        assert.equal(created, 0);
    } finally { Object.assign(globalThis, original); }
});

test('selecting ZONOS shows progress, supports cancellation, and reports readiness and errors', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    let browser;
    t.after(async () => { if(browser) await browser.close(); await new Promise(resolve => server.close(resolve)); });
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route('**/vendor/zonos3/engine.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `let finish;
        const pending = new Promise((resolve, reject) => {
            finish = type => type === 'ok' ? resolve() : reject(new Error(type === 'gpu' ? 'WebGPU out of memory' : 'HTTP 503'));
        });
        window.addEventListener('message', event => { if(event.data?.fixtureFinish) finish(event.data.fixtureFinish); });
        export const engine = { onFatal() {}, init(progress) {
            progress({ loaded: 1048576, total: 2097152 });
            return pending;
        } };
        export function localFetch() { return Promise.resolve(new Response(new Float32Array([0.25]).buffer)); }`
    }));
    await page.goto(`${url}/app/index.html`);
    await page.evaluate(async () => {
        localStorage.setItem('penaReadAloud', 'false');
        window.fixture = { config: { global: { penaEnabled: false, penaSpeech: 'browser' } } };
        window.USERSCRIPT = {
            getValue: async () => structuredClone(window.fixture.config),
            setValue: async (key, value) => { window.fixture.config = structuredClone(value); }
        };
        GET_GM_CFG_BASE_VALUE = async key => window.fixture.config.global[key];
        GET_PROFILE_FOR_INSTANCE = async () => null;
        const settings = await import('./assets/engines/pena-v2/app-settings.js');
        const service = await import('./assets/engines/pena-v2/service.js');
        settings.initializePenaSettings();
        service.initializePena();
        window.fixture.select = value => {
            const input = document.querySelector('#pena-floaty [data-key="penaSpeech"]');
            input.value = value;
            input.dispatchEvent(new Event('change'));
        };
        window.fixture.finish = value => document.querySelector('iframe[src*="zonos3/frame.html"]')
            .contentWindow.postMessage({ fixtureFinish: value }, location.origin);
    });
    const status = page.locator('#pena-floaty .pena-voice-progress');
    const bar = status.locator('progress');
    assert.equal(await page.evaluate(async () =>
        (await (await import('./assets/engines/pena-v2/preferences.js')).getPenaPreferences()).penaSpeech), 'browser',
    'An existing browser speech preference is preserved');
    assert.equal(await page.locator('iframe[src*="zonos3/frame.html"]').count(), 0);
    await page.evaluate(() => window.fixture.select('neural'));
    await page.waitForFunction(() => document.querySelector('#pena-floaty .pena-voice-progress progress')?.value === 1048576);
    await page.evaluate(() => { document.querySelector('#pena-window').hidden = false; });
    const windowProgress = page.locator('#pena-window .pena-voice-progress');
    const layout = await windowProgress.evaluate(element => {
        const bar = element.querySelector('progress');
        const label = element.querySelector('[role="status"]');
        const box = element.getBoundingClientRect();
        const barBox = bar.getBoundingClientRect();
        return {
            padding: getComputedStyle(element).paddingLeft,
            align: getComputedStyle(label).textAlign,
            fontSize: getComputedStyle(label).fontSize,
            appearance: getComputedStyle(bar).appearance,
            height: barBox.height,
            inset: barBox.left - box.left,
            rightInset: box.right - barBox.right
        };
    });
    assert.deepEqual(layout, { padding: '8px', align: 'center', fontSize: '11px',
        appearance: 'none', height: 10, inset: 8, rightInset: 8 });
    await page.evaluate(() => document.querySelector('#pena-floaty').showModal());
    assert.equal(await status.isVisible(), true);
    assert.equal(await bar.isVisible(), true);
    assert.equal(await status.getAttribute('hidden'), null);
    assert.equal(await bar.getAttribute('max'), '2097152');
    assert.match(await status.textContent(), /1 \/ 2 MiB/);
    assert.equal(await page.locator('#pena-window .pena-voice-progress progress').evaluate(el => el.value), 1048576);
    await status.locator('button').evaluate(button => button.click());
    assert.match(await status.textContent(), /cancelled/i);
    assert.equal(await page.locator('iframe[src*="zonos3/frame.html"]').count(), 0);
    await page.evaluate(() => window.fixture.select('neural'));
    await page.waitForFunction(() => document.querySelector('#pena-floaty .pena-voice-progress progress')?.value === 1048576);
    await page.evaluate(() => window.fixture.finish('ok'));
    await page.waitForFunction(() => document.querySelector('#pena-floaty .pena-voice-progress').hidden);
    assert.equal(await windowProgress.isVisible(), false);
    assert.equal(await page.locator('iframe[src*="zonos3/frame.html"]').count(), 1);
    await page.evaluate(() => window.fixture.select('browser'));
    await page.waitForFunction(() => !document.querySelector('iframe[src*="zonos3/frame.html"]'));
    assert.notEqual(await status.getAttribute('hidden'), null);
    await page.evaluate(() => window.fixture.select('neural'));
    await page.waitForFunction(() => document.querySelector('#pena-floaty .pena-voice-progress progress')?.value === 1048576);
    await status.locator('button').evaluate(button => button.click());
    await page.locator('#pena-window .pena-read-aloud').evaluate(button => button.click());
    await page.waitForFunction(() => document.querySelector('#pena-floaty .pena-voice-progress progress')?.value === 1048576);
    await page.locator('#pena-window .pena-read-aloud').evaluate(button => button.click());
    await page.waitForFunction(() => !document.querySelector('iframe[src*="zonos3/frame.html"]'));
    await page.evaluate(() => window.fixture.select('neural'));
    await page.waitForFunction(() => document.querySelector('#pena-floaty .pena-voice-progress progress')?.value === 1048576);
    await page.evaluate(() => window.fixture.finish('http'));
    await page.waitForFunction(() => document.querySelector('#pena-floaty .pena-voice-progress [role="status"]').textContent.includes('HTTP 503'));
    assert.doesNotMatch(await status.textContent(), /browser speech/i);
    await page.evaluate(() => window.fixture.select('neural'));
    await page.waitForFunction(() => document.querySelector('#pena-floaty .pena-voice-progress progress')?.value === 1048576);
    await page.evaluate(() => window.fixture.finish('gpu'));
    await page.waitForFunction(() => document.querySelector('#pena-floaty .pena-voice-progress [role="status"]').textContent.includes('browser speech'));
    await page.evaluate(() => window.fixture.select('browser'));
    await page.waitForFunction(() => document.querySelector('#pena-floaty .pena-voice-progress').hidden);
    await page.evaluate(() => window.fixture.select('neural'));
    await page.waitForFunction(() => document.querySelector('#pena-floaty .pena-voice-progress progress')?.value === 1048576);
    await page.evaluate(() => window.fixture.select('browser'));
    await page.waitForFunction(() => !document.querySelector('iframe[src*="zonos3/frame.html"]'));
    assert.notEqual(await status.getAttribute('hidden'), null);
});

test('prepared ZONOS is shared with speech', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    let browser;
    t.after(async () => { if(browser) await browser.close(); await new Promise(resolve => server.close(resolve)); });
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route('**/vendor/zonos3/engine.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `let initialized = false;
        export const engine = { onFatal() {}, async init(progress) {
            if(!initialized) { initialized = true; progress({ loaded: 1, total: 2 }); }
        } };
        export function localFetch(path) {
            return Promise.resolve(path === '/v2/speakers'
                ? Response.json({ id: 'spk_test' }) : new Response(new Float32Array([0.5]).buffer));
        }`
    }));
    await page.goto(`${url}/zonos-test-blank`);
    const result = await page.evaluate(async () => {
        const { PenaSpeech } = await import('/app/assets/engines/pena-v2/speech.js');
        const progress = [], errors = [];
        const speech = new PenaSpeech(() => {}, error => errors.push(error.message), update => progress.push(update));
        await speech.prepare();
        const frame = document.querySelector('iframe');
        const result = await speech.request({ text: 'Hello.' });
        const sameFrame = frame === document.querySelector('iframe');
        speech.unload();
        return { sample: result.audio[0], sameFrame, errors, ready: progress.some(update => update.status === 'ready') };
    });
    assert.deepEqual(result, { sample: 0.5, sameFrame: true, errors: [], ready: true });
});

test('Thaddeus is the default and existing voice choices are preserved', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    let browser;
    t.after(async () => { if(browser) await browser.close(); await new Promise(resolve => server.close(resolve)); });
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route('**/vendor/zonos3/engine.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `export const engine = { onFatal() {}, async init() {} };
        export async function localFetch(path, options) {
            const body = JSON.parse(options.body);
            parent.postMessage({ fixtureRequest: path, body }, location.origin);
            return new Response(new Float32Array([0.5]).buffer);
        }`
    }));
    await page.goto(`${url}/zonos-test-blank`);
    const result = await page.evaluate(async () => {
        const { getPenaPreferences } = await import('/app/assets/engines/pena-v2/preferences.js');
        const { ZonosSpeech } = await import('/app/assets/engines/pena-v2/zonos.js');
        const { PenaSpeech } = await import('/app/assets/engines/pena-v2/speech.js');
        let saved;
        window.GET_GM_CFG_BASE_VALUE = async key => key === 'penaZonosVoice' ? saved : undefined;
        const defaultVoice = (await getPenaPreferences()).penaZonosVoice;
        saved = 'builtin-pena';
        const migratedVoice = (await getPenaPreferences()).penaZonosVoice;
        saved = 'default_3765f0d1140c05c0';
        const savedVoice = (await getPenaPreferences()).penaZonosVoice;
        saved = 'custom-test';
        const customVoice = (await getPenaPreferences()).penaZonosVoice;
        const requests = [];
        window.addEventListener('message', event => { if(event.data?.fixtureRequest) requests.push(event.data); });
        const voice = new ZonosSpeech(() => {}, () => {});
        await voice.speak('135 hours.');
        await voice.speak('Second.');
        await voice.speak('Rupert.', savedVoice);
        voice.dispose();
        const progress = [];
        const speech = new PenaSpeech(() => {}, error => { throw error; }, update => progress.push(update.status));
        speech.zonos = { speak: async () => ({}) };
        speech.zonosReady = true;
        await speech.request({ text: 'First.' });
        await speech.request({ text: 'Second.' });
        return { defaultVoice, migratedVoice, savedVoice, customVoice, requests, progress };
    });
    assert.equal(result.defaultVoice, 'default_3c00e421e684f949');
    assert.equal(result.migratedVoice, result.defaultVoice);
    assert.equal(result.savedVoice, 'default_3765f0d1140c05c0');
    assert.equal(result.customVoice, 'custom-test');
    const registrations = result.requests.filter(request => request.fixtureRequest === '/v2/speakers');
    assert.equal(registrations.length, 0);
    const generations = result.requests.filter(request => request.fixtureRequest === '/v2/generate');
    assert.equal(generations[0].body.text, 'one hundred thirty five hours.');
    assert.deepEqual(generations.map(request => [request.body.speaker_embedding_id, request.body.speaker_mode]),
        [['default_3c00e421e684f949', 'reference'], ['default_3c00e421e684f949', 'reference'], ['default_3765f0d1140c05c0', 'reference']]);
    assert.deepEqual(result.progress, []);
});

test('ZONOS teaching uses cue-by-cue clips without downloading an alignment model', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    let browser;
    t.after(async () => { if(browser) await browser.close(); await new Promise(resolve => server.close(resolve)); });
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route('**/vendor/zonos3/engine.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `export const engine = { onFatal() {}, async init() {} };
        export async function localFetch(path, options) {
            const body = JSON.parse(options.body);
            parent.fixture.requests.push({ path, body });
            return new Response(new Float32Array(4410).buffer);
        }`
    }));
    await page.goto(`${url}/zonos-test-blank`);
    const result = await page.evaluate(async () => {
        window.fixture = { requests: [], cues: [] };
        const { PenaSpeech } = await import('/app/assets/engines/pena-v2/speech.js');
        const speech = new PenaSpeech(() => {}, error => { throw error; });
        speech.context = { get currentTime() { return performance.now() / 1000; }, destination: {},
            createBuffer: (_, length, rate) => ({ duration: length / rate, copyToChannel() {} }),
            createBufferSource: () => ({ connect() {}, stop() {}, start() {} }) };
        speech.unlock = async () => {};
        const text = 'After 135 hours the knight develops.';
        const cue = new Promise(resolve => {
            speech.say(text, { penaSpeech: 'neural', penaSpeechRate: 1, penaZonosVoice: 'default_3765f0d1140c05c0' },
                () => {}, [{ at: text.indexOf('knight'), run: () => { window.fixture.cues.push('knight'); resolve(); } }]);
        });
        await Promise.race([cue, new Promise((_, reject) => setTimeout(() => reject(new Error('Cue did not fire')), 3000))]);
        speech.stop();
        speech.unload();
        return { requests: window.fixture.requests, cues: window.fixture.cues };
    });
    assert.deepEqual(result.cues, ['knight']);
    assert.deepEqual(result.requests.map(request => request.path), ['/v2/generate', '/v2/generate']);
    assert.deepEqual(result.requests.map(request => request.body.text), ['After one hundred thirty five hours the ', 'knight develops.']);
});

test('custom ZONOS voice is saved locally, selectable, reused and removable', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    let browser;
    t.after(async () => { if(browser) await browser.close(); await new Promise(resolve => server.close(resolve)); });
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route('**/vendor/zonos3/engine.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `export const engine = { onFatal() {}, async init() {} };
        export async function localFetch(path, options) {
            const body = JSON.parse(options.body);
            parent.postMessage({ fixtureRequest: path, body, session: options.headers['X-TTS-Session-ID'] }, location.origin);
            if(path === '/v2/speakers') return Response.json({ id: 'spk_test' });
            return new Response(new Float32Array([0.5]).buffer);
        }`
    }));
    await page.goto(`${url}/app/index.html`);
    await page.evaluate(async () => {
        window.fixture = { config: { global: { penaEnabled: false, penaSpeech: 'browser' },
            instance: { fixture: { penaZonosVoice: 'default_3765f0d1140c05c0', penaBrowserVoice: 'old-voice' } } }, requests: [] };
        const voices = new EventTarget();
        window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
        voices.getVoices = () => [{ voiceURI: 'finnish', name: 'Finnish test voice', lang: 'fi-FI' }];
        voices.speak = utterance => { window.fixture.browserVoice = utterance.voice.voiceURI; utterance.onstart(); utterance.onend(); };
        voices.cancel = () => {};
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: voices });
        window.USERSCRIPT = {
            getValue: async () => structuredClone(window.fixture.config),
            setValue: async (_, value) => { window.fixture.config = structuredClone(value); }
        };
        GET_GM_CFG_BASE_VALUE = async (key, instanceID) =>
            window.fixture.config.instance?.[instanceID]?.[key] ?? window.fixture.config.global[key];
        GET_PROFILE_FOR_INSTANCE = async () => null;
        window.addEventListener('message', event => { if(event.data?.fixtureRequest) window.fixture.requests.push(event.data); });
        (await import('./assets/engines/pena-v2/app-settings.js')).initializePenaSettings();
        const { initializeDropdown } = await import('./assets/js/gui/domDropdown.js');
        for(const key of ['penaZonosVoice', 'penaBrowserVoice'])
            initializeDropdown(document.querySelector(`#pena-floaty [data-key="${key}"]`).closest('.dropdown-input'));
        (await import('./assets/engines/pena-v2/service.js')).initializePena();
        document.querySelector('#pena-floaty').showModal();
        SETTING_FILTER_OBJ.type = 'instance';
        SETTING_FILTER_OBJ.instanceID = 'fixture';
        document.querySelector('#pena-floaty [data-key="penaBrowserVoice"]').parentElement
            .querySelector('[data-value="finnish"]').click();
    });
    await page.waitForFunction(() => window.fixture.config.global.penaBrowserVoice === 'finnish'
        || window.fixture.config.instance.fixture.penaBrowserVoice === 'finnish');
    assert.equal(await page.evaluate(async () =>
        (await (await import('./assets/engines/pena-v2/preferences.js')).getPenaPreferences('other-board')).penaBrowserVoice), 'finnish');
    assert.match(await page.locator('#pena-floaty [data-value="finnish"]').textContent(), /Finnish test voice/);
    assert.equal(await page.evaluate(async () => {
        const { getPenaPreferences } = await import('./assets/engines/pena-v2/preferences.js');
        const { PenaSpeech } = await import('./assets/engines/pena-v2/speech.js');
        const speech = new PenaSpeech(() => {}, error => { throw error; });
        speech.say('Hello.', await getPenaPreferences('fixture'));
        await speech.queue;
        speech.stop();
        return window.fixture.browserVoice;
    }), 'finnish');
    await page.evaluate(() => {
        SETTING_FILTER_OBJ.type = 'global';
        SETTING_FILTER_OBJ.instanceID = null;
        const input = document.querySelector('#pena-floaty [data-key="penaSpeech"]');
        input.value = 'neural';
        input.dispatchEvent(new Event('change'));
    });
    await page.waitForFunction(() => window.fixture.config.global.penaSpeech === 'neural');
    await page.evaluate(() => {
        SETTING_FILTER_OBJ.type = 'instance';
        SETTING_FILTER_OBJ.instanceID = 'fixture';
        document.querySelector('#pena-floaty [data-key="penaZonosVoice"]').parentElement
            .querySelector('[data-value="default_b78b28baf5c31a1d"]').click();
    });
    await page.waitForFunction(() => window.fixture.config.global.penaZonosVoice === 'default_b78b28baf5c31a1d');
    const speakSelected = async () => page.evaluate(async () => {
        const { getPenaPreferences } = await import('./assets/engines/pena-v2/preferences.js');
        const { PenaSpeech } = await import('./assets/engines/pena-v2/speech.js');
        const errors = [];
        const speech = new PenaSpeech(() => {}, error => errors.push(error.message));
        speech.say('Hello.', await getPenaPreferences('fixture'));
        await speech.queue;
        speech.stop();
        return errors;
    });
    assert.deepEqual(await speakSelected(), []);
    assert.equal((await page.evaluate(() => window.fixture.requests.at(-1))).body.speaker_embedding_id, 'default_b78b28baf5c31a1d');
    const wav = Buffer.alloc(44 + 16000 * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
    await page.locator('#pena-floaty .pena-custom-voice input').setInputFiles({ name: 'voice.wav', mimeType: 'audio/wav', buffer: wav });
    await page.waitForFunction(() => window.fixture.config.global.penaZonosVoice?.startsWith('custom-'));
    const id = await page.evaluate(() => window.fixture.config.global.penaZonosVoice);
    assert.equal(await page.locator('#pena-floaty .pena-custom-voice button').last().isEnabled(), true);
    assert.deepEqual(await speakSelected(), []);
    assert.equal((await page.evaluate(() => window.fixture.requests.at(-1))).body.speaker_embedding_id, 'spk_test');
    await page.evaluate(() => { window.fixture.requests = []; });
    const result = await page.evaluate(async id => {
        const { customZonosVoices, readZonosVoice } = await import('./assets/engines/pena-v2/zonos-voices.js');
        const { ZonosSpeech } = await import('./assets/engines/pena-v2/zonos.js');
        const saved = await customZonosVoices();
        const voice = new ZonosSpeech(() => {}, () => {});
        await voice.speak('Preset.', 'default_b78b28baf5c31a1d');
        await voice.speak('First.', id);
        await voice.speak('Second.', id);
        voice.dispose();
        return { saved, bytes: (await readZonosVoice(id)).size, requests: window.fixture.requests };
    }, id);
    assert.equal(result.saved[0].name, 'voice.wav');
    assert.equal(result.bytes, wav.length);
    assert.equal(result.requests.filter(request => request.fixtureRequest === '/v2/speakers').length, 1);
    const generations = result.requests.filter(request => request.fixtureRequest === '/v2/generate');
    assert.equal(generations.length, 3);
    assert.equal(generations[0].body.speaker_embedding_id, 'default_b78b28baf5c31a1d');
    assert.equal(generations[0].body.speaker_mode, 'reference');
    assert.ok(generations.slice(1).every(request => request.body.speaker_embedding_id === 'spk_test'
        && request.body.speaker_mode === 'embedding' && request.body.language === 'en_us' && request.body.laci === true));
    assert.equal(generations[1].session, result.requests.find(request => request.fixtureRequest === '/v2/speakers').session);
    await page.locator('#pena-floaty .pena-custom-voice button').last().click();
    await page.waitForFunction(() => !window.fixture.config.global.penaZonosVoice.startsWith('custom-'));
    await page.waitForFunction(async () => !(await (await import('./assets/engines/pena-v2/zonos-voices.js')).customZonosVoices()).length);
});

test('a shared preparation failure is reported once to queued speech', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    let browser;
    t.after(async () => { if(browser) await browser.close(); await new Promise(resolve => server.close(resolve)); });
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route('**/vendor/zonos3/engine.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `let rejectLoad, calls = 0;
        const loading = new Promise((resolve, reject) => { rejectLoad = reject; });
        export const engine = { onFatal() {}, init() {
            if(++calls === 2) rejectLoad(new Error('HTTP 503'));
            return loading;
        } };
        export function localFetch() { throw new Error('Unexpected generation'); }`
    }));
    await page.goto(`${url}/zonos-test-blank`);
    const result = await page.evaluate(async () => {
        const { PenaSpeech } = await import('/app/assets/engines/pena-v2/speech.js');
        const errors = [];
        const speech = new PenaSpeech(() => {}, error => errors.push(error.message));
        const preparing = speech.prepare();
        speech.say('Hello.', { penaSpeech: 'neural', penaSpeechRate: 1 });
        await Promise.all([preparing, speech.queue]);
        speech.unload();
        return errors;
    });
    assert.deepEqual(result, ['HTTP 503']);
});

for(const [phase, mock] of [
    ['initialization', `export const engine = { onFatal() {}, async init() { throw new Error('WebGPU out of memory'); } };
        export function localFetch() { throw new Error('Unexpected generation'); }`],
    ['generation', `let fatal; export const engine = { onFatal(callback) { fatal = callback; }, async init() {} };
        export function localFetch() { queueMicrotask(() => fatal('WebGPU out of memory')); return new Promise(() => {}); }`]
]) test(`ZONOS frame reports a GPU failure during ${phase} and Pena switches to browser speech`, async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    let browser;
    t.after(async () => { if(browser) await browser.close(); await new Promise(resolve => server.close(resolve)); });
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route('**/vendor/zonos3/engine.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: mock
    }));
    await page.goto(`${url}/zonos-test-blank`);
    const result = await page.evaluate(async () => {
        const { PenaSpeech } = await import('/app/assets/engines/pena-v2/speech.js');
        const spoken = [], progress = [], errors = [], cues = [];
        window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
            getVoices: () => [{ lang: 'en-US' }],
            speak: utterance => { spoken.push(utterance.text); utterance.onstart(); utterance.onend(); },
            cancel() {}
        } });
        const speech = new PenaSpeech(() => {}, error => errors.push(error.message), update => progress.push(update));
        const settings = { penaSpeech: 'neural', penaSpeechRate: 1, languageCode: 'en' };
        speech.say('First.', settings, () => {}, [{ at: 0, run: () => cues.push('first') }]);
        speech.say('Second.', settings, () => {}, [{ at: 0, run: () => cues.push('second') }]);
        const finished = await Promise.race([speech.queue.then(() => true),
            new Promise(resolve => setTimeout(() => resolve(false), 5000))]);
        speech.stop();
        return { finished, spoken, progress, errors, cues, frames: document.querySelectorAll('iframe').length };
    });
    assert.equal(result.finished, true, JSON.stringify(result));
    assert.deepEqual(result.spoken, ['First.', 'Second.']);
    assert.deepEqual(result.cues, ['first', 'second']);
    assert.deepEqual(result.errors, []);
    assert.equal(result.progress.filter(update => update.status === 'fallback').length, 1);
    assert.equal(result.frames, 0);
});

test('stopping a pending ZONOS initialization removes its frame and suppresses stale cues', async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    let browser;
    t.after(async () => { if(browser) await browser.close(); await new Promise(resolve => server.close(resolve)); });
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route('**/vendor/zonos3/engine.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `export const engine = { onFatal() {}, init() {
            parent.postMessage({ type: 'test-pending' }, location.origin);
            return new Promise(() => {});
        } }; export function localFetch() {}`
    }));
    await page.goto(`${url}/zonos-test-blank`);
    await page.evaluate(async () => {
        const { PenaSpeech } = await import('/app/assets/engines/pena-v2/speech.js');
        window.testSpeech = { cues: [], errors: [], pending: false };
        window.addEventListener('message', event => {
            if(event.data?.type === 'test-pending') window.testSpeech.pending = true;
        });
        window.testSpeech.speech = new PenaSpeech(() => {}, error => window.testSpeech.errors.push(error.message));
        window.testSpeech.speech.say('First.', { penaSpeech: 'neural', penaSpeechRate: 1 }, () => {},
            [{ at: 0, run: () => window.testSpeech.cues.push('stale') }]);
    });
    await page.waitForFunction(() => window.testSpeech.pending);
    const result = await page.evaluate(async () => {
        window.testSpeech.speech.stop();
        await new Promise(resolve => setTimeout(resolve, 50));
        return { frames: document.querySelectorAll('iframe').length, cues: window.testSpeech.cues, errors: window.testSpeech.errors };
    });
    assert.deepEqual(result, { frames: 0, cues: [], errors: [] });
});

test('ZONOS app host synthesizes audible audio locally', { skip: !process.env.PENA_ZONOS_GPU_TEST, timeout: 180000 }, async t => {
    const { chromium } = await import('../../lc0/node_modules/playwright/index.mjs');
    const { startServer } = await import('../../../../../tests/maia-elo/serve.mjs');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    let browser;
    t.after(async () => { if(browser) await browser.close(); await new Promise(resolve => server.close(resolve)); });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage();
    page.on('pageerror', error => console.error('browser error:', error.message));
    page.on('requestfailed', request => console.error('request failed:', request.url(), request.failure()?.errorText));
    await page.goto(`${url}/zonos-test-blank`);
    await page.setContent('<button>Allow audio</button>');
    await page.locator('button').click();
    const result = await page.evaluate(async () => {
        const { ZonosSpeech } = await import('/app/assets/engines/pena-v2/zonos.js');
        const { PenaSpeech } = await import('/app/assets/engines/pena-v2/speech.js');
        const { saveZonosVoice, removeZonosVoice } = await import('/app/assets/engines/pena-v2/zonos-voices.js');
        const progress = [];
        const voice = new ZonosSpeech(update => progress.push(update), error => { throw error; });
        let custom;
        try {
            const start = performance.now();
            await voice.prepare();
            const text = 'Develop your knight and keep your king safe. Then control the center.';
            const { audio, sampleRate } = await voice.speak(text);
            const firstElapsed = (performance.now() - start) / 1000;
            const warmStart = performance.now();
            await voice.speak('Protect the center.');
            const warmElapsed = (performance.now() - warmStart) / 1000;
            const alternate = await voice.speak(text, 'default_b78b28baf5c31a1d');
            const rupert = await voice.speak(text, 'default_3765f0d1140c05c0');
            const response = await fetch('https://huggingface.co/Zyphra/ZONOS3-Mini/resolve/2921b8821772b0bd10a04456863d21abf9d2f283/web/voices/English/Imogen_en-British_F_1.wav');
            if(!response.ok) throw new Error(`Reference voice download failed: ${response.status}`);
            custom = await saveZonosVoice(new File([await response.blob()], 'reference.wav', { type: 'audio/wav' }));
            const imported = await voice.speak(text, custom.id);
            let peak = 0;
            for(const sample of audio) peak = Math.max(peak, Math.abs(sample));
            const audible = samples => samples.some(sample => Math.abs(sample) > 0.0001);
            const pitch = samples => {
                const pitches = [], step = 4, rate = sampleRate / step, size = 512;
                for(let start = 0; start + size * step < samples.length; start += size * step) {
                    let best = 0, lag = 0;
                    for(let offset = Math.floor(rate / 400); offset <= Math.ceil(rate / 65); offset++) {
                        let cross = 0, a = 0, b = 0;
                        for(let i = 0; i < size - offset; i++) {
                            const x = samples[start + i * step], y = samples[start + (i + offset) * step];
                            cross += x * y; a += x * x; b += y * y;
                        }
                        const score = cross / Math.sqrt(a * b);
                        if(score > best) { best = score; lag = offset; }
                    }
                    if(best > 0.65) pitches.push(rate / lag);
                }
                pitches.sort((a, b) => a - b);
                return pitches.length ? pitches[Math.floor(pitches.length / 2)] : 0;
            };
            const errors = [], cues = [];
            const speech = new PenaSpeech(() => {}, error => errors.push(error));
            speech.request = async () => ({ audio, sampleRate });
            let started;
            const heard = new Promise(resolve => { started = resolve; });
            speech.say('Protect the center.', { penaSpeech: 'neural', penaSpeechRate: 1.2 },
                started, [{ at: 0, run: () => cues.push('shown') }]);
            await Promise.race([heard, new Promise((_, reject) => setTimeout(() => reject(new Error('Audio did not start')), 5000))]);
            const audioDuration = [...speech.sources][0].buffer.duration;
            await speech.dispose();
            return { peak, seconds: audio.length / sampleRate, firstElapsed, warmElapsed, audioDuration, cues,
                errors: errors.map(error => error.message), progress: progress.length,
                byteProgress: progress.some(update => update.loaded > 0 && update.total >= update.loaded),
                alternateAudible: audible(alternate.audio), customAudible: audible(imported.audio),
                pitches: [pitch(rupert.audio), pitch(alternate.audio), pitch(imported.audio)] };
        } finally { voice.dispose(); if(custom) await removeZonosVoice(custom.id); }
    });
    console.log('ZONOS browser result:', result);
    assert.ok(result.seconds > 1 && result.peak > 0.0001);
    assert.ok(Math.abs(result.audioDuration - result.seconds / 1.2) < 0.01);
    assert.deepEqual(result.cues, ['shown']);
    assert.deepEqual(result.errors, []);
    assert.ok(result.progress > 0);
    assert.equal(result.byteProgress, true);
    assert.equal(result.alternateAudible, true);
    assert.equal(result.customAudible, true);
    assert.ok(result.pitches[0] > 0 && result.pitches[1] > result.pitches[0] * 1.2,
        `The feminine preset should sound distinct from Rupert: ${result.pitches}`);
    assert.ok(result.pitches[2] > result.pitches[0] * 1.15,
        `The feminine imported reference should sound distinct from Rupert: ${result.pitches}`);
});
