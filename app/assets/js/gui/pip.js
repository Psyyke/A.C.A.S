import { floatingPanelVideoElem, floatingFloaty, pipBoardInput, pipSanInput, pipQualityInput } from './elementDeclarations.js';
import { initMediaSession, setMediaMetadata, stopMediaSession } from './media.js';
import { formatMoveNotationAsync } from '../misc/moveNotation.js';
import { getBackgroundGrainTile } from './backgroundGrain.js';

export const pipData = {};
const pipFontSizes = { large: 64, mlarge: 35, medium: 26, feedback: 19, small: 18, esmall: 18 };
const pipHeaderHeight = 44;
const pipEvalBarWidth = 40;
const pipStatusBarHeight = 2;
const pipBoardWidth = 360;
const pipOpeningHeight = 36;
const pipFeedbackHeight = 68;
const pipFeedbackTotalsHeight = 36;
const pipFeedbackEmojis = ['🤩', '😁', '😊', '🙂', '📖', '😕', '🤨', '😟', '😨', '💀'];
const pipLayoutWidth = 400;
const pipTextPadding = 16;
const pipTextColumnGap = 16;
const PIP_CONTEXT_QUEUE_LIMIT = 30;

let pipHintInstance = null;
let pipHintRevision = 0;
let pipLayoutHeight = 200;
let pipBoardHeight = pipBoardWidth;

let pipCanvas = null;
let pipVideo = null;
let pipLastPipBoardBitmaps = [null, null];
let pipBoardAnimation = null;
let pipBoardCapture = null;

let pipContextQueue = [];
let pipProcessingBestMove = false;
let pipRefreshTimeout = null;
let lastProcessedDepth = null;
let pipRefreshRevision = 0;
let pipBoardCaptureRevision = 0;
let pipBackgroundCanvas = null;
let pipBackgroundTheme = null;
let pipEvaluationState = null;
let pipEvaluationChangeTimeout = null;

function getPipResolutionScale() {
    const quality = Number(pipQualityInput?.value || 50);
    // Preserve the original 400px-wide stream at the default 50% quality.
    return (Number.isFinite(quality) ? Math.max(1, Math.min(100, quality)) : 50) / 50;
}

function getPipBackground() {
    const logicalWidth = pipLayoutWidth - pipEvalBarWidth;
    const width = Math.max(1, Math.round(logicalWidth * pipCanvas.width / pipLayoutWidth));
    const height = pipCanvas.height;
    const theme = pipData.themeColorHex || '#5f8895';

    if(
        pipBackgroundCanvas?.width === width
        && pipBackgroundCanvas.height === height
        && pipBackgroundTheme === theme
    ) return pipBackgroundCanvas;

    const background = document.createElement('canvas');
    background.width = width;
    background.height = height;

    const ctx = background.getContext('2d');
    if(!ctx) return null;

    ctx.setTransform(width / logicalWidth, 0, 0, height / pipLayoutHeight, 0, 0);
    ctx.fillStyle = theme;
    ctx.fillRect(0, 0, logicalWidth, pipLayoutHeight);

    const tile = getBackgroundGrainTile();
    const grain = tile && ctx.createPattern(tile, 'repeat');

    if(grain) {
        ctx.fillStyle = grain;
        ctx.fillRect(0, 0, logicalWidth, pipLayoutHeight);
    }

    // Rebuild only on theme/size changes. Normal PiP updates copy one bitmap;
    // no noise generation, image decoding or additional refresh loop is needed.
    pipBackgroundCanvas = background;
    pipBackgroundTheme = theme;

    return background;
}

function getPipOpeningHeight() {
    return pipData.learningMode ? pipOpeningHeight : 0;
}

function getPipContentHeight() {
    return pipData.learningMode || pipBoardInput.checked
        ? pipHeaderHeight + pipBoardHeight : 200;
}

function resizePipCanvas() {
    if(!pipCanvas) return;

    const height = getPipContentHeight()
        + getPipOpeningHeight()
        + (pipData.learningMode || pipData.feedbackInPip ? pipFeedbackHeight + pipFeedbackTotalsHeight : 0);
    const scale = getPipResolutionScale();
    const pixelWidth = Math.max(1, Math.round(pipLayoutWidth * scale));
    const pixelHeight = Math.max(1, Math.round(height * scale));

    if(pipCanvas.width === pixelWidth && pipCanvas.height === pixelHeight && pipLayoutHeight === height) return;

    pipLayoutHeight = height;
    pipCanvas.width = pixelWidth;
    pipCanvas.height = pixelHeight;

    if(pipVideo) {
        pipVideo.width = pipLayoutWidth / 2;
        pipVideo.height = height / 2;
    }

    // The existing canvas stream follows its new aspect ratio without reopening
    // PIP. Never replay drawing commands made for the previous dimensions.
    pipContextQueue = [];
    pipProcessingBestMove = false;
    pipBoardCaptureRevision++;
    clearPipBoardAnimation();
}

export function updatePipData(data) {
    // Invalidate an in-flight capture before it can paint an older evaluation
    // or the previous board's orientation over the latest values.
    if(data && ['eval', 'centipawnEval', 'mate', 'playerColor', 'boardOrientation', 'learningMode']
        .some(key => Object.hasOwn(data, key) && data[key] !== pipData[key])) pipRefreshRevision++;
    if(data?.learningMode === false || data?.learningPvAnimation === false
        || (data && Object.hasOwn(data, 'feedbackPositions')
            && JSON.stringify(data.feedbackPositions) !== JSON.stringify(pipData.feedbackPositions))) {
        clearPipBoardAnimation();
        pipBoardCaptureRevision++;
    }

    if(data) Object.assign(pipData, data);

    if(data && (['moveObjects', 'hintsFiltered', 'openingText', 'feedbackText', 'feedbackTotals', 'feedbackPositions', 'learningMode', 'learningPvAnimation', 'learningPvAnimationStopOnEnemyMove', 'feedbackInPip', 'calculationTimeElapsed', 'nodes', 'eval', 'centipawnEval', 'mate', 'playerColor', 'boardOrientation'].some(key => Object.hasOwn(data, key)) || data.depth !== lastProcessedDepth)) {
        clearTimeout(pipRefreshTimeout);

        lastProcessedDepth = data.depth;

        pipRefreshTimeout = setTimeout(() => {
            refreshPipView(true);
        }, 25);
    }
}

