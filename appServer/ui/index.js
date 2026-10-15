const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const engineUiGrid = document.getElementById('engineGrid');
const portDisplay = document.getElementById('portDisplay');
const portSettingsBtn = document.getElementById('portSettingsBtn');
const portSettingsDialog = document.getElementById('portSettingsDialog');
const portSettingsForm = document.getElementById('portSettingsForm');
const serverPortInput = document.getElementById('serverPortInput');
const portSettingsCancel = document.getElementById('portSettingsCancel');
const portSettingsSave = document.getElementById('portSettingsSave');
const statusDot = document.getElementById('statusDot');
const consolesContainer = document.getElementById('consoles-container');
const addEngineBtn = document.getElementById('addEngineBtn');
const engineFilePicker = document.getElementById('filePicker');
const engineSummary = document.getElementById('engineSummary');
const panelsToggle = document.getElementById('panelsToggle');

let savedEngines = [];
let runningEngines = [];
let serverConnectionStatus = false;
let portUpdatePending = false;

const setPortSettingsBusy = busy => {
    portUpdatePending = busy;
    serverPortInput.disabled = busy;
    portSettingsCancel.disabled = busy;
    portSettingsSave.disabled = busy;
    portSettingsBtn.disabled = busy;
    portSettingsSave.textContent = busy ? 'Saving…' : 'Save & Restart';
};

portSettingsBtn.addEventListener('click', async () => {
    if(portSettingsDialog.open || portUpdatePending) return;
    try {
        serverPortInput.value = String(await window.serverAPI.getPort());
        portSettingsDialog.showModal();
        serverPortInput.focus();
        serverPortInput.select();
    } catch(error) {
        console.error('Failed to load server port:', error);
        toast.error('Could not load the server port setting.', 5000);
    }
});
portSettingsCancel.addEventListener('click', () => portSettingsDialog.close('cancel'));
portSettingsDialog.addEventListener('cancel', event => {
    if(portUpdatePending) event.preventDefault();
});
portSettingsForm.addEventListener('submit', async event => {
    event.preventDefault();
    if(portUpdatePending || !portSettingsForm.reportValidity()) return;

    const port = Number(serverPortInput.value);
    if(!Number.isInteger(port) || port < 1 || port > 65535) {
        toast.error('Port must be a whole number between 1 and 65535.', 5000);
        return;
    }

    let restarting = false;
    setPortSettingsBusy(true);
    try {
        const result = await window.serverAPI.setPort(port);
        if(typeof result === 'string') {
            toast.error(result, 5000);
            return;
        }
        portSettingsDialog.close('save');
        if(result === false) toast.message('Port is unchanged.', 2000);
        if(result === true) {
            restarting = true;
            portSettingsSave.textContent = 'Restarting…';
            toast.message(`Restarting on port ${port}. Update the server port in the A.C.A.S web GUI to match.`, 5000);
        }
    } catch(error) {
        console.error('Failed to update server port:', error);
        toast.error('Could not update the server port.', 5000);
    } finally {
        if(!restarting) setPortSettingsBusy(false);
    }
});

panelsToggle.addEventListener('click', () => {
    const isExpanded = panelsToggle.getAttribute('aria-expanded') === 'true';
    document.body.classList.toggle('panels-collapsed', isExpanded);
    panelsToggle.setAttribute('aria-expanded', String(!isExpanded));
    panelsToggle.setAttribute('aria-label', `${isExpanded ? 'Show' : 'Collapse'} panels`);
    panelsToggle.title = `${isExpanded ? 'Show' : 'Collapse'} panels`;
    panelsToggle.querySelector('i').className = `bi bi-chevron-${isExpanded ? 'down' : 'up'}`;
});

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
        document.getElementById('acas-version-tag').textContent = `v${version}`;
        document.title = `Advanced Chess Assistance Server v${version} (Beta)`;
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

[document.querySelector('.engine-grid')]
    .forEach(scrollContainer => {
        if(!scrollContainer) return;

        scrollContainer.addEventListener('wheel', (evt) => {
            if(evt.ctrlKey || evt.deltaX !== 0 || evt.target.closest('.engine-process-list')) return;
            evt.preventDefault();
            scrollContainer.scrollLeft += evt.deltaY;
        }, { passive: false });
    });

stopBtn.onclick = () => window.engineAPI.killAllEngines();
clearBtn.onclick = () => {
    window.engineAPI.clearCache();
    toast.success('Cache cleared!', 1000);
};
addEngineBtn.onclick = async () => {
    const filePath = await window.fileAPI.pickFile();
    if(!filePath) return;

    const fileInfo = {
        name: filePath.split(/[/\\]/).pop(),
        path: filePath
    };

    const title = await AcasPrompt.prompt('Enter a custom name for this engine (optional):', fileInfo.name) || fileInfo.name;

    try {
        const result = await window.engineAPI.addEngine(fileInfo, title);

        if (result === true) toast.success(`Added engine: ${fileInfo.name}`, 5000);
        else if (typeof result === 'string') toast.error(result, 5000);
    } catch (err) {
        console.error('Failed to add engine:', err);
    }
};

