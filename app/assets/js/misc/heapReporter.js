import { startHeapReporter } from './heapDiagnostics.js';

let stop = null;
function start() {
    if (stop) return;
    try {
        stop = startHeapReporter();
    } catch (error) {
        console.error('GUI heap reporter could not start:', error);
    }
}

window.addEventListener('pagehide', () => {
    stop?.();
    stop = null;
});
window.addEventListener('pageshow', start);
start();
