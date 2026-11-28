import { penaDefaults } from './preferences.js';
import { initializeSettingInputElem, setInputValue } from '../../js/gui/domInputs.js';
import { saveSetting } from '../../js/gui/settings.js';
import { penaText, setPenaText, translatePenaUI, updatePenaChoices } from './i18n.js';
import { defaultPenaPrompt, isDefaultPenaPrompt } from './prompt-overrides.js';
import { DEFAULT_ZONOS_VOICE, ZONOS_VOICES, normalizeZonosVoice, customZonosVoices, saveZonosVoice, removeZonosVoice } from './zonos-voices.js';

function labelled(row, title, subtitle) {
    row.innerHTML = '<div><div class="input-title"></div><div class="input-subtitle"></div></div>';
    setPenaText(row.querySelector('.input-title'), title);
    setPenaText(row.querySelector('.input-subtitle'), subtitle);
    return row;
}

function keyed(input, key, title) {
    input.dataset.key = key;
    input.dataset.noProfile = 'true';
    input.dataset.defaultValue = String(penaDefaults[key]);
    input.dataset.penaLabel = title;
    return input;
}

function dropdown(title, key, choices, subtitle = '') {
    const row = document.createElement('div');
    row.className = 'dropdown-input custom-input';
    row.innerHTML = `<div><div class="input-title"></div><div class="input-subtitle"></div></div>
        <div class="dropdown-input-container"><input type="text" additional-type="dropdown">
        <div class="dropdown-icon"></div><div class="dropdown-list-container"></div></div>`;
    setPenaText(row.querySelector('.input-title'), title);
    setPenaText(row.querySelector('.input-subtitle'), subtitle);
    const input = keyed(row.querySelector('input'), key, title);
    input.dataset.penaChoice = 'true';
    for(const event of ['input', 'change', 'acas-value-set'])
        input.addEventListener(event, () => updatePenaChoices(row));
    for(const [value, label] of choices) {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.dataset.value = value;
        setPenaText(item, label);
        row.querySelector('.dropdown-list-container').appendChild(item);
    }
    return row;
}

function field(title, key, type, subtitle, min, max, step = 1) {
    const row = labelled(document.createElement('div'), title, subtitle);
    row.className = `${type === 'checkbox' ? 'checkbox' : 'textfield'}-input custom-input`;
    const input = keyed(document.createElement('input'), key, title);
    input.type = type;
    if(type === 'checkbox') {
        const container = document.createElement('div');
        container.className = 'checkbox-container';
        const fill = document.createElement('div');
        fill.className = 'checkbox-fill';
        fill.textContent = '\u2714';
        container.append(input, fill);
        row.appendChild(container);
    } else {
        if(min !== undefined) { input.min = min; input.max = max; input.step = step; input.dataset.between = `${min}-${max}`; }
        if(!penaDefaults[key]) input.placeholder = String(penaDefaults[key]);
        row.appendChild(input);
    }
    return row;
}

function textarea(title, key, subtitle, rows) {
    const row = labelled(document.createElement('div'), title, subtitle);
    row.className = 'textfield-input custom-input pena-prompt-input';
    const input = keyed(document.createElement('textarea'), key, title);
    input.dataset.dynamicValueType = 'text';
    Object.assign(input, { rows, spellcheck: false });
    row.appendChild(input);
    return row;
}

// Saves on the real input. A dropdown only keeps values it lists, so a freshly
// imported choice gets a placeholder item until its list refreshes.
async function store(pairs) {
    for(const [input, value] of pairs) {
        const list = input.getAttribute('additional-type') === 'dropdown' && input.parentElement.querySelector('.dropdown-list-container');
        if(list && value !== '' && !list.querySelector(`[data-value="${CSS.escape(String(value))}"]`)) {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.dataset.value = value;
            item.textContent = value;
            list.appendChild(item);
        }
        setInputValue(input, value);
        await saveSetting(input, true);
    }
}

