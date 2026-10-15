import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import Store from 'electron-store';

import { sendUciLineToClient, sendEngineDeathCertificateToClient } from './server.js';
import { verifyLaunchParams, createEngineID, toast } from './util.js';
import { mainWindow } from './main.js';
import { parseSetOption, formatSetOption, parseUciOption, isDefaultUciOptionValue, isValidSavedUciOptionValue,
    getSavedUciOptionsToReplay } from './engineOptions.js';

const store = new Store();
const chessEnginesStorageKey = 'chessEngines';
const seoStorageKey = 'savedEngineOptions';
const localStoredEngineOptions = store.get(seoStorageKey, null);
const engineStartLocks = new Map(); // Map<identifierKey, Promise<ChildProcess>>
// Recovery snapshots belong to one running session, not every board using a profile.
const sessionEngineOptions = new Map();

export let savedEngines = store.get(chessEnginesStorageKey, []);
let aliveEngineProcesses = [];
let savedEngineOptions = localStoredEngineOptions || {};

function sendToRenderer(channel, payload) {
    // mainWindow may be gone during shutdown; sending to a destroyed window throws.
    if(!mainWindow || mainWindow.isDestroyed()) return;

    mainWindow.webContents.send(channel, payload);
}

export function renderEngineGrid() {
    sendToRenderer('renderEngineGrid', { savedEngines });
    refreshEngineCards(aliveEngineProcesses);
}

export function addConsoleView(identifierObj) {
    sendToRenderer('addConsoleView', { identifierObj });
}

export function removeConsoleView(identifierObj) {
    sendToRenderer('removeConsoleView', { identifierObj });
}

export function refreshEngineCards(aliveEngineProcesses) {
    const safeObjects = aliveEngineProcesses.map(engineObj => {
        const { engineProcess, ...safeData } = engineObj;

        return safeData;
    });

    sendToRenderer('refreshEngineCards', { aliveEngineProcesses: safeObjects });
}

export function log(text, type, identifierObj) {
    sendToRenderer('log', { text, type, identifierObj });
}

function addAliveEngineObj(engineObj) {
    aliveEngineProcesses.push(engineObj);
}

export function findAliveEngineObj(identifierObj) {
    const { engineId, profileName, instanceId, identifierKey } = identifierObj;

    return aliveEngineProcesses.find(ep =>
        ep.identifierObj.engineId === engineId &&
        ep.identifierObj.profileName === profileName &&
        ep.identifierObj.instanceId === instanceId
    );
}

function removeAliveEngineObj(identifierObj) {
    const engine = findAliveEngineObj(identifierObj);
    if(!engine) return;

    removeConsoleView(identifierObj);

    aliveEngineProcesses = aliveEngineProcesses.filter(ep => ep !== engine);
}

export function updateAliveEngineObjFen(fen, identifierObj) {
    const engineObj = findAliveEngineObj(identifierObj);

    if(engineObj)
        engineObj.currentFen = fen;
}

function killSpecificEngine(identifierObj, code, showToast = true) {
    const engineObjToKill = findAliveEngineObj(identifierObj);

    if(engineObjToKill) {
        try {
            if(!engineObjToKill.engineProcess.kill()) return false;
        } catch(error) {
            console.error('[engine] failed to kill process:', error);
            return false;
        }
        // Suppress buffered output and the delayed close event from this process after relaunch.
        engineObjToKill.engineProcess.acasTerminated = true;
        sendEngineDeathCertificateToClient(code || 'Engine killed', engineObjToKill.currentFen,
            identifierObj.engineId, identifierObj.profileName, identifierObj.instanceId, {
                restartOnRequest: code === 'Killed from server GUI' || code === 'Kill all!'
            });

        // toast() and sendToRenderer() already no-op once the window is gone. The early
        // return that used to sit here also skipped the cleanup below, so quitting on
        // Windows/Linux left aliveEngineProcesses fully populated.
        if(showToast)
            toast('message', `Killed specific engine! (${code || 'Manually/Externally'})`, 4000);

        removeAliveEngineObj(identifierObj);
        refreshEngineCards(aliveEngineProcesses);
        return true;
    }
    return false;
}

const KILLABLE_FIELDS = new Set(['engineId', 'instanceId', 'profileName', 'identifierKey']);

export async function killEngine(identifierObj) {
    if(!identifierObj || !['engineId', 'profileName', 'instanceId'].every(field =>
        typeof identifierObj[field] === 'string' && identifierObj[field].trim())) {
        return 'Invalid engine identifier.';
    }

    // A console is created just before startup completes. Wait for that process only.
    const key = JSON.stringify([identifierObj.engineId, identifierObj.profileName, identifierObj.instanceId]);
    const starting = engineStartLocks.get(key);
    if(starting) {
        try { await starting; } catch { return false; }
    }

    const engineObj = findAliveEngineObj(identifierObj);
    if(!engineObj) return false;
    return killSpecificEngine(engineObj.identifierObj, 'Killed from server GUI')
        ? true : 'Could not terminate this engine process.';
}

