import { floatingPanelVideoElem, floatingFloaty, pipBoardInput, pipSanInput } from './elementDeclarations.js';
import { setMediaMetadata } from './media.js';
import { formatMoveNotationAsync } from '../misc/moveNotation.js';

export const pipData = {};
const pipFontSizes = { large: 64, mlarge: 35, medium: 26, small: 18, esmall: 18 };
const pipHeaderHeight = 44;
const pipEvalBarWidth = 41;
const pipStatusBarHeight = 2;
const pipBoardSize = 360;
const pipBoardConfig = [0, pipHeaderHeight, pipBoardSize];

let pipCanvas = null;
let pipVideo = null;
let pipLastPipEval = null;
let pipLastPipFromTo = [null, null];
let pipLastPipBoardBitmaps = [null, null];
const PIP_CONTEXT_QUEUE_LIMIT = 30;

let pipContextQueue = [];
let pipProcessingBestMove = false;
let pipRefreshTimeout = null;
let lastProcessedDepth = null;
let pipRefreshRevision = 0;

function resizePipCanvas() {
    if(!pipCanvas) return;
    const isBoard = pipBoardInput.checked;
    const width = !isBoard && pipSanInput?.checked ? 280 : 400;
    const height = isBoard ? 400 : 200;
    if(pipCanvas.width === width && pipCanvas.height === height) return;

    pipCanvas.width = width;
    pipCanvas.height = height;
    if(pipVideo) {
        pipVideo.width = width / 2;
        pipVideo.height = height / 2;
    }
    // The existing canvas stream follows its new aspect ratio without reopening
    // PIP. Never replay drawing commands made for the previous dimensions.
    pipContextQueue = [];
    pipProcessingBestMove = false;
}

export function updatePipData(data) {
    if(data) Object.assign(pipData, data);

    if(data?.moveObjects || data?.depth !== lastProcessedDepth) {
        clearTimeout(pipRefreshTimeout);

        lastProcessedDepth = data.depth;

        pipRefreshTimeout = setTimeout(() => {
            refreshPipView(true);
        }, 25);
    }
}

window.REFRESH_PIP_DISPLAY = () => {
    clearTimeout(pipRefreshTimeout);
    refreshPipView(true);
};

async function renderPipBoards(from, to) {
    const isNewSuggestion = pipLastPipFromTo[0] !== from || pipLastPipFromTo[1] !== to;

    if(isNewSuggestion) {
        const cgElem = document.querySelector(`.chessground-x[data-is-latest-updated="true"]`);

        if(!cgElem) return;

        const instanceId = cgElem.parentElement.parentElement?.dataset?.instanceId;
        const { boardCanvas, overlayCanvas } = await captureBoardLayers(instanceId);
        const bitmap = await createImageBitmap(boardCanvas);
        const emptyOverlayCanvas = document.createElement('canvas');
        emptyOverlayCanvas.width = boardCanvas.width;
        emptyOverlayCanvas.height = boardCanvas.height;
        const bitmap2 = await createImageBitmap(overlayCanvas || emptyOverlayCanvas);

        pipLastPipBoardBitmaps = [bitmap, bitmap2];
    }
}

