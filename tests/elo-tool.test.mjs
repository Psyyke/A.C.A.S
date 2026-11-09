// Tests for the public Elo estimator tool (tools/). Pure maths run in Node;
// the browser test plays real games and needs: npm install --no-save --package-lock=false playwright
import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateRating, nextOpponent, expectedScore, tally, ratingRange } from '../tools/eloeye/eloMatch.js';
import { startServer } from './maia-elo/serve.mjs';

// Small seeded PRNG so the Monte-Carlo test is reproducible.
const seeded = seed => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
};

function simulate(trueRating, count, random) {
    const games = [];
    for(let i = 0; i < count; i++) {
        const opponent = nextOpponent(games);
        const p = expectedScore(trueRating, opponent);
        const draw = random() < 0.2;
        const score = draw ? 0.5 : random() < p ? 1 : 0;
        games.push({ opponent, score });
    }
    return games;
}

test('estimateRating recovers the rating from balanced results', () => {
    const games = [1, 0, 1, 0, 0.5, 0.5, 1, 0].map(score => ({ opponent: 1500, score }));
    const { rating, status } = estimateRating(games);
    assert.equal(status, 'ok');
    assert.ok(Math.abs(rating - 1500) < 5, `rating ${rating}`);
});

test('estimateRating saturates on perfect and hopeless results', () => {
    const wins = Array.from({ length: 20 }, () => ({ opponent: 1500, score: 1 }));
    const losses = Array.from({ length: 20 }, () => ({ opponent: 1500, score: 0 }));
    assert.equal(estimateRating(wins).status, 'above');
    assert.equal(estimateRating(losses).status, 'below');
});

test('nextOpponent stays on the supported scale and moves with results', () => {
    const first = nextOpponent([]);
    assert.ok(first >= ratingRange.min && first <= ratingRange.max && first % 10 === 0);
    const winning = Array.from({ length: 10 }, () => ({ opponent: 1500, score: 1 }));
    const losing = Array.from({ length: 10 }, () => ({ opponent: 1500, score: 0 }));
    assert.ok(nextOpponent(winning) > nextOpponent(losing));
});

test('tally counts results', () => {
    const result = tally([{ score: 1 }, { score: 0.5 }, { score: 0 }, { score: 1 }]);
    assert.deepEqual([result.wins, result.draws, result.losses], [2, 1, 1]);
});

test('Monte-Carlo: 40 adaptive games are unbiased with RMSE under 70', () => {
    const random = seeded(7);
    for(const trueRating of [1000, 1500, 2000]) {
        const errors = Array.from({ length: 200 }, () => estimateRating(simulate(trueRating, 40, random)).rating - trueRating);
        const bias = errors.reduce((a, b) => a + b, 0) / errors.length;
        const rmse = Math.sqrt(errors.reduce((a, b) => a + b * b, 0) / errors.length);
        assert.ok(Math.abs(bias) < 20, `bias ${bias} at ${trueRating}`);
        assert.ok(rmse < 70, `rmse ${rmse} at ${trueRating}`);
    }
});

// Browser tests drive the real tool with a mock direct GUI endpoint.
let playwrightAvailable = true;
try { await import('playwright'); } catch { playwrightAvailable = false; }
const skip = playwrightAvailable ? false : 'playwright not installed: npm install --no-save --package-lock=false playwright';
const timeout = 300000;

async function withTool(behaviour, body, { viewport, automaticBudget, moveSampling = true, hintDelayMs = 50 } = {}) {
    const previousIsolate = process.env.ISOLATE;
    process.env.ISOLATE = '0';
    const { chromium } = await import('playwright');
    const { mockUserscript } = await import('./elo-tool/mockUserscript.js');
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage(viewport ? { viewport } : undefined);
        const local = new URL(url).host;
        // Ads, analytics and CDN fonts are irrelevant here and slow the page down.
        await page.route('**/*', route => new URL(route.request().url()).host === local ? route.continue() : route.abort());
        if(automaticBudget) await page.route('**/eloPolicy.js*', async route => {
            const response = await route.fetch();
            await route.fulfill({ response, body: (await response.text()).replace('maxGames: 1000', `maxGames: ${automaticBudget}`) });
        });
        if(!moveSampling) await page.route('**/eloPlayer.js*', async route => {
            const response = await route.fetch();
            await route.fulfill({ response, body: (await response.text()).replace('const sampler = games.length < automaticRun.minGames', 'const sampler = false') });
        });
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
            Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
        });
        if(behaviour) await page.addInitScript(mockUserscript, { behaviour, delayMs: hintDelayMs });
        await body(page, url);
    } finally {
        if(previousIsolate === undefined) delete process.env.ISOLATE;
        else process.env.ISOLATE = previousIsolate;
        await browser.close();
        server.close();
    }
}

async function start(page, url, { mode = 'auto', games = 4, boards = 2 } = {}) {
    if(boards === 1) await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2, configurable: true }));
    await page.goto(`${url}/tools/eloeye/index.html?fast`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(data => localStorage.setItem('acasEloCheckpoint', JSON.stringify(data)),
        { version: 1, protocol: 'maia-top-policy-paired-openings-pooled-personality-v6', mode, total: games, boards, games: [] });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.click('#start');
}

async function finishes(page, expectedGames) {
    await page.waitForFunction(() => document.getElementById('estimate-label')?.textContent === 'Estimated range'
        && document.getElementById('stop').hidden, null, { timeout: 240000 });
    assert.match((await page.locator('#rating').textContent()).trim(), /^(\d+|Above 2600|Below 600|Near \/ above 2600|Near \/ below 600)$/);
    assert.match(await page.locator('#match-status').textContent(), new RegExp(`${expectedGames} matches`));
    assert.match(await page.locator('#match-status').textContent(), /\(\d+\/\d+\/\d+\)/);
}

for(const behaviour of ['moves', 'multi', 'illegal', 'unsafe-first']) {
    test(`config that gives moves (${behaviour}) plays a match on two boards`, { skip, timeout }, () => withTool(behaviour, async (page, url) => {
        await start(page, url);
        await page.waitForSelector('.board-session');
        await finishes(page, 4);
        if(behaviour === 'moves') {
            const result = await page.evaluate(() => JSON.parse(sessionStorage.getItem('acasEloResult')));
            assert.ok(result.games.every(game => game.moveEvidence?.version === 1));
            assert.ok(result.games.every(game => game.moveEvidence.moves <= 24));
            assert.ok(result.games.some(game => game.moveEvidence.moves > 0));
        }
    }));
}

test('hybrid keeps move evidence internal and measures overhead against outcome-only play', { skip, timeout }, async t => {
    const runs = [];

    for(const moveSampling of [false, true]) {
        await withTool('moves', async (page, url) => {
            await page.addInitScript(() => {
                let seed = 89271;
                Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
            });
            const before = Date.now();
            await start(page, url, { games: 4, boards: 2 });
            await finishes(page, 4);
            const duration = Date.now() - before;
            const saved = await page.evaluate(() => ({
                result: JSON.parse(sessionStorage.getItem('acasEloResult'))
            }));
            runs.push({ duration, ...saved });

            if(!moveSampling) return;
            assert.ok(saved.result.games.some(game => game.moveEvidence?.moves > 0));
            assert.equal(await page.locator('#move-estimate').count(), 0);
        }, { moveSampling, hintDelayMs: 300 });
    }

    const outcomes = run => run.result.games.slice(0, 2).map(({ opponent, score }) => ({ opponent, score }));
    assert.deepEqual(outcomes(runs[0]), outcomes(runs[1]), 'sampling does not change the initial opponents or played moves');
    t.diagnostic(`Seeded four-game run, 300 ms mock hints: outcome-only ${runs[0].duration} ms, hybrid ${runs[1].duration} ms; wall-time ratio ${(runs[1].duration / runs[0].duration).toFixed(2)}`);
});

