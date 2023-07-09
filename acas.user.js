// ==UserScript==
// @name        A.C.A.S (Advanced Chess Assistance System)
// @name:en     A.C.A.S (Advanced Chess Assistance System)
// @name:fi     A.C.A.S (Edistynyt shakkiavustusjärjestelmä)
// @name:zh-CN  A.C.A.S（高级国际象棋辅助系统）
// @name:es     A.C.A.S (Sistema Avanzado de Asistencia al Ajedrez)
// @name:hi     A.C.A.S (उन्नत शतरंज सहायता प्रणाली)
// @name:ar     A.C.A.S (نظام المساعدة المتقدم في الشطرنج)
// @name:pt     A.C.A.S (Sistema Avançado de Assistência ao Xadrez)
// @name:ja     A.C.A.S（先進的なチェス支援システム）
// @name:de     A.C.A.S (Fortgeschrittenes Schach-Hilfesystem)
// @name:fr     A.C.A.S (Système Avancé d'Assistance aux Échecs)
// @name:it     A.C.A.S (Sistema Avanzato di Assistenza agli Scacchi)
// @name:ko     A.C.A.S (고급 체스 보조 시스템)
// @name:nl     A.C.A.S (Geavanceerd Schaakondersteuningssysteem)
// @name:pl     A.C.A.S (Zaawansowany System Pomocy Szachowej)
// @name:tr     A.C.A.S (Gelişmiş Satranç Yardım Sistemi)
// @name:vi     A.C.A.S (Hệ Thống Hỗ Trợ Cờ Vua Nâng Cao)
// @name:uk     A.C.A.S (Система передової допомоги в шахах)
// @name:ru     A.C.A.S (Система расширенной помощи в шахматах)
// @description        Enhance your chess performance with a cutting-edge real-time move analysis and strategy assistance system
// @description:en     Enhance your chess performance with a cutting-edge real-time move analysis and strategy assistance system
// @description:fi     Paranna shakkipelisi suorituskykyä huippuluokan reaaliaikaisen siirtoanalyysin ja strategisen avustusjärjestelmän avulla
// @description:zh-CN  利用尖端实时走法分析和策略辅助系统，提升您的国际象棋水平
// @description:es     Mejora tu rendimiento en ajedrez con un sistema de análisis de movimientos en tiempo real y asistencia estratégica de vanguardia
// @description:hi     अपने शतरंज प्रदर्शन को उन्नत करें, एक कटिंग-एज रियल-टाइम मूव विश्लेषण और रणनीति सहायता प्रणाली के साथ
// @description:ar     قم بتحسين أداءك في الشطرنج مع تحليل حركات اللعب في الوقت الحقيقي ونظام مساعدة استراتيجية حديث
// @description:pt     Melhore seu desempenho no xadrez com uma análise de movimentos em tempo real e um sistema avançado de assistência estratégica
// @description:ja     最新のリアルタイムのムーブ分析と戦略支援システムでチェスのパフォーマンスを向上させましょう
// @description:de     Verbessern Sie Ihre Schachleistung mit einer hochmodernen Echtzeitzug-Analyse- und Strategiehilfe-System
// @description:fr     Améliorez vos performances aux échecs avec une analyse de mouvement en temps réel de pointe et un système d'assistance stratégique
// @description:it     Migliora le tue prestazioni agli scacchi con un sistema all'avanguardia di analisi dei movimenti in tempo reale e assistenza strategica
// @description:ko     최첨단 실시간 움직임 분석 및 전략 지원 시스템으로 체스 성과 향상
// @description:nl     Verbeter je schaakprestaties met een geavanceerd systeem voor realtime zetanalyse en strategische ondersteuning
// @description:pl     Popraw swoje osiągnięcia w szachach dzięki zaawansowanemu systemowi analizy ruchów w czasie rzeczywistym i wsparciu strategicznemu
// @description:tr     Keskinleşmiş gerçek zamanlı hareket analizi ve strateji yardım sistemiyle satranç performansınızı artırın
// @description:vi     Nâng cao hiệu suất cờ vua của bạn với hệ thống phân tích nước đi và hỗ trợ chiến thuật hiện đại
// @description:uk     Покращуйте свою шахову гру з використанням передової системи аналізу ходів в режимі реального часу та стратегічної підтримки
// @description:ru     Слава Украине
// @homepageURL https://hakorr.github.io/A.C.A.S
// @supportURL  https://github.com/Hakorr/A.C.A.S/tree/main#why-doesnt-it-work
// @downloadURL https://github.com/Hakorr/A.C.A.S/raw/main/acas.user.js
// @match       https://www.chess.com/*
// @match       https://lichess.org/*
// @match       https://playstrategy.org/*
// @match       https://www.pychess.org/*
// @match       https://chess.org/*
// @match       https://papergames.io/*
// @match       https://vole.wtf/kilobytes-gambit/
// @match       https://hakorr.github.io/A.C.A.S/*
// @match       http://localhost/*
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_deleteValue
// @grant       GM_listValues
// @grant       GM_registerMenuCommand
// @grant       GM_openInTab
// @grant       GM_addStyle
// @grant       unsafeWindow
// @run-at      document-start
// @version     2.0.2
// @namespace   HKR
// @author      HKR
// @require     https://greasyfork.org/scripts/470418-commlink-js/code/CommLinkjs.js
// @require     https://greasyfork.org/scripts/470417-universalboarddrawer-js/code/UniversalBoardDrawerjs.js
// ==/UserScript==

/*
     e            e88~-_            e           ,d88~~\
    d8b          d888   \          d8b          8888
   /Y88b         8888             /Y88b         `Y88b
  /  Y88b        8888            /  Y88b         `Y88b,
 /____Y88b  d88b Y888   / d88b  /____Y88b  d88b    8888
/      Y88b Y88P  "88_-~  Y88P /      Y88b Y88P \__88P'

Advanced Chess Assistance System (A.C.A.S) v2 | Q3 2023

[WARNING]
- Please be advised that the use of A.C.A.S may violate the rules and lead to disqualification or banning from tournaments and online platforms.
- The developers of A.C.A.S and related systems will NOT be held accountable for any consequences resulting from its use.
- We strongly advise to use A.C.A.S only in a controlled environment ethically.*/

