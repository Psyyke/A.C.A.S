import * as ort from './vendor/ort.wasm.bundle.min.mjs';
import { openAssetCache, cacheFile } from './assets.js';

ort.env.wasm.wasmPaths = new URL('./vendor/', import.meta.url).href;
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
let session;
let config;
let current;
let phonemizer;
let printed;
let queue = Promise.resolve();

async function load(voice, id) {
    if(current === voice.id) return;
    const cache = await openAssetCache();
    const [modelFile, configFile] = await Promise.all([cache.match(voice.model), cache.match(voice.config)]);
    if(!modelFile || !configFile) throw new Error('Download or import this neural voice first.');
    await session?.release();
    current = null;
    config = await configFile.json();
    session = await ort.InferenceSession.create(await modelFile.arrayBuffer(), {
        executionProviders: ['wasm'], graphOptimizationLevel: 'all'
    });
    if(!phonemizer) {
        const base = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/';
        for(const name of ['piper_phonemize.js', 'piper_phonemize.wasm', 'piper_phonemize.data']) {
            if(!await cache.match(base + name)) await cacheFile(base + name, null, {
                onProgress: progress => self.postMessage({ id, progress })
            });
        }
        const script = await (await cache.match(base + 'piper_phonemize.js')).text();
        const wasm = await (await cache.match(base + 'piper_phonemize.wasm')).arrayBuffer();
        const data = await (await cache.match(base + 'piper_phonemize.data')).arrayBuffer();
        const url = URL.createObjectURL(new Blob([script, '\nexport default createPiperPhonemize;'], { type: 'text/javascript' }));
        try {
            const { default: createPhonemizer } = await import(url);
            phonemizer = await createPhonemizer({
                wasmBinary: wasm, getPreloadedPackage: () => data,
                locateFile: name => base + name,
                print: text => { printed = JSON.parse(text).phonemes; },
                printErr: message => { throw new Error(`Pena phonemizer: ${message}`); }
            });
        } finally { URL.revokeObjectURL(url); }
    }
    current = voice.id;
}

export function voicePhonemeIds(phonemes, config) {
    const map = config.phoneme_id_map;
    const lookup = phoneme => {
        const ids = map?.[phoneme];
        if(!Array.isArray(ids) || !ids.length || ids.some(id => !Number.isInteger(id) || id < 0 || id >= config.num_symbols))
            throw new Error(`Invalid voice phoneme mapping for ${JSON.stringify(phoneme)}.`);
        return ids;
    };
    if(!Number.isInteger(config.num_symbols) || config.num_symbols < 1)
        throw new Error('The voice configuration must declare its phoneme vocabulary size.');
    const pad = lookup('_');
    const ids = [...lookup('^'), ...pad];
    const missing = new Set();
    for(const phoneme of phonemes) {
        if(!Object.hasOwn(map, phoneme)) { missing.add(phoneme); continue; }
        ids.push(...lookup(phoneme), ...pad);
    }
    if(missing.size) console.warn('[Pena voice] Unsupported phonemes:', [...missing]);
    if(ids.length === lookup('^').length + pad.length) throw new Error('The voice could not pronounce this text.');
    return [...ids, ...lookup('$')];
}

self.onmessage = ({ data }) => {
    queue = queue.then(async () => {
        const started = performance.now();
        await load(data.voice, data.id);
        if(data.type === 'prepare') return { prepared: true };
        printed = null;
        phonemizer.callMain(['-l', config.espeak.voice, '--input', JSON.stringify([{ text: data.text }]),
            '--espeak_data', '/espeak-ng-data']);
        if(!printed?.length) throw new Error('The voice could not pronounce this text.');
        const ids = voicePhonemeIds(printed, config);
        const speed = Number(data.rate);
        const speaker = Number(data.speaker);
        if(!Number.isFinite(speed) || speed < 0.5 || speed > 2) throw new Error('Speech speed must be between 0.5 and 2.');
        if(!Number.isInteger(speaker) || speaker < 0 || speaker >= (config.num_speakers || 1))
            throw new Error(`This voice supports speaker IDs 0 to ${(config.num_speakers || 1) - 1}.`);
        const feeds = {
            input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
            input_lengths: new ort.Tensor('int64', BigInt64Array.of(BigInt(ids.length)), [1]),
            scales: new ort.Tensor('float32', Float32Array.of(config.inference.noise_scale,
                config.inference.length_scale / speed, config.inference.noise_w), [3])
        };
        if(session.inputNames.includes('sid')) feeds.sid = new ort.Tensor('int64', BigInt64Array.of(BigInt(speaker)), [1]);
        let result;
        try {
            result = await session.run(feeds);
            return { audio: new Float32Array(result.output.data), sampleRate: config.audio.sample_rate,
                elapsed: performance.now() - started };
        } finally {
            Object.values(feeds).forEach(tensor => tensor.dispose());
            if(result) Object.values(result).forEach(tensor => tensor.dispose());
        }
    }).then(result => self.postMessage({ id: data.id, result }, result.audio ? [result.audio.buffer] : []))
        .catch(error => self.postMessage({ id: data.id, error: error.message }));
};
