const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

let browser, page;
before(async () => {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});
after(async () => { await browser?.close(); });
beforeEach(async () => {
    page = await browser.newPage();
    await page.route('http://acas.test/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if(pathname.endsWith('/gui/profiles.js')) {
            return route.fulfill({ contentType: 'text/javascript', body: 'export function setProfileBubbleStatus(...args) { window.statuses.push(args); }' });
        }
        if(pathname.endsWith('/misc/activityLog.js')) {
            return route.fulfill({ contentType: 'text/javascript', body: 'export function isActivityLoggingEnabled() { return false; } export function logActivity() {}' });
        }
        if(pathname.endsWith('/lc0/weight-storage.js')) {
            return route.fulfill({ contentType: 'text/javascript', body: 'export async function getLc0Weights() { return { name: "test.pb", arrayBuffer: async () => new Uint8Array([1]).buffer }; }' });
        }
        if(pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Engine fixture</title>' });
        return route.fulfill({ contentType: 'text/javascript', body: await fs.readFile(path.join(__dirname, '..', pathname), 'utf8') });
    });
    await page.goto('http://acas.test/');
    const globals = await fs.readFile(path.join(__dirname, '..', 'app/assets/js/globals.js'), 'utf8');
    const formatVariant = globals.match(/^function FORMAT_VARIANT\(str\) \{[\s\S]*?^\}/m);
    assert.ok(formatVariant, 'Production variant formatter must be available');
    await page.addScriptTag({ content: formatVariant[0] });
    await page.evaluate(async () => {
        window.loadEngine = (await import('/app/assets/js/instance/loadEngine.js')).default;
        window.statuses = [];
        window.events = [];
        window.workers = [];
        window.GET_PROFILE_FOR_INSTANCE = async () => ({ config: { chessEngine: 'maia3' } });
        window.WAIT_UNTIL_VAR = async predicate => { if(!predicate()) throw new Error('Instance not ready'); };
        window.toast = { warning: message => events.push(['warning', message]) };
        window.Worker = class {
            constructor(url, options) { this.url = url; this.options = options; workers.push(this); }
            postMessage() {}
            addEventListener() {}
            terminate() { this.terminated = true; }
        };
        window.instance = {
            instanceID: 'test', instanceReady: true, pV: { default: { chessVariant: 'chess' } }, engines: [],
            engineStartNewGame: async (variant, profile) => events.push(['start', variant, profile]),
            engineMessageProcessor: async (message, profile) => events.push(['message', message, profile]),
            setEngineWeight: async (weight, profile) => events.push(['weight', weight, profile]),
            Interface: { updateBoardFen: async options => events.push(['fen', options]) },
            close() { this.instanceClosed = true; events.push(['close']); }
        };
    });
});
afterEach(async () => { await page?.close(); });

test('readiness starts the profile and refreshes the current FEN once', async () => {
    const result = await page.evaluate(async () => {
        await loadEngine.call(instance, 'default');
        workers[0].onmessage({ data: true });
        workers[0].onmessage({ data: true });
        await new Promise(resolve => setTimeout(resolve, 0));
        return { events, engines: instance.engines.length, pending: instance.pendingEngineLoads.size };
    });
    assert.deepEqual(result, { events: [
        ['start', 'chess', 'default'],
        ['fen', { skipValidityChecks: true, specificProfileName: 'default' }]
    ], engines: 1, pending: 0 });
});

test('uploaded Lc0 weights toast once after searched output, not worker readiness', async () => {
    const result = await page.evaluate(async () => {
        const { trackLc0WeightUpload } = await import('/app/assets/js/gui/lc0WeightNotifications.js');
        toast.success = message => events.push(['success', message]);
        toast.instance = message => {
            events.push(['waiting', message]);
            return { close: () => events.push(['waiting-closed']) };
        };
        instance.pV.default.modernLc0Weight = 'uploaded';
        trackLc0WeightUpload('uploaded', 'network.pb.gz');
        await loadEngine.call(instance, 'default', 'modern-lc0');
        await new Promise(resolve => setTimeout(resolve, 0));
        workers[0].onmessage({ data: { type: 'ready' } });
        await new Promise(resolve => setTimeout(resolve, 0));
        const beforeSearch = events.filter(event => event[0] === 'success');
        for(let i = 0; i < 2; i++)
            workers[0].onmessage({ data: { type: 'uci', line: 'info nodes 1 score cp 3 pv e2e4' } });
        return { beforeSearch, notifications: events.filter(event =>
            ['waiting', 'waiting-closed', 'success'].includes(event[0])) };
    });
    assert.deepEqual(result, { beforeSearch: [], notifications: [
        ['waiting', 'Loading Lc0 weights: network.pb.gz'],
        ['waiting-closed'],
        ['success', 'Lc0 weights uploaded and loaded: network.pb.gz']
    ] });
});

