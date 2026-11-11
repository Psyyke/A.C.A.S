import { getPersonalModel, savePersonalModel } from '../../engines/Maia3/personal-models.js';
import { saveSetting, loopThroughAndUpdateSettingsValues } from './settings.js';
import { setInputValue } from './domInputs.js';
import { runSettingChangeObserver } from './settingChangeObserver.js';

export async function initializeMaia3Models() {
    const panel = document.getElementById('maia3-models');
    if(!panel) return;
    const setting = panel.querySelector('input[data-key="maia3Model"]');
    const provider = panel.querySelector('input[data-key="maia3Provider"]');
    const runtime = panel.querySelector('input[data-provider]');
    const file = panel.querySelector('input[type="file"]');
    const upload = panel.querySelector('.maia3-upload-weights');
    const remove = panel.querySelector('.maia3-remove-weights');
    const statuses = [...panel.querySelectorAll('[role="status"]')];
    const text = (key, fallback) => (typeof TRANS_OBJ === 'undefined' ? null : TRANS_OBJ)?.[key] ?? fallback;
    function translatePanel() {
        const title = text('lc0WeightsTitle', 'Lc0 Weights').replace('Lc0', 'Maia 3');
        panel.querySelector(':scope > div > .input-title').textContent = title;
        panel.querySelector('.open-floaty-btn').setAttribute('aria-label', title);
        panel.querySelector('.floaty-header h1').textContent = title;
        panel.querySelector('.floaty-header p').textContent = text('lc0WeightsProfile', 'Choose a network for this profile');
        panel.querySelector('.file-input .input-title').textContent = text('lc0WeightsNetwork', 'Network');
        upload.textContent = `${text('lc0WeightsUpload', 'Upload weights')} (ONNX)`;
        file.setAttribute('aria-label', upload.textContent);
        const reset = text('lc0WeightsReset', 'Use default Maia 1500').replace('Maia 1500', 'Maia 3');
        remove.title = reset;
        remove.setAttribute('aria-label', reset);
        runtime.closest('.custom-input').querySelector('.input-title').textContent = text('weightsRuntime', 'Runtime');
        runtime.setAttribute('aria-label', text('weightsRuntime', 'Runtime'));
        panel.querySelector('.lc0-weights-info p').textContent =
            text('maia3WeightsInfo', "Saved in this browser. Uploading replaces this profile's network.");
        panel.querySelector('.lc0-weights-info a').textContent = text('weightsTrain', 'Train with DoppelMaia');
    }
    function status(message) {
        statuses.forEach(elem => { elem.textContent = message; });
    }
    let revision = 0, busy = false;
    function controls(value) {
        busy = value;
        file.disabled = value;
        upload.disabled = value;
        remove.disabled = value || !setting.value;
        runtime.disabled = value || !setting.value;
    }
    const ownerMatches = owner => Object.keys(owner).every(key => owner[key] === SETTING_FILTER_OBJ[key]);
    async function save(input, value, owner) {
        if(!owner.profileID) throw new Error(text('weightsSelectProfile', 'Choose a profile first.'));
        const copy = input.cloneNode();
        copy.removeAttribute('additional-type');
        setInputValue(copy, value);
        await saveSetting(copy, true, owner);
        if(ownerMatches(owner)) { setInputValue(input, value); runSettingChangeObserver(input, 0, true); }
    }
    async function refresh() {
        const current = ++revision;
        const id = setting.value;
        runtime.value = provider.value || 'wasm';
        controls(busy);
        status(id ? text('lc0WeightsSavedLoading', 'Loading saved weights...') : text('maia3WeightsDefault', 'Default Maia 3'));
        if(!id) return;
        try {
            const model = await getPersonalModel(id);
            if(current === revision) status(model.name || text('lc0WeightsSaved', 'Saved Lc0 weights').replace('Lc0', 'Maia 3'));
        } catch(error) {
            if(current === revision) throw error;
            console.error('[Personalized Maia 3] Previous network could not be loaded:', error);
        }
    }
    function failure(error) {
        status(error.message);
        console.error('[Personalized Maia 3]', error);
        toast.error(text('maia3WeightsError', 'Maia 3 weights: {error}').replace('{error}', () => error.message), 8000);
    }
    setting.addEventListener('acas-value-set', () => refresh().catch(failure));
    document.addEventListener('acas-translations-updated', () => {
        translatePanel();
        refresh().catch(failure);
    });
    translatePanel();
    provider.addEventListener('acas-value-set', () => { runtime.value = provider.value || 'wasm'; });
    remove.addEventListener('click', async () => {
        if(busy || !setting.value) return;
        const owner = { ...SETTING_FILTER_OBJ };
        controls(true);
        try {
            await save(setting, '', owner);
            await refresh();
        }
        catch(error) { failure(error); }
        finally { controls(false); }
    });
    runtime.addEventListener('change', async () => {
        if(busy) return;
        controls(true);
        try {
            if(!['wasm', 'webgpu'].includes(runtime.value)) throw new Error(text('weightsRuntimeError', 'Choose WASM CPU or WebGPU.'));
            await save(provider, runtime.value, { ...SETTING_FILTER_OBJ });
        }
        catch(error) { failure(error); runtime.value = provider.value || 'wasm'; }
        finally { controls(false); }
    });
    upload.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
        const uploaded = file.files[0], owner = { ...SETTING_FILTER_OBJ };
        file.value = '';
        if(!uploaded || busy) return;
        translatePanel();
        controls(true);
        try {
            const id = await savePersonalModel(uploaded);
            await save(setting, id, owner); await refresh();
        } catch(error) { failure(error); }
        finally { controls(false); }
    });
    controls(true);
    try {
        await refresh();
        const url = new URL(location.href), id = url.searchParams.get('personalModel');
        if(id) {
            await WAIT_UNTIL_VAR(() => SETTING_FILTER_OBJ.profileID, 10000);
            await loopThroughAndUpdateSettingsValues();
            const owner = { ...SETTING_FILTER_OBJ }, model = await getPersonalModel(id);
            await save(setting, id, owner);
            await save(provider, url.searchParams.get('personalProvider') === 'webgpu' ? 'webgpu' : 'wasm', owner);
            for(const [key, value] of [['useExternalChessEngine', false], ['engineElo', model.elo],
                ['engineEnemyElo', model.elo], ['chessEngine', 'maia3']]) {
                const input = document.querySelector(`input[data-key="${key}"]`);
                if(!input) throw new Error(`Could not select Maia 3: missing ${key} control.`);
                await save(input, value, owner);
            }
            url.searchParams.delete('personalModel'); url.searchParams.delete('personalProvider');
            history.replaceState(null, '', url);
            await refresh();
            toast.success(text('maia3WeightsApplied', 'Maia 3 weights applied.'), 5000);
        }
    } catch(error) { failure(error); }
    finally { controls(false); }
}
