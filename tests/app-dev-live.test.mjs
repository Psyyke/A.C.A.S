import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

const key = 'acas-dev-live-stockfish18-v1';

test('dev live match lifecycle, results, timings and real Stockfish', async t => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        async function fixture(options = {}, mock = true, beforeInit = null) {
            const page = await browser.newPage();
            await page.route('**/*', route => new URL(route.request().url()).origin === url
                ? route.continue() : route.abort());
            await page.goto(`${url}/app/dev/`);
            await page.waitForFunction(() => typeof window.ChessgroundX === 'function');
            await page.evaluate(() => {
                const createBoard = window.ChessgroundX;
                window.ChessgroundX = (...args) => {
                    window.board = createBoard(...args);
                    return window.board;
                };
            });
            if (mock) {
                await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
                await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
                await page.evaluate(async () => {
                    const monitor = await import('/app/dev/heapMonitor.js');
                    monitor.stopHeapMonitor();
                    monitor.startHeapMonitor();
                });
                await page.evaluate(() => {
                    window.workers = [];
                    window.Worker = class {
                        messages = [];
                        terminated = false;
                        constructor(url) {
                            this.url = String(url);
                            window.workers.push(this);
                        }
                        postMessage(message) { this.messages.push(message); }
                        terminate() { this.terminated = true; }
                        emit(data) { this.onmessage?.({ data }); }
                    };
                });
            }
            if (beforeInit) await page.evaluate(beforeInit);
            await page.evaluate(async options => {
                const { init, liveStatistics } = await import('/app/dev/test-modules/live.js');
                window.liveStats = liveStatistics;
                window.controller = new AbortController();
                const container = document.createElement('div');
                document.querySelector('#left-content').appendChild(container);
                window.live = await init(container, {
                    test: { playerColor: 'white', autoRestartOnEnd: true, reloadEachMatch: false, ...options },
                    signal: window.controller.signal
                });
            }, options);
            return page;
        }
        const state = page => page.evaluate(async () => (await import('/app/dev/test-modules/live.js')).liveStatistics);
        const emit = (page, line) => page.evaluate(line => window.workers.at(-1).emit(line), line);
        const suggest = (page, from, to) => page.evaluate(([from, to]) => {
            window.dispatchEvent(new MessageEvent('message', {
                source: window, data: { name: 'bestMoveArr', value: [from, to] }
            }));
        }, [from, to]);
        async function ready(page) {
            await emit(page, 'uciok');
            await emit(page, 'readyok');
        }

        await t.test('only the owner moves, one search per turn, pauses exclude time and old workers cannot move', async () => {
            const page = await fixture();
            await ready(page);
            assert.equal(await page.locator('.live-turn').getAttribute('data-turn'), 'acas');
            const turnHeight = await page.locator('.live-status').evaluate(element => element.getBoundingClientRect().height);
            assert.match(await page.evaluate(() => window.workers[0].url), /stockfish-18-lite-single/);
            await page.clock.runFor(1000);
            await suggest(page, 'e2', 'e4');
            await suggest(page, 'e7', 'e5');
            assert.equal((await state(page)).active.moves.length, 1);
            assert.equal(await page.locator('.live-turn').getAttribute('data-turn'), 'stockfish');
            assert.equal(await page.locator('.live-status').evaluate(element => element.getBoundingClientRect().height), turnHeight);
            assert.equal(await page.locator('.live-status-message').textContent(), 'Playing');
            assert.deepEqual(await page.evaluate(() => window.workers[0].messages.slice(-2)), [
                'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 moves e2e4',
                'go movetime 500'
            ]);
            await emit(page, 'info depth 8 score cp 12 pv e7e5');
            await emit(page, 'uciok');
            assert.equal(await page.evaluate(() => window.workers[0].messages.filter(m => m.startsWith('go ')).length), 1);
            await page.clock.runFor(500);
            await emit(page, 'bestmove e7e5 ponder g1f3');
            await emit(page, 'bestmove e7e5');
            assert.equal((await state(page)).active.moves.length, 2);
            assert.equal(await page.locator('.live-turn').getAttribute('data-turn'), 'acas');
            await page.locator('.live-pause').click();
            await page.clock.runFor(10000);
            await suggest(page, 'g1', 'f3');
            assert.equal((await state(page)).active.moves.length, 2);
            await page.locator('.live-pause').click();
            await ready(page);
            await page.clock.runFor(250);
            await suggest(page, 'g1', 'f3');
            const moves = (await state(page)).active.moves;
            assert.equal(moves[0].timeMs, 1000);
            assert.equal(moves[1].timeMs, 500);
            assert.ok(moves[2].timeMs < 1000, 'paused time must not count');
            assert.match(await page.evaluate(() => window.workers.at(-1).messages.at(-2)), /moves e2e4 e7e5 g1f3$/);
            await page.locator('.live-new').click();
            assert.equal((await state(page)).games[0].status, 'abandoned');
            assert.equal((await state(page)).active.playerColor, 'black');
            await page.evaluate(() => window.workers[1].emit('bestmove b8c6'));
            assert.equal((await state(page)).active.moves.length, 0);
            await ready(page);
            await emit(page, 'bestmove e2e4');
            assert.equal((await state(page)).active.moves[0].side, 'stockfish');
            await page.evaluate(() => window.controller.abort());
            const after = await state(page);
            assert.equal(after.active, null);
            assert.equal(after.games.at(-1).status, 'interrupted');
            await page.clock.runFor(60000);
            await suggest(page, 'e7', 'e5');
            assert.deepEqual(await state(page), after);
            assert.ok(await page.evaluate(() => window.workers.every(worker => worker.terminated)));
            await page.close();
        });

        await t.test('checkmate is counted once, restarts once, and export retains records but refresh resets them', async () => {
            const page = await fixture({ startFen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1' });
            await ready(page);
            await suggest(page, 'f7', 'g7');
            for (let i = 0; i < 20; i++) await suggest(page, 'f7', 'g7');
            const finished = await state(page);
            assert.equal(finished.games.length, 1);
            assert.equal(finished.games[0].winner, 'acas');
            assert.equal(finished.games[0].result, '1-0');
            assert.match(finished.games[0].pgn, /1-0/);
            await page.clock.runFor(1499);
            assert.equal((await state(page)).active, null);
            await page.clock.runFor(1);
            assert.equal((await state(page)).active.playerColor, 'black');
            await page.clock.runFor(1000);
            assert.equal((await state(page)).games.length, 1);
            await emit(page, 'readyok');
            await emit(page, 'bestmove f7g7');
            assert.equal((await state(page)).games[1].winner, 'stockfish');
            await page.locator('.live-auto').uncheck();
            await page.clock.runFor(10000);
            assert.equal((await state(page)).active, null);
            const downloaded = page.waitForEvent('download');
            await page.locator('.live-export').click();
            const download = await downloaded;
            const stream = await download.createReadStream();
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const exported = JSON.parse(Buffer.concat(chunks).toString());
            assert.equal(Buffer.concat(chunks).toString().includes('\n'), false, 'JSON export is compact');
            assert.equal(exported.games.length, 2);
            assert.equal(exported.games[0].moves[0].uci, 'f7g7');
            assert.equal(exported.run.acasTimeoutMs, 120000);
            assert.ok(exported.run.samples.length >= 1);
            assert.match(exported.memoryScope, /responding same-origin A.C.A.S GUI tabs/);
            await page.reload();
            await page.waitForFunction(() => typeof window.ChessgroundX === 'function');
            await page.evaluate(async () => {
                const { init } = await import('/app/dev/test-modules/live.js');
                window.live = await init(document.querySelector('#left-content'), { test: { playerColor: 'white' } });
            });
            assert.equal((await state(page)).games.length, 0);
            assert.match(await page.locator('.live-stats').textContent(), /Games completed0/);
            await page.close();
        });

        await t.test('draws, promotion and repetition history use chess rules', async () => {
            const draw = await fixture({ startFen: '7k/8/6K1/8/8/8/8/8 w - - 0 1', autoRestartOnEnd: false });
            const record = (await state(draw)).games[0];
            assert.equal(record.result, '1/2-1/2');
            assert.equal(record.reason, 'Insufficient material');
            await draw.close();
            const promo = await fixture({ startFen: '8/P7/7k/8/8/6K1/8/8 w - - 0 1' });
            await ready(promo);
            await suggest(promo, 'a7', 'a8');
            assert.equal((await state(promo)).active.moves[0].promotion, 'q');
            await promo.close();
            const underpromo = await fixture({
                startFen: '8/P7/7k/8/8/6K1/8/8 w - - 0 1', playerColor: 'black',
                autoRestartOnEnd: false
            });
            await ready(underpromo);
            await emit(underpromo, 'bestmove a7a8n');
            assert.equal((await state(underpromo)).games[0].moves[0].promotion, 'n');
            await underpromo.close();
            const page = await fixture({ autoRestartOnEnd: false });
            await ready(page);
            for (let i = 0; i < 2; i++) {
                await suggest(page, 'g1', 'f3');
                await emit(page, 'bestmove g8f6');
                await suggest(page, 'f3', 'g1');
                await emit(page, 'bestmove f6g8');
            }
            assert.equal((await state(page)).games[0].reason, 'Threefold repetition');
            await page.close();
        });

        await t.test('startup/search failures are explicit and New game can recover', async () => {
            const page = await fixture({ playerColor: 'black' });
            await page.clock.runFor(30000);
            assert.match(await page.locator('.live-status').textContent(), /startup timed out/);
            await page.locator('.live-new').click();
            await ready(page);
            await suggest(page, 'e2', 'e4');
            await page.clock.runFor(15000);
            assert.match(await page.locator('.live-status').textContent(), /did not return a move/);
            await page.locator('.live-new').click();
            await ready(page);
            await emit(page, 'bestmove a1a8');
            assert.match(await page.locator('.live-status').textContent(), /illegal move/);
            assert.equal((await state(page)).games.at(-1).moves.length, 0);
            assert.equal((await state(page)).games.at(-1).status, 'failed');
            await page.locator('.live-new').click();
            await ready(page);
            await page.evaluate(() => window.workers.at(-1).onerror(new Error('test crash')));
            assert.match(await page.locator('.live-status').textContent(), /worker failed/);
            await page.close();
        });

        await t.test('Stockfish speed changes the next search, preserves timing metadata and survives reload', async () => {
            const page = await fixture();
            await ready(page);
            const input = page.locator('.live-move-time');
            await input.fill('60000');
            await input.dispatchEvent('change');
            await suggest(page, 'e2', 'e4');
            assert.equal(await page.evaluate(() => window.workers.at(-1).messages.at(-1)), 'go movetime 60000');
            await page.clock.runFor(15000);
            assert.equal((await state(page)).games.length, 0, 'long searches must not hit the old 15-second timeout');
            await input.fill('1');
            await input.dispatchEvent('change');
            assert.equal(await page.evaluate(() => window.workers.at(-1).messages.at(-1)), 'go movetime 60000', 'do not restart an in-flight search');
            await emit(page, 'bestmove e7e5');
            assert.equal((await state(page)).active.moves[1].searchMoveTimeMs, 60000);
            assert.equal((await state(page)).active.moves[0].searchMoveTimeMs, null);
            for (const value of ['', '0', '60001', '1.5']) {
                await input.fill(value);
                await input.dispatchEvent('change');
                assert.match(await page.locator('.live-settings-error').textContent(), /whole number/);
                assert.equal((await state(page)).settings.moveTimeMs, 1);
            }
            await input.fill('1');
            await input.dispatchEvent('change');
            assert.equal(await page.locator('.live-settings-error').textContent(), '');
            assert.ok(await input.evaluate(element => element.checkValidity()));
            await suggest(page, 'g1', 'f3');
            assert.equal(await page.evaluate(() => window.workers.at(-1).messages.at(-1)), 'go movetime 1');
            await emit(page, 'bestmove b8c6');
            assert.equal((await state(page)).active.moves[3].searchMoveTimeMs, 1);
            await input.fill('60000');
            await input.dispatchEvent('change');
            await suggest(page, 'f1', 'b5');
            await page.clock.runFor(69999);
            assert.equal((await state(page)).games.length, 0);
            await page.clock.runFor(1);
            assert.equal((await state(page)).games.at(-1).status, 'failed');
            await page.locator('.live-new').click();
            assert.equal((await state(page)).active.moveTimeMs, 60000);
            await page.locator('.live-match-mode').selectOption('chesscom');
            await page.locator('.live-auto').uncheck();
            await input.fill('1200');
            await input.dispatchEvent('change');
            await page.reload();
            await page.waitForFunction(() => typeof window.ChessgroundX === 'function');
            await page.evaluate(async () => {
                const { init } = await import('/app/dev/test-modules/live.js');
                window.live = await init(document.querySelector('#left-content'), { test: { playerColor: 'white' } });
            });
            assert.equal(await page.locator('.live-move-time').inputValue(), '1200');
            assert.equal((await state(page)).active.moveTimeMs, 1200);
            assert.equal(await page.locator('.live-match-mode').inputValue(), 'chesscom');
            assert.equal(await page.locator('.live-auto').isChecked(), false);
            await page.close();
        });

        await t.test('dev buttons use shared app styling and loop controls are separate accessible buttons', async () => {
            const page = await fixture();
            assert.equal(await page.locator('button:not(.acas-fancy-button)').count(), 0);
            assert.equal(await page.locator('button button').count(), 0);
            const back = page.locator('.back-to-acas-link');
            assert.ok(await back.evaluate(element => element.classList.contains('acas-fancy-button')));
            for (const button of [back, page.locator('.test-btn').first(), page.locator('.live-pause')]) {
                assert.equal(await button.evaluate(element => getComputedStyle(element).borderBottomWidth), '5px');
                await button.focus();
                assert.equal(await button.evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
            }
            assert.equal(await page.locator('#test-list .test-desc').first().textContent(), 'Live matches and stress testing.');
            const loop = page.locator('.loop-toggle').first();
            await loop.click();
            assert.equal(await loop.getAttribute('aria-pressed'), 'true');
            assert.equal(await page.locator('.live-panel').count(), 1, 'loop toggle must not load another test');
            await loop.press('Space');
            assert.equal(await loop.getAttribute('aria-pressed'), 'false');
            await page.locator('.test-btn').first().click();
            await page.waitForFunction(() => document.querySelector('.test-btn').getAttribute('aria-pressed') === 'true');
            await page.close();
        });

        await t.test('A.C.A.S watchdog counts only active own-turn waiting and recovers exactly once', async () => {
            const page = await fixture({ autoRestartOnEnd: false });
            await ready(page);
            await page.evaluate(() => {
                window.dispatchEvent(new ErrorEvent('error', { message: 'dev error before stall' }));
                window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
                    promise: Promise.resolve(), reason: new Error('dev rejection before stall')
                }));
            });
            await page.clock.runFor(60000);
            await suggest(page, 'a1', 'a8');
            await page.locator('.live-pause').click();
            await page.clock.runFor(300000);
            assert.equal((await state(page)).games.length, 0);
            await page.locator('.live-pause').click();
            await ready(page);
            await page.clock.runFor(59999);
            assert.equal((await state(page)).games.length, 0);
            await page.clock.runFor(1);
            const failed = await state(page);
            assert.equal(failed.active, null);
            assert.equal(failed.games[0].status, 'failed');
            assert.equal(failed.games[0].failure.side, 'acas');
            assert.equal(failed.games[0].failure.waitedMs, 120000);
            assert.equal(failed.games[0].result, '*');
            assert.equal(failed.games[0].winner, null);
            assert.match(await page.locator('.live-stats').textContent(), /A.C.A.S stalls1/);
            await suggest(page, 'e2', 'e4');
            await page.clock.runFor(4999);
            assert.equal((await state(page)).active, null);
            assert.equal((await state(page)).games[0].failure.diagnostics.userscriptStatus, 'no-reply');
            assert.equal((await state(page)).games[0].failure.diagnostics.guiStatus, 'no-reply');
            assert.deepEqual((await state(page)).games[0].failure.diagnostics.runtimeErrors.map(error => error.message),
                ['dev error before stall', 'dev rejection before stall']);
            await page.clock.runFor(1);
            await ready(page);
            assert.equal((await state(page)).active.playerColor, 'black');
            await emit(page, 'bestmove e2e4');
            await page.clock.runFor(119999);
            assert.equal((await state(page)).games.length, 1);
            await suggest(page, 'e7', 'e5');
            await page.clock.runFor(1);
            assert.equal((await state(page)).games.length, 1, 'accepted move cancels the old turn watchdog');
            await emit(page, 'bestmove g1f3');
            await page.clock.runFor(120000);
            assert.equal((await state(page)).games.length, 2);
            await page.locator('.live-pause').click();
            await page.clock.runFor(60000);
            assert.equal((await state(page)).active, null);
            await page.locator('.live-pause').click();
            await page.clock.runFor(5000);
            assert.ok((await state(page)).active);
            await page.close();
        });

        await t.test('opponent crashes and transport errors recover with capped backoff and no duplicate failures', async () => {
            const page = await fixture({ autoRestartOnEnd: false });
            for (const delay of [5000, 10000, 20000, 30000, 30000]) {
                await page.evaluate(() => {
                    const worker = window.workers.at(-1);
                    const onerror = worker.onerror;
                    onerror(new Error('crash'));
                    onerror(new Error('duplicate crash'));
                });
                const count = (await state(page)).games.length;
                assert.equal((await state(page)).games.at(-1).failure.side, 'stockfish');
                await page.clock.runFor(delay - 1);
                assert.equal((await state(page)).active, null);
                await page.clock.runFor(1);
                assert.ok((await state(page)).active);
                assert.equal((await state(page)).games.length, count);
            }
            await ready(page);
            await emit(page, 'bestmove e2e4');
            await page.evaluate(() => {
                window.workers.at(-1).postMessage = () => { throw new Error('transport'); };
            });
            await suggest(page, 'e7', 'e5');
            assert.match(await page.locator('.live-status').textContent(), /transport failed/);
            assert.equal((await state(page)).games.at(-1).status, 'failed');
            await page.clock.runFor(5000);
            assert.ok((await state(page)).active, 'successful moves reset the retry backoff');
            await page.close();
        });

        await t.test('simulated hour of unattended stalls keeps recovering with one live worker and exported diagnostics', async () => {
            const page = await fixture({}, true, () => {
                window.Worker.prototype.postMessage = function(message) {
                    this.messages.push(message);
                    if (message === 'uci' || message === 'isready') {
                        setTimeout(() => {
                            if (!this.terminated) this.emit(message === 'uci' ? 'uciok' : 'readyok');
                        }, 0);
                    } else if (message.startsWith('go ')) {
                        setTimeout(() => {
                            if (this.terminated) return;
                            const record = window.liveStats.active;
                            const game = new window.Chess(record.moves.at(-1)?.fen || record.startFen);
                            const move = game.moves({ verbose: true })[0];
                            this.emit('bestmove ' + move.from + move.to + (move.promotion || ''));
                        }, 500);
                    }
                };
            });
            await page.clock.runFor(3600000);
            const saved = await state(page);
            assert.ok(saved.games.length >= 28 && saved.games.length <= 29);
            assert.ok(saved.games.every(game => game.status === 'failed' && game.failure.side === 'acas'));
            assert.equal(saved.runs[0].samples.length, 61);
            assert.equal(saved.runs[0].samples.at(-1).elapsedMs, 3600000);
            assert.ok(await page.evaluate(() => window.workers.filter(worker => !worker.terminated).length <= 1));
            const downloaded = page.waitForEvent('download');
            await page.locator('.live-export').click();
            const stream = await (await downloaded).createReadStream();
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const exported = JSON.parse(Buffer.concat(chunks).toString());
            assert.equal(exported.run.elapsedMs, 3600000);
            assert.deepEqual(exported.run.samples, saved.runs[0].samples);
            assert.deepEqual(exported.games, saved.games);
            await page.evaluate(() => window.live.destroy());
            const closed = await state(page);
            await page.clock.runFor(3600000);
            assert.deepEqual(await state(page), closed);
            assert.ok(await page.evaluate(() => window.workers.every(worker => worker.terminated)));
            await page.close();
        });

        await t.test('rapid test selection leaves only one controller and switching away terminates it', async () => {
            const page = await fixture();
            await page.evaluate(() => window.live.destroy());
            await page.evaluate(() => {
                const button = document.querySelector('.test-btn');
                button.click();
                button.click();
                button.click();
            });
            await page.waitForFunction(() => window.workers.length === 2);
            assert.equal(await page.locator('.live-panel').count(), 1);
            await page.locator('.test-btn').nth(1).click();
            await page.waitForFunction(() => window.workers.every(worker => worker.terminated));
            assert.equal(await page.locator('.live-panel').count(), 0);
            await page.close();
        });

        await t.test('automatic short run scores legal suggestions, times out missing replies and cancels cleanly', async () => {
            const page = await fixture();
            await page.evaluate(async () => {
                window.live.destroy();
                await import('/app/dev/test-modules/short-edge.js');
                const createBoard = window.ChessgroundX;
                window.respondToSuite = true;
                window.suitePositions = [];
                window.ChessgroundX = (...args) => {
                    const board = createBoard(...args);
                    let fen = args[1].fen;
                    const set = board.set;
                    board.set = config => {
                        if (config.fen) fen = config.fen;
                        set(config);
                        if (config.orientation && !config.fen) {
                            const game = new window.Chess(fen);
                            window.suitePositions.push({ check: game.in_check(), over: game.game_over() });
                            if (window.respondToSuite) {
                                const move = game.moves({ verbose: true })[0];
                                setTimeout(() => window.dispatchEvent(new MessageEvent('message', {
                                    source: window,
                                    data: { name: 'bestMoveArr', value: [move.from, move.to] }
                                })), 100);
                            }
                        }
                    };
                    return board;
                };
            });
            await page.locator('.loop-toggle').nth(1).click();
            await page.locator('#run-short-tests').click();
            await page.clock.runFor(30000);
            assert.match(await page.locator('#short-test-score').textContent(), /Score: 36\/36/);
            assert.ok(await page.locator('#run-short-tests').isEnabled());
            assert.equal(await page.evaluate(() => window.suitePositions.length), 36);
            assert.ok(await page.evaluate(() => window.suitePositions.every(position => !position.check && !position.over)));
            await page.evaluate(() => { window.respondToSuite = false; });
            await page.locator('#run-short-tests').click();
            await page.clock.runFor(140000);
            assert.match(await page.locator('#short-test-score').textContent(), /Score: 0\/36/);
            assert.match(await page.locator('#short-test-score').textContent(), /No reply/);
            await page.locator('#run-short-tests').click();
            await page.locator('#stop-short-tests').click();
            await page.clock.runFor(60000);
            assert.match(await page.locator('#short-test-score').textContent(), /Stopped/);
            assert.equal(await page.locator('#left-content cg-board').count(), 0);
            await page.close();
        });

        await t.test('speed storage errors are visible without affecting page-scoped statistics', async () => {
            const corrupt = await fixture({}, true, () => {
                localStorage.setItem('acas-dev-live-stockfish18-v1', '{broken');
            });
            assert.match(await corrupt.locator('.live-storage-error').textContent(), /could not be loaded/);
            await ready(corrupt);
            await suggest(corrupt, 'e2', 'e4');
            assert.equal(await corrupt.evaluate(key => localStorage.getItem(key), key), '{broken');
            assert.match(await corrupt.locator('.live-stats').textContent(), /Moves \(plies\)1/);
            await corrupt.close();
            const full = await fixture({}, true, () => {
                Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
            });
            await full.locator('.live-move-time').fill('1000');
            await full.locator('.live-move-time').dispatchEvent('change');
            assert.match(await full.locator('.live-storage-error').textContent(), /could not be saved/);
            await ready(full);
            await suggest(full, 'e2', 'e4');
            await emit(full, 'bestmove e7e5');
            assert.match(await full.locator('.live-stats').textContent(), /Moves \(plies\)2/);
            await full.close();
        });

        await t.test('same-origin GUI tabs report heap samples and closed tabs do not leave stale readings', async () => {
            const context = await browser.newContext();
            try {
                await context.route('**/*', route => new URL(route.request().url()).origin === url
                    ? route.continue() : route.abort());
                const guiTabs = [];
                for (let index = 0; index < 2; index++) {
                    const gui = await context.newPage();
                    // Load the production GUI reporter without starting unrelated GUI engines.
                    await gui.route('**/app/', async route => {
                        const response = await route.fetch();
                        const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,
                            script => script.includes('heapReporter.js') ? script : '');
                        await route.fulfill({ response, body: html });
                    });
                    await gui.goto(`${url}/app/`, { waitUntil: 'load' });
                    guiTabs.push(gui);
                }
                const page = await context.newPage();
                await page.goto(`${url}/app/dev/`);
                await page.waitForFunction(() => typeof window.ChessgroundX === 'function');
                await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
                await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
                for (const gui of guiTabs) {
                    await gui.evaluate(() => Object.defineProperty(performance, 'memory', {
                        configurable: true,
                        value: { usedJSHeapSize: 67108864, totalJSHeapSize: 134217728, jsHeapSizeLimit: 2147483648 }
                    }));
                }
                await page.evaluate(async () => {
                    const monitor = await import('/app/dev/heapMonitor.js');
                    monitor.stopHeapMonitor();
                    monitor.startHeapMonitor();
                });
                await page.evaluate(async () => {
                    const { init, liveStatistics } = await import('/app/dev/test-modules/live.js');
                    window.liveStats = liveStatistics;
                    window.live = await init(document.querySelector('#left-content'), {
                        test: { playerColor: 'white', autoRestartOnEnd: false, reloadEachMatch: false }
                    });
                });
                await page.waitForFunction(() => window.liveStats.runs[0].samples[0].gui.tabs.length === 2);
                const first = (await state(page)).runs[0].samples[0].gui;
                assert.equal(first.status, 'received');
                assert.equal(new Set(first.tabs.map(tab => tab.tabId)).size, 2);
                assert.deepEqual(first.tabs.map(tab => tab.heapUsedBytes), [67108864, 67108864]);
                assert.match(await page.locator('#heap-subheader').textContent(), /GUI .*64.0 MiB.*GUI .*64.0 MiB/);
                await guiTabs[1].evaluate(() => Object.defineProperty(performance, 'memory', {
                    configurable: true, value: undefined
                }));
                await page.clock.runFor(60000);
                await page.waitForFunction(() => window.liveStats.runs[0].samples.at(-1).gui.tabs.length === 2);
                const second = (await state(page)).runs[0].samples.at(-1).gui;
                assert.equal(second.tabs.filter(tab => tab.heapUsedBytes === null).length, 1);
                assert.ok(second.tabs.every(tab => first.tabs.some(previous => previous.tabId === tab.tabId)));
                const downloaded = page.waitForEvent('download');
                await page.locator('.live-export').click();
                const stream = await (await downloaded).createReadStream();
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                const exported = JSON.parse(Buffer.concat(chunks).toString());
                assert.deepEqual(exported.run.samples.at(-1).gui, second);
                for (const gui of guiTabs) await gui.close();
                await page.clock.runFor(60000);
                assert.equal((await state(page)).runs[0].samples.at(-1).gui.status, 'waiting');
                await page.clock.runFor(5000);
                assert.equal((await state(page)).runs[0].samples.at(-1).gui.status, 'no-reply');
                assert.equal((await state(page)).runs[0].samples.at(-1).gui.tabs.length, 0);
                assert.match(await page.locator('#heap-subheader').textContent(), /GUI heap: No reply/);
                await page.evaluate(() => window.live.destroy());
                const closed = await state(page);
                await page.clock.runFor(120000);
                assert.deepEqual(await state(page), closed);
            } finally {
                await context.close();
            }
        });

        await t.test('bundled Stockfish really plays both colors without the userscript', async () => {
            const page = await fixture({ autoRestartOnEnd: false }, false);
            async function manualMove(from, to, orientation) {
                await page.locator('.live-board').scrollIntoViewIfNeeded();
                await page.waitForFunction(() => {
                    const bounds = window.board.state.dom.bounds();
                    const actual = document.querySelector('.live-board cg-board').getBoundingClientRect();
                    return bounds.x === actual.x && bounds.y === actual.y;
                });
                const box = await page.locator('.live-board cg-board').boundingBox();
                assert.deepEqual(await page.evaluate(() => {
                    const bounds = window.board.state.dom.bounds();
                    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
                }), box, 'cached board geometry must track layout changes');
                for (const square of [from, to]) {
                    const file = square.charCodeAt(0) - 97;
                    const rank = Number(square[1]) - 1;
                    const x = orientation === 'white' ? file : 7 - file;
                    const y = orientation === 'white' ? 7 - rank : rank;
                    assert.ok(await page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('cg-board')),
                        [box.x + (x + 0.5) * box.width / 8, box.y + (y + 0.5) * box.height / 8]), 'manual square must not be covered');
                    await page.mouse.click(box.x + (x + 0.5) * box.width / 8, box.y + (y + 0.5) * box.height / 8);
                }
            }
            await manualMove('e2', 'e4', 'white');
            await page.waitForFunction(() => window.liveStats.active.moves.length === 2, null, { timeout: 45000 });
            const first = (await state(page)).active;
            assert.equal(first.moves[1].side, 'stockfish');
            assert.equal(first.moves[1].color, 'b');
            await page.locator('.live-new').click();
            assert.equal((await state(page)).active.playerColor, 'black', 'New game button must activate exactly once');
            await page.waitForFunction(() => window.liveStats.active.moves.length === 1, null, { timeout: 15000 });
            assert.equal((await state(page)).active.moves[0].color, 'w');
            await page.locator('.live-pause').click();
            assert.equal(await page.locator('.live-pause').textContent(), 'Resume');
            await page.locator('.live-pause').click();
            assert.equal(await page.locator('.live-pause').textContent(), 'Pause');
            assert.deepEqual(await page.evaluate(() => ({
                turn: window.board.state.turnColor, color: window.board.state.movable.color,
                dests: window.board.state.movable.dests.get('e7')
            })), { turn: 'black', color: 'black', dests: ['e6', 'e5'] });
            await manualMove('e7', 'e5', 'black');
            await page.waitForFunction(() => window.liveStats.active.moves.length === 3, null, { timeout: 15000 });
            assert.equal((await state(page)).active.moves[2].side, 'stockfish');
            await page.close();
        });

        await t.test('new live matches navigate to fresh documents and consume checkpoints, but manual refresh resets stats', async () => {
            const page = await browser.newPage();
            try {
                await page.route('**/*', route => new URL(route.request().url()).origin === url
                    ? route.continue() : route.abort());
                await page.addInitScript(() => {
                    window.documentIdentity = crypto.randomUUID();
                    window.Worker = class {
                        postMessage() {}
                        terminate() {}
                    };
                });
                await page.goto(`${url}/app/dev/`);
                await page.waitForFunction(() => typeof window.ChessgroundX === 'function');
                await page.evaluate(async () => {
                    const { init } = await import('/app/dev/test-modules/live.js');
                    const container = document.createElement('div');
                    document.querySelector('#left-content').appendChild(container);
                    window.live = await init(container, { test: {
                        playerColor: 'white', autoRestartOnEnd: true,
                        startFen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1'
                    } });
                });
                const firstIdentity = await page.evaluate(() => window.documentIdentity);
                await page.evaluate(async () => {
                    const { liveStatistics } = await import('/app/dev/test-modules/live.js');
                    liveStatistics.checkpointPayload = 'x'.repeat(50 * 1024 * 1024);
                });
                await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', {
                    source: window, data: { name: 'bestMoveArr', value: ['f7', 'g7'] }
                })));
                await page.waitForFunction(identity => window.documentIdentity !== identity, firstIdentity);
                await page.waitForSelector('.live-panel');
                await page.waitForFunction(async () =>
                    (await import('/app/dev/test-modules/live.js')).liveStatistics.active !== null);
                assert.equal((await state(page)).games[0].result, '1-0');
                assert.equal((await state(page)).active.playerColor, 'black');
                assert.equal(await page.evaluate(async () =>
                    (await import('/app/dev/test-modules/live.js')).liveStatistics.checkpointPayload.length),
                    50 * 1024 * 1024, 'A 50 MB checkpoint survives navigation');
                assert.equal(await page.evaluate(() => new Promise((resolve, reject) => {
                    const request = indexedDB.open('acas-dev-live', 1);
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => {
                        const db = request.result;
                        const transaction = db.transaction('checkpoints', 'readonly');
                        const count = transaction.objectStore('checkpoints').count();
                        transaction.oncomplete = () => { resolve(count.result); db.close(); };
                        transaction.onabort = () => { reject(transaction.error); db.close(); };
                    };
                })), 0, 'Resumed checkpoint is consumed');
                await page.evaluate(async () => {
                    delete (await import('/app/dev/test-modules/live.js')).liveStatistics.checkpointPayload;
                });
                assert.equal(new URL(page.url()).searchParams.has('liveResume'), false);
                assert.equal(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('acas-dev-live-resume-')).length), 0);
                await page.locator('.live-pause').click();
                assert.equal(await page.locator('.live-match-mode').inputValue(), 'lichess');
                const pausedIdentity = await page.evaluate(() => window.documentIdentity);
                await page.evaluate(() => { window.previousBoardHolder = document.querySelector('.live-board'); });
                await page.locator('.live-match-mode').selectOption('chesscom');
                await page.locator('.live-new').click();
                assert.equal(await page.evaluate(() => window.documentIdentity), pausedIdentity);
                assert.equal(await page.evaluate(() => window.previousBoardHolder === document.querySelector('.live-board')), true);
                assert.equal((await state(page)).active.matchMode, 'chesscom');
                assert.equal(await page.locator('.live-pause').textContent(), 'Resume');
                await page.locator('.live-match-mode').selectOption('lichess');
                await page.locator('.live-new').click();
                await page.waitForFunction(identity => window.documentIdentity !== identity, pausedIdentity);
                await page.waitForSelector('.live-panel');
                assert.equal(await page.locator('.live-pause').textContent(), 'Resume');
                assert.equal((await state(page)).active.moves.length, 0);
                assert.equal(await page.locator('.live-status-message').textContent(), 'Paused');
                assert.equal((await state(page)).active.matchMode, 'lichess');
                assert.equal(await page.locator('.live-match-mode').inputValue(), 'lichess');
                await page.reload();
                await page.waitForFunction(() => typeof window.ChessgroundX === 'function');
                assert.equal((await state(page)).games.length, 0);
                assert.equal(await page.locator('.live-panel').count(), 0);
            } finally {
                await page.close();
            }
        });
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
