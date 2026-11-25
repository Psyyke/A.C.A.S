import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import path from 'path';
import { readFile } from 'node:fs/promises';

import { killAllEngines, killEngine, clearCache, addEngine, getSavedEngines, renderEngineGrid,
	removeEngine, renameEngine, sendManualUciToEngine } from './engine.js';
import { startLocalWSS, stopLocalWSS, sendEnginesList, getServerPort, setServerPort, localAIHost, localAISetup } from './server.js';
import { normalizeAISettings, AI_DEFAULTS } from './nativeAI.js';
import { probeEngine } from './engineProbe.js';

export let mainWindow = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store();
let portRestartPending = false;
let quitCleanupStarted = false;
let quitCleanupFinished = false;
let setupReady = Promise.resolve();
const engineChecks = new Map();

localAISetup.on('status', status => {
	if(mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('aiStatus', status);
});

function storedAISettings() {
	try { return normalizeAISettings(store.get('localAI', AI_DEFAULTS)); }
	catch { return { ...AI_DEFAULTS }; }
}

function handleTrustedIpc(channel, handler) {
	ipcMain.handle(channel, (event, ...args) => {
		if(!mainWindow || event.sender !== mainWindow.webContents
			|| event.senderFrame !== event.sender.mainFrame) {
			throw new Error(`Rejected IPC request from an untrusted frame: ${channel}`);
		}

		let senderPath;
		try {
			senderPath = fileURLToPath(event.senderFrame.url);
		} catch {
			throw new Error(`Rejected IPC request from a non-local page: ${channel}`);
		}

		const trustedPage = path.resolve(__dirname, '..', 'ui', 'index.html');
		if(path.resolve(senderPath) !== trustedPage)
			throw new Error(`Rejected IPC request from a non-app page: ${channel}`);

		return handler(event, ...args);
	});
}

app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-raf-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

function createWindow() {
	const win = new BrowserWindow({
		title: `Advanced Chess Assistance Server v${app.getVersion()}`,
		width: 735,
		height: 800,
		backgroundColor: '#161616',
		icon: path.join(__dirname, '..', 'ui', process.platform === 'win32' ? 'favicon.ico' : 'images/icon.png'),
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false
		}
	});
	win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
	win.webContents.on('will-navigate', (event, targetUrl) => {
		let targetPath;
		try {
			targetPath = fileURLToPath(targetUrl);
		} catch {
			event.preventDefault();
			return;
		}

		if(path.resolve(targetPath) !== path.resolve(__dirname, '..', 'ui', 'index.html'))
			event.preventDefault();
	});

	win.loadFile(path.join(__dirname, '..', 'ui', 'index.html'));

	return win;
}

function createAndTrackWindow() {
	mainWindow = createWindow();
	mainWindow.setMenu(null);
	const win = mainWindow;
	win.on('closed', () => {
		if(mainWindow === win) mainWindow = null;
		// Overlay windows can outlive the main window and prevent window-all-closed.
		if(process.platform !== 'darwin') app.quit();
	});
	let initialLoad = true;
	let recovered = false;
	let crashes = [];

	win.webContents.on('render-process-gone', (_event, details) => {
		if(quitCleanupStarted || win.isDestroyed() || details.reason === 'clean-exit') return;
		console.error(`Server window renderer stopped: ${details.reason} (exit code ${details.exitCode}).`);
		const now = Date.now();
		crashes = crashes.filter(time => now - time < 60000);
		crashes.push(now);
		if(crashes.length > 2) {
			void dialog.showMessageBox(win, {
				type: 'error', title: 'A.C.A.S window stopped',
				message: 'The server window stopped repeatedly.',
				detail: 'Restart the local server. Running engines and Pena will stop when you close it.'
			});
			return;
		}
		recovered = true;
		win.webContents.reload();
	});

	win.webContents.on('did-finish-load', () => {
		startLocalWSS();

		renderEngineGrid();

		if(recovered) {
			recovered = false;
			win.webContents.send('toast', { type: 'warning',
				text: 'The server window stopped and was reloaded. Previous console output was cleared.', ms: 10000 });
		}
		if(initialLoad) {
			initialLoad = false;
			// Bring Pena back if it was running last time, but never start a download on launch.
			setupReady.then(() => {
				if(store.get('localAIAutoStart', false)) void localAISetup.run({ allowDownload: false });
			});
		}
	});

	return mainWindow;
}

