import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import Store from 'electron-store';

import { sendUciLineToClient, sendEngineDeathCertificateToClient } from './server.js';
import { verifyLaunchParams, createEngineID, toast } from './util.js';
import { mainWindow } from './main.js';

const store = new Store();
const chessEnginesStorageKey = 'chessEngines';
const seoStorageKey = 'savedEngineOptions';
const localStoredEngineOptions = store.get(seoStorageKey, null);
const engineStartLocks = new Map(); // Map<identifierKey, Promise<ChildProcess>>

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

function killSpecificEngine(identifierObj, code) {
    const engineObjToKill = findAliveEngineObj(identifierObj);

    if(engineObjToKill) {
        engineObjToKill.engineProcess.kill();

        // toast() and sendToRenderer() already no-op once the window is gone. The early
        // return that used to sit here also skipped the cleanup below, so quitting on
        // Windows/Linux left aliveEngineProcesses fully populated.
        toast('message', `Killed specific engine! (${code || 'Manually/Externally'})`, 4000);

        removeAliveEngineObj(identifierObj);
        refreshEngineCards(aliveEngineProcesses);
    }
}

const KILLABLE_FIELDS = new Set(['engineId', 'instanceId', 'profileName']);

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
    for(const engine of aliveEngineProcesses) {
        killSpecificEngine(engine.identifierObj, 'Kill all!');
    }
}

export function clearCache() {
    savedEngineOptions = {};
    store.delete(seoStorageKey);
}

export function saveEngineOptions(command, identifierObj) {
    const engineIndex = identifierObj.savedOptionsIdentifierKey;

    if(!savedEngineOptions[engineIndex]) {
        savedEngineOptions[engineIndex] = {};
    }

    const text = command.trim();
    if(!text.startsWith('setoption')) return false;

    const tokens = text.split(/\s+/);

    if(tokens[0] !== 'setoption') return false;

    const nameIndex = tokens.indexOf('name');
    const valueIndex = tokens.indexOf('value');

    if(nameIndex === -1) return false;

    let nameTokens, valueTokens;

    if(valueIndex === -1 || valueIndex < nameIndex) {
        nameTokens = tokens.slice(nameIndex + 1);
        valueTokens = [];
    } else {
        nameTokens = tokens.slice(nameIndex + 1, valueIndex);
        valueTokens = tokens.slice(valueIndex + 1);
    }

    if(valueTokens[0] === 'value') {
        valueTokens.shift();
    }

    let name = nameTokens.join(' ').trim();
    let value;

    if(valueTokens.length === 0) {
        value = true;
    } else {
        value = valueTokens.join(' ').trim();

        if(value === 'true') value = true;
        else if(value === 'false') value = false;
        else if(!isNaN(value)) value = Number(value);
    }

    if(typeof value === 'string') {
        value = value.replace('<empty>', '');

        if(value.trim().toLowerCase() === 'value') return false;
    }
    if(!name) return false;

    savedEngineOptions[engineIndex][name] = value;

    try {
        store.set(seoStorageKey, savedEngineOptions);
    } catch (e) {
        console.warn('Failed to save engine options to storage:', e);
    }

    return true;
}

// Important that this is ran after addAliveEngineObj() which creates the engine obj
function applySavedEngineOptions(identifierObj) {
    const engineIndex = identifierObj.savedOptionsIdentifierKey;
    const options = savedEngineOptions[engineIndex];

    if(!options) return;

    for(const [key, value] of Object.entries(options)) {
        let val = value;

        if(typeof value === 'string') val = val.replace('<empty>', '');
        if(typeof value === 'boolean') val = value ? 'true' : 'false';

        sendToProcess(`setoption name ${key} value ${val}`, identifierObj, 'savedConfig');
    }
}

export function sendToProcess(cmd, identifierObj, type = 'user') {
    const engineObj = findAliveEngineObj(identifierObj);

    if(!engineObj || !engineObj.engineProcess) return;

    const { engineProcess } = engineObj;

    if(engineProcess.stdin.writable) {
        engineProcess.stdin.write(cmd + '\n', 'utf8');

        log(cmd, type, identifierObj);
    }
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
                    addConsoleView(identifierObj);

                    setTimeout(() => {
                        if(settled) return;

                        // The engine can die inside this delay (missing DLL, missing weights).
                        // Registering it then would hand applySavedEngineOptions a dead stdin.
                        if(engineProcess.exitCode !== null || engineProcess.signalCode !== null) {
                            settled = true;
                            clearTimeout(launchTimeout);

                            return reject(new Error('Engine exited during startup'));
                        }

                        settled = true;
                        clearTimeout(launchTimeout);

                        // Do not change the variable names because other code assumes those keys
                        addAliveEngineObj({
                            engineProcess,
                            identifierObj,
                            currentFen: null
                        });

                        toast('message', `Launched: ${path.basename(enginePath)}`, 1500);

                        applySavedEngineOptions(identifierObj);
                        refreshEngineCards(aliveEngineProcesses);
                        resolve(engineProcess);
                    }, 100);
                });

                let stdoutBuffer = '';

                engineProcess.stdout.on('data', (data) => {
                    stdoutBuffer += data.toString();

                    const lines = stdoutBuffer.split(/\r?\n/);
                    stdoutBuffer = lines.pop(); // keep the trailing incomplete line for the next chunk

                    lines.forEach(line => {
                        if(line.trim()) sendUciLineToClient(line, engineId, profileName, instanceId);
                        log(line, 'engine', identifierObj);
                    });
                });

                engineProcess.stderr.on('data', (data) => log(`${data}`, 'info', identifierObj));

                engineProcess.on('error', (err) => {
                    if(settled) return;
                    settled = true;

                    clearTimeout(launchTimeout);
                    toast('error', `Engine error: ${err.message}`, 10000);
                    reject(err);
                });

                engineProcess.on('close', (code) => {
                    const engineObj = findAliveEngineObj(identifierObj);

                    // A relaunch registers the replacement under the same identifier, and a
                    // wrapper script can hold its pipe open long enough for this to fire late.
                    // Without this the dead process tears down the live one's bookkeeping, and
                    // killAllEngines() then leaves it running after the app quits.
                    if(engineObj && engineObj.engineProcess !== engineProcess) return;

                    const fen = engineObj?.currentFen;

                    sendEngineDeathCertificateToClient('Engine process closed', fen, engineId, profileName, instanceId);

                    removeAliveEngineObj(identifierObj);
                    refreshEngineCards(aliveEngineProcesses);

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
        return true;
    }

    return false;
}