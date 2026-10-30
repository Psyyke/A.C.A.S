import { setMediaMetadata } from './media.js';
import { formatMoveNotationAsync } from '../misc/moveNotation.js';
import { feedbackCountLines } from '../misc/feedbackText.js';
import { captureBoardLayers } from './boardCapture.js';

const pipFontSizes = { large: 64, mlarge: 35, medium: 26, feedback: 16, small: 18, esmall: 17 };
const pipTextFontFamily = '"Rubik", "IBM Plex Sans", "Mona Sans", sans-serif';
export const pipHeaderHeight = 44;
export const pipHeaderBackground = '#161616';
export const pipProfileHeaderBackground = '#1d1d1d';
export const pipContentBackground = '#262626';
export const pipEvalBarWidth = 40;
export const pipContentGap = 5;
const pipBoardBorder = 'rgba(160, 160, 160, 0.35)';
const pipCornerRadius = 5;
const pipOpeningHeight = 30;
const pipOpeningBottomPadding = 4;
const pipFeedbackHeight = 68;
const pipFeedbackTotalsLineHeight = 26;
const pipFeedbackTotalsPadding = 5;
const pipLayoutWidth = 400;
const pipTextPadding = 16;
const pipTextColumnGap = 16;
const pipTextContentHeight = 120;
const pipTerminalMessageBottomPadding = 42;
const PIP_CONTEXT_QUEUE_LIMIT = 30;

export function getPipBoardHeight(width, aspectRatio) {
    return (width - pipContentGap * 2) / aspectRatio + pipContentGap * 2;
}

export function tracePipRoundedRect(context, left, top, width, height) {
    const right = left + width;
    const bottom = top + height;
    const radius = Math.min(pipCornerRadius, width / 2, height / 2);

    context.beginPath();
    context.moveTo(left + radius, top);
    context.arcTo(right, top, right, bottom, radius);
    context.arcTo(right, bottom, left, bottom, radius);
    context.arcTo(left, bottom, left, top, radius);
    context.arcTo(left, top, right, top, radius);
    context.closePath();
}

export function drawPipBoard(context, bitmap, overlays, top, width, aspectRatio) {
    const imageWidth = width - pipContentGap * 2;
    const imageHeight = imageWidth / aspectRatio;
    const imageRect = [pipContentGap, top + pipContentGap, imageWidth, imageHeight];

    context.save();
    tracePipRoundedRect(context, ...imageRect);

    // Clip the board and its overlays together so their edges always line up.
    context.save();
    context.clip();
    context.drawImage(bitmap, ...imageRect);
    for(const overlay of overlays) {
        if(overlay) context.drawImage(overlay, ...imageRect);
    }
    context.restore();

    context.strokeStyle = pipBoardBorder;
    context.lineWidth = 1;
    context.stroke();
    context.restore();

    return getPipBoardHeight(width, aspectRatio);
}

function formatPipEvaluationScore(context, score, width) {
    const isMate = score.startsWith('M');
    const value = Number(isMate ? score.slice(1) : score);
    if(!Number.isFinite(value)) return '';

    const prefix = isMate ? 'M' : '';
    const candidates = [score, `${prefix}${Math.round(value)}`];

    // Reduce precision/length, never font size. A cap still describes the score
    // truthfully when an unusually narrow shared column cannot show every digit.
    for(const cap of [99, 9]) {
        if(value > cap) {
            candidates.push(`${prefix}${cap}+`);
            if(!isMate) candidates.push(`>${cap}`);
        }
    }
    candidates.push(isMate ? 'M' : value > 9 ? '>' : String(Math.round(value)));

    return candidates.find(text => context.measureText(text).width <= width) || '';
}