function findAliveBy(field, value) {
    return aliveEngineProcesses.filter(ep => ep.identifierObj[field] === value);
}

export function killAllBy(field, value, reason) {
    if(!KILLABLE_FIELDS.has(field)) {
        console.warn(`[engine] killAllBy: unknown field "${field}"`);
        return;
    }

    findAliveBy(field, value).forEach(o => killSpecificEngine(o.identifierObj, reason));
}

export function killAllEngines() {
    const engineCount = aliveEngineProcesses.length;
    if(!engineCount) return;

    let killedCount = 0;
    for(const engine of aliveEngineProcesses) {
        if(killSpecificEngine(engine.identifierObj, 'Kill all!', false)) killedCount++;
    }

    const failedCount = engineCount - killedCount;
    toast(failedCount ? 'warning' : 'message', failedCount
        ? `Killed ${killedCount} of ${engineCount} engines. ${failedCount} could not be terminated.`
        : `Killed all engines! (${killedCount})`, 4000);
}

export function clearCache() {
    savedEngineOptions = {};
    sessionEngineOptions.clear();
    store.delete(seoStorageKey);
}

export function saveEngineOptions(command, identifierObj) {
    const engineOptions = findAliveEngineObj(identifierObj)?.uciOptions ?? new Map();
    const option = parseSetOption(command, engineOptions);

    if(!option) return false;

    const { name, value } = option;
    const engineIndex = identifierObj.savedOptionsIdentifierKey;
    const definition = engineOptions.get(name);
    const isButton = value == null || definition?.type === 'button';
    const isInvalidValue = definition && !isValidSavedUciOptionValue(value, definition);
    const isDefaultValue = definition && isDefaultUciOptionValue(value, definition);

    if(identifierObj.clientManagesOptions) {
        const snapshot = sessionEngineOptions.get(identifierObj.identifierKey);

        // Keep the actual wire values, including explicit resets to defaults.
        // Buttons are actions and must not be repeated on a replacement process.
        if(isButton || isInvalidValue || !snapshot) return false;

        snapshot.values[name] = value;

        return true;
    }

    if(isButton || isInvalidValue || isDefaultValue) {
        if(!Object.hasOwn(savedEngineOptions[engineIndex] ?? {}, name)) return true;

        delete savedEngineOptions[engineIndex][name];
    } else {
        savedEngineOptions[engineIndex] ??= {};

        if(Object.is(savedEngineOptions[engineIndex][name], value)) return true;

        savedEngineOptions[engineIndex][name] = value;
    }

    try {
        store.set(seoStorageKey, savedEngineOptions);
    } catch (e) {
        console.warn('Failed to save engine options to storage:', e);
    }

    return true;
}

export function markEngineOptionsInitialized(identifierObj) {
    const engineObj = findAliveEngineObj(identifierObj);
    const snapshot = sessionEngineOptions.get(identifierObj.identifierKey);
    const isManagedEngineRunning = engineObj?.identifierObj.clientManagesOptions
        && engineObj.engineProcess.stdin.writable && !engineObj.engineProcess.acasTerminated;
    const handshakeCompleted = engineObj?.engineProcess.acasSavedOptionsApplied === true;

    if(!isManagedEngineRunning || !handshakeCompleted || !snapshot) return;

    snapshot.initialized = true;
}

// Important that this is ran after addAliveEngineObj() which creates the engine obj
function applySavedEngineOptions(identifierObj, engineOptions) {
    if(identifierObj.clientManagesOptions) {
        const engineObj = findAliveEngineObj(identifierObj);
        const snapshot = sessionEngineOptions.get(identifierObj.identifierKey);

        if(!engineObj?.resumedEngineOptions || !snapshot?.initialized) return;

        for(const [name, value] of Object.entries(snapshot.values)) {
            if(isValidSavedUciOptionValue(value, engineOptions.get(name)))
                sendToProcess(formatSetOption(name, value), identifierObj, 'savedConfig');
        }

        return;
    }

    const engineIndex = identifierObj.savedOptionsIdentifierKey;
    const options = savedEngineOptions[engineIndex];

    if(!options) return;

    let removedOptions = false;

    for(const [key, value] of Object.entries(options)) {
        const option = engineOptions.get(key);
        const shouldRemove = option
            && (!isValidSavedUciOptionValue(value, option) || isDefaultUciOptionValue(value, option));

        if(shouldRemove) {
            delete options[key];
            removedOptions = true;
        }
    }

    for(const [key, value] of getSavedUciOptionsToReplay(options, engineOptions))
        sendToProcess(formatSetOption(key, value), identifierObj, 'savedConfig');

    if(removedOptions) {
        try {
            store.set(seoStorageKey, savedEngineOptions);
        } catch(error) {
            console.warn('Failed to remove default or invalid engine options from storage:', error);
        }
    }
}

