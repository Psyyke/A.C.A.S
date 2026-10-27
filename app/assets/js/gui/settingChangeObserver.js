import { acasInstanceContainer, ttsNameDropdownElem, ttsSpeedRangeElem, chessVariantDropdown, enemyEloInputContainer,
  engineEloInput, lc0WeightDropdown, chess960Checkbox, advancedEloEnableInput, normalEloInput, basicAdvancedSettingsPanel,
  chessEngineInput, engineNodesInput, advancedEloDepthInput, chessEngineDropdown, dynamicSettingsContainer,
  learningPvAnimationInput, stopAnimationSettingElem, learningModeInput, learningHintsContainerElem,
  reverseSideInput } from './elementDeclarations.js';
import { connectAcasToServer, disconnectAcasFromServer } from '../AcasWebSocketClient.js';
import { ensureOneDynamicEngineSettingVisible } from './dynamicEngineOptions.js';
import { setIsExternalEngineSettingActive } from './externalEngine.js';
import { setProfileBubbleStatus } from './profiles.js';
import { startPictureInPicture } from './pip.js';
import { getInputValue } from './domInputs.js';
import { initMediaSession } from './media.js';
import { setThemeColorHex } from '../gui.js';
import { updateCustomBackgroundControls, setCustomBackgroundBlur } from './customBackground.js';

const processedElems = [];

