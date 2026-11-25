let savedEngines = [];
let runningEngines = [];
let serverConnectionStatus = false;
let portUpdatePending = false;
let portRestarting = false;
let serverStatus = 'offline';
let portAvailable = false;
let portLoadId = 0;
const t = window.serverI18n.text;
const textSizeSelect = document.getElementById('server-text-size');
const serverConnectionInfo = document.getElementById('serverConnectionInfo');
const textSizeStorageKey = 'acas-server-text-size';

// Size the subtitle so it spans exactly the "A.C.A.S" wordmark, whatever the language or text size.
function fitLogoSubtitle() {
    const main = document.getElementById('acas-logo-main');
    const subtitle = document.getElementById('acas-logo-secondary');
    const wordmark = main?.firstChild;
    if(!subtitle || wordmark?.nodeType !== Node.TEXT_NODE) return;
    subtitle.style.fontSize = '';
    // Measures painted ink, because Whisper swashes overhang their layout box.
    const context = (fitLogoSubtitle.canvas ||= document.createElement('canvas')).getContext('2d');
    const measure = node => {
        const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        const style = getComputedStyle(element);
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        context.fontStretch = style.fontStretch === '200%' ? 'ultra-expanded' : 'normal';
        context.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
        const metrics = context.measureText(node.textContent.trim());
        return metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
    };
    const target = measure(wordmark);
    const current = measure(subtitle);
    if(!target || !current) return;
    // Clamped so very short or very long translations stay readable.
    const ratio = Math.min(1.6, Math.max(0.55, target / current));
    subtitle.style.fontSize = `${parseFloat(getComputedStyle(subtitle).fontSize) * ratio}px`;
}
document.fonts?.addEventListener('loadingdone', fitLogoSubtitle);
document.fonts?.ready.then(fitLogoSubtitle);
document.addEventListener('server-language-changed', fitLogoSubtitle);

function setServerTextSize(size, persist = true) {
    if(!Number.isInteger(size) || size < 80 || size > 150 || size % 10 !== 0)
        throw new RangeError('Invalid server text size.');
    const positions = [...CONSOLE_OBJS.values()].map(({ logDiv }) => ({
        logDiv,
        atBottom: logDiv.scrollHeight - logDiv.clientHeight <= logDiv.scrollTop + 60,
        ratio: logDiv.scrollTop / Math.max(1, logDiv.scrollHeight - logDiv.clientHeight)
    }));
    document.documentElement.style.setProperty('--server-font-scale', String(size / 100));
    textSizeSelect.value = String(size);
    fitLogoSubtitle();
    positions.forEach(({ logDiv, atBottom, ratio }) => {
        logDiv.scrollTop = atBottom ? logDiv.scrollHeight : ratio * (logDiv.scrollHeight - logDiv.clientHeight);
    });
    if(persist) {
        try { localStorage.setItem(textSizeStorageKey, String(size)); }
        catch(error) { console.warn('Could not save server text size:', error); }
    }
}

try {
    const saved = localStorage.getItem(textSizeStorageKey);
    const size = Number(saved);
    if(saved !== null && Number.isInteger(size) && size >= 80 && size <= 150 && size % 10 === 0)
        setServerTextSize(size, false);
} catch(error) { console.warn('Could not read server text size:', error); }
textSizeSelect.addEventListener('change', () => setServerTextSize(Number(textSizeSelect.value)));

const portRestartDelay = 5;
let savedPort = null;
let portCountdown = null;

const setPortSettingsBusy = busy => {
    portUpdatePending = busy;
    serverPortInput.disabled = busy || portRestarting || !portAvailable;
    portSettingsCancel.disabled = busy;
    portSettingsBtn.disabled = busy;
};

function cancelPortCountdown() {
    if(!portCountdown) return;
    clearInterval(portCountdown.interval);
    portCountdown.toast.close();
    portCountdown = null;
}

