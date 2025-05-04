// If you modify these strings, modify them on the userscript as well
const GLOBAL_VARIABLES = {
    gmConfigKey: 'AcasConfig',
    tempValueIndicator: '-temp-value-'
};

let transObj = null; // set by acas-i18n-processor.js
let fullTransObj = null;

const log = {
    info: (...message) => console.log(`[A.C.A.S]%c ${message.join(' ')}`, 'color: #67a9ef;'),
    success: (...message) => console.log(`[A.C.A.S]%c ${message.join(' ')}`, 'color: #67f08a;')
};

function objectToString(obj) {
    const parts = [];

    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const value = obj[key];

            if (Array.isArray(value)) {
                const innerValues = value.map(item => objectToString(item)).join(', ');
                parts.push(`${key}: ${innerValues}`);
            } else if (typeof value === 'object' && value !== null) {
                const innerObject = objectToString(value);
                parts.push(`${key}: { ${innerObject} }`);
            } else {
                parts.push(`${key}: ${value}`);
            }
        }
    }

    return parts.join(', ');
}

function highlightSetting(targetElem, cb) {
    if(!targetElem) return;

    const subtleElems = ['#settings-header', '#settings-panels', '#setting-container']
        .map(x => document.querySelector(x))
        .filter(x => x);

    const targetInput = targetElem.querySelector('input');

    if(targetInput?.dataset?.renderSetting) {
        const renderDialog = document.querySelector('.floaty-wrapper > #rendering-floaty');

        if(renderDialog) renderDialog.showModal();
    }

    targetElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    targetElem.classList.add('setting-highlight');
    subtleElems.forEach(elem => elem.classList.add('setting-panel-highlight'));

    setTimeout(() => {
        targetElem.classList.remove('setting-highlight');
        subtleElems.forEach(elem => elem.classList.remove('setting-panel-highlight'));

        if(cb) cb();
    }, 5000);
}

function removeParamFromUrl(paramName) {
    const newParams = new URLSearchParams(window.location.search);
    newParams.delete(paramName);

    const newUrl = window.location.pathname + (newParams.toString() ? '?' + newParams.toString() : '');
    window.history.replaceState({}, '', newUrl);
}

function speakText(text, config = {}) {
    const speechConfig = {
        pitch: config.pitch || 1, // [0, 2]
        rate: config.rate || 1, // [0.1, 10]
        volume: config.volume || 1, // [0, 1]
        voiceName: config.voiceName || undefined,
    };
  
    if('speechSynthesis' in window) {
        const synthesis = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance(text);

        utterance.pitch = speechConfig.pitch;
        utterance.rate = speechConfig.rate;
        utterance.volume = speechConfig.volume;

        if(speechConfig.voiceName) {
            const voices = synthesis.getVoices();
            const selectedVoice = voices.find(voice => voice.name === speechConfig.voiceName);

            if(selectedVoice) {
                utterance.voice = selectedVoice;
            } else {
                toast.error('TTS voice not found!');

                return;
            }
        }

        synthesis.speak(utterance);

        return synthesis;
    } else {
        toast.error('Web Speech API is not supported in this browser!');
    }
}

function getAvailableTTSVoices() {
    if ('speechSynthesis' in window) {
        const synthesis = window.speechSynthesis;
        const voices = synthesis.getVoices();

        const voiceNames = voices.map(voice => voice.name);

        return voiceNames;
    } else return false;
}

function getSkillLevelFromElo(elo) {
    if (elo <= 500) {
        return -20;
    } else if (elo >= 2850) {
        return 19;
    } else if (elo >= 2900) {
        return 20;
    } else {
        const range = (elo - 500) / (2850 - 500);

        return Math.round(-20 + (range * (19 - -20)));
    }
}

// maybe should start using math to calculate it... oh well
function getDepthFromElo(elo) {
    return elo >= 3100 ? 18
    : elo >= 3000 ? 16
    : elo >= 2900 ? 14
    : elo >= 2800 ? 12
    : elo >= 2700 ? 10
    : elo >= 2600 ? 8
    : elo >= 2400 ? 7
    : elo >= 2200 ? 6
    : elo >= 2000 ? 5
    : elo >= 1800 ? 4
    : elo >= 1600 ? 3
    : elo >= 1400 ? 2
    : elo >= 1200 ? 1
    : 1;
}

function allowOnlyNumbers(e) {
    return e.charCode >= 48 && e.charCode <= 57;
}

function getBasicFenLowerCased(fenStr) {
    return fenStr
        ?.replace(/\[.*?\]/g, '') // remove [] (and anything between) 
        ?.split(' ')?.[0]
        ?.toLowerCase();
}

