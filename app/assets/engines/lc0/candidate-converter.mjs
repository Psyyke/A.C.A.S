export function candidateConverterSource(weightHash) {
    if(!/^[a-f0-9]{64}$/.test(weightHash))
        throw new Error('Candidate converter requires the expected source-weight SHA-256.');
    return `
        import './original-converter-worker.js';
        const original = self.onmessage;
        self.onmessage = async event => {
            if(event.data.dataType !== 'f16-mixed') return original(event);
            try {
                if(!(event.data.weights instanceof ArrayBuffer)) return original(event);
                const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', event.data.weights));
                const hash = Array.from(digest, value => value.toString(16).padStart(2, '0')).join('');
                if(hash !== ${JSON.stringify(weightHash)}) return original(event);
                const response = await fetch('/candidate-onnx');
                if(!response.ok) throw new Error('Candidate model HTTP ' + response.status);
                const output = await response.arrayBuffer();
                const weights = event.data.returnWeights ? event.data.weights : undefined;
                self.postMessage({ type: 'converted', output, ...(weights ? { weights } : {}) },
                    weights ? [output, weights] : [output]);
            } catch(error) {
                self.postMessage({ type: 'error', message: error.message });
            }
        };
    `;
}