for(const boards of [1, 2, 3, 4, 5, 6]) {
    test(`automatic ${boards}-board run uses every lane and finishes its planned groups`, { skip, timeout }, () => withTool('moves', async (page, url) => {
        await page.goto(`${url}/tools/eloeye/index.html?fast`);
        await page.selectOption('#boards', String(boards));
        await page.click('#start');
        await page.waitForFunction(count => document.querySelectorAll('.board-session:not([hidden])').length === count,
            boards, { timeout: 120000 });
        const first = await page.evaluate(() => JSON.parse(localStorage.getItem('acasEloCheckpoint')));
        const groupSize = Math.max(2, Math.ceil(boards / 2) * 2);
        assert.equal(first.boards, boards);
        assert.equal(first.batch.length, groupSize);
        assert.deepEqual(first.batch.map(game => game.opponent),
            groupSize === 2 ? [1500, 1500] : groupSize === 4 ? [1000, 1000, 2200, 2200] : [1000, 1000, 1600, 1600, 2200, 2200]);
        assert.deepEqual(first.batch.map(game => game.opening), Array.from({ length: groupSize }, (_, i) => Math.floor(i / 2)));
        await page.waitForFunction(count => {
            const boards = [...document.querySelectorAll('.board-session:not([hidden])')];
            return boards.length === count && boards.every(board => window.mockGuiSessions.get(board.dataset.sessionId)?.firstFen);
        }, boards);
        const startingPositions = await page.evaluate(async () => {
            const { loadOpenings } = await import('/tools/eloeye/openings.js');
            const openings = await loadOpenings();
            return [...document.querySelectorAll('.board-session:not([hidden])')].map((board, index) => ({
                actual: window.mockGuiSessions.get(board.dataset.sessionId).firstFen, expected: openings[Math.floor(index / 2)].fen
            }));
        });
        startingPositions.forEach(position => assert.equal(position.actual, position.expected));
        await finishes(page, 12);
        const result = await page.evaluate(() => JSON.parse(sessionStorage.getItem('acasEloResult')));
        assert.equal(result.games.length, 12);
        assert.equal(result.estimate.reason, 'budget');
        for(let index = 0; index < result.games.length; index += 2) {
            const [white, black] = result.games.slice(index, index + 2);
            assert.equal(white.opponent, black.opponent);
            assert.equal(white.opening, index / 2);
            assert.equal(black.opening, index / 2);
            assert.equal(white.acasIsWhite, true);
            assert.equal(black.acasIsWhite, false);
            assert.ok([0, 0.5, 1].includes(white.score));
            assert.ok([0, 0.5, 1].includes(black.score));
        }
        const checkpoint = await page.evaluate(() => JSON.parse(localStorage.getItem('acasEloCheckpoint')));
        assert.deepEqual(checkpoint.games, result.games);
        assert.deepEqual(checkpoint.batch, []);
        assert.equal(await page.locator('.board-session, iframe.board-frame').count(), 0);
        assert.equal(await page.evaluate(() => window.mockGuiSessions.size), 0);
    }, { automaticBudget: 12 }));
}

test('a game where A.C.A.S stays silent is restarted, not scored', { skip, timeout }, () => withTool('flaky', async (page, url) => {
    await start(page, url, { boards: 1 });
    await finishes(page, 4);
}));

test('hint-only config is played by hand', { skip, timeout }, () => withTool('partial', async (page, url) => {
    await start(page, url, { mode: 'manual' });
    await page.waitForFunction(() => [...window.mockGuiSessions.values()].some(session =>
        session.fen?.split(' ')[1] === session.orientation), null, { timeout: 120000 });
    assert.equal(await page.locator('.board-session').count(), 1);
    assert.equal(await page.locator('iframe.board-frame').count(), 0);
    await page.locator('.board-session').scrollIntoViewIfNeeded();
    const drop = await page.evaluate(async () => {
        const { Chess } = await import('/app/assets/engines/libraries/chessjs/chess.js');
        const board = document.querySelector('.board-session'), session = window.mockGuiSessions.get(board.dataset.sessionId);
        const chess = new Chess(session.fen), move = chess.moves({ verbose: true })[0];
        const bounds = board.querySelector('cg-board').getBoundingClientRect();
        const point = square => {
            const file = square.charCodeAt(0) - 97, rank = Number(square[1]) - 1;
            return { x: bounds.x + (session.orientation === 'b' ? 7.5 - file : file + 0.5) * bounds.width / 8,
                y: bounds.y + (session.orientation === 'b' ? rank + 0.5 : 7.5 - rank) * bounds.height / 8 };
        };
        chess.move(move);
        return { from: point(move.from), to: point(move.to), expected: chess.fen().split(' ')[0] };
    });
    await page.mouse.move(drop.from.x, drop.from.y);
    await page.mouse.down();
    await page.mouse.move(drop.to.x, drop.to.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(expected => [...window.mockGuiSessions.values()].some(session =>
        session.positions.has(expected)), drop.expected);
    await page.waitForTimeout(2000);
    assert.equal(await page.locator('#form-error').isHidden(), true);

    await page.click('#stop');
    await page.waitForFunction(() => !document.getElementById('start').hidden);
    assert.match(await page.locator('#form-error').textContent(), /Stopped/);
}));

test('personality percentages validate, persist and stay locked across a four-board run and resume', { skip, timeout }, () => withTool('blunders', async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    await page.click('#personality summary');
    await page.check('#mix-detailed');
    await page.setViewportSize({ width: 390, height: 844 });
    const layout = await page.locator('#personality').evaluate(element => ({
        right: element.getBoundingClientRect().right, width: window.innerWidth
    }));
    assert.ok(layout.right <= layout.width, 'Suggestion controls must fit a phone viewport');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.selectOption('#boards', '4');
    await page.fill('#mix-blunder', '99');
    assert.equal(await page.locator('#mix-best').inputValue(), '0.9');
    assert.equal(await page.locator('#mix-secondary').inputValue(), '0.1');
    assert.equal(await page.locator('.board-session').count(), 0);
    await page.fill('#mix-blunder', '100');
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#mix-blunder').inputValue(), '100');
    assert.equal(await page.locator('#mix-best').inputValue(), '0');
    await page.click('#start');
    await page.waitForFunction(() => document.querySelectorAll('.board-session').length === 4, null, { timeout: 120000 });
    assert.equal(await page.locator('#mix-blunder').isDisabled(), true);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('acasEloCheckpoint')));
    assert.equal(saved.selectionWeights.blunder, 100);
    assert.equal(await page.locator('iframe.board-frame').count(), 0);
    await page.click('#stop');
    await page.waitForFunction(() => !document.getElementById('start').hidden);
    assert.equal(await page.locator('#mix-best').isDisabled(), true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#mix-blunder').inputValue(), '100');
    assert.equal(await page.locator('#mix-blunder').isDisabled(), true);
    await page.click('#discard-checkpoint');
    assert.equal(await page.locator('#mix-blunder').isDisabled(), false);
}, { automaticBudget: 12 }));

