import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { runInNewContext } from 'node:vm';
import { _electron as electron } from 'playwright';

const require = createRequire(new URL('../appServer/package.json', import.meta.url));
const WebSocket = require('ws');

for(const platform of ['win32', 'darwin', 'linux']) {
  for(const initialGpu of [undefined, true]) {
    test(`${platform} window lifecycle and GPU acceleration ${initialGpu === true ? 'enabled' : 'default'}`, async () => {
        const source = (await readFile(new URL('../appServer/backend/main.js', import.meta.url), 'utf8'))
            .replace(/^import[\s\S]*?;\r?\n/gm, '').replace('export let mainWindow', 'let mainWindow');
        const events = new Map(), handlers = new Map(), windows = [];
        const values = new Map(initialGpu === undefined ? [] : [['hardwareAcceleration', initialGpu]]);
        let quitCount = 0, serverStarts = 0, softwareRendering = false, picker;
        const app = {
            commandLine: { appendSwitch() {} }, getVersion: () => 'test',
            disableHardwareAcceleration: () => { softwareRendering = true; },
            getPath: () => 'userdata',
            whenReady: () => {
                assert.equal(softwareRendering, initialGpu !== true,
                    'Software composition must be selected before app readiness unless explicitly enabled');
                return { then: callback => callback() };
            },
            on: (event, callback) => events.set(event, callback),
            quit: () => quitCount++
        };
        class FakeWindow {
            constructor(options) {
                this.options = options;
                this.webContents = {
                    mainFrame: {},
                    setWindowOpenHandler() {},
                    on: (event, callback) => { if(event === 'did-finish-load') this.loaded = callback; }
                };
                windows.push(this);
            }
            loadFile(file) { this.file = file; }
            setMenu() {}
            on(event, callback) { if(event === 'closed') this.closed = callback; }
            static getAllWindows() { return []; }
        }
        const nativePath = platform === 'win32' ? path.win32 : path.posix;
        const entry = platform === 'win32' ? 'C:\\repo\\appServer\\backend\\main.js' : '/repo/appServer/backend/main.js';
        runInNewContext(source.replace('import.meta.url', '"entry"'), {
            app, BrowserWindow: FakeWindow, Store: class {
                get(key, fallback) { return values.has(key) ? values.get(key) : fallback; }
                set(key, value) { values.set(key, value); }
            },
            fileURLToPath: value => value === 'entry' ? entry : value, path: nativePath, process: { platform },
            ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
            dialog: { showOpenDialog: async (window, options) => { picker = options; return { canceled: true }; } },
            localAISetup: { on() {}, configure: async () => {} }, AI_DEFAULTS: {}, normalizeAISettings: value => value,
            startLocalWSS: () => serverStarts++, renderEngineGrid() {}, console: { log() {} }
        });
        assert.equal(windows[0].file, nativePath.join(nativePath.dirname(entry), '..', 'ui', 'index.html'));
        assert.equal(nativePath.isAbsolute(windows[0].file), true);
        windows[0].loaded();
        const sender = windows[0].webContents;
        const senderFrame = sender.mainFrame;
        senderFrame.url = windows[0].file;
        const event = { sender, senderFrame };
        assert.equal(await handlers.get('getHardwareAcceleration')(event), initialGpu === true);
        assert.equal(await handlers.get('setHardwareAcceleration')(event, initialGpu !== true), initialGpu !== true);
        assert.equal(values.get('hardwareAcceleration'), initialGpu !== true);
        assert.throws(() => handlers.get('setHardwareAcceleration')(event, 'true'), /must be a boolean/);
        assert.throws(() => handlers.get('setHardwareAcceleration')({ ...event, sender: {} }, true), /untrusted/);
        assert.equal(softwareRendering, initialGpu !== true, 'changes apply on the next launch');
        await handlers.get('pickFile')(event, 'Lisää moottori', 'tiedostot');
        assert.equal(picker.title, 'Lisää moottori');
        assert.ok(picker.filters.some(filter => filter.name === 'tiedostot'));
        assert.ok(picker.filters.some(filter => filter.extensions.includes('*')));
        if(platform !== 'win32') assert.deepEqual(Array.from(picker.filters[0].extensions), ['*']);
        await handlers.get('pickAIFile')(event, 'modelPath', 'Malli');
        assert.equal(picker.title, 'Malli');
        assert.deepEqual(Array.from(picker.filters[0].extensions), ['gguf']);
        events.get('activate')();
        windows[1].loaded();
        assert.equal(serverStarts, 2, 'reopened windows must resynchronize server state');
        events.get('window-all-closed')();
        assert.equal(quitCount, platform === 'darwin' ? 0 : 1);
        windows[1].closed();
        assert.equal(quitCount, platform === 'darwin' ? 0 : 2,
            'Closing the main window quits even while auxiliary windows remain');
    });
  }
}

