import { app, BrowserWindow, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { ScreenOverlayManager } from './screenOverlayManager.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const overlayPage = path.resolve(root, '..', 'ui', 'screenOverlay.html');
const ozone = app.commandLine.getSwitchValue('ozone-platform');
const ozoneHint = app.commandLine.getSwitchValue('ozone-platform-hint');
const nativeWayland = process.platform === 'linux' && (ozone === 'wayland'
    || (ozone !== 'x11' && ozoneHint !== 'x11' && process.env.XDG_SESSION_TYPE === 'wayland'));

function createOverlayWindow() {
    const win = new BrowserWindow({
        show: false, frame: false, transparent: true, focusable: false, skipTaskbar: true,
        resizable: false, hasShadow: false, backgroundColor: '#00000000',
        webPreferences: {
            preload: path.join(root, 'screenOverlayPreload.cjs'),
            contextIsolation: true, nodeIntegration: false, sandbox: true
        }
    });
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => {
        try {
            if(path.resolve(fileURLToPath(url)) === overlayPage) return;
        } catch {}
        event.preventDefault();
    });
    win.loadFile(overlayPage).catch(error => {
        if(!win.isDestroyed()) win.emit('screen-overlay-load-error', error);
    });
    return win;
}

export const screenOverlays = new ScreenOverlayManager({
    createWindow: createOverlayWindow, screen,
    unsupported: nativeWayland ? 'Screen overlay is unavailable on native Wayland. Run Electron under X11/XWayland.' : null,
    report: (ws, msg) => {
        if(ws.readyState === 1) {
            try { ws.send(JSON.stringify({ type: 'screenOverlayStatus', msg })); } catch {}
        }
    }
});

export function reportOverlayCapabilities(ws) {
    screenOverlays.status(ws, { supported: !screenOverlays.unsupported,
        offsets: true,
        ...(screenOverlays.unsupported ? { error: screenOverlays.unsupported } : {}) });
}