test('per-board Maia workers persist, run independently and close on stop', { skip, timeout }, () => withTool('moves', async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    assert.equal(await page.locator('#multiple-workers').isChecked(), false);
    await page.check('#multiple-workers');
    await page.selectOption('#boards', '4');
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#multiple-workers').isChecked(), true);
    const maiaWorkers = () => page.workers().filter(worker => worker.url().endsWith('/maiaWorker.js'));
    await page.click('#start');
    await page.waitForFunction(() => document.querySelectorAll('.board-session').length === 4, null, { timeout: 120000 });
    assert.equal(maiaWorkers().length, 4);
    assert.equal(await page.locator('#multiple-workers').isDisabled(), true);
    await page.waitForFunction(() => [...window.mockGuiSessions.values()].some(session => session.positions.size > 2), null, { timeout: 120000 });
    const closed = Promise.all(maiaWorkers().map(worker => worker.waitForEvent('close')));
    await page.click('#stop');
    await page.waitForFunction(() => !document.getElementById('start').hidden);
    await closed;
    assert.equal(maiaWorkers().length, 0);
    assert.equal(await page.locator('#multiple-workers').isEnabled(), true);
    await page.selectOption('#boards', '6');
    await page.click('#start');
    await page.waitForSelector('.board-session', { timeout: 120000 });
    assert.equal(maiaWorkers().length, 6);
    const sixClosed = Promise.all(maiaWorkers().map(worker => worker.waitForEvent('close')));
    await page.click('#stop');
    await page.waitForFunction(() => !document.getElementById('start').hidden);
    await sixClosed;
    await page.uncheck('#multiple-workers');
    await page.click('#start');
    await page.waitForSelector('.board-session', { timeout: 120000 });
    assert.equal(maiaWorkers().length, 1);
    const sharedClosed = maiaWorkers()[0].waitForEvent('close');
    await page.click('#stop');
    await page.waitForFunction(() => !document.getElementById('start').hidden);
    await sharedClosed;
    assert.equal(maiaWorkers().length, 0);
}, { automaticBudget: 12 }));

test('per-board Maia completes games and releases workers at the result', { skip, timeout }, () => withTool('moves', async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    await page.check('#multiple-workers');
    await start(page, url, { games: 2 });
    await page.waitForSelector('.board-session', { timeout: 120000 });
    const workers = page.workers().filter(worker => worker.url().endsWith('/maiaWorker.js'));
    assert.equal(workers.length, 2);
    const closed = Promise.all(workers.map(worker => worker.waitForEvent('close')));
    await finishes(page, 2);
    await closed;
    assert.equal(page.workers().filter(worker => worker.url().endsWith('/maiaWorker.js')).length, 0);
    assert.equal(await page.locator('#form-error').isHidden(), true);
}));

test('per-board Maia initialization failure disposes every created opponent', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.route('**/Maia3/maiaEngine.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `export default class {
            constructor() { (window.testEngines ??= []).push(this); this.index = window.testEngines.length; }
            async init() { if(this.index === 3) throw new Error('Model load failed'); }
            dispose() { this.disposed = true; }
        }`
    }));
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    const result = await page.evaluate(async () => {
        const { runMatch } = await import('/tools/eloeye/eloPlayer.js');
        let error;
        try {
            await runMatch({ mode: 'auto', boards: 4, multipleWorkers: true,
                mount() { throw new Error('Games must not start after failed initialization'); } });
        } catch(caught) { error = caught.message; }
        return { error, engines: window.testEngines.map(engine => engine.disposed) };
    });
    assert.equal(result.error, 'Model load failed');
    assert.deepEqual(result.engines, [true, true, true, true]);
}));

test('one unfinished saved game completes before the next four-board group starts', { skip, timeout }, () => withTool('moves', async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    await page.evaluate(() => localStorage.setItem('acasEloCheckpoint', JSON.stringify({
        version: 2, protocol: 'maia-top-policy-paired-openings-pooled-personality-v6',
        mode: 'auto', boards: 4, total: 12, games: [], batch: [
            { opponent: 1500, opening: 0, acasIsWhite: true, score: 0 },
            { opponent: 1500, opening: 0, acasIsWhite: false }
        ]
    })));
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#run-plan').textContent(), 'Up to 12 matches.');
    await page.click('#start');
    await page.waitForSelector('.board-session');
    assert.equal(await page.locator('.board-session').count(), 1);
    await page.waitForFunction(() => document.querySelectorAll('.board-session').length === 4, null, { timeout: 120000 });
    await page.click('#stop');
    await page.waitForFunction(() => !document.getElementById('start').hidden);
    assert.equal(await page.evaluate(() => window.mockGuiSessions.size), 0);
}, { automaticBudget: 12 }));

test('opt-in blunder-only personality completes games instead of rejecting its selected category', { skip, timeout }, () => withTool('blunders', async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    await page.click('#personality summary');
    await page.check('#mix-detailed');
    await page.fill('#mix-blunder', '100');
    await page.evaluate(() => {
        const settings = JSON.parse(localStorage.getItem('acasEloSettings'));
        localStorage.setItem('acasEloCheckpoint', JSON.stringify({
            version: 1, protocol: 'maia-top-policy-paired-openings-pooled-personality-v6',
            mode: 'auto', boards: 2, total: 2, games: [], selectionWeights: settings.selectionWeights
        }));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.click('#start');
    await finishes(page, 2);
    assert.equal(await page.locator('#form-error').isHidden(), true);
    const result = await page.evaluate(() => JSON.parse(sessionStorage.getItem('acasEloResult')));
    assert.equal(result.selectionWeights.blunder, 100);
}));

test('a config that never answers is reported, not hung', { skip, timeout }, () => withTool('silent', async (page, url) => {
    await start(page, url);
    await page.waitForFunction(() => !document.getElementById('form-error').hidden, null, { timeout: 280000 });
    assert.equal(await page.locator('.board-session').count(), 0);
}));

test('unavailable mix uses shown moves with warnings saved through checkpoints and results', { skip, timeout }, () => withTool('moves', async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    await page.click('#personality summary');
    await page.check('#mix-detailed');
    await page.fill('#mix-mistake', '100');
    await page.evaluate(() => {
        const settings = JSON.parse(localStorage.getItem('acasEloSettings'));
        localStorage.setItem('acasEloCheckpoint', JSON.stringify({
            version: 1, protocol: 'maia-top-policy-paired-openings-pooled-personality-v6',
            mode: 'auto', boards: 2, total: 2, games: [], selectionWeights: settings.selectionWeights
        }));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.click('#start');
    await page.waitForSelector('#mix-warning:not([hidden])', { timeout: 120000 });
    assert.match(await page.locator('#mix-warning').textContent(), /another shown move/);
    await finishes(page, 2);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('acasEloCheckpoint')));
    assert.equal(saved.games.every(game => game.suggestionFallback === true), true);
    const result = await page.evaluate(() => JSON.parse(sessionStorage.getItem('acasEloResult')));
    assert.equal(result.games.every(game => game.suggestionFallback === true), true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#mix-warning:not([hidden])', { timeout: 120000 });
    assert.match(await page.locator('#mix-warning').textContent(), /another shown move/);
}));

test('likelihood failures stop visibly without scoring unfinished games', { skip, timeout }, () => withTool('moves', async (page, url) => {
    const errors = [];
    page.on('console', message => {
        if(message.type() === 'error') errors.push(message.text());
    });
    await page.route('**/eloPlayer.js', async route => {
        const response = await route.fetch();
        await route.fulfill({
            response,
            body: (await response.text()).replace('async likelihood(fen, move) {',
                'async likelihood(fen, move) { throw new Error("Injected likelihood failure");')
        });
    });
    await start(page, url);
    await page.waitForSelector('#form-error:not([hidden])', { timeout: 120000 });
    assert.ok(errors.some(message => message.includes('Injected likelihood failure')), errors.join('\n'));
    assert.equal(await page.locator('.board-session').count(), 0);
    const checkpoint = await page.evaluate(() => JSON.parse(localStorage.getItem('acasEloCheckpoint')));
    assert.equal(checkpoint.games.length, 0);
    assert.equal(checkpoint.batch, undefined);
}));

test('resumed late runs use only results without starting new move analysis', { skip, timeout }, () => withTool('moves', async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    await page.evaluate(() => {
        const games = Array.from({ length: 16 }, (_, index) => ({
            opponent: 1500, score: 0.5, acasIsWhite: index % 2 === 0, opening: Math.floor(index / 2)
        }));
        localStorage.setItem('acasEloCheckpoint', JSON.stringify({
            version: 1, protocol: 'maia-top-policy-paired-openings-pooled-personality-v6',
            mode: 'auto', total: 18, boards: 2, games
        }));
    });
    await page.reload();
    await page.evaluate(async () => {
        const { Opponent } = await import('/tools/eloeye/eloPlayer.js');
        Opponent.prototype.likelihood = async () => { throw new Error('Late run started move analysis'); };
    });
    await page.click('#start');
    await finishes(page, 18);
    const result = await page.evaluate(() => JSON.parse(sessionStorage.getItem('acasEloResult')));
    assert.ok(result.games.every(game => game.moveEvidence === undefined));
    assert.equal(await page.locator('#move-estimate').count(), 0);
}));

test('updated EloEye bypasses a stale cached policy module', { skip, timeout }, () => withTool(null, async (page, url) => {
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/eloPolicy.js*', async route => {
        requests.push(route.request().url());
        if(!new URL(route.request().url()).search) {
            return route.fulfill({ contentType: 'text/javascript', body: 'export const automaticRun = {};' });
        }
        await route.continue();
    });
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    await page.waitForFunction(() => document.querySelectorAll('#boards-grid .tool-board').length > 0);
    assert.ok(requests.length > 0);
    assert.ok(requests.every(request => new URL(request).searchParams.get('v') === '10boards'));
    assert.deepEqual(errors, []);
}));

test('board selection supports one through ten and persists without device detection', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#games').count(), 0);
    assert.deepEqual(await page.locator('#boards option').evaluateAll(options => options.map(option => option.value)),
        Array.from({ length: 10 }, (_, index) => String(index + 1)));
    await page.selectOption('#boards', '10');
    await page.reload();
    assert.equal(await page.locator('#boards').inputValue(), '10');
    assert.equal(await page.locator('#boards-grid .tool-board').count(), 10);
    assert.equal(await page.locator('#run-plan').textContent(), 'Up to 1000 matches.');
    await page.selectOption('#mode', 'manual');
    assert.equal(await page.locator('#boards-grid .tool-board').count(), 1);
}));

test('settings persist and numbered board slots update before a match', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`, { waitUntil: 'domcontentloaded' });
    const toolTop = await page.locator('#elo-tool').evaluate(element => element.getBoundingClientRect().top);
    const guideTop = await page.locator('.elo-guide').first().evaluate(element => element.getBoundingClientRect().top);
    assert.ok(toolTop < guideTop);
    assert.equal(await page.getByRole('heading', { name: 'Try EloEye' }).count(), 0);

    assert.equal(await page.locator('#boards-grid .tool-board').count(), 2);
    assert.equal(await page.locator('#boards-grid .tool-board-heading').first().textContent(), 'Match01');
    const boardBoxes = await page.locator('#boards-grid .tool-board-surface').evaluateAll(elements => elements.map(element => {
        const { width, height } = element.getBoundingClientRect();
        return { width, height };
    }));
    assert.ok(boardBoxes.every(({ width, height }) => width > 0 && Math.abs(width - height) < 5), JSON.stringify(boardBoxes));
    assert.ok(Math.abs(boardBoxes[0].width - boardBoxes[1].width) < 1);
    const buttonStyles = await page.locator('#start, #stop').evaluateAll(elements => elements.map(element => {
        const hidden = elements.map(button => button.hidden);
        elements.forEach(button => { button.hidden = button !== element; });
        const style = getComputedStyle(element);
        const values = [style.width, style.height, style.gridArea];
        elements.forEach((button, index) => { button.hidden = hidden[index]; });
        return values;
    }));
    assert.deepEqual(buttonStyles[0], buttonStyles[1]);
    await page.locator('#boards-grid .tool-board-empty').first().waitFor({ state: 'visible' });

    await page.selectOption('#mode', 'manual');
    assert.equal(await page.locator('#boards-grid .tool-board').count(), 1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#mode').inputValue(), 'manual');
    assert.equal(await page.locator('#boards-grid .tool-board').count(), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileColumns = await page.locator('#elo-tool').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    assert.equal(mobileColumns, 1);
}));