function getBoardDimensionsFromFenStr(fenStr) {
    const formattedFen = getBasicFenLowerCased(fenStr);
    const extendedFen = formattedFen.replace(/\d/g, (match) => ' '.repeat(Number(match)));

    const files = extendedFen.split('/');
    const rank = files[0];

    const numRanks = rank.length;
    const numFiles = files.length;
  
    return [numRanks, numFiles];
}

function convertToCorrectType(data) {
    if (typeof data === 'string') {
        if (!isNaN(data)) {
            return parseFloat(data);
        }
        
        if (data.toLowerCase() === 'true' || data.toLowerCase() === 'false') {
            return data.toLowerCase() === 'true'; // Convert to boolean
        }
    }
    
    return data;
}

function countPieces(fen) {
    const pieceCount = {};
    const position = fen.split(' ')[0];

    for (let char of position) {
        if (/[rnbqkpRNBQKP]/.test(char)) {
            pieceCount[char] = (pieceCount[char] || 0) + 1;
        }
    }
    
    return pieceCount;
}

function countTotalPieces(fen) {
    let pieceCount = 0;
    const position = fen.split(' ')[0];

    for (let char of position) {
        if (/[rnbqkpRNBQKP]/.test(char)) {
            pieceCount += (pieceCount[char] || 0) + 1;
        }
    }
    
    return pieceCount;
}

function fenToArray(fen) {
    const rows = fen.split('/');
    const board = [];

    for (let row of rows) {
        const boardRow = [];
        for (let char of row) {
            if (isNaN(char)) {
                boardRow.push(char);
            } else {
                boardRow.push(...Array(parseInt(char)).fill(''));
            }
        }
        board.push(boardRow);
    }

    return board;
}

function capitalize(s) {
    return s && s[0].toUpperCase() + s.slice(1);
}

async function getProfile(profileName) {
    const gmConfigKey = GLOBAL_VARIABLES.gmConfigKey;
    const config = await USERSCRIPT.getValue(gmConfigKey);

    let profile = { 'name': profileName, 'config': null };

    const instanceProfileObj = config?.[settingFilterObj.type]?.[settingFilterObj.instanceID]?.['profiles']?.[profileName];
    const profileObj = config?.[settingFilterObj.type]?.['profiles']?.[profileName];
    const globalProfileObj = config?.['global']?.['profiles']?.[profileName];

    if(instanceProfileObj) {
        profile.config = { ...globalProfileObj, ...instanceProfileObj };

    } else if(profileObj) {
        profile.config = profileObj;
    } else {
        return false;
    }

    return profile;
}

async function getProfileNames() {
    const gmConfigKey = GLOBAL_VARIABLES.gmConfigKey;
    const config = await USERSCRIPT.getValue(gmConfigKey);

    const instanceProfilesObj = config?.[settingFilterObj.type]?.[settingFilterObj.instanceID]?.['profiles'];

    if(instanceProfilesObj) return Object.keys(instanceProfilesObj);

    const profilesObj = config?.[settingFilterObj.type]?.['profiles'];

    if(profilesObj) return Object.keys(profilesObj);

    console.error('Could not found profile names!', { ...settingFilterObj, gmConfigKey, config });

    return false;
}

async function getProfiles() {
    const profileNameArr = await getProfileNames();

    if(!profileNameArr) {
        console.error('getProfiles() failed, did not find any profile names!');

        return [];
    }

    const profileArr = await Promise.all(profileNameArr.map(profileName => getProfile(profileName)));

    return profileArr;
}

