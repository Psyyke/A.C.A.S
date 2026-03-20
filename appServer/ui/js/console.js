const MAX_LOG_LINES = 100000;
const CONSOLE_OBJS = new Map();

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
    if(currentFilter && !text.toLowerCase().includes(currentFilter))
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

    let isPaused = false;
    let commandHistory = [];
    let historyIndex = -1;

    const consoleSection = document.createElement('div');
    consoleSection.className = 'console-section advanced-console';
    consoleSection.innerHTML = `
        <b class="console-engine-name">Console</b>
        <div class="console-header">
            <input type="text" class="logFilter" placeholder="Filter (depth, pv, ...)" />
            <button class="acas-fancy-button clearBtn" title="Clear console">Clear</button>
            <button class="pauseBtn acas-fancy-button">Pause</button>
        </div>
        <div class="log"></div>
        <div class="input-area">
            <span class="prompt">\></span>
            <input class="cmdInput" autofocus placeholder="Enter UCI command..." />
        </div>`;

    const engineNameElem = consoleSection.querySelector('.console-engine-name');
    const engineInfo = savedEngines.find(e => e.engineId === engineId);
    engineNameElem.textContent = `"${engineInfo?.title || 'Unknown'}" (EngineID "${engineId}", Profile "${profileName}", InstanceID "${instanceId}")`;

    const logDiv = consoleSection.querySelector('.log');
    const cmdInput = consoleSection.querySelector('.cmdInput');
    const filterInput = consoleSection.querySelector('.logFilter');
    const pauseBtn = consoleSection.querySelector('.pauseBtn');
    const clearBtn = consoleSection.querySelector('.clearBtn');

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