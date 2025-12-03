const pipData = {};
const pipFontSizes = { large: 64, mlarge: 35, medium: 26, small: 18, esmall: 18 };
const pipHeaderHeight = 44;
const pipEvalBarWidth = 41;
const pipStatusBarHeight = 2;
const pipBoardSize = 360;
const pipMaxTextWidth = 332;
const pipBoardConfig = [0, pipHeaderHeight, pipBoardSize];

let pipCanvas = null;
let pipLastPipEval = null;
let pipLastPipFromTo = [null, null];
let pipLastPipBoardBitmaps = [null, null];
let pipFirstTimeOpeningPip = true;
let pipContextQueue = [];
let pipProcessingBestMove = false;

function updatePipData(data) {
    if(data) Object.assign(pipData, data);
    if(data?.moveObjects) refreshPipView(true);
}

async function renderPipBoards(from, to) {
    const isNewSuggestion = pipLastPipFromTo[0] !== from && pipLastPipFromTo[1] !== to;

    if(isNewSuggestion) {
        const cgElem = document.querySelector('.chessground-x');

        if(!cgElem) return;
        
        const canvas = await snapdom.toCanvas(cgElem, { fast: true });
        bitmap = await createImageBitmap(canvas);
        
        const instanceId = cgElem.parentElement.parentElement?.dataset?.instanceId;
        const boardDrawerSvg = document.querySelector(`#board-drawings svg[data-instance-id="${instanceId}"]`);

        const svg = boardDrawerSvg.cloneNode(true);
        svg.style.position = 'unset';

        const container = document.createElement('div');
              container.appendChild(svg);
              container.style.cssText = 'position: absolute;left:-9999px;';

        document.body.appendChild(container);

        const canvas2 = await snapdom.toCanvas(container, { fast: true });
        bitmap2 = await createImageBitmap(canvas2);

        container.remove();

        pipLastPipBoardBitmaps = [bitmap, bitmap2];
    }
}

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
    if(!pipCanvas) return;

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

    if(bestMove) {
        ctxQueue.push(['bestmove', from+to]);
        pipProcessingBestMove = from+to;
    }

    const isBoard = window.pipBoardActive;
    if(isBoard && bestMove) await renderPipBoards();

    const headerWidth = pipCanvas.width - pipEvalBarWidth;
    const noInstancesText = fullTransObj?.domTranslations?.['#no-instances-title'];

    let progress = 0;
    let eval = pipData.eval;

    if((pipData.goalDepth && pipData.goalDepth < 100) || (pipData.depth === null)) {
        const depth = pipData.depth || pipData.goalDepth

        progress = depth / pipData.goalDepth;
    } else if(pipData?.goalNodes) {
        progress = pipData?.nodes / pipData?.goalNodes;
    } else {
        progress = calculateTimeProgress(pipData.startTime, pipData.movetime);
    }

    if(!eval && pipLastPipEval === null) eval = 0.5;
    else if(eval) pipLastPipEval = eval;

    // CLEAR CANVAS
    ctxQueue.push(['clearRect', [0, 0, pipCanvas.width, pipCanvas.height]]);

    // BACKGROUND
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

    if(pipData.moveProgressText) {
        const headerOffset = 36;
        ctxQueue.push(['fillText',
            [pipData.moveProgressText, 12, pipHeaderHeight + headerOffset, pipMaxTextWidth]
        ]);
    } else if(noInstancesText && to !== 'one)') {
        ctxQueue.push(['font', `700 ${pipFontSizes.medium}px IBM Plex Sans`]);
        ctxQueue.push(['fillText', [noInstancesText, 12, pipHeaderHeight + 40, pipMaxTextWidth]]);
        ctxQueue.push(['fillText', ['ദ്ദി(˵ •̀ ᴗ - ˵ ) ✧', 12, pipHeaderHeight + 80, pipMaxTextWidth]]);
    }

    // Time + Progress
    if(pipData.calculationTimeElapsed) {
        const timeMs = pipData.calculationTimeElapsed;
        const timeFormatted =
            timeMs > 9999 ? `${(timeMs / 1000).toFixed(1)}s` : `${timeMs}ms`;

        const progressPercent = (progress * 100).toFixed(0);

        ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.5)']);
        ctxQueue.push(['font', `500 ${pipFontSizes.small}px Mona Sans`]);
        ctxQueue.push(['fillText',
            [`(${timeFormatted}, ${progressPercent}%)`, 120, 28]
        ]);
    }

    ctxQueue.push(['fillStyle', 'white']);
    ctxQueue.push(['font', `900 ${pipFontSizes.large}px Mona Sans`]);

    // BOARD RENDERING
    if(isBoard) {
        let [bitmap, bitmap2] = pipLastPipBoardBitmaps;

        if(bitmap) {
            ctxQueue.push(['drawImage', [bitmap, ...pipBoardConfig, pipBoardSize - 4]]);
            ctxQueue.push(['drawImage', [bitmap2, ...pipBoardConfig, pipBoardSize]]);
        }
    // TEXT BASED RENDERING
    } else {
        if(to === 'one)') {
            ctxQueue.push(['fillText', ['≽(•⩊ •マ≼', 16, pipHeaderHeight + 100]]);
        } else if(bestMove) {
            ctxQueue.push(['fillText',
                [`${from.toUpperCase()} ➔ ${to.toUpperCase()}`, 16, pipHeaderHeight + 100]
            ]);
        }

        if(sFrom && sTo) {
            ctxQueue.push(['fillStyle', 'rgba(255, 255, 255, 0.5)']);
            ctxQueue.push(['font', `500 ${pipFontSizes.medium}px Mona Sans`]);
            ctxQueue.push(['fillText',
                [`2. (${sFrom.toUpperCase()} ➔ ${sTo.toUpperCase()})`, 16, pipHeaderHeight + 135]
            ]);
        }

        if(tFrom && tTo) {
            ctxQueue.push(['fillText',
                [`3. (${tFrom.toUpperCase()} ➔ ${tTo.toUpperCase()})`, 180, pipHeaderHeight + 135]
            ]);
        }
    }

    // PROGRESS BAR
    ctxQueue.push(['fillStyle', 'rgba(0, 0, 0, 0.1)']);
    ctxQueue.push(['fillRect',
        [0, pipHeaderHeight, (pipCanvas.width - pipEvalBarWidth) * progress, pipCanvas.height - pipHeaderHeight]
    ]);

    // EVAL BAR BACKGROUND + FOREGROUND
    if(playerColor === 'b') {
        ctxQueue.push(['fillStyle', 'rgba(50, 50, 50, 1)']);
        ctxQueue.push(['fillRect', [pipCanvas.width - pipEvalBarWidth, 0, pipEvalBarWidth, pipCanvas.height]]);

        ctxQueue.push(['fillStyle', 'rgba(200, 200, 200, 1)']);
        ctxQueue.push(['fillRect',
            [pipCanvas.width - pipEvalBarWidth, 0, pipEvalBarWidth, pipCanvas.height * eval]
        ]);
    } else {
        ctxQueue.push(['fillStyle', 'rgba(200, 200, 200, 1)']);
        ctxQueue.push(['fillRect', [pipCanvas.width - pipEvalBarWidth, 0, pipEvalBarWidth, pipCanvas.height]]);

        ctxQueue.push(['fillStyle', 'rgba(50, 50, 50, 1)']);
        ctxQueue.push(['fillRect',
            [pipCanvas.width - pipEvalBarWidth, 0, pipEvalBarWidth, pipCanvas.height * (1 - eval)]
        ]);
    }

    // EVAL TEXT
    const centipawnEval = pipData?.centipawnEval / 100;

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

    // STATUS BAR
    ctxQueue.push(['fillStyle',
        ['rgba(40, 40, 40, 0.9)', 'rgba(0, 255, 0, 1)', 'rgba(255, 0, 0, 1)'][pipData.isWinning ?? 0]
    ]);
    ctxQueue.push(['fillRect', [0, pipHeaderHeight - pipStatusBarHeight, headerWidth, pipStatusBarHeight]]);

    pipContextQueue.unshift(ctxQueue);

    if(from && to) pipLastPipFromTo = [from, to];

    updatePipContext();
}

async function startPictureInPicture() {
    let width = 200, height = window.pipBoardActive ? 200 : 100;
    const pipWidth = width * 2, pipHeight = height * 2;

    const video = document.createElement('video');
          video.width = width;
          video.height = height;

    pipCanvas = document.createElement('canvas');
    pipCanvas.width = pipWidth;
    pipCanvas.height = pipHeight;

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