async function getGmConfigValue(key, instanceID, profileID) {
    if(typeof profileID === 'object') {
        profileID = profileID.name;
    }

    const gmConfigKey = GLOBAL_VARIABLES.gmConfigKey;
    const config = await USERSCRIPT.getValue(gmConfigKey);

    if(profileID) {
        const globalProfileValue = config?.global?.['profiles']?.[profileID]?.[key];
        const instanceProfileValue = config?.instance?.[instanceID]?.['profiles']?.[profileID]?.[key];

        if(instanceProfileValue !== undefined) {
            return instanceProfileValue;
        }

        if(globalProfileValue !== undefined) {
            return globalProfileValue;
        }
    }

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

const hide = elem => elem.classList.add('hidden');
const show = elem => elem.classList.remove('hidden');

function eloToTitle(elo) {
    return elo >= 2900 ? "Cheater"
    : elo >= 2500 ? "Grandmaster"
    : elo >= 2400 ? "International Master"
    : elo >= 2300 ? "Fide Master"
    : elo >= 2200 ? "National Master"
    : elo >= 2000 ? "Expert"
    : elo >= 1800 ? "Tournament Player"
    : elo >= 1600 ? "Experienced"
    : elo >= 1400 ? "Intermediate"
    : elo >= 1200 ? "Average"
    : elo >= 1000 ? "Casual"
    : "Beginner";
}

const getEloDescription = elo => `Approx. ${elo} (${eloToTitle(elo)})`;

const engineEloArr = [
    { elo: 1200, data: 'go depth 1' },
    { elo: 1300, data: 'go depth 2' },
    { elo: 1450, data: 'go depth 3' },
    { elo: 1750, data: 'go depth 4' },
    { elo: 2000, data: 'go depth 5' },
    { elo: 2200, data: 'go depth 6' },
    { elo: 2300, data: 'go depth 7' },
    { elo: 2400, data: 'go depth 8' },
    { elo: 2500, data: 'go depth 9' },
    { elo: 2600, data: 'go depth 10' },
    { elo: 2700, data: 'go movetime 1500' },
    { elo: 2800, data: 'go movetime 3000' },
    { elo: 2900, data: 'go movetime 5000' },
    { elo: 3000, data: 'go movetime 10000' }
];

function removeUciPrefix(str) {
    const index = str.indexOf(': ');

    return str.substring(index + 2);
}

function addStyles(styles, id) {
    const cssById = document.querySelector(`#${id}`);

    const css = cssById ? cssById : document.createElement('style');
    css.type = 'text/css';

    if(id && !css?.id) css.id = id;

    if(css.styleSheet) {
        css.styleSheet.cssText = styles;
    } else {
        css.innerHTML = '';

        css.appendChild(document.createTextNode(styles));
    }

    document.querySelector('head')?.appendChild(css);
}

function calculateTimeProgress(startTime, movetime) {
    let progress = (Date.now() - startTime) / movetime;
    return Math.max(0, Math.min(1, progress));
}

function extractMoveFromBoardFen(lastFen, currentFen) {
    if (!(lastFen && currentFen)) return { from: null, to: null, color: null };

    lastFen = lastFen.split(' ')[0];
    currentFen = currentFen.split(' ')[0];

    let lastBoard = fenToArray(lastFen);
    let currentBoard = fenToArray(currentFen);

    let moveFrom = null;
    let moveTo = null;
    let movedPiece = null;

    const rows = lastBoard.length;
    const cols = lastBoard[0].length;

    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            if (lastBoard[i][j] !== currentBoard[i][j]) {
                // This might be different for variants, however,
                // every time a piece moves in chess, the square it left from will stay empty
                if (lastBoard[i][j] !== '' && currentBoard[i][j] === '') {
                    moveFrom = `${String.fromCharCode(97 + j)}${rows - i}`;
                }
                if (currentBoard[i][j] !== '') {
                    moveTo = `${String.fromCharCode(97 + j)}${rows - i}`;
                    movedPiece = currentBoard[i][j];
                }
            }
        }
    }

    let color = movedPiece ? (movedPiece === movedPiece.toUpperCase() ? 'w' : 'b') : null;

    return { from: moveFrom, to: moveTo, color: color };
}

function reverseFenPlayer(fen) {
    const fenSplit = fen.split(' ');

    if(fenSplit[1] === 'w')
        fenSplit[1] = 'b';
    else
        fenSplit[1] = 'w';

    return fenSplit.join(' ');
}

function parseUCIResponse(response) {
    const keywords = ['id', 'name', 'author', 'uciok', 'readyok', 
        'bestmove', 'option', 'info', 'score', 'pv', 'mate', 'cp',
        'wdl', 'depth', 'seldepth', 'nodes', 'time', 'nps', 'tbhits',
        'currmove', 'currmovenumber', 'hashfull', 'multipv',
        'refutation', 'line', 'stop', 'ponderhit', 'ucs',
        'position', 'startpos', 'moves', 'files', 'ranks',
        'pocket', 'template', 'variant', 'ponder', 'Fen:', 'bmc'];

    const data = {};
    let currentKeyword = null;
    
    response.split(/\s+/).forEach(token => {
        if (keywords.includes(token) || token.startsWith('info')) {
            if (token.startsWith('info')) {
                return;
            }

            currentKeyword = token;
            data[currentKeyword] = '';

        } else if (currentKeyword !== null) {
            if (!isNaN(token) && !/^[rnbqkpRNBQKP\d]+$/.test(token)) {
                data[currentKeyword] = parseInt(token);
            } else if (data[currentKeyword] !== '') {
                data[currentKeyword] += ' ';
                data[currentKeyword] += token;
            } else {
                data[currentKeyword] += token;
            }
        }
    });
    
    return data;
}

