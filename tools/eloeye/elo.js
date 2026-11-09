import { estimateRating, tally } from './eloMatch.js';
import { automaticRun, automaticStatus, automaticEstimate, maxBoards } from './eloPolicy.js?v=10boards';
import { settingsStorageKey, storageKey, checkpointStorageKey, parseCheckpoint, measurementProtocol } from './storage.js?v=10boards';
import { defaultSelectionWeights, moveCategories, validateSelectionWeights, rebalanceSelectionWeights } from './hintSelection.js';
import { channelName } from './sessionProtocol.js';

const text = {
    loading: percent => percent > 0 ? `Loading Maia 3… ${percent}%` : 'Loading Maia 3…',
    probing: 'Checking A.C.A.S…',
    playing: (done, total) => `Match ${Math.min(done + 1, total)} of ${total}`,
    voided: count => `. ${count} restarted`,
    remaining: time => `. ~${time} left`,
    record: games => {
        const { wins, draws, losses } = tally(games);
        return `(${wins}/${draws}/${losses})`;
    },
    failed: reason => '100 games in a row failed to finish. Check that A.C.A.S is working on this device and try again.'
        + (reason ? ` (Last error: ${reason})` : ''),
    stopped: 'Stopped. Resume to continue with your completed games.',
    setup: {
        'no-board': 'The EloEye board could not be initialized. Reload EloEye and try again.',
        'no-gui': 'EloEye cannot reach the A.C.A.S window. Open the GUI on the same origin in another tab and try again.',
        'no-profile': 'A.C.A.S gave no moves or hints. Activate a profile with an engine (not a learning-only mode) and try again.',
        'unsafe-moves': 'No revealed legal suggestion matches an enabled move category. Adjust your suggestion mix or profile output and start a new run.'
    }
};

const $ = id => document.getElementById(id);
const form = $('elo-form');
const run = $('run');
const startButton = $('start');
const error = $('form-error');
const grid = $('boards-grid');

let controller = null;
let savedRun = null;
let checkpointBroken = false;
let busy = false;
let resultVisible = false;
let completionAudio = null;

async function prepareCompletionAudio() {
    try {
        completionAudio ??= new AudioContext();
        await completionAudio.resume();
    } catch(error) {
        console.warn('Could not enable the completion sound:', error);
    }
}

function playCompletionSound() {
    if(completionAudio?.state !== 'running') return;
    try {
        const tone = completionAudio.createOscillator();
        const volume = completionAudio.createGain();
        const now = completionAudio.currentTime;
        tone.frequency.value = 880;
        volume.gain.setValueAtTime(0, now);
        volume.gain.linearRampToValueAtTime(0.15, now + 0.01);
        volume.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        tone.connect(volume);
        volume.connect(completionAudio.destination);
        tone.onended = () => {
            tone.disconnect();
            volume.disconnect();
        };
        tone.start(now);
        tone.stop(now + 0.8);
    } catch(error) {
        console.warn('Could not play the completion sound:', error);
    }
}

// ?fast shortens every wait so the automated tests don't sit through real-world timeouts.
const urlFlags = new URLSearchParams(location.search);
const matchLimit = () => urlFlags.has('dev') ? boardCount() * 2 : automaticRun.maxGames;
const timing = urlFlags.has('fast')
    ? { moveTimeoutMs: 3000, openingTimeoutMs: 3000, partialGraceMs: 1000, probeBoardMs: 3000, probeHintsMs: 3000, connectTimeoutMs: 2000, retryDelayMs: 100 }
    : {};

const heartbeatMaxAgeMs = 15000;

function setConnection(id, state, label) {
    const item = $(id);
    item.dataset.state = state;
    item.querySelector('i').className = `bi ${state === 'ok' ? 'bi-check-circle-fill' : state === 'bad' ? 'bi-x-circle-fill' : 'bi-circle'}`;
    item.querySelector('span').textContent = label;
}

