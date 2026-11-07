import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import path from 'path';

import { killAllEngines, killEngine, clearCache, addEngine, getSavedEngines, renderEngineGrid,
	removeEngine, renameEngine, sendManualUciToEngine } from './engine.js';
import { startLocalWSS, stopLocalWSS, sendEnginesList, getServerPort, setServerPort } from './server.js';

export let mainWindow = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store();
let portRestartPending = false;

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
		title: `Advanced Chess Assistance Server v${app.getVersion()} (Beta)`,
		width: 735,
		height: 800,
		icon: path.join(__dirname, '..', 'ui', 'favicon.ico'),
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

	mainWindow.webContents.once('did-finish-load', () => {
		startLocalWSS();

		renderEngineGrid();
	});

	return mainWindow;
}

app.whenReady().then(() => {
	createAndTrackWindow();

	handleTrustedIpc('killAllEngines',
		async (event) => killAllEngines());

	handleTrustedIpc('killEngine',
		async (event, identifierObj) => killEngine(identifierObj));

	handleTrustedIpc('getAppVersion', () => app.getVersion());
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

	handleTrustedIpc('removeEngine',
		async (event, enginePath) => removeEngine(enginePath));

	handleTrustedIpc('renameEngine',
		async (event, enginePath, title) => renameEngine(enginePath, title));
	
	handleTrustedIpc('pickFile', async () => {
		const result = await dialog.showOpenDialog(mainWindow, {
			properties: ['openFile'],
			// Unix engines commonly have no extension. Pick the actual UCI executable,
			// not an application bundle or a Windows batch file.
			filters: process.platform === 'win32'
				? [{ name: 'Executables', extensions: ['exe'] }, { name: 'All files', extensions: ['*'] }]
				: [{ name: 'Engine binaries', extensions: ['*'] }]
		});

		if(!result.canceled) return result.filePaths[0];

		return null;
	});

    console.log('Ready!');
});

app.on('before-quit', () => {
	killAllEngines();
	stopLocalWSS();
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