export function resetPipHints(instance) {
    Object.values(instance.pV).forEach(variables => { delete variables.pipHints; });
    clearPipBoardAnimation();
    pipBoardCaptureRevision++;
    pipHintInstance = instance;
    updatePipData({ moveObjects: null, hintsFiltered: false });
    updatePipFeedback(instance);
}

export function updatePipOpening(instance) {
    if(pipHintInstance && pipHintInstance !== instance) return;
    const openingText = instance.instanceClosed ? ''
        : instance.instanceElem?.querySelector('.instance-opening-container span')?.textContent?.trim() || '';
    updatePipData({ openingText });
}

export function updatePipEvaluation(instance) {
    // Each GUI board retains its own last valid score. Only the board currently
    // shown in PiP may publish it, including when switching between instances.
    if(pipHintInstance !== instance) return;
    const evaluation = !instance.instanceClosed ? instance.Interface.evaluationData : null;
    const boardOrientation = instance.lastOrientation || evaluation?.playerColor || 'w';
    const previous = pipEvaluationState;
    const sameSource = evaluation && previous?.instance === instance
        && previous.boardOrientation === boardOrientation
        && previous.evaluation.variables === evaluation.variables
        && previous.evaluation.profile === evaluation.profile
        && previous.evaluation.review === evaluation.review
        && previous.evaluation.playerColor === evaluation.playerColor;

    if(!sameSource) {
        clearTimeout(pipEvaluationChangeTimeout);
        pipEvaluationState = evaluation ? {
            instance, evaluation, boardOrientation, from: evaluation.eval, expiresAt: 0
        } : null;
    } else {
        const samePosition = previous.evaluation.fen === evaluation.fen
            && (!evaluation.review || previous.evaluation.postFen === evaluation.postFen);
        const changed = previous.evaluation.eval !== evaluation.eval;
        // Keep the preceding position's score as the baseline while depth improves.
        pipEvaluationState = {
            instance, evaluation, boardOrientation,
            from: samePosition ? previous.from : previous.evaluation.eval,
            expiresAt: changed ? Date.now() + 3000 : previous.expiresAt
        };
        if(changed) {
            clearTimeout(pipEvaluationChangeTimeout);
            if(pipCanvas) {
                pipEvaluationChangeTimeout = setTimeout(() => {
                    if(pipEvaluationState) pipEvaluationState.expiresAt = 0;
                    refreshPipView();
                }, 3000);
            }
        }
    }

    updatePipData({
        eval: evaluation?.eval ?? 0.5,
        centipawnEval: evaluation?.centipawnEval ?? null,
        mate: evaluation?.mate ?? null,
        playerColor: evaluation?.playerColor ?? 'w',
        boardOrientation
    });
}

export function updatePipFeedback(instance) {
    if(pipHintInstance && pipHintInstance !== instance) return;
    updatePipOpening(instance);
    updatePipEvaluation(instance);
    const rows = Array.from(instance.instanceElem?.querySelector('.instance-feedback-container')?.children || []);
    const visibleRows = rows.filter(row => {
        const variables = instance.pV[row.dataset.profileId];
        return variables && (variables.learningMode || !instance.learningMode && variables.feedbackInPip);
    });
    const feedbackText = visibleRows.map(row => row.dataset.feedbackText ?? row.textContent).join('\n');
    const profile = instance.learningMode ? instance.learningReviewProfile
        : visibleRows[0]?.dataset.profileId || Object.keys(instance.pV).find(profile => instance.pV[profile].feedbackInPip);
    const variables = instance.pV[profile];
    const feedbackTotals = Object.fromEntries(pipFeedbackEmojis.map(emoji => [emoji, 0]));
    if(!instance.instanceClosed) {
        instance.gameStateHistory.forEach(state => {
            const emoji = state.feedback?.[profile];
            if(Object.hasOwn(feedbackTotals, emoji)) feedbackTotals[emoji]++;
        });
    }
    const stopOnEnemyMove = variables?.learningPvAnimationStopOnEnemyMove !== false;
    const feedback = variables?.learningMode && variables.lastFeedbackFen === instance.learningReviewPostFen
        && variables.lastFeedbackResult?.bestLine
        && variables.lastFeedbackResult.bestMove !== variables.lastFeedbackResult.move
        ? variables.lastFeedbackResult : null;

    updatePipData({ learningMode: Boolean(instance.learningMode),
        learningPvAnimation: Boolean(variables?.learningMode && variables.learningPvAnimation),
        learningPvAnimationStopOnEnemyMove: stopOnEnemyMove,
        feedbackInPip: Object.values(instance.pV).some(variables => variables.feedbackInPip),
        feedbackText: instance.instanceClosed ? '' : feedbackText,
        feedbackTotals,
        // Apply the stop setting to refreshes too, so later updates cannot
        // restart an animation that should stay stopped after the reply.
        feedbackPositions: !instance.instanceClosed && (!stopOnEnemyMove || instance.currentFen === instance.learningReviewPostFen)
            ? feedback?.bestPositions || [] : [] });
}