function startPortCountdown(port) {
    const reusable = portCountdown?.toast.isOpen() ? portCountdown.toast : null;
    if(portCountdown) clearInterval(portCountdown.interval);
    portCountdown = null;
    let seconds = portRestartDelay;
    const text = t('portCountdown', { port, seconds });
    if(reusable) {
        reusable.setContent(text);
        reusable.resetTimer();
    }
    const countdown = {
        port,
        toast: reusable || toast.message(text, portRestartDelay * 1000)
    };
    countdown.interval = setInterval(() => {
        if(portCountdown !== countdown) return clearInterval(countdown.interval);
        // Closing the toast cancels the pending restart.
        if(!countdown.toast.isOpen()) {
            clearInterval(countdown.interval);
            portCountdown = null;
            return;
        }
        seconds--;
        if(seconds > 0) return countdown.toast.setContent(t('portCountdown', { port, seconds }));
        cancelPortCountdown();
        applyPort(port);
    }, 1000);
    portCountdown = countdown;
}

serverPortInput.addEventListener('input', () => {
    const port = Number(serverPortInput.value);
    if(!portAvailable || portUpdatePending || !serverPortInput.checkValidity() ||
        !Number.isInteger(port) || port === savedPort) return cancelPortCountdown();
    startPortCountdown(port);
});

portSettingsBtn.addEventListener('click', async () => {
    if(portSettingsDialog.open || portUpdatePending) return;
    portSettingsDialog.showModal();
    if(portCountdown) return;
    portAvailable = false;
    setPortSettingsBusy(false);
    const loadId = ++portLoadId;
    try {
        const port = await window.serverAPI.getPort();
        if(loadId !== portLoadId || !portSettingsDialog.open) return;
        savedPort = port;
        serverPortInput.value = String(port);
        portAvailable = true;
        setPortSettingsBusy(false);
    } catch(error) {
        if(loadId !== portLoadId || !portSettingsDialog.open) return;
        console.error('Failed to load server port:', error);
        toast.error(t('portLoadError'), 5000);
    }
});
portSettingsCancel.addEventListener('click', () => portSettingsDialog.close('cancel'));
portSettingsDialog.addEventListener('close', () => { portLoadId++; });
portSettingsDialog.addEventListener('click', event => {
    if(event.target !== portSettingsDialog || portUpdatePending) return;
    const bounds = portSettingsDialog.getBoundingClientRect();
    if(event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) portSettingsDialog.close();
});
portSettingsDialog.addEventListener('cancel', event => {
    if(portUpdatePending) event.preventDefault();
});
// Enter applies the typed port right away instead of waiting for the countdown.
portSettingsForm.addEventListener('submit', event => {
    event.preventDefault();

    if(portUpdatePending || !portAvailable || !portSettingsForm.reportValidity()) return;

    const port = Number(serverPortInput.value);

    if(!Number.isInteger(port) || port < 1 || port > 65535) {
        toast.error(t('portInvalid'), 5000);
        return;
    }
    cancelPortCountdown();
    applyPort(port);
});

async function applyPort(port) {
    if(portUpdatePending || portRestarting) return;
    let restarting = false;

    setPortSettingsBusy(true);

    try {
        const result = await window.serverAPI.setPort(port);

        if(typeof result === 'string') {
            toast.error(result, 5000);
            return;
        }
        if(result === false) {
            savedPort = port;
            toast.message(t('portUnchanged'), 2000);
        }
        if(result === true) {
            restarting = true;
            portRestarting = true;
            if(portSettingsDialog.open) portSettingsDialog.close('save');
            toast.message(t('portRestarting', { port }), 5000);
        }
    } catch(error) {
        console.error('Failed to update server port:', error);
        toast.error(t('portUpdateError'), 5000);
    } finally {
        if(!restarting) setPortSettingsBusy(false);
    }
}

