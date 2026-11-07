import {
    defaultSelectionWeights, moveCategories, rebalanceSelectionWeights
} from '../../../../tools/eloeye/hintSelection.js';
import { readMixWeights } from '../instance/suggestionMix.js';
import { saveSetting } from './settings.js';

export function initializeSuggestionMix() {
    const container = document.getElementById('suggestion-mix-floaty');
    const savedInput = container.querySelector('[data-key="suggestionMixWeights"]');
    const detailed = container.querySelector('#suggestion-mix-detailed');
    const inputs = new Map(moveCategories.map(category =>
        [category, container.querySelector(`[data-mix-category="${category}"]`)]));
    let weights = { ...defaultSelectionWeights };
    let saving = Promise.resolve();

    function showError(error) {
        console.error('[Suggestion mix]', error);
        toast.error(TRANS_OBJ?.suggestionMixError ?? 'Could not save the mix. Check the percentages.', 5000);
    }

    function refresh() {
        inputs.forEach((input, category) => {
            const disabled = category !== 'best'
                && (category === 'alternative' ? detailed.checked : !detailed.checked);
            const setting = input.closest('.custom-input');

            input.value = weights[category];
            input.disabled = disabled;
            setting.inert = disabled;
            setting.setAttribute('aria-disabled', String(disabled));
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
    restore();
}
