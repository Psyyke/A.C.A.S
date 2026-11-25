const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screenOverlay', {
    onSnapshot: callback => ipcRenderer.on('screenOverlaySnapshot', (_event, snapshot) => callback(snapshot))
});
