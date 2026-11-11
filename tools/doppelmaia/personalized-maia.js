import { prepareIsolation } from './isolation.js';
import { initializePreparation } from './preparation.js';
import { savePreparedGames, loadPreparedGames, clearPreparedGames } from './storage.js';
import { workerClient, downloadLink, clearDownload, validationSummary, resultComparisons, limitTrainingDataset, overfittingNote } from './files.js';
import { drawLearningChart, showTrainingBoard } from './charts.js';
import { savePersonalModel } from '../../app/assets/engines/Maia3/personal-models.js';
import { personalityPresets, personalityTraits, loadPersonalityDataset, validatePersonality } from './personality.js';
import { ratingSummary, filterDatasetElo } from './elo-filter.js';

const $ = selector => document.querySelector(selector);
const personalityDescriptions = {
    'pawn-march': 'Keeps pushing pawns forward',
    'queen-show': 'Brings the queen toward the enemy king',
    pacifist: 'Prefers quiet moves instead of captures',
    centralist: 'Develops pieces toward the center',
    edgewalker: 'Likes the edges more than the center',
    'knight-raider': 'Brings knights close to the enemy king',
    'quiet-bishop': 'Prefers quiet bishop moves',
    'flank-storm': 'Pushes pawns along the edges',
    'center-storm': 'Pushes pawns into the center',
    'distant-orbit': 'Backs away and gives the enemy king space',
    'heavy-metal': 'Prefers queen and rook moves',
    'pawn-holiday': 'Lets knights and bishops work while pawns wait',
    'peaceful-knight': 'Prefers quiet knight moves to captures',
    'corner-knight': 'Sends knights toward the edge',
    'central-knight': 'Brings knights toward the center',
    'pawn-magnet': 'Pawns chase captures and central squares',
    chaos: 'King and queen chase checks and skip castling',
    alien: 'Unusual king moves and retreats near the edge'
};
function updateFileName(input) {
    const names = Array.from(input.files, file => file.name);
    $(`#${input.id}-file-name`).textContent = names.length ? names.join(', ')
        : input.multiple ? 'No files selected' : 'No file selected';
}
for(const input of document.querySelectorAll('.tool-file-control input[type="file"]')) {
    input.addEventListener('change', () => updateFileName(input));
}
const request = workerClient(new URL('./data-worker.js', import.meta.url));
let dataset, gamesDataset, worker, ready = false, startedAt, elapsedTimer, completed = false;
let history = [], updates = 0, processed = 0, lastProcessed = 0;
let active = false, generation = 0;
let epochTimingStart, estimatedTrainingEnd;
let batchTimingStart, trainingMilliseconds = 0, evaluationTimingStart, evaluationMilliseconds = 0;
function updateBatchEstimate(data) {
    if(batchTimingStart === undefined || data.processed <= 0 || data.total <= 0) return;
    const now = performance.now();
    const fraction = data.epoch - 1 + data.processed / data.total;
    const epochDuration = (trainingMilliseconds + now - batchTimingStart) / fraction;
    const epochs = Number($('#epochs').value);
    estimatedTrainingEnd = now + epochDuration * (epochs - fraction)
        + evaluationMilliseconds * (epochs - data.epoch + 1);
    updateTrainingClock();
}
function startEvaluation() {
    const now = performance.now();
    if(batchTimingStart !== undefined) trainingMilliseconds += now - batchTimingStart;
    batchTimingStart = undefined;
    evaluationTimingStart = now;
}
function updateTrainingClock() {
    const now = performance.now();
    const seconds = Math.floor((now - startedAt) / 1000);
    const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const timer = $('#elapsed');
    let estimate = 'Estimating…';
    if(completed) estimate = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    else if(estimatedTrainingEnd !== undefined) {
        if(now >= estimatedTrainingEnd) estimate = 'Finalizing…';
        else {
            const end = new Date(Date.now() + estimatedTrainingEnd - now);
            estimate = `~${end.toLocaleString([], {
                ...(end.toDateString() !== new Date().toDateString() ? { month: 'short', day: 'numeric' } : {}),
                hour: '2-digit', minute: '2-digit'
            })}`;
        }
    }
    timer.textContent = `${estimate} | ${elapsed}`;
    timer.title = completed ? 'Finished at | Elapsed time'
        : 'Estimated finish at maximum epochs | Elapsed time. Early stopping can finish sooner. Export verification adds time.';
}
let dataBusy = false, datasetRevision = 0;
let personalityDatasetPromise;
let personalExport;
let providerChosen = false;
let savedElo = false;
let completionAudio;
async function prepareCompletionAudio() {
    try {
        completionAudio ??= new AudioContext();
        await completionAudio.resume();
    } catch(error) {
        console.warn('Could not enable the completion sound:', error);
    }
}
function notifyCompletion() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        $('#result-summary').scrollIntoView({
            block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
        });
    }));
    if(completionAudio?.state !== 'running') return;
    try {
        const tone = completionAudio.createOscillator(), volume = completionAudio.createGain();
        const now = completionAudio.currentTime;
        tone.frequency.value = 880;
        volume.gain.setValueAtTime(0, now);
        volume.gain.linearRampToValueAtTime(0.15, now + 0.01);
        volume.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        tone.connect(volume);
        volume.connect(completionAudio.destination);
        tone.onended = () => { tone.disconnect(); volume.disconnect(); };
        tone.start(now);
        tone.stop(now + 0.8);
    } catch(error) {
        console.warn('Could not play the completion sound:', error);
    }
}
let source = 'games', personalityLoadRevision = 0, gamesBaseNetwork = 'maia3';
let gamesElo = 1500, personalityElo = personalityPresets[0].elo;
let gamesMethod = 'full', personalityMethod = 'adapter', appliedMethod = 'full';
const methodSettings = {
    full: { epochs: '12', rate: '0.00001', anchor: '0.25', provider: 'webgpu' },
    adapter: { epochs: '40', rate: '0.005', anchor: '0', provider: 'wasm' },
    original: { epochs: '10', rate: '0.005', anchor: '0', provider: 'wasm' }
};
const fullTraining = () => $('#base-network').value === 'maia3' && $('#training-method').value === 'full';
const log = message => {
    $('#diagnostics').hidden = false;
    $('#log').textContent += `${message}\n`;
    $('#log').scrollTop = $('#log').scrollHeight;
};
function status(message, error = false) {
    const target = active ? $('#stage') : $('#status');
    const gpuMemoryError = error && /CreateHeap|CheckOutOfMemoryHRESULTImpl|out of memory/i.test(message);
    target.textContent = gpuMemoryError
        ? 'GPU memory allocation failed. Refresh, lower Full model batch to 4 or 1, and close other GPU-heavy tabs or apps before retrying. If it persists, choose Fast adapter with WASM CPU. Technical details are in the log below.'
        : message;
    target.dataset.error = String(error);
    if(error) { log(`Error. ${message}`); }
    return target.textContent;
}
function dismissRuntimeLoading() {
    $('#runtime-loading').hidden = true;
    $('#workbench-content').inert = false;
    $('.maia-workbench').setAttribute('aria-busy', 'false');
}
function controls(busy) {
    updateStartLabel();
    $('#clear-data').disabled = busy || dataBusy || !ready;
    $('#reset-settings').disabled = busy || dataBusy || !ready;
    $('#training-controls').disabled = !ready || !dataset || dataBusy;
    $('#training-controls').inert = !ready || !dataset || dataBusy;
    $('#training-form').querySelectorAll('input, select, button').forEach(element => {
        element.disabled = busy || dataBusy || !ready;
    });
    $('#base-network').disabled = busy || dataBusy || !ready || !dataset || source === 'personality';
    $('#provider').disabled = busy || dataBusy || !ready || fullTraining();
    $('#full-batch').disabled = busy || dataBusy || !ready || !fullTraining();
    $('#dataset-step').querySelectorAll('input, select, button').forEach(element => {
        element.disabled = busy || dataBusy || !ready;
    });
    for(const id of ['filter-elo', 'filter-elo-range'])
        $(`#${id}`).disabled = busy || dataBusy || !ready || !gamesDataset || !ratingSummary(gamesDataset).rated;
    $('#start').disabled = busy || dataBusy || !ready || !dataset
        || source === 'games' && $('#elo-filter-status').dataset.error === 'true';
    $('#stop').hidden = !busy;
    $('#stop').disabled = false;
    $('#training-form').setAttribute('aria-busy', String(busy));
}
function finish() {
    if(worker) worker.terminate();
    worker = undefined;
    active = false;
    clearInterval(elapsedTimer);
    updateTrainingClock();
    if(!completed) {
        $('#elapsed').textContent = $('#elapsed').textContent.split(' | ').at(-1);
        $('#elapsed').title = 'Elapsed time';
    }
    controls(false);
    if(!completed) $('#progress').value = 0;
    $('#stage').textContent = completed ? 'Finished and export verified' : 'Stopped';
}
function updateStartLabel() {
    const name = source === 'personality'
        ? personalityPresets.find(preset => preset.id === $('#personality-preset').value)?.name
        : dataset?.player;
    $('#start').textContent = name ? `Start training "${name}"` : 'Start training';
}
function resetDownloads() {
    updateStartLabel();
    $('#training-result').hidden = true;
    $('#result-summary').textContent = '';
    clearDownload($('#download-weights')); clearDownload($('#download-report'));
    personalExport = undefined;
    $('#use-in-app').hidden = true;
    $('#personality-report').hidden = true;
}
function updateDataset(value) {
    dataset = value;
    updateRunPositions();
    $('#training-step').hidden = !value;
    const personalityMode = source === 'personality';
    $('#elo-filter').hidden = personalityMode;
    $('#elo-warning').textContent = 'Import games to see their rating range.';
    $('#elo-warning').title = '';
    if(value && !personalityMode) {
        const original = gamesDataset || value;
        const ratings = ratingSummary(original);
        $('#elo-warning').textContent = ratings.rated
            ? `${ratings.minimum}-${ratings.maximum} Elo (${original.train.samples.length + original.validation.samples.length} positions)`
            : 'No per-game ratings are available. Import the original games with ratings to filter by Elo. Older reusable files only saved an average.';
        $('#elo-warning').title = [
            ratings.rated && ratings.maximum - ratings.minimum > 200 ? 'Try a narrower range.' : '',
            ratings.rated && ratings.missing ? `${ratings.missing} unrated games excluded.` : ''
        ].filter(Boolean).join(' ');
        for(const id of ['filter-elo', 'filter-elo-range'])
            $(`#${id}`).disabled = active || dataBusy || !ready || !ratings.rated;
    }
    const summary = $('#training-dataset-summary');
    summary.replaceChildren();
    $('#training-import-details').dataset.ready = String(Boolean(value));
    if(value) {
        const metrics = document.createElement('dl');
        metrics.className = 'maia-data-metrics';
        const counts = [
            ['Training games', value.train.gameIds.length],
            ['Training positions', value.train.samples.length],
            ['Validation games', value.validation.gameIds.length],
            ['Validation positions', value.validation.samples.length]
        ];
        for(const [label, count] of counts) {
            if(personalityMode && label.endsWith('games')) continue;
            const group = document.createElement('div');
            const term = document.createElement('dt'), number = document.createElement('dd');
            term.textContent = label;
            number.textContent = count.toLocaleString();
            group.append(term, number);
            metrics.append(group);
        }
        summary.append(metrics);
    }
    $('#training-dataset-summary').hidden = !value;
    $('#training-import-details').hidden = !value;
    $('#training-live').hidden = true;
    $('#diagnostics').hidden = true;
    $('#dataset-step').append($('#status'));
    if(value && !personalityMode) downloadLink($('#download-data'), new Blob([JSON.stringify(value)], { type: 'application/json' }), 'maia-training-data.json');
    else clearDownload($('#download-data'));
    resetDownloads();
    controls(false);
}
function getPersonalityDataset() {
    if(!personalityDatasetPromise)
        personalityDatasetPromise = loadPersonalityDataset().catch(error => {
            personalityDatasetPromise = undefined;
            throw error;
        });
    return personalityDatasetPromise;
}
function showTraining(focus = true) {
    if(!dataset) return;
    $('#training-form').after($('#status'));
    controls(false);
    if(focus) {
        $('#training-step').focus({ preventScroll: true });
        $('#training-step').scrollIntoView({ block: 'start' });
    }
}
let eloPreferenceKey;
async function applyPreparedDataset(value) {
    eloPreferenceKey = undefined;
    $('#elo-filter-status').textContent = '';
    $('#elo-filter-status').dataset.error = 'false';
    $('#filter-elo').value = value.playerElo || 1500;
    $('#filter-elo-range').value = '100';
    if(!savedElo && Number.isSafeInteger(value.playerElo) && value.playerElo > 0 && source === 'games') {
        const input = $('#maia3-elo');
        gamesElo = Math.max(Number(input.min), Math.min(Number(input.max), value.playerElo));
        input.value = gamesElo;
    }
    if(source === 'games') gamesDataset = value;
    updateDataset(value);
    if(source === 'games' && ratingSummary(value).rated) {
        const identity = typeof value.importIdentity === 'string' ? value.importIdentity
            : Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(
                JSON.stringify([...value.train.gameIds, ...value.validation.gameIds].sort())))),
            byte => byte.toString(16).padStart(2, '0')).join('');
        eloPreferenceKey = `acas-doppelmaia-elo:${identity}:${value.player}`;
        try {
            const stored = localStorage.getItem(eloPreferenceKey);
            if(stored) {
                const settings = JSON.parse(stored);
                if(!Number.isInteger(settings.target) || settings.target < 1 || settings.target > 4000
                    || !Number.isInteger(settings.tolerance) || settings.tolerance < 0 || settings.tolerance > 4000)
                    throw new Error('Saved Elo range is invalid.');
                $('#filter-elo').value = settings.target;
                $('#filter-elo-range').value = settings.tolerance;
            }
        } catch(error) {
            console.error('DoppelMaia Elo settings restore:', error);
            status(`Could not restore this file's Elo range. ${error.message}`, true);
        }
        applyEloFilter(false);
    }
    showTraining(false);
}
function applyEloFilter(save = true) {
    if(!gamesDataset || active || !ratingSummary(gamesDataset).rated) return;
    if(['filter-elo', 'filter-elo-range'].some(id => !$(`#${id}`).checkValidity())) {
        $('#elo-filter-status').textContent = 'Enter a valid target Elo and range.';
        $('#elo-filter-status').dataset.error = 'true';
        controls(false);
        return;
    }
    try {
        const target = Number($('#filter-elo').value), tolerance = Number($('#filter-elo-range').value);
        const filtered = filterDatasetElo(gamesDataset, target, tolerance);
        updateDataset(filtered);
        $('#elo-filter-status').textContent = ` \u279C ${target - tolerance}-${target + tolerance} Elo (${filtered.train.samples.length + filtered.validation.samples.length} positions)`;
        $('#elo-filter-status').dataset.error = 'false';
        if(!savedElo) {
            gamesElo = Math.max(600, Math.min(2600, filtered.playerElo));
            $('#maia3-elo').value = gamesElo;
        }
        if(save && eloPreferenceKey) {
            try { localStorage.setItem(eloPreferenceKey, JSON.stringify({ target, tolerance })); }
            catch(error) {
                console.error('DoppelMaia Elo settings save:', error);
                status(`Could not save this file's Elo range. ${error.message}`, true);
            }
        }
    } catch(error) {
        console.error('DoppelMaia Elo filter:', error);
        $('#elo-filter-status').textContent = error.message;
        $('#elo-filter-status').dataset.error = 'true';
    }
    controls(false);
}
for(const id of ['filter-elo', 'filter-elo-range'])
    $(`#${id}`).addEventListener('input', () => { if(!active && !dataBusy) applyEloFilter(); });
