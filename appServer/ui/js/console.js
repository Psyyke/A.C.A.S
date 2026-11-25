// Each line is a div with two spans, so 100000 meant roughly 300k nodes per console,
// per instance, fed by an engine emitting thousands of info lines a second
const MAX_LOG_LINES = 2000;
const CONSOLE_OBJS = new Map();
const LOG_FONT_STORAGE_KEY = 'acas-server-log-font-size';
const LOG_WRAP_STORAGE_KEY = 'acas-server-log-wrap-lines';
const LOG_TIME_STORAGE_KEY = 'acas-server-log-compact-time';
const DEFAULT_LOG_FONT_SIZE = 14;
const MIN_LOG_FONT_SIZE = 10;
const MAX_LOG_FONT_SIZE = 24;
const LOG_TIME_MODES = ['full', 'compact', 'seconds', 'none'];
let logFontSize = DEFAULT_LOG_FONT_SIZE;
let wrapLogLines = true;
let logTimeMode = 'full';

try {
    const storedSize = Number(localStorage.getItem(LOG_FONT_STORAGE_KEY));
    if(Number.isFinite(storedSize) && storedSize >= MIN_LOG_FONT_SIZE && storedSize <= MAX_LOG_FONT_SIZE)
        logFontSize = Math.round(storedSize);
} catch { /* Font resizing still works when storage is unavailable. */ }

try {
    const storedWrapMode = localStorage.getItem(LOG_WRAP_STORAGE_KEY);
    if(storedWrapMode === 'false') wrapLogLines = false;
} catch { /* Line wrapping still works when storage is unavailable. */ }

try {
    const storedMode = localStorage.getItem(LOG_TIME_STORAGE_KEY);
    if(storedMode === 'true') logTimeMode = 'compact';
    else if(LOG_TIME_MODES.includes(storedMode)) logTimeMode = storedMode;
} catch { /* Timestamp toggling still works when storage is unavailable. */ }

document.documentElement.style.setProperty('--log-font-size', `${logFontSize}px`);

function setLogFontSize(size) {
    const nextSize = Math.max(MIN_LOG_FONT_SIZE, Math.min(MAX_LOG_FONT_SIZE, size));
    if(nextSize === logFontSize) return;
    const scrollPositions = [...CONSOLE_OBJS.values()].map(({ logDiv }) => ({
        logDiv,
        atBottom: logDiv.scrollHeight - logDiv.clientHeight <= logDiv.scrollTop + 60,
        ratio: logDiv.scrollTop / Math.max(1, logDiv.scrollHeight - logDiv.clientHeight)
    }));

    logFontSize = nextSize;
    document.documentElement.style.setProperty('--log-font-size', `${logFontSize}px`);
    scrollPositions.forEach(({ logDiv, atBottom, ratio }) => {
        logDiv.scrollTop = atBottom ? logDiv.scrollHeight : ratio * (logDiv.scrollHeight - logDiv.clientHeight);
    });
    try { localStorage.setItem(LOG_FONT_STORAGE_KEY, String(logFontSize)); } catch { /* Optional preference. */ }
}

function setLogWrapMode(wrapLines) {
    if(wrapLogLines === wrapLines) return;
    const scrollPositions = [...CONSOLE_OBJS.values()].map(({ logDiv }) => ({
        logDiv,
        atBottom: logDiv.scrollHeight - logDiv.clientHeight <= logDiv.scrollTop + 60,
        ratio: logDiv.scrollTop / Math.max(1, logDiv.scrollHeight - logDiv.clientHeight)
    }));
    wrapLogLines = wrapLines;
    CONSOLE_OBJS.forEach(({ logDiv, wrapBtn }) => {
        updateLogWrapControl(logDiv, wrapBtn);
    });
    scrollPositions.forEach(({ logDiv, atBottom, ratio }) => {
        logDiv.scrollTop = atBottom ? logDiv.scrollHeight : ratio * (logDiv.scrollHeight - logDiv.clientHeight);
    });
    try { localStorage.setItem(LOG_WRAP_STORAGE_KEY, String(wrapLogLines)); } catch { /* Optional preference. */ }
}

function updateLogWrapControl(logDiv, wrapBtn) {
    logDiv.classList.toggle('no-wrap', !wrapLogLines);
    wrapBtn.setAttribute('aria-pressed', String(!wrapLogLines));
    wrapBtn.setAttribute('aria-label', window.serverI18n.text(wrapLogLines ? 'wrapOff' : 'wrapOn'));
    wrapBtn.title = window.serverI18n.text(wrapLogLines ? 'wrappingOn' : 'horizontalOn');
    wrapBtn.querySelector('i').className = `bi ${wrapLogLines ? 'bi-arrow-return-left' : 'bi-arrow-right-short'}`;
}

