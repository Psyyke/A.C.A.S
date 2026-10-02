import { dynamicSettingsContainer, dynamicEngineSettingNoResultText } from './elementDeclarations.js';
import { setInputValue, initializeSettingInputElem } from './domInputs.js';
import { scheduleSettingsUpdate } from './settings.js';
import { initializeDropdown } from './domDropdown.js';
import { setDynamicOption, getDynamicEngineDbKeyPrefix } from './dynamicEngineOptionState.js';
export { resetDynamicOptionsReady, setDynamicOptionsReady, onDynamicOptionsReady,
    setDynamicOption, getDynamicOption, getDynamicEngineDbKeyPrefix } from './dynamicEngineOptionState.js';

function getDynamicEngineSettingDatasetKey(engineId, profileName) {
    // Engine messages use decoded names; profile tabs use storage keys.
    return `DYNAMIC_${engineId}_${GET_PROFILE_STORAGE_KEY(profileName)}`;
}

export function ensureOneDynamicEngineSettingVisible(engineId) {
    if(engineId === undefined) {
        const isExternal = document.querySelector('input[data-key="useExternalChessEngine"]')?.checked;
        engineId = document.querySelector(`input[data-key="${isExternal ? 'externalChessEngine' : 'chessEngine'}"]`)?.value;
    }

    const dynamicEngineSettingContainers = [...document.querySelectorAll('.dynamic-setting-profile-container')];
    const currentCorrectKey = getDynamicEngineSettingDatasetKey(engineId, SETTING_FILTER_OBJ.profileID);

    let didShowAtLeastOne = false;

    dynamicEngineSettingContainers.forEach(container => {
        if(container.dataset.id === currentCorrectKey) {
            container.classList.remove('hidden');
            didShowAtLeastOne = true;
        } else {
            container.classList.add('hidden');
        }
    });

    if(didShowAtLeastOne)
        dynamicEngineSettingNoResultText.classList.add('hidden');
    else
        dynamicEngineSettingNoResultText.classList.remove('hidden');
}

