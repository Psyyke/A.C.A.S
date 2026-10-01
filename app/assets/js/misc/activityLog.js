export const ACTIVITY_LOG_LIMIT = 2000;

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

export function createActivityLog(limit = ACTIVITY_LOG_LIMIT) {
    const capacity = Number.isInteger(limit) && limit > 0 ? limit : ACTIVITY_LOG_LIMIT;
    const entries = [];
    const listeners = new Set();
    let sequence = 0;
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
            notify();
            return entry;
        },
        getEntries: () => entries.slice(),
        clear() { entries.length = 0; notify(); },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
    };
}

export const activityLog = createActivityLog();
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
    logActivity('app', 'Activity logging started. Logs stay in this page session only.');
}