export function initializePenaPersonalization(panel) {
    const root = panel.querySelector('.pena-personalization-root');
    const section = (title, children) => {
        const element = document.createElement('div');
        element.className = 'setting-panel pena-personalization';
        const heading = document.createElement('div');
        heading.className = 'setting-panel-title';
        for(const [index, key] of (Array.isArray(title) ? title : [title]).entries()) {
            if(index) heading.append(' & ');
            const label = document.createElement('span');
            setPenaText(label, key);
            heading.append(label);
        }
        element.append(heading, ...children);
        root.appendChild(element);
        return element;
    };
    section('conversation', [
        field('chessCoaching', 'penaCoaching', 'checkbox', 'chessCoachingHint'),
        field('hideMoves', 'penaHideMoves', 'checkbox', 'hideMovesHint'),
        field('onlyAsked', 'penaOnlyWhenAsked', 'checkbox', 'onlyAskedHint'),
        dropdown('chattiness', 'penaChattiness', [['quiet', 'chattinessQuiet'], ['normal', 'chattinessNormal'], ['chatty', 'chattinessChatty']], 'chattinessHint'),
        field('liveTeaching', 'penaTeacher', 'checkbox', 'liveTeachingHint'),
        field('futureMoves', 'penaFollowLine', 'checkbox', 'futureMovesHint'),
        field('visualDuration', 'penaVisualDuration', 'number', 'visualDurationHint', 0.5, 30, 0.5),
        field('voicePause', 'penaVoicePause', 'number', 'voicePauseHint', 0.8, 8, 0.1)
    ]);
    const zonosChoice = dropdown('chooseZonosVoice', 'penaZonosVoice', ZONOS_VOICES);
    const browserChoice = dropdown('chooseBrowserVoice', 'penaBrowserVoice', [['auto', 'browserVoiceAuto']], 'browserVoiceHint');
    zonosChoice.querySelector('input').addEventListener('acas-value-set', event => {
        const input = event.currentTarget, value = normalizeZonosVoice(input.value);
        if(value !== input.value) setInputValue(input, value);
    });
    zonosChoice.querySelector('input').dataset.globalOnly = 'true';
    browserChoice.querySelector('input').dataset.globalOnly = 'true';
    const voice = section('voice', [
        dropdown('readWith', 'penaSpeech', [['off', 'off'], ['browser', 'browserVoice'], ['neural', 'zonosVoice']], 'zonosHint'),
        zonosChoice, browserChoice,
        field('speechSpeed', 'penaSpeechRate', 'number', 'speechSpeedHint', 0.5, 2, 0.1)
    ]);
    voice.insertAdjacentHTML('beforeend', `<div class="custom-input pena-model-controls pena-custom-voice">
        <div class="input-subtitle" data-pena-text="customZonosHint"></div>
        <div class="pena-actions">
            <button type="button" class="acas-fancy-button" data-pena-text="importZonosVoice"></button>
            <button type="button" class="acas-fancy-button" data-pena-text="removeZonosVoice"></button>
        </div><input type="file" accept="audio/*" hidden data-pena-label="importZonosVoice"></div>`);
    voice.insertAdjacentHTML('beforeend', `<div class="custom-input pena-model-controls pena-voice-progress" hidden>
        <div class="pena-model-progress"><progress data-pena-label="voiceProgress" aria-label="Pena voice loading"></progress>
        <button type="button" class="pena-cancel-button" data-pena-label="cancelVoice" data-pena-title="cancelVoice" aria-label="Cancel Pena voice loading" title="Cancel Pena voice loading">&times;</button></div>
        <div role="status" aria-live="polite"></div></div>`);
    const prompt = section(['thinking', 'prompt'], [
        dropdown('effort', 'penaEffort', [['auto', 'effortAuto'], ['none', 'effortNone'], ['low', 'effortLow'], ['medium', 'effortMedium'], ['high', 'effortHigh']], 'effortHint'),
        field('thinkingTokens', 'penaThinkingTokens', 'number', 'thinkingTokensHint', 64, 4096, 64),
        field('temperature', 'penaTemperature', 'number', 'temperatureHint', 0, 1.5, 0.05),
        textarea('systemPrompt', 'penaSystemPrompt', 'systemPromptHint', 6)
    ]);
    prompt.insertAdjacentHTML('beforeend', '<div class="pena-actions"><button type="button" class="acas-fancy-button" data-pena-text="resetPrompts" data-aux="reset-prompts"></button></div>');
    root.querySelectorAll('[data-key]').forEach(input => initializeSettingInputElem(input));

    const rowOf = key => root.querySelector(`[data-key="${key}"]`).closest('.custom-input');
    const zonosInput = zonosChoice.querySelector('input');
    const browserInput = browserChoice.querySelector('input');
    const customRow = voice.querySelector('.pena-custom-voice');
    const [upload, remove] = customRow.querySelectorAll('button');
    const fileInput = customRow.querySelector('input[type="file"]');
    let voiceBusy = false;
    const showVoiceError = error => {
        console.error('[Pena voice]', error);
        toast.error(`Pena: ${error.message}`, 10000);
    };
    const option = (id, label) => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.dataset.value = id;
        item.textContent = label;
        return item;
    };
    function updateRemove() {
        upload.disabled = voiceBusy;
        remove.disabled = voiceBusy || !zonosInput.value.startsWith('custom-');
    }
    async function refreshCustomVoices() {
        const saved = await customZonosVoices();
        const list = zonosChoice.querySelector('.dropdown-list-container');
        list.querySelectorAll('[data-custom-voice]').forEach(item => item.remove());
        for(const entry of saved) {
            const item = option(entry.id, entry.name);
            item.dataset.customVoice = 'true';
            list.append(item);
        }
        if(zonosInput.value.startsWith('custom-') && !saved.some(entry => entry.id === zonosInput.value)) {
            const item = option(zonosInput.value, penaText('savedVoiceUnavailable'));
            item.dataset.customVoice = 'true';
            list.append(item);
        }
        updateRemove();
        updatePenaChoices(zonosChoice);
    }
    function refreshBrowserVoices() {
        const list = browserChoice.querySelector('.dropdown-list-container');
        const voices = window.speechSynthesis?.getVoices() || [];
        const seen = new Set();
        list.querySelectorAll('[data-browser-voice]').forEach(item => item.remove());
        for(const item of voices) {
            if(!item.voiceURI || seen.has(item.voiceURI)) continue;
            seen.add(item.voiceURI);
            const entry = option(item.voiceURI, `${item.name} (${item.lang})`);
            entry.dataset.browserVoice = 'true';
            list.append(entry);
        }
        if(browserInput.value && browserInput.value !== 'auto' && !seen.has(browserInput.value)) {
            const entry = option(browserInput.value, penaText('browserVoiceUnavailable'));
            entry.dataset.browserVoice = 'true';
            list.append(entry);
        }
        updatePenaChoices(browserChoice);
    }
    for(const event of ['acas-value-set', 'change']) zonosInput.addEventListener(event, updateRemove);
    zonosInput.addEventListener('acas-value-set', () => refreshCustomVoices().catch(showVoiceError));
    browserInput.addEventListener('acas-value-set', refreshBrowserVoices);
    window.speechSynthesis?.addEventListener?.('voiceschanged', refreshBrowserVoices);
    refreshBrowserVoices();
    refreshCustomVoices().catch(showVoiceError);
    upload.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if(!file || voiceBusy) return;
        voiceBusy = true;
        updateRemove();
        try {
            const entry = await saveZonosVoice(file);
            await refreshCustomVoices();
            await store([[zonosInput, entry.id]]);
        } catch(error) { showVoiceError(error); }
        finally { voiceBusy = false; updateRemove(); }
    });
    remove.addEventListener('click', async () => {
        const id = zonosInput.value;
        if(!id.startsWith('custom-') || voiceBusy) return;
        voiceBusy = true;
        updateRemove();
        try {
            await store([[zonosInput, DEFAULT_ZONOS_VOICE]]);
            await removeZonosVoice(id);
            await refreshCustomVoices();
        } catch(error) { showVoiceError(error); }
        finally { voiceBusy = false; updateRemove(); }
    });
    // Settings that do nothing right now are blurred and locked, like elsewhere in the app.
    const available = (row, on) => {
        row.setAttribute('aria-disabled', String(!on));
        row.querySelectorAll('input, textarea, button').forEach(element => { element.disabled = !on; });
    };
    const follow = (key, update) => {
        const input = root.querySelector(`input[data-key="${key}"]`);
        for(const event of ['acas-value-set', 'change', 'input']) input.addEventListener(event, () => update(input));
        update(input);
    };
    const checked = key => root.querySelector(`input[data-key="${key}"]`).checked;
    // Plain Inkling never comments by itself, hides moves or draws on the board.
    const coachingRows = () => {
        const coaching = checked('penaCoaching');
        for(const key of ['penaHideMoves', 'penaOnlyWhenAsked', 'penaChattiness', 'penaTeacher', 'penaFollowLine'])
            available(rowOf(key), coaching);
        available(rowOf('penaVisualDuration'), coaching && checked('penaTeacher'));
    };
    follow('penaCoaching', coachingRows);
    follow('penaTeacher', coachingRows);
    follow('penaEffort', input => available(rowOf('penaThinkingTokens'), input.value !== 'none'));
    follow('penaSpeech', input => {
        available(rowOf('penaSpeechRate'), input.value !== 'off');
        zonosChoice.hidden = customRow.hidden = input.value !== 'neural';
        browserChoice.hidden = input.value !== 'browser';
    });

    // An empty saved prompt means the built-in one, shown in full so it is easy to edit.
    const systemPrompt = prompt.querySelector('textarea');
    const fillPrompt = () => {
        if(isDefaultPenaPrompt(systemPrompt.value)) systemPrompt.value = defaultPenaPrompt;
    };
    systemPrompt.addEventListener('acas-value-set', fillPrompt);
    systemPrompt.addEventListener('change', fillPrompt);
    fillPrompt();
    prompt.querySelector('[data-aux="reset-prompts"]').addEventListener('click', () =>
        store([[systemPrompt, '']]).then(fillPrompt).catch(error => toast.error(`Pena: ${error.message}`, 10000)));

    translatePenaUI(panel);
}


