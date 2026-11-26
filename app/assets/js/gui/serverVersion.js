import { featureText } from '../misc/featureTranslations.js';

export const MINIMUM_SERVER_VERSION = '1.2.1';
let warned = false;

export function serverNeedsUpdate(version) {
    const match = typeof version === 'string'
        && /^v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(version.trim());
    // Servers before version reporting was added are legacy too.
    if(!match) return true;
    const parts = match.slice(1, 4).map(Number);
    if(!parts.every(Number.isSafeInteger)) return true;
    const minimum = MINIMUM_SERVER_VERSION.split('.').map(Number);
    for(let index = 0; index < parts.length; index++)
        if(parts[index] !== minimum[index]) return parts[index] < minimum[index];
    return Boolean(match[4]);
}

function translateWarning() {
    const dialog = document.getElementById('server-update-floaty');
    if(!dialog) return;
    dialog.dir = typeof FULL_TRANS_OBJ === 'undefined' ? 'auto' : FULL_TRANS_OBJ?.textDirection ?? 'auto';
    const strings = {
        message: 'Update your local A.C.A.S server to version {version} or newer, then restart it. Older versions may not work correctly with this app.',
        download: 'Get the update',
        close: 'Not now'
    };
    for(const [key, fallback] of Object.entries(strings))
        dialog.querySelector(`[data-server-update="${key}"]`).textContent =
            featureText('serverUpdate', key, fallback, { version: MINIMUM_SERVER_VERSION });
}

document.addEventListener('acas-translations-updated', translateWarning);

export function reportServerVersion(version) {
    const dialog = document.getElementById('server-update-floaty');
    if(!dialog) throw new Error('The server update warning dialog is missing.');
    if(!serverNeedsUpdate(version)) {
        if(dialog.open) dialog.close();
        return;
    }
    if(warned) return;
    warned = true;
    translateWarning();
    dialog.querySelector('[data-server-update="close"]').onclick = () => dialog.close();
    dialog.showModal();
}