// DANGER ZONE - DO NOT PROCEED IF YOU DON'T KNOW WHAT YOU'RE DOING //
/*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*/
//////////////////////////////////////////////////////////////////////
// DANGER ZONE - DO NOT PROCEED IF YOU DON'T KNOW WHAT YOU'RE DOING //

const backendURL = 'https://hakorr.github.io/A.C.A.S/'; // FOR DEVELOPMENT USE: 'http://localhost/A.C.A.S/';

const domain = window.location.hostname.replace('www.', '');
const tempValueIndicator = '-temp-value-';

const dbValues = {
    AcasConfig: 'AcasConfig',
    playerColor: instanceID => 'playerColor' + tempValueIndicator + instanceID,
    turn: instanceID => 'turn' + tempValueIndicator + instanceID,
    fen: instanceID => 'fen' + tempValueIndicator + instanceID
};

function createInstanceVariable(dbValue) {
    return {
        set: (instanceID, value) => GM_setValue(dbValues[dbValue](instanceID), { value, 'date': Date.now() }),
        get: instanceID => {
            const data = GM_getValue(dbValues[dbValue](instanceID));

            if(data?.date) {
                data.date = Date.now();

                GM_setValue(dbValues[dbValue](instanceID), data);
            }

            return data?.value;
        }
    }
}

const instanceVars = {
    playerColor: createInstanceVariable('playerColor'),
    turn: createInstanceVariable('turn'),
    fen: createInstanceVariable('fen')
};

if(window?.location?.href?.includes(backendURL)) {
    // expose variables and functions
    unsafeWindow.USERSCRIPT = {
        'GM_info': GM_info,
        'GM_getValue': val => GM_getValue(val),
        'GM_setValue': (val, data) => GM_setValue(val, data),
        'GM_deleteValue': val => GM_deleteValue(val),
        'GM_listValues': val => GM_listValues(val),
        'tempValueIndicator': tempValueIndicator,
        'dbValues': dbValues,
        'instanceVars': instanceVars,
        'CommLinkHandler': CommLinkHandler,
    };

    return;
}

// DANGER ZONE - DO NOT PROCEED IF YOU DON'T KNOW WHAT YOU'RE DOING //
/*\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\*/
//////////////////////////////////////////////////////////////////////
// DANGER ZONE - DO NOT PROCEED IF YOU DON'T KNOW WHAT YOU'RE DOING //

function getUniqueID() {
    return ([1e7]+-1e3+4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    )
}

const commLinkInstanceID = getUniqueID();

const blacklistedURLs = [
    'https://www.chess.com/play',
    'https://lichess.org/',
    'https://chess.org/',
    'https://papergames.io/en/chess',
    'https://playstrategy.org/',
    'https://www.pychess.org/',
    'https://hakorr.github.io/A.C.A.S/',
    'https://hakorr.github.io/A.C.A.S/why/',
    'https://hakorr.github.io/A.C.A.S/tos/',
    'http://localhost/A.C.A.S/'
];

const configKeys = {
    'engineElo': 'engineElo',
    'moveSuggestionAmount': 'moveSuggestionAmount',
    'arrowOpacity': 'arrowOpacity',
    'displayMovesOnExternalSite': 'displayMovesOnExternalSite',
    'showMoveGhost': 'showMoveGhost',
    'showOpponentMoveGuess': 'showOpponentMoveGuess',
    'maxMovetime': 'maxMovetime',
    'chessVariant': 'chessVariant',
    'chessFont': 'chessFont',
    'useChess960': 'useChess960'
};

const config = {};

Object.values(configKeys).forEach(key => {
    config[key] = {
        get:  () => getGmConfigValue(key, commLinkInstanceID),
        set: null
    };
});

const debugModeActivated = false;

let BoardDrawer = null;
let chessBoardElem = null;
let lastBasicFen = null;
let chesscomVariantBoardCoordsTable = null;
let activeSiteMoveHighlights = [];
let inactiveGuiMoveMarkings = [];

let lastBoardRanks = null;
let lastBoardFiles = null;

let lastBoardSize = null;
let lastPieceSize = null;

let lastBoardOrientation = null;

const domainsWithoutDifferentBoardDimensionsArr = ['chess.org', 'lichess.org', 'papergames.io', 'vole.wtf'];

const arrowStyles = {
    'best': `
        fill: limegreen;
        opacity: ${getConfigValue(configKeys.arrowOpacity)/100 || '0.9'};
        stroke: rgb(0 0 0 / 50%);
        stroke-width: 2px;
        stroke-linejoin: round;
    `,
    'secondary': `
        fill: dodgerblue;
        opacity: ${getConfigValue(configKeys.arrowOpacity)/100 || '0.7'};
        stroke: rgb(0 0 0 / 50%);
        stroke-width: 2px;
        stroke-linejoin: round;
    `,
    'opponent': `
        fill: crimson;
        stroke: rgb(0 0 0 / 25%);
        stroke-width: 2px;
        stroke-linejoin: round;
        display: none;
        opacity: ${getConfigValue(configKeys.arrowOpacity)/100 || '0.3'};
    `
};

const CommLink = new CommLinkHandler(`frontend_${commLinkInstanceID}`, {
    'singlePacketResponseWaitTime': 1500,
    'maxSendAttempts': 3,
    'statusCheckInterval': 1,
    'silentMode': true
});

// manually register a command so that the variables are dynamic
CommLink.commands['createInstance'] = async () => {
    return await CommLink.send('mum', 'createInstance', {
        'domain': domain,
        'instanceID': commLinkInstanceID,
        'chessVariant': getChessVariant(),
        'playerColor': getPlayerColorVariable()
    });
}

