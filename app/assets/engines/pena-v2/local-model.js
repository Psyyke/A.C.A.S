// Remembers the picked local GGUF across reloads. Only a file handle is kept, never a copy of the model.
const DB_NAME = 'acas-pena', STORE = 'handles', KEY = 'localModel';

export const canRememberLocalModel = () => typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';

function request(mode, run) {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open(DB_NAME, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(STORE);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result;
            const action = run(db.transaction(STORE, mode).objectStore(STORE));
            action.onsuccess = () => { db.close(); resolve(action.result); };
            action.onerror = () => { db.close(); reject(action.error); };
        };
    });
}

export const saveLocalModelHandle = handle => request('readwrite', store => store.put(handle, KEY));
export const forgetLocalModelHandle = () => request('readwrite', store => store.delete(KEY)).catch(() => {});
export const savedLocalModelHandle = () => request('readonly', store => store.get(KEY)).catch(() => null);

export async function pickLocalModel() {
    const [handle] = await window.showOpenFilePicker({ id: 'pena-gguf', types: [{ description: 'Inkling GGUF', accept: { 'application/octet-stream': ['.gguf'] } }] });
    return { handle, file: await handle.getFile() };
}

/** The remembered file, or null. `ask` may show the browser permission prompt and needs a click. */
export async function reopenLocalModel(handle, { ask = false } = {}) {
    if(!handle) return null;
    let permission = await handle.queryPermission?.({ mode: 'read' }) ?? 'granted';
    if(permission === 'prompt' && ask) permission = await handle.requestPermission({ mode: 'read' });
    if(permission !== 'granted') return null;
    return handle.getFile();
}