export function updatePipHints(instance, profile, result) {
    if(result && !instance.instanceClosed && instance.pV[profile]) {
        instance.pV[profile].pipHints = { ...result, fen: instance.learningMode ? instance.displayFen : instance.currentFen, revision: ++pipHintRevision };
        pipHintInstance = instance;
    }
    // Profile removal on another board must not replace the currently displayed hints.
    if(pipHintInstance !== instance) return;
    if(instance.instanceClosed) {
        updatePipEvaluation(instance);
        pipHintInstance = null;
        updatePipData({ moveObjects: null, hintsFiltered: false, openingText: '', feedbackText: '', feedbackTotals: {}, feedbackPositions: [], learningMode: false, learningPvAnimation: false, feedbackInPip: false });
        return;
    }

    const profiles = Object.values(instance.pV).filter(variables => !instance.learningMode || variables.learningMode);
    const currentHints = variables => variables.pipHints?.fen === (instance.learningMode ? instance.displayFen : instance.currentFen) ? variables.pipHints : null;
    const results = profiles.map(currentHints).filter(Boolean);
    // Preserve the latest visible profile rather than letting an empty profile win.
    const visible = results.filter(hints => hints.moveObjects.length)
        .sort((a, b) => b.revision - a.revision)[0];
    const awaitingHints = profiles.some(variables => variables.engineSettingsReady
        && (variables.multiPV ?? 2) > 0 && !currentHints(variables)
        && (!variables.chessVariants?.length || variables.chessVariants.includes(variables.chessVariant)));
    updatePipData({
        moveObjects: visible?.moveObjects ?? (results.length ? [] : null),
        hintsFiltered: !visible && !awaitingHints && results.some(hints => hints.hintsFiltered)
    });
    updatePipFeedback(instance);
}

window.REFRESH_PIP_DISPLAY = () => {
    clearTimeout(pipRefreshTimeout);
    refreshPipView(true);
};

function clearPipBoardAnimation() {
    clearTimeout(pipBoardAnimation?.timer);
    pipBoardAnimation = null;
}

function canAnimatePipBoard() {
    return pipData.learningMode && pipData.learningPvAnimation && !CONCEAL_ASSISTANCE_ACTIVE
        && pipHintInstance && !pipHintInstance.instanceClosed
        && pipHintInstance.learningReviewPostFen
        && (pipData.learningPvAnimationStopOnEnemyMove === false
            || pipHintInstance.currentFen === pipHintInstance.learningReviewPostFen);
}

async function capturePipAnimation(cgElem, positions, rootPosition, outputSize, state, isCurrent) {
    // Chessground snaps its grid to device pixels. Use the live board's source
    // size for every frame so its grid also stays aligned with the root overlay.
    const sourceRect = cgElem.getBoundingClientRect();
    const preview = cgElem.parentElement.cloneNode(false);
    preview.style.cssText = `position:absolute; left:-9999px; top:0; width:${sourceRect.width}px; height:${sourceRect.height}px; padding:0; display:block;`;
    preview.setAttribute('aria-hidden', 'true');
    preview.inert = true;

    const boardElem = document.createElement('div');
    boardElem.style.cssText = `width:${sourceRect.width}px; height:${sourceRect.height}px;`;
    preview.appendChild(boardElem);
    cgElem.parentElement.appendChild(preview);

    let ground;
    const frames = [];

    try {
        ground = window.ChessgroundX(boardElem, {
            fen: rootPosition.fen,
            orientation: state.orientation,
            dimensions: state.dimensions,
            coordinates: state.coordinates,
            notation: state.notation,
            viewOnly: true,
            animation: { enabled: false },
            drawable: { enabled: false, visible: false }
        });

        // Include the starting position in the same rendering/capture path;
        // mixing a live-board screenshot with preview frames causes a tiny jump.
        for(const position of [rootPosition, ...positions]) {
            if(!isCurrent()) break;
            ground.set({ fen: position.fen, lastMove: position.lastMove });
            ground.state.dom.redrawNow();

            const { boardCanvas } = await captureBoardLayers(null, outputSize, boardElem);
            if(!boardCanvas) break;
            frames.push([boardCanvas, null]);
        }
    } catch(error) {
        console.warn('[PiP] Could not capture the feedback animation:', error);
    } finally {
        ground?.destroy();
        preview.remove();
    }

    return frames;
}

