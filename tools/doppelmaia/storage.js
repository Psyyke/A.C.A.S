// Bump when preparation or validation changes make cached positions incompatible.
const CACHE_VERSION = 2;
const KEY = 'prepared-games';

function database() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('acas-doppelmaia-prepared-games', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('datasets');
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Saved games storage is blocked by another tab.'));
        request.onsuccess = () => resolve(request.result);
    });
}

async function access(mode, action) {
    const db = await database();
    try {
        return await new Promise((resolve, reject) => {
            const transaction = db.transaction('datasets', mode);
            const request = action(transaction.objectStore('datasets'));
            transaction.oncomplete = () => resolve(request.result);
            transaction.onerror = () => reject(transaction.error || request.error);
            transaction.onabort = () => reject(transaction.error || new Error('Saved games storage was cancelled.'));
        });
    } finally { db.close(); }
}

export async function savePreparedGames(dataset) {
    const record = { version: CACHE_VERSION, savedAt: Date.now(), dataset };
    await access('readwrite', store => store.put(record, KEY));
    return record;
}

export async function loadPreparedGames() {
    const record = await access('readonly', store => store.get(KEY));
    if(record === undefined) return undefined;
    if(record.version !== CACHE_VERSION || record.dataset?.version !== 1)
        throw new Error('Saved games need processing again after an update. Clear them and import your files again.');
    const dataset = record.dataset;
    if(typeof dataset.player !== 'string' || !dataset.player || !Number.isFinite(record.savedAt)
        || !['train', 'validation'].every(key => Array.isArray(dataset[key]?.gameIds)
            && dataset[key].gameIds.length > 0 && Array.isArray(dataset[key].samples) && dataset[key].samples.length > 0))
        throw new Error('Saved games are incomplete. Clear them and import your files again.');
    // Only this app's successfully prepared or fully validated imports enter this cache.
    return record;
}

export const clearPreparedGames = () => access('readwrite', store => store.delete(KEY));