function refreshEngineCards(aliveEngineProcesses) {
    runningEngines = aliveEngineProcesses;
    engineSummary.textContent = `${savedEngines.length} saved · ${runningEngines.length} running`;
    engineUiGrid.querySelectorAll('.engine-card').forEach(card => {
        const processes = runningEngines.filter(engine => String(engine.identifierObj.engineId) === card.dataset.engineId);
        card.classList.toggle('active', processes.length > 0);
        card.querySelector('.engine-status').textContent = processes.length
            ? `${processes.length} running` : 'Idle';

        const processList = card.querySelector('.engine-process-list');
        processList.replaceChildren();
        if(!processes.length) {
            const idleText = document.createElement('span');
            idleText.className = 'engine-idle-hint';
            idleText.textContent = 'Ready to use from the web GUI';
            processList.appendChild(idleText);
        }
        processes.forEach(({ identifierObj }) => {
            const row = document.createElement('div');
            row.className = 'engine-process-row';
            const context = document.createElement('span');
            context.className = 'engine-process-context';
            context.textContent = `${identifierObj.profileName} · ${identifierObj.instanceId}`;
            context.title = `Profile: ${identifierObj.profileName}\nInstance: ${identifierObj.instanceId}`;
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
            existingCard.querySelector('.edit-btn').setAttribute('aria-label', `Rename ${title.textContent}`);
            existingCard.querySelector('.remove-btn').setAttribute('aria-label', `Remove ${title.textContent} from the library`);
            return;
        }

        const card = document.createElement('div');
        card.className = 'card engine-card';
        card.dataset.engineId = engine.engineId;
        card.dataset.enginePath = engine.path;

        const statusRow = document.createElement('div');
        statusRow.className = 'engine-card-status-row';
        const engineIcon = document.createElement('i');
        engineIcon.className = 'bi bi-cpu';
        engineIcon.setAttribute('aria-hidden', 'true');
        const status = document.createElement('span');
        status.className = 'engine-status';
        status.textContent = 'Idle';
        statusRow.append(engineIcon, status);

        const top = document.createElement('div');
        top.className = 'top';

        const title = document.createElement('div');
        title.classList.add('engine-card-title');
        title.textContent = engine.title || engine.name;
        title.title = title.textContent;

        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn acas-fancy-button';
        editBtn.type = 'button';
        editBtn.title = 'Change display name';
        editBtn.setAttribute('aria-label', `Rename ${engine.title || engine.name}`);
        editBtn.onclick = async (e) => {
            const currentEngine = savedEngines.find(saved => saved.path === engine.path);

            e.stopPropagation();

            if(!currentEngine) return;

            editBtn.disabled = true;

            try {
                const newTitle = await AcasPrompt.prompt(
                    'Change this engine\'s display name:', currentEngine.title || currentEngine.name,
                    { showCancel: true }
                );

                if(newTitle === null) return;

                const result = await window.engineAPI.renameEngine(engine.path, newTitle);

                if(typeof result === 'string') toast.error(result, 5000);
                else toast.success('Engine display name updated.', 2000);
            } catch(error) {
                console.error('Failed to rename engine:', error);
                toast.error('Could not rename this engine.', 5000);
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
        removeBtn.title = 'Remove this binary from the library and kill its running processes';
        removeBtn.setAttribute('aria-label', `Remove ${engine.title || engine.name} from the library`);
        removeBtn.onclick = async (e) => {
            const currentEngine = savedEngines.find(saved => saved.path === engine.path);

            e.stopPropagation();

            if(!currentEngine) return;

            removeBtn.disabled = true;

            try {
                const confirmed = await AcasPrompt.confirm(
                    `Remove "${currentEngine.title || currentEngine.name}" from the engine library?\n\nThis will stop its running processes. The binary file will remain on disk.`,
                    'Remove'
                );

                if(!confirmed) return;

                const result = await window.engineAPI.removeEngine(engine.path);

                if(typeof result === 'string') toast.error(result, 5000);
            } catch(error) {
                console.error('Failed to remove engine:', error);
                toast.error('Could not remove this engine.', 5000);
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
        top.appendChild(title);
        top.appendChild(actions);

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

        card.appendChild(statusRow);
        card.appendChild(top);
        card.appendChild(bottom);
        card.appendChild(processList);

        engineUiGrid.appendChild(card);
    });

    engineUiGrid.querySelector('.engine-empty-state')?.remove();
    if(!savedEngines.length) {
        const emptyState = document.createElement('div');
        emptyState.className = 'engine-empty-state';
        emptyState.innerHTML = '<i class="bi bi-cpu" aria-hidden="true"></i><b>No engines added yet</b><span>Add an engine binary, then select it in the A.C.A.S web GUI.</span>';
        engineUiGrid.appendChild(emptyState);
    }
    refreshEngineCards(runningEngines);

    await window.serverAPI.sendEnginesList();
}

window.serverAPI.onListening(({ address, family, port }) => {
	portDisplay.textContent = String(port);
	portSettingsBtn.title = `Local server port ${port} — click to change`;
	statusDot.style.background = '#2ecc71';
	statusDot.style.boxShadow = '0 0 8px #2ecc71';
});

window.serverAPI.onClientChange(({ isConnected, origin }) => {
	if(isConnected) {
		toast.success(`Remote client connected: ${origin}`, 1000);
		statusDot.style.background = '#3498db';
		statusDot.style.boxShadow = '0 0 10px #3498db';
        serverConnectionStatus = true;
	} else {
		toast.message(`Remote client disconnected!`, 1000);
		statusDot.style.background = '#2ecc71';
        serverConnectionStatus = false;
	}
});

window.serverAPI.onUnauthorized(({ origin }) => {
	toast.warning(`SECURITY ALERT: Blocked unauthorized origin: ${origin}`);
	statusDot.style.background = '#ff5252';

	setTimeout(() => {
		statusDot.style.background = serverConnectionStatus ? '#3498db' : '#2ecc71';
	}, 3000);
});

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