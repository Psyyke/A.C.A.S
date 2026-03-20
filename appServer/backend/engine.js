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

export function renderEngineGrid() {
    mainWindow.webContents.send('renderEngineGrid', { savedEngines });
}

export function addConsoleView(identifierObj) {
    mainWindow.webContents.send('addConsoleView', { identifierObj });
}

export function removeConsoleView(identifierObj) {
    mainWindow.webContents.send('removeConsoleView', { identifierObj });
}

export function refreshEngineCards(aliveEngineProcesses) {
    const safeObjects = aliveEngineProcesses.map(engineObj => {
        const { engineProcess, ...safeData } = engineObj;

        return safeData;
    });

    mainWindow.webContents.send('refreshEngineCards', { aliveEngineProcesses: safeObjects });
}

export function log(text, type, identifierObj) {
    mainWindow.webContents.send('log', { text, type, identifierObj });
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
        toast('message', `Killing some engines! (${code || 'Manually/Externally'})`, 4000);

        engineObjToKill.engineProcess.kill();

        removeAliveEngineObj(identifierObj);
        refreshEngineCards(aliveEngineProcesses);
        
        removeConsoleView(identifierObj);
    }
}

function findAliveEngineObjectsById(engineId) {
    return aliveEngineProcesses.filter(ep => ep.identifierObj.engineId === engineId);
}

function findAliveEngineObjectsByInstanceId(instanceId) {
    return aliveEngineProcesses.filter(ep => ep.identifierObj.instanceId === instanceId);
}

function findAliveEngineObjectsByProfileName(profileName) {
    return aliveEngineProcesses.filter(ep => ep.identifierObj.profileName === profileName);
}

export function killAllEngineIds(engineId, reason) {
    const allEngineObjs = findAliveEngineObjectsById(engineId);

    allEngineObjs.forEach(o => {
        killSpecificEngine(o.identifierObj, reason);
    });
}

export function killAllEngineInstanceIds(instanceId, reason) {
    const allEngineObjs = findAliveEngineObjectsByInstanceId(instanceId);

    allEngineObjs.forEach(o => {
        killSpecificEngine(o.identifierObj, reason);
    });
}

export function killAllEngineProfileNames(profileName, reason) {
    const allEngineObjs = findAliveEngineObjectsByProfileName(profileName);

    allEngineObjs.forEach(o => {
        killSpecificEngine(o.identifierObj, reason);
    });
}

export function killAllEngines() {
    for(const engine of aliveEngineProcesses) {
        killSpecificEngine(engine.identifierObj, 'Kill all!');
    }
}

export function saveEngineOptions(command, identifierObj) {
    const engineIndex = identifierObj.savedOptionsIdentifierKey;

    if(!savedEngineOptions[engineIndex]) savedEngineOptions[engineIndex] = {};

    const text = command.trim();
    if(!text.startsWith('setoption')) return false;

    const nameStart = text.indexOf(' name ');
    if(nameStart === -1) return false;

    const valueStart = text.indexOf(' value ', nameStart + 6);

    let name, value;

    if(valueStart === -1) {
        name = text.slice(nameStart + 6).trim();
        value = true;
    } else {
        name = text.slice(nameStart + 6, valueStart).trim();
        value = text.slice(valueStart + 7).trim();

        if(value === 'true') value = true;
        else if(value === 'false') value = false;
        else if(!isNaN(value)) value = Number(value);
    }

    if(typeof value === 'string') value = value.replace('<empty>', '');
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

                const launchTimeout = setTimeout(() => {
                    if(!engineProcess.pid) {
                        engineProcess.kill();
                        reject(new Error("Timeout while attempting to start engine"));
                    }
                }, 5000);

                engineProcess.on('spawn', () => {
                    clearTimeout(launchTimeout);

                    addConsoleView(identifierObj);

                    setTimeout(() => {
                        // Do not change the variable names because other code assumes those keys
                        addAliveEngineObj({
                            engineProcess,
                            identifierObj,
                            currentFen: null
                        });

                        toast('message', `Launched: ${path.basename(enginePath)}`, 1500);

                        applySavedEngineOptions(identifierObj);
                        resolve(engineProcess);
                    }, 100);
                });

                engineProcess.stdout.on('data', (data) => {
                    data.toString().split(/\r?\n/).forEach(line => {
                        if(line.trim()) sendUciLineToClient(line, engineId, profileName, instanceId);
                        log(line, 'engine', identifierObj);
                    });
                });

                engineProcess.stderr.on('data', (data) => log(`${data}`, 'info', identifierObj));

                engineProcess.on('error', (err) => {
                    clearTimeout(launchTimeout);
                    toast('error', `Engine error: ${err.message}`, 10000);
                    reject(err);
                });

                engineProcess.on('close', (code) => {
                    const engineObj = findAliveEngineObj(identifierObj);
                    const fen = engineObj?.currentFen;

                    sendEngineDeathCertificateToClient('Engine process closed', fen, engineId, profileName, instanceId);

                    removeAliveEngineObj(identifierObj);

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

export function removeEngine(index) {
    try {
        const savedEngineObj = savedEngines[index];
        savedEngines.splice(index, 1);
        store.set(chessEnginesStorageKey, savedEngines);

        killAllEngineIds(savedEngineObj.engineId, 'Engine was removed');
        renderEngineGrid();
    } catch(e) {
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