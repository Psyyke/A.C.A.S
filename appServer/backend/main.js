import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import path from 'path';
import os from 'os';

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

function getExecutableExtensions() {
    const platform = os.platform();

    if(platform === 'win32') return ['exe', 'bat', 'cmd'];
    if(platform === 'darwin') return ['app', 'command'];
    if(platform === 'linux') return ['sh', 'bin', 'run'];

    return [];
}

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

	win.loadFile('./ui/index.html');

	return win;
}

function createAndTrackWindow({ startServer = false } = {}) {
	mainWindow = createWindow();
	mainWindow.setMenu(null);

	mainWindow.webContents.once('did-finish-load', () => {
		if(startServer) startLocalWSS();

		renderEngineGrid();
	});

	return mainWindow;
}

app.whenReady().then(() => {
	createAndTrackWindow({ 'startServer': true });

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
			filters: [{
				name: 'Executables',
				extensions: getExecutableExtensions()
			}]
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