const connectionChannel = new BroadcastChannel(channelName);
const connectionClient = crypto.randomUUID();
let guiLastSeen = null;
let manager = '';
function renderConnection() {
    const active = guiLastSeen !== null && Date.now() - guiLastSeen < heartbeatMaxAgeMs;
    setConnection('conn-gui', active ? 'ok' : 'bad',
        active ? `GUI active${manager ? ` (${manager})` : ''}` : 'GUI not active');
}
connectionChannel.onmessage = ({ data }) => {
    if(data?.type !== 'gui-status' || data.client !== connectionClient || typeof data.gui !== 'string') return;
    guiLastSeen = Date.now();
    manager = typeof data.manager === 'string' ? data.manager : '';
    renderConnection();
};
function refreshConnection() {
    connectionChannel.postMessage({ type: 'gui-status-request', client: connectionClient });
    renderConnection();
}

function refreshVisibility() {
    $('hidden-warning').hidden = !document.hidden;
}

refreshConnection();
const connectionTimer = setInterval(refreshConnection, 2000);
window.addEventListener('pagehide', () => {
    clearInterval(connectionTimer);
    connectionChannel.close();
}, { once: true });
document.addEventListener('visibilitychange', refreshVisibility);
refreshVisibility();

function showError(message) {
    error.textContent = message;
    error.hidden = !message;
}

function setRunning(running) {
    busy = running;
    form.querySelectorAll('select, input').forEach(element => element.disabled = running);
    $('mode').disabled = running || !!savedRun;
    for(const category of moveCategories) $(`mix-${category}`).disabled = running || !!savedRun;
    $('mix-detailed').disabled = running || !!savedRun;
    $('discard-checkpoint').disabled = running;
    startButton.disabled = running;
    startButton.hidden = running;
    $('stop').hidden = !running;
    run.hidden = !running && !resultVisible;
    $('run-plan').hidden = !running;
}

function updateCheckpointUI() {
    $('checkpoint').hidden = !savedRun && !checkpointBroken;
    if(savedRun) {
        const count = savedRun.games.length + (savedRun.batch ?? []).filter(game => game.score !== undefined).length;
        $('checkpoint-status').textContent = `${count} matches saved.`;
        startButton.textContent = resultVisible ? 'Reset' : 'Resume';
    } else {
        $('checkpoint-status').textContent = 'The saved run could not be read.';
        startButton.textContent = 'Start';
    }
    $('mode').disabled = busy || !!savedRun;
    for(const category of moveCategories) $(`mix-${category}`).disabled = busy || !!savedRun;
    $('mix-detailed').disabled = busy || !!savedRun;
    $('personality').hidden = $('mode').value !== 'auto';
    startButton.disabled = busy;
    startButton.classList.toggle('checkpoint-unreadable', checkpointBroken);
}

function checkpointDone() {
    if(!savedRun) return false;
    if(savedRun.version === 1) return savedRun.games.length === savedRun.total;
    return !savedRun.batch.length
        && (savedRun.games.length === savedRun.total || automaticStatus(savedRun.games).done);
}

function saveCheckpoint(mode, total, games, batch = []) {
    const legacy = savedRun?.version === 1;
    savedRun = {
        version: legacy ? 1 : 2, protocol: measurementProtocol, mode, total, boards: boardCount(),
        selectionWeights: savedRun?.selectionWeights ?? readSelectionWeights(),
        games: (legacy ? [...games, ...batch.filter(game => game.score !== undefined)] : games).map(game => ({ ...game })),
        ...(legacy ? {} : { batch: batch.map(game => ({ ...game })) })
    };
    try {
        localStorage.setItem(checkpointStorageKey, JSON.stringify(savedRun));
        $('checkpoint-warning').hidden = true;
    } catch(error) {
        console.warn('Could not save EloEye checkpoint:', error);
        $('checkpoint-warning').textContent = 'This run could not be saved to browser storage. Keep this page open. Crash recovery may be incomplete.';
        $('checkpoint-warning').hidden = false;
    }
    updateCheckpointUI();
}

