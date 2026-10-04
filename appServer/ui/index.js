const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const engineUiGrid = document.getElementById('engineGrid');
const portDisplay = document.getElementById('portDisplay');
const statusDot = document.getElementById('statusDot');
const consolesContainer = document.getElementById('consoles-container');
const addEngineBtn = document.getElementById('addEngineBtn');
const engineFilePicker = document.getElementById('filePicker');
const engineSummary = document.getElementById('engineSummary');
const panelsToggle = document.getElementById('panelsToggle');

let savedEngines = [];
let runningEngines = [];
let serverConnectionStatus = false;

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
        if([...engineUiGrid.querySelectorAll('.engine-card')].some(card => card.dataset.enginePath === engine.path)) return;

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

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn acas-fancy-button';
        removeBtn.type = 'button';
        removeBtn.title = 'Remove this binary from the library and kill its running processes';
        removeBtn.setAttribute('aria-label', `Remove ${engine.title || engine.name} from the library`);
        removeBtn.onclick = async (e) => {
            e.stopPropagation();
            removeBtn.disabled = true;
            try {
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

        top.appendChild(title);
        top.appendChild(removeBtn);

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
	portDisplay.textContent = `RUNNING ON PORT ${port}`;
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