test('settings align left with Start on the right, and mobile inputs fill the width with centered discard', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    const desktop = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        return {
            form: rect('#elo-form').toJSON(), mode: rect('#mode').toJSON(),
            boards: rect('#boards').toJSON(), mix: rect('#personality').toJSON(),
            start: rect('#start').toJSON(), section: rect('.elo-tool-section').toJSON()
        };
    });
    assert.ok(Math.abs(desktop.mode.left - desktop.form.left) < 1);
    assert.ok(Math.abs(desktop.mix.left - desktop.form.left) < 1);
    assert.ok(Math.abs(desktop.start.right - desktop.form.right) < 1);
    assert.ok(desktop.boards.left > desktop.mode.right);
    assert.ok(desktop.start.left > desktop.boards.right);
    assert.ok(desktop.section.left > 0);
    await page.evaluate(() => localStorage.setItem('acasEloCheckpoint', '{broken'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    for(const width of [390, 768]) {
        await page.setViewportSize({ width, height: 900 });
        await page.locator('#personality').evaluate(element => { element.open = true; });
        const mobile = await page.evaluate(() => {
            const rect = selector => document.querySelector(selector).getBoundingClientRect();
            const form = rect('#elo-form'), heading = rect('.elo-heading'), discard = rect('#discard-checkpoint');
            return {
                widths: ['#mode', '#boards', '#mix-best', '#mix-alternative', '#start'].map(selector => rect(selector).width),
                formWidth: form.width,
                discardCenter: discard.left + discard.width / 2,
                headingCenter: heading.left + heading.width / 2
            };
        });
        assert.ok(mobile.widths.every(value => Math.abs(value - mobile.formWidth) < 1), JSON.stringify(mobile));
        assert.ok(Math.abs(mobile.discardCenter - mobile.headingCenter) < 1);
    }
}));

test('EloEye checkboxes share the app control style and support keyboard input', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    await page.click('#personality summary');
    for(const id of ['mix-detailed', 'multiple-workers']) {
        const input = page.locator(`#${id}`);
        const style = await input.evaluate(element => {
            const container = element.parentElement, fill = element.nextElementSibling;
            return { width: getComputedStyle(container).width, radius: getComputedStyle(container).borderRadius,
                opacity: getComputedStyle(element).opacity, checkedOpacity: getComputedStyle(fill).opacity };
        });
        assert.deepEqual(style, { width: '28px', radius: '5px', opacity: '0', checkedOpacity: '0.02' });
        await input.focus();
        await page.keyboard.press('Space');
        assert.equal(await input.isChecked(), true);
        assert.equal(await input.evaluate(element => getComputedStyle(element.nextElementSibling).opacity), '1');
        await page.keyboard.press('Space');
        assert.equal(await input.isChecked(), false);
    }
}));

test('checkbox labels and suggestion mix only respond within their content width', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    for(const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const summary = page.locator('#personality summary');
        await summary.scrollIntoViewIfNeeded();
        const summaryBox = await summary.boundingBox();
        const detailsBox = await page.locator('#personality').boundingBox();
        assert.ok(summaryBox.width < detailsBox.width - 10);
        await page.mouse.click(detailsBox.x + detailsBox.width - 3, summaryBox.y + summaryBox.height / 2);
        assert.equal(await page.locator('#personality').getAttribute('open'), null);
        await summary.click();
        for(const id of ['mix-detailed', 'multiple-workers']) {
            const input = page.locator(`#${id}`);
            const label = page.locator('label').filter({ has: input });
            await label.scrollIntoViewIfNeeded();
            const labelBox = await label.boundingBox();
            const formBox = await page.locator('#elo-form').boundingBox();
            assert.ok(labelBox.width < formBox.width - 10);
            await page.mouse.click(formBox.x + formBox.width - 3, labelBox.y + labelBox.height / 2);
            assert.equal(await input.isChecked(), false);
            assert.equal(await label.evaluate(element => getComputedStyle(element).userSelect), 'none');
            assert.equal(await input.evaluate(element => getComputedStyle(element.nextElementSibling).userSelect), 'none');
            await label.click();
            assert.equal(await input.isChecked(), true);
            await input.uncheck();
        }
        await summary.click();
    }
}));

