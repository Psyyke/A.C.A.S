import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';

test('browser search matches native scalar Rodent for the latest network and all seven presets', {
    skip: process.env.RODENT_NATIVE_TEST !== '1' ? 'Set RODENT_NATIVE_TEST=1 with the Go SDK and pinned upstream checkout' : false,
    timeout: 180000
}, async () => {
    const root = path.resolve('app', 'assets', 'engines', 'rodent-v');
    const upstream = process.env.RODENT_UPSTREAM_DIR || path.join(root, 'build', 'upstream');
    const go = process.env.RODENT_GO || 'go';
    const executables = {};
    for(const size of [512, 768]) {
        const directory = path.join(root, 'build', `native-${size}`);
        mkdirSync(path.join(directory, 'nets'), { recursive: true });
        for(const name of readdirSync(upstream)) {
            if(/\.(go|s)$/.test(name) || ['go.mod', 'go.sum'].includes(name))
                copyFileSync(path.join(upstream, name), path.join(directory, name));
        }
        const network = size === 512 ? 'rodent_8kb_512pw_multilayer_v8.bin' : 'rodent_4kb_768hl_8ob_v2.bin';
        copyFileSync(path.join(upstream, 'nets', network), path.join(directory, 'nets', network));
        const file = path.join(directory, 'nnue.go');
        writeFileSync(file, readFileSync(file, 'utf8').replace('NNUEHiddenSize     = 512', `NNUEHiddenSize     = ${size}`)
            .replace('//go:embed nets/rodent_8kb_512pw_multilayer_v8.bin', `//go:embed nets/${network}`));
        executables[size] = path.join(directory, process.platform === 'win32' ? 'rodent.exe' : 'rodent');
        execFileSync(go, ['build', '-pgo=off', '-o', executables[size], '.'], { cwd: directory, stdio: 'inherit' });
    }

    const { server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        await page.route('**/native-rodent-fixture', route => route.fulfill({ contentType: 'text/html', body: '<title>Native parity</title>' }));
        await page.goto(`${url}/native-rodent-fixture`);
        await page.evaluate(() => {
            window.lines = [];
            window.failure = '';
            window.worker = new Worker('/app/assets/engines/rodent-v/worker.js');
            worker.onmessage = ({ data }) => {
                if(data === true) window.ready = true;
                else if(data?.type === 'error') window.failure = data.message;
                else lines.push(data);
            };
        });
        await page.waitForFunction(() => window.ready || window.failure);
        const presets = ['default', 'ampere', 'chaotic', 'hector', 'nimzoid', 'rodent', 'tal_hybrid', 'tal_nnue'];
        for(const preset of presets) {
            const native = spawn(executables[preset === 'default' ? 512 : 768], ['alloptions'], {
                cwd: upstream, env: { ...process.env, GODEBUG: 'cpu.avx2=off' }, stdio: ['pipe', 'pipe', 'pipe']
            });
            let buffer = '', stderr = '';
            const nativeLines = [];
            native.stdout.on('data', data => {
                buffer += data;
                const parts = buffer.split('\n');
                buffer = parts.pop();
                nativeLines.push(...parts.map(line => line.trim()));
            });
            native.stderr.on('data', data => { stderr += data; });
            const send = command => native.stdin.write(command + '\n');
            const waitFor = async (pattern, from = 0) => {
                const deadline = Date.now() + 15000;
                while(!nativeLines.slice(from).some(line => pattern.test(line))) {
                    if(Date.now() > deadline || native.exitCode !== null)
                        throw new Error(`Native Rodent did not answer ${pattern}: ${stderr}\n${nativeLines.slice(-10).join('\n')}`);
                    await delay(5);
                }
                return nativeLines.slice(from);
            };
            try {
                send('uci');
                await waitFor(/^uciok$/);
                if(preset !== 'default') {
                    send(`setoption name PersonalityFile value personalities/${preset}.txt`);
                    await waitFor(/^info string loaded personality:/);
                }
                await page.evaluate(preset => {
                    lines.length = 0;
                    worker.postMessage(`setoption name Personality value ${preset}`);
                    worker.postMessage('isready');
                }, preset);
                await page.waitForFunction(() => window.failure || lines.includes('readyok'));
                assert.equal(await page.evaluate(() => window.failure), '');
                for(const position of [
                    'position startpos',
                    'position startpos moves e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4',
                    'position fen r3k2r/ppp2ppp/2npbn2/8/2BPP3/2N2N2/PPP2PPP/R3K2R w KQkq - 0 1',
                    'position fen 4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'
                ]) {
                    const from = nativeLines.length;
                    send('ucinewgame');
                    send(position);
                    send('go depth 3');
                    const expected = await waitFor(/^bestmove /, from);
                    await page.evaluate(position => {
                        lines.length = 0;
                        worker.postMessage('ucinewgame');
                        worker.postMessage(position);
                        worker.postMessage('go depth 3');
                    }, position);
                    await page.waitForFunction(() => window.failure || lines.some(line => /^bestmove /.test(line)));
                    assert.equal(await page.evaluate(() => window.failure), '');
                    const actual = await page.evaluate(() => lines);
                    const scorePV = lines => {
                        const final = lines.filter(line => /^info depth 3 /.test(line)).at(-1);
                        return { score: final?.match(/score (cp|mate) (-?\d+)/)?.[0],
                            pv: final?.split(' pv ')[1], best: lines.find(line => /^bestmove /.test(line)) };
                    };
                    assert.deepEqual(scorePV(actual), scorePV(expected), `${preset}: ${position}`);
                }
            } finally {
                native.kill();
            }
        }
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
