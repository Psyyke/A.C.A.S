import { createHeapCollector, readHeap } from '../assets/js/misc/heapDiagnostics.js';

const listeners = new Set();
let latest = null;
let timer = null;
let collector = null;

function publish() {
    const header = document.getElementById('heap-subheader');
    if (header) {
        const format = bytes => bytes === null ? 'Unavailable' : (bytes / 1048576).toFixed(1) + ' MiB';
        const values = [`Dev heap: ${format(latest.heapUsedBytes)}`];
        if (latest.gui.tabs.length) {
            for (const tab of latest.gui.tabs) values.push(`GUI ${tab.tabId.slice(0, 8)}: ${format(tab.heapUsedBytes)}`);
        } else {
            const labels = { waiting: 'Waiting...', unsupported: 'Channel unavailable', error: 'Channel error', 'no-reply': 'No reply' };
            values.push(`GUI heap: ${labels[latest.gui.status] || 'Unavailable'}`);
        }
        header.textContent = values.join(' / ');
    }
    for (const listener of listeners) listener(latest);
}

function sample() {
    const current = { ...readHeap(), gui: { status: 'waiting', tabs: [] } };
    latest = current;
    collector.request(gui => {
        current.gui = gui;
        publish();
    });
}

export function startHeapMonitor() {
    if (collector) return;
    collector = createHeapCollector(error => console.error('GUI heap diagnostics failed:', error));
    sample();
    timer = setInterval(sample, 60000);
}

export function subscribeHeapSamples(listener) {
    startHeapMonitor();
    listeners.add(listener);
    listener(latest);
    return () => listeners.delete(listener);
}

export function stopHeapMonitor() {
    clearInterval(timer);
    collector?.close();
    collector = null;
}

window.addEventListener('pagehide', stopHeapMonitor);
window.addEventListener('pageshow', startHeapMonitor);