test('all tool warnings and errors are centered on desktop and mobile', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    for(const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const alignments = await page.locator('#settings-warning, #checkpoint-warning, #mix-warning, #form-error, #hidden-warning, #run-plan')
            .evaluateAll(elements => elements.map(element => ({ id: element.id, align: getComputedStyle(element).textAlign })));
        assert.equal(alignments.length, 6);
        assert.ok(alignments.every(({ align }) => align === 'center'), JSON.stringify(alignments));
    }
}));

test('suggestion explanations sit below the tool and the rounded accuracy table fits a phone', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    assert.equal(await page.locator('#personality').getAttribute('open'), null);
    assert.match(await page.locator('[aria-labelledby="mix-guide-title"]').textContent(), /9 out of 10/);
    await page.click('#personality summary');
    await page.fill('#mix-best', '80');
    assert.equal(await page.locator('#mix-alternative').inputValue(), '20');
    await page.fill('#mix-alternative', '35');
    assert.equal(await page.locator('#mix-best').inputValue(), '65');
    await page.selectOption('#mode', 'manual');
    assert.equal(await page.locator('#personality').isHidden(), true);
    await page.selectOption('#mode', 'auto');
    assert.equal(await page.locator('#personality').isVisible(), true);
    const headings = await page.locator('.elo-guide h2').allTextContents();
    assert.deepEqual(headings, ['How to use', 'How to use the suggestion mix', 'How many games?']);
    assert.equal(await page.locator('.elo-accuracy-table tbody tr').count(), 5);
    await page.setViewportSize({ width: 390, height: 844 });
    const layout = await page.locator('.elo-accuracy-table').evaluate(element => ({
        right: element.getBoundingClientRect().right, viewport: window.innerWidth,
        radius: getComputedStyle(element).borderRadius
    }));
    assert.ok(layout.right <= layout.viewport);
    assert.equal(layout.radius, '5px');
    const cells = await page.locator('.elo-accuracy-table tbody tr').first().evaluate(row => {
        const [left, right] = [...row.children].map(cell => cell.getBoundingClientRect());
        return { aligned: Math.abs(left.top - right.top) < 1, separated: right.left >= left.right - 1 };
    });
    assert.deepEqual(cells, { aligned: true, separated: true });
}));

test('missing GUI is explained without requiring a userscript on EloEye', { skip, timeout }, () => withTool(null, async (page, url) => {
    await start(page, url);
    await page.waitForSelector('#form-error:not([hidden])', { timeout: 15000 });
    assert.match(await page.locator('#form-error').textContent(), /cannot reach the A.C.A.S window/);
    assert.equal(await page.locator('#conn-userscript, #userscript-missing').count(), 0);
}));

test('GUI announces its manager over same-origin communication without page userscript globals', { skip, timeout }, () => withTool('moves', async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    await page.waitForSelector('#conn-gui[data-state="ok"]');
    assert.equal(await page.locator('#conn-manager').count(), 0);
    assert.equal(await page.locator('#conn-gui span').textContent(), 'GUI active (Tampermonkey)');
    assert.equal(await page.locator('.elo-heading-main #conn-gui').count(), 1);
    assert.equal(await page.evaluate(() => typeof window.USERSCRIPT), 'undefined');
    assert.equal(await page.locator('#connection small, #conn-userscript, .elo-technical-details').count(), 0);
}));

test('normal runs show the full estimation range before any matches finish', { skip, timeout }, () => withTool('moves', async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    await page.click('#start');
    await page.waitForSelector('.board-session');
    assert.equal(await page.locator('#live-range').isVisible(), true);
    assert.equal(await page.locator('#precision').textContent(), '0-4000');
    await page.click('#stop');
    await page.waitForFunction(() => !document.getElementById('start').hidden);
}));

test('dev URL plays twice the board count and shows a resumable completed result', { skip, timeout }, () => withTool('moves', async (page, url) => {
    await page.addInitScript(() => {
        window.completionDings = 0;
        const createOscillator = AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator = function() {
            window.completionDings++;
            return createOscillator.call(this);
        };
    });
    await page.goto(`${url}/tools/eloeye/index.html?dev&fast`);
    await page.selectOption('#boards', '6');
    assert.equal(await page.locator('#run-plan').textContent(), 'Up to 12 matches.');
    await page.selectOption('#mode', 'manual');
    assert.equal(await page.locator('#run-plan').textContent(), 'Up to 2 matches.');
    await page.selectOption('#mode', 'auto');
    await page.selectOption('#boards', '10');
    assert.equal(await page.locator('#run-plan').textContent(), 'Up to 20 matches.');
    await page.click('#start');
    await page.waitForSelector('.board-session');
    assert.equal(await page.locator('#live-range').isVisible(), true);
    assert.match(await page.locator('#precision').textContent(), /^\d+-\d+$/);
    await finishes(page, 20);
    const result = await page.evaluate(() => JSON.parse(sessionStorage.getItem('acasEloResult')));
    assert.equal(result.games.length, 20);
    assert.equal(await page.evaluate(() => window.completionDings), 1);
    assert.equal(result.estimate.intervalMethod, 'confidence-sequence');
    assert.equal(await page.locator('#start').textContent(), 'Reset');
    assert.match(await page.locator('#status').textContent(), /^\(Approximate Maia comparison\)/);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('acasEloCheckpoint')));
    assert.equal(saved.total, 20);
    assert.equal(saved.games.length, 20);
    assert.deepEqual(saved.batch, []);
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    await finishes(page, 20);
    assert.equal(await page.evaluate(() => window.completionDings), 0,
        'Restoring a finished result must not ding again');
    assert.equal(await page.locator('#start').textContent(), 'Reset');
    await page.click('#start');
    assert.equal(await page.locator('#start').textContent(), 'Start');
    assert.equal(await page.locator('#run').isVisible(), false);
    assert.equal(await page.locator('#mode').isEnabled(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('acasEloCheckpoint')), null);
}));

test('automatic checkpoint preserves a partial group and resumes with fewer boards', { skip, timeout }, () => withTool('moves', async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    await page.selectOption('#boards', '6');
    await page.click('#start');
    await page.waitForFunction(() => {
        const saved = JSON.parse(localStorage.getItem('acasEloCheckpoint'));
        return saved?.batch.some(game => game.score !== undefined);
    }, null, { timeout: 120000 });
    await page.click('#stop');
    await page.waitForFunction(() => !document.getElementById('start').hidden);
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('acasEloCheckpoint')));
    assert.equal(before.version, 2);
    assert.ok(before.batch.some(game => game.score !== undefined));
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#start').textContent(), 'Resume');
    assert.equal(await page.locator('#mode').isDisabled(), true);
    assert.equal(await page.locator('#boards').inputValue(), '6');
    assert.equal(await page.locator('.tool-board:not([hidden])').count(), 6);
    await page.selectOption('#boards', '2');
    await page.click('#start');
    await finishes(page, 12);
    const result = await page.evaluate(() => JSON.parse(sessionStorage.getItem('acasEloResult')));
    assert.deepEqual(result.games.slice(0, before.games.length), before.games);
    before.batch.forEach((game, index) => {
        if(game.score !== undefined) assert.deepEqual(result.games[before.games.length + index], game);
    });
    assert.equal(result.games.length, 12);
    assert.equal(result.estimate.intervalMethod, 'confidence-sequence');
    const finished = await page.evaluate(() => JSON.parse(localStorage.getItem('acasEloCheckpoint')));
    assert.deepEqual(finished.games, result.games);
    assert.deepEqual(finished.batch, []);
    assert.equal(await page.locator('.board-session, iframe.board-frame').count(), 0);
    assert.equal(await page.evaluate(() => window.mockGuiSessions.size), 0);
}, { automaticBudget: 12 }));

