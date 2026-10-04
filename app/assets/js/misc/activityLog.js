export const ACTIVITY_LOG_LIMIT = 2000;
const ACTIVITY_LOG_STORAGE_KEY = 'acas.activity-log.entries';
export const ACTIVITY_LOG_ENABLED_STORAGE_KEY = 'acas.activity-log.enabled';

export function formatLogValue(value) {
    if(value instanceof Error) return value.stack || value.message;
    if(typeof value === 'string') return value;
    if(value === undefined) return 'undefined';
    try {
        const seen = new WeakSet();
        return JSON.stringify(value, (key, item) => {
            if(typeof item === 'bigint') return String(item);
            if(item instanceof Error) return item.stack || item.message;
            if(item && typeof item === 'object') {
                if(seen.has(item)) return '[Circular]';
                seen.add(item);
            }
            return item;
        }) ?? String(value);
    } catch {
        return '[Unserializable value]';
    }
}

export function createActivityLog(limit = ACTIVITY_LOG_LIMIT, storageKey = null) {
    const capacity = Number.isInteger(limit) && limit > 0 ? limit : ACTIVITY_LOG_LIMIT;
    const persistenceKey = typeof storageKey === 'string' && storageKey ? storageKey : null;
    let entries = [];
    const listeners = new Set();
    let sequence = 0;
    let storageErrorReported = false;
    const reportPersistenceError = error => {
        if(storageErrorReported) return;
        storageErrorReported = true;
        console.error('Activity log could not access its saved history.', error);
    };
    if(persistenceKey) {
        try {
            const saved = typeof localStorage === 'undefined'
                ? null
                : localStorage.getItem(persistenceKey);
            if(saved) {
                const parsed = JSON.parse(saved);
                if(Array.isArray(parsed)) {
                    entries = parsed.filter(entry => entry
                        && Number.isSafeInteger(entry.id) && entry.id > 0
                        && Number.isFinite(entry.timestamp)
                        && typeof entry.type === 'string'
                        && typeof entry.message === 'string')
                        .slice(-capacity)
                        .map(entry => Object.freeze({
                            id: entry.id,
                            timestamp: entry.timestamp,
                            type: entry.type,
                            message: entry.type === 'session-start'
                                && entry.message === 'Activity logging started'
                                ? 'App started'
                                : entry.message.slice(0, 12000),
                            instanceID: typeof entry.instanceID === 'string' ? entry.instanceID : '',
                            profile: typeof entry.profile === 'string' ? entry.profile : '',
                            engine: typeof entry.engine === 'string' ? entry.engine : '',
                            engineId: typeof entry.engineId === 'string' ? entry.engineId : '',
                            site: typeof entry.site === 'string' ? entry.site : ''
                        }));
                    sequence = entries.reduce((latest, entry) => Math.max(latest, entry.id), 0);
                }
            }
        } catch(error) {
            reportPersistenceError(error);
        }
    }
    let persistTimer = null;
    const flushPersistence = () => {
        if(!persistenceKey) return;
        if(persistTimer !== null) {
            clearTimeout(persistTimer);
            persistTimer = null;
        }
        try {
            if(typeof localStorage === 'undefined') return;
            localStorage.setItem(persistenceKey, JSON.stringify(entries));
        } catch(error) {
            reportPersistenceError(error);
        }
    };
    const persist = () => {
        if(!persistenceKey) return;
        if(persistTimer !== null) clearTimeout(persistTimer);
        persistTimer = setTimeout(flushPersistence, 250);
    };
    if(persistenceKey && typeof window !== 'undefined') window.addEventListener('pagehide', flushPersistence);
    const notify = () => listeners.forEach(listener => {
        // Diagnostics must never interrupt engine work, even if a viewer fails.
        try { listener(); } catch { /* Keep the remaining listeners active. */ }
    });
    return {
        add(type, message, context = {}) {
            const entry = Object.freeze({
                id: ++sequence,
                timestamp: Date.now(),
                type: String(type),
                message: formatLogValue(message).slice(0, 12000),
                instanceID: context.instanceID == null ? '' : String(context.instanceID),
                profile: context.profile == null ? '' : String(context.profile),
                engine: context.engine == null ? '' : String(context.engine),
                engineId: context.engineId == null ? '' : String(context.engineId),
                site: context.site == null ? '' : String(context.site)
            });
            entries.push(entry);
            if(entries.length > capacity) entries.splice(0, entries.length - capacity);
            persist();
            notify();
            return entry;
        },
        getEntries: () => entries.slice(),
        clear() { entries.length = 0; persist(); notify(); },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
    };
}

