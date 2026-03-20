import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { mainWindow } from './main.js';

export async function createEngineID(filePath) {
    if(!filePath) throw new Error('Missing engine file path!');

    const buffer = await readFile(filePath);
    const hash = createHash('sha256').update(buffer).digest('hex');

    return hash;
}

export function verifyLaunchParams(params) {
    if(params === null) return [];

    if(typeof params === "string") {
        const trimmed = params.trim();

        if(trimmed === '' || trimmed.toLowerCase() === 'nan') {
            return [];
        }

        params = trimmed.split(/\s+/);
    }

    if(!Array.isArray(params)) {
        toast.error('"launchParams" must be a string or array', 4000);
        return [];
    }

    const args = [];

    for(const arg of params) {
        if(typeof arg !== "string") {
            toast.error('Invalid launch parameter type', 4000);
            return [];
        }

        const trimmed = arg.trim();

        if(trimmed === "" || trimmed.toLowerCase() === "nan") {
            continue;
        }

        if(!/^[a-zA-Z0-9._\-=/+:]*$/.test(trimmed)) {
            toast.error(`Invalid launch parameter: ${trimmed}`, 4000);
            return [];
        }

        args.push(trimmed);
    }

    return args;
}

export function toast(type, text, ms) {
    mainWindow.webContents.send('toast', { type, text, ms });
}