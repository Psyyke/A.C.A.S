const stopBtn = document.getElementById('stopBtn');
const engineUiGrid = document.getElementById('engineGrid');
const portDisplay = document.getElementById('portDisplay');
const statusDot = document.getElementById('statusDot');
const consolesContainer = document.getElementById('consoles-container');
const addEngineBtn = document.getElementById('addEngineBtn');
const engineFilePicker = document.getElementById('filePicker');

let savedEngines = [];
let serverConnectionStatus = false;

(async () => {
    savedEngines = await window.engineAPI.getSavedEngines();
})();

document.querySelectorAll('a.external')
    .forEach(a=>{
        a.addEventListener('click', e=>{
            e.preventDefault();
            nw.Shell.openExternal(a.href);
        });
    });

[document.querySelector('.engine-grid')]
    .forEach(scrollContainer => {
        if(!scrollContainer) return;

        scrollContainer.addEventListener('wheel', (evt) => {
            evt.preventDefault();
            scrollContainer.scrollLeft += evt.deltaY;
        });
    });

stopBtn.onclick = () => window.engineAPI.killAllEngines();
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
    console.log(aliveEngineProcesses);
    const aliveIds = aliveEngineProcesses.map(ep => ep.identifierObj.engineId);

    [...document.querySelectorAll('.card')]
        .filter(x => !aliveIds.includes(Number(x.dataset.engineId || 0)))
        .forEach(x => x.classList.remove('active'));
}

async function renderEngineGrid(savedEngines) {
    const existingCards = Array.from(engineUiGrid.children);
    const engineIds = savedEngines.map(e => String(e.engineId));

    existingCards.forEach(card => {
        if(!engineIds.includes(card.dataset.engineId)) card.remove();
    });

    savedEngines.forEach((engine, index) => {
        if(engineUiGrid.querySelector(`[data-engine-id="${engine.engineId}"]`)) return;

        const card = document.createElement('div');
        card.className = 'card engine-card acas-fancy-button';
        card.dataset.engineId = engine.engineId;

        const top = document.createElement('div');
        top.className = 'top';

        const title = document.createElement('div');
        title.classList.add('engine-card-title');
        title.textContent = engine.title;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn acas-fancy-button';
        removeBtn.onclick = async (e) => {
            e.stopPropagation();

            const result = await window.engineAPI.removeEngine(index);

            if(typeof result === 'string') toast.error(result, 5000);
        };

        const icon = document.createElement('i');
        icon.className = 'bi bi-x';
        removeBtn.appendChild(icon);

        top.appendChild(title);
        top.appendChild(removeBtn);

        const bottom = document.createElement('div');
        bottom.className = 'bottom';

        const path = document.createElement('p');
        path.textContent = GET_NICE_PATH(engine.path);
        bottom.appendChild(path);

        card.appendChild(top);
        card.appendChild(bottom);

        card.onclick = () => {
            toast.message('Please control the engine from the A.C.A.S web GUI!', 1000);
        };

        engineUiGrid.appendChild(card);
    });

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
    renderEngineGrid(savedEngines);
});

window.toastAPI.onMessage(({ type, text, ms }) => {
    toast[type](text, ms);
});

window.engineAPI.onLog(({ text, type, identifierObj }) => {
    log(text, type, identifierObj);
});