import {
    defaultSelectionWeights, moveCategories, rebalanceSelectionWeights
} from '../../../../tools/eloeye/hintSelection.js';
import { readMixWeights } from '../instance/suggestionMix.js';
import { loopThroughAndUpdateSettingsValues, saveSetting } from './settings.js';

export function initializeSuggestionMix() {
    const container = document.getElementById('suggestion-mix-floaty');
    const savedInput = container.querySelector('input[data-key="suggestionMixWeights"]');
    const detailed = container.querySelector('#suggestion-mix-detailed');
    const mode = document.querySelector('input[data-key="suggestionMixMode"]');
    const preferBook = container.querySelector('input[data-key="suggestionMixPreferBook"]');
    const booksNote = container.querySelector('#suggestion-mix-books-note');
    const offNote = container.querySelector('#suggestion-mix-off-note');
    const engineSettings = container.querySelector('#suggestion-mix-engine-settings');
    const sharedSetting = container.querySelector('#suggestion-mix-shared-setting');
    const sourceNote = container.querySelector('#suggestion-mix-source-note');
    const fallbackNote = container.querySelector('#suggestion-mix-fallback-note');
    const modeLabels = document.querySelectorAll('#suggestion-mix-state [data-mix-mode]');
    const inputs = new Map(moveCategories.map(category =>
        [category, container.querySelector(`[data-mix-category="${category}"]`)]));
    let weights = { ...defaultSelectionWeights };
    let saving = Promise.resolve();

    function showError(error) {
        console.error('[Suggestion mix]', error);
        toast.error(TRANS_OBJ?.suggestionMixError ?? 'Could not save the mix. Check the percentages.', 5000);
    }

    function refresh() {
        const booksOnly = mode.value === 'books';
        const engineMix = mode.value === 'all';
        booksNote.hidden = !booksOnly;
        offNote.hidden = mode.value !== 'off';
        sharedSetting.hidden = mode.value === 'off';
        engineSettings.hidden = !engineMix;
        engineSettings.inert = !engineMix;
        detailed.disabled = !engineMix;
        sourceNote.hidden = preferBook.checked;
        fallbackNote.hidden = !preferBook.checked;
        modeLabels.forEach(label => { label.hidden = label.dataset.mixMode !== mode.value; });
        preferBook.disabled = !engineMix;
        const bookSetting = preferBook.closest('.custom-input');
        bookSetting.hidden = !engineMix;
        bookSetting.inert = !engineMix;
        container.querySelector('#suggestion-mix-categories').hidden = !detailed.checked;
        inputs.forEach((input, category) => {
            const inactiveType = category !== 'best'
                && (category === 'alternative' ? detailed.checked : !detailed.checked);
            const setting = input.closest('.custom-input');

            input.value = weights[category];
            input.disabled = !engineMix || inactiveType;
            setting.hidden = inactiveType;
        });
    }

    function restore() {
        try {
            weights = readMixWeights(savedInput.value);
            detailed.checked = weights.alternative === 0;
            refresh();
        } catch(error) {
            showError(error);
        }
    }

    function save() {
        const value = JSON.stringify(weights);
        const filter = { ...SETTING_FILTER_OBJ };
        savedInput.value = value;
        saving = saving.then(async () => {
            savedInput.value = value;
            await saveSetting(savedInput, true, filter);
            if(Object.keys(filter).some(key => filter[key] !== SETTING_FILTER_OBJ[key]))
                await loopThroughAndUpdateSettingsValues();
        }).catch(showError);
    }

    function changePercentage(category, input) {
        try {
            const categories = detailed.checked
                ? moveCategories.filter(name => name !== 'alternative') : ['best', 'alternative'];
            weights = rebalanceSelectionWeights(weights, category, input.valueAsNumber, categories);
            input.setCustomValidity('');
            refresh();
            save();
        } catch(error) {
            input.setCustomValidity(TRANS_OBJ?.suggestionMixPercentage ?? 'Choose a number from 0 to 100');
            input.reportValidity();
        }
    }

    inputs.forEach((input, category) => {
        input.addEventListener('change', () => changePercentage(category, input));
    });

    detailed.addEventListener('change', () => {
        const remaining = 100 - weights.best;
        weights = Object.fromEntries(moveCategories.map(category =>
            [category, category === 'best' ? weights.best : 0]));
        weights[detailed.checked ? 'secondary' : 'alternative'] = remaining;
        refresh();
        save();
    });

    savedInput.addEventListener('acas-value-set', restore);
    mode.addEventListener('acas-value-set', refresh);
    mode.addEventListener('change', refresh);
    preferBook.addEventListener('acas-value-set', refresh);
    preferBook.addEventListener('change', refresh);
    restore();
}
