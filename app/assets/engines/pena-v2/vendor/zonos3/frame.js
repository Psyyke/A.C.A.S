import { engine, localFetch } from './engine.js';
import { DEFAULT_ZONOS_VOICE, isZonosClipVoice } from '../../zonos-voices.js';
import { normalizeZonosText } from '../../zonos-numbers.js';

const base = 'https://huggingface.co/Zyphra/ZONOS3-Mini/resolve/2921b8821772b0bd10a04456863d21abf9d2f283/web/';
const gpuUnavailable = message => /WebGPU is not available|No WebGPU adapter found|GPU device lost|WebGPU out of memory/i.test(message);
const send = (data, transfer = []) => parent.postMessage(data, location.origin, transfer);
const session = crypto.randomUUID();
const customVoices = new Map();

async function base64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function speakerId(id, clip) {
    if(!isZonosClipVoice(id)) return id;
    if(!customVoices.has(id)) {
        const pending = (async () => {
            if(!(clip instanceof Blob)) throw new Error('The ZONOS voice audio is missing.');
            const encoded = await base64(clip);
            const response = await localFetch('/v2/speakers', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TTS-Session-ID': session },
                body: JSON.stringify({ speaker_audio_base64: encoded })
            });
            if(!response.ok) throw new Error(`Could not load the custom voice (${response.status}): ${await response.text()}`);
            const voice = await response.json();
            if(!voice.id || typeof voice.id !== 'string') throw new Error('ZONOS returned an invalid custom voice.');
            return voice.id;
        })();
        customVoices.set(id, pending);
        pending.catch(() => { if(customVoices.get(id) === pending) customVoices.delete(id); });
    }
    return customVoices.get(id);
}

engine.onFatal(message => send({ type: 'fatal', message, gpuUnavailable: gpuUnavailable(message) }));
engine.onEncoderProgress?.(progress => send({ type: 'progress', progress: { ...progress, file: 'ZONOS3' } }));

window.addEventListener('message', async event => {
    if(event.origin !== location.origin || event.source !== parent || !['prepare', 'speak'].includes(event.data?.type)) return;
    const { id, text, type, voiceId = DEFAULT_ZONOS_VOICE, clip } = event.data;
    try {
        await engine.init(progress => send({ type: 'progress', progress: { ...progress, file: 'ZONOS3' } }), { base });
        if(type === 'prepare') { send({ id }); return; }
        const selected = await speakerId(voiceId, clip);
        const response = await localFetch('/v2/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-TTS-Session-ID': session },
            body: JSON.stringify({ text: normalizeZonosText(text), language: 'en_us', laci: true, stream: false,
                speaker_mode: isZonosClipVoice(voiceId) ? 'embedding' : 'reference',
                speaker_embedding_id: selected, format: 'pcm' })
        });
        if(!response.ok) throw new Error(`ZONOS speech failed (${response.status}): ${await response.text()}`);
        const audio = await response.arrayBuffer();
        if(!audio.byteLength || audio.byteLength % 4) throw new Error('ZONOS returned invalid audio.');
        send({ id, audio, sampleRate: 44100 }, [audio]);
    } catch(error) {
        const message = error?.message || String(error);
        send({ id, error: message, gpuUnavailable: gpuUnavailable(message) });
    }
});

send({ type: 'host-ready' });
