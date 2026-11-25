(() => {
    const dialog = document.getElementById('local-ai');
    document.getElementById('open-local-ai').addEventListener('click', () => {
        if(!dialog.open) dialog.showModal();
    });
    dialog.addEventListener('click', event => {
        if(event.target !== dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if(event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    const form = document.getElementById('ai-form');
    const inputs = {
        executablePath: document.getElementById('ai-executable'),
        modelPath: document.getElementById('ai-model'),
        loraPath: document.getElementById('ai-lora'),
        backend: document.getElementById('ai-backend'),
        context: document.getElementById('ai-context'),
        gpuLayers: document.getElementById('ai-gpu-layers'),
        threads: document.getElementById('ai-threads'),
        vramMode: document.getElementById('ai-vram-mode')
    };
    const primary = document.getElementById('ai-primary');
    const stop = document.getElementById('ai-stop');
    const apply = document.getElementById('ai-start');
    const statusLabel = document.getElementById('ai-status');
    const summary = document.getElementById('ai-summary');
    const progress = document.getElementById('ai-progress');
    const gb = bytes => `${(bytes / 1e9).toFixed(1)} GB`;
    const t = window.serverI18n.text;
    const phaseText = { checking: 'checking', verifying: 'verifying', unpacking: 'unpacking', starting: 'starting' };
    const itemText = { runtime: 'itemRuntime', model: 'itemModel', lora: 'itemLora' };
    let current = { state: 'offline', setup: {} };
    let pending = false;
    let uiError = null;

    const render = status => {
        current = status;
        const setup = status.setup || {};
        const downloading = setup.busy && setup.phase !== 'starting';
        const starting = (setup.busy && setup.phase === 'starting') || status.state === 'loading';
        const ready = status.state === 'ready';

        summary.textContent = ready ? t('readyModel', { model: `${status.model}${status.lora ? ' + LoRA' : ''}` })
            : downloading ? t('downloadingPercent', { percent: Math.floor((setup.progress || 0) * 100) })
                : starting ? t('startingShort')
                    : t(setup.installed ? 'stopped' : 'notSetUp');

        let text;
        if(ready) text = status.vramGuessed
            ? t('vramUnknown')
            : t('runningLocal', { context: status.context.toLocaleString(), backend: status.capabilities.backend })
                + (status.vramMode && status.vramMode !== 'fast'
                    ? ` · ${t('vramMode', { mode: status.vramMode })}${status.vramAuto ? t('vramAuto') : ''}` : '');
        else if(setup.phase === 'downloading')
            text = t('downloadingItem', { item: t(itemText[setup.item] || 'itemFiles'), received: gb(setup.received), total: gb(setup.total) });
        else if(setup.busy) text = t(phaseText[setup.phase] || 'working');
        else if(starting) text = t('starting');
        else {
            const diagnostic = setup.error || status.error;
            text = diagnostic ? `${t('aiProblem')} ${diagnostic}` : setup.installed
                ? t('aiInstalled')
                : t('aiDownloadHint', { size: gb(setup.downloadBytes || 0) });
        }
        if(uiError) text = uiError.key ? t(uiError.key) : `${t('aiProblem')} ${uiError.message}`;
        statusLabel.textContent = text;
        statusLabel.classList.toggle('ai-error', Boolean(uiError) || (!ready && !setup.busy && Boolean(setup.error || status.error)));

        progress.hidden = !downloading;
        progress.firstElementChild.style.width = `${Math.round((setup.progress || 0) * 100)}%`;

        primary.hidden = ready || starting;
        primary.disabled = pending;
        primary.textContent = t(downloading ? 'pause'
            : setup.installed ? (setup.error || status.error ? 'retry' : 'startPena')
                : setup.received || setup.error ? 'resumeDownload' : 'downloadPena');
        stop.textContent = t('stop');
        stop.hidden = !(ready || starting);
        stop.disabled = pending;
        apply.disabled = pending || Boolean(setup.busy);
    };
    const showError = error => {
        uiError = error.message ? { message: error.message } : { key: 'aiProblem' };
        render(current);
    };
    const act = async action => {
        if(pending) return;
        uiError = null;
        pending = true;
        render(current);
        try { render(await action()); }
        catch(error) { showError(error); }
        finally { pending = false; render(current); }
    };
    const settingsFromForm = () => Object.fromEntries(Object.entries(inputs).map(([key, input]) =>
        [key, ['context', 'gpuLayers', 'threads'].includes(key) ? Number(input.value) : input.value]));
    const setFile = (key, value) => {
        inputs[key].value = value || '';
        inputs[key].title = value || '';
    };

    primary.addEventListener('click', () => act(() =>
        current.setup?.busy ? window.aiAPI.cancel() : window.aiAPI.start()));
    stop.addEventListener('click', () => act(() => window.aiAPI.stop()));
    form.querySelectorAll('[data-ai-file]').forEach(button => {
        button.addEventListener('click', async () => {
            try {
                const key = button.dataset.aiFile;
                const title = key === 'executablePath' ? t('runtime') : key === 'modelPath' ? t('model') : 'LoRA';
                const file = await window.aiAPI.pickFile(key, title);
                if(file) {
                    setFile(key, file);
                    uiError = null;
                    render(current);
                }
            } catch(error) { showError(error); }
        });
    });
    document.getElementById('ai-reset').addEventListener('click', () => {
        for(const key of ['executablePath', 'modelPath', 'loraPath']) setFile(key, '');
        uiError = null;
        render(current);
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        if(!form.reportValidity()) return;
        const settings = settingsFromForm();
        if(Boolean(settings.executablePath) !== Boolean(settings.modelPath)) {
            uiError = { key: 'needRuntimeModel' };
            return render(current);
        }
        if(settings.loraPath && !settings.modelPath) {
            uiError = { key: 'needModelForLora' };
            return render(current);
        }
        act(() => window.aiAPI.start(settings));
    });

    window.aiAPI.onStatus(status => {
        if(!pending) uiError = null;
        render(status);
    });
    document.addEventListener('server-language-changed', () => render(current));
    render(current);
    (async () => {
        try {
            const settings = await window.aiAPI.getSettings();
            for(const [key, input] of Object.entries(inputs)) {
                if(key.endsWith('Path')) setFile(key, settings[key]);
                else input.value = String(settings[key]);
            }
            render(await window.aiAPI.getStatus());
        } catch(error) { showError(error); }
    })();
})();