function savedGamesStatus(record) {
    $('#saved-data-status').textContent = record
        ? `${record.dataset.player} | ${(record.dataset.train.samples.length + record.dataset.validation.samples.length).toLocaleString()} positions saved`
        : 'No games saved on this browser.';
}
function savedGamesError(action, error) {
    console.error(`DoppelMaia saved games ${action}:`, error);
    $('#saved-data-status').textContent = `Could not ${action} saved games. ${error.message}`;
}
$('#clear-data').addEventListener('click', async () => {
    dataBusy = true;
    controls(false);
    try {
        await clearPreparedGames();
        savedGamesStatus(undefined);
    } catch(error) { savedGamesError('clear', error); }
    finally { dataBusy = false; controls(false); }
});
initializePreparation({
    request,
    onReset: () => {
        datasetRevision++;
        gamesDataset = undefined;
        updateDataset(undefined);
        status('Import your games to begin.');
    },
    onDataset: async value => {
        await applyPreparedDataset(value);
        status('');
        try { savedGamesStatus(await savePreparedGames(value)); }
        catch(error) { savedGamesError('save', error); }
    },
    onBusy: value => { dataBusy = value; controls(false); }
});
function progress(current, total) {
    $('#progress').max = total;
    $('#progress').value = current;
}
function measured(point) {
    const now = performance.now();
    if(evaluationTimingStart !== undefined) evaluationMilliseconds = now - evaluationTimingStart;
    evaluationTimingStart = undefined;
    batchTimingStart = now;
    if(point.epoch === 0) epochTimingStart = now;
    else if(epochTimingStart !== undefined) {
        const epochDuration = (now - epochTimingStart) / point.epoch;
        estimatedTrainingEnd = now + epochDuration * (Number($('#epochs').value) - point.epoch);
        updateTrainingClock();
    }
    history.push(point);
    drawLearningChart($('#loss-chart'), history);
    drawLearningChart($('#accuracy-chart'), history, true);
    $('#epoch').textContent = point.epoch;
    const best = history.reduce((a, b) => a.validationLoss <= b.validationLoss ? a : b);
    $('#best-epoch').textContent = best.epoch;
    const measure = source === 'personality' ? 'target agreement' : 'move match';
    const values = [
        ['Train loss', point.trainLoss.toFixed(5)],
        ['Validation objective', point.validationLoss.toFixed(5)],
        [`Train ${measure}`, `${(point.trainAccuracy * 100).toFixed(1)}%`],
        [`Validation ${measure}`, `${(point.validationAccuracy * 100).toFixed(1)}%`]
    ];
    log(`Epoch ${point.epoch}${point.epoch === 0 ? ' (baseline)' : ''}\n`
        + values.map(([label, value]) => `  ${label.padEnd(27)} ${value}`).join('\n') + '\n');
    if(point.openingReplayLoss !== undefined) log(`Known opening replay CE ${point.openingReplayLoss.toFixed(5)}. This replay is not held out.`);
    if(source === 'games' && $('#training-goal').value === 'shape')
        log(`Held out expected target pawn occupancy ${(point.shapeScore * 100).toFixed(2)}%.`);
}

