// dom-elements.js
// Centralized DOM element selectors for the A.C.A.S GUI.
// Part of the modular ES6 codebase in assets/js/modules/.
// Used by all modules that interact with the DOM.

/**
 * Centralized DOM element selectors for the A.C.A.S GUI.
 * @type {Object<string, HTMLElement|NodeListOf<HTMLElement>>}
 */
export const domElements = {
  acasInstanceContainer: document.querySelector('#acas-instance-container'),
  noInstancesContainer: document.querySelector('#no-instances-container'),
  settingsContainerElem: document.querySelector('#acas-settings-container'),
  settingsHeaderElem: document.querySelector('#settings-header'),
  settingsNavbarContainerElem: document.querySelector('#settings-navbar-container'),
  settingsNavbarElem: document.querySelector('#settings-navbar'),
  settingsPanelsElem: document.querySelector('#settings-panels'),
  settingsNavbarSubtitleElem: document.querySelector('#settings-navbar-subtitle'),
  settingsNavbarGlobalElem: document.querySelector('#settings-navbar-global'),
  settingsInstanceDropdownElem: document.querySelector('#settings-navbar-instance'),
  settingsInstanceDropdownContentElem: document.querySelector('#settings-navbar-instance .dropdown-content'),
  installNotificationElem: document.querySelector('#install-notification'),
  tosContainerElem: document.querySelector('#tos-container'),
  tosCheckboxElem: document.querySelector('#tos-checkbox'),
  tosContinueBtnElem: document.querySelector('#tos-continue-button'),
  importSettingsBtn: document.querySelector('#import-settings-btn'),
  exportSettingsBtn: document.querySelector('#export-settings-btn'),
  resetSettingsBtn: document.querySelector('#reset-settings-btn'),
  bodyBlurOverlayElem: document.querySelector('#blur-overlay'),
  themeColorInput: document.querySelector('input[data-key="themeColorHex"]'),
  boardColorInput: document.querySelector('input[data-key="boardColorHex"]'),
  noInstancesSitesElem: document.querySelector('#no-instances-sites'),
  seeSupportedSitesBtn: document.querySelector('#see-supported-sites-btn'),
  ttsNameDropdownElem: document.querySelector('#tts-name-dropdown'),
  ttsSpeedRangeElem: document.querySelector('#tts-speed-range'),
  userscriptInfoElem: document.querySelector('#userscript-info-small'),
  updateYourUserscriptElem: document.querySelector('#update-your-userscript-notification'),
  instanceSizeChangeContainerElem: document.querySelector('#instance-size-change-container'),
  decreaseInstanceSizeBtn: document.querySelector('#decrease-instance-size-btn'),
  increaseInstanceSizeBtn: document.querySelector('#increase-instance-size-btn'),
  chessVariantDropdown: document.querySelector('#chess-variant-dropdown'),
  engineEloInput: document.querySelector('#engine-elo-input'),
  lc0WeightDropdown: document.querySelector('#lc0-weight-dropdown'),
  engineNodesInput: document.querySelector('#engine-nodes-input'),
  addNewProfileBtn: document.querySelector('#add-new-profile-button'),
  profileDropdown: document.querySelector('#chess-engine-profile-dropdown'),
  deleteProfileBtn: document.querySelector('#delete-profile-button'),
  floatyButtons: document.querySelectorAll('.open-floaty-btn'),
  floatingPanelVideoElem: document.querySelector('#floating-panel-video'),
  floatingFloaty: document.querySelector('#floating-floaty'),
  advancedEloEnableInput: document.querySelector('input[data-key="enableAdvancedElo"]'),
  advancedEloInputs: [...document.querySelectorAll('#elo-floaty .setting-panel input')],
  normalEloInput: document.querySelector('input[data-key="engineElo"]'),
  chessEngineInput: document.querySelector('input[data-key="chessEngine"]'),
};