async function renderPipBoards() {
    const cgElem = pipHintInstance?.instanceElem?.querySelector('.chessground-x') || document.querySelector(
        '.chessground-x[data-is-latest-updated="true"]'
    );

    if(!cgElem) {
        clearPipBoardAnimation();
        pipBoardCaptureRevision++;
        return;
    }

    const instanceId = cgElem.parentElement?.parentElement?.dataset?.instanceId;

    // Fit the PiP layout to the live board before capturing, rather than
    // letterboxing rectangular variants inside a fixed square area.
    const boardRect = cgElem.getBoundingClientRect();
    const boardAspectRatio = boardRect.width / boardRect.height;

    // Ignore transient, stretched layouts without replacing the last valid frame.
    if(!(boardRect.width > 0 && boardRect.height > 0)
        || !Number.isFinite(boardAspectRatio)
        || boardAspectRatio < 0.5 || boardAspectRatio > 2) {
        clearPipBoardAnimation();
        pipBoardCaptureRevision++;
        return;
    }

    pipBoardHeight = pipBoardWidth / boardAspectRatio;
    resizePipCanvas();

    const captureSize = Math.max(1, Math.round(pipBoardWidth * pipCanvas.width / pipLayoutWidth));
    const positions = canAnimatePipBoard() ? pipData.feedbackPositions || [] : [];
    const state = pipHintInstance?.chessground?.state;
    const boardStyle = getComputedStyle(cgElem.querySelector('cg-board'));
    const animationKey = state && positions.length > 1 ? JSON.stringify([
        instanceId, captureSize, pipHintInstance?.learningReviewPostFen, positions,
        state?.orientation, cgElem.parentElement.className,
        cgElem.getBoundingClientRect().width, cgElem.getBoundingClientRect().height,
        state.dimensions, window.devicePixelRatio,
        boardStyle.backgroundColor, boardStyle.backgroundImage
    ]) : null;

    // Engine progress can refresh often; only capture again when the line or appearance changes.
    if(animationKey && pipBoardAnimation?.key === animationKey) return;
    if(animationKey && pipBoardCapture?.key === animationKey && pipBoardCapture.revision === pipBoardCaptureRevision) {
        await pipBoardCapture.promise;
        return;
    }

    clearPipBoardAnimation();
    const revision = ++pipBoardCaptureRevision;
    const promise = capturePipBoards(cgElem, instanceId, captureSize, positions, state, animationKey, revision);
    pipBoardCapture = { key: animationKey, revision, promise };

    try {
        await promise;
    } finally {
        if(pipBoardCapture?.promise === promise) pipBoardCapture = null;
    }
}

async function capturePipBoards(cgElem, instanceId, captureSize, positions, state, animationKey, captureRevision) {
    const instance = pipHintInstance;
    const reviewFen = instance?.learningReviewPostFen;
    const rootPosition = animationKey ? {
        fen: instance.chessground.getFen(),
        lastMove: state.lastMove ? [...state.lastMove] : undefined
    } : null;
    const positionKey = JSON.stringify(positions);
    const isCurrent = () => captureRevision === pipBoardCaptureRevision
        && (!animationKey || canAnimatePipBoard() && pipHintInstance === instance
            && instance.learningReviewPostFen === reviewFen
            && JSON.stringify(pipData.feedbackPositions || []) === positionKey);
    const { boardCanvas, overlayCanvas } = await captureBoardLayers(instanceId, captureSize);

    if(!boardCanvas) return;

    const bitmap = await createImageBitmap(boardCanvas);

    const emptyOverlayCanvas = document.createElement('canvas');
    emptyOverlayCanvas.width = boardCanvas.width;
    emptyOverlayCanvas.height = boardCanvas.height;

    const bitmap2 = await createImageBitmap(
        overlayCanvas || emptyOverlayCanvas
    );
    const animationFrames = animationKey && isCurrent()
        ? await capturePipAnimation(cgElem, positions, rootPosition, captureSize, state, isCurrent) : [];

    // Captures are asynchronous. Discard an older capture if a newer refresh
    // started while this one was being rendered, so stale pixels cannot win a race.
    if(!isCurrent()) {
        bitmap.close?.();
        bitmap2.close?.();
        return;
    }

    const previousBitmaps = pipLastPipBoardBitmaps;
    pipLastPipBoardBitmaps = [bitmap, bitmap2];

    for(const previousBitmap of previousBitmaps) {
        previousBitmap?.close?.();
    }

    if(animationFrames.length > 2) {
        const animation = pipBoardAnimation = {
            key: animationKey,
            frames: [[animationFrames[0][0], bitmap2], ...animationFrames.slice(1)],
            index: 0
        };

        const advance = async () => {
            if(pipBoardAnimation !== animation) return;
            if(!isCurrent()) {
                clearPipBoardAnimation();
            } else {
                animation.index = (animation.index + 1) % animation.frames.length;
            }

            try {
                await refreshPipView();
            } catch(error) {
                console.error(error);
            }
            if(pipBoardAnimation === animation) {
                // Hold the start for two seconds and the final position for five.
                const delay = animation.index === 0 ? 2000
                    : animation.index === animation.frames.length - 1 ? 5000 : 1000;
                animation.timer = setTimeout(advance, delay);
            }
        };
        animation.timer = setTimeout(advance, 2000);
    }
}

async function captureBoardLayers(instanceId, outputSize, boardElement = null) {
    const boards = [
        ...document.querySelectorAll(
            '.chessground-x'
        )
    ];

    const cgElem = boardElement || (instanceId
        ? boards.find(
            elem =>
                elem.parentElement?.parentElement?.dataset?.instanceId
                === String(instanceId)
        ) || boards[0]
        : boards[0]);

    if(!cgElem) {
        return { boardCanvas: null, overlayCanvas: null };
    }

    const rect = cgElem.getBoundingClientRect();

    const acasInstance = window.AcasInstances?.find(
        i => String(i.id) === String(instanceId)
    );

    if(!boardElement && acasInstance?.instance?.chessground) {
        acasInstance.instance.chessground.redrawAll();
    }

    // Render PiP captures at their actual stream resolution, not the full DOM
    // board size. Screenshot exports omit outputSize and retain native quality.
    const captureOptions = { fast: true };
    if(outputSize && rect.width > 0) {
        captureOptions.scale = outputSize / rect.width;
        captureOptions.dpr = 1;
    }

    const boardCanvas = await snapdom.toCanvas(cgElem, captureOptions);

    // Future positions have their own last-move highlight, not the root's arrows.
    if(boardElement) return { boardCanvas, overlayCanvas: null };

    const boardDrawerSvg = document.querySelector(
        `#board-drawings svg${instanceId ? `[data-instance-id="${instanceId}"]` : ''}`
    );

    if(!boardDrawerSvg) {
        return { boardCanvas, overlayCanvas: null };
    }

    const svg = boardDrawerSvg.cloneNode(true);
    svg.style.position = 'unset';

    const container = document.createElement('div');

    container.appendChild(svg);

    container.style.cssText = `
        position:absolute;
        left:-9999px;
        top:0;
        width:${rect.width}px;
        height:${rect.height}px;
    `;

    document.body.appendChild(container);

    try {
        const overlayCanvas = await snapdom.toCanvas(
            container,
            captureOptions
        );

        return { boardCanvas, overlayCanvas };
    } finally {
        container.remove();
    }
}