function restoreCheckpoint() {
    let raw;
    try {
        raw = localStorage.getItem(checkpointStorageKey);
    } catch(error) {
        console.warn('Could not access EloEye checkpoint storage:', error);
        $('checkpoint-warning').textContent = 'Browser storage is unavailable. This run cannot recover after a reload or crash.';
        $('checkpoint-warning').hidden = false;
        updateCheckpointUI();
        return;
    }
    try {
        savedRun = parseCheckpoint(raw);
        if(savedRun) {
            $('mode').value = savedRun.mode;
            $('boards').value = String(Math.min(maxBoards, savedRun.boards));
            applySelectionWeights(savedRun.selectionWeights ?? defaultSelectionWeights);
        }
    } catch(error) {
        console.warn('Could not restore EloEye checkpoint:', error);
        checkpointBroken = true;
    }
    updateCheckpointUI();
}

const boardCount = () => $('mode').value === 'manual' ? 1 : Math.min(maxBoards, Math.max(1, Number($('boards').value) || 2));
const slotCleanup = new WeakMap();

function showSettingsWarning(show) {
    $('settings-warning').hidden = !show;
}

function readSelectionWeights() {
    return validateSelectionWeights(Object.fromEntries(moveCategories.map(category =>
        [category, $(`mix-${category}`).valueAsNumber])));
}

function applySelectionWeights(weights) {
    weights = validateSelectionWeights(weights);
    for(const category of moveCategories) $(`mix-${category}`).value = weights[category];
    $('mix-detailed').checked = weights.alternative === 0;
    updateMixUI();
}

function updateMixUI() {
    const detailed = $('mix-detailed').checked;
    $('mix-categories').hidden = !detailed;
    $('alternative-field').hidden = detailed;
    $('personality').hidden = $('mode').value !== 'auto';
    const best = Math.round($('mix-best').valueAsNumber * 10) / 10;
    $('mix-summary').textContent = `${best}% best, ${Math.round((100 - best) * 10) / 10}% ${detailed ? 'custom alternatives' : 'alternatives'}`;
}

function restoreSettings() {
    try {
        const saved = localStorage.getItem(settingsStorageKey);
        if(!saved) return;
        const settings = JSON.parse(saved);
        if(settings && typeof settings === 'object') {
            if(['auto', 'manual'].includes(settings.mode)) $('mode').value = settings.mode;
            if(Number.isInteger(settings.boards) && settings.boards >= 1 && settings.boards <= maxBoards) $('boards').value = String(settings.boards);
            $('multiple-workers').checked = settings.multipleWorkers === true;
            if(settings.selectionWeights) applySelectionWeights(validateSelectionWeights(settings.selectionWeights));
        }
    } catch(error) {
        console.warn('Could not restore EloEye settings:', error);
        showSettingsWarning(true);
    }
}

function saveSettings() {
    try {
        localStorage.setItem(settingsStorageKey, JSON.stringify({
            mode: $('mode').value, boards: Number($('boards').value), selectionWeights: readSelectionWeights(),
            multipleWorkers: $('multiple-workers').checked
        }));
        showSettingsWarning(false);
    } catch(error) {
        console.warn('Could not save EloEye settings:', error);
        showSettingsWarning(true);
    }
}

function createBoardSlot(index) {
    const slot = document.createElement('section');
    slot.className = 'tool-board';

    const heading = document.createElement('div');
    heading.className = 'tool-board-heading';
    heading.append('Match');
    const number = document.createElement('strong');
    number.textContent = String(index + 1).padStart(2, '0');
    heading.append(number);

    const surface = document.createElement('div');
    surface.className = 'tool-board-surface';
    const empty = document.createElement('div');
    empty.className = 'tool-board-empty';
    empty.textContent = 'Empty';
    empty.hidden = true;
    surface.append(empty);
    slot.append(heading, surface);

    labelBoardSlot(slot, index);
    observeBoardSlot(slot);
    return slot;
}

function labelBoardSlot(slot, index) {
    slot.setAttribute('aria-label', `Match ${index + 1}`);
    slot.querySelector('.tool-board-heading strong').textContent = String(index + 1).padStart(2, '0');
}