async function captureBoardLayers(instanceId) {
    const boards = [...document.querySelectorAll('.chessground-x[data-is-latest-updated="true"]')];
    const cgElem = instanceId
        ? boards.find(elem => elem.parentElement?.parentElement?.dataset?.instanceId === String(instanceId)) || boards[0]
        : boards[0];

    if(!cgElem) return { boardCanvas: null, overlayCanvas: null };

    const rect = cgElem.getBoundingClientRect();

    cgElem.style.height = `${rect.width}px`;

    const acasInstance = window.AcasInstances?.find(
        i => String(i.id) === String(instanceId)
    );

    if(acasInstance?.instance?.chessground) {
        acasInstance.instance.chessground.redrawAll();
    }

    let boardCanvas = await snapdom.toCanvas(cgElem, { fast: true });

    const boardDrawerSvg = document.querySelector(
        `#board-drawings svg${instanceId ? `[data-instance-id="${instanceId}"]` : ''}`
    );

    if(!boardDrawerSvg) return { boardCanvas, overlayCanvas: null };

    const svg = boardDrawerSvg.cloneNode(true);
    svg.style.position = 'unset';

    const container = document.createElement('div');

    container.appendChild(svg);

    container.style.cssText = `
        position:absolute;
        left:-9999px;
        top:0;
        width:${rect.width}px;
        height:${rect.width}px;
    `;

    document.body.appendChild(container);

    try {
        const overlayCanvas = await snapdom.toCanvas(container, { fast: true });
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

function updatePipContext() {
    const ctx = pipCanvas.getContext('2d');
    const latestQueueArr = pipProcessingBestMove
        ? pipContextQueue.find(x => x?.[0]?.[1] === pipProcessingBestMove)
        : pipContextQueue?.[0];

    if(latestQueueArr) {
        if(pipProcessingBestMove) {
            pipProcessingBestMove = false;
            pipContextQueue = [];
        }

        for(const [cmd, args] of latestQueueArr) {
            if(cmd in ctx) {
                if(Array.isArray(args))ctx[cmd](...args);
                else ctx[cmd] = args;
            }
        }
    }
}

async function refreshPipView() {
    const revision = ++pipRefreshRevision;
    const moveObjects = pipData.moveObjects;
    const ctxQueue = [];
    const playerColor = pipData.playerColor,
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
    const isCurrentNotation = () => pipData.moveObjects === moveObjects
        && Boolean(pipSanInput?.checked) === useSan && !CONCEAL_ASSISTANCE_ACTIVE;
    const [bestMoveText, secondMoveText, thirdMoveText] = await Promise.all(
        [bestMove, sMove, tMove].map(move => formatMoveNotationAsync(move, useSan, false, undefined, isCurrentNotation))
    );
    if(revision !== pipRefreshRevision || pipData.moveObjects !== moveObjects
        || Boolean(pipSanInput?.checked) !== useSan) return;
    const centipawnEval = pipData?.centipawnEval / 100;
    const mediaTitle = from && !CONCEAL_ASSISTANCE_ACTIVE
        ? bestMoveText
        : `Hold on, I'm thinking...`;

    let engineEvaluation = pipData?.eval;
    let progress = 0;

    if(engineEvaluation == null) {
        // Fall back to the last known eval (or an even 0.5 on the very first refresh).
        // Use == null so a legitimate 0 (a lost position) is treated as a real value.
        engineEvaluation = pipLastPipEval === null ? 0.5 : pipLastPipEval;
    } else {
        pipLastPipEval = engineEvaluation;
    }
    
    if((pipData.goalDepth && pipData.goalDepth < 100) || (pipData.depth === null)) {
        const depth = pipData.depth || pipData.goalDepth

        progress = depth / pipData.goalDepth;
    } else if(pipData?.goalNodes) {
        progress = pipData?.nodes / pipData?.goalNodes;
    } else {
        progress = CALC_TIME_PROGRESS(pipData.startTime, pipData.movetime);
    }

    setMediaMetadata({
        title: mediaTitle,
        artist: `Depth ${pipData?.depth ?? 0} (${Math.round((progress ?? 0) * 100)}%) | Eval ${
            Number.isFinite(centipawnEval) ? centipawnEval.toFixed(2) : "0.00"
        }`
    });

    if(!pipCanvas) return; // do not continue if pip is not enabled
    resizePipCanvas();

    if(bestMove) {
        ctxQueue.push(['bestmove', from+to]);
        pipProcessingBestMove = from+to;
    }

    const isBoard = pipBoardInput.checked;
    if(isBoard && bestMove) await renderPipBoards(from, to);
    if(revision !== pipRefreshRevision || pipData.moveObjects !== moveObjects) return;

    const headerWidth = pipCanvas.width - pipEvalBarWidth;
    const pipMaxTextWidth = headerWidth - 28;
    const alternativeWidth = (headerWidth - 48) / 2;
    const thirdMoveX = 32 + alternativeWidth;
    const noInstancesText = FULL_TRANS_OBJ?.domTranslations?.['#no-instances-title'];

    // Clear canvas
    ctxQueue.push(['clearRect', [0, 0, pipCanvas.width, pipCanvas.height]]);

    // Background
    ctxQueue.push(['fillStyle', pipData.themeColorHex]);
    ctxQueue.push(['fillRect', [0, 0, headerWidth, pipCanvas.height]]);

    // Header background
    ctxQueue.push(['fillStyle', 'rgba(0, 0, 0, 0.7)']);
    ctxQueue.push(['fillRect', [0, 0, headerWidth, pipHeaderHeight - pipStatusBarHeight]]);

    // Header title
    ctxQueue.push(['fillStyle', 'white']);
    ctxQueue.push(['font', `800 ${pipFontSizes.medium}px Mona Sans`]);
    ctxQueue.push(['fillText', ['A.C.A.S', 12, 32]]);

    // Subtext font
    ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.7)']);
    ctxQueue.push(['font',`500 ${pipFontSizes.medium}px IBM Plex Sans`]);

    if(pipData?.moveProgressText) {
        const headerOffset = 36;
        ctxQueue.push(['fillText',
            [pipData.moveProgressText, 12, pipHeaderHeight + headerOffset, pipMaxTextWidth]
        ]);
    } else if(noInstancesText && !pipData?.moveObjects && to !== 'one)') {
        ctxQueue.push(['font', `700 ${pipFontSizes.medium}px IBM Plex Sans`]);
        ctxQueue.push(['fillText', [noInstancesText, 12, pipHeaderHeight + 40, pipMaxTextWidth]]);
        ctxQueue.push(['fillText', ['ദ്ദി(˵ •̀ ᴗ - ˵ ) ✧', 12, pipHeaderHeight + 80, pipMaxTextWidth]]);
    }

    // Time + progress
    if(pipData.calculationTimeElapsed) {
        const timeMs = pipData.calculationTimeElapsed;
        const timeFormatted =
            timeMs > 9999 ? `${(timeMs / 1000).toFixed(1)}s` : `${timeMs}ms`;

        const progressPercent = (progress * 100).toFixed(0);

        ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.5)']);
        ctxQueue.push(['font', `500 ${pipFontSizes.small}px Mona Sans`]);
        ctxQueue.push(['fillText',
            [`(${timeFormatted}, ${progressPercent}%)`, 120, 28, headerWidth - 132]
        ]);
    }

    ctxQueue.push(['fillStyle', 'white']);
    ctxQueue.push(['font', `900 ${pipFontSizes.large}px Mona Sans`]);

    // Board rendering
    if(isBoard) {
        let [bitmap, bitmap2] = pipLastPipBoardBitmaps;

        if(bitmap) {
            ctxQueue.push(['drawImage', [bitmap, ...pipBoardConfig, pipBoardSize - 4]]);
            ctxQueue.push(['drawImage', [bitmap2, ...pipBoardConfig, pipBoardSize]]);
        }
    // Text based rendering
    } else {
        if(to === 'one)') {
            ctxQueue.push(['fillText', ['≽(•⩊ •マ≼', 16, pipHeaderHeight + 100, pipMaxTextWidth]]);
        } else if(bestMove && !CONCEAL_ASSISTANCE_ACTIVE) {
            ctxQueue.push(['fillText',
                [bestMoveText, 16, pipHeaderHeight + 100, pipMaxTextWidth]
            ]);
        }

        if(sFrom && sTo && !CONCEAL_ASSISTANCE_ACTIVE) {
            ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.5)']);
            ctxQueue.push(['font', `500 ${pipFontSizes.medium}px Mona Sans`]);
            ctxQueue.push(['fillText',
                [`2. (${secondMoveText})`, 16, pipHeaderHeight + 135, alternativeWidth]
            ]);
        }

        if(tFrom && tTo && !CONCEAL_ASSISTANCE_ACTIVE) {
            ctxQueue.push(['fillText',
                [`3. (${thirdMoveText})`, thirdMoveX, pipHeaderHeight + 135, alternativeWidth]
            ]);
        }
    }

    // Progress bar
    ctxQueue.push(['fillStyle', 'rgba(0, 0, 0, 0.1)']);
    ctxQueue.push(['fillRect',
        [0, pipHeaderHeight, (pipCanvas.width - pipEvalBarWidth) * progress, pipCanvas.height - pipHeaderHeight]
    ]);

    // Eval bar background + foreground
    if(playerColor === 'b') {
        ctxQueue.push(['fillStyle', 'rgba(50, 50, 50, 1)']);
        ctxQueue.push(['fillRect', [pipCanvas.width - pipEvalBarWidth, 0, pipEvalBarWidth, pipCanvas.height]]);

        ctxQueue.push(['fillStyle', 'rgba(200, 200, 200, 1)']);
        ctxQueue.push(['fillRect',
            [pipCanvas.width - pipEvalBarWidth, 0, pipEvalBarWidth, pipCanvas.height * engineEvaluation]
        ]);
    } else {
        ctxQueue.push(['fillStyle', 'rgba(200, 200, 200, 1)']);
        ctxQueue.push(['fillRect', [pipCanvas.width - pipEvalBarWidth, 0, pipEvalBarWidth, pipCanvas.height]]);

        ctxQueue.push(['fillStyle', 'rgba(50, 50, 50, 1)']);
        ctxQueue.push(['fillRect',
            [pipCanvas.width - pipEvalBarWidth, 0, pipEvalBarWidth, pipCanvas.height * (1 - engineEvaluation)]
        ]);
    }

    if(!pipData?.mate && centipawnEval) {
        let yPosition =
            playerColor === 'w'
                ? (centipawnEval < 0 ? 24 : pipCanvas.height - 12)
                : (centipawnEval > 0 ? 24 : pipCanvas.height - 12);

        const evalText = Math.abs(centipawnEval).toFixed(1);

        ctxQueue.push(['fillStyle', 'rgba(125, 125, 125, 1)']);
        ctxQueue.push(['font', `800 ${pipFontSizes.esmall}px Mona Sans`]);
        ctxQueue.push(['fillText',
            [evalText,
             headerWidth + [14, 11, 6, 2, 0, 0][evalText.length - 1],
             yPosition]
        ]);
    }

    // Status bar
    ctxQueue.push(['fillStyle',
        ['rgba(40, 40, 40, 0.9)', 'rgba(0, 255, 0, 1)', 'rgba(255, 0, 0, 1)'][pipData.isWinning ?? 0]
    ]);
    ctxQueue.push(['fillRect', [0, pipHeaderHeight - pipStatusBarHeight, headerWidth, pipStatusBarHeight]]);

    pipContextQueue.unshift(ctxQueue);

    // The queue was only emptied once a bestmove arrived. During a long search
    // updatePipData fires on every info line, so it grew for the whole session.
    if(pipContextQueue.length > PIP_CONTEXT_QUEUE_LIMIT)
        pipContextQueue.length = PIP_CONTEXT_QUEUE_LIMIT;

    if(from && to) pipLastPipFromTo = [from, to];

    updatePipContext();
}

export async function startPictureInPicture() {
    const video = document.createElement('video');
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
            if(video?.requestPictureInPicture) await video.requestPictureInPicture();
        } catch (err) {
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