test('a complete checkpoint opens results without requiring a userscript', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    await page.evaluate(() => localStorage.setItem('acasEloCheckpoint', JSON.stringify({
        version: 1, protocol: 'maia-top-policy-paired-openings-pooled-personality-v6', mode: 'auto', boards: 8, total: 2,
        games: [{ opponent: 600, score: 1, acasIsWhite: true, opening: 0 }, { opponent: 2600, score: 0, acasIsWhite: false, opening: 0 }]
    })));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await finishes(page, 2);
}));

test('invalid checkpoint is explained and must be discarded before overwriting', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    await page.evaluate(() => localStorage.setItem('acasEloCheckpoint', '{broken'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#start').isEnabled(), true);
    assert.equal(await page.locator('#checkpoint-status').textContent(), 'The saved run could not be read.');
    assert.equal(await page.locator('#start').evaluate(element => getComputedStyle(element).filter), 'grayscale(1)');
    await page.click('#start');
    assert.equal(await page.locator('#discard-checkpoint').evaluate(element => element === document.activeElement), true);
    assert.equal(await page.locator('#discard-checkpoint').evaluate(element => element.getAnimations().length), 1);
    await page.click('#start');
    assert.equal(await page.locator('#discard-checkpoint').evaluate(element => element.getAnimations().length), 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('acasEloCheckpoint')), '{broken');
    assert.equal(await page.locator('.board-session').count(), 0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.click('#start');
    assert.equal(await page.locator('#discard-checkpoint').evaluate(element => element.getAnimations().length), 0);
    assert.equal(await page.locator('#discard-checkpoint').evaluate(element => element === document.activeElement), true);
    await page.click('#discard-checkpoint');
    assert.equal(await page.locator('#start').isEnabled(), true);
    assert.equal(await page.locator('#start').evaluate(element => getComputedStyle(element).filter), 'none');
    assert.equal(await page.evaluate(() => localStorage.getItem('acasEloCheckpoint')), null);
}));

test('old sampled checkpoints cannot resume', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    await page.evaluate(() => {
        localStorage.setItem('acasEloCheckpoint', JSON.stringify({
            version: 2, protocol: 'maia-sampled-equal-ratings-rules-v1', mode: 'auto', boards: 2, total: 256, batch: [],
            games: [{ opponent: 2200, score: 1, acasIsWhite: true }]
        }));
    });
    await page.reload();
    assert.equal(await page.locator('#start').isEnabled(), true);
    assert.equal(await page.locator('#checkpoint-status').textContent(), 'The saved run could not be read.');
    assert.notEqual(await page.evaluate(() => localStorage.getItem('acasEloCheckpoint')), null);
}));

test('opponent batches ready boards, preserves ratings and rejects all work on stop or failure', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    const result = await page.evaluate(async () => {
        const { Opponent } = await import('/tools/eloeye/eloPlayer.js');
        const calls = [];
        let release;
        const engine = {
            init: async () => {},
            evaluateBatch(fens, selfs, oppos) {
                calls.push({ fens, selfs, oppos });
                return new Promise(resolve => { release = resolve; });
            },
            dispose() { this.disposed = true; }
        };
        const opponent = new Opponent(null, engine);
        const first = opponent.move('first', 1540), second = opponent.move('second', 2237);
        await new Promise(resolve => setTimeout(resolve, 20));
        release({ result: [{ policy: { e2e4: 1 } }, { policy: { d2d4: 1 } }] });
        const moves = await Promise.all([first, second]);
        const active = opponent.move('active', 1500).catch(error => error.message);
        await new Promise(resolve => setTimeout(resolve, 20));
        const queued = opponent.move('queued', 1800).catch(error => error.message);
        opponent.stop(new Error('Stopped for test'));
        release({ result: [{ policy: { e2e4: 1 } }] });
        const rejected = await Promise.all([active, queued, opponent.move('late', 600).catch(error => error.message)]);
        const bad = new Opponent(null, { init: async () => {}, dispose() {},
            evaluateBatch: async () => ({ result: [{ policy: {} }] }) });
        const invalid = await bad.move('invalid', 1500).catch(error => error.message);
        const scheduled = new Opponent(null, engine);
        const pending = scheduled.move('not-started', 1500).catch(error => error.message);
        scheduled.stop(new Error('Cancelled before inference'));
        return { calls, moves, rejected, invalid, pending: await pending,
            disposed: engine.disposed, retained: opponent.active.length + opponent.queue.length };
    });
    assert.deepEqual(result.calls[0], { fens: ['first', 'second'], selfs: [1540, 2237], oppos: [1540, 2237] });
    assert.equal(result.calls.length, 2);
    assert.deepEqual(result.moves, ['e2e4', 'd2d4']);
    assert.deepEqual(result.rejected, Array(3).fill('Stopped for test'));
    assert.match(result.invalid, /invalid move policy/);
    assert.equal(result.pending, 'Cancelled before inference');
    assert.equal(result.disposed, true);
    assert.equal(result.retained, 0);
}));

test('Maia opponent always picks the top policy move without randomness', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    const result = await page.evaluate(async () => {
        const { Opponent } = await import('/tools/eloeye/eloPlayer.js');
        const opponent = new Opponent(null, {
            dispose() {},
            evaluateBatch: async fens => ({ result: fens.map(fen => ({
                policy: fen === 'tie' ? { d2d4: 0.5, e2e4: 0.5 } : { a2a3: 0.1, e2e4: 0.7, d2d4: 0.2 }
            })) })
        });
        const original = Math.random;
        let randomCalls = 0;
        try {
            Math.random = () => { randomCalls++; return 0; };
            const moves = await Promise.all(Array.from({ length: 12 }, () => opponent.move('position', 2600)));
            const tie = await opponent.move('tie', 2600);
            return { moves, tie, randomCalls };
        } finally {
            Math.random = original;
            opponent.stop();
        }
    });
    assert.deepEqual(result.moves, Array(12).fill('e2e4'));
    assert.equal(result.tie, 'd2d4');
    assert.equal(result.randomCalls, 0);
}));

test('likelihood inference yields to game moves and stop releases both queues', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    const result = await page.evaluate(async () => {
        const { Opponent } = await import('/tools/eloeye/eloPlayer.js');
        const calls = [];
        let release;
        const opponent = new Opponent(null, {
            dispose() {},
            evaluateBatch(fens) {
                calls.push(fens);
                return new Promise(resolve => {
                    release = () => resolve({ result: fens.map(() => ({ policy: { e2e4: 0.8, d2d4: 0.2 } })) });
                });
            }
        });
        const tick = () => new Promise(resolve => setTimeout(resolve, 20));
        const analysis = opponent.likelihood('analysis', 'e2e4');
        await tick();
        const move = opponent.move('playing', 1500);
        release();
        await tick();
        for(let index = 0; index < 11; index++) {
            release();
            await tick();
        }
        const totals = await analysis;
        const selected = await move;

        const cancelled = opponent.likelihood('cancelled', 'e2e4').catch(error => error.message);
        await tick();
        const queued = opponent.move('queued', 1500).catch(error => error.message);
        opponent.stop(new Error('Stopped analysis'));
        release();
        return { calls, totals, selected, cancelled: await cancelled, queued: await queued,
            retained: opponent.active.length + opponent.queue.length + opponent.analysisQueue.length };
    });
    assert.deepEqual(result.calls.slice(0, 3), [['analysis'], ['playing'], ['analysis']]);
    assert.equal(result.calls.filter(fens => fens[0] === 'analysis').length, 11);
    assert.equal(result.selected, 'e2e4');
    assert.equal(result.totals.length, 66);
    assert.ok(result.totals.every(Number.isFinite));
    assert.equal(result.cancelled, 'Stopped analysis');
    assert.equal(result.queued, 'Stopped analysis');
    assert.equal(result.retained, 0);
}));

