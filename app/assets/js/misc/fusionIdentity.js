import { createSeed, isValidSeed } from '../../engines/Fusion/identity.js';

const storageKey = 'acas.fusion.identitySeed.v1';
let sessionSeed;

// Called on the GUI thread: workers cannot access localStorage. Every board and
// profile on this app origin shares this identity unless Random Seed overrides it.
export function getFusionIdentitySeed() {
    if(sessionSeed !== undefined) return sessionSeed;

    try {
        const stored = Number(localStorage.getItem(storageKey));
        if(isValidSeed(stored)) {
            sessionSeed = stored;
            return sessionSeed;
        }

        sessionSeed = createSeed();
        localStorage.setItem(storageKey, String(sessionSeed));
    } catch(error) {
        sessionSeed ??= createSeed();
        console.warn('Fusion identity cannot be saved; keeping it for this tab session.', error);
    }

    return sessionSeed;
}