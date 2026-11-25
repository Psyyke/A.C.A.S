// A player's own LoRA adapter, kept in this browser's private storage so it loads
// again on the next visit. The page saves it and the model worker reads it.
const DIRECTORY = 'pena-lora';
const FILE = 'custom.gguf';

const directory = async create => (await navigator.storage.getDirectory()).getDirectoryHandle(DIRECTORY, { create });

/** True when the file is a GGUF whose metadata marks it as an adapter, the same test the runtime uses. */
export async function isLoraAdapter(blob) {
    const header = new Uint8Array(await blob.slice(0, 128 * 1024).arrayBuffer());
    const ascii = text => new TextEncoder().encode(text);
    if(String.fromCharCode(...header.slice(0, 4)) !== 'GGUF') return false;
    const key = ascii('general.type'), value = ascii('adapter');
    outer: for(let i = 0; i <= header.length - key.length - 12 - value.length; i++) {
        for(let j = 0; j < key.length; j++) if(header[i + j] !== key[j]) continue outer;
        const view = new DataView(header.buffer, i + key.length);
        if(view.getUint32(0, true) !== 8 || view.getBigUint64(4, true) !== BigInt(value.length)) continue;
        return value.every((byte, k) => header[i + key.length + 12 + k] === byte);
    }
    return false;
}

export async function saveCustomLora(file) {
    if(!/\.gguf$/i.test(file?.name || '')) throw new Error('Choose a LoRA adapter .gguf file.');
    if(!await isLoraAdapter(file)) throw new Error('This GGUF is not a LoRA adapter.');
    const handle = await (await directory(true)).getFileHandle(FILE, { create: true });
    const writable = await handle.createWritable();
    await file.stream().pipeTo(writable);
    return file.name;
}

export async function readCustomLora() {
    try { return await (await (await directory(false)).getFileHandle(FILE)).getFile(); }
    catch { return null; }
}

export async function removeCustomLora() {
    try { await (await directory(false)).removeEntry(FILE); }
    catch(error) { if(error?.name !== 'NotFoundError') throw error; }
}