test('played-move observations use the pre-move position and only the measured side', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    const observed = await page.evaluate(async () => {
        const { playGame } = await import('/tools/eloeye/eloPlayer.js');
        const { Chess } = await import('/app/assets/engines/libraries/chessjs/chess.js');
        const sequence = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
        const results = [];

        for(const acasIsWhite of [true, false]) {
            const chess = new Chess();
            const entries = [];
            const nextMove = () => sequence[chess.history().length];
            const frame = {
                statuses: new Set(['connected']), moves: [],
                whenReady: async () => {}, waitFor: async callback => callback(),
                setPosition() {
                    const move = nextMove();
                    this.moves = move ? [[move.slice(0, 2), move.slice(2)]] : [];
                }
            };
            const score = await playGame({
                chess, frame, opponentEngine: { move: async () => nextMove() },
                opponent: 1500, manual: true, acasIsWhite, signal: new AbortController().signal,
                onMove: entry => entries.push(entry)
            });
            const legal = entries.every(({ fen, move, legalMoves }) => {
                const position = new Chess(fen);
                return position.moves().length === legalMoves
                    && position.turn() === (acasIsWhite ? 'w' : 'b')
                    && !!position.move({ from: move.slice(0, 2), to: move.slice(2) });
            });
            results.push({ score, moves: entries.map(entry => entry.move), legal });
        }
        return results;
    });
    assert.deepEqual(observed, [
        { score: 0, moves: ['f2f3', 'g2g4'], legal: true },
        { score: 1, moves: ['e7e5', 'd8h4'], legal: true }
    ]);
}));

test('terminal draws take precedence over material and unrelated games have no 160-ply limit', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    const results = await page.evaluate(async () => {
        const { playGame } = await import('/tools/eloeye/eloPlayer.js');
        const { Chess } = await import('/app/assets/engines/libraries/chessjs/chess.js');
        const frame = {
            statuses: new Set(['connected']), moves: [],
            whenReady: async () => {}, waitFor: async callback => callback(),
            setPosition() { this.moves = [['a1', 'a2']]; }
        };
        const options = { frame, opponent: 1500, acasIsWhite: true, manual: true,
            signal: new AbortController().signal, opponentEngine: { move: async () => 'a1a2' } };
        const terminal = [];
        for(const fen of [
            '7k/6Q1/5K2/8/8/8/8/8 b - - 0 1',
            '7k/5Q2/5K2/8/8/8/8/8 b - - 0 1',
            '7k/8/5K2/8/8/8/8/8 w - - 0 1',
            '7k/8/5K2/8/8/8/8/Q7 w - - 100 81'
        ]) terminal.push(await playGame({ ...options, chess: new Chess(fen) }));
        terminal.push(await playGame({ ...options, acasIsWhite: false,
            chess: new Chess('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1') }));
        // A synthetic long game isolates the runner's termination policy.
        // A material lead must not override its eventual rule-based draw.
        let plies = 0;
        const chess = {
            game_over: () => plies === 180, in_checkmate: () => false,
            turn: () => plies % 2 ? 'b' : 'w', fen: () => 'fixture',
            moves: () => [{ from: 'a1', to: 'a2' }],
            move: () => { plies++; return true; },
            board: () => [[{ color: 'w', type: 'q' }]]
        };
        const longScore = await playGame({ ...options, chess });
        return { terminal, longScore, plies };
    });
    assert.deepEqual(results.terminal, [1, 0.5, 0.5, 0.5, 0]);
    assert.equal(results.longScore, 0.5);
    assert.equal(results.plies, 180);
}));

test('real Maia batch policies match individual inference for both colors', { skip, timeout }, t => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    const result = await page.evaluate(async () => {
        const { default: MaiaEngine } = await import('/app/assets/engines/Maia3/maiaEngine.js');
        const { Opponent } = await import('/tools/eloeye/eloPlayer.js');
        const { Chess } = await import('/app/assets/engines/libraries/chessjs/chess.js');
        const engine = new MaiaEngine();
        const opponent = new Opponent(null, engine);
        try {
            await engine.init();
            const chess = new Chess(), fens = [chess.fen()];
            chess.move('e4');
            fens.push(chess.fen());
            const boards = Array.from({ length: 6 }, (_, i) => fens[i % 2]);
            const ratings = [610, 1000, 1537, 1840, 2237, 2590];
            const inferenceInputs = [];
            const runInference = engine.maia.runInference.bind(engine.maia);
            engine.maia.runInference = (tokens, selfs, oppos, size) => {
                inferenceInputs.push({ selfs: [...selfs], oppos: [...oppos] });
                return runInference(tokens, selfs, oppos, size);
            };
            const batch = await engine.evaluateBatch(boards, ratings, ratings);
            const selected = await Promise.all(boards.map((fen, i) => opponent.move(fen, ratings[i])));
            const start = performance.now();
            const likelihood = await opponent.likelihood(fens[1], 'e7e5');
            const likelihoodMs = performance.now() - start;
            let maxDifference = 0;
            let likelihoodDifference = 0;
            for(let i = 0; i < boards.length; i++) {
                const single = await engine.evaluate(boards[i], ratings[i], ratings[i]);
                if(i === 1) likelihoodDifference = Math.abs(likelihood[2 * 6 + 3] - Math.log(single.policy.e7e5));
                if(selected[i] !== Object.keys(single.policy)[0]) {
                    throw new Error('EloEye selection differs from the A.C.A.S top-policy move');
                }
                const policy = batch.result[i].policy;
                const legal = new Chess(boards[i]).moves({ verbose: true })
                    .map(move => move.from + move.to + (move.promotion ?? ''));
                if(Object.keys(policy).length !== legal.length || legal.some(move => !(move in policy))) {
                    throw new Error('Batch policy contains missing or illegal moves');
                }
                if(Math.abs(Object.values(policy).reduce((a, b) => a + b, 0) - 1) > 1e-6) {
                    throw new Error('Batch policy is not normalized');
                }
                for(const move of legal) maxDifference = Math.max(maxDifference, Math.abs(policy[move] - single.policy[move]));
            }
            const rounded = await engine.evaluate(boards[2], 1500, 1500);
            const specific = batch.result[2].policy;
            const ratingDifference = Math.max(...Object.keys(specific).map(move =>
                Math.abs(specific[move] - rounded.policy[move])));
            return { maxDifference, likelihoodDifference, likelihood, likelihoodMs,
                inferenceInputs: inferenceInputs.slice(0, 2), ratings, ratingDifference };
        } finally { opponent.stop(); }
    });
    assert.ok(result.maxDifference < 1e-4, `batch vs single probability difference ${result.maxDifference}`);
    assert.ok(result.likelihoodDifference < 1e-4);
    assert.equal(result.likelihood.length, 66);
    assert.ok(result.likelihood.every(value => Number.isFinite(value) && value <= 0));
    assert.deepEqual(result.inferenceInputs, Array.from({ length: 2 }, () => ({
        selfs: result.ratings, oppos: result.ratings
    })), 'Direct inference and EloEye must pass specific Elo inputs unchanged');
    assert.ok(result.ratingDifference > 1e-7, '1537 Elo must not silently behave as rounded 1500 Elo');
    t.diagnostic(`Real Maia: 11 Elo inputs / 6 temperatures in ${result.likelihoodMs.toFixed(0)} ms (non-isolated browser)`);
}));