function observeBoardSlot(slot) {
    const surface = slot.querySelector('.tool-board-surface');
    const empty = slot.querySelector('.tool-board-empty');
    let timer;
    const refresh = () => {
        const activeFrame = surface.querySelector('.board-session:not([hidden])');
        if(activeFrame) {
            clearTimeout(timer);
            timer = undefined;
            if(!empty.hidden) empty.hidden = true;
        } else if(empty.hidden && timer === undefined) {
            timer = setTimeout(() => {
                timer = undefined;
                const hidden = !!surface.querySelector('.board-session:not([hidden])');
                if(empty.hidden !== hidden) empty.hidden = hidden;
            }, 1200);
        }
    };
    const observer = new MutationObserver(refresh);
    observer.observe(surface, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    slotCleanup.set(slot, () => {
        clearTimeout(timer);
        observer.disconnect();
    });
    refresh();
}

function updateBoardSlots() {
    const mode = $('mode').value;
    const count = boardCount();
    $('boards-field').hidden = mode === 'manual';
    $('run-plan').textContent = `Up to ${savedRun?.total ?? matchLimit()} matches.`;
    grid.dataset.mode = mode;
    form.dataset.mode = mode;
    while(grid.children.length > count) {
        const last = grid.lastElementChild;
        slotCleanup.get(last)?.();
        last.remove();
    }
    while(grid.children.length < count) grid.append(createBoardSlot(grid.children.length));
    [...grid.children].forEach((slot, index) => {
        labelBoardSlot(slot, index);
        if(!slotCleanup.has(slot)) observeBoardSlot(slot);
    });
}

const mount = lane => grid.children[lane].querySelector('.tool-board-surface');

restoreSettings();
restoreCheckpoint();
updateMixUI();
updateBoardSlots();
if(checkpointDone()) showResult(savedRun.mode, savedRun.games, savedRun.version === 2);

function formatRemaining(ms) {
    const seconds = Math.max(1, Math.round(ms / 1000));
    if(seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

let playStart = 0;
let resumedGames = 0;

function render(progress) {
    if(progress.phase === 'loading') {
        $('status').textContent = text.loading(progress.percent);
    } else if(progress.phase === 'probing') {
        $('status').textContent = text.probing;
    } else {
        const { mode, done, total, voided, games, pending = [], automatic, precision, measuredGames } = progress;
        playStart ||= Date.now();
        grid.dataset.mode = mode;
        const completedNow = done - resumedGames;
        const rangeWidth = precision ? precision.high - precision.low : 0;
        const canEstimate = !automatic || measuredGames >= automaticRun.minGames && precision.low > 0 && precision.high < 4000;
        const projectedTotal = automatic && canEstimate
            ? Math.min(total, Math.max(done, Math.ceil(measuredGames * (rangeWidth / (automaticRun.halfWidth * 2)) ** 2)))
            : total;
        const remaining = completedNow > 0 && canEstimate && done < projectedTotal && !precision?.done
            ? text.remaining(formatRemaining((Date.now() - playStart) / completedNow * (projectedTotal - done)))
            : automatic && !precision?.done ? '. Estimating time…' : '';
        $('match-status').textContent = (automatic ? `${done} matches`
            : text.playing(done, total)) + ` ${text.record(games)}` + (voided ? text.voided(voided) : '')
            + (mode === 'manual' ? '. Manual play' : '');
        $('status').textContent = precision?.done ? 'Finishing…' : remaining.replace(/^\. /, '');
        const displayedRange = precision ?? automaticStatus(games);
        $('live-range').hidden = false;
        $('precision').textContent = `${Math.floor(displayedRange.low)}-${Math.ceil(displayedRange.high)}`;
        [...grid.children].forEach((slot, lane) => {
            let label = slot.querySelector('.tool-board-opponent');
            if(!label) {
                label = document.createElement('span');
                label.className = 'tool-board-opponent';
                slot.querySelector('.tool-board-heading').append(label);
            }
            const game = pending.find(game => game.lane === lane);
            label.textContent = game ? `Maia ${game.opponent}` : '';
        });
    }
}

async function guiPresent() {
    refreshConnection();
    for(let waited = 0; waited < 2500; waited += 250) {
        if(guiLastSeen !== null && Date.now() - guiLastSeen < heartbeatMaxAgeMs) return true;
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    return false;
}

$('mode').addEventListener('change', () => {
    updateMixUI();
    updateBoardSlots();
    saveSettings();
});
$('boards').addEventListener('change', () => {
    updateBoardSlots();
    saveSettings();
});
$('multiple-workers').addEventListener('change', saveSettings);
for(const category of moveCategories) $(`mix-${category}`).addEventListener('input', event => {
    try {
        const weights = Object.fromEntries(moveCategories.map(name => [name,
            name === category ? 0 : $(`mix-${name}`).valueAsNumber]));
        // The edited field has already changed, so recover its previous share from the others.
        weights[category] = Math.max(0, 100 - Object.values(weights).reduce((sum, value) => sum + value, 0));
        const categories = $('mix-detailed').checked
            ? moveCategories.filter(name => name !== 'alternative') : ['best', 'alternative'];
        const next = rebalanceSelectionWeights(weights, category, event.target.valueAsNumber, categories);
        for(const name of moveCategories) if(name !== category) $(`mix-${name}`).value = next[name];
        updateMixUI();
        showError('');
        saveSettings();
    } catch(error) { showError(error.message); }
});

$('mix-detailed').addEventListener('change', () => {
    try {
        const weights = readSelectionWeights();
        const remaining = 100 - weights.best;
        for(const category of moveCategories) if(category !== 'best') weights[category] = 0;
        weights[$('mix-detailed').checked ? 'secondary' : 'alternative'] = remaining;
        for(const category of moveCategories) $(`mix-${category}`).value = weights[category];
        updateMixUI();
        showError('');
        saveSettings();
    } catch(error) {
        $('mix-detailed').checked = !$('mix-detailed').checked;
        showError(error.message);
    }
});

function resetRun() {
    if(busy) return;
    try {
        localStorage.removeItem(checkpointStorageKey);
        savedRun = null;
        resultVisible = false;
        run.hidden = true;
        checkpointBroken = false;
        $('checkpoint-warning').hidden = true;
        showError('');
        updateCheckpointUI();
        $('mix-warning').hidden = true;
        updateBoardSlots();
    } catch(error) {
        console.warn('Could not discard EloEye checkpoint:', error);
        showError('Could not discard the saved run. Check browser storage permissions and try again.');
    }
}

$('discard-checkpoint').addEventListener('click', resetRun);

let discardAnimation;
form.addEventListener('submit', async event => {
    event.preventDefault();
    if(busy) return;
    if(resultVisible) {
        resetRun();
        return;
    }
    if(checkpointBroken) {
        const discard = $('discard-checkpoint');
        discard.focus();
        discardAnimation?.cancel();
        if(!matchMedia('(prefers-reduced-motion: reduce)').matches)
            discardAnimation = discard.animate(
                [0, -8, 8, -6, 6, 0].map(x => ({ transform: `translateX(${x}px)` })),
                { duration: 400, easing: 'ease-in-out' });
        return;
    }
    showError('');
    $('mix-warning').hidden = true;
    if([...(savedRun?.games ?? []), ...(savedRun?.batch ?? [])].some(game => game.suggestionFallback)) showMixWarning();

    if(checkpointDone()) {
        showResult(savedRun.mode, savedRun.games, savedRun.version === 2);
        return;
    }
    let selectionWeights;
    try { selectionWeights = savedRun ? savedRun.selectionWeights ?? { ...defaultSelectionWeights } : readSelectionWeights(); }
    catch(error) { showError(error.message); return; }
    prepareCompletionAudio();
    controller = new AbortController();
    resultVisible = false;
    $('estimate-label').textContent = 'Estimated range so far';
    $('rating').hidden = true;
    $('precision').className = 'tool-rating';
    setRunning(true);
    if(!await guiPresent()) {
        controller = null;
        setRunning(false);
        showError(text.setup['no-gui']);
        return;
    }
    if(controller.signal.aborted) {
        controller = null;
        setRunning(false);
        updateCheckpointUI();
        showError('Stopped.');
        return;
    }

    const legacy = savedRun?.version === 1;
    const total = savedRun?.total ?? matchLimit();
    const initialGames = savedRun?.games ?? [];
    const initialBatch = savedRun?.batch ?? [];
    $('match-status').textContent = '';
    $('live-range').hidden = false;
    $('precision').textContent = '0-4000';
    $('status').textContent = 'Preparing EloEye…';
    playStart = 0;
    resumedGames = initialGames.length + initialBatch.filter(game => game.score !== undefined).length;
    saveCheckpoint($('mode').value, total, initialGames, initialBatch);

    let SetupErrorType;
    try {
        const player = await import('./eloPlayer.js?v=failstreak');
        SetupErrorType = player.SetupError;
        const { mode, games } = await player.runMatch({
            mode: $('mode').value, ...(legacy || total !== automaticRun.maxGames ? { total } : {}),
            boards: boardCount(), initialGames, initialBatch,
            mount, onProgress: render, onFallback: showMixWarning,
            onCheckpoint: ({ mode, games, batch }) => saveCheckpoint(mode, total, games, batch),
            signal: controller.signal, timing, selectionWeights, multipleWorkers: $('multiple-workers').checked
        });
        showResult(mode, games, !legacy);
        playCompletionSound();
    } catch(caught) {
        setRunning(false);
        if(caught?.name === 'AbortError') showError(text.stopped);
        else if(SetupErrorType && caught instanceof SetupErrorType) showError(text.setup[caught.code]);
        else {
            console.error(caught);
            showError(text.failed(caught?.message));
        }
    } finally {
        controller = null;
        setRunning(false);
        updateBoardSlots();
        updateCheckpointUI();
    }
});

function showResult(mode, games, automatic) {
    if(games.some(game => game.suggestionFallback)) showMixWarning();
    const estimate = automatic ? automaticEstimate(games) : estimateRating(games);
    if(!estimate) {
        showError('No result is available yet. Resume to complete more matches.');
        return;
    }
    try {
        // Write-only snapshot of the finished run; read by the automated tests.
        sessionStorage.setItem(storageKey, JSON.stringify({ protocol: measurementProtocol, mode, games, estimate,
            selectionWeights: savedRun?.selectionWeights ?? readSelectionWeights() }));
    } catch(error) {
        console.warn('Could not store EloEye result:', error);
        showError('Could not store the result. Your saved run is kept.');
    }
    resultVisible = true;
    run.hidden = false;
    $('run-plan').hidden = true;
    $('live-range').hidden = false;
    $('estimate-label').textContent = 'Estimated range';
    $('rating').hidden = false;
    $('rating').textContent = estimate.status === 'above' ? 'Above 2600'
        : estimate.status === 'below' ? 'Below 600'
        : estimate.status === 'upper-edge' ? 'Near / above 2600'
        : estimate.status === 'lower-edge' ? 'Near / below 600'
        : String(Math.round(estimate.rating));
    $('precision').className = 'tool-range';
    $('precision').textContent = `${Math.floor(estimate.low)}-${Math.ceil(estimate.high)}`;
    $('match-status').textContent = `${games.length} matches ${text.record(games)}`;
    const adjudicated = games.filter(game => game.materialAdjudication).length;
    $('status').textContent = estimate.reason === 'budget'
        ? 'Match limit reached. Estimate still uncertain.'
        : '(Approximate Maia comparison)';
    if(adjudicated) $('status').textContent += ` ${adjudicated} decided early by material, not played to mate.`;
    updateCheckpointUI();
}

$('stop').addEventListener('click', () => controller?.abort());

function showMixWarning() {
    $('mix-warning').textContent = 'Some picks had no suggestions matching your mix, so EloEye used another shown move. Your result includes those picks.';
    $('mix-warning').hidden = false;
}
