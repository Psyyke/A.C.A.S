// If you modify these strings, modify them on the userscript as well
const USERSCRIPT_SHARED_VARS = {
    gmConfigKey: 'AcasConfig',
    tempValueIndicator: '-temp-value-'
};

const ENGINES_REQUIRING_SAB = [ // Requiring SharedArrayBuffer
    'stockfish-16-1-wasm', 
    'stockfish-14-nnue',
    'fairy-stockfish-nnue-wasm',
    'lc0'
];

const PROFILE_STORAGE_KEY_PREFIX = '__B64__';
const USER_USAGE_PREFIX = 'usageStat_';
const MINUTES_USED_STORAGE_KEY = 'minutesUsed';
const THEME_COLOR_STORAGE_KEY = 'themeColorHex';
const INSTANCE_SIZE_KEY = 'instanceSize';
const BOARD_SIZE_MODIFIER_KEY = 'boardSizeModifier';
const CONCEAL_ASSISTANCE_ACTIVE_KEY = 'concealAssistanceActive';

const TOS_ACCEPTED_DB_KEY = 'isTosAccepted';

const GUI_BROADCAST_NAME = 'gui';
const EXTERNAL_UCI_BROADCAST_NAME = 'externalEngineUciFeed';
const EXTERNAL_STATUS_BROADCAST_NAME = 'externalEngineStatusFeed';
const DYNAMIC_BUTTONPRESS_BROADCAST_NAME = 'dynamicSettingButtonFeed';

// Allows for every script to quickly determine what profile it is, etc.
const SETTING_FILTER_OBJ = { 'type': 'global', 'instanceID': null, 'profileID': null };

const EE_ACTIVE_STORAGE_KEY = 'IS_EXTERNAL_ENGINE_SETTING_ACTIVE';
const IS_EXTERNAL_ENGINE_SETTING_ACTIVE = JSON.parse(
    localStorage.getItem(EE_ACTIVE_STORAGE_KEY) || "{}"
);

const FI_NUMBER_FORMATTER = new Intl.NumberFormat('fi-FI');
const ACTIVE_INPUT_LISTENERS = [];

let TRANS_OBJ = null; // set by translationProcessor.js
let FULL_TRANS_OBJ = null; // set by translationProcessor.js
let IS_INSTANCE_SETTING_BTN_DISABLED = false;
let LAST_FORCE_CLOSE_TIME = 0;
let CONCEAL_ASSISTANCE_ACTIVE = false;

function FORCE_CLOSE_ALL_INSTANCES() {
    const now = Date.now();
    
    if(now - LAST_FORCE_CLOSE_TIME < 3000) return;
    LAST_FORCE_CLOSE_TIME = now;

    window.AcasInstances.forEach(iObj => {
        if(iObj.instance && typeof iObj.instance.close === "function") {
            iObj.instance.close();
        }
    });
}