app.whenReady().then(() => {
	setupReady = localAISetup.configure({
		root: path.join(app.getPath('userData'), 'pena'),
		getSettings: storedAISettings,
		setAutoStart: enabled => store.set('localAIAutoStart', enabled)
	}).catch(error => console.error('Pena setup folder is unavailable:', error));
	createAndTrackWindow();

	handleTrustedIpc('killAllEngines',
		async (event) => killAllEngines());

	handleTrustedIpc('killEngine',
		async (event, identifierObj) => killEngine(identifierObj));

	handleTrustedIpc('getAppVersion', () => app.getVersion());
	handleTrustedIpc('getCredits', async () => {
		if(!app.isPackaged) {
			const { prepareLicenses } = await import('../scripts/prepare-licenses.cjs');
			await prepareLicenses(path.resolve(__dirname, '..'));
		}
		const file = app.isPackaged ? path.join(process.resourcesPath, 'credits.json')
			: path.resolve(__dirname, '..', '.licenses', 'credits.json');
		return JSON.parse(await readFile(file, 'utf8'));
	});
	handleTrustedIpc('openChromiumNotices', async () => {
		const file = app.isPackaged ? path.join(process.resourcesPath, '..', 'LICENSES.chromium.html')
			: path.resolve(__dirname, '..', '.licenses', 'LICENSES.chromium.html');
		const error = await shell.openPath(file);
		if(error) throw new Error(error);
	});
	handleTrustedIpc('openExternal', async (_event, rawUrl) => {

		if(typeof rawUrl !== 'string')
			throw new Error('Invalid external URL.');

		let url;
		try {
			url = new URL(rawUrl);
		} catch {
			throw new Error('Invalid external URL.');
		}

		if(url.protocol !== 'https:' || url.username || url.password)
			throw new Error('Only HTTPS external links are allowed.');

		await shell.openExternal(url.href);
	});
	handleTrustedIpc('getAlwaysOnTop', event => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if(!win || win.isDestroyed()) throw new Error('App window is unavailable.');
		return win.isAlwaysOnTop();
	});
	handleTrustedIpc('setAlwaysOnTop', (event, enabled) => {
		if(typeof enabled !== 'boolean') throw new Error('Always on top must be a boolean.');
		const win = BrowserWindow.fromWebContents(event.sender);
		if(!win || win.isDestroyed()) throw new Error('App window is unavailable.');
		win.setAlwaysOnTop(enabled);
		return win.isAlwaysOnTop();
	});
	handleTrustedIpc('getServerPort', () => getServerPort());
	handleTrustedIpc('getAISettings', () => storedAISettings());
	handleTrustedIpc('getAIStatus', () => localAISetup.fullStatus());
	handleTrustedIpc('startAI', async (_event, settings) => {
		if(settings !== undefined) store.set('localAI', normalizeAISettings(settings));
		void localAISetup.run();
		return localAISetup.fullStatus();
	});
	handleTrustedIpc('stopAI', () => localAISetup.stop());
	handleTrustedIpc('cancelAISetup', () => { localAISetup.cancel(); return localAISetup.fullStatus(); });
	handleTrustedIpc('pickAIFile', async (_event, kind, title) => {
		if(!['executablePath', 'modelPath', 'loraPath'].includes(kind)) throw new Error('Invalid AI file type.');
		if(title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > 256)) throw new Error('Invalid file picker title.');
		const executable = kind === 'executablePath';
		const result = await dialog.showOpenDialog(mainWindow, {
			title: title ?? (executable ? 'Select installed llama-server executable' : 'Select local GGUF file'),
			properties: ['openFile'],
			filters: executable
				? [{ name: 'llama-server', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }]
				: [{ name: 'GGUF', extensions: ['gguf'] }]
		});
		return result.canceled ? null : result.filePaths[0];
	});
	handleTrustedIpc('setServerPort', async (_event, port) => {
		if(portRestartPending) return 'The server port is already being updated.';
		portRestartPending = true;
		try {
			const result = await setServerPort(port);
			if(result === true) {
				setTimeout(() => {
					app.relaunch();
					app.quit();
				}, 250);
			} else {
				portRestartPending = false;
			}
			return result;
		} catch(error) {
			portRestartPending = false;
			console.error('Failed to save server port:', error);
			return 'Could not save the server port. The app has not been restarted.';
		}
	});

    handleTrustedIpc('clearCache',
		async (event) => clearCache());

	handleTrustedIpc('getSavedEngines',
		async (event) => getSavedEngines());

	handleTrustedIpc('sendEnginesList',
		async (event) => sendEnginesList());

	handleTrustedIpc('sendManualUciToEngine',
		async (event, cmd, identifierObj) => sendManualUciToEngine(cmd, identifierObj));

	handleTrustedIpc('addEngine',
		async (event, fileInfo, title) => addEngine(fileInfo, title));

	handleTrustedIpc('addDroppedEngine', async (_event, filePath) => {
		if(engineChecks.has(filePath)) return 'This engine is already being checked.';
		if(getSavedEngines().some(engine => engine.path === filePath))
			return 'This engine is already in the library.';
		const controller = new AbortController();
		engineChecks.set(filePath, controller);
		try {
			const result = await probeEngine(filePath, { signal: controller.signal });
			if(result !== true) return result;
			if(controller.signal.aborted) return 'Engine check cancelled.';
			const name = path.basename(filePath);
			return await addEngine({ path: filePath, name }, name);
		} finally {
			engineChecks.delete(filePath);
		}
	});

	handleTrustedIpc('removeEngine',
		async (event, enginePath) => removeEngine(enginePath));

	handleTrustedIpc('renameEngine',
		async (event, enginePath, title) => renameEngine(enginePath, title));
	
	handleTrustedIpc('pickFile', async (_event, title, filesLabel) => {
		if(title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > 256)) throw new Error('Invalid file picker title.');
		if(filesLabel !== undefined && (typeof filesLabel !== 'string' || !filesLabel.trim() || filesLabel.length > 256)) throw new Error('Invalid file filter label.');
		const result = await dialog.showOpenDialog(mainWindow, {
			...(title === undefined ? {} : { title }),
			properties: ['openFile'],
			// Unix engines commonly have no extension. Pick the actual UCI executable,
			// not an application bundle or a Windows batch file.
			filters: process.platform === 'win32'
				? [{ name: 'EXE', extensions: ['exe'] }, { name: filesLabel ?? 'All files', extensions: ['*'] }]
				: [{ name: filesLabel ?? 'Engine binaries', extensions: ['*'] }]
		});

		if(!result.canceled) return result.filePaths[0];

		return null;
	});

    console.log('Ready!');
});

app.on('before-quit', event => {
	if(quitCleanupFinished) return;
	event.preventDefault();
	if(quitCleanupStarted) return;
	quitCleanupStarted = true;
	for(const controller of engineChecks.values()) controller.abort();
	killAllEngines();
	stopLocalWSS();
	localAISetup.cancel({ quiet: true });
	localAIHost.stop().finally(() => {
		quitCleanupFinished = true;
		app.quit();
	});
});

app.on('window-all-closed', () => {
	if(process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
	// The return value used to be dropped, so mainWindow still pointed at the destroyed
	// window and every renderer send bailed on isDestroyed(). On macOS that left a blank
	// window with no engine grid, no consoles and no toasts.
	if(BrowserWindow.getAllWindows().length === 0) createAndTrackWindow();
});
