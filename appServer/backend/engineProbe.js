import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

export async function probeEngine(filePath, { timeoutMs = 15000, signal } = {}) {
    if(signal?.aborted) return 'Engine check cancelled.';
    if(typeof filePath !== 'string' || !path.isAbsolute(filePath))
        return 'Select a local engine executable.';

    try {
        const info = await fs.stat(filePath);
        if(!info.isFile()) return 'Select an engine executable file, not a folder.';
        if(process.platform === 'win32' && path.extname(filePath).toLowerCase() !== '.exe')
            return 'Select a Windows executable (.exe).';
        if(process.platform !== 'win32') {
            try {
                await fs.access(filePath, constants.X_OK);
            } catch(error) {
                if(error.code !== 'EACCES') throw error;
                await fs.chmod(filePath, info.mode | 0o100);
            }
        }
    } catch(error) {
        return `Cannot access the file: ${error.message}`;
    }
    if(signal?.aborted) return 'Engine check cancelled.';

    return new Promise(resolve => {
        let child;
        try {
            child = spawn(filePath, [], {
                cwd: path.dirname(filePath), windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });
        } catch(error) {
            resolve(`Could not start the file: ${error.message}`);
            return;
        }

        let settled = false;
        let buffer = '';
        let bytes = 0;
        const timer = setTimeout(() => finish('No UCI response before the timeout. The engine may need extra files or launch options.'), timeoutMs);
        const cancel = () => finish('Engine check cancelled.');
        signal?.addEventListener('abort', cancel, { once: true });

        function finish(result) {
            if(settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', cancel);
            if(child.pid && child.exitCode === null && child.signalCode === null) {
                try {
                    if(!child.kill('SIGKILL')) {
                        console.error('[engine probe] Could not stop process:', filePath);
                        result = 'Could not stop the engine check process.';
                    }
                } catch(error) {
                    console.error('[engine probe] Could not stop process:', error);
                    result = `Could not stop the engine check process: ${error.message}`;
                }
            }
            resolve(result);
        }

        child.on('error', error => finish(`Could not start the file: ${error.message}`));
        child.on('close', () => finish('The program exited without confirming UCI support.'));
        child.stdin.on('error', error => finish(`Could not send the UCI command: ${error.message}`));
        child.stdout.on('error', error => finish(`Could not read the engine response: ${error.message}`));
        child.stderr.on('error', error => finish(`Could not read engine diagnostics: ${error.message}`));
        child.stderr.on('data', () => {});
        child.stdout.on('data', chunk => {
            bytes += chunk.length;
            if(bytes > 1024 * 1024) {
                finish('The program produced too much output without confirming UCI support.');
                return;
            }
            buffer += chunk.toString('utf8');
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop();
            if(lines.some(line => line.trim() === 'uciok')) finish(true);
        });
        child.on('spawn', () => {
            if(!settled) child.stdin.write('uci\n');
        });
        if(signal?.aborted) cancel();
    });
}
