import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import path from 'path';
import os from 'os';

import { killAllEngines, clearCache, addEngine, getSavedEngines, renderEngineGrid,
	removeEngine, sendManualUciToEngine } from './engine.js';
import { startLocalWSS, sendEnginesList } from './server.js';

export let mainWindow = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store();

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
		title: 'Advanced Chess Assistance Server (Beta)',
		width: 735,
		height: 800,
		icon: path.join(__dirname, 'app', 'favicon.ico'),
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false
		}
	});

	win.loadFile('./ui/index.html');

	return win;
}

app.whenReady().then(() => {
	mainWindow = createWindow();
	mainWindow.setMenu(null);

	ipcMain.handle('killAllEngines',
		async (event) => killAllEngines());

    ipcMain.handle('clearCache',
		async (event) => clearCache());

	ipcMain.handle('getSavedEngines',
		async (event) => getSavedEngines());

	ipcMain.handle('sendEnginesList',
		async (event) => sendEnginesList());

	ipcMain.handle('sendManualUciToEngine',
		async (event, cmd, identifierObj) => sendManualUciToEngine(cmd, identifierObj));

	ipcMain.handle('addEngine',
		async (event, fileInfo, title) => addEngine(fileInfo, title));

	ipcMain.handle('removeEngine',
		async (event, index) => removeEngine(index));
	
	ipcMain.handle('pickFile', async () => {
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

	mainWindow.webContents.once('did-finish-load', () => {
		startLocalWSS();
		renderEngineGrid();
	});

    console.log('Ready!');
});

app.on('window-all-closed', () => {
	if(process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
	if(BrowserWindow.getAllWindows().length === 0) createWindow();
});