for(const [variant, expected] of [['King of the Hill', 'kingofthehill'], ['Three-check', 'threecheck'], ['chess', 'chess']]) {
    test(`Fairy-Stockfish normalizes ${variant} before starting the profile`, async () => {
        const events = await page.evaluate(async variant => {
            instance.pV.default.chessVariant = variant;
            await loadEngine.call(instance, 'default', 'fairy-stockfish-nnue-wasm');
            workers[0].onmessage({ data: true });
            await new Promise(resolve => setTimeout(resolve, 0));
            return window.events;
        }, variant);
        assert.deepEqual(events, [
            ['start', expected, 'default'],
            ['fen', { skipValidityChecks: true, specificProfileName: 'default' }]
        ]);
    });
}

test('other engines retain their variant input at the loader boundary', async () => {
    const events = await page.evaluate(async () => {
        instance.pV.default.chessVariant = 'King of the Hill';
        await loadEngine.call(instance, 'default', 'maia3');
        workers[0].onmessage({ data: true });
        await new Promise(resolve => setTimeout(resolve, 0));
        return window.events;
    });
    assert.deepEqual(events[0], ['start', 'King of the Hill', 'default']);
});

test('Lc0 loads its weights before starting analysis', async () => {
    const events = await page.evaluate(async () => {
        instance.pV.default.lc0WeightName = 'maia-1500';
        await loadEngine.call(instance, 'default', 'lc0');
        workers[0].onmessage({ data: true });
        await new Promise(resolve => setTimeout(resolve, 0));
        return window.events;
    });

    assert.deepEqual(events.map(event => event[0]), ['weight', 'start', 'fen']);
    assert.deepEqual(events[0], ['weight', 'maia-1500', 'default']);
});

test('modern Lc0 starts with default weights without closing the instance', async () => {
    const result = await page.evaluate(async () => {
        await loadEngine.call(instance, 'default', 'modern-lc0');
        return { workers: workers.length, closed: Boolean(instance.instanceClosed), statuses, events };
    });
    assert.equal(result.workers, 1);
    assert.equal(result.closed, false);
    assert.deepEqual(result.statuses, []);
    assert.deepEqual(result.events, []);
});

test('modern Lc0 failure completes pending analysis without closing other profiles', async () => {
    const result = await page.evaluate(async () => {
        const calculation = { fen: 'test', finished: false };
        Object.assign(instance.pV.default, { modernLc0Weight: 'id', engineSettingsReady: true,
            pendingCalculations: [calculation], pendingCalculationRequest: {} });
        instance.CommLink = { analysisFailed: (profile, request, message) => events.push(['failed', profile, message]) };
        instance.suggestionMix = { failed: async profile => events.push(['mixFailed', profile]) };
        await loadEngine.call(instance, 'default', 'modern-lc0');
        await new Promise(resolve => setTimeout(resolve, 0));
        workers[0].onmessage({ data: { type: 'ready' } });
        workers[0].onmessage({ data: { type: 'error', message: 'GPU failed' } });
        return { closed: Boolean(instance.instanceClosed), finished: calculation.finished,
            ready: instance.pV.default.engineSettingsReady, engines: instance.engines.length,
            terminated: workers[0].terminated, events, statuses };
    });
    assert.equal(result.closed, false);
    assert.equal(result.finished, true);
    assert.equal(result.ready, false);
    assert.equal(result.engines, 0);
    assert.equal(result.terminated, true);
    assert.ok(result.events.some(event => event[0] === 'failed' && event[2] === 'GPU failed'));
    assert.ok(result.events.some(event => event[0] === 'warning' && /GPU failed/.test(event[1])));
});