CommLink.registerSendCommand('ping', { commlinkID: 'mum', data: 'ping' });
CommLink.registerSendCommand('pingInstance', { data: 'ping' });
CommLink.registerSendCommand('log');
CommLink.registerSendCommand('updateBoardOrientation');
CommLink.registerSendCommand('updateBoardFen');
CommLink.registerSendCommand('calculateBestMoves');

CommLink.registerListener(`backend_${commLinkInstanceID}`, packet => {
    try {
        switch(packet.command) {
            case 'ping':
                return `pong (took ${Date.now() - packet.date}ms)`;
            case 'getFen':
                return getFen();
            case 'removeSiteMoveMarkings':
                boardUtils.removeBestMarkings();
                return true;
            case 'markMoveToSite':
                boardUtils.markMove(packet.data);
                return true;
        }
    } catch(e) {
        return null;
    }
});

function filterInvisibleElems(elementArr, inverse) {
    return [...elementArr].filter(elem => {
        const style = getComputedStyle(elem);
        const bounds = elem.getBoundingClientRect();

        const isHidden =
            style.visibility === 'hidden' ||
            style.display === 'none' ||
            style.opacity === '0' ||
            bounds.width == 0 ||
            bounds.height == 0;

        return inverse ? isHidden : !isHidden;
    });
}

function getElementSize(elem) {
    const rect = elem.getBoundingClientRect();

    if(rect.width !== 0 && rect.height !== 0) {
        return { width: rect.width, height: rect.height };
    }

    const computedStyle = window.getComputedStyle(elem);
    const width = parseFloat(computedStyle.width);
    const height = parseFloat(computedStyle.height);

    return { width, height };
}

function extractElemTransformData(elem) {
    const computedStyle = window.getComputedStyle(elem);
    const transformMatrix = new DOMMatrix(computedStyle.transform);

    const x = transformMatrix.e;
    const y = transformMatrix.f;

    return [x, y];
}

function getElemCoordinatesFromTransform(elem) {
    if (!lastBoardSize) {
        lastBoardSize = getElementSize(chessBoardElem);
    }

    if (!lastBoardRanks) {
        const [files, ranks] = getBoardDimensions();

        lastBoardRanks = ranks;
        lastBoardFiles = files;
    }

    const boardOrientation = getPlayerColorVariable();

    const [x, y] = extractElemTransformData(elem);

    const boardDimensions = lastBoardSize;
    const squareDimensions = boardDimensions.width / lastBoardRanks;

    const normalizedX = Math.round(x / squareDimensions);
    const normalizedY = Math.round(y / squareDimensions);

    if (boardOrientation === 'w') {
        const flippedY = lastBoardFiles - normalizedY - 1;

        return [normalizedX, flippedY];
    } else {
        const flippedX = lastBoardRanks - normalizedX - 1;

        return [flippedX, normalizedY];
    }
}


function createChesscomVariantBoardCoordsTable() {
    chesscomVariantBoardCoordsTable = {};

    const boardElem = getBoardElem();
    const [boardWidth, boardHeight] = getBoardDimensions();
    const boardOrientation = getBoardOrientation();

    const squareElems = getSquareElems(boardElem);

    let squareIndex = 0;

    for(let x = 0; x < boardWidth; x++) {
        for(let y = boardHeight; y > 0; y--) {
            const squareElem = squareElems[squareIndex];
            const id = squareElem?.id;

            const xIdx = x;
            const yIdx = y - 1;

            if(id) {
                chesscomVariantBoardCoordsTable[id] = [xIdx, yIdx];
            }

            squareIndex++;
        }
    }
}

function chessCoordinatesToIndex(coord) {
    const x = coord.charCodeAt(0) - 97;
    let y = null;

    const lastHalf = coord.slice(1);

    if(lastHalf === ':') {
        y = 9;
    } else {
        y = Number(coord.slice(1)) - 1;
    }

    return [x, y];
}

function getGmConfigValue(key, instanceID) {
    const config = GM_getValue(dbValues.AcasConfig);

    const instanceValue = config?.instance?.[instanceID]?.[key];
    const globalValue = config?.global?.[key];

    if(instanceValue !== undefined) {
        return instanceValue;
    }

    if(globalValue !== undefined) {
        return globalValue;
    }

    return null;
}

function getConfigValue(key) {
    return config[key]?.get();
}

function setConfigValue(key, val) {
    return config[key]?.set(val);
}

function squeezeEmptySquares(fenStr) {
    return fenStr.replace(/1+/g, match => match.length);
}

function getPlayerColorVariable() {
    return instanceVars.playerColor.get(commLinkInstanceID);
}

function getFenPieceColor(pieceFenStr) {
    return pieceFenStr == pieceFenStr.toUpperCase() ? 'w' : 'b';
}

function getFenPieceOppositeColor(pieceFenStr) {
    return getFenPieceColor(pieceFenStr) == 'w' ? 'b' : 'w';
}

function convertPieceStrToFen(str) {
    if(!str || str.length !== 2) {
        return null;
    }

    const firstChar = str[0].toLowerCase();
    const secondChar = str[1];

    if(firstChar === 'w') {
        return secondChar.toUpperCase();
    } else if (firstChar === 'b') {
        return secondChar.toLowerCase();
    }

    return null;
}

function getBoardElem() {
    const pathname = window.location.pathname;

    switch(domain) {
        case 'chess.com': {
            if(pathname?.includes('/variants')) {
                return document.querySelector('#board');
            }

            return document.querySelector('chess-board');
        }

        case 'lichess.org': {
            return document.querySelector('cg-board');
        }

        case 'playstrategy.org': {
            return document.querySelector('cg-board');
        }

        case 'pychess.org': {
            return document.querySelector('cg-board');
        }

        case 'chess.org': {
            return document.querySelector('.cg-board');
        }

        case 'papergames.io': {
            return document.querySelector('#chessboard');
        }

        case 'vole.wtf': {
            return document.querySelector('#board');
        }
    }

    return null;
}

