import { getLc0Weights, removeLc0Weights, saveLc0Weights } from '../../engines/lc0/weight-storage.js';
import { saveSetting } from './settings.js';
import { setInputValue } from './domInputs.js';
import { trackLc0WeightUpload, cancelLc0WeightUpload } from './lc0WeightNotifications.js';

export function initializeLc0Weights() {
    const panel = document.getElementById('modern-lc0-weights');
    if(!panel) return;
    const setting = panel.querySelector('[data-key="modernLc0Weight"]');
    const fileInput = panel.querySelector('input[type="file"]');
    const upload = panel.querySelector('.lc0-upload-weights');
    const status = panel.querySelector('[role="status"]');
    const remove = panel.querySelector('.lc0-remove-weights');
    let revision = 0;
    let busy = false;

    const text = (key, fallback) => (typeof TRANS_OBJ === 'undefined' ? null : TRANS_OBJ)?.[key] ?? fallback;
    function translatePanel() {
        const title = text('lc0WeightsTitle', 'Lc0 Weights');
        panel.querySelector(':scope > div > .input-title').textContent = title;
        panel.querySelector(':scope > div > .input-subtitle').textContent =
            text('lc0WeightsChoice', 'Maia 1500 or your own network');
        panel.querySelector('.open-floaty-btn').setAttribute('aria-label', title);
        panel.querySelector('.floaty-header h1').textContent = title;
        panel.querySelector('.floaty-header p').textContent = text('lc0WeightsProfile', 'Choose a network for this profile');
        panel.querySelector('.file-input .input-title').textContent = text('lc0WeightsNetwork', 'Network');
        upload.textContent = text('lc0WeightsUpload', 'Upload weights');
        fileInput.setAttribute('aria-label', upload.textContent);
        const reset = text('lc0WeightsReset', 'Use default Maia 1500');
        remove.title = reset;
        remove.setAttribute('aria-label', reset);
        panel.querySelector('.lc0-weights-info p').textContent =
            text('lc0WeightsInfo', 'Weights stay in this browser. Large networks need plenty of memory.');
        panel.querySelector('.lc0-weights-info a').textContent =
            text('weightsTrain', 'Train with DoppelMaia');
    }

    const sameOwner = owner => Object.keys(owner).every(key => owner[key] === SETTING_FILTER_OBJ[key]);
    async function refresh() {
        const current = ++revision;
        const id = setting.value;
        fileInput.disabled = busy;
        upload.disabled = busy;
        remove.disabled = busy || !id;
        status.textContent = id ? text('lc0WeightsSavedLoading', 'Loading saved weights...')
            : text('lc0WeightsDefault', 'Maia 1500 (default, 1.7 MB)');
        if(!id) return;
        try {
            const file = await getLc0Weights(id);
            if(current === revision) status.textContent = file.name || text('lc0WeightsSaved', 'Saved Lc0 weights');
        } catch(error) {
            if(current === revision) status.textContent = error.message;
            console.error('[Lc0 weights]', error);
        }
    }
    async function saveSelection(value, owner) {
        const input = setting.cloneNode();
        input.value = value;
        await saveSetting(input, true, owner);
        if(sameOwner(owner)) setInputValue(setting, value);
    }
    async function removeIfUnreferenced(id) {
        if(!id) return;
        const config = await USERSCRIPT.getValue(USERSCRIPT_SHARED_VARS.gmConfigKey);
        const referenced = object => object && typeof object === 'object'
            && (object.modernLc0Weight === id || Object.values(object).some(referenced));
        if(!referenced(config)) await removeLc0Weights(id);
    }
    setting.addEventListener('acas-value-set', refresh);
    document.addEventListener('acas-translations-updated', () => {
        translatePanel();
        refresh();
    });
    translatePanel();
    upload.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        const owner = { ...SETTING_FILTER_OBJ };
        const oldId = setting.value;
        fileInput.value = '';
        if(!file || busy) return;
        busy = true;
        refresh();
        let uploadedId;
        try {
            const id = await saveLc0Weights(file);
            uploadedId = id;
            trackLc0WeightUpload(id, file.name);
            await saveSelection(id, owner);
            cancelLc0WeightUpload(oldId);
            await removeIfUnreferenced(oldId);
        } catch(error) {
            cancelLc0WeightUpload(uploadedId);
            console.error('[Lc0 weights] Could not save weights:', error);
            toast.error(text('lc0WeightsSaveError', 'Could not save Lc0 weights: {error}')
                .replace('{error}', () => error.message), 8000);
        } finally {
            busy = false;
            refresh();
        }
    });
    remove.addEventListener('click', async () => {
        const owner = { ...SETTING_FILTER_OBJ };
        const id = setting.value;
        if(!id || busy) return;
        busy = true;
        refresh();
        try {
            await saveSelection('', owner);
            cancelLc0WeightUpload(id);
            await removeIfUnreferenced(id);
        } catch(error) {
            console.error('[Lc0 weights] Could not remove weights:', error);
            toast.error(text('lc0WeightsRemoveError', 'Could not remove Lc0 weights: {error}')
                .replace('{error}', () => error.message), 8000);
        } finally {
            busy = false;
            translatePanel();
            refresh();
        }
    });
    refresh();
}
