import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startServer } from './maia-elo/serve.mjs';
import { textFileContents, lc0ConfigContents, fairyVariantContents } from '../app/assets/engines/text-files.js';
import { parsePersonality } from '../app/assets/engines/rodent-v/personality.js';
import { engineTextFileNames, isEngineTextFile, initialEngineTextFiles, engineTextFilesChanged } from '../app/assets/js/instance/engineTextFiles.js';
import applyDynamicOption from '../app/assets/js/instance/applyDynamicOption.js';
import { setDynamicOption } from '../app/assets/js/gui/dynamicEngineOptionState.js';

const manifest = JSON.parse(await readFile(new URL('../app/assets/engines/rodent-v/dist/build-info.json', import.meta.url)));
let server, url, browser;
before(async () => {
    ({ server, url } = await startServer({ outFile: process.platform === 'win32' ? 'NUL' : '/dev/null' }));
    server.prependListener('request', request => {
        if(request.url.startsWith('/A.C.A.S/')) request.url = request.url.slice(8);
    });
    browser = await chromium.launch();
});
after(async () => {
    await browser?.close();
    await new Promise(resolve => server?.close(resolve));
});

test('only supported local text inputs become content editors', () => {
    for(const engine of ['modern-lc0', 'modern-lc0-webgpu', 'lc0-v0.32.1', 'lc0-v0.32.1-wasm', 'lc0-v0.32.1-webgpu'])
        assert.deepEqual(engineTextFileNames(engine), ['ConfigFile']);
    assert.ok(isEngineTextFile('rodent-v', 'PersonalityFile'));
    assert.ok(isEngineTextFile('fairy-stockfish-nnue-wasm', 'VariantPath'));
    assert.equal(isEngineTextFile('rodent-v', 'PersonalityFile', true), false);
    for(const engine of ['stockfish-19', 'lc0', 'lozza-9', 'maia2', 'maia3', 'acas-fusion']) {
        for(const name of ['EvalFile', 'WeightsFile', 'LogFile', 'SyzygyPath', 'BackendOptions', 'ConfigFile'])
            assert.equal(isEngineTextFile(engine, name), false);
    }
});

test('file snapshots and reloads respect advanced mode, external engines and clearing', () => {
    const key = 'DYNAMIC_rodent-v_PersonalityFile';
    const config = { enableAdvancedElo: true, [key]: 'setoption name hceWeight value 80' };
    assert.deepEqual(initialEngineTextFiles('rodent-v', config), { PersonalityFile: config[key] });
    assert.deepEqual(initialEngineTextFiles('rodent-v', { ...config, enableAdvancedElo: false }), {});
    assert.deepEqual(initialEngineTextFiles('rodent-v', { ...config, useExternalChessEngine: true }), {});
    assert.ok(engineTextFilesChanged('rodent-v', config, { enableAdvancedElo: true, [key]: '' }));
    assert.ok(!engineTextFilesChanged('rodent-v', config, { ...config }));
    assert.ok(!engineTextFilesChanged('rodent-v', config, { ...config, [key]: '', useExternalChessEngine: true }));
});

test('text validation is bounded, preserves content and distinguishes native formats', () => {
    assert.equal(textFileContents('\uFEFF# comment\r\none\rtwo', 'File'), '# comment\none\ntwo');
    assert.equal(textFileContents('x'.repeat(65536), 'File').length, 65536);
    for(const text of ['x'.repeat(65537), '\u00e9'.repeat(32769), '\0', true])
        assert.throws(() => textFileContents(text, 'File'), /File:/);
    assert.throws(() => lc0ConfigContents('C:\\local\\lc0.config'), /not a file path/);
    for(const flag of ['weights', 'backend', 'config', 'logfile', 'syzygy-path'])
        assert.throws(() => lc0ConfigContents(`--${flag}=something`), /managed by the app/);
    assert.equal(lc0ConfigContents('# hello\n--cpuct=3.25\nthreads=1'), '# hello\n--cpuct=3.25\nthreads=1');
    assert.deepEqual(fairyVariantContents('[acas:chess]\ndoubleStep = false').names, ['acas']);
    assert.throws(() => fairyVariantContents('C:\\variants.ini'), /not a file path/);
    assert.throws(() => fairyVariantContents('[a:chess]\n[a:chess]'), /duplicate/);
});