function getChessPieceElem(getAll) {
    const pathname = window.location.pathname;
    const boardElem = getBoardElem();

    const querySelector = (getAll ? query => [...boardElem.querySelectorAll(query)] : boardElem.querySelector.bind(boardElem));

    switch(domain) {
        case 'chess.com': {
            if(pathname?.includes('/variants')) {
                const filteredPieceElems = filterInvisibleElems(document.querySelectorAll('#board *[data-piece]'))
                    .filter(elem => Number(elem?.dataset?.player) <= 2);

                return getAll ? filteredPieceElems : filteredPieceElems[0];
            }

            return querySelector('.piece');
        }

        case 'lichess.org': {
            return querySelector('piece:not(.ghost)');
        }

        case 'playstrategy.org': {
            return querySelector('piece[class*="-piece"]:not(.ghost)');
        }

        case 'pychess.org': {
            return querySelector('piece[class*="-piece"]:not(.ghost)');
        }

        case 'chess.org': {
            return querySelector('piece:not(.ghost)');
        }

        case 'papergames.io': {
            return querySelector('*[data-piece][data-square]');
        }

        case 'vole.wtf': {
            return querySelector('*[data-t][data-l][data-p]:not([data-p="0"]');
        }
    }

    return null;
}

function getSquareElems(element) {
    const pathname = window.location.pathname;

    switch(domain) {
        case 'chess.com': {
            if(pathname?.includes('/variants')) {
                return [...element.querySelectorAll('.square-4pc.ui-droppable')]
                    .filter(elem => {
                        const pieceElem = elem.querySelector('[data-player]');
                        const playerNum = Number(pieceElem?.dataset?.player);

                        return (!playerNum || playerNum <= 2);
                    });
            }

            break;
        }
    }

    return null;
}

function isMutationNewMove(mutationArr) {
    const pathname = window.location.pathname;

    switch(domain) {
        case 'chess.com': {
            if(pathname?.includes('/variants')) {
                return mutationArr.find(m => m.attributeName == 'class') ? true : false;
            }

            if(mutationArr.length == 1)
                return false;

            const modifiedHoverSquare = mutationArr.find(m => m?.target?.classList?.contains('hover-square')) ? true : false;
            const modifiedHighlight = mutationArr.find(m => m?.target?.classList?.contains('highlight')) ? true : false;
            const modifiedElemPool = mutationArr.find(m => m?.target?.classList?.contains('element-pool')) ? true : false;

            return (mutationArr.length >= 4 && !modifiedHoverSquare)
                || mutationArr.length >= 7
                || modifiedHighlight
                || modifiedElemPool;
        }

        case 'lichess.org': {
            return mutationArr.length >= 4
                || mutationArr.find(m => m.type === 'childList') ? true : false
                || mutationArr.find(m => m?.target?.classList?.contains('last-move')) ? true : false;
        }

        case 'playstrategy.org': {
            return mutationArr.length >= 4
                || mutationArr.find(m => m.type === 'childList') ? true : false
                || mutationArr.find(m => m?.target?.classList?.contains('last-move')) ? true : false;
        }

        case 'pychess.org': {
            return mutationArr.length >= 4
                || mutationArr.find(m => m.type === 'childList') ? true : false
                || mutationArr.find(m => m?.target?.classList?.contains('last-move')) ? true : false;
        }

        case 'chess.org': {
            return mutationArr.length >= 4
                || mutationArr.find(m => m.type === 'childList') ? true : false
                || mutationArr.find(m => m?.target?.classList?.contains('last-move')) ? true : false;
        }

        case 'papergames.io': {
            return mutationArr.length >= 12;
        }

        case 'vole.wtf': {
            return mutationArr.length >= 12;
        }
    }

    return false;
}

function getChessVariant() {
    const pathname = window.location.pathname;

    switch(domain) {
        case 'chess.com': {
            if(pathname?.includes('/variants')) {
                const variant = pathname.match(/variants\/([^\/]*)/)?.[1]
                    .replaceAll('-chess', '')
                    .replaceAll('-', '');

                const replacementTable = {
                    'doubles-bughouse': 'bughouse',
                    'paradigm-chess30': 'paradigm'
                };

                return replacementTable[variant] || variant;
            }

            break;
        }

        case 'lichess.org': {
            const variantLinkElem = document.querySelector('.variant-link');

            if(variantLinkElem) {
                let variant = variantLinkElem?.innerText?.toLowerCase()?.replaceAll(' ', '-');

                const replacementTable = {
                    'correspondence': 'chess',
                    'koth': 'kingofthehill',
                    'three-check': '3check'
                };

                return replacementTable[variant] || variant;
            }

            break;
        }

        case 'playstrategy.org': {
            const variantLinkElem = document.querySelector('.variant-link');

            if(variantLinkElem) {
                let variant = variantLinkElem?.innerText
                    ?.toLowerCase()
                    ?.replaceAll(' ', '-');

                const replacementTable = {
                    'correspondence': 'chess',
                    'koth': 'kingofthehill',
                    'three-check': '3check',
                    'five-check': '5check',
                    'no-castling': 'nocastle'
                };

                return replacementTable[variant] || variant;
            }

            break;
        }

        case 'pychess.org': {
            const variantLinkElem = document.querySelector('#main-wrap .tc .user-link');

            if(variantLinkElem) {
                let variant = variantLinkElem?.innerText
                    ?.toLowerCase()
                    ?.replaceAll(' ', '')
                    ?.replaceAll('-', '');

                const replacementTable = {
                    'correspondence': 'chess',
                    'koth': 'kingofthehill',
                    'nocastling': 'nocastle',
                    'gorogoro+': 'gorogoro',
                    'oukchaktrang': 'cambodian'
                };

                return replacementTable[variant] || variant;
            }

            break;
        }

        case 'chess.org': {
            const variantNum = unsafeWindow?.GameConfig?.instance?.variant;
            let variant = GameConfig?.VARIANT_NAMES?.[variantNum]?.toLowerCase();

            if(variant) {
                const replacementTable = {
                    'standard': 'chess'
                };

                return replacementTable[variant] || variant;
            }

            break;
        }

        case 'papergames.io': {
            return 'chess';
        }

        case 'vole.wtf': {
            return 'chess';
        }
    }

    return 'chess';
}

