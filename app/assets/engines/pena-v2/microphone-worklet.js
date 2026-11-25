class PenaMicrophoneProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.frame = new Float32Array(512);
        this.offset = 0;
        this.weight = 0;
        this.sum = 0;
        this.ratio = sampleRate / 16000;
    }

    process(inputs, outputs) {
        for(const channels of outputs) for(const channel of channels) channel.fill(0);
        const channels = inputs[0];
        if(!channels?.length) return true;
        for(let i = 0; i < channels[0].length; i++) {
            let mono = 0;
            for(const channel of channels) mono += channel[i] / channels.length;
            // Integrate native samples into 16 kHz bins without a DOM resampler/timer.
            let remaining = 1;
            while(remaining > 1e-8) {
                const take = Math.min(remaining, this.ratio - this.weight);
                this.sum += mono * take;
                this.weight += take;
                remaining -= take;
                if(this.weight + 1e-8 >= this.ratio) {
                    this.frame[this.offset++] = this.sum / this.ratio;
                    this.weight = this.sum = 0;
                    if(this.offset === this.frame.length) {
                        this.port.postMessage({ audio: this.frame, sampleRate: 16000 }, [this.frame.buffer]);
                        this.frame = new Float32Array(512);
                        this.offset = 0;
                    }
                }
            }
        }
        return true;
    }
}

registerProcessor('pena-microphone', PenaMicrophoneProcessor);
