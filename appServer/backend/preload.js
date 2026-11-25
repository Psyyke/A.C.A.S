import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('aiAPI', {
	getSettings: () => ipcRenderer.invoke('getAISettings'),
	getStatus: () => ipcRenderer.invoke('getAIStatus'),
	pickFile: (kind, title) => ipcRenderer.invoke('pickAIFile', kind, title),
	start: settings => ipcRenderer.invoke('startAI', settings),
	stop: () => ipcRenderer.invoke('stopAI'),
	cancel: () => ipcRenderer.invoke('cancelAISetup'),
	onStatus: callback => ipcRenderer.on('aiStatus', (_event, status) => callback(status))
});

contextBridge.exposeInMainWorld('engineAPI', {
	killAllEngines: () => ipcRenderer.invoke('killAllEngines'),
	killEngine: (identifierObj) => ipcRenderer.invoke('killEngine', identifierObj),
    clearCache: () => ipcRenderer.invoke('clearCache'),
	getSavedEngines: () => ipcRenderer.invoke('getSavedEngines'),
	sendManualUciToEngine: (cmd, identifierObj) => ipcRenderer.invoke('sendManualUciToEngine', cmd, identifierObj),
	addEngine: (fileInfo, title) => ipcRenderer.invoke('addEngine', fileInfo, title),
	addDroppedEngine: filePath => ipcRenderer.invoke('addDroppedEngine', filePath),
	removeEngine: (enginePath) => ipcRenderer.invoke('removeEngine', enginePath),
	renameEngine: (enginePath, title) => ipcRenderer.invoke('renameEngine', enginePath, title),
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
	sendEnginesList: () => ipcRenderer.invoke('sendEnginesList'),
	getPort: () => ipcRenderer.invoke('getServerPort'),
	setPort: port => ipcRenderer.invoke('setServerPort', port)
});

contextBridge.exposeInMainWorld('fileAPI', {
	pickFile: async (title, filesLabel) => {
		const filePath = await ipcRenderer.invoke('pickFile', title, filesLabel);
		return filePath;
	},
	getPathForFile: file => webUtils.getPathForFile(file)
});

contextBridge.exposeInMainWorld('toastAPI', {
	onMessage: (callback) => ipcRenderer.on('toast', (event, data) => callback(data))
});

contextBridge.exposeInMainWorld('electronAPI', {
	getVersion: () => ipcRenderer.invoke('getAppVersion'),
	getCredits: () => ipcRenderer.invoke('getCredits'),
	openChromiumNotices: () => ipcRenderer.invoke('openChromiumNotices'),
	getAlwaysOnTop: () => ipcRenderer.invoke('getAlwaysOnTop'),
	setAlwaysOnTop: enabled => ipcRenderer.invoke('setAlwaysOnTop', enabled),
	openExternal: (url) => ipcRenderer.invoke('openExternal', url)
});