function getBoardOrientation() {
    const pathname = window.location.pathname;

    switch(domain) {
        case 'chess.com': {
            if(pathname?.includes('/variants')) {
                const playerNumberStr = document.querySelector('.playerbox-bottom [data-player]')?.dataset?.player;

                return playerNumberStr == '0' ? 'w' : 'b';
            }

            const boardElem = getBoardElem();

            return boardElem?.classList.contains('flipped') ? 'b' : 'w';
        }

        case 'lichess.org': {
            const filesElem = document.querySelector('coords.files');

            return filesElem?.classList?.contains('black') ? 'b' : 'w';
        }

        case 'playstrategy.org': {
            const cgWrapElem = document.querySelector('.cg-wrap');

            return cgWrapElem.classList?.contains('orientation-p1') ? 'w' : 'b';
        }

        case 'pychess.org': {
            const cgWrapElem = document.querySelector('.cg-wrap');

            return cgWrapElem.classList?.contains('orientation-black') ? 'b' : 'w';
        }

        case 'chess.org': {
            const filesElem = document.querySelector('coords.files');

            return filesElem?.classList?.contains('black') ? 'b' : 'w';
        }

        case 'papergames.io': {
            const boardElem = getBoardElem();

            if(boardElem) {
                const firstRankText = [...boardElem.querySelector('.coordinates').childNodes]?.[0].textContent;

                return firstRankText == 'h' ? 'b' : 'w';
            }
        }

        case 'vole.wtf': {
            return 'w';
        }
    }

    return null;
}

function getPieceElemFen(pieceElem) {
    const pathname = window.location.pathname;

    const pieceNameToFen = {
        'pawn': 'p',
        'knight': 'n',
        'bishop': 'b',
        'rook': 'r',
        'queen': 'q',
        'king': 'k'
    };

    switch(domain) {
        case 'chess.com': {
            let pieceColor = null;
            let pieceName = null;

            if(pathname?.includes('/variants')) {
                pieceColor = pieceElem?.dataset?.player == '0' ? 'w' : 'b';
                pieceName = pieceElem?.dataset?.piece;
            } else {
                const pieceStr = [...pieceElem.classList].find(x => x.match(/^(b|w)[prnbqk]{1}$/));

                [pieceColor, pieceName] = pieceStr.split('');
            }

            return pieceColor == 'w' ? pieceName.toUpperCase() : pieceName.toLowerCase();
        }

        case 'lichess.org': {
            const pieceColor = pieceElem?.classList?.contains('white') ? 'w' : 'b';
            const elemPieceName = [...pieceElem?.classList]?.find(className => Object.keys(pieceNameToFen).includes(className));

            if(pieceColor && elemPieceName) {
                const pieceName = pieceNameToFen[elemPieceName];

                return pieceColor == 'w' ? pieceName.toUpperCase() : pieceName.toLowerCase();
            }

            break;
        }

        case 'playstrategy.org': {
            const playerColor = getPlayerColorVariable();
            const pieceColor = pieceElem?.classList?.contains('ally') ? playerColor : (playerColor == 'w' ? 'b' : 'w');

            let pieceName = null;

            [...pieceElem?.classList]?.forEach(className => {
                if(className?.includes('-piece')) {
                    const elemPieceName = className?.split('-piece')?.[0];

                    if(elemPieceName && elemPieceName?.length === 1) {
                        pieceName = elemPieceName;
                    }
                }
            });

            if(pieceColor && pieceName) {
                return pieceColor == 'w' ? pieceName.toUpperCase() : pieceName.toLowerCase();
            }

            break;
        }

        case 'pychess.org': {
            const playerColor = getPlayerColorVariable();
            const pieceColor = pieceElem?.classList?.contains('ally') ? playerColor : (playerColor == 'w' ? 'b' : 'w');

            let pieceName = null;

            [...pieceElem?.classList]?.forEach(className => {
                if(className?.includes('-piece')) {
                    const elemPieceName = className?.split('-piece')?.[0];

                    if(elemPieceName && elemPieceName?.length === 1) {
                        pieceName = elemPieceName;
                    }
                }
            });

            if(pieceColor && pieceName) {
                return pieceColor == 'w' ? pieceName.toUpperCase() : pieceName.toLowerCase();
            }

            break;
        }

        case 'chess.org': {
            const pieceColor = pieceElem?.classList?.contains('white') ? 'w' : 'b';
            const elemPieceName = [...pieceElem?.classList]?.find(className => Object.keys(pieceNameToFen).includes(className));

            if(pieceColor && elemPieceName) {
                const pieceName = pieceNameToFen[elemPieceName];

                return pieceColor == 'w' ? pieceName.toUpperCase() : pieceName.toLowerCase();
            }

            break;
        }

        case 'papergames.io': {
            return convertPieceStrToFen(pieceElem?.dataset?.piece);
        }

        case 'vole.wtf': {
            const pieceNum = Number(pieceElem?.dataset?.p);
            const pieceFenStr = 'pknbrq';

            if(pieceNum > 8) {
                return pieceFenStr[pieceNum - 9].toUpperCase();
            } else {
                return pieceFenStr[pieceNum - 1];
            }
        }
    }

    return null;
}


