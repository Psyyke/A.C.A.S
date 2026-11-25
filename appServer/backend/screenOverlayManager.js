import { normalizeOverlay, overlayBounds } from './screenOverlayProtocol.js';

export class ScreenOverlayManager {
    constructor({ createWindow, screen, platform = process.platform, unsupported = null,
        now = Date.now, timeout = 2000, limit = 16, report = () => {} }) {
        Object.assign(this, { createWindow, screen, platform, unsupported, now, timeout, limit, report });
        this.clients = new Map();
    }

    status(client, status) {
        this.report(client, { ...status, message: status.error
            || (status.supported ? 'Screen overlay available.' : 'Screen overlay unavailable.') });
    }

    receive(client, raw) {
        if(this.unsupported) {
            this.status(client, { supported: false, error: this.unsupported });
            return;
        }
        const hiddenEntry = raw?.visible === false && typeof raw.instanceId === 'string'
            ? this.clients.get(client)?.get(raw.instanceId) : null;
        if(hiddenEntry) {
            hiddenEntry.window.hide();
            hiddenEntry.visible = false;
            hiddenEntry.updated = this.now();
        }
        let snapshot;
        try { snapshot = normalizeOverlay(raw); }
        catch(error) {
            if(error.overlayGeometry && raw?.visible === false && typeof raw.instanceId === 'string'
                && raw.instanceId.length > 0 && raw.instanceId.length <= 128) return;
            if(!hiddenEntry && typeof raw?.instanceId === 'string') this.remove(client, raw.instanceId);
            this.status(client, { supported: true, instanceId: typeof raw?.instanceId === 'string'
                ? raw.instanceId.slice(0, 128) : undefined, error: error.message });
            return;
        }
        if(!snapshot.visible) return;
        let entries = this.clients.get(client);
        let entry = entries?.get(snapshot.instanceId);
        let bounds;
        try { bounds = overlayBounds(snapshot.geometry, this.screen, this.platform, snapshot.offset); }
        catch(error) {
            if(entry) { entry.window.hide(); entry.failed = true; }
            this.status(client, { supported: true, instanceId: snapshot.instanceId, error: `Cannot position overlay: ${error.message}` });
            return;
        }
        if(!bounds) {
            if(entry) { entry.window.hide(); entry.failed = true; }
            this.status(client, { supported: true, instanceId: snapshot.instanceId, error: 'Board is outside available displays.' });
            return;
        }
        if(!entry) {
            const count = [...this.clients.values()].reduce((sum, items) => sum + items.size, 0);
            if(count >= this.limit) {
                this.status(client, { supported: true, instanceId: snapshot.instanceId, error: 'Overlay window limit reached.' });
                return;
            }
            if(!entries) this.clients.set(client, entries = new Map());
            try {
                const window = this.createWindow();
                entry = { window, client, ready: false, visible: true, snapshot, bounds, updated: this.now() };
                entries.set(snapshot.instanceId, entry);
                window.on('closed', () => {
                    if(entries.get(snapshot.instanceId) === entry) {
                        entries.delete(snapshot.instanceId);
                        if(!entries.size) this.clients.delete(client);
                    }
                });
                window.on('screen-overlay-load-error', error => {
                    if(entries.get(snapshot.instanceId) !== entry) return;
                    this.status(client, { supported: true, instanceId: snapshot.instanceId,
                        error: `Overlay renderer failed to load: ${error.message}` });
                    this.remove(client, snapshot.instanceId);
                });
                window.webContents.on('did-finish-load', () => {
                    if(entries.get(snapshot.instanceId) !== entry) return;
                    entry.ready = true;
                    this.render(entry);
                });
                window.webContents.on('render-process-gone', () => {
                    this.status(client, { supported: true, instanceId: snapshot.instanceId, error: 'Overlay renderer stopped.' });
                    this.remove(client, snapshot.instanceId);
                });
                window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
                    if(isMainFrame === false || code === -3) return;
                    this.status(client, { supported: true, instanceId: snapshot.instanceId,
                        error: `Overlay renderer failed to load: ${description}` });
                    this.remove(client, snapshot.instanceId);
                });
                this.status(client, { supported: true, instanceId: snapshot.instanceId });
            } catch(error) {
                if(!entries.size) this.clients.delete(client);
                this.status(client, { supported: true, instanceId: snapshot.instanceId, error: `Cannot create overlay: ${error.message}` });
                return;
            }
        }
        entry.snapshot = snapshot;
        entry.visible = true;
        entry.bounds = bounds;
        entry.updated = this.now();
        if(entry.failed) {
            entry.failed = false;
            this.status(client, { supported: true, instanceId: snapshot.instanceId });
        }
        this.render(entry);
    }

    render(entry) {
        if(entry.window.isDestroyed()) return;
        try {
            if(!entry.visible) entry.window.hide();
            if(!entry.ready) return;
            entry.window.setBounds(entry.bounds);
            entry.window.webContents.send('screenOverlaySnapshot', entry.snapshot);
            if(entry.visible) entry.window.showInactive();
        } catch(error) {
            try { entry.window.hide(); } catch {}
            entry.failed = true;
            this.status(entry.client, { supported: true, instanceId: entry.snapshot.instanceId,
                error: `Cannot render overlay: ${error.message}` });
        }
    }

    remove(client, id) {
        const entries = this.clients.get(client);
        const entry = entries?.get(id);
        if(!entry) return;
        entries.delete(id);
        if(!entries.size) this.clients.delete(client);
        if(!entry.window.isDestroyed()) entry.window.destroy();
    }

    disconnect(client) {
        const entries = this.clients.get(client);
        if(entries) for(const id of [...entries.keys()]) this.remove(client, id);
    }

    sweep() {
        for(const [client, entries] of this.clients)
            for(const [id, entry] of entries)
                if(this.now() - entry.updated >= this.timeout) this.remove(client, id);
    }

    close() {
        for(const client of [...this.clients.keys()]) this.disconnect(client);
    }
}