function updateAlwaysOnTopButton(enabled) {
    alwaysOnTopToggle.setAttribute('aria-pressed', String(enabled));
    const label = t(enabled ? 'unpinWindow' : 'pinWindow');
    alwaysOnTopToggle.title = label;
    alwaysOnTopToggle.setAttribute('aria-label', label);
    alwaysOnTopToggle.querySelector('i').className = `bi ${enabled ? 'bi-pin-angle-fill' : 'bi-pin-angle'}`;
}

const alwaysOnTopStorageKey = 'acas-server-always-on-top';

(async () => {
    try {
        let pinned = await window.electronAPI.getAlwaysOnTop();
        let savedPin = null;
        try { savedPin = localStorage.getItem(alwaysOnTopStorageKey); } catch {}
        if(savedPin !== null && (savedPin === '1') !== pinned)
            pinned = await window.electronAPI.setAlwaysOnTop(savedPin === '1');
        updateAlwaysOnTopButton(pinned);
        alwaysOnTopToggle.disabled = false;
    } catch(error) {
        console.error('Failed to load always-on-top state:', error);
        toast.error(t('pinLoadError'), 5000);
    }
})();

alwaysOnTopToggle.addEventListener('click', async () => {
    alwaysOnTopToggle.disabled = true;
    try {
        const enabled = alwaysOnTopToggle.getAttribute('aria-pressed') !== 'true';
        const pinned = await window.electronAPI.setAlwaysOnTop(enabled);
        updateAlwaysOnTopButton(pinned);
        saveLayoutFlag(alwaysOnTopStorageKey, pinned);
    } catch(error) {
        console.error('Failed to change always-on-top state:', error);
        toast.error(t('pinUpdateError'), 5000);
    } finally {
        alwaysOnTopToggle.disabled = false;
    }
});

const layoutStorageKeys = { logOnly: 'acas-server-logs-only', collapsed: 'acas-server-panels-collapsed' };

function saveLayoutFlag(key, enabled) {
    try { localStorage.setItem(key, enabled ? '1' : '0'); }
    catch(error) { console.warn('Could not save layout preference:', error); }
}

function setLogOnlyMode(logOnly, save = true) {
    document.body.classList.toggle('logs-only', logOnly);
    logOnlyToggle.setAttribute('aria-pressed', String(logOnly));
    const label = t(logOnly ? 'showControls' : 'showLogs');
    logOnlyToggle.title = label;
    logOnlyToggle.setAttribute('aria-label', label);
    logOnlyToggle.querySelector('i').className = `bi ${logOnly ? 'bi-sliders' : 'bi-eye-slash-fill'}`;
    if(save) saveLayoutFlag(layoutStorageKeys.logOnly, logOnly);
}

function setPanelsCollapsed(collapsed, save = true) {
    document.body.classList.toggle('panels-collapsed', collapsed);
    panelsToggle.setAttribute('aria-expanded', String(!collapsed));
    panelsToggle.setAttribute('aria-label', t(collapsed ? 'showPanels' : 'collapsePanels'));
    panelsToggle.title = t(collapsed ? 'showPanels' : 'collapsePanels');
    panelsToggle.querySelector('i').className = `bi bi-chevron-${collapsed ? 'down' : 'up'}`;
    if(save) saveLayoutFlag(layoutStorageKeys.collapsed, collapsed);
}

logOnlyToggle.addEventListener('click', () => setLogOnlyMode(!document.body.classList.contains('logs-only')));
panelsToggle.addEventListener('click', () => setPanelsCollapsed(panelsToggle.getAttribute('aria-expanded') === 'true'));

try {
    if(localStorage.getItem(layoutStorageKeys.logOnly) === '1') setLogOnlyMode(true, false);
    if(localStorage.getItem(layoutStorageKeys.collapsed) === '1') setPanelsCollapsed(true, false);
} catch(error) {
    console.warn('Could not restore layout preferences:', error);
}

(async () => {
    try {
        await renderEngineGrid(await window.engineAPI.getSavedEngines());
    } catch(error) {
        console.error('Failed to load engine library:', error);
    }
})();

