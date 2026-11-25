import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { probeEngine } from '../appServer/backend/engineProbe.js';

test('engine probe checks UCI, rejects unsuitable files and stops on timeout', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'acas-engine-probe-'));
    const fixture = path.join(directory, 'fixture.cjs');
    const previousOptions = process.env.NODE_OPTIONS;
    const previousMode = process.env.ACAS_TEST_PROBE;
    const previousPidFile = process.env.ACAS_TEST_PROBE_PID;
    try {
        await writeFile(fixture, `
            if (process.env.ACAS_TEST_PROBE_PID)
                require('node:fs').writeFileSync(process.env.ACAS_TEST_PROBE_PID, String(process.pid));
            process.stdin.on('data', data => {
                if (!data.toString().includes('uci')) return;
                if (process.env.ACAS_TEST_PROBE === 'success') {
                    process.stdout.write('id name test engine\\nuc');
                    setTimeout(() => process.stdout.write('iok\\n'), 20);
                } else if (process.env.ACAS_TEST_PROBE === 'exit') {
                    process.exit(0);
                } else if (process.env.ACAS_TEST_PROBE === 'output') {
                    process.stdout.write('x'.repeat(1024 * 1024 + 1));
                }
            });
            setInterval(() => {}, 1000);
        `);
        process.env.NODE_OPTIONS = `--require="${fixture.replace(/\\/g, '\\\\')}"`;
        process.env.ACAS_TEST_PROBE = 'success';
        assert.equal(await probeEngine(process.execPath, { timeoutMs: 3000 }), true);
        process.env.ACAS_TEST_PROBE = 'exit';
        assert.match(await probeEngine(process.execPath, { timeoutMs: 3000 }), /exited without confirming UCI/);
        process.env.ACAS_TEST_PROBE = 'output';
        assert.match(await probeEngine(process.execPath, { timeoutMs: 3000 }), /too much output/);
        process.env.ACAS_TEST_PROBE = 'timeout';
        assert.match(await probeEngine(process.execPath, { timeoutMs: 250 }), /timeout/);
        const controller = new AbortController();
        const pidFile = path.join(directory, 'pid');
        process.env.ACAS_TEST_PROBE_PID = pidFile;
        const pending = probeEngine(process.execPath, { timeoutMs: 3000, signal: controller.signal });
        let pid;
        for(let attempt = 0; attempt < 100 && !pid; attempt++) {
            try { pid = Number(await readFile(pidFile, 'utf8')); }
            catch(error) {
                if(error.code !== 'ENOENT') throw error;
                await new Promise(resolve => setTimeout(resolve, 20));
            }
        }
        assert.ok(pid, 'probe process started');
        controller.abort();
        assert.match(await pending, /cancelled/);
        let alive = true;
        for(let attempt = 0; attempt < 100 && alive; attempt++) {
            try { process.kill(pid, 0); }
            catch(error) {
                if(error.code !== 'ESRCH') throw error;
                alive = false;
            }
            if(alive) await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.equal(alive, false, 'cancelled probe process stopped');
        assert.match(await probeEngine(process.execPath, { signal: controller.signal }), /cancelled/);
        assert.match(await probeEngine(directory), /not a folder/);
        assert.match(await probeEngine(path.join(directory, 'missing.exe')), /Cannot access/);
        assert.match(await probeEngine('relative.exe'), /local engine executable/);
        const badBinary = path.join(directory, 'bad.exe');
        await writeFile(badBinary, 'not an executable');
        assert.match(await probeEngine(badBinary), /Could not start the file/);
        if(process.platform === 'win32') {
            const textFile = path.join(directory, 'not-an-engine.txt');
            await writeFile(textFile, 'not an executable');
            assert.match(await probeEngine(textFile), /Windows executable/);
        }
    } finally {
        if(previousOptions === undefined) delete process.env.NODE_OPTIONS;
        else process.env.NODE_OPTIONS = previousOptions;
        if(previousMode === undefined) delete process.env.ACAS_TEST_PROBE;
        else process.env.ACAS_TEST_PROBE = previousMode;
        if(previousPidFile === undefined) delete process.env.ACAS_TEST_PROBE_PID;
        else process.env.ACAS_TEST_PROBE_PID = previousPidFile;
        await rm(directory, { recursive: true, force: true });
    }
});
