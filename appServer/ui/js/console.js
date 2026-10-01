// Each line is a div with two spans, so 100000 meant roughly 300k nodes per console,
// per instance, fed by an engine emitting thousands of info lines a second
const MAX_LOG_LINES = 2000;
const CONSOLE_OBJS = new Map();
const LOG_FONT_STORAGE_KEY = 'acas-server-log-font-size';
const DEFAULT_LOG_FONT_SIZE = 14;
const MIN_LOG_FONT_SIZE = 10;
const MAX_LOG_FONT_SIZE = 24;
let logFontSize = DEFAULT_LOG_FONT_SIZE;

try {
    const storedSize = Number(localStorage.getItem(LOG_FONT_STORAGE_KEY));
    if(Number.isFinite(storedSize) && storedSize >= MIN_LOG_FONT_SIZE && storedSize <= MAX_LOG_FONT_SIZE)
        logFontSize = Math.round(storedSize);
} catch { /* Font resizing still works when storage is unavailable. */ }

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
    CONSOLE_OBJS.forEach(({ fontSizeBtn }) => { fontSizeBtn.textContent = `${logFontSize}px`; });
    scrollPositions.forEach(({ logDiv, atBottom, ratio }) => {
        logDiv.scrollTop = atBottom ? logDiv.scrollHeight : ratio * (logDiv.scrollHeight - logDiv.clientHeight);
    });
    try { localStorage.setItem(LOG_FONT_STORAGE_KEY, String(logFontSize)); } catch { /* Optional preference. */ }
}

function createKillEngineButton(identifierObj) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kill-engine-btn acas-fancy-button';
    button.innerHTML = '<i class="bi bi-stop-fill" aria-hidden="true"></i> Kill';
    button.title = `Kill only this process (profile: ${identifierObj.profileName}, instance: ${identifierObj.instanceId}). The web GUI can launch it again on a new analysis.`;
    button.setAttribute('aria-label', `Kill engine for profile ${identifierObj.profileName}, instance ${identifierObj.instanceId}`);
    button.onclick = async event => {
        event.stopPropagation();
        button.disabled = true;
        try {
            const result = await window.engineAPI.killEngine(identifierObj);
            if(typeof result === 'string') toast.error(result, 5000);
            else if(result === false) toast.message('This engine process is no longer running.', 2000);
        } catch(error) {
            console.error('Failed to kill engine:', error);
            toast.error('Could not kill this engine process.', 5000);
        } finally {
            if(button.isConnected) button.disabled = false;
        }
    };
    return button;
}

async function log(text, type = 'info', identifierObj) {
    if(text?.length === 0) return;

    const consoleObj = CONSOLE_OBJS.get(identifierObj.identifierKey);

    if(!consoleObj) return console.error(`Console object not found!`, identifierObj);

    const { logDiv, filterInput, isPaused } = consoleObj;

    if(isPaused()) return;

    const timestamp = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3,
        hour12: false
    });

    const div = document.createElement('div');
    div.classList.add('log-entry', `type-${type}`);
    div.innerHTML = `<span class="timestamp">${timestamp}</span><span class="msg-body"></span>`;
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
    const { engineId, profileName, instanceId, identifierKey } = identifierObj;
    if(CONSOLE_OBJS.has(identifierKey)) return;

    let isPaused = false;
    let commandHistory = [];
    let historyIndex = -1;

    const consoleSection = document.createElement('div');
    consoleSection.className = 'console-section advanced-console';
    consoleSection.innerHTML = `
        <div class="console-title-row">
            <div class="console-title-details">
                <b class="console-engine-name">Console</b>
                <span class="console-engine-context"></span>
            </div>
        </div>
        <div class="console-header">
            <input type="text" class="logFilter" placeholder="Filter (depth, pv, ...)" />
            <button class="acas-fancy-button clearBtn" title="Clear console">Clear</button>
            <button class="pauseBtn acas-fancy-button">Pause</button>
            <button class="fontSizeBtn acas-fancy-button" title="Ctrl + scroll over the log to resize text. Click to reset to 14px." aria-label="Reset log font size to 14 pixels"></button>
        </div>
        <div class="log" title="Ctrl + scroll to resize log text"></div>
        <div class="input-area">
            <span class="prompt">\></span>
            <input class="cmdInput" autofocus placeholder="Enter UCI command..." />
        </div>`;

    const engineNameElem = consoleSection.querySelector('.console-engine-name');
    const engineInfo = savedEngines.find(e => e.engineId === engineId);
    engineNameElem.textContent = engineInfo?.title || engineInfo?.name || 'Unknown engine';
    engineNameElem.title = `Engine ID: ${engineId}`;
    consoleSection.querySelector('.console-engine-context').textContent = `Profile: ${profileName} · Instance: ${instanceId}`;
    consoleSection.querySelector('.console-title-row').appendChild(createKillEngineButton(identifierObj));

    const logDiv = consoleSection.querySelector('.log');
    const cmdInput = consoleSection.querySelector('.cmdInput');
    const filterInput = consoleSection.querySelector('.logFilter');
    const pauseBtn = consoleSection.querySelector('.pauseBtn');
    const clearBtn = consoleSection.querySelector('.clearBtn');
    const fontSizeBtn = consoleSection.querySelector('.fontSizeBtn');
    fontSizeBtn.textContent = `${logFontSize}px`;
    fontSizeBtn.onclick = () => setLogFontSize(DEFAULT_LOG_FONT_SIZE);
    logDiv.addEventListener('wheel', event => {
        if(!event.ctrlKey) return;
        event.preventDefault();
        event.stopPropagation();
        if(event.deltaY !== 0) setLogFontSize(logFontSize + (event.deltaY < 0 ? 1 : -1));
    }, { passive: false });

    pauseBtn.onclick = () => {
        isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
        pauseBtn.classList.toggle('active', isPaused);
    };

    clearBtn.onclick = () => { logDiv.innerHTML = ''; };

    filterInput.addEventListener('input', () => {
        const filterText = filterInput.value.toLowerCase();
        logDiv.querySelectorAll('.log-entry').forEach(entry => {
            entry.style.display = entry.textContent.toLowerCase().includes(filterText) ? 'flex' : 'none';
        });
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
                log('Error: Something went wrong, e.g. engine process was not writable.', 'error', identifierObj);
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

    CONSOLE_OBJS.set(identifierObj.identifierKey, {
        consoleSection,
        logDiv,
        cmdInput,
        filterInput,
        pauseBtn,
        clearBtn,
        fontSizeBtn,
        'isPaused': () => isPaused
    });
}

async function removeConsoleView(identifierObj) {
    const consoleObj = CONSOLE_OBJS.get(identifierObj.identifierKey);

    if(consoleObj) {
        consoleObj.consoleSection.remove();
        CONSOLE_OBJS.delete(identifierObj.identifierKey);
    }
}