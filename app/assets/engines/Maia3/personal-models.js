function database() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('acas-maia3-personal-models', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('models', { keyPath: 'id' });
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Personalized Maia 3 storage is blocked by another tab.'));
        request.onsuccess = () => resolve(request.result);
    });
}

async function access(mode, action) {
    const db = await database();
    try {
        return await new Promise((resolve, reject) => {
            const transaction = db.transaction('models', mode), request = action(transaction.objectStore('models'));
            transaction.oncomplete = () => resolve(request.result);
            transaction.onerror = () => reject(transaction.error || request.error);
            transaction.onabort = () => reject(transaction.error || new Error('Personalized model storage was cancelled.'));
        });
    } finally { db.close(); }
}

export async function savePersonalModel(file, elo = 1500) {
    if(!(file instanceof File) || !file.size || file.size > 128 * 1024 * 1024 || !/\.onnx$/i.test(file.name))
        throw new Error('Choose a nonempty Maia 3 ONNX file under 128 MB.');
    if(!Number.isInteger(elo) || elo < 600 || elo > 2600) throw new Error('Invalid Maia 3 base Elo.');
    const id = `maia3-${crypto.randomUUID()}`;
    await access('readwrite', store => store.put({ id, name: file.name, file, elo }));
    return id;
}

export async function getPersonalModel(id) {
    if(typeof id !== 'string' || !/^maia3-[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid personalized Maia 3 model ID.');
    const result = await access('readonly', store => store.get(id));
    if(!(result?.file instanceof Blob) || !result.file.size)
        throw new Error('Personalized Maia 3 weights are missing. Upload the ONNX file again.');
    return result;
}

export const listPersonalModels = () => access('readonly', store => store.getAll());
