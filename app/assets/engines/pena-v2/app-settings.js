import { initializePenaPersonalization } from './personalization.js';
import { isMobileDevice } from './platform.js';

export function initializePenaSettings() {
    const panel = document.getElementById('pena-floaty');
    if(!panel) return;
    if(isMobileDevice()) {
        const setting = document.querySelector('[data-key="penaEnabled"]');
        setting.checked = false;
        setting.disabled = true;
        setting.closest('.custom-input').hidden = true;
        setting.closest('.custom-input').dataset.penaMobileHidden = 'true';
        return;
    }
    initializePenaPersonalization(panel);
}