function setAdvancedEloCheckboxChecked(isChecked) {
    const isUsingExternalEngine = IS_EXTERNAL_ENGINE_SETTING_ACTIVE[SETTING_FILTER_OBJ.profileID];

    if(isUsingExternalEngine) return;

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
    const alreadyProcessed = processedElems.findLast(([elem]) => elem === inputElem)?.[1] === value;

    if(alreadyProcessed && inputElem.dataset.key === 'pip')
        return;

    switch(inputElem.dataset.key) {
        case 'learningPvAnimation':
        case 'learningPvAnimationStopOnEnemyMove':
        case 'learningMode':
        case 'feedbackInPip':
        case 'feedbackMoveCounts':
        case 'enableMoveRatings':
        case 'enableEnemyFeedback': {
            const learningMode = Boolean(learningModeInput?.checked);

            [
                [learningPvAnimationInput, !learningMode],
                [stopAnimationSettingElem?.querySelector('input'), !learningMode || !learningPvAnimationInput?.checked]
            ].forEach(([input, disabled]) => {
                const setting = input?.closest('.custom-input');
                if(!setting) return;

                setting.inert = disabled;
                setting.setAttribute('aria-disabled', String(disabled));
                input.disabled = disabled;
            });

            const feedbackDisabled = learningMode || !['enableMoveRatings', 'enableEnemyFeedback']
                .some(key => document.querySelector(`#feedback-floaty input[data-key="${key}"]`)?.checked);

            // Keep Learning Mode interactive so it can always be turned off.
            // Only move feedback is overridden while learning mode is active.
            document.querySelectorAll('#feedback-floaty .move-feedback-settings')
                .forEach(setting => {
                    setting.inert = Boolean(learningMode);
                    setting.setAttribute('aria-disabled', String(Boolean(learningMode)));
                    setting.querySelectorAll('input').forEach(input => { input.disabled = Boolean(learningMode); });
                });

            ['feedbackInPip', 'feedbackMoveCounts', 'feedbackEmojis', 'feedbackOnExternalSite', 'feedbackEngineDepth'].forEach(key => {
                const input = document.querySelector(`#feedback-floaty input[data-key="${key}"]`);
                if(!input) return;

                const setting = input.closest('.custom-input');
                const disabled = feedbackDisabled || key === 'feedbackMoveCounts'
                    && !document.querySelector('#feedback-floaty input[data-key="feedbackInPip"]')?.checked;
                setting.inert = disabled;
                setting.setAttribute('aria-disabled', String(disabled));
                input.disabled = disabled;
            });

            break;
        }
        case 'chessFont': {
            const container = learningHintsContainerElem;
            const font = FORMAT_CHESS_FONT(value);

            ['staunty', 'merida', 'cburnett', 'letters'].forEach(name =>
                container?.classList.toggle(name, name === font));
            break;
        }
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
            updateCustomBackgroundControls(value);

            console.log('[Setting Handler] Set background texture to', value || 'nothing');

            break;
        case 'customBackgroundBlur':
            setCustomBackgroundBlur(value);

            break;
        case 'ttsVoiceEnabled':
        case 'ttsAnnounceEnemyMoves':
        case 'ttsAnnounceEvaluation':
            if(['ttsVoiceEnabled', 'ttsAnnounceEnemyMoves', 'ttsAnnounceEvaluation']
                .some(key => document.querySelector(`input[data-key="${key}"]`)?.checked)) {
                ttsNameDropdownElem.classList.remove('disabled-input');
                ttsSpeedRangeElem.classList.remove('disabled-input');
            } else {
                ttsNameDropdownElem.classList.add('disabled-input');
                ttsSpeedRangeElem.classList.add('disabled-input');
            }
            break;
        case 'chessEngine':
            const eloInput = engineEloInput.querySelector('input[data-key="engineElo"]');
            const oppMoveGuessInputContainer = document.querySelector('input[data-key="showOpponentMoveGuess"]')
                ?.parentElement?.parentElement?.parentElement;
            const isMaiaEngine = value && value.includes('maia');
            const enginesWithoutAdvancedElo = ['maia2', 'maia3'];
            const isExternal = IS_EXTERNAL_ENGINE_SETTING_ACTIVE[SETTING_FILTER_OBJ.profileID];

            ensureOneDynamicEngineSettingVisible();

            if(isExternal) {
                chess960Checkbox.classList.remove('hidden');
                enemyEloInputContainer.classList.add('hidden');
                lc0WeightDropdown.classList.add('hidden');

                break;
            }

            if(value !== 'fairy-stockfish-nnue-wasm') chessVariantDropdown.classList.add('hidden');
            else chessVariantDropdown.classList.remove('hidden');

            if(isMaiaEngine) {
                chess960Checkbox.classList.add('hidden');
                enemyEloInputContainer.classList.remove('hidden');
                oppMoveGuessInputContainer?.classList?.add('disabled');
            } else {
                chess960Checkbox.classList.remove('hidden');
                enemyEloInputContainer.classList.add('hidden');
                oppMoveGuessInputContainer?.classList?.remove('disabled');
            }

            if(value === 'lc0') {
                eloInput.classList.add('disable-elo');
                lc0WeightDropdown.classList.remove('hidden');
                chess960Checkbox.classList.add('hidden');
                
                setAdvancedEloCheckboxChecked(true);
            } else {
                eloInput.classList.remove('disable-elo');
                lc0WeightDropdown.classList.add('hidden');
            }

            if(enginesWithoutAdvancedElo.includes(value)) {
                setAdvancedEloCheckboxChecked(false);
                normalEloInput.removeAttribute('disabled');
            } else if(value !== 'lc0') {
                advancedEloEnableInput.removeAttribute('disabled');
            }

            break;
        case 'externalChessEngine':
            ensureOneDynamicEngineSettingVisible();

            break;
        case 'useExternalChessEngine':
            window.useExternalEngine = value;
            setIsExternalEngineSettingActive(value);
            ensureOneDynamicEngineSettingVisible();

            if(IS_EXTERNAL_ENGINE_SETTING_ACTIVE[SETTING_FILTER_OBJ.profileID]) {
                chessEngineDropdown.classList.add('blurred');
                advancedEloEnableInput.removeAttribute('disabled');
            } else {
                chessEngineDropdown.classList.remove('blurred');
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
            if(value) {
                if(!document.pictureInPictureElement) startPictureInPicture();
            } else {
                if(document.pictureInPictureElement) {
                    try {
                        await document.exitPictureInPicture();
                    } catch(error) {
                        console.error('[PiP] Could not close the floating panel:', error);
                    }
                }
                initMediaSession();
            }

            break;
        case 'pipBoard':
            if(wasCalledByUpdateLoop) return;

            startPictureInPicture();

            break;
        case 'pipQuality':
        case 'pipSan':
            if(processedElems.findLast(([elem]) => elem === inputElem)?.[1] !== value)
                window.REFRESH_PIP_DISPLAY?.();

            break;
        case 'alwaysMyTurn':
            const inputValue = reverseSideInput;

            if(value) inputValue.removeAttribute('disabled');
            else inputValue.setAttribute('disabled', 'true');

            break;
        case 'enableAdvancedElo':
            if(!normalEloInput) return;

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
                dynamicSettingsContainer.classList.remove('blurred');
                basicAdvancedSettingsPanel
                    .querySelectorAll('.custom-input')
                    .forEach(elem => elem.classList.remove('blurred'));
            }
            else {
                dynamicSettingsContainer.classList.add('blurred');
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
        case 'chessEngineProfile':
            const showRenderingSettings = SETTING_FILTER_OBJ.profileID === 'default';

            [...document.querySelectorAll('.only-default-profile-setting')].forEach(x => {
                showRenderingSettings ? x.classList.remove('disabled') : x.classList.add('disabled');
            });

            break;
    }

    processedElems.push([inputElem, value]);
}, delayMs); }