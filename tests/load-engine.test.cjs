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