export const activityLog = createActivityLog(ACTIVITY_LOG_LIMIT, ACTIVITY_LOG_STORAGE_KEY);
let activityLoggingEnabled = false;
let initialized = false;
let captureHooksInstalled = false;
const originalConsoleMethods = new Map();
const captureHandlers = {};
try {
    activityLoggingEnabled = localStorage.getItem(ACTIVITY_LOG_ENABLED_STORAGE_KEY) === 'true';
} catch(error) {
    console.error('Activity logging preference could not be restored.', error);
}

export const logActivity = (type, message, context) => {
    if(!activityLoggingEnabled) return null;
    return activityLog.add(type, message, context);
};

function installActivityCapture() {
    if(captureHooksInstalled) return;
    captureHooksInstalled = true;
    ['warn', 'error'].forEach(level => {
        const original = console[level];
        const wrapped = function(...args) {
            original.apply(console, args);
            if(activityLoggingEnabled) {
                if(level === 'warn' && typeof args[0] === 'string' && args[0].startsWith('Translated:')) return;
                logActivity(level === 'warn' ? 'warning' : 'error', args.map(formatLogValue).join(' '));
            }
        };
        originalConsoleMethods.set(level, { original, wrapped });
        console[level] = wrapped;
    });
    captureHandlers.error = event => {
        if(!activityLoggingEnabled) return;
        const target = event.target;
        const message = event.error || event.message || `Failed to load resource: ${target?.src || target?.href || 'unknown'}`;
        logActivity('error', message);
    };
    captureHandlers.unhandledrejection = event => {
        if(activityLoggingEnabled) logActivity('error', event.reason);
    };
    window.addEventListener('error', captureHandlers.error, true);
    window.addEventListener('unhandledrejection', captureHandlers.unhandledrejection);
}

function removeActivityCapture() {
    if(!captureHooksInstalled) return;
    captureHooksInstalled = false;
    originalConsoleMethods.forEach(({ original, wrapped }, level) => {
        if(console[level] === wrapped) console[level] = original;
    });
    originalConsoleMethods.clear();
    window.removeEventListener('error', captureHandlers.error, true);
    window.removeEventListener('unhandledrejection', captureHandlers.unhandledrejection);
}

export function isActivityLoggingEnabled() {
    return activityLoggingEnabled;
}

export function setActivityLoggingEnabled(enabled) {
    const nextEnabled = Boolean(enabled);
    if(activityLoggingEnabled === nextEnabled) return;
    if(!nextEnabled && activityLoggingEnabled) {
        logActivity('app', 'Activity logging disabled');
    }
    activityLoggingEnabled = nextEnabled;
    try {
        localStorage.setItem(ACTIVITY_LOG_ENABLED_STORAGE_KEY, String(nextEnabled));
    } catch(error) {
        console.error('Activity logging preference could not be saved.', error);
    }
    if(nextEnabled) {
        installActivityCapture();
        if(initialized) logActivity('app', 'Activity logging enabled');
    } else {
        removeActivityCapture();
    }
}

export function initializeActivityLogging() {
    if(initialized) return;
    initialized = true;
    if(!activityLoggingEnabled) return;
    installActivityCapture();
    logActivity('session-start', 'App started');
}