test('all bundled personalities parse unchanged, including native book aliases', async () => {
    for(const name of ['ampere', 'chaotic', 'hector', 'nimzoid', 'rodent', 'tal_hybrid', 'tal_nnue']) {
        const text = await readFile(new URL(`../app/assets/engines/rodent-v/dist/assets/personalities/${name}.txt`, import.meta.url), 'utf8');
        const options = parsePersonality(text, manifest.assets);
        assert.match(options.get('nnuepath').value, /_768/);
        assert.ok(options.has('mainbook'));
    }
    for(const line of ['go infinite', 'personalities/tal.txt', 'setoption name PersonalityFile value recursive',
        'setoption name hceWeight value 257', 'setoption name OwnSafety value -1',
        'setoption name NnuePath value nets/unknown.bin', 'setoption name OwnBook value yes'])
        assert.throws(() => parsePersonality(line, manifest.assets), /PersonalityFile line 1:/);
});

test('file contents never enter UCI commands, while external file paths keep native semantics', async () => {
    const key = 'DYNAMIC_rodent-v_PersonalityFile', text = '; custom\nsetoption name hceWeight value 80';
    setDynamicOption(key, { name: 'PersonalityFile', type: 'string', defaultValue: '' }, 'default', 'text-test');
    const commands = [];
    const instance = {
        instanceID: 'text-test', pV: { default: {} }, getEngineName: async () => 'rodent-v',
        getEngineAcasObj: () => ({ textFiles: { PersonalityFile: text } }),
        setEngineOption: async (...args) => { commands.push(args); return true; }
    };
    assert.equal(await applyDynamicOption.call(instance, key, text, 'default', false), true);
    assert.equal(commands.length, 0);
    await assert.rejects(applyDynamicOption.call(instance, key, 'changed', 'default', false), /reload/);
    Object.assign(instance.pV.default, { useExternalChessEngine: true, externalChessEngine: 'rodent-v' });
    assert.equal(await applyDynamicOption.call(instance, key, 'C:\\Rodent\\personalities\\tal.txt', 'default', true), true);
    assert.equal(commands[0][1], 'C:\\Rodent\\personalities\\tal.txt');
    assert.equal(await applyDynamicOption.call(instance, key, text, 'default', true), false);
});

async function enginePage(t, type, textFiles) {
    const page = await browser.newPage();
    t.after(() => page.close());
    await page.route('**/app/', route => route.fulfill({
        contentType: 'text/html',
        headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' },
        body: '<title>Text files</title>'
    }));
    await page.goto(`${url}/app/`);
    await page.evaluate(async ({ type, textFiles }) => {
        const { default: load, getEngineWorkerConfig } = await import('./assets/js/instance/engineWorker.js');
        window.lines = [];
        window.failure = '';
        window.worker = load(getEngineWorkerConfig(type), {
            type, textFiles, profileName: 'default', pendingLoads: new Set(), isCurrent: () => true,
            loadWeights: async () => (await fetch('./assets/lc0-nets/maia-1100.pb')).arrayBuffer(),
            onReady: engine => { window.engine = engine; engine.sendMsg('uci'); },
            onMessage: line => lines.push(line),
            onError: error => { window.failure = error.message; }
        });
    }, { type, textFiles });
    await page.waitForFunction(() => window.failure || window.lines.includes('uciok'), null, { timeout: 30000 })
        .catch(async error => { console.error(type, await page.evaluate(() => ({ lines, failure }))); throw error; });
    return page;
}

async function commands(page, commands, pattern) {
    const from = await page.evaluate(commands => {
        const from = lines.length;
        commands.forEach(line => engine.sendMsg(line));
        return from;
    }, commands);
    await page.waitForFunction(({ from, pattern }) => window.failure || lines.slice(from).some(line => new RegExp(pattern).test(line)),
        { from, pattern: pattern.source }, { timeout: 15000 });
    assert.equal(await page.evaluate(() => failure), '');
    return page.evaluate(from => lines.slice(from), from);
}

test('real Rodent consumes personality contents before handshake and preserves file/manual precedence', async t => {
    const page = await enginePage(t, 'rodent-v', { PersonalityFile: [
        '; a pasted personality', 'setoption name nnuePath value nets/rodent_4kb_768hl_8ob_v2.bin',
        'setoption name hceWeight value 80', 'setoption name OwnSafety value 63',
        'setoption name UCI_Chess960 value TRUE', 'setoption name OwnBook value true'
    ].join('\n') });
    assert.equal(await page.evaluate(() => failure), '');
    let lines = await page.evaluate(() => window.lines);
    assert.ok(lines.includes('info string Rodent loading 768-neuron runtime'));
    assert.ok(lines.includes('option name hceWeight type spin default 80 min 0 max 256'), lines.join('\n'));
    assert.ok(lines.includes('option name OwnSafety type spin default 63 min 0 max 500'));
    assert.ok(lines.includes('option name UCI_Chess960 type check default true'));
    assert.ok(lines.includes('option name OwnBook type check default true'));
    lines = await commands(page, ['setoption name Personality value ampere', 'setoption name hceWeight value 0', 'uci'], /^uciok$/);
    assert.ok(lines.includes('option name hceWeight type spin default 0 min 0 max 256'));
    assert.ok(lines.includes('option name OwnSafety type spin default 63 min 0 max 500'));
    lines = await commands(page, ['setoption name NnuePath value nets/rodent_8kb_512pw_multilayer_v8.bin', 'uci'], /^uciok$/);
    assert.ok(lines.includes('info string Rodent loading 512-neuron runtime'));
    assert.ok(lines.includes('option name hceWeight type spin default 0 min 0 max 256'));
    assert.ok(lines.includes('option name OwnSafety type spin default 63 min 0 max 500'));
    lines = await commands(page, ['position startpos', 'go depth 2 searchmoves a2a3'], /^bestmove /);
    assert.ok(lines.some(line => /^bestmove a2a3/.test(line)));
});

test('real Fairy loads inline variants before advertising options and searches with their rules', async t => {
    const page = await enginePage(t, 'fairy-stockfish-nnue-wasm', {
        VariantPath: '[acastext:chess]\ndoubleStep = false\n[error:chess]\ndoubleStep = false\n'
    });
    assert.equal(await page.evaluate(() => failure), '');
    assert.ok(await page.evaluate(() => lines.some(line => /option name UCI_Variant .* var acastext(?: |$)/.test(line))));
    let lines = await commands(page, ['setoption name UCI_Variant value acastext', 'position startpos', 'go perft 1'], /Nodes searched:/);
    assert.ok(lines.some(line => /Nodes searched: 12/.test(line)), lines.join('\n'));
    lines = await commands(page, ['go depth 2'], /^bestmove /);
    assert.ok(lines.some(line => /^bestmove [a-h][1-8][a-h][1-8]/.test(line)));
});

test('real Lc0 reads ConfigFile at startup instead of merely setting the UCI path', async t => {
    const page = await enginePage(t, 'lc0-v0.32.1-wasm', {
        ConfigFile: '# pasted config\n--cpuct=3.25\nthreads=1\n--multipv=2'
    });
    assert.equal(await page.evaluate(() => failure), '');
    const options = await page.evaluate(() => lines.filter(line => /^option name (CPuct |Threads |MultiPV )/.test(line)));
    assert.ok(options.some(line => /name CPuct .*default 3\.250*(?: |$)/.test(line)), options.join('\n'));
    assert.ok(options.some(line => /name Threads .*default 1(?: |$)/.test(line)), options.join('\n'));
    assert.ok(options.some(line => /name MultiPV .*default 2(?: |$)/.test(line)), options.join('\n'));
    const lines = await commands(page, ['position startpos', 'go nodes 4'], /^bestmove /);
    assert.ok(lines.some(line => /multipv 2 /.test(line)), lines.join('\n'));
});

for(const [type, files, pattern] of [
    ['rodent-v', { PersonalityFile: 'go infinite' }, /PersonalityFile line 1/],
    ['fairy-stockfish-nnue-wasm', { VariantPath: '[acas:unknownbase]\ndoubleStep = false' }, /VariantPath:/],
    ['fairy-stockfish-nnue-wasm', { VariantPath: '[acas:chess]\nthisIsUnknown = 42' }, /VariantPath:/],
    ['lc0-v0.32.1-wasm', { ConfigFile: '--not-a-real-lc0-option=1' }, /not-a-real-lc0-option/i]
]) {
    test(`${type} rejects invalid text files explicitly`, async t => {
        const page = await enginePage(t, type, files);
        assert.match(await page.evaluate(() => failure), pattern);
    });
}
