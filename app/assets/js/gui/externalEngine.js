import { externalChessEngineDropdown } from './elementDeclarations.js';
import { setInputValue, initializeSettingInputElem } from './domInputs.js';

export async function updateEnginesList(engines) {
    const installText = document.querySelector('#install-acas-server-text');
    const dropdownListContainer = externalChessEngineDropdown.querySelector('.dropdown-list-container');
    const input = externalChessEngineDropdown.querySelector('input');

    const selectedEngineID = await GET_GM_CFG_VALUE('externalChessEngine', SETTING_FILTER_OBJ.instanceID, SETTING_FILTER_OBJ.profileID);

    function toggleDropdown() {
        if(engines?.length !== 0) {
            dropdownListContainer.classList.remove('hidden');
            installText.classList.add('hidden');
        } else {
            dropdownListContainer.classList.add('hidden');
            installText.classList.remove('hidden');
        }
    }

    toggleDropdown();

    const currentIds = new Set(engines.map(e => String(e.engineId)));
    const selectedItemClass = 'selected-list-item';

    const existingElements = dropdownListContainer.querySelectorAll('.dropdown-item');
    existingElements.forEach(el => {
        const id = el.dataset.value;
        if(!currentIds.has(id)) {
            const paramInputElem = document.querySelector(`input[data-key="${GET_EXTERNAL_PARAM_DB_KEY(id)}"]`);
            if(paramInputElem) paramInputElem.parentElement.remove();

            el.remove();
        }
    });

    let foundSelectedEngineID = false;
    
    const createParamsInput = async (titleText, engineId) => {
        const dbKey = GET_EXTERNAL_PARAM_DB_KEY(engineId);
        const existingDbValue = await GET_GM_CFG_VALUE(dbKey, SETTING_FILTER_OBJ.instanceID, SETTING_FILTER_OBJ.profileID);

        const container = document.createElement('div'),
              textContainer = document.createElement('div'),
              title = document.createElement('div'),
              input = document.createElement('input');

        container.classList.add('textfield-input');
        container.classList.add('custom-input');
        container.classList.add('dynamic-param-input');
        container.appendChild(textContainer);

        textContainer.appendChild(title);

        title.classList.add('input-title');
        title.innerText = titleText;

        if(existingDbValue) setInputValue(input, existingDbValue);

        input.dataset.key = dbKey;
        input.dataset.defaultValue = '';
        input.placeholder = '--name=value';
        input.type = 'textfield';
        input.classList.add('direct-ees-input');
        
        container.appendChild(input);

        return container;
    }

    for(const engine of engines) {
        const engineId = String(engine.engineId);
        const alreadyExistingItem = dropdownListContainer.querySelector(`[data-value="${engineId}"]`);

        if(alreadyExistingItem) {
            if(engine.engineId === selectedEngineID) {
                alreadyExistingItem.click();
                foundSelectedEngineID = true;
            }

            continue;
        }

        const item = document.createElement('div');
        item.className = 'dropdown-item large';
        item.dataset.value = engineId;

        if(engine.engineId === selectedEngineID) {
            item.classList.add(selectedItemClass);
            foundSelectedEngineID = true;
        }
        
        const headerDiv = document.createElement('div');
        headerDiv.textContent = `${engine?.title || ''} `;
        
        const typeTag = document.createElement('span');
        typeTag.className = 'engine-type-tag list-tag';
        typeTag.textContent = engine?.name || '';
        
        headerDiv.appendChild(typeTag);

        const small = document.createElement('small');
        small.textContent = GET_NICE_PATH(engine?.path);

        item.appendChild(headerDiv);
        item.appendChild(small);

        dropdownListContainer.appendChild(item);

        const engineSettingsContainer = document.createElement('div');
        engineSettingsContainer.className = 'direct-engine-settings-container';
        
        const paramsInputContainer = await createParamsInput('Launch parameters', engineId);
        const paramsInput = paramsInputContainer.querySelector('input');

        engineSettingsContainer.appendChild(paramsInputContainer);
        dropdownListContainer.appendChild(engineSettingsContainer);

        initializeSettingInputElem(paramsInput, true);
    }

    if(!foundSelectedEngineID) {
        setTimeout(() => {
            dropdownListContainer?.firstChild?.click();
        }, 100);
    } else if(!foundSelectedEngineID && selectedEngineID) {
        const notAvailableText = TRANS_OBJ?.noExternalEngineAnymore ?? 'The previously selected EXTERNAL engine is not available anymore. Select a new one.';

        toast.warning(`${notAvailableText}${selectedEngineID ? `\n\n(ID: ${selectedEngineID})` : ''}`, 5000);
        input.value = '';

        toggleDropdown();

        setTimeout(() => {
            input.dispatchEvent(new Event('change'));
        }, 100);
    }
}

export function setIsExternalEngineSettingActive(value) {
    IS_EXTERNAL_ENGINE_SETTING_ACTIVE[SETTING_FILTER_OBJ.profileID] = value;

    localStorage.setItem(EE_ACTIVE_STORAGE_KEY, JSON.stringify(IS_EXTERNAL_ENGINE_SETTING_ACTIVE));
}

async function removeOldExternalEngineSettings() {
    const profileNamesAtLaunchTime = await GET_PROFILE_NAMES();

    if(!profileNamesAtLaunchTime) return;

    Object.keys(IS_EXTERNAL_ENGINE_SETTING_ACTIVE).forEach(profileName => {
        if(!profileNamesAtLaunchTime.includes(profileName))
            delete IS_EXTERNAL_ENGINE_SETTING_ACTIVE[profileName];
    });
}

removeOldExternalEngineSettings();