// this function gets called a lot, needs to be optimized
function getPieceElemCoords(pieceElem) {
    const pathname = window.location.pathname;

    switch(domain) {
        case 'chess.com': {
            if(pathname?.includes('/variants')) {
                const squareElem = pieceElem.parentElement;
                const squareId = squareElem.id;

                if(!chesscomVariantBoardCoordsTable) {
                    createChesscomVariantBoardCoordsTable();
                }

                return chesscomVariantBoardCoordsTable[squareId];
            }

            return pieceElem.classList.toString()
                ?.match(/square-(\d)(\d)/)
                ?.slice(1)
                ?.map(x => Number(x) - 1);
        }

        case 'lichess.org': {
            const key = pieceElem?.cgKey;

            if(!key) break;

            return chessCoordinatesToIndex(key);
        }

        case 'playstrategy.org': {
            const key = pieceElem?.cgKey;

            if(!key) break;

            return chessCoordinatesToIndex(key);
        }

        case 'pychess.org': {
            const key = pieceElem?.cgKey;

            if(!key) break;

            return chessCoordinatesToIndex(key);
        }

        case 'chess.org': {
            return getElemCoordinatesFromTransform(pieceElem);
        }

        case 'papergames.io': {
            const key = pieceElem?.dataset?.square;

            if(!key) break;

            return chessCoordinatesToIndex(key);
        }

        case 'vole.wtf': {
            return [Number(pieceElem?.dataset?.l), 7 - Number(pieceElem?.dataset?.t)];
        }
    }

    return null;
}

function getBoardDimensions() {
    const pathname = window.location.pathname;

    switch(domain) {
        case 'chess.com': {
            if(pathname?.includes('/variants')) {
                const rankElems = chessBoardElem?.querySelectorAll('.rank');
                const visibleRankElems = filterInvisibleElems(rankElems)
                    .filter(rankElem => [...rankElem.childNodes]
                        .find(elem => {
                            const pieceElem = elem.querySelector('[data-player]');
                            const playerNum = Number(pieceElem?.dataset?.player);

                            return playerNum <= 2;
                        }));


                if(visibleRankElems.length) {
                    const rankElem = visibleRankElems[0];
                    const squareElems = getSquareElems(rankElem);

                    const ranks = visibleRankElems?.length;
                    const files = squareElems?.length;

                    return [ranks, files];
                }
            }

            break;
        }

        default: {
            if(domainsWithoutDifferentBoardDimensionsArr?.includes(domain)) break;

            const boardDimensions = getElementSize(chessBoardElem);

            lastBoardSize = getElementSize(chessBoardElem);

            const boardWidth = boardDimensions?.width;
            const boardHeight = boardDimensions.height;

            const boardPiece = getChessPieceElem();

            if(boardPiece) {
                const pieceDimensions = getElementSize(boardPiece);

                lastPieceSize = getElementSize(boardPiece);

                const boardPieceWidth = pieceDimensions?.width;
                const boardPieceHeight = pieceDimensions?.height;

                const boardRanks = Math.floor(boardWidth / boardPieceWidth);
                const boardFiles = Math.floor(boardHeight / boardPieceHeight);

                const ranksInAllowedRange = 0 < boardRanks && boardRanks <= 69;
                const filesInAllowedRange = 0 < boardFiles && boardFiles <= 69;

                if(ranksInAllowedRange && filesInAllowedRange) {
                    lastBoardRanks = boardRanks;
                    lastBoardFiles = boardFiles;

                    return [boardRanks, boardFiles];
                }
            }

            break;
        }
    }

    lastBoardRanks = 8;
    lastBoardFiles = 8;

    return [8, 8];
}

function getFen(onlyBasic) {
    const [boardRanks, boardFiles] = getBoardDimensions();

    if(debugModeActivated) console.warn('getFen()', 'onlyBasic:', onlyBasic, 'Ranks:', boardRanks, 'Files:', boardFiles);

    const board = Array.from({ length: boardFiles }, () => Array(boardRanks).fill(1));

    function getBasicFen() {
        const pieceElems = getChessPieceElem(true);
        const isValidPieceElemsArray = Array.isArray(pieceElems) || pieceElems instanceof NodeList;

        if(isValidPieceElemsArray) {
            pieceElems.forEach(pieceElem => {
                const pieceFenCode = getPieceElemFen(pieceElem);
                const pieceCoordsArr = getPieceElemCoords(pieceElem);

                if(debugModeActivated) console.warn('pieceElem', pieceElem, 'pieceFenCode', pieceFenCode, 'pieceCoordsArr', pieceCoordsArr);

                try {
                    const [xIdx, yIdx] = pieceCoordsArr;

                    board[boardFiles - (yIdx + 1)][xIdx] = pieceFenCode;
                } catch(e) {
                    if(debugModeActivated) console.error(e);
                }
            });
        }

        return squeezeEmptySquares(board.map(x => x.join('')).join('/'));
    }

    const basicFen = getBasicFen();

    if(onlyBasic) {
        return basicFen;
    }

    return `${basicFen} ${getPlayerColorVariable()} - - - -`;
}