test('Maia cache handshake avoids duplicate downloads and disposal rejects pending work', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    const result = await page.evaluate(async () => {
        const { default: Maia } = await import('/app/assets/engines/Maia3/maia.js');
        const OriginalWorker = window.Worker;
        const workers = [];
        window.Worker = class {
            messages = [];
            constructor() { workers.push(this); }
            postMessage(message) { this.messages.push(message); }
            terminate() { this.terminated = true; }
            emit(data) { this.onmessage({ data }); }
        };
        const options = { model: 'test', modelVersion: '3', setStatus() {}, setProgress() {}, setError() {} };
        try {
            const cached = new Maia(options);
            const cachedDownload = cached.downloadModel();
            await Promise.resolve();
            const beforeReady = workers[0].messages.map(message => message.type);
            workers[0].emit({ type: 'status', status: 'ready' });
            await cachedDownload;
            await cached.downloadModel();
            const cachedMessages = workers[0].messages.map(message => message.type);
            const inference = cached.runInference(new Float32Array(768), new Float32Array(1), new Float32Array(1), 1)
                .then(() => 'resolved', error => error.name);
            cached.dispose();
            const disposed = { inference: await inference, pending: cached.pendingInferences.size, terminated: workers[0].terminated };
            const fresh = new Maia(options);
            const first = fresh.downloadModel(), second = fresh.downloadModel();
            workers[1].emit({ type: 'status', status: 'no-cache' });
            await Promise.resolve();
            const freshMessages = workers[1].messages.map(message => message.type);
            workers[1].emit({ type: 'status', status: 'ready' });
            await Promise.all([first, second]);
            fresh.dispose();
            const failed = new Maia(options);
            const failedLoad = failed.downloadModel().catch(error => error.message);
            workers[2].onerror({ message: 'worker crashed' });
            const cancelled = new Maia(options);
            const cancelledLoad = cancelled.downloadModel().catch(error => error.name);
            cancelled.dispose();
            const downloading = new Maia(options);
            const download = downloading.downloadModel().catch(error => error.name);
            workers[4].emit({ type: 'status', status: 'no-cache' });
            await Promise.resolve();
            downloading.dispose();
            return { beforeReady, cachedMessages, freshMessages, disposed, failed: await failedLoad,
                failureTerminated: workers[2].terminated, cancelled: await cancelledLoad, download: await download };
        } finally {
            window.Worker = OriginalWorker;
        }
    });
    assert.deepEqual(result.beforeReady, ['init']);
    assert.deepEqual(result.cachedMessages, ['init']);
    assert.deepEqual(result.freshMessages, ['init', 'download']);
    assert.deepEqual(result.disposed, { inference: 'AbortError', pending: 0, terminated: true });
    assert.equal(result.failed, 'worker crashed');
    assert.equal(result.failureTerminated, true);
    assert.equal(result.cancelled, 'AbortError');
    assert.equal(result.download, 'AbortError');
}));

test('live rating worker is deterministic and explicitly reports invalid moves', { skip, timeout }, () => withTool(null, async (page, url) => {
    await page.goto(`${url}/tools/eloeye/index.html?fast`);
    const result = await page.evaluate(async () => {
        const worker = new Worker('/app/assets/engines/Maia3/ratingWorker.js', { type: 'module' });
        let ready = false;
        const request = move => new Promise((resolve, reject) => {
            const message = {
                id: move, move, elos: [800, 1600, 2400],
                fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
            };
            const timer = setTimeout(() => reject(new Error('Live rating worker timed out')), 120000);
            worker.onerror = error => {
                clearTimeout(timer);
                reject(new Error(error.message));
            };
            worker.onmessage = ({ data }) => {
                if(data.ready) {
                    ready = true;
                    worker.postMessage(message);
                    return;
                }
                clearTimeout(timer);
                resolve(data);
            };
            if(ready) worker.postMessage(message);
        });
        try {
            return {
                valid: await request('e2e4'),
                repeated: await request('e2e4'),
                invalid: await request('a1a8')
            };
        } finally {
            worker.terminate();
        }
    });
    assert.equal(result.valid.logProbs.length, 3);
    assert.ok(result.valid.logProbs.every(value => Number.isFinite(value) && value <= 0));
    assert.deepEqual(result.repeated.logProbs, result.valid.logProbs,
        'Live estimation must score the full policy without randomized move sampling');
    assert.equal(result.invalid.logProbs, undefined);
    assert.match(result.invalid.error, /Invalid Maia policy for played move/);
}));

test('automatic start-stop cycles release workers, boards, waiters and abort listeners', { skip, timeout }, t => withTool('moves', async (page, url) => {
    const activeWorkers = new Set();
    const workerClosures = [];
    let maxWorkers = 0, modelRequests = 0;
    page.on('worker', worker => {
        activeWorkers.add(worker);
        maxWorkers = Math.max(maxWorkers, activeWorkers.size);
        workerClosures.push(new Promise(resolve => worker.on('close', () => {
            activeWorkers.delete(worker);
            resolve();
        })));
    });
    page.on('request', request => {
        if(request.url().endsWith('/maia3_simplified.onnx')) modelRequests++;
    });
    await page.goto(`${url}/tools/eloeye/index.html?fast`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
        window.eloTestControllers = [];
        const Original = window.AbortController;
        window.AbortController = class extends Original {
            constructor() {
                super();
                window.eloTestControllers.push(this);
            }
        };
    });
    const session = await page.context().newCDPSession(page);
    const heaps = [];
    const errors = [];
    page.on('console', message => {
        if(['error', 'warning'].includes(message.type()) && errors.length < 10) errors.push(message.text());
    });
    for(let cycle = 0; cycle < 3; cycle++) {
        await page.click('#start');
        await page.waitForFunction(() => {
            const saved = JSON.parse(localStorage.getItem('acasEloCheckpoint'));
            return saved && saved.games.length + saved.batch.filter(game => game.score !== undefined).length >= 2
                || !document.getElementById('form-error').hidden;
        }, null, { timeout: 120000 });
        assert.equal(await page.locator('#form-error').isHidden(), true, errors.join('\n'));
        await page.click('#stop');
        await page.waitForFunction(() => !document.getElementById('start').hidden);
        assert.equal(await page.locator('.board-session, iframe.board-frame').count(), 0);
        assert.equal(await page.evaluate(() => window.mockGuiSessions.size), 0);
        let closeTimeout;
        try {
            await Promise.race([Promise.all(workerClosures), new Promise((_, reject) => {
                closeTimeout = setTimeout(() => reject(new Error('Stopped Maia worker was not released')), 5000);
            })]);
        } finally { clearTimeout(closeTimeout); }
        assert.equal(activeWorkers.size, 0);
        const controllerCount = await page.evaluate(() => window.eloTestControllers.length);
        for(let index = 0; index < controllerCount; index++) {
            const { result } = await session.send('Runtime.evaluate', {
                expression: `window.eloTestControllers[${index}].signal`
            });
            const { listeners } = await session.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
            assert.equal(listeners.filter(listener => listener.type === 'abort').length, 0);
            await session.send('Runtime.releaseObject', { objectId: result.objectId });
        }
        await page.evaluate(() => window.eloTestControllers.length = 0);
        await page.click('#discard-checkpoint');
        await session.send('HeapProfiler.collectGarbage');
        heaps.push((await session.send('Runtime.getHeapUsage')).usedSize);
    }
    t.diagnostic(`Retained main-thread JS heap after automatic cycles: ${heaps.map(bytes => (bytes / 1024 / 1024).toFixed(1)).join(', ')} MiB`);
    assert.equal(maxWorkers, 1);
    assert.equal(modelRequests, 1, 'cached runs must not download or initialize a second model');
    assert.ok(heaps[2] - heaps[0] < 8 * 1024 * 1024, `retained main-thread heaps: ${heaps}`);
    await session.detach();
}));