window.CAPTURE_BOARD_IMAGE = async instanceId => {
    const { boardCanvas, overlayCanvas } = await captureBoardLayers(instanceId);

    if(!boardCanvas) return null;

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = boardCanvas.width;
    outputCanvas.height = boardCanvas.height;

    const context = outputCanvas.getContext('2d');

    context.drawImage(boardCanvas, 0, 0);

    if(overlayCanvas) {
        context.drawImage(overlayCanvas, 0, 0);
    }

    return outputCanvas.toDataURL('image/png');
};

function drawPipText(ctx, text, x, y, width, height, font, align = 'left') {
    if(!text || width <= 0 || height <= 0) return;

    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.direction = 'ltr';

    const metrics = ctx.measureText(text);
    const lineMetrics = ctx.measureText('Mg');
    const ascent = lineMetrics.actualBoundingBoxAscent;
    const descent = lineMetrics.actualBoundingBoxDescent;
    const left = metrics.actualBoundingBoxLeft;
    const textWidth = Math.max(metrics.width, left + metrics.actualBoundingBoxRight);
    // Fit long notation and translations uniformly rather than squeezing glyphs.
    const scale = Math.min(1, width / Math.max(1, textWidth), height / Math.max(1, ascent + descent));
    const remainingWidth = width - textWidth * scale;
    const offset = align === 'center' ? remainingWidth / 2 : align === 'right' ? remainingWidth : 0;
    const textX = x + offset + left * scale;
    const textY = y + (height - (ascent + descent) * scale) / 2 + ascent * scale;
    const scaleX = pipCanvas.width / pipLayoutWidth;
    const scaleY = pipCanvas.height / pipLayoutHeight;

    // Snap baselines to backing pixels at every PiP quality setting.
    ctx.translate(Math.round(textX * scaleX) / scaleX, Math.round(textY * scaleY) / scaleY);
    ctx.scale(scale, scale);
    ctx.fillText(text, 0, 0);
    ctx.restore();
}

function updatePipContext() {
    const ctx = pipCanvas.getContext('2d');
    // All layout coordinates stay in the original 400px space. Only the backing
    // resolution changes, keeping text, feedback and evaluation bars in place.
    ctx.setTransform(pipCanvas.width / pipLayoutWidth, 0, 0, pipCanvas.height / pipLayoutHeight, 0, 0);

    const latestQueueArr = pipProcessingBestMove
        ? pipContextQueue.find(x => x?.[0]?.[1] === pipProcessingBestMove)
        : pipContextQueue?.[0];

    if(latestQueueArr) {
        if(pipProcessingBestMove) {
            pipProcessingBestMove = false;
            pipContextQueue = [];
        }

        for(const [cmd, args] of latestQueueArr) {
            if(cmd === 'text') {
                drawPipText(ctx, ...args);
            } else if(cmd in ctx) {
                if(Array.isArray(args)) ctx[cmd](...args);
                else ctx[cmd] = args;
            }
        }

        // Shade the board area, leaving the opening and feedback footers flat.
        // Every queued frame clears the canvas first, so this never accumulates.
        ctx.save();
        const shadedHeight = getPipContentHeight();
        ctx.beginPath();
        ctx.rect(0, 0, pipLayoutWidth, shadedHeight);
        ctx.clip();

        const shade = ctx.createLinearGradient(
            0,
            pipLayoutHeight,
            pipLayoutWidth,
            0
        );

        shade.addColorStop(0, 'rgba(0, 0, 0, 0.38)');
        shade.addColorStop(0.18, 'rgba(0, 0, 0, 0.12)');
        shade.addColorStop(0.45, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, pipLayoutWidth, pipLayoutHeight);
        ctx.restore();
    }
}

