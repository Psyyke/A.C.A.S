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
    test(`${platform} window lifecycle, absolute UI path and engine picker`, async () => {
        const source = (await readFile(new URL('../appServer/backend/main.js', import.meta.url), 'utf8'))
            .replace(/^import[\s\S]*?;\r?\n/gm, '').replace('export let mainWindow', 'let mainWindow');
        const events = new Map(), handlers = new Map(), windows = [];
        let quitCount = 0, serverStarts = 0, picker;
        const app = {
            commandLine: { appendSwitch() {} }, getVersion: () => 'test',
            whenReady: () => ({ then: callback => callback() }),
            on: (event, callback) => events.set(event, callback),
            quit: () => quitCount++
        };
        class FakeWindow {
            constructor(options) {
                this.options = options;
                this.webContents = { once: (event, callback) => this.loaded = callback };
                windows.push(this);
            }
            loadFile(file) { this.file = file; }
            setMenu() {}
            static getAllWindows() { return []; }
        }
        const nativePath = platform === 'win32' ? path.win32 : path.posix;
        const entry = platform === 'win32' ? 'C:\\repo\\appServer\\backend\\main.js' : '/repo/appServer/backend/main.js';
        runInNewContext(source.replace('import.meta.url', '"entry"'), {
            app, BrowserWindow: FakeWindow, Store: class {},
            fileURLToPath: () => entry, path: nativePath, process: { platform },
            ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
            dialog: { showOpenDialog: async (window, options) => { picker = options; return { canceled: true }; } },
            startLocalWSS: () => serverStarts++, renderEngineGrid() {}, console: { log() {} }
        });
        assert.equal(windows[0].file, nativePath.join(nativePath.dirname(entry), '..', 'ui', 'index.html'));
        assert.equal(nativePath.isAbsolute(windows[0].file), true);
        windows[0].loaded();
        await handlers.get('pickFile')();
        assert.ok(picker.filters.some(filter => filter.extensions.includes('*')));
        if(platform !== 'win32') assert.deepEqual(Array.from(picker.filters[0].extensions), ['*']);
        events.get('activate')();
        windows[1].loaded();
        assert.equal(serverStarts, 2, 'reopened windows must resynchronize server state');
        events.get('window-all-closed')();
        assert.equal(quitCount, platform === 'darwin' ? 0 : 1);
    });
}

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
        assert.equal(await page.evaluate(() => window.electronAPI.getVersion()).then(value => typeof value), 'string');
        await page.waitForFunction(port => document.getElementById('portDisplay').textContent === String(port), port);
        const response = await new Promise((resolve, reject) => {
            socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'http://localhost' });
            socket.once('error', reject);
            socket.once('open', () => socket.send(JSON.stringify({ type: 'getEngines' })));
            socket.once('message', data => resolve(JSON.parse(data.toString())));
        });
        assert.equal(response.type, 'enginesList');
        assert.equal(await page.evaluate(() => window.electronAPI.setAlwaysOnTop(true)), true);
        assert.equal(await page.evaluate(() => window.electronAPI.setAlwaysOnTop(false)), false);
        const enginePath = process.execPath;
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
    } finally {
        socket?.terminate();
        if(application) await application.close();
        await rm(directory, { recursive: true, force: true });
    }
});
