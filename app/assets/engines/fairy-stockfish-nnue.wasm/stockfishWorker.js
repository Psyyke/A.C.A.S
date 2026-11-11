importScripts('/A.C.A.S/app/assets/engines/fairy-stockfish-nnue.wasm/stockfish.js');

let engine = null;
let files = {};
let configured = false;
let configuring = null;
let configurationOutput = null;
let failed = false;

function fail(error) {
    if(failed) return;
    failed = true;
    postMessage({ type: 'error', message: `Fairy-Stockfish: ${error.message || error}` });
}

function configureFiles() {
    if(!engine || configuring || failed) return configuring;
    configuring = (async () => {
        const { fairyVariantContents } = await import('../text-files.js');
        const { text, names } = fairyVariantContents(files.VariantPath ?? '');
        if(text.trim()) {
            engine.FS.writeFile('/acas-variants.ini', text);
            await new Promise((resolve, reject) => {
                let variants = [], diagnostics = [];
                const timer = setTimeout(() => {
                    configurationOutput = null;
                    reject(new Error('VariantPath: timed out loading the variant definitions.'));
                }, 10000);
                configurationOutput = line => {
                    if(!/^(option |id |Parsing variant:)/.test(line)
                        && /\b(error|invalid|unknown|failed|unsupported|missing)\b/i.test(line))
                        diagnostics.push(line);
                    if(line.startsWith('option name UCI_Variant '))
                        variants = line.split(' var ').slice(1).map(value => value.trim());
                    if(line.trim() !== 'readyok') return;
                    clearTimeout(timer);
                    configurationOutput = null;
                    const missing = names.filter(name => !variants.includes(name));
                    if(diagnostics.length || missing.length)
                        reject(new Error(`VariantPath: ${diagnostics.join('\n') || `could not load ${missing.join(', ')}`}`));
                    else resolve();
                };
                engine.postMessage('check /acas-variants.ini');
                engine.postMessage('setoption name VariantPath value /acas-variants.ini');
                engine.postMessage('uci');
                engine.postMessage('isready');
            });
        }
        configured = true;
    })().catch(fail);
    return configuring;
}

(async () => {
    engine = await Stockfish({ printErr: line => {
        if(configurationOutput) configurationOutput(line);
        else console.warn('[Fairy-Stockfish]', line);
    } });
    engine.addMessageListener(line => {
        if(configurationOutput) configurationOutput(line);
        else postMessage(line);
    });
})().catch(fail);

onmessage = e => {
    if(failed) return;
    if(e.data?.type === 'initialize-files') {
        if(configuring) {
            fail(new Error('Text files must be supplied before engine startup.'));
            return;
        }
        files = e.data.files ?? {};
        return;
    }
    const { method, args } = e.data;

    if(!engine || !configured) {
        configureFiles();
        postMessage(false);
        return;
    }

    if(engine && method === 'acas_check_loaded') {
        postMessage(true);

        return;
    }

    if(engine[method] && typeof engine[method] === 'function') {
        engine[method](...args);
    }
};