function APPLY_ASSISTANCE_CONCEALMENT(isConcealed) {
    CONCEAL_ASSISTANCE_ACTIVE = isConcealed;

    window.AcasInstances.forEach(iObj => {
        if(iObj.instance && typeof iObj.instance.close === "function") {
            const BoardDrawerSvg = iObj.instance.BoardDrawer.boardContainerElem;

            if('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }

            if(isConcealed) BoardDrawerSvg.style.display = 'none';
            else {
                BoardDrawerSvg.style.display = 'block';

                Object.keys(iObj.instance.pV).forEach(profileName => {
                    const pending = iObj.instance.pV[profileName]?.pendingMoveDisplay;
                    if(Array.isArray(pending)) iObj.instance.displayMoves(...pending);
                });
            }

            iObj.instance.CommLink.commands.applyAssistanceConcealment(isConcealed);
        }
    });

    const chessboardComponents = document.querySelectorAll('.chessboard-components');

    chessboardComponents.forEach(elem => {
        elem.classList.toggle('assistance-concealment-active', isConcealed);
    });
}

async function TOGGLE_CONCEAL_ASSISTANCE() {
    const gmConfigKey = USERSCRIPT_SHARED_VARS.gmConfigKey;
    const config = await USERSCRIPT.getValue(gmConfigKey);

    const newValue = !(config['global'][CONCEAL_ASSISTANCE_ACTIVE_KEY] ?? false);
    config['global'][CONCEAL_ASSISTANCE_ACTIVE_KEY] = newValue;
    
    USERSCRIPT.setValue(gmConfigKey, config);

    APPLY_ASSISTANCE_CONCEALMENT(newValue);
}

function CREATE_INPUT_LISTENER(listenerType, targetValue, callback) {
    if(typeof listenerType !== 'string' || typeof targetValue !== 'string' || !callback) return;
    
    const existingIndex = ACTIVE_INPUT_LISTENERS
        .findIndex(l => l.listenerType === listenerType);

    if(existingIndex !== -1) {
        const existing = ACTIVE_INPUT_LISTENERS[existingIndex];
        if(existing.targetValue === targetValue) return;
        
        existing.listeners.forEach(({ type, fn }) => document.removeEventListener(type, fn));
        ACTIVE_INPUT_LISTENERS.splice(existingIndex, 1);
    }

    let holdTimer = null;
    let lastTapTime = 0;
    const dblTapThreshold = 300;
    const listeners = [];

    const addListener = (type, fn) => {
        document.addEventListener(type, fn);
        listeners.push({ type, fn });
    };

    addListener('keydown', (e) => {
        if(!targetValue.startsWith("Interact") && e.code === targetValue)
            callback(e);
    });

    const startPress = (e) => {
        if(!targetValue.startsWith("Interact")) return;

        const match = targetValue.match(/^InteractLongPress(\d+)$/);

        if(match) holdTimer = setTimeout(() => {
            callback(e);
            holdTimer = null;
        }, parseInt(match[1], 10) * 1000);

        if(targetValue === "InteractDoubleClick" && e.type.startsWith("touch")) {
            const now = performance.now();
            if(now - lastTapTime < dblTapThreshold) {
                callback(e);
                lastTapTime = 0;
            }
            else lastTapTime = now;
        }
    };

    const endPress = () => { if(holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
    }};

    addListener('mousedown', startPress);
    addListener('mouseup', endPress);
    addListener('touchstart', startPress);
    addListener('touchend', endPress);
    addListener('dblclick', (e) => {
        if(targetValue === "InteractDoubleClick") callback(e);
    });

    ACTIVE_INPUT_LISTENERS.push({
        listenerType,
        targetValue,
        callback,
        listeners
    });
}

function GET_EXTERNAL_PARAM_DB_KEY(engineId) {
    return 'EXTERNAL_PARAMS_' + engineId;
}

function GEOGEBRA_DOT_COMMANDS(data) {
    const { w, b } = data;

    const arrToGeoList = arr => `{${arr.join(",")}}`;

    const wList = arrToGeoList(w);
    const bList  = arrToGeoList(b);

    const wCmd =
        `wPoints = Sequence((i, Element(${wList}, i)), i, 1, ${w.length})`;

    const bCmd =
        `bPoints = Sequence((i, Element(${bList}, i)), i, 1, ${b.length})`;

    return { wCmd, bCmd };
}

function GET_UNIQUE_MOVES(moves) {
    const seen = new Set();
    const cleaned = new Array(moves.length);
    let write = 0;
    let removedCount = 0;
  
    for(let i = 0; i < moves.length; i++) {
            const m = moves[i];

            const key =
                m.player[0] + ',' + m.player[1] + '|' +
                m.opponent[0] + ',' + m.opponent[1] + '|' +
                m.profile;

            if(!seen.has(key)) {
                seen.add(key);
                cleaned[write++] = m;
            } else {
                removedCount++;
            }
    }
  
    cleaned.length = write;

    return [cleaned, removedCount];
}

function OBJECT_TO_STRING(obj) {
    const parts = [];

    for(const key in obj) {
        if(obj.hasOwnProperty(key)) {
            const value = obj[key];

            if(Array.isArray(value)) {
                const innerValues = value.map(item => OBJECT_TO_STRING(item)).join(', ');
                parts.push(`${key}: ${innerValues}`);
            } else if(typeof value === 'object' && value !== null) {
                const innerObject = OBJECT_TO_STRING(value);
                parts.push(`${key}: { ${innerObject} }`);
            } else {
                parts.push(`${key}: ${value}`);
            }
        }
    }

    return parts.join(', ');
}

function REMOVE_PARAM_FROM_URL(paramName) {
    const newParams = new URLSearchParams(window.location.search);
    newParams.delete(paramName);

    const newUrl = window.location.pathname + (newParams.toString() ? '?' + newParams.toString() : '');
    window.history.replaceState({}, '', newUrl);
}

function SPEAK_TEXT(text, config = {}) {
    const speechConfig = {
        pitch: config.pitch || 1,   // [0, 2]
        rate: config.rate || 1,     // [0.1, 10]
        volume: config.volume || 1, // [0, 1]
        voiceName: config.voiceName || undefined,
    };

    const cleanedText = text.replace(/[^a-zA-Z0-9\s]/g, '');

    if('speechSynthesis' in window) {
        const synthesis = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance(cleanedText);

        utterance.pitch = speechConfig.pitch;
        utterance.rate = speechConfig.rate;
        utterance.volume = speechConfig.volume;

        if(speechConfig.voiceName) {
            const voices = synthesis.getVoices();
            const selectedVoice = voices.find(
                voice => voice.name === speechConfig.voiceName
            );

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

function GET_TTS_VOICES() {
    if('speechSynthesis' in window) {
        const synthesis = window.speechSynthesis;
        const voices = synthesis.getVoices();

        const voiceNames = voices.map(voice => voice.name);

        return voiceNames;
    } else return false;
}

function GET_SKILL_FROM_ELO(elo) {
    if(elo <= 500) {
        return -20;
    } else if(elo >= 2850) {
        return 19;
    } else if(elo >= 2900) {
        return 20;
    } else {
        const range = (elo - 500) / (2850 - 500);

        return Math.round(-20 + (range * (19 - -20)));
    }
}

// maybe should start using math to calculate it... oh well
function GET_DEPTH_FROM_ELO(elo) {
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

function GET_BASIC_FEN_LOWERCASED(fenStr) {
    return fenStr
        ?.replace(/\[.*?\]/g, '') // remove [] (and anything between) 
        ?.split(' ')?.[0]
        ?.toLowerCase();
}

function GET_BOARD_DIMENSIONS_FROM_FEN(fenStr) {
    try {
        const formattedFen = GET_BASIC_FEN_LOWERCASED(fenStr);
        const extendedFen = formattedFen.replace(/\d/g, (match) => ' '.repeat(Number(match)));
    
        const files = extendedFen.split('/');
        const rank = files[0];
    
        const numRanks = rank.length;
        const numFiles = files.length;
      
        return [numRanks, numFiles];
    } catch(e) {
        return [8, 8];
    }
}

function GENERATE_HISTORY_STR(moveHistory, playerColor) {
    /* History move (e.g.)
    moveHistory.move = {
        "from": "g2",
        "to": "g3",
        "color": "w",
        "movedPiece": "P"
    } */

    const latestMoveColor = moveHistory?.at(-1)?.move?.color;

    if(!moveHistory?.length || !latestMoveColor) return '-';

    return moveHistory
        .slice()
        .reverse() // Needs to be sorted from new to old. The oldest move being the last index.
        .map(moveObj => {
            if(!latestMoveColor) return moveObj.fen.replaceAll(' ', '#');

            const parts = moveObj.fen.split(' ');
            parts[1] = moveObj.move.color;

            return parts.join(' ').replaceAll(' ', '#');
        })
        .join(',');
}

function WAIT_UNTIL_VAR(fn, timeout = 100000, interval = 100) {
    if(fn()) return fn();

    return new Promise((resolve, reject) => {
        const start = Date.now();
        const timer = setInterval(() => {
            if(fn()) {
                clearInterval(timer);
                resolve(fn());
            } else if(Date.now() - start >= timeout) {
                clearInterval(timer);
                reject(new Error("timeout"));
            }
        }, interval);
    });
}

function VAR_TO_CORRECT_TYPE(data) {
    if(typeof data === 'string') {
        if(data === 'NaN' || data.trim() === '') return '';

        if(!isNaN(data)) {
            return parseFloat(data);
        }
        
        const lowerData = data.toLowerCase();

        if(lowerData === 'true' || lowerData === 'false') {
            return lowerData === 'true';
        }
    }
    
    return data;
}

function PARSE_MINMAX_FROM_STR(input) {
    if(typeof input === 'number') return [input, input];

    const parts = input.toString().split(/(?<=\d)-(?=-?\d)/);

    const min = VAR_TO_CORRECT_TYPE(parts[0]);
    const max = parts[1] !== undefined ? VAR_TO_CORRECT_TYPE(parts[1]) : min;

    return [min, max];
}

function COUNT_PIECES_FROM_FEN(fen) {
    const pieceCount = {};
    const position = fen.split(' ')[0];

    for(let char of position) {
        if(/[rnbqkpRNBQKP]/.test(char)) {
            pieceCount[char] = (pieceCount[char] || 0) + 1;
        }
    }
    
    return pieceCount;
}

function COUNT_TOTAL_PIECES_FROM_FEN(fen) {
    let pieceCount = 0;
    const position = fen.split(' ')[0];

    for(let char of position) {
        if(/[rnbqkpRNBQKP]/.test(char)) {
            pieceCount += (pieceCount[char] || 0) + 1;
        }
    }
    
    return pieceCount;
}

function FEN_TO_ARRAYS(fen) {
    const rows = fen.split('/');
    const board = [];

    for(let row of rows) {
        const boardRow = [];
        for(let char of row) {
            if(isNaN(char)) {
                boardRow.push(char);
            } else {
                boardRow.push(...Array(parseInt(char)).fill(''));
            }
        }
        board.push(boardRow);
    }

    return board;
}

function IS_PLAYER_ATTACKING_KING(currentFen, turn) {
    if(!currentFen) return false;

    const boardPart = currentFen.split(' ')[0];
    const rows = boardPart.split('/');
    const board = [];

    for(let i = 0; i < 8; i++) {
        const row = [];

        for(let char of rows[i]) {
            if(isNaN(char)) {
                row.push(char);
            } else {
                for(let j = 0; j < parseInt(char); j++) row.push(1);
            }
        }

        board.push(row);
    }

    const isWhiteAttacking = turn === 'w';
    const enemyKing = isWhiteAttacking ? 'k' : 'K';

    let kX = -1, kY = -1;
    
    for(let y = 0; y < 8; y++) {
        for(let x = 0; x < 8; x++) {
            if(board[y][x] === enemyKing) { kX = x; kY = y; break; }
        }
        if(kX !== -1) break;
    }

    if(kX === -1) return false;

    const atk = isWhiteAttacking
        ? { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q' }
        : { p: 'p', n: 'n', b: 'b', r: 'r', q: 'q' };

    const kn = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];

    for(let i = 0; i < 8; i++) {
        const p = board[kY + kn[i][1]]?.[kX + kn[i][0]];
        if(p === atk.n) return true;
    }

    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]];

    for(let i = 0; i < 8; i++) {
        const dx = dirs[i][0], dy = dirs[i][1];
        const isDiagonal = i > 3;

        for(let j = 1; j < 8; j++) {
            const x = kX + dx * j, y = kY + dy * j;
            const p = board[y]?.[x];
            if(p === undefined) break;
            if(p !== 1) {
                if(p === atk.q || (isDiagonal ? p === atk.b : p === atk.r)) return true;
                break;
            }
        }
    }

    const pY = kY + (isWhiteAttacking ? 1 : -1);

    if(board[pY]?.[kX - 1] === atk.p || board[pY]?.[kX + 1] === atk.p) return true;

    return false;
}

async function GET_PROFILE(profileName) {
    const gmConfigKey = USERSCRIPT_SHARED_VARS.gmConfigKey;
    const config = await USERSCRIPT.getValue(gmConfigKey);

    const profileKey = GET_PROFILE_STORAGE_KEY(profileName);

    let profile = { 'name': profileName, 'config': null };

    const instanceProfileObj = config?.[SETTING_FILTER_OBJ.type]?.[SETTING_FILTER_OBJ.instanceID]?.['profiles']?.[profileKey];
    const profileObj = config?.[SETTING_FILTER_OBJ.type]?.['profiles']?.[profileKey];
    const globalProfileObj = config?.['global']?.['profiles']?.[profileKey];

    if(instanceProfileObj) {
        profile.config = { ...globalProfileObj, ...instanceProfileObj };

    } else if(profileObj) {
        profile.config = profileObj;
    } else {
        return false;
    }

    return profile;
}

async function GET_PROFILE_NAMES() {
    const gmConfigKey = USERSCRIPT_SHARED_VARS.gmConfigKey;
    const config = await USERSCRIPT.getValue(gmConfigKey);

    const instanceProfilesObj = config?.[SETTING_FILTER_OBJ.type]?.[SETTING_FILTER_OBJ.instanceID]?.['profiles'];

    if(instanceProfilesObj) return [...new Set(Object.keys(instanceProfilesObj))];

    const profilesObj = config?.[SETTING_FILTER_OBJ.type]?.['profiles'];

    if(profilesObj) return [...new Set(Object.keys(profilesObj))];

    console.error('Could not find profile names!', { ...SETTING_FILTER_OBJ, gmConfigKey, config });

    return false;
}

async function GET_PROFILES() {
    const profileNameArr = await GET_PROFILE_NAMES();

    if(!profileNameArr) {
        console.error('GET_PROFILES() failed, did not find any profile names!');

        return [];
    }

    const profileArr = await Promise.all(profileNameArr.map(profileName => GET_PROFILE(profileName)));

    return profileArr;
}

async function GET_ACTIVE_ENGINE_NAME(profileName) {
    const usesExternalEngine = await GET_GM_CFG_VALUE('useExternalChessEngine', SETTING_FILTER_OBJ.instanceID, profileName);
    const chessEngineName = await GET_GM_CFG_VALUE('chessEngine', SETTING_FILTER_OBJ.instanceID, profileName);
    const externalChessEngineId = await GET_GM_CFG_VALUE('externalChessEngine', SETTING_FILTER_OBJ.instanceID, profileName);

    const name = String(usesExternalEngine ? externalChessEngineId : chessEngineName);

    return name.trim().replace(/\s+/g, '-');
}

async function GET_GM_CFG_VALUE(key, instanceID, profileID) {
    if(profileID === null) return null;
    if(typeof profileID === 'object') {
        profileID = profileID.name;
    }

    const gmConfigKey = USERSCRIPT_SHARED_VARS.gmConfigKey;
    const config = await USERSCRIPT.getValue(gmConfigKey);

    if(profileID) {
        const profileKey = GET_PROFILE_STORAGE_KEY(profileID);

        const globalProfileValue = config?.global?.['profiles']?.[profileKey]?.[key];
        const instanceProfileValue = config?.instance?.[instanceID]?.['profiles']?.[profileKey]?.[key];

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

async function GET_GM_VALUES_STARTS_WITH(prefix, instanceID, profileID) {
    if(typeof profileID === 'object') {
        profileID = profileID.name;
    }

    const gmConfigKey = USERSCRIPT_SHARED_VARS.gmConfigKey;
    const config = await USERSCRIPT.getValue(gmConfigKey);

    const result = {};

    function collectMatching(obj) {
        if(!obj) return;
        for(const k in obj) {
            if(k.startsWith(prefix)) {
                result[k] = obj[k];
            }
        }
    }

    if(profileID) {
        const profileKey = GET_PROFILE_STORAGE_KEY(profileID);

        const globalProfile = config?.global?.['profiles']?.[profileKey];
        const instanceProfile = config?.instance?.[instanceID]?.['profiles']?.[profileKey];

        collectMatching(globalProfile);
        collectMatching(instanceProfile);
    }

    const instanceObj = config?.instance?.[instanceID];
    const globalObj = config?.global;

    collectMatching(instanceObj);
    collectMatching(globalObj);

    return Object.keys(result).length ? result : null;
}

function ADD_STYLES_TO_DOC(styles, id) {
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

function CALC_TIME_PROGRESS(startTime, movetime) {
    let progress = (Date.now() - startTime) / movetime;
    return Math.max(0, Math.min(1, progress));
}

function MODIFY_FEN_CASTLE_RIGHTS(fen, rights) {
    let parts = fen.split(' ');
    if(parts.length < 4) return fen;

    let cr = parts[2];
    let newCr = cr;

    const wMoved = rights.includes('w');
    const bMoved = rights.includes('b');

    if(wMoved && bMoved) {
        newCr = '-';
    } else {
        if(wMoved) newCr = newCr.replace(/[KQ]/g, '');
        if(bMoved) newCr = newCr.replace(/[kq]/g, '');
        if(newCr === '') newCr = '-';
    }

    parts[2] = newCr;
    return parts.join(' ');
}

function EXTRACT_MOVE_FROM_FEN(lastFen, currentFen, boardDimensions = [8, 8]) {
    if(!(lastFen && currentFen)) return { from: null, to: null, color: null };

    const [cols, rows] = boardDimensions;
    lastFen = lastFen.split(' ')[0];
    currentFen = currentFen.split(' ')[0];

    let lastBoard = FEN_TO_ARRAYS(lastFen);
    let currentBoard = FEN_TO_ARRAYS(currentFen);

    let moveFrom = null;
    let moveTo = null;
    let movedPiece = null;

    for(let i = 0; i < rows; i++) {
        for(let j = 0; j < cols; j++) {
            if(lastBoard[i][j] !== currentBoard[i][j]) {
                if(lastBoard[i][j] !== '' && currentBoard[i][j] === '') {
                    moveFrom = `${String.fromCharCode(97 + j)}${rows - i}`;
                }
                if(currentBoard[i][j] !== '') {
                    moveTo = `${String.fromCharCode(97 + j)}${rows - i}`;
                    movedPiece = currentBoard[i][j];
                }
            }
        }
    }

    let color = movedPiece ? (movedPiece === movedPiece.toUpperCase() ? 'w' : 'b') : null;

    if(movedPiece && moveTo && (!moveFrom || moveFrom === null)) {
        const toRank = parseInt(moveTo.match(/\d+/)[0]);
        const toFile = moveTo[0];

        if(color === 'w' && toRank === rows) {
            moveFrom = `${toFile}${toRank - 1}`;
            movedPiece = movedPiece.toUpperCase() ? 'P' : movedPiece;
        } else if(color === 'b' && toRank === 1) {
            moveFrom = `${toFile}${toRank + 1}`;
            movedPiece = movedPiece.toLowerCase() ? 'p' : movedPiece;
        }
    }

    return { from: moveFrom, to: moveTo, color, movedPiece };
}

function REVERSE_FEN_TURN(fen) {
    const fenSplit = fen.split(' ');

    if(fenSplit[1] === 'w')
        fenSplit[1] = 'b';
    else
        fenSplit[1] = 'w';

    return fenSplit.join(' ');
}

function PARSE_UCI_OPTION(line) {
    if(typeof line !== 'string') return null;

    const prefix = 'option name ';

    if(line.startsWith(prefix)) {
        line = line.slice(prefix.length);
    }

    if(line.length > 10000) {
        throw new Error("UCI option line too long");
    }

    const tokens = line.trim().split(/\s+/);

    if(tokens.length === 0) return null;

    let i = 0;
    const nameParts = [];

    while(i < tokens.length && tokens[i] !== 'type') {
        nameParts.push(tokens[i]);
        i++;

        if(nameParts.length > 100) {
            throw new Error("UCI option name too long");
        }
    }

    if(i >= tokens.length) {
        return null;
    }

    const name = nameParts.join(' ');
    i++; // skip "type"

    if(i >= tokens.length) return null;
    const type = tokens[i++];

    let def;
    let min;
    let max;
    let vars;

    while(i < tokens.length) {
        const t = tokens[i++];

        if(t === 'default' && i < tokens.length) {
            def = tokens[i++];
        } 
        else if(t === 'min' && i < tokens.length) {
            const v = Number(tokens[i++]);
            if(!Number.isNaN(v)) min = v;
        } 
        else if(t === 'max' && i < tokens.length) {
            const v = Number(tokens[i++]);
            if(!Number.isNaN(v)) max = v;
        } 
        else if(t === 'var' && i < tokens.length) {
            if(!vars) vars = [];

            if(vars.length < 1000) { // prevent unlimited growth
                vars.push(tokens[i]);
            }

            i++;
        }
    }

    if(type === 'check' && def === '<empty>') def = false;
    if(type !== 'check' && (def === undefined || def === null)) def = '';

    return {
        'name': VAR_TO_CORRECT_TYPE(name),
        'type': VAR_TO_CORRECT_TYPE(type),
        'def': VAR_TO_CORRECT_TYPE(def),
        'min': VAR_TO_CORRECT_TYPE(min),
        'max': VAR_TO_CORRECT_TYPE(max),
        'vars': VAR_TO_CORRECT_TYPE(vars)
    };
}

function PARSE_UCI_RESPONSE(response) {
    const keywords = ['id', 'name', 'author', 'uciok', 'readyok', 
        'bestmove', 'option', 'info', 'score', 'pv', 'mate', 'cp',
        'wdl', 'depth', 'seldepth', 'nodes', 'time', 'nps', 'tbhits',
        'currmove', 'currmovenumber', 'hashfull', 'multipv', 'prob',
        'refutation', 'line', 'stop', 'ponderhit', 'ucs',
        'position', 'startpos', 'moves', 'files', 'ranks',
        'pocket', 'template', 'variant', 'ponder', 'Fen:', 'bmc', 'error'];

    const data = {};
    let currentKeyword = null;
    
    response.split(/\s+/).forEach(token => {
        if(keywords.includes(token) || token.startsWith('info')) {
            if(token.startsWith('info')) {
                return;
            }

            currentKeyword = token;
            data[currentKeyword] = '';

        } else if(currentKeyword !== null) {
            if(!isNaN(token) && !/^[rnbqkpRNBQKP\d]+$/.test(token)) {
                data[currentKeyword] = parseInt(token);
            } else if(data[currentKeyword] !== '') {
                data[currentKeyword] += ' ';
                data[currentKeyword] += token;
            } else {
                data[currentKeyword] += token;
            }
        }
    });
    
    return data;
}

function EXTRACT_VARIANT_NAMES(str) {
    const regex = /var\s+([\w-]+)/g;
    const matches = str.match(regex);

    if(matches) {
        return matches.map(match => match.split(' ')[1]);
    }

    return [];
}

const IS_VARIANT_960 = v => v?.toLowerCase() == 'chess960';

function FORMAT_VARIANT(str) {
    return str
        ?.replaceAll(' ', '')
        ?.replaceAll('-', '')
        ?.toLowerCase();
}

function FORMAT_CHESS_FONT(str) {
    return str
        ?.replaceAll(' ', '')
        ?.toLowerCase();
}

function GET_BOARD_DIMENSION_PERCENTAGES(boardDimensionsObj) {
    const { width, height } = boardDimensionsObj;
    const isSquare = width === height;

    if(isSquare) {
        return { 'width': 100, 'height': 100 };
    }

    const newWidth = width/height * 100;
    const newHeight = height/width * 100;

    return width > height 
        ? { 'width': 100, 'height': newHeight }
        : { 'width': newWidth, 'height': 100 };
}

function GET_BOARD_HEIGHT_FROM_WIDTH(widthPx, boardDimensionsObj) {
    return widthPx * (boardDimensionsObj.height / boardDimensionsObj.width);
}

function GET_PIECE_STYLE_DIMENSIONS(boardDimensionsObj) {
    const width = 100 / boardDimensionsObj.width;
    const height = 100 / boardDimensionsObj.height;

    return { width, height };
}

function GET_BACKGROUND_STYLE_DIMENSION(boardDimensionsObj) {
    return (100 / boardDimensionsObj.width) / (100 / 8) * 100;
}

function START_HEARTBEAT_LOOP(key) {
    if(USERSCRIPT) {
        return setInterval(() => {
            USERSCRIPT.GM_setValue(key, true);
        }, 1);
    } else {
        console.error("USERSCRIPT variable not found, can't start heart beat loop!");
    }
}

function SET_INTERVAL_ASYNC(callback, interval) {
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

function GET_COOKIE(name) {
    const cookies = document.cookie ? document.cookie.split('; ') : [];
    for(let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].split('=');
        if(cookie[0] === name) return decodeURIComponent(cookie.slice(1).join('='));
    }
    return null;
}

async function WAIT_FOR_ELEMENT(selector, maxWaitTime = 10000000) {
    const startTime = Date.now();
    while(Date.now() - startTime < maxWaitTime) {
        const element = document.querySelector(selector);
        if(element) {
            return element;
        }
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms before checking again
    }
    console.warn(`Element ${selector} not found after ${maxWaitTime / 1000} seconds`);
    return null;
}

async function LOAD_FILE_AS_UINT8_ARRAY(url) {
    try {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
    } catch (error) {
        console.error("Error loading file:", error);
        return null;
    }
}

function GET_NICE_PATH(path, limit = 60) {
    if(!path) return path;

    const lastSeparatorIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    let dirPath = lastSeparatorIndex === -1 ? path : path.substring(0, lastSeparatorIndex);

    if(dirPath.length <= limit) {
        return dirPath;
    }

    const truncated = dirPath.slice(-limit);
    const firstSeparatorIndex = truncated.search(/[/\\]/);

    if(firstSeparatorIndex !== -1 && firstSeparatorIndex < limit - 5) {
        return '...' + truncated.substring(firstSeparatorIndex);
    }

    return '...' + truncated;
}

function IS_BELOW_VERSION(versionStr, targetVersion) {
    return versionStr.localeCompare(targetVersion, undefined, {numeric: true}) === -1;
}

function FORMAT_PROFILE_NAME(profileNameStr) {
    return profileNameStr
        .trim()
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/\s+/g, '');
}

function IS_BASE64_PROFILE_NAME(value) {
    return typeof value === 'string'
        && value.length > 0
        && value.length % 4 === 0
        && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function BASE64_ENCODE_UNICODE(value) {
    const utf8 = new TextEncoder().encode(String(value));
    let binary = '';

    for(const byte of utf8) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary);
}

function BASE64_DECODE_UNICODE(value) {
    const binary = atob(value);
    const bytes = new Uint8Array([...binary].map(char => char.charCodeAt(0)));
    return new TextDecoder().decode(bytes);
}

function GET_HUMAN_READABLE_PROFILE_NAME(profileName) {
    if(typeof profileName !== 'string' || !profileName) return profileName;
    if(profileName === 'default') return 'default';
    if(!profileName.startsWith(PROFILE_STORAGE_KEY_PREFIX)) return profileName;

    const encodedValue = profileName.slice(PROFILE_STORAGE_KEY_PREFIX.length);

    if(!IS_BASE64_PROFILE_NAME(encodedValue)) return profileName;

    try {
        const decoded = BASE64_DECODE_UNICODE(encodedValue);

        if(`${PROFILE_STORAGE_KEY_PREFIX}${BASE64_ENCODE_UNICODE(decoded)}` === profileName) {
            return decoded;
        }
    } catch (error) {}

    return profileName;
}

function GET_PROFILE_STORAGE_KEY(profileName) {
    if(profileName === 'default') return 'default';
    const rawName = String(GET_HUMAN_READABLE_PROFILE_NAME(profileName));
    return `${PROFILE_STORAGE_KEY_PREFIX}${BASE64_ENCODE_UNICODE(rawName)}`;
}

async function MIGRATE_OUTDATED_PROFILE_KEYS() {
    const gmConfigKey = USERSCRIPT_SHARED_VARS.gmConfigKey;
    const config = await USERSCRIPT.getValue(gmConfigKey);
    let hasChanges = false;

    async function migrateProfiles(profilesObj) {
        if(!profilesObj) return false;
        let changed = false;

        for(const key of Object.keys(profilesObj)) {
            if(key !== 'default' && !key.startsWith(PROFILE_STORAGE_KEY_PREFIX)) {
                const newKey = GET_PROFILE_STORAGE_KEY(key);
                if(key !== newKey) {
                    profilesObj[newKey] = profilesObj[key];
                    delete profilesObj[key];
                    changed = true;
                }
            }
        }

        return changed;
    }

    if(config?.global?.profiles && await migrateProfiles(config.global.profiles)) hasChanges = true;

    if(config?.instance) {
        for(const inst of Object.values(config.instance)) {
            if(inst?.profiles && await migrateProfiles(inst.profiles)) hasChanges = true;
        }
    }

    if(hasChanges) await USERSCRIPT.setValue(gmConfigKey, config);
    return hasChanges;
}

function INIT_NESTED_OBJECT(obj, keys) {
    keys.reduce((acc, key) => {
        if(!acc[key]) acc[key] = {};
        return acc[key];
    }, obj);
}

function GET_UNIQUE_ID() {
    return ([1e7]+-1e3+4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    )
}