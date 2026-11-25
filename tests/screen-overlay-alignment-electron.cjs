const { app } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const http = require('http');

app.setPath('userData', process.argv[2]);
const controlPort = Number(process.argv[3]);
const wsPort = Number(process.argv[4]);
app.whenReady().then(async () => {
    const { default: Store } = await import(pathToFileURL(path.resolve('appServer', 'node_modules', 'electron-store', 'index.js')));
    new Store().set('serverPort', wsPort);
    const main = await import(pathToFileURL(path.resolve('appServer', 'backend', 'main.js')));
    const server = await import(pathToFileURL(path.resolve('appServer', 'backend', 'server.js')));
    const { screenOverlays } = await import(pathToFileURL(path.resolve('appServer', 'backend', 'screenOverlay.js')));
    const control = http.createServer((req, res) => {
        if(req.url === '/quit') {
            res.end('bye');
            control.close();
            app.quit();
            return;
        }
        if(main.mainWindow && !main.mainWindow.isDestroyed()) main.mainWindow.hide();
        const entries = [...screenOverlays.clients.values()].flatMap(items => [...items.values()]);
        res.setHeader('Content-Type', 'application/json');
        const ready = main.mainWindow && !main.mainWindow.webContents.isLoading()
            && server.startLocalWSS().httpServer.listening;
        res.end(JSON.stringify({ ready, wsPort, windows: entries.map(({ window: win }) => ({
            bounds: win.getBounds(), visible: win.isVisible(),
            handle: win.getNativeWindowHandle().readBigUInt64LE().toString()
        })) }));
    });
    control.listen(controlPort, '127.0.0.1');
}).catch(error => { console.error(error); app.exit(1); });
