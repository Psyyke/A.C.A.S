import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { buildUserscript } from './elo-tool/userscriptHarness.mjs';

test('GUI mix persists outside profiles and renders one primary arrow across engines', { timeout: 90000 }, async () => {
    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const errors = [];

    try {
        await context.routeWebSocket('ws://localhost:2800/', socket => socket.onMessage(() => {}));
        await context.route('http://localhost/A.C.A.S/**', async route => {
            const request = new URL(route.request().url());
            const response = await route.fetch({
                url: `${url}${request.pathname.slice('/A.C.A.S'.length)}${request.search}`
            });
            await route.fulfill({ response });
        });
        await context.addInitScript(() => {
            window.spokenMoves = [];
            const captureStream = HTMLCanvasElement.prototype.captureStream;
            HTMLCanvasElement.prototype.captureStream = function(...args) {
                window.pipCanvas = this;
                return captureStream.apply(this, args);
            };
            const setTransform = CanvasRenderingContext2D.prototype.setTransform;
            CanvasRenderingContext2D.prototype.setTransform = function(...args) {
                this.canvas.fixturePipTexts = [];
                if(this.canvas === window.pipCanvas) {
                    window.pipTexts = [];
                    window.pipPanels = [];
                }
                return setTransform.apply(this, args);
            };
            const fillText = CanvasRenderingContext2D.prototype.fillText;
            CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
                (this.canvas.fixturePipTexts ??= []).push(text);
                if(this.canvas === window.pipCanvas) window.pipTexts.push(text);
                return fillText.call(this, text, ...args);
            };
            const drawImage = CanvasRenderingContext2D.prototype.drawImage;
            CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
                if(this.canvas === window.pipCanvas) {
                    window.pipTexts.push(...(source.fixturePipTexts || []));
                    window.pipPanels.push({ texts: source.fixturePipTexts || [], height: args[7] });
                }
                return drawImage.call(this, source, ...args);
            };
            speechSynthesis.speak = utterance => window.spokenMoves.push({
                text: utterance.text, rate: utterance.rate, lang: utterance.lang
            });
            if(localStorage.getItem('gm:isTosAccepted')) return;
            const profile = {
                engineEnabled: true, chessEngine: 'stockfish-18-lite-single',
                displayMovesOnExternalSite: true, onlyCalculateOwnTurn: true,
                maxMovetime: 150, moveSuggestionAmount: 3, hintDetail: 'full',
                arrowOpacity: 90, moveAsFilledSquares: true, showOpponentMoveGuess: true,
                showOpponentMoveGuessConstantly: true, primaryArrowColorHex: '#123456',
                ttsVoiceEnabled: true, ttsVoiceName: 'Default', ttsVoiceSpeed: 12,
                ttsTranslateAudio: false, pipSan: true,
                pip: true, pipBoard: false, pipEval: false
            };
            localStorage.setItem('gm:isTosAccepted', 'true');
            localStorage.setItem('gm:AcasConfig', JSON.stringify({ global: {
                chessEngineProfile: 'default', suggestionMix: true,
                suggestionMixWeights: JSON.stringify({
                    best: 0, alternative: 100, secondary: 0, mistake: 0, blunder: 0, miss: 0, other: 0
                }),
                profiles: {
                    default: profile,
                    slow: { ...profile, maxMovetime: 300, moveDisplayDelay: 500 },
                    target: { ...profile, hintDetail: 'destination', ttsVoiceEnabled: false }
                }
            } }));
        });
        const gui = await context.newPage();
        await gui.addInitScript(await buildUserscript());
        gui.on('pageerror', error => errors.push(error.message));
        await gui.goto('http://localhost/A.C.A.S/app/');
        await gui.waitForFunction(() => window.USERSCRIPT && document.querySelector('[data-key="suggestionMix"]').checked);

        const pendingPipProfiles = await gui.evaluate(async () => {
            const { createPipRenderer } = await import('/A.C.A.S/app/assets/js/gui/pipRenderer.js');
            const results = [];
            for(const enabled of [false, true]) {
                const instanceElem = document.createElement('div');
                instanceElem.innerHTML = '<div class="instance-feedback-container"><div data-profile-id="default"'
                    + ' data-feedback-text="Initialized profile feedback"></div></div>';
                const instance = {
                    pV: {}, instanceElem, gameStateHistory: [],
                    currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                    suggestionMix: { enabled },
                    isLearningProfile: profile => Boolean(instance.pV[profile]?.learningMode)
                };
                const settings = { pipBoard: false, pipEval: false, feedbackInPip: true,
                    feedbackMoveCounts: true, feedbackEloEstimate: true, enableMoveRatings: true };
                const renderer = createPipRenderer(instance, 'default', settings, () => {});
                const frames = [];
                try {
                    for(const initialized of [false, true, false]) {
                        if(initialized) instance.pV.default = { ...settings };
                        else delete instance.pV.default;
                        renderer.setSettings(settings);
                        renderer.resetHints(instance);
                        renderer.updateHints(instance);
                        await renderer.refresh();
                        frames.push({
                            ready: renderer.ready,
                            feedback: renderer.canvas.fixturePipTexts.includes('Initialized profile feedback'),
                            height: renderer.height
                        });
                    }
                    results.push(frames);
                } finally {
                    renderer.destroy();
                }
            }
            return results;
        });
        for(const frames of pendingPipProfiles) {
            assert.deepEqual(frames.map(frame => frame.ready), [true, true, true],
                'PiP must render before profile initialization and after profile removal');
            assert.deepEqual(frames.map(frame => frame.feedback), [false, true, false],
                'Feedback must appear when the profile initializes and clear when it is removed');
            assert.ok(frames.every(frame => frame.height === frames[0].height),
                'Pending profiles must retain their configured PiP layout');
        }

        const language = gui.locator('.acas-social-actions .language-dropdown-input .dropdown-input-container');
        const normalBackground = await language.evaluate(element => getComputedStyle(element).backgroundColor);
        await language.hover();
        assert.notEqual(await language.evaluate(element => getComputedStyle(element).backgroundColor), normalBackground);

        const opener = gui.locator('[aria-controls="suggestion-mix-floaty"]');
        const toggle = gui.locator('[data-key="suggestionMix"]');
        await toggle.scrollIntoViewIfNeeded();
        const adjacent = await opener.evaluate(button => {
            const row = button.closest('.custom-input');
            const checkbox = row.querySelector('[data-key="suggestionMix"]')
                .closest('.checkbox-container').getBoundingClientRect();
            const cog = button.getBoundingClientRect();
            return { checkbox: checkbox.toJSON(), cog: cog.toJSON() };
        });
        assert.ok(Math.abs((adjacent.checkbox.top + adjacent.checkbox.bottom) / 2
            - (adjacent.cog.top + adjacent.cog.bottom) / 2) < 2
            && Math.abs(adjacent.checkbox.right - adjacent.cog.left) <= 15,
        `The checkbox and cog must be next to each other ${JSON.stringify(adjacent)}`);
        await opener.click();
        const dialog = gui.locator('#suggestion-mix-floaty');
        await dialog.waitFor({ state: 'visible' });
        const best = dialog.locator('[data-mix-category="best"]');
        const alternative = dialog.locator('[data-mix-category="alternative"]');
        const secondary = dialog.locator('[data-mix-category="secondary"]');
        const rowOrder = await dialog.locator('.suggestion-mix-controls > .custom-input').evaluateAll(rows =>
            rows.slice(0, 3).map(row => {
                const input = row.querySelector('input');
                return input.id || input.dataset.key || input.dataset.mixCategory;
            }));
        assert.deepEqual(rowOrder, ['suggestionMixPreferBook', 'suggestion-mix-detailed', 'best']);
        const divider = dialog.locator('.suggestion-mix-divider');
        assert.equal(await divider.evaluate(element => getComputedStyle(element).borderTopStyle), 'dashed');
        assert.equal(await divider.evaluate(element =>
            element.previousElementSibling.contains(document.getElementById('suggestion-mix-detailed'))
            && element.nextElementSibling.contains(document.querySelector('[data-mix-category="best"]'))), true);
        await dialog.locator('#mix-detailed-title').click({ force: true });
        assert.equal(await dialog.locator('#suggestion-mix-detailed').isChecked(), false,
            'Clicking alternative types text must not toggle the checkbox');

        async function assertMixedPipAndSpeech(expectSpeech = true) {
            await gui.waitForFunction(() => {
                const instance = window.AcasInstances[0].instance;
                const selected = instance.suggestionMix.selection;
                return selected && instance.pV[selected.profile].pipHints?.moveObjects?.some(move => move.suggestionMix);
            });
            const result = await gui.evaluate(async () => {
                const { createPipRenderer } = await import('/A.C.A.S/app/assets/js/gui/pipRenderer.js');
                const { formatMoveNotationAsync } = await import('/A.C.A.S/app/assets/js/misc/moveNotation.js');
                const { captureBoardLayers } = await import('/A.C.A.S/app/assets/js/gui/boardCapture.js');
                const instance = window.AcasInstances[0].instance;
                const profile = instance.suggestionMix.selection.profile;
                const moves = Object.values(instance.pV).flatMap(variables => variables.pipHints?.moveObjects || []);
                const fullMoves = moves.filter(move => move.hintDetail === 'full');
                const pick = fullMoves[0];
                const spoken = await formatMoveNotationAsync(pick, true, true);
                const textModes = [];

                for(const pipSan of [true, false]) {
                    const renderer = createPipRenderer(instance, profile, {
                        pipBoard: false, pipSan, pipEval: false
                    }, () => {});
                    const texts = [];
                    const originalFillText = CanvasRenderingContext2D.prototype.fillText;
                    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
                        if(this.canvas === renderer.canvas) texts.push(text);
                        return originalFillText.call(this, text, ...args);
                    };
                    try {
                        renderer.updateHints(instance, profile);
                        await renderer.refresh();
                        const expected = await formatMoveNotationAsync(pick, pipSan);
                        textModes.push({ expected, texts, ready: renderer.ready });
                    } finally {
                        CanvasRenderingContext2D.prototype.fillText = originalFillText;
                        renderer.destroy();
                    }
                }

                const { boardCanvas, overlayCanvas } = await captureBoardLayers(instance.instanceID, 300, null, profile);
                const pixels = overlayCanvas.getContext('2d')
                    .getImageData(0, 0, overlayCanvas.width, overlayCanvas.height).data;
                const hasOverlay = pixels.some((value, index) => index % 4 === 3 && value > 0);

                return { fullMoves, spoken, textModes, hasOverlay, boardWidth: boardCanvas.width };
            });
            assert.equal(result.fullMoves.length, 1, 'PiP must receive only one full mixed move');
            assert.deepEqual(result.fullMoves[0].player, (await page.evaluate(() => window.board.hints.moves))[0].slice(0, 2));
            for(const mode of result.textModes) {
                assert.equal(mode.ready, true);
                assert.ok(mode.texts.includes(mode.expected), JSON.stringify(mode));
            }
            assert.ok(result.boardWidth > 0, 'PiP board capture must be available');
            assert.equal(result.hasOverlay, true, 'PiP board capture must include the selected arrow');
            if(expectSpeech) {
                await gui.waitForFunction(text => window.spokenMoves.some(move => move.text === text), result.spoken);
            }
            const utterances = await gui.evaluate(text => window.spokenMoves.filter(move => move.text === text), result.spoken);
            assert.equal(utterances.length, expectSpeech ? 1 : 0,
                'Speak a fresh pick once, but keep settings redraws silent');
            if(expectSpeech) assert.ok(Math.abs(utterances[0].rate - 1.2) < 0.0001);
            await gui.waitForFunction(() => window.pipTexts?.includes('Suggestion mix'));
            const labels = await gui.evaluate(() => window.pipTexts.filter(text =>
                ['Suggestion mix', 'Default Profile', 'Slow', 'Target'].includes(text)));
            assert.deepEqual(labels, ['Suggestion mix'], 'PiP must show one combined profile section');
        }
        async function assertPercentageStyle() {
            await best.focus();
            const style = await best.evaluate(input => {
                const computed = getComputedStyle(input);
                const canvas = document.createElement('canvas');
                const measure = canvas.getContext('2d');
                measure.font = `${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
                const threeCharacters = measure.measureText('000').width;
                return {
                    width: parseFloat(computed.width), threeCharacters,
                    appearance: computed.appearance, textAlign: computed.textAlign,
                    hiddenSpinners: [...document.styleSheets].filter(sheet => sheet.href?.endsWith('/gui.css'))
                        .flatMap(sheet => [...sheet.cssRules])
                        .some(rule => rule.selectorText?.includes('#suggestion-mix-floaty input::-webkit-inner-spin-button')
                            && rule.style.webkitAppearance === 'none')
                };
            });
            assert.ok(Math.abs(style.width - style.threeCharacters) < 1, JSON.stringify(style));
            assert.equal(style.appearance, 'textfield');
            assert.equal(style.hiddenSpinners, true);
            assert.notEqual(style.textAlign, 'right');
            const title = dialog.locator('#mix-best-title');
            assert.match(await title.textContent(), / \(%\)$/);
            await dialog.locator('h1').click();
            await title.click({ force: true });
            assert.equal(await best.evaluate(input => document.activeElement === input), false,
                'Clicking the title must not focus the percentage field');
            const titles = await dialog.locator('.textfield-input .input-title').allTextContents();
            assert.equal(titles.length, 7);
            assert.ok(titles.every(text => text.endsWith(' (%)')));
        }
        await assertPercentageStyle();
        assert.equal(await dialog.locator('.floaty-close-btn').textContent(), '💾');
        assert.equal(await dialog.locator('[data-translation-learn-more-here]').getAttribute('href'),
            '../usage/#suggestion-mix');
        assert.equal(await secondary.isVisible(), true);
        assert.equal(await secondary.isDisabled(), true);
        assert.equal(await secondary.evaluate(input => getComputedStyle(input.closest('.custom-input')).filter),
            'blur(2px)');
        assert.equal(await best.inputValue(), '0');
        await best.fill('80');
        await best.press('Tab');
        assert.equal(await alternative.inputValue(), '20');
        await dialog.locator('#suggestion-mix-detailed').check();
        assert.equal(await alternative.isVisible(), true);
        assert.equal(await alternative.isDisabled(), true);
        assert.equal(await alternative.evaluate(input => getComputedStyle(input.closest('.custom-input')).filter),
            'blur(2px)');
        assert.equal(await secondary.isDisabled(), false);
        assert.equal(await dialog.locator('[data-mix-category="secondary"]').inputValue(), '20');
        await dialog.locator('#suggestion-mix-detailed').uncheck();
        assert.equal(await alternative.isDisabled(), false);
        assert.equal(await secondary.isDisabled(), true);
        await best.fill('0');
        await best.press('Tab');
        await gui.waitForFunction(() => {
            const config = JSON.parse(localStorage.getItem('gm:AcasConfig'));
            return JSON.parse(config.global.suggestionMixWeights).alternative === 100;
        });
        await dialog.locator('.floaty-close-btn').click();

        const quality = gui.locator('#pip-quality');
        const pipDialog = gui.locator('dialog').filter({ has: quality });
        await gui.locator('.floaty-wrapper').filter({ has: pipDialog }).locator('.open-floaty-btn').click();
        await pipDialog.waitFor({ state: 'visible' });
        const qualitySpacing = await quality.evaluate(input => {
            const row = input.closest('.range-input');
            const subtitle = row.querySelector('.input-subtitle').getBoundingClientRect();
            const slider = input.getBoundingClientRect();
            return slider.top - subtitle.bottom;
        });
        assert.ok(qualitySpacing >= 0 && qualitySpacing <= 16,
            `PiP quality slider must stay close to its subtitle, gap was ${qualitySpacing}px`);
        await pipDialog.locator('.floaty-close-btn').click();

        const page = await context.newPage();
        await page.route('**/mix-fixture', route => route.fulfill({
            contentType: 'text/html',
            body: `<div id="mount" style="width:400px;height:400px"></div>
                <script type="module">
                import { BoardSession } from '/A.C.A.S/tools/eloeye/boardSession.js';
                import { Chess } from '/A.C.A.S/app/assets/engines/libraries/chessjs/chess.js';
                import { channelName } from '/A.C.A.S/tools/eloeye/sessionProtocol.js';
                window.markingPackets = [];
                const monitor = new BroadcastChannel(channelName);
                monitor.onmessage = ({ data }) => {
                    if(data.type === 'markings') window.markingPackets.push(...data.entries);
                };
                window.board = new BoardSession(document.getElementById('mount'));
                window.board.setPosition({ fen: new Chess().fen(), turn: 'w' });
                </script>`
        }));
        await page.goto('http://localhost/A.C.A.S/mix-fixture');
        await page.waitForFunction(() => window.board?.profilesReady && window.board.hints?.moves.length === 1,
            null, { timeout: 25000 });

        const shapes = await gui.evaluate(() => {
            const instance = window.AcasInstances[0].instance;
            return Object.values(instance.pV).flatMap(variables => variables.pipMoveShapes || []);
        });
        const arrows = shapes.filter(shape => shape.shapeType === 'arrow');
        assert.equal(arrows.length, 1, JSON.stringify(shapes));
        assert.equal(arrows[0].shapeConfig.lineWidth, 30);

        const reservedPip = await gui.evaluate(async () => {
            const pip = await import('/A.C.A.S/app/assets/js/gui/pip.js');
            const instance = window.AcasInstances[0].instance;
            const savedConfig = JSON.stringify(await USERSCRIPT.getValue('AcasConfig'));
            const config = JSON.parse(savedConfig);
            const variables = instance.pV.slow;
            const keys = ['feedbackInPip', 'feedbackMoveCounts', 'feedbackEloEstimate',
                'enableEnemyFeedback', 'enableMoveRatings'];
            const savedVariables = Object.fromEntries(keys.map(key => [key, variables[key]]));
            const savedLearningMode = variables.learningMode;
            const savedDisplayFen = instance.displayFen;
            const selection = instance.suggestionMix.selection;
            const historyLength = instance.gameStateHistory.length;
            const row = document.createElement('div');
            row.dataset.profileId = 'slow';
            row.dataset.feedbackText = 'Reserved feedback fixture';
            const frames = [];
            const waitFor = async predicate => {
                for(let attempt = 0; attempt < 200; attempt++) {
                    if(predicate()) return;
                    await new Promise(resolve => setTimeout(resolve, 25));
                }
                throw new Error(`Mixed PiP did not publish the expected frame: ${JSON.stringify(window.pipTexts)}`);
            };
            const record = () => frames.push([window.pipCanvas.width, window.pipCanvas.height]);
            try {
                keys.forEach(key => {
                    config.global.profiles[GET_PROFILE_STORAGE_KEY('slow')][key] = true;
                    variables[key] = true;
                });
                await USERSCRIPT.setValue('AcasConfig', config);
                instance.suggestionMix.selection = { ...selection, profile: 'default' };
                await pip.syncPictureInPicture();
                instance.instanceElem.querySelector('.instance-feedback-container').append(row);
                pip.updatePipFeedback(instance);
                await waitFor(() => window.pipTexts.includes('Reserved feedback fixture'));
                assertNoStats();
                record();

                instance.gameStateHistory.push(...[7, 8].map(loss => ({
                    fen: { full: instance.currentFen }, feedbackLoss: { slow: loss }
                })));
                pip.updatePipFeedback(instance);
                await waitFor(() => window.pipTexts.some(text => /^Elo \d+ \(\d+%\)$/.test(text)));
                if(instance.suggestionMix.selection.profile !== 'default') {
                    throw new Error('Late feedback must not change the mixed move source');
                }
                record();

                instance.suggestionMix.selection = { ...selection, profile: 'slow' };
                pip.updatePipData({ calculationTimeElapsed: 4321 }, instance, 'slow');
                await waitFor(() => window.pipTexts.some(text => text.includes('4.3s'))
                    && window.pipTexts.some(text => /^Elo \d+ \(\d+%\)$/.test(text)));
                record();

                instance.suggestionMix.selection = null;
                pip.updatePipData({ calculationTimeElapsed: 5432 }, instance, 'default');
                await waitFor(() => window.pipTexts.some(text => text.includes('5.4s')));
                record();

                instance.suggestionMix.selection = { ...selection, profile: 'slow' };
                instance.gameStateHistory.length = historyLength;
                row.dataset.feedbackText = 'Blank stats fixture';
                pip.updatePipFeedback(instance);
                await waitFor(() => window.pipTexts.includes('Blank stats fixture'));
                assertNoStats();
                record();

                config.global.profiles[GET_PROFILE_STORAGE_KEY('slow')].learningMode = true;
                variables.learningMode = true;
                instance.suggestionMix.selection = { ...selection, profile: 'default' };
                row.dataset.feedbackText = 'Played e4 (+0.2)\nBest d4 (+0.4)';
                instance.gameStateHistory.push(...[7, 8].map(loss => ({
                    fen: { full: instance.currentFen },
                    feedback: { slow: '👍' }, feedbackLoss: { slow: loss }
                })));
                await USERSCRIPT.setValue('AcasConfig', config);
                await pip.syncPictureInPicture();
                pip.updatePipFeedback(instance);
                await waitFor(() => window.pipTexts.includes('Played e4')
                    && window.pipTexts.includes('Best d4')
                    && window.pipTexts.includes('👍2')
                    && window.pipTexts.some(text => /^Elo \d+ \(\d+%\)$/.test(text)));
                if(!window.pipTexts.includes('Slow') || window.pipPanels.length !== 2
                    || window.pipPanels[0].texts.includes('Played e4')
                    || !window.pipPanels[1].texts.includes('Played e4')) {
                    throw new Error('Learning feedback must appear in its own section below the mix');
                }
                const suggestionHeight = window.pipPanels[0].height;
                const textLearningHeight = window.pipCanvas.height;
                instance.displayFen = instance.currentFen;
                config.global.profiles[GET_PROFILE_STORAGE_KEY('slow')].pipBoard = true;
                await USERSCRIPT.setValue('AcasConfig', config);
                await pip.syncPictureInPicture();
                await waitFor(() => window.pipCanvas.height > textLearningHeight
                    && window.pipTexts.includes('Played e4'));
                if(window.pipPanels[0].height !== suggestionHeight
                    || window.pipPanels.length !== 2) {
                    throw new Error('The learning board must not resize the suggestion-mix section');
                }
                const learningHeight = window.pipCanvas.height;
                row.dataset.waitingForMove = 'true';
                row.dataset.feedbackText = 'Learning prompt fixture';
                pip.updatePipFeedback(instance);
                await waitFor(() => window.pipTexts.includes('Learning prompt fixture'));
                if(window.pipCanvas.height !== learningHeight || window.pipTexts.includes('👍2')
                    || instance.suggestionMix.selection.profile !== 'default') {
                    throw new Error('Learning feedback must retain the mixed move and layout while waiting');
                }
                return frames;
            } finally {
                row.remove();
                instance.gameStateHistory.length = historyLength;
                await USERSCRIPT.setValue('AcasConfig', JSON.parse(savedConfig));
                Object.assign(variables, savedVariables);
                variables.learningMode = savedLearningMode;
                instance.displayFen = savedDisplayFen;
                instance.suggestionMix.selection = selection;
                await pip.syncPictureInPicture();
                pip.updatePipFeedback(instance);
                if(frames.length) await waitFor(() => window.pipCanvas.height < frames[0][1]);
            }
            function assertNoStats() {
                if(window.pipTexts.some(text => /^Elo \d+/.test(text))) {
                    throw new Error('Unavailable Elo estimates must leave a blank row');
                }
            }
        });
        reservedPip.forEach(dimensions => assert.deepEqual(dimensions, reservedPip[0],
            'Mixed PiP must reserve enabled footer rows before results, between profiles and while waiting'));
        assert.match(arrows[0].shapeConfig.style, /#123456/);
        assert.equal(arrows[0].isOpponent, undefined);
        assert.ok(shapes.some(shape => shape.shapeType === 'rectangle'), 'Partial hints stay visible');
        await assertMixedPipAndSpeech();
        const speechesBeforeRedraw = await gui.evaluate(() => window.spokenMoves);

        const before = await page.evaluate(() => window.board.hints.moves);
        await gui.evaluate(async () => {
            const instance = window.AcasInstances[0].instance;
            await Promise.all(Object.keys(instance.pV).map(profile => instance.refreshHints(profile)));
        });
        assert.deepEqual(await page.evaluate(() => window.board.hints.moves), before);
        const automaticPicks = await page.evaluate(() => window.markingPackets.filter(entry =>
            entry.shapeType === 'arrow' && !entry.isFuture && !entry.isOpponent && !entry.suppressAutoMove).length);
        assert.equal(automaticPicks, 1, 'Only the first delivered pick may trigger Auto Move');
        assert.deepEqual(await gui.evaluate(() => window.spokenMoves), speechesBeforeRedraw,
            'Redraws must not repeat TTS');

        const selectedProfile = await gui.evaluate(async () => {
            const instance = window.AcasInstances[0].instance;
            const profile = instance.suggestionMix.selection.profile;
            const config = await USERSCRIPT.getValue('AcasConfig');
            config.global.profiles[GET_PROFILE_STORAGE_KEY(profile)].displayMovesOnExternalSite = false;
            await USERSCRIPT.setValue('AcasConfig', config);
            await instance.refreshHints(profile);
            return profile;
        });
        await page.waitForFunction(() => window.board.hints.moves.length === 0);
        assert.equal(await gui.evaluate(() =>
            Object.values(window.AcasInstances[0].instance.pV)
                .flatMap(variables => variables.pipMoveShapes || [])
                .filter(shape => shape.shapeType === 'arrow').length), 1,
        'Turning external arrows off must keep the GUI pick');
        await gui.evaluate(async profile => {
            const instance = window.AcasInstances[0].instance;
            const config = await USERSCRIPT.getValue('AcasConfig');
            config.global.profiles[GET_PROFILE_STORAGE_KEY(profile)].displayMovesOnExternalSite = true;
            await USERSCRIPT.setValue('AcasConfig', config);
            await instance.refreshHints(profile);
        }, selectedProfile);
        await page.waitForFunction(() => window.board.hints.moves.length === 1);

        const cachedBeforeConcealment = await gui.evaluate(async () => {
            const instance = window.AcasInstances[0].instance;
            const cached = Object.fromEntries(Object.entries(instance.pV).map(([profile, variables]) =>
                [profile, structuredClone(variables.hintCandidates)]));
            APPLY_ASSISTANCE_CONCEALMENT(true);
            await instance.suggestionMix.render(true);
            APPLY_ASSISTANCE_CONCEALMENT(false);
            return cached;
        });
        await gui.waitForFunction(() => window.AcasInstances.every(entry =>
            Object.values(entry.instance.pV).every(variables => !variables.pendingMoveDisplay)));
        assert.deepEqual(await gui.evaluate(() =>
            Object.fromEntries(Object.entries(window.AcasInstances[0].instance.pV)
                .map(([profile, variables]) => [profile, variables.hintCandidates]))),
        cachedBeforeConcealment, 'Concealment must not replace original candidates with the mixed result');
        assert.deepEqual(await gui.evaluate(() => window.spokenMoves), speechesBeforeRedraw,
            'Revealing the retained mix must not repeat TTS');

        await gui.evaluate(() => {
            const instance = window.AcasInstances[0].instance;
            instance.openingBooks.set('default', {
                getMoves: () => [{ from: 'c2', to: 'c4', promotion: null }]
            });
        });
        await opener.click();
        await dialog.locator('[data-key="suggestionMixPreferBook"]').check();
        await page.waitForFunction(() =>
            JSON.stringify(window.board.hints.moves) === JSON.stringify([['c2', 'c4', null]]));
        assert.equal(await gui.evaluate(() => {
            const instance = window.AcasInstances[0].instance;
            return Object.values(instance.pV).flatMap(variables => variables.bookMoveMarkings || []).length;
        }), 0, 'Preferred book moves replace full book markings with one primary arrow');
        await assertMixedPipAndSpeech(false);
        const nextFen = await page.evaluate(async () => {
            const { Chess } = await import('/A.C.A.S/app/assets/engines/libraries/chessjs/chess.js');
            const chess = new Chess();
            chess.move('e4');
            window.board.setPosition({ fen: chess.fen(), turn: 'b' });
            chess.move('e5');
            window.board.setPosition({ fen: chess.fen(), turn: 'w' });
            return chess.fen();
        });
        await gui.waitForFunction(fen => {
            const instance = window.AcasInstances[0].instance;
            return instance.currentFen === fen && instance.suggestionMix.selection?.fen === fen
                && instance.suggestionMix.selection.delivered;
        }, nextFen);
        await assertMixedPipAndSpeech();
        const bookOnlyCache = await gui.evaluate(async () => {
            const instance = window.AcasInstances[0].instance;
            const cached = instance.pV.default.hintCandidates;
            instance.pV.default.hintCandidates = null;
            const config = await USERSCRIPT.getValue('AcasConfig');
            config.global.profiles.default.suggestPawn = false;
            await USERSCRIPT.setValue('AcasConfig', config);
            await instance.refreshHints('default');
            return cached;
        });
        await page.waitForFunction(() =>
            JSON.stringify(window.board.hints.moves) !== JSON.stringify([['c2', 'c4', null]]));
        await gui.evaluate(async cached => {
            const instance = window.AcasInstances[0].instance;
            instance.pV.default.hintCandidates = cached;
            const config = await USERSCRIPT.getValue('AcasConfig');
            config.global.profiles.default.suggestPawn = true;
            await USERSCRIPT.setValue('AcasConfig', config);
            await instance.refreshHints('default');
        }, bookOnlyCache);
        await page.waitForFunction(() =>
            JSON.stringify(window.board.hints.moves) === JSON.stringify([['c2', 'c4', null]]));
        await dialog.locator('[data-key="suggestionMixPreferBook"]').uncheck();
        await page.waitForFunction(() =>
            JSON.stringify(window.board.hints.moves) !== JSON.stringify([['c2', 'c4', null]]));
        await dialog.locator('.floaty-close-btn').click();

        await gui.locator('[data-key="suggestionMix"]').uncheck();
        await page.waitForFunction(() => window.board.hints.moves.length > 1);
        await gui.waitForFunction(() => window.pipTexts?.includes('Slow') && window.pipTexts.includes('Target'));
        assert.equal(await gui.evaluate(() => window.pipTexts.includes('Suggestion mix')), false,
            'Disabling the mix restores individual PiP profile sections');
        const config = await gui.evaluate(() => JSON.parse(localStorage.getItem('gm:AcasConfig')));
        assert.equal(config.global.suggestionMix, false);
        assert.ok(Object.values(config.global.profiles).every(profile => profile.suggestionMix === undefined));
        assert.deepEqual(errors, []);
        await page.evaluate(() => window.board.destroy());
        await gui.setViewportSize({ width: 390, height: 844 });
        await gui.evaluate(() => localStorage.setItem('selectedLanguage', 'fi'));
        await gui.reload();
        await gui.waitForFunction(() =>
            document.getElementById('suggestion-mix-title').textContent === 'Ehdotussekoitus');
        await opener.click();
        assert.equal(await dialog.locator('.floaty-close-btn').textContent(), '💾');
        await assertPercentageStyle();
        assert.equal(await dialog.locator('[data-mix-category="alternative"]').inputValue(), '100');
        const fits = await dialog.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            return bounds.left >= 0 && bounds.right <= innerWidth
                && element.scrollWidth <= element.clientWidth;
        });
        assert.equal(fits, true, 'The translated popup must fit a mobile viewport');
    } finally {
        await context.close();
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