export function sendToProcess(cmd, identifierObj, type = 'user') {
    const engineObj = findAliveEngineObj(identifierObj);

    if(!engineObj?.engineProcess || engineObj.engineProcess.acasTerminated) return false;

    const { engineProcess } = engineObj;

    if(engineProcess.stdin.writable) {
        // writable stays true for a moment after the child dies, and an unhandled
        // stream error (EPIPE) would take the whole app down with every other engine
        try {
            engineProcess.stdin.write(cmd + '\n', 'utf8', err => {
                if(err) console.error(`[engine] failed writing to engine stdin: ${err.message}`);
            });
            if(type === 'user') saveEngineOptions(cmd, engineObj.identifierObj);
        } catch (err) {
            console.error(`[engine] failed writing to engine stdin: ${err.message}`);
            return false;
        }

        log(cmd, type, identifierObj);

        return true;
    }

    return false;
}

export async function startEngine(enginePath, identifierObj) {
    const { engineId, profileName, instanceId, identifierKey } = identifierObj;

    if(engineStartLocks.has(identifierKey))
        return engineStartLocks.get(identifierKey);

    const startPromise = startEngineProcess(enginePath, identifierObj);
    engineStartLocks.set(identifierKey, startPromise);

    return startPromise;
}

// Subfunction to handle engine startup, avoid calling directly
async function startEngineProcess(enginePath, identifierObj) {
    const { engineId, profileName, instanceId, identifierKey } = identifierObj;

    try {
        const existingEngine = findAliveEngineObj(identifierObj);
        if(existingEngine) killSpecificEngine(identifierObj, 'Relaunch');

        if(process.platform !== 'win32') {
            try { fs.chmodSync(enginePath, 0o755); } catch (e) {}
        }

        return await new Promise((resolve, reject) => {
            let engineProcess;
            try {
                const args = verifyLaunchParams(identifierObj.launchParams);

                engineProcess = spawn(enginePath, args, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    cwd: path.dirname(enginePath)
                });

                let settled = false;

                // spawn() sets pid synchronously on success and 'error' fires within a tick
                // on failure, so the old !engineProcess.pid check could never be true. Track
                // whether startup actually finished instead.
                const launchTimeout = setTimeout(() => {
                    if(settled) return;
                    settled = true;

                    engineProcess.kill();
                    reject(new Error("Timeout while attempting to start engine"));
                }, 5000);

                engineProcess.on('spawn', () => {
                    const snapshot = sessionEngineOptions.get(identifierKey);
                    const resumedEngineOptions = identifierObj.clientManagesOptions
                        && identifierObj.resumeEngineOptions && snapshot?.initialized === true;

                    if(settled) return;

                    settled = true;
                    clearTimeout(launchTimeout);
                    addConsoleView(identifierObj);

                    // stdin is ready on spawn; don't delay every engine's first command.
                    if(identifierObj.clientManagesOptions && !resumedEngineOptions) {
                        sessionEngineOptions.set(identifierKey, {
                            initialized: false,
                            values: Object.create(null)
                        });
                    }

                    addAliveEngineObj({
                        engineProcess,
                        identifierObj,
                        currentFen: null,
                        uciOptions: new Map(),
                        resumedEngineOptions
                    });

                    toast('message', `Launched: ${path.basename(enginePath)}`, 1500);
                    refreshEngineCards(aliveEngineProcesses);
                    resolve(engineProcess);
                });

                let stdoutBuffer = '';

                engineProcess.stdout.on('data', (data) => {
                    if(engineProcess.acasTerminated) return;
                    stdoutBuffer += data.toString();

                    const lines = stdoutBuffer.split(/\r?\n/);
                    stdoutBuffer = lines.pop(); // keep the trailing incomplete line for the next chunk

                    lines.forEach(line => {
                        const engineObj = findAliveEngineObj(identifierObj);
                        const option = parseUciOption(line);
                        const isCurrentProcess = engineObj?.engineProcess === engineProcess;
                        const isUciReady = line.trim() === 'uciok';
                        const shouldRestoreOptions = isUciReady && isCurrentProcess
                            && !engineProcess.acasSavedOptionsApplied;
                        const details = isUciReady
                            ? { optionsRestored: engineObj?.resumedEngineOptions === true } : {};

                        if(option && isCurrentProcess)
                            engineObj.uciOptions.set(option.name, option);

                        if(shouldRestoreOptions) {
                            engineProcess.acasSavedOptionsApplied = true;
                            applySavedEngineOptions(identifierObj, engineObj.uciOptions);
                        }

                        if(line.trim())
                            sendUciLineToClient(line, engineId, profileName, instanceId, details);

                        log(line, 'engine', identifierObj);
                    });
                });

                engineProcess.stderr.on('data', (data) => {
                    if(!engineProcess.acasTerminated) log(`${data}`, 'info', identifierObj);
                });

                // Streams throw on an unhandled 'error', which kills the main process
                for(const stream of [engineProcess.stdin, engineProcess.stdout, engineProcess.stderr]) {
                    stream?.on('error', err => console.error(`[engine] stream error: ${err?.message}`));
                }

                engineProcess.on('error', (err) => {
                    if(settled) return;
                    settled = true;

                    clearTimeout(launchTimeout);
                    toast('error', `Engine error: ${err.message}`, 10000);
                    reject(err);
                });

                engineProcess.on('close', (code, signal) => {
                    if(engineProcess.acasTerminated) return;
                    const engineObj = findAliveEngineObj(identifierObj);

                    // A relaunch registers the replacement under the same identifier, and a
                    // wrapper script can hold its pipe open long enough for this to fire late.
                    // Without this the dead process tears down the live one's bookkeeping, and
                    // killAllEngines() then leaves it running after the app quits.
                    if(engineObj && engineObj.engineProcess !== engineProcess) return;

                    const fen = engineObj?.currentFen;

                    removeAliveEngineObj(identifierObj);
                    refreshEngineCards(aliveEngineProcesses);

                    const accessViolation = typeof code === 'number' && (code >>> 0) === 0xC0000005;
                    const reason = accessViolation ? 'Engine crashed: Windows access violation (0xC0000005)'
                        : `Engine process closed${code != null ? ` (exit code ${code})` : signal ? ` (${signal})` : ''}`;
                    sendEngineDeathCertificateToClient(reason, fen, engineId, profileName, instanceId, {
                        recoverable: true, exitCode: code, signal
                    });

                    toast('warning', `Engine ID ${engineId} closed. ${code ? '('+code+')' : ''}`, 3000);
                });

            } catch (err) {
                toast('error', `Fatal error: ${err.message}`, 10000);
                reject(err);
            }
        });

    } finally {
        engineStartLocks.delete(identifierKey);
    }
}

export async function addEngine(fileInfo, title = fileInfo?.name) {
    if(!fileInfo?.path) return 'Missing file path';
    if(!fs.existsSync(fileInfo.path)) return `Engine file not found: ${fileInfo.path}`;

    const isDuplicate = savedEngines.some(engine => engine.path === fileInfo.path);
    if(isDuplicate) return `Engine already exists: ${fileInfo.name}`;

    const engineId = await createEngineID(fileInfo.path);

    savedEngines.push({
        title,
        name: fileInfo.name,
        path: fileInfo.path,
        engineId
    });

    store.set(chessEnginesStorageKey, savedEngines);

    renderEngineGrid();

    return true;
}

export function renameEngine(enginePath, title) {
    if(typeof enginePath !== 'string' || !enginePath.trim())
        return 'Missing engine path';
    if(typeof title !== 'string' || !title.trim())
        return 'Engine name cannot be empty';

    const engine = savedEngines.find(savedEngine => savedEngine.path === enginePath);
    if(!engine)
        return `Invalid engine path: ${enginePath}`;

    const previousTitle = engine.title;
    engine.title = title.trim();

    try {
        store.set(chessEnginesStorageKey, savedEngines);
    } catch(error) {
        engine.title = previousTitle;
        console.error('[engine] renameEngine failed:', error);
        return 'Something went wrong while renaming the engine.';
    }

    renderEngineGrid();
    return true;
}

export function removeEngine(enginePath) {
    // path is the unique key enforced by addEngine; engineId (sha256 of the file)
    // can collide when the same binary is added from two different paths.
    const index = savedEngines.findIndex(engine => engine.path === enginePath);

    if(index === -1)
        return `Invalid engine path: ${enginePath}`;

    const savedEngineObj = savedEngines[index];

    try {
        savedEngines.splice(index, 1);
        store.set(chessEnginesStorageKey, savedEngines);

        killAllBy('engineId', savedEngineObj.engineId, 'Engine was removed');
        renderEngineGrid();
    } catch(e) {
        console.error('[engine] removeEngine failed:', e);
        return 'Something went wrong while removing the engine, please restart the software.';
    }

    return true;
}

export function getSavedEngines() {
    return store.get(chessEnginesStorageKey, []);
}

export function sendManualUciToEngine(cmd, identifierObj) {
    const engine = findAliveEngineObj(identifierObj);

    if(engine?.engineProcess?.stdin?.writable) {
        engine.engineProcess.stdin.write(cmd + '\n');
        saveEngineOptions(cmd, engine.identifierObj);
        return true;
    }

    return false;
}