import { penaText, penaStrings } from './i18n.js';

export async function checkPenaSupport() {
    if(!globalThis.isSecureContext) throw new Error(penaText('requiresSecure'));
    if(!navigator.gpu) throw new Error(penaText('requiresGpu'));
    if(!WebAssembly.Suspending) throw new Error('Pena requires WebAssembly JSPI. Use a current Chrome or Edge browser.');
    try { new WebAssembly.Memory({ address: 'i64', initial: 1n }); }
    catch { throw new Error('Pena requires WebAssembly memory64. Use a current Chrome or Edge browser.'); }
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if(!adapter) throw new Error(penaText('noAdapter'));
    // A software adapter technically works but would take minutes per answer.
    if(adapter.info?.isFallbackAdapter || adapter.isFallbackAdapter)
        throw new Error(penaText('softwareGpu'));
    return adapter;
}

// GPU drivers fail with long internal messages. These turn the common ones into something a person can act on.
export function friendlyPenaError(error) {
    const message = String(error?.message || error || penaText('unexpectedStop'));
    if(/OutOfMemory|out of memory|CreateCommittedResource|allocation failed|E_OUTOFMEMORY/i.test(message))
        return penaText('gpuMemory');
    if(/device (?:was )?(?:lost|removed|hung)|DXGI_ERROR_DEVICE|Device removed|GPU device was lost|context lost/i.test(message))
        return penaText('gpuReset');
    if(/exceeds the available context size|exceed_context_size|could not fit the position evidence/i.test(message))
        return penaText('contextFull');
    if(/exceeds the (?:max|limit)|maxStorageBuffer|maxBufferSize|limit .*exceed|requested limit/i.test(message))
        return penaText('gpuSmall');
    if(/Failed to fetch|NetworkError|QuotaExceeded/i.test(message))
        return penaText('modelLoadError');
    const firstLine = message.split('\n')[0];
    const key = Object.keys(penaStrings).find(key => penaStrings[key] === firstLine);
    return key ? penaText(key) : firstLine;
}