async function refreshPipView() {
    const revision = ++pipRefreshRevision;
    const moveObjects = pipData.moveObjects;
    const ctxQueue = [];

    const boardOrientation = pipData.boardOrientation || pipData.playerColor,
          bestMove = pipData?.moveObjects?.[0],
          sMove = pipData?.moveObjects?.[1],
          tMove = pipData?.moveObjects?.[2],
          from = bestMove?.player?.[0],
          to = bestMove?.player?.[1],
          sFrom = sMove?.player?.[0],
          sTo = sMove?.player?.[1],
          tFrom = tMove?.player?.[0],
          tTo = tMove?.player?.[1];

    const useSan = Boolean(pipSanInput?.checked);

    const isCurrentNotation = () =>
        pipData.moveObjects === moveObjects
        && Boolean(pipSanInput?.checked) === useSan
        && !CONCEAL_ASSISTANCE_ACTIVE;

    const [bestMoveText, secondMoveText, thirdMoveText] = await Promise.all(
        [bestMove, sMove, tMove].map(
            move => formatMoveNotationAsync(
                move,
                useSan,
                false,
                undefined,
                isCurrentNotation
            )
        )
    );

    if(
        revision !== pipRefreshRevision
        || pipData.moveObjects !== moveObjects
        || Boolean(pipSanInput?.checked) !== useSan
    ) return;

    const centipawnEval = pipData?.centipawnEval / 100;

    const filteredText = TRANS_OBJ?.moveSpeech?.hintsFiltered ?? 'Suggestions filtered';
    const hintsFiltered = !moveObjects?.length && pipData.hintsFiltered && !CONCEAL_ASSISTANCE_ACTIVE;
    const mediaTitle = pipData.learningMode ? 'A.C.A.S' : from && !CONCEAL_ASSISTANCE_ACTIVE
        ? bestMoveText
        : hintsFiltered ? filteredText : `Hold on, I'm thinking...`;

    const engineEvaluation = Number.isFinite(pipData.eval) ? pipData.eval : 0.5;
    let progress = 0;

    if(pipData.calculationFinished) {
        progress = 1;
    } else if(Number.isFinite(pipData.movetime) && pipData.movetime > 0) {
        progress = pipData.calculationTimeElapsed / pipData.movetime;
    } else if(
        (pipData.goalDepth && pipData.goalDepth < 100)
        || (pipData.depth === null)
    ) {
        const depth = pipData.depth ?? pipData.goalDepth;

        progress = depth / pipData.goalDepth;
    } else if(pipData?.goalNodes) {
        progress = pipData?.nodes / pipData?.goalNodes;
    } else {
        progress = CALC_TIME_PROGRESS(
            pipData.startTime,
            pipData.movetime
        );
    }
    progress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;

    setMediaMetadata({
        title: mediaTitle,
        artist: `Depth ${pipData?.depth ?? 0} (${Math.round((progress ?? 0) * 100)}%) | Eval ${
            Number.isFinite(centipawnEval)
                ? centipawnEval.toFixed(2)
                : "0.00"
        }`
    });

    if(!pipCanvas) return; // do not continue if pip is not enabled

    resizePipCanvas();

    const isBoard = pipData.learningMode || pipBoardInput.checked;

    if(isBoard) await renderPipBoards();
    else {
        clearPipBoardAnimation();
        pipBoardCaptureRevision++;
    }

    if(
        revision !== pipRefreshRevision
        || pipData.moveObjects !== moveObjects
    ) return;

    // Board capture may resize the canvas and clear the previous drawing queue.
    if(bestMove) {
        ctxQueue.push(['bestmove', from + to]);
        pipProcessingBestMove = from + to;
    }

    const headerWidth = pipLayoutWidth - pipEvalBarWidth;
    const pipMaxTextWidth = headerWidth - pipTextPadding * 2;
    const alternativeWidth = (pipMaxTextWidth - pipTextColumnGap) / 2;
    const thirdMoveX = pipTextPadding + alternativeWidth + pipTextColumnGap;
    const openingHeight = getPipOpeningHeight();
    const contentHeight = getPipContentHeight();
    const headerTextHeight = pipHeaderHeight - pipStatusBarHeight;
    const secondaryMoveY = contentHeight - 40;

    const noInstancesText =
        FULL_TRANS_OBJ?.domTranslations?.['#no-instances-title'];

    // Clear canvas
    ctxQueue.push([
        'clearRect',
        [0, 0, pipLayoutWidth, pipLayoutHeight]
    ]);

    // Grain stays behind the header, notation and board, not over their pixels.
    const background = getPipBackground();

    if(background) {
        ctxQueue.push(['drawImage', [background, 0, 0, headerWidth, pipLayoutHeight]]);
    } else {
        ctxQueue.push([
            'fillStyle',
            pipData.themeColorHex || '#5f8895'
        ]);
        ctxQueue.push([
            'fillRect',
            [0, 0, headerWidth, pipLayoutHeight]
        ]);
    }

    // Header background
    ctxQueue.push(['fillStyle', 'rgba(0, 0, 0, 0.7)']);
    ctxQueue.push([
        'fillRect',
        [0, 0, headerWidth, pipHeaderHeight - pipStatusBarHeight]
    ]);

    // Header title
    ctxQueue.push(['fillStyle', 'white']);
    ctxQueue.push(['text', ['A.C.A.S', 10, 3, 104, headerTextHeight,
        `800 ${pipFontSizes.medium}px "Mona Sans", sans-serif`]]);

    // Status and idle messages share the move column's left and right edges.
    ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.7)']);

    if(!pipData.learningMode && (pipData?.moveProgressText || hintsFiltered)) {
        ctxQueue.push(['text', [hintsFiltered ? filteredText : pipData.moveProgressText,
            pipTextPadding, pipHeaderHeight + 12, pipMaxTextWidth, 32,
            `500 ${pipFontSizes.medium}px "IBM Plex Sans", sans-serif`]]);
    } else if(
        !pipData.learningMode && noInstancesText
        && !pipData?.moveObjects
        && to !== 'one)'
    ) {
        const idleFont = `700 ${pipFontSizes.medium}px "IBM Plex Sans", sans-serif`;
        ctxQueue.push(['text', [noInstancesText, pipTextPadding, pipHeaderHeight + 15,
            pipMaxTextWidth, 32, idleFont]]);
        ctxQueue.push(['text', ['ദ്ദി(˵ •̀ ᴗ - ˵ ) ✧', pipTextPadding, pipHeaderHeight + 43,
            pipMaxTextWidth, 40, idleFont]]);
    }

    // Time + progress
    if(pipData.calculationTimeElapsed != null) {
        const timeMs = pipData.calculationTimeElapsed;

        const timeFormatted = timeMs > 9999
            ? `${(timeMs / 1000).toFixed(1)}s`
            : `${timeMs}ms`;

        const progressPercent = (progress * 100).toFixed(0);

        ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.5)']);
        const statsText = pipData.learningMode ? `(${pipData.depth || 0} ∝ ${timeFormatted}, ${progressPercent}%)`
            : `(${timeFormatted}, ${progressPercent}%)`;
        const statsX = pipTextPadding + 104 + 2;
        ctxQueue.push(['text', [statsText, statsX, 2, headerWidth - pipTextPadding - statsX,
            headerTextHeight, `600 ${pipFontSizes.small}px "IBM Plex Sans", "Mona Sans", sans-serif`]]);
    }

    ctxQueue.push(['fillStyle', 'white']);

    // Board rendering
    if(isBoard) {
        const [bitmap, bitmap2] = pipBoardAnimation?.frames[pipBoardAnimation.index] || pipLastPipBoardBitmaps;

        if(bitmap) {
            const boardRect = [0, pipHeaderHeight, pipBoardWidth, pipBoardHeight];

            ctxQueue.push([
                'drawImage',
                [bitmap, ...boardRect]
            ]);

            if(bitmap2) {
                ctxQueue.push([
                    'drawImage',
                    [bitmap2, ...boardRect]
                ]);
            }
        }
    // Text-based rendering
    } else {
        const mainMoveFont = `900 ${pipFontSizes.large}px "Mona Sans", sans-serif`;
        const mainMoveTop = pipHeaderHeight + 52;
        if(to === 'one)') {
            ctxQueue.push(['text', ['≽(•⩊ •マ≼', pipTextPadding, mainMoveTop,
                pipMaxTextWidth, 60, mainMoveFont]]);
        } else if(bestMove && !CONCEAL_ASSISTANCE_ACTIVE) {
            ctxQueue.push(['text', [bestMoveText, pipTextPadding, mainMoveTop,
                pipMaxTextWidth, 60, mainMoveFont]]);
        }

        ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.5)']);
        const secondaryMoveFont = `500 ${pipFontSizes.medium}px "Mona Sans", sans-serif`;

        if(sFrom && sTo && !CONCEAL_ASSISTANCE_ACTIVE) {
            ctxQueue.push(['text', [`2. (${secondMoveText})`, pipTextPadding, secondaryMoveY,
                alternativeWidth, 28, secondaryMoveFont]]);
        }

        if(tFrom && tTo && !CONCEAL_ASSISTANCE_ACTIVE) {
            ctxQueue.push(['text', [`3. (${thirdMoveText})`, thirdMoveX, secondaryMoveY,
                alternativeWidth, 28, secondaryMoveFont]]);
        }
    }

    if(openingHeight) {
        ctxQueue.push(['fillStyle', '#202020']);
        ctxQueue.push(['fillRect', [0, contentHeight, headerWidth, openingHeight]]);
        ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.10)']);
        ctxQueue.push(['fillRect', [0, contentHeight, headerWidth, 1]]);
        ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.72)']);
        ctxQueue.push(['text', [pipData.openingText, pipTextPadding, contentHeight + 2,
            pipMaxTextWidth, openingHeight,
            `400 ${pipFontSizes.small}px "IBM Plex Sans", "Mona Sans", sans-serif`, 'center']]);
    }

    if((pipData.learningMode || pipData.feedbackInPip)) {
        const totalsTop = contentHeight + openingHeight;
        const top = totalsTop + pipFeedbackTotalsHeight;
        const lines = String(pipData.feedbackText || '')
            .split('\n')
            .filter(Boolean)
            .slice(0, 2);

        ctxQueue.push(['fillStyle', '#202020']);
        ctxQueue.push(['fillRect', [0, top, headerWidth, pipFeedbackHeight]]);
        ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.08)']);
        ctxQueue.push(['fillRect', [pipTextPadding, top, pipMaxTextWidth, 1]]);
        ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.72)']);

        const lineHeight = 26;
        const textTop = top + (pipFeedbackHeight - 2 * lineHeight) / 2;

        if(!CONCEAL_ASSISTANCE_ACTIVE) {
            const scoreWidth = 88;
            const moveWidth = pipMaxTextWidth - scoreWidth - pipTextColumnGap;
            const font = `400 ${pipFontSizes.feedback}px "Rubik", "IBM Plex Sans", "Mona Sans", sans-serif`;

            lines.forEach((line, index) => {
                // Separate numeric/mate scores without matching notation parentheses.
                const score = line.match(/\s*\(([+-]?\d+(?:\.\d+)?|-?M\d+)\)/);
                const rowTop = textTop + index * lineHeight;

                ctxQueue.push(['text', [
                    score ? line.replace(score[0], '').trim() : line,
                    pipTextPadding,
                    score ? rowTop : top + (pipFeedbackHeight - lineHeight) / 2,
                    score ? moveWidth : pipMaxTextWidth,
                    lineHeight,
                    font,
                    score ? 'left' : 'center'
                ]]);

                if(score) {
                    ctxQueue.push(['text', [
                        `(${score[1]})`,
                        headerWidth - pipTextPadding - scoreWidth,
                        rowTop,
                        scoreWidth,
                        lineHeight,
                        font,
                        'right'
                    ]]);
                }
            });
        }

        const totalsText = pipFeedbackEmojis
            .filter(emoji => pipData.feedbackTotals?.[emoji] > 0)
            .map(emoji => `${emoji}${pipData.feedbackTotals[emoji]}`)
            .join('  ');
        ctxQueue.push(['fillStyle', '#202020']);
        ctxQueue.push(['fillRect', [0, totalsTop, headerWidth, pipFeedbackTotalsHeight]]);
        ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.08)']);
        ctxQueue.push(['fillRect', [pipTextPadding, totalsTop, pipMaxTextWidth, 1]]);
        ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.85)']);

        if(!CONCEAL_ASSISTANCE_ACTIVE) {
            ctxQueue.push(['text', [
                totalsText,
                pipTextPadding,
                totalsTop,
                pipMaxTextWidth,
                pipFeedbackTotalsHeight,
                '500 17px "Mona Sans", sans-serif',
                'center'
            ]]);
        }
    }

    // Keep the Learning Mode board free of the calculation progress sweep.
    if(!pipData.learningMode) {
        ctxQueue.push(['fillStyle', 'rgba(0, 0, 0, 0.1)']);
        ctxQueue.push([
            'fillRect',
            [
                0,
                pipHeaderHeight,
                headerWidth * progress,
                contentHeight - pipHeaderHeight
            ]
        ]);
    }

    // Eval bar background + foreground
    const evalBoundary = boardOrientation === 'b' ? engineEvaluation : 1 - engineEvaluation;
    if(boardOrientation === 'b') {
        ctxQueue.push(['fillStyle', 'rgba(50, 50, 50, 1)']);
        ctxQueue.push([
            'fillRect',
            [
                headerWidth,
                0,
                pipEvalBarWidth,
                pipLayoutHeight
            ]
        ]);

        ctxQueue.push(['fillStyle', 'rgba(200, 200, 200, 1)']);
        ctxQueue.push([
            'fillRect',
            [
                headerWidth,
                0,
                pipEvalBarWidth,
                pipLayoutHeight * evalBoundary
            ]
        ]);
    } else {
        ctxQueue.push(['fillStyle', 'rgba(200, 200, 200, 1)']);
        ctxQueue.push([
            'fillRect',
            [
                headerWidth,
                0,
                pipEvalBarWidth,
                pipLayoutHeight
            ]
        ]);

        ctxQueue.push(['fillStyle', 'rgba(50, 50, 50, 1)']);
        ctxQueue.push([
            'fillRect',
            [
                headerWidth,
                0,
                pipEvalBarWidth,
                pipLayoutHeight * evalBoundary
            ]
        ]);
    }

    if(!CONCEAL_ASSISTANCE_ACTIVE && pipEvaluationState?.expiresAt > Date.now()) {
        const previousEvaluation = pipEvaluationState.from;
        const previousBoundary = boardOrientation === 'b' ? previousEvaluation : 1 - previousEvaluation;
        const currentBoundary = evalBoundary;
        // Color follows the selected side (reverseSide included), not the board flip.
        const improved = (engineEvaluation - previousEvaluation)
            * (pipEvaluationState.evaluation.playerColor === 'b' ? -1 : 1) > 0;

        ctxQueue.push(['fillStyle', improved ? 'rgba(155, 220, 175, 1)' : 'rgba(240, 145, 145, 1)']);
        ctxQueue.push(['fillRect', [
            headerWidth,
            Math.min(previousBoundary, currentBoundary) * pipLayoutHeight,
            pipEvalBarWidth,
            Math.abs(currentBoundary - previousBoundary) * pipLayoutHeight
        ]]);
    }

    if(pipData.mate == null && centipawnEval) {
        const isTop = boardOrientation === 'w' ? centipawnEval < 0 : centipawnEval > 0;
        const yPosition = isTop ? 8 : pipLayoutHeight - 32;

        const evalText = Math.abs(centipawnEval).toFixed(1);

        ctxQueue.push(['fillStyle', 'rgba(125, 125, 125, 1)']);
        ctxQueue.push(['text', [evalText, headerWidth + 4, yPosition, pipEvalBarWidth - 8, 24,
            `800 ${pipFontSizes.esmall}px "Mona Sans", sans-serif`, 'center']]);
    }

    // Status bar
    ctxQueue.push([
        'fillStyle',
        [
            'rgba(40, 40, 40, 0.9)',
            'rgba(0, 255, 0, 1)',
            'rgba(255, 0, 0, 1)'
        ][pipData.isWinning ?? 0]
    ]);

    ctxQueue.push([
        'fillRect',
        [
            0,
            pipHeaderHeight - pipStatusBarHeight,
            headerWidth,
            pipStatusBarHeight
        ]
    ]);

    pipContextQueue.unshift(ctxQueue);

    // The queue was only emptied once a bestmove arrived. During a long search
    // updatePipData fires on every info line, so it grew for the whole session.
    if(pipContextQueue.length > PIP_CONTEXT_QUEUE_LIMIT) {
        pipContextQueue.length = PIP_CONTEXT_QUEUE_LIMIT;
    }

    updatePipContext();
}