$('#base-weights').addEventListener('change', resetDownloads);
function updateRunPositions() {
    const input = $('#run-positions'), maximum = fullTraining() ? 50000 : 10000;
    if(Number(input.value) === Number(input.max) || Number(input.value) > maximum) input.value = maximum;
    input.max = maximum;
    const total = dataset ? dataset.train.samples.length + dataset.validation.samples.length : 0;
    const count = Math.min(total, Number(input.value));
    const tip = $('#run-positions-help');
    if(tip) tip.textContent = total && input.validity.valid
        ? `Using ${count.toLocaleString()} of ${total.toLocaleString()} prepared positions, including validation.${count < total ? ' Evenly sampled from each split. Saved data stays unchanged.' : ''}`
        : 'Maximum positions to use in this run, including validation. Smaller runs sample each split without changing saved data. Full Maia 3 allows 50,000, other methods allow 10,000.';
}
$('#run-positions').addEventListener('input', () => { updateRunPositions(); resetDownloads(); });
function updateTrainingMethod() {
    const maia3 = $('#base-network').value === 'maia3';
    $('#run-positions-field').hidden = maia3;
    const selected = maia3 ? $('#training-method').value : 'original';
    if(selected !== appliedMethod) {
        methodSettings[appliedMethod] = { epochs: $('#epochs').value, rate: $('#learning-rate').value,
            anchor: $('#base-anchor').value, provider: $('#provider').value };
        const settings = methodSettings[selected];
        $('#epochs').value = settings.epochs;
        $('#learning-rate').value = settings.rate;
        $('#base-anchor').value = settings.anchor;
        $('#provider').value = settings.provider;
        appliedMethod = selected;
    }
    $('#training-method-field').hidden = !maia3;
    $('#full-batch-field').hidden = selected !== 'full';
    $('#full-batch').disabled = active || dataBusy || !ready || selected !== 'full';
    $('#learning-rate').min = '0.00000001';
    $('#learning-rate').max = selected === 'full' ? '0.001' : '0.1';
    $('#provider option[value="wasm"]').disabled = selected === 'full';
    if(selected === 'full') $('#provider').value = 'webgpu';
    $('#provider').disabled = active || dataBusy || !ready || selected === 'full';
    updateRunPositions();
    updateLearningLabels();
}
$('#training-method').addEventListener('change', () => {
    if(source === 'games') gamesMethod = $('#training-method').value;
    else personalityMethod = $('#training-method').value;
    updateTrainingMethod();
    resetDownloads();
});
$('#base-network').addEventListener('change', () => {
    if(source === 'games') gamesBaseNetwork = $('#base-network').value;
    const custom = $('#base-network').value === 'custom';
    $('#custom-weights-field').hidden = !custom;
    $('#base-weights').required = custom;
    const maia3 = $('#base-network').value === 'maia3';
    updateTrainingMethod();
    $('#base-network').disabled = source === 'personality' || !ready || !dataset || dataBusy;
    $('#maia3-elo-field').hidden = !maia3;
    $('#personality-strength-field').hidden = source !== 'personality';
    $('#goal-field').hidden = !maia3;
    if(!maia3) $('#training-goal').value = 'imitate';
    updateGoal();
    if(maia3 && !providerChosen && navigator.gpu) navigator.gpu.requestAdapter().then(adapter => {
        if(adapter && !providerChosen && !active && $('#base-network').value === 'maia3') {
            methodSettings.adapter.provider = 'webgpu';
            $('#provider').value = 'webgpu';
        }
    }).catch(error => status(`Could not check WebGPU support. ${error.message}`, true));
    resetDownloads();
});
$('#provider').addEventListener('change', () => { providerChosen = true; });
function updateGoal() {
    const maia3 = $('#base-network').value === 'maia3', goal = $('#training-goal').value;
    const personalityMode = source === 'personality';
    $('#opening-field').hidden = personalityMode || !maia3 || goal !== 'opening';
    $('#opening-line').required = !personalityMode && maia3 && goal === 'opening';
    $('#shape-field').hidden = personalityMode || !maia3 || goal !== 'shape';
    $('#shape-squares').required = !personalityMode && maia3 && goal === 'shape';
    $('#base-anchor-field').hidden = personalityMode || !maia3 || goal !== 'imitate';
    $('#goal-field').hidden = personalityMode || !maia3;
}
$('#training-goal').addEventListener('change', () => { updateGoal(); resetDownloads(); });
$('#base-anchor').addEventListener('change', resetDownloads);

