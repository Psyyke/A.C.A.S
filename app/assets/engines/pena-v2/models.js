// Uncensored Inkling runs on its own by default. The Pena LoRA is opt-in and brings its own plain base below.
export const browserModel = Object.freeze({
    id: 'inkling-2-mini', modelId: 'Inkling-2-Mini',
    repo: 'AtomicChat/Inkling-2-Mini-Uncensored-GGUF',
    revision: '82b34b9b0e5bc2e3e7b6d617ec8cc3e0f9692ee2',
    file: 'Inkling-2-Mini-Uncensored-AD-IQ2_M.gguf',
    bytes: 8665091680,
    sha256: 'fca99d488bff5d401c8bc6b0110c5377c743f0ffb3a6d19c1ae4a3b9071fa2cd',
    available: true,
    trainingRepo: 'OpenUncensored/Inkling-2-Mini-Uncensored',
    trainingRevision: '748f78ee942acf376d4e11eac92f6c3034c84ddb',
    overrides: Object.freeze({ context_window_size: 8192 })
});

export const runtimeVersion = 'wllama-webgpu-inkling';
export const localModelId = 'pena-local-inkling';

export const penaLora = Object.freeze({
    url: 'https://huggingface.co/Hakorr/Pena/resolve/499376296cc03cb4c964bf1a148371f1150ae3f2/pena-lora.gguf',
    bytes: 39387680,
    sha256: '7601536b68f9e7c10999daa0306a0430ce5d1fe4943ec570a7ee1918a9e992a4',
    // The adapter already carries the refusal-removal edit, so it must sit on this plain base, never the uncensored one.
    base: Object.freeze({
        url: 'https://huggingface.co/AtomicChat/Inkling-2-Mini-GGUF/resolve/4f0c56af7e0c242e620be6394983d245b8c3fd27/Inkling-2-Mini-AD-IQ2_M.gguf',
        bytes: 8665091680,
        sha256: '7321d77bd62fb1b4ee620ec12e677a4b4b99668d083c1e6e350fd1c3376e29bf'
    })
});

/** A player-selected GGUF, such as Inkling with the Pena chess LoRA merged in. */
export function resolveLocalModel(file) {
    if(!(file instanceof Blob) || !/\.gguf$/i.test(file.name || ''))
        throw new Error('Select an Inkling GGUF file.');
    if(file.size < 1e9) throw new Error('This GGUF is too small to be Inkling 2 Mini.');
    return { ...browserModel, id: localModelId, local: true, bytes: file.size, sha256: null, file: file.name };
}

export const groundedCoachingBudget = Object.freeze({ contextTokens: 8192, maxNewTokens: 384, enableThinking: false });

export const browserModelUrl = `https://huggingface.co/${browserModel.repo}/tree/${browserModel.revision}`;
export const browserModelFileUrl = `https://huggingface.co/${browserModel.repo}/resolve/${browserModel.revision}/${browserModel.file}`;
export const retiredBrowserModelUrl = 'https://huggingface.co/mlc-ai/Qwen3-8B-q4f16_1-MLC/tree/b3d55c289eae58f77095f5b68c895eeea358ee09';

export function resolveBrowserModel(value = browserModelUrl) {
    let url;
    try { url = new URL(value); } catch { throw new Error('Enter the supported Hugging Face model URL.'); }
    const path = url.pathname.replace(/\/$/, '');
    const base = `/${browserModel.repo}`;
    if(url.protocol !== 'https:' || url.hostname !== 'huggingface.co' || url.port || url.username || url.password
        || url.search || url.hash || ![base, `${base}/tree/main`, `${base}/tree/${browserModel.revision}`].includes(path))
        throw new Error(`Unsupported model. Pena runs ${browserModel.repo} (${browserModel.file}).`);
    return { ...browserModel, overrides: { ...browserModel.overrides, context_window_size: groundedCoachingBudget.contextTokens },
        url: browserModelUrl, fileUrl: browserModelFileUrl };
}