(async () => {
    try {
        const version = await window.electronAPI.getVersion();
        serverVersionTagElem.textContent = `v${version}`;
        document.title = `Advanced Chess Assistance Server v${version}`;
    } catch(error) {
        console.error('Failed to load server version:', error);
    }
})();

document.querySelectorAll('a.external')
    .forEach(a => {
        a.addEventListener('click', e=>{
            e.preventDefault();
            window.electronAPI.openExternal(a.href);
        });
    });

if(engineUiGrid) {
    engineUiGrid.addEventListener('wheel', (evt) => {
        if(evt.ctrlKey || evt.deltaX !== 0 || evt.target.closest('.engine-process-list')) return;

        evt.preventDefault();
        engineUiGrid.scrollLeft += evt.deltaY;
    }, { passive: false });
}

stopBtn.onclick = () => window.engineAPI.killAllEngines();
clearBtn.onclick = () => {
    window.engineAPI.clearCache();
    toast.success(t('cacheCleared'), 1000);
};
addEngineBtn.onclick = async () => {
    const filePath = await window.fileAPI.pickFile(t('addEngine'), t('itemFiles'));

    if(!filePath) return;

    const fileInfo = {
        name: filePath.split(/[/\\]/).pop(),
        path: filePath
    };

    const title = await AcasPrompt.prompt(t('enterEngineName'), fileInfo.name) || fileInfo.name;

    try {
        const result = await window.engineAPI.addEngine(fileInfo, title);

        if (result === true) toast.success(t('engineAdded', { name: fileInfo.name }), 5000);
        else if (typeof result === 'string') toast.error(result, 5000);
    } catch (err) {
        console.error('Failed to add engine:', err);
    }
};

const engineDropOverlay = document.getElementById('engine-drop-overlay');
let engineDropBusy = false;
const isFileDrag = event => Array.from(event.dataTransfer?.types || []).includes('Files');

document.addEventListener('dragover', event => {
    if(!isFileDrag(event)) return;
    event.preventDefault();
    const available = !engineDropBusy && !document.querySelector('dialog[open]');
    event.dataTransfer.dropEffect = available ? 'copy' : 'none';
    engineDropOverlay.hidden = !available;
});
document.addEventListener('dragleave', event => {
    if(!event.relatedTarget) engineDropOverlay.hidden = true;
});
document.addEventListener('drop', async event => {
    if(!isFileDrag(event)) return;
    event.preventDefault();
    engineDropOverlay.hidden = true;
    if(engineDropBusy || document.querySelector('dialog[open]')) return;

    const paths = [];
    for(const file of event.dataTransfer.files) {
        try {
            const filePath = window.fileAPI.getPathForFile(file);
            if(filePath) paths.push(filePath);
            else toast.error(t('dropPathError', { name: file.name }), 7000);
        } catch(error) {
            console.error('Could not read dropped file path:', error);
            toast.error(t('dropPathError', { name: file.name }), 7000);
        }
    }
    if(!paths.length) return;

    engineDropBusy = true;
    try {
        const confirmed = await AcasPrompt.confirm(
            `${t('dropConfirm')}\n\n${paths.join('\n')}`, t('addEngine'));
        if(!confirmed) return;
        for(const filePath of paths) {
            const name = filePath.split(/[/\\]/).pop();
            const progress = toast.message(t('dropChecking', { name }), 16000);
            try {
                const result = await window.engineAPI.addDroppedEngine(filePath);
                if(result === true) toast.success(t('engineAdded', { name }), 5000);
                else toast.error(`${t('dropFailed', { name })} ${result}`, 10000);
            } catch(error) {
                console.error('Failed to check dropped engine:', error);
                toast.error(t('dropFailed', { name }), 10000);
            } finally {
                progress.close();
            }
        }
    } finally {
        engineDropBusy = false;
    }
});

