export const DEFAULT_ZONOS_VOICE = 'default_3c00e421e684f949';
export const normalizeZonosVoice = id => id === 'builtin-pena' ? DEFAULT_ZONOS_VOICE : id;
export const isZonosClipVoice = id => id.startsWith('custom-');

export const ZONOS_VOICES = Object.freeze([
    ['default_2c5123a959875341', 'Cillian (Irish English, masculine)'],
    ['default_b78b28baf5c31a1d', 'Imogen (British English, feminine)'],
    ['default_c95cf57259ed7313', 'Jett (English, masculine)'],
    ['default_40a3ba1017bfb68a', 'Morgana (English, feminine)'],
    ['default_3765f0d1140c05c0', 'Rupert (British English, masculine)'],
    ['default_c5e098c322aae901', 'Sakura (English, feminine)'],
    ['default_de4d191ca7574982', 'Savannah (American English, feminine)'],
    [DEFAULT_ZONOS_VOICE, 'Thaddeus (English, masculine)'],
    ['default_940eaff39a929da0', 'Willow (English, feminine)'],
    ['default_34370fd91e3484ef', 'Wyatt (American English, masculine)'],
    ['default_517319c805b927e9', 'Gaspard (French, masculine)'],
    ['default_09d206a5b067ae71', 'Liesel (German, feminine)'],
    ['default_ec650ef042ed1f14', 'Wolfgang (German, masculine)'],
    ['default_f76cf78a50cf8496', 'Ananya (Hindi, feminine)'],
    ['default_849a62ace1f85759', 'Arjun (Hindi, masculine)'],
    ['default_792987ff6236e50d', 'Ginevra (Italian, feminine)'],
    ['default_ccb71e6596453e72', 'Lorenzo (Italian, masculine)'],
    ['default_aa6e36b246dc01f9', 'Minjun (Korean, masculine)'],
    ['default_b7a257a5b1478493', 'Seoyeon (Korean, feminine)'],
    ['default_d8a9b688b64e638d', 'Haoran (Mandarin, masculine)'],
    ['default_eaee7325255d4783', 'Meilin (Mandarin, feminine)'],
    ['default_e11f53895cad62fa', 'Leonor (Portuguese, feminine)'],
    ['default_4562e98e005b69cc', 'Thiago (Portuguese, masculine)'],
    ['default_87250baa043e5bba', 'Rodrigo (Spanish, masculine)'],
    ['default_43e790fc116fd62a', 'Ximena (Spanish, feminine)'],
    ['default_26fb443b7759bce0', 'Chaitanya (Telugu, masculine)'],
    ['default_c3bb44b62cf13a5c', 'Sravya (Telugu, feminine)']
]);

const CACHE = 'acas-pena-zonos-voices-v1';
const INDEX = 'https://acas.invalid/pena/zonos-voices/index.json';
const voiceUrl = id => `https://acas.invalid/pena/zonos-voices/${encodeURIComponent(id)}`;

export async function customZonosVoices() {
    const response = await (await caches.open(CACHE)).match(INDEX);
    return response ? response.json() : [];
}

export async function saveZonosVoice(file) {
    if(!file.size || file.size > 12 * 1024 * 1024) throw new Error('Choose an audio file up to 12 MiB.');
    const decoder = new OfflineAudioContext(1, 1, 44100);
    let audio;
    try { audio = await decoder.decodeAudioData(await file.arrayBuffer()); }
    catch(error) { throw new Error(`Could not read the voice audio: ${error.message}`); }
    if(!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration > 60)
        throw new Error('Choose a voice clip up to 60 seconds long.');
    const voice = { id: `custom-${crypto.randomUUID()}`, name: file.name };
    const cache = await caches.open(CACHE);
    await cache.put(voiceUrl(voice.id), new Response(file));
    try {
        await cache.put(INDEX, Response.json([...(await customZonosVoices()), voice]));
    } catch(error) {
        await cache.delete(voiceUrl(voice.id));
        throw error;
    }
    return voice;
}

export async function readZonosVoice(id) {
    const response = await (await caches.open(CACHE)).match(voiceUrl(id));
    if(!response) throw new Error('The saved ZONOS voice is missing. Import it again or choose another voice.');
    return response.blob();
}

export async function removeZonosVoice(id) {
    const voices = await customZonosVoices();
    if(!voices.some(voice => voice.id === id)) throw new Error('The saved ZONOS voice was not found.');
    const cache = await caches.open(CACHE);
    await cache.put(INDEX, Response.json(voices.filter(voice => voice.id !== id)));
    await cache.delete(voiceUrl(id));
}
