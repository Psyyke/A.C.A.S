const repositoryURL = 'https://github.com/Psyyke/A.C.A.S'; // old relics, not in use
const repositoryRawURL = null; // old relics, not in use

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
    } else {
        return ['Default'];
    }
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

function capitalize(s) {
    return s && s[0].toUpperCase() + s.slice(1);
}

function getGmConfigValue(key, instanceID) {
    const config = USERSCRIPT.GM_getValue(USERSCRIPT.dbValues.AcasConfig);

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

function parseUCIResponse(response) {
    const keywords = ['id', 'name', 'author', 'uciok', 'readyok', 
        'bestmove', 'option', 'info', 'score', 'pv', 'mate', 'cp',
        'depth', 'seldepth', 'nodes', 'time', 'nps', 'tbhits',
        'currmove', 'currmovenumber', 'hashfull', 'multipv',
        'refutation', 'line', 'stop', 'ponderhit', 'ucs',
        'position', 'startpos', 'moves', 'files', 'ranks',
        'pocket', 'template', 'variant', 'ponder', 'Fen:'];

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