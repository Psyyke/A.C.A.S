import { isUpstreamLc0 } from './lc0Engines.js';

export function engineTextFileNames(engine) {
    if(engine === 'rodent-v') return ['PersonalityFile'];
    if(engine === 'fairy-stockfish-nnue-wasm') return ['VariantPath'];
    if(isUpstreamLc0(engine)) return ['ConfigFile'];
    return [];
}

export function isEngineTextFile(engine, name, external = false) {
    return !external && engineTextFileNames(engine).includes(name);
}

export function initialEngineTextFiles(engine, config) {
    if(!config?.enableAdvancedElo || config.useExternalChessEngine) return {};
    return Object.fromEntries(engineTextFileNames(engine).map(name =>
        [name, config[`DYNAMIC_${engine}_${name}`] ?? '']));
}

export function engineTextFilesChanged(engine, previous, current) {
    return !current.useExternalChessEngine && current.enableAdvancedElo && previous
        && engineTextFileNames(engine).some(name =>
            (previous[`DYNAMIC_${engine}_${name}`] ?? '') !== (current[`DYNAMIC_${engine}_${name}`] ?? ''));
}