function formatLogTimestamp(timestamp, mode = logTimeMode) {
    const date = new Date(timestamp);
    if(mode === 'none') return '';
    if(mode === 'seconds') return String(date.getSeconds()).padStart(2, '0');
    if(mode === 'compact') {
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${seconds}.${String(date.getMilliseconds()).padStart(3, '0')}`;
    }
    return date.toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        fractionalSecondDigits: 3, hour12: false
    });
}

function filterConsoleEntries(logDiv, filterInput) {
    const filterText = filterInput.value.toLowerCase();
    logDiv.querySelectorAll('.log-entry').forEach(entry => {
        entry.style.display = entry.textContent.toLowerCase().includes(filterText) ? 'flex' : 'none';
    });
}

function updateLogTimeControl(logDiv, timeBtn) {
    logDiv.dataset.timeMode = logTimeMode;
    timeBtn.dataset.timeMode = logTimeMode;
    const labels = {
        full: 'timeFull', compact: 'timeCompact', seconds: 'timeSeconds', none: 'timeNone'
    };
    const nextMode = LOG_TIME_MODES[(LOG_TIME_MODES.indexOf(logTimeMode) + 1) % LOG_TIME_MODES.length];
    const label = window.serverI18n.text('timeLabel', {
        current: window.serverI18n.text(labels[logTimeMode]),
        next: window.serverI18n.text(labels[nextMode]).toLowerCase()
    });
    timeBtn.setAttribute('aria-label', label);
    timeBtn.title = label;
}

function setLogTimeMode(mode) {
    if(!LOG_TIME_MODES.includes(mode)) throw new Error(`Unknown timestamp mode: ${mode}`);
    if(logTimeMode === mode) return;
    logTimeMode = mode;
    CONSOLE_OBJS.forEach(({ logDiv, filterInput, timeBtn }) => {
        const atBottom = logDiv.scrollHeight - logDiv.clientHeight <= logDiv.scrollTop + 60;
        const ratio = logDiv.scrollTop / Math.max(1, logDiv.scrollHeight - logDiv.clientHeight);
        updateLogTimeControl(logDiv, timeBtn);
        logDiv.querySelectorAll('.timestamp').forEach(time => {
            time.textContent = formatLogTimestamp(Number(time.dataset.timestamp));
        });
        filterConsoleEntries(logDiv, filterInput);
        logDiv.scrollTop = atBottom ? logDiv.scrollHeight : ratio * (logDiv.scrollHeight - logDiv.clientHeight);
    });
    try { localStorage.setItem(LOG_TIME_STORAGE_KEY, logTimeMode); } catch { /* Optional preference. */ }
}

function getEngineDisplayContext(identifierObj) {
    const engine = savedEngines.find(engine => engine.engineId === identifierObj.engineId);
    const name = engine?.title || engine?.name || window.serverI18n.text('unknownEngine');
    const site = identifierObj.siteDomain || window.serverI18n.text('unknownSite');
    const profile = identifierObj.profileName;
    const context = `${site} · ${profile}`;
    return { name, site, profile, context, label: `${name} · ${context}` };
}

function createKillEngineButton(identifierObj) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kill-engine-btn acas-fancy-button';
    button.innerHTML = '<i class="bi bi-stop-fill" aria-hidden="true"></i> <span></span>';
    updateKillEngineButton(button, identifierObj);
    button.onclick = async event => {
        event.stopPropagation();
        const { label } = getEngineDisplayContext(identifierObj);
        button.disabled = true;
        try {
            const result = await window.engineAPI.killEngine(identifierObj);
            if(typeof result === 'string') toast.error(`${label}: ${result}`, 5000);
            else if(result === false) toast.message(window.serverI18n.text('noLongerRunning', { label }), 2000);
        } catch(error) {
            console.error('Failed to kill engine:', error);
            toast.error(window.serverI18n.text('killError', { label }), 5000);
        } finally {
            if(button.isConnected) button.disabled = false;
        }
    };
    return button;
}

function updateKillEngineButton(button, identifierObj) {
    const { label } = getEngineDisplayContext(identifierObj);
    button.querySelector('span').textContent = window.serverI18n.text('kill');
    button.title = window.serverI18n.text('killHint', { label });
    button.setAttribute('aria-label', window.serverI18n.text('killLabel', { label }));
}

async function log(text, type = 'info', identifierObj) {
    if(text?.length === 0) return;

    const consoleObj = CONSOLE_OBJS.get(identifierObj.identifierKey);

    if(!consoleObj) return console.error(`Console object not found!`, identifierObj);

    const { logDiv, filterInput, isPaused } = consoleObj;

    if(isPaused()) return;

    const timestamp = Date.now();

    const div = document.createElement('div');
    div.classList.add('log-entry', `type-${type}`);
    div.innerHTML = '<span class="timestamp"></span><span class="msg-body"></span>';
    const time = div.querySelector('.timestamp');
    time.dataset.timestamp = String(timestamp);
    time.textContent = formatLogTimestamp(timestamp);
    time.title = formatLogTimestamp(timestamp, 'full');
    div.querySelector('.msg-body').textContent = text;

    const currentFilter = filterInput.value.toLowerCase();
    if(currentFilter && !div.textContent.toLowerCase().includes(currentFilter))
        div.style.display = 'none';

    const shouldScroll = logDiv.scrollHeight - logDiv.clientHeight <= logDiv.scrollTop + 60;

    logDiv.appendChild(div);

    if(logDiv.childNodes.length > MAX_LOG_LINES) {
        logDiv.removeChild(logDiv.firstChild);
    }

    if(shouldScroll) {
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}

function addConsoleView(identifierObj) {
    const { identifierKey } = identifierObj;
    if(CONSOLE_OBJS.has(identifierKey)) return;

    let isPaused = false;
    let commandHistory = [];
    let historyIndex = -1;

    const consoleSection = document.createElement('div');
    consoleSection.className = 'console-section advanced-console';
    consoleSection.innerHTML = `
        <div class="console-header">
            <div class="console-title-details">
                <b class="console-engine-name">Console</b>
                <span class="console-engine-context"><span class="console-engine-site"></span><span class="console-engine-separator"> · </span><span class="console-engine-profile"></span></span>
            </div>
            <input type="text" class="logFilter" placeholder="Filter (depth, pv, ...)" />
            <button class="acas-fancy-button clearBtn" type="button">
                <i class="bi bi-trash3" aria-hidden="true"></i>
            </button>
            <button class="pauseBtn acas-fancy-button" type="button" aria-pressed="false">
                <i class="bi bi-pause-fill" aria-hidden="true"></i>
            </button>
            <button class="timeBtn acas-fancy-button" type="button">
                <i class="bi bi-clock" aria-hidden="true"></i>
            </button>
            <button class="wrapBtn acas-fancy-button" type="button" aria-pressed="false">
                <i class="bi bi-arrow-return-left" aria-hidden="true"></i>
            </button>
        </div>
        <div class="log" title="Ctrl + scroll to resize log text"></div>
        <div class="input-area">
            <span class="prompt">\></span>
            <input class="cmdInput" autofocus placeholder="Enter UCI command..." />
        </div>`;

    consoleSection.querySelector('.console-header').appendChild(createKillEngineButton(identifierObj));

    const logDiv = consoleSection.querySelector('.log');
    const cmdInput = consoleSection.querySelector('.cmdInput');
    const filterInput = consoleSection.querySelector('.logFilter');
    const pauseBtn = consoleSection.querySelector('.pauseBtn');
    const clearBtn = consoleSection.querySelector('.clearBtn');
    const timeBtn = consoleSection.querySelector('.timeBtn');
    timeBtn.onclick = () => setLogTimeMode(LOG_TIME_MODES[(LOG_TIME_MODES.indexOf(logTimeMode) + 1) % LOG_TIME_MODES.length]);
    updateLogTimeControl(logDiv, timeBtn);
    const wrapBtn = consoleSection.querySelector('.wrapBtn');
    wrapBtn.onclick = () => setLogWrapMode(!wrapLogLines);
    updateLogWrapControl(logDiv, wrapBtn);
    logDiv.addEventListener('wheel', event => {
        if(!event.ctrlKey) return;
        event.preventDefault();
        event.stopPropagation();
        if(event.deltaY !== 0) setLogFontSize(logFontSize + (event.deltaY < 0 ? 1 : -1));
    }, { passive: false });

    pauseBtn.onclick = () => {
        isPaused = !isPaused;
        updatePauseControl(pauseBtn, isPaused);
    };

    clearBtn.onclick = () => { logDiv.innerHTML = ''; };

    filterInput.addEventListener('input', () => {
        filterConsoleEntries(logDiv, filterInput);
    });

    cmdInput.addEventListener('keydown', async function(e) {
        if(e.key === 'Enter') {
            const cmd = this.value.trim();
            if(!cmd) return;

            const successfullySent = await window.engineAPI.sendManualUciToEngine(cmd, identifierObj);

            if(successfullySent) {
                log(cmd, 'user', identifierObj);
                commandHistory.unshift(cmd);
                if(commandHistory.length > 50) commandHistory.pop();
            } else {
                log(window.serverI18n.text('commandError'), 'error', identifierObj);
            }

            this.value = '';
            historyIndex = -1;
        }
        else if(e.key === 'ArrowUp') {
            if(historyIndex < commandHistory.length - 1) {
                historyIndex++;
                this.value = commandHistory[historyIndex];
            }
        } else if(e.key === 'ArrowDown') {
            if(historyIndex > 0) {
                historyIndex--;
                this.value = commandHistory[historyIndex];
            } else {
                historyIndex = -1;
                this.value = '';
            }
        }
    });

    consolesContainer.prepend(consoleSection);
    consoleTitleObserver.observe(consoleSection.querySelector('.console-header'));

    CONSOLE_OBJS.set(identifierObj.identifierKey, {
        consoleSection,
        logDiv,
        cmdInput,
        filterInput,
        pauseBtn,
        clearBtn,
        timeBtn,
        wrapBtn,
        identifierObj,
        'isPaused': () => isPaused
    });
    updateConsoleLanguage(CONSOLE_OBJS.get(identifierKey));
}

function updateConsoleLanguage(consoleObj) {
    const { consoleSection, logDiv, cmdInput, filterInput, pauseBtn, clearBtn, timeBtn, wrapBtn, identifierObj, isPaused } = consoleObj;
    const t = window.serverI18n.text;
    filterInput.placeholder = t('filter');
    cmdInput.placeholder = t('uciCommand');
    clearBtn.title = t('clear');
    clearBtn.setAttribute('aria-label', t('clear'));
    updatePauseControl(pauseBtn, isPaused());
    logDiv.title = t('resizeLogs');
    updateLogTimeControl(logDiv, timeBtn);
    updateLogWrapControl(logDiv, wrapBtn);
    const { name, site, profile, label } = getEngineDisplayContext(identifierObj);
    const details = consoleSection.querySelector('.console-title-details');
    details.title = label;
    details.querySelector('.console-engine-name').textContent = name;
    details.querySelector('.console-engine-site').textContent = site;
    details.querySelector('.console-engine-profile').textContent = profile;
    updateKillEngineButton(consoleSection.querySelector('.kill-engine-btn'), identifierObj);
    fitConsoleTitle(consoleSection);
}

function updatePauseControl(pauseBtn, isPaused) {
    const label = window.serverI18n.text(isPaused ? 'resume' : 'pause');
    pauseBtn.title = label;
    pauseBtn.setAttribute('aria-label', label);
    pauseBtn.setAttribute('aria-pressed', String(isPaused));
    pauseBtn.classList.toggle('active', isPaused);
    pauseBtn.querySelector('i').className = `bi ${isPaused ? 'bi-play-fill' : 'bi-pause-fill'}`;
}

// Keeps the console header on one line by dropping the site, then the whole context, then the name.
const CONSOLE_TITLE_FIT_STEPS = ['', 'hide-site', 'hide-context', 'hide-name'];

function fitConsoleTitle(consoleSection) {
    const header = consoleSection.querySelector('.console-header');
    const details = header?.querySelector('.console-title-details');
    if(!details) return;
    for(const step of CONSOLE_TITLE_FIT_STEPS) {
        details.classList.remove(...CONSOLE_TITLE_FIT_STEPS.filter(Boolean));
        if(step) details.classList.add(...CONSOLE_TITLE_FIT_STEPS.slice(1, CONSOLE_TITLE_FIT_STEPS.indexOf(step) + 1));
        if(header.scrollWidth <= header.clientWidth) return;
    }
}

const consoleTitleObserver = new ResizeObserver(entries => entries.forEach(entry => fitConsoleTitle(entry.target.closest('.console-section'))));

document.addEventListener('server-language-changed', () => CONSOLE_OBJS.forEach(updateConsoleLanguage));

async function removeConsoleView(identifierObj) {
    const consoleObj = CONSOLE_OBJS.get(identifierObj.identifierKey);

    if(consoleObj) {
        consoleTitleObserver.unobserve(consoleObj.consoleSection.querySelector('.console-header'));
        consoleObj.consoleSection.remove();
        CONSOLE_OBJS.delete(identifierObj.identifierKey);
    }
}