const boardUtils = {
    markMove: moveObj => {
        if(!getConfigValue(configKeys.displayMovesOnExternalSite)) return;

        const [from, to] = moveObj.player;
        const [opponentFrom, opponentTo] = moveObj.opponent;
        const ranking = moveObj.ranking;

        const existingExactSameMoveObj = activeSiteMoveHighlights.find(obj => {
            const [activeFrom, activeTo] = obj.player;
            const [activeOpponentFrom, activeOpponentTo] = obj.opponent;

            return from == activeFrom
                && to == activeTo
                && opponentFrom == activeOpponentFrom
                && opponentTo == activeOpponentTo;
        });

        activeSiteMoveHighlights.map(obj => {
            const [activeFrom, activeTo] = obj.player;

            const existingSameMoveObj = from == activeFrom && to == activeTo;

            if(existingSameMoveObj) {
                obj.promotedRanking = 1;
            }

            return obj;
        });

        const exactSameMoveDoesNotExist = typeof existingExactSameMoveObj !== 'object';

        if(exactSameMoveDoesNotExist) {

            const showOpponentMoveGuess = getConfigValue(configKeys.showOpponentMoveGuess);

            const opponentMoveGuessExists = typeof opponentFrom == 'string';

            const arrowStyle = ranking == 1 ? arrowStyles.best : arrowStyles.secondary;

            let opponentArrowElem = null;

            // create player move arrow element
            const arrowElem = BoardDrawer.createShape('arrow', [from, to],
                { style: arrowStyle }
            );

            // create opponent move arrow element
            if(opponentMoveGuessExists && showOpponentMoveGuess) {
                opponentArrowElem = BoardDrawer.createShape('arrow', [opponentFrom, opponentTo],
                    { style: arrowStyles.opponent }
                );

                const squareListener = BoardDrawer.addSquareListener(from, type => {
                    if(!opponentArrowElem) {
                        squareListener.remove();
                    }

                    switch(type) {
                        case 'enter':
                            opponentArrowElem.style.display = 'inherit';
                            break;
                        case 'leave':
                            opponentArrowElem.style.display = 'none';
                            break;
                    }
                });
            }

            activeSiteMoveHighlights.push({
                ...moveObj,
                'opponentArrowElem': opponentArrowElem,
                'playerArrowElem': arrowElem
            });
        }

        boardUtils.removeOldMarkings();
        boardUtils.paintMarkings();
    },
    removeOldMarkings: () => {
        const markingLimit = getConfigValue(configKeys.moveSuggestionAmount);
        const showGhost = getConfigValue(configKeys.showMoveGhost);

        const exceededMarkingLimit = activeSiteMoveHighlights.length > markingLimit;

        if(exceededMarkingLimit) {
            const amountToRemove = activeSiteMoveHighlights.length - markingLimit;

            for(let i = 0; i < amountToRemove; i++) {
                const oldestMarkingObj = activeSiteMoveHighlights[0];

                activeSiteMoveHighlights = activeSiteMoveHighlights.slice(1);

                if(oldestMarkingObj?.playerArrowElem?.style) {
                    oldestMarkingObj.playerArrowElem.style.fill = 'grey';
                    oldestMarkingObj.playerArrowElem.style.opacity = '0';
                    oldestMarkingObj.playerArrowElem.style.transition = 'opacity 2.5s ease-in-out';
                }

                if(oldestMarkingObj?.opponentArrowElem?.style) {
                    oldestMarkingObj.opponentArrowElem.style.fill = 'grey';
                    oldestMarkingObj.opponentArrowElem.style.opacity = '0';
                    oldestMarkingObj.opponentArrowElem.style.transition = 'opacity 2.5s ease-in-out';
                }

                if(showGhost) {
                    inactiveGuiMoveMarkings.push(oldestMarkingObj);
                } else {
                    oldestMarkingObj.playerArrowElem?.remove();
                    oldestMarkingObj.opponentArrowElem?.remove();
                }
            }
        }

        if(showGhost) {
            inactiveGuiMoveMarkings.forEach(markingObj => {
                const activeDuplicateArrow = activeSiteMoveHighlights.find(x => {
                    const samePlayerArrow = x.player?.toString() == markingObj.player?.toString();
                    const sameOpponentArrow = x.opponent?.toString() == markingObj.opponent?.toString();

                    return samePlayerArrow && sameOpponentArrow;
                });

                const duplicateExists = activeDuplicateArrow ? true : false;

                const removeArrows = () => {
                    inactiveGuiMoveMarkings = inactiveGuiMoveMarkings.filter(x => x.playerArrowElem != markingObj.playerArrowElem);

                    markingObj.playerArrowElem?.remove();
                    markingObj.opponentArrowElem?.remove();
                }

                if(duplicateExists) {
                    removeArrows();
                } else {
                    setTimeout(removeArrows, 2500);
                }
            });
        }
    },
    paintMarkings: () => {
        const newestBestMarkingIndex = activeSiteMoveHighlights.findLastIndex(obj => obj.ranking == 1);
        const newestPromotedBestMarkingIndex = activeSiteMoveHighlights.findLastIndex(obj => obj?.promotedRanking == 1);
        const lastMarkingIndex = activeSiteMoveHighlights.length - 1;

        const isLastMarkingBest = newestBestMarkingIndex == -1 && newestPromotedBestMarkingIndex == -1;
        const bestIndex = isLastMarkingBest ? lastMarkingIndex : Math.max(...[newestBestMarkingIndex, newestPromotedBestMarkingIndex]);

        let bestMoveMarked = false;

        activeSiteMoveHighlights.forEach((markingObj, idx) => {
            const isBestMarking = idx == bestIndex;

            if(isBestMarking) {
                markingObj.playerArrowElem.style.cssText = arrowStyles.best;

                const playerArrowElem = markingObj.playerArrowElem
                const opponentArrowElem = markingObj.opponentArrowElem;

                // move best arrow element on top (multiple same moves can hide the best move)
                const parentElem = markingObj.playerArrowElem.parentElement;

                parentElem.appendChild(playerArrowElem);

                if(opponentArrowElem) {
                    parentElem.appendChild(opponentArrowElem);
                }

                bestMoveMarked = true;
            } else {
                markingObj.playerArrowElem.style.cssText = arrowStyles.secondary;
            }
        });
    },
    removeBestMarkings: () => {
        activeSiteMoveHighlights.forEach(markingObj => {
            markingObj.opponentArrowElem?.remove();
            markingObj.playerArrowElem?.remove();
        });

        activeSiteMoveHighlights = [];
    },
    setBoardOrientation: orientation => {
        if(BoardDrawer) {
            if(debugModeActivated) console.warn('setBoardOrientation', orientation);

            BoardDrawer.setOrientation(orientation);
        }
    },
    setBoardDimensions: dimensionArr => {
        if(BoardDrawer) {
            if(debugModeActivated) console.warn('setBoardDimensions', dimensionArr);

            BoardDrawer.setBoardDimensions(dimensionArr);
        }
    }
};