function renderPersonalityControls() {
    $('#personality-preset').replaceChildren(...personalityPresets.map(preset => {
        const option = document.createElement('option');
        if(!personalityDescriptions[preset.id]) throw new Error(`Missing description for personality ${preset.id}.`);
        option.value = preset.id;
        option.textContent = `${preset.name} (${personalityDescriptions[preset.id]})`;
        return option;
    }));
    $('#personality-fields').replaceChildren(...personalityTraits.map(trait => {
        const label = document.createElement('label');
        label.className = 'tool-field';
        label.textContent = trait.label;
        const input = document.createElement('input');
        input.type = 'number'; input.id = `personality-weight-${trait.id}`;
        input.dataset.trait = trait.id; input.min = trait.min; input.max = trait.max; input.step = trait.step;
        input.value = '0'; input.required = true;
        label.append(input);
        input.addEventListener('input', resetDownloads);
        return label;
    }));
    $('#personality-strength').addEventListener('input', resetDownloads);
    $('#personality-preset').addEventListener('change', () => {
        const preset = personalityPresets.find(item => item.id === $('#personality-preset').value);
        if(!preset) return;
        personalityElo = preset.elo;
        if(source === 'personality') $('#maia3-elo').value = preset.elo;
        $('#personality-strength').value = preset.strength;
        for(const trait of personalityTraits)
            $(`#personality-weight-${trait.id}`).value = preset.weights[trait.id];
        resetDownloads();
    });
    $('#personality-preset').value = personalityPresets[0]?.id || '';
    $('#personality-preset').dispatchEvent(new Event('change'));
}
renderPersonalityControls();
const fieldHelp = {
    'training-source': 'Learn from your own moves, or train soft personality preferences on practice positions. Personality training does not copy a human player.',
    'personality-preset': 'Choose a starting set of move preferences, then adjust Advanced personality options. Presets describe soft habits, not complete human personalities.',
    player: 'The player whose moves will be learned. The player appearing in the most imported games is selected automatically. Only their moves become training examples.',
    positions: 'Maximum imported positions to use. Full Maia 3 supports up to 50,000, while the fast adapter and original Maia allow 10,000. Larger imports take longer.',
    'run-positions': 'Maximum positions to use in this run, including validation. Smaller runs sample each split without changing saved data. Full Maia 3 allows 50,000, other methods allow 10,000.',
    'skip-plies': 'Skip this many half-moves at the start of each game. Leave at zero to include opening habits. Original Maia also needs eight positions of history, so its earliest moves are skipped.',
    validation: 'Set aside whole games to measure learning on moves not used for training. Repeated games count once. A lower training loss alone does not prove learning.',
    'base-network': 'Maia 3 is recommended for opening habits and exports a complete ONNX model. Original Maia uses separate rating networks and exports Lc0 weights. Its final policy convolution is trained while its neural tower and value head stay fixed.',
    'training-method': 'Full Maia 3 trains all eight transformer blocks and the move head, and requires WebGPU. Its value estimates can change too. Fast adapter learns a small adapter over fixed features, with optional opening memory, using CPU or WebGPU.',
    'maia3-elo': 'Rating input for the starting Maia 3 model. Automatically filled with your selected player average Elo when the import includes ratings, within the supported range. You can change it.',
    'personality-strength': 'How strongly the personality weights affect move preferences, from zero to three. Zero keeps the base preferences. Stronger settings are not a higher playing rating.',
    'base-anchor': 'Choose how much of the starting model to keep. Prefer base mixes 80% base choices with 20% your moves. Balanced uses 50/50, Mostly your moves uses 25/75, and Max personalization uses only your moves.',
    'training-goal': 'Imitate games learns your recorded moves. Prefer an opening teaches a specific opening line alongside your games. Prefer a board shape adds a gentle preference for your chosen pawn squares.',
    'opening-line': 'Enter the opening moves you want Maia to favor, for example 1. e4 e5 2. Nf3 Nc6. The line must be legal from the starting position. Training combines it with your imported games.',
    'shape-squares': 'Space-separated pawn squares, such as d4 e4, viewed from the moving side. This adds a gentle move preference rather than teaching a future pawn formation.',
    'base-weights': 'Upload original Lc0 weights with classical inputs and a compatible convolutional policy head (.pb or .pb.gz). Other Python checkpoints and Maia 2 training are not supported.',
    epochs: 'Maximum passes over the training examples. The best validation checkpoint is kept, including the unchanged model if training does not help. Keep this tab open while training.',
    'learning-rate': 'Size of each training update. Higher values change the model faster but can make learning unstable. Start with the default for the selected method.',
    'full-batch': 'Positions processed together during full model training. Larger batches need more GPU memory. Lower this if your GPU runs out of memory.',
    provider: 'WASM uses your CPU. WebGPU uses a supported GPU and is required for full Maia 3 training. Preparation and training time depend on your hardware.'
};
for(const trait of personalityTraits) {
    fieldHelp[`personality-weight-${trait.id}`] = `${trait.label}: positive weights favor this feature, negative weights discourage it, and zero adds no preference. Range: minus four to four. These are soft move preferences, not guaranteed behavior.`;
}
let positionFieldHelp;
window.addEventListener('resize', () => positionFieldHelp?.());
window.addEventListener('scroll', () => positionFieldHelp?.(), true);
for(const [id, text] of Object.entries(fieldHelp)) {
    const input = $(`#${id}`);
    const label = input.closest('.tool-field').querySelector(`label[for="${id}"]`) || input.closest('label');
    const heading = document.createElement('span');
    heading.className = 'maia-field-label';
    if(label === input.closest('.tool-field')) {
        const field = document.createElement('div');
        for(const attribute of label.attributes) field.setAttribute(attribute.name, attribute.value);
        const name = document.createElement('label');
        name.htmlFor = id;
        for(const node of [...label.childNodes]) {
            if(node.nodeType === Node.TEXT_NODE) name.append(node);
        }
        heading.append(name);
        field.append(heading, ...label.childNodes);
        label.replaceWith(field);
    } else {
        label.replaceWith(heading);
        heading.append(label);
    }
    const help = document.createElement('span');
    help.className = 'maia-field-help';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'bi bi-info-circle';
    trigger.setAttribute('aria-label', `Help for ${heading.textContent.trim()}`);
    trigger.setAttribute('aria-describedby', `${id}-help`);
    const tip = document.createElement('span');
    tip.id = `${id}-help`;
    tip.className = 'maia-field-tip';
    tip.setAttribute('role', 'tooltip');
    tip.textContent = text;
    help.append(trigger, tip);
    heading.append(help);
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), tip.id].filter(Boolean).join(' '));
    const position = () => {
        positionFieldHelp = position;
        const rect = trigger.getBoundingClientRect();
        const width = Math.min(300, innerWidth - 24);
        tip.style.width = `${width}px`;
        tip.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - width - 12))}px`;
        tip.style.top = `${Math.max(12, Math.min(rect.bottom + 6, innerHeight - tip.offsetHeight - 12))}px`;
    };
    trigger.addEventListener('click', event => event.preventDefault());
    help.addEventListener('mouseenter', position);
    help.addEventListener('focusin', position);
    trigger.addEventListener('keydown', event => {
        if(event.key === 'Escape') { tip.style.visibility = 'hidden'; trigger.blur(); }
    });
    for(const event of ['mouseenter', 'focusin']) help.addEventListener(event, () => { tip.style.visibility = ''; });
}

function updateLearningLabels() {
    const personalityMode = source === 'personality';
    $('#loss-caption').childNodes[0].textContent = personalityMode ? 'Soft target cross entropy ' : 'Move prediction loss ';
    $('#accuracy-caption').childNodes[0].textContent = personalityMode ? 'Practice target move agreement ' : 'Move match rate ';
    $('#accuracy-chart').setAttribute('aria-label', personalityMode
        ? 'Training and validation agreement with the practice target by epoch'
        : 'Training and validation move accuracy by epoch');
    $('#learning-legend').replaceChildren(...(personalityMode
        ? ['Training positions', 'Validation positions'] : ['Training games', 'Validation games']).map(text => {
            const span = document.createElement('span'); span.textContent = text; return span;
        }));
}
function setSourceControls() {
    const personalityMode = source === 'personality';
    $('#data-form').hidden = personalityMode;
    $('#personality-preset-field').hidden = !personalityMode;
    $('#prepare').hidden = personalityMode;
    $('#personality-controls').hidden = !personalityMode;
    $('#prep-status').hidden = true;
    $('#base-network-field').hidden = personalityMode;
    $('#base-network').disabled = personalityMode || !ready || !dataset || dataBusy;
    $('#base-network').value = personalityMode ? 'maia3' : gamesBaseNetwork;
    $('#training-method').value = personalityMode ? personalityMethod : gamesMethod;
    $('#base-network').dispatchEvent(new Event('change'));
    if(!personalityMode) {
        dataBusy = false;
        updateDataset(gamesDataset);
        applyEloFilter(false);
        status(gamesDataset ? '' : 'Import your games to begin.');
        controls(false);
    }
    updateLearningLabels();
}
$('#training-source').addEventListener('change', async () => {
    if(active) return;
    const selected = $('#training-source').value;
    if(selected === source) return;
    if(source === 'games') gamesElo = Number($('#maia3-elo').value);
    else personalityElo = Number($('#maia3-elo').value);
    source = selected;
    $('#maia3-elo').value = source === 'games' ? gamesElo : personalityElo;
    const revision = ++personalityLoadRevision;
    setSourceControls();
    if(source !== 'personality') return;
    dataBusy = true;
    updateDataset(undefined);
    controls(false);
    $('#prep-status').textContent = 'Checking Maia 3 practice positions...';
    status('Checking Maia 3 practice positions...');
    try {
        const value = await getPersonalityDataset();
        if(revision !== personalityLoadRevision || source !== 'personality') return;
        updateDataset(value);
        status('');
    } catch(error) {
        if(revision !== personalityLoadRevision || source !== 'personality') return;
        status(`Could not load personality practice positions. ${error.message}`, true);
    } finally {
        if(revision === personalityLoadRevision && source === 'personality') {
            dataBusy = false;
            controls(false);
        }
    }
});
$('#use-in-app').addEventListener('click', async () => {
    if(!personalExport || active) return;
    const button = $('#use-in-app'), exported = personalExport;
    const appTab = window.open('about:blank', '_blank');
    if(!appTab) {
        status('Could not open A.C.A.S. Allow pop-ups for this page and try again.', true);
        return;
    }
    appTab.opener = null;
    button.disabled = true;
    try {
        const id = await savePersonalModel(exported.file, exported.elo);
        appTab.location.href = new URL(`../../app/?personalModel=${encodeURIComponent(id)}&personalProvider=${exported.provider}`, location.href).href;
    } catch(error) {
        appTab.close();
        status(`Could not save your Maia 3 model. ${error.message}`, true);
    }
    finally { button.disabled = false; }
});
$('#stop').addEventListener('click', () => {
    if(!active) return;
    generation++;
    // Terminating also interrupts ONNX compilation or a pending converter subworker.
    finish(); status('Stopped. No incomplete model was exported.');
});
$('#training-form').addEventListener('submit', async event => {
    event.preventDefault();
    if(!ready || !dataset || active || dataBusy || source === 'games' && $('#elo-filter-status').dataset.error === 'true'
        || !$('#training-form').reportValidity()) return;
    const personalityMode = source === 'personality';
    let personality;
    try {
        if(personalityMode) personality = validatePersonality({
            strength: Number($('#personality-strength').value),
            weights: Object.fromEntries(personalityTraits.map(({ id }) => [id, Number($(`#personality-weight-${id}`).value)]))
        });
    } catch(error) { status(error.message, true); return; }
    prepareCompletionAudio();
    active = true;
    const run = ++generation;
    const epochs = Number($('#epochs').value), learningRate = Number($('#learning-rate').value);
    const provider = $('#provider').value;
    const baseNetwork = personalityMode ? 'maia3' : $('#base-network').value;
    const maia3 = baseNetwork === 'maia3';
    const full = maia3 && $('#training-method').value === 'full';
    const selectedWeights = baseNetwork === 'custom' ? $('#base-weights').files[0] : undefined;
    const baseLabel = personalityMode ? 'Maia 3 personality practice' : baseNetwork === 'custom' ? selectedWeights?.name : $('#base-network').selectedOptions[0].textContent;
    history = []; updates = 0; processed = 0; lastProcessed = 0; completed = false;
    epochTimingStart = undefined; estimatedTrainingEnd = undefined;
    batchTimingStart = undefined; trainingMilliseconds = 0;
    evaluationTimingStart = undefined; evaluationMilliseconds = 0;
    $('#log').textContent = '';
    $('#status').textContent = '';
    $('#training-progress').hidden = false;
    $('#training-live').hidden = false; $('#training-charts').hidden = false; $('#updates').textContent = '0'; $('#processed').textContent = '0';
    $('#diagnostics').hidden = false;
    $('#encoded').textContent = '0'; $('#epoch').textContent = '0';
    $('#best-epoch').textContent = 'Waiting'; $('#probability').textContent = 'Waiting';
    $('#personality-report').hidden = true;
    drawLearningChart($('#loss-chart'), []); drawLearningChart($('#accuracy-chart'), []);
    resetDownloads(); controls(true); status('Reading base Maia weights...');
    $('#stage').textContent = 'Reading base weights'; $('#progress').removeAttribute('value');
    startedAt = performance.now();
    updateTrainingClock(); elapsedTimer = setInterval(updateTrainingClock, 1000);
    try {
        const runDataset = limitTrainingDataset(dataset, Number($('#run-positions').value));
        if(runDataset !== dataset) log(`Using ${runDataset.train.samples.length} training and ${runDataset.validation.samples.length} validation positions. Saved data stays unchanged.`);
        if(baseNetwork === 'custom' && !selectedWeights) throw new Error('Choose a compatible Lc0 weights file.');
        if(selectedWeights?.size > 64 * 1024 * 1024) throw new Error('Use a compatible Lc0 weights file under 64 MB.');
        let weights;
        if(selectedWeights) weights = await selectedWeights.arrayBuffer();
        else if(!maia3) {
            const response = await fetch(`../../app/assets/lc0-nets/${baseNetwork}`);
            if(!response.ok) throw new Error(`Could not load ${baseLabel} weights: HTTP ${response.status}`);
            weights = await response.arrayBuffer();
        }
        if(run !== generation) return;
        worker = new Worker(new URL(maia3 ? './maia3-trainer-worker.js' : './trainer-worker.js', import.meta.url), { type: 'module' });
        worker.onerror = event => {
            if(run !== generation) return;
            status(event.message || 'Training worker failed.', true); finish();
        };
        worker.onmessageerror = () => {
            if(run !== generation) return;
            status('Training worker returned an unreadable message.', true); finish();
        };
        worker.onmessage = ({ data }) => {
            if(run !== generation) return;
            if(data.type === 'log') log(data.line);
            else if(data.type === 'stage') {
                $('#stage').textContent = data.stage; status(data.stage); $('#progress').removeAttribute('value');
                log(data.stage);
            } else if(data.type === 'features') {
                $('#encoded').textContent = `${data.processed} / ${data.total}`;
                progress(data.processed, data.total);
                showTrainingBoard($('#training-board'), data.fen, data.move);
                $('#current-move').textContent = `Encoding position ${data.processed}. ${personalityMode ? 'Target' : 'Your'} move ${data.move}`;
            } else if(data.type === 'batch') {
                updateBatchEstimate(data);
                if(data.processed <= lastProcessed) lastProcessed = 0;
                if(!lastProcessed) status(`Training epoch ${data.epoch} of ${epochs}...`);
                processed += data.processed - lastProcessed; lastProcessed = data.processed; updates++;
                $('#updates').textContent = updates; $('#processed').textContent = processed;
                $('#epoch').textContent = data.epoch; $('#probability').textContent = `${(data.probability * 100).toFixed(1)}%`;
                $('#stage').textContent = `Learning epoch ${data.epoch} of ${epochs}`;
                progress(data.processed, data.total);
                showTrainingBoard($('#training-board'), data.fen, data.move);
                $('#current-move').textContent = `Gradient update ${updates}. Target move ${data.move}.${Number.isFinite(data.loss) ? ` Sample loss ${data.loss.toFixed(3)}` : ''}`;
            } else if(data.type === 'evaluation') {
                startEvaluation();
                const message = data.epoch
                    ? personalityMode ? `Measuring epoch ${data.epoch} against the personality target...`
                        : `Measuring epoch ${data.epoch} on training and held out games...`
                    : 'Measuring the untouched base model...';
                $('#stage').textContent = message; status(message); $('#progress').removeAttribute('value');
            } else if(data.type === 'epoch') {
                measured(data.point);
                $('#stage').textContent = data.point.epoch ? `Epoch ${data.point.epoch} evaluated` : 'Baseline measured. Starting weight updates...';
            } else if(data.type === 'error' || data.type === 'stopped') {
                status(data.message, data.type === 'error'); finish();
            } else if(data.type === 'complete') {
                const report = { ...data.report, player: runDataset.player, datasetOptions: runDataset.options,
                    trainingGames: runDataset.train.gameIds.length, validationGames: runDataset.validation.gameIds.length,
                    baseWeights: baseLabel,
                    elapsedSeconds: (performance.now() - startedAt) / 1000 };
                if(personalityMode) {
                    report.personalityId = $('#personality-preset').value;
                    report.personalityConfiguration = personality;
                    report.trainingGoal = 'personality';
                }
                const slug = (personalityMode
                    ? personalityPresets.find(preset => preset.id === $('#personality-preset').value).name
                    : dataset.player)
                    .replace(/[^a-z0-9_-]/gi, '_').slice(0, 60) || (personalityMode ? 'personality' : 'player');
                const file = new File([data.weights], maia3 ? `maia3-${slug}.onnx` : `maia-${slug}.pb.gz`,
                    { type: maia3 ? 'application/octet-stream' : 'application/gzip' });
                $('#download-weights').textContent = maia3 ? 'Download Maia 3 ONNX' : 'Download Lc0 weights';
                downloadLink($('#download-weights'), file, file.name);
                if(maia3) {
                    personalExport = { file, elo: report.elo, provider };
                    $('#use-in-app').hidden = false;
                }
                downloadLink($('#download-report'), new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `maia-${slug}-report.json`);
                $('#best-epoch').textContent = report.bestEpoch;
                const summary = personalityMode ? personalitySummary(report) : maia3 ? validationSummary(report) : '';
                const completionMessage = status((report.improved
                    ? `Best epoch ${report.bestEpoch}, verified exported ${personalityMode ? 'soft target cross entropy' : 'validation objective'} ${(report.exportedObjectiveLoss ?? report.exportedMetrics.loss).toFixed(3)}. Your ${maia3 ? 'Maia 3 ONNX model' : 'Lc0 weights'} are ready.`
                    : 'Finished without a held out improvement after export. The download retains your original base model, not a worse checkpoint.')
                    + (summary ? ` ${summary}` : ''));
                if(summary) log(summary);
                const comparisons = resultComparisons(report);
                $('#result-summary').replaceChildren();
                if(comparisons.length) {
                    const metrics = document.createElement('dl');
                    metrics.className = 'maia-result-metrics';
                    for(const comparison of comparisons) {
                        const row = document.createElement('div'), label = document.createElement('dt'), value = document.createElement('dd');
                        label.textContent = comparison.label;
                        value.textContent = comparison.original === null ? 'Not measured'
                            : `${(comparison.original * 100).toFixed(1)}% → ${(comparison.trained * 100).toFixed(1)}%`;
                        row.append(label, value); metrics.append(row);
                    }
                    $('#result-summary').append(metrics);
                } else $('#result-summary').textContent = completionMessage;
                const trainingAdvice = overfittingNote(report.history);
                if(trainingAdvice) {
                    const note = document.createElement('p');
                    note.textContent = trainingAdvice;
                    $('#result-summary').append(note);
                    log(trainingAdvice);
                }
                const weightsLink = document.createElement('a');
                weightsLink.href = `../../app/?shl=${maia3 ? 'maia3Model' : 'modernLc0Weight'}`;
                weightsLink.target = '_blank';
                weightsLink.rel = 'noopener noreferrer';
                weightsLink.textContent = maia3 ? 'Maia 3 Weights' : 'Lc0 Weights';
                $('#result-engine').replaceChildren(
                    document.createTextNode(maia3 ? 'Choose Maia 3 in the app, then upload your ONNX in ' : 'Choose Lc0 (not Legacy Lc0) in the app, then upload your weights in '),
                    weightsLink, document.createTextNode('.')
                );
                $('#training-result').hidden = false;
                if(report.valueWarning) log(report.valueWarning);
                if(personalityMode) showPersonalityMetrics(report.personality);
                log(maia3 ? 'Exported full Maia 3 ONNX verified in ONNX Runtime. This is not Lc0 protobuf and does not certify playing strength.'
                    : 'Export converted and verified with upstream Lc0. This does not certify playing strength.');
                completed = true; finish(); progress(1, 1);
                notifyCompletion();
            }
        };
        worker.postMessage({ type: 'train', weights, dataset: runDataset, provider,
            elo: Number($('#maia3-elo').value), goal: personalityMode ? 'personality' : $('#training-goal').value,
            ...(personalityMode ? { personality, personalityId: $('#personality-preset').value } : {}),
            opening: $('#opening-line').value, squares: $('#shape-squares').value,
            options: { epochs, learningRate, ...(maia3 ? { method: full ? 'full' : 'adapter' } : {}),
                ...(full ? { useHistory: true } : {}),
                batchSize: full ? Number($('#full-batch').value) : maia3 ? 32 : 16, patience: full ? 2 : maia3 ? 8 : 3,
                baseAnchor: !personalityMode && maia3 && $('#training-goal').value === 'imitate' ? Number($('#base-anchor').value) : 0 } }, weights ? [weights] : []);
    } catch(error) {
        if(run !== generation) return;
        status(error.message, true); finish();
    }
});
function personalitySummary(report) {
    const metrics = report.personality;
    if(!metrics) return 'Finished personality training. The report records soft target cross entropy and target move agreement, not human move matches or playing strength.';
    const values = ['baselineScore', 'learnedScore', 'targetScore'].filter(key => Number.isFinite(metrics[key]))
        .map(key => `${key.replace(/([A-Z])/g, ' $1').toLowerCase()} ${metrics[key].toFixed(4)}`);
    const direction = typeof metrics.scoreDirection === 'string' ? ` Score direction ${metrics.scoreDirection}.` : '';
    return `Finished personality training. This checks Maia against the requested practice target, not human move matches or playing strength.${values.length ? ` ${values.join('. ')}.` : ''}${direction}`;
}
function showPersonalityMetrics(metrics) {
    if(!metrics) return;
    const values = [
        ['Target score', [metrics.baselineScore, metrics.learnedScore, metrics.targetScore]],
        ['KL to target', [metrics.baselineKL, metrics.learnedKL,
            Number.isFinite(metrics.baselineKL) || Number.isFinite(metrics.learnedKL) ? 0 : undefined]]
    ].filter(([, scores]) => scores.some(Number.isFinite));
    if(!values.length) return;
    const list = $('#personality-metrics');
    list.replaceChildren(...values.map(([label, scores]) => {
        const metric = document.createElement('div');
        const term = document.createElement('dt'), description = document.createElement('dd');
        term.textContent = label;
        const [baseline, learned, requested] = scores.map(value => Number.isFinite(value) ? value.toFixed(5) : 'Not measured');
        description.textContent = `${baseline} → ${learned} (requested ${requested})`;
        metric.append(term, description);
        return metric;
    }));
    $('#personality-report .personality-status').hidden =
        !Number.isFinite(metrics.baselineKL) || !Number.isFinite(metrics.learnedKL);
    $('#personality-report').hidden = false;
}
window.addEventListener('beforeunload', event => { if(active) { event.preventDefault(); event.returnValue = ''; } });