test('GPU acceleration persists and takes effect only after restarting the server', { timeout: 60000 }, async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'acas-server-gpu-'));
    let application;
    t.after(async () => {
        await application?.close();
        await rm(directory, { recursive: true, force: true });
    });
    const probe = createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const userData = path.join(directory, 'user-data');
    await mkdir(userData);
    await writeFile(path.join(userData, 'config.json'), JSON.stringify({ serverPort: port }));
    const entry = path.join(directory, 'main.mjs');
    await writeFile(entry, `import { app } from 'electron';
        app.setPath('userData', ${JSON.stringify(userData)});
        await import(${JSON.stringify(new URL('../appServer/backend/main.js', import.meta.url).href)});`);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const launch = async () => {
        application = await electron.launch({ executablePath: require('electron'), args: [entry], cwd: directory, env });
        const page = await application.firstWindow();
        await page.locator('#portSettingsBtn').click();
        await page.waitForFunction(() => !document.querySelector('#server-gpu-acceleration').disabled);
        return page;
    };
    const hardwareActive = () => application.evaluate(async ({ app }) => {
        await app.getGPUInfo('basic');
        return app.isHardwareAccelerationEnabled();
    });
    let page = await launch();
    assert.equal(await page.locator('#server-gpu-acceleration').isChecked(), false);
    assert.equal(await hardwareActive(), false);
    await page.locator('#server-gpu-acceleration').check();
    await page.waitForFunction(async () => await window.serverAPI.getHardwareAcceleration());
    assert.equal(await hardwareActive(), false, 'changing the choice must not affect the running process');
    await application.close();
    application = null;

    page = await launch();
    assert.equal(await page.locator('#server-gpu-acceleration').isChecked(), true);
    assert.equal(await hardwareActive(), true);
    await page.locator('#server-gpu-acceleration').uncheck();
    await page.waitForFunction(async () => !(await window.serverAPI.getHardwareAcceleration()));
    assert.equal(await hardwareActive(), true);
    await application.close();
    application = null;

    page = await launch();
    assert.equal(await page.locator('#server-gpu-acceleration').isChecked(), false);
    assert.equal(await hardwareActive(), false);
});

