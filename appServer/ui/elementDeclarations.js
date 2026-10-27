// This renderer uses classic scripts, separately from the web GUI's ES modules.
// Keep fixed page elements here and runtime-created console/card queries local.
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const engineUiGrid = document.getElementById('engineGrid');
const portDisplay = document.getElementById('portDisplay');
const portSettingsBtn = document.getElementById('portSettingsBtn');
const portSettingsDialog = document.getElementById('portSettingsDialog');
const portSettingsForm = document.getElementById('portSettingsForm');
const serverPortInput = document.getElementById('serverPortInput');
const portSettingsCancel = document.getElementById('portSettingsCancel');
const portSettingsSave = document.getElementById('portSettingsSave');
const statusDot = document.getElementById('statusDot');
const consolesContainer = document.getElementById('consoles-container');
const addEngineBtn = document.getElementById('addEngineBtn');
const engineFilePicker = document.getElementById('filePicker');
const engineSummary = document.getElementById('engineSummary');
const panelsToggle = document.getElementById('panelsToggle');
const serverVersionTagElem = document.getElementById('acas-version-tag');