import { dynamicSettingsContainer, dynamicEngineSettingNoResultText } from './elementDeclarations.js';
import { setInputValue, initializeSettingInputElem } from './domInputs.js';
import { scheduleSettingsUpdate } from './settings.js';
import { initializeDropdown } from './domDropdown.js';

const dynamicOptionValues = {};
const dynamicOptionsWaiters = {};
let dynamicOptionsReady = {};

export function resetDynamicOptionsReady() {
    dynamicOptionsReady = {};
}

export function setDynamicOptionsReady(profileName) {
    dynamicOptionsReady[profileName] = true;

    const waiters = dynamicOptionsWaiters[profileName];

    if(waiters) {
        waiters.forEach(({ resolve }) => resolve());
        delete dynamicOptionsWaiters[profileName];
    }
}

export function onDynamicOptionsReady(profileName, timeout = 5000) {
    if(dynamicOptionsReady[profileName]) {
        return Promise.resolve();
    }

    if(!dynamicOptionsWaiters[profileName])
        dynamicOptionsWaiters[profileName] = [];

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            dynamicOptionsWaiters[profileName] = dynamicOptionsWaiters[profileName]
                .filter(w => w.resolve !== resolve);

            reject(new Error(`Timeout waiting for profile "${profileName}", did not receive UCI options from engine!`));
        }, timeout);

        dynamicOptionsWaiters[profileName].push({
            resolve: () => {
                clearTimeout(timer);
                resolve();
            },
            reject
        });
    });
}

function setDynamicOption(dbKey, value, profileName) {
    if(!dynamicOptionValues[profileName]) {
       dynamicOptionValues[profileName] = {};
    }

    dynamicOptionValues[profileName][dbKey] = value;
}

export function getDynamicOption(dbKey, profileName) {
    const value = dynamicOptionValues?.[profileName]?.[dbKey];

    if(value) return value;
}

export function getDynamicEngineDbKeyPrefix(engineId) {
    return `DYNAMIC_${engineId}_`;
}

function getDynamicEngineSettingDatasetKey(engineId, profileName) {
    return `DYNAMIC_${engineId}_${profileName}`;
}

export function ensureOneDynamicEngineSettingVisible(engineId) {
    const dynamicEngineSettingContainers = [...document.querySelectorAll('.dynamic-setting-profile-container')];

    let didShowAtLeastOne = false;

    dynamicEngineSettingContainers.forEach(container => {
        const currentCorrectKey = getDynamicEngineSettingDatasetKey(engineId, SETTING_FILTER_OBJ.profileID);

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

export async function fillDynamicEngineOptionContainer(uciMsg, profileName) {
    let { name, type, def, min, max, vars } = PARSE_UCI_OPTION(uciMsg);
    const currentEngineId = await GET_ACTIVE_ENGINE_NAME(profileName);
    const dbKey = getDynamicEngineDbKeyPrefix(currentEngineId) + name.replaceAll(' ', '-');

    const existingDbValue = await GET_GM_CFG_VALUE(dbKey, SETTING_FILTER_OBJ.instanceID, profileName);
    const profileContainerId = getDynamicEngineSettingDatasetKey(currentEngineId, profileName);

    const defaultValue = def === null ? '' : def;
    const inputValue = existingDbValue ? existingDbValue : defaultValue;

    setDynamicOption(dbKey, { name, defaultValue }, profileName);

    let profileContainer = dynamicSettingsContainer.querySelector(`.dynamic-setting-profile-container[data-id="${profileContainerId}"]`);
    if(!profileContainer) {
        profileContainer = document.createElement('div');
        profileContainer.classList.add('dynamic-setting-profile-container');
        profileContainer.dataset.id = profileContainerId;

        if(profileName !== SETTING_FILTER_OBJ.profileID)
            profileContainer.classList.add('hidden');

        dynamicSettingsContainer.appendChild(profileContainer);
    }

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

                if(min && max) {
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
                const dropdownContainer = document.createElement('div');
                const dropdownIcon = document.createElement('div');
                const dropdownListContainer = document.createElement('div');

                dropdownContainer.classList.add('dropdown-input-container');
                dropdownIcon.classList.add('dropdown-icon');
                dropdownListContainer.classList.add('dropdown-list-container');

                dropdownContainer.appendChild(input);
                dropdownContainer.appendChild(dropdownIcon);
                dropdownContainer.appendChild(dropdownListContainer);

                vars.forEach(v => {
                    dropdownListContainer.appendChild(createDropdownItem(v.replaceAll(' ', '')));
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