export function drawPipEvaluation(context, evaluation, left, top, width, height) {
    if(!evaluation || width <= 0 || height <= 0) return;

    context.save();
    context.fillStyle = pipContentBackground;
    context.fillRect(left, top, width, height);

    // The preceding board/bar supplies the left gap; each bar owns its right gap.
    const rightGap = Math.min(pipContentGap, width / 2);
    width -= rightGap;

    const reversed = evaluation.orientation === 'b';
    const boundary = reversed ? evaluation.value : 1 - evaluation.value;
    const topColor = reversed ? '#c8c8c8' : '#323232';
    const bottomColor = reversed ? '#323232' : '#c8c8c8';
    let bands = [[0, boundary, topColor], [boundary, 1, bottomColor]];

    if(evaluation.change) {
        const previousBoundary = reversed ? evaluation.change.from : 1 - evaluation.change.from;
        const start = Math.min(previousBoundary, boundary);
        const end = Math.max(previousBoundary, boundary);
        if(end > start) {
            bands = [
                [0, start, topColor],
                [start, end, evaluation.change.improved ? '#9bdcaf' : '#f09191'],
                [end, 1, bottomColor]
            ];
        }
    }

    // Paint every band in one pass so a light underlayer cannot show through
    // the antialiased corners of a darker band or its change highlight.
    const gradient = context.createLinearGradient(left, top, left, top + height);
    for(const [start, end, color] of bands) {
        if(end <= start) continue;
        gradient.addColorStop(start, color);
        gradient.addColorStop(end, color);
    }
    context.fillStyle = gradient;
    tracePipRoundedRect(context, left, top, width, height);
    context.fill();
    context.clip();

    if(evaluation.score) {
        context.fillStyle = '#7d7d7d';
        context.font = `700 ${pipFontSizes.esmall}px ${pipTextFontFamily}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const score = formatPipEvaluationScore(context, evaluation.score, Math.max(0, width - 4));
        const scoreAtTop = reversed ? evaluation.value > 0.5 : evaluation.value < 0.5;
        const scoreInset = Math.min(20, height / 2);
        context.fillText(score, left + width / 2,
            scoreAtTop ? top + scoreInset : top + height - scoreInset);
    }

    context.restore();
}

// Each profile owns its rendering state, captures and animation timers.
export function createPipRenderer(instance, pipProfile, initialSettings, onFrame) {
let settings = initialSettings;
// Live profiles use the compositor's single title and their own status row.
const headerHeight = instance ? 0 : pipHeaderHeight;
const pipData = {};
const pipHintInstance = instance;
let pipLayoutHeight = 200;
let pipBoardAspectRatio = 1;
let pipIdleLayoutHeight = instance ? null : 200;

let pipCanvas = null;
let pipReady = false;
let pipRenderPromise = null;
let pipNeedsRefresh = false;
let destroyed = false;
let pipLastPipBoardBitmaps = [null, null];
let pipBoardPosition = null;
let pipStatusText = '';
let pipStatusParts = [];
let pipBoardAnimation = null;
let pipBoardCapture = null;

let pipContextQueue = [];
let pipProcessingBestMove = false;
let pipRefreshTimeout = null;
let pipRefreshRevision = 0;
let pipBoardCaptureRevision = 0;
let pipEvaluationState = null;
let pipEvaluationChangeTimeout = null;

function getPipResolutionScale() {
    const quality = Number(settings.pipQuality ?? 70);
    // 50% corresponds to the original 400px-wide backing canvas.
    return (Number.isFinite(quality) ? Math.max(1, Math.min(100, quality)) : 70) / 50;
}

function getPipOpeningHeight() {
    // Reserve the row even without an opening so learning-mode PiP stays steady.
    return pipData.learningMode ? pipOpeningHeight + pipOpeningBottomPadding : 0;
}

function getPipContentHeight() {
    if(pipIdleLayoutHeight !== null) return pipIdleLayoutHeight;
    if(pipData.learningMode && !isPipBoardVisible()) return headerHeight;

    const contentHeight = isPipBoardVisible()
        ? getPipBoardHeight(getPipTextWidth(), pipBoardAspectRatio)
        // Terminal messages keep their extra room for the face and caption.
        : pipData.terminalOutcome ? 200 - pipHeaderHeight : pipTextContentHeight;

    return headerHeight + contentHeight;
}

function isPipBoardVisible() {
    return Boolean(instance && settings.pipBoard);
}

function hasCurrentPipBoard() {
    const variables = pipHintInstance?.pV[pipProfile];
    const fen = variables?.learningMode ? pipHintInstance.displayFen : pipHintInstance?.currentFen;
    const orientation = pipHintInstance?.chessground?.state?.orientation;

    return Boolean(variables && fen && pipLastPipBoardBitmaps[0]
        && pipBoardPosition?.fen === fen && pipBoardPosition.orientation === orientation);
}

function getPipTextWidth() {
    return !instance || settings.pipEval === false ? pipLayoutWidth : pipLayoutWidth - pipEvalBarWidth;
}

function getPipTotalsHeight() {
    const count = pipData.feedbackCounts?.length || 0;
    return count ? count * pipFeedbackTotalsLineHeight + 2 * pipFeedbackTotalsPadding : 0;
}

function resizePipCanvas() {
    if(!pipCanvas) return;

    const height = getPipContentHeight()
        + getPipOpeningHeight()
        + (pipData.learningMode || pipData.feedbackInPip ? pipFeedbackHeight + getPipTotalsHeight() : 0);
    const scale = getPipResolutionScale();
    const pixelWidth = Math.max(1, Math.round(pipLayoutWidth * scale));
    const pixelHeight = Math.max(1, Math.round(height * scale));

    if(pipCanvas.width === pixelWidth && pipCanvas.height === pixelHeight && pipLayoutHeight === height) return;

    pipLayoutHeight = height;
    pipReady = false;
    pipCanvas.width = pixelWidth;
    pipCanvas.height = pixelHeight;

    // Never replay drawing commands made for the previous dimensions. The
    // compositor updates the shared stream after this profile has been drawn.
    pipContextQueue = [];
    pipProcessingBestMove = false;
    pipBoardCaptureRevision++;
    clearPipBoardAnimation();
}

function updatePipData(data) {
    if(destroyed || !data) return;
    const changedKeys = Object.keys(data).filter(key => {
        if(['feedbackCounts', 'feedbackPositions'].includes(key)) {
            return JSON.stringify(data[key]) !== JSON.stringify(pipData[key]);
        }
        return !Object.is(data[key], pipData[key]);
    });
    if(!changedKeys.length) return;

    // Position/orientation changes invalidate captures, but progress updates do
    // not: a busy engine must not keep cancelling the first visible board frame.
    if(changedKeys.some(key => ['moveObjects', 'boardOrientation', 'learningMode'].includes(key))) {
        pipRefreshRevision++;
    }
    if(changedKeys.some(key => ['learningMode', 'learningPvAnimation', 'feedbackPositions'].includes(key))) {
        clearPipBoardAnimation();
        pipBoardCaptureRevision++;
    }

    Object.assign(pipData, data);
    scheduleRefresh();
}

function scheduleRefresh() {
    pipNeedsRefresh = true;
    if(destroyed || pipRefreshTimeout !== null || pipRenderPromise) return;
    pipRefreshTimeout = setTimeout(() => {
        pipRefreshTimeout = null;
        refresh().catch(console.error);
    }, 25);
}

function resetPipHints(instance) {
    if(instance.pV[pipProfile]) delete instance.pV[pipProfile].pipHints;
    clearPipBoardAnimation();
    pipBoardCaptureRevision++;
    updatePipData({ moveObjects: null, hintsFiltered: false, terminalOutcome: null });
    updatePipFeedback(instance);
    scheduleRefresh();
}

function updatePipOpening(instance) {
    if(pipHintInstance && pipHintInstance !== instance) return;
    const openingText = instance.instanceClosed ? ''
        : instance.instanceElem?.querySelector('.instance-opening-container span')?.textContent?.trim() || '';
    updatePipData({ openingText: openingText.replace(/\s*\([A-E]\d{2}\)\s*$/i, '').trim() });
}

function updatePipEvaluation(instance) {
    // Evaluation belongs to this profile, not whichever engine owns the GUI bar.
    if(pipHintInstance !== instance) return;
    const evaluation = !instance.instanceClosed ? instance.pV[pipProfile]?.pipEvaluationData : null;
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
                    refresh().catch(console.error);
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

function updatePipFeedback(instance) {
    if(instance.instanceClosed || (pipHintInstance && pipHintInstance !== instance)) return;
    updatePipOpening(instance);
    updatePipEvaluation(instance);

    const rows = Array.from(instance.instanceElem?.querySelector('.instance-feedback-container')?.children || []);
    const visibleRows = rows.filter(row => {
        if(row.dataset.profileId !== pipProfile) return false;
        const variables = instance.pV[row.dataset.profileId];
        return variables && (variables.learningMode || variables.feedbackInPip
            && (variables.enableMoveRatings || variables.enableEnemyFeedback));
    });

    const feedbackText = visibleRows.map(row => row.dataset.feedbackText ?? row.textContent).join('\n');
    const profile = pipProfile;
    const variables = instance.pV[profile];
    const feedbackCounts = variables?.learningMode || variables?.feedbackMoveCounts
        ? feedbackCountLines(instance, profile).filter((_, index) => variables.learningMode
            || (index === 0 ? variables.enableEnemyFeedback : variables.enableMoveRatings))
        : [];

    const stopOnEnemyMove = variables?.learningPvAnimationStopOnEnemyMove !== false;
    const feedback = variables?.learningMode && variables.lastFeedbackFen === instance.learningReviewPostFen
        && variables.lastFeedbackResult?.bestLine
        && variables.lastFeedbackResult.bestMove !== variables.lastFeedbackResult.move
        ? variables.lastFeedbackResult : null;

    updatePipData({ learningMode: Boolean(variables?.learningMode),
        learningPvAnimation: Boolean(variables?.learningMode && variables.learningPvAnimation),
        learningPvAnimationStopOnEnemyMove: stopOnEnemyMove,
        feedbackInPip: Boolean(!instance.instanceClosed && variables?.feedbackInPip
            && (variables.enableMoveRatings || variables.enableEnemyFeedback)),
        feedbackText: instance.instanceClosed ? '' : feedbackText,
        feedbackWaitingForMove: visibleRows.some(row => row.dataset.waitingForMove === 'true'),
        feedbackCounts,
        // Apply the stop setting to refreshes too, so later updates cannot
        // restart an animation that should stay stopped after the reply.
        feedbackPositions: !instance.instanceClosed && (!stopOnEnemyMove || instance.currentFen === instance.learningReviewPostFen)
            ? feedback?.bestPositions || [] : [] });
}

function updatePipHints(instance) {
    if(instance.instanceClosed) return;
    const variables = instance.pV[pipProfile];
    const fen = variables?.learningMode ? instance.displayFen : instance.currentFen;
    const hints = variables?.pipHints?.fen === fen ? variables.pipHints : null;

    updatePipData({
        moveObjects: hints?.moveObjects ?? null,
        terminalOutcome: hints?.terminalOutcome || null,
        terminalMessageIndex: hints?.terminalMessageIndex || 0,
        hintsFiltered: Boolean(hints?.hintsFiltered)
    });

    updatePipFeedback(instance);
}

function clearPipBoardAnimation() {
    clearTimeout(pipBoardAnimation?.timer);
    pipBoardAnimation = null;
}

function canAnimatePipBoard() {
    return pipData.learningMode && isPipBoardVisible() && pipData.learningPvAnimation && !CONCEAL_ASSISTANCE_ACTIVE
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
    const variables = pipHintInstance?.pV[pipProfile];
    const fen = variables?.learningMode ? pipHintInstance.displayFen : pipHintInstance?.currentFen;
    if(!variables || !fen) return;
    const cgElem = pipHintInstance?.instanceElem?.querySelector('.chessground-x');

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

    pipBoardAspectRatio = boardAspectRatio;
    resizePipCanvas();

    const captureSize = Math.max(1, Math.round(getPipTextWidth() * pipCanvas.width / pipLayoutWidth));
    const positions = canAnimatePipBoard() ? pipData.feedbackPositions || [] : [];
    const state = pipHintInstance?.chessground?.state;
    const boardElem = cgElem.querySelector('cg-board');
    if(!boardElem || !state) return;
    const boardStyle = getComputedStyle(boardElem);
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
        fen: instance.pV[pipProfile]?.learningMode ? instance.displayFen : instance.currentFen,
        lastMove: state.lastMove ? [...state.lastMove] : undefined
    } : null;
    const positionKey = JSON.stringify(positions);
    const profileVariables = instance?.pV[pipProfile];
    const fen = profileVariables?.learningMode ? instance.displayFen : instance?.currentFen;
    const orientation = state.orientation;
    const isCurrent = () => !destroyed && !instance?.instanceClosed
        && instance?.pV[pipProfile] === profileVariables
        && instance?.chessground?.state?.orientation === orientation
        && (profileVariables?.learningMode ? instance.displayFen : instance?.currentFen) === fen
        && captureRevision === pipBoardCaptureRevision
        && (!animationKey || canAnimatePipBoard() && pipHintInstance === instance
            && instance.learningReviewPostFen === reviewFen
            && JSON.stringify(pipData.feedbackPositions || []) === positionKey);
    const { boardCanvas, overlayCanvas } = await captureBoardLayers(instanceId, captureSize, null, pipProfile);

    if(!boardCanvas) return;

    const boardFrames = fen && state && instance.chessground.getFen().split(' ')[0] !== fen.split(' ')[0]
        ? await capturePipAnimation(cgElem, [], { fen }, captureSize, state, isCurrent) : [];
    const bitmap = await createImageBitmap(boardFrames[0]?.[0] || boardCanvas);

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
    pipBoardPosition = { fen, orientation };

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
                await refresh();
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

function drawPipText(ctx, text, x, y, width, height, font, align = 'left', strokeWidth = 0) {
    if(!text || width <= 0 || height <= 0) return;

    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.direction = 'ltr';

    const metrics = ctx.measureText(text);
    const lineMetrics = ctx.measureText('Mg');
    // Include translated/fallback glyphs, whose bounds can exceed Latin metrics.
    const ascent = Math.max(lineMetrics.actualBoundingBoxAscent, metrics.actualBoundingBoxAscent);
    const descent = Math.max(lineMetrics.actualBoundingBoxDescent, metrics.actualBoundingBoxDescent);
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

    if(strokeWidth > 0) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = strokeWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(text, 0, 0);
    }

    ctx.fillText(text, 0, 0);
    ctx.restore();
}

function getPipEvaluation() {
    if(!instance || settings.pipEval === false) return null;

    const value = Number.isFinite(pipData.eval) ? Math.max(0, Math.min(1, pipData.eval)) : 0.5;
    const change = !CONCEAL_ASSISTANCE_ACTIVE && pipEvaluationState?.expiresAt > Date.now()
        ? {
            from: pipEvaluationState.from,
            improved: (value - pipEvaluationState.from)
                * (pipEvaluationState.evaluation.playerColor === 'b' ? -1 : 1) > 0
        } : null;

    return {
        value,
        // The score's position identifies the winning side, not a minus sign.
        score: pipData.mate != null ? `M${Math.abs(pipData.mate)}`
            : Number.isFinite(pipData.centipawnEval) ? (Math.abs(pipData.centipawnEval) / 100).toFixed(1) : '',
        orientation: pipData.boardOrientation || pipData.playerColor || 'w',
        change
    };
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
            } else if(cmd === 'board') {
                drawPipBoard(ctx, ...args);
            } else if(cmd in ctx) {
                if(Array.isArray(args)) ctx[cmd](...args);
                else ctx[cmd] = args;
            }
        }

        pipReady = true;
        onFrame();
    }
}

async function refreshPipView() {
    const revision = ++pipRefreshRevision;
    const moveObjects = pipData.moveObjects;
    const ctxQueue = [];

    const bestMove = pipData?.moveObjects?.[0],
          sMove = pipData?.moveObjects?.[1],
          tMove = pipData?.moveObjects?.[2],
          from = bestMove?.player?.[0],
          to = bestMove?.player?.[1],
          sFrom = sMove?.player?.[0],
          sTo = sMove?.player?.[1],
          tFrom = tMove?.player?.[0],
          tTo = tMove?.player?.[1];

    const useSan = settings.pipSan !== false;

    const isCurrentNotation = () =>
        !destroyed && revision === pipRefreshRevision && pipData.moveObjects === moveObjects
        && (settings.pipSan !== false) === useSan
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
        || (settings.pipSan !== false) !== useSan
    ) return;

    const centipawnEval = pipData?.centipawnEval / 100;

    const filteredText = TRANS_OBJ?.moveSpeech?.hintsFiltered ?? 'Suggestions filtered';
    const hintsFiltered = !moveObjects?.length && pipData.hintsFiltered && !CONCEAL_ASSISTANCE_ACTIVE;
    const mediaTitle = pipData.learningMode ? 'A.C.A.S' : from && !CONCEAL_ASSISTANCE_ACTIVE
        ? bestMoveText
        : hintsFiltered ? filteredText : `Hold on, I'm thinking...`;

    const mediaEvaluation = settings.pipEval === false ? ''
        : ` | Eval ${Number.isFinite(centipawnEval) ? centipawnEval.toFixed(2) : '0.00'}`;
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
        artist: `Depth ${pipData?.depth ?? 0} (${Math.round((progress ?? 0) * 100)}%)${mediaEvaluation}`
    });

    if(!pipCanvas) return; // do not continue if pip is not enabled

    resizePipCanvas();

    const isBoard = isPipBoardVisible();

    if(isBoard && pipIdleLayoutHeight === null) {
        await renderPipBoards();
        // Never publish an incomplete shared frame or retry it through onFrame.
        // The next position/profile update will retry a missing or stale capture.
        if(settings.pipSharedBoard && !hasCurrentPipBoard()) return;
    } else {
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

    const headerWidth = getPipTextWidth();
    const pipMaxTextWidth = headerWidth - pipTextPadding * 2;
    const alternativeWidth = (pipMaxTextWidth - pipTextColumnGap) / 2;
    const thirdMoveX = pipTextPadding + alternativeWidth + pipTextColumnGap;
    const openingHeight = getPipOpeningHeight();
    const contentHeight = getPipContentHeight();
    const waitingForFeedback = pipData.learningMode && pipData.feedbackWaitingForMove;
    const secondaryMoveY = contentHeight - 40;
    const showTerminalMessage = !pipData.learningMode && !isBoard && Boolean(pipData.terminalOutcome) && !CONCEAL_ASSISTANCE_ACTIVE;

    const noInstancesText =
        FULL_TRANS_OBJ?.domTranslations?.['#no-instances-title'] || 'Waiting for instances...';

    // Clear canvas
    ctxQueue.push([
        'clearRect',
        [0, 0, pipLayoutWidth, pipLayoutHeight]
    ]);

    // Boards stay transparent over the compositor's background.
    if(!instance) {
        ctxQueue.push(['fillStyle', pipContentBackground]);
        ctxQueue.push(['fillRect', [0, 0, headerWidth, pipLayoutHeight]]);
    }

    // Paint text-card progress behind the moves, never darker than its header.
    if(instance && !pipData.learningMode && !isBoard) {
        const bodyRect = [0, headerHeight, headerWidth, contentHeight - headerHeight];
        ctxQueue.push(['fillStyle', pipContentBackground]);
        ctxQueue.push(['fillRect', bodyRect]);
        ctxQueue.push(['fillStyle', pipProfileHeaderBackground]);
        ctxQueue.push(['fillRect', [0, headerHeight, headerWidth * progress, bodyRect[3]]]);
    }

    if(headerHeight) {
        ctxQueue.push(['fillStyle', pipHeaderBackground]);
        ctxQueue.push(['fillRect', [0, 0, headerWidth, headerHeight]]);
        ctxQueue.push(['fillStyle', 'white']);
        ctxQueue.push(['text', ['A.C.A.S', 10, 3, 108, headerHeight,
            `900 ${pipFontSizes.medium}px "Mona Sans", sans-serif`, 'left', 0.5]]);
    }

    // Profile progress belongs beside its name, leaving the board unobstructed.
    if(
        pipData.idle && !pipData.learningMode && noInstancesText
        && !pipData?.moveObjects
        && !pipData.terminalOutcome
    ) {
        const idleFont = `900 ${pipFontSizes.medium}px ${GET_NO_INSTANCES_FONT_FAMILY(noInstancesText)}`;
        const emoticonFont = `900 ${pipFontSizes.medium}px "Mona Sans", "IBM Plex Sans", Inter, sans-serif`;
        const idleHeight = Math.max(0, Math.min(68, contentHeight - headerHeight - pipTextPadding * 2));
        const idleGap = Math.min(4, idleHeight);
        const messageHeight = (idleHeight - idleGap) * 3 / 8;
        const idleTop = headerHeight + (contentHeight - headerHeight - idleHeight) / 2;
        ctxQueue.push(['text', [noInstancesText, pipTextPadding, idleTop,
            pipMaxTextWidth, messageHeight, idleFont, 'center']]);
        ctxQueue.push(['text', ['ദ്ദി(˵ •̀ ᴗ - ˵ ) ✧', pipTextPadding, idleTop + messageHeight + idleGap,
            pipMaxTextWidth, idleHeight - messageHeight - idleGap, emoticonFont, 'center']]);
    }

    pipStatusText = '';
    pipStatusParts = [];
    if(!showTerminalMessage && !CONCEAL_ASSISTANCE_ACTIVE) {
        if(hintsFiltered) {
            pipStatusText = filteredText;
        } else if(pipIdleLayoutHeight === null && (pipData.depth != null || pipData.calculationTimeElapsed != null)) {
            // Text and board modes share one status, with depth shown only once.
            const depthLabel = TRANS_OBJ?.calculationDepth ?? 'Depth';
            pipStatusParts.push(`${depthLabel} ${pipData.depth ?? 0}`);
            const timeMs = pipData.calculationTimeElapsed;

            if(timeMs != null) {
                pipStatusParts.push(timeMs >= 1000 ? `${(timeMs / 1000).toFixed(1)}s` : `${Math.round(timeMs)}ms`);
            }

            pipStatusParts.push(`${(progress * 100).toFixed(0)}%`);
            pipStatusText = pipStatusParts.join('  ');
        }
    }

    ctxQueue.push(['fillStyle', 'white']);

    // Board rendering
    if(isBoard && pipIdleLayoutHeight === null) {
        const [bitmap, bitmap2] = pipBoardAnimation?.frames[pipBoardAnimation.index] || pipLastPipBoardBitmaps;

        if(bitmap) {
            ctxQueue.push(['board', [bitmap, [bitmap2], headerHeight, headerWidth, pipBoardAspectRatio]]);
        }
    // Text-based rendering
    } else if(!pipData.learningMode) {
        const mainMoveFont = `900 ${pipFontSizes.large}px "Mona Sans", sans-serif`;
        const mainMoveTop = headerHeight + (showTerminalMessage ? 20 : 16);

        if(showTerminalMessage) {
            const messages = TRANS_OBJ?.moveFeedback?.[`${pipData.terminalOutcome}Messages`];
            const message = messages?.[pipData.terminalMessageIndex % messages.length]
                || (pipData.terminalOutcome === 'winning' ? 'That was too easy'
                    : pipData.terminalOutcome === 'losing' ? 'Are we cooked?'
                        : TRANS_OBJ?.moveFeedback?.drawMessage || 'All even, good game');
            const messageFontSize = pipFontSizes.medium;
            const messageHeight = 32;
            const messageTop = contentHeight - pipTerminalMessageBottomPadding - messageHeight;
            const faceHeight = Math.min(60, messageTop - mainMoveTop - 6);
            const faceFont = `900 40px "Mona Sans", sans-serif`;

            ctxQueue.push(['text', ['≽(•⩊ •マ≼', pipTextPadding, mainMoveTop,
                pipMaxTextWidth, faceHeight, faceFont, 'center', 2]]);
            ctxQueue.push(['text', [message, pipTextPadding, messageTop,
                pipMaxTextWidth, messageHeight, `700 ${messageFontSize}px "IBM Plex Sans", sans-serif`, 'center']]);
        } else if(bestMove && !CONCEAL_ASSISTANCE_ACTIVE) {
            ctxQueue.push(['text', [bestMoveText, pipTextPadding, mainMoveTop,
                pipMaxTextWidth, 60, mainMoveFont]]);
        }

        ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.5)']);
        const secondaryMoveFont = `700 ${pipFontSizes.medium}px ${pipTextFontFamily}`;

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
        ctxQueue.push(['fillStyle', pipContentBackground]);
        ctxQueue.push(['fillRect', [0, contentHeight, headerWidth, openingHeight]]);

        if(!waitingForFeedback) {
            ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.72)']);
            ctxQueue.push(['text', [pipData.openingText, pipTextPadding, contentHeight,
                pipMaxTextWidth, openingHeight - pipOpeningBottomPadding,
                `700 ${pipFontSizes.small}px ${pipTextFontFamily}`, 'center']]);
        }
    }

    if((pipData.learningMode || pipData.feedbackInPip)) {
        const totalsTop = contentHeight + openingHeight;
        const totalsHeight = getPipTotalsHeight();
        const top = totalsTop + totalsHeight;
        const lines = String(pipData.feedbackText || '')
            .split('\n')
            .filter(Boolean)
            .slice(0, 2);

        ctxQueue.push(['fillStyle', pipContentBackground]);
        ctxQueue.push(['fillRect', [0, totalsTop, headerWidth, totalsHeight + pipFeedbackHeight]]);

        if(!pipData.learningMode) {
            ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.16)']);
            ctxQueue.push(['fillRect', [0, totalsTop, headerWidth, 1]]);
        }

        if(totalsHeight && !waitingForFeedback) {
            ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.08)']);
            if(openingHeight) {
                ctxQueue.push(['fillRect', [pipTextPadding, totalsTop, pipMaxTextWidth, 1]]);
            }
            ctxQueue.push(['fillRect', [pipTextPadding, top, pipMaxTextWidth, 1]]);
        }

        ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.72)']);

        const lineHeight = 26;
        const textTop = top + (pipFeedbackHeight - 2 * lineHeight) / 2;

        // Keep the reserved layout, but center the initial prompt across all
        // footer rows instead of leaving blank opening/counts sections above it.
        if(waitingForFeedback && !CONCEAL_ASSISTANCE_ACTIVE) {
            ctxQueue.push(['text', [pipData.feedbackText, pipTextPadding, contentHeight,
                pipMaxTextWidth, openingHeight + totalsHeight + pipFeedbackHeight,
                `600 ${pipFontSizes.feedback}px ${pipTextFontFamily}`, 'center']]);
        }

        if(!waitingForFeedback && !CONCEAL_ASSISTANCE_ACTIVE) {
            const scoreWidth = 88;
            const moveWidth = pipMaxTextWidth - scoreWidth - pipTextColumnGap;
            const font = `600 ${pipFontSizes.feedback}px ${pipTextFontFamily}`;

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

        if(totalsHeight && !waitingForFeedback) {
            const countsTop = totalsTop
                + (totalsHeight - pipData.feedbackCounts.length * pipFeedbackTotalsLineHeight) / 2;
            ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.85)']);

            if(!CONCEAL_ASSISTANCE_ACTIVE) {
                pipData.feedbackCounts.forEach((line, index) => ctxQueue.push(['text', [
                    line,
                    pipTextPadding,
                    countsTop + index * pipFeedbackTotalsLineHeight,
                    pipMaxTextWidth,
                    pipFeedbackTotalsLineHeight,
                    `900 ${pipFontSizes.feedback}px "Mona Sans", sans-serif`,
                    'center'
                ]]));
            }
        }
    }

    pipContextQueue.unshift(ctxQueue);

    // The queue was only emptied once a bestmove arrived. During a long search
    // updatePipData fires on every info line, so it grew for the whole session.
    if(pipContextQueue.length > PIP_CONTEXT_QUEUE_LIMIT) {
        pipContextQueue.length = PIP_CONTEXT_QUEUE_LIMIT;
    }

    updatePipContext();
}