function extractVariantNames(str) {
    const regex = /var\s+([\w-]+)/g;
    const matches = str.match(regex);

    if (matches) {
        return matches.map(match => match.split(' ')[1]);
    }

    return [];
}

const isVariant960 = v => v?.toLowerCase() == 'chess960';

function formatVariant(str) {
    return str
        ?.replaceAll(' ', '')
        ?.replaceAll('-', '')
        ?.toLowerCase();
}

function formatChessFont(str) {
    return str
        ?.replaceAll(' ', '')
        ?.toLowerCase();
}

function getBoardDimensionPercentages(boardDimensionsObj) {
    const { width, height } = boardDimensionsObj;
    const isSquare = width === height;

    if (isSquare) {
        return { 'width': 100, 'height': 100 };
    }

    const newWidth = width/height * 100;
    const newHeight = height/width * 100;

    return width > height 
        ? { 'width': 100, 'height': newHeight } 
        : { 'width': newWidth, 'height': 100 };
}

function getBoardHeightFromWidth(widthPx, boardDimensionsObj) {
    return widthPx * (boardDimensionsObj.height / boardDimensionsObj.width);
}

function getPieceStyleDimensions(boardDimensionsObj) {
    const width = 100 / boardDimensionsObj.width;
    const height = 100 / boardDimensionsObj.height;

    return { width, height };
}

function getBackgroundStyleDimension(boardDimensionsObj) {
    return (100 / boardDimensionsObj.width) / (100 / 8) * 100;
}

function startHeartBeatLoop(key) {
    if(USERSCRIPT) {
        return setInterval(() => {
            USERSCRIPT.GM_setValue(key, true);
        }, 1);
    } else {
        console.error("USERSCRIPT variable not found, can't start heart beat loop!");
    }
}

function setIntervalAsync(callback, interval) {
    let running = true;

    async function loop() {
        while(running) {
            try {
                await new Promise((resolve) => setTimeout(resolve, interval));
                await callback();
            } catch (e) {
                continue;
            }
        }
    };

    loop();

    return { stop: () => running = false };
}

function getCookie(name) {
    const cookies = document.cookie ? document.cookie.split('; ') : [];
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].split('=');
        if (cookie[0] === name) return decodeURIComponent(cookie.slice(1).join('='));
    }
    return null;
}

async function waitForElement(selector, maxWaitTime = 10000000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTime) {
        const element = document.querySelector(selector);
        if (element) {
            return element;
        }
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms before checking again
    }
    console.warn(`Element ${selector} not found after ${maxWaitTime / 1000} seconds`);
    return null;
}

async function loadFileAsUint8Array(url) {
    try {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
    } catch (error) {
        console.error("Error loading file:", error);
        return null;
    }
}

function isBelowVersion(versionStr, targetVersion) {
    return versionStr.localeCompare(targetVersion, undefined, {numeric: true}) === -1;
}

function formatProfileName(profileNameStr) {
    return profileNameStr
        .trim()
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/\s+/g, '');
}

function initNestedObject(obj, keys) {
    keys.reduce((acc, key) => {
        if (!acc[key]) acc[key] = {};
        return acc[key];
    }, obj);
}

function getUniqueID() {
    return ([1e7]+-1e3+4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    )
}

async function isEngineIncompatible(engineName, profileName, skipSabCheck) {
    async function check(pN) {
        const enginesRequiringSAB = [ // Requiring SharedArrayBuffer
            'stockfish-17-wasm',
            'stockfish-16-1-wasm', 
            'stockfish-14-nnue',
            'fairy-stockfish-nnue-wasm',
            'lc0'
        ];

        const profileObj = await getProfile(pN);
        const profileChessEngine = engineName || profileObj.config.chessEngine;
        
        return (skipSabCheck || !window?.SharedArrayBuffer) && enginesRequiringSAB.includes(profileChessEngine);
    }

    if(profileName) return check(profileName);

    const profiles = await getProfiles();

    for(const profile of profiles.filter(p => p.config.engineEnabled)) {
        const profileName = profile.name;

        return check(profileName);
    }
}

async function ensureSabParam() {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    const hasSabParam = params.has('sab');

    if(!hasSabParam && await isEngineIncompatible(null, null, true)) {
        params.set('sab', 'true');
        window.location.href = `${url.origin}${url.pathname}?${params.toString()}`;
    }
}