export async function startPictureInPicture() {
    const video = document.createElement('video');

    video.addEventListener('enterpictureinpicture', stopMediaSession);
    video.addEventListener('leavepictureinpicture', initMediaSession);

    pipVideo = video;
    pipCanvas = document.createElement('canvas');

    resizePipCanvas();

    const stream = pipCanvas.captureStream();
    video.srcObject = stream;

    floatingPanelVideoElem.innerHTML = '';
    floatingPanelVideoElem.appendChild(video);

    if(!document.pictureInPictureEnabled && floatingPanelVideoElem) {
        floatingFloaty.showModal();
    }

    const attemptPlay = async () => {
        try {
            refreshPipView();

            await video.play();

            if(document.pictureInPictureEnabled && video?.requestPictureInPicture
                && document.querySelector('input[data-key="pip"]')?.checked) {
                await video.requestPictureInPicture();
            } else {
                initMediaSession();
            }
        } catch(err) {
            initMediaSession();

            if(err.name === 'NotAllowedError') {
                const handleUserInteraction = async () => {
                    document.removeEventListener('click', handleUserInteraction);
                    document.removeEventListener('keydown', handleUserInteraction);

                    await attemptPlay();
                };

                document.addEventListener('click', handleUserInteraction);
                document.addEventListener('keydown', handleUserInteraction);
            } else {
                console.error(err);
            }
        }
    };

    await attemptPlay();
}