export async function fillDynamicEngineOptionContainer(uciMsg, profileName, instanceID = SETTING_FILTER_OBJ.instanceID, loadedEngineId) {
    // PARSE_UCI_OPTION returns null for a line with no type token and throws on
    // over-long ones. The caller doesn't await this, so either used to escape as an
    // unhandled rejection and leave the settings panel half built.
    let parsedOption = null;

    try {
        parsedOption = PARSE_UCI_OPTION(uciMsg);
    } catch(e) {
        console.warn('Skipping unparsable UCI option:', uciMsg, e?.message);
        return;
    }

    if(!parsedOption?.name) return;

    let { name, type, def, min, max, vars } = parsedOption;
    const currentEngineId = loadedEngineId ?? (await GET_GM_CFG_VALUE('useExternalChessEngine', instanceID, profileName)
        ? await GET_GM_CFG_VALUE('externalChessEngine', instanceID, profileName)
        : await GET_GM_CFG_VALUE('chessEngine', instanceID, profileName));
    const dbKey = getDynamicEngineDbKeyPrefix(currentEngineId) + name.replaceAll(' ', '-');

    // Inputs edit the saved fallback, never the live value produced by a curve.
    const existingDbValue = await GET_GM_CFG_BASE_VALUE(dbKey, instanceID, profileName);
    const profileContainerId = getDynamicEngineSettingDatasetKey(currentEngineId, profileName);

    const defaultValue = def === null ? '' : def;
    const inputValue = existingDbValue ?? defaultValue;

    setDynamicOption(dbKey, { name, defaultValue, type, min, max, vars }, profileName, instanceID);

    let profileContainer = dynamicSettingsContainer.querySelector(`.dynamic-setting-profile-container[data-id="${profileContainerId}"]`);
    if(!profileContainer) {
        profileContainer = document.createElement('div');
        profileContainer.classList.add('dynamic-setting-profile-container');
        profileContainer.dataset.id = profileContainerId;
        profileContainer.dataset.profileId = GET_PROFILE_STORAGE_KEY(profileName);

        if(GET_PROFILE_STORAGE_KEY(profileName) !== GET_PROFILE_STORAGE_KEY(SETTING_FILTER_OBJ.profileID))
            profileContainer.classList.add('hidden');

        dynamicSettingsContainer.appendChild(profileContainer);
    }

    // Options can arrive after the profile-switch visibility check has run.
    ensureOneDynamicEngineSettingVisible();

    const doesOptionAlreadyExist = profileContainer.querySelector(`*[data-key="${dbKey}"]`);
    if(doesOptionAlreadyExist) return;

    const createDropdownItem = value => {
        const item = document.createElement('div');

        item.classList.add('dropdown-item');
        item.dataset.value = value;
        item.innerText = value;

        return item;
    };

    const createInput = () => {
        const container = document.createElement('div'),
              textContainer = document.createElement('div'),
              title = document.createElement('div'),
              subtitle = document.createElement('div'),
              input = document.createElement('input');

        container.classList.add('custom-input');
        container.appendChild(textContainer);

        textContainer.appendChild(title);
        textContainer.appendChild(subtitle);

        title.classList.add('input-title');
        title.innerText = name;

        subtitle.classList.add('input-subtitle');
        subtitle.innerText = TRANS_OBJ?.desInputSubtitle ?? 'Dynamically added setting';
    
        input.dataset.key = dbKey;
        input.dataset.defaultValue = defaultValue;

        switch(type) {
            case 'string':
                container.classList.add('textfield-input');
                input.type = 'textfield';
                container.appendChild(input);

                break;

            case 'spin':
                container.classList.add('textfield-input');
                input.type = 'textfield';

                input.dataset.spin = true;

                // A spin option can legitimately start at 0, which is falsy and used to
                // drop both the clamp and the range label
                if(min != null && max != null) {
                    input.dataset.between = `${min}-${max}`;
                    title.innerText = title.innerText + ` (${min} - ${max})`;
                }

                container.appendChild(input);

                break;

            case 'check':
                const checkboxContainer = document.createElement('div');
                const checkboxFillElem = document.createElement('div');

                checkboxFillElem.innerText = '✔';
                checkboxFillElem.classList.add('checkbox-fill');
                checkboxContainer.classList.add('checkbox-container');
                container.classList.add('checkbox-input');
                input.type = 'checkbox';

                checkboxContainer.appendChild(input);
                checkboxContainer.appendChild(checkboxFillElem);
                container.appendChild(checkboxContainer);
        
                break;

            case 'combo':
                input.type = 'text';
                input.setAttribute('additional-type', 'dropdown');
                const dropdownContainer = document.createElement('div');
                const dropdownIcon = document.createElement('div');
                const dropdownListContainer = document.createElement('div');

                dropdownContainer.classList.add('dropdown-input-container');
                dropdownIcon.classList.add('dropdown-icon');
                dropdownListContainer.classList.add('dropdown-list-container');

                dropdownContainer.appendChild(input);
                dropdownContainer.appendChild(dropdownIcon);
                dropdownContainer.appendChild(dropdownListContainer);

                // A combo option without any var tokens leaves vars undefined
                (vars ?? []).forEach(v => {
                    dropdownListContainer.appendChild(createDropdownItem(v));
                });

                container.classList.add('dropdown-input');

                initializeDropdown(dropdownContainer);

                container.appendChild(dropdownContainer);

                break;

            case 'button':
                const btn = document.createElement('button');
                btn.classList.add('acas-fancy-button');
                btn.classList.add('dynamic-setting-button');
                btn.title = name;
                btn.innerText = '⚡';
                btn.dataset.key = dbKey;

                const buttonPressChannel = new BroadcastChannel(DYNAMIC_BUTTONPRESS_BROADCAST_NAME);

                btn.onclick = () => {
                    buttonPressChannel.postMessage({
                        'uciOptionName': name,
                        profileName
                    });
                };

                container.classList.add('button-input');
                container.appendChild(btn);

                break;
        }

        setInputValue(input, inputValue, min, max);

        scheduleSettingsUpdate(10);

        return container;
    };

    const settingElem = createInput();
    const settingElemInput = settingElem.querySelector('input');

    profileContainer.appendChild(settingElem);

    initializeSettingInputElem(settingElemInput, true);
}