test('native Calculation Server starts, serves WebSocket commands, and pins its window', { timeout: 60000 }, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'acas-server-platform-'));
    let application;
    let socket;
    try {
        const probe = createServer();
        await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
        const port = probe.address().port;
        await new Promise(resolve => probe.close(resolve));
        const userData = path.join(directory, 'user-data');
        await mkdir(userData);
        await writeFile(path.join(userData, 'config.json'), JSON.stringify({ serverPort: port }));
        const entry = path.join(directory, 'main.mjs');
        await writeFile(entry, `import { app } from 'electron';
            app.setPath('userData', ${JSON.stringify(userData)});
            await import(${JSON.stringify(new URL('../appServer/backend/main.js', import.meta.url).href)});`);
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        application = await electron.launch({
            executablePath: require('electron'),
            args: [entry],
            cwd: directory,
            env
        });
        const page = await application.firstWindow();
        await page.waitForSelector('#portSettingsBtn');
        await page.waitForFunction(() => window.serverAPI && window.electronAPI);
        const aiSettings = await page.evaluate(() => window.aiAPI.getSettings());
        for(const key of ['executablePath', 'modelPath', 'loraPath'])
            assert.equal(aiSettings[key], '', 'Fresh users should not need developer-local files');
        const aiStatus = await page.evaluate(() => window.aiAPI.getStatus());
        assert.equal(aiStatus.state, 'offline', 'Launching must not download or start a model');
        assert.equal(aiStatus.setup.mode, 'managed');
        assert.equal(aiStatus.setup.installed, false);
        assert.equal(aiStatus.setup.loraAvailable, true);
        await application.evaluate(({ dialog }) => {
            dialog.showOpenDialog = async (_window, options) => {
                globalThis.lastPickerOptions = options;
                return { canceled: true, filePaths: [] };
            };
        });
        await page.evaluate(() => window.fileAPI.pickFile('Lisää moottori', 'tiedostot'));
        const enginePicker = await application.evaluate(() => globalThis.lastPickerOptions);
        assert.equal(enginePicker.title, 'Lisää moottori');
        assert.ok(enginePicker.filters.some(filter => filter.name === 'tiedostot' && filter.extensions.includes('*')));
        await page.evaluate(() => window.aiAPI.pickFile('modelPath', 'Malli'));
        const aiPicker = await application.evaluate(() => globalThis.lastPickerOptions);
        assert.equal(aiPicker.title, 'Malli');
        assert.equal(aiPicker.filters[0].name, 'GGUF');
        await assert.rejects(page.evaluate(() => window.aiAPI.pickFile('modelPath', '')), /Invalid file picker title/);
        assert.equal(await page.evaluate(() => window.electronAPI.getVersion()).then(value => typeof value), 'string');
        const credits = await page.evaluate(() => window.electronAPI.getCredits());
        assert.ok(credits.find(group => group.id === 'libraries').entries.some(entry =>
            entry.name === 'ws' && entry.licenseText.includes('Permission is hereby granted')));
        assert.ok(credits.find(group => group.id === 'fonts').entries.every(entry => entry.licenseText.length > 100));
        await application.evaluate(({ shell }) => {
            shell.openPath = async file => { globalThis.lastCreditsDocument = file; return ''; };
        });
        await page.evaluate(() => window.electronAPI.openChromiumNotices());
        const creditsDocument = await application.evaluate(() => globalThis.lastCreditsDocument);
        assert.equal(path.basename(creditsDocument), 'LICENSES.chromium.html');
        assert.ok((await readFile(creditsDocument, 'utf8')).includes('Chromium'));
        await page.waitForFunction(port => document.getElementById('portDisplay').textContent === String(port), port);
        for(const origin of ['http://localhost', 'https://acaschess.com']) {
            if(socket) await new Promise(resolve => { socket.once('close', resolve); socket.close(); });
            const response = await new Promise((resolve, reject) => {
                socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
                socket.once('error', reject);
                socket.once('open', () => socket.send(JSON.stringify({ type: 'getEngines' })));
                socket.once('message', data => resolve(JSON.parse(data.toString())));
            });
            assert.equal(response.type, 'enginesList', origin);
        }
        for(const origin of ['https://psyyke.github.io', 'http://acaschess.com',
            'https://acaschess.com.evil.example', 'https://acaschess.com:444']) {
            const rejected = new WebSocket(`ws://127.0.0.1:${port}`, { origin, handshakeTimeout: 3000 });
            try {
                await assert.rejects(new Promise((resolve, reject) => {
                    rejected.once('open', resolve);
                    rejected.once('error', reject);
                }), /socket hang up|ECONNRESET|Unexpected server response/, origin);
            } finally { rejected.terminate(); }
        }
        assert.equal(await page.evaluate(() => window.electronAPI.setAlwaysOnTop(true)), true);
        assert.equal(await page.evaluate(() => window.electronAPI.setAlwaysOnTop(false)), false);
        const enginePath = process.execPath;
        const fixture = path.join(directory, 'uci-fixture.cjs');
        const invalidFile = path.join(directory, 'not-an-engine.txt');
        await writeFile(fixture, `
            process.stdin.on('data', data => {
                if (data.toString().includes('uci')) process.stdout.write('id name test engine\\nuciok\\n');
            });
            setInterval(() => {}, 1000);
        `);
        await writeFile(invalidFile, 'not an engine');
        await application.evaluate((_electron, fixturePath) => {
            globalThis.previousNodeOptions = process.env.NODE_OPTIONS;
            process.env.NODE_OPTIONS = '--require="' + fixturePath.replace(/\\/g, '\\\\') + '"';
        }, fixture);
        const cdp = await page.context().newCDPSession(page);
        const dropFiles = async () => {
            const bounds = await page.locator('#engineGrid').boundingBox();
            const data = { items: [], files: [enginePath, invalidFile], dragOperationsMask: 1 };
            const position = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, data };
            await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', ...position });
            await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', ...position });
            const visible = await page.locator('#engine-drop-overlay').isVisible();
            await cdp.send('Input.dispatchDragEvent', { type: 'drop', ...position });
            return visible;
        };
        assert.equal(await dropFiles(), true);
        assert.match(await page.locator('#acas-message').textContent(), /Checking runs these files/);
        assert.ok((await page.locator('#acas-message').textContent()).includes(enginePath));
        await page.locator('#acas-cancel').click();
        assert.equal((await page.evaluate(() => window.engineAPI.getSavedEngines())).length, 0);
        await page.waitForFunction(() => !engineDropBusy);
        assert.equal(await dropFiles(), true);
        await page.locator('#acas-ok').click();
        await page.waitForFunction(() => document.querySelector('#acas-toast-container').textContent.includes('Added engine:'));
        await page.waitForFunction(() => document.querySelector('#acas-toast-container').textContent.includes("Couldn't check not-an-engine.txt."));
        let dropped = await page.evaluate(() => window.engineAPI.getSavedEngines());
        assert.equal(dropped.length, 1);
        assert.equal(dropped[0].path, enginePath);
        assert.equal(await page.evaluate(enginePath => window.engineAPI.addDroppedEngine(enginePath), enginePath),
            'This engine is already in the library.');
        assert.equal(await page.evaluate(enginePath => window.engineAPI.removeEngine(enginePath), enginePath), true);
        await application.evaluate(() => {
            if(globalThis.previousNodeOptions === undefined) delete process.env.NODE_OPTIONS;
            else process.env.NODE_OPTIONS = globalThis.previousNodeOptions;
        });
        assert.equal(await page.evaluate(enginePath =>
            window.engineAPI.addEngine({ path: enginePath, name: 'node' }, 'Platform smoke engine'), enginePath), true);
        const engines = await page.evaluate(() => window.engineAPI.getSavedEngines());
        const engine = engines.find(engine => engine.path === enginePath);
        assert.ok(engine);
        const identifier = { engineId: engine.engineId, instanceId: 'smoke', profileName: 'default' };
        socket.send(JSON.stringify({ type: 'uci', msg: {
            ...identifier, command: 'uci', launchParams: ['--interactive'], siteDomain: 'localhost'
        } }));
        await page.waitForSelector('.console-section');
        await page.waitForFunction(() => document.querySelector('.engine-status')?.textContent === '1 running');
        assert.equal(await page.evaluate(identifier => window.engineAPI.killEngine(identifier), identifier), true);
        await page.waitForFunction(() => document.querySelector('.console-section') === null);
        if(process.platform !== 'darwin') {
            const closed = application.waitForEvent('close', { timeout: 10000 });
            await application.evaluate(({ BrowserWindow }) => {
                const main = BrowserWindow.getAllWindows()[0];
                globalThis.remainingOverlay = new BrowserWindow({ show: false });
                setTimeout(() => main.close(), 100);
            });
            await closed;
            application = null;
        }
    } finally {
        socket?.terminate();
        if(application) await application.close();
        await rm(directory, { recursive: true, force: true });
    }
});
