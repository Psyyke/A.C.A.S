export const upstreamLc0Engine = 'lc0-v0.32.1-wasm';
export const upstreamLc0WebgpuEngine = 'lc0-v0.32.1-webgpu';

export function normalizeLc0Engine(engine) {
    if(engine === 'modern-lc0' || engine === 'lc0-v0.32.1') return upstreamLc0Engine;
    if(engine === 'modern-lc0-webgpu') return upstreamLc0WebgpuEngine;
    return engine;
}

export function isUpstreamLc0(engine) {
    const normalized = normalizeLc0Engine(engine);
    return normalized === upstreamLc0Engine || normalized === upstreamLc0WebgpuEngine;
}

export function isLc0Engine(engine) {
    return engine === 'lc0' || isUpstreamLc0(engine);
}
