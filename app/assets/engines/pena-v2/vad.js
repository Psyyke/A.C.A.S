import { VAD_MODEL, cacheFile, openAssetCache } from './assets.js';

export const VAD_RATE = 16000;
export const VAD_FRAME = 512;

export function recognizedSpeech(text) {
    const words = String(text || '').replace(/\[[^\]]*\]|\([^)]*\)|<\|[^|]*\|>/g, ' ').trim();
    if(/^(?:music|applause|laughter|laughing|silence|noise|static|inaudible|unintelligible|blank[_ ]audio)[.!?\s]*$/i.test(words)) return '';
    return /\b[a-z]{2,}(?:['-][a-z]+)*\b|\b[a-h][1-8]\b/i.test(words) ? words : '';
}

export async function prepareSpeechDetector(runtime, { signal, onProgress = () => {} } = {}) {
    const cache = await openAssetCache();
    if(!await cache.match(VAD_MODEL.url)) await cacheFile(VAD_MODEL.url, null, { signal, onProgress });
    signal?.throwIfAborted();
    const bytes = await (await cache.match(VAD_MODEL.url)).arrayBuffer();
    const session = await runtime.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    if(signal?.aborted) {
        await session.release();
        signal.throwIfAborted();
    }
    return new SpeechDetector(runtime, session);
}

export class SpeechDetector {
    constructor(runtime, session) {
        this.runtime = runtime;
        this.session = session;
        this.reset();
    }

    reset() {
        this.state = new Float32Array(256);
        this.context = new Float32Array(64);
    }

    async probability(frame) {
        const { Tensor } = this.runtime;
        const input = new Float32Array(64 + VAD_FRAME);
        input.set(this.context);
        input.set(frame, 64);
        const result = await this.session.run({
            input: new Tensor('float32', input, [1, input.length]),
            state: new Tensor('float32', this.state, [2, 1, 128]),
            sr: new Tensor('int64', BigInt64Array.of(16000n), [])
        });
        this.state = result.stateN.data;
        this.context.set(input.subarray(input.length - 64));
        return result.output.data[0];
    }

    async speechAudio(audio, signal) {
        this.reset();
        const utterances = [];
        const segments = new SpeechSegments(message => {
            if(message.type === 'utterance') utterances.push(message.audio);
        });
        for(let offset = 0; offset < audio.length; offset += VAD_FRAME) {
            signal?.throwIfAborted();
            const frame = new Float32Array(VAD_FRAME);
            frame.set(audio.subarray(offset, offset + VAD_FRAME));
            segments.accept(frame, await this.probability(frame));
        }
        segments.finish();
        const speech = new Float32Array(utterances.reduce((length, part) => length + part.length, 0));
        let offset = 0;
        for(const part of utterances) { speech.set(part, offset); offset += part.length; }
        return speech;
    }
}

// All durations use captured samples, never a foreground-tab clock.
export class SpeechSegments {
    constructor(emit, previews = false, { pauseMs = 2500 } = {}) {
        if(!Number.isFinite(pauseMs) || pauseMs < 500 || pauseMs > 10000) throw new Error('Invalid Pena speech pause.');
        this.pauseSamples = Math.ceil(pauseMs * VAD_RATE / 1000);
        this.emit = emit;
        this.previews = previews;
        this.preRoll = [];
        this.frames = [];
        this.window = [];
        this.samples = 0;
        this.utteranceId = 0;
        this.reset();
    }

    reset() {
        this.frames = [];
        this.window = [];
        this.positives = 0;
        this.quiet = 0;
        this.lastVoice = 0;
        this.speaking = false;
        this.lastPreview = 0;
    }

    copy(frames, length = frames.length * VAD_FRAME) {
        const audio = new Float32Array(length);
        let offset = 0;
        for(const { frame } of frames) {
            const count = Math.min(frame.length, length - offset);
            if(count <= 0) break;
            audio.set(frame.subarray(0, count), offset);
            offset += count;
        }
        return audio;
    }

    accept(frame, probability) {
        this.samples += frame.length;
        const record = { frame, positive: probability >= 0.6 };
        if(!this.frames.length) {
            this.preRoll.push(record);
            if(this.preRoll.length > 6) this.preRoll.shift();
            if(!record.positive) return;
            this.frames = this.preRoll;
            this.preRoll = [];
            this.positives = this.frames.filter(item => item.positive).length;
            this.window = [...this.frames];
        } else {
            this.frames.push(record);
            this.window.push(record);
            if(record.positive) this.positives++;
        }
        // A brief classifier spike cannot accumulate indefinitely into an utterance.
        if(!this.speaking && this.frames.length > 20) {
            if(this.frames.shift().positive) this.positives--;
        }
        if(this.window.length > 78) this.window.shift();
        if(probability >= 0.35) {
            this.quiet = 0;
            this.lastVoice = this.frames.length * VAD_FRAME;
        } else this.quiet += VAD_FRAME;
        if(!this.speaking && this.positives >= 8 && this.positives > this.frames.length / 2) {
            this.speaking = true;
            this.utteranceId++;
            this.emit({ type: 'speech', utteranceId: this.utteranceId });
        }
        if(this.speaking && this.previews
            && this.frames.length >= 16 && this.samples - this.lastPreview >= 15 * VAD_FRAME) {
            this.lastPreview = this.samples;
            this.emit({
                type: 'preview', audio: this.copy(this.window), sampleRate: VAD_RATE,
                utteranceId: this.utteranceId, endSample: this.samples
            });
        }
        if(this.quiet >= (this.speaking ? this.pauseSamples : 5 * VAD_FRAME)) this.finish();
    }

    finish() {
        if(this.speaking) {
            const length = Math.min(this.frames.length * VAD_FRAME, this.lastVoice + 5 * VAD_FRAME);
            this.emit({
                type: 'utterance', audio: this.copy(this.frames, length), sampleRate: VAD_RATE,
                utteranceId: this.utteranceId,
                endSample: this.samples - this.frames.length * VAD_FRAME + length
            });
        }
        this.preRoll = this.frames.slice(-6);
        this.reset();
    }
}
