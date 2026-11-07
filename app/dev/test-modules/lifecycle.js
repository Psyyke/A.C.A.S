export function createLifecycle(signal) {
    let cancelled = Boolean(signal?.aborted);
    const waits = new Map();

    function cancel() {
        if (cancelled) return;
        cancelled = true;
        for (const [timer, resolve] of waits) {
            clearTimeout(timer);
            resolve(false);
        }
        waits.clear();
        signal?.removeEventListener('abort', cancel);
    }

    if (!cancelled) signal?.addEventListener('abort', cancel, { once: true });
    return {
        get cancelled() { return cancelled; },
        cancel,
        wait(ms) {
            if (cancelled) return Promise.resolve(false);
            return new Promise(resolve => {
                const timer = setTimeout(() => {
                    waits.delete(timer);
                    resolve(true);
                }, ms);
                waits.set(timer, resolve);
            });
        }
    };
}
