import { resolveBrowserModel, resolveLocalModel, browserModel, browserModelFileUrl, penaLora } from './models.js';
import { loadSettings } from './inkling-load.js';
import { readCustomLora } from './lora-store.js';

export const notDownloaded = 'Inkling isn\'t downloaded yet.';

async function gpuAdapter() {
    const adapter = await globalThis.navigator?.gpu?.requestAdapter?.({ powerPreference: 'high-performance' });
    if(!adapter) throw new Error('Pena needs WebGPU. This browser or GPU does not offer it.');
    return adapter;
}

/** True when the pinned GGUF is already saved in this browser. Never touches the network. */
export async function browserModelCached() {
    const { CacheManager } = await import('./vendor/wllama.js');
    const blob = await new CacheManager().open(browserModelFileUrl).catch(() => null);
    return blob?.size === browserModel.bytes;
}

/** Picks the adapter for the chosen LoRA mode. Returns null when Inkling should run on its own. */
export async function resolveLora({ mode = 'pena', scale = 1, download = false, onProgress = () => {}, signal } = {}) {
    if(mode === 'off' || scale === 0) return null;
    if(mode === 'custom') {
        const blob = await readCustomLora();
        if(!blob) throw new Error('No custom LoRA is saved. Choose one in Pena settings, or switch the LoRA off.');
        return { blob, scale, name: 'custom' };
    }
    if(!penaLora.url) return null;
    const { CacheManager } = await import('./vendor/wllama.js');
    const cache = new CacheManager();
    let blob = await cache.open(penaLora.url).catch(() => null);
    if(blob?.size !== penaLora.bytes) {
        if(!download) return null;
        await cache.download(penaLora.url, { signal,
            progressCallback: ({ loaded, total }) => onProgress({ stage: 'lora', loaded, total: total || penaLora.bytes }) });
        blob = await cache.open(penaLora.url);
        if(blob?.size !== penaLora.bytes) throw new Error('The downloaded Pena LoRA is incomplete. Press Download again to resume.');
    }
    return { blob, scale, name: 'pena' };
}

/**
 * Loads Inkling into a WebGPU wllama runtime. The pinned GGUF downloads only when
 * `download` is set, resumes after interruptions and stays cached for later visits.
 */
export async function loadBrowserModel(url, { localFile = null, download = false, preset = '12', thinkingTokens = 1536,
    context = 8192, lora = null, onProgress = () => {}, signal, logger } = {}) {
    const model = localFile ? resolveLocalModel(localFile) : resolveBrowserModel(url);
    await gpuAdapter();
    signal?.throwIfAborted();
    const { Wllama, CacheManager } = await import('./vendor/wllama.js');
    let blob = localFile;
    if(!blob) {
        const cache = new CacheManager();
        blob = await cache.open(browserModelFileUrl).catch(() => null);
        if(blob?.size !== model.bytes) {
            if(!download) throw new Error(notDownloaded);
            await cache.download(browserModelFileUrl, { signal,
                progressCallback: ({ loaded, total }) => onProgress({ stage: 'download', loaded, total: total || model.bytes }) });
            blob = await cache.open(browserModelFileUrl);
            if(blob?.size !== model.bytes) throw new Error('The downloaded Inkling file is incomplete. Press Download again to resume.');
        }
    }
    signal?.throwIfAborted();
    onProgress({ stage: 'gpu', loaded: 0, total: 1 });
    const wllama = new Wllama({ default: new URL('./vendor/wllama.wasm', import.meta.url).href }, logger ? { logger } : {});
    // The runtime mounts adapter GGUFs as models/lora-001.gguf, which is where the scale applies.
    const params = loadSettings({ preset, context, budget: thinkingTokens });
    if(lora?.blob) params.lora_adapters = [{ path: 'models/lora-001.gguf', scale: lora.scale ?? 1 }];
    try {
        await wllama.loadModel(lora?.blob ? [blob, lora.blob] : [blob], params);
    } catch(error) {
        await wllama.exit().catch(() => {});
        throw error;
    }
    return { wllama, model };
}