function refreshEngineCards(aliveEngineProcesses) {
    runningEngines = aliveEngineProcesses;
    engineSummary.textContent = t('engineRunning', { count: runningEngines.length });
    engineUiGrid.querySelectorAll('.engine-card').forEach(card => {
        const processes = runningEngines.filter(engine => String(engine.identifierObj.engineId) === card.dataset.engineId);
        card.classList.toggle('active', processes.length > 0);
        const status = processes.length ? t('engineRunning', { count: processes.length }) : t('idle');
        card.querySelector('.engine-status').textContent = status;
        card.setAttribute('aria-label', t('engineCardLabel', { name: card.querySelector('.engine-card-title').textContent, status }));

        const processList = card.querySelector('.engine-process-list');
        processList.replaceChildren();
        processes.forEach(({ identifierObj }) => {
            const row = document.createElement('div');
            row.className = 'engine-process-row';
            const context = document.createElement('span');
            context.className = 'engine-process-context';
            const display = getEngineDisplayContext(identifierObj);
            context.textContent = display.context;
            context.title = display.label;
            row.append(context, createKillEngineButton(identifierObj));
            processList.appendChild(row);
        });
    });
}

async function renderEngineGrid(engines) {
    // This parameter used to be called savedEngines and shadowed the module-level list,
    // so the IPC refresh never reached it and console.js kept reading a stale (often
    // empty) array, showing every engine as "Unknown" until restart.
    savedEngines = engines;

    const existingCards = Array.from(engineUiGrid.querySelectorAll('.engine-card'));
    const enginePaths = savedEngines.map(e => e.path);

    existingCards.forEach(card => {
        if(!enginePaths.includes(card.dataset.enginePath)) card.remove();
    });

    savedEngines.forEach(engine => {
        const existingCard = [...engineUiGrid.querySelectorAll('.engine-card')]
            .find(card => card.dataset.enginePath === engine.path);
        if(existingCard) {
            const title = existingCard.querySelector('.engine-card-title');
            title.textContent = engine.title || engine.name;
            title.title = title.textContent;
            existingCard.querySelector('.edit-btn').title = t('changeDisplayName');
            existingCard.querySelector('.edit-btn').setAttribute('aria-label', t('renameEngine', { name: title.textContent }));
            existingCard.querySelector('.remove-btn').title = t('removeEngineHint');
            existingCard.querySelector('.remove-btn').setAttribute('aria-label', t('removeEngineLabel', { name: title.textContent }));
            return;
        }

        const card = document.createElement('div');
        card.className = 'card engine-card';
        card.dataset.engineId = engine.engineId;
        card.dataset.enginePath = engine.path;
        card.tabIndex = 0;
        card.setAttribute('role', 'group');
        const showUsage = () => toast.message(t('engineUsage'), 4000);
        card.addEventListener('click', event => {
            if(!event.target.closest('button')) showUsage();
        });
        card.addEventListener('keydown', event => {
            if(event.target === card && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                showUsage();
            }
        });

        const engineIcon = document.createElement('i');
        engineIcon.className = 'bi bi-cpu engine-card-icon';
        engineIcon.setAttribute('aria-hidden', 'true');
        const status = document.createElement('span');
        status.className = 'engine-status';
        status.textContent = t('idle');
        status.setAttribute('aria-live', 'polite');

        const top = document.createElement('div');
        top.className = 'top';

        const title = document.createElement('div');
        title.classList.add('engine-card-title');
        title.textContent = engine.title || engine.name;
        title.title = title.textContent;

        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn acas-fancy-button';
        editBtn.type = 'button';
        editBtn.title = t('changeDisplayName');
        editBtn.setAttribute('aria-label', t('renameEngine', { name: engine.title || engine.name }));
        editBtn.onclick = async (e) => {
            const currentEngine = savedEngines.find(saved => saved.path === engine.path);

            e.stopPropagation();

            if(!currentEngine) return;

            editBtn.disabled = true;

            try {
                const newTitle = await AcasPrompt.prompt(
                    t('changeEngineName'), currentEngine.title || currentEngine.name,
                    { showCancel: true }
                );

                if(newTitle === null) return;

                const result = await window.engineAPI.renameEngine(engine.path, newTitle);

                if(typeof result === 'string') toast.error(result, 5000);
                else toast.success(t('engineRenamed'), 2000);
            } catch(error) {
                console.error('Failed to rename engine:', error);
                toast.error(t('engineRenameError'), 5000);
            } finally {
                if(editBtn.isConnected) editBtn.disabled = false;
            }
        };

        const editIcon = document.createElement('i');

        editIcon.className = 'bi bi-pencil';
        editIcon.setAttribute('aria-hidden', 'true');
        editBtn.appendChild(editIcon);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn acas-fancy-button';
        removeBtn.type = 'button';
        removeBtn.title = t('removeEngineHint');
        removeBtn.setAttribute('aria-label', t('removeEngineLabel', { name: engine.title || engine.name }));
        removeBtn.onclick = async (e) => {
            const currentEngine = savedEngines.find(saved => saved.path === engine.path);

            e.stopPropagation();

            if(!currentEngine) return;

            removeBtn.disabled = true;

            try {
                const confirmed = await AcasPrompt.confirm(
                    t('removeEngineConfirm', { name: currentEngine.title || currentEngine.name }),
                    t('remove')
                );

                if(!confirmed) return;

                const result = await window.engineAPI.removeEngine(engine.path);

                if(typeof result === 'string') toast.error(result, 5000);
            } catch(error) {
                console.error('Failed to remove engine:', error);
                toast.error(t('engineRemoveError'), 5000);
            } finally {
                if(removeBtn.isConnected) removeBtn.disabled = false;
            }
        };

        const icon = document.createElement('i');
        icon.className = 'bi bi-trash3';
        icon.setAttribute('aria-hidden', 'true');
        removeBtn.appendChild(icon);

        const actions = document.createElement('div');
        actions.className = 'engine-card-actions';
        actions.append(editBtn, removeBtn);
        top.append(engineIcon, title, actions);

        const bottom = document.createElement('div');
        bottom.className = 'bottom';

        const filename = document.createElement('div');
        filename.className = 'engine-filename';
        filename.textContent = engine.name;
        filename.title = engine.path;

        const path = document.createElement('p');
        path.className = 'engine-path';
        path.textContent = GET_NICE_PATH(engine.path);
        path.title = engine.path;
        bottom.append(filename, path);

        const processList = document.createElement('div');
        processList.className = 'engine-process-list';

        card.appendChild(top);
        card.appendChild(bottom);
        card.appendChild(processList);
        card.appendChild(status);

        engineUiGrid.appendChild(card);
    });

    engineUiGrid.querySelector('.engine-empty-state')?.remove();
    if(!savedEngines.length) {
        const emptyState = document.createElement('div');
        emptyState.className = 'engine-empty-state';
        emptyState.innerHTML = '<i class="bi bi-cpu" aria-hidden="true"></i><b></b><span></span>';
        emptyState.querySelector('b').textContent = t('emptyLibrary');
        emptyState.querySelector('span').textContent = t('emptyLibraryHint');
        engineUiGrid.appendChild(emptyState);
    }
    refreshEngineCards(runningEngines);

    await window.serverAPI.sendEnginesList();
}

