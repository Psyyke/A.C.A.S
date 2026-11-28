import { featureText } from '../../js/misc/featureTranslations.js';

export const penaStrings = {
    coach: 'A chess coach that explains the position',
    settingsTitle: 'Pena',
    settingsSubtitle: 'Personal Educator & Neural Advisor',
    closeSettings: 'Close Pena settings',
    model: 'Model',
    recommendedModel: 'The recommended Pena model installs automatically when enabled.',
    advancedModels: 'Advanced model tools',
    savedModel: 'Saved model',
    storedBrowser: 'Stored in this browser',
    chooseModel: 'Choose a model',
    savedModelLabel: 'Saved Pena model',
    download: 'Download',
    importFolder: 'Import folder',
    saveBackup: 'Save backup',
    remove: 'Remove',
    cancel: 'Cancel',
    cancelModel: 'Cancel Pena model operation',
    importModel: 'Import Pena browser model folder',
    modelProgress: 'Pena model download progress',
    downloadTitle: 'Download Pena',
    downloadSubtitle: 'Save a model in this browser',
    closeDownload: 'Close Pena download',
    packageUrl: 'Package URL',
    packageHint: 'A converted browser package ending in queen.json',
    packageLabel: 'Pena browser package URL',
    conversation: 'Conversation',
    explanation: 'Explanation',
    dynamic: 'Dynamic',
    brief: 'Brief',
    fullAdvice: 'Full advice',
    explanationHint: 'Dynamic gives more detail, Brief keeps it short',
    hideMoves: "Don't give away moves",
    hideMovesHint: 'Shares ideas instead of moves unless you ask',
    onlyAsked: 'Only talk when asked',
    onlyAskedHint: 'Pena stays quiet until you type or speak to it',
    chattiness: 'Automatic comments',
    chattinessHint: 'How often Pena speaks after moves',
    chattinessQuiet: 'Quiet',
    chattinessNormal: 'Normal',
    chattinessChatty: 'Chatty',
    liveTeaching: 'Live board teaching',
    visualDuration: 'Visual duration (seconds)',
    visualDurationHint: 'How long board marks remain before disappearing',
    voicePause: 'Voice pause (seconds)',
    voicePauseHint: 'Increase the silence before sending, then restart the mic',
    liveTeachingHint: 'Flash squares, pieces and arrows as Pena talks about them',
    futureMoves: 'Play out future moves',
    futureMovesHint: 'Preview future positions over the game board',
    chessCoaching: 'Chess coaching',
    chessCoachingHint: 'Board facts, engines and answer checks. Off talks to the plain model',
    voice: 'Voice',
    readWith: 'Read aloud with',
    off: 'Off',
    browserVoice: 'Browser voice',
    neuralVoice: 'Neural voice',
    zonosVoice: 'ZONOS3 neural voice',
    zonosHint: 'Downloads voice models when needed.',
    zonosFallback: 'ZONOS3 cannot use the GPU. Using browser speech instead.',
    chooseZonosVoice: 'ZONOS voice',
    chooseBrowserVoice: 'Browser voice',
    browserVoiceAuto: 'Automatic English voice',
    browserVoiceHint: 'Voices depend on your browser and system and are shared across boards',
    browserVoiceUnavailable: 'The selected browser voice is unavailable. Choose another voice.',
    savedVoiceUnavailable: 'Saved voice unavailable',
    customZonosHint: 'Use a permitted clip up to 60 seconds / 12 MiB (43 MiB download on first use)',
    importZonosVoice: 'Import voice clip',
    removeZonosVoice: 'Remove selected clip',
    zonosPreparing: 'Preparing ZONOS3',
    zonosLoading: 'Loading ZONOS3: {loaded} / {total} MiB',
    zonosCancelled: 'Voice loading cancelled. It will try again when Pena speaks.',
    zonosError: 'ZONOS3 could not load: {error}',
    defaultVoice: 'LJ Speech (English, US)',
    speechSpeed: 'Speech speed',
    speechSpeedHint: '1 is normal speed',
    speakerId: 'Speaker ID',
    speakerHint: 'Only for voices with several speakers',
    ownVoice: 'Your own voice',
    ownVoiceHint: 'Piper .onnx, .onnx.json and MODEL_CARD',
    uploadVoice: 'Upload voice',
    uploadVoiceLabel: 'Upload your own neural voice',
    removeVoice: 'Remove saved voice',
    voiceProgress: 'Pena voice loading',
    cancelVoice: 'Cancel Pena voice loading',
    preparing: 'Preparing',
    installedVoice: '{name} (installed)',
    removeVoiceConfirm: 'Remove your uploaded voice?',
    modelCancelled: 'Pena model loading cancelled.',
    storageWarning: 'Browser estimates limited storage so this may fail.',
    modelSaved: 'Pena saved in this browser.',
    modelSavedTemporary: 'Pena saved. The browser may clear storage when space is low.',
    enterPackage: 'Enter the URL of a converted Pena package (queen.json).',
    removeModelConfirm: 'Remove this saved Pena model from browser storage?',
    turnOffRemove: 'Turn Pena off before removing the model it is using.',
    modelRemoved: 'Pena model removed.',
    directoryRequired: 'Saving a model folder requires a browser with the directory picker. Keep the original downloaded package as your backup.',
    savingFile: 'Saving {file}',
    backupSaved: 'Pena backup saved.',
    operationRunning: 'A Pena model operation is already running. Wait for it to finish, then turn Pena off and on.',
    unavailableInput: 'Pena is not available right now',
    askPosition: 'Send a message',
    chatHint: 'Ask Pena why a move works, not just what to play',
    askPositionLabel: 'Message Pena',
    askVoice: 'Ask with your voice',
    readAloud: 'Read aloud',
    ask: 'Ask',
    stop: 'Stop',
    minimize: 'Minimize Pena',
    clearChat: 'New chat',
    explanationLabel: 'Pena explanation',
    originalAnalysis: 'Original analysis',
    preview: 'Preview',
    previousMove: 'Previous move',
    nextMove: 'Next move',
    closePreview: 'Close preview',
    englishOnly: 'Coaching and chat are English only',
    resize: 'Resize Pena',
    failed: 'Failed',
    cancelled: 'Cancelled',
    unavailable: 'Unavailable',
    ready: 'Ready',
    stopped: 'Stopped.',
    readingBoard: 'Reading the board model...',
    loadingExplanation: 'Loading the explanation model...',
    warmingGpu: 'Warming up your GPU...',
    downloadingDefault: 'Downloading Pena (3.65 GiB)...',
    firstDownload: 'First download. Cancel in Pena settings, or turn Pena off.',
    storageLow: 'Browser storage may be too low for Pena.',
    verifyingFile: 'Verifying {file}...',
    downloadingFile: 'Downloading {file}...',
    downloadRetry: 'Download cancelled. Turn Pena off and on to retry.',
    checkingGpu: 'Checking WebGPU...',
    workerStopped: 'The Pena worker stopped.',
    openMatch: 'Open a match and Pena will join you.',
    standardOnly: 'Pena only knows standard chess.',
    askAnytime: 'Ask whenever you like.',
    waitingWhite: "Waiting for White's move.",
    waitingBlack: "Waiting for Black's move.",
    stillLoading: 'Pena is still loading, one moment.',
    matchRequired: 'Pena needs an open match first.',
    notLoaded: 'Pena is not running yet. Set it up in the chat window.',
    localServer: 'Local server',
    reconnect: 'Reconnect',
    serverConnected: 'Connected',
    serverDisconnected: 'Disconnected',
    serverLoading: 'Loading model',
    localReply: 'Local memory or glossary reply; no language-model generation.',
    loadingLc0Evidence: 'Loading local LC0 network for grounded coaching…',
    loadingMaiaEvidence: 'Loading local Maia-3 human-choice model…',
    collectingEvidence: 'Collecting current LC0 search and Maia human-choice evidence…',
    generatingCoaching: 'Generating from the shared coaching input…',
    chattingWithoutBoard: 'Chatting without a board…',
    chattingRaw: 'Chatting with the plain model…',
    readingMessageProgress: 'Reading your message, {percent}%',
    readingBoardProgress: 'Reading the board, {percent}%',
    connectingLocalServer: 'Connecting to the local server...',
    startLocalServer: 'Open the A.C.A.S app server on this computer to use Pena.',
    updateAppServer: 'Update the A.C.A.S app server to set up Pena from here.',
    penaNotSetUp: 'Not set up',
    penaStopped: 'Stopped',
    setupPena: 'Download about {size} to run Pena on your computer.',
    penaInstalled: 'Pena is installed. Start it whenever you like.',
    downloadPena: 'Download Pena',
    resumeDownload: 'Resume download',
    startPena: 'Start Pena',
    pauseDownload: 'Pause',
    tryAgain: 'Try again',
    setupChecking: 'Checking your graphics card...',
    setupVerifying: 'Checking the part that was already downloaded...',
    setupUnpacking: 'Unpacking the runtime...',
    setupDownloading: 'Downloading Pena, {received} of {total} ({percent}%)',
    setupStarting: 'Loading Pena into memory...',
    preparingSpeech: 'Preparing {file}',
    listening: 'Listening... pause to send, tap the mic to stop.',
    transcribing: 'Transcribing...',
    positionChanged: 'The position changed while you were speaking. Ask again for this one.',
    notHeard: 'I did not catch that. Try a short, clear question.',
    voiceCancelled: 'Voice setup cancelled.',
    heldBack: 'Some advice was held back by the move check.',
    moveHidden: 'Move hidden. Ask to see it.',
    keepMoveReply: "That one comes down to a move, and I'd rather let you find it. Just ask for the move if you want it.",
    moveHiddenNote: 'Only had a move to suggest here, and "Don\'t give away moves" is on. Ask if you want it.',
    nothingNew: 'Nothing new worth saying here.',
    answerLimit: 'Pena ran out of room, so this one may stop short.',
    unknownEvidenceWarning: "Pena used bracketed text that doesn't match its evidence. This answer may be unreliable.",
    checkedCount: '{count} checked',
    removedCount: '{count} removed',
    checksEnabled: 'Board contradictions are filtered and narrated moves are searched. This does not prove every strategic explanation.',
    coachingUnchecked: 'Chess coaching is off, so nothing here is checked.',
    shown: 'Shown',
    skipped: 'Skipped to keep it short.',
    contradictsBoard: 'Contradicts the board.',
    replacedPick: "Pena's pick was replaced after an independent move check. The replacement explains a searched line.",
    moveChecked: 'Move checked. Strategic reasoning is not proven.',
    requiresSecure: 'Pena requires HTTPS or localhost.',
    requiresGpu: 'Pena requires WebGPU. Enable hardware acceleration or use a supported browser.',
    noAdapter: 'No WebGPU adapter is available for Pena.',
    softwareGpu: 'Pena needs a real graphics card, but this browser only offers software WebGPU.',
    unexpectedStop: 'Pena stopped unexpectedly.',
    gpuMemory: 'Your graphics card ran out of memory for Pena. Close other heavy tabs or games, then turn Pena off and on again.',
    gpuReset: 'The graphics driver reset while Pena was working. Turn Pena off and on again to restart it.',
    contextFull: 'That was a bit too much to read at once. Try asking again, or start a new chat.',
    gpuSmall: 'This graphics card is too small for Pena. Pena needs a GPU with more memory.',
    modelLoadError: 'Pena could not load its model files. Check your connection and free disk space, then try again.',
    voiceTermsTitle: 'Voice model terms:',
    voiceTermsConfirm: 'Download and use {name} under these terms?',
    voiceNotInstalled: 'This voice is not installed.',
    assetDownloadError: 'Could not download {url}: HTTP {status}.',
    englishVoicePack: 'Choose an English voice pack.',
    customVoiceMissing: 'Some custom voice files are missing. Choose the files again.',
    chooseEnglishVoice: 'Choose an English voice from the voice dropdown.',
    noVoiceModel: 'This catalogue entry has no Piper ONNX model.',
    voiceFilesRequired: 'Choose a Piper .onnx, its .onnx.json and MODEL_CARD together.',
    voiceConfigUnsupported: 'This is not a supported Piper voice configuration.',
    englishVoicesOnly: 'Pena currently supports English voice packs only.',
    audioBlocked: 'Audio is blocked. Click Read aloud to allow playback.',
    browserSpeechUnavailable: 'Browser speech is unavailable.',
    browserVoiceMissing: 'No browser voice is installed for {language}.',
    voiceLanguageMismatch: 'The selected voice speaks {voiceLanguage}, not {language}. Choose a matching voice pack.',
    microphoneSecure: 'Microphone input requires HTTPS or localhost and microphone permission.',
    microphoneUnsupported: 'This browser does not support microphone recording.',
    microphoneStopped: 'The microphone stopped unexpectedly. Tap it to try again.',
    oldPackage: 'This Pena package uses the old, slower format. Export or download it again.',
    incompletePackage: 'This is not a supported, complete Pena browser package.',
    invalidPackageFiles: 'Pena package contains invalid or duplicate files.',
    embeddingSize: 'Pena token embeddings have the wrong size.',
    opfsRequired: 'Pena needs browser file storage (OPFS). Use a current browser outside private mode.',
    invalidModelIndex: 'Pena model storage index is invalid.',
    selectModelFirst: 'Select and download or import a Pena model first.',
    fileTooLarge: 'Pena file is larger than expected: {file}.',
    fileIncomplete: 'Pena file is incomplete: {file}.',
    checksumMismatch: 'Pena checksum does not match: {file}.',
    storageEstimate: ' Estimated quota: {quota} GiB, used: {used} GiB.',
    storageFull: 'The browser ran out of storage while saving Pena.{details} The model needs {size} GiB plus working space.',
    duplicateFile: 'Duplicate Pena file: {file}.',
    importFolderRequired: 'Choose the exported Pena folder containing queen.json.',
    missingFile: 'Missing or incorrect Pena file: {file}.',
    httpsPackage: 'Use an HTTPS Pena package URL.',
    manifestDownloadError: 'Pena manifest download failed (HTTP {status}).',
    modelDownloadError: 'Pena download failed: {file} (HTTP {status}).',
    modelNotFound: 'Pena model was not found.',
    chatUnavailable: 'This Pena package has no chat adapter yet. Download the latest package to chat with Pena.',
    thinking: 'Thinking',
    vramPreset: 'Graphics memory',
    vram12: '12 GB',
    vram16: '16 GB or more',
    effort: 'Thinking effort',
    effortHint: 'Auto picks per question',
    effortAuto: 'Auto',
    effortNone: 'None',
    effortLow: 'Low',
    effortMedium: 'Medium',
    effortHigh: 'High',
    thinkingTokens: 'Max thinking tokens',
    thinkingTokensHint: 'Caps how long Pena can think',
    temperature: 'Temperature',
    temperatureHint: '0 is predictable, higher adds variety',
    chessLora: 'Chess LoRA',
    loraMode: 'LoRA',
    loraPena: 'Pena LoRA',
    loraOff: 'Off, plain Inkling',
    loraCustom: 'Your own LoRA',
    loraUnpublished: 'Not published yet, plain Inkling runs for now',
    loraScale: 'LoRA strength',
    loraScaleHint: '1 is normal, 0 turns it off',
    ownLora: 'Your own LoRA',
    ownLoraHint: 'A GGUF LoRA adapter for Inkling 2 Mini',
    uploadLora: 'Upload LoRA',
    uploadLoraLabel: 'Upload your own LoRA adapter',
    removeLora: 'Remove saved LoRA',
    removeLoraConfirm: 'Remove your uploaded LoRA?',
    prompt: 'Prompt',
    systemPrompt: 'System prompt',
    systemPromptHint: 'Who Pena is and how he talks',
    resetPrompts: 'Reset prompt'
};

