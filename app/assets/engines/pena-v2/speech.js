import { ZonosSpeech } from './zonos.js';
import { DEFAULT_ZONOS_VOICE, isZonosClipVoice } from './zonos-voices.js';
import { recognitionRequest } from './recognition.js';
import { penaText } from './i18n.js';

export function speechPause(previous, next = '') {
    const end = String(previous || '').trimEnd();
    if(!end) return 0;
    if(/[.!?…]["”»')]*$/.test(end)) return 300;
    if(/[:;—–-]["”»')]*$/.test(end)) return 220;
    if(/["”»]$/.test(end) || /^\s*["“«]/.test(next)) return 160;
    return /,$/.test(end) ? 100 : 0;
}

export function speechSegments(text, marks = []) {
    const breaks = new Set([0, text.length, ...marks]);
    // A move number like "12." or "12..." leads into its move rather than ending a phrase.
    for(const match of text.matchAll(/(?!(?<=(?:^|\s)\d{1,3}\.*)\.)[.!?…;,]+(?:["”»')]+)?(?=\s|$)|:(?=\s|$)|[—–]|--+|\s-(?=\s)/g))
        breaks.add(match.index + match[0].length);
    let straightQuoteOpen = false;
    for(const match of text.matchAll(/["“”«»]/g)) {
        const char = match[0];
        const opening = char === '“' || char === '«' || char === '"' && !straightQuoteOpen;
        if(char === '"') straightQuoteOpen = !straightQuoteOpen;
        if(opening) breaks.add(match.index);
        else if(!/[.!?…;,:]/.test(text[match.index + 1] || '')) breaks.add(match.index + 1);
    }
    const segments = [];
    let prefix = '';
    const boundaries = [...breaks].filter(at => Number.isInteger(at) && at >= 0 && at <= text.length).sort((a, b) => a - b);
    for(let i = 0; i < boundaries.length - 1; i++) {
        const from = boundaries[i];
        const part = text.slice(from, boundaries[i + 1]);
        if(!/[^\s.,!?…;:"“”«»—–-]/.test(part)) {
            if(segments.length) segments.at(-1).text += part;
            else prefix += part;
        } else {
            segments.push({ from: prefix ? 0 : from, text: prefix + part });
            prefix = '';
        }
    }
    // A voice reading one bare word on its own stretches it out, so it rides with a neighbor.
    // A bare lead word joins what follows, and a punctuated tail like "check," joins what came before.
    for(const punctuated of [false, true]) for(let index = 0; index < segments.length && segments.length > 1; index++) {
        const segment = segments[index];
        const word = segment.text.trim();
        if(/\s/.test(word) || /^\d+\.+$/.test(word) || /[^\p{L}\p{N}'’-]$/u.test(word) !== punctuated) continue;
        const previous = segments[index - 1], next = segments[index + 1];
        if(previous && (!next || punctuated && !/[.!?…]["”»')]*\s*$/.test(previous.text))) previous.text += segment.text;
        else Object.assign(next, { from: segment.from, anchor: next.anchor ?? next.from, text: segment.text + next.text });
        segments.splice(index--, 1);
    }
    return segments;
}

export class PenaSpeech {
    constructor(onSentence, onError, onProgress = () => {}) {
        this.onSentence = onSentence;
        this.onError = onError;
        this.onProgress = onProgress;
        this.epoch = 0;
        this.queue = Promise.resolve();
        this.sources = new Set();
        this.starting = new Set();
        this.lastStart = Promise.resolve();
        this.reportedErrors = new WeakSet();
        this.preparedCustomVoices = new Set();
    }

    reportError(error) {
        if(error && typeof error === 'object') {
            if(this.reportedErrors.has(error)) return;
            this.reportedErrors.add(error);
        }
        this.onError(error);
    }

    async unlock() {
        this.context ??= new AudioContext();
        let timer;
        try {
            await Promise.race([this.context.resume(), new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(new Error(penaText('audioBlocked'))), 1500);
            })]);
        } finally { clearTimeout(timer); }
    }

    stop() {
        this.epoch++;
        if(this.browserSpeaking) window.speechSynthesis?.cancel();
        this.browserSpeaking = false;
        for(const source of this.sources) source.stop();
        this.sources.clear();
        for(const resolve of this.starting) resolve();
        this.starting.clear();
        this.lastStart = Promise.resolve();
        this.nextTime = 0;
        this.lastText = '';
        if(this.zonosBusy) this.unload();
        this.queue = Promise.resolve();
    }

    unload() {
        const hadVoice = Boolean(this.zonos);
        this.zonos?.dispose();
        this.zonos = null;
        this.zonosBusy = false;
        this.zonosReady = false;
        this.preparedCustomVoices.clear();
        this.preparing = null;
        this.preparedCustomVoices.clear();
        this.gpuFallback = false;
        if(hadVoice) this.onProgress({ status: 'idle' });
    }

    voice() {
        this.zonos ??= new ZonosSpeech(this.onProgress, error => {
            if(error.gpuUnavailable) {
                this.gpuFallback = true;
                this.onProgress({ status: 'fallback', message: error.message });
            } else if(!this.zonosBusy && !this.preparing) this.reportError(error);
            this.zonos = null;
            this.zonosBusy = false;
            this.zonosReady = false;
        });
        return this.zonos;
    }

    async prepare() {
        if(this.gpuFallback || this.zonosReady) return;
        if(this.preparing) return this.preparing;
        const zonos = this.voice();
        this.onProgress({ status: 'preparing', file: 'ZONOS3' });
        const pending = (async () => {
            try {
                await zonos.prepare();
                if(this.zonos === zonos) {
                    this.zonosReady = true;
                    this.onProgress({ status: 'ready' });
                }
            } catch(error) {
                if(error.name === 'AbortError') return;
                if(this.zonos === zonos) {
                    this.zonos = null;
                    zonos.dispose(error);
                }
                if(error.gpuUnavailable) {
                    if(!this.gpuFallback) this.onProgress({ status: 'fallback', message: error.message });
                    this.gpuFallback = true;
                } else {
                    this.onProgress({ status: 'error', message: error.message });
                    this.reportError(error);
                }
            }
        })();
        this.preparing = pending;
        try { await pending; }
        finally { if(this.preparing === pending) this.preparing = null; }
    }

    async request({ text, voiceId }) {
        this.voice();
        const zonos = this.zonos;
        this.zonosBusy = true;
        const selected = voiceId ?? DEFAULT_ZONOS_VOICE;
        const preparingClip = isZonosClipVoice(selected) && !this.preparedCustomVoices.has(selected);
        if((!this.zonosReady && !this.preparing) || preparingClip)
            this.onProgress({ status: 'preparing', file: 'ZONOS3' });
        try {
            const result = await zonos.speak(text, voiceId);
            if(preparingClip && this.zonos === zonos) this.preparedCustomVoices.add(selected);
            return result;
        }
        finally { if(this.zonos === zonos) this.zonosBusy = false; }
    }

    // Marks are { at, run } pairs. Each runs once when speech reaches that character.
    say(text, settings, onStart = () => this.onSentence(text), marks = [], { pauseBefore = 0, minimumStartDelay = () => 0 } = {}) {
        if(settings.penaSpeech === 'off') return;
        const segments = speechSegments(text, marks.map(mark => mark.at));
        if(segments.length > 1) {
            segments.forEach((segment, index) => {
                const to = segments[index + 1]?.from ?? Infinity;
                const own = marks.filter(mark => index === 0 ? mark.at < to : mark.at >= segment.from && mark.at < to)
                    .map(mark => ({ ...mark, at: Math.max(0, mark.at - (segment.anchor ?? segment.from)) }));
                this.say(segment.text, settings, index ? () => {} : onStart, own, {
                    pauseBefore: index ? 0 : pauseBefore,
                    minimumStartDelay: own.length || !marks.length && !index ? minimumStartDelay : () => 0
                });
            });
            return;
        }
        const epoch = this.epoch;
        const live = () => epoch === this.epoch && !(typeof CONCEAL_ASSISTANCE_ACTIVE !== 'undefined' && CONCEAL_ASSISTANCE_ACTIVE);
        const pending = [...marks].sort((a, b) => a.at - b.at);
        const reach = index => { while(pending.length && pending[0].at <= index) { const mark = pending.shift(); if(live()) mark.run(); } };
        const schedule = duration => {
            for(const mark of [...pending]) setTimeout(() => reach(mark.at), duration * mark.at / Math.max(1, text.length));
        };
        this.queue = this.queue.then(async () => {
            if(epoch !== this.epoch || this.failedEpoch === epoch
                || (typeof CONCEAL_ASSISTANCE_ACTIVE !== 'undefined' && CONCEAL_ASSISTANCE_ACTIVE)) return;
            const speakBrowser = async () => {
                if(!window.speechSynthesis) throw new Error(penaText('browserSpeechUnavailable'));
                const voices = window.speechSynthesis.getVoices();
                const selected = settings.penaBrowserVoice;
                let voice;
                if(selected && selected !== 'auto') {
                    voice = voices.find(item => item.voiceURI === selected);
                    if(!voice) throw new Error(penaText('browserVoiceUnavailable'));
                } else {
                    voice = voices.find(item => item.voiceURI && item.voiceURI === this.browserVoiceId)
                        || voices.find(item => item.lang?.toLowerCase().split(/[-_]/)[0] === settings.languageCode);
                    this.browserVoiceId = voice?.voiceURI;
                }
                if(!voice) throw new Error(penaText('browserVoiceMissing', { language: settings.languageName }));
                await this.lastStart;
                const remaining = this.context ? Math.max(0, ((this.nextTime || 0) - this.context.currentTime) * 1000) : 0;
                const pause = Math.max(pauseBefore, minimumStartDelay(), remaining + speechPause(this.lastText, text));
                if(pause) await new Promise(resolve => setTimeout(resolve, pause));
                if(!live()) return;
                await new Promise((resolve, reject) => {
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.voice = voice;
                    utterance.lang = voice.lang;
                    utterance.rate = Number(settings.penaSpeechRate);
                    utterance.onstart = () => {
                        if(epoch !== this.epoch) return;
                        this.lastText = text;
                        onStart();
                        reach(0);
                        // Some voices never report word boundaries, so an estimate backs them up.
                        schedule(text.length / (14 * (Number(settings.penaSpeechRate) || 1)) * 1000);
                    };
                    utterance.onboundary = event => { if(epoch === this.epoch) reach(event.charIndex + (event.charLength || 1) - 1); };
                    utterance.onend = () => { if(epoch === this.epoch) { this.browserSpeaking = false; reach(Infinity); } resolve(); };
                    utterance.onerror = event => {
                        if(epoch === this.epoch) this.browserSpeaking = false;
                        if(epoch !== this.epoch) resolve();
                        else reject(new Error(`Speech failed: ${event.error}.`));
                    };
                    this.browserSpeaking = true;
                    window.speechSynthesis.speak(utterance);
                });
            };
            if(settings.penaSpeech === 'browser' || this.gpuFallback) {
                await speakBrowser();
                return;
            }
            let result;
            try { result = await this.request({ text, voiceId: settings.penaZonosVoice }); }
            catch(error) {
                if(epoch !== this.epoch) return;
                this.zonos?.dispose(error);
                this.zonos = null;
                this.zonosReady = false;
                this.preparedCustomVoices.clear();
                if(!error.gpuUnavailable) throw error;
                if(!this.gpuFallback) this.onProgress({ status: 'fallback', message: error.message });
                this.gpuFallback = true;
                await speakBrowser();
                return;
            }
            if(epoch !== this.epoch || (typeof CONCEAL_ASSISTANCE_ACTIVE !== 'undefined' && CONCEAL_ASSISTANCE_ACTIVE)) return;
            this.zonosReady = true;
            this.onProgress({ status: 'ready' });
            await this.unlock();
            if(epoch !== this.epoch) return;
            await this.lastStart;
            if(!live()) return;
            const buffer = this.context.createBuffer(1, result.audio.length, result.sampleRate * Number(settings.penaSpeechRate));
            buffer.copyToChannel(result.audio, 0);
            const source = this.context.createBufferSource();
            source.buffer = buffer;
            source.connect(this.context.destination);
            const gap = speechPause(this.lastText, text) / 1000;
            this.lastText = text;
            const start = Math.max(Math.max(this.context.currentTime + 0.02, this.nextTime || 0) + pauseBefore / 1000,
                (this.nextTime || 0) + gap, this.context.currentTime + minimumStartDelay() / 1000);
            this.nextTime = start + buffer.duration;
            this.sources.add(source);
            source.onended = () => this.sources.delete(source);
            const delay = (start - this.context.currentTime) * 1000;
            let started;
            this.lastStart = new Promise(resolve => { started = resolve; this.starting.add(resolve); });
            setTimeout(() => {
                try {
                    if(!live()) return;
                    onStart();
                    reach(Infinity);
                } catch(error) {
                    this.failedEpoch = epoch;
                    this.reportError(error);
                } finally {
                    this.starting.delete(started);
                    started();
                }
            }, delay);
            source.start(start);
            // Bound look-ahead to one sentence instead of accumulating an entire spoken essay.
            await new Promise(resolve => setTimeout(resolve, Math.max(0, (this.nextTime - this.context.currentTime - 1) * 1000)));
        }).catch(error => {
            if(epoch === this.epoch) {
                this.failedEpoch = epoch;
                this.reportError(error);
            }
        });
    }

    async dispose() {
        this.stop();
        this.unload();
        return this.context?.close();
    }
}

export class PenaMicrophone {
    constructor() {
        this.active = false;
        this.epoch = 0;
    }

    // Capture sample counts drive a dedicated classifier worker, even with a hidden DOM.
    async startContinuous({ onSpeech = () => {}, onPreview, onUtterance, onError, pauseMs = 2500 } = {}) {
        this.cancel();
        const epoch = this.epoch;
        if(!navigator.mediaDevices?.getUserMedia) throw new Error(penaText('microphoneSecure'));
        if(typeof AudioContext === 'undefined' || typeof AudioWorkletNode === 'undefined')
            throw new Error(penaText('microphoneUnsupported'));
        if(typeof onUtterance !== 'function') throw new TypeError('An onUtterance callback is required.');
        this.cancelled = false;
        const session = { epoch };
        this.continuous = session;
        const live = () => this.continuous === session && this.epoch === epoch;
        const report = error => { if(live()) onError?.(error); };
        const invoke = (callback, value) => {
            if(!live()) return;
            try { Promise.resolve(callback(value)).catch(report); }
            catch(error) { report(error); }
        };
        const fail = error => {
            if(!live()) return;
            this.cancel();
            onError?.(new Error(penaText('microphoneStopped'), { cause: error }));
        };
        try {
            // Resume inside the initiating gesture, before permission/module awaits.
            session.context = new AudioContext();
            const resumed = session.context.resume();
            resumed.catch(() => {});
            session.stream = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false
            });
            if(!live()) { this.releaseContinuous(session); return; }
            for(const track of session.stream.getTracks()) track.onended = () =>
                fail(new Error('Microphone capture ended.'));
            await session.context.audioWorklet.addModule(new URL('./microphone-worklet.js', import.meta.url));
            if(!live()) return;
            await resumed;
            if(!live()) return;
            session.node = new AudioWorkletNode(session.context, 'pena-microphone', {
                numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
                channelCount: 1, channelCountMode: 'explicit'
            });
            session.worker = new Worker(new URL('./vendor/vad-worker.js', import.meta.url), { type: 'module' });
            await new Promise((resolve, reject) => {
                session.ready = resolve;
                session.worker.onmessage = ({ data }) => {
                    if(!live()) return;
                    if(data.type === 'ready') { session.ready = null; resolve(); }
                    else if(data.type === 'error') {
                        const error = new Error(data.message);
                        if(session.ready) reject(error);
                        else fail(error);
                    } else if(data.type === 'speech') invoke(onSpeech);
                    else if(data.type === 'preview' && onPreview) invoke(onPreview, data);
                    else if(data.type === 'utterance') invoke(onUtterance, data);
                };
                session.worker.onerror = event => {
                    const error = new Error(event.message || 'Microphone speech detector failed.');
                    if(session.ready) reject(error);
                    else fail(error);
                };
                session.worker.postMessage({
                    type: 'start', port: session.node.port, previews: typeof onPreview === 'function', pauseMs
                }, [session.node.port]);
            });
            if(!live()) return;
            session.node.onprocessorerror = () => fail(new Error('Microphone audio processing failed.'));
            session.context.onstatechange = () => {
                if(live() && session.context.state === 'closed') fail(new Error('Microphone audio context closed.'));
            };
            session.source = session.context.createMediaStreamSource(session.stream);
            session.source.connect(session.node);
            session.node.connect(session.context.destination);
            this.active = true;
        } catch(error) {
            const current = live();
            if(current) { this.cancel(); throw error; }
            this.releaseContinuous(session);
        }
    }

    releaseContinuous(session) {
        if(!session) return;
        session.ready?.();
        session.ready = null;
        if(session.worker) {
            session.worker.onmessage = session.worker.onerror = null;
            session.worker.terminate();
            session.worker = null;
        }
        if(session.node) {
            session.node.port.onmessage = null;
            session.node.onprocessorerror = null;
            session.node.port.close();
            session.node.disconnect();
            session.node = null;
        }
        session.source?.disconnect();
        session.source = null;
        session.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
        session.stream = null;
        if(session.context) {
            session.context.onstatechange = null;
            if(session.context.state !== 'closed') session.context.close()
                .catch(error => console.error('[Pena microphone] Could not close audio context.', error));
            session.context = null;
        }
    }

    async start() {
        this.cancel();
        const epoch = this.epoch;
        if(!navigator.mediaDevices?.getUserMedia) throw new Error(penaText('microphoneSecure'));
        if(typeof MediaRecorder === 'undefined') throw new Error(penaText('microphoneUnsupported'));
        this.cancelled = false;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
        if(epoch !== this.epoch) { stream.getTracks().forEach(track => track.stop()); return; }
        this.stream = stream;
        const chunks = this.chunks = [];
        try {
            const recorder = this.recorder = new MediaRecorder(stream);
            recorder.ondataavailable = event => { if(event.data.size) chunks.push(event.data); };
            this.active = true;
            recorder.start();
            const timeout = this.timeout = setTimeout(() => { if(recorder.state === 'recording') recorder.stop(); }, 20000);
            this.stopped = new Promise((resolve, reject) => {
                recorder.onstop = () => {
                    if(epoch === this.epoch) this.active = false;
                    clearTimeout(timeout);
                    stream.getTracks().forEach(track => track.stop());
                    resolve(new Blob(chunks, { type: recorder.mimeType }));
                };
                recorder.onerror = event => {
                    if(epoch === this.epoch) this.cancel();
                    reject(new Error(`Microphone recording failed: ${event.error?.message || 'unknown error'}.`));
                };
            });
        } catch(error) {
            this.cancel();
            throw error;
        }
    }

    async finish(options) {
        const epoch = this.epoch;
        if(this.recorder?.state === 'recording') this.recorder.stop();
        const blob = await this.stopped;
        options.signal?.throwIfAborted();
        if(epoch !== this.epoch || this.cancelled || !blob?.size) throw new DOMException('Recording cancelled.', 'AbortError');
        const context = new AudioContext();
        let decoded;
        try { decoded = await context.decodeAudioData(await blob.arrayBuffer()); }
        finally { await context.close(); }
        if(epoch !== this.epoch) throw new DOMException('Recording cancelled.', 'AbortError');
        // Chrome can hold the 20 second timer while the tab is hidden, so trim instead of failing.
        const offline = new OfflineAudioContext(1, Math.ceil(Math.min(decoded.duration, 20) * 16000), 16000);
        const source = offline.createBufferSource();
        source.buffer = decoded;
        source.connect(offline.destination);
        source.start();
        const audio = new Float32Array((await offline.startRendering()).getChannelData(0));
        if(epoch !== this.epoch) throw new DOMException('Recording cancelled.', 'AbortError');
        return recognitionRequest({ type: 'transcribe', audio }, options);
    }

    cancel() {
        this.epoch++;
        this.cancelled = true;
        this.releaseContinuous(this.continuous);
        this.continuous = null;
        clearTimeout(this.timeout);
        if(this.recorder?.state === 'recording') this.recorder.stop();
        this.stream?.getTracks().forEach(track => track.stop());
        this.recorder = this.stream = null;
        this.active = false;
    }
}