function updateServerStatusIcon(state) {
    serverStatus = state;
    const statuses = {
        offline: ['bi-wifi-off', 'offline'],
        listening: ['server-connection-loading', 'waitingGui'],
        connected: ['bi-check-circle-fill', 'guiConnected'],
        warning: ['bi-exclamation-triangle-fill', 'unauthorized']
    };
    const [icon, description] = statuses[state];
    statusDot.className = `bi ${icon}`;
    const label = state === 'offline' ? t(description) : `${t(description)} · ${t('localPort')}: ${portDisplay.textContent}`;
    serverConnectionInfo.title = label;
    serverConnectionInfo.setAttribute('aria-label', label);
}

window.serverAPI.onListening(({ address, family, port }) => {
    delete portDisplay.dataset.i18n;
	portDisplay.textContent = String(port);
	updateServerStatusIcon('listening');
});

window.serverAPI.onClientChange(({ isConnected, origin }) => {
	if(isConnected) {
		toast.success(t('clientConnected', { origin }), 1000);
		updateServerStatusIcon('connected');
        serverConnectionStatus = true;
	} else {
		toast.message(t('clientDisconnected'), 1000);
		updateServerStatusIcon('listening');
        serverConnectionStatus = false;
	}
});

window.serverAPI.onUnauthorized(({ origin }) => {
	toast.warning(t('blockedOrigin', { origin }));
	updateServerStatusIcon('warning');

	setTimeout(() => {
		updateServerStatusIcon(serverConnectionStatus ? 'connected' : 'listening');
	}, 3000);
});

