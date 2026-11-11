const DATABASE_NAME = 'A.C.A.S-lc0-weights';
const STORE_NAME = 'weights';
let databasePromise;

function openDatabase() {
    if(!databasePromise) {
        databasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DATABASE_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
            request.onsuccess = () => {
                const database = request.result;
                database.onversionchange = () => {
                    database.close();
                    databasePromise = null;
                };
                resolve(database);
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Lc0 weights storage is blocked by another tab.'));
        }).catch(error => {
            databasePromise = null;
            throw error;
        });
    }
    return databasePromise;
}

async function accessWeights(action, id, file) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, action === 'get' ? 'readonly' : 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = action === 'get' ? store.get(id)
            : action === 'put' ? store.put(file, id) : store.delete(id);
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error || request.error);
        transaction.onabort = () => reject(transaction.error || new Error('Lc0 weights storage was cancelled.'));
    });
}

export async function saveLc0Weights(file) {
    if(!(file instanceof File) || !file.size) throw new Error('Select a nonempty Lc0 weights file.');
    const id = `lc0-${crypto.randomUUID()}`;
    await accessWeights('put', id, file);
    return id;
}

export async function getLc0Weights(id, signal) {
    if(id == null || id === '') {
        const response = await fetch(new URL('../../lc0-nets/maia-1500.pb', import.meta.url), { signal });
        if(!response.ok) throw new Error(`Could not load default Maia 1500 weights: HTTP ${response.status}.`);
        const weights = await response.arrayBuffer();
        if(!weights.byteLength) throw new Error('Default Maia 1500 weights are empty.');
        return new File([weights], 'maia-1500.pb');
    }
    if(typeof id !== 'string') throw new Error('Invalid Lc0 weights selection.');
    const file = await accessWeights('get', id);
    if(!(file instanceof Blob) || !file.size)
        throw new Error('Saved Lc0 weights are unavailable. Choose the file again in Lc0 Weights.');
    return file;
}

export async function removeLc0Weights(id) {
    await accessWeights('delete', id);
}
