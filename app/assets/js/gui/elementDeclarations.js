// Cache fixed page elements here. Keep runtime-created and state-dependent queries local.
export const acasInstanceContainer = document.querySelector('#acas-instance-container');
export const noInstancesContainer = document.querySelector('#no-instances-container');

export const settingsContainerElem = document.querySelector('#acas-settings-container');
export const settingsHeaderElem = document.querySelector('#settings-header');
export const settingsNavbarContainerElem = document.querySelector('#settings-navbar-container');
export const settingsNavbarElem = document.querySelector('#settings-navbar');
export const settingsPanelsElem = document.querySelector('#settings-panels');
export const settingContainerElem = document.querySelector('#setting-container');
export const settingsControlPanelElem = document.querySelector('#settings-control-panel');

export const settingsNavbarSubtitleElem = document.querySelector('#settings-navbar-subtitle');

export const settingsNavbarGlobalElem = document.querySelector('#settings-navbar-global');
export const settingsInstanceDropdownElem = document.querySelector('#settings-navbar-instance');
export const settingsInstanceDropdownContentElem = document.querySelector('#settings-navbar-instance .dropdown-content');

export const installNotificationElem = document.querySelector('#install-notification');

export const tosContainerElem = document.querySelector('#tos-container');
export const tosCheckboxElem = document.querySelector('#tos-checkbox');
export const tosContinueBtnElem = document.querySelector('#tos-continue-button');

export const importSettingsBtn = document.querySelector('#import-settings-btn');
export const exportSettingsBtn = document.querySelector('#export-settings-btn');
export const resetSettingsBtn = document.querySelector('#reset-settings-btn');

export const bodyBlurOverlayElem = document.querySelector('#blur-overlay');

export const themeColorInput = document.querySelector('input[data-key="themeColorHex"]');
export const boardColorInput = document.querySelector('input[data-key="boardColorHex"]');

export const noInstancesSitesElem = document.querySelector('#no-instances-sites');
export const seeSupportedSitesBtn = document.querySelector('#see-supported-sites-btn');

export const ttsNameDropdownElem = document.querySelector('#tts-name-dropdown');
export const ttsSpeedRangeElem = document.querySelector('#tts-speed-range');

export const userscriptInfoElem = document.querySelector('#userscript-info-small');

export const updateYourUserscriptElem = document.querySelector('#update-your-userscript-notification');

export const instanceSizeChangeContainerElem = document.querySelector('#instance-size-change-container');
export const decreaseInstanceSizeBtn = document.querySelector('#decrease-instance-size-btn');
export const increaseInstanceSizeBtn = document.querySelector('#increase-instance-size-btn');

export const chessVariantDropdown = document.querySelector('#chess-variant-dropdown');
export const engineEloInput = document.querySelector('#engine-elo-input');
export const lc0WeightDropdown = document.querySelector('#lc0-weight-dropdown');
export const chess960Checkbox = document.querySelector('#chess960-checkbox');
export const enemyEloInputContainer = document.querySelector('#enemy-elo-input');
export const addNewProfileBtn = document.querySelector('#add-new-profile-button');
export const profileTabs = document.querySelector('#chess-engine-profile-tabs');

export const floatyButtons = document.querySelectorAll('.open-floaty-btn');

export const floatingPanelVideoElem = document.querySelector('#floating-panel-video');
export const floatingFloaty = document.querySelector('#floating-floaty');
export const silenceAudioElem = document.querySelector('#silence-audio');

export const advancedEloEnableInput = document.querySelector('input[data-key="enableAdvancedElo"]');
export const normalEloInput = document.querySelector('input[data-key="engineElo"]');
export const chessEngineInput = document.querySelector('input[data-key="chessEngine"]');
export const engineNodesInput = document.querySelector('input[data-key="engineNodes"]');
export const advancedEloDepthInput = document.querySelector('input[data-key="advancedEloDepth"]');

export const externalChessEngineDropdown = document.querySelector('#external-engine-dropdown');
export const chessEngineDropdown = document.querySelector('#chess-engine-dropdown');
export const externalChessEngineInput = document.querySelector('input[data-key="externalChessEngine"]');
export const useExternalChessEngineInput = document.querySelector('input[data-key="useExternalChessEngine"]');
export const externalEngineServerPortInput = document.querySelector('#external-engine-server-port');
export const installAcasServerTextElem = document.querySelector('#install-acas-server-text');
export const externalEngineDropdownListElem = document.querySelector('#external-engine-dropdown .dropdown-list-container');

export const dynamicSettingsContainer = document.querySelector('#dynamic-engine-settings');
export const dynamicSettingPanelElem = document.querySelector('#dynamic-setting-panel');
export const dynamicEngineSettingNoResultText = document.querySelector('#des-no-result-text');

export const beggingFloaty = document.querySelector('#begging-floaty');

export const userStatElements = document.querySelectorAll('#user-stats-container .user-stat');

export const autoMoveCheckbox = document.querySelector('input[data-key="autoMove"]');
export const hiddenSettingPanel = document.querySelector('#hidden-setting-panel');

export const basicAdvancedSettingsPanel = document.querySelector('#basic-advanced-settings-panel');

export const pipBoardInput = document.querySelector('input[data-key="pipBoard"]');

export const profileListContainerElem = document.querySelector('#chess-engine-profile-tabs .tabs-list-container');

// Appearance and opening books.
export const backgroundTextureInput = document.querySelector('input[data-key="backgroundTextureClass"]');
export const customBackgroundControlsElem = document.querySelector('#custom-background-controls');
export const customBackgroundDialogElem = document.querySelector('#custom-background-floaty');
export const customBackgroundLauncherBtn = document.querySelector('.open-floaty-btn[aria-controls="custom-background-floaty"]');
export const customBackgroundStatusElem = document.querySelector('#custom-background-status');
export const customBackgroundNameInput = document.querySelector('#custom-background-name');
export const customBackgroundFileInput = document.querySelector('#custom-background-file');
export const customBackgroundRemoveBtn = document.querySelector('#custom-background-remove');
export const customBackgroundBlurInput = document.querySelector('#custom-background-blur');

export const bookFileInput = document.querySelector('#book-file');
export const bookFileNameInput = document.querySelector('#book-file-name');
export const bookFileRemoveBtn = document.querySelector('#book-file-remove');

// Settings dialogs and feedback controls.
export const renderingDialogElem = document.querySelector('.floaty-wrapper > #rendering-floaty');
export const engineDialogElem = document.querySelector('.floaty-wrapper > #engine-floaty');
export const learningHintsDialogElem = document.querySelector('#learning-hints-floaty');
export const learningHintsContainerElem = document.querySelector('.learning-hints');
export const learningPvAnimationInput = document.querySelector('#feedback-floaty input[data-key="learningPvAnimation"]');
export const learningModeInput = document.querySelector('#feedback-floaty input[data-key="learningMode"]');
export const stopAnimationSettingElem = document.querySelector('#stop-animation-box');
export const reverseSideInput = document.querySelector('input[data-key="reverseSide"]');

export const webhookMessageTemplateInput = document.querySelector('.webhook-message-template');
export const webhookTemplateHighlightElem = document.querySelector('.webhook-template-highlight');

// Dynamic-settings editor. The IDs also serve as the editor's existing UI keys.
export const dynamicSettingsGraphElem = document.querySelector('#dynamic-settings-graph');
export const dynamicSettingsDialogElem = document.querySelector('#dynamic-settings-floaty');
export const dynamicSettingsBodyElem = document.querySelector('#dynamic-settings-floaty .dynamic-settings-body');
export const dynamicGraphPanelElem = document.querySelector('#dynamic-graph-panel');
export const dynamicEvaluationTabElem = document.querySelector('#dynamic-tab-evaluation');

export const dynamicSettingsElements = Object.fromEntries([
    'dynamic-variable-select', 'dynamic-fullscreen-toggle',
    'dynamic-add-setting', 'dynamic-add-line',
    'dynamic-interpolation', 'dynamic-interpolation-lock', 'dynamic-interpolation-status', 'dynamic-delete-point', 'dynamic-delete-line',
    'dynamic-zoom-in', 'dynamic-zoom-out', 'dynamic-fit-graph',
    'dynamic-current-values', 'dynamic-lines-list', 'dynamic-add-point',
    'dynamic-variable-control', 'dynamic-variable-compact',
    'dynamic-point-x', 'dynamic-point-y', 'dynamic-point-status', 'dynamic-point-choice',
    'dynamic-point-text-control', 'dynamic-point-text', 'dynamic-apply-text'
].map(id => [id, document.getElementById(id)]));

// Resolve at initialization so a log viewer mounted after module loading still works.
export function getActivityLogElements() {
    return {
        dialog: document.getElementById('log-floaty'),
        list: document.getElementById('activity-log-entries'),
        status: document.getElementById('activity-log-status'),
        clear: document.getElementById('activity-log-clear'),
        copy: document.getElementById('activity-log-copy'),
        timeToggle: document.getElementById('activity-log-time-toggle'),
        loggingToggle: document.getElementById('activity-log-toggle'),
        filter: document.getElementById('activity-log-filter'),
        search: document.getElementById('activity-log-search'),
        header: document.querySelector('#log-floaty .floaty-header'),
        filterToggle: document.querySelector('#log-floaty .activity-log-filters summary'),
        filterLabel: document.querySelector('#log-floaty .activity-log-filter-label span'),
        searchLabel: document.querySelector('#log-floaty .activity-log-search-label span'),
        launcher: document.querySelector('.activity-log-launcher .open-floaty-btn'),
        close: document.querySelector('#log-floaty .floaty-close-btn')
    };
}