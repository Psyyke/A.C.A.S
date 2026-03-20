import { saveSetting, removeSetting } from './settings.js';
import { runSettingChangeObserver } from './settingChangeObserver.js';
import { doesDropdownItemExist } from './domDropdown.js';

export function setInputValue(elem, val, min, max) {
    const isCheckbox = elem.type === 'checkbox';

    if(isCheckbox) {
        elem.checked = VAR_TO_CORRECT_TYPE(val);
    } else {
        const key = elem?.dataset?.key;
        const parentElem = elem?.parentElement;
        const isDropdown = key && parentElem && parentElem.classList.contains('dropdown-input-container');

        if(isDropdown) { // highlight dropdown selected item
            const selectedItemKey = 'selected-list-item';
            const dropdownElems = [...parentElem?.querySelectorAll('.dropdown-item')];

            dropdownElems.forEach(elem => {
                if(elem?.dataset?.value === val)
                    elem.classList.add(selectedItemKey);
                else
                    elem.classList.remove(selectedItemKey);
            });
        } else {
            if(min && max) val = Math.max(min, Math.min(max, val)) || min;
        }

        elem.value = VAR_TO_CORRECT_TYPE(val);
    }
}

export function getInputValue(elem) {
    let value = elem.value;

    if(elem.type == 'checkbox') {
        value = elem.checked;
    } else if(elem.getAttribute('additional-type') == 'dropdown') {
        value = doesDropdownItemExist(elem, elem.value) ? elem.value : elem.dataset.defaultValue;
    }

    return (value !== undefined && value !== null) ? value : elem.dataset.defaultValue;
}

export function activateInputDefaultValue(elem) {
    setInputValue(elem, elem.dataset.defaultValue);
}

export function initializeSettingInputElem(elem, skipDefaultValueSet) {
    if(!elem) return;

    let [min, max] = [null, null];

    const defaultVal = VAR_TO_CORRECT_TYPE(elem.dataset.defaultValue);
    const isRange = elem.dataset?.between || elem.dataset?.spin;

    if(defaultVal && !skipDefaultValueSet) {
        activateInputDefaultValue(elem);
        
        if(!elem.placeholder)
            elem.placeholder = elem.dataset.defaultValue;
    }

    if(isRange) {
        if(elem.dataset?.between) {
            [min, max] = PARSE_MINMAX_FROM_STR(elem.dataset.between);

            elem.style.width = `${(String(max).length + 0.6) * 10}px`;
        } else {
            elem.style.width = `${(String(defaultVal).length + 0.45) * 25}px`;
        }
    }

    elem.oninput = e => runSettingChangeObserver(e.target);

    elem.onchange = e => {
        if(isRange && elem.dataset?.between) {
            e.target.value = Math.max(min, Math.min(max, e.target.value)) || min;
        }

        if(e.target.value || e.target.checked || e.target.value === '') {
            saveSetting(elem, true);

            if(
                e?.target?.dataset?.key === 'displayMovesOnExternalSite' ||
                e?.target?.dataset?.key === 'renderOnExternalSite' ||
                e?.target?.dataset?.key === 'movesOnDemand' ||
                e?.target?.dataset?.key === 'isUserscriptGhost'
            ) {
                const msg = TRANS_OBJ?.refreshSiteNotification ?? 'Refresh the external site to see changes!';
                toast.create('message', '👁‍🗨', msg, 3000);
            }

            runSettingChangeObserver(e.target, 50);
        } else {
            removeSetting(elem);
        }
    }
}

export function initializeInputElems() {
    [...document.querySelectorAll('input[data-key]')]
        .forEach(elem => initializeSettingInputElem(elem));
}