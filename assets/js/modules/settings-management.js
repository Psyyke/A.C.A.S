// settings-management.js
// Handles settings UI, state, and logic for the A.C.A.S GUI.
// Part of the modular ES6 codebase in assets/js/modules/.
// Works with config-management.js and profile-management.js.

// Settings management and UI state handling for A.C.A.S GUI
import { domElements } from './dom-elements.js';

/**
 * Handle a change to a settings value and update the UI accordingly.
 * @param {Object} params
 * @returns {Promise<void>}
 */
export async function handleSettingChange({
  key,
  value,
  valueExists,
  settingFilterObj,
  lastProfileID,
  updateSettingsValues,
  startPictureInPicture
}) {
  switch (key) {
    case 'backgroundTexture':
      domElements.acasInstanceContainer.className = value;
      console.log('[Setting Handler] Set background texture to', value || 'nothing');
      break;
    case 'ttsVoiceEnabled':
      if (valueExists) {
        domElements.ttsNameDropdownElem.classList.remove('disabled-input');
        domElements.ttsSpeedRangeElem.classList.remove('disabled-input');
      } else {
        domElements.ttsNameDropdownElem.classList.add('disabled-input');
        domElements.ttsSpeedRangeElem.classList.add('disabled-input');
      }
      break;
    case 'chessEngine':
      if (value === 'lc0') {
        domElements.chessVariantDropdown.classList.add('hidden');
        domElements.engineEloInput.classList.add('hidden');
        domElements.engineNodesInput.classList.remove('hidden');
        domElements.lc0WeightDropdown.classList.remove('hidden');
      } else {
        domElements.chessVariantDropdown.classList.remove('hidden');
        domElements.engineEloInput.classList.remove('hidden');
        domElements.engineNodesInput.classList.add('hidden');
        domElements.lc0WeightDropdown.classList.add('hidden');
      }
      if (value === 'maia2') {
        domElements.advancedEloEnableInput.checked = false;
        domElements.advancedEloInputs.forEach(input => input.setAttribute('disabled', 'true'));
        domElements.normalEloInput.removeAttribute('disabled');
      } else {
        domElements.advancedEloEnableInput.removeAttribute('disabled');
        domElements.advancedEloInputs.forEach(input => input.removeAttribute('disabled'));
      }
      break;
    case 'chessEngineProfile':
      settingFilterObj.profileID = value;
      if (value !== 'default') {
        domElements.deleteProfileBtn.style.visibility = 'revert';
      } else {
        domElements.deleteProfileBtn.style.visibility = 'hidden';
      }
      if (lastProfileID !== value) {
        lastProfileID = value;
        updateSettingsValues();
      }
      break;
    case 'pip':
      window.pipActive = value;
      if (value) startPictureInPicture();
      else if (document.pictureInPictureElement) await document.exitPictureInPicture();
      break;
    case 'pipBoard':
      const hasBeenSetBefore = typeof window.pipBoardActive === 'boolean';
      window.pipBoardActive = value;
      if (hasBeenSetBefore && window.pipActive) {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        startPictureInPicture();
      }
      break;
    // ...add more cases as needed
  }
  return lastProfileID;
}
