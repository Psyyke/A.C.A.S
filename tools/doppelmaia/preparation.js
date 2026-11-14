import { detectImport } from './files.js';

export function initializePreparation({ request, onReset, onDataset, onBusy }) {
    const $ = selector => document.querySelector(selector);
    let busy = false, parsed = false, warnings = 0;
    let stageStarted = 0, importIdentity;
    const hash = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('');
    function status(message, error = false) {
        stageStarted = performance.now();
        $('#import-time').textContent = error ? '' : 'Estimating...';
        $('#import-progress-label').textContent = error ? 'Import failed.' : message;
        $('#import-progress').removeAttribute('value');
        $('#prep-status').textContent = message;
        $('#prep-status').dataset.error = String(error);
        $('#prep-status').hidden = !error;
        $('#import-example').hidden = !error;
        if(error) {
            $('#training-import-details').hidden = false;
            console.error('DoppelMaia import:', message);
        }
    }
    function setBusy(value) {
        busy = value;
        onBusy(value);
        $('#data-form').setAttribute('aria-busy', String(value));
        $('#import-loading').hidden = !value;
    }
    function progress({ current, total }) {
        if(!(total > 0)) return;
        $('#import-progress').max = total;
        $('#import-progress').value = current;
        const elapsed = performance.now() - stageStarted;
        if(current >= total) {
            $('#import-time').textContent = 'Finishing this stage...';
        } else if(current > 0 && elapsed >= 500) {
            const seconds = Math.max(1, Math.ceil(elapsed / current * (total - current) / 1000));
            const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
            const duration = hours ? `${hours} h ${minutes} min`
                : minutes ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;
            $('#import-time').textContent = `About ${duration} left in this stage`;
        }
    }
    function reset() {
        parsed = false;
        warnings = 0;
        importIdentity = undefined;
        $('#data-settings').hidden = true;
        $('#player').replaceChildren();
        $('#prep-status').hidden = true;
        $('#import-example').hidden = true;
        $('#data-options').hidden = false;
        onReset();
    }

    // A dataset without both splits cannot train and used to replace good saved
    // games before the trainer finally rejected it.
    function ensureTrainableDataset(dataset) {
        if(dataset?.train?.samples?.length && dataset?.validation?.samples?.length) return;
        if(!dataset?.train?.samples?.length)
            throw new Error('No positions were prepared. Check the position limit and that the selected player has games.');
        throw new Error('No validation positions were prepared. The selected player needs at least two different games.');
    }
    async function prepare() {
        if(!parsed || !$('#player').value) return;
        onReset();
        for(const input of $('#data-options').querySelectorAll('input')) if(!input.reportValidity()) return;
        setBusy(true);
        status('Checking your moves and setting aside games to measure learning...');
        try {
            const result = await request({ type: 'prepare', player: $('#player').value, options: {
                maxPositions: Number($('#positions').value), skipFirstPlies: Number($('#skip-plies').value),
                validationFraction: Number($('#validation').value), seed: 42, maxPerGame: 200
            } }, progress);
            const dataset = { ...result.dataset, importIdentity };
            ensureTrainableDataset(dataset);
            await onDataset(dataset);
            status(warnings ? `Games ready. ${warnings} entries were skipped. See the browser console.` : 'Games ready.');
        } catch(error) { status(error.message, true); }
        finally { setBusy(false); }
    }
    async function read() {
        if(busy) return;
        reset();
        const files = [...$('#games').files];
        if(!files.length) { status('Choose exported game files to begin.'); return; }
        if(files.reduce((total, file) => total + file.size, 0) > 100 * 1024 * 1024) {
            status('Choose files totaling at most 100 MB.', true); return;
        }
        setBusy(true);
        toast.message('Processing matches, please wait...', 3000);
        try {
            const inputs = [], hashes = [];
            status('Reading game files...');
            for(let i = 0; i < files.length; i++) {
                const text = await files[i].text();
                hashes.push(await hash(text));
                inputs.push(detectImport(text, files[i].name));
                progress({ current: i + 1, total: files.length });
            }
            importIdentity = await hash(hashes.sort().join(':'));
            if(inputs.some(input => input.kind === 'dataset')) {
                if(inputs.length !== 1) throw new Error('Import one reusable data file at a time, without other game files.');
                status('Checking saved positions and game separation...');
                const result = await request({ type: 'validate', dataset: inputs[0].dataset }, progress);
                $('#data-options').hidden = true;
                const dataset = { ...result.dataset, importIdentity };
                ensureTrainableDataset(dataset);
                await onDataset(dataset);
                status('Games ready.');
                return;
            }
            status('Parsing and checking every game...');
            const result = await request({ type: 'parse', files: inputs.map(input => input.file) }, progress);
            for(const item of result.diagnostics) {
                const message = `${item.file}, entry ${item.entry}. ${item.status}. ${item.message}`;
                if(item.status === 'rejected') console.warn('DoppelMaia import:', message);
                else console.info('DoppelMaia import:', message);
            }
            warnings = result.diagnostics.filter(item => item.status === 'rejected').length;
            if(!result.count) throw new Error('No valid games with moves were found. See the browser console.');
            if(!result.players.length) throw new Error('No player names were found. Include White and Black names in your PGN or export.');
            parsed = true;
            const options = result.players.map(name => new Option(name, name));
            if(options.length > 1) options.unshift(new Option('Choose your player', ''));
            $('#player').replaceChildren(...options);
            $('#player').value = result.recommendedPlayer;
            $('#data-settings').hidden = result.players.length === 1;
            status(`Read ${result.count} unique games. Choose your player.${warnings ? ' Some entries were skipped. See the browser console.' : ''}`);
            if($('#player').value) await prepare();
        } catch(error) { status(error.message, true); }
        finally {
            setBusy(false);
        }
    }
    $('#data-form').addEventListener('submit', event => { event.preventDefault(); });
    $('#games').addEventListener('change', read);
    $('#player').addEventListener('change', () => { if(!busy) void prepare(); });
    $('#data-options').addEventListener('change', () => { if(!busy) void prepare(); });
    return { reset };
}