function initialize() {
    if(pipCanvas) return;
    pipCanvas = document.createElement('canvas');
    resizePipCanvas();
}

async function refresh() {
    if(destroyed) return;
    // New input is picked up after the current capture completes.
    if(pipRenderPromise) return pipRenderPromise;
    clearTimeout(pipRefreshTimeout);
    pipRefreshTimeout = null;
    pipNeedsRefresh = false;
    initialize();

    const promise = pipRenderPromise = refreshPipView();
    try {
        await promise;
    } finally {
        if(pipRenderPromise === promise) pipRenderPromise = null;
        if(pipNeedsRefresh && !destroyed) scheduleRefresh();
    }
}

return {
    get canvas() { return pipCanvas; },
    get ready() { return pipReady; },
    get height() { return pipLayoutHeight; },
    get statusText() { return pipStatusText; },
    get statusParts() { return [...pipStatusParts]; },
    get textMovePanel() { return Boolean(instance && !isPipBoardVisible() && !pipData.learningMode); },
    get waitingForBoard() {
        return Boolean(instance && settings.pipBoard && settings.pipSharedBoard
            && (!pipReady || !hasCurrentPipBoard()));
    },
    get evaluation() { return getPipEvaluation(); },
    get board() {
        if(!instance || !settings.pipBoard || !pipReady || !pipBoardPosition?.fen || !pipLastPipBoardBitmaps[0]) return null;
        return {
            ...pipBoardPosition,
            bitmap: pipLastPipBoardBitmaps[0],
            overlay: pipLastPipBoardBitmaps[1],
            height: getPipBoardHeight(getPipTextWidth(), pipBoardAspectRatio),
            aspectRatio: pipBoardAspectRatio,
            animated: Boolean(pipBoardAnimation)
        };
    },
    update: updatePipData,
    updateHints: updatePipHints,
    updateFeedback: updatePipFeedback,
    updateOpening: updatePipOpening,
    updateEvaluation: updatePipEvaluation,
    resetHints: resetPipHints,

    setIdleHeight(height) {
        if(instance || !Number.isFinite(height) || height <= 0 || height === pipIdleLayoutHeight) return;
        pipIdleLayoutHeight = height;
        pipRefreshRevision++;
        scheduleRefresh();
    },

    setSettings(value) {
        const changed = ['pipBoard', 'pipEval', 'pipSan', 'pipQuality'].some(key => settings[key] !== value[key]);
        settings = value;
        if(instance) updatePipHints(instance);
        const needsFirstBoard = settings.pipBoard && !pipLastPipBoardBitmaps[0] && instance?.pV[pipProfile];
        if(changed || needsFirstBoard) {
            pipRefreshRevision++;
            pipBoardCaptureRevision++;
            clearPipBoardAnimation();
            scheduleRefresh();
        }
    },

    refresh,

    destroy() {
        destroyed = true;
        pipRefreshRevision++;
        pipBoardCaptureRevision++;
        clearTimeout(pipRefreshTimeout);
        clearTimeout(pipEvaluationChangeTimeout);
        clearPipBoardAnimation();
        pipLastPipBoardBitmaps.forEach(bitmap => bitmap?.close?.());
        pipContextQueue = [];
        pipReady = false;
        pipCanvas = null;
    }
};
}