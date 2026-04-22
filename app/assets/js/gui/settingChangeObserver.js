import { acasInstanceContainer, ttsNameDropdownElem, ttsSpeedRangeElem, chessVariantDropdown, enemyEloInputContainer,
  engineEloInput, lc0WeightDropdown, chess960Checkbox, advancedEloEnableInput, normalEloInput, basicAdvancedSettingsPanel,
  chessEngineInput, externalChessEngineDropdown, engineNodesInput, advancedEloDepthInput, chessEngineDropdown } from './elementDeclarations.js';
import { connectAcasToServer, disconnectAcasFromServer } from '../AcasWebSocketClient.js';
import { ensureOneDynamicEngineSettingVisible } from './dynamicEngineOptions.js';
import { setIsExternalEngineSettingActive } from './externalEngine.js';
import { setProfileBubbleStatus } from './profiles.js';
import { startPictureInPicture } from './pip.js';
import { getInputValue } from './domInputs.js';
import { initMediaSession } from './media.js';
import { setThemeColorHex } from '../gui.js';


const processedElems = [];

function disableAdvancedEloCheckbox(isChecked) {
    const shouldDispatchEvent = advancedEloEnableInput.checked !== isChecked;

    advancedEloEnableInput.checked = isChecked;
    advancedEloEnableInput.disabled = true;

    if(shouldDispatchEvent) {
        advancedEloEnableInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

export function runSettingChangeObserver(inputElem, delayMs = 0, wasCalledByUpdateLoop) { setTimeout(async () => {
    const value = getInputValue(inputElem);
    const valueExists = typeof value === 'boolean' || value;
    const alreadyProcessed = processedElems.find(arr => {
        const elem = arr[0],
              val = arr[1];
            
        return elem === inputElem && val === value;
    });

    if(alreadyProcessed && inputElem.dataset.key === 'pip')
        return;

    switch(inputElem.dataset.key) {
        case 'themeColorHex':
            setThemeColorHex(value);
            console.log('[Setting Handler] Set theme color to', value || 'nothing');

            break;
        case 'boardColorHex':
            ADD_STYLES_TO_DOC(`cg-board {
                background-color: ${value} !important;
            }`, 'boardColorHexCss');

            console.log('[Setting Handler] Set board bg color to', value || 'nothing');

            break;
        case 'backgroundTextureClass':
            acasInstanceContainer.className = value;

            console.log('[Setting Handler] Set background texture to', value || 'nothing');

            break;
        case 'ttsVoiceEnabled':
            if(valueExists) {
                ttsNameDropdownElem.classList.remove('disabled-input');
                ttsSpeedRangeElem.classList.remove('disabled-input');
            } else {
                ttsNameDropdownElem.classList.add('disabled-input');
                ttsSpeedRangeElem.classList.add('disabled-input');
            }
            break;
        case 'chessEngine':
            const eloInput = engineEloInput.querySelector('input[data-key="engineElo"]');
            const isMaiaEngine = value && value.includes('maia');
            const enginesWithoutAdvancedElo = ['maia2', 'maia3', 'fairy-stockfish-nnue-wasm'];

            if(value !== 'fairy-stockfish-nnue-wasm') chessVariantDropdown.classList.add('hidden');
            else chessVariantDropdown.classList.remove('hidden');

            if(isMaiaEngine) {
                chess960Checkbox.classList.add('hidden');
                enemyEloInputContainer.classList.remove('hidden');
            } else {
                chess960Checkbox.classList.remove('hidden');
                enemyEloInputContainer.classList.add('hidden');
            }

            if(value === 'lc0') {
                eloInput.classList.add('disable-elo');
                lc0WeightDropdown.classList.remove('hidden');

                disableAdvancedEloCheckbox(true);
            } else {
                eloInput.classList.remove('disable-elo');
                lc0WeightDropdown.classList.add('hidden');
            }

            if(enginesWithoutAdvancedElo.includes(value)) {
                disableAdvancedEloCheckbox(false);
                normalEloInput.removeAttribute('disabled');
            } else if (value !== 'lc0') {
                advancedEloEnableInput.removeAttribute('disabled');
            }
            ensureOneDynamicEngineSettingVisible(value);

            break;
        case 'externalChessEngine':
            if(value) {
                ensureOneDynamicEngineSettingVisible(value);
            }

            break;
        case 'useExternalChessEngine':
            window.useExternalEngine = value;
            setIsExternalEngineSettingActive(value);

            if(IS_EXTERNAL_ENGINE_SETTING_ACTIVE[SETTING_FILTER_OBJ.profileID]) {
                chessEngineDropdown.classList.add('blurred');
                externalChessEngineDropdown.classList.remove('blurred');
                advancedEloEnableInput.removeAttribute('disabled');
            } else {
                chessEngineDropdown.classList.remove('blurred');
                externalChessEngineDropdown.classList.add('blurred');
            }

            const isAnyProfileUsingExternal = Object.values(IS_EXTERNAL_ENGINE_SETTING_ACTIVE)
                .find(v => v) ? true : false;

            if(!wasCalledByUpdateLoop) location.reload();
            else {
                if(isAnyProfileUsingExternal) connectAcasToServer();
                else disconnectAcasFromServer();
            }

            break;
        case 'pip':
            if(value && !document.pictureInPictureElement) startPictureInPicture();
            else if(!value) initMediaSession();

            break;
        case 'pipBoard':
            if(wasCalledByUpdateLoop) return;

            startPictureInPicture();

            break;
        case 'enableAdvancedElo':
            if(!normalEloInput) return;

            const dynamicSettingContainer = document.querySelector('#dynamic-engine-settings');
            const incompatibleSettingKeys = [
                'moveSuggestionAmount',
                'useChess960',
                'chessVariant',
                'engineElo'
            ];

            const processIncompatibleSettings = isIncompatible => {
                incompatibleSettingKeys.forEach(key => {
                    const inputValue = document.querySelector(`input[data-key="${key}"]`);

                    if(isIncompatible)
                        inputValue.setAttribute('disabled', 'true');
                    else
                        inputValue.removeAttribute('disabled');
                });
            }

            if(value)  {
                dynamicSettingContainer.classList.remove('blurred');
                basicAdvancedSettingsPanel
                    .querySelectorAll('.custom-input')
                    .forEach(elem => elem.classList.remove('blurred'));
            }
            else {
                dynamicSettingContainer.classList.add('blurred');
                basicAdvancedSettingsPanel
                    .querySelectorAll('.custom-input')
                    .forEach(elem => elem.classList.add('blurred'));
            }

            processIncompatibleSettings(value);

            break;
        case 'engineEnabled':
            if(!value) setProfileBubbleStatus('disabled', SETTING_FILTER_OBJ?.profileID, 'User disabled engine.');
            else setProfileBubbleStatus('idle', SETTING_FILTER_OBJ?.profileID, 'Idle, the engine was just started.');

            break;
        case 'instanceRestartTriggerCode':
            if(wasCalledByUpdateLoop) return;
            
            CREATE_INPUT_LISTENER(
                'instanceRestart',
                value,
                FORCE_CLOSE_ALL_INSTANCES
            );

            window.AcasInstances.forEach(iObj => {
                iObj.instance.CommLink.commands.updateRestartListener(value);
            });

            break;
        case 'concealAssistanceTriggerCode':
            if(wasCalledByUpdateLoop) return;

            CREATE_INPUT_LISTENER(
                'concealAssistance',
                value,
                TOGGLE_CONCEAL_ASSISTANCE
            );

            window.AcasInstances.forEach(iObj => {
                iObj.instance.CommLink.commands.updateConcealAssistanceListener(value);
            });

            break;
        case 'engineNodes':
            if(value === '0') {
                engineNodesInput.parentElement.style.opacity = '0.3';
                advancedEloDepthInput.parentElement.style.opacity = '1';
            } else {
                engineNodesInput.parentElement.style.opacity = '1';
                advancedEloDepthInput.parentElement.style.opacity = '0.3';
            }

            break;
    }

    processedElems.push([inputElem, value]);
}, delayMs); }