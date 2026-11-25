const gb = bytes => `${(Math.max(0, bytes || 0) / 1e9).toFixed(1)} GB`;

// Turns an app server status into chat setup feedback and an optional action.
export function setupView(status = {}) {
    if(!status.connected) return { state: 'unavailable', text: 'startLocalServer', action: 'reconnect', actionLabel: 'reconnect' };
    const setup = status.setup;
    if(!setup) return { state: 'unavailable', text: status.error || 'updateAppServer' };
    const error = setup.error || status.error || null;
    if(setup.busy && setup.phase !== 'starting') {
        const downloading = setup.phase === 'downloading';
        return { state: 'loading',
            text: downloading ? 'setupDownloading' : { checking: 'setupChecking', verifying: 'setupVerifying', unpacking: 'setupUnpacking' }[setup.phase] || 'setupChecking',
            values: { received: gb(setup.received), total: gb(setup.total), percent: Math.round((setup.progress || 0) * 100) },
            progress: downloading ? setup.progress || 0 : null, action: 'cancelSetup', actionLabel: 'pauseDownload' };
    }
    if(setup.busy || status.state === 'loading') return { state: 'loading', text: 'setupStarting' };
    if(status.state === 'ready') return { state: 'ready', text: 'serverConnected' };
    if(!setup.installed) return { state: 'unavailable', text: error || 'setupPena',
        values: { size: gb(setup.downloadBytes) }, error: Boolean(error), action: 'setup',
        actionLabel: error ? 'resumeDownload' : 'downloadPena' };
    return { state: 'unavailable', text: error || 'penaInstalled', error: Boolean(error),
        action: 'setup', actionLabel: error ? 'tryAgain' : 'startPena' };
}