const settingsKey = 'acas-doppelmaia-settings-v1';
$('#reset-settings').addEventListener('click', () => {
    try {
        localStorage.removeItem(settingsKey);
        for(const key of Object.keys(localStorage))
            if(key.startsWith('acas-doppelmaia-elo:')) localStorage.removeItem(key);
        location.reload();
    } catch(error) {
        console.error('DoppelMaia settings reset:', error);
        status(`Could not reset your settings. ${error.message}`, true);
    }
});
const rememberedFields = ['positions', 'skip-plies', 'validation', 'base-network', 'training-method',
    'maia3-elo', 'personality-preset', 'personality-strength', 'base-anchor', 'training-goal',
    'opening-line', 'shape-squares', 'epochs', 'learning-rate', 'full-batch', 'provider', 'run-positions',
    ...personalityTraits.map(trait => `personality-weight-${trait.id}`)];
const methodFields = { epochs: 'epochs', rate: 'learning-rate', anchor: 'base-anchor', provider: 'provider' };
function restoreField(id, value) {
    const input = $(`#${id}`);
    if(typeof value !== 'string' || (id === 'base-network' && value === 'custom')) return false;
    const previous = input.value;
    input.value = value;
    if(!input.checkValidity() || (input.tagName === 'SELECT' && input.value !== value)) {
        input.value = previous;
        return false;
    }
    return true;
}
function saveSettings() {
    if(source === 'games') gamesElo = Number($('#maia3-elo').value);
    else personalityElo = Number($('#maia3-elo').value);
    for(const [key, id] of Object.entries(methodFields))
        if($(`#${id}`).checkValidity()) methodSettings[appliedMethod][key] = $(`#${id}`).value;
    const fields = Object.fromEntries(rememberedFields.filter(id => $(`#${id}`).checkValidity())
        .map(id => [id, $(`#${id}`).value]));
    try {
        localStorage.setItem(settingsKey, JSON.stringify({
            fields, methods: methodSettings, source, gamesBaseNetwork, gamesMethod, personalityMethod, gamesElo, personalityElo
        }));
    } catch(error) {
        console.error('DoppelMaia settings save:', error);
        status(`Could not save your settings. ${error.message}`, true);
    }
}
let restoredSource = 'games';
function restoreSettings() {
    try {
        const raw = localStorage.getItem(settingsKey);
        if(!raw) return;
        const saved = JSON.parse(raw);
        if(!saved || typeof saved.fields !== 'object' || !saved.fields)
            throw new Error('Saved settings are invalid.');
        // Validate each method against its own learning-rate limits.
        for(const method of Object.keys(methodSettings)) {
            $('#learning-rate').max = method === 'full' ? '0.001' : '0.1';
            for(const [key, id] of Object.entries(methodFields))
                if(restoreField(id, saved.methods?.[method]?.[key]))
                    methodSettings[method][key] = $(`#${id}`).value;
        }
        $('#learning-rate').max = '0.1';
        for(const id of rememberedFields) restoreField(id, saved.fields[id]);
        gamesBaseNetwork = $('#base-network').value;
        if(saved.gamesBaseNetwork && restoreField('base-network', saved.gamesBaseNetwork))
            gamesBaseNetwork = $('#base-network').value;
        gamesMethod = ['full', 'adapter'].includes(saved.gamesMethod) ? saved.gamesMethod : $('#training-method').value;
        personalityMethod = ['full', 'adapter'].includes(saved.personalityMethod) ? saved.personalityMethod : 'adapter';
        restoredSource = saved.source === 'personality' ? 'personality' : 'games';
        for(const [key, value] of Object.entries({ gamesElo: saved.gamesElo, personalityElo: saved.personalityElo })) {
            if(Number.isInteger(value) && value >= 600 && value <= 2600) {
                if(key === 'gamesElo') gamesElo = value;
                else personalityElo = value;
            }
        }
        savedElo = typeof saved.fields['maia3-elo'] === 'string';
        $('#maia3-elo').value = gamesElo;
        $('#training-method').value = gamesMethod;
        appliedMethod = gamesBaseNetwork === 'maia3' ? gamesMethod : 'original';
        for(const [key, id] of Object.entries(methodFields)) $(`#${id}`).value = methodSettings[appliedMethod][key];
        providerChosen = true;
    } catch(error) {
        console.error('DoppelMaia settings restore:', error);
        status(`Could not restore your settings. ${error.message}`, true);
    }
}
restoreSettings();
document.addEventListener('change', event => {
    if(rememberedFields.includes(event.target.id) || event.target.id === 'training-source') {
        if(event.target.id === 'maia3-elo') savedElo = true;
        saveSettings();
    }
});
document.addEventListener('input', event => {
    if(rememberedFields.includes(event.target.id)) {
        if(event.target.id === 'maia3-elo') savedElo = true;
        saveSettings();
    }
});
controls(false);
$('#base-network').dispatchEvent(new Event('change'));
(async () => {
    try {
        ready = await prepareIsolation();
        if(!ready) return;
        dismissRuntimeLoading();
        status('Ready. Import your games to begin.');
        dataBusy = true;
        controls(false);
        try {
            const record = await loadPreparedGames();
            if(record) {
                $('#data-options').hidden = true;
                await applyPreparedDataset(record.dataset);
                status('Saved processed games restored. Ready to train.');
            }
            savedGamesStatus(record);
        } catch(error) { savedGamesError('restore', error); }
        finally { dataBusy = false; controls(false); }
        if(restoredSource === 'personality') {
            $('#training-source').value = restoredSource;
            $('#training-source').dispatchEvent(new Event('change'));
        }
    } catch(error) {
        dismissRuntimeLoading();
        status(`Could not start. ${error.message}`, true);
        $('#diagnostics').hidden = true;
        controls(false);
    }
})();
