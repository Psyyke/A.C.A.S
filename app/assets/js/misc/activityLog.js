export const ACTIVITY_LOG_LIMIT = 2000;
const ACTIVITY_LOG_STORAGE_KEY = 'acas.activity-log.entries';

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
                            profile: typeof entry.profile === 'string' ? entry.profile : ''
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
                profile: context.profile == null ? '' : String(context.profile)
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
export const logActivity = (type, message, context) => activityLog.add(type, message, context);
let initialized = false;

export function initializeActivityLogging() {
    if(initialized) return;
    initialized = true;
    ['warn', 'error'].forEach(level => {
        const original = console[level];
        console[level] = function(...args) {
            original.apply(console, args);
            logActivity(level === 'warn' ? 'warning' : 'error', args.map(formatLogValue).join(' '));
        };
    });
    window.addEventListener('error', event => {
        const target = event.target;
        const message = event.error || event.message || `Failed to load resource: ${target?.src || target?.href || 'unknown'}`;
        logActivity('error', message);
    }, true);
    window.addEventListener('unhandledrejection', event => logActivity('error', event.reason));
    logActivity('session-start', 'App started');
}