// The settings title is a product name, not a translatable string.
const untranslated = new Set(['settingsTitle']);

export function penaText(key, values) {
    if(!Object.hasOwn(penaStrings, key)) return key || '';
    if(untranslated.has(key)) return penaStrings[key];
    return featureText('pena', key, penaStrings[key], values);
}

export function penaFilename(file) {
    const name = String(file || '').split(/[\\/]/).pop();
    return name.length > 24 ? `${name.slice(0, 12)}\u2026${name.slice(-9)}` : name;
}

export function setPenaText(element, key, values = {}) {
    if(Object.hasOwn(penaStrings, key)) {
        element.dataset.penaText = key;
        element.dataset.penaValues = JSON.stringify(values);
    } else {
        delete element.dataset.penaText;
        delete element.dataset.penaValues;
    }
    element.textContent = penaText(key, values);
    element.dir = typeof FULL_TRANS_OBJ === 'undefined' ? 'auto' : FULL_TRANS_OBJ?.textDirection || 'auto';
}

export function translatePenaUI(root = document) {
    for(const [name, attribute] of [['text', null], ['label', 'aria-label'], ['title', 'title'], ['placeholder', 'placeholder']]) {
        root.querySelectorAll(`[data-pena-${name}]`).forEach(element => {
            const values = JSON.parse(element.dataset.penaValues || '{}');
            const text = penaText(element.dataset[`pena${name[0].toUpperCase() + name.slice(1)}`], values);
            if(attribute) element.setAttribute(attribute, text);
            else element.textContent = text;
            if(!attribute) element.dir = typeof FULL_TRANS_OBJ === 'undefined' ? 'auto' : FULL_TRANS_OBJ?.textDirection || 'auto';
        });
    }
    updatePenaChoices(root);
    root.querySelectorAll('[data-pena-english-note]').forEach(element => {
        element.hidden = (localStorage.getItem('selectedLanguage') || 'us') === 'us';
    });
}

export function updatePenaChoices(root) {
    root.querySelectorAll('input[data-pena-choice]').forEach(input => {
        const container = input.parentElement;
        const selected = [...container.querySelectorAll('.dropdown-item')]
            .find(item => item.dataset.value === input.value);
        container.classList.toggle('pena-choice-selected', Boolean(selected));
        container.dataset.penaChoiceLabel = selected?.textContent || '';
        container.dir = typeof FULL_TRANS_OBJ === 'undefined' ? 'auto' : FULL_TRANS_OBJ?.textDirection || 'auto';
        input.title = selected?.textContent || '';
        if(input.dataset.key === 'penaChattiness') {
            const measure = document.createElement('canvas').getContext('2d');
            const style = getComputedStyle(input);
            measure.font = `500 ${style.fontSize} ${style.fontFamily}`;
            const width = Math.max(...[...container.querySelectorAll('.dropdown-item')]
                .map(item => measure.measureText(item.textContent).width));
            container.style.setProperty('--pena-choice-width', `${Math.ceil(width) + 44}px`);
        }
    });
}

let initialized = false;

export function initializePenaTranslations() {
    if(!initialized) {
        document.addEventListener('acas-translations-updated', () => translatePenaUI());
        initialized = true;
    }
    translatePenaUI();
}