test('Rodent failure completes pending analysis without closing other profiles', async () => {
    const result = await page.evaluate(async () => {
        const calculation = { fen: 'test', finished: false };
        Object.assign(instance.pV.default, { engineSettingsReady: true, pendingCalculations: [calculation] });
        instance.CommLink = { analysisFailed: (profile, request, message) => events.push(['failed', profile, message]) };
        await loadEngine.call(instance, 'default', 'rodent-v');
        workers[0].onmessage({ data: true });
        await new Promise(resolve => setTimeout(resolve, 0));
        workers[0].onmessage({ data: { type: 'error', message: 'Missing personality network' } });
        return { closed: Boolean(instance.instanceClosed), finished: calculation.finished,
            ready: instance.pV.default.engineSettingsReady, engines: instance.engines.length,
            terminated: workers[0].terminated, events };
    });
    assert.equal(result.closed, false);
    assert.equal(result.finished, true);
    assert.equal(result.ready, false);
    assert.equal(result.engines, 0);
    assert.equal(result.terminated, true);
    assert.ok(result.events.some(event => event[0] === 'warning' && /Missing personality network/.test(event[1])));
});

for(const outcome of ['resolved', 'rejected']) {
    test(`profile replacement cleans up Lc0 after weights are ${outcome} without another message`, async () => {
        const result = await page.evaluate(async outcome => {
            let resolveWeights, rejectWeights;
            instance.setEngineWeight = () => new Promise((resolve, reject) => {
                resolveWeights = resolve;
                rejectWeights = reject;
            });
            await loadEngine.call(instance, 'default', 'lc0');
            workers[0].onmessage({ data: true });
            const oldEngine = instance.engines[0];
            instance.pV.default = {};
            // A replacement engine and another profile must survive old-worker cleanup.
            const replacement = { profileName: 'default', worker: { terminated: false } };
            const otherProfile = { profileName: 'other', worker: { terminated: false } };
            instance.engines.push(replacement, otherProfile);
            if(outcome === 'resolved') resolveWeights();
            else rejectWeights(new Error('Weights failed after replacement'));
            await new Promise(resolve => setTimeout(resolve, 0));
            return {
                events, terminated: workers[0].terminated,
                oldEngineRetained: instance.engines.includes(oldEngine),
                replacementRetained: instance.engines.includes(replacement),
                otherProfileRetained: instance.engines.includes(otherProfile),
                replacementTerminated: replacement.worker.terminated,
                otherProfileTerminated: otherProfile.worker.terminated,
                pending: instance.pendingEngineLoads.size
            };
        }, outcome);
        assert.deepEqual(result, {
            events: [], terminated: true, oldEngineRetained: false,
            replacementRetained: true, otherProfileRetained: true,
            replacementTerminated: false, otherProfileTerminated: false, pending: 0
        });
    });
}

test('external engines start without creating a browser worker', async () => {
    const result = await page.evaluate(async () => {
        Object.assign(instance.pV.default, { useExternalChessEngine: true, externalChessEngine: 'local-engine' });
        await loadEngine.call(instance, 'default');
        await new Promise(resolve => setTimeout(resolve, 0));
        return { events, workers: workers.length };
    });
    assert.equal(result.workers, 0);
    assert.deepEqual(result.events.map(event => event[0]), ['start', 'fen']);
});

test('an unselected external engine warns without starting analysis', async () => {
    const result = await page.evaluate(async () => {
        instance.pV.default.useExternalChessEngine = true;
        await loadEngine.call(instance, 'default');
        return { events, statuses, workers: workers.length };
    });
    assert.deepEqual(result.events, []);
    assert.equal(result.workers, 0);
    assert.equal(result.statuses[0][0], 'warning');
});

test('worker errors close the instance once and release pending loads', async () => {
    const result = await page.evaluate(async () => {
        await loadEngine.call(instance, 'default', 'maia2');
        workers[0].onerror({ message: 'Failed to load' });
        workers[0].onerror({ message: 'Failed to load again' });
        return { events, pending: instance.pendingEngineLoads.size, terminated: workers[0].terminated };
    });
    assert.deepEqual(result, { events: [['close']], pending: 0, terminated: true });
});