function onNewMove(mutationArr) {
    if(debugModeActivated) console.warn('NEW MOVE DETECTED!');

    chesscomVariantBoardCoordsTable = null;

    boardUtils.setBoardDimensions(getBoardDimensions());

    const lastPlayerColor = getPlayerColorVariable();

    updatePlayerColor();

    const playerColor = getPlayerColorVariable();
    const orientationChanged = playerColor != lastPlayerColor;

    if(orientationChanged) {
        CommLink.commands.log(`Player color (e.g. board orientation) changed from ${lastPlayerColor} to ${playerColor}!`);

        chesscomVariantBoardCoordsTable = null;

        instanceVars.turn.set(commLinkInstanceID, playerColor);

        CommLink.commands.log(`Turn updated to ${playerColor}!`);
    }

    const currentFullFen = getFen();
    const currentBasicFen = currentFullFen?.split(' ')?.[0];

    const fenChanged = currentBasicFen != lastBasicFen;

    if(fenChanged) {
        lastBasicFen = currentBasicFen;

        boardUtils.removeBestMarkings();

        /*
        if(!orientationChanged) {
            const allChessPieceElems = getChessPieceElem(true);

            const attributeMutationArr = mutationArr.filter(m => allChessPieceElems.includes(m.target));
            const movedChessPieceElem = attributeMutationArr?.[0]?.target; // doesn't work for chess.com variants

            if(movedChessPieceElem) {
                const newTurn = getFenPieceOppositeColor(getPieceElemFen(movedChessPieceElem));

                if(newTurn?.length === 1) {
                    instanceVars.turn.set(commLinkInstanceID, newTurn);

                    CommLink.commands.log(`Turn updated to ${newTurn}!`);
                }
            }
        }
        */

        instanceVars.fen.set(commLinkInstanceID, currentFullFen);

        CommLink.commands.updateBoardFen(currentFullFen);
        CommLink.commands.calculateBestMoves(currentFullFen);
    }
}

function observeNewMoves() {
    let lastProcessedFen = null;

    const boardObserver = new MutationObserver(mutationArr => {
        if(debugModeActivated) console.log(mutationArr);

        if(isMutationNewMove(mutationArr))
        {
            if(debugModeActivated) console.warn('Mutation is a new move:', mutationArr);

            if(domain === 'chess.org')
            {
                setTimeout(() => onNewMove(mutationArr), 250);
            }
            else
            {
                onNewMove(mutationArr);
            }
        }
    });

    boardObserver.observe(chessBoardElem, { childList: true, subtree: true, attributes: true });
}

async function updatePlayerColor() {
    const boardOrientation = getBoardOrientation();

    const boardOrientationChanged = lastBoardOrientation !== boardOrientation;
    const boardOrientationDiffers = BoardDrawer && BoardDrawer?.orientation !== boardOrientation;

    if(boardOrientationChanged || boardOrientationDiffers) {
        lastBoardOrientation = boardOrientation;

        instanceVars.playerColor.set(commLinkInstanceID, boardOrientation);
        instanceVars.turn.set(commLinkInstanceID, boardOrientation);

        boardUtils.setBoardOrientation(boardOrientation);

        await CommLink.commands.updateBoardOrientation(boardOrientation);
    }
}

async function isAcasBackendReady() {
    const res = await CommLink.commands.ping();

    return res ? true : false;
}

async function start() {
    await CommLink.commands.createInstance(commLinkInstanceID);

    const pathname = window.location.pathname;
    const adjustSizeByDimensions = domain === 'chess.com' && pathname?.includes('/variants');

    const boardOrientation = getBoardOrientation();

    instanceVars.playerColor.set(commLinkInstanceID, boardOrientation);
    instanceVars.turn.set(commLinkInstanceID, boardOrientation);
    instanceVars.fen.set(commLinkInstanceID, getFen());

    if(getConfigValue(configKeys.displayMovesOnExternalSite)) {
        BoardDrawer = new UniversalBoardDrawer(chessBoardElem, {
            'window': window,
            'boardDimensions': getBoardDimensions(),
            'playerColor': getPlayerColorVariable(),
            'zIndex': 500,
            'prepend': true,
            'debugMode': debugModeActivated,
            'adjustSizeByDimensions': adjustSizeByDimensions ? true : false,
            'adjustSizeConfig': {
                'noLeftAdjustment': true
            }
        });
    }

    await updatePlayerColor();

    observeNewMoves();

    CommLink.setIntervalAsync(async () => {
        await CommLink.commands.createInstance(commLinkInstanceID);
    }, 1000);
}

function startWhenBackendReady() {
    const interval = CommLink.setIntervalAsync(async () => {
        if(await isAcasBackendReady()) {
            start();

            interval.stop();
        } else {
            GM_openInTab(backendURL, true);

            if(await isAcasBackendReady()) {
                start();

                interval.stop();
            }
        }
    }, 1000);
}

function initializeIfSiteReady() {
    const boardElem = getBoardElem();
    const firstPieceElem = getChessPieceElem();

    const bothElemsExist = boardElem && firstPieceElem;
    const boardElemChanged = chessBoardElem != boardElem;

    if(bothElemsExist && boardElemChanged) {
        chessBoardElem = boardElem;

        if(!blacklistedURLs.includes(window.location.href)) {
            startWhenBackendReady();
        }
    }
}

if(typeof GM_registerMenuCommand == 'function') {
    GM_registerMenuCommand('Open A.C.A.S', e => {
        if(chessBoardElem) {
            startWhenBackendIsReady();
        }
    }, 's');
}

setInterval(initializeIfSiteReady, 1000);