function refreshLanguage() {
    setPortSettingsBusy(portUpdatePending);
    updateAlwaysOnTopButton(alwaysOnTopToggle.getAttribute('aria-pressed') === 'true');
    const logLabel = t(document.body.classList.contains('logs-only') ? 'showControls' : 'showLogs');
    logOnlyToggle.title = logLabel;
    logOnlyToggle.setAttribute('aria-label', logLabel);
    const panelLabel = t(panelsToggle.getAttribute('aria-expanded') === 'true' ? 'collapsePanels' : 'showPanels');
    panelsToggle.title = panelLabel;
    panelsToggle.setAttribute('aria-label', panelLabel);
    updateServerStatusIcon(serverStatus);
    engineSummary.textContent = t('engineRunning', { count: runningEngines.length });
    const empty = engineUiGrid.querySelector('.engine-empty-state');
    if(empty) {
        empty.querySelector('b').textContent = t('emptyLibrary');
        empty.querySelector('span').textContent = t('emptyLibraryHint');
    }
    engineUiGrid.querySelectorAll('.engine-card').forEach(card => {
        const name = card.querySelector('.engine-card-title').textContent;
        const processes = runningEngines.filter(engine => String(engine.identifierObj.engineId) === card.dataset.engineId);
        const status = processes.length ? t('engineRunning', { count: processes.length }) : t('idle');
        card.querySelector('.engine-status').textContent = status;
        card.setAttribute('aria-label', t('engineCardLabel', { name, status }));
        const edit = card.querySelector('.edit-btn');
        edit.title = t('changeDisplayName');
        edit.setAttribute('aria-label', t('renameEngine', { name }));
        const remove = card.querySelector('.remove-btn');
        remove.title = t('removeEngineHint');
        remove.setAttribute('aria-label', t('removeEngineLabel', { name }));
        card.querySelectorAll('.engine-process-row').forEach((row, index) => {
            const identifier = processes[index]?.identifierObj;
            if(!identifier) return;
            const display = getEngineDisplayContext(identifier);
            row.querySelector('.engine-process-context').textContent = display.context;
            row.querySelector('.engine-process-context').title = display.label;
            updateKillEngineButton(row.querySelector('.kill-engine-btn'), identifier);
        });
    });
}
document.addEventListener('server-language-changed', refreshLanguage);
refreshLanguage();

window.engineAPI.onRefreshEngineCards(({ aliveEngineProcesses }) => {
    refreshEngineCards(aliveEngineProcesses);
});

window.engineAPI.onAddConsoleView(({ identifierObj }) => {
    addConsoleView(identifierObj);
});

window.engineAPI.onRemoveConsoleView(({ identifierObj }) => {
    removeConsoleView(identifierObj);
});

window.engineAPI.onRenderEngineGrid(({ savedEngines }) => {
    renderEngineGrid(savedEngines).catch(console.error);
});

window.toastAPI.onMessage(({ type, text, ms }) => {
    toast[type](text, ms);
});

window.engineAPI.onLog(({ text, type, identifierObj }) => {
    log(text, type, identifierObj);
});