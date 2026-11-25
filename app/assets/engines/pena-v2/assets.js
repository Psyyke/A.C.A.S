import { penaText } from './i18n.js';

export const RECOGNITION_MODEL = {
    id: 'onnx-community/whisper-base',
    revision: '27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c'
};
export const VAD_MODEL = {
    revision: '6478567951ae5c9979ad7b234185b5515f4be7a1',
    url: 'https://raw.githubusercontent.com/snakers4/silero-vad/6478567951ae5c9979ad7b234185b5515f4be7a1/src/silero_vad/data/silero_vad.onnx'
};
export const PIPER_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/ae9d8352b73c1b1750748843e753a504b00e05b0/';
export const DEFAULT_VOICE = 'en_US-ljspeech-high';
const CACHE = 'acas-pena-language-v1';
const INDEX = 'https://acas.invalid/pena/saved-voices.json';
const voiceLoads = new Map();
const LEGACY_CACHE = 'acas-queen-language-v1';
const LEGACY_BASE = 'https://acas.invalid/queen/';
let legacyMove = null;

// Carries voices and speech models over from the cache name used before the Pena rename, then drops it.
async function moveLegacyCache() {
    if(!await caches.has(LEGACY_CACHE)) return;
    const [legacy, cache] = await Promise.all([caches.open(LEGACY_CACHE), caches.open(CACHE)]);
    const relink = text => text.replaceAll(LEGACY_BASE, 'https://acas.invalid/pena/');
    for(const request of await legacy.keys()) {
        const response = await legacy.match(request);
        if(!response) continue;
        const url = relink(request.url);
        if(await cache.match(url)) continue;
        const body = url === INDEX ? relink(await response.text()) : await response.blob();
        await cache.put(url, new Response(body, { headers: response.headers }));
    }
    await caches.delete(LEGACY_CACHE);
}

export const openAssetCache = async () => {
    legacyMove ??= moveLegacyCache().catch(error => console.warn('Could not move old Pena voice cache', error));
    await legacyMove;
    return caches.open(CACHE);
};
export const modelUrl = (model, path) => `https://huggingface.co/${model.id}/resolve/${model.revision}/${path}`;

export async function savedVoices() {
    const response = await (await openAssetCache()).match(INDEX);
    return response ? response.json() : [];
}

export async function saveVoice(entry) {
    const entries = (await savedVoices()).filter(item => item.id !== entry.id);
    entries.push(entry);
    await (await openAssetCache()).put(INDEX, Response.json(entries));
}

export async function removeVoice(id) {
    const entries = await savedVoices();
    const entry = entries.find(item => item.id === id);
    if(!entry) throw new Error(penaText('voiceNotInstalled'));
    const cache = await openAssetCache();
    for(const url of entry.files) await cache.delete(url);
    await cache.put(INDEX, Response.json(entries.filter(item => item.id !== id)));
}

export async function cacheFile(url, source, { signal, onProgress = () => {}, cacheName = CACHE } = {}) {
    signal?.throwIfAborted();
    if(cacheName === CACHE) await openAssetCache();
    const response = source instanceof Blob
        ? new Response(source, { headers: { 'Content-Length': String(source.size) } })
        : await fetch(source || url, { signal });
    if(!response.ok) throw new Error(penaText('assetDownloadError', { url, status: response.status }));
    const total = Number(response.headers.get('Content-Length')) || 0;
    let received = 0;
    const body = response.body.pipeThrough(new TransformStream({
        transform(chunk, controller) {
            signal?.throwIfAborted();
            received += chunk.byteLength;
            onProgress({ file: url.split('/').pop(), received, total });
            controller.enqueue(chunk);
        }
    }));
    try {
        await (await caches.open(cacheName)).put(url, new Response(body, { headers: response.headers }));
        signal?.throwIfAborted();
    } catch(error) {
        await (await caches.open(cacheName)).delete(url);
        throw error;
    }
}

export async function voiceCatalogue(options) {
    const url = PIPER_BASE + 'voices.json';
    const cache = await openAssetCache();
    if(!await cache.match(url)) await cacheFile(url, null, options);
    const catalogue = await (await cache.match(url)).json();
    return Object.fromEntries(Object.entries(catalogue).filter(([, voice]) => voice.language.code.startsWith('en_')));
}

async function loadVoice(id, options) {
    const cache = await openAssetCache();
    const stored = (await savedVoices()).find(voice => voice.id === id);
    if(stored) {
        if(stored.language !== 'en') throw new Error(penaText('englishVoicePack'));
        if((await Promise.all(stored.files.map(url => cache.match(url)))).every(Boolean)) return stored;
        if(id.startsWith('custom-')) throw new Error(penaText('customVoiceMissing'));
    }
    const entry = (await voiceCatalogue(options))[id];
    if(!entry) throw new Error(penaText('chooseEnglishVoice'));
    const name = Object.keys(entry.files).find(name => name.endsWith('.onnx'));
    if(!name) throw new Error(penaText('noVoiceModel'));
    const card = PIPER_BASE + name.slice(0, name.lastIndexOf('/') + 1) + 'MODEL_CARD';
    if(!await cache.match(card)) await cacheFile(card, null, options);
    const terms = await (await cache.match(card)).text();
    options.signal.throwIfAborted();
    if(!confirm(`${penaText('voiceTermsTitle')}\n\n${terms}\n\n${penaText('voiceTermsConfirm', { name: entry.name })}`))
        throw new DOMException('Voice download cancelled.', 'AbortError');
    const files = [PIPER_BASE + name, PIPER_BASE + name + '.json', card];
    for(const url of files) {
        options.signal.throwIfAborted();
        if(!await cache.match(url)) await cacheFile(url, null, options);
    }
    options.signal.throwIfAborted();
    const voice = { id, name: entry.name, language: 'en', model: files[0], config: files[1], files };
    await saveVoice(voice);
    return voice;
}

export function ensureVoice(id, { signal, onProgress = () => {} } = {}) {
    signal?.throwIfAborted();
    let job = voiceLoads.get(id);
    if(job?.controller.signal.aborted) {
        return job.promise.then(() => ensureVoice(id, { signal, onProgress }), error => {
            if(error.name !== 'AbortError') throw error;
            return ensureVoice(id, { signal, onProgress });
        });
    }
    if(!job) {
        job = { controller: new AbortController(), listeners: new Set() };
        job.promise = loadVoice(id, {
            signal: job.controller.signal,
            onProgress: update => job.listeners.forEach(listener => listener.onProgress(update))
        }).finally(() => {
            if(voiceLoads.get(id) === job) voiceLoads.delete(id);
        });
        voiceLoads.set(id, job);
    }
    return new Promise((resolve, reject) => {
        const listener = { onProgress };
        const cleanup = () => {
            job.listeners.delete(listener);
            signal?.removeEventListener('abort', abort);
        };
        const abort = () => {
            cleanup();
            if(!job.listeners.size) job.controller.abort();
            reject(signal.reason);
        };
        job.listeners.add(listener);
        signal?.addEventListener('abort', abort, { once: true });
        job.promise.then(voice => { cleanup(); resolve(voice); }, error => { cleanup(); reject(error); });
    });
}

export async function importVoice(files, options) {
    const model = files.find(file => file.name.endsWith('.onnx'));
    const config = files.find(file => file.name.endsWith('.onnx.json'));
    const card = files.find(file => file.name === 'MODEL_CARD');
    if(!model || !config || !card) throw new Error(penaText('voiceFilesRequired'));
    const settings = JSON.parse(await config.text());
    if(!settings.espeak?.voice || !settings.audio?.sample_rate || !settings.phoneme_id_map)
        throw new Error(penaText('voiceConfigUnsupported'));
    const language = settings.language?.code?.split('_')[0] || settings.espeak.voice.split('-')[0];
    if(language !== 'en') throw new Error(penaText('englishVoicesOnly'));
    const id = `custom-${crypto.randomUUID()}`;
    const base = `https://acas.invalid/pena/voices/${id}/`;
    const urls = files.filter(file => [model, config, card].includes(file)).map(file => base + file.name);
    try {
        for(const file of [model, config, card]) await cacheFile(base + file.name, file, options);
        const entry = { id, name: model.name.replace('.onnx', ''), language,
            model: base + model.name, config: base + config.name, files: urls };
        await saveVoice(entry);
        return entry;
    } catch(error) {
        const cache = await openAssetCache();
        await Promise.all(urls.map(url => cache.delete(url)));
        throw error;
    }
}
