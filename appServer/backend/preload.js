import { contextBridge, ipcRenderer, shell } from 'electron';

contextBridge.exposeInMainWorld('engineAPI', {
	killAllEngines: () => ipcRenderer.invoke('killAllEngines'),
	getSavedEngines: () => ipcRenderer.invoke('getSavedEngines'),
	sendManualUciToEngine: (cmd, identifierObj) => ipcRenderer.invoke('sendManualUciToEngine', cmd, identifierObj),
	addEngine: (fileInfo, title) => ipcRenderer.invoke('addEngine', fileInfo, title),
	removeEngine: (index) => ipcRenderer.invoke('removeEngine', index),
	onRenderEngineGrid: (callback) => ipcRenderer.on('renderEngineGrid', (event, data) => callback(data)),
	onAddConsoleView: (callback) => ipcRenderer.on('addConsoleView', (event, data) => callback(data)),
	onRemoveConsoleView: (callback) => ipcRenderer.on('removeConsoleView', (event, data) => callback(data)),
	onRefreshEngineCards: (callback) => ipcRenderer.on('refreshEngineCards', (event, data) => callback(data)),
	onLog: (callback) => ipcRenderer.on('log', (event, data) => callback(data))
});

contextBridge.exposeInMainWorld('serverAPI', {
	onListening: (callback) => ipcRenderer.on('serverListening', (event, data) => callback(data)),
	onClientChange: (callback) => ipcRenderer.on('serverClientChange', (event, data) => callback(data)),
	onUnauthorized: (callback) => ipcRenderer.on('serverUnauthorized', (event, data) => callback(data)),
	sendEnginesList: () => ipcRenderer.invoke('sendEnginesList')
});

contextBridge.exposeInMainWorld('fileAPI', {
	pickFile: async () => {
		const filePath = await ipcRenderer.invoke('pickFile');
		return filePath;
	}
});

contextBridge.exposeInMainWorld('toastAPI', {
	onMessage: (callback) => ipcRenderer.on('toast', (event, data) => callback(data))
});

contextBridge.exposeInMainWorld('electronAPI', {
	openExternal: (url